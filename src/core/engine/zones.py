"""Local coordinates, cached quality-density aggregation and lane choices."""
from math import exp
from random import Random

from core.config.model import Config
from core.domain.matches import LineupSlot
from core.domain.players import Position
from core.math import weighted_choice, soften
from .abilities import weighted_rating, state_multiplier
from .local_state import TeamState

PHASES = ("progression_attack", "progression_defense", "creation_attack", "creation_defense")


def mirror(zone: int, lane: int, cfg: Config) -> tuple[int, int]:
    return len(cfg.involvement.zones) - 1 - zone, len(cfg.involvement.lanes) - 1 - lane


def refresh(team: TeamState, cfg: Config) -> None:
    """Zone ratings and player profiles for the current eleven: due after every change on the pitch."""
    z_count, c_count = len(cfg.involvement.zones), len(cfg.involvement.lanes)
    density_reference, exponent = cfg.engine.density.reference, cfg.engine.density.exponent
    sensitivity = cfg.engine.player_ratings.quality_sensitivity
    multipliers = [state_multiplier(slot.player, slot.position, cfg, team.fitness[slot.player.id]) for slot in team.active]
    team.roles.update((slot.player.id, slot.position) for slot in team.active)
    for phase in PHASES:
        attack = phase.endswith("attack")
        weights = getattr(cfg.attributes.composites, phase)
        qualities = [weighted_rating(slot.player.attributes, weights) * multiplier
                     for slot, multiplier in zip(team.active, multipliers)]
        vertical = cfg.involvement.attack if attack else cfg.involvement.defense
        profiles = [(slot, vertical[slot.position], cfg.involvement.lateral[slot.position], quality)
                    for slot, quality in zip(team.active, qualities)]
        table = []
        for zone in range(z_count):
            row = []
            for lane in range(c_count):
                density, total = 0.0, 0.0
                for _, heights, sides, quality in profiles:
                    weight = heights[zone] * sides[lane]
                    density += weight
                    total += weight * quality
                row.append(total / density * (density / density_reference) ** exponent
                           if density else cfg.engine.density.empty_rating)
            table.append(row)
        team.zones[phase] = table
        # Credit follows the player's own level, not his freshness: the zones already make a tired side lose the ball.
        team.profiles[phase] = [(slot, heights, sides, exp(sensitivity * quality / team.fitness[slot.player.id]))
                                for slot, heights, sides, quality in profiles]


def gap(attacker: TeamState, defender: TeamState, zone: int, lane: int, creation: bool, cfg: Config, counter: bool = False) -> float:
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
    profiles = team.profiles[phase]
    if outfield:
        profiles = [profile for profile in profiles if profile[0].position != Position.GOALKEEPER] or profiles
    return weighted_choice(profiles, [heights[zone] * sides[lane] * (factor if success else 1 / factor)
                                      for _, heights, sides, factor in profiles], rng)[0].player.id
