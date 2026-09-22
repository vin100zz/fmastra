"""Root world state and compact historical records."""
from __future__ import annotations

from dataclasses import dataclass, field
from random import Random

from core.config.model import Config
from .clubs import Club, Competition
from .date import Date
from .matches import Match
from .players import Player, Position
from .offers import TransferOffer
from .finance import FinanceSeason
from .international import InternationalState


@dataclass(slots=True)
class SeasonRecord:
    season: int
    player_id: int
    club_id: int
    competition_id: int
    minutes: float = 0
    matches: int = 0
    goals: int = 0
    assists: int = 0
    yellows: int = 0
    reds: int = 0
    rating_sum: float = 0
    rating_count: int = 0


@dataclass(frozen=True, slots=True)
class MovementSnapshot:
    born: Date
    nationalities: tuple[str, ...]
    position: Position
    rating: float
    potential_lower: float
    potential_upper: float
    weekly_wage: int
    value: int
    contract_end: Date | None
    fitness: float
    potential: float | None = None  # Absent from snapshots archived before the exact value was shown.


@dataclass(frozen=True, slots=True)
class TransferRecord:
    date: Date
    player_id: int
    source_id: int | None
    target_id: int | None
    fee: int
    kind: str = "transfer"
    season: int | None = None
    born: Date | None = None
    snapshot: MovementSnapshot | None = None


@dataclass(slots=True)
class JournalEntry:
    date: Date
    kind: str
    text: str
    club_id: int | None = None
    player_id: int | None = None
    match_id: int | None = None


@dataclass(slots=True)
class World:
    date: Date
    season: int
    seed: int
    config: Config
    players: dict[int, Player]
    clubs: dict[int, Club]
    competitions: dict[int, Competition]
    matches: dict[int, Match]
    next_id: int
    rngs: dict[str, Random] = field(default_factory=dict)
    journal: list[JournalEntry] = field(default_factory=list)
    transfers: list[TransferRecord] = field(default_factory=list)
    records: dict[str, SeasonRecord] = field(default_factory=dict)
    champions: dict[int, list[tuple[int, int]]] = field(default_factory=dict)
    trajectories: dict[int, list[tuple[int, float]]] = field(default_factory=dict)
    retired: dict[int, str] = field(default_factory=dict)
    nation_targets: dict[str, float] = field(default_factory=dict)
    level_targets: tuple[float, ...] = ()  # Initial-level shares of the active players at import; only a reference since regens follow potential_targets.
    external_target: int = 0
    # What regens must look like, measured on the players the source supplied: potential shares per class of
    # `cohorte.buckets_niveau` for the clubs playing, then the same for the dormant and free players and their nations.
    potential_targets: tuple[float, ...] = ()
    external_potential_targets: tuple[float, ...] = ()
    external_nation_targets: dict[str, float] = field(default_factory=dict)
    import_summary: dict[str, int] = field(default_factory=dict)
    last_annual_review: int = 0
    nation_names: dict[str, str] = field(default_factory=dict)
    identity_pool: dict[str, list[tuple[str, str]]] = field(default_factory=dict)
    excluded_player_ids: list[int] = field(default_factory=list)
    source_hashes: dict[str, str] = field(default_factory=dict)
    offers: dict[str, TransferOffer] = field(default_factory=dict)
    finance_history: dict[int, dict[int, FinanceSeason]] = field(default_factory=dict)
    finance_history_since: Date | None = None
    movement_history_since: Date | None = None
    # Per-nation (min, max) qualification range for C1, C3, C4; the actual season quota is drawn within these bounds.
    european_quota_ranges: dict[str, tuple[tuple[int, int], tuple[int, int], tuple[int, int]]] = field(default_factory=dict)
    # Median import reputation of each division: nation -> level -> value. Frozen at import, it caps what a club can hold below the top flight.
    reputation_ceilings: dict[str, dict[int, float]] = field(default_factory=dict)
    # Reputation held when each season opened: club -> [(season, reputation)], oldest first.
    reputation_history: dict[int, list[tuple[int, float]]] = field(default_factory=dict)
    international: InternationalState = field(default_factory=InternationalState)

    def active_clubs(self) -> list[Club]:
        return [club for club in self.clubs.values() if club.competition_id is not None]
