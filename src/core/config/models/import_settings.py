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
class ImportSettingsConfigSquadSelection:
    max_players: int = Field(alias="joueurs_max_par_club")
    reserved_goalkeepers: int = Field(alias="gardiens_reserves_si_disponibles")
    criterion: str = Field(alias="critere")
    tiebreaker: str = Field(alias="departage")
    excluded_players: str = Field(alias="joueurs_ecartes")
    free_agents: str = Field(alias="agents_libres")


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
