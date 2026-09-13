"""Structured benchmark results and uncertainty."""
from dataclasses import dataclass, asdict
from math import sqrt
from typing import Any


@dataclass(slots=True)
class Measurement:
    name: str
    value: float
    minimum: float
    maximum: float
    sample_size: int
    standard_error: float = 0
    blocking: bool = True

    @property
    def passed(self) -> bool:
        return self.minimum <= self.value <= self.maximum

    def payload(self) -> dict[str, Any]:
        return {**asdict(self), "passed": self.passed}


def proportion(name: str, count: int, total: int, target: float, tolerance: float, blocking: bool = True) -> Measurement:
    value = count / total
    return Measurement(name, value, target - tolerance, target + tolerance, total,
                       sqrt(value * (1 - value) / total), blocking)
