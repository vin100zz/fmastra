"""The v1 club decision facade; no direct world mutation."""
from random import Random
from typing import TYPE_CHECKING
from core.config.model import Config
from core.domain.clubs import Club
from core.domain.players import Player
from core.domain.world import World
from core.domain.matches import Lineup
from core.engine.local_state import TeamState
from .selection import LineupContext, select_lineup
from .substitutions import Substitution, choose_substitution

if TYPE_CHECKING:
    from .market import Need


class AIController:
    def __init__(self, cfg: Config, rng: Random) -> None:
        self.cfg, self.rng = cfg, rng

    def select_lineup(self, context: LineupContext) -> Lineup:
        return select_lineup(context, self.cfg)

    def decide_substitution(self, state: TeamState, forced_id: int | None = None) -> Substitution | None:
        return choose_substitution(state, self.cfg, forced_id)

    def evaluate_needs(self, club: Club, players: list[Player]) -> list["Need"]:
        from .market import needs_for
        return needs_for(club, players, self.cfg)

    def respond_to_offer(self, player: Player, seller: Club, fee: int, world: World) -> bool:
        from .market import seller_accepts
        return seller_accepts(player, seller, fee, world, self.rng)
