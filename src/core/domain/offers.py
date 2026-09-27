"""Offers awaiting settlement; their reservations are derived from these records."""
from dataclasses import dataclass
from .date import Date
from .players import Contract

# Stages of the human club's talks (see core.world.talks). From an agreed fee on, the player is reserved.
FEE_TALKS, AGREED_FEE, WAGE_TALKS, SIGNING = "indemnite", "accord_club", "salaire", "signature"
RESERVING_STAGES = frozenset({AGREED_FEE, WAGE_TALKS, SIGNING})


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
    # The human club's talks (see core.world.talks) instead of an auction: None for every other offer.
    stage: str | None = None
    due: Date | None = None  # when the talks move on by themselves: the player's answer, then his arrival
    rounds: int = 0  # offers refused in the current stage
    counter: int | None = None  # the other side's last demand: a fee, then a weekly wage


@dataclass(frozen=True, slots=True)
class RenewalProposal:
    """A renewal a human club's player would sign, awaiting the club's response."""
    player_id: int
    club_id: int
    contract: Contract
    created: Date
