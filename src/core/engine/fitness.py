"""Fitness consumption and recovery rules."""
from core.config.model import Config
from core.domain.players import Player, Position
from core.math import clamp, interpolate
from .local_state import TeamState


def intensity(block: float, cfg: Config) -> float:
    heights = cfg.formations.block_height
    values = cfg.states.fitness.intensity
    return interpolate(((heights.min, values.low_block), (heights.default, values.balanced),
                        (heights.max, values.high_press)), block)


def minute_cost(player: Player, position: Position, effort: float, cfg: Config) -> float:
    """What a minute played costs him; in goal, only a share of what it costs an outfield player."""
    rules = cfg.states.fitness
    resistance = rules.resistance_base + rules.stamina_resistance * player.attributes.get("endurance") / cfg.attributes.bounds.max
    share = rules.goalkeeper_factor if position == Position.GOALKEEPER else 1
    return rules.cost_per_minute * effort * share / resistance


def consume(team: TeamState, seconds: float, cfg: Config) -> None:
    rules = cfg.states.fitness
    effort = intensity(team.block_height, cfg)
    for slot in team.active:
        player = slot.player
        team.fitness[player.id] = clamp(team.fitness[player.id] - minute_cost(player, slot.position, effort, cfg) * seconds / 60,
                                       rules.min, rules.max)
        stats = team.individual[player.id]
        stats.minutes += seconds / 60
        stats.final_fitness = team.fitness[player.id]


def match_load(spent: float, cfg: Config) -> float:
    """What a match adds to a player's load: the condition it cost him, counted in full matches of a player of
    average endurance with a balanced block."""
    rules = cfg.states.fitness
    return spent / (rules.cost_per_minute * rules.intensity.balanced * cfg.engine.timing.match_seconds / 60)


# Far below the threshold, what is left of a series only fades: dropping it spares a daily change to every player.
FORGOTTEN_LOAD = 0.05


def rested_load(load: float, cfg: Config) -> float:
    """A day's rest, played or not: the load loses a share."""
    left = load * (1 - cfg.states.fitness.load_decay)
    return left if left >= FORGOTTEN_LOAD else 0.0


def overload(load: float, cfg: Config) -> float:
    """How far a load stands beyond the threshold of a loaded series; 0 below it."""
    return max(0.0, load - cfg.states.fitness.load_threshold)


def recover(fitness: float, share: float, floor: float, maximum: float = 1.0) -> float:
    """A day's recovery: a `share` of what is missing up to `maximum`, never less than `floor`.
    Quick after a match, it slows as the player nears full condition."""
    return min(maximum, fitness + max(floor, share * (maximum - fitness)))


def recovered_fitness(player: Player, age: int, cfg: Config, fitness: float | None = None, load: float | None = None) -> float:
    """A day's recovery for this player: his share grows with endurance and youth, and shrinks under a loaded series."""
    rules = cfg.states.fitness
    fitness = player.fitness if fitness is None else fitness
    load = player.load if load is None else load
    factor = rules.young_recovery if age < rules.young_age else rules.old_recovery if age > rules.old_age else 1
    share = (rules.daily_recovery + rules.stamina_recovery * player.attributes.get("endurance") / cfg.attributes.bounds.max) * factor
    share /= 1 + rules.load_slowdown * overload(load, cfg)
    return clamp(recover(fitness, share, rules.min_daily_recovery, rules.max), rules.min, rules.max)


def projected_fitness(player: Player, position: Position, age: int, days: int, cfg: Config) -> float:
    """His condition `days` days from now if he plays a whole match today at `position`, with a balanced block."""
    rules = cfg.states.fitness
    spent = min(player.fitness - rules.min,
                minute_cost(player, position, rules.intensity.balanced, cfg) * cfg.engine.timing.match_seconds / 60)
    fitness, load = player.fitness - spent, player.load + match_load(spent, cfg)
    for _ in range(days):
        load = rested_load(load, cfg)
        fitness = recovered_fitness(player, age, cfg, fitness, load)
    return fitness
