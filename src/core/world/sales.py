"""The human club's sales: its transfer list, and its players offered to every club at once.

A listed player is seen first by every club that needs his position, at the fee the human
club asks (see `core.ai.market.propose_transfers`), for as long as he stays on the list.
Offering a player puts the question to every club today: the interested ones bid at once,
and their offers await the club's answer like any other. The same player can be offered
again after `jours_relance_proposition` days. Either way he knows he is no longer wanted
and accepts a smaller club than usual (see `transfer_rules.accepts_move`).
"""
from __future__ import annotations

from core.ai.market import can_sell, offered_player_bids, player_offer_score
from core.domain.offers import TransferOffer
from core.domain.players import Player
from core.domain.world import World
from core.randomness import stream
from .application import apply
from .events import OffersUpdated
from .human import is_human_club
from .market import can_open_offer, resolve_accepted_offer
from .news import answer_offer, offer_received
from .talks import window_end
from .transfer_rules import recent_arrival_ids, free_to_move_on


class SaleRefused(ValueError):
    """A sale the human club cannot make, with the reason shown to the user."""


NOT_OWN = "Ce joueur n'est pas dans votre effectif."
ON_LOAN = "Ce joueur vous est prêté : il n'est pas à vendre."


def set_listing(world: World, player: Player, fee: int | None) -> None:
    """Puts a player of the human club on its transfer list at this fee, changes the fee, or takes him off with None."""
    if not is_human_club(world, player.club_id): raise SaleRefused(NOT_OWN)
    if player.loan is not None: raise SaleRefused(ON_LOAN)
    if fee is None: world.transfer_list.pop(player.id, None)
    else: world.transfer_list[player.id] = fee


def offer_obstacle(world: World, player: Player) -> str | None:
    """Why the human club cannot offer this player to the clubs today, or None."""
    if not is_human_club(world, player.club_id): return NOT_OWN
    if player.loan is not None: return ON_LOAN
    if window_end(world) is None: return "Le mercato est fermé."
    if player.id in recent_arrival_ids(world):
        return f"Intransférable jusqu'au {free_to_move_on(world, player.id).day_month()} : il vient d'arriver."
    if not can_sell(player, world.clubs[player.club_id], world): return "Votre effectif ne permet pas de vous en séparer."
    until = world.offered_until.get(player.id)
    if until is not None and until > world.date: return f"Déjà proposé : nouvelle proposition le {until.day_month()}."
    return None


def offer_to_clubs(world: World, player: Player, fee: int) -> list[TransferOffer]:
    """Every club considers the player at this fee today; the offers he would prefer await the human club's answer."""
    if (obstacle := offer_obstacle(world, player)) is not None: raise SaleRefused(obstacle)
    rules = world.config.management.market
    # Set first: the clubs are weighed with the tolerance of a player who knows he may leave.
    world.offered_until[player.id] = world.date.add_days(rules.offer_cooldown_days)
    rng = stream(world.seed, "sale-offer", player.id, world.date.ordinal())
    bids = offered_player_bids(world, player, fee, rng)
    scored = sorted(((player_offer_score(player, world.clubs[bid.target_id], bid.contract.weekly_wage, world)
                      + rng.gauss(0, rules.player_score.noise), bid) for bid in bids), key=lambda item: (-item[0], item[1].target_id))
    offers, made = list(world.offers.values()), []
    for score, bid in scored:
        if len(made) >= rules.max_offers_per_proposal: break
        club = world.clubs[bid.target_id]
        if not can_open_offer(world, club, bid.contract, fee, [offer for offer in offers if offer.target_id == club.id]): continue
        # Every rival is known today: the offers skip the auction and await the answer at once.
        offer = TransferOffer(f"proposition:{world.date.iso()}:{club.id}:{player.id}", world.date, player.id, player.club_id,
                              club.id, bid.contract, fee, fee, score, awaiting_review=True)
        offers.append(offer)
        made.append(offer)
        offer_received(world, offer)
    apply(world, OffersUpdated(offers))
    return made


NO_LONGER = "Cette vente n'est plus possible pour le moment (effectif minimal, gardiens requis…)."


def awaiting_offers(world: World, player_id: int) -> list[TransferOffer]:
    """The offers for a player of the human club that await its answer, the one he prefers first."""
    return sorted((offer for offer in world.offers.values()
                   if offer.player_id == player_id and offer.awaiting_review and is_human_club(world, offer.source_id)),
                  key=lambda offer: (-offer.score, offer.key))


def answer(world: World, offer: TransferOffer, accept: bool) -> None:
    """The human club's answer to one offer: accepted, the player leaves at once and his other offers fall."""
    if not offer.awaiting_review or not is_human_club(world, offer.source_id): raise SaleRefused("Offre introuvable ou déjà traitée.")
    if accept:
        if not resolve_accepted_offer(world, offer): raise SaleRefused(NO_LONGER)
        remaining = [item for item in world.offers.values() if item.player_id != offer.player_id]
    else:
        remaining = [item for item in world.offers.values() if item.key != offer.key]
    answer_offer(world, offer.key, "accepted" if accept else "refused")
    apply(world, OffersUpdated(remaining))


def answer_all(world: World, player: Player, accept: bool) -> TransferOffer | None:
    """Every offer awaiting an answer for a player, at once: all refused, or all accepted, and he joins the club he
    prefers among those the sale is still possible with. Returns the offer he signed, if any."""
    offers = awaiting_offers(world, player.id)
    if not offers: raise SaleRefused("Aucune offre n'attend de réponse pour ce joueur.")
    if not accept:
        for offer in offers: answer(world, offer, False)
        return None
    signed = next((offer for offer in offers if resolve_accepted_offer(world, offer)), None)
    if signed is None: raise SaleRefused(NO_LONGER)
    for offer in offers: answer_offer(world, offer.key, "accepted" if offer is signed else "declined")
    apply(world, OffersUpdated([item for item in world.offers.values() if item.player_id != player.id]))
    return signed
