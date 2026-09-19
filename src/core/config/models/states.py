"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""
from __future__ import annotations

from pydantic import Field
from pydantic.dataclasses import dataclass
from core.config.types import FrozenMap, MODEL_CONFIG

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class StatesConfigFitnessIntensity:
    low_block: float = Field(alias="bloc_bas")
    balanced: float = Field(alias="equilibre")
    high_press: float = Field(alias="pressing_haut")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class StatesConfigFitness:
    min: float = Field(alias="min")
    max: float = Field(alias="max")
    initial: float = Field(alias="initiale")
    cost_per_minute: float = Field(alias="consommation_par_minute")
    resistance_base: float = Field(alias="resistance_base")
    stamina_resistance: float = Field(alias="resistance_facteur_endurance")
    intensity: StatesConfigFitnessIntensity = Field(alias="intensite_par_hauteur_bloc")
    daily_recovery: float = Field(alias="recuperation_base_par_jour")
    stamina_recovery: float = Field(alias="recuperation_facteur_endurance")
    young_recovery: float = Field(alias="facteur_age_jeune")
    young_age: int = Field(alias="seuil_age_jeune")
    old_recovery: float = Field(alias="facteur_age_vieux")
    old_age: int = Field(alias="seuil_age_vieux")
    alert_threshold: float = Field(alias="seuil_alerte")
    injury_return_fitness: float = Field(alias="fatigue_retour_de_blessure")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class StatesConfigInjuriesSeveritiesItem:
    name: str = Field(alias="nom")
    share: float = Field(alias="part")
    min_days: int = Field(alias="jours_min")
    max_days: int = Field(alias="jours_max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class StatesConfigInjuriesPermanentPenalty:
    min_duration_days: int = Field(alias="duree_minimale_jours")
    min_age: int = Field(alias="age_minimal")
    min_points: int = Field(alias="points_min")
    max_points: int = Field(alias="points_max")
    affected_attributes: tuple[str, ...] = Field(alias="attributs_touches")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class StatesConfigInjuries:
    possession_probability: float = Field(alias="probabilite_base_par_possession")
    fitness_factor: float = Field(alias="facteur_fatigue_max")
    fragility_min: float = Field(alias="fragilite_min")
    fragility_max: float = Field(alias="fragilite_max")
    daily_probability: float = Field(alias="probabilite_quotidienne_hors_match")
    severities: tuple[StatesConfigInjuriesSeveritiesItem, ...] = Field(alias="gravites")
    permanent_penalty: StatesConfigInjuriesPermanentPenalty = Field(alias="penalite_permanente")
    injury_return_form: float = Field(alias="forme_retour_de_blessure")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class StatesConfigSuspensionsYellowThresholdsItem:
    yellows: int = Field(alias="jaunes")
    matches: int = Field(alias="matches")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class StatesConfigSuspensions:
    red_min_matches: int = Field(alias="matches_rouge_min")
    red_max_matches: int = Field(alias="matches_rouge_max")
    second_yellow_matches: int = Field(alias="matches_double_jaune")
    yellow_thresholds: tuple[StatesConfigSuspensionsYellowThresholdsItem, ...] = Field(alias="seuils_cumul_jaunes")
    reset_after_threshold: bool = Field(alias="remise_a_zero_apres_seuil")
    counting_policy: str = Field(alias="decompte")
    same_match_policy: str = Field(alias="cumul_sanctions_meme_match")
    season_reset: bool = Field(alias="remise_a_zero_fin_saison")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class StatesConfigForm:
    min: float = Field(alias="min")
    max: float = Field(alias="max")
    initial: float = Field(alias="initiale")
    reference_rating: float = Field(alias="note_reference")
    rating_sensitivity: float = Field(alias="sensibilite_note")
    convergence_speed: float = Field(alias="vitesse_convergence")
    noise: float = Field(alias="bruit_ecart_type")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class StatesConfigMoral:
    min: float = Field(alias="min")
    max: float = Field(alias="max")
    initial: float = Field(alias="initial")
    match_amplitude: float = Field(alias="amplitude_effet_match")
    playing_time_weight: float = Field(alias="poids_temps_de_jeu")
    results_weight: float = Field(alias="poids_resultats_club")
    contract_weight: float = Field(alias="poids_satisfaction_contrat")
    drift_speed: float = Field(alias="vitesse_derive")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class StatesConfigSubstitutions:
    first_evaluation_minute: int = Field(alias="premiere_minute_evaluation")
    evaluation_interval: int = Field(alias="intervalle_evaluation_minutes")
    fitness_threshold: float = Field(alias="seuil_fatigue_declenchement")
    booked_fitness_threshold: float = Field(alias="seuil_fatigue_joueur_averti")
    replacement_gap: float = Field(alias="ecart_niveau_acceptable_remplacant")
    tactical_minutes: int = Field(alias="minutes_restantes_ajustement_tactique")
    defensive_goal_margin: int = Field(alias="ecart_buts_ajustement_defensif")
    rotation_min_gain: float = Field(default=10.0, alias="gain_minimum_rotation")
    playing_time_weight: float = Field(default=8.0, alias="poids_deficit_temps_jeu")
    development_weight: float = Field(default=10.0, alias="poids_developpement_jeunes")
    potential_margin_reference: float = Field(default=20.0, alias="marge_potentiel_reference")
    min_useful_minutes: int = Field(default=15, alias="minutes_utiles_minimum")
    rotation_interval: int = Field(default=10, alias="intervalle_rotation_minutes")
    rotations_per_window: int = Field(default=2, alias="rotations_par_fenetre")
    rotation_min_affinity: float = Field(default=0.5, alias="affinite_minimum_rotation")
    close_game_rotation_factor: float = Field(default=0.5, alias="facteur_rotation_match_serre")
    trailing_rotation_factor: float = Field(default=0.25, alias="facteur_rotation_equipe_menee")
    comfortable_gap_factor: float = Field(default=2.0, alias="facteur_ecart_avantage_confortable")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class StatesConfig:
    fitness: StatesConfigFitness = Field(alias="fatigue")
    injuries: StatesConfigInjuries = Field(alias="blessures")
    suspensions: StatesConfigSuspensions = Field(alias="suspensions")
    form: StatesConfigForm = Field(alias="forme")
    moral: StatesConfigMoral = Field(alias="moral")
    substitutions: StatesConfigSubstitutions = Field(alias="remplacements")
