from dataclasses import replace

import pytest

from core.domain.clubs import Club, ClubPersonality, ClubStatus, Competition
from core.domain.date import Date
from core.domain.world import World
from core.world.application import apply
from core.world.calendar import Standing
from core.world.reputation import club_level, division_levels, honours_scores, initialize_reputation, reputation_events

D1, D2, D3, POOL = 16, 17, 18, 19


@pytest.fixture
def pyramid(config):
    """Three French leagues and their reserve pool, eight first teams each, with reputations 80/60/50/40."""
    clubs, leagues = {}, {}
    personality = ClubPersonality(.5, .5, .5, .5)
    for level, (division, reputation) in enumerate(((D1, 80), (D2, 60), (D3, 50), (POOL, 40)), 1):
        ids = list(range(level * 100, level * 100 + 8))
        for cid in ids:
            active = level < 4
            clubs[cid] = Club(cid, str(cid), 'FRA', division, division if active else None,
                              ClubStatus.ACTIVE if active else ClubStatus.DORMANT, 1000, reputation, 50,
                              '4-3-3', personality, division_id=division)
        if active:
            leagues[division] = Competition(division, f'D{level}', 'FRA', level, ids)
    world = World(Date(2026, 7, 1), 2025, 42, config, {}, clubs, leagues, {}, 10000)
    initialize_reputation(world)
    return world


def table(*club_ids):
    return [Standing(cid) for cid in club_ids]


def revise(world, tables=None, champions=None):
    events = reputation_events(world, tables or {}, champions or {})
    for event in events:
        apply(world, event)
    return {event.club_id: event.reputation for event in events}


def move(world, club_id, division):
    """Put a club in another league, as a promotion or a relegation would."""
    club = world.clubs[club_id]
    if club.competition_id is not None:
        world.competitions[club.competition_id].club_ids.remove(club_id)
    club.competition_id = division if division in world.competitions else None
    club.division_id = division
    club.status = ClubStatus.ACTIVE if club.competition_id else ClubStatus.DORMANT
    if club.competition_id:
        world.competitions[division].club_ids.append(club_id)


def test_levels_cover_the_simulated_leagues_and_put_each_reserve_pool_one_level_below(config):
    levels = division_levels(config)
    assert (levels[D1], levels[D2], levels[D3]) == (('FRA', 1), ('FRA', 2), ('FRA', 3))
    assert levels[POOL] == levels[914522] == levels[914523] == ('FRA', 4)
    assert levels[11] == ('ENG', 1) and levels[13] == ('ENG', 3)


def test_initialization_fixes_anchors_ceilings_and_first_history_and_is_repeatable(pyramid):
    assert all(club.reputation_anchor == club.reputation for club in pyramid.clubs.values())
    assert pyramid.reputation_ceilings == {'FRA': {1: 80, 2: 60, 3: 50, 4: 40}}
    assert pyramid.reputation_history[100] == [(2025, 80)]
    pyramid.clubs[200].reputation = 10
    pyramid.clubs[201].is_reserve = True
    before = (pyramid.reputation_ceilings, pyramid.reputation_history)
    initialize_reputation(pyramid)
    assert (pyramid.reputation_ceilings, pyramid.reputation_history) == before  # nothing is replaced


def test_ceiling_is_the_median_of_first_teams_and_ignores_reserve_sides(config, pyramid):
    fresh = replace(pyramid, reputation_ceilings={}, reputation_history={})
    for offset, reputation in enumerate((40, 50, 60, 70, 80, 90, 55, 65)):
        fresh.clubs[200 + offset].reputation_anchor = reputation
    fresh.clubs[207].is_reserve = True  # 65 is a B team: the median of the seven others is 60
    initialize_reputation(fresh)
    assert fresh.reputation_ceilings['FRA'][2] == 60


def test_ranks_around_the_middle_of_the_table_offset_each_other_and_a_club_without_a_table_stays_put(pyramid):
    rows = table(*range(100, 108))  # eight clubs: the fifth and sixth positions offset each other
    moved = revise(pyramid, {D1: rows})
    assert moved[103] == pytest.approx(80 + 0.4 * 3 * (1 - 2 * 3 / 7))
    assert moved[104] == pytest.approx(80 + 0.4 * 3 * (1 - 2 * 4 / 7))
    assert moved[103] + moved[104] == pytest.approx(160)
    assert moved[300] == 50  # no table, no move: level 3 clubs sit at their ceiling


def test_rank_moves_the_target_by_the_configured_spread(pyramid):
    moved = revise(pyramid, {D1: table(*range(100, 108))})
    assert moved[100] == pytest.approx(80 + 0.4 * 3) and moved[107] == pytest.approx(80 - 0.4 * 3)


def test_a_fallen_giant_loses_its_surplus_over_the_years_and_settles_at_the_division_ceiling(pyramid):
    pyramid.clubs[100].reputation = pyramid.clubs[100].reputation_anchor = 91.5
    pyramid.reputation_ceilings['FRA'][2] = 58
    move(pyramid, 100, D2)
    held = []
    for _ in range(5):
        held.append(revise(pyramid)[100])
    assert held[0] == pytest.approx(91.5 + 0.4 * (58 - 91.5))
    assert held == sorted(held, reverse=True) and held[-1] == pytest.approx(58 + 33.5 * 0.6 ** 5)
    assert 60 < held[-1] < 61
    promoted = pyramid.clubs[201]
    promoted.reputation = promoted.reputation_anchor = 59.5
    move(pyramid, 201, D1)
    assert revise(pyramid)[201] == pytest.approx(59.5 + 0.4 * 6)
    assert held[0] > 60 + 0.4 * 6  # a year after, the relegated club is still far above the promoted one


