from api.honours import honours
from core.domain.clubs import Competition
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
