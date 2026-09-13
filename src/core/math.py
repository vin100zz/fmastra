"""Pure numerical helpers; constants here are mathematical, not game rules."""
from math import exp, log
from collections.abc import Sequence
from random import Random
from typing import TypeVar

T = TypeVar("T")


def clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


def sigmoid(value: float) -> float:
    if value >= 0:
        return 1 / (1 + exp(-value))
    exponential = exp(value)
    return exponential / (1 + exponential)


def logit(value: float) -> float:
    return log(value / (1 - value))


def weighted_choice(values: Sequence[T], weights: Sequence[float], rng: Random) -> T:
    if not values or len(values) != len(weights):
        raise ValueError("Empty or inconsistent weighted choice")
    total = sum(weights)
    if total <= 0:
        return values[rng.randrange(len(values))]
    target = rng.random() * total
    for item, weight in zip(values, weights):
        target -= weight
        if target < 0:
            return item
    return values[-1]


def interpolate(points: Sequence[tuple[float, float]], value: float) -> float:
    if not points:
        raise ValueError("An interpolation curve cannot be empty")
    if value <= points[0][0]:
        return points[0][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if value <= x1:
            return y0 + (y1 - y0) * (value - x0) / (x1 - x0)
    return points[-1][1]
