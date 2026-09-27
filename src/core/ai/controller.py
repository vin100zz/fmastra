"""The v1 club decision facade; no direct world mutation."""
from random import Random
from typing import TYPE_CHECKING
from core.config.model import Config
from core.domain.clubs import Club
from core.domain.players import Player
from core.domain.world import World
from core.domain.matches import Lineup
from core.engine.local_state import TeamState
from core.math import clamp
from .selection import LineupContext, select_lineup
from .substitutions import Substitution, choose_substitution

if TYPE_CHECKING:
    from .market import Need


class AIController:
    automatic = True

    def __init__(self, cfg: Config, rng: Random) -> None:
        self.cfg, self.rng = cfg, rng

    def select_lineup(self, context: LineupContext) -> Lineup:
        return select_lineup(context, self.cfg)

    def decide_substitution(self, state: TeamState, forced_id: int | None = None, *,
                            minute: float = 0, goal_difference: int = 0,
                            allow_rotation: bool = True) -> Substitution | None:
        return choose_substitution(state, self.cfg, forced_id, minute=minute,
                                   goal_difference=goal_difference, allow_rotation=allow_rotation)

    def late_block(self, state: TeamState, opponent_goals: int, second: float) -> float:
        """A side behind pushes its block up over the last minutes of the match."""
        timing, heights = self.cfg.engine.timing, self.cfg.formations.block_height
        trailing = max(0, opponent_goals - state.goals)
        fraction = clamp((second - (timing.match_seconds - heights.late_match_minutes * 60)) /
                         (heights.late_match_minutes * 60), 0, 1)
        return clamp(state.initial_block + trailing * fraction * heights.late_trailing_adjustment, heights.min, heights.max)

    def evaluate_needs(self, club: Club, players: list[Player]) -> list["Need"]:
        from .market import needs_for
        return needs_for(club, players, self.cfg)

    def respond_to_offer(self, player: Player, seller: Club, fee: int, world: World) -> bool:
        from .market import seller_accepts
        return seller_accepts(player, seller, fee, world, self.rng)
