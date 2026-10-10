from dataclasses import replace
from random import Random

import pytest

from core.domain.clubs import ClubStatus
from core.domain.date import Date
from core.domain.players import Contract
from core.world.estimates import estimate_potential, opinion, opinion_factor
from test_market import dormant_club, mini_world


def prospect(world, rating=50.0, potential=90.0, born=2008):
    """Player 201, of club 2, as a young player far from what he can become."""
    player = world.players[201]
    player.rating, player.potential, player.born = rating, potential, Date(born, 1, 1)
    return player


def test_an_opinion_is_bounded_and_moves_month_by_month(config):
    rules = config.management.valuation.opinion
    views = [opinion(player_id, Date(2030, 6, 1), 7, config, observer) for player_id in range(300) for observer in (None, 1, 2)]
    assert max(views) == rules.max_deviations and min(views) == -rules.max_deviations
    assert -0.15 < sum(views) / len(views) < 0.15
    # Two observers do not think alike, and one keeps much of what it thought the year before.
    assert opinion(5, Date(2030, 6, 1), 7, config, 1) != opinion(5, Date(2030, 6, 1), 7, config, 2)
    pairs = [(opinion(player_id, Date(2030, 12, 1), 7, config), opinion(player_id, Date(2031, 12, 1), 7, config)) for player_id in range(600)]
    alike = sum(first * second for first, second in pairs) / len(pairs)
    assert 0.35 < alike < 0.8
    # No jump on the first day of a year: each month is a twelfth of the way from one year's view to the next.
    for player_id in range(40):
        months = [opinion(player_id, Date(2030 + month // 12, month % 12 + 1, 1), 7, config) for month in range(24)]
        steps = [abs(after - before) for before, after in zip(months, months[1:])]
        assert max(steps) <= 2 * rules.max_deviations / 12 + 1e-9


def test_an_opinion_moves_only_what_a_players_potential_adds_to_his_value(config):
    from core.ai.market import market_value
    from core.world.importation.synthesis import intrinsic_value
    world = mini_world(config)
    rules = config.management.valuation
    player = prospect(world)
    age = player.born.age_on(world.date)
    proven = intrinsic_value(player.rating, age, player.position, config)
    promise = intrinsic_value(player.potential * rules.potential_weight, age, player.position, config) - proven
    assert promise > 10 * proven
    values = [market_value(player, world, replace(world.clubs[1], id=observer), False) for observer in range(1, 200)]
    widest = rules.opinion.young_factor
    # However a club reads him, his value stays within the widest factor of his age around what he is worth.
    assert proven + promise / widest - 1 <= min(values) < max(values) <= proven + promise * widest + 1
    assert max(values) / min(values) > 1.3
    # The older he is, the less his potential is a matter of opinion.
    player.born = Date(world.date.year - 23, 1, 1)
    factors = [opinion_factor(player, world.date, world.seed, config, observer, 50) for observer in range(1, 200)]
    assert 1 / rules.opinion.mature_factor <= min(factors) < max(factors) <= rules.opinion.mature_factor
    # A finished player is worth his level to everybody.
    player.potential = player.rating
    assert len({market_value(player, world, replace(world.clubs[1], id=observer), False) for observer in range(1, 50)}) == 1
    # What a club estimates of a potential follows the same opinion: it thinks more of the player it values more.
    player = prospect(world)
    ranked = sorted(range(1, 60), key=lambda observer: opinion(player.id, world.date, world.seed, config, observer))
    low, high = ranked[0], ranked[-1]
    assert estimate_potential(player, world.date, world.seed, config, low, 50).center < estimate_potential(player, world.date, world.seed, config, high, 50).center
    assert market_value(player, world, replace(world.clubs[1], id=low), False) < market_value(player, world, replace(world.clubs[1], id=high), False)


def test_a_player_above_his_club_is_worth_less_to_buy_and_no_less_to_pay(config):
    from core.ai.market import asking_price, exposure_factor, market_value
    world = mini_world(config)
    rules = config.management.valuation.exposure
    player, club = world.players[201], world.clubs[2]
    player.rating = player.potential = 80
    club.reputation = 95
    full = market_value(player, world)
    assert exposure_factor(80, club, config) == 1.0
    # Within the margin above the level his club aims at, nothing changes; beyond it, each point takes its share off.
    from core.world.transfer_rules import target_level
    club.reputation = 60
    beyond = 80 - target_level(club, config) - rules.level_margin
    assert beyond > 5
    assert exposure_factor(80, club, config) == pytest.approx(2.718281828 ** (-rules.discount_per_point * beyond))
    assert market_value(player, world) == pytest.approx(full * exposure_factor(80, club, config), rel=1e-6)
    # His wage follows what he is worth, wherever he plays.
    wages = market_value(player, world, None, False)
    club.reputation = 95
    assert market_value(player, world, None, False) == wages
    # A tiny club cannot ask for him what a great one would, and the discount has a floor.
    great = asking_price(player, club, world)
    club.reputation = 10
    assert exposure_factor(80, club, config) == rules.floor
    assert asking_price(player, club, world) < 0.2 * great
    # Without a club, nothing to discount.
    assert exposure_factor(80, None, config) == 1.0


def test_a_season_weighs_on_the_proven_part_of_a_transfer_value(config):
    from core.ai.market import market_value, performance_factor, season_performance
    world = mini_world(config)
    rules = config.management.valuation.performance
    club = world.clubs[2]
    club.reputation = 99  # no exposure at play
    player, regular = world.players[201], world.players[202]
    player.potential = player.rating
    matches = config.management.market.minutes_confidence_matches
    full = matches * config.engine.timing.match_seconds / 60
    neutral = market_value(player, world)
    # Nothing played yet: last season speaks, and it said nothing.
    assert performance_factor(player, club, world) == 1.0
    # A regular with high ratings is worth more, a reserve with poor ones less, within the bounds.
    regular.season_minutes = player.season_minutes = full
    player.rating_count, player.rating_sum = matches, matches * (rules.reference_rating + rules.full_rating_gap)
    best = season_performance(player, full, config)
    assert best == pytest.approx(1 + rules.playing_time_weight + rules.rating_weight) == performance_factor(player, club, world)
    assert market_value(player, world) == pytest.approx(neutral * best, rel=1e-6)
    player.season_minutes, player.rating_sum = 0, matches * (rules.reference_rating - 2 * rules.full_rating_gap)
    assert season_performance(player, full, config) == pytest.approx(max(rules.min_factor, 1 - rules.playing_time_weight - rules.rating_weight))
    # A single rated match says little.
    player.rating_count, player.rating_sum = 1, 9.5
    assert 1 - rules.playing_time_weight < season_performance(player, full, config) < 1
    # Early in a season, the one before fills in; his wage never follows his form.
    regular.season_minutes = full / 2
    player.season_minutes, player.rating_count, player.rating_sum, player.past_performance = full / 2, 0, 0, 1.3
    assert performance_factor(player, club, world) == pytest.approx(0.5 * (1 + rules.playing_time_weight) + 0.5 * 1.3)
    assert market_value(player, world, None, False) == neutral
    # No match is played in a dormant club: no form to read.
    club.competition_id, club.status = None, ClubStatus.DORMANT
    assert performance_factor(player, club, world) == 1.0


def test_the_season_just_played_is_kept_when_the_next_one_opens(config):
    from core.ai.market import season_performance
    from core.world.application import apply
    from core.world.events import SeasonOpened
    world = mini_world(config)
    matches = config.management.market.minutes_confidence_matches
    full = matches * config.engine.timing.match_seconds / 60
    star, reserve, outsider = world.players[201], world.players[202], world.players[101]
    star.season_minutes, star.rating_count, star.rating_sum = full, matches, matches * 7.2
    world.clubs[1].competition_id, world.clubs[1].status = None, ClubStatus.DORMANT
    outsider.season_minutes = full
    expected = season_performance(star, full, config), season_performance(reserve, full, config)
    assert apply(world, SeasonOpened(world.season + 1, [], {}))
    assert (star.past_performance, reserve.past_performance) == expected
    assert expected[0] > 1 > expected[1] and outsider.past_performance == 1.0 and star.season_minutes == 0


def test_a_dormant_club_never_refuses_to_sell_a_player_who_wants_to_leave(config):
    from core.ai.market import asking_price, seller_accepts
    from core.world.transfer_rules import wants_to_leave

    class Unlucky(Random):
        def random(self): return 0.999

    world = mini_world(config)
    club = dormant_club(world, keep=3)
    player = world.players[club.player_ids[0]]
    fee = asking_price(player, club, world)
    assert not wants_to_leave(player, world) and not seller_accepts(player, club, fee, world, Unlucky())
    player.rating, club.reputation = 94, 30
    assert wants_to_leave(player, world)
    assert seller_accepts(player, club, asking_price(player, club, world), world, Unlucky())


def test_every_club_sees_the_players_who_want_to_leave_and_one_day_looks_for_a_prospect(config, monkeypatch):
    from core.ai.market import propose_transfers
    import core.ai.external_market as external_market
    world = mini_world(config)
    market = replace(config.management.market, daily_proposal_probability=1, max_candidates_scanned=0, visible_talents=0)
    world.config = replace(config, management=replace(config.management, market=market))
    summer = config.world.market.summer
    world.date = Date(world.date.year, summer.start_month, summer.start_day).add_days(3)
    buyer, seller = world.clubs[1], world.clubs[2]
    for club in (buyer, seller):
        club.wage_cap = club.transfer_budget = club.balance = 10 ** 10
        club.income = 10 ** 9
    for pid in range(800, 806):
        # Spare goalkeepers: the seller can let one go.
        extra = replace(world.players[200], id=pid, contract=replace(world.players[200].contract))
        world.players[pid] = extra
        seller.player_ids.append(pid)
        seller.wage_bill += extra.contract.weekly_wage
    # A goalkeeper the buyer needs, outside every sample: only his wish to leave makes him known.
    squad = list(buyer.player_ids)
    buyer.player_ids = [pid for pid in squad if world.players[pid].position != "GB"]
    keeper = world.players[200]
    monkeypatch.setattr(external_market, "approach_day", lambda *args: None)
    assert not [bid for bid in propose_transfers(world, Random(2)) if bid.player_id == keeper.id]
    keeper.rating, seller.reputation, buyer.reputation = 94, 40, 95
    assert [bid.target_id for bid in propose_transfers(world, Random(2)) if bid.player_id == keeper.id] == [buyer.id]
    # On its day, a club with no need left bids for the best prospect it reads above its level.
    keeper.rating, seller.reputation, buyer.reputation = 70, 70, 70
    buyer.player_ids = squad
    young = prospect(world, rating=60.0, potential=99.0)
    monkeypatch.setattr(external_market, "approach_day", lambda seed, club_id, start, end, probability, purpose="external_approach":
                        world.date if purpose == "prospect_search" and club_id == buyer.id else None)
    bids = [bid for bid in propose_transfers(world, Random(2)) if bid.target_id == buyer.id]
    assert [bid.player_id for bid in bids] == [young.id] and bids[0].fee <= bids[0].limit
    # Not for a player the world rates no higher than its own.
    young.potential = 72.0
    assert not [bid for bid in propose_transfers(world, Random(2)) if bid.target_id == buyer.id]


def test_a_dormant_club_brings_nobody_on_beyond_its_own_level(config):
    from core.world.player_states import playing_factor
    from core.world.transfer_rules import target_level
    world = mini_world(config)
    rules = config.demography.progression
    club = dormant_club(world)
    player = world.players[club.player_ids[0]]
    start = world.date.add_days(-30)
    aim = target_level(club, config)
    player.rating = aim
    assert playing_factor(world, player, start) == rules.external_playing_factor
    player.rating = aim + rules.dormant.level_margin + rules.dormant.fade_span / 2
    assert playing_factor(world, player, start) == pytest.approx((rules.external_playing_factor + rules.dormant.floor) / 2)
    player.rating = aim + rules.dormant.level_margin + rules.dormant.fade_span + 5
    assert playing_factor(world, player, start) == pytest.approx(rules.dormant.floor)
    # Without a club at all, the flat factor stays.
    player.club_id = None
    assert playing_factor(world, player, start) == rules.external_playing_factor
