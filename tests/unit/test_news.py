from dataclasses import replace

import pytest

from core.domain.date import Date
from core.domain.offers import RenewalProposal, TransferOffer, SIGNING, WAGE_TALKS
from core.domain.players import Contract
from core.domain.world import NewsLine, SeasonRecord
from core.world import news, renewals, sales
from core.world.application import apply
from core.world.events import RenewalProposed
from core.world.human import record, report
from core.world.talks import TalksRefused, withdraw
from test_market import mini_world


def human_world(config, club_id=1):
    world = mini_world(config)
    world.controlled_club_id = club_id
    return world, world.clubs[club_id]


def test_events_of_a_kind_on_the_same_day_share_one_message(config):
    world, club = human_world(config)
    first, second, third = club.player_ids[:3]
    back = world.date.add_days(10)
    report(world, "injury", NewsLine(player_id=first, until=back), club.id, match_id=7)
    report(world, "injury", NewsLine(player_id=second, until=back), club.id, match_id=7)
    report(world, "injury", NewsLine(player_id=third, until=back), club.id)  # in training: a message of its own
    report(world, "suspension", NewsLine(player_id=first, amount=1), club.id, match_id=7)
    assert [(item.kind, item.match_id, [line.player_id for line in item.lines]) for item in world.news] == [
        ("injury", 7, [first, second]), ("injury", None, [third]), ("suspension", 7, [first])]
    # A message that gains a line is to be read again.
    world.news[1].read = True
    report(world, "injury", NewsLine(player_id=first, until=back), club.id)
    assert not world.news[1].read and len(world.news[1].lines) == 2
    # The next day opens new messages; a plain sentence never takes lines from the day's events.
    world.date = world.date.add_days(1)
    record(world, "injury", "Une phrase", club.id)
    report(world, "injury", NewsLine(player_id=second, until=back), club.id)
    assert [len(item.lines) for item in world.news] == [2, 2, 1, 0, 1]
    # Nothing is told of the other clubs.
    assert report(world, "injury", NewsLine(player_id=world.clubs[2].player_ids[0], until=back), 2) is None and len(world.news) == 5


def awaiting(world, key, fee, score, player_id=201):
    offer = TransferOffer(key, world.date, player_id, 2, 1, world.players[player_id].contract, fee, fee, score, awaiting_review=True)
    world.offers[key] = offer
    news.offer_received(world, offer)
    return offer


def test_the_offers_of_a_day_for_a_player_await_their_answers_in_one_message(config):
    world, _ = human_world(config, 2)
    player = world.players[201]
    low, high = awaiting(world, "low", 40_000, .9), awaiting(world, "high", 50_000, .2)
    awaiting(world, "other", 30_000, .5, player_id=202)
    assert [(item.kind, item.player_id, [line.key for line in item.lines]) for item in world.news] == [
        ("offer_received", 201, ["low", "high"]), ("offer_received", 202, ["other"])]
    message = world.news[0]
    assert [(line.club_id, line.amount, line.state) for line in message.lines] == [(1, 40_000, "pending"), (1, 50_000, "pending")]
    # One refused: the other still awaits its answer.
    sales.answer(world, high, False)
    assert message.lines[1].state == "refused" and "high" not in world.offers and news.awaits_answer(world, message)
    sales.answer(world, low, True)
    assert message.lines[0].state == "accepted" and player.club_id == 1 and not news.awaits_answer(world, message)
    assert world.news[-1].kind == "transfer"  # the departure itself is told
    # An offer that lapses without an answer no longer asks for one.
    other = world.news[1]
    assert news.awaits_answer(world, other)
    del world.offers["other"]
    assert not news.awaits_answer(world, other) and other.lines[0].state == "pending"


def test_all_the_offers_for_a_player_are_answered_at_once(config):
    world, _ = human_world(config, 2)
    player = world.players[201]
    for key, fee, score in (("a", 40_000, .1), ("b", 30_000, .8), ("c", 50_000, .4)): awaiting(world, key, fee, score)
    message = world.news[-1]
    # All accepted: the player joins the club he prefers, whatever the fee.
    signed = sales.answer_all(world, player, True)
    assert signed.key == "b" and player.club_id == 1 and not world.offers
    assert [line.state for line in message.lines] == ["declined", "accepted", "declined"] and not news.awaits_answer(world, message)
    with pytest.raises(sales.SaleRefused): sales.answer_all(world, player, True)
    # All refused.
    for key in ("d", "e"): awaiting(world, key, 20_000, .5, player_id=202)
    assert sales.answer_all(world, world.players[202], False) is None
    assert [line.state for line in world.news[-1].lines] == ["refused", "refused"] and world.players[202].club_id == 2 and not world.offers


