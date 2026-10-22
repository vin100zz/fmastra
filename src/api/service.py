"""Serialize commands outside request threads, publishing coherent day boundaries."""
from __future__ import annotations

import secrets
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass, asdict
from pathlib import Path
from threading import Condition, Event, RLock
from typing import Iterator
from uuid import uuid4

from core.domain.world import World
from core.engine.live import LiveMatch
from core.world.live import build_live_match, finish_live_match, start_live_match
from core.world.human import pending_lineup_match
from core.world.news import draw_notices
from core.world.simulation import advance_day, target_date
from core.world.steps import day_results, step_over, step_target
from core.world.validation import validate_world
from infrastructure.config.loader import configure_world, load_config, load_pyramids
from infrastructure.importation.loader import import_world
from infrastructure.persistence.store import SaveStore, original_slot
from .creation import Catalogue


class CommandError(ValueError):
    pass


@dataclass(slots=True)
class Job:
    id: str
    command: str
    status: str = "queued"
    progress: float = 0
    date: str | None = None
    error: str | None = None
    # The competition whose round the screen flow shows once the job ends: its next round when
    # the human club's match awaits a lineup, otherwise the round just played.
    competition: dict | None = None


def take_charge(world: World, club_id: int) -> None:
    """Gives the user an active club. The draws were made before it had a manager: he is told the cup matches that await it."""
    club = world.clubs.get(club_id)
    if club is None or club.competition_id is None:
        raise ValueError("Club invalide ou non actif.")
    world.controlled_club_id = club.id
    draw_notices(world)


def new_world(root: Path, seed: int | None, levels: dict[str, int] | None, club_id: int | None) -> World:
    """A game whose nations play their divisions down to `levels` (the configuration's by default), from `seed` or a drawn
    one, its club already chosen when `club_id` is given."""
    cfg = load_config(root / "config")
    if levels is not None: cfg = configure_world(cfg, load_pyramids(root / "config", cfg), levels)
    world = import_world(root / "data", cfg, secrets.randbelow(2**53) if seed is None else seed)
    if club_id is not None: take_charge(world, club_id)
    return world


def round_competition(world: World, results: tuple[str, int] | None) -> dict | None:
    """A competition as the pages showing its rounds address it."""
    if results is None:
        return None
    kind, key = results
    if kind == "international":
        from .international import EDITION_CODES
        return {"kind": "international", "year": key, "code": EDITION_CODES[world.international.editions[key].kind]}
    competition = world.competitions[key]
    return {"kind": competition.kind, "id": competition.id, "code": competition.code}


