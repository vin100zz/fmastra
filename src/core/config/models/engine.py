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
class EngineConfigActions:
    """What a side tries at each step of a possession, and how long its actions last."""
    tempo_by_zone: tuple[float, ...] = Field(default=(0.06, 0.08, 0.12, 0.20), alias="tempo_par_zone")
    counter_tempo: float = Field(default=0.92, alias="tempo_contre")
    opening_pull: float = Field(default=0.8, alias="attrait_ouverture")
    carry_share: float = Field(default=0.15, alias="part_conduites")
    # A carrier dribbles rather than passes at `dribble_share`, more the more his technique exceeds his passing.
    dribble_share: float = Field(default=0.3, alias="part_dribbles")
    dribble_sensitivity: float = Field(default=0.08, alias="sensibilite_dribble")
    # Per point of edge in keeping the ball, the logit taken off the tempo.
    patience: float = Field(default=0.08, alias="patience")
    conservation: EngineConfigActionsConservation = Field(default_factory=EngineConfigActionsConservation, alias="conservation")
    opening: EngineConfigActionsOpening = Field(default_factory=EngineConfigActionsOpening, alias="ouverture")
    long_ball: EngineConfigActionsLongBall = Field(default_factory=EngineConfigActionsLongBall, alias="jeu_long")
    long_shot: EngineConfigActionsLongShot = Field(default_factory=EngineConfigActionsLongShot, alias="tir_de_loin")
    creation: EngineConfigActionsCreation = Field(default_factory=EngineConfigActionsCreation, alias="creation")
    durations: EngineConfigActionsDurations = Field(default_factory=EngineConfigActionsDurations, alias="durees_secondes")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppagesByLane:
    wing: float = Field(alias="aile")
    centre: float = Field(alias="axe")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppagesFoulShares:
    """The share of each failed action that is a foul, for a defence of neutral propensity (see `possession._Play.failed`)."""
    pass_: float = Field(default=0.06, alias="passe")
    carry: float = Field(default=0.30, alias="conduite")
    centre_chance: float = Field(default=0.06, alias="occasion_axe")
    box_dribble: float = Field(default=0.35, alias="dribble_zone_verite")
    cross: float = Field(default=0.03, alias="centre")
    aerial: float = Field(default=0.10, alias="duel_aerien")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppagesFoul:
    shares: EngineConfigStoppagesFoulShares = Field(default_factory=EngineConfigStoppagesFoulShares, alias="part_par_action")
    attacker_aerial_share: float = Field(default=0.5, alias="part_attaquant_duel_aerien")
    # Where in the last zone an action happens inside the box.
    box_share: EngineConfigStoppagesByLane = Field(default_factory=lambda: EngineConfigStoppagesByLane(wing=0.25, centre=0.55),
                                                   alias="part_surface")
    box_factor: float = Field(default=0.13, alias="facteur_surface")
    tactical: float = Field(default=0.15, alias="faute_tactique")
    # How much more a defence fouls per point of the attacker's edge where the action fails.
    edge_sensitivity: float = Field(default=0.03, alias="sensibilite_ecart")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppagesIntoBox:
    """What becomes of a ball played into the box from a dead ball; what the three shares leave is played short."""
    header: float = Field(alias="tete")
    cleared: float = Field(alias="degage")
    claimed: float = Field(alias="capte")
    short: float = Field(default=0.0, alias="joue_court")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppagesFreeKick:
    in_range_share: float = Field(default=0.25, alias="part_a_portee_milieu_haut")
    direct_share: float = Field(default=0.60, alias="part_directe")
    wing_crossed_share: float = Field(default=0.35, alias="part_centree_aile_milieu_haut")
    crossed: EngineConfigStoppagesIntoBox = Field(
        default_factory=lambda: EngineConfigStoppagesIntoBox(header=0.27, cleared=0.58, claimed=0.15), alias="issues_centre")
    cleared_corner_share: float = Field(default=0.20, alias="part_degagements_en_corner")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppagesFailedCross:
    corner: float = Field(default=0.16, alias="corner")
    goal_kick: float = Field(default=0.12, alias="six_metres")
    throw_in: float = Field(default=0.05, alias="touche")
    claimed: float = Field(default=0.15, alias="capte")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppagesOut:
    """The share of the failed actions without a foul that end with the ball out of play."""
    conservation: EngineConfigStoppagesByLane = Field(default_factory=lambda: EngineConfigStoppagesByLane(wing=0.35, centre=0.05),
                                                      alias="conservation")
    pass_: EngineConfigStoppagesByLane = Field(default_factory=lambda: EngineConfigStoppagesByLane(wing=0.30, centre=0.05),
                                               alias="passe")
    carry: EngineConfigStoppagesByLane = Field(default_factory=lambda: EngineConfigStoppagesByLane(wing=0.40, centre=0.05),
                                               alias="conduite")
    long_ball: float = Field(default=0.25, alias="jeu_long")
    cross: EngineConfigStoppagesFailedCross = Field(default_factory=EngineConfigStoppagesFailedCross, alias="centre")
    centre_chance_corner: float = Field(default=0.06, alias="occasion_axe_corner")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppagesOffside:
    through_ball: float = Field(default=0.30, alias="profondeur")
    long_ball: float = Field(default=0.13, alias="jeu_long_zone_verite")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppagesSave:
    held: float = Field(default=0.45, alias="capte")
    corner: float = Field(default=0.30, alias="corner")
    parried: float = Field(default=0.25, alias="repousse")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppagesAfterShot:
    # The share of the strikes wide of the target that a defender blocked, more for one from distance.
    blocked_share: float = Field(default=0.40, alias="part_contres")
    long_shot_blocked_share: float = Field(default=0.55, alias="part_contres_de_loin")
    blocked_corner: float = Field(default=0.40, alias="contre_en_corner")
    second_ball: float = Field(default=0.40, alias="second_ballon_attaque")
    save: EngineConfigStoppagesSave = Field(default_factory=EngineConfigStoppagesSave, alias="arret")
    # The share of the shots wide of the target that hit the woodwork.
    post_share: float = Field(default=0.05, alias="part_poteaux")
    post_in_play: float = Field(default=0.5, alias="poteau_en_jeu")
    rebound: float = Field(default=0.40, alias="rebond_attaque")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppagesDeadTime:
    """The mean dead time of each stoppage, in seconds, drawn from a Gamma law of shape `gamma_shape`; a ball won in play
    goes on at once."""
    gamma_shape: float = Field(default=2.0, alias="forme_gamma", gt=0)
    keeper: float = Field(default=8.5, alias="gardien")
    throw_in: float = Field(default=17.0, alias="touche")
    offside: float = Field(default=23.0, alias="hors_jeu")
    short_free_kick: float = Field(default=25.0, alias="coup_franc_court")
    goal_kick: float = Field(default=30.0, alias="six_metres")
    corner: float = Field(default=34.0, alias="corner")
    after_goal: float = Field(default=45.0, alias="apres_but")
    free_kick: float = Field(default=53.0, alias="coup_franc")
    penalty: float = Field(default=90.0, alias="penalty")
    card: float = Field(default=30.0, alias="carton")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigStoppages:
    """How a failed action ends (a foul, the ball out, an offside, or lost in play), what follows a shot, the set pieces
    played into the box, and the dead time of each stoppage."""
    foul: EngineConfigStoppagesFoul = Field(default_factory=EngineConfigStoppagesFoul, alias="faute")
    free_kick: EngineConfigStoppagesFreeKick = Field(default_factory=EngineConfigStoppagesFreeKick, alias="coup_franc")
    out: EngineConfigStoppagesOut = Field(default_factory=EngineConfigStoppagesOut, alias="sortie")
    offside: EngineConfigStoppagesOffside = Field(default_factory=EngineConfigStoppagesOffside, alias="hors_jeu")
    after_shot: EngineConfigStoppagesAfterShot = Field(default_factory=EngineConfigStoppagesAfterShot, alias="apres_tir")
    corner: EngineConfigStoppagesIntoBox = Field(
        default_factory=lambda: EngineConfigStoppagesIntoBox(header=0.33, cleared=0.47, claimed=0.12, short=0.08), alias="corner")
    # Per point of the keeper's claiming above `claiming_reference`, the logit added to the share of balls he catches.
    claiming_sensitivity: float = Field(default=0.02, alias="sensibilite_sorties")
    claiming_reference: float = Field(default=70.0, alias="reference_sorties")
    dead_time: EngineConfigStoppagesDeadTime = Field(default_factory=EngineConfigStoppagesDeadTime, alias="temps_mort")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigPenalty:
    """A penalty, in the match or in a shoot-out, is scored at `base` between equals, plus `sensitivity` per point of the
    taker's mean of finishing and composure above the keeper's reflexes, within [`min`, `max`]."""
    base: float = Field(default=0.75, alias="reussite_base")
    sensitivity: float = Field(default=0.003, alias="sensibilite")
    min: float = Field(default=0.50, alias="min")
    max: float = Field(default=0.95, alias="max")
    off_target_share: float = Field(default=0.30, alias="part_rates_hors_cadre")


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
    rebound_xg: float = Field(default=0.30, alias="xg_base_rebond")
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
    # A header from a corner or a free kick played into the box, and a free kick struck at goal.
    corner_xg: float = Field(alias="xg_base_corner")
    free_kick_xg: float = Field(alias="xg_base_coup_franc_direct")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigTurnover:
    counter_probability_by_zone: tuple[float, ...] = Field(default=(0.03, 0.06, 0.15, 0.31), alias="probabilite_contre_par_zone")
    committed_counter_bonus: float = Field(default=0.5, alias="bonus_contre_attaque_engagee")
    long_ball_counter_malus: float = Field(default=-1.0, alias="malus_contre_jeu_long")
    keeper_counter_malus: float = Field(default=-0.5, alias="malus_contre_gardien")
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
class EngineConfigCardOdds:
    yellow: float = Field(alias="jaune")
    red: float = Field(alias="rouge")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfigCards:
    """The cards a foul earns: an ordinary one, one that stops a counter, one that gives away a penalty."""
    foul: EngineConfigCardOdds = Field(default_factory=lambda: EngineConfigCardOdds(yellow=0.16, red=0.0012), alias="par_faute")
    tactical: EngineConfigCardOdds = Field(default_factory=lambda: EngineConfigCardOdds(yellow=0.55, red=0.015), alias="faute_tactique")
    penalty: EngineConfigCardOdds = Field(default_factory=lambda: EngineConfigCardOdds(yellow=0.25, red=0.08), alias="penalty")
    booked_caution_multiplier: float = Field(alias="booked_caution_multiplier")
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
    dribbled: float = Field(default=-0.02, alias="defenseur_elimine")
    key_pass: float = Field(default=0.1, alias="passe_cle")
    build_up: float = Field(default=0.03, alias="participation_occasion")
    off_target: float = Field(default=-0.03, alias="tir_non_cadre")
    block: float = Field(default=0.05, alias="contre")
    beaten: float = Field(default=-0.15, alias="defenseur_battu")
    win: float = Field(default=0.1, alias="victoire")
    clean_sheet: float = Field(default=0.25, alias="sans_encaisser")
    clean_sheet_minutes: int = Field(default=60, alias="minutes_sans_encaisser")
    expected_per_minute: float = Field(default=0.0055, alias="attendu_par_minute")
    foul: float = Field(default=-0.02, alias="faute")
    offside: float = Field(default=0.0, alias="hors_jeu")
    penalty_conceded: float = Field(default=-0.30, alias="penalty_concede")
    penalty_won: float = Field(default=0.10, alias="penalty_obtenu")
    penalty_missed: float = Field(default=-0.30, alias="penalty_manque")
    penalty_saved: float = Field(default=0.30, alias="penalty_arrete")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class EngineConfig:
    timing: EngineConfigTiming = Field(alias="chronologie")
    actions: EngineConfigActions = Field(default_factory=EngineConfigActions, alias="actions")
    stoppages: EngineConfigStoppages = Field(default_factory=EngineConfigStoppages, alias="arrets")
    penalty: EngineConfigPenalty = Field(default_factory=EngineConfigPenalty, alias="penalty")
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
