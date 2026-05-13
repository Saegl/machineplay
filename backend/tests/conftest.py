from collections.abc import AsyncIterator, Iterator
from typing import Any

import pytest
from beanie import init_beanie
from pymongo import AsyncMongoClient
from testcontainers.mongodb import MongoDbContainer

from models import Engine, Game


@pytest.fixture(scope="session")
def mongo_container() -> Iterator[MongoDbContainer]:
    with MongoDbContainer("mongo:7") as container:
        yield container


@pytest.fixture(scope="session")
async def mongo_client(
    mongo_container: MongoDbContainer,
) -> AsyncIterator[AsyncMongoClient[dict[str, Any]]]:
    url = mongo_container.get_connection_url()
    client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(url)
    await init_beanie(
        database=client["machineplay_test"], document_models=[Engine, Game]
    )
    try:
        yield client
    finally:
        await client.drop_database("machineplay_test")
        await client.close()


@pytest.fixture(autouse=True)
async def clean_db(mongo_client: AsyncMongoClient[dict[str, Any]]) -> None:
    db = mongo_client["machineplay_test"]
    for name in await db.list_collection_names():
        await db[name].delete_many({})
