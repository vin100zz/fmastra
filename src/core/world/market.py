"""Persistent transfer negotiations with budget reservations and settlement."""
from dataclasses import replace
from collections import defaultdict

from core.domain.world import World
from core.domain.offers import TransferOffer
from core.ai.market import propose_transfers, player_offer_score, seller_accepts, can_sell
from .events import OffersUpdated, PlayerSigned
from .application import apply
from .transfer_rules import recent_arrival_ids, accepts_move


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
        seller = world.clubs.get(offer.source_id)
        still_sellable = seller is None or can_sell(world.players[player_id], seller, world)
        signed = still_sellable and apply(world, PlayerSigned(player_id, offer.source_id, offer.target_id, offer.contract, offer.fee))
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
        if len(reserved) >= cfg.management.market.max_negotiations: continue
        if len(club.player_ids) + len(reserved) >= cfg.management.guardrails.max_squad: continue
        if sum(offer.ceiling for offer in reserved) + event.fee > club.transfer_budget: continue
        if club.balance - sum(offer.ceiling for offer in reserved) - event.fee < cfg.management.guardrails.min_balance: continue
        if sum(offer.contract.weekly_wage for offer in reserved) + event.contract.weekly_wage + club.wage_bill > club.wage_cap: continue
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
