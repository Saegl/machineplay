import asyncio
import logging
from typing import AsyncIterable

from fastapi import APIRouter, HTTPException
from fastapi.sse import EventSourceResponse

from game import stream
from models import Engine
from schemas import StartGameRequest


logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/engine", response_model_by_alias=False)
async def list_engines() -> list[Engine]:
    return await Engine.find_all().to_list()


@router.post("/game")
async def start_game(payload: StartGameRequest) -> dict:
    white = await Engine.get(payload.white_engine_id)
    black = await Engine.get(payload.black_engine_id)
    if white is None or black is None:
        raise HTTPException(status_code=404, detail="engine not found")
    await stream.start_game(white.command, black.command, white.name, black.name)
    return {"status": "started", "white": str(white.id), "black": str(black.id)}


@router.get("/sse/stream", response_class=EventSourceResponse)
async def sse_stream() -> AsyncIterable[dict]:
    q = stream.subscribe()
    try:
        while True:
            event = await q.get()
            yield event
    except asyncio.QueueShutDown:
        logger.info("stream ended, queue shutdown")
    except asyncio.CancelledError:
        logger.info("SSE cancelled")
        raise
    finally:
        stream.unsubscribe(q)
