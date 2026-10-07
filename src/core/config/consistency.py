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
    require(0 < market.surplus_price_factor <= market.backup_price_factor <= market.rotation_price_factor <= market.starter_price_factor,
            "Asking price factors must be positive and rise with the squad status")
    require(0 < market.regular_minutes_share <= 1 and market.minutes_confidence_matches >= 1 and market.prospect_margin > 0,
            "Regulars' minutes share must be within (0, 1], with a positive confidence and prospect margin")
    require(market.negotiation_rounds >= 1 and market.negotiation_cooldown_days >= 0,
            "Talks need at least one round and a nonnegative cooldown")
    require(1 <= market.min_reply_days <= market.max_reply_days, "Reply delays must be at least one day and ordered")
    require(market.sale_drop_tolerance >= market.reputation_drop_tolerance,
            "A player put up for sale cannot be stricter about a smaller club than any other player")
    require(market.buyer_price_multiplier > 0 and market.offer_cooldown_days >= 1 and market.max_offers_per_proposal >= 1,
            "Offering a player needs a positive price multiplier, a cooldown of a day or more and at least one offer")
    offers = market.offers
    require(offers.need_premium >= 0 and offers.full_need_gain > 0 and 0 <= offers.risk_weight < 2 and offers.noise >= 0,
            "A buyer's price limit needs a nonnegative need premium and noise, a positive full gain and a risk weight within [0, 2)")
    require(0 <= offers.opening_spread and market.counteroffer_ratio + offers.opening_spread / 2 <= 1
            and market.counteroffer_ratio - offers.opening_spread / 2 > 0, "A buyer must open within (0, 1] of its price limit")
    require(0 <= offers.min_raises <= offers.max_raises and offers.outbid_step >= 0 and 0 <= offers.seller_tolerance < 1,
            "Raises must be ordered, the outbidding step nonnegative and the seller's tolerance within [0, 1)")
    require(0 <= offers.untouchable_morale_loss <= 1, "The morale loss of a player held back must be within [0, 1]")
    wages = cfg.management.contracts
    require(wages.greed_source_low < wages.greed_source_reference < wages.greed_source_high,
            "Appetite for money source notes must be increasing")
    require(wages.greed_premium >= 0 and wages.raise_per_point >= 0 and wages.max_raise >= 0 and wages.cut_per_point >= 0
            and 0 <= 1.5 * wages.max_cut < 1, "Wage demand steps must be nonnegative and a cut must leave a wage")
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
    require(cfg.engine.chance.delivery_sensitivity >= 0, "Delivery sensitivity must be nonnegative")
    ratings = cfg.engine.player_ratings
    require(all(len(table) == len(cfg.involvement.zones) for table in (ratings.progression, ratings.recovery, ratings.loss)),
            "Rating tables need one value per zone")
    require(0 < ratings.dribble_share < 1 and 0 <= ratings.blocked_share <= 1, "Rating shares must be probabilities")
    require(ratings.quality_sensitivity >= 0 and ratings.clean_sheet_minutes >= 0, "Rating attribution scales must be nonnegative")
    injuries, contracts, cards = cfg.states.injuries, cfg.management.contracts, cfg.engine.cards
    for label, notes in (("Fragility", (injuries.fragility_source_low, injuries.fragility_source_reference, injuries.fragility_source_high)),
                         ("Ego", (contracts.ego_source_low, contracts.ego_source_reference, contracts.ego_source_high)),
                         ("Foul propensity", (cards.aggression_source_low, cards.aggression_source_reference, cards.aggression_source_high))):
        require(notes[0] < notes[1] < notes[2], f"{label} source notes must increase from low to high")
    require(0 < cards.aggression_min <= 1 <= cards.aggression_max, "Foul propensity must be positive and bracket the neutral factor 1")
    require(cards.aggression_weight >= 0, "Foul propensity exponent must be nonnegative")
    require(cfg.engine.density.reference > 0 and cfg.engine.timing.possession_mean > 0, "Invalid engine scale")
    require(cfg.engine.timing.possession_gamma_shape > 0, "Gamma shape must be positive")
    require(cfg.world.season.days_between_rounds > 0, "Round spacing must be positive")
    require(len({league.division_id for league in cfg.world.competitions}) == len(cfg.world.competitions), "Duplicate competitions")
    movement = cfg.world.promotion_relegation
    require(movement.club_count > 0 and movement.reputation_exponent > 0, "Invalid promotion rules")
    reputation = cfg.world.reputation
    require(0 < reputation.smoothing <= 1, "Reputation smoothing must be within (0, 1]")
    require(0 <= reputation.honours.decay < 1, "Honours decay must be within [0, 1)")
    require(min(reputation.division_gain, reputation.rank_spread, reputation.max_rise, reputation.ceiling_margin) >= 0,
            "Reputation gains, spread, rise and ceiling margin must be nonnegative")
    require(reputation.ceiling_min_level >= 1, "Reputation ceilings start at level 1 or below")
    require(0 <= reputation.bounds.min < reputation.bounds.max <= cfg.attributes.bounds.max,
            "Reputation bounds must lie within the attribute scale")
    european_codes = {"C1", "C3", "C4"}
    require(set(reputation.european_qualification) <= european_codes and set(reputation.honours.european_cup) <= european_codes,
            "Unknown European competition in the reputation rules")
    require(min((*reputation.european_qualification.values(), *reputation.honours.european_cup.values(),
                 *reputation.honours.league_by_level, reputation.honours.national_cup)) >= 0,
            "Reputation bonuses must be nonnegative")
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
    growth = cfg.demography.progression
    require(growth.minutes_exponent > 0 and 0 <= growth.training_floor.lowest <= growth.training_floor.highest <= 1,
            "Invalid playing factor curve")
    require(0 <= growth.reserve.factor <= 1 and growth.reserve.fade_span > 0, "Invalid reserve rules")
    require(0 <= cfg.management.market.loans.weekly_probability <= 1 and cfg.management.market.loans.max_borrowed >= 0, "Invalid loan rules")
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
    generation, cohort = cfg.demography.generation, cfg.demography.cohort
    require(generation.min_age <= generation.max_age and len(generation.age_weights) == generation.max_age - generation.min_age + 1
            and min(generation.age_weights) >= 0 and sum(generation.age_weights) > 0, "Generation needs one nonnegative weight per age")
    require(0 <= cohort.home_club_probability <= 1 and 0 <= cohort.unsorted_share <= 1, "Cohort placement shares must be probabilities")
    require(cohort.sorting_intensity >= 0 and cohort.sorting_reputation_weight >= 0, "Cohort sorting weights must be nonnegative")
    require(0 < generation.elite_nation_exponent <= 1 and generation.nation_floor >= 0 and generation.min_identities >= 1,
            "Invalid nation flattening, floor or name minimum")
    require(cfg.attributes.bounds.min <= generation.elite_potential <= cfg.attributes.bounds.max, "Elite potential must lie within the attribute scale")
    aptitudes = generation.position_ratings
    require(set(aptitudes.typical) == positions
            and all(set(row) <= positions - {position} and all(1 <= value <= 20 for value in row.values())
                    for position, row in aptitudes.typical.items()),
            "Typical position ratings need a row per position, rating other positions out of 20")
    sides = (set(aptitudes.left_positions), set(aptitudes.right_positions))
    require(sides[0] | sides[1] <= positions and not sides[0] & sides[1], "Sided positions must be known and on one side only")
    require(min(aptitudes.versatility_noise, aptitudes.position_noise, aptitudes.far_side_penalty) >= 0
            and 1 < aptitudes.min_rating < 20, "Invalid position rating noise, far side penalty or minimum")
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
