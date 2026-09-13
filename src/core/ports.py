"""Explicit extension points for engines, competitions and club decisions."""
from random import Random
from typing import Protocol

from core.config.model import Config
from core.domain.clubs import Competition, Club
from core.domain.players import Player
from core.domain.world import World
from core.domain.date import Date
from core.engine.local_state import TeamState
from core.ai.substitutions import Substitution
from core.ai.market import Need
from core.world.calendar import Standing
from core.domain.matches import Lineup, Match, MatchResult
from core.ai.selection import LineupContext


class MatchEngine(Protocol):
    def simulate(self, home: Lineup, away: Lineup, cfg: Config, rng: Random) -> MatchResult: ...


class ClubController(Protocol):
    def select_lineup(self, context: LineupContext) -> Lineup: ...
    def decide_substitution(self, state: TeamState, forced_id: int | None = None) -> Substitution | None: ...
    def evaluate_needs(self, club: Club, players: list[Player]) -> list[Need]: ...
    def respond_to_offer(self, player: Player, seller: Club, fee: int, world: World) -> bool: ...


class CompetitionRules(Protocol):
    def schedule(self, competition: Competition, season: int, next_id: int, cfg: Config, rng: Random) -> list[Match]: ...
    def standings(self, competition: Competition, matches: list[Match], cfg: Config) -> list[Standing]: ...
