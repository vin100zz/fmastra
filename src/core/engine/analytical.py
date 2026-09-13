"""Independent Poisson reference, deliberately without invented match detail."""
from math import exp, log
from random import Random

from core.config.model import Config
from core.domain.matches import Lineup, MatchResult
from .abilities import overall, state_multiplier


def poisson(mean: float, rng: Random) -> int:
    if mean < 0:
        raise ValueError("Negative Poisson mean")
    # Exponential arrival times avoid exp(-mean) underflow for large means.
    total, count = 0.0, 0
    while True:
        total -= log(1 - rng.random())
        if total > mean:
            return count
        count += 1


def lineup_strength(lineup: Lineup, cfg: Config) -> float:
    return sum(overall(slot.player.attributes, slot.position, cfg) * state_multiplier(slot.player, slot.position, cfg)
               for slot in lineup.slots) / cfg.world.match_rules.players_on_pitch


class AnalyticalEngine:
    def simulate(self, home: Lineup, away: Lineup, cfg: Config, rng: Random) -> MatchResult:
        rules = cfg.engine.analytical
        gap = lineup_strength(home, cfg) - lineup_strength(away, cfg)
        home_mean = (rules.base_goals + rules.home_goal_bonus / 2) * exp(gap * rules.strength_sensitivity)
        away_mean = (rules.base_goals - rules.home_goal_bonus / 2) * exp(-gap * rules.strength_sensitivity)
        if min(home_mean, away_mean) < 0:
            raise ValueError("Home advantage exceeds the analytical goal budget")
        return MatchResult(poisson(home_mean, rng), poisson(away_mean, rng), "analytical")
