"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""
from __future__ import annotations

from pydantic import Field
from pydantic.dataclasses import dataclass
from core.config.types import FrozenMap, MODEL_CONFIG

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigStartDate:
    year: int = Field(alias="annee")
    month: int = Field(alias="mois")
    day: int = Field(alias="jour")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigCompetitionsItem:
    nation: str = Field(alias="pays")
    name: str = Field(alias="nom")
    level: int = Field(alias="niveau")
    club_count: int = Field(alias="nb_clubs")
    division_id: int = Field(alias="division_id")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigPromotionRelegationReservesItem:
    nation: str = Field(alias="pays")
    division_ids: tuple[int, ...] = Field(alias="division_ids")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigPromotionRelegation:
    club_count: int = Field(alias="nb_clubs")
    reputation_exponent: float = Field(alias="exposant_reputation")
    reserves: tuple[WorldConfigPromotionRelegationReservesItem, ...] = Field(alias="reserves")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigSeason:
    start_month: int = Field(alias="debut_mois")
    start_day: int = Field(alias="debut_jour")
    end_month: int = Field(alias="fin_mois")
    end_day: int = Field(alias="fin_jour")
    days_between_rounds: int = Field(alias="jours_entre_journees")
    win_points: int = Field(alias="points_victoire")
    draw_points: int = Field(alias="points_nul")
    loss_points: int = Field(alias="points_defaite")
    tiebreakers: tuple[str, ...] = Field(alias="criteres_departage")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigMarketSummer:
    start_month: int = Field(alias="debut_mois")
    start_day: int = Field(alias="debut_jour")
    end_month: int = Field(alias="fin_mois")
    end_day: int = Field(alias="fin_jour")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigMarketWinter:
    start_month: int = Field(alias="debut_mois")
    start_day: int = Field(alias="debut_jour")
    end_month: int = Field(alias="fin_mois")
    end_day: int = Field(alias="fin_jour")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigMarket:
    summer: WorldConfigMarketSummer = Field(alias="ete")
    winter: WorldConfigMarketWinter = Field(alias="hiver")
    rounds_per_day: int = Field(alias="tours_par_jour")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigKeyDatesAcademyIntake:
    month: int = Field(alias="mois")
    day: int = Field(alias="jour")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigKeyDatesContractRelease:
    month: int = Field(alias="mois")
    day: int = Field(alias="jour")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigKeyDatesPopulationReview:
    month: int = Field(alias="mois")
    day: int = Field(alias="jour")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigKeyDates:
    academy_intake: WorldConfigKeyDatesAcademyIntake = Field(alias="promotion_centre_formation")
    contract_release: WorldConfigKeyDatesContractRelease = Field(alias="liberation_contrats_expires")
    population_review: WorldConfigKeyDatesPopulationReview = Field(alias="bilan_demographique")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfigMatchRules:
    players_on_pitch: int = Field(alias="joueurs_sur_terrain")
    max_substitutions: int = Field(alias="remplacements_max")
    substitution_windows: int = Field(alias="fenetres_remplacement")
    bench_size: int = Field(alias="taille_banc")
    min_players: int = Field(alias="joueurs_minimum_poursuite")
    forfeit_winner_goals: int = Field(alias="score_forfait_buts_vainqueur")
    forfeit_loser_goals: int = Field(alias="score_forfait_buts_perdant")
    half_seconds: int = Field(alias="mi_temps_secondes")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class WorldConfig:
    version: int = Field(alias="version_config")
    start_date: WorldConfigStartDate = Field(alias="date_debut_partie")
    competitions: tuple[WorldConfigCompetitionsItem, ...] = Field(alias="competitions_simulees")
    promotion_relegation: WorldConfigPromotionRelegation = Field(alias="promotion_relegation")
    season: WorldConfigSeason = Field(alias="saison")
    market: WorldConfigMarket = Field(alias="mercato")
    key_dates: WorldConfigKeyDates = Field(alias="dates_cles")
    match_rules: WorldConfigMatchRules = Field(alias="regles_match")
