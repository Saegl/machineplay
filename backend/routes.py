import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from game import stream
from models import Engine
from schemas import StartGameRequest


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
    await stream.start_game(white.command, black.command)
    return {"status": "started", "white": str(white.id), "black": str(black.id)}


@router.get("/sse/stream")
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
