"""Source-neutral typed import records passed across the I/O boundary."""
from dataclasses import dataclass
from core.domain.date import Date


@dataclass(frozen=True, slots=True)
class SourceClub:
    id: int
    name: str
    nation: str
    division_id: int
    capacity: int


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
