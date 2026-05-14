import asyncio
from websockets.asyncio.client import connect
from machineplay import schemas


async def connect_backend_ws():
    async with connect("ws://localhost:8000/ws") as ws:
        await ws.send("Hi there")

        while True:
            text = await ws.recv()
            cmd: schemas.CommandType = schemas.cmd_adapter.validate_json(text)

            match cmd:
                case schemas.StartGame():
                    print("start_game")
                case schemas.StopGame():
                    print("stop_game")
                case schemas.Terminate():
                    print("exit")
                    break


def main():
    print("Welcome")
    asyncio.run(connect_backend_ws())


if __name__ == "__main__":
    main()