def test_a_contract_asked_for_awaits_its_answer_on_its_message(config):
    world, club = human_world(config)
    player = world.players[club.player_ids[1]]
    asked = Contract(2000, player.contract.end.add_years(2), world.date)
    apply(world, RenewalProposed(RenewalProposal(player.id, club.id, asked, world.date)))
    message = world.news[-1]
    assert (message.kind, message.player_id) == ("renewal_proposed", player.id)
    assert [(line.text, line.amount, line.until, line.state) for line in message.lines] == [
        ("current", 1000, player.contract.end, ""), ("asked", 2000, asked.end, "pending")]
    assert news.awaits_answer(world, message)
    renewals.turn_down(world, player)
    assert message.lines[-1].state == "refused" and not world.pending_renewals and not news.awaits_answer(world, message)
    with pytest.raises(renewals.RenewalRefused): renewals.turn_down(world, player)
    # Asked again later and accepted: the new message keeps the answer, the old one its own.
    world.date = world.date.add_days(7)
    apply(world, RenewalProposed(RenewalProposal(player.id, club.id, asked, world.date)))
    assert renewals.sign(world, player) == asked and player.contract == asked
    assert world.news[-1].lines[-1].state == "accepted" and message.lines[-1].state == "refused"
    assert not any(news.awaits_answer(world, item) for item in world.news)


def test_a_demand_told_before_messages_had_lines_keeps_its_terms_once_answered(config):
    world, club = human_world(config)
    player = world.players[club.player_ids[1]]
    had, asked = player.contract, Contract(2000, player.contract.end.add_years(2), world.date)
    world.pending_renewals[player.id] = RenewalProposal(player.id, club.id, asked, world.date)
    record(world, "renewal_proposed", f"{player.name} est prêt à prolonger à 2000 €/semaine", club.id, player.id)
    message = world.news[-1]
    assert not message.lines and news.awaits_answer(world, message)
    renewals.sign(world, player)
    assert [(line.text, line.amount, line.until, line.state) for line in message.lines] == [
        ("current", had.weekly_wage, had.end, ""), ("asked", 2000, asked.end, "accepted")]
    assert not news.awaits_answer(world, message)


def test_the_club_asks_a_player_for_his_terms_and_signs_them(config):
    world, club = human_world(config)
    player = world.players[club.player_ids[1]]
    player.contract = replace(player.contract, end=Date(world.date.year, 12, 31))
    assert renewals.renewal_obstacle(world, player) is None
    terms = renewals.asked_terms(world, player)
    assert terms.weekly_wage >= player.contract.weekly_wage and terms.end > player.contract.end
    bill = club.wage_bill - player.contract.weekly_wage
    assert renewals.sign(world, player) == terms and player.contract == terms and club.wage_bill == bill + terms.weekly_wage
    assert not world.news  # nothing to tell: the club asked
    # A contract the wage cap cannot take is refused; so is another club's player.
    other = world.players[club.player_ids[2]]
    other.contract = replace(other.contract, end=Date(world.date.year, 12, 31))
    club.wage_cap = club.wage_bill - other.contract.weekly_wage
    with pytest.raises(renewals.RenewalRefused, match="plafond salarial"): renewals.sign(world, other)
    assert renewals.renewal_obstacle(world, world.players[201]) == "Ce joueur n'est pas dans votre effectif."


def test_contracts_running_out_are_told_six_months_then_one_month_ahead(config):
    world, club = human_world(config)
    first, second = (world.players[pid] for pid in club.player_ids[:2])
    for player in (first, second): player.contract = replace(player.contract, end=Date(2026, 6, 30))
    world.date = Date(2025, 12, 29)
    news.expiry_notices(world, club)
    assert not world.news
    world.date = Date(2025, 12, 30)
    news.expiry_notices(world, club)
    assert [(item.kind, item.text, [line.player_id for line in item.lines]) for item in world.news] == [("contract_expiry", "6", [first.id, second.id])]
    assert world.news[0].lines[0].amount == first.contract.weekly_wage and world.news[0].lines[0].until == Date(2026, 6, 30)
    world.date = Date(2025, 12, 31)
    news.expiry_notices(world, club)
    second.contract = replace(second.contract, end=Date(2028, 6, 30))  # extended meanwhile
    world.date = Date(2026, 5, 30)
    news.expiry_notices(world, club)
    assert [(item.text, [line.player_id for line in item.lines]) for item in world.news] == [("6", [first.id, second.id]), ("1", [first.id])]


