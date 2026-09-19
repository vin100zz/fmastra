"""Cross-domain validation, independent of files and server state."""
from collections.abc import Mapping
from dataclasses import fields, is_dataclass
from math import isclose

from .model import Config
from core.domain.date import Date


class ConfigError(ValueError):
    """A configuration cannot define a coherent simulation."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ConfigError(message)


def _walk(value: object, path: str = "config") -> None:
    if is_dataclass(value):
        names = {field.name for field in fields(value)}
        if "min" in names and "max" in names:
            require(value.min <= value.max, f"{path}: inverted bounds")
        if "min_age" in names and "max_age" in names:
            require(value.min_age <= value.max_age, f"{path}: inverted ages")
        for field in fields(value):
            child = getattr(value, field.name)
            if isinstance(child, (int, float)) and not isinstance(child, bool):
                if "probability" in field.name or field.name.endswith("_share"):
                    require(0 <= child <= 1, f"{path}.{field.name}: expected a probability")
                if field.name.startswith("min_") and "max_" + field.name[4:] in names:
                    require(child <= getattr(value, "max_" + field.name[4:]), f"{path}: inverted bounds")
            _walk(child, f"{path}.{field.name}")
    elif isinstance(value, Mapping):
        for key, item in value.items():
            _walk(item, f"{path}.{key}")
    elif isinstance(value, tuple):
        for index, item in enumerate(value):
            _walk(item, f"{path}[{index}]")


def validate_consistency(cfg: Config) -> None:
    _walk(cfg)
    require(cfg.management.market.arrival_stability_days >= 0, "Arrival stability days must be nonnegative")
    require(cfg.management.market.minimum_quality_gain >= 0, "Recruitment quality gain must be nonnegative")
    market, profile = cfg.management.market, cfg.management.target_profile
    require(cfg.world.match_rules.players_on_pitch <= market.min_squad_depth
            and market.max_squad_depth <= cfg.world.match_rules.players_on_pitch + profile.rotation_places,
            "Squad depth must cover the starters and stay within the rotation places")
    require(0 <= market.depth_sale_weight <= 1, "Depth sale weight must be within [0, 1]")
    require(market.reputation_drop_tolerance >= 0, "Reputation drop tolerance must be nonnegative")
    require(0 <= market.forced_exit_morale <= 1, "Forced exit morale must be within [0, 1]")
    require(market.visible_talents >= 0, "Visible talents must be nonnegative")
    require(market.auction_days >= 1, "Offers must stay open at least one day")
    require(market.club_outgrown_margin >= 0, "Club outgrown margin must be nonnegative")
    require(0 <= market.ambition_base <= 1 and market.ambition_ego_weight >= 0,
            "Ambition base must be within [0, 1] and its ego weight nonnegative")
    require(market.frustration_span > 0, "Frustration span must be positive")
    require(0 <= market.leave_threshold <= 1, "Leave threshold must be within [0, 1]")
    require(0 <= market.frustration_morale_weight <= 1, "Frustration morale weight must be within [0, 1]")
    europe = cfg.world.europe
    require((europe.club_count, europe.league_rounds, europe.pot_count,
             europe.direct_places, europe.playoff_places) == (36, 8, 4, 8, 16), "Unsupported European format")
    require(europe.reputation_exponent > 0 and europe.draw_attempts > 0, "Invalid European draw settings")
    require(0 <= europe.league_weekday <= 6 and 0 <= europe.cup_weekday <= 6, "Invalid calendar weekday")
    require(europe.min_rest_days == 3, "The weekly calendar requires three days between matches")
    require(len(europe.dates) == 17 and len(europe.domestic_dates) == 6, "Invalid cup calendar size")
    require(europe.tiebreakers == ("points", "difference_buts", "buts_pour"), "Invalid European standings rules")
    for month, day in europe.dates + europe.domestic_dates:
        Date(2025, month, day)
    date = cfg.world.start_date
    Date(date.year, date.month, date.day)
    positions = set(cfg.attributes.overall)
    attribute_names = {name for field in fields(cfg.attributes.groups) for name in getattr(cfg.attributes.groups, field.name)}
    weights = list(cfg.attributes.overall.values())
    weights.extend(getattr(cfg.attributes.composites, field.name) for field in fields(cfg.attributes.composites))
    for mapping in weights:
        require(set(mapping) <= attribute_names, "Unknown attribute in a weighting")
        require(all(value >= 0 for value in mapping.values()), "Negative composite weight")
        require(isclose(sum(mapping.values()), 1, abs_tol=1e-6), "Composite weights must sum to 1")
    for mapping in (cfg.involvement.attack, cfg.involvement.defense, cfg.involvement.lateral):
        require(set(mapping) == positions, "Involvement positions disagree with overall ratings")
        for vector in mapping.values():
            require(all(value >= 0 for value in vector), "Negative involvement")
    for position in positions:
        require(len(cfg.involvement.attack[position]) == len(cfg.involvement.zones), "Attack dimensions")
        require(len(cfg.involvement.defense[position]) == len(cfg.involvement.zones), "Defense dimensions")
        require(len(cfg.involvement.lateral[position]) == len(cfg.involvement.lanes), "Lane dimensions")
        require(isclose(sum(cfg.involvement.lateral[position]), 1, abs_tol=1e-6), "Lane weights must sum to 1")
    for name, formation in cfg.formations.formations.items():
        require(len(formation) == cfg.world.match_rules.players_on_pitch, f"{name}: wrong lineup size")
        require(set(formation) <= positions and formation.count("GB") == 1, f"{name}: invalid positions")
    guard = cfg.management.guardrails
    require(cfg.import_settings.squad_selection.max_players == guard.max_squad, "Import and squad caps disagree")
    require(cfg.import_settings.squad_selection.reserved_goalkeepers == guard.min_goalkeepers, "Goalkeeper minima disagree")
    require(cfg.world.match_rules.players_on_pitch <= guard.min_squad <= guard.max_squad, "Invalid squad bounds")
    for curve in (cfg.demography.progression.age_curve, cfg.demography.progression.decline.age_curve,
                  cfg.management.valuation.age_curve):
        for left, right in zip(curve, curve[1:]):
            require(right.min_age == left.max_age + 1, "Age curve has a gap or overlap")
    levels = cfg.management.valuation.level_curve
    require(len(levels) != 1 and all(row.value > 0 for row in levels)
            and all(left.level < right.level and left.value <= right.value for left, right in zip(levels, levels[1:])),
            "Valuation level curve needs two or more points, increasing in level and never decreasing in value")
    require(isclose(sum(cfg.demography.position_targets.values()), 1, abs_tol=1e-6), "Position targets must sum to 1")
    require(isclose(sum(item.share for item in cfg.states.injuries.severities), 1, abs_tol=1e-6), "Injury shares must sum to 1")
    require(cfg.engine.set_pieces.corner_probability + cfg.engine.set_pieces.free_kick_probability <= 1, "Set-piece probabilities overlap")
    require(cfg.engine.chance.probability_min > 0 and cfg.engine.chance.probability_max < 1, "Logit bounds must be open")
    require(cfg.engine.density.reference > 0 and cfg.engine.timing.possession_mean > 0, "Invalid engine scale")
    require(cfg.engine.timing.possession_gamma_shape > 0, "Gamma shape must be positive")
    require(cfg.world.season.days_between_rounds > 0, "Round spacing must be positive")
    require(len({league.division_id for league in cfg.world.competitions}) == len(cfg.world.competitions), "Duplicate competitions")
    movement = cfg.world.promotion_relegation
    require(movement.club_count > 0 and movement.reputation_exponent > 0, "Invalid promotion rules")
    nations = {league.nation for league in cfg.world.competitions}
    require(len(movement.reserves) == len(nations)
            and {pool.nation for pool in movement.reserves} == nations, "Each pyramid needs one reserve")
    reserve_ids = [did for pool in movement.reserves for did in pool.division_ids]
    require(all(pool.division_ids for pool in movement.reserves), "Empty reserve division list")
    require(len(set(reserve_ids)) == len(reserve_ids), "Duplicate reserve divisions")
    require(not set(reserve_ids) & {league.division_id for league in cfg.world.competitions}, "A reserve cannot be simulated")
    for nation in nations:
        levels = sorted(league.level for league in cfg.world.competitions if league.nation == nation)
        require(levels == list(range(1, len(levels) + 1)), "League levels must be consecutive from one")
    for league in cfg.world.competitions:
        require(league.club_count >= 2 * movement.club_count, "A league needs distinct promotion and relegation places")
    require(not cfg.states.suspensions.reset_after_threshold, "Cumulative yellow counters cannot reset at each threshold")
    require(cfg.engine.timing.match_seconds == 2 * cfg.world.match_rules.half_seconds, "Match durations disagree")
    require(cfg.demography.potential_estimate.convergence_age > cfg.demography.potential_estimate.start_age, "Invalid estimate convergence")
    require(cfg.demography.progression.monthly_reference_minutes > 0, "Playing time reference must be positive")
    require(cfg.demography.cohort.max_class_candidates > 0, "Cohort sampling needs candidates")
    require(cfg.management.market.weekly_review_days > 0 and cfg.management.budgets.weeks_per_year > 0, "Invalid management period")
    require(cfg.management.budgets.wages.weekly_minimum > 0 and cfg.demography.academies.base_weekly_wage > 0, "Wage minima must be positive")
    require(cfg.management.market.max_negotiations > 0 and cfg.management.market.shortlist_size > 0, "Invalid negotiation capacity")
    require(0 < cfg.management.market.counteroffer_ratio <= 1, "Counteroffer ratio must be in (0,1]")
    require(cfg.states.substitutions.evaluation_interval > 0 and cfg.engine.rating_refresh.fitness_interval > 0, "Refresh intervals must be positive")
    substitutions = cfg.states.substitutions
    require(substitutions.rotation_min_gain > 0 and substitutions.potential_margin_reference > 0,
            "Rotation gain and potential reference must be positive")
    require(substitutions.playing_time_weight >= 0 and substitutions.development_weight >= 0
            and substitutions.replacement_gap >= 0, "Rotation weights and quality gap must be nonnegative")
    require(0 < substitutions.min_useful_minutes < cfg.engine.timing.match_seconds / 60
            and substitutions.rotation_interval > 0 and substitutions.rotations_per_window >= 1,
            "Rotation timing and batch size must be positive")
    require(0 < substitutions.rotation_min_affinity <= 1 and substitutions.defensive_goal_margin > 0,
            "Invalid rotation affinity or comfortable lead")
    require(0 <= substitutions.trailing_rotation_factor <= substitutions.close_game_rotation_factor <= 1
            and substitutions.comfortable_gap_factor >= 1, "Invalid rotation context factors")
    buckets = cfg.demography.cohort.level_buckets
    require(bool(buckets) and buckets[0][0] == cfg.attributes.bounds.min and buckets[-1][1] == cfg.attributes.bounds.max, "Level classes must cover attribute bounds")
    require(all(len(pair) == 2 and pair[0] < pair[1] for pair in buckets), "Invalid level classes")
    require(all(left[1] == right[0] for left, right in zip(buckets, buckets[1:])), "Level classes overlap or leave gaps")
    require(cfg.world.season.tiebreakers == ("points", "difference_buts", "buts_pour", "confrontation_directe"), "Unsupported v1 tiebreaking order")
    require(cfg.import_settings.source_format.date_format in ("%d.%m.%Y", "%Y-%m-%d"), "Unsupported import date format")
    require(cfg.import_settings.squad_selection.criterion in ("note_globale_synthetisee", "note_globale_attributs"), "Unsupported squad selection")
    policies = ((cfg.import_settings.source_format.wage_unit, "euros_par_semaine"),
                (cfg.import_settings.squad_selection.tiebreaker, "identifiant_croissant"),
                (cfg.import_settings.squad_selection.excluded_players, "non_importes"),
                (cfg.import_settings.squad_selection.free_agents, "tous_conserves"),
                (cfg.demography.progression.evaluation, "mensuelle"),
                (cfg.demography.potential_estimate.refresh, "annuelle"),
                (cfg.management.budgets.accounting.frequency, "quotidienne_prorata_annee_de_jeu"),
                (cfg.states.suspensions.counting_policy, "matches_du_club_dans_competition_concernee"),
                (cfg.states.suspensions.same_match_policy, "maximum"))
    for actual, expected in policies: require(actual == expected, f"Unsupported v1 policy: {actual}; expected {expected}")
    require(cfg.management.budgets.accounting.annual_inflation == 0, "v1 accounting uses constant euros")
    require(cfg.demography.progression.potential_cap and not cfg.demography.progression.decline_cap, "Unsupported progression cap policy")
