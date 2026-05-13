import asyncio
import logging
from typing import AsyncIterable
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.sse import EventSourceResponse

from game import stream
from models import Engine, Game
from schemas import EngineOut, StartGameRequest


logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/engine")
async def list_engines() -> list[EngineOut]:
    return await Engine.find_all().to_list()


@router.post("/game", response_model_by_alias=False)
async def start_game(payload: StartGameRequest) -> dict:
    white = await Engine.get(payload.white_engine_id)
    black = await Engine.get(payload.black_engine_id)
    if white is None or black is None:
        raise HTTPException(status_code=404, detail="engine not found")
    doc = await stream.start_game(white, black)
    return {
        "id": str(doc.id),
        "status": "started",
        "white": str(white.id),
        "black": str(black.id),
    }


@router.get("/game", response_model_by_alias=False)
async def list_games(limit: int = 50) -> list[Game]:
    limit = max(1, min(limit, 200))
    return await Game.find_all().sort(-Game.created_at).limit(limit).to_list()


@router.get("/game/{game_id}", response_model_by_alias=False)
async def get_game(game_id: UUID) -> Game:
    doc = await Game.get(game_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="game not found")
    return doc


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
