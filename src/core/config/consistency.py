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
    require(isclose(sum(cfg.demography.position_targets.values()), 1, abs_tol=1e-6), "Position targets must sum to 1")
    require(isclose(sum(item.share for item in cfg.states.injuries.severities), 1, abs_tol=1e-6), "Injury shares must sum to 1")
    require(cfg.engine.set_pieces.corner_probability + cfg.engine.set_pieces.free_kick_probability <= 1, "Set-piece probabilities overlap")
    require(cfg.engine.chance.probability_min > 0 and cfg.engine.chance.probability_max < 1, "Logit bounds must be open")
    require(cfg.engine.density.reference > 0 and cfg.engine.timing.possession_mean > 0, "Invalid engine scale")
    require(cfg.engine.timing.possession_gamma_shape > 0, "Gamma shape must be positive")
    require(cfg.world.season.days_between_rounds > 0, "Round spacing must be positive")
    require(len({league.division_id for league in cfg.world.competitions}) == len(cfg.world.competitions), "Duplicate competitions")
    for league in cfg.world.competitions:
        require(league.club_count >= 2 and league.club_count % 2 == 0, "v1 requires even-sized leagues")
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
