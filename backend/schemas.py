from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from enums import GameStatus, StreamStatus


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


class FenEvent(BaseModel):
    type: Literal["fen"] = "fen"
    fen: str
    ply: int
    white_name: str | None
    black_name: str | None
    moves: list[str]
    white_clock: float
    black_clock: float
    result: str | None
    status: StreamStatus
    game_id: str | None


class GameStartEvent(BaseModel):
    type: Literal["game_start"] = "game_start"
    white_name: str | None
    black_name: str | None
    game_id: str | None


class MoveEvent(BaseModel):
    type: Literal["move"] = "move"
    uci: str
    san: str
    from_square: str
    to_square: str
    fen: str
    ply: int
    white_clock: float
    black_clock: float


class GameEndEvent(BaseModel):
    type: Literal["game_end"] = "game_end"
    result: str | None


SSEEvent = Annotated[
    FenEvent | GameStartEvent | MoveEvent | GameEndEvent,
    Field(discriminator="type"),
]
