"""Source-neutral typed import records passed across the I/O boundary."""
from dataclasses import dataclass
from core.domain.date import Date
from core.domain.players import Attributes, Position


@dataclass(frozen=True, slots=True)
class SourceClub:
    id: int
    name: str
    nation: str
    division_id: int
    capacity: int
    training_facilities: int | None
    youth_recruitment: int | None
    home_kit_id: int | None
    home_kit_major_color: str | None
    home_kit_minor_color: str | None
    home_kit_third_color: str | None
    reputation: int | None = None
    is_reserve: bool = False


@dataclass(frozen=True, slots=True)
class SourcePlayer:
    id: int
    name: str
    nations: tuple[str, ...]
    positions: str
    club_id: int
    wage: int
    value: int
    born: Date
    end: Date | None
    attributes: Attributes
    current_ability: int
    potential_ability: int
    position_ratings: dict[Position, int]
    given_name: str = ""
    surname: str = ""
    common_name: str = ""
    # Source notes on the CSV's 1-20 scale; None when the export lacks the column.
    injury_proneness: float | None = None
    ambition: float | None = None
    aggression: float | None = None
