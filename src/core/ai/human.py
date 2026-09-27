"""The human club's side of a live match: no automatic decision, only the orders it gives."""
from core.config.model import Config
from core.engine.local_state import TeamState
from core.math import clamp


class HumanController:
    automatic = False

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def decide_substitution(self, state: TeamState, forced_id: int | None = None, **_) -> None:
        return None

    def late_block(self, state: TeamState, opponent_goals: int, second: float) -> float:
        """The block stays where the chosen mentality puts it, whatever the score."""
        heights = self.cfg.formations.block_height
        return clamp(state.initial_block + heights.mentalities[state.mentality], heights.min, heights.max)
