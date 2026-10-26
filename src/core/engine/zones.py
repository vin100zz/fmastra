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
    fitness, each cell's involvement weights with its density factor, the cumulative weights who is involved is drawn
    from, by attacking or defending side, zone and lane, and how readily the outfield players defending each place foul.
    `duels` holds, by phase and cell (zone by zone, lane by lane), the weights a carrier or the defender who meets him is
    drawn with, which lean to the better players (see `cfg.engine.duels`); a carrier is drawn with those of his zone's phase."""
    slots: list[LineupSlot]
    ratings: dict[str, list[float]]
    rested: list[float]
    cells: dict[bool, list[tuple[tuple[float, ...], float | None]]]
    involvement: dict[bool, list[list[list[float]]]]
    pace: float
    aggression: list[list[float]]
    duels: dict[str, list[tuple[float, ...]]]
    duel_draws: dict[str, list[list[float]]]
    credit: dict[tuple, tuple[list[int], list[float]]] = field(default_factory=dict)


def _layout(team: TeamState, cfg: Config) -> Layout:
    involvement, density = cfg.involvement, cfg.engine.density
    slots = list(team.active)
    ratings = {phase: [weighted_rating(slot.player.attributes, getattr(cfg.attributes.composites, phase)) for slot in slots]
               for phase in PHASES}
    # The same state without fitness, not divided by it: an exhausted player's fitness reaches zero.
    rested = [state_multiplier(slot.player, slot.position, cfg, 1.0) for slot in slots]
    selection, last_zone = cfg.engine.duels, len(involvement.zones) - 1
    lean = {phase: [exp((selection.carrier_selection if phase.endswith("attack") else selection.defender_selection) * rating * level)
                    for rating, level in zip(ratings[phase], rested)] for phase in PHASES}
    cells, draws, duels = {}, {}, {phase: [] for phase in PHASES}
    for attack in (True, False):
        vertical = involvement.attack if attack else involvement.defense
        cells[attack], draws[attack] = [], []
        for zone in range(len(involvement.zones)):
            row = []
            for lane in range(len(involvement.lanes)):
                weights = tuple(vertical[slot.position][zone] * involvement.lateral[slot.position][lane] for slot in slots)
                total = sum(weights)
                cells[attack].append((weights, (total / density.reference) ** density.exponent / total if total else None))
                for phase in (("progression_attack", "creation_attack") if attack else ("progression_defense", "creation_defense")):
                    duels[phase].append(tuple(map(mul, weights, lean[phase])))
                # The carrier: in the last zone, the one who makes the chance.
                carrying = "creation_attack" if zone == last_zone else "progression_attack"
                row.append(list(accumulate(duels[carrying][-1] if attack else weights)))
            draws[attack].append(row)
    pace = sum(slot.player.attributes.get("vitesse") for slot in slots) / len(slots) if slots else 0.0
    # The propensity of those who defend a place, weighted by their involvement there: `foul_committer` draws the one who
    # fouls with the same weights, so an action ends in a foul as often as each of them would commit it.
    outfield = [index for index, slot in enumerate(slots) if slot.position != Position.GOALKEEPER] or list(range(len(slots)))
    weight = cfg.engine.cards.aggression_weight
    aggression = []
    for zone in range(len(involvement.zones)):
        row = []
        for lane in range(len(involvement.lanes)):
            weights = [involvement.defense[slots[index].position][zone] * involvement.lateral[slots[index].position][lane] for index in outfield]
            total = sum(weights)
            row.append(sum(share * slots[index].player.aggression ** weight for share, index in zip(weights, outfield)) / total
                       if total else 1.0)
        aggression.append(row)
    return Layout(slots, ratings, rested, cells, draws, pace, aggression, duels,
                  {phase: [list(accumulate(weights)) for weights in table] for phase, table in duels.items()})


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
        # What a carrier, or the defender who meets him, drawn at each place is worth on average: a duel is won by being
        # better than that, so the side as a whole wins its duels as its zones say.
        team.qualities[phase] = {slot.player.id: quality for slot, quality in zip(layout.slots, qualities)}
        plain = sum(qualities) / len(qualities) if qualities else 0.0
        team.expected[phase] = [sum(map(mul, weights, qualities)) / total if (total := sum(weights)) else plain
                                for weights in layout.duels[phase]]


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
    layout, lanes = team.layout, len(team.layout.involvement[attack][zone])
    if attack:
        weights = layout.duels["creation_attack" if zone == len(layout.involvement[attack]) - 1 else "progression_attack"][zone * lanes + lane]
    else:
        weights = layout.cells[False][zone * lanes + lane][0]
    choices = [(slot, weight) for slot, weight in zip(layout.slots, weights) if slot.player.id != exclude] or list(zip(layout.slots, weights))
    return weighted_choice([slot for slot, _ in choices], [weight for _, weight in choices], rng)


def duel_defender(team: TeamState, zone: int, lane: int, creation: bool, rng: Random) -> LineupSlot:
    """The defender who meets the carrier, at `zone` and `lane` of his own side's frame."""
    layout = team.layout
    cumulative = layout.duel_draws["creation_defense" if creation else "progression_defense"][zone * len(layout.involvement[False][zone]) + lane]
    total = cumulative[-1]
    return layout.slots[bisect_right(cumulative, rng.random() * total) if total > 0 else rng.randrange(len(cumulative))]


def duel_edge(team: TeamState, slot: LineupSlot, zone: int, lane: int, phase: str, cfg: Config) -> float:
    """What a player adds to the logit of a duel, at `zone` and `lane` of his own side's frame: his quality beyond that of
    the player the draw puts there on average. Nil on average, it shares a side's success out among its players."""
    duels = cfg.engine.duels
    sensitivity = duels.carrier_sensitivity if phase.endswith("attack") else duels.defender_sensitivity
    expected = team.expected[phase][zone * len(cfg.involvement.lanes) + lane]
    return sensitivity * (team.qualities[phase][slot.player.id] - expected)


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
