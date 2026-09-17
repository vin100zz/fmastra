"""Match inputs, timelines and results shared by both engines."""
from __future__ import annotations

from dataclasses import dataclass, field

from .date import Date
from .players import Player, Position


@dataclass(frozen=True, slots=True)
class LineupSlot:
    player: Player
    position: Position


@dataclass(slots=True)
class Lineup:
    club_id: int
    formation: str
    slots: list[LineupSlot]
    bench: list[Player]
    block_height: float = 0


@dataclass(frozen=True, slots=True)
class MatchEvent:
    second: int
    period: int
    sequence: int
    kind: str
    team_id: int
    player_id: int | None = None
    secondary_id: int | None = None
    zone: int | None = None
    lane: int | None = None
    possession_id: int | None = None
    shot_id: int | None = None
    xg: float | None = None
    detail: str = ""


@dataclass(slots=True)
class TeamStats:
    shots: int = 0
    on_target: int = 0
    xg: float = 0
    possession_seconds: float = 0
    possessions: int = 0
    corners: int = 0
    free_kicks: int = 0
    yellows: int = 0
    reds: int = 0
    set_piece_goals: int = 0
    lane_attacks: list[int] = field(default_factory=lambda: [0, 0, 0])


@dataclass(slots=True)
class PlayerMatchStats:
    minutes: float = 0
    goals: int = 0
    assists: int = 0
    saves: int = 0
    yellows: int = 0
    red: bool = False
    direct_red: bool = False
    rating: float | None = None
    final_fitness: float = 1


@dataclass(slots=True)
class MatchResult:
    home_goals: int
    away_goals: int
    engine: str
    events: list[MatchEvent] = field(default_factory=list)
    home_stats: TeamStats | None = None
    away_stats: TeamStats | None = None
    player_stats: dict[int, PlayerMatchStats] = field(default_factory=dict)
    home_lineup: list[tuple[int, str]] = field(default_factory=list)
    away_lineup: list[tuple[int, str]] = field(default_factory=list)
    home_bench: list[int] = field(default_factory=list)
    away_bench: list[int] = field(default_factory=list)
    duration: int = 0
    status: str = "played"
    penalties: tuple[int, int] | None = None
    winner_id: int | None = None
    temporary_players: dict[int, str] = field(default_factory=dict)


@dataclass(slots=True)
class Match:
    id: int
    competition_id: int
    season: int
    round_number: int
    date: Date
    home_id: int
    away_id: int
    result: MatchResult | None = None
    neutral: bool = False
