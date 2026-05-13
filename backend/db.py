from beanie import init_beanie
from pymongo import AsyncMongoClient

from config import MONGO_DB, MONGO_URL
from models import Engine, Game


async def connect() -> AsyncMongoClient:
    client = AsyncMongoClient(MONGO_URL)
    await init_beanie(database=client[MONGO_DB], document_models=[Engine, Game])
    return client
