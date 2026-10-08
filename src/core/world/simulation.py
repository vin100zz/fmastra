"""Advance coherent game days, applying each phase before dependent decisions."""
from __future__ import annotations

from random import Random

from core.ai.selection import LineupContext, select_lineup, to_lineup
from core.ai.market import propose_transfers
from core.domain.date import Date
from core.domain.matches import Lineup, Match, MatchResult
from core.domain.world import World
from core.engine.match import PossessionEngine
from core.randomness import stream
from .application import apply
from .calendar import standings
from .contracts import expiry_events, renewal_events
from .demography import retirement_events, cohort_events
from .events import DateAdvanced, FinancePosted, BudgetRenewed, SeasonOpened
from .finances import structural_income, annual_funding_factor
from .budgets import carried_shift
from .human import is_human_club, pending_lineup_match
from .news import daily_notices, draw_notices, morale_alerts, morale_levels
from .player_states import daily_player_events, monthly_player_events, match_event
from .market import settle_offers, open_offers, ensure_minimums
from .talks import progress_talks
from .loans import return_events, run_loan_round
from .reserves import reserve_events
from .promotion import promotion_event
from .reputation import reputation_events
from .squads import complete_squads
from .cups import season_fixtures, progress_cups
from .cup_matches import cup_lineup, decide_winner
from .europe import qualify_europe, progress_europe, decide_european_winner


def market_window(world: World) -> str | None:
    today = (world.date.month, world.date.day)
    for name in ("summer", "winter"):
        window = getattr(world.config.world.market, name)
        if (window.start_month, window.start_day) <= today <= (window.end_month, window.end_day): return name
    return None


def target_date(world: World, until: str) -> Date:
    if until == "jour": return world.date.add_days(1)
    if until == "journee":
        dates = [match.date for match in (*world.matches.values(), *world.international.matches.values())
                 if match.result is None and match.date > world.date]
        opening = world.config.world.season
        # Next season's club fixtures do not exist until July. A known qualifier in
        # September must not make "next match" jump over the clubs' August restart.
        next_opening = Date(world.season + 1, opening.start_month, opening.start_day)
        return min([*dates, next_opening])
    if until == "fin_mercato":
        dates = []
        for year in (world.date.year, world.date.year + 1):
            for window in (world.config.world.market.summer, world.config.world.market.winter):
                date = Date(year, window.end_month, window.end_day)
                if date > world.date: dates.append(date)
        return min(dates)
    raise ValueError("Unknown advancement target")


def annual_review(world: World) -> None:
    cfg = world.config
    rankings, champions, tables = {}, {}, {}
    for competition in world.competitions.values():
        if competition.kind in ("cup", "europe"):
            if not any(year == world.season for year, _ in world.champions.get(competition.id, [])):
                raise ValueError(f"{competition.name}: cup is not complete")
            continue
        rows = standings(competition, [world.matches[mid] for mid in competition.match_ids], cfg)
        tables[competition.id] = rows
        champions[competition.id] = rows[0].club_id
        rankings.update({row.club_id: index + 1 for index, row in enumerate(rows)})
    qualify_europe(world, world.date.year, tables)
    movements = promotion_event(world, tables)
    incoming = {move.club_id for move in movements.movements if move.source_id is None}
    apply(world, movements)
    # After the movements and European places, before the budgets: income follows the revised reputation.
    for event in reputation_events(world, tables, champions): apply(world, event)
    for event in retirement_events(world): apply(world, event)
    for club in world.clubs.values():
        rank = rankings.get(club.id)
        base_income = structural_income(club, cfg, rank)
        funding_factor = annual_funding_factor(club, cfg, base_income)
        income = round(base_income * funding_factor)
        rules = cfg.management.budgets
        # Honor existing wages and reserve the minimum intake for newly active clubs.
        minimum_wages = club.wage_bill
        if club.id in incoming:
            guard = cfg.management.guardrails
            missing = max(0, guard.min_squad - len(club.player_ids),
                          guard.min_goalkeepers - sum(world.players[pid].position == "GB" for pid in club.player_ids))
            minimum_wages += missing * cfg.demography.academies.base_weekly_wage
        cap = round(income * rules.wage_income_share / rules.weeks_per_year)
        budget = max(0, round(income * rules.transfer_income_share + club.balance * rules.transfer_balance_share))
        # The share the club chose between its two budgets is paid again, as far as the new ones allow.
        shift = carried_shift(club.wage_shift, cap, budget, minimum_wages, rules.weeks_per_year)
        apply(world, BudgetRenewed(club.id, income, max(minimum_wages, cap + shift), budget - shift * rules.weeks_per_year, rank,
                                   funding_factor, shift))
    drawn = world.next_id
    matches = season_fixtures(world, world.date.year)
    apply(world, SeasonOpened(world.date.year, matches, champions))
    draw_notices(world, drawn)
    complete_squads(world, list(incoming))
    for event in cohort_events(world): apply(world, event)
    ensure_minimums(world)


