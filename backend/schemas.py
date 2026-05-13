from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from enums import GameStatus


class StartGameRequest(BaseModel):
    white_engine_id: UUID
    black_engine_id: UUID


class StartGameResponse(BaseModel):
    id: UUID
    status: str
    white: UUID
    black: UUID


class EngineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    command: str
    description: str


class GameOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    white_id: UUID
    black_id: UUID
    white_name: str
    black_name: str
    status: GameStatus
    result: str | None
    moves: list[str]
    fen: str
    pgn: str | None
    white_clock: float
    black_clock: float
    created_at: datetime
    ended_at: datetime | None
