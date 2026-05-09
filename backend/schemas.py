from uuid import UUID

from pydantic import BaseModel


class StartGameRequest(BaseModel):
    white_engine_id: UUID
    black_engine_id: UUID
