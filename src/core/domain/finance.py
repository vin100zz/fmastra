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


@dataclass(slots=True)
class FinanceSeason:
    since: Date
    opening_balance: int
    months: dict[int, MonthlyFinance] = field(default_factory=dict)
    transfer_indices: list[int] = field(default_factory=list)
