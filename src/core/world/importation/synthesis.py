"""Replaceable, explicitly synthetic player and club abilities."""
from math import exp, log
from random import Random

from core.config.model import Config
from core.domain.players import Position
from core.math import clamp, interpolate


def age_value_factor(age: int, cfg: Config) -> float:
    points = [((row.min_age + row.max_age) / 2, row.factor) for row in cfg.management.valuation.age_curve]
    return interpolate(points, age)


def _geometric(points: list[tuple[float, float]], level: float) -> float:
    """A curve of amounts by level, interpolated geometrically: it stays convex between two points, and past its ends
    the slope of the nearest segment continues."""
    index = next((i for i in range(1, len(points)) if level <= points[i][0]), len(points) - 1)
    (x0, y0), (x1, y1) = points[index - 1], points[index]
    return exp(log(y0) + (log(y1) - log(y0)) * (level - x0) / (x1 - x0))


def level_value(level: float, cfg: Config) -> float:
    """Value in euros of a level for a prime-age player at a neutral position (see `_geometric`)."""
    value = cfg.management.valuation
    if not value.level_curve:
        return value.base_euros * exp(value.exponent * (level - value.reference_level))
    return _geometric([(row.level, row.value) for row in value.level_curve], level)


def level_wage(level: float, position: Position, cfg: Config, income: int | None = None) -> int:
    """Weekly wage a level commands at a position, at a club of yearly `income`: the reference income without one.

    Whatever the player's age or promise. Twice the level slope doubles it; so does a club four times as rich, at the
    configured exponent. Never under the minimum wage."""
    budget = cfg.management.budgets
    rules = budget.wage_model
    means = (income / rules.reference_income) ** rules.income_exponent if income else 1.0
    yearly = rules.reference_wage * exp(rules.level_slope * (level - rules.reference_level)) * means * cfg.management.valuation.position_scarcity[position]
    return max(budget.wages.weekly_minimum, round(yearly / budget.weeks_per_year))


def intrinsic_value(level: float, age: int, position: Position, cfg: Config) -> int:
    return round(level_value(level, cfg) * age_value_factor(age, cfg) * cfg.management.valuation.position_scarcity[position])


def club_strength(capacity: int, cfg: Config, rng: Random) -> tuple[float, float]:
    rules = cfg.import_settings.club_synthesis
    capacity = max(capacity, rules.capacity_reference.min)
    share = clamp(log(capacity / rules.capacity_reference.min) /
                  log(rules.capacity_reference.max / rules.capacity_reference.min), 0, 1)
    reputation = clamp(rules.reputation.min + share * (rules.reputation.max - rules.reputation.min)
                       + rng.gauss(0, rules.reputation_noise), rules.reputation.min, rules.reputation.max)
    academy = clamp(reputation * rules.academy_reputation_factor + rng.gauss(0, rules.academy_noise),
                    rules.academy_rating.min, rules.academy_rating.max)
    return reputation, academy
