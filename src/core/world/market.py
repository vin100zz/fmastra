"""Persistent transfer negotiations with budget reservations and settlement.

An offer reserves a fee on its buyer's budget and may rise above it, as far as the buyer's own price limit and
means allow (see `reach`): when rivals bid for the same player (see `outbid`), and for a player of the human club
each time it turns the offer down (see `core.world.sales`).
"""
from dataclasses import replace
from collections import defaultdict
from math import ceil

from core.domain.clubs import Club
from core.domain.players import Contract
from core.domain.world import NewsLine, World
from core.domain.offers import TransferOffer, RESERVING_STAGES
from core.ai.market import propose_transfers, player_offer_score, can_sell, asking_price, opening_share
from .events import OffersUpdated, PlayerSigned
from .application import apply
from .human import is_human_club, listed_price, record
from .news import answer_offer, offer_received
from .transfer_rules import recent_arrival_ids, accepts_move, free_to_move_on


def quoted_minimum(amount: int) -> int:
    """An asking price rounded up to three significant digits, as the news feed shows amounts."""
    step = 10 ** max(0, len(str(amount)) - 3)
    return -(-amount // step) * step


def quoted_offer(amount: int) -> int:
    """A fee offered, cut down to three significant digits: it never reads above what the buyer meant to pay."""
    step = 10 ** max(0, len(str(max(0, amount))) - 3)
    return max(0, amount) // step * step


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
    clubs = dict.fromkeys(cid for cid in (offer.source_id, winner.target_id if winner else None) if cid is not None)
    record(world, kind, text, offer.target_id, offer.player_id, lines=tuple(NewsLine(club_id=cid) for cid in clubs))


def offer_limit(world: World, club: Club, contract: Contract, fee: int, reserved: list[TransferOffer]) -> str | None:
    """The reservation guardrail an offer would break, shared by the AI recruitment scan and the human club's talks:
    "negotiations", "squad", "budget", "balance" or "wages"; None when the offer fits beside the reserved ones.
    The human club may run any number of talks at once."""
    cfg = world.config
    if not is_human_club(world, club.id) and len(reserved) >= cfg.management.market.max_negotiations: return "negotiations"
    if club.squad_size + len(reserved) >= cfg.management.guardrails.max_squad: return "squad"
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


def spending_room(world: World, club: Club, reserved: list[TransferOffer]) -> int:
    """What a club can still commit to a fee beside what these offers reserve."""
    return (min(club.transfer_budget, club.balance - world.config.management.guardrails.min_balance)
            - sum(offer.ceiling for offer in reserved))


def reach(world: World, offer: TransferOffer) -> int:
    """The highest fee an offer can rise to: its buyer's price limit, within the means its other offers leave it,
    and never less than it already offers. An offer without a limit of its own stops at what it reserved."""
    if offer.limit is None: return max(offer.fee, offer.ceiling)
    others = [other for other in world.offers.values() if other.target_id == offer.target_id and other.key != offer.key]
    return max(offer.fee, min(offer.limit, spending_room(world, world.clubs[offer.target_id], others)))


def outbid(world: World, bids: list[TransferOffer], asked: int | None = None) -> dict[str, int]:
    """The fee of each of the offers rivalling for one player, once they have raised each other.

    Every buyer follows as far as it can reach: the keenest stops one step above the reach of the next, the others
    end at their own. Alone, an offer does not move. `asked` is the price asked for the player, known to all: the
    bidding starts from it. Without one (a player of the human club), each offer starts from what it already is.
    """
    step = world.config.management.market.offers.outbid_step
    ranked = sorted(((reach(world, offer), offer) for offer in bids), key=lambda item: (-item[0], item[1].key))
    fees = {}
    for index, (top, offer) in enumerate(ranked):
        start = offer.fee if asked is None else asked
        fees[offer.key] = top if index else min(top, max(start, ceil(ranked[1][0] * (1 + step)) if len(ranked) > 1 else start))
    return fees


def surface(world: World, bids: list[TransferOffer]) -> list[TransferOffer]:
    """The offers for a player of the human club that reach it today, beside those still awaiting its answer.

    Rivals raise each other first (see `outbid`). Each new offer, and each one raised since the club was told of it,
    is told to it: a raised offer no longer stands at the fee its earlier message gave.
    """
    fees, shown = outbid(world, bids), []
    for offer in bids:
        told, fee = offer.awaiting_review, fees[offer.key]
        if told and fee == offer.fee:
            shown.append(offer)
            continue
        if told: answer_offer(world, offer.key, "raised")
        # Raised by its rivals before the club ever saw it, an offer is simply made at its fee.
        offer = replace(offer, fee=fee, ceiling=max(offer.ceiling, fee), countered=offer.countered or told, awaiting_review=True, due=None)
        offer_received(world, offer)
        shown.append(offer)
    return shown


def settle_offers(world: World, open_market: bool) -> dict[int, set[int]]:
    """Decides the offers that are due, player by player, and returns the players each club failed to sign.

    The offers for a player are decided together once the oldest has been open for the auction period. A club of
    the AI sells at its asking price to a lone buyer; rivals outbid each other (see `outbid`), the seller keeps the
    offers within `seller_tolerance` of the highest, and the player picks his club among them. The human club decides
    for its own players: their offers reach it and await its answer.
    """
    pending = []
    due = defaultdict(list)
    decided = {}
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
            # An offer the human club left unanswered lapses with the window: its message no longer awaits an answer.
            tell_buyer(world, offer, "closed")
            continue
        if offer.due is not None:
            # Turned down by the human club, the buyer comes back with its raised offer on the day it set.
            if offer.due > world.date:
                pending.append(offer)
                continue
        elif not offer.awaiting_review and (offer.created >= world.date or opened[offer.player_id] + cfg.management.market.auction_days > today):
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
        due[offer.player_id].append(offer)
    # The clubs the human club turned away may come back at the next window.
    if not open_market: world.turned_away.clear()
    for player_id, bids in sorted(due.items()):
        player, seller = world.players[player_id], world.clubs.get(bids[0].source_id)
        if seller is not None and is_human_club(world, seller.id):
            # Cleared the auction window: every live bid on this player reaches the club together, instead of
            # being decided for it as for a seller of the AI.
            pending.extend(surface(world, bids))
            continue
        sells = seller is None or can_sell(player, seller, world)
        # An unsimulated club turns down even its asking price, by chance.
        if sells and seller is not None and seller.competition_id is None:
            sells = rng.random() < cfg.management.market.dormant_clubs.acceptance_probability
        asked = asking_price(player, seller, world) if seller is not None else 0
        able = [offer for offer in bids if sells and reach(world, offer) >= asked]
        for offer in bids:
            if offer not in able:
                rejected[offer.target_id].add(player_id)
                tell_buyer(world, offer, "seller")
        if not able: continue
        fees = outbid(world, able, asked)
        best = max(fees.values())
        kept = [offer for offer in able if fees[offer.key] >= best * (1 - cfg.management.market.offers.seller_tolerance)]
        decided[player_id] = (able, kept, fees)
    # Reservations are released before final constraints are checked by the applicator.
    apply(world, OffersUpdated(pending))
    for player_id, (able, kept, fees) in sorted(decided.items()):
        highest = max(offer.score for offer in kept)
        tied = sorted((offer for offer in kept if offer.score == highest), key=lambda item: item.key)
        offer = tied[rng.randrange(len(tied))]
        signed = resolve_accepted_offer(world, replace(offer, fee=fees[offer.key]))
        for other in able:
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
        # A price is asked for the player, known to all: his club's asking price, or the fee the human club listed him at.
        fee, limit = event.fee, event.limit
        if listed_price(world, player.id) is not None:
            limit = fee  # the human club named its price: buyers offer it outright, and no more
        elif is_human_club(world, event.source_id):
            # No price is asked for a player of the human club: the buyer opens under its limit, and may raise.
            fee = quoted_offer(min(spending_room(world, club, reserved), round(limit * opening_share(club, cfg))))
        offers.append(TransferOffer(f"{world.date.iso()}:{club.id}:{player.id}", world.date, player.id,
                                    event.source_id, club.id, event.contract, fee, max(fee, event.fee), score, limit=limit))
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
