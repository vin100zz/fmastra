"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""
from __future__ import annotations

from pydantic import Field
from pydantic.dataclasses import dataclass
from core.config.types import FrozenMap, MODEL_CONFIG

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigSourceFormat:
    encoding: str = Field(alias="encodage")
    delimiter: str = Field(alias="separateur")
    date_format: str = Field(alias="format_date")
    free_agent_club_id: int = Field(alias="identifiant_club_agent_libre")
    missing_date: str = Field(alias="marqueur_date_absente")
    wage_unit: str = Field(alias="unite_salaire")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigTiersSimulated:
    players: int = Field(default=30, alias="joueurs")
    goalkeepers: int = Field(default=3, alias="gardiens")
    prospects: int = Field(default=3, alias="espoirs")
    prospect_max_age: int = Field(default=21, alias="age_max_espoir")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigTiersPool:
    players: int = Field(default=11, alias="joueurs")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigTiersStars:
    reputation: float = Field(default=60.0, alias="reputation_min")
    wonderkid_potential: int = Field(default=150, alias="potentiel_min_pepite")
    wonderkid_max_age: int = Field(default=21, alias="age_max_pepite")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigTiersFreeAgents:
    players: int = Field(default=300, alias="joueurs")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigTiersForeign:
    players: int = Field(default=15, alias="joueurs")
    min_players: int = Field(default=11, alias="joueurs_min")
    clubs_per_place: int = Field(default=2, alias="clubs_par_place_europe")
    min_clubs: int = Field(default=4, alias="clubs_europe_min")
    max_clubs: int = Field(default=12, alias="clubs_europe_max")
    reputation: float = Field(default=60.0, alias="reputation_min")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigTiersCup:
    clubs: int = Field(default=96, alias="clubs_par_nation")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigTiersFloor:
    min_players: int = Field(default=23, alias="joueurs_min")
    max_players: int = Field(default=110, alias="joueurs_max")
    min_strength: float = Field(default=25.0, alias="force_min")
    max_strength: float = Field(default=80.0, alias="force_max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigTiers:
    simulated: ImportSettingsConfigTiersSimulated = Field(default_factory=ImportSettingsConfigTiersSimulated, alias="clubs_simules")
    pool: ImportSettingsConfigTiersPool = Field(default_factory=ImportSettingsConfigTiersPool, alias="vivier")
    stars: ImportSettingsConfigTiersStars = Field(default_factory=ImportSettingsConfigTiersStars, alias="vedettes")
    free_agents: ImportSettingsConfigTiersFreeAgents = Field(default_factory=ImportSettingsConfigTiersFreeAgents, alias="agents_libres")
    foreign: ImportSettingsConfigTiersForeign = Field(default_factory=ImportSettingsConfigTiersForeign, alias="clubs_etrangers")
    cup: ImportSettingsConfigTiersCup = Field(default_factory=ImportSettingsConfigTiersCup, alias="coupe")
    floor: ImportSettingsConfigTiersFloor = Field(default_factory=ImportSettingsConfigTiersFloor, alias="plancher_nation")
    outside_budget: int = Field(default=8000, alias="plafond_hors_simules")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigSquadSelection:
    max_players: int = Field(alias="joueurs_max_par_club")
    reserved_goalkeepers: int = Field(alias="gardiens_reserves_si_disponibles")
    criterion: str = Field(alias="critere")
    tiebreaker: str = Field(alias="departage")
    excluded_players: str = Field(alias="joueurs_ecartes")
    free_agents: str = Field(alias="agents_libres")
    tiers: ImportSettingsConfigTiers = Field(default_factory=ImportSettingsConfigTiers, alias="paliers")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigMissingValues:
    nonpositive_value: str = Field(alias="valeur_non_positive")
    fallback_level: int = Field(alias="niveau_repli")
    zero_contracted_wage: str = Field(alias="salaire_nul_sous_contrat")
    nonpositive_capacity: str = Field(alias="capacite_stade_non_positive")
    missing_contract: str = Field(alias="contrat_absent_club")
    expired_contract: str = Field(alias="contrat_expire")
    unknown_signature: str = Field(alias="date_signature_inconnue")
    primary_nationality: str = Field(alias="nationalite_principale")
    undivided_name: str = Field(alias="nom_sans_virgule")
    outside_age_curve: str = Field(alias="courbe_age_hors_domaine")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigPlayerSynthesisLevel:
    min: int = Field(alias="min")
    max: int = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigPlayerSynthesis:
    level: ImportSettingsConfigPlayerSynthesisLevel = Field(alias="niveau")
    default_potential_margin: int = Field(alias="marge_potentiel_defaut")
    young_potential_margin: int = Field(alias="marge_potentiel_jeune_max")
    potential_age_threshold: int = Field(alias="marge_potentiel_age_seuil")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigClubSynthesisCapacityReference:
    min: int = Field(alias="min")
    max: int = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigClubSynthesisReputation:
    min: int = Field(alias="min")
    max: int = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigClubSynthesisAcademyRating:
    min: int = Field(alias="min")
    max: int = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigClubSynthesis:
    capacity_reference: ImportSettingsConfigClubSynthesisCapacityReference = Field(alias="stad_cap_reference")
    reputation: ImportSettingsConfigClubSynthesisReputation = Field(alias="reputation")
    reputation_noise: float = Field(alias="reputation_bruit_ecart_type")
    academy_rating: ImportSettingsConfigClubSynthesisAcademyRating = Field(alias="note_centre_formation")
    academy_reputation_factor: float = Field(alias="note_centre_formation_facteur_reputation")
    academy_noise: float = Field(alias="note_centre_formation_bruit_ecart_type")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfigPositions:
    secondary_affinity: float = Field(alias="affinite_secondaire_defaut")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ImportSettingsConfig:
    source_format: ImportSettingsConfigSourceFormat = Field(alias="format_source")
    squad_selection: ImportSettingsConfigSquadSelection = Field(alias="selection_effectifs")
    missing_values: ImportSettingsConfigMissingValues = Field(alias="valeurs_manquantes")
    player_synthesis: ImportSettingsConfigPlayerSynthesis = Field(alias="synthese_attributs")
    club_synthesis: ImportSettingsConfigClubSynthesis = Field(alias="synthese_club")
    positions: ImportSettingsConfigPositions = Field(alias="postes")
