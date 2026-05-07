from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def main():
    return "Hello from machineplay!"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app")
