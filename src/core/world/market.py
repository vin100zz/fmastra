"""Persistent transfer negotiations with budget reservations and settlement."""
from dataclasses import replace
from collections import defaultdict

from core.domain.clubs import Club
from core.domain.players import Contract
from core.domain.world import World
from core.domain.offers import TransferOffer
from core.ai.market import propose_transfers, player_offer_score, seller_accepts, can_sell
from .events import OffersUpdated, PlayerSigned
from .application import apply
from .human import is_human_club, record
from .transfer_rules import recent_arrival_ids, accepts_move


def can_open_offer(world: World, club: Club, contract: Contract, fee: int, reserved: list[TransferOffer]) -> bool:
    """Reservation guardrails shared by the AI recruitment scan and a human club's outgoing offer."""
    cfg = world.config
    if len(reserved) >= cfg.management.market.max_negotiations: return False
    if len(club.player_ids) + len(reserved) >= cfg.management.guardrails.max_squad: return False
    if sum(offer.ceiling for offer in reserved) + fee > club.transfer_budget: return False
    if club.balance - sum(offer.ceiling for offer in reserved) - fee < cfg.management.guardrails.min_balance: return False
    if sum(offer.contract.weekly_wage for offer in reserved) + contract.weekly_wage + club.wage_bill > club.wage_cap: return False
    return True


def resolve_accepted_offer(world: World, offer: TransferOffer) -> bool:
    """Signs the winning offer for a player if the seller can still sell; callers reject the rest."""
    seller = world.clubs.get(offer.source_id)
    can_still_sell = seller is None or can_sell(world.players[offer.player_id], seller, world)
    return can_still_sell and apply(world, PlayerSigned(offer.player_id, offer.source_id, offer.target_id, offer.contract, offer.fee))


def settle_offers(world: World, open_market: bool) -> dict[int, set[int]]:
    pending = []
    accepted = defaultdict(list)
    rejected = defaultdict(set)
    cfg, rng = world.config, world.rngs["market"]
    settled = recent_arrival_ids(world)
    # A player's offers are decided together once the oldest has been open for the
    # auction period, so rivals arriving in the meantime can outbid it.
    today = world.date.ordinal()
    opened: dict[int, int] = {}
    for offer in world.offers.values():
        opened[offer.player_id] = min(opened.get(offer.player_id, today), offer.created.ordinal())
    for offer in sorted(world.offers.values(), key=lambda item: item.key):
        if not open_market: continue
        if offer.created >= world.date or opened[offer.player_id] + cfg.management.market.auction_days > today:
            pending.append(offer)
            continue
        player = world.players.get(offer.player_id)
        if player is None or player.club_id != offer.source_id or player.id in settled:
            rejected[offer.target_id].add(offer.player_id)
            continue
        buyer = world.clubs.get(offer.target_id)
        if buyer is None or not accepts_move(player, buyer, world):
            rejected[offer.target_id].add(offer.player_id)
            continue
        seller = world.clubs.get(offer.source_id)
        if seller and is_human_club(world, seller.id):
            # Cleared the auction window: every live bid on this player surfaces together for review,
            # instead of being auto-decided by seller_accepts like an AI-controlled seller.
            if not offer.awaiting_review:
                record(world, "offer_received", f"{buyer.name} propose {offer.fee} € pour {player.name}.", seller.id, player.id)
            pending.append(offer if offer.awaiting_review else replace(offer, awaiting_review=True))
            continue
        if seller and not seller_accepts(player, seller, offer.fee, world, rng):
            if not offer.countered and offer.fee < offer.ceiling:
                pending.append(replace(offer, fee=offer.ceiling, countered=True))
            else:
                rejected[offer.target_id].add(offer.player_id)
            continue
        accepted[offer.player_id].append(offer)
    # Reservations are released before final constraints are checked by the applicator.
    apply(world, OffersUpdated(pending))
    for player_id, offers in sorted(accepted.items()):
        highest = max(offer.score for offer in offers)
        tied = sorted((offer for offer in offers if offer.score == highest), key=lambda item: item.key)
        offer = tied[rng.randrange(len(tied))]
        signed = resolve_accepted_offer(world, offer)
        for other in offers:
            if other.key != offer.key or not signed:
                rejected[other.target_id].add(player_id)
    return dict(rejected)


def open_offers(world: World, open_market: bool, rejected: dict[int, set[int]] | None = None) -> None:
    cfg, rng = world.config, world.rngs["market"]
    proposed = propose_transfers(world, rng, emergency=not open_market, rejected=rejected)
    if not open_market:
        # Emergency free-agent recruitment protects the contractual minimum.
        for event in proposed:
            if event.source_id is None: apply(world, event)
        return
    offers = list(world.offers.values())
    for event in proposed:
        club = world.clubs[event.target_id]
        reserved = [offer for offer in offers if offer.target_id == club.id]
        if not can_open_offer(world, club, event.contract, event.fee, reserved): continue
        player = world.players[event.player_id]
        score = player_offer_score(player, club, event.contract.weekly_wage, world) + rng.gauss(0, cfg.management.market.player_score.noise)
        fee = round(event.fee * cfg.management.market.counteroffer_ratio)
        offers.append(TransferOffer(f"{world.date.iso()}:{club.id}:{player.id}", world.date, player.id,
                                    event.source_id, club.id, event.contract, fee, event.fee, score))
    apply(world, OffersUpdated(offers))


def ensure_minimums(world: World) -> None:
    """Recruit free agents immediately when departures break a hard squad minimum."""
    cfg = world.config
    def deficit() -> int:
        return sum(max(0, cfg.management.guardrails.min_squad - len(club.player_ids))
                   + max(0, cfg.management.guardrails.min_goalkeepers - sum(world.players[pid].position == "GB" for pid in club.player_ids))
                   for club in world.active_clubs())
    remaining = deficit()
    for _ in range(remaining):
        before = remaining
        for event in propose_transfers(world, world.rngs["market"], emergency=True):
            if event.source_id is None: apply(world, event)
        remaining = deficit()
        if remaining == 0 or remaining >= before: break
