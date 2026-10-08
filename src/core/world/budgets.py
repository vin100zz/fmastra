"""The share of a club's means between its transfer budget and its wage cap, moved by hand; no file access.

A weekly euro of wage cap is worth a season of that wage in transfer budget. A club moves what it has free on either
side: its cap stays over its wage bill and the wages its offers reserve, its budget over the fees they reserve. The
share it chose is carried over at each annual review, as far as its new budgets allow (`carried_shift`)."""
from core.domain.clubs import Club
from core.domain.world import World
from .application import apply
from .events import BudgetShifted


class BudgetRefused(ValueError):
    """Why the human club cannot share its budgets this way, in the user's words."""


def cap_range(world: World, club: Club) -> tuple[int, int]:
    """The lowest and the highest weekly wage cap a club can set today by moving its budgets."""
    reserved = [offer for offer in world.offers.values() if offer.target_id == club.id]
    committed = club.wage_bill + sum(offer.contract.weekly_wage for offer in reserved)
    free = max(0, club.transfer_budget - sum(offer.ceiling for offer in reserved))
    return min(committed, club.wage_cap), club.wage_cap + free // world.config.management.budgets.weeks_per_year


def set_wage_cap(world: World, wage_cap: int) -> None:
    """Moves the human club's budgets so that its weekly wage cap is `wage_cap`."""
    club = world.clubs.get(world.controlled_club_id)
    if club is None: raise BudgetRefused("Aucun club sélectionné.")
    lowest, highest = cap_range(world, club)
    if wage_cap < lowest:
        raise BudgetRefused("Le plafond salarial ne peut pas passer sous votre masse salariale et les salaires que réservent vos offres en cours.")
    if wage_cap > highest:
        raise BudgetRefused("Votre budget de transferts disponible ne couvre pas ce plafond salarial.")
    if wage_cap != club.wage_cap: apply(world, BudgetShifted(club.id, wage_cap - club.wage_cap))


def carried_shift(shift: int, cap: int, budget: int, committed: int, weeks: int) -> int:
    """What a club keeps, at its annual review, of the weekly wages it moved between its budgets, given the wage cap and
    the transfer budget the review gives it before that share: towards wages, what the budget pays for a season; towards
    transfers, what the cap leaves over the wages the club must honour."""
    if shift > 0: return min(shift, budget // weeks)
    return -min(-shift, max(0, cap - committed))
