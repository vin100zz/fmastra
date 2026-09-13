"""Typed commands produced by rules and consumed by the world applicator."""
from dataclasses import dataclass, field

from core.domain.date import Date
from core.domain.players import Attributes, Contract, Injury, Player
from core.domain.matches import Match, MatchResult
from core.domain.offers import TransferOffer


@dataclass(frozen=True, slots=True)
class PlayerChanged:
    player_id: int
    attributes: Attributes | None = None
    rating: float | None = None
    fitness: float | None = None
    form: float | None = None
    morale: float | None = None
    injury: Injury | None = None
    healed: bool = False
    reset_month: bool = False


@dataclass(frozen=True, slots=True)
class MatchPlayed:
    match_id: int
    result: MatchResult
    injuries: dict[int, Injury]
    suspensions: dict[int, int]
    forms: dict[int, float]


@dataclass(frozen=True, slots=True)
class PlayerSigned:
    player_id: int
    source_id: int | None
    target_id: int
    contract: Contract
    fee: int
    renewal: bool = False


@dataclass(frozen=True, slots=True)
class PlayerReleased:
    player_id: int
    retirement: bool = False


@dataclass(frozen=True, slots=True)
class PlayerGenerated:
    player: Player
    class_fallback: bool = False


@dataclass(frozen=True, slots=True)
class FinancePosted:
    club_id: int
    change: int
    remainder: int


@dataclass(frozen=True, slots=True)
class BudgetRenewed:
    club_id: int
    income: int
    wage_cap: int
    transfer_budget: int
    rank: int | None


@dataclass(frozen=True, slots=True)
class SeasonOpened:
    year: int
    matches: list[Match]
    champions: dict[int, int]


@dataclass(frozen=True, slots=True)
class DateAdvanced:
    date: Date


@dataclass(frozen=True, slots=True)
class OffersUpdated:
    offers: list[TransferOffer]


WorldEvent = PlayerChanged | MatchPlayed | PlayerSigned | PlayerReleased | PlayerGenerated | FinancePosted | BudgetRenewed | SeasonOpened | DateAdvanced | OffersUpdated
