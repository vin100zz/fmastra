"""Match inputs, timelines and results shared by both engines."""
from __future__ import annotations

from dataclasses import dataclass, field

from .date import Date
from .players import Player, Position


@dataclass(frozen=True, slots=True)
class LineupSlot:
    player: Player
    position: Position


@dataclass(frozen=True, slots=True)
class PlayingTimePriority:
    satisfaction: float = 0
    development: float = 0


@dataclass(slots=True)
class Lineup:
    club_id: int
    formation: str
    slots: list[LineupSlot]
    bench: list[Player]
    block_height: float = 0
    playing_time: dict[int, PlayingTimePriority] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class SubmittedLineup:
    """A human-submitted lineup, stored by player id rather than embedded Player objects
    so it never holds a stale copy of state that keeps evolving in world.players."""
    club_id: int
    formation: str
    slots: list[tuple[int, str]]  # (player_id, position)
    bench: list[int]  # player_ids


@dataclass(frozen=True, slots=True)
class LiveOrder:
    """A decision of the human club during its live match. It is replayed at the same point
    (after `possession`, during the break when `halftime`) to rebuild the match exactly."""
    possession: int
    halftime: bool
    kind: str  # "substitution" | "reposition" | "mentality" | "auto"
    outgoing_id: int | None = None
    incoming_id: int | None = None
    position: str = ""
    slots: tuple[tuple[int, str], ...] = ()
    mentality: str = ""


@dataclass(slots=True)
class LiveMatchRecord:
    """The human club's match being played live: its lineup and orders are enough to rebuild it.

    `reached` counts the possessions already handed to the viewer, `floor` those of the segments
    before the last one: a rewind for new orders never goes below `floor` nor beyond `reached`."""
    match_id: int
    lineup: SubmittedLineup
    orders: list[LiveOrder] = field(default_factory=list)
    reached: int = 0
    floor: int = 0


# The engine logs these for its own bookkeeping. TeamStats already counts corners, free kicks,
# fouls and offsides, and no view lists them, so a stored result keeps every other kind.
TRANSIENT_EVENT_KINDS = frozenset({"possession", "circulation", "progress", "delivery", "turnover", "corner", "free_kick",
                                   "foul", "penalty", "throw_in", "offside"})
# The replay draws the possessions that led to a shot, so their build-up survives storage.
REPLAY_EVENT_KINDS = frozenset({"possession", "circulation", "progress", "delivery", "corner", "free_kick", "foul", "penalty",
                                "throw_in"})
# A match without its replay keeps what its page and the round lists show: goals, cards, injuries, substitutions, the
# whistles, the penalties missed in play (their shot and its save or miss) and the shoot-out.
FACT_EVENT_KINDS = frozenset({"kickoff", "goal", "yellow", "red", "injury", "substitution", "period_end"})


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
    # Conservation passes, forward passes and long balls; None for a match played before they were counted.
    passes: int | None = None
    passes_attempted: int | None = None
    corners: int = 0
    # Free kicks struck at goal or played into the box.
    free_kicks: int = 0
    # Fouls committed and offsides; None for a match played before they were counted.
    fouls: int | None = None
    offsides: int | None = None
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
    # The players of each club who could not take part, "injured" or "suspended", as it stood at kickoff.
    home_absent: dict[int, str] = field(default_factory=dict)
    away_absent: dict[int, str] = field(default_factory=dict)
    duration: int = 0
    status: str = "played"
    penalties: tuple[int, int] | None = None
    winner_id: int | None = None
    temporary_players: dict[int, str] = field(default_factory=dict)
    # The number each player of the match sheet wore, the starters and the bench of both clubs.
    shirts: dict[int, int] = field(default_factory=dict)
    # Whether its events keep the build-up of the chances the 2D replay draws: only the user's club's matches do.
    replay: bool = True


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
    first_leg_id: int | None = None


def stored_events(events: list[MatchEvent], replay: bool = True) -> list[MatchEvent]:
    """The events a saved result keeps: every listed kind, plus the build-up of each chance and the loss of the ball
    that gave the chance's side the ball, or the foul that stopped its counter. Without the `replay`, only its facts."""
    if not replay:
        penalties = {event.shot_id for event in events if event.kind == "shot" and event.detail == "penalty"} - {None}
        return [event for event in events if event.kind in FACT_EVENT_KINDS or event.period == 3
                or (event.shot_id in penalties and event.kind in ("shot", "save", "off_target"))]
    chances = {event.possession_id for event in events if event.kind == "shot"}
    return [event for event in events if event.kind not in TRANSIENT_EVENT_KINDS
            or (event.kind in REPLAY_EVENT_KINDS and event.possession_id in chances)
            or (event.kind in ("turnover", "foul") and event.possession_id + 1 in chances)]


def store_events(result: MatchResult, replay: bool) -> None:
    """Trims a played result to the events it keeps (see `stored_events`), with or without its replay."""
    result.events = stored_events(result.events, replay and result.replay)
    result.replay = replay and result.replay
