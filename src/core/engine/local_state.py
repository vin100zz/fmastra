"""Mutable match-local state; the world and its players remain untouched."""
from __future__ import annotations

from dataclasses import dataclass, field

from core.config.model import Config
from core.domain.matches import Lineup, LineupSlot, MatchEvent, PlayerMatchStats, TeamStats
from core.domain.players import Player, Position


@dataclass(slots=True)
class TeamState:
    club_id: int
    active: list[LineupSlot]
    bench: list[Player]
    fitness: dict[int, float]
    players: dict[int, Player]
    stats: TeamStats = field(default_factory=TeamStats)
    individual: dict[int, PlayerMatchStats] = field(default_factory=dict)
    substituted: int = 0
    windows: int = 0
    block_height: float = 0
    initial_block: float = 0
    goals: int = 0
    dismissed: set[int] = field(default_factory=set)
    injured: set[int] = field(default_factory=set)
    zones: dict[str, list[list[float]]] = field(default_factory=dict)
    next_refresh: float = 0
    next_substitution: float = 0

    @classmethod
    def from_lineup(cls, lineup: Lineup, cfg: Config) -> TeamState:
        players = {slot.player.id: slot.player for slot in lineup.slots}
        players.update((player.id, player) for player in lineup.bench)
        return cls(lineup.club_id, list(lineup.slots), list(lineup.bench),
                   {pid: player.fitness for pid, player in players.items()}, players,
                   individual={slot.player.id: PlayerMatchStats(final_fitness=slot.player.fitness) for slot in lineup.slots},
                   block_height=lineup.block_height, initial_block=lineup.block_height,
                   next_substitution=cfg.states.substitutions.first_evaluation_minute * 60)

    def goalkeeper(self) -> LineupSlot:
        if not self.active:
            raise ValueError("No players left on the pitch")
        return next((slot for slot in self.active if slot.position == Position.GOALKEEPER), self.active[0])


@dataclass(slots=True)
class MatchLog:
    events: list[MatchEvent] = field(default_factory=list)
    second: float = 0
    period: int = 1
    possession: int = 0
    shots: int = 0

    def emit(self, kind: str, team: TeamState, player_id: int | None = None, secondary_id: int | None = None,
             zone: int | None = None, lane: int | None = None, shot_id: int | None = None,
             xg: float | None = None, detail: str = "") -> None:
        self.events.append(MatchEvent(round(self.second), self.period, len(self.events), kind, team.club_id,
                                      player_id, secondary_id, zone, lane, self.possession, shot_id, xg, detail))
