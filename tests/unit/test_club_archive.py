from api.club_archive import european_run, cup_run, history, honours, players, records, seasons, summary
from core.domain.clubs import Competition
from core.domain.date import Date
from core.domain.matches import Match, MatchResult
from core.domain.players import Position
from core.domain.records import AgeRecord
from core.domain.world import MovementSnapshot, SeasonRecord, TransferRecord
from test_market import mini_world

CUP, C1, LEAGUE = -3, -101, 16


def game(mid, competition_id, season, number, home, away, winner=None, score=(1, 0), day=None):
    return Match(mid, competition_id, season, number, day or Date(season + 1, 1, 1), home, away, MatchResult(*score, 'test', winner_id=winner))


def archive_world(config):
    world = mini_world(config)
    world.season = 2027
    world.competitions = {LEAGUE: Competition(LEAGUE, 'Ligue 1', 'FRA', 1, [1, 2]),
                          CUP: Competition(CUP, 'Coupe de France', 'FRA', 0, [], kind='cup'),
                          C1: Competition(C1, 'Ligue des champions', 'EUR', 0, [], kind='europe', code='C1')}
    return world


def keyed(records):
    return {f'{record.season}:{record.player_id}:{record.club_id}:{record.competition_id}': record for record in records}


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


def test_seasons_list_each_finished_season_with_its_league_line_and_both_cups(config):
    world = archive_world(config)
    world.matches = {match.id: match for match in (
        game(1, LEAGUE, 2025, 1, 1, 2), game(9, LEAGUE, 2025, 2, 2, 1, score=(2, 2)), game(2, CUP, 2025, 1, 1, 8, winner=1),
        game(3, CUP, 2025, 2, 1, 9, winner=9), game(4, C1, 2025, 9, 1, 5, winner=5), game(5, C1, 2026, 11, 3, 1, winner=3),
        game(6, CUP, 2026, 1, 1, 8, winner=1), game(7, LEAGUE, 2027, 1, 1, 2), game(8, LEAGUE, 2026, 1, 2, 1))}
    rows = seasons(world, 1)
    assert [row['season'] for row in rows] == [2026, 2025]  # The season in progress stays out.
    recent, older = rows
    assert (older['rank'], older['champion'], older['competition_id'], older['competition']) == (1, True, LEAGUE, 'Ligue 1')
    # Its line of the final table: a win and a draw.
    assert older['standing'] == {'points': 4, 'played': 2, 'won': 1, 'drawn': 1, 'lost': 0, 'goals_for': 3, 'goals_against': 2}
    assert older['cup'] == {'label': '16es de finale', 'level': 2, 'winner': False, 'competition_id': CUP, 'competition': 'Coupe de France'}
    assert older['europe']['label'] == 'Barrages' and older['europe']['competition_id'] == C1
    assert (recent['rank'], recent['champion'], recent['standing']['lost']) == (2, False, 1)
    assert recent['cup']['label'] == '32es de finale' and recent['europe']['label'] == 'Huitièmes de finale'


def test_a_club_outside_the_leagues_still_gets_its_cup_seasons_and_none_for_what_it_did_not_play(config):
    world = archive_world(config)
    world.matches = {1: game(1, CUP, 2025, 1, 1, 8, winner=8), 2: game(2, LEAGUE, 2025, 1, 2, 3)}
    rows = seasons(world, 1)
    assert rows == [{'season': 2025, 'rank': None, 'champion': False, 'competition_id': None, 'competition': None, 'level': None, 'standing': None,
                     'cup': {'label': '32es de finale', 'level': 1, 'winner': False, 'competition_id': CUP, 'competition': 'Coupe de France'},
                     'europe': None, 'scorer': None, 'reputation': None}]
    assert seasons(world, 4) == []


