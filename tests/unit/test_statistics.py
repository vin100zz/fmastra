import pytest

from api.statistics import LISTED_PLAYERS, career_leaders, competition_leaders
from core.domain.clubs import Competition
from core.domain.world import SeasonRecord
from test_market import mini_world

LEAGUE, CUP = 16, -3


def league_world(config):
    world = mini_world(config)
    world.competitions = {LEAGUE: Competition(LEAGUE, 'Ligue 1', 'FRA', 1, [1, 2]), CUP: Competition(CUP, 'Coupe', 'FRA', 0, [], kind='cup')}
    return world


def records(*rows):
    """Rows are (season, player, club, competition, matches, goals)."""
    return {str(index): SeasonRecord(*row[:4], matches=row[4], goals=row[5]) for index, row in enumerate(rows)}


def test_competition_leaders_add_every_season_and_club_of_a_player_in_that_competition_only(config):
    world = league_world(config)
    world.season = 2027
    world.records = records((2025, 101, 1, LEAGUE, 30, 4), (2026, 101, 2, LEAGUE, 25, 6), (2027, 101, 2, LEAGUE, 3, 0),
                            (2026, 101, 2, CUP, 90, 90), (2025, 102, 1, LEAGUE, 40, 12), (2026, 103, 1, CUP, 50, 50))
    data = competition_leaders(world, LEAGUE)
    assert data['matches'] == [{'player_id': 101, 'player': world.players[101].name, 'matches': 58, 'goals': 10},
                               {'player_id': 102, 'player': world.players[102].name, 'matches': 40, 'goals': 12}]
    assert [row['player_id'] for row in data['goals']] == [102, 101]
    cup = competition_leaders(world, CUP)
    assert [(row['player_id'], row['matches'], row['goals']) for row in cup['matches']] == [(101, 90, 90), (103, 50, 50)]


def test_career_leaders_rank_ties_keep_fifteen_skip_zeroes_and_name_retired_players(config):
    world = league_world(config)
    world.retired[900] = 'Ancien joueur'
    rows = [(2025, 101, 1, LEAGUE, 10, 5), (2025, 102, 1, LEAGUE, 10, 7), (2025, 103, 1, LEAGUE, 8, 7),
            (2025, 104, 1, LEAGUE, 0, 0), (2025, 900, 1, LEAGUE, 8, 0)]
    rows += [(2025, 300 + i, 1, LEAGUE, 1, 1) for i in range(20)]
    data = career_leaders(world, records(*rows).values())
    assert len(data['matches']) == len(data['goals']) == LISTED_PLAYERS == 15
    # Equal matches: the better scorer first; equal goals: the fewer matches first; unplayed players are never listed.
    assert [row['player_id'] for row in data['matches'][:4]] == [102, 101, 103, 900]
    assert [row['player_id'] for row in data['goals'][:3]] == [103, 102, 101]
    assert 104 not in {row['player_id'] for row in data['matches'] + data['goals']}
    assert {'player_id': 900, 'player': 'Ancien joueur', 'matches': 8, 'goals': 0} in data['matches']
    assert career_leaders(world, []) == {'matches': [], 'goals': []}


def test_competition_leaders_reject_an_unknown_competition(config):
    with pytest.raises(KeyError): competition_leaders(league_world(config), 999)
