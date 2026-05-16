from enum import StrEnum


class GameStatus(StrEnum):
    PLAYING = "playing"
    ENDED = "ended"
    ABORTED = "aborted"
