from core.domain.date import Date
from core.domain.matches import Match, MatchResult, PlayerMatchStats
from core.domain.records import AgeRecord
from core.domain.world import SeasonRecord, TransferRecord
from core.world.age_records import initialize_age_records, note, note_club_match
from test_market import mini_world

LEAGUE = 16


def test_a_record_goes_to_a_younger_or_an_older_player_and_at_equal_age_stays_with_the_first():
    records, born = {}, Date(2000, 1, 1)
    note(records, 1, born, Date(2017, 1, 1), Date(2017, 5, 1))
    note(records, 2, born, Date(2017, 1, 1), scored=True)
    # The same age on the same day: the first keeps the youngest record; his last day makes him the oldest.
    assert records == {'youngest': AgeRecord(1, Date(2017, 1, 1), born), 'oldest': AgeRecord(1, Date(2017, 5, 1), born),
                       'youngest_scorer': AgeRecord(2, Date(2017, 1, 1), born), 'oldest_scorer': AgeRecord(2, Date(2017, 1, 1), born)}
    note(records, 3, Date(1980, 1, 1), Date(2017, 2, 1))
    assert records['oldest'].player_id == 3 and records['oldest_scorer'].player_id == 2 and records['oldest'].days == 13546


def test_a_club_match_counts_who_played_for_either_club(config):
    world = mini_world(config)
    world.players[103].club_id = 5
    stats = {101: PlayerMatchStats(minutes=90, goals=1), 201: PlayerMatchStats(minutes=12), 102: PlayerMatchStats(minutes=0),
             103: PlayerMatchStats(minutes=90)}
    result = MatchResult(1, 0, 'test', player_stats=stats)
    note_club_match(world, Match(1, LEAGUE, 2026, 1, Date(2026, 8, 10), 1, 2, result), result)
    # Who did not play, or no longer belongs to either club, sets nothing.
    assert {club: {kind: record.player_id for kind, record in held.items()} for club, held in world.age_records.items()} == {
        1: {'youngest': 101, 'oldest': 101, 'youngest_scorer': 101, 'oldest_scorer': 101}, 2: {'youngest': 201, 'oldest': 201}}


def test_a_save_without_records_rebuilds_them_the_archived_seasons_on_the_first_and_last_day_of_each_competition(config):
    world = mini_world(config)
    world.season = 2027
    young, old, scorer = world.players[101], world.players[102], world.players[103]
    young.born, old.born, scorer.born = Date(2008, 1, 1), Date(1990, 3, 1), Date(2009, 1, 1)
    archived = lambda mid, day: Match(mid, LEAGUE, 2025, mid, day, 1, 2, MatchResult(1, 0, 'archived'))
    detail = MatchResult(2, 0, 'possession', player_stats={103: PlayerMatchStats(minutes=90, goals=1), 104: PlayerMatchStats(minutes=0)},
                         home_lineup=[(103, 'BU'), (104, 'DD')])
    world.matches = {1: archived(1, Date(2025, 8, 10)), 2: archived(2, Date(2026, 5, 20)), 3: Match(3, LEAGUE, 2026, 1, Date(2026, 9, 1), 1, 2, detail)}
    # A retired player is known by the birth his movements kept; a line in a competition the club never played is left out.
    world.transfers = [TransferRecord(Date(2026, 6, 30), 900, 1, None, 0, 'retirement', 2025, born=Date(1989, 1, 1))]
    world.records = {str(index): record for index, record in enumerate((
        SeasonRecord(2025, 101, 1, LEAGUE, matches=30), SeasonRecord(2025, 102, 1, LEAGUE, matches=3),
        SeasonRecord(2025, 900, 1, LEAGUE, matches=2, goals=1), SeasonRecord(2025, 105, 1, -3, matches=1, goals=1),
        SeasonRecord(2026, 103, 1, LEAGUE, matches=1, goals=1)))}
    initialize_age_records(world)
    held = world.age_records[1]
    # 101 on the first day of the season; 102 and 900 on its last; 103 on the very day he scored.
    assert held['youngest'] == AgeRecord(101, Date(2025, 8, 10), Date(2008, 1, 1))
    assert held['oldest'] == AgeRecord(900, Date(2026, 5, 20), Date(1989, 1, 1))
    assert held['youngest_scorer'] == AgeRecord(103, Date(2026, 9, 1), Date(2009, 1, 1)) and held['oldest_scorer'].player_id == 900
    assert set(world.age_records) == {1}
    # Records already kept are left as they are.
    world.age_records = {2: {'youngest': AgeRecord(201, Date(2026, 9, 1), Date(2008, 1, 1))}}
    initialize_age_records(world)
    assert set(world.age_records) == {2}


def test_a_save_without_records_reads_the_selections_ones_from_their_matches(config):
    world = mini_world(config)
    player = world.players[101]
    result = MatchResult(1, 1, 'possession', player_stats={101: PlayerMatchStats(minutes=90), 201: PlayerMatchStats(minutes=45, goals=1)},
                         home_lineup=[(101, 'MC')], away_bench=[201])
    world.international.matches = {5000: Match(5000, -2028, 2028, 1, Date(2028, 6, 10), -1, -2, result)}
    initialize_age_records(world)
    assert world.age_records == {}
    assert world.international.age_records[-1] == {'youngest': AgeRecord(101, Date(2028, 6, 10), player.born), 'oldest': AgeRecord(101, Date(2028, 6, 10), player.born)}
    assert set(world.international.age_records[-2]) == {'youngest', 'oldest', 'youngest_scorer', 'oldest_scorer'}
