"""Revenue, salary and budget calculations; no file access."""
from math import exp

from core.config.model import Config
from core.domain.clubs import Club
from core.domain.players import Player
from core.domain.date import Date
from core.domain.world import World
from core.domain.finance import FinanceSeason, MonthlyFinance


def financial_season(world: World, date: Date) -> int:
    review = world.config.world.key_dates.population_review
    return date.year - ((date.month, date.day) < (review.month, review.day))


def book_cash(world: World, club: Club, transfer_index: int | None = None, **amounts: int) -> None:
    """Call before changing the cash balance. Budgets/reservations are not cash flows."""
    if world.finance_history_since is None: world.finance_history_since = world.date
    seasons = world.finance_history.setdefault(club.id, {})
    year = financial_season(world, world.date)
    if year not in seasons: seasons[year] = FinanceSeason(world.date, club.balance)
    if transfer_index is not None: seasons[year].transfer_indices.append(transfer_index)
    month = seasons[year].months.setdefault(world.date.month, MonthlyFinance())
    for name, amount in amounts.items(): setattr(month, name, getattr(month, name) + amount)


def book_daily_cash(world: World, club: Club, change: int, investment: int = 0, unseen_wages: int = 0) -> None:
    """A day of a club's accounts: `change` is what its cash moved by, `investment` what it spent of its idle cash, and
    `unseen_wages` the weekly wages a dormant club pays the players the game does not hold."""
    review = world.config.world.key_dates.population_review
    start = Date(financial_season(world, world.date), review.month, review.day)
    days = start.add_years(1).ordinal() - start.ordinal()
    index = world.date.ordinal() - start.ordinal()
    def installment(annual: int) -> int:
        return annual * (index + 1) // days - annual * index // days
    prizes = installment(min(club.income, sum(club.prize_income.values())))
    income = installment(club.income) - prizes
    wages = installment((club.wage_bill + unseen_wages) * world.config.management.budgets.weeks_per_year)
    net_operating = round(club.income * (1 - world.config.management.budgets.accounting.other_cost_share))
    costs = installment(club.income - net_operating)
    # Preserve the original net accounting remainder, including old saved games.
    book_cash(world, club, income=income, prizes=prizes, wages=wages, operating_costs=costs, investments=investment,
              rounding=change - income - prizes + wages + costs + investment)


def daily_accounts(club: Club, cfg: Config, days: int, unseen_wages: int = 0) -> tuple[int, int, int]:
    """A club's day of a year of `days`: what its cash moves by, the remainder its accounts carry over, and what it spent
    of its idle cash.

    Its income less its running costs and its wages, those of the players the game does not hold included
    (`unseen_wages`, weekly). Cash beyond its reserve does not sit idle: a share of it goes into the club each year."""
    budgets = cfg.management.budgets
    annual_net = round(club.income * (1 - budgets.accounting.other_cost_share)) - (club.wage_bill + unseen_wages) * budgets.weeks_per_year
    payment, remainder = divmod(annual_net + club.accounting_remainder, days)
    idle = club.balance - club.income * budgets.investments.reserve_months / 12
    investment = max(0, round(idle * budgets.investments.annual_share / days))
    return payment - investment, remainder, investment


def own_income(club: Club, cfg: Config) -> tuple[float, float]:
    """What a club earns by itself in a year, from its reputation alone, then with its stadium: sponsors and gates.

    Convex in reputation, like the value of the players it can hold; a stadium larger than the reference adds to the
    part the gates make, a smaller one takes off it."""
    rules = cfg.management.budgets.club_income
    base = rules.reference_income * exp(rules.reputation_slope * (club.reputation - rules.reference_reputation))
    capacity = club.capacity or rules.default_capacity
    return base, base * (1 - rules.ticket_share + rules.ticket_share * capacity / rules.reference_capacity)


def rank_share(place: float | None, cfg: Config) -> float:
    """The share of its championship's money a club takes for its rank: `place` runs from 0 for the first to 1 for the
    last, None for a club without a rank; shares average 1."""
    ratio = cfg.management.budgets.club_income.first_to_last_ratio
    top, bottom = 2 * ratio / (ratio + 1), 2 / (ratio + 1)
    return top - (top - bottom) * (0.5 if place is None else place)


def league_rights(cfg: Config, league: tuple[str, int] | None, place: float | None) -> int | None:
    """The money of the championship (nation, level) a club plays, for its rank; None where no championship has its own."""
    table = cfg.management.budgets.club_income.league_rights.get(league[0], ()) if league else ()
    if not league or not 1 <= league[1] <= len(table): return None
    return round(table[league[1] - 1] * rank_share(place, cfg))


def structural_income(club: Club, cfg: Config, league: tuple[str, int] | None = None, place: float | None = None) -> tuple[int, int]:
    """A club's yearly income before its cup prizes, and the part of it its championship pays for its rank.

    Its own income, plus the money of its championship; outside the championships that have their own, a multiple of
    its own income before the stadium instead. Never under what a full squad on the minimum wage costs."""
    rules = cfg.management.budgets.club_income
    base, own = own_income(club, cfg)
    rights = league_rights(cfg, league, place)
    total = own + (rules.other_rights_ratio * base if rights is None else rights)
    return max(rules.minimum_income, round(total)), rights or 0


def initial_finances(club: Club, players: list[Player], cfg: Config, league: tuple[str, int] | None) -> None:
    """Construction-time initialization, before this club enters the world; `league` is the championship it plays."""
    rules = cfg.management.budgets
    wages = sum(player.contract.weekly_wage for player in players if player.contract)
    base, rights = structural_income(club, cfg, league)
    needed = wages * rules.weeks_per_year * rules.initial_funding.wage_headroom / rules.wage_income_share
    club.funding_factor = max(rules.initial_funding.min_funding_factor, needed / base)
    club.income = round(base * club.funding_factor)
    club.prize_income = {"league": rights} if rights else {}
    club.wage_cap = round(club.income * rules.wage_income_share / rules.weeks_per_year)
    club.wage_bill = wages
    club.balance = round(club.income * rules.initial_funding.cash_reserve_months / 12)
    club.transfer_budget = round(club.income * rules.transfer_income_share + club.balance * rules.transfer_balance_share)


def annual_funding_factor(club: Club, cfg: Config, base_income: int, relegated: bool = False) -> float:
    """Retire initial wage support as its purpose disappears, never refill it.

    Imported payroll can greatly exceed the synthetic economy's wages. The
    original subsidy must not become perpetual windfall income after those
    contracts end. Existing payroll retains the initial configured headroom;
    later recruitment cannot increase an already reduced funding factor.

    A club that comes down a division is the one exception: the money of its new championship is a fraction of the
    one it leaves, and the wages it carries down were signed for the other. Its support is restored to what they
    require, and retires in turn as those contracts end.
    """
    rules = cfg.management.budgets
    required_income = club.wage_bill * rules.weeks_per_year * rules.initial_funding.wage_headroom / rules.wage_income_share
    required_factor = max(rules.initial_funding.min_funding_factor, required_income / max(1, base_income))
    return max(club.funding_factor, required_factor) if relegated else min(club.funding_factor, required_factor)
