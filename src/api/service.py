"""Serialize commands outside request threads, publishing coherent day boundaries."""
from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass, asdict
from pathlib import Path
from threading import RLock
from typing import Iterator
from uuid import uuid4

from core.domain.world import World
from core.world.simulation import advance_day, target_date
from core.world.validation import validate_world
from infrastructure.config.loader import load_config
from infrastructure.importation.loader import import_world
from infrastructure.persistence.store import SaveStore


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


class GameService:
    def __init__(self, root: Path, saves: Path | None = None) -> None:
        self.root = root
        self.store = SaveStore(saves or root / "saves")
        self.world: World | None = None
        self.lock = RLock()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="simulation")
        self.save_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="autosave")
        self.jobs: dict[str, Job] = {}
        self.commands: dict[str, tuple[str, dict, str]] = {}
        self.active: str | None = None
        self.recovery_required = False

    @contextmanager
    def reading(self) -> Iterator[World]:
        with self.lock:
            if self.world is None: raise CommandError("Créez ou chargez une partie.")
            if self.recovery_required: raise CommandError("Simulation interrompue : rechargez la dernière sauvegarde.")
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
            if "slot" in payload: self.store.path_for(payload["slot"])
            job = Job(uuid4().hex, kind)
            self.jobs[job.id] = job
            self.commands[command_id] = (kind, payload.copy(), job.id)
            self.active = job.id
            self.executor.submit(self._run, job, payload)
            return asdict(job)

    def _run(self, job: Job, payload: dict) -> None:
        advancing = False
        pending_save: Future | None = None
        try:
            with self.lock: job.status = "running"
            if job.command in ("create", "load"):
                world = (import_world(self.root / "data", load_config(self.root / "config"), payload["seed"])
                         if job.command == "create" else self.store.load(payload["slot"]))
                self.store.save(world, "autosave")
                with self.lock:
                    self.world = world
                    self.recovery_required = False
            elif job.command == "save":
                self.store.save(self.world, payload["slot"])
            else:
                world = self.world
                destination = target_date(world, payload["until"])
                days = destination.ordinal() - world.date.ordinal()
                for index in range(days):
                    with self.lock:
                        advancing = True
                        advance_day(world)
                        advancing = False
                        job.date = world.date.iso()
                        job.progress = (index + 1) / days * .95
                    if world.date.day == 1: self.store.save(world, "autosave")
                validate_world(world)
                # Nothing else mutates `world` in this job; the write can safely continue after we
                # report success, as long as `active` stays held so no other job starts touching it.
                pending_save = self.save_executor.submit(self.store.save, world, "autosave")
            with self.lock:
                job.status, job.progress = "done", 1
                job.date = self.world.date.iso()
        except Exception as exc:
            with self.lock:
                self.recovery_required |= advancing
                job.status, job.error = "failed", f"{type(exc).__name__} : {exc}"
        finally:
            if pending_save is None:
                with self.lock: self.active = None
            else:
                pending_save.add_done_callback(self._finish_save)

    def _finish_save(self, future: Future) -> None:
        with self.lock:
            if future.exception() is not None:
                self.recovery_required = True
            self.active = None

    def close(self) -> None:
        self.executor.shutdown(wait=True)
        self.save_executor.shutdown(wait=True)
