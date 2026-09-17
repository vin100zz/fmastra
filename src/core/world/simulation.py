"""Advance coherent game days, applying each phase before dependent decisions."""
from __future__ import annotations

from core.ai.controller import AIController
from core.ai.selection import LineupContext
from core.ai.market import propose_transfers
from core.domain.date import Date
from core.domain.world import World
from core.engine.match import PossessionEngine
from .application import apply
from .calendar import standings
from .contracts import expiry_events, renewal_events
from .demography import retirement_events, cohort_events
from .events import DateAdvanced, FinancePosted, BudgetRenewed, SeasonOpened
from .finances import structural_income
from .player_states import daily_player_events, monthly_player_events, match_event
from .market import settle_offers, open_offers, ensure_minimums
from .promotion import promotion_event
from .squads import complete_squads
from .cups import season_fixtures, progress_cups
from .cup_matches import cup_lineup, decide_winner


def market_window(world: World) -> str | None:
    today = (world.date.month, world.date.day)
    for name in ("summer", "winter"):
        window = getattr(world.config.world.market, name)
        if (window.start_month, window.start_day) <= today <= (window.end_month, window.end_day): return name
    return None


def target_date(world: World, until: str) -> Date:
    if until == "jour": return world.date.add_days(1)
    if until == "journee":
        dates = [match.date for match in world.matches.values() if match.result is None and match.date > world.date]
        if dates: return min(dates)
        opening = world.config.world.season
        return Date(world.season + 1, opening.start_month, opening.start_day)
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
        if competition.kind == "cup":
            if not any(year == world.season for year, _ in world.champions.get(competition.id, [])):
                raise ValueError(f"{competition.name}: cup is not complete")
            continue
        rows = standings(competition, [world.matches[mid] for mid in competition.match_ids], cfg)
        tables[competition.id] = rows
        champions[competition.id] = rows[0].club_id
        rankings.update({row.club_id: index + 1 for index, row in enumerate(rows)})
    movements = promotion_event(world, tables)
    incoming = {move.club_id for move in movements.movements if move.source_id is None}
    apply(world, movements)
    for event in retirement_events(world): apply(world, event)
    for club in world.clubs.values():
        rank = rankings.get(club.id)
        income = round(structural_income(club, cfg, rank) * club.funding_factor)
        rules = cfg.management.budgets
        # Honor existing wages and reserve the minimum intake for newly active clubs.
        minimum_wages = club.wage_bill
        if club.id in incoming:
            guard = cfg.management.guardrails
            missing = max(0, guard.min_squad - len(club.player_ids),
                          guard.min_goalkeepers - sum(world.players[pid].position == "GB" for pid in club.player_ids))
            minimum_wages += missing * cfg.demography.academies.base_weekly_wage
        cap = max(minimum_wages, round(income * rules.wage_income_share / rules.weeks_per_year))
        budget = max(0, round(income * rules.transfer_income_share + club.balance * rules.transfer_balance_share))
        apply(world, BudgetRenewed(club.id, income, cap, budget, rank))
    matches = season_fixtures(world, world.date.year)
    apply(world, SeasonOpened(world.date.year, matches, champions))
    complete_squads(world, list(incoming))
    for event in cohort_events(world): apply(world, event)
    ensure_minimums(world)


def advance_day(world: World) -> None:
    """No I/O, no clock reads; callers persist after this coherent boundary."""
    cfg = world.config
    apply(world, DateAdvanced(world.date.add_days(1)))
    for event in expiry_events(world): apply(world, event)
    for event in daily_player_events(world): apply(world, event)
    if world.date.day == 1:
        for event in monthly_player_events(world): apply(world, event)
    review = cfg.world.key_dates.population_review
    if (world.date.month, world.date.day) == (review.month, review.day) and world.last_annual_review < world.date.year:
        annual_review(world)
    if world.date.ordinal() % cfg.management.market.weekly_review_days == 0:
        for event in renewal_events(world): apply(world, event)
    open_market = market_window(world) is not None
    for _ in range(cfg.world.market.rounds_per_day):
        settle_offers(world, open_market)
        open_offers(world, open_market)
    controller = AIController(cfg, world.rngs["matches"])
    engine = PossessionEngine()
    for match in sorted((match for match in world.matches.values() if match.date == world.date and match.result is None), key=lambda item: item.id):
        lineups = []
        temporary = {}
        is_cup = world.competitions[match.competition_id].kind == "cup"
        for club_id in (match.home_id, match.away_id):
            if is_cup:
                lineup, names = cup_lineup(world, match, club_id)
                lineups.append(lineup)
                temporary.update(names)
                continue
            club = world.clubs[club_id]
            context = LineupContext(club, [world.players[pid] for pid in club.player_ids], match.competition_id, world.date)
            lineups.append(controller.select_lineup(context))
        result = engine.simulate(*lineups, cfg, world.rngs["matches"], neutral=match.neutral)
        if is_cup:
            result.temporary_players = temporary
            decide_winner(world, match, result, lineups)
        apply(world, match_event(world, match, result))
    progress_cups(world)
    start = Date(world.season, review.month, review.day)
    days = start.add_years(1).ordinal() - start.ordinal()
    costs = cfg.management.budgets.accounting.other_cost_share
    for club in world.clubs.values():
        annual_net = round(club.income * (1 - costs)) - club.wage_bill * cfg.management.budgets.weeks_per_year
        payment, remainder = divmod(annual_net + club.accounting_remainder, days)
        apply(world, FinancePosted(club.id, payment, remainder))
