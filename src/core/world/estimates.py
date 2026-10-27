"""Noisy opinions of players: the only view of true level and potential that club decisions and the screens may use.

What an observer makes of a player is read in stars (`attributes.stars`): the scale the screens show, half a star a class,
tighter at the top. Its error grows with his youth and shrinks with what he has played and with the observer's acuity;
the observer's own players are the best known. A young player nobody has seen play is a gamble.
"""
from dataclasses import dataclass
from functools import lru_cache
from math import floor, sqrt

from core.config.model import Config
from core.domain.players import Player
from core.domain.date import Date
from core.math import clamp
from core.randomness import stream


@dataclass(frozen=True, slots=True)
class PotentialEstimate:
    """A potential as an observer reads it, on the attribute scale: its centre and the band where it stands one time in
    two (`lower`, `upper`), and its error in stars (`deviation`)."""
    lower: float
    center: float
    upper: float
    deviation: float = 0.0


@dataclass(frozen=True, slots=True)
class LevelEstimate:
    """A level as an observer reads it, on the attribute scale, and its error in stars."""
    center: float
    deviation: float


# ---------------------------------------------------------------------------------------------------------------------
# The scale of stars.

def _anchors(cfg: Config) -> tuple[tuple[float, float], ...]:
    """The points the continuous scale runs through, as (value, stars): half a star at the floor, one star at the first
    threshold, half a star more at each next, and the top of the scale at the attributes' maximum."""
    rules = cfg.attributes.stars
    return ((rules.floor, 0.5), *((value, 1 + index / 2) for index, value in enumerate(rules.thresholds)),
            (float(cfg.attributes.bounds.max), rules.top))


def to_stars(value: float, cfg: Config) -> float:
    """A value on the attribute scale in continuous stars: half a star at the floor or under it."""
    points = _anchors(cfg)
    if value <= points[0][0]: return points[0][1]
    for (low, low_stars), (high, high_stars) in zip(points, points[1:]):
        if value <= high: return low_stars + (high_stars - low_stars) * (value - low) / (high - low)
    return points[-1][1]


def from_stars(stars: float, cfg: Config) -> float:
    """The value on the attribute scale continuous `stars` stand for; the floor under half a star."""
    points = _anchors(cfg)
    if stars <= points[0][1]: return points[0][0]
    for (low, low_stars), (high, high_stars) in zip(points, points[1:]):
        if stars <= high_stars: return low + (high - low) * (stars - low_stars) / (high_stars - low_stars)
    return points[-1][0]


def shown_stars(stars: float) -> float:
    """Continuous stars as a screen shows them: the half star they reach, from half a star to five."""
    return clamp(floor(stars * 2 + 1e-9) / 2, 0.5, 5.0)


def stars_of(value: float, cfg: Config) -> float:
    """The stars a value on the attribute scale shows, without any doubt: a composite, a note, a mean."""
    return shown_stars(to_stars(value, cfg))


# ---------------------------------------------------------------------------------------------------------------------
# Opinions.

@lru_cache(maxsize=400000)
def _settled_opinion(seed: int, player_id: int, observer_id: int | None, kind: str) -> float:
    return stream(seed, "opinion" + kind, player_id, observer_id).gauss(0, 1)


@lru_cache(maxsize=400000)
def _yearly_opinion(seed: int, player_id: int, observer_id: int | None, year: int, stable_share: float, kind: str) -> float:
    """A standard draw for the year: a part the observer keeps of this player for good, a part redrawn each year."""
    drawn = stream(seed, "estimate" + kind, player_id, observer_id, year).gauss(0, 1)
    return sqrt(stable_share) * _settled_opinion(seed, player_id, observer_id, kind) + sqrt(1 - stable_share) * drawn


def opinion(player_id: int, date: Date, seed: int, cfg: Config, observer_id: int | None = None, kind: str = "") -> float:
    """What an observer makes of a player, in standard deviations: above zero, it thinks more of him than he is worth.

    It never jumps: month by month it leaves last year's draw for this year's, which it reaches in December, and the
    two share what the observer has always thought of him. Bounded, so no opinion is absurd. `kind` keeps the opinion of
    his level apart from that of his potential.
    """
    rules = cfg.management.valuation.opinion
    before = _yearly_opinion(seed, player_id, observer_id, date.year - 1, rules.stable_share, kind)
    now = _yearly_opinion(seed, player_id, observer_id, date.year, rules.stable_share, kind)
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


