"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""
from __future__ import annotations

from pydantic import Field
from pydantic.dataclasses import dataclass
from core.config.types import FrozenMap, MODEL_CONFIG

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigTiming:
    match_seconds: int = Field(alias="duree_match_secondes")
    stoppage_min: int = Field(alias="temps_additionnel_min")
    stoppage_max: int = Field(alias="temps_additionnel_max")
    seconds_per_stoppage: int = Field(alias="secondes_par_arret_de_jeu")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigActionsConservation:
    """A conservation pass in each zone succeeds at `bias_by_zone` plus `sensitivity` x the side's edge in keeping the ball
    (see `possession.play_possession`), in logit."""
    bias_by_zone: tuple[float, ...] = Field(default=(3.6, 3.2, 2.6, 2.0), alias="biais_par_zone")
    sensitivity: float = Field(default=0.08, alias="sensibilite")
    lateral_share: float = Field(default=0.35, alias="part_laterale")
    back_share_by_zone: tuple[float, ...] = Field(default=(0.0, 0.10, 0.10, 0.18), alias="part_recul_par_zone")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigActionsOpening:
    gain_per_pass: float = Field(default=0.10, alias="gain_par_passe")
    max: float = Field(default=0.6, alias="max", gt=0)
    kept_after_progression: float = Field(default=0.5, alias="part_conservee_apres_progression")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigActionsLongBall:
    share_by_zone: tuple[float, ...] = Field(default=(0.40, 0.15), alias="part_par_zone")
    bias: float = Field(default=-0.65, alias="biais")
    passing_sensitivity: float = Field(default=0.03, alias="sensibilite_passe")
    passing_reference: float = Field(default=60.0, alias="reference_passe")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigActionsLongShot:
    share: float = Field(default=0.23, alias="part")
    finishing_sensitivity: float = Field(default=0.03, alias="sensibilite_finition")
    finishing_reference: float = Field(default=60.0, alias="reference_finition")
    opening_effect: float = Field(default=-1.0, alias="effet_ouverture")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigActionsCreationCentre:
    shot: float = Field(default=0.55, alias="frappe")
    dribble: float = Field(default=0.20, alias="dribble")
    through_ball: float = Field(default=0.25, alias="profondeur")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigActionsCreationWing:
    cross: float = Field(default=0.30, alias="centre")
    cutback: float = Field(default=0.70, alias="retrait")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigActionsCreation:
    centre_shares: EngineConfigActionsCreationCentre = Field(default_factory=EngineConfigActionsCreationCentre, alias="parts_axe")
    through_opening_pull: float = Field(default=1.5, alias="attrait_profondeur_ouverture")
    counter_through_factor: float = Field(default=2.0, alias="facteur_profondeur_contre")
    wing_shares: EngineConfigActionsCreationWing = Field(default_factory=EngineConfigActionsCreationWing, alias="parts_aile")
    crossing_sensitivity: float = Field(default=0.03, alias="sensibilite_centre")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigActionsDurations:
    pass_: float = Field(default=3.2, alias="passe")
    progression: float = Field(default=4.2, alias="progression")
    long_ball: float = Field(default=4.0, alias="jeu_long")
    chance: float = Field(default=3.0, alias="occasion")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigActionsDeadTime:
    mean: float = Field(default=7.6, alias="moyen", gt=0)
    gamma_shape: float = Field(default=2.0, alias="forme_gamma", gt=0)
    after_goal: float = Field(default=45.0, alias="apres_but")
    after_shot: float = Field(default=14.0, alias="apres_tir")
    corner: float = Field(default=25.0, alias="corner")
    free_kick: float = Field(default=30.0, alias="coup_franc")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigActions:
    """What a side tries at each step of a possession, and how long its actions and the dead ball last."""
    tempo_by_zone: tuple[float, ...] = Field(default=(0.06, 0.08, 0.12, 0.20), alias="tempo_par_zone")
    counter_tempo: float = Field(default=0.92, alias="tempo_contre")
    opening_pull: float = Field(default=0.8, alias="attrait_ouverture")
    carry_share: float = Field(default=0.15, alias="part_conduites")
    # Per point of edge in keeping the ball, the logit taken off the tempo.
    patience: float = Field(default=0.08, alias="patience")
    conservation: EngineConfigActionsConservation = Field(default_factory=EngineConfigActionsConservation, alias="conservation")
    opening: EngineConfigActionsOpening = Field(default_factory=EngineConfigActionsOpening, alias="ouverture")
    long_ball: EngineConfigActionsLongBall = Field(default_factory=EngineConfigActionsLongBall, alias="jeu_long")
    long_shot: EngineConfigActionsLongShot = Field(default_factory=EngineConfigActionsLongShot, alias="tir_de_loin")
    creation: EngineConfigActionsCreation = Field(default_factory=EngineConfigActionsCreation, alias="creation")
    durations: EngineConfigActionsDurations = Field(default_factory=EngineConfigActionsDurations, alias="durees_secondes")
    dead_time: EngineConfigActionsDeadTime = Field(default_factory=EngineConfigActionsDeadTime, alias="temps_mort")


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
    dribble_xg: float = Field(default=0.14, alias="xg_base_dribble")
    through_ball_xg: float = Field(default=0.26, alias="xg_base_profondeur")
    cutback_xg: float = Field(default=0.16, alias="xg_base_retrait")
    long_shot_xg: float = Field(default=0.035, alias="xg_base_tir_de_loin")
    counter_multiplier: float = Field(alias="multiplicateur_contre")
    finishing_sensitivity: float = Field(alias="sensibilite_tireur_gardien")
    header_keeper_weights: EngineConfigChanceHeaderKeeperWeights = Field(alias="poids_gardien_sur_tete")
    # Through on goal, the keeper first has to come off his line.
    one_on_one_keeper_weights: EngineConfigChanceHeaderKeeperWeights = Field(
        default_factory=lambda: EngineConfigChanceHeaderKeeperWeights(claiming=0.6, saving=0.4), alias="poids_gardien_face_a_face")
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
    # The share of corners that end in a header; the others are cleared.
    corner_shot_share: float = Field(default=0.33, alias="part_corners_frappe")
    corner_xg: float = Field(alias="xg_base_corner")
    free_kick_xg: float = Field(alias="xg_base_coup_franc_direct")
    target_goal_share: float = Field(alias="part_cible_buts_sur_cpa")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigTurnover:
    counter_probability_by_zone: tuple[float, ...] = Field(default=(0.03, 0.06, 0.15, 0.31), alias="probabilite_contre_par_zone")
    committed_counter_bonus: float = Field(default=0.5, alias="bonus_contre_attaque_engagee")
    long_ball_counter_malus: float = Field(default=-1.0, alias="malus_contre_jeu_long")
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
    quality_sensitivity: float = Field(default=0.05, alias="sensibilite_qualite")
    progression: tuple[float, ...] = Field(default=(0.0, 0.01, 0.02, 0.04), alias="progression_par_zone")
    recovery: tuple[float, ...] = Field(default=(0.07, 0.04, 0.025, 0.015), alias="recuperation_par_zone")
    loss: tuple[float, ...] = Field(default=(-0.04, -0.03, -0.02, -0.01), alias="perte_par_zone")
    dribble_share: float = Field(default=0.3, alias="part_dribbles")
    dribble_sensitivity: float = Field(default=0.08, alias="sensibilite_dribble")
    dribbled: float = Field(default=-0.02, alias="defenseur_elimine")
    key_pass: float = Field(default=0.1, alias="passe_cle")
    build_up: float = Field(default=0.03, alias="participation_occasion")
    off_target: float = Field(default=-0.03, alias="tir_non_cadre")
    blocked_share: float = Field(default=0.4, alias="part_non_cadres_contres")
    long_shot_blocked_share: float = Field(default=0.55, alias="part_non_cadres_contres_de_loin")
    block: float = Field(default=0.05, alias="contre")
    beaten: float = Field(default=-0.15, alias="defenseur_battu")
    win: float = Field(default=0.1, alias="victoire")
    clean_sheet: float = Field(default=0.25, alias="sans_encaisser")
    clean_sheet_minutes: int = Field(default=60, alias="minutes_sans_encaisser")
    expected_per_minute: float = Field(default=0.0055, alias="attendu_par_minute")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfig:
    timing: EngineConfigTiming = Field(alias="chronologie")
    actions: EngineConfigActions = Field(default_factory=EngineConfigActions, alias="actions")
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
