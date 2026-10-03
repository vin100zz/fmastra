"""The reserve and the loans: where a young player develops when the first team has no minutes for him."""
from dataclasses import replace
from random import Random

import pytest

from core.ai.market import can_sell
from core.ai.selection import LineupContext
from core.domain.date import Date
from core.domain.players import ATTRIBUTE_NAMES, Attributes, Contract
from core.world.application import apply
from core.world.contracts import contentment, position_ranks
from core.world.events import LoanEnded, LoanStarted, PlayerReleased, PlayerSigned, ReserveChanged
from core.world.loans import (LoanRefused, borrow, lend, lendable, loan_ends, return_events, run_loan_round, season_end, takers)
from core.world.player_states import playing_factor
from core.world.reserves import ReserveRefused, depth_rank, reserve_events, set_reserve, starters_at, surplus_prospects
from core.world.transfer_rules import frustration
from test_market import extra_buyer, mini_world


def prospect(world, club_id=2, level=50, potential=95, age=18):
    """A substitute at a position his club starts two players at, made young and far from his potential."""
    club = world.clubs[club_id]
    player = next(world.players[pid] for pid in club.player_ids[11:] if starters_at(club, world.players[pid].position, world.config) == 2)
    player.attributes, player.rating, player.potential = Attributes((level,) * len(ATTRIBUTE_NAMES)), level, potential
    player.born = Date(world.date.year - age, 1, 1)
    return player


def summer(config):
    world = mini_world(config)
    world.date = Date(2026, 7, 15)
    for club in world.clubs.values(): club.competition_id = 16
    return world


def test_minutes_count_less_and_less_and_training_sets_the_floor(config):
    world = mini_world(config)
    club, player, rules = world.clubs[1], world.players[105], config.demography.progression
    start, world.date = Date(2026, 7, 1), Date(2026, 8, 1)
    club.competition_id = 16
    assert playing_factor(world, player, start) == rules.min_playing_factor  # a club without a training rating
    club.training_facilities = 1
    assert playing_factor(world, player, start) == pytest.approx(rules.training_floor.lowest)
    club.training_facilities = 20
    floor = rules.training_floor.highest
    assert playing_factor(world, player, start) == pytest.approx(floor)
    # A quarter of the minutes of reference is worth half the way to a full month.
    player.monthly_minutes = rules.monthly_reference_minutes / 4
    assert playing_factor(world, player, start) == pytest.approx(floor + (1 - floor) * .25 ** rules.minutes_exponent)
    player.monthly_minutes = 3 * rules.monthly_reference_minutes
    assert playing_factor(world, player, start) == 1
    club.competition_id = None
    assert playing_factor(world, player, start) == rules.external_playing_factor


def test_the_reserve_is_worth_its_factor_for_the_days_spent_there_and_fades_near_the_club_level(config):
    world = mini_world(config)
    club, rules = world.clubs[2], config.demography.progression
    club.competition_id = 16
    player = prospect(world)
    floor, start, world.date = rules.min_playing_factor, Date(2026, 7, 1), Date(2026, 8, 1)
    player.reserve_since = Date(2026, 6, 1)
    assert playing_factor(world, player, start) == pytest.approx(rules.reserve.factor)
    # In proportion to the days of the month: a stretch still open, or closed ones.
    player.reserve_since = Date(2026, 7, 17)
    assert playing_factor(world, player, start) == pytest.approx(floor + (rules.reserve.factor - floor) * 15 / 31)
    player.reserve_since, player.reserve_days = None, 10
    assert playing_factor(world, player, start) == pytest.approx(floor + (rules.reserve.factor - floor) * 10 / 31)
    # Minutes played in the first team are not added to it: the better of the two counts.
    player.monthly_minutes = rules.monthly_reference_minutes
    assert playing_factor(world, player, start) == 1
    # Close to the level his club aims at, the reserve teaches him nothing more.
    player.monthly_minutes, player.reserve_since = 0, Date(2026, 6, 1)
    target = config.management.target_profile.base_level + config.management.target_profile.reputation_weight * club.reputation
    player.rating = target - rules.reserve.level_margin
    assert playing_factor(world, player, start) == floor


