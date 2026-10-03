"""Loans: a player plays for another club until a set day, his owner still paying his whole wage.

A loan starts during a transfer window and ends with the season, or, from the summer window, when the winter one
opens. The player then plays, progresses and is counted as any player of the club he was lent to; his owner keeps his
place in its squad and gets him back the day after the loan ends. Nothing is paid, nothing is negotiated: the owner
agrees or not, and so do the player and the club he would go to.

AI clubs lend the prospects they would otherwise keep in their reserve (see `reserves.surplus_prospects`) to the most
reputed club where they would play. The human club lends and borrows by its own commands, answered at once.
"""
from __future__ import annotations

from core.ai.market import can_spare
from core.domain.clubs import Club
from core.domain.date import Date, next_annual_date
from core.domain.offers import RESERVING_STAGES
from core.domain.players import Player
from core.domain.world import World
from core.randomness import stream
from .application import apply
from .events import LoanEnded, LoanStarted
from .human import is_human_club
from .reserves import depth_rank, starters_at, surplus_prospects
from .transfer_rules import outgrown_by

SEASON, HALF_SEASON = "saison", "demi_saison"


class LoanRefused(ValueError):
    """A loan the human club cannot make, with the reason shown to the user."""


def season_end(world: World) -> Date:
    """The last day of the season a loan agreed today runs to: the eve of the day contracts are released."""
    cfg = world.config
    release, summer = cfg.world.key_dates.contract_release, cfg.world.market.summer
    end = next_annual_date(world.date, release.month, release.day).add_days(-1)
    # The summer window opens before the old season's contracts end: a loan agreed then runs through the next season.
    opening = Date(world.date.year, summer.start_month, summer.start_day)
    return end.add_years(1) if opening <= world.date and end.year == world.date.year else end


def loan_ends(world: World) -> dict[str, Date]:
    """The loans that can start today, by duration; none outside the transfer windows."""
    from .simulation import market_window
    window = market_window(world)
    if window is None: return {}
    ends = {SEASON: season_end(world)}
    if window == "summer":
        winter = world.config.world.market.winter
        ends[HALF_SEASON] = next_annual_date(world.date, winter.start_month, winter.start_day).add_days(-1)
    return ends


def lender_obstacle(world: World, player: Player, end: Date) -> str | None:
    """Why his club cannot lend this player until `end`, or None."""
    owner = world.clubs.get(player.club_id) if player.club_id is not None else None
    if owner is None: return f"{player.name} n'a pas de club."
    if player.loan is not None:
        return f"{player.name} est déjà prêté jusqu'au {player.loan.end.day_month()} {player.loan.end.year}."
    if player.injury is not None and player.injury.end > world.date: return f"{player.name} est blessé."
    if player.contract.end <= end: return f"Le contrat de {player.name} se termine avant la fin du prêt."
    if any(offer.player_id == player.id and offer.stage in RESERVING_STAGES for offer in world.offers.values()):
        return f"Un transfert de {player.name} est en cours."
    if owner.competition_id is not None and not can_spare(player, owner, world):
        return f"{owner.name} ne peut pas s'en séparer."
    return None


def would_play(world: World, player: Player, club: Club) -> bool:
    """A starter or the first substitute at his position: the playing time a loan is made for."""
    starters = starters_at(club, player.position, world.config)
    return starters > 0 and depth_rank(world, club, player) <= starters


def accepts_loan(world: World, player: Player, club: Club) -> bool:
    """Whether a player would go on loan to a club: one where he would play, and not too small for him."""
    return would_play(world, player, club) and outgrown_by(player, club, world.config) == 0


def borrower_obstacle(world: World, player: Player, club: Club) -> str | None:
    """Why a club cannot take this player on loan, or None."""
    if club.competition_id is None: return f"{club.name} ne joue dans aucun championnat simulé."
    reserved = sum(offer.target_id == club.id for offer in world.offers.values())
    if club.squad_size + reserved >= world.config.management.guardrails.max_squad: return f"L'effectif de {club.name} est complet."
    if not would_play(world, player, club): return f"{player.name} n'aurait pas assez de temps de jeu à {club.name}."
    if outgrown_by(player, club, world.config) > 0: return f"{club.name} est trop modeste pour {player.name}."
    return None


