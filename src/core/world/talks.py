"""The human club's transfer talks: the fee with the selling club, then the wage with the player, then his arrival.

Each offer is answered at once: accepted, or refused with the other side's demand as a
counter-offer. After `tours_negociation` refused offers the talks break off for
`jours_rupture_negociation` days. An agreed fee reserves the player: he answers a few
days later, and once his wage is agreed he arrives a few days after that.

Talks are TransferOffer records with a stage, so budget, wage and squad reservations
work as for any offer; the AI auction in `market.settle_offers` leaves them alone.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from math import ceil, floor

from core.ai.market import asking_price, can_sell, contract_for, wage_demand
from core.domain.date import Date
from core.domain.offers import TransferOffer, FEE_TALKS, AGREED_FEE, WAGE_TALKS, SIGNING
from core.domain.players import Contract, Player
from core.domain.world import NewsLine, World
from core.randomness import stream
from .application import apply
from .events import OffersUpdated
from .human import record
from .market import offer_limit, quoted_minimum, resolve_accepted_offer, tell_buyer
from .transfer_rules import accepts_move, recent_arrival_ids, free_to_move_on


class TalksRefused(ValueError):
    """An offer the human club cannot make, with the reason shown to the user."""


LIMITS = {"squad": "Votre effectif est complet.",
          "budget": "Votre budget transferts ne suffit pas.", "balance": "Votre trésorerie ne suffit pas."}


def check_limits(world: World, player: Player, contract: Contract, fee: int, demanded: bool = False) -> None:
    """Refuses an offer the human club's means do not cover; `demanded` when the wage is the player's demand, not one the club offered."""
    club = world.clubs[world.controlled_club_id]
    limit = offer_limit(world, club, contract, fee, others(world, player))
    if limit == "wages": raise TalksRefused(wage_refusal(world, player, contract.weekly_wage if demanded else None))
    if limit is not None: raise TalksRefused(LIMITS[limit])


def wage_room(world: World, player: Player) -> int:
    """What the human club can still pay a week under its wage cap, beside its other offers and talks."""
    club = world.clubs[world.controlled_club_id]
    return club.wage_cap - club.wage_bill - sum(offer.contract.weekly_wage for offer in others(world, player))


def wage_refusal(world: World, player: Player, demand: int | None = None) -> str:
    """Why a wage does not fit under the human club's cap: the room left, rounded down, after the player's demand
    when the club has not offered a wage of its own yet, and with what its other offers and talks reserve."""
    def amount(weekly: int, rounding=round) -> str:
        return f"{monthly_amount(weekly, world, rounding):,}\u00a0€ / mois".replace(",", "\u202f")
    reserved = sum(offer.contract.weekly_wage for offer in others(world, player))
    cause = f"{player.name} demanderait {amount(demand)}" if demand is not None else "Ce salaire dépasse votre marge"
    text = f"{cause} : il vous reste {amount(max(0, wage_room(world, player)), floor)} sous le plafond salarial"
    return f"{text}, vos autres offres en cours réservant {amount(reserved)}." if reserved else f"{text}."


def available_budget(world: World, player: Player) -> int:
    """What the human club can still pay in fees beside its other offers and talks."""
    club = world.clubs[world.controlled_club_id]
    reserved = sum(offer.ceiling for offer in others(world, player))
    return max(0, min(club.transfer_budget, club.balance - world.config.management.guardrails.min_balance) - reserved)


@dataclass(frozen=True, slots=True)
class Reply:
    outcome: str  # "accepte", "contre_offre" or "rompu"
    talks: TransferOffer | None


def talks_for(world: World, player_id: int) -> TransferOffer | None:
    club_id = world.controlled_club_id
    return None if club_id is None else world.offers.get(f"talks:{club_id}:{player_id}")


def window_end(world: World) -> Date | None:
    """The last day of the transfer window open today, or None."""
    from .simulation import market_window
    name = market_window(world)
    if name is None: return None
    window = getattr(world.config.world.market, name)
    return Date(world.date.year, window.end_month, window.end_day)


def opening_obstacle(world: World, player: Player) -> str | None:
    """Why the human club cannot make an offer for this player today, or None."""
    club = world.clubs[world.controlled_club_id]
    if club.id in (player.club_id, player.owner_id): return "Ce joueur est déjà dans votre effectif."
    if window_end(world) is None: return "Le mercato est fermé."
    closed = world.talks_closed.get(player.id)
    if closed is not None and closed > world.date: return f"Discussions rompues jusqu'au {closed.day_month()}."
    current = talks_for(world, player.id)
    if current is not None and current.stage != FEE_TALKS: return "Une négociation est déjà en cours."
    seller = world.clubs.get(player.club_id) if player.club_id is not None else None
    if player.loan is not None:
        return f"En prêt jusqu'au {player.loan.end.day_month()} {player.loan.end.year}."
    if seller is not None and player.id in recent_arrival_ids(world):
        return f"Intransférable jusqu'au {free_to_move_on(world, player.id).day_month()} : il vient d'arriver."
    if seller is not None and not can_sell(player, seller, world): return f"{seller.name} ne peut pas s'en séparer."
    if not accepts_move(player, club, world): return f"{player.name} refuse de rejoindre {club.name}."
    return None


def monthly_amount(weekly: int, world: World, rounding=round) -> int:
    """A weekly wage as the monthly amount the pages show, with two significant digits."""
    monthly = weekly * world.config.management.budgets.weeks_per_year / 12
    step = 10 ** max(0, len(str(int(monthly))) - 2)
    return rounding(monthly / step) * step


def quoted_wage(weekly: int, world: World) -> int:
    """A weekly wage raised so that its monthly amount has two significant digits, as the pages show it."""
    return ceil(monthly_amount(weekly, world, ceil) * 12 / world.config.management.budgets.weeks_per_year)


def asked_wage(world: World, player: Player) -> int:
    """The weekly wage a player asks to join the human club, as his counter-offer quotes it."""
    return quoted_wage(wage_demand(player, world.clubs[world.controlled_club_id], world), world)


def offer_fee(world: World, player: Player, fee: int) -> Reply:
    """The selling club's answer to a fee: agreed at its asking price or above, a counter-offer otherwise."""
    if (obstacle := opening_obstacle(world, player)) is not None: raise TalksRefused(obstacle)
    club = world.clubs[world.controlled_club_id]
    seller = world.clubs.get(player.club_id) if player.club_id is not None else None
    if seller is None: raise TalksRefused("Joueur libre : négociez directement son contrat.")
    current = talks_for(world, player.id)
    # Until his own terms are agreed, the wage he would ask is what the club reserves.
    contract = contract_for(player, world, asked_wage(world, player))
    check_limits(world, player, contract, fee, demanded=True)
    talks = TransferOffer(f"talks:{club.id}:{player.id}", world.date, player.id, seller.id, club.id, contract, fee, fee, 0.0,
                          stage=FEE_TALKS, rounds=current.rounds if current is not None else 0)
    minimum = asking_price(player, seller, world)
    if fee >= minimum:
        due = min(answer_day(world, player), window_end(world))
        talks = replace(talks, stage=AGREED_FEE, due=due, rounds=0)
        if due <= world.date: talks = open_wage_talks(world, talks, player)
        return Reply("accepte", store(world, talks))
    return refuse(world, talks, quoted_minimum(minimum))


