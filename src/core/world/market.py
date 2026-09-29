"""Persistent transfer negotiations with budget reservations and settlement."""
from dataclasses import replace
from collections import defaultdict

from core.domain.clubs import Club
from core.domain.players import Contract
from core.domain.world import World
from core.domain.offers import TransferOffer, RESERVING_STAGES
from core.ai.market import propose_transfers, player_offer_score, seller_accepts, can_sell, asking_price
from .events import OffersUpdated, PlayerSigned
from .application import apply
from .human import is_human_club, record
from .transfer_rules import recent_arrival_ids, accepts_move, free_to_move_on


def quoted_minimum(amount: int) -> int:
    """An asking price rounded up to three significant digits, as the news feed shows amounts."""
    step = 10 ** max(0, len(str(amount)) - 3)
    return -(-amount // step) * step


def tell_buyer(world: World, offer: TransferOffer, reason: str, winner: TransferOffer | None = None) -> None:
    """Tells a human buyer why an offer ended without a signing; nothing for an AI buyer."""
    if not is_human_club(world, offer.target_id): return
    player, seller = world.players.get(offer.player_id), world.clubs.get(offer.source_id)
    name = player.name if player else world.retired.get(offer.player_id, "Le joueur")
    seller_name = seller.name if seller else "Son club"
    if reason == "closed":
        text, kind = f"Mercato fermé : votre offre pour {name} n'a pas abouti", "offer_expired"
    elif reason == "left":
        text, kind = f"{name} a quitté {seller_name} : votre offre est annulée", "offer_expired"
    else:
        kind = "offer_rejected"
        if reason == "settled":
            free = free_to_move_on(world, offer.player_id)
            text = f"{seller_name} refuse de céder {name}, arrivé récemment : pas de départ avant le {free.day_month()} {free.year}"
        elif reason == "player":
            text = f"{name} refuse de rejoindre {world.clubs[offer.target_id].name} : il vise un club plus prestigieux"
        elif reason == "seller" and not can_sell(player, seller, world):
            text = f"{seller_name} refuse de vendre {name}, indispensable à son effectif"
        elif reason == "seller" and offer.fee < (price := asking_price(player, seller, world)):
            text = f"{seller_name} refuse votre offre de {offer.fee} € pour {name} : le club en attend au moins {quoted_minimum(price)} €"
        elif reason == "seller":
            # Only an unsimulated club turns down its asking price, and only by chance.
            text = f"{seller_name} a décliné votre offre de {offer.fee} € pour {name}"
        elif reason == "outbid":
            text = f"{name} a préféré l'offre de {world.clubs[winner.target_id].name}, à {winner.contract.weekly_wage} €/semaine"
        elif seller and not can_sell(player, seller, world):
            text = f"Le transfert de {name} n'a pas pu être conclu : {seller_name} ne peut plus s'en séparer"
        else:
            text = f"Le transfert de {name} n'a pas pu être conclu : votre budget, votre masse salariale ou votre effectif ne le permettent plus"
    record(world, kind, text, offer.target_id, offer.player_id)


def offer_limit(world: World, club: Club, contract: Contract, fee: int, reserved: list[TransferOffer]) -> str | None:
    """The reservation guardrail an offer would break, shared by the AI recruitment scan and the human club's talks:
    "negotiations", "squad", "budget", "balance" or "wages"; None when the offer fits beside the reserved ones.
    The human club may run any number of talks at once."""
    cfg = world.config
    if not is_human_club(world, club.id) and len(reserved) >= cfg.management.market.max_negotiations: return "negotiations"
    if len(club.player_ids) + len(reserved) >= cfg.management.guardrails.max_squad: return "squad"
    if sum(offer.ceiling for offer in reserved) + fee > club.transfer_budget: return "budget"
    if club.balance - sum(offer.ceiling for offer in reserved) - fee < cfg.management.guardrails.min_balance: return "balance"
    if sum(offer.contract.weekly_wage for offer in reserved) + contract.weekly_wage + club.wage_bill > club.wage_cap: return "wages"
    return None


def can_open_offer(world: World, club: Club, contract: Contract, fee: int, reserved: list[TransferOffer]) -> bool:
    return offer_limit(world, club, contract, fee, reserved) is None


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
    # A player the human club has agreed a fee for is off the market until its talks end.
    reserved = {offer.player_id for offer in world.offers.values() if offer.stage in RESERVING_STAGES}
    # A player's offers are decided together once the oldest has been open for the
    # auction period, so rivals arriving in the meantime can outbid it.
    today = world.date.ordinal()
    opened: dict[int, int] = {}
    for offer in world.offers.values():
        if offer.stage is None: opened[offer.player_id] = min(opened.get(offer.player_id, today), offer.created.ordinal())
    for offer in sorted(world.offers.values(), key=lambda item: item.key):
        if offer.stage is not None:
            pending.append(offer)  # the human club's talks move on in core.world.talks, even after the window
            continue
        if not open_market:
            tell_buyer(world, offer, "closed")
            if offer.awaiting_review and is_human_club(world, offer.source_id):
                record(world, "offer_expired", f"Mercato fermé : l'offre de {world.clubs[offer.target_id].name} "
                       f"pour {world.players[offer.player_id].name} a expiré", offer.source_id, offer.player_id)
            continue
        if offer.created >= world.date or opened[offer.player_id] + cfg.management.market.auction_days > today:
            pending.append(offer)
            continue
        player = world.players.get(offer.player_id)
        if player is None or player.club_id != offer.source_id or player.id in settled or player.id in reserved:
            rejected[offer.target_id].add(offer.player_id)
            tell_buyer(world, offer, "left" if player is None or player.club_id != offer.source_id else "settled")
            continue
        buyer = world.clubs.get(offer.target_id)
        if buyer is None or not accepts_move(player, buyer, world):
            rejected[offer.target_id].add(offer.player_id)
            tell_buyer(world, offer, "player")
            continue
        seller = world.clubs.get(offer.source_id)
        if seller and is_human_club(world, seller.id):
            # Cleared the auction window: every live bid on this player surfaces together for review,
            # instead of being auto-decided by seller_accepts like an AI-controlled seller.
            if not offer.awaiting_review:
                record(world, "offer_received", f"{buyer.name} propose {offer.fee} € pour {player.name}", seller.id, player.id)
            pending.append(offer if offer.awaiting_review else replace(offer, awaiting_review=True))
            continue
        if seller and not seller_accepts(player, seller, offer.fee, world, rng):
            if not offer.countered and offer.fee < offer.ceiling:
                pending.append(replace(offer, fee=offer.ceiling, countered=True))
            else:
                rejected[offer.target_id].add(offer.player_id)
                tell_buyer(world, offer, "seller")
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
                tell_buyer(world, other, "outbid" if other.key != offer.key else "failed", offer)
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
