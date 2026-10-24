"""Local coordinates, cached quality-density aggregation and lane choices."""
from bisect import bisect_right
from dataclasses import dataclass, field
from itertools import accumulate, count
from math import exp
from operator import mul
from random import Random

from core.config.model import Config
from core.domain.matches import LineupSlot
from core.domain.players import Position
from core.math import weighted_choice, soften
from .abilities import weighted_rating, state_multiplier
from .local_state import TeamState

PHASES = ("progression_attack", "progression_defense", "creation_attack", "creation_defense")
# Every refresh of every side gets its own number, so a cached gap can tell which ratings it was read from.
REVISIONS = count(1)


def mirror(zone: int, lane: int, cfg: Config) -> tuple[int, int]:
    return len(cfg.involvement.zones) - 1 - zone, len(cfg.involvement.lanes) - 1 - lane


@dataclass(slots=True)
class Layout:
    """What holds while the same players keep the same positions: their ratings in each phase and their state without
    fitness, each cell's involvement weights with its density factor, and the cumulative weights who is involved is drawn
    from, by attacking or defending side, zone and lane."""
    slots: list[LineupSlot]
    ratings: dict[str, list[float]]
    rested: list[float]
    cells: dict[bool, list[tuple[tuple[float, ...], float | None]]]
    involvement: dict[bool, list[list[list[float]]]]
    pace: float
    credit: dict[tuple, tuple[list[int], list[float]]] = field(default_factory=dict)


def _layout(team: TeamState, cfg: Config) -> Layout:
    involvement, density = cfg.involvement, cfg.engine.density
    slots = list(team.active)
    ratings = {phase: [weighted_rating(slot.player.attributes, getattr(cfg.attributes.composites, phase)) for slot in slots]
               for phase in PHASES}
    # The same state without fitness, not divided by it: an exhausted player's fitness reaches zero.
    rested = [state_multiplier(slot.player, slot.position, cfg, 1.0) for slot in slots]
    cells, draws = {}, {}
    for attack in (True, False):
        vertical = involvement.attack if attack else involvement.defense
        cells[attack], draws[attack] = [], []
        for zone in range(len(involvement.zones)):
            row = []
            for lane in range(len(involvement.lanes)):
                weights = tuple(vertical[slot.position][zone] * involvement.lateral[slot.position][lane] for slot in slots)
                total = sum(weights)
                cells[attack].append((weights, (total / density.reference) ** density.exponent / total if total else None))
                row.append(list(accumulate(weights)))
            draws[attack].append(row)
    pace = sum(slot.player.attributes.get("vitesse") for slot in slots) / len(slots) if slots else 0.0
    return Layout(slots, ratings, rested, cells, draws, pace)


def refresh(team: TeamState, cfg: Config) -> None:
    """Zone ratings and player profiles for the current eleven: due after every change on the pitch."""
    lineup = tuple((slot.player.id, slot.position) for slot in team.active)
    if lineup != team.lineup_key or team.layout is None:
        team.lineup_key, team.layout = lineup, _layout(team, cfg)
        layout = team.layout
        sensitivity = cfg.engine.player_ratings.quality_sensitivity
        for phase in PHASES:
            vertical = cfg.involvement.attack if phase.endswith("attack") else cfg.involvement.defense
            # Credit follows the player's own level, not his freshness: the zones already make a tired side lose the ball.
            team.profiles[phase] = [(slot, vertical[slot.position], cfg.involvement.lateral[slot.position], exp(sensitivity * rating * level))
                                    for slot, rating, level in zip(layout.slots, layout.ratings[phase], layout.rested)]
    layout = team.layout
    team.roles.update(lineup)
    team.revision = next(REVISIONS)
    states = [level * team.fitness[slot.player.id] for slot, level in zip(layout.slots, layout.rested)]
    lanes, empty = len(cfg.involvement.lanes), cfg.engine.density.empty_rating
    for phase in PHASES:
        qualities = list(map(mul, layout.ratings[phase], states))
        cells = layout.cells[phase.endswith("attack")]
        values = [factor * sum(map(mul, weights, qualities)) if factor is not None else empty for weights, factor in cells]
        team.zones[phase] = [values[start:start + lanes] for start in range(0, len(values), lanes)]


