from api.honours import honours
from api.views import club_ref
from core.domain.clubs import Competition
from core.domain.date import Date
from core.domain.matches import Match, MatchResult
from core.domain.world import SeasonRecord
from test_market import mini_world


def honours_world(config):
    """France: a cup, two divisions (declared out of order) and no title yet in the second cup; England: one division; two European cups."""
    world = mini_world(config)
    world.competitions = {item.id: item for item in (
        Competition(-3, "Coupe de France", "FRA", 0, [1, 2], kind="cup"), Competition(17, "Ligue 2", "FRA", 2, [2]),
        Competition(16, "Ligue 1", "FRA", 1, [1]), Competition(11, "Premier League", "ENG", 1, []),
        Competition(-104, "Conference League", "EUR", 0, [], kind="europe", code="C4"),
        Competition(-101, "Ligue des champions", "EUR", 0, [], kind="europe", code="C1"))}
    world.nation_names = {"FRA": "France"}
    world.champions = {16: [(2025, 1), (2026, 2)], 17: [(2025, 2)], -3: [(2026, 1)], -101: [(2025, 2)]}
    return world


def test_europe_comes_first_by_code_and_each_country_lists_divisions_then_its_cup(config):
    data = honours(honours_world(config))
    assert [item["code"] for item in data["europe"]] == ["C1", "C4"]
    assert [(item["code"], item["name"]) for item in data["countries"]] == [("ENG", "ENG"), ("FRA", "France")]
    assert [(item["name"], item["kind"], item["level"]) for item in data["countries"][1]["competitions"]] == [
        ("Ligue 1", "league", 1), ("Ligue 2", "league", 2), ("Coupe de France", "cup", 0)]
    assert not any(item["kind"] == "europe" for country in data["countries"] for item in country["competitions"])


def test_champions_come_latest_season_first_with_their_club(config):
    world = honours_world(config)
    data = honours(world)
    first_division = data["countries"][1]["competitions"][0]
    assert [(row["season"], row["champion"]["id"]) for row in first_division["items"]] == [(2026, 2), (2025, 1)]
    assert first_division["items"][0]["champion"] == {"id": 2, "name": "Club 2", "major_color": world.clubs[2].home_kit_major_color,
                                                       "minor_color": world.clubs[2].home_kit_minor_color}
    assert [(row["season"], row["champion"]["id"]) for row in data["europe"][0]["items"]] == [(2025, 2)]
    assert [row["champion"]["id"] for row in data["countries"][1]["competitions"][2]["items"]] == [1]


def test_a_competition_without_a_title_yet_still_has_its_block(config):
    data = honours(honours_world(config))
    assert data["europe"][1]["items"] == []
    assert data["countries"][0]["competitions"][0]["items"] == []
    world = honours_world(config)
    world.champions = {}
    empty = honours(world)
    blocks = empty["europe"] + [item for country in empty["countries"] for item in country["competitions"]]
    assert len(blocks) == 6 and all(item["items"] == [] for item in blocks)
    assert empty["clubs"] == empty["players"] == empty["scorers"] == empty["nations"] == []


def records(*rows):
    """Rows are (season, player, club, competition, matches, goals)."""
    return {str(index): SeasonRecord(*row[:4], matches=row[4], goals=row[5]) for index, row in enumerate(rows)}


def test_a_block_names_its_all_time_leading_scorer_and_the_country_of_each_champion(config):
    world = honours_world(config)
    world.records = records((2025, 101, 1, 16, 30, 12), (2026, 101, 2, 16, 28, 9), (2026, 201, 2, 16, 20, 21), (2026, 102, 1, 16, 10, 21),
                            (2026, 103, 1, -3, 5, 40), (2026, 104, 1, 17, 12, 0))
    data = honours(world)
    first_division, second_division, cup = data["countries"][1]["competitions"]
    # Three players on 21 goals: the one who needed the fewest matches.
    assert first_division["scorer"] == {"player_id": 102, "player": world.players[102].name, "goals": 21}
    assert cup["scorer"]["player_id"] == 103 and cup["scorer"]["goals"] == 40
    assert second_division["scorer"] is None and data["europe"][0]["scorer"] is None
    assert [row["nation"] for row in first_division["items"]] == ["FRA", "FRA"]
    assert data["season"] == world.season


