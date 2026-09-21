from api.club_archive import biggest_transfers, european_run, cup_run, history, leaders, seasons
from core.domain.clubs import Competition
from core.domain.date import Date
from core.domain.matches import Match, MatchResult
from core.domain.world import SeasonRecord, TransferRecord
from test_market import mini_world

CUP, C1, LEAGUE = -3, -101, 16


def game(mid, competition_id, season, number, home, away, winner=None):
    return Match(mid, competition_id, season, number, Date(season + 1, 1, 1), home, away, MatchResult(1, 0, 'test', winner_id=winner))


def archive_world(config):
    world = mini_world(config)
    world.season = 2027
    world.competitions = {LEAGUE: Competition(LEAGUE, 'Ligue 1', 'FRA', 1, [1, 2]),
                          CUP: Competition(CUP, 'Coupe de France', 'FRA', 0, [], kind='cup'),
                          C1: Competition(C1, 'Ligue des champions', 'EUR', 0, [], kind='europe', code='C1')}
    return world


def test_cup_run_is_the_furthest_round_and_only_the_title_is_a_win():
    lost_in_16th = [game(1, CUP, 2025, 1, 1, 9, winner=1), game(2, CUP, 2025, 2, 1, 8, winner=8)]
    assert cup_run(lost_in_16th, 1) == {'label': '16es de finale', 'level': 2, 'winner': False}
    final = [game(3, CUP, 2025, number, 1, 7, winner=1) for number in range(1, 6)]
    lost = final + [game(4, CUP, 2025, 6, 1, 7, winner=7)]
    won = final + [game(5, CUP, 2025, 6, 1, 7, winner=1)]
    assert cup_run(lost, 1) == {'label': 'Finale', 'level': 6, 'winner': False}
    assert cup_run(won, 1) == {'label': 'Vainqueur', 'level': 7, 'winner': True}
    assert cup_run([Match(6, CUP, 2025, 1, Date(2025, 12, 3), 1, 2)], 1) is None


def test_european_run_reads_the_league_phase_then_each_knockout_round_once_for_both_legs(config):
    world = archive_world(config)
    def run(*rounds, winner=None):
        matches = [game(100 + number, C1, 2025, number, 1, 5, winner=winner if number == rounds[-1] else 5) for number in rounds]
        return european_run(world, matches, 1)
    assert run(*range(1, 9))['label'] == 'Phase de ligue' and run(*range(1, 9))['level'] == 1
    assert run(*range(1, 11))['label'] == 'Barrages'
    assert (run(9)['label'], run(10)['label']) == ('Barrages', 'Barrages')
    assert (run(11)['label'], run(12)['label'], run(11)['level']) == ('Huitièmes de finale', 'Huitièmes de finale', 3)
    assert (run(13)['label'], run(14)['label']) == ('Quarts de finale', 'Quarts de finale')
    assert (run(15)['label'], run(16)['label']) == ('Demi-finales', 'Demi-finales')
    assert run(17, winner=5) == {'code': 'C1', 'competition': 'Ligue des champions', 'label': 'Finale', 'level': 6, 'winner': False}
    assert run(17, winner=1) == {'code': 'C1', 'competition': 'Ligue des champions', 'label': 'Vainqueur', 'level': 7, 'winner': True}


def test_seasons_list_each_finished_season_with_league_rank_and_both_cups_without_standings(config):
    world = archive_world(config)
    world.matches = {match.id: match for match in (
        game(1, LEAGUE, 2025, 1, 1, 2), game(2, CUP, 2025, 1, 1, 8, winner=1), game(3, CUP, 2025, 2, 1, 9, winner=9),
        game(4, C1, 2025, 9, 1, 5, winner=5), game(5, C1, 2026, 11, 3, 1, winner=3),
        game(6, CUP, 2026, 1, 1, 8, winner=1), game(7, LEAGUE, 2027, 1, 1, 2), game(8, LEAGUE, 2026, 1, 2, 1))}
    rows = seasons(world, 1)
    assert [row['season'] for row in rows] == [2026, 2025]  # The season in progress stays out.
    assert all('standings' not in row for row in rows)
    recent, older = rows
    assert (older['rank'], older['champion'], older['competition_id'], older['competition']) == (1, True, LEAGUE, 'Ligue 1')
    assert older['cup']['label'] == '16es de finale' and older['europe']['label'] == 'Barrages'
    assert (recent['rank'], recent['champion']) == (2, False)
    assert recent['cup']['label'] == '32es de finale' and recent['europe']['label'] == 'Huitièmes de finale'


def test_a_club_outside_the_leagues_still_gets_its_cup_seasons_and_none_for_what_it_did_not_play(config):
    world = archive_world(config)
    world.matches = {1: game(1, CUP, 2025, 1, 1, 8, winner=8), 2: game(2, LEAGUE, 2025, 1, 2, 3)}
    rows = seasons(world, 1)
    assert rows == [{'season': 2025, 'rank': None, 'champion': False, 'competition_id': None, 'competition': None,
                     'cup': {'label': '32es de finale', 'level': 1, 'winner': False}, 'europe': None, 'reputation': None}]
    assert seasons(world, 4) == []


