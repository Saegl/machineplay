import signal
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db
from game import stream
from routes import router


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def on_shutdown_request(name: str):
    logger.info("shutdown requested, received %s", name)

    for q in stream.subscribers:
        q.shutdown()


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()

    # This is the only way I found to react to uvicorn shutdown/reload events when SSE is active
    # otherwise uvicorn waits indefinitely or timeouts with `--timeout-graceful-shutdown 5`
    loop.add_signal_handler(signal.SIGINT, on_shutdown_request, signal.SIGINT.name)

    client = await db.connect()

    try:
        yield
    finally:
        if stream._task and not stream._task.done():
            stream._task.cancel()
        await client.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://machineplay.org",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
