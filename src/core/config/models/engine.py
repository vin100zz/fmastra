"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""
from __future__ import annotations

from pydantic import Field
from pydantic.dataclasses import dataclass
from core.config.types import FrozenMap, MODEL_CONFIG

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigTiming:
    match_seconds: int = Field(alias="duree_match_secondes")
    possession_mean: float = Field(alias="duree_possession_moyenne")
    possession_gamma_shape: float = Field(alias="duree_possession_forme_gamma")
    stoppage_min: int = Field(alias="temps_additionnel_min")
    stoppage_max: int = Field(alias="temps_additionnel_max")
    seconds_per_stoppage: int = Field(alias="secondes_par_arret_de_jeu")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigTransitions:
    progression_bias: float = Field(alias="progression_bias")
    creation_bias: float = Field(alias="creation_bias")
    progression_sensitivity: float = Field(alias="k_prog")
    creation_sensitivity: float = Field(alias="k_occ")
    home_bonus: float = Field(alias="bonus_domicile")
    max_gap: float = Field(default=20.0, alias="ecart_note_max", gt=0)
    comfortable_lead: int = Field(default=2, alias="avance_confortable")
    easing_per_goal: float = Field(default=0.4, alias="relachement_par_but")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigDensity:
    reference: float = Field(alias="reference")
    exponent: float = Field(alias="exposant")
    empty_rating: float = Field(alias="note_plancher")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigLanes:
    beta_softmax: float = Field(alias="beta_softmax")
    switch_probability: float = Field(alias="probabilite_changement_aile")
    switch_vision_weight: float = Field(alias="poids_vision_changement_aile")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigChanceHeaderKeeperWeights:
    claiming: float = Field(alias="sortie")
    saving: float = Field(alias="arret")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigChance:
    cross_xg: float = Field(alias="xg_base_centre")
    shot_xg: float = Field(alias="xg_base_frappe")
    counter_multiplier: float = Field(alias="multiplicateur_contre")
    finishing_sensitivity: float = Field(alias="sensibilite_tireur_gardien")
    header_keeper_weights: EngineConfigChanceHeaderKeeperWeights = Field(alias="poids_gardien_sur_tete")
    on_target_probability: float = Field(alias="probabilite_tir_cadre_base")
    on_target_sensitivity: float = Field(alias="sensibilite_cadrage")
    on_target_reference: float = Field(alias="niveau_reference_cadrage")
    probability_min: float = Field(alias="borne_probabilite_min")
    probability_max: float = Field(alias="borne_probabilite_max")
    delivery_sensitivity: float = Field(default=0.02, alias="sensibilite_livraison")
    cross_reference: float = Field(default=45.6, alias="niveau_reference_centre")
    set_piece_reference: float = Field(default=55.3, alias="niveau_reference_cpa")
    free_kick_reference: float = Field(default=58.8, alias="niveau_reference_coup_franc")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigSetPieces:
    corner_probability: float = Field(alias="probabilite_corner_sur_turnover_avance")
    free_kick_probability: float = Field(alias="probabilite_coup_franc_sur_turnover")
    corner_xg: float = Field(alias="xg_base_corner")
    free_kick_xg: float = Field(alias="xg_base_coup_franc_direct")
    target_goal_share: float = Field(alias="part_cible_buts_sur_cpa")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigTurnover:
    counter_zone: str = Field(alias="zone_declenchant_contre")
    low_counter_probability: float = Field(alias="probabilite_contre_depuis_zone_basse")
    counter_pace_sensitivity: float = Field(alias="sensibilite_ecart_vitesse_contre")
    defense_penalty: float = Field(alias="malus_defensif_contre")
    lane_defense_penalty: float = Field(alias="malus_defensif_couloir_concerne")
    penalty_possessions: int = Field(alias="duree_malus_possessions")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigKeeperDistribution:
    midfield_start_probability: float = Field(alias="probabilite_depart_milieu_bas")
    distribution_sensitivity: float = Field(alias="sensibilite_relance")
    reference_level: float = Field(alias="niveau_reference")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigCards:
    yellow_probability: float = Field(alias="probabilite_jaune_par_turnover_defensif")
    booked_caution_multiplier: float = Field(alias="booked_caution_multiplier")
    red_probability: float = Field(alias="probabilite_rouge_direct_par_turnover_defensif")
    defense_zone_weight: float = Field(alias="poids_zone_defense")
    aggression_weight: float = Field(alias="poids_agressivite_tacle")
    aggression_min: float = Field(default=0.25, alias="agressivite_min")
    aggression_max: float = Field(default=2.0, alias="agressivite_max")
    aggression_source_low: float = Field(default=4.0, alias="agressivite_note_basse")
    aggression_source_reference: float = Field(default=10.5, alias="agressivite_note_reference")
    aggression_source_high: float = Field(default=17.0, alias="agressivite_note_haute")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigRatingRefresh:
    fitness_interval: int = Field(alias="palier_fatigue_minutes")
    on_substitution: bool = Field(alias="sur_remplacement")
    on_red_card: bool = Field(alias="sur_carton_rouge")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigAnalytical:
    base_goals: float = Field(alias="buts_attendus_base")
    strength_sensitivity: float = Field(alias="sensibilite_ecart_force")
    home_goal_bonus: float = Field(alias="bonus_domicile_buts")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigPlayerRatings:
    base: float = Field(alias="base")
    min: float = Field(alias="min")
    max: float = Field(alias="max")
    goal: float = Field(alias="but")
    assist: float = Field(alias="passe_decisive")
    saved_shot: float = Field(alias="tir_cadre_sans_but")
    saving: float = Field(alias="arret")
    keeper_conceded: float = Field(alias="but_encaisse_gardien")
    yellow: float = Field(alias="jaune")
    expulsion: float = Field(alias="expulsion")
    min_rating_minutes: int = Field(alias="minutes_minimum_note")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfig:
    timing: EngineConfigTiming = Field(alias="chronologie")
    transitions: EngineConfigTransitions = Field(alias="transitions")
    density: EngineConfigDensity = Field(alias="densite")
    lanes: EngineConfigLanes = Field(alias="couloirs")
    chance: EngineConfigChance = Field(alias="occasion")
    set_pieces: EngineConfigSetPieces = Field(alias="coups_arretes")
    turnover: EngineConfigTurnover = Field(alias="turnover")
    keeper_distribution: EngineConfigKeeperDistribution = Field(alias="relance_gardien")
    cards: EngineConfigCards = Field(alias="cartons")
    rating_refresh: EngineConfigRatingRefresh = Field(alias="recalcul_notes")
    analytical: EngineConfigAnalytical = Field(alias="analytique")
    player_ratings: EngineConfigPlayerRatings = Field(alias="notes_joueurs")
