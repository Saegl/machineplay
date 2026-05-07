from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

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


@app.get("/")
def main():
    return "Hello from machineplay!"


@app.get("/new")
def new():
    return "New api is here"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app")
