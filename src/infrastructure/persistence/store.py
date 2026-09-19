"""Atomic gzip JSON saves and safe named slots."""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import platform
import re
import tempfile
from pathlib import Path

from core.domain.world import World
from core.world.validation import validate_world
from infrastructure.config.loader import config_fingerprint, config_payload
from .codec import encode, decode
from .typed_codec import ADAPTER, SaveEnvelope
from core.config.consistency import validate_consistency
from .history_migration import upgrade_history, recover_birthdates

SCHEMA_VERSION = 8
# Market rules introduced by each schema version, newest first, with the value
# an older embedded configuration receives from the model defaults.
MIGRATION_DEFAULTS = (
    (8, {"profondeur_effectif_min": 16, "profondeur_effectif_max": 20,
         "reputation_profondeur_min": 50.0, "reputation_profondeur_max": 80.0, "poids_profondeur_vente": 0.75,
         "tolerance_baisse_reputation": 5.0, "marge_niveau_joueur": 2.0, "moral_depart_force": 0.5,
         "talents_visibles": 10, "jours_encheres": 2}),
    (7, {"gain_qualite_min_recrutement": 3.0}),
    (6, {"stabilite_apres_arrivee_jours": 180}),
)
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
                version = 1
            else:
                payload = ADAPTER.validate_json(raw)
                if payload.schema_version not in (2, 3, 4, 5, 6, 7, SCHEMA_VERSION):
                    raise SaveError("Version de sauvegarde incompatible ; une migration est nécessaire.")
                world, fingerprint = payload.world, payload.config_hash
                version = payload.schema_version
            if not isinstance(world, World) or not _config_matches(world, fingerprint, version):
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

    def delete(self, slot: str) -> None:
        target = self.path_for(slot)
        try:
            target.unlink()
        except FileNotFoundError as exc:
            raise SaveError(f"Sauvegarde introuvable : {slot}") from exc

    def slots(self) -> list[dict[str, object]]:
        if not self.directory.exists():
            return []
        return [{"slot": path.name.removesuffix(".json.gz"), "bytes": path.stat().st_size,
                 "modified": path.stat().st_mtime} for path in sorted(self.directory.glob("*.json.gz"))]


def _config_matches(world: World, fingerprint: str, version: int) -> bool:
    if config_fingerprint(world.config) == fingerprint: return True
    # Verify each historical configuration before accepting only its explicit
    # migration defaults. Existing/custom rules must retain their fingerprint.
    if version >= SCHEMA_VERSION: return False
    previous = config_payload(world.config)
    rules = previous["ia_gestion"]["mercato"]
    for introduced, defaults in MIGRATION_DEFAULTS:
        if version >= introduced: continue
        if any(rules[key] != default for key, default in defaults.items()): return False
        for key in defaults: del rules[key]
        raw = json.dumps(previous, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        if hashlib.sha256(raw.encode("utf-8")).hexdigest() == fingerprint: return True
    return False
