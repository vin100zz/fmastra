"""National teams and tournament editions live independently of club seasons."""
from dataclasses import dataclass, field
from .date import Date
from .matches import Match
from .players import Player
from .records import AgeRecord


@dataclass(slots=True)
class NationalTeam:
    id: int
    code: str
    name: str
    federation: str
    strength: float
    reference_strength: float
    # The formation of its current or last camp (see `core.world.international_selection`); empty before its first.
    formation: str = ""
    # The formation its whole pool fills best, revised once a year: the places a dual national weighs his chances by.
    reference_formation: str = ""


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
    # The match ratings he was given in this edition, as a season record keeps them for a club.
    rating_sum: float = 0
    rating_count: int = 0


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


EDITION_NAMES = {"euro": "Euro", "world": "Coupe du monde", "nations": "Ligue des nations"}


@dataclass(slots=True)
class InternationalEdition:
    """A Euro, a World Cup or a Nations League, known by the year of its finals: the tournaments in even years, the Nations
    League in the odd year before each of them, so that no two editions share a year."""
    year: int
    kind: str
    qualification_groups: list[list[int]] = field(default_factory=list)
    final_groups: list[list[int]] = field(default_factory=list)
    # The qualifiers of a tournament; the four group winners of a Nations League's first division, its semi-finalists.
    qualifiers: list[int] = field(default_factory=list)
    winner_id: int | None = None
    runner_up_id: int | None = None
    # The first and the last day of each window its group matches are played in, two matches a window.
    windows: list[tuple[Date, Date]] = field(default_factory=list)
    # A Nations League's divisions, A to D, each a list of groups.
    divisions: list[list[list[int]]] = field(default_factory=list)

    @property
    def competition_id(self) -> int:
        return -100000 - self.year

    @property
    def name(self) -> str:
        return f"{EDITION_NAMES[self.kind]} {self.year}"


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
    # The age records of each selection, as a club keeps its own (`World.age_records`).
    age_records: dict[int, dict[str, AgeRecord]] = field(default_factory=dict)
    # Each selection's strength when each season opened: nation -> [(season, strength)], oldest first.
    strength_history: dict[int, list[tuple[int, float]]] = field(default_factory=dict)