def test_a_transfer_window_is_told_when_it_opens_and_on_the_eve_of_its_last_day(config):
    world, club = human_world(config)
    winter = config.world.market.winter
    opening = Date(2026, winter.start_month, winter.start_day)
    end = Date(2026, winter.end_month, winter.end_day)
    world.date = opening.add_days(-1)
    news.market_notices(world, club)
    assert not world.news
    world.date = opening
    news.market_notices(world, club)
    opened = world.news[-1]
    assert (opened.kind, opened.text) == ("market_open", "winter")
    assert {line.text: line.amount or line.until for line in opened.lines} == {
        "budget": club.transfer_budget, "wages": club.wage_cap - club.wage_bill, "end": end}
    # On the eve of the last day: what is still open, an offer of its own and an offer to answer.
    world.date = end.add_days(-1)
    bought, sold = world.clubs[2].player_ids[1], club.player_ids[1]
    world.offers["talks"] = TransferOffer("talks", world.date, bought, 2, club.id, world.players[bought].contract, 100_000, 100_000, 0.0, stage=WAGE_TALKS)
    world.offers["in"] = TransferOffer("in", world.date, sold, club.id, 2, world.players[sold].contract, 1, 1, 0.0, awaiting_review=True)
    news.market_notices(world, club)
    closing = world.news[-1]
    assert (closing.kind, closing.text, len(world.news)) == ("market_close", "winter", 2)
    assert [(line.text, line.player_id, line.amount) for line in closing.lines] == [
        ("budget", None, club.transfer_budget - 100_000), ("talks", bought, None), ("offers", sold, None)]


def test_a_morale_falling_under_the_alert_is_told_once(config):
    world, club = human_world(config)
    alert = config.management.market.forced_exit_morale
    low, fine = (world.players[pid] for pid in club.player_ids[:2])
    before = news.morale_levels(world)
    assert set(before) == set(club.player_ids)
    low.morale, fine.morale = alert - .02, alert + .2
    news.morale_alerts(world, {**before, low.id: alert + .01, fine.id: alert + .3})
    assert [(item.kind, [(line.player_id, line.amount) for line in item.lines]) for item in world.news] == [("morale", [(low.id, round(low.morale * 100))])]
    assert world.news[0].lines[0].text in ("salaire", "temps_de_jeu", "ambition", "reserve", "")
    # Still low the week after: nothing new.
    news.morale_alerts(world, news.morale_levels(world))
    assert len(world.news) == 1 and len(world.news[0].lines) == 1
    # Sent to the reserve against his will, he says so.
    low.reserve_since = world.date
    low.morale = alert
    world.date = world.date.add_days(7)
    news.morale_alerts(world, {low.id: alert + .05})
    assert world.news[-1].lines[-1].text in ("reserve", "salaire", "ambition", "")


def test_the_review_of_the_season_names_the_top_scorer_and_the_best_rated_regular(config):
    world, club = human_world(config)
    scorer, regular, guest = club.player_ids[:3]
    for pid, goals, total, count in ((scorer, 12, 70, 10), (regular, 3, 150, 20), (guest, 0, 9.5, 1)):
        world.records[f"r{pid}"] = SeasonRecord(world.season, pid, club.id, 16, goals=goals, rating_sum=total, rating_count=count)
    world.records["old"] = SeasonRecord(world.season - 1, guest, club.id, 16, goals=40, rating_sum=10, rating_count=1)
    news.season_review(world, club)
    review = world.news[-1]
    # One match rated 9.5 does not make the best player: he needs half as many rated matches as the most rated one.
    assert [(line.text, line.player_id, line.amount) for line in review.lines] == [("scorer", scorer, 12), ("rating", regular, 750)]


def test_talks_can_be_given_up_until_the_contract_is_agreed(config):
    world, club = human_world(config)
    player = world.players[201]
    world.offers[f"talks:{club.id}:201"] = talks = TransferOffer(f"talks:{club.id}:201", world.date, 201, 2, club.id, player.contract, 50_000, 50_000, 0.0, stage=WAGE_TALKS)
    record(world, "talks_open", "x", club.id, 201)
    message = world.news[-1]
    assert news.awaits_answer(world, message)
    withdraw(world, player)
    assert not world.offers and not news.awaits_answer(world, message) and 201 not in world.talks_closed
    with pytest.raises(TalksRefused): withdraw(world, player)
    world.offers[talks.key] = replace(talks, stage=SIGNING, due=world.date.add_days(2))
    with pytest.raises(TalksRefused, match="signé"): withdraw(world, player)
    assert not news.awaits_answer(world, message)