def gap(attacker: TeamState, defender: TeamState, zone: int, lane: int, creation: bool, cfg: Config, counter: bool = False) -> float:
    """The attacker's edge where the ball is; read again only after either side's ratings were refreshed."""
    if attacker.gaps_stamp[0] != attacker.revision or attacker.gaps_stamp[1] != defender.revision:
        attacker.gaps.clear()
        attacker.gaps_stamp = (attacker.revision, defender.revision)
    key = (creation, counter, zone, lane)
    value = attacker.gaps.get(key)
    if value is None:
        value = attacker.gaps[key] = _gap(attacker, defender, zone, lane, creation, cfg, counter)
    return value


def _gap(attacker: TeamState, defender: TeamState, zone: int, lane: int, creation: bool, cfg: Config, counter: bool) -> float:
    other_zone, other_lane = mirror(zone, lane, cfg)
    attack_key, defense_key = ("creation_attack", "creation_defense") if creation else ("progression_attack", "progression_defense")
    defense = defender.zones[defense_key][other_zone][other_lane]
    if counter:
        defense = max(0, defense - cfg.engine.turnover.lane_defense_penalty)
    # A mismatch between levels no football meets (60 points) must not turn every possession into a goal.
    return soften(attacker.zones[attack_key][zone][lane] - defense, cfg.engine.transitions.max_gap)


def choose_lane(attacker: TeamState, defender: TeamState, zone: int, cfg: Config, rng: Random,
                candidates: list[int] | None = None) -> int:
    lanes = candidates if candidates is not None else list(range(len(cfg.involvement.lanes)))
    scores = [cfg.engine.lanes.beta_softmax * gap(attacker, defender, zone, lane, False, cfg) for lane in lanes]
    maximum = max(scores)
    return weighted_choice(lanes, [exp(score - maximum) for score in scores], rng)


def involved_player(team: TeamState, zone: int, lane: int, attack: bool, rng: Random,
                    exclude: int | None = None) -> LineupSlot:
    if exclude is None:
        layout = team.layout
        cumulative = layout.involvement[attack][zone][lane]
        total = cumulative[-1]
        return layout.slots[bisect_right(cumulative, rng.random() * total) if total > 0 else rng.randrange(len(cumulative))]
    profiles = team.profiles["progression_attack" if attack else "progression_defense"]
    choices = [profile for profile in profiles if profile[0].player.id != exclude] or profiles
    return weighted_choice(choices, [heights[zone] * sides[lane] for _, heights, sides, _ in choices], rng)[0]


def foul_committer(team: TeamState, zone: int, lane: int, cfg: Config, rng: Random) -> LineupSlot:
    """Fouls come from outfield players, weighted by their involvement and their propensity to foul."""
    profiles = team.profiles["progression_defense"]
    choices = [profile for profile in profiles if profile[0].position != Position.GOALKEEPER] or profiles
    weight = cfg.engine.cards.aggression_weight
    return weighted_choice(choices, [heights[zone] * sides[lane] * slot.player.aggression ** weight
                                     for slot, heights, sides, _ in choices], rng)[0]


def credited(team: TeamState, phase: str, zone: int, lane: int, success: bool, rng: Random, outfield: bool = False) -> int:
    """Who an action is put down to: those involved where it happens, the better players more often
    for a success and the weaker ones for a failure. The action itself was already decided by the zones."""
    key = (phase, zone, lane, success, outfield)
    entry = team.layout.credit.get(key)
    if entry is None:
        profiles = team.profiles[phase]
        if outfield:
            profiles = [profile for profile in profiles if profile[0].position != Position.GOALKEEPER] or profiles
        entry = team.layout.credit[key] = ([slot.player.id for slot, *_ in profiles],
                                           list(accumulate(heights[zone] * sides[lane] * (factor if success else 1 / factor)
                                                           for _, heights, sides, factor in profiles)))
    ids, cumulative = entry
    total = cumulative[-1]
    return ids[bisect_right(cumulative, rng.random() * total) if total > 0 else rng.randrange(len(ids))]
