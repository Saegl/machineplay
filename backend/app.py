from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db
from game import stream
from routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = await db.connect()
    try:
        yield
    finally:
        if stream._task and not stream._task.done():
            stream._task.cancel()
        await client.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://machineplay.saegl.me",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
