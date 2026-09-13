"""Fitness consumption and recovery rules."""
from core.config.model import Config
from core.domain.players import Player
from core.math import clamp, interpolate
from .local_state import TeamState


def intensity(block: float, cfg: Config) -> float:
    heights = cfg.formations.block_height
    values = cfg.states.fitness.intensity
    return interpolate(((heights.min, values.low_block), (heights.default, values.balanced),
                        (heights.max, values.high_press)), block)


def consume(team: TeamState, seconds: float, cfg: Config) -> None:
    rules = cfg.states.fitness
    effort = intensity(team.block_height, cfg)
    for slot in team.active:
        player = slot.player
        resistance = rules.resistance_base + rules.stamina_resistance * player.attributes.get("endurance") / cfg.attributes.bounds.max
        team.fitness[player.id] = clamp(team.fitness[player.id] - rules.cost_per_minute * seconds / 60 * effort / resistance,
                                       rules.min, rules.max)
        stats = team.individual[player.id]
        stats.minutes += seconds / 60
        stats.final_fitness = team.fitness[player.id]


def recovered_fitness(player: Player, age: int, cfg: Config) -> float:
    rules = cfg.states.fitness
    factor = rules.young_recovery if age < rules.young_age else rules.old_recovery if age > rules.old_age else 1
    gain = (rules.daily_recovery + rules.stamina_recovery * player.attributes.get("endurance") / cfg.attributes.bounds.max) * factor
    return clamp(player.fitness + gain, rules.min, rules.max)
