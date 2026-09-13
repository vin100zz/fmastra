"""Club and competition state."""
from dataclasses import dataclass, field
from enum import StrEnum


class ClubStatus(StrEnum):
    ACTIVE = "actif"
    DORMANT = "dormant"


@dataclass(frozen=True, slots=True)
class ClubPersonality:
    risk_appetite: float
    youth_preference: float
    wage_aggression: float
    negotiation_patience: float


@dataclass(slots=True)
class Club:
    id: int
    name: str
    nation: str
    source_division_id: int
    competition_id: int | None
    status: ClubStatus
    capacity: int | None
    reputation: float
    academy: float
    formation: str
    personality: ClubPersonality
    player_ids: list[int] = field(default_factory=list)
    income: int = 0
    funding_factor: float = 1
    transfer_budget: int = 0
    wage_cap: int = 0
    balance: int = 0
    wage_bill: int = 0
    accounting_remainder: int = 0
    previous_rank: int | None = None
    season_spent: int = 0
    season_sales: int = 0


@dataclass(slots=True)
class Competition:
    id: int
    name: str
    nation: str
    level: int
    club_ids: list[int]
    match_ids: list[int] = field(default_factory=list)