class GameService:
    def __init__(self, root: Path, saves: Path | None = None) -> None:
        self.root = root
        self.store = SaveStore(saves or root / "saves", rolling=True)
        # The nations, divisions and clubs a new game can be made of.
        self.catalogue = Catalogue(root)
        self.world: World | None = None
        # Where the game is saved, automatically too: the slot it was last saved in or loaded from (a dated copy
        # resumes its own slot), `autosave` for a new game.
        self.slot = "autosave"
        self.lock = RLock()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="simulation")
        self.save_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="autosave")
        self.jobs: dict[str, Job] = {}
        self.commands: dict[str, tuple[str, dict, str]] = {}
        self.active: str | None = None
        # The autosave an advance leaves writing once reported done: it reads the world, so whatever
        # writes to the world next waits on `saved` instead of being refused.
        self.pending_save: Future | None = None
        self.saved = Condition(self.lock)
        self.recovery_required = False
        # Auto mode is one long job on the simulation thread; `auto_stop` is the only way to end it.
        self.auto_job: str | None = None
        self.auto_stop = Event()
        # Seconds between two journées. Beyond pacing, the wait lets request threads take the world
        # lock, which is not fair: without it the loop could re-acquire it before any reader wakes.
        self.auto_delay = 0.8
        # The human club's match being played, kept in memory; the world only records how to rebuild it.
        self.live: LiveMatch | None = None

    def live_match(self, world: World) -> LiveMatch:
        """The match being played live, rebuilt from its record after a load or a restart. Call under the lock."""
        if world.live_match is None: raise CommandError("Aucun match en cours.")
        if self.live is None: self.live = build_live_match(world)
        return self.live

    @contextmanager
    def reading(self) -> Iterator[World]:
        with self.lock:
            if self.world is None: raise CommandError("Créez ou chargez une partie.")
            if self.recovery_required: raise CommandError("Simulation interrompue : rechargez la dernière sauvegarde.")
            yield self.world

    @contextmanager
    def mutating(self) -> Iterator[World]:
        """A synchronous world write outside the job queue: fast, no simulation RNG consumed,
        still lock-guarded, refused while a day-advance job is running and held until its autosave is written."""
        with self.lock:
            while self.pending_save is not None: self.saved.wait()
            if self.world is None: raise CommandError("Créez ou chargez une partie.")
            if self.recovery_required: raise CommandError("Simulation interrompue : rechargez la dernière sauvegarde.")
            if self.active: raise CommandError("Une commande est déjà en cours.")
            yield self.world

    def submit(self, kind: str, command_id: str, payload: dict) -> dict:
        with self.lock:
            if command_id in self.commands:
                previous_kind, previous_payload, job_id = self.commands[command_id]
                if (kind, payload) != (previous_kind, previous_payload):
                    raise CommandError("Cet identifiant de commande a déjà un autre contenu.")
                return asdict(self.jobs[job_id])
            if self.active: raise CommandError("Une commande est déjà en cours.")
            if kind not in ("create", "load") and (self.world is None or self.recovery_required):
                raise CommandError("Créez ou chargez une partie.")
            if kind in ("advance", "auto", "live_start") and self.world.live_match is not None:
                raise CommandError("Un match est en cours : terminez-le d'abord.")
            if kind == "live_finish" and self.world.live_match is None:
                raise CommandError("Aucun match en cours.")
            if "slot" in payload: self.store.path_for(payload["slot"])
            job = Job(uuid4().hex, kind)
            self.jobs[job.id] = job
            self.commands[command_id] = (kind, payload.copy(), job.id)
            self.active = job.id
            if kind == "auto":
                self.auto_stop.clear()
                self.auto_job = job.id
            self.executor.submit(self._run, job, payload)
            return asdict(job)

    def resume(self) -> dict | None:
        """Loads the slot saved last, as Reprendre would; None when there is no save."""
        slot = self.store.latest()
        return None if slot is None else self.submit("load", uuid4().hex, {"slot": slot})

    def auto_status(self) -> dict:
        with self.lock:
            running = self.auto_job is not None
            return {"running": running, "stopping": running and self.auto_stop.is_set(), "job": self.auto_job}

    def stop_auto(self) -> dict:
        """A control signal, not a command: it must work while the auto job holds `active`."""
        with self.lock:
            if self.auto_job is not None: self.auto_stop.set()
            return self.auto_status()

    def _run(self, job: Job, payload: dict) -> None:
        advancing = False
        awaiting_lineup = False
        competition = None
        pending_save: Future | None = None
        try:
            with self.lock:
                # Queued behind the previous advance's autosave: it must be written before this job touches the world.
                while self.pending_save is not None: self.saved.wait()
                if self.recovery_required and job.command not in ("create", "load"):
                    raise CommandError("Simulation interrompue : rechargez la dernière sauvegarde.")
                job.status = "running"
                slot = self.slot
            if job.command in ("create", "load"):
                if job.command == "create":
                    world, slot = new_world(self.root, payload["seed"], payload.get("levels"), payload.get("club_id")), "autosave"
                    self.store.save(world, slot)
                else:  # nothing to write: the file loaded is the game
                    world, slot = self.store.load(payload["slot"]), original_slot(payload["slot"])
                with self.lock:
                    self.world = world
                    self.slot = slot
                    self.live = None
                    self.recovery_required = False
            elif job.command == "save":
                self.store.save(self.world, payload["slot"])
                with self.lock: self.slot = payload["slot"]
            elif job.command in ("live_start", "live_finish"):
                world = self.world
                with self.lock:
                    advancing = True
                    if job.command == "live_start":
                        self.live = start_live_match(world)
                    else:
                        finish_live_match(world, self.live_match(world))
                        self.live = None
                        competition = round_competition(world, day_results(world))
                    advancing = False
                validate_world(world)
                self.store.save(world, slot)
            elif job.command == "auto":
                world = self.world
                moved, saved_on = False, None
                while not self.auto_stop.is_set():
                    destination = target_date(world, "journee")
                    while world.date.ordinal() < destination.ordinal():
                        with self.lock:
                            advancing = True
                            advance_day(world, auto=True)  # never pauses: falls back to an automatic lineup
                            advancing = False
                            job.date = world.date.iso()
                        moved = True
                        # Synchronous on purpose: a background write would race with the next day.
                        if world.date.day == 1:
                            self.store.save(world, slot)
                            saved_on = world.date.ordinal()
                        # Stops at a day boundary, the coherent point; also yields the lock to readers.
                        if self.auto_stop.wait(0.005): break
                    else:
                        self.auto_stop.wait(self.auto_delay)
                if moved:
                    validate_world(world)
                    if saved_on != world.date.ordinal(): self.store.save(world, slot)
            else:
                world = self.world
                # "etape" ends on a day the human club follows (see core.world.steps); the other targets
                # run a fixed number of days, a paused match day counting as one when it is resumed.
                step = payload["until"] == "etape"
                start, news_from = world.date, len(world.news)
                destination = step_target(world) if step else target_date(world, payload["until"])
                days = destination.ordinal() - start.ordinal()
                index = 0
                while True:
                    with self.lock:
                        advancing = True
                        finished = advance_day(world)
                        advancing = False
                        index += 1
                        job.date = world.date.iso()
                        job.progress = min(index / days, 1) * .95
                    if not finished:
                        awaiting_lineup = True
                        break
                    if world.date.day == 1: self.store.save(world, slot)
                    if step_over(world, start, news_from) if step else index >= days: break
                validate_world(world)
                competition = round_competition(world, ("club", world.matches[pending_lineup_match(world)].competition_id)
                                                if awaiting_lineup else day_results(world))
                if awaiting_lineup:
                    # Terminal pause, not a failure: save synchronously so it survives a restart.
                    self.store.save(world, slot)
                else:
                    # Nothing else mutates `world` in this job; the write can safely continue after we
                    # report success, as long as `pending_save` holds back whatever touches it next.
                    pending_save = self.save_executor.submit(self.store.save, world, slot)
            with self.lock:
                job.status, job.progress = ("awaiting_lineup", job.progress) if awaiting_lineup else ("done", 1)
                job.date = self.world.date.iso()
                job.competition = competition
                self._release(job, pending_save)
        except Exception as exc:
            with self.lock:
                self.recovery_required |= advancing
                job.status, job.error = "failed", f"{type(exc).__name__} : {exc}"
                self._release(job, pending_save)

    def _release(self, job: Job, pending_save: Future | None) -> None:
        """Frees the queue in the same lock section that publishes the job's outcome: a page told the job
        is over can submit the next command at once. Call under the lock."""
        self.active = None
        if self.auto_job == job.id: self.auto_job = None
        if pending_save is not None:
            self.pending_save = pending_save
            pending_save.add_done_callback(self._finish_save)

    def _finish_save(self, future: Future) -> None:
        with self.lock:
            if future.exception() is not None:
                self.recovery_required = True
            if self.pending_save is future: self.pending_save = None
            self.saved.notify_all()

    def close(self) -> None:
        self.auto_stop.set()  # an unbounded auto job would otherwise block the shutdown forever
        self.executor.shutdown(wait=True)
        self.save_executor.shutdown(wait=True)
        self.store.close()
