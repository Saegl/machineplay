from uuid import UUID

from pydantic import BaseModel, ConfigDict


class StartGameRequest(BaseModel):
    white_engine_id: UUID
    black_engine_id: UUID


class EngineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    command: str
    description: str
