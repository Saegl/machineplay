from typing import Annotated, Literal
from pydantic import BaseModel, Field, TypeAdapter


class StartGame(BaseModel):
    cmd: Literal["start_game"] = "start_game"


class StopGame(BaseModel):
    cmd: Literal["stop_game"] = "stop_game"


class Terminate(BaseModel):
    cmd: Literal["exit"] = "exit"


type CommandType = StartGame | StopGame | Terminate
Command = Annotated[CommandType, Field(discriminator="cmd")]
cmd_adapter = TypeAdapter(Command)
