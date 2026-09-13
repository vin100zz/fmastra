"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""
from __future__ import annotations

from pydantic import Field
from pydantic.dataclasses import dataclass
from core.config.types import FrozenMap, MODEL_CONFIG

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class AttributesConfigGroups:
    technical: tuple[str, ...] = Field(alias="techniques")
    mental: tuple[str, ...] = Field(alias="mentaux")
    physical: tuple[str, ...] = Field(alias="physiques")
    goalkeeping: tuple[str, ...] = Field(alias="gardien")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class AttributesConfigBounds:
    min: int = Field(alias="min")
    max: int = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class AttributesConfigComposites:
    progression_attack: FrozenMap[float] = Field(alias="progression_attaque")
    progression_defense: FrozenMap[float] = Field(alias="progression_defense")
    creation_attack: FrozenMap[float] = Field(alias="occasion_attaque")
    creation_defense: FrozenMap[float] = Field(alias="occasion_defense")
    shooting: FrozenMap[float] = Field(alias="tir")
    saving: FrozenMap[float] = Field(alias="arret")
    heading: FrozenMap[float] = Field(alias="tete")
    claiming: FrozenMap[float] = Field(alias="sortie")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class AttributesConfigGenerationProfiles:
    noise: float = Field(alias="bruit_ecart_type")
    profiles: FrozenMap[FrozenMap[float]] = Field(alias="profils")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class AttributesConfigOutOfPosition:
    base: float = Field(alias="base")
    factor: float = Field(alias="facteur")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class AttributesConfig:
    groups: AttributesConfigGroups = Field(alias="liste")
    bounds: AttributesConfigBounds = Field(alias="bornes")
    composites: AttributesConfigComposites = Field(alias="composites")
    overall: FrozenMap[FrozenMap[float]] = Field(alias="note_globale")
    generation_profiles: AttributesConfigGenerationProfiles = Field(alias="profils_generation")
    out_of_position: AttributesConfigOutOfPosition = Field(alias="malus_hors_poste")