def lendable(world: World, club: Club, end: Date | None = None) -> list[Player]:
    """The players an AI club is ready to lend until `end` (the end of the season by default)."""
    if club.competition_id is None or is_human_club(world, club.id): return []
    end = end or season_end(world)
    return [player for player in surplus_prospects(world, club) if lender_obstacle(world, player, end) is None]


def borrowed(world: World, club: Club) -> int:
    return sum(world.players[pid].loan is not None for pid in club.player_ids)


def takers(world: World, player: Player) -> list[Club]:
    """The AI clubs that would take a player on loan and where he would go, the most reputed first."""
    limit = world.config.management.market.loans.max_borrowed
    clubs = [club for club in world.active_clubs() if club.id != player.club_id and not is_human_club(world, club.id)
             and borrowed(world, club) < limit and borrower_obstacle(world, player, club) is None]
    return sorted(clubs, key=lambda club: (-club.reputation, club.id))


def return_events(world: World) -> list[LoanEnded]:
    return [LoanEnded(player.id) for player in world.players.values() if player.loan is not None and player.loan.end < world.date]


def run_loan_round(world: World) -> None:
    """Once a week in a transfer window: the prospects AI clubs are ready to lend look for a club, the best first."""
    end = loan_ends(world).get(SEASON)
    if end is None: return
    rng = stream(world.seed, "loans", world.date.ordinal())
    probability = world.config.management.market.loans.weekly_probability
    wanted = {offer.player_id for offer in world.offers.values()}
    candidates = [player for club in world.active_clubs() for player in lendable(world, club, end)
                  if player.id not in wanted and rng.random() < probability]
    for player in sorted(candidates, key=lambda item: (-item.rating, item.id)):
        # Each loan changes two squads: the owner may no longer spare him, the takers are read afresh.
        if lender_obstacle(world, player, end) is not None: continue
        clubs = takers(world, player)
        if clubs: apply(world, LoanStarted(player.id, clubs[0].id, end))


def chosen_end(world: World, duration: str) -> Date:
    ends = loan_ends(world)
    if not ends: raise LoanRefused("Le mercato est fermé.")
    if duration not in ends: raise LoanRefused("Cette durée de prêt n'est pas possible aujourd'hui.")
    return ends[duration]


def lend(world: World, player: Player, club_id: int, duration: str) -> None:
    """The human club lends one of its players to an AI club that would take him."""
    if not is_human_club(world, player.club_id): raise LoanRefused("Ce joueur n'est pas dans votre effectif.")
    end = chosen_end(world, duration)
    if (obstacle := lender_obstacle(world, player, end)) is not None: raise LoanRefused(obstacle)
    if club_id not in {club.id for club in takers(world, player)}: raise LoanRefused("Ce club n'est plus intéressé.")
    apply(world, LoanStarted(player.id, club_id, end))


def borrowing_obstacle(world: World, player: Player, end: Date | None = None) -> str | None:
    """Why the human club cannot take this player on loan until `end` (the end of the season by default), or None."""
    club = world.clubs[world.controlled_club_id]
    owner = world.clubs.get(player.club_id) if player.club_id is not None else None
    if owner is None: return "Joueur libre : proposez-lui un contrat."
    if player.owner_id == club.id: return "Ce joueur vous appartient déjà."
    if (obstacle := lender_obstacle(world, player, end or season_end(world))) is not None: return obstacle
    if player.id not in {item.id for item in lendable(world, owner, end)}: return f"{owner.name} ne souhaite pas prêter {player.name}."
    return borrower_obstacle(world, player, club)


def borrow(world: World, player: Player, duration: str) -> None:
    """The human club takes on loan a player his AI club is ready to lend."""
    end = chosen_end(world, duration)
    if (obstacle := borrowing_obstacle(world, player, end)) is not None: raise LoanRefused(obstacle)
    apply(world, LoanStarted(player.id, world.controlled_club_id, end))
