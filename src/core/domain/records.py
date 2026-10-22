"""Records a side keeps over its history."""
from dataclasses import dataclass

from .date import Date


@dataclass(frozen=True, slots=True)
class AgeRecord:
    """One of a side's age records (see `core.world.age_records`): who set it, the day he did, and his birth, which a retired
    player no longer carries."""
    player_id: int
    date: Date
    born: Date

    @property
    def days(self) -> int:
        return self.date.ordinal() - self.born.ordinal()