def test_each_season_names_its_top_scorer_every_competition_added(config):
    world = archive_world(config)
    world.matches = {1: game(1, LEAGUE, 2025, 1, 1, 2)}
    world.records = keyed([SeasonRecord(2025, 109, 1, LEAGUE, matches=30, goals=9), SeasonRecord(2025, 108, 1, LEAGUE, matches=25, goals=8),
                           SeasonRecord(2025, 108, 1, CUP, matches=2, goals=1), SeasonRecord(2025, 209, 2, LEAGUE, matches=30, goals=40)])
    # 108 (8 + 1 in 27 matches) and 109 (9 in 30) both scored nine: the one who needed fewer matches.
    assert seasons(world, 1)[0]['scorer'] == {'player_id': 108, 'player': world.players[108].name, 'goals': 9}
    world.records = keyed([SeasonRecord(2025, 109, 1, LEAGUE, matches=30, goals=10), SeasonRecord(2025, 108, 1, LEAGUE, matches=20, goals=9)])
    assert seasons(world, 1)[0]['scorer']['player_id'] == 109
    world.records = {}
    assert seasons(world, 1)[0]['scorer'] is None


def test_each_season_shows_the_reputation_held_at_its_opening_and_its_move_from_the_season_before(config):
    world = archive_world(config)
    world.matches = {1: game(1, LEAGUE, 2025, 1, 1, 2), 2: game(2, LEAGUE, 2026, 1, 1, 2)}
    world.reputation_history = {1: [(2025, 60.04), (2026, 63.26), (2027, 61.0)]}
    rows = seasons(world, 1)
    assert [row['reputation'] for row in rows] == [{'value': 63.3, 'change': 3.2}, {'value': 60.0, 'change': None}]
    # The overview draws every season the reputation was held, the one under way too.
    assert summary(world, 1)['reputation'] == [{'season': 2025, 'value': 60.0}, {'season': 2026, 'value': 63.3}, {'season': 2027, 'value': 61.0}]
    world.reputation_history = {}
    assert [row['reputation'] for row in seasons(world, 1)] == [None, None]


def test_honours_list_each_title_with_its_seasons_leagues_first_then_the_cup_and_europe(config):
    league = {'competition_id': LEAGUE, 'competition': 'Ligue 1', 'level': 1}
    second = {'competition_id': 17, 'competition': 'Ligue 2', 'level': 2}
    cup = {'label': 'Vainqueur', 'level': 7, 'winner': True, 'competition_id': CUP, 'competition': 'Coupe de France'}
    europe = {'code': 'C3', 'competition': 'Ligue Europa', 'label': 'Vainqueur', 'level': 7, 'winner': True, 'competition_id': -103}
    rows = [{'season': 2030, 'champion': True, **league, 'cup': None, 'europe': europe}, {'season': 2028, 'champion': True, **second, 'cup': cup, 'europe': None},
            {'season': 2026, 'champion': True, **league, 'cup': cup, 'europe': {**europe, 'winner': False}}, {'season': 2025, 'champion': False, **league, 'cup': None, 'europe': None}]
    assert honours(rows) == [
        {'kind': 'league', 'competition_id': LEAGUE, 'competition': 'Ligue 1', 'code': None, 'count': 2, 'seasons': [2026, 2030]},
        {'kind': 'league', 'competition_id': 17, 'competition': 'Ligue 2', 'code': None, 'count': 1, 'seasons': [2028]},
        {'kind': 'cup', 'competition_id': CUP, 'competition': 'Coupe de France', 'code': None, 'count': 2, 'seasons': [2026, 2028]},
        {'kind': 'europe', 'competition_id': -103, 'competition': 'Ligue Europa', 'code': 'C3', 'count': 1, 'seasons': [2030]}]
    assert honours(rows[-1:]) == []


