from dataclasses import replace

import pytest

from core.domain.offers import TransferOffer
from core.world.application import apply
from core.world.budgets import BudgetRefused, cap_range, carried_shift, set_wage_cap
from core.world.events import BudgetRenewed, BudgetShifted
from test_market import mini_world


def human_world(config):
    world = mini_world(config)
    world.controlled_club_id = 1
    return world, world.clubs[1]


def test_a_raised_wage_cap_costs_the_transfer_budget_a_season_of_it_and_moves_no_cash(config):
    world, club = human_world(config)
    weeks = config.management.budgets.weeks_per_year
    cap, budget, balance = club.wage_cap, club.transfer_budget, club.balance
    set_wage_cap(world, cap + 5000)
    assert (club.wage_cap, club.transfer_budget, club.wage_shift) == (cap + 5000, budget - 5000 * weeks, 5000)
    assert club.balance == balance and not world.finance_history
    # The other way gives the budget the same amount back, and more when the cap goes under where it started.
    set_wage_cap(world, cap - 2000)
    assert (club.wage_cap, club.transfer_budget, club.wage_shift) == (cap - 2000, budget + 2000 * weeks, -2000)
    # The cap it already has asks for nothing.
    set_wage_cap(world, cap - 2000)
    assert club.wage_shift == -2000


def test_only_what_is_free_moves_between_the_budgets(config):
    world, club = human_world(config)
    weeks = config.management.budgets.weeks_per_year
    other = world.players[202]
    # An offer under way reserves its fee and its wage.
    offer = TransferOffer("held", world.date, other.id, 2, 1, replace(other.contract, weekly_wage=4000), 480000, 480000, 1)
    world.offers[offer.key] = offer
    lowest, highest = cap_range(world, club)
    assert lowest == club.wage_bill + 4000
    assert highest == club.wage_cap + (club.transfer_budget - 480000) // weeks
    for refused in (lowest - 1, highest + 1):
        with pytest.raises(BudgetRefused): set_wage_cap(world, refused)
    assert club.wage_shift == 0
    set_wage_cap(world, highest)
    assert 480000 <= club.transfer_budget < 480000 + weeks
    set_wage_cap(world, lowest)
    assert club.wage_cap == club.wage_bill + 4000
    # The applicator holds the same limits, whoever sends the event.
    assert not apply(world, BudgetShifted(club.id, -1))
    assert not apply(world, BudgetShifted(club.id, club.transfer_budget // weeks + 1))
    assert club.wage_cap == club.wage_bill + 4000


def test_a_game_without_a_club_shares_nothing(config):
    with pytest.raises(BudgetRefused): set_wage_cap(mini_world(config), 1)


def test_the_share_is_carried_over_as_far_as_the_new_budgets_allow():
    weeks = 52
    # Towards wages: the new transfer budget pays a season of it, or what it can.
    assert carried_shift(3000, 10000, 3000 * weeks + 51, 9000, weeks) == 3000
    assert carried_shift(3000, 10000, 1000 * weeks + 51, 9000, weeks) == 1000
    assert carried_shift(3000, 10000, 0, 9000, weeks) == 0
    # Towards transfers: the new cap gives what it has over the wages to honour.
    assert carried_shift(-3000, 10000, 0, 6000, weeks) == -3000
    assert carried_shift(-3000, 10000, 0, 9000, weeks) == -1000
    assert carried_shift(-3000, 10000, 0, 12000, weeks) == 0
    assert carried_shift(0, 10000, 500000, 9000, weeks) == 0


def test_the_annual_review_leaves_the_club_the_share_it_carried_over(config):
    world, club = human_world(config)
    set_wage_cap(world, club.wage_cap + 5000)
    apply(world, BudgetRenewed(club.id, 10_000_000, 90000, 400000, 3, None, 2000))
    assert (club.wage_cap, club.transfer_budget, club.wage_shift) == (90000, 400000, 2000)
    # A review that says nothing of a share leaves none.
    apply(world, BudgetRenewed(club.id, 10_000_000, 88000, 500000, 3))
    assert club.wage_shift == 0