def test_the_days_in_the_reserve_are_counted_within_the_month(config):
    world = mini_world(config)
    player = world.players[205]
    world.date = Date(2026, 6, 20)
    apply(world, ReserveChanged(player.id, True))
    world.date = Date(2026, 7, 5)
    apply(world, ReserveChanged(player.id, False))
    assert (player.reserve_since, player.reserve_days) == (None, 4)
    world.date = Date(2026, 7, 10)
    apply(world, ReserveChanged(player.id, True))
    world.date = Date(2026, 7, 20)
    apply(world, ReserveChanged(player.id, False))
    assert player.reserve_days == 14


def test_a_reserve_player_is_selected_for_no_match_and_takes_no_rank_from_the_others(config):
    world = mini_world(config)
    club = world.clubs[2]
    player = prospect(world, level=90)
    rival = next(world.players[pid] for pid in club.player_ids if pid != player.id and world.players[pid].position == player.position)
    assert position_ranks(world, club)[player.id] == 0 and position_ranks(world, club)[rival.id] > 0
    apply(world, ReserveChanged(player.id, True))
    assert player.id not in {item.id for item in LineupContext.from_world(world, 2, 16, world.date).players}
    # The best at his position keeps the rank he would have; the next one is now the first of the first team.
    ranks = position_ranks(world, club)
    assert ranks[player.id] == 0 and min(ranks[pid] for pid in club.player_ids if pid != player.id and world.players[pid].position == player.position) == 0


@pytest.mark.parametrize("age,level,content", [(18, 50, 1.0), (26, 50, 0.0), (18, 90, 0.0)])
def test_only_a_young_player_who_would_not_start_accepts_the_reserve(config, age, level, content):
    world = mini_world(config)
    club = world.clubs[2]
    player = prospect(world, level=level, age=age)
    apply(world, ReserveChanged(player.id, True))
    mood = contentment(world, player, club, position_ranks(world, club)[player.id], 10, 0)
    assert mood.playing_time == content


def test_the_human_club_keeps_a_first_team_of_the_minimum_size(config):
    world = mini_world(config)
    world.controlled_club_id = 2
    club, guard = world.clubs[2], config.management.guardrails
    outfield = [world.players[pid] for pid in club.player_ids if world.players[pid].position != "GB"]
    for player in outfield[:len(club.player_ids) - guard.min_squad]: set_reserve(world, player, True)
    with pytest.raises(ReserveRefused, match="équipe première"): set_reserve(world, outfield[-1], True)
    set_reserve(world, outfield[0], False)
    keeper = next(world.players[pid] for pid in club.player_ids if world.players[pid].position == "GB")
    with pytest.raises(ReserveRefused, match="gardiens"): set_reserve(world, keeper, True)
    with pytest.raises(ReserveRefused, match="pas dans votre effectif"): set_reserve(world, world.players[105], True)


def test_ai_clubs_send_their_surplus_prospects_to_the_reserve_and_call_them_back(config):
    world = summer(config)
    club = world.clubs[2]
    player = prospect(world)
    assert [item.id for item in surplus_prospects(world, club)] == [player.id]
    assert reserve_events(world) == [ReserveChanged(player.id, True)]
    apply(world, ReserveChanged(player.id, True))
    assert reserve_events(world) == []
    # An injury ahead of him leaves him first substitute: the club needs him back.
    ahead = next(world.players[pid] for pid in club.player_ids if pid != player.id and world.players[pid].position == player.position)
    from core.domain.players import Injury
    ahead.injury = Injury(world.date, world.date.add_days(30), "grave")
    assert depth_rank(world, club, player, healthy=True) == starters_at(club, player.position, config)
    assert reserve_events(world) == [ReserveChanged(player.id, False)]
    # The human club decides for itself.
    ahead.injury, world.controlled_club_id = None, 2
    assert reserve_events(world) == []


