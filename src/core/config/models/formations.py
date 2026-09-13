"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""
from __future__ import annotations

from pydantic import Field
from pydantic.dataclasses import dataclass
from core.config.types import FrozenMap, MODEL_CONFIG

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class FormationsConfigBlockHeight:
    min: float = Field(alias="min")
    max: float = Field(alias="max")
    default: float = Field(alias="defaut")
    recovery_bonus: float = Field(alias="bonus_zone_recuperation")
    initial_strength_sensitivity: float = Field(alias="sensibilite_ecart_force_initial")
    initial_home_bonus: float = Field(alias="bonus_domicile_initial")
    advanced_recovery_probability: float = Field(alias="probabilite_recuperation_avancee_base")
    counter_vulnerability: float = Field(alias="malus_vulnerabilite_contre")
    late_trailing_adjustment: float = Field(alias="ajustement_menes_fin_match")
    late_match_minutes: int = Field(alias="minutes_fin_match")
    red_card_adjustment: float = Field(alias="malus_inferiorite_numerique")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class FormationsConfig:
    formations: FrozenMap[tuple[str, ...]] = Field(alias="formations")
    block_height: FormationsConfigBlockHeight = Field(alias="hauteur_bloc")
