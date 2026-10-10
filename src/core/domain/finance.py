"""Durable monthly cash flows, grouped by club and financial season."""
from dataclasses import dataclass, field
from .date import Date


@dataclass(slots=True)
class MonthlyFinance:
    income: int = 0
    wages: int = 0
    operating_costs: int = 0
    transfer_income: int = 0
    transfer_expenses: int = 0
    rounding: int = 0
    # The part of the income its competitions paid, and what the club spent of its idle cash: both apart from `income` and
    # `operating_costs`, and absent from the accounts kept before them.
    prizes: int = 0
    investments: int = 0


@dataclass(slots=True)
class FinanceSeason:
    since: Date
    opening_balance: int
    months: dict[int, MonthlyFinance] = field(default_factory=dict)
    transfer_indices: list[int] = field(default_factory=list)
