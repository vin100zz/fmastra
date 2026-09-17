"""Atomic gzip JSON saves and safe named slots."""
from __future__ import annotations

import gzip
import json
import os
import platform
import re
import tempfile
from pathlib import Path

from core.domain.world import World
from core.world.validation import validate_world
from infrastructure.config.loader import config_fingerprint
from .codec import encode, decode
from .typed_codec import ADAPTER, SaveEnvelope
from core.config.consistency import validate_consistency
from .history_migration import upgrade_history, recover_birthdates

SCHEMA_VERSION = 5
# Level 6 spends ~2.5x the time of level 3 for a few percent of file size on large worlds; not worth it here.
COMPRESSION_LEVEL = 3


class SaveError(ValueError):
    pass


class SaveStore:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def path_for(self, slot: str) -> Path:
        if not re.fullmatch(r"[\w-]{1,64}", slot, re.UNICODE):
            raise SaveError("Nom de sauvegarde invalide (lettres, chiffres, tirets uniquement).")
        return self.directory / f"{slot}.json.gz"

    def save(self, world: World, slot: str) -> Path:
        target = self.path_for(slot)
        self.directory.mkdir(parents=True, exist_ok=True)
        payload = SaveEnvelope(SCHEMA_VERSION, "0.1.0", platform.python_version(), config_fingerprint(world.config), world)
        raw = ADAPTER.dump_json(payload, by_alias=True, warnings="error")
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=self.directory, prefix=".save-", suffix=".tmp", delete=False) as handle:
                temporary = Path(handle.name)
                with gzip.GzipFile(fileobj=handle, mode="wb", compresslevel=COMPRESSION_LEVEL, mtime=0) as archive:
                    archive.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, target)
            return target
        finally:
            if temporary and temporary.exists():
                temporary.unlink()

    def load(self, slot: str) -> World:
        target = self.path_for(slot)
        try:
            with gzip.open(target, "rb") as handle:
                raw = handle.read()
            # Version 1 used tagged entities; it remains readable during migration.
            if b'"schema_version":1,' in raw[:100] or b'"schema_version": 1,' in raw[:100]:
                payload = json.loads(raw)
                world, fingerprint = decode(payload["world"]), payload["config_hash"]
            else:
                payload = ADAPTER.validate_json(raw)
                if payload.schema_version not in (2, 3, 4, SCHEMA_VERSION):
                    raise SaveError("Version de sauvegarde incompatible ; une migration est nécessaire.")
                world, fingerprint = payload.world, payload.config_hash
            if not isinstance(world, World) or config_fingerprint(world.config) != fingerprint:
                raise SaveError("Sauvegarde incohérente : configuration ou racine invalide.")
            if not {"matches", "market", "states", "progression", "demography"}.issubset(world.rngs):
                raise SaveError("Sauvegarde incomplète : flux aléatoires manquants.")
            validate_consistency(world.config)
            upgrade_history(world)
            recover_birthdates(world, self.directory.parent / 'data' / 'players.csv')
            validate_world(world)
            return world
        except (OSError, KeyError, TypeError, ValueError, EOFError) as exc:
            raise SaveError(f"Impossible de charger {slot} : {exc}") from exc

    def slots(self) -> list[dict[str, object]]:
        if not self.directory.exists():
            return []
        return [{"slot": path.name.removesuffix(".json.gz"), "bytes": path.stat().st_size,
                 "modified": path.stat().st_mtime} for path in sorted(self.directory.glob("*.json.gz"))]
