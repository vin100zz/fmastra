"""Gregorian game dates, independent of the wall clock."""
from __future__ import annotations

from dataclasses import dataclass


MONTHS = ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre")


def leap_year(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def month_days(year: int, month: int) -> int:
    return (31, 29 if leap_year(year) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)[month - 1]


def days_before_year(year: int) -> int:
    previous = year - 1
    return 365 * previous + previous // 4 - previous // 100 + previous // 400


@dataclass(frozen=True, slots=True, order=True)
class Date:
    year: int
    month: int
    day: int

    def __post_init__(self) -> None:
        if self.year < 1 or not 1 <= self.month <= 12 or not 1 <= self.day <= month_days(self.year, self.month):
            raise ValueError(f"Invalid game date: {self.year}-{self.month}-{self.day}")

    def iso(self) -> str:
        return f"{self.year:04d}-{self.month:02d}-{self.day:02d}"

    def day_month(self) -> str:
        """The date as a headline reads it: "12 avril", "1er mai"."""
        return f"{'1er' if self.day == 1 else self.day} {MONTHS[self.month - 1]}"

    @classmethod
    def parse(cls, value: str) -> Date:
        parts = value.split("-")
        if len(parts) != 3:
            raise ValueError(f"Invalid ISO game date: {value}")
        return cls(*(int(part) for part in parts))

    @classmethod
    def from_ordinal(cls, ordinal: int) -> Date:
        if ordinal < 1:
            raise ValueError("Game dates precede year 1")
        year = max(1, ordinal // 366)
        while days_before_year(year + 1) < ordinal:
            year += 1
        remaining = ordinal - days_before_year(year)
        month = 1
        while remaining > month_days(year, month):
            remaining -= month_days(year, month)
            month += 1
        return cls(year, month, remaining)

    def ordinal(self) -> int:
        return days_before_year(self.year) + sum(month_days(self.year, month) for month in range(1, self.month)) + self.day

    def add_days(self, days: int) -> Date:
        return self.from_ordinal(self.ordinal() + days)

    def add_years(self, years: int) -> Date:
        year = self.year + years
        return Date(year, self.month, min(self.day, month_days(year, self.month)))

    def age_on(self, current: Date) -> int:
        return current.year - self.year - ((current.month, current.day) < (self.month, self.day))

    def months_until(self, later: Date) -> float:
        # Interpolate within the current calendar month, not an assumed 30 days.
        return (later.year - self.year) * 12 + later.month - self.month + (later.day - self.day) / month_days(self.year, self.month)


def next_annual_date(current: Date, month: int, day: int) -> Date:
    candidate = Date(current.year, month, min(day, month_days(current.year, month)))
    return candidate if candidate > current else candidate.add_years(1)
