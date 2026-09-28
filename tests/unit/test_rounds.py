from types import SimpleNamespace

from api.rounds import goal_minute, scorers
from core.domain.date import Date
from core.domain.matches import Match, MatchEvent, MatchResult


def test_goal_minutes_read_as_on_a_match_sheet_with_added_time_after_45_and_90():
    half = 2700 + 150
    assert [goal_minute(second, 1, half) for second in (0, 59, 13 * 60 + 25, 2699, 2700, 2700 + 150)] == ["1", "1", "14", "45", "45+1", "45+3"]
    # The second half starts at the first half's whistle, whatever its added time.
    assert [goal_minute(half + offset, 2, half) for offset in (0, 59, 60, 44 * 60 + 59, 45 * 60, 49 * 60 + 5)] == ["46", "46", "47", "90", "90+1", "90+5"]


def test_scorers_gather_each_players_goals_in_order_of_first_goal_and_leave_the_shootout_out():
    goal = lambda second, period, team, player: MatchEvent(second, period, 0, "goal", team, player)
    events = [goal(13 * 60 + 25, 1, 1, 101), goal(25 * 60, 1, 2, 201), MatchEvent(2760, 1, 0, "period_end", 1),
              goal(2760 + 10 * 60, 2, 1, 102), goal(2760 + 29 * 60 + 30, 2, 1, 101), MatchEvent(5400, 2, 0, "yellow", 2, 202),
              goal(2760 + 46 * 60, 2, 2, -7), goal(6000, 3, 1, 102)]
    result = MatchResult(3, 2, "possession", events, temporary_players={-7: "Renfort"})
    world = SimpleNamespace(players={}, retired={101: "Neal Maupay", 102: "Danny Welbeck", 201: "Amine Gouiri"})
    home, away = scorers(world, Match(1, 16, 2026, 12, Date(2026, 11, 8), 1, 2, result))
    assert home == [{"id": 101, "name": "Neal Maupay", "minutes": ["14", "75"]}, {"id": 102, "name": "Danny Welbeck", "minutes": ["56"]}]
    assert away == [{"id": 201, "name": "Amine Gouiri", "minutes": ["26"]}, {"id": -7, "name": "Renfort", "minutes": ["90+2"]}]
    # Without a stored half-time whistle, the first half is taken to end at 45 minutes.
    assert scorers(world, Match(2, 16, 2026, 12, Date(2026, 11, 8), 1, 2, MatchResult(0, 1, "possession", [goal(2700 + 60, 2, 2, 201)])))[1][0]["minutes"] == ["47"]
    assert scorers(world, Match(3, 16, 2026, 13, Date(2026, 11, 15), 1, 2)) is None
