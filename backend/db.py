from datetime import timezone
from typing import Any

from beanie import init_beanie
from pymongo import AsyncMongoClient

from config import settings
from models import Engine, Game


# `dict[str, Any]` is pymongo's _DocumentType — shape of raw BSON results.
# Irrelevant here since all reads/writes go through beanie's ODM.
async def connect() -> AsyncMongoClient[dict[str, Any]]:
    client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(
        settings.mongo_url, tz_aware=True, tzinfo=timezone.utc
    )
    await init_beanie(
        database=client[settings.mongo_db], document_models=[Engine, Game]
    )
    return client
