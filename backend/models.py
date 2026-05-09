from uuid import UUID, uuid4

from beanie import Document
from pydantic import Field


class Engine(Document):
    id: UUID = Field(default_factory=uuid4)
    name: str
    command: str
    description: str = ""
