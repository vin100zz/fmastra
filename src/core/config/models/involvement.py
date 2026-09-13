"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""
from __future__ import annotations

from pydantic import Field
from pydantic.dataclasses import dataclass
from core.config.types import FrozenMap, MODEL_CONFIG

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class InvolvementConfig:
    zones: tuple[str, ...] = Field(alias="zones")
    lanes: tuple[str, ...] = Field(alias="couloirs")
    attack: FrozenMap[tuple[float, ...]] = Field(alias="vertical_attaque")
    defense: FrozenMap[tuple[float, ...]] = Field(alias="vertical_defense")
    lateral: FrozenMap[tuple[float, ...]] = Field(alias="lateral")
