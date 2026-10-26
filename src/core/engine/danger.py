"""What an action is worth to a rating: the danger it adds to its side's possession or takes from the opponent's, in goals."""
from core.config.model import Config


def danger(cfg: Config, zone: int, counter: bool) -> float:
    """The chance that a possession with the ball at `zone` of the attacking side's frame ends in a goal."""
    rules = cfg.engine.player_ratings
    return (rules.counter_danger if counter else rules.danger)[zone]


def turnover_danger(cfg: Config, zone: int, counter: bool) -> float:
    """What losing the ball in play at `zone` costs the side that had it, and gives the side that wins it: the danger it
    held there, and the possession the other side starts where it won the ball."""
    rules = cfg.engine.player_ratings
    return danger(cfg, zone, counter) + rules.recovery_danger[len(cfg.involvement.zones) - 1 - zone]
