"""Strict loading, deep overrides and canonical fingerprints."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter, ValidationError

from core.config.model import Config
from core.config.consistency import ConfigError, validate_consistency
from core.world.pyramids import Pyramid, check_pyramids, parse_pyramids, world_payload

FILES = ("monde", "import", "attributs", "implications", "formations", "moteur_match",
         "etats", "ia_gestion", "demographie", "benchmarks", "nations", "international")
ADAPTER = TypeAdapter(Config)


def strip_notes(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: strip_notes(item) for key, item in value.items() if key != "_note"}
    if isinstance(value, list):
        return [strip_notes(item) for item in value]
    return value


def merge(base: Any, override: Any) -> Any:
    if isinstance(base, dict) and isinstance(override, dict):
        result = base.copy()
        for key, value in override.items():
            result[key] = merge(base[key], value) if key in base else value
        return result
    return override


def decode_config(payload: dict[str, Any]) -> Config:
    try:
        cfg = ADAPTER.validate_json(json.dumps(strip_notes(payload)), strict=True)
        validate_consistency(cfg)
        return cfg
    except (ValidationError, ValueError, TypeError) as exc:
        raise ConfigError(str(exc)) from exc


def load_config(directory: Path, overrides: Path | None = None) -> Config:
    try:
        payload = {name: json.loads((directory / f"{name}.json").read_text("utf-8")) for name in FILES
                   if name not in ("nations", "international") or (directory / f"{name}.json").exists()}
        if overrides is not None:
            if overrides.is_file():
                payload = merge(payload, json.loads(overrides.read_text("utf-8")))
            elif overrides.is_dir():
                for path in sorted(overrides.glob("*.json")):
                    if path.stem not in FILES:
                        raise ConfigError(f"Unknown override file: {path.name}")
                    payload[path.stem] = merge(payload[path.stem], json.loads(path.read_text("utf-8")))
            else:
                raise ConfigError(f"Override path does not exist: {overrides}")
        return decode_config(payload)
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigError(f"Cannot load config from {directory}: {exc}") from exc


def load_pyramids(directory: Path, cfg: Config) -> tuple[Pyramid, ...]:
    """The nations a new game can play (creation.json), checked against the configuration's own leagues."""
    try:
        pyramids = parse_pyramids(strip_notes(json.loads((directory / "creation.json").read_text("utf-8"))))
        check_pyramids(cfg, pyramids)
        return pyramids
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise ConfigError(f"Cannot load the nations of a new game from {directory}: {exc}") from exc


def configure_world(cfg: Config, pyramids: tuple[Pyramid, ...], levels: dict[str, int]) -> Config:
    """The configuration of a game whose nations each play `levels[nation]` divisions."""
    payload = config_payload(cfg)
    payload["monde"] = world_payload(payload["monde"], pyramids, levels)
    return decode_config(payload)


def config_payload(cfg: Config) -> dict[str, Any]:
    return ADAPTER.dump_python(cfg, mode="json", by_alias=True)


def config_fingerprint(cfg: Config) -> str:
    raw = json.dumps(config_payload(cfg), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