def age_deviation(age: float, cfg: Config) -> float:
    """The error on a potential at an age, in stars, before what he played and who looks: in a straight line between two
    ages of the configuration, constant beyond them."""
    rows = cfg.demography.potential_estimate.deviations_by_age
    if age <= rows[0].age: return rows[0].deviation
    for low, high in zip(rows, rows[1:]):
        if age <= high.age: return low.deviation + (high.deviation - low.deviation) * (age - low.age) / (high.age - low.age)
    return rows[-1].deviation


def exposure_factor(player: Player, cfg: Config) -> float:
    """What the matches he played take off the error: nothing without any, `max_reduction` from the reference on."""
    rules = cfg.demography.potential_estimate.exposure
    return 1 - rules.max_reduction * min(1.0, player.exposure / rules.reference_matches)


def deviation(player: Player, date: Date, cfg: Config, observer_id: int | None = None,
              observer_reputation: float | None = None) -> float:
    """The error an observer makes on a player's potential, in stars."""
    rules = cfg.demography.potential_estimate
    own = observer_id is not None and observer_id in (player.club_id, player.owner_id)
    spread = (age_deviation(player.born.months_until(date) / 12, cfg) * exposure_factor(player, cfg)
              * (rules.own_club if own else 1.0) * acuity(cfg, observer_reputation))
    return max(rules.min_deviation, spread)


def estimate_level(player: Player, date: Date, seed: int, cfg: Config,
                   observer_id: int | None = None, observer_reputation: float | None = None) -> LevelEstimate:
    """His level as an observer reads it: its own share of the error on his potential, without any pull to the mean."""
    rules = cfg.demography.potential_estimate
    error = rules.level_share * deviation(player, date, cfg, observer_id, observer_reputation)
    stars = to_stars(player.rating, cfg) + opinion(player.id, date, seed, cfg, observer_id, "-level") * error
    bounds = cfg.attributes.bounds
    return LevelEstimate(clamp(from_stars(stars, cfg), bounds.min, bounds.max), error)


def estimate_potential(player: Player, date: Date, seed: int, cfg: Config,
                       observer_id: int | None = None, observer_reputation: float | None = None) -> PotentialEstimate:
    """His potential as an observer reads it: the truth moved by its opinion of him, brought `shrinkage` of the way a
    Bayesian scout would bring it towards what young players are worth, and the band where it stands one time in two.
    Never under his level: nobody doubts what he already shows."""
    rules = cfg.demography.potential_estimate
    error = deviation(player, date, cfg, observer_id, observer_reputation)
    seen = to_stars(player.potential, cfg) + opinion(player.id, date, seed, cfg, observer_id) * error
    prior = rules.prior_deviation ** 2
    kept = 1 - rules.shrinkage * error ** 2 / (prior + error ** 2)
    center = rules.prior_mean + kept * (seen - rules.prior_mean)
    spread = error * sqrt(kept)
    top = float(cfg.attributes.bounds.max)
    middle = clamp(from_stars(center, cfg), player.rating, top)
    return PotentialEstimate(clamp(from_stars(center - rules.band * spread, cfg), player.rating, middle), middle,
                             clamp(from_stars(center + rules.band * spread, cfg), middle, top), spread)


def opinion_factor(player: Player, date: Date, seed: int, cfg: Config,
                   observer_id: int | None = None, observer_reputation: float | None = None) -> float:
    """What an observer's opinion makes of the part of a player's value his potential accounts for.

    Between the widest factor of his age and its inverse: the widest opinions are held of the youngest players.
    """
    rules = cfg.management.valuation.opinion
    widest = rules.mature_factor + (rules.young_factor - rules.mature_factor) * unsettled(player, date, cfg)
    view = clamp(opinion(player.id, date, seed, cfg, observer_id) * acuity(cfg, observer_reputation), -rules.max_deviations, rules.max_deviations)
    return widest ** (view / rules.max_deviations)


# ---------------------------------------------------------------------------------------------------------------------
# Exposure: what he played, weighted by where.

def match_weight(cfg: Config, kind: str, level: int) -> float:
    """What a full match of a competition is worth to know a player by: a league by its level, a national cup, a
    European cup, a selection."""
    rules = cfg.demography.potential_estimate.exposure
    if kind == "league": return rules.league_weights[min(max(level, 1), len(rules.league_weights)) - 1]
    if kind == "europe": return rules.europe_weight
    if kind == "international": return rules.selection_weight
    return rules.cup_weight


def imported_exposure(reputation: float | None, caps: int, cfg: Config) -> float:
    """The matches a player of the import is known for: his reputation, from none to the reference, and his caps."""
    rules = cfg.demography.potential_estimate.exposure
    known = 0.0 if reputation is None else clamp((reputation - rules.unknown_reputation)
                                                 / (rules.known_reputation - rules.unknown_reputation), 0, 1)
    return known * rules.reference_matches + caps * rules.selection_weight
