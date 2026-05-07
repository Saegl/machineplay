from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def main():
    return "Hello from machineplay!"


@app.get("/new")
def new():
    return "New api is here"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app")
