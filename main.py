import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

import chess
import chess.engine
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

log = logging.getLogger("machineplay")

TC = os.environ.get("MACHINEPLAY_TC", "30+0.3")


def parse_tc(spec: str) -> tuple[float, float]:
    base, _, inc = spec.partition("+")
    return float(base), float(inc) if inc else 0.0


class GameStream:
    def __init__(self) -> None:
        self.board = chess.Board()
        self.subscribers: set[asyncio.Queue[dict]] = set()
        self._task: asyncio.Task | None = None

    def snapshot(self) -> dict:
        return {
            "type": "fen",
            "fen": self.board.fen(),
            "ply": self.board.ply(),
        }

    def subscribe(self) -> asyncio.Queue[dict]:
        q: asyncio.Queue[dict] = asyncio.Queue(maxsize=256)
        q.put_nowait(self.snapshot())
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[dict]) -> None:
        self.subscribers.discard(q)

    def _broadcast(self, event: dict) -> None:
        for q in self.subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def run_forever(self) -> None:
        while True:
            try:
                await self._play_one_game()
            except Exception:
                log.exception("game loop error; restarting in 2s")
                await asyncio.sleep(2)

    async def _play_one_game(self) -> None:
        self.board.reset()
        self._broadcast({"type": "game_start"})
        self._broadcast(self.snapshot())

        base, inc = parse_tc(TC)
        clocks = {chess.WHITE: base, chess.BLACK: base}

        _, white = await chess.engine.popen_uci("stockfish")
        _, black = await chess.engine.popen_uci("stockfish")
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
                    break
                uci = move.uci()
                self.board.push(move)
                self._broadcast(
                    {
                        "type": "move",
                        "uci": uci,
                        "from": uci[:2],
                        "to": uci[2:4],
                        "fen": self.board.fen(),
                        "ply": self.board.ply(),
                    }
                )
        finally:
            await white.quit()
            await black.quit()

        self._broadcast(
            {"type": "game_end", "result": self.board.result(claim_draw=True)}
        )


stream = GameStream()


@asynccontextmanager
async def lifespan(app: FastAPI):
    stream._task = asyncio.create_task(stream.run_forever())
    try:
        yield
    finally:
        if stream._task:
            stream._task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://machineplay.saegl.me",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/sse/stream")
async def sse_stream(request: Request):
    async def event_source():
        q = stream.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            stream.unsubscribe(q)

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", reload=True)