def test_the_overview_knows_each_division_played_and_the_record_in_each_competition(config):
    world = archive_world(config)
    world.competitions[17] = Competition(17, 'Ligue 2', 'FRA', 2, [3, 4])
    # Second of Ligue 1, then first of Ligue 2; a cup match drawn, and one of the season under way.
    world.matches = {1: game(1, LEAGUE, 2025, 1, 2, 1), 2: game(2, 17, 2026, 1, 1, 2, score=(3, 1)), 3: game(3, CUP, 2026, 1, 1, 8, winner=1, score=(2, 2)),
                     4: game(4, LEAGUE, 2027, 1, 1, 2, score=(0, 1))}
    data = history(world, 1)
    assert set(data) == {'items', 'leagues', 'honours', 'record', 'reputation'} and history(world, 1, 'saisons') == data
    assert [(row['season'], row['competition'], row['level'], row['rank']) for row in data['items']] == [(2026, 'Ligue 2', 2, 1), (2025, 'Ligue 1', 1, 2)]
    # The leagues of its seasons and the one it plays in today, the highest first, each with its places as it stands.
    assert [(league['id'], league['name'], league['level'], league['clubs']) for league in data['leagues']] == [(LEAGUE, 'Ligue 1', 1, 2), (17, 'Ligue 2', 2, 2)]
    assert data['honours'] == [{'kind': 'league', 'competition_id': 17, 'competition': 'Ligue 2', 'code': None, 'count': 1, 'seasons': [2026]}]
    # The leagues from the highest, then the cup; the season under way counts.
    rows = data['record']['rows']
    assert [(row['competition'], row['seasons'], row['played'], row['won'], row['drawn'], row['lost'], row['goals_for'], row['goals_against']) for row in rows] == [
        ('Ligue 1', 2, 2, 0, 0, 2, 0, 2), ('Ligue 2', 1, 1, 1, 0, 0, 3, 1), ('Coupe de France', 1, 1, 0, 1, 0, 2, 2)]
    assert data['record']['total'] == {'seasons': 3, 'played': 4, 'won': 1, 'drawn': 1, 'lost': 2, 'goals_for': 5, 'goals_against': 5}
    # A club out of the simulated leagues today keeps the leagues of its past seasons.
    world.clubs[1].competition_id = None
    assert [league['id'] for league in history(world, 1)['leagues']] == [LEAGUE, 17]


def test_players_rank_the_most_used_the_scorers_and_the_best_notes_over_enough_matches(config):
    world = archive_world(config)
    records = [SeasonRecord(2025, 101, 1, LEAGUE, matches=30, goals=5, rating_sum=210, rating_count=30), SeasonRecord(2025, 101, 1, CUP, matches=3, goals=1),
               SeasonRecord(2026, 101, 1, LEAGUE, matches=20, goals=2, rating_sum=140, rating_count=20), SeasonRecord(2026, 101, 2, LEAGUE, matches=99, goals=99),
               SeasonRecord(2025, 102, 1, LEAGUE, matches=53, rating_sum=397.5, rating_count=53),
               SeasonRecord(2025, 103, 1, LEAGUE, matches=10, goals=8, rating_sum=80, rating_count=10), SeasonRecord(2025, 104, 1, LEAGUE, matches=12, goals=8),
               SeasonRecord(2025, 105, 1, LEAGUE, matches=0)]
    records += [SeasonRecord(2025, 300 + index, 1, LEAGUE, matches=1, goals=1 + (index == 0)) for index in range(20)]
    world.records = keyed(records)
    data = players(world, 1)
    assert data['matches'][0] == {'player_id': 101, 'player': world.players[101].name, 'position': 'DG', 'seasons': 2, 'matches': 53, 'goals': 8,
                                  'assists': 0, 'note': 7.0}
    # 101 and 102 tie on 53 matches: the better scorer first; fifteen at most, none without a match.
    assert [row['player_id'] for row in data['matches'][:2]] == [101, 102]
    assert len(data['matches']) == len(data['goals']) == 15 and 105 not in {row['player_id'] for row in data['matches']}
    # 101 (8 goals in 53 matches), 103 (8 in 10) and 104 (8 in 12) tie: fewer matches first.
    assert [row['player_id'] for row in data['goals'][:3]] == [103, 104, 101]
    # A note ranks over half the matches of the most used player while he has fewer than a hundred: 27 here.
    assert data['note_matches'] == 27 and [(row['player_id'], row['note']) for row in data['notes']] == [(102, 7.5), (101, 7.0)]
    # A retired player keeps the position he retired with; one the save does not know of has none.
    world.retired[300] = 'Ancien'
    world.transfers = [TransferRecord(Date(2026, 6, 30), 300, 1, None, 0, 'retirement', 2025,
                                      snapshot=MovementSnapshot(Date(1990, 1, 1), ('FRA',), Position.STRIKER, 60, 60, 60, 0, 0, None, 1))]
    rows = {row['player_id']: row for row in players(world, 1)['goals']}
    assert (rows[300]['player'], rows[300]['position']) == ('Ancien', 'BU') and rows[301]['position'] is None


