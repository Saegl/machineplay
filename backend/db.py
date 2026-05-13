from typing import Any

from beanie import init_beanie
from pymongo import AsyncMongoClient

from config import MONGO_DB, MONGO_URL
from models import Engine, Game


# `dict[str, Any]` is pymongo's _DocumentType — shape of raw BSON results.
# Irrelevant here since all reads/writes go through beanie's ODM.
async def connect() -> AsyncMongoClient[dict[str, Any]]:
    client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(MONGO_URL)
    await init_beanie(database=client[MONGO_DB], document_models=[Engine, Game])
    return client