def offer_wage(world: World, player: Player, weekly: int) -> Reply:
    """The player's answer to a weekly wage: agreed at his demand or above, a counter-offer otherwise.

    A free agent has no club to agree with first: his talks start here."""
    club = world.clubs[world.controlled_club_id]
    talks = talks_for(world, player.id)
    if talks is None and player.club_id is None:
        if (obstacle := opening_obstacle(world, player)) is not None: raise TalksRefused(obstacle)
        contract = contract_for(player, world, weekly)
        check_limits(world, player, contract, 0)
        talks = TransferOffer(f"talks:{club.id}:{player.id}", world.date, player.id, None, club.id, contract, 0, 0, 0.0, stage=WAGE_TALKS)
    if talks is None or talks.stage != WAGE_TALKS: raise TalksRefused("Le joueur n'attend pas d'offre de contrat.")
    if weekly > wage_room(world, player): raise TalksRefused(wage_refusal(world, player))
    talks = replace(talks, contract=contract_for(player, world, weekly))
    demand = wage_demand(player, club, world)
    if weekly >= demand:
        days = stream(world.seed, "talks-arrival", player.id, world.date.ordinal()).randint(*reply_days(world))
        return Reply("accepte", store(world, replace(talks, stage=SIGNING, due=world.date.add_days(days), rounds=0, counter=None)))
    return refuse(world, talks, quoted_wage(demand, world))


