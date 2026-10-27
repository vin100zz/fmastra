from core.domain.clubs import Competition
from core.domain.date import Date
from core.domain.matches import Match, MatchResult
from core.world.calendar import standings


def played(match_id: int, day: int, home: int, away: int, score: tuple[int, int]) -> Match:
    match = Match(match_id, 1, 2026, day, Date(2026, 8, day), home, away)
    match.result = MatchResult(*score, "possession")
    return match


def test_a_table_counts_the_matches_at_home_away_or_the_last_of_each_club(config):
    league = Competition(1, "Ligue", "FRA", 1, [1, 2, 3])
    matches = [played(1, 1, 1, 2, (2, 0)), played(2, 2, 3, 1, (1, 1)), played(3, 3, 2, 3, (0, 3)),
               played(4, 4, 2, 1, (1, 0)), played(5, 5, 1, 3, (0, 2)), played(6, 6, 3, 2, (2, 2))]
    rows = {row.club_id: row for row in standings(league, matches, config)}
    home = {row.club_id: row for row in standings(league, matches, config, side="home")}
    away = {row.club_id: row for row in standings(league, matches, config, side="away")}
    # Each match counts once at home and once away: the two partial tables add up to the whole one.
    for club_id, row in rows.items():
        assert home[club_id].played + away[club_id].played == row.played
        assert home[club_id].points + away[club_id].points == row.points
        assert home[club_id].goals_for + away[club_id].goals_for == row.goals_for
    assert (home[1].played, home[1].won, home[1].lost, home[1].form) == (2, 1, 1, "VD")
    assert (away[1].played, away[1].drawn, away[1].lost, away[1].form) == (2, 1, 1, "ND")
    # The last two of each club, oldest first: club 1 lost to 2 away, then to 3 at home.
    last = {row.club_id: row for row in standings(league, matches, config, last=2)}
    assert (last[1].played, last[1].points, last[1].form, last[1].goals_against) == (2, 0, "DD", 3)
    assert all(row.played == 2 for row in last.values())
    # A partial table ranks as the whole one does: on points, then on goal difference (club 1 before club 2).
    assert [row.club_id for row in standings(league, matches, config, side="home")][0] == 1
