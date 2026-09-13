"""The only observation service allowed to read true potential."""
from dataclasses import dataclass
from functools import lru_cache

from core.config.model import Config
from core.domain.players import Player
from core.domain.date import Date
from core.math import clamp
from core.randomness import stream


@dataclass(frozen=True, slots=True)
class PotentialEstimate:
    lower: float
    center: float
    upper: float


@lru_cache(maxsize=100000)
def observation_bias(seed: int, player_id: int, observer_id: int | None, year: int, deviation: float) -> float:
    return stream(seed, "estimate", player_id, observer_id, year).gauss(0, deviation)


def estimate_potential(player: Player, date: Date, seed: int, cfg: Config,
                       observer_id: int | None = None, observer_reputation: float | None = None) -> PotentialEstimate:
    rules = cfg.demography.potential_estimate
    age = player.born.age_on(date)
    remaining = 1 - clamp((age - rules.start_age) / (rules.convergence_age - rules.start_age), 0, 1)
    deviation = max(rules.min_noise, rules.max_noise * remaining)
    if observer_reputation is not None:
        deviation *= rules.observer_base - rules.observer_reputation_factor * observer_reputation / cfg.attributes.bounds.max
    bias = observation_bias(seed, player.id, observer_id, date.year, deviation)
    center = clamp(player.potential + bias, player.rating, cfg.attributes.bounds.max)
    width = deviation * rules.interval_width
    return PotentialEstimate(max(player.rating, center - width), center, min(cfg.attributes.bounds.max, center + width))