def refuse(world: World, talks: TransferOffer, counter: int) -> Reply:
    """A refused offer: a counter-offer, or the end of the talks once the rounds are used up."""
    rules = world.config.management.market
    if talks.rounds + 1 >= rules.negotiation_rounds:
        world.talks_closed[talks.player_id] = world.date.add_days(rules.negotiation_cooldown_days)
        apply(world, OffersUpdated([offer for offer in world.offers.values() if offer.key != talks.key]))
        return Reply("rompu", None)
    return Reply("contre_offre", store(world, replace(talks, rounds=talks.rounds + 1, counter=counter)))


def others(world: World, player: Player) -> list[TransferOffer]:
    """The human club's other offers and talks, whose reservations an offer must fit beside."""
    return [offer for offer in world.offers.values() if offer.target_id == world.controlled_club_id and offer.player_id != player.id]


def withdraw(world: World, player: Player) -> None:
    """The human club gives up its talks for a player: nothing is owed, and it may come back to him later. Once his
    contract is agreed he is on his way: there is nothing left to give up."""
    talks = talks_for(world, player.id)
    if talks is None: raise TalksRefused("Aucune négociation en cours pour ce joueur.")
    if talks.stage == SIGNING: raise TalksRefused("Le contrat est signé : le joueur arrive.")
    apply(world, OffersUpdated([offer for offer in world.offers.values() if offer.key != talks.key]))


def store(world: World, talks: TransferOffer) -> TransferOffer:
    apply(world, OffersUpdated([*(offer for offer in world.offers.values() if offer.key != talks.key), talks]))
    return talks


def reply_days(world: World) -> tuple[int, int]:
    rules = world.config.management.market
    return rules.min_reply_days, rules.max_reply_days


def answer_day(world: World, player: Player) -> Date:
    """When the player answers once his club agreed: a few days, drawn from a stream of its own."""
    return world.date.add_days(stream(world.seed, "talks-answer", player.id, world.date.ordinal()).randint(*reply_days(world)))


def open_wage_talks(world: World, talks: TransferOffer, player: Player) -> TransferOffer:
    record(world, "talks_open", f"{player.name} est prêt à négocier son contrat", talks.target_id, player.id,
           lines=(NewsLine(club_id=talks.source_id, amount=talks.fee),))
    return replace(talks, stage=WAGE_TALKS, due=None, rounds=0, counter=None)


def progress_talks(world: World) -> None:
    """Each morning: talks left open yesterday lapse, due answers and arrivals happen, and the close ends wage talks."""
    if not any(offer.stage is not None for offer in world.offers.values()): return
    open_market = window_end(world) is not None
    kept, arrivals = [], []
    for talks in sorted(world.offers.values(), key=lambda item: item.key):
        player = world.players.get(talks.player_id)
        if talks.stage is None:
            kept.append(talks)
        elif talks.stage == FEE_TALKS:
            if talks.created >= world.date: kept.append(talks)  # otherwise abandoned mid-way: it lapses
        elif talks.stage == AGREED_FEE and talks.due <= world.date:
            seller = world.clubs.get(talks.source_id)
            if player is None or player.club_id != talks.source_id: tell_buyer(world, talks, "left")
            elif not accepts_move(player, world.clubs[talks.target_id], world): tell_buyer(world, talks, "player")
            elif seller is not None and not can_sell(player, seller, world): tell_buyer(world, talks, "failed")
            else: kept.append(open_wage_talks(world, talks, player))
        elif talks.stage == WAGE_TALKS and not open_market:
            tell_buyer(world, talks, "closed")
        elif talks.stage == SIGNING and talks.due <= world.date:
            arrivals.append(talks)
        else:
            kept.append(talks)
    # Arrivals are signed while their own reservation still stands beside the others'.
    for talks in arrivals:
        if not resolve_accepted_offer(world, talks): tell_buyer(world, talks, "failed")
    apply(world, OffersUpdated(kept))
