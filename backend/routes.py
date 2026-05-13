import asyncio
import logging
from typing import Any, AsyncIterable
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.sse import EventSourceResponse

from game import stream
from models import Engine, Game
from schemas import EngineOut, GameOut, StartGameRequest, StartGameResponse


logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/engine", response_model=list[EngineOut])
async def list_engines() -> list[Engine]:
    return await Engine.find_all().to_list()


@router.post("/game")
async def start_game(payload: StartGameRequest) -> StartGameResponse:
    white = await Engine.get(payload.white_engine_id)
    black = await Engine.get(payload.black_engine_id)
    if white is None or black is None:
        raise HTTPException(status_code=404, detail="engine not found")
    doc = await stream.start_game(white, black)
    return StartGameResponse(
        id=doc.id,
        status="started",
        white=white.id,
        black=black.id,
    )


@router.get("/game", response_model=list[GameOut])
async def list_games(limit: int = 50) -> list[Game]:
    limit = max(1, min(limit, 200))
    return await Game.find_all().sort("-created_at").limit(limit).to_list()


@router.get("/game/{game_id}", response_model=GameOut)
async def get_game(game_id: UUID) -> Game:
    doc = await Game.get(game_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="game not found")
    return doc


@router.get("/sse/stream", response_class=EventSourceResponse)
async def sse_stream() -> AsyncIterable[dict[str, Any]]:
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
