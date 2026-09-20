"""Local coordinates, cached quality-density aggregation and lane choices."""
from math import exp
from random import Random

from core.config.model import Config
from core.domain.matches import LineupSlot
from core.domain.players import Position
from core.math import weighted_choice, clamp
from .abilities import weighted_rating, state_multiplier
from .local_state import TeamState

PHASES = ("progression_attack", "progression_defense", "creation_attack", "creation_defense")


def mirror(zone: int, lane: int, cfg: Config) -> tuple[int, int]:
    return len(cfg.involvement.zones) - 1 - zone, len(cfg.involvement.lanes) - 1 - lane


def involvement(slot: LineupSlot, zone: int, lane: int, attack: bool, cfg: Config) -> float:
    vertical = cfg.involvement.attack if attack else cfg.involvement.defense
    return vertical[slot.position][zone] * cfg.involvement.lateral[slot.position][lane]


def refresh(team: TeamState, cfg: Config) -> None:
    z_count, c_count = len(cfg.involvement.zones), len(cfg.involvement.lanes)
    density_reference, exponent = cfg.engine.density.reference, cfg.engine.density.exponent
    multipliers = [state_multiplier(slot.player, slot.position, cfg, team.fitness[slot.player.id]) for slot in team.active]
    for phase in PHASES:
        attack = phase.endswith("attack")
        weights = getattr(cfg.attributes.composites, phase)
        qualities = [weighted_rating(slot.player.attributes, weights) * multiplier
                     for slot, multiplier in zip(team.active, multipliers)]
        vertical = cfg.involvement.attack if attack else cfg.involvement.defense
        profiles = [(vertical[slot.position], cfg.involvement.lateral[slot.position], quality)
                    for slot, quality in zip(team.active, qualities)]
        table = []
        for zone in range(z_count):
            row = []
            for lane in range(c_count):
                density, total = 0.0, 0.0
                for heights, sides, quality in profiles:
                    weight = heights[zone] * sides[lane]
                    density += weight
                    total += weight * quality
                row.append(total / density * (density / density_reference) ** exponent
                           if density else cfg.engine.density.empty_rating)
            table.append(row)
        team.zones[phase] = table


def gap(attacker: TeamState, defender: TeamState, zone: int, lane: int, creation: bool, cfg: Config, counter: bool = False) -> float:
    other_zone, other_lane = mirror(zone, lane, cfg)
    attack_key, defense_key = ("creation_attack", "creation_defense") if creation else ("progression_attack", "progression_defense")
    defense = defender.zones[defense_key][other_zone][other_lane]
    if counter:
        defense = max(0, defense - cfg.engine.turnover.lane_defense_penalty)
    return attacker.zones[attack_key][zone][lane] - defense


def choose_lane(attacker: TeamState, defender: TeamState, zone: int, cfg: Config, rng: Random,
                candidates: list[int] | None = None) -> int:
    lanes = candidates if candidates is not None else list(range(len(cfg.involvement.lanes)))
    scores = [cfg.engine.lanes.beta_softmax * gap(attacker, defender, zone, lane, False, cfg) for lane in lanes]
    maximum = max(scores)
    return weighted_choice(lanes, [exp(score - maximum) for score in scores], rng)


def involved_player(team: TeamState, zone: int, lane: int, attack: bool, cfg: Config, rng: Random,
                    exclude: int | None = None) -> LineupSlot:
    choices = [slot for slot in team.active if slot.player.id != exclude]
    if not choices:
        choices = team.active
    return weighted_choice(choices, [involvement(slot, zone, lane, attack, cfg) for slot in choices], rng)


def foul_committer(team: TeamState, zone: int, lane: int, cfg: Config, rng: Random) -> LineupSlot:
    """Fouls come from outfield players, weighted by their involvement and their propensity to foul."""
    choices = [slot for slot in team.active if slot.position != Position.GOALKEEPER] or team.active
    weight = cfg.engine.cards.aggression_weight
    return weighted_choice(choices, [involvement(slot, zone, lane, False, cfg) * slot.player.aggression ** weight
                                     for slot in choices], rng)
