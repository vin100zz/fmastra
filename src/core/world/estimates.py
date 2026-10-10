"""Noisy opinions of players: the only view of true potential that club decisions may use."""
from dataclasses import dataclass
from functools import lru_cache
from math import sqrt

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


@lru_cache(maxsize=400000)
def _settled_opinion(seed: int, player_id: int, observer_id: int | None) -> float:
    return stream(seed, "opinion", player_id, observer_id).gauss(0, 1)


@lru_cache(maxsize=400000)
def _yearly_opinion(seed: int, player_id: int, observer_id: int | None, year: int, stable_share: float) -> float:
    """A standard draw for the year: a part the observer keeps of this player for good, a part redrawn each year."""
    drawn = stream(seed, "estimate", player_id, observer_id, year).gauss(0, 1)
    return sqrt(stable_share) * _settled_opinion(seed, player_id, observer_id) + sqrt(1 - stable_share) * drawn


def opinion(player_id: int, date: Date, seed: int, cfg: Config, observer_id: int | None = None) -> float:
    """What an observer makes of a player, in standard deviations: above zero, it thinks more of him than he is worth.

    It never jumps: month by month it leaves last year's draw for this year's, which it reaches in December, and the
    two share what the observer has always thought of him. Bounded, so no opinion is absurd.
    """
    rules = cfg.management.valuation.opinion
    before = _yearly_opinion(seed, player_id, observer_id, date.year - 1, rules.stable_share)
    now = _yearly_opinion(seed, player_id, observer_id, date.year, rules.stable_share)
    return clamp(before + (now - before) * date.month / 12, -rules.max_deviations, rules.max_deviations)


def acuity(cfg: Config, observer_reputation: float | None) -> float:
    """How much of its opinion an observer lets through: a reputed club sees closer to the truth."""
    rules = cfg.demography.potential_estimate
    if observer_reputation is None: return 1.0
    return rules.observer_base - rules.observer_reputation_factor * observer_reputation / cfg.attributes.bounds.max


def unsettled(player: Player, date: Date, cfg: Config) -> float:
    """How far a player still is from the age his potential is known at: 1 at the start of the convergence, 0 at its end."""
    rules = cfg.demography.potential_estimate
    return 1 - clamp((player.born.age_on(date) - rules.start_age) / (rules.convergence_age - rules.start_age), 0, 1)


def estimate_potential(player: Player, date: Date, seed: int, cfg: Config,
                       observer_id: int | None = None, observer_reputation: float | None = None) -> PotentialEstimate:
    rules = cfg.demography.potential_estimate
    deviation = max(rules.min_noise, rules.max_noise * unsettled(player, date, cfg)) * acuity(cfg, observer_reputation)
    bias = opinion(player.id, date, seed, cfg, observer_id) * deviation
    center = clamp(player.potential + bias, player.rating, cfg.attributes.bounds.max)
    width = deviation * rules.interval_width
    return PotentialEstimate(max(player.rating, center - width), center, min(cfg.attributes.bounds.max, center + width))


def opinion_factor(player: Player, date: Date, seed: int, cfg: Config,
                   observer_id: int | None = None, observer_reputation: float | None = None) -> float:
    """What an observer's opinion makes of the part of a player's value his potential accounts for.

    Between the widest factor of his age and its inverse: the widest opinions are held of the youngest players.
    """
    rules = cfg.management.valuation.opinion
    widest = rules.mature_factor + (rules.young_factor - rules.mature_factor) * unsettled(player, date, cfg)
    view = clamp(opinion(player.id, date, seed, cfg, observer_id) * acuity(cfg, observer_reputation), -rules.max_deviations, rules.max_deviations)
    return widest ** (view / rules.max_deviations)
