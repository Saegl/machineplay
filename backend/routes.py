import asyncio
import logging
from collections.abc import AsyncIterable
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.sse import EventSourceResponse

from config import TC
from exceptions import NotFoundError
from machineplay import schemas
from models import Engine, Game
from schemas import (
    EngineOut,
    GameOut,
    RunnerOut,
    StartGameRequest,
    StartGameResponse,
)
import streaming

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/engine", response_model=list[EngineOut])
async def list_engines() -> list[Engine]:
    return await Engine.find_all().to_list()


@router.get("/runners", response_model=list[RunnerOut])
async def list_runners() -> list[streaming.Runner]:
    return streaming.runners.list_runners()


@router.post("/game")
async def start_game(payload: StartGameRequest) -> StartGameResponse:
    white = await Engine.get(payload.white_engine_id)
    black = await Engine.get(payload.black_engine_id)
    if white is None or black is None:
        raise NotFoundError("engine not found")

    runner = streaming.runners.get_runner(payload.runner_id)

    doc = Game(
        white_id=white.id,
        black_id=black.id,
        white_name=white.name,
        black_name=black.name,
    )
    await doc.insert()

    streaming.game_registry.register_game(doc.id)

    await runner.scheduled_commands.put(
        schemas.StartGame(
            game_id=doc.id,
            white=schemas.EngineConfig(name=white.name, command=white.command),
            black=schemas.EngineConfig(name=black.name, command=black.command),
            tc=TC,
        )
    )
    logger.info("scheduled game=%s on runner=%s", doc.id, runner.runner_id)

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
        raise NotFoundError("game not found")
    return doc


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()

    intro = schemas.Introduction.model_validate_json(await ws.receive_text())
    runner = streaming.runners.register_runner(intro.runner_id, intro.name)
    logger.info("runner connected id=%s name=%s", intro.runner_id, intro.name)

    async def receiver() -> None:
        while True:
            data = await ws.receive_text()
            cmd: schemas.ClientCommandType = schemas.client_adapter.validate_json(data)
            match cmd:
                case schemas.GameEvent(game_id=game_id, event=event):
                    try:
                        game = streaming.game_registry.get_game(game_id)
                    except NotFoundError:
                        logger.warning("event for unregistered game_id=%s", game_id)
                        continue
                    await game.broadcast(event)
                    await streaming.persist_event(game_id, event)

    async def sender() -> None:
        while True:
            command = await runner.scheduled_commands.get()
            await ws.send_text(command.model_dump_json())

    recv_task = asyncio.create_task(receiver())
    send_task = asyncio.create_task(sender())

    try:
        done, _ = await asyncio.wait(
            {recv_task, send_task},
            return_when=asyncio.FIRST_EXCEPTION,
        )
        for task in done:
            task.result()  # re-raise exceptions
    except WebSocketDisconnect:
        logger.info("runner disconnected id=%s", intro.runner_id)
    finally:
        recv_task.cancel()
        send_task.cancel()
        streaming.runners.unregister_runner(intro.runner_id)


@router.get("/stream/game/{game_id}", response_class=EventSourceResponse)
async def sse_stream(game_id: UUID) -> AsyncIterable[schemas.SSEEvent]:
    game = streaming.game_registry.get_game(game_id)
    q = game.subscribe()
    try:
        while True:
            event = await q.get()
            yield event
    except asyncio.CancelledError:
        logger.info("SSE cancelled game=%s", game_id)
        raise
    finally:
        game.unsubscribe(q)
