"""Possession-engine entry point: a whole match played at once."""
from random import Random

from core.config.model import Config
from core.domain.matches import Lineup, MatchResult
from .live import LiveMatch


class PossessionEngine:
    def simulate(self, home: Lineup, away: Lineup, cfg: Config, rng: Random, *, neutral: bool = False) -> MatchResult:
        return LiveMatch(home, away, cfg, rng, neutral=neutral).run()
