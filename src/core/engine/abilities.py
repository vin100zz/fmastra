"""Attribute combinations shared by import, selection and simulation."""
from collections.abc import Mapping
from random import Random

from core.config.model import Config
from core.domain.players import Attributes, ATTRIBUTE_NAMES, Player, Position
from core.math import clamp


def weighted_rating(attributes: Attributes, weights: Mapping[str, float]) -> float:
    return sum(attributes.get(name) * weight for name, weight in weights.items())


def overall(attributes: Attributes, position: Position, cfg: Config) -> float:
    return weighted_rating(attributes, cfg.attributes.overall[position])


def state_multiplier(player: Player, position: Position, cfg: Config, fitness: float | None = None) -> float:
    fitness = player.fitness if fitness is None else fitness
    morale = 1 + cfg.states.moral.match_amplitude * (2 * player.morale - 1)
    penalty = cfg.attributes.out_of_position
    affinity = penalty.base + penalty.factor * player.affinity(position)
    return player.form * fitness * morale * affinity


def recenter(values: tuple[float, ...], target: float, position: Position, cfg: Config) -> Attributes:
    """Water-fill unsaturated attributes; numerical tolerance is not a game rule."""
    bounds = cfg.attributes.bounds
    data = list(values)
    weights = cfg.attributes.overall[position]
    for _ in range(len(data) + 1):
        current = sum(data[i] * weights.get(name, 0) for i, name in enumerate(ATTRIBUTE_NAMES))
        error = target - current
        if abs(error) < 1e-9:
            break
        available = [i for i, value in enumerate(data)
                     if (error > 0 and value < bounds.max) or (error < 0 and value > bounds.min)]
        mass = sum(weights.get(ATTRIBUTE_NAMES[i], 0) for i in available)
        if mass == 0:
            break
        shift = error / mass
        for index in available:
            data[index] = clamp(data[index] + shift, bounds.min, bounds.max)
    return Attributes(tuple(data))


def generate_attributes(level: float, position: Position, cfg: Config, rng: Random) -> Attributes:
    generation = cfg.attributes.generation_profiles
    profile = generation.profiles[position]
    bounds = cfg.attributes.bounds
    values = tuple(clamp(level + profile.get(name, profile.get("_autres", 0)) + rng.gauss(0, generation.noise),
                         bounds.min, bounds.max) for name in ATTRIBUTE_NAMES)
    return recenter(values, level, position, cfg)
