import asyncio
import logging

import chess
import chess.engine

from config import TC, parse_tc


logger = logging.getLogger(__name__)


class GameStream:
    def __init__(self) -> None:
        self.board = chess.Board()
        self.subscribers: set[asyncio.Queue[dict]] = set()
        self._task: asyncio.Task | None = None
        self.white_name: str | None = None
        self.black_name: str | None = None
        self.san_moves: list[str] = []

    def snapshot(self) -> dict:
        return {
            "type": "fen",
            "fen": self.board.fen(),
            "ply": self.board.ply(),
            "white_name": self.white_name,
            "black_name": self.black_name,
            "moves": list(self.san_moves),
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

    async def start_game(
        self, white_cmd: str, black_cmd: str, white_name: str, black_name: str
    ) -> None:
        if self._task and not self._task.done():
            logger.info("cancelling in-progress game before starting a new one")
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        logger.info(
            "starting game: white=%r black=%r tc=%s", white_name, black_name, TC
        )
        self.white_name = white_name
        self.black_name = black_name
        self._task = asyncio.create_task(self._play_one_game(white_cmd, black_cmd))

    async def _play_one_game(self, white_cmd: str, black_cmd: str) -> None:
        self.board.reset()
        self.san_moves = []
        self._broadcast(
            {
                "type": "game_start",
                "white_name": self.white_name,
                "black_name": self.black_name,
            }
        )
        self._broadcast(self.snapshot())

        base, inc = parse_tc(TC)
        clocks = {chess.WHITE: base, chess.BLACK: base}

        _, white = await chess.engine.popen_uci(white_cmd)
        _, black = await chess.engine.popen_uci(black_cmd)
        engines = {chess.WHITE: white, chess.BLACK: black}

        try:
            while not self.board.is_game_over(claim_draw=True):
                side = self.board.turn
                limit = chess.engine.Limit(
                    white_clock=clocks[chess.WHITE],
                    black_clock=clocks[chess.BLACK],
                    white_inc=inc,
                    black_inc=inc,
                )
                loop = asyncio.get_running_loop()
                t0 = loop.time()
                result = await engines[side].play(self.board, limit)
                elapsed = loop.time() - t0
                clocks[side] = max(0.0, clocks[side] - elapsed + inc)

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
                self._broadcast(
                    {
                        "type": "move",
                        "uci": uci,
                        "san": san,
                        "from": uci[:2],
                        "to": uci[2:4],
                        "fen": self.board.fen(),
                        "ply": self.board.ply(),
                    }
                )
        finally:
            await white.quit()
            await black.quit()

        result_str = self.board.result(claim_draw=True)
        logger.info("game ended result=%s plies=%d", result_str, self.board.ply())
        self._broadcast({"type": "game_end", "result": result_str})


stream = GameStream()