def advance_day(world: World, auto: bool = False) -> bool:
    """No I/O, no clock reads; callers persist after this coherent boundary.

    Returns False if the day stopped before finishing: awaiting the human club's lineup (never
    when `auto` is set: Auto mode falls back to an automatic lineup), or its match being played live."""
    if world.live_match is not None:
        return False
    if world.pending_match_day is None:
        open_day(world)
        if pending_lineup_match(world) is not None and not auto:
            world.pending_match_day = world.date
            return False
    elif pending_lineup_match(world) is not None and not auto:
        return False  # resumed without a lineup submitted meanwhile: keep waiting instead of auto-picking one
    simulate_matches(world)
    close_day(world)
    return True


def open_day(world: World) -> None:
    """Everything a day does before its matches."""
    cfg = world.config
    review = cfg.world.key_dates.population_review
    from .international import prepare_international_day
    apply(world, DateAdvanced(world.date.add_days(1)))
    returns = return_events(world)
    for event in returns: apply(world, event)
    for event in expiry_events(world): apply(world, event)
    for event in daily_player_events(world): apply(world, event)
    prepare_international_day(world)
    if world.date.day == 1:
        for event in monthly_player_events(world): apply(world, event)
    if (world.date.month, world.date.day) == (review.month, review.day) and world.last_annual_review < world.date.year:
        annual_review(world)
    # A club that counted on borrowed players may be short once they are gone.
    if returns: ensure_minimums(world)
    weekly = world.date.ordinal() % cfg.management.market.weekly_review_days == 0
    if weekly:
        morale = morale_levels(world)
        for event in renewal_events(world): apply(world, event)
        morale_alerts(world, morale)
        for event in reserve_events(world): apply(world, event)
    progress_talks(world)
    open_market = market_window(world) is not None
    if weekly: run_loan_round(world)
    for _ in range(cfg.world.market.rounds_per_day):
        rejected = settle_offers(world, open_market)
        open_offers(world, open_market, rejected)
    daily_notices(world)


def close_day(world: World) -> None:
    """Everything a day does once all its club matches have a result."""
    cfg = world.config
    review = cfg.world.key_dates.population_review
    from .international import play_international_day
    drawn = world.next_id
    progress_cups(world)
    progress_europe(world)
    draw_notices(world, drawn)
    play_international_day(world)
    start = Date(world.season, review.month, review.day)
    days = start.add_years(1).ordinal() - start.ordinal()
    costs = cfg.management.budgets.accounting.other_cost_share
    for club in world.clubs.values():
        annual_net = round(club.income * (1 - costs)) - club.wage_bill * cfg.management.budgets.weeks_per_year
        payment, remainder = divmod(annual_net + club.accounting_remainder, days)
        apply(world, FinancePosted(club.id, payment, remainder))
    world.pending_match_day = None
    world.submitted_lineups.clear()


def match_stream(world: World, match: Match) -> Random:
    """Each match draws from its own stream: its result does not depend on the order matches are played in."""
    return stream(world.seed, "match", match.season, match.id)


def match_lineups(world: World, match: Match) -> tuple[list[Lineup], dict[int, str]]:
    """Home then away lineups, with the names of any temporary reinforcement of a cup match.

    A human club's match uses its submitted lineup when there is one; otherwise (Auto mode) it
    falls back to the same path as an AI club."""
    lineups, temporary = [], {}
    is_cup = world.competitions[match.competition_id].kind in ("cup", "europe")
    for club_id in (match.home_id, match.away_id):
        if is_human_club(world, club_id) and match.id in world.submitted_lineups:
            lineups.append(to_lineup(world, world.submitted_lineups[match.id], match.competition_id, world.config))
        elif is_cup:
            lineup, names = cup_lineup(world, match, club_id)
            lineups.append(lineup)
            temporary.update(names)
        else:
            lineups.append(select_lineup(LineupContext.from_world(world, club_id, match.competition_id, world.date), world.config))
    return lineups, temporary


def settle_match(world: World, match: Match, result: MatchResult, lineups: list[Lineup], temporary: dict[int, str]) -> None:
    """Decides a drawn knockout tie, then applies the match and its consequences to the world."""
    kind = world.competitions[match.competition_id].kind
    if kind in ("cup", "europe"):
        result.temporary_players = temporary
        if kind == "europe":
            decide_european_winner(world, match, result, lineups)
        else:
            decide_winner(world, match, result, lineups)
    apply(world, match_event(world, match, result))


def simulate_matches(world: World, exclude: int | None = None) -> None:
    """Plays every club match of the day still without a result, except `exclude`."""
    engine = PossessionEngine()
    for match in sorted((match for match in world.matches.values() if match.date == world.date and match.result is None), key=lambda item: item.id):
        if match.id == exclude:
            continue
        lineups, temporary = match_lineups(world, match)
        result = engine.simulate(*lineups, world.config, match_stream(world, match), neutral=match.neutral)
        settle_match(world, match, result, lineups, temporary)
