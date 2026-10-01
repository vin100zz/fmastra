from dataclasses import replace
from random import Random

import pytest

from core.domain.date import Date
from core.domain.offers import TransferOffer, AGREED_FEE, WAGE_TALKS, SIGNING
from test_market import sellable_world, close_auction


def agreed_fee(world, player, seller):
    """Talks brought to an agreed fee at the club's asking price."""
    from core.ai.market import asking_price
    from core.world.talks import offer_fee
    return offer_fee(world, player, asking_price(player, seller, world))


def wage_talks(world, player, seller):
    """Talks brought to the day the player answers."""
    from core.world.talks import progress_talks, talks_for
    agreed_fee(world, player, seller)
    world.date = talks_for(world, player.id).due
    progress_talks(world)
    return talks_for(world, player.id)


def test_a_fee_below_the_asking_price_gets_a_counter_offer_that_is_accepted(config):
    from core.ai.market import asking_price
    from core.world.market import quoted_minimum
    from core.world.talks import offer_fee, talks_for
    world, player, seller = sellable_world(config)
    minimum = asking_price(player, seller, world)
    reply = offer_fee(world, player, minimum // 2)
    assert reply.outcome == "contre_offre" and reply.talks.counter == quoted_minimum(minimum) >= minimum
    reply = offer_fee(world, player, reply.talks.counter)
    assert reply.outcome == "accepte" and reply.talks.stage == AGREED_FEE
    rules = config.management.market
    assert world.date.add_days(rules.min_reply_days) <= reply.talks.due <= world.date.add_days(rules.max_reply_days)
    # The agreed fee is reserved like any offer; the player stays until he has signed.
    assert talks_for(world, player.id).ceiling == quoted_minimum(minimum)
    assert player.club_id == seller.id


def test_talks_break_off_after_the_last_refused_offer(config):
    from core.world.talks import offer_fee, opening_obstacle, TalksRefused
    world, player, seller = sellable_world(config)
    rounds = config.management.market.negotiation_rounds
    replies = [offer_fee(world, player, 1).outcome for _ in range(rounds)]
    assert replies == ["contre_offre"] * (rounds - 1) + ["rompu"]
    assert not world.offers
    assert "rompues" in opening_obstacle(world, player)
    with pytest.raises(TalksRefused): offer_fee(world, player, 10 ** 9)
    world.date = world.date.add_days(config.management.market.negotiation_cooldown_days)
    assert opening_obstacle(world, player) is None


def test_the_player_answers_days_later_then_signs_at_his_demand(config):
    from core.ai.market import wage_demand
    from core.world.talks import offer_wage, progress_talks, talks_for
    world, player, seller = sellable_world(config)
    talks = wage_talks(world, player, seller)
    assert talks.stage == WAGE_TALKS
    assert world.news[-1].kind == "talks_open" and world.news[-1].player_id == player.id
    demand = wage_demand(player, world.clubs[1], world)
    reply = offer_wage(world, player, demand // 2)
    assert reply.outcome == "contre_offre" and reply.talks.counter >= demand
    reply = offer_wage(world, player, reply.talks.counter)
    assert reply.outcome == "accepte" and reply.talks.stage == SIGNING
    world.date = reply.talks.due
    progress_talks(world)
    assert player.club_id == 1 and player.contract.weekly_wage == reply.talks.contract.weekly_wage
    assert talks_for(world, player.id) is None
    assert world.news[-1].kind == "transfer"


def plain(text):
    """A refusal without the no-break spaces of its amounts."""
    return text.replace(" ", "").replace(" ", " ")


def test_a_wage_over_the_cap_is_refused_with_the_demand_and_the_room_left(config):
    from core.world.talks import asked_wage, monthly_amount, offer_fee, offer_wage, progress_talks, talks_for, TalksRefused
    world, player, seller = sellable_world(config)
    club = world.clubs[1]
    demand = asked_wage(world, player)
    # One weekly euro short of what he would ask: the offer stops there, whatever the fee.
    club.wage_cap = club.wage_bill + demand - 1
    with pytest.raises(TalksRefused) as refusal: offer_fee(world, player, 10 ** 9)
    asked = monthly_amount(demand, world)
    start = f"{player.name} demanderait {asked} € / mois : il vous reste "
    assert plain(str(refusal.value)).startswith(start) and plain(str(refusal.value)).endswith(" € / mois sous le plafond salarial.")
    assert int(plain(str(refusal.value)).removeprefix(start).split(" €")[0]) < asked
    assert talks_for(world, player.id) is None

    # The wages other talks reserve are named: they are why the room is smaller than the cap leaves.
    other = world.players[800]
    world.offers["talks:1:800"] = TransferOffer("talks:1:800", world.date, other.id, seller.id, 1, replace(other.contract, weekly_wage=demand), 0, 0, 0.0, stage=AGREED_FEE)
    club.wage_cap += demand
    with pytest.raises(TalksRefused) as refusal: offer_fee(world, player, 10 ** 9)
    assert plain(str(refusal.value)).endswith(f"sous le plafond salarial, vos autres offres en cours réservant {asked} € / mois.")
    del world.offers["talks:1:800"]

    # With the room for it, the fee is agreed and his demand reserved: his counter-offer will fit.
    club.wage_cap = club.wage_bill + demand
    reply = offer_fee(world, player, 10 ** 9)
    assert reply.outcome == "accepte" and reply.talks.contract.weekly_wage == demand
    world.date = reply.talks.due
    progress_talks(world)
    assert offer_wage(world, player, 1).talks.counter == demand
    with pytest.raises(TalksRefused) as refusal: offer_wage(world, player, demand + 1)
    assert plain(str(refusal.value)).startswith("Ce salaire dépasse votre marge : il vous reste ")
    assert offer_wage(world, player, demand).outcome == "accepte"


def test_a_player_with_an_agreed_fee_is_off_the_ai_market(config):
    from core.ai.market import asking_price, propose_transfers
    from core.world.market import settle_offers
    from test_market import extra_buyer
    world, player, seller = sellable_world(config)
    rival = extra_buyer(world, 3)
    quote = asking_price(player, seller, world)
    world.offers["rival"] = TransferOffer("rival", world.date, player.id, seller.id, rival.id, player.contract, quote, quote, 5.0)
    agreed_fee(world, player, seller)
    close_auction(world)
    assert settle_offers(world, True) == {rival.id: {player.id}}
    assert player.club_id == seller.id
    assert all(proposal.player_id != player.id for proposal in propose_transfers(world, Random(1)))


def test_the_window_closing_ends_wage_talks_but_not_an_agreed_signing(config):
    from core.world.talks import offer_wage, progress_talks, talks_for
    from core.ai.market import wage_demand
    world, player, seller = sellable_world(config)
    wage_talks(world, player, seller)
    window = config.world.market.summer
    world.date = Date(world.date.year, window.end_month, window.end_day).add_days(1)
    progress_talks(world)
    assert talks_for(world, player.id) is None and world.news[-1].kind == "offer_expired"

    world, player, seller = sellable_world(config)
    wage_talks(world, player, seller)
    reply = offer_wage(world, player, wage_demand(player, world.clubs[1], world))
    world.date = max(reply.talks.due, Date(world.date.year, window.end_month, window.end_day).add_days(1))
    progress_talks(world)
    assert player.club_id == 1


def test_the_answer_comes_by_the_last_day_of_the_window(config):
    from core.world.talks import talks_for
    world, player, seller = sellable_world(config)
    window = config.world.market.summer
    world.date = Date(world.date.year, window.end_month, window.end_day)
    agreed_fee(world, player, seller)
    # No day left for an answer: the wage talks open at once.
    assert talks_for(world, player.id).stage == WAGE_TALKS


def test_the_human_club_is_not_capped_in_simultaneous_talks(config):
    from core.world.market import offer_limit
    from test_market import extra_buyer
    world, player, seller = sellable_world(config)
    contract = replace(player.contract, weekly_wage=0)
    reserved = [TransferOffer(f"talks:{n}", world.date, 900 + n, seller.id, 1, contract, 0, 0, 0.0)
                for n in range(config.management.market.max_negotiations)]
    assert offer_limit(world, world.clubs[1], contract, 0, reserved) is None
    assert offer_limit(world, extra_buyer(world, 3), contract, 0, reserved) == "negotiations"


def test_a_free_agent_negotiates_his_wage_straight_away(config):
    from core.world.talks import offer_fee, offer_wage, TalksRefused
    world, player, seller = sellable_world(config)
    free = next(item for item in world.players.values() if item.club_id is None)
    with pytest.raises(TalksRefused): offer_fee(world, free, 1)
    reply = offer_wage(world, free, 1)
    assert reply.outcome == "contre_offre" and reply.talks.stage == WAGE_TALKS and reply.talks.source_id is None
    assert offer_wage(world, free, reply.talks.counter).outcome == "accepte"
