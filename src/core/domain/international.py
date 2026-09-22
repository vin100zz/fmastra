"""National teams and tournament editions live independently of club seasons."""
from dataclasses import dataclass, field
from .date import Date
from .matches import Match
from .players import Player


@dataclass(slots=True)
class NationalTeam:
    id: int
    code: str
    name: str
    federation: str
    strength: float
    reference_strength: float


@dataclass(slots=True)
class InternationalRecord:
    player_id: int
    name: str
    nation_id: int
    edition: int
    matches: int = 0
    goals: int = 0
    assists: int = 0
    minutes: float = 0


@dataclass(slots=True)
class InternationalCareer:
    national_team: str | None
    international_caps: int
    international_goals: int
    historical_caps: int
    historical_goals: int


@dataclass(slots=True)
class NationalCamp:
    nation_id: int
    edition: int
    start: Date
    end: Date
    finals: bool
    player_ids: list[int] = field(default_factory=list)
    first_match_played: bool = False


@dataclass(slots=True)
class InternationalEdition:
    year: int
    kind: str
    qualification_groups: list[list[int]] = field(default_factory=list)
    final_groups: list[list[int]] = field(default_factory=list)
    qualifiers: list[int] = field(default_factory=list)
    winner_id: int | None = None
    runner_up_id: int | None = None

    @property
    def competition_id(self) -> int:
        return -100000 - self.year

    @property
    def name(self) -> str:
        return f"{'Euro' if self.kind == 'euro' else 'Coupe du monde'} {self.year}"


@dataclass(slots=True)
class InternationalState:
    nations: dict[int, NationalTeam] = field(default_factory=dict)
    editions: dict[int, InternationalEdition] = field(default_factory=dict)
    matches: dict[int, Match] = field(default_factory=dict)
    # Campaign-only players never enter the club player registry or transfer market.
    temporary: dict[int, Player] = field(default_factory=dict)
    temporary_editions: dict[int, int] = field(default_factory=dict)
    camps: dict[int, NationalCamp] = field(default_factory=dict)
    # The most recent camp released for each nation, kept after `camps` drops it so the squad stays visible between windows.
    last_camps: dict[int, NationalCamp] = field(default_factory=dict)
    records: dict[str, InternationalRecord] = field(default_factory=dict)
    retired_careers: dict[int, InternationalCareer] = field(default_factory=dict)
    deferred_retirements: list[int] = field(default_factory=list)
    next_temporary_id: int = -1
