"""Player identities, abilities and availability."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from .date import Date


class Position(StrEnum):
    GOALKEEPER = "GB"
    CENTER_BACK = "DC"
    LEFT_BACK = "DL"
    RIGHT_BACK = "DR"
    DEFENSIVE_MIDFIELDER = "MDC"
    CENTRAL_MIDFIELDER = "MC"
    ATTACKING_MIDFIELDER = "MOC"
    LEFT_WINGER = "AILG"
    RIGHT_WINGER = "AILD"
    STRIKER = "BU"


ATTRIBUTE_NAMES = ("passe", "technique", "finition", "tacle", "jeu_tete", "vision",
                   "placement", "sang_froid", "vitesse", "endurance", "reflexes", "sorties", "relance")
ATTRIBUTE_INDEX = {name: index for index, name in enumerate(ATTRIBUTE_NAMES)}


@dataclass(frozen=True, slots=True)
class Attributes:
    values: tuple[float, ...]

    def __post_init__(self) -> None:
        if len(self.values) != len(ATTRIBUTE_NAMES):
            raise ValueError("Invalid attribute count")

    def get(self, name: str) -> float:
        return self.values[ATTRIBUTE_INDEX[name]]


@dataclass(slots=True)
class Contract:
    weekly_wage: int
    end: Date
    signed: Date
    role: str = "rotation"
    synthetic: bool = True


@dataclass(slots=True)
class Injury:
    start: Date
    end: Date
    severity: str
    penalty_applied: bool = False


@dataclass(slots=True)
class Discipline:
    yellows: int = 0
    served_thresholds: list[int] = field(default_factory=list)
    suspended_matches: int = 0


@dataclass(slots=True)
class Player:
    id: int
    name: str
    surname: str
    given_name: str
    nationalities: tuple[str, ...]
    born: Date
    position: Position
    secondary_positions: dict[Position, float]
    attributes: Attributes
    rating: float
    potential: float
    fitness: float
    form: float
    morale: float
    fragility: float
    ego: float
    club_id: int | None
    contract: Contract | None
    injury: Injury | None = None
    discipline: dict[int, Discipline] = field(default_factory=dict)
    monthly_minutes: float = 0
    season_minutes: float = 0
    season_goals: int = 0
    season_assists: int = 0
    appearances: int = 0
    rating_sum: float = 0
    rating_count: int = 0
    source_current_ability: int | None = None
    source_potential_ability: int | None = None
    position_ratings: dict[Position, int] = field(default_factory=dict)

    @property
    def nation(self) -> str:
        return self.nationalities[0]

    def available(self, competition_id: int, date: Date) -> bool:
        discipline = self.discipline.get(competition_id)
        return (self.injury is None or self.injury.end <= date) and not (discipline and discipline.suspended_matches)

    def affinity(self, position: Position) -> float:
        if self.position_ratings:
            return self.position_ratings.get(position, 1) / 20
        return 1.0 if position == self.position else self.secondary_positions.get(position, 0.0)
