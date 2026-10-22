from api.records import age, eleven, games, note_threshold, runs, season_of
from core.domain.date import Date
from core.domain.matches import Match, MatchResult
from core.domain.records import AgeRecord


def test_a_match_both_sides_forfeited_counts_for_neither_and_one_to_come_is_not_played():
    day = Date(2026, 9, 1)
    matches = [Match(1, 16, 2026, 1, day, 1, 2, MatchResult(3, 0, 'forfeit', status='double_forfeit')), Match(2, 16, 2026, 2, day, 2, 1),
               Match(3, 16, 2026, 3, day.add_days(7), 2, 1, MatchResult(2, 1, 'test')), Match(4, 16, 2026, 4, day.add_days(-7), 3, 4, MatchResult(0, 0, 'test'))]
    played = games(matches, 1)
    assert [(game.match.id, game.scored, game.conceded, game.opponent, game.home) for game in played] == [(3, 1, 2, 2, False)]


def test_a_run_too_short_is_not_told_as_going_on():
    day = Date(2026, 9, 1)
    played = games([Match(number, 16, 2026, number, day.add_days(7 * number), 1, 2, MatchResult(*score, 'test'))
                    for number, score in enumerate([(1, 0), (1, 0), (0, 1), (1, 0), (2, 0)], 1)], 1)
    told = runs(played)
    assert {(run['kind'], run['count']) for run in told['longest']} >= {('wins', 2), ('defeats', 1), ('scoring', 2), ('clean_sheets', 2)}
    assert told['ongoing'] == []
    assert runs([]) == {'longest': [], 'ongoing': []}


def test_each_place_of_the_eleven_goes_to_one_player_only():
    matches = {1: 30, 2: 20, 3: 10}
    positions = {1: 'DC', 2: 'DC', 3: 'DD'}
    # Three centre-backs wanted: the full-back covers the third place, a goalkeeper is never replaced.
    assert eleven(['GB', 'DC', 'DC', 'DC'], matches, positions) == [('GB', None), ('DC', 1), ('DC', 2), ('DC', 3)]
    assert eleven(['DD', 'DG'], matches, positions) == [('DD', 3), ('DG', 1)]


def test_a_short_history_lowers_the_matches_a_note_needs():
    assert [note_threshold(most, 50) for most in (0, 1, 7, 53, 99, 100, 400)] == [1, 1, 4, 27, 50, 50, 50]


def test_an_age_is_told_in_whole_years_and_months_and_a_day_in_its_season():
    assert age(AgeRecord(7, Date(2026, 9, 11), Date(2010, 6, 12))) == {'player_id': 7, 'date': '2026-09-11', 'years': 16, 'months': 2}
    assert age(AgeRecord(7, Date(2026, 6, 12), Date(2010, 6, 12)))['years'] == 16
    assert (season_of(Date(2027, 6, 30), (7, 1)), season_of(Date(2027, 7, 1), (7, 1))) == (2026, 2027)
