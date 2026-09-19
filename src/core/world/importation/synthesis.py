"""Replaceable, explicitly synthetic player and club abilities."""
from math import exp, log
from random import Random

from core.config.model import Config
from core.domain.players import Position
from core.math import clamp, interpolate


def age_value_factor(age: int, cfg: Config) -> float:
    points = [((row.min_age + row.max_age) / 2, row.factor) for row in cfg.management.valuation.age_curve]
    return interpolate(points, age)


def level_value(level: float, cfg: Config) -> float:
    """Value in euros of a level for a prime-age player at a neutral position.

    The configured curve is interpolated geometrically, so value stays convex
    between points; past its ends, the slope of the nearest segment continues.
    """
    value = cfg.management.valuation
    if not value.level_curve:
        return value.base_euros * exp(value.exponent * (level - value.reference_level))
    points = [(row.level, log(row.value)) for row in value.level_curve]
    index = next((i for i in range(1, len(points)) if level <= points[i][0]), len(points) - 1)
    (x0, y0), (x1, y1) = points[index - 1], points[index]
    return exp(y0 + (y1 - y0) * (level - x0) / (x1 - x0))


def intrinsic_value(level: float, age: int, position: Position, cfg: Config) -> int:
    return round(level_value(level, cfg) * age_value_factor(age, cfg) * cfg.management.valuation.position_scarcity[position])


def expected_wage(value: int, cfg: Config) -> int:
    budget = cfg.management.budgets
    return max(budget.wages.weekly_minimum, round(value * budget.wages.annual_value_share / budget.weeks_per_year))


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
