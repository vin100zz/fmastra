"""Revenue, salary and budget calculations; no file access."""
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


def book_daily_cash(world: World, club: Club, change: int) -> None:
    review = world.config.world.key_dates.population_review
    start = Date(financial_season(world, world.date), review.month, review.day)
    days = start.add_years(1).ordinal() - start.ordinal()
    index = world.date.ordinal() - start.ordinal()
    def installment(annual: int) -> int:
        return annual * (index + 1) // days - annual * index // days
    income = installment(club.income)
    wages = installment(club.wage_bill * world.config.management.budgets.weeks_per_year)
    net_operating = round(club.income * (1 - world.config.management.budgets.accounting.other_cost_share))
    costs = installment(club.income - net_operating)
    # Preserve the original net accounting remainder, including old saved games.
    book_cash(world, club, income=income, wages=wages, operating_costs=costs,
              rounding=change - income + wages + costs)


def structural_income(club: Club, cfg: Config, rank: float | None = None) -> int:
    rules = cfg.management.budgets.income
    bonus = rules.first_place_bonus * rules.rank_decay ** (rank - 1) if rank is not None else 0
    multiplier = rules.nation_multipliers.get(club.nation, rules.other_nations_multiplier)
    return round((rules.per_reputation_point * club.reputation + bonus) * multiplier)


def initial_finances(club: Club, players: list[Player], cfg: Config, league_size: int | None) -> None:
    """Construction-time initialization, before this club enters the world."""
    rules = cfg.management.budgets
    wages = sum(player.contract.weekly_wage for player in players if player.contract)
    base = structural_income(club, cfg, (league_size + 1) / 2 if league_size else None)
    needed = wages * rules.weeks_per_year * rules.initial_funding.wage_headroom / rules.wage_income_share
    club.funding_factor = max(rules.initial_funding.min_funding_factor, needed / base)
    club.income = round(base * club.funding_factor)
    club.wage_cap = round(club.income * rules.wage_income_share / rules.weeks_per_year)
    club.wage_bill = wages
    club.balance = round(club.income * rules.initial_funding.cash_reserve_months / 12)
    club.transfer_budget = round(club.income * rules.transfer_income_share + club.balance * rules.transfer_balance_share)


def annual_funding_factor(club: Club, cfg: Config, base_income: int) -> float:
    """Retire initial wage support as its purpose disappears, never refill it.

    Imported payroll can greatly exceed the synthetic economy's wages. The
    original subsidy must not become perpetual windfall income after those
    contracts end. Existing payroll retains the initial configured headroom;
    later recruitment cannot increase an already reduced funding factor.
    """
    rules = cfg.management.budgets
    required_income = club.wage_bill * rules.weeks_per_year * rules.initial_funding.wage_headroom / rules.wage_income_share
    required_factor = max(rules.initial_funding.min_funding_factor, required_income / max(1, base_income))
    return min(club.funding_factor, required_factor)
