import asyncio
import logging

import chess
import chess.engine
import chess.pgn

from config import TC, parse_tc
from enums import GameStatus
from models import Engine, Game, utcnow


logger = logging.getLogger(__name__)


class GameStream:
    def __init__(self) -> None:
        self.board = chess.Board()
        self.subscribers: set[asyncio.Queue[dict]] = set()
        self._task: asyncio.Task | None = None
        self.white_name: str | None = None
        self.black_name: str | None = None
        self.san_moves: list[str] = []
        self.clocks: dict[chess.Color, float] = {chess.WHITE: 0.0, chess.BLACK: 0.0}
        self.result: str | None = None
        self.status: str = "idle"  # "idle" | GameStatus
        self.game_doc: Game | None = None

    def snapshot(self) -> dict:
        return {
            "type": "fen",
            "fen": self.board.fen(),
            "ply": self.board.ply(),
            "white_name": self.white_name,
            "black_name": self.black_name,
            "moves": list(self.san_moves),
            "white_clock": self.clocks[chess.WHITE],
            "black_clock": self.clocks[chess.BLACK],
            "result": self.result,
            "status": self.status,
            "game_id": str(self.game_doc.id) if self.game_doc else None,
        }

    def subscribe(self) -> asyncio.Queue[dict]:
        q: asyncio.Queue[dict] = asyncio.Queue(maxsize=256)
        q.put_nowait(self.snapshot())
        self.subscribers.add(q)
        logger.info("subscriber added, total=%d", len(self.subscribers))
        return q

    def unsubscribe(self, q: asyncio.Queue[dict]) -> None:
        self.subscribers.discard(q)
        logger.info("subscriber removed, total=%d", len(self.subscribers))

    def _broadcast(self, event: dict) -> None:
        for q in self.subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(
                    "subscriber queue full, dropping event type=%s", event.get("type")
                )

    def _build_pgn(self) -> str:
        game = chess.pgn.Game.from_board(self.board)
        game.headers["White"] = self.white_name or "?"
        game.headers["Black"] = self.black_name or "?"
        game.headers["Result"] = self.result or "*"
        return str(game)

    async def start_game(self, white: Engine, black: Engine) -> Game:
        if self._task and not self._task.done():
            logger.info("cancelling in-progress game before starting a new one")
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        logger.info(
            "starting game: white=%r black=%r tc=%s", white.name, black.name, TC
        )
        self.white_name = white.name
        self.black_name = black.name
        doc = Game(
            white_id=white.id,
            black_id=black.id,
            white_name=white.name,
            black_name=black.name,
        )
        await doc.insert()
        self.game_doc = doc
        self._task = asyncio.create_task(
            self._play_one_game(white.command, black.command)
        )
        return doc

    async def _play_one_game(self, white_cmd: str, black_cmd: str) -> None:
        self.board.reset()
        self.san_moves = []
        self.result = None
        self.status = GameStatus.PLAYING
        base, inc = parse_tc(TC)
        self.clocks = {chess.WHITE: base, chess.BLACK: base}
        doc = self.game_doc
        if doc is not None:
            doc.status = GameStatus.PLAYING
            doc.fen = self.board.fen()
            doc.white_clock = base
            doc.black_clock = base
            await doc.save()
        self._broadcast(
            {
                "type": "game_start",
                "white_name": self.white_name,
                "black_name": self.black_name,
                "game_id": str(doc.id) if doc else None,
            }
        )
        self._broadcast(self.snapshot())

        _, white = await chess.engine.popen_uci(white_cmd)
        _, black = await chess.engine.popen_uci(black_cmd)
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
                    logger.warning(
                        "illegal or null move from engine, ending game (move=%r)", move
                    )
                    break
                uci = move.uci()
                san = self.board.san(move)
                self.board.push(move)
                self.san_moves.append(san)
                if doc is not None:
                    doc.moves = list(self.san_moves)
                    doc.fen = self.board.fen()
                    doc.white_clock = self.clocks[chess.WHITE]
                    doc.black_clock = self.clocks[chess.BLACK]
                    await doc.save()
                self._broadcast(
                    {
                        "type": "move",
                        "uci": uci,
                        "san": san,
                        "from": uci[:2],
                        "to": uci[2:4],
                        "fen": self.board.fen(),
                        "ply": self.board.ply(),
                        "white_clock": self.clocks[chess.WHITE],
                        "black_clock": self.clocks[chess.BLACK],
                    }
                )
        finally:
            await white.quit()
            await black.quit()

        self.result = self.board.result(claim_draw=True)
        self.status = GameStatus.ENDED
        logger.info("game ended result=%s plies=%d", self.result, self.board.ply())
        if doc is not None:
            doc.status = GameStatus.ENDED
            doc.result = self.result
            doc.ended_at = utcnow()
            doc.pgn = self._build_pgn()
            doc.fen = self.board.fen()
            doc.moves = list(self.san_moves)
            doc.white_clock = self.clocks[chess.WHITE]
            doc.black_clock = self.clocks[chess.BLACK]
            await doc.save()
        self._broadcast({"type": "game_end", "result": self.result})


stream = GameStream()
