from dataclasses import replace
from random import Random

from benchmarks.fixtures import synthetic_lineup
from core.domain.clubs import Club, ClubPersonality, ClubStatus
from core.domain.date import Date
from core.domain.world import World
from core.domain.players import Contract
from core.domain.offers import TransferOffer
from core.ai.market import squad_quality
from core.ai.external_market import approach_day
from core.world.application import apply
from core.world.events import PlayerSigned


def mini_world(config):
    clubs, players = {}, {}
    for cid in (1, 2):
        lineup = synthetic_lineup(config, cid)
        squad = [slot.player for slot in lineup.slots] + lineup.bench
        for player in squad:
            player.contract = Contract(1000, Date(2028, 6, 30), Date(2025, 7, 1))
            players[player.id] = player
        clubs[cid] = Club(cid, f"Club {cid}", "FRA", 16, 16, ClubStatus.ACTIVE, 30000, 70, 70, "4-3-3",
                          ClubPersonality(.5, .5, .5, .5), [player.id for player in squad],
                          wage_bill=len(squad)*1000, wage_cap=100000, transfer_budget=1000000, balance=2000000)
    return World(Date(2025, 7, 1), 2025, 1, config, players, clubs, {}, {}, 1000, rngs={"market":Random(4)})


def test_transfer_moves_money_membership_and_wages_once(config):
    world = mini_world(config)
    player = world.players[201]
    event = PlayerSigned(player.id, 2, 1, Contract(1500, Date(2028, 6, 30), world.date), 50000)
    balance = sum(club.balance for club in world.clubs.values())
    assert apply(world, event)
    assert player.id in world.clubs[1].player_ids and player.id not in world.clubs[2].player_ids
    assert sum(club.balance for club in world.clubs.values()) == balance
    assert world.clubs[1].wage_bill == 21500 and world.clubs[2].wage_bill == 19000
    assert not apply(world, event)
    assert len(world.transfers) == 1


def test_keeper_minimum_and_reservations_block_sale(config):
    world = mini_world(config)
    goalkeeper = world.players[200]
    contract = Contract(1000, Date(2028, 6, 30), world.date)
    assert not apply(world, PlayerSigned(goalkeeper.id, 2, 1, contract, 1000))
    reserved = TransferOffer("reserve", world.date, 202, 2, 1, contract, 990000, 990000, 1)
    world.offers[reserved.key] = reserved
    assert not apply(world, PlayerSigned(201, 2, 1, contract, 50000))


def test_backup_has_positive_marginal_value_without_duplicating_a_starter(config):
    world = mini_world(config)
    squad = [world.players[pid] for pid in world.clubs[1].player_ids[:11]]
    backup = replace(squad[0], id=999)
    assert squad_quality([*squad, backup], world.clubs[1], config) > squad_quality(squad, world.clubs[1], config)


def test_external_approach_is_once_per_window_and_seed_stable():
    start, end = Date(2025, 6, 10), Date(2025, 8, 31)
    assert approach_day(1, 77, start, end, 0) is None
    day = approach_day(1, 77, start, end, 1)
    assert start <= day <= end
    assert day == approach_day(1, 77, start, end, 1)


def test_emergency_recruitment_restores_keeper_before_other_position_needs(config):
    from core.world.market import ensure_minimums

    world = mini_world(config)
    club = world.clubs[1]
    keeper = world.players[100]
    club.player_ids.remove(keeper.id)
    club.wage_bill -= keeper.contract.weekly_wage
    keeper.club_id, keeper.contract = None, None
    # A missing outfield role must not displace the hard goalkeeper minimum.
    for pid in club.player_ids:
        if world.players[pid].position == "DC":
            world.players[pid].position = world.players[101].position
    club.wage_cap = 10000000
    ensure_minimums(world)
    assert keeper.club_id == club.id
    assert sum(world.players[pid].position == "GB" for pid in club.player_ids) == 2