def test_each_season_shows_the_reputation_held_at_its_opening_and_its_move_from_the_season_before(config):
    world = archive_world(config)
    world.matches = {1: game(1, LEAGUE, 2025, 1, 1, 2), 2: game(2, LEAGUE, 2026, 1, 1, 2)}
    world.reputation_history = {1: [(2025, 60.04), (2026, 63.26), (2027, 61.0)]}
    rows = seasons(world, 1)
    assert [row['reputation'] for row in rows] == [{'value': 63.3, 'change': 3.2}, {'value': 60.0, 'change': None}]
    world.reputation_history = {}
    assert [row['reputation'] for row in seasons(world, 1)] == [None, None]


def test_leaders_add_every_competition_and_season_for_this_club_only_and_keep_fifteen(config):
    world = archive_world(config)
    records = [SeasonRecord(2025, 101, 1, LEAGUE, matches=30, goals=5), SeasonRecord(2025, 101, 1, CUP, matches=3, goals=1),
               SeasonRecord(2026, 101, 1, LEAGUE, matches=20, goals=2), SeasonRecord(2026, 101, 2, LEAGUE, matches=99, goals=99),
               SeasonRecord(2025, 102, 1, LEAGUE, matches=53, goals=0),
               SeasonRecord(2025, 103, 1, LEAGUE, matches=10, goals=8), SeasonRecord(2025, 104, 1, LEAGUE, matches=12, goals=8),
               SeasonRecord(2025, 105, 1, LEAGUE, matches=0, goals=0)]
    records += [SeasonRecord(2025, 300 + i, 1, LEAGUE, matches=1, goals=1) for i in range(20)]
    world.records = {f'{record.season}-{record.player_id}-{record.club_id}-{record.competition_id}': record for record in records}
    data = leaders(world, 1)
    assert data['matches'][0] == {'player_id': 101, 'player': world.players[101].name, 'matches': 53, 'goals': 8}
    # 101 and 102 tie on 53 matches: the better scorer first.
    assert [row['player_id'] for row in data['matches'][:2]] == [101, 102]
    assert len(data['matches']) == len(data['goals']) == 15
    assert all(row['matches'] for row in data['matches']) and 105 not in {row['player_id'] for row in data['matches']}
    # 101 (8 goals in 53 matches), 103 (8 in 10) and 104 (8 in 12) tie: fewer matches first.
    assert [row['player_id'] for row in data['goals'][:3]] == [103, 104, 101]
    assert 102 not in {row['player_id'] for row in data['goals']}
    assert leaders(world, 99) == {'matches': [], 'goals': []}


def test_leaders_name_retired_players(config):
    world = archive_world(config)
    world.retired[900] = 'Ancien joueur'
    world.records = {'a': SeasonRecord(2025, 900, 1, LEAGUE, matches=4, goals=2)}
    assert leaders(world, 1)['goals'] == [{'player_id': 900, 'player': 'Ancien joueur', 'matches': 4, 'goals': 2}]


def test_biggest_transfers_keep_ten_paid_transfers_per_side_highest_fee_first(config):
    world = archive_world(config)
    world.transfers = [TransferRecord(Date(2025, 7, 1).add_days(day), 300 + day, 7, 1, 1000 * (day + 1), 'transfer', 2025) for day in range(12)]
    world.transfers += [TransferRecord(Date(2025, 8, 1), 201, 1, 8, 5000, 'transfer', 2025),
                        TransferRecord(Date(2026, 8, 1), 202, 1, 8, 5000, 'transfer', 2026),
                        TransferRecord(Date(2025, 8, 2), 203, 1, 8, 0, 'transfer', 2025),
                        TransferRecord(Date(2025, 8, 3), 204, 1, None, 9000, 'release', 2025),
                        TransferRecord(Date(2025, 8, 4), 205, 8, 9, 99000, 'transfer', 2025)]
    data = biggest_transfers(world, 1)
    fees = [row['fee'] for row in data['arrivals']]
    assert len(fees) == 10 and fees == list(range(12000, 2000, -1000))
    assert all(row['target']['id'] == 1 for row in data['arrivals'])
    # Free and non-transfer moves stay out; equal fees put the latest first.
    assert [(row['player_id'], row['fee']) for row in data['departures']] == [(202, 5000), (201, 5000)]
    assert biggest_transfers(world, 9)['arrivals'][0]['player_id'] == 205
    assert biggest_transfers(world, 99) == {'arrivals': [], 'departures': []}


def test_history_paginates_seasons_only_and_leaves_the_state_alone(config):
    world = archive_world(config)
    world.season = 2100
    world.matches = {year: game(year, CUP, year, 1, 1, 8, winner=1) for year in range(2025, 2065)}
    world.records = {'a': SeasonRecord(2025, 101, 1, LEAGUE, matches=1, goals=1)}
    states = {name: rng.getstate() for name, rng in world.rngs.items()}
    first, second = history(world, 1, 1), history(world, 1, 2)
    assert (first['total'], len(first['items']), len(second['items'])) == (40, 30, 10)
    assert first['leaders'] == second['leaders'] and first['transfers'] == second['transfers']
    assert {name: rng.getstate() for name, rng in world.rngs.items()} == states