def test_a_loan_moves_the_player_and_leaves_his_wage_and_his_place_with_his_owner(config):
    world = summer(config)
    owner, club = world.clubs[2], world.clubs[1]
    player = prospect(world)
    end = Date(2027, 6, 30)
    bills = (owner.wage_bill, club.wage_bill)
    apply(world, ReserveChanged(player.id, True))
    assert apply(world, LoanStarted(player.id, club.id, end))
    assert (player.club_id, player.loan.parent_id, player.loan.end, player.owner_id) == (1, 2, end, 2)
    assert player.id in club.player_ids and player.id in owner.loaned_ids and player.id not in owner.player_ids
    # The squad limit counts him where he is under contract.
    assert (owner.wage_bill, club.wage_bill) == bills and (owner.squad_size, club.squad_size) == (20, 20) and club.borrowed_ids == [player.id]
    assert player.reserve_since is None
    # Until he is back he is neither sold nor extended, and the smaller club is no cause for restlessness.
    contract = Contract(1500, Date(2030, 6, 30), world.date)
    assert not apply(world, PlayerSigned(player.id, 1, 2, contract, 0))
    assert not apply(world, PlayerSigned(player.id, 2, 2, contract, 0, True))
    assert not can_sell(player, club, world)
    player.rating, club.reputation = 95, 30
    assert frustration(player, world) == 0
    assert not apply(world, LoanStarted(player.id, 2, end))
    # He is back the day after the loan ends.
    world.date = end
    assert return_events(world) == []
    world.date = end.add_days(1)
    assert return_events(world) == [LoanEnded(player.id)]
    apply(world, LoanEnded(player.id))
    assert (player.club_id, player.loan) == (2, None) and owner.loaned_ids == club.borrowed_ids == [] and player.id in owner.player_ids
    assert [move.kind for move in world.transfers] == ["loan", "loan_return"]
    assert (owner.wage_bill, club.wage_bill) == bills


def test_a_loan_never_outlasts_the_contract_and_a_release_on_loan_frees_the_owner(config):
    world = summer(config)
    owner, club = world.clubs[2], world.clubs[1]
    player = prospect(world)
    assert not apply(world, LoanStarted(player.id, club.id, player.contract.end))
    assert apply(world, LoanStarted(player.id, club.id, Date(2027, 6, 30)))
    bill = owner.wage_bill
    apply(world, PlayerReleased(player.id))
    assert owner.wage_bill == bill - 1000 and club.wage_bill == 20000
    assert owner.loaned_ids == club.borrowed_ids == [] and player.id not in club.player_ids and (player.club_id, player.loan) == (None, None)
    assert world.transfers[-1].source_id == owner.id


@pytest.mark.parametrize("today,ends", [
    (Date(2026, 6, 15), {"saison": Date(2027, 6, 30), "demi_saison": Date(2026, 12, 31)}),
    (Date(2026, 7, 15), {"saison": Date(2027, 6, 30), "demi_saison": Date(2026, 12, 31)}),
    (Date(2027, 1, 10), {"saison": Date(2027, 6, 30)}),
    (Date(2026, 10, 10), {}),
])
def test_a_loan_runs_to_the_end_of_the_season_or_to_the_winter_window(config, today, ends):
    world = mini_world(config)
    world.date = today
    assert loan_ends(world) == ends
    assert season_end(world) == Date(2027, 6, 30)


def loan_market(config, probability=1.0):
    """Club 2 has a prospect to lend; club 3, without a player, would field anyone."""
    world = summer(config)
    rules = replace(config.management.market, loans=replace(config.management.market.loans, weekly_probability=probability))
    world.config = replace(config, management=replace(config.management, market=rules))
    taker = extra_buyer(world, 3)
    taker.competition_id = 16
    return world, prospect(world, level=67), taker


def test_ai_clubs_lend_their_prospects_to_the_most_reputed_club_where_they_would_play(config):
    world, player, taker = loan_market(config)
    owner = world.clubs[2]
    assert [item.id for item in lendable(world, owner)] == [player.id]
    # Club 1 has four better players at his position: he would not play there.
    assert takers(world, player) == [taker]
    bigger = extra_buyer(world, 4)
    bigger.competition_id, bigger.reputation = 16, 80
    assert takers(world, player) == [bigger, taker]
    run_loan_round(world)
    assert (player.club_id, player.loan.parent_id, player.loan.end) == (4, 2, Date(2027, 6, 30))
    # Outside the windows nothing moves.
    other = prospect(world, club_id=1)
    world.date = Date(2026, 10, 12)
    run_loan_round(world)
    assert other.loan is None


