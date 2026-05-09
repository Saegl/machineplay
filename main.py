import asyncio
import logging
import os
import re
from contextlib import asynccontextmanager

import chess
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

log = logging.getLogger("machineplay")

BESTMOVE_RE = re.compile(r"\bbestmove\s+(\S+)")

CUTECHESS_TC = os.environ.get("MACHINEPLAY_TC", "30+0.3")


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

        proc = await asyncio.create_subprocess_exec(
            "cutechess-cli",
            "-engine",
            "name=stockfish1",
            "cmd=stockfish",
            "proto=uci",
            "-engine",
            "name=stockfish2",
            "cmd=stockfish",
            "proto=uci",
            "-each",
            f"tc={CUTECHESS_TC}",
            "-games",
            "1",
            "-rounds",
            "1",
            "-debug",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None

        async for raw in proc.stdout:
            line = raw.decode("utf-8", errors="replace").rstrip()
            m = BESTMOVE_RE.search(line)
            if not m:
                continue
            uci = m.group(1)
            if uci == "(none)":
                continue
            try:
                move = chess.Move.from_uci(uci)
            except ValueError:
                continue
            if move not in self.board.legal_moves:
                continue
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

        await proc.wait()
        self._broadcast({"type": "game_end", "result": self.board.result()})


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


@app.get("/")
def main():
    return "Hello from machineplay!"


@app.get("/new")
def new():
    return "New api is here"


@app.websocket("/ws/stream")
async def ws_stream(ws: WebSocket):
    await ws.accept()
    q = stream.subscribe()
    try:
        while True:
            event = await q.get()
            await ws.send_json(event)
    except WebSocketDisconnect:
        pass
    finally:
        stream.unsubscribe(q)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app")