def test_the_best_eleven_takes_each_place_of_the_tactic_from_its_position_then_from_the_nearest(config):
    world = archive_world(config)
    # Everyone of the first eleven played but the left winger; the reserve keeper played more than the first one.
    counts = {100: 5, 111: 40, 101: 30, 102: 31, 103: 32, 113: 33, 104: 20, 105: 25, 106: 26, 107: 27, 117: 28, 109: 50, 110: 12, 119: 0, 108: 0}
    world.records = keyed([SeasonRecord(2025, pid, 1, LEAGUE, matches=count) for pid, count in counts.items() if count])
    data = players(world, 1)
    assert data['formation'] == '4-3-3'
    picks = [(place['position'], place.get('player_id')) for place in data['eleven']]
    # 4-3-3: GB, DG, DC, DC, DD, MDC, MC, MC, AILG, BU, AILD. Without a left winger, the right one is taken first... but he
    # has his own place: the left one goes to the next nearest, the attacking midfielder, and else stays empty.
    assert picks[:8] == [('GB', 111), ('DG', 101), ('DC', 113), ('DC', 103), ('DD', 104), ('MDC', 105), ('MC', 117), ('MC', 107)]
    assert picks[8:] == [('AILG', None), ('BU', 109), ('AILD', 110)]
    assert data['eleven'][0] == {'position': 'GB', 'player_id': 111, 'player': world.players[111].name, 'matches': 40}


def test_academy_promotions_and_transfers_both_ways_with_what_the_sales_brought_in(config):
    world = archive_world(config)
    world.records = keyed([SeasonRecord(2025, 118, 1, LEAGUE, matches=12, goals=1), SeasonRecord(2025, 119, 1, LEAGUE, matches=3)])
    world.transfers = [TransferRecord(Date(2025, 7, 1), 118, None, 1, 0, 'academy', 2025), TransferRecord(Date(2025, 7, 1), 119, None, 1, 0, 'academy', 2025),
                       TransferRecord(Date(2025, 7, 1), 116, None, 1, 0, 'academy', 2025),
                       TransferRecord(Date(2025, 8, 1), 201, 2, 1, 5_000_000, 'transfer', 2025), TransferRecord(Date(2026, 8, 1), 201, 1, 2, 9_000_000, 'transfer', 2026),
                       TransferRecord(Date(2025, 8, 2), 202, 2, 1, 4_000_000, 'transfer', 2025), TransferRecord(Date(2026, 8, 2), 202, 1, 2, 1_000_000, 'transfer', 2026),
                       TransferRecord(Date(2026, 8, 3), 203, None, 1, 0, 'transfer', 2026), TransferRecord(Date(2027, 1, 3), 203, 1, 2, 2_000_000, 'transfer', 2026),
                       TransferRecord(Date(2026, 8, 4), 204, 1, 2, 7_000_000, 'transfer', 2026)]
    data = players(world, 1)
    # The academy's players who played, the most used first.
    assert [row['player_id'] for row in data['academy']] == [118, 119]
    transfers = data['transfers']
    assert [(row['player_id'], row['fee'], row['season']) for row in transfers['arrivals']] == [(201, 5_000_000, 2025), (202, 4_000_000, 2025)]
    assert [row['player_id'] for row in transfers['departures']] == [201, 204, 203, 202]
    # A player bought, free or not, and sold: the two fees and the difference, a loss last; a sale without a purchase is none.
    assert [(row['player_id'], row['bought'], row['sold'], row['gain']) for row in transfers['gains']] == [
        (201, 5_000_000, 9_000_000, 4_000_000), (203, 0, 2_000_000, 2_000_000), (202, 4_000_000, 1_000_000, -3_000_000)]
    assert transfers['gains'][0]['target']['id'] == 2


