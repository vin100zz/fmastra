"""Player identities, abilities and availability."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from .date import Date


class Position(StrEnum):
    GOALKEEPER = "GB"
    CENTER_BACK = "DC"
    LEFT_BACK = "DG"
    RIGHT_BACK = "DD"
    DEFENSIVE_MIDFIELDER = "MDC"
    CENTRAL_MIDFIELDER = "MC"
    ATTACKING_MIDFIELDER = "MOC"
    LEFT_WINGER = "AILG"
    RIGHT_WINGER = "AILD"
    STRIKER = "BU"


# New attributes are appended: the first thirteen keep their index in saved vectors.
ATTRIBUTE_NAMES = ("passe", "technique", "finition", "tacle", "jeu_tete", "vision",
                   "placement", "sang_froid", "vitesse", "endurance", "reflexes", "sorties", "relance",
                   "centre", "cpa")
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
class Loan:
    """A player lent by the club that owns him: he plays for `Player.club_id` until `end`, his owner pays his wage."""
    parent_id: int
    start: Date
    end: Date


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
    substitutes: int = 0
    rating_sum: float = 0
    rating_count: int = 0
    source_current_ability: int | None = None
    source_potential_ability: int | None = None
    position_ratings: dict[Position, int] = field(default_factory=dict)
    # Propensity to commit fouls, stable like fragility and ego; 1.0 is the neutral factor.
    aggression: float = 1.0
    # Appetite for money over sport in [0, 1], stable: what a wage demand adds on top of the market.
    greed: float = 0.5
    national_team: str | None = None
    international_caps: int = 0
    international_goals: int = 0
    historical_caps: int = 0
    historical_goals: int = 0
    international_discipline: dict[int, Discipline] = field(default_factory=dict)
    loan: Loan | None = None
    # The day he joined his club's reserve (see core.world.reserves), where no match selects him; None in the first team.
    # `reserve_days` counts the days of the month spent there in stretches already over.
    reserve_since: Date | None = None
    reserve_days: int = 0
    # What his last season made of his transfer value (see `core.ai.market.performance_factor`); 1.0 is neutral.
    past_performance: float = 1.0

    @property
    def nation(self) -> str:
        return self.nationalities[0]

    @property
    def main_nation(self) -> str:
        """The nation a list shows for him: the one he plays for, else the first of his nationalities."""
        return self.national_team or self.nation

    @property
    def owner_id(self) -> int | None:
        """The club he is under contract with: the lender of a player on loan."""
        return self.loan.parent_id if self.loan is not None else self.club_id

    def available(self, competition_id: int, date: Date) -> bool:
        discipline = self.discipline.get(competition_id)
        return (self.injury is None or self.injury.end <= date) and not (discipline and discipline.suspended_matches)

    def affinity(self, position: Position) -> float:
        if self.position_ratings:
            return self.position_ratings.get(position, 1) / 20
        return 1.0 if position == self.position else self.secondary_positions.get(position, 0.0)
