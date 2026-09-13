"""Replaceable, explicitly synthetic player and club abilities."""
from math import exp, log
from random import Random

from core.config.model import Config
from core.domain.players import Position
from core.math import clamp, interpolate


def age_value_factor(age: int, cfg: Config) -> float:
    points = [((row.min_age + row.max_age) / 2, row.factor) for row in cfg.management.valuation.age_curve]
    return interpolate(points, age)


def intrinsic_value(level: float, age: int, position: Position, cfg: Config) -> int:
    value = cfg.management.valuation
    return round(value.base_euros * exp(value.exponent * (level - value.reference_level))
                 * age_value_factor(age, cfg) * value.position_scarcity[position])


def expected_wage(value: int, cfg: Config) -> int:
    budget = cfg.management.budgets
    return max(budget.wages.weekly_minimum, round(value * budget.wages.annual_value_share / budget.weeks_per_year))


def estimate_level(value: int, wage: int, age: int, position: Position, cfg: Config) -> float:
    rules = cfg.import_settings
    if value <= 0 and wage > 0:
        value = round(wage * cfg.management.budgets.weeks_per_year / cfg.management.budgets.wages.annual_value_share)
    if value <= 0:
        return rules.missing_values.fallback_level
    valuation = cfg.management.valuation
    baseline = valuation.base_euros * age_value_factor(age, cfg) * valuation.position_scarcity[position]
    level = valuation.reference_level + log(value / baseline) / valuation.exponent
    return clamp(level, rules.player_synthesis.level.min, rules.player_synthesis.level.max)


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