def test_a_club_that_cannot_spare_him_or_whose_contract_is_too_short_does_not_lend(config):
    world, player, _ = loan_market(config)
    owner = world.clubs[2]
    player.contract = Contract(1000, Date(2027, 6, 30), world.date)
    assert lendable(world, owner) == []
    player.contract = Contract(1000, Date(2029, 6, 30), world.date)
    for pid in owner.player_ids[:2]:
        owner.player_ids.remove(pid)
    assert len(owner.player_ids) == config.management.guardrails.min_squad and lendable(world, owner) == []


def test_the_human_club_lends_to_a_club_that_would_take_the_player(config):
    world, player, taker = loan_market(config, probability=0.0)
    world.controlled_club_id = 2
    # Its players are lent by its own command only.
    assert lendable(world, world.clubs[2]) == []
    run_loan_round(world)
    assert player.loan is None
    with pytest.raises(LoanRefused, match="plus intéressé"): lend(world, player, 1, "saison")
    with pytest.raises(LoanRefused, match="pas dans votre effectif"): lend(world, world.players[105], 3, "saison")
    lend(world, player, taker.id, "demi_saison")
    assert (player.club_id, player.loan.end) == (3, Date(2026, 12, 31))
    assert [entry.kind for entry in world.news] == ["loan"]
    world.date = Date(2026, 10, 1)
    with pytest.raises(LoanRefused, match="mercato est fermé"): lend(world, prospect(world), taker.id, "saison")


def test_the_human_club_borrows_only_a_player_his_club_lends_and_who_would_play(config):
    world, player, taker = loan_market(config, probability=0.0)
    world.controlled_club_id = 1
    with pytest.raises(LoanRefused, match="pas assez de temps de jeu"): borrow(world, player, "saison")
    world.controlled_club_id = taker.id
    starter = world.players[201]
    with pytest.raises(LoanRefused, match="ne souhaite pas prêter"): borrow(world, starter, "saison")
    with pytest.raises(LoanRefused, match="durée"): borrow(world, player, "trimestre")
    borrow(world, player, "saison")
    assert (player.club_id, player.loan.parent_id) == (taker.id, 2) and taker.wage_bill == 0
    with pytest.raises(LoanRefused, match="déjà prêté"): borrow(world, player, "saison")


def test_loans_and_the_reserve_survive_a_save_and_an_older_save_has_none(config, tmp_path):
    import gzip
    import hashlib
    import json
    from core.domain.clubs import Competition
    from infrastructure.persistence.store import MIGRATION_DEFAULTS, SaveStore
    world = mini_world(config)
    world.competitions[-16] = Competition(-16, "Test", "FRA", 1, [1, 2])
    for club in world.clubs.values(): club.competition_id = -16
    world.rngs = {key: Random(1) for key in ("market", "matches", "states", "progression", "demography")}
    world.date = Date(2026, 7, 15)
    apply(world, ReserveChanged(105, True))
    assert apply(world, LoanStarted(205, 1, Date(2027, 6, 30)))
    store = SaveStore(tmp_path)
    path = store.save(world, "loan")
    restored = store.load("loan")
    assert restored.players[205].loan == world.players[205].loan and restored.clubs[2].loaned_ids == [205]
    assert restored.players[105].reserve_since == Date(2026, 7, 15)
    # A save of the version before has neither the fields nor the rules: it reads with nobody lent and today's rules.
    payload = json.loads(gzip.decompress(path.read_bytes()))
    payload["schema_version"] = 24
    saved = payload["world"]
    borrowed = saved["players"]["205"]
    saved["clubs"]["1"]["player_ids"].remove(205)
    saved["clubs"]["2"]["player_ids"].append(205)
    borrowed["club_id"] = 2
    saved["transfers"] = []
    for player in saved["players"].values():
        for name in ("loan", "reserve_since", "reserve_days"): del player[name]
    for club in saved["clubs"].values():
        for name in ("loaned_ids", "borrowed_ids"): del club[name]
    rules = saved["config"]
    for introduced, config_path, defaults in MIGRATION_DEFAULTS:
        if introduced > 24:
            for key in defaults: del rules[config_path[0]][config_path[1]][key]
    payload["config_hash"] = hashlib.sha256(json.dumps(rules, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    path.write_bytes(gzip.compress(json.dumps(payload).encode()))
    older = store.load("loan")
    assert older.players[205].loan is None and older.players[105].reserve_since is None and older.clubs[2].loaned_ids == []
    assert older.config.demography.progression == config.demography.progression
    assert older.config.management.market.loans == config.management.market.loans
