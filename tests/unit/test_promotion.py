from collections import Counter
from copy import deepcopy
from dataclasses import replace

import pytest

from core.domain.clubs import Club, ClubPersonality, ClubStatus, Competition
from core.domain.date import Date
from core.domain.matches import MatchResult
from core.domain.world import World
from core.randomness import stream
from core.world.application import apply
from core.world.calendar import schedule, standings
from core.world.promotion import promotion_event, reserve_clubs


@pytest.fixture
def pyramid(config):
    clubs, leagues, matches = {}, {}, {}
    personality = ClubPersonality(.5, .5, .5, .5)
    for level, division in enumerate((16, 17, 18, 19), 1):
        ids = list(range(level * 100, level * 100 + 8))
        for cid in ids:
            active = level < 4
            clubs[cid] = Club(cid, str(cid), 'FRA', division, division if active else None,
                              ClubStatus.ACTIVE if active else ClubStatus.DORMANT, 1000, 50, 50,
                              '4-3-3', personality, division_id=division)
        if level < 4:
            league = Competition(division, f'D{level}', 'FRA', level, ids)
            fixtures = schedule(league, 2025, len(matches) + 1, config, stream(1))
            league.match_ids = [match.id for match in fixtures]
            for match in fixtures:
                match.result = MatchResult(3 if match.home_id < match.away_id else 0,
                                           0 if match.home_id < match.away_id else 3, 'test')
            matches.update((match.id, match) for match in fixtures)
            leagues[division] = league
    return World(Date(2026, 7, 1), 2025, 42, config, {}, clubs, leagues, matches, 10000)


def tables(world):
    return {league.id: standings(league, [world.matches[mid] for mid in league.match_ids], world.config)
            for league in world.competitions.values()}


def test_simultaneous_movements_preserve_sizes_and_original_divisions(pyramid):
    before = deepcopy(pyramid, {id(pyramid.config): pyramid.config})
    event = promotion_event(pyramid, tables(pyramid))
    assert pyramid == before  # Planning includes the draw but never mutates the world.
    assert len(event.movements) == len({move.club_id for move in event.movements}) == 18
    apply(pyramid, event)
    assert set(pyramid.competitions[16].club_ids) == {100, 101, 102, 103, 104, 200, 201, 202}
    assert set(pyramid.competitions[17].club_ids) == {105, 106, 107, 203, 204, 300, 301, 302}
    assert {205, 206, 207, 303, 304} <= set(pyramid.competitions[18].club_ids)
    assert all(len(league.club_ids) == 8 for league in pyramid.competitions.values())
    for cid in (305, 306, 307):
        club = pyramid.clubs[cid]
        assert club.competition_id is None and club.status == ClubStatus.DORMANT
        assert club.division_id == 19 and club.source_division_id == 18
    assert len(reserve_clubs(pyramid, (19,))) == 8
    assert {305, 306, 307} <= {club.id for club in reserve_clubs(pyramid, (19,))}
    assert Counter(entry.kind for entry in pyramid.journal) == {'promotion': 9, 'relegation': 9}


def test_draw_is_reproducible_weighted_and_without_replacement(pyramid):
    pyramid.clubs[400].name = 'Équipe réserve B'
    pyramid.clubs[400].nation = 'WAL'  # Nationality must not determine pool membership.
    pyramid.clubs[400].reputation = 100
    for cid in range(401, 408):
        pyramid.clubs[cid].reputation = 1
    rankings = tables(pyramid)
    first = promotion_event(pyramid, rankings)
    pyramid.clubs = dict(reversed(list(pyramid.clubs.items())))
    assert promotion_event(pyramid, rankings) == first
    selections = []
    for seed in range(50):
        pyramid.seed = seed
        chosen = [move.club_id for move in promotion_event(pyramid, rankings).movements if move.source_id is None]
        assert len(chosen) == len(set(chosen)) == 3
        selections.append(tuple(chosen))
    assert sum(400 in chosen for chosen in selections) > 45
    assert len(set(selections)) > 1


def test_incomplete_season_and_insufficient_pool_fail_before_changes(pyramid):
    pyramid.matches[1].result = None
    before = deepcopy(pyramid, {id(pyramid.config): pyramid.config})
    with pytest.raises(ValueError, match='not complete'):
        promotion_event(pyramid, tables(pyramid))
    assert pyramid == before
    pyramid.matches[1].result = MatchResult(3, 0, 'test')
    for cid in range(402, 408):
        pyramid.clubs[cid].division_id = 999
    with pytest.raises(ValueError, match='insufficient clubs'):
        promotion_event(pyramid, tables(pyramid))


@pytest.mark.parametrize('size', [17, 18, 22, 24])
def test_calendar_complete_without_double_bookings(config, size):
    league = Competition(1, 'Test', 'FRA', 1, list(range(1, size + 1)))
    matches = schedule(league, 2025, 1, config, stream(1))
    assert len(matches) == size * (size - 1)
    assert len({(match.home_id, match.away_id) for match in matches}) == len(matches)
    appearances = Counter((match.date, cid) for match in matches for cid in (match.home_id, match.away_id))
    assert set(appearances.values()) == {1}
    dates = sorted({match.date for match in matches})
    assert Date(2025, 8, 10) <= dates[0] < dates[-1] <= Date(2026, 5, 25)
    assert min(right.ordinal() - left.ordinal() for left, right in zip(dates, dates[1:])) >= 3
    assert len(dates) == 2 * (size if size % 2 else size - 1)
    assert matches == schedule(league, 2025, 1, config, stream(1))


def test_too_short_season_is_rejected(config):
    config = replace(config, world=replace(config.world, season=replace(config.world.season,
                      start_month=12, start_day=31, end_month=1, end_day=1)))
    with pytest.raises(ValueError, match='cannot fit'):
        schedule(Competition(1, 'Test', 'FRA', 1, list(range(24))), 2025, 1, config, stream(1))
