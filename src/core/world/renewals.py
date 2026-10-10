"""The human club's contract extensions: its players' demands, and the contracts it asks them for.

A player asks for a new contract when his own runs short or no longer suits him (see `contracts.renewal_events`);
the club accepts it or turns it down. Turned down, he does not ask again while that contract runs, save once when
its end comes in sight. The club can also ask any of its players at any time: he names the terms he would ask for
himself, and signs at once if the club takes them. A player who wants a bigger club, or who has just arrived, does
not extend.
"""
from __future__ import annotations

from core.ai.market import market_wage
from core.domain.players import Contract, Player
from core.domain.world import World
from .application import apply
from .contracts import asked_wage, extension
from .events import PlayerSigned
from .human import is_human_club
from .news import answer_renewal
from .transfer_rules import recent_arrival_ids, wants_to_leave


class RenewalRefused(ValueError):
    """A contract the human club cannot sign with one of its players, with the reason shown to the user."""


def renewal_obstacle(world: World, player: Player) -> str | None:
    """Why a player would not extend with the human club today, or None."""
    if world.controlled_club_id is not None and player.loan is not None and player.owner_id == world.controlled_club_id:
        return f"En prêt jusqu'au {player.loan.end.day_month()} {player.loan.end.year}."
    if not is_human_club(world, player.club_id): return "Ce joueur n'est pas dans votre effectif."
    if player.loan is not None: return "Ce joueur vous est prêté : son contrat ne dépend pas de vous."
    if player.id in world.pending_renewals: return None
    if wants_to_leave(player, world): return f"{player.name} ne veut pas prolonger : il vise un club plus prestigieux."
    if player.id in recent_arrival_ids(world): return f"{player.name} vient d'arriver : il ne renégocie pas son contrat."
    terms = asked_terms(world, player)
    if terms.weekly_wage <= player.contract.weekly_wage and terms.end <= player.contract.end:
        return f"{player.name} n'a rien à gagner à un nouveau contrat pour l'instant."
    return None


def asked_terms(world: World, player: Player) -> Contract:
    """The contract a player of the human club would sign today: the one he is waiting an answer on, else his terms."""
    proposal = world.pending_renewals.get(player.id)
    if proposal is not None: return proposal.contract
    club = world.clubs[player.club_id]
    expected = market_wage(player, club, world.config)
    return extension(world, player, asked_wage(player, expected, world.config))


def sign(world: World, player: Player) -> Contract:
    """The human club extends one of its players on his terms."""
    if (obstacle := renewal_obstacle(world, player)) is not None: raise RenewalRefused(obstacle)
    contract, previous = asked_terms(world, player), player.contract
    if not apply(world, PlayerSigned(player.id, player.club_id, player.club_id, contract, 0, True)):
        raise RenewalRefused("Ce contrat dépasse le plafond salarial du club.")
    answer_renewal(world, player.id, "accepted", previous)
    world.pending_renewals.pop(player.id, None)
    return contract


def turn_down(world: World, player: Player) -> None:
    """The human club refuses the contract a player asked for."""
    if player.id not in world.pending_renewals:
        raise RenewalRefused("Aucune proposition de renouvellement en attente pour ce joueur.")
    answer_renewal(world, player.id, "refused", player.contract)
    del world.pending_renewals[player.id]
    world.refused_renewals[player.id] = world.date
