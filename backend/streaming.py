import asyncio
import logging
from uuid import UUID

from machineplay import schemas
from enums import GameStatus
from exceptions import AppException, NotFoundError
from models import Game as GameDoc, utcnow

logger = logging.getLogger(__name__)


async def abort_game(game_id: UUID) -> None:
    """Mark a playing game as aborted in DB and notify subscribers."""
    doc = await GameDoc.get(game_id)
    if doc is not None and doc.status == GameStatus.PLAYING:
        doc.status = GameStatus.ABORTED
        doc.result = "*"
        doc.ended_at = utcnow()
        await doc.save()
        logger.info("aborted game=%s", game_id)

    game = game_registry.registry.pop(game_id, None)
    if game is not None:
        await game.broadcast(schemas.GameEndEvent(result="*", pgn=None))


async def abort_orphan_games() -> None:
    """Mark any DB games still in PLAYING as aborted (e.g. after backend restart)."""
    orphans = await GameDoc.find(GameDoc.status == GameStatus.PLAYING).to_list()
    for doc in orphans:
        doc.status = GameStatus.ABORTED
        doc.result = "*"
        doc.ended_at = utcnow()
        await doc.save()
    if orphans:
        logger.info("aborted %d orphan game(s) on startup", len(orphans))


async def persist_event(game_id: UUID, event: schemas.SSEEvent) -> None:
    doc = await GameDoc.get(game_id)
    if doc is None:
        logger.warning("event for unknown game_id=%s", game_id)
        return

    match event:
        case schemas.GameStartEvent():
            doc.status = GameStatus.PLAYING
            await doc.save()
        case schemas.FenEvent(fen=fen, moves=moves, white_clock=wc, black_clock=bc):
            doc.fen = fen
            doc.moves = list(moves)
            doc.white_clock = wc
            doc.black_clock = bc
            await doc.save()
        case schemas.MoveEvent(san=san, fen=fen, white_clock=wc, black_clock=bc):
            doc.moves = [*doc.moves, san]
            doc.fen = fen
            doc.white_clock = wc
            doc.black_clock = bc
            await doc.save()
        case schemas.GameEndEvent(result=result, pgn=pgn):
            doc.status = GameStatus.ENDED
            doc.result = result
            doc.ended_at = utcnow()
            if pgn is not None:
                doc.pgn = pgn
            await doc.save()


class Game:
    def __init__(self, game_id: UUID):
        self.game_id = game_id
        self.subscribers: set[asyncio.Queue[schemas.SSEEvent]] = set()

    def subscribe(self) -> asyncio.Queue[schemas.SSEEvent]:
        q: asyncio.Queue[schemas.SSEEvent] = asyncio.Queue(maxsize=256)
        self.subscribers.add(q)
        logger.info(
            "game=%s subscriber added, total=%d", self.game_id, len(self.subscribers)
        )
        return q

    def unsubscribe(self, q: asyncio.Queue[schemas.SSEEvent]) -> None:
        self.subscribers.discard(q)
        logger.info(
            "game=%s subscriber removed, total=%d", self.game_id, len(self.subscribers)
        )

    async def broadcast(self, event: schemas.SSEEvent) -> None:
        for q in self.subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(
                    "subscriber queue full, dropping event type=%s", event.type
                )


class GameRegistry:
    def __init__(self) -> None:
        self.registry: dict[UUID, Game] = {}

    def register_game(self, game_id: UUID) -> Game:
        new_game = Game(game_id)
        self.registry[game_id] = new_game
        return new_game

    def get_game(self, game_id: UUID) -> Game:
        try:
            return self.registry[game_id]
        except KeyError:
            raise NotFoundError(
                "game with this id not found", details={"game_id": str(game_id)}
            )


class Runner:
    def __init__(self, runner_id: UUID, name: str):
        self.runner_id = runner_id
        self.name = name
        self.scheduled_commands: asyncio.Queue[schemas.ServerCommand] = asyncio.Queue()
        self._game_ids: set[UUID] = set()

    def track_game(self, game_id: UUID) -> None:
        self._game_ids.add(game_id)

    def untrack_game(self, game_id: UUID) -> None:
        self._game_ids.discard(game_id)

    async def abort_games(self) -> None:
        for game_id in list(self._game_ids):
            await abort_game(game_id)
        self._game_ids.clear()


class NoRunnerAvailable(AppException):
    status_code = 503
    code = "no_runner"
    message = "no runner is connected"


class Runners:
    def __init__(self) -> None:
        self.data: dict[UUID, Runner] = {}

    def register_runner(self, runner_id: UUID, name: str) -> Runner:
        new_runner = Runner(runner_id, name)
        self.data[runner_id] = new_runner
        return new_runner

    def unregister_runner(self, runner_id: UUID) -> None:
        self.data.pop(runner_id, None)

    def get_runner(self, runner_id: UUID) -> Runner:
        try:
            return self.data[runner_id]
        except KeyError:
            raise NotFoundError(
                "no runner with this id is running",
                details={"runner_id": str(runner_id)},
            )

    def list_runners(self) -> list[Runner]:
        return list(self.data.values())


game_registry = GameRegistry()
runners = Runners()