def test_the_giant_returns_towards_its_anchor_once_back_in_the_top_flight(pyramid):
    pyramid.clubs[100].reputation = pyramid.clubs[100].reputation_anchor = 91.5
    pyramid.reputation_ceilings['FRA'][2] = 58
    move(pyramid, 100, D2)
    revise(pyramid), revise(pyramid)
    low = pyramid.clubs[100].reputation
    move(pyramid, 100, D1)
    back = [revise(pyramid)[100] for _ in range(3)]
    assert back == sorted(back) and back[0] > low and back[-1] < 91.5 + 0.1


def test_a_promoted_club_rises_one_division_gain_and_the_reserve_pool_is_capped_like_a_division(pyramid):
    move(pyramid, 200, D1)
    assert revise(pyramid)[200] == pytest.approx(60 + 0.4 * 6)
    pool = pyramid.clubs[400]
    pool.reputation = pool.reputation_anchor = 45  # above the median of the pool
    assert revise(pyramid)[400] == pytest.approx(45 - 0.4 * 5)


def test_dormant_club_moves_with_its_level_and_a_club_of_unknown_division_only_with_europe_and_honours(pyramid, config):
    move(pyramid, 300, POOL)
    assert club_level(pyramid, pyramid.clubs[300], division_levels(config)) == ('FRA', 4)
    assert revise(pyramid)[300] == pytest.approx(50 + 0.4 * (40 - 50))  # one level lower, and over the pool's ceiling
    foreign = pyramid.clubs[101]
    foreign.source_division_id = foreign.division_id = 999
    foreign.competition_id, foreign.status = None, ClubStatus.DORMANT
    pyramid.competitions[D1].club_ids.remove(101)
    assert club_level(pyramid, foreign, division_levels(config)) is None
    assert revise(pyramid)[101] == 80
    pyramid.competitions[-101] = Competition(-101, 'Ligue des champions', 'EUR', 0, [101], kind='europe', code='C1')
    assert revise(pyramid)[101] == pytest.approx(80 + 0.4 * 3)


def test_european_places_are_worth_more_for_the_champions_league(pyramid):
    for cid, code, club in ((-101, 'C1', 102), (-103, 'C3', 103), (-104, 'C4', 104)):
        pyramid.competitions[cid] = Competition(cid, code, 'EUR', 0, [club], kind='europe', code=code)
    moved = revise(pyramid)
    assert [round(moved[cid] - 80, 2) for cid in (102, 103, 104)] == [1.2, 0.6, 0.3]
    assert moved[105] == 80


def test_honours_fade_by_the_decay_each_season_and_count_the_season_just_played(pyramid):
    cup = Competition(-3, 'Coupe', 'FRA', 0, [], kind='cup')
    europe = Competition(-101, 'C1', 'EUR', 0, [], kind='europe', code='C1')
    pyramid.competitions.update({-3: cup, -101: europe})
    pyramid.champions = {D1: [(2024, 100)], -3: [(2025, 100)], -101: [(2023, 100)], D2: [(2025, 200)]}
    scores = honours_scores(pyramid, {D1: 100, D3: 300})
    assert scores[100] == pytest.approx(4 * 0.7 + 2 + 4 + 6 * 0.7 ** 2)
    assert scores[200] == pytest.approx(1.5) and scores[300] == pytest.approx(0.5)
    assert 101 not in scores


def test_the_target_never_exceeds_the_anchor_by_more_than_the_maximum_rise_nor_the_bounds(pyramid):
    pyramid.champions = {D1: [(2025, 100), (2024, 100), (2023, 100)]}
    club = pyramid.clubs[100]
    club.reputation = club.reputation_anchor = 60
    cap = pyramid.config.world.reputation.max_rise
    for _ in range(40):
        revise(pyramid, {D1: table(*range(100, 108))}, {D1: 100})
    assert club.reputation < 60 + cap + 1e-6 and club.reputation > 60 + cap - 0.1
    club.reputation = club.reputation_anchor = 98
    for _ in range(40):
        revise(pyramid, {D1: table(*range(100, 108))}, {D1: 100})
    assert club.reputation == pytest.approx(pyramid.config.world.reputation.bounds.max)


def test_revision_is_deterministic_and_leaves_the_world_to_the_events(pyramid):
    before = {cid: club.reputation for cid, club in pyramid.clubs.items()}
    first = reputation_events(pyramid, {D1: table(*range(100, 108))}, {D1: 100})
    assert {cid: club.reputation for cid, club in pyramid.clubs.items()} == before
    assert reputation_events(pyramid, {D1: table(*range(100, 108))}, {D1: 100}) == first
    assert [event.club_id for event in first] == sorted(pyramid.clubs)


def test_an_older_world_without_anchors_reads_the_current_reputation_as_its_anchor(config, pyramid):
    pyramid.clubs[100].reputation_anchor = None
    assert revise(pyramid)[100] == 80
