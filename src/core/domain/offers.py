"""Offers awaiting settlement; their reservations are derived from these records."""
from dataclasses import dataclass
from .date import Date
from .players import Contract


@dataclass(frozen=True, slots=True)
class TransferOffer:
    key: str
    created: Date
    player_id: int
    source_id: int | None
    target_id: int
    contract: Contract
    fee: int
    ceiling: int
    score: float
    countered: bool = False
    awaiting_review: bool = False  # cleared the auction window; a human seller must accept or refuse it


@dataclass(frozen=True, slots=True)
class RenewalProposal:
    """A renewal a human club's player would sign, awaiting the club's response."""
    player_id: int
    club_id: int
    contract: Contract
    created: Date