def test_records_give_the_widest_scores_the_runs_the_clubs_met_and_the_best_seasons(config):
    world = archive_world(config)
    day = lambda number: Date(2026, 1, 1).add_days(7 * number)
    scores = [(3, 0), (5, 0), (1, 1), (0, 2), (0, 4), (2, 0), (1, 0), (0, 0)]
    world.matches = {number: game(number, LEAGUE, 2026, number, 1, 2, score=score, day=day(number)) for number, score in enumerate(scores, 1)}
    world.matches[20] = game(20, CUP, 2025, 1, 8, 1, score=(0, 1), day=Date(2025, 12, 1))
    world.records = keyed([SeasonRecord(2025, 109, 1, LEAGUE, matches=30, goals=21, assists=3, rating_sum=225, rating_count=30),
                           SeasonRecord(2026, 109, 1, LEAGUE, matches=10, goals=21, rating_sum=80, rating_count=10),
                           SeasonRecord(2026, 108, 1, LEAGUE, matches=25, goals=2, assists=9, rating_sum=200, rating_count=25)])
    data = records(world, 1)
    assert [(row['scored'], row['conceded']) for row in data['wins']] == [(5, 0), (3, 0), (2, 0), (1, 0), (1, 0)]
    assert data['wins'][0]['opponent']['id'] == 2 and data['wins'][0]['home'] and not data['wins'][0]['neutral']
    # The away win of the cup counts, from the club's side; at an equal score, the earliest first.
    assert [row['match_id'] for row in data['wins'][3:]] == [20, 7] and not data['wins'][3]['home']
    assert [(row['scored'], row['conceded']) for row in data['defeats']] == [(0, 4), (0, 2)]
    runs = {run['kind']: run for run in data['runs']['longest']}
    assert (runs['wins']['count'], runs['wins']['first']) == (3, '2025-12-01') and runs['unbeaten']['count'] == 4
    assert (runs['defeats']['count'], runs['clean_sheets']['count'], runs['scoreless']['count']) == (2, 3, 2)
    # Two runs of three clean sheets: the first to reach it.
    assert (runs['clean_sheets']['first'], runs['clean_sheets']['last']) == ('2025-12-01', day(2).iso())
    # Three clean sheets in a row and an unbeaten run of three are still going; a run of one is not told.
    assert {(run['kind'], run['count']) for run in data['runs']['ongoing']} == {('clean_sheets', 3), ('unbeaten', 3)}
    assert (data['opponents']['played']['club']['id'], data['opponents']['played']['count']) == (2, 8)
    assert data['opponents']['beaten']['club']['id'] == 2 and data['opponents']['beaten']['count'] == 4
    # The best season on each figure; a note over twenty matches only.
    best = data['best']
    assert [(row['player_id'], row['season'], row['goals']) for row in best['goals']] == [(109, 2026, 21), (109, 2025, 21), (108, 2026, 2)]
    assert [(row['player_id'], row['assists']) for row in best['assists']] == [(108, 9), (109, 3)]
    assert [(row['player_id'], row['season'], row['note']) for row in best['notes']] == [(108, 2026, 8.0), (109, 2025, 7.5)]
    assert records(world, 99)['wins'] == [] and records(world, 99)['opponents']['played'] is None


def test_records_give_the_club_age_records_with_the_season_they_were_set_in(config):
    world = archive_world(config)
    world.age_records = {1: {'youngest': AgeRecord(118, Date(2026, 9, 12), Date(2010, 6, 1)), 'oldest': AgeRecord(100, Date(2027, 5, 2), Date(1990, 5, 3))}}
    assert records(world, 1)['ages'] == [
        {'kind': 'youngest', 'player': world.players[118].name, 'position': 'MC', 'season': 2026, 'player_id': 118, 'date': '2026-09-12', 'years': 16, 'months': 3},
        {'kind': 'oldest', 'player': world.players[100].name, 'position': 'GB', 'season': 2026, 'player_id': 100, 'date': '2027-05-02', 'years': 36, 'months': 11}]


def test_history_leaves_the_state_alone(config):
    world = archive_world(config)
    world.season = 2100
    world.matches = {year: game(year, CUP, year, 1, 1, 8, winner=1) for year in range(2025, 2065)}
    world.records = {'a': SeasonRecord(2025, 101, 1, LEAGUE, matches=1, goals=1)}
    states = {name: rng.getstate() for name, rng in world.rngs.items()}
    # Every season, no page.
    assert len(history(world, 1)['items']) == 40
    for view in ('joueurs', 'records'): history(world, 1, view)
    assert {name: rng.getstate() for name, rng in world.rngs.items()} == states
