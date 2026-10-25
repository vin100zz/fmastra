"""The formation that suits a squad: the one whose places its players fill best."""
from collections.abc import Sequence

from core.config.model import Config
from core.domain.players import Player, Position
from core.engine.abilities import overall
from .assignment import maximize_assignment


def _position_values(players: Sequence[Player], positions: set[Position], cfg: Config) -> dict[Position, list[float]]:
    """Each player's value at each position: his level recomputed with the weights of the position, times his affinity
    to it, without form, fitness nor morale."""
    penalty = cfg.attributes.out_of_position
    return {position: [overall(player.attributes, position, cfg) * (penalty.base + penalty.factor * player.affinity(position))
                       for player in players] for position in positions}


def _value(values: dict[Position, list[float]], formation: str, cfg: Config) -> float:
    roles = [Position(role) for role in cfg.formations.formations[formation]]
    scores = [values[role] for role in roles]
    if not scores[0]: return 0.0
    if len(roles) > len(scores[0]):
        # Fewer players than places: each player takes a place, and the empty ones count nothing.
        scores = [list(column) for column in zip(*scores)]
    assigned = maximize_assignment(scores)
    return sum(scores[row][column] for row, column in enumerate(assigned)) / len(roles)


def formation_value(players: Sequence[Player], formation: str, cfg: Config) -> float:
    """The mean value of the best assignment of `players` to the places of `formation` (see `_position_values`). With
    fewer players than places, the empty ones count nothing."""
    positions = {Position(role) for role in cfg.formations.formations[formation]}
    return _value(_position_values(players, positions, cfg), formation, cfg)


def best_formation(players: Sequence[Player], cfg: Config, current: str | None = None) -> str:
    """The formation `players` fill best; `current` stays unless another does better, by at least
    `formations.choix.marge_changement` points per place. Ties go to the earlier formation of the configuration, whatever
    the order of `players`."""
    players = sorted(players, key=lambda player: player.id)
    formations = cfg.formations.formations
    table = _position_values(players, {Position(role) for roles in formations.values() for role in roles}, cfg)
    values = {name: _value(table, name, cfg) for name in formations}
    best = max(values, key=lambda name: (values[name], -list(values).index(name)))
    if current in values:
        gain = values[best] - values[current]
        if gain <= 0 or gain < cfg.formations.choice.change_margin: return current
    return best
