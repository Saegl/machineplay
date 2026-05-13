import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from beanie import init_beanie
from pymongo import AsyncMongoClient

from config import MONGO_DB, MONGO_URL
from models import Engine


async def main() -> None:
    # `dict[str, Any]` is pymongo's _DocumentType — shape of raw BSON results.
    # Irrelevant here since all reads/writes go through beanie's ODM.
    client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(MONGO_URL)
    try:
        await init_beanie(database=client[MONGO_DB], document_models=[Engine])
        existing = await Engine.find_one(Engine.name == "stockfish")
        if existing is not None:
            print(f"already seeded: {existing.id}")
            return
        engine = Engine(
            name="stockfish",
            command="stockfish",
            description="Stockfish UCI engine, system binary",
        )
        await engine.insert()
        print(f"inserted stockfish engine: {engine.id}")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