def test_the_season_under_way_gives_the_leader_of_a_league_and_the_next_round_of_the_others(config):
    world = honours_world(config)
    world.season = 2027
    world.competitions[16] = Competition(16, "Ligue 1", "FRA", 1, [1, 2], match_ids=[1, 2])
    day = Date(2027, 8, 15)
    world.matches = {1: Match(1, 16, 2027, 1, day, 1, 2, MatchResult(2, 0, "possession", [])), 2: Match(2, 16, 2027, 2, day, 2, 1),
                     3: Match(3, -3, 2027, 1, day, 1, 2), 4: Match(4, 17, 2027, 1, day, 2, 1), 5: Match(5, 17, 2026, 1, day, 2, 1)}
    data = honours(world)
    first_division, second_division, cup = data["countries"][1]["competitions"]
    assert first_division["current"] == {"leader": club_ref(world, 1), "round": 1}
    assert second_division["current"] == {"label": "Journée 1"}
    assert cup["current"] == {"label": "32es de finale"}
    # Without a calendar there is nothing to say, nor once the title of the season is awarded.
    assert data["europe"][0]["current"] is None
    world.champions[-3].append((2027, 2))
    assert honours(world)["countries"][1]["competitions"][2]["current"] is None


def test_clubs_and_players_are_ranked_by_titles_and_scorers_by_seasons_ended_on_top(config):
    world = honours_world(config)
    world.retired[900] = "Ancien joueur"
    world.records = records((2025, 101, 1, 16, 30, 12), (2026, 101, 2, 16, 28, 9), (2025, 201, 2, 17, 20, 15), (2026, 201, 2, 16, 25, 30),
                            (2026, 102, 1, -3, 4, 3), (2026, 103, 1, 16, 0, 0), (2025, 900, 2, 17, 10, 2))
    data = honours(world)
    # Club 2: the Champions League, a top-flight league and a second division; club 1: a league and a cup.
    assert data["clubs"] == [{"club": club_ref(world, 2), "nation": "FRA", "europe": 1, "league": 1, "cup": 0, "lower": 1, "total": 3},
                             {"club": club_ref(world, 1), "nation": "FRA", "europe": 0, "league": 1, "cup": 1, "lower": 0, "total": 2}]
    # A player wins what the club he played for that season won, in any competition; one who did not play wins nothing.
    assert [(row["player_id"], row["europe"], row["league"], row["cup"], row["lower"], row["total"]) for row in data["players"]] == [
        (201, 1, 1, 0, 1, 3), (900, 1, 0, 0, 1, 2), (101, 0, 2, 0, 0, 2), (102, 0, 0, 1, 0, 1)]
    assert data["players"][0]["position"] == world.players[201].position.value and data["players"][0]["club"] == club_ref(world, 2)
    assert data["players"][1] == {"player_id": 900, "player": "Ancien joueur", "position": None, "club": None,
                                  "europe": 1, "league": 0, "cup": 0, "lower": 1, "total": 2}
    assert [(row["player_id"], row["titles"], row["goals"]) for row in data["scorers"]] == [(201, 2, 45), (101, 1, 12), (102, 1, 3)]
    assert data["scorers"][0]["competitions"] == [{"id": 16, "name": "Ligue 1", "code": None, "titles": 1},
                                                  {"id": 17, "name": "Ligue 2", "code": None, "titles": 1}]
    # The European cups by country of their winners, a count per cup in the order of the cups.
    assert data["nations"] == [{"code": "FRA", "name": "France", "titles": [1, 0], "total": 1}]
