"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""
from __future__ import annotations

from pydantic import Field
from pydantic.dataclasses import dataclass
from core.config.types import FrozenMap, MODEL_CONFIG

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigExecution:
    match_iterations: int = Field(alias="iterations_defaut_match")
    season_iterations: int = Field(alias="iterations_defaut_saison")
    demography_seasons: int = Field(alias="saisons_demographie")
    economy_seasons: int = Field(alias="saisons_economie")
    default_seed: int = Field(alias="graine_defaut")
    world_seeds: tuple[int, ...] = Field(alias="graines_monde")
    comparison_window: int = Field(alias="fenetre_comparaison_saisons")
    protocol_version: int = Field(alias="version_protocole")
    parallelism: str = Field(alias="parallelisme")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigFixturesItem:
    id: str = Field(alias="id")
    home: int | str = Field(alias="domicile")
    away: int | str = Field(alias="exterieur")
    win: float = Field(alias="victoire")
    draw: float = Field(alias="nul")
    loss: float = Field(alias="defaite")
    tolerance: tuple[float, ...] = Field(alias="tolerance")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigDistributionScoresZeroGoalShare:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigDistributionScoresFourPlusGoalShare:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigDistributionScoresMeanGoalDifference:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigDistributionScores:
    diagnostic_mode: bool = Field(alias="score_modal_diagnostique")
    zero_goal_share: BenchmarksConfigDistributionScoresZeroGoalShare = Field(alias="part_matches_zero_but")
    four_plus_goal_share: BenchmarksConfigDistributionScoresFourPlusGoalShare = Field(alias="part_matches_quatre_buts_ou_plus")
    mean_goal_difference: BenchmarksConfigDistributionScoresMeanGoalDifference = Field(alias="ecart_buts_moyen")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigStatsMatchPossessionsPerTeam:
    min: int = Field(alias="min")
    max: int = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigStatsMatchShotsPerTeam:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigStatsMatchXgPerTeam:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigStatsMatchGoalsPerTeam:
    target: float = Field(alias="cible")
    tolerance: float = Field(alias="tolerance")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigStatsMatchPossessionPct:
    min: int = Field(alias="min")
    max: int = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigStatsMatchHomeGoalAdvantage:
    target: float = Field(alias="cible")
    tolerance: float = Field(alias="tolerance")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigStatsMatchSetPieceGoalShare:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigStatsMatchYellowsPerTeam:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigStatsMatchRedsPerTeam:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigStatsMatchLaneShares:
    target: float = Field(alias="cible")
    tolerance: float = Field(alias="tolerance")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigStatsMatch:
    possessions_per_team: BenchmarksConfigStatsMatchPossessionsPerTeam = Field(alias="possessions_par_equipe")
    shots_per_team: BenchmarksConfigStatsMatchShotsPerTeam = Field(alias="tirs_par_equipe")
    xg_per_team: BenchmarksConfigStatsMatchXgPerTeam = Field(alias="xg_par_equipe")
    goals_per_team: BenchmarksConfigStatsMatchGoalsPerTeam = Field(alias="buts_par_equipe")
    possession_pct: BenchmarksConfigStatsMatchPossessionPct = Field(alias="possession_pct")
    home_goal_advantage: BenchmarksConfigStatsMatchHomeGoalAdvantage = Field(alias="avantage_domicile_buts")
    set_piece_goal_share: BenchmarksConfigStatsMatchSetPieceGoalShare = Field(alias="part_buts_coups_arretes")
    yellows_per_team: BenchmarksConfigStatsMatchYellowsPerTeam = Field(alias="jaunes_par_equipe")
    reds_per_team: BenchmarksConfigStatsMatchRedsPerTeam = Field(alias="rouges_par_equipe")
    lane_shares: BenchmarksConfigStatsMatchLaneShares = Field(alias="repartition_couloirs")
    central_xg_above_wide: bool = Field(alias="xg_axe_superieur_aile")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigSeasonChampionPointsPerMatch:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigSeasonBottomPointsPerMatch:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigSeasonPointsPerMatchDeviation:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigSeasonTopScorerGoals:
    min: int = Field(alias="min")
    max: int = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigSeasonStrongestTitleShare:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigSeasonReputationRankCorrelation:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigSeason:
    champion_points_per_match: BenchmarksConfigSeasonChampionPointsPerMatch = Field(alias="points_par_match_champion")
    bottom_points_per_match: BenchmarksConfigSeasonBottomPointsPerMatch = Field(alias="points_par_match_dernier")
    points_per_match_deviation: BenchmarksConfigSeasonPointsPerMatchDeviation = Field(alias="ecart_type_points_par_match")
    top_scorer_goals: BenchmarksConfigSeasonTopScorerGoals = Field(alias="buts_meilleur_buteur")
    strongest_title_share: BenchmarksConfigSeasonStrongestTitleShare = Field(alias="titres_club_le_plus_fort_sur_100")
    reputation_rank_correlation: BenchmarksConfigSeasonReputationRankCorrelation = Field(alias="correlation_spearman_reputation_rang_inverse")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigFormations:
    draw_weight: float = Field(alias="poids_nul")
    max_balance_score: float = Field(alias="score_equilibre_max_contre_le_champ")
    min_balance_score: float = Field(alias="score_equilibre_min_contre_le_champ")
    correction_parameter: str = Field(alias="levier_correction")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigOracle:
    max_rate_difference: float = Field(alias="ecart_max_taux")
    blocking: bool = Field(alias="bloquant")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigDemographyMeanAge:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigDemography:
    warmup_seasons: int = Field(alias="saisons_stabilisation")
    population_drift: float = Field(alias="derive_effectif_total")
    position_drift: float = Field(alias="derive_parts_postes")
    nation_drift: float = Field(alias="derive_parts_nations")
    elite_drift: float = Field(alias="derive_joueurs_au_dessus_85")
    elite_absolute_tolerance: int = Field(alias="tolerance_absolue_joueurs_au_dessus_85")
    mean_age: BenchmarksConfigDemographyMeanAge = Field(alias="age_moyen_effectifs")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigEconomySummerTransfersPerClub:
    min: int = Field(alias="min")
    max: int = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigEconomyDifferentChampions:
    min: int = Field(alias="min")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigEconomyPermanentlyNegativeClubs:
    max: int = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigEconomyDormantIncomingShare:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigEconomy:
    top_three_talent_share: float = Field(alias="part_max_joueurs_80_dans_top3")
    summer_transfers_per_club: BenchmarksConfigEconomySummerTransfersPerClub = Field(alias="transferts_par_club_fenetre_ete")
    different_champions: BenchmarksConfigEconomyDifferentChampions = Field(alias="champions_differents_par_pays_sur_25")
    permanently_negative_clubs: BenchmarksConfigEconomyPermanentlyNegativeClubs = Field(alias="clubs_solde_negatif_permanent")
    dormant_incoming_share: BenchmarksConfigEconomyDormantIncomingShare = Field(alias="part_transferts_depuis_dormants")
    real_wage_drift: float = Field(alias="derive_masse_salariale_reelle_sur_horizon_max")
    negative_season_count: int = Field(alias="saisons_consecutives_solde_negatif_permanent")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigInjuriesPerClubSeason:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigInjuriesOutsideMatchShare:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigInjuriesMeanUnavailable:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigInjuriesLongPerClubSeason:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigInjuries:
    per_club_season: BenchmarksConfigInjuriesPerClubSeason = Field(alias="par_club_par_saison")
    outside_match_share: BenchmarksConfigInjuriesOutsideMatchShare = Field(alias="part_hors_match")
    mean_unavailable: BenchmarksConfigInjuriesMeanUnavailable = Field(alias="indisponibles_moyens_par_club")
    long_per_club_season: BenchmarksConfigInjuriesLongPerClubSeason = Field(alias="longues_par_club_par_saison")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfigPerformance:
    match_milliseconds: int = Field(alias="ms_par_match_possession")
    season_seconds: int = Field(alias="secondes_par_saison_complete")
    analytical_100_seasons_seconds: int = Field(alias="secondes_100_saisons_analytique")
    import_seconds: int = Field(alias="secondes_chargement_donnees")
    save_seconds: int = Field(alias="secondes_sauvegarde")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class BenchmarksConfig:
    execution: BenchmarksConfigExecution = Field(alias="execution")
    fixtures: tuple[BenchmarksConfigFixturesItem, ...] = Field(alias="affrontements_reference")
    distribution_scores: BenchmarksConfigDistributionScores = Field(alias="distribution_scores")
    stats_match: BenchmarksConfigStatsMatch = Field(alias="stats_match")
    season: BenchmarksConfigSeason = Field(alias="saison")
    formations: BenchmarksConfigFormations = Field(alias="formations")
    oracle: BenchmarksConfigOracle = Field(alias="oracle")
    demography: BenchmarksConfigDemography = Field(alias="demographie")
    economy: BenchmarksConfigEconomy = Field(alias="economie")
    injuries: BenchmarksConfigInjuries = Field(alias="blessures")
    performance: BenchmarksConfigPerformance = Field(alias="performance")
    calibration_order: tuple[str, ...] = Field(alias="ordre_calibrage")
