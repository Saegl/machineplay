from enum import StrEnum


class GameStatus(StrEnum):
    PLAYING = "playing"
    ENDED = "ended"


class StreamStatus(StrEnum):
    IDLE = "idle"
    PLAYING = "playing"
    ENDED = "ended"
