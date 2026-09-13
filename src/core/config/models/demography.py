"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""
from __future__ import annotations

from pydantic import Field
from pydantic.dataclasses import dataclass
from core.config.types import FrozenMap, MODEL_CONFIG

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigProgressionAgeCurveItem:
    min_age: int = Field(alias="age_min")
    max_age: int = Field(alias="age_max")
    factor: float = Field(alias="facteur")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigProgressionDeclineAgeCurveItem:
    min_age: int = Field(alias="age_min")
    max_age: int = Field(alias="age_max")
    points_per_month: float = Field(alias="points_par_mois")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigProgressionDecline:
    age_curve: tuple[DemographyConfigProgressionDeclineAgeCurveItem, ...] = Field(alias="courbe_age")
    goalkeeper_age_shift: int = Field(alias="decalage_age_gardien")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigProgression:
    evaluation: str = Field(alias="evaluation")
    monthly_reference_minutes: int = Field(alias="minutes_reference_par_mois")
    min_playing_factor: float = Field(alias="facteur_jeu_min")
    external_playing_factor: float = Field(alias="facteur_jeu_dormants_et_libres")
    amplitude: float = Field(alias="amplitude")
    noise: float = Field(alias="bruit_ecart_type")
    age_curve: tuple[DemographyConfigProgressionAgeCurveItem, ...] = Field(alias="courbe_age")
    decline: DemographyConfigProgressionDecline = Field(alias="declin")
    decline_weights: FrozenMap[float] = Field(alias="poids_declin_par_attribut")
    potential_cap: bool = Field(alias="plafonne_par_potentiel")
    decline_cap: bool = Field(alias="declin_plafonne")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigPotentialEstimate:
    max_noise: float = Field(alias="bruit_max")
    min_noise: float = Field(alias="bruit_min")
    start_age: int = Field(alias="age_debut_convergence")
    convergence_age: int = Field(alias="age_convergence")
    observer_reputation_factor: float = Field(alias="facteur_reputation_observateur")
    observer_base: float = Field(alias="facteur_observateur_base")
    refresh: str = Field(alias="actualisation")
    interval_width: float = Field(alias="demi_largeur_en_ecarts_types")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigCohort:
    correction_exponent: float = Field(alias="kappa_correction")
    target_source: str = Field(alias="source_cibles")
    active_target: str = Field(alias="population_active_cible")
    return_coefficient: float = Field(alias="coefficient_retour_effectif_cible")
    correction_axes: tuple[str, ...] = Field(alias="axes_correction")
    level_buckets: tuple[tuple[int, ...], ...] = Field(alias="buckets_niveau")
    bucket_convention: str = Field(alias="convention_buckets")
    outflow_types: tuple[str, ...] = Field(alias="sorties_incluent")
    inflow_types: tuple[str, ...] = Field(alias="entrees_hors_regens_incluent")
    distribution: str = Field(alias="distribution")
    excess_policy: str = Field(alias="excedent_cohorte")
    external_policy: str = Field(alias="dormants_et_libres")
    max_class_candidates: int = Field(alias="candidats_max_par_classe")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigGenerationLevelRatiosItem:
    age: int = Field(alias="age")
    ratio: float = Field(alias="ratio")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigGeneration:
    secondary_affinity: float = Field(alias="affinite_secondaire")
    secondary_positions: FrozenMap[tuple[str, ...]] = Field(alias="postes_secondaires_possibles")
    secondary_probability: float = Field(alias="probabilite_poste_secondaire")
    min_potential: int = Field(alias="potentiel_min")
    potential_amplitude: int = Field(alias="potentiel_amplitude")
    potential_alpha: float = Field(alias="beta_alpha_nation_moyenne")
    potential_beta: float = Field(alias="beta_beta_nation_moyenne")
    level_ratios: tuple[DemographyConfigGenerationLevelRatiosItem, ...] = Field(alias="ratio_niveau_sur_potentiel")
    level_noise: float = Field(alias="bruit_niveau_ecart_type")
    min_age: int = Field(alias="age_min")
    max_age: int = Field(alias="age_max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigAcademies:
    min_intake: int = Field(alias="promus_min")
    max_intake: int = Field(alias="promus_max")
    max_club_allocation: int = Field(alias="allocation_max_par_club")
    base_mean: float = Field(alias="moyenne_base")
    reputation_weight: float = Field(alias="poids_reputation")
    academy_weight: float = Field(alias="poids_note_centre")
    potential_noise: float = Field(alias="ecart_type_potentiel")
    contract_years: int = Field(alias="duree_contrat_annees")
    base_weekly_wage: int = Field(alias="salaire_hebdo_base")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigExitsRetirement:
    min_age: int = Field(alias="age_minimal")
    coefficient: float = Field(alias="coefficient")
    exponent: float = Field(alias="exposant")
    level_base: float = Field(alias="facteur_niveau_base")
    level_slope: float = Field(alias="facteur_niveau_pente")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigExitsPerimeterExit:
    min_age: int = Field(alias="age_minimal")
    estimated_potential_threshold: int = Field(alias="seuil_potentiel_estime")
    free_agent_required: bool = Field(alias="sans_club_requis")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfigExits:
    retirement: DemographyConfigExitsRetirement = Field(alias="retraite")
    perimeter_exit: DemographyConfigExitsPerimeterExit = Field(alias="sortie_perimetre")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class DemographyConfig:
    progression: DemographyConfigProgression = Field(alias="progression")
    potential_estimate: DemographyConfigPotentialEstimate = Field(alias="estimation_potentiel")
    cohort: DemographyConfigCohort = Field(alias="cohorte")
    position_targets: FrozenMap[float] = Field(alias="cible_postes")
    generation: DemographyConfigGeneration = Field(alias="generation")
    academies: DemographyConfigAcademies = Field(alias="centres_formation")
    exits: DemographyConfigExits = Field(alias="sorties")
