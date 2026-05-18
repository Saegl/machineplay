import asyncio
import os
import socket
import ssl
from uuid import UUID, uuid4

import certifi
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosedError
from machineplay import schemas

import chess
import chess.engine
import chess.pgn

RUNNER_ID = uuid4()
BACKEND_URL = os.environ.get("BACKEND_URL", "wss://api.machineplay.org/ws")
MAX_GAMES = int(os.environ.get("MAX_GAMES") or (os.cpu_count() or 1))


def parse_tc(spec: str) -> tuple[float, float]:
    base, _, inc = spec.partition("+")
    return float(base), float(inc) if inc else 0.0


class Game:
    def __init__(
        self,
        game_id: UUID,
        white: schemas.EngineConfig,
        black: schemas.EngineConfig,
        tc: str,
        queue: asyncio.Queue,
    ):
        self.game_id = game_id
        self.white = white
        self.black = black
        self.tc = tc
        self.queue: asyncio.Queue[schemas.ClientCommand] = queue
        self.san_moves: list[str] = []
        self.clocks: dict[chess.Color, float] = {chess.WHITE: 0.0, chess.BLACK: 0.0}
        self.result: str | None = None
        self.status: schemas.GameStatus = schemas.GameStatus.PLAYING
        self.board = chess.Board()
        self.task = asyncio.create_task(self.play_game())

    def snapshot(self) -> schemas.FenEvent:
        return schemas.FenEvent(
            fen=self.board.fen(),
            ply=self.board.ply(),
            white_name=self.white.name,
            black_name=self.black.name,
            moves=list(self.san_moves),
            white_clock=self.clocks[chess.WHITE],
            black_clock=self.clocks[chess.BLACK],
            result=self.result,
            status=self.status,
            game_id=self.game_id,
        )

    def build_pgn(self) -> str:
        game = chess.pgn.Game.from_board(self.board)
        game.headers["White"] = self.white.name
        game.headers["Black"] = self.black.name
        game.headers["Result"] = self.result or "*"
        return str(game)

    async def send_server(self, event: schemas.SSEEvent):
        await self.queue.put(schemas.GameEvent(game_id=self.game_id, event=event))

    async def play_game(self):
        base, inc = parse_tc(self.tc)
        self.clocks = {chess.WHITE: base, chess.BLACK: base}

        await self.send_server(
            schemas.GameStartEvent(
                white_name=self.white.name,
                black_name=self.black.name,
                game_id=self.game_id,
            )
        )
        await self.send_server(self.snapshot())

        _, white = await chess.engine.popen_uci(self.white.command)
        _, black = await chess.engine.popen_uci(self.black.command)
        engines = {chess.WHITE: white, chess.BLACK: black}

        try:
            while not self.board.is_game_over(claim_draw=True):
                side = self.board.turn
                limit = chess.engine.Limit(
                    white_clock=self.clocks[chess.WHITE],
                    black_clock=self.clocks[chess.BLACK],
                    white_inc=inc,
                    black_inc=inc,
                )
                loop = asyncio.get_running_loop()
                t0 = loop.time()
                result = await engines[side].play(self.board, limit)
                elapsed = loop.time() - t0
                self.clocks[side] = max(0.0, self.clocks[side] - elapsed + inc)

                move = result.move
                if move is None or move not in self.board.legal_moves:
                    print(
                        "illegal or null move from engine, ending game (move=%r)", move
                    )
                    break
                uci = move.uci()
                san = self.board.san(move)
                self.board.push(move)
                self.san_moves.append(san)

                await self.send_server(
                    schemas.MoveEvent(
                        uci=uci,
                        san=san,
                        from_square=uci[:2],
                        to_square=uci[2:4],
                        fen=self.board.fen(),
                        ply=self.board.ply(),
                        white_clock=self.clocks[chess.WHITE],
                        black_clock=self.clocks[chess.BLACK],
                    )
                )
        finally:
            await white.quit()
            await black.quit()

        self.result = self.board.result(claim_draw=True)
        self.status = schemas.GameStatus.ENDED
        print(f"game ended result={self.result} plies={self.board.ply()}")
        await self.send_server(
            schemas.GameEndEvent(result=self.result, pgn=self.build_pgn())
        )


async def connect_backend_ws():
    print(f"connecting to {BACKEND_URL}")
    ssl_ctx = (
        ssl.create_default_context(cafile=certifi.where())
        if BACKEND_URL.startswith("wss://")
        else None
    )
    async with connect(BACKEND_URL, ssl=ssl_ctx) as ws:
        intro = schemas.Introduction(
            runner_id=RUNNER_ID, name=socket.gethostname(), max_games=MAX_GAMES
        )
        await ws.send(intro.model_dump_json())

        scheduled_commands: asyncio.Queue[schemas.ClientCommand] = asyncio.Queue()
        games: dict[UUID, Game] = {}

        async def receiver():
            while True:
                text = await ws.recv()
                cmd: schemas.ServerCommandType = schemas.server_adapter.validate_json(
                    text
                )

                match cmd:
                    case schemas.StartGame(
                        game_id=game_id, white=white, black=black, tc=tc
                    ):
                        if len(games) >= MAX_GAMES:
                            print(
                                f"refusing start_game {game_id}: at capacity "
                                f"({len(games)}/{MAX_GAMES})"
                            )
                            await scheduled_commands.put(
                                schemas.GameEvent(
                                    game_id=game_id,
                                    event=schemas.GameEndEvent(result="*", pgn=None),
                                )
                            )
                            continue
                        print(f"start_game {game_id} {white.name} vs {black.name}")
                        game = Game(game_id, white, black, tc, scheduled_commands)
                        games[game_id] = game
                        game.task.add_done_callback(
                            lambda _t, gid=game_id: games.pop(gid, None)
                        )
                    case schemas.StopGame():
                        print("stop_game")
                    case schemas.Terminate():
                        print("exit")
                        break

        async def sender():
            while True:
                cmd = await scheduled_commands.get()
                await ws.send(cmd.model_dump_json())

        recv_task = asyncio.create_task(receiver())
        send_task = asyncio.create_task(sender())

        try:
            done, _ = await asyncio.wait(
                {recv_task, send_task},
                return_when=asyncio.FIRST_EXCEPTION,
            )
            for task in done:
                task.result()  # re-raise exceptions
        except ConnectionClosedError:
            print("bye")
        finally:
            recv_task.cancel()
            send_task.cancel()


def main():
    print("Welcome")
    asyncio.run(connect_backend_ws())


if __name__ == "__main__":
    main()
