from dataclasses import replace

from api import search
from core.domain.clubs import Competition
from core.domain.international import NationalTeam
from test_market import mini_world

# Club 1 (France), then club 2.
PLAYERS = {100: "Franck Ribéry", 101: "Mark van der Bommel", 102: "N'Golo Kanté", 103: "Warren Zaïre-Emery", 104: "Martin Ødegaard",
           105: "Kenan Yıldız", 106: "Ronaldinho", 107: "Lucas Chevalier", 200: "Francisco Conceição", 201: "Lucas Paquetá",
           202: "Davide Frattesi", 203: "Franco Mastantuono"}


def world_to_search(config):
    """Two clubs of the mini world and three more, their players renamed; the leagues, cups and national teams a search finds."""
    world = mini_world(config)
    for player_id, name in PLAYERS.items(): world.players[player_id].name = name
    template = replace(world.clubs[1], player_ids=[])
    world.clubs[1].name, world.clubs[2].name = "Paris SG", "Eintracht Francfort"
    world.clubs[2].nation, world.clubs[2].competition_id = "GER", 30
    world.clubs[3] = replace(template, id=3, name="Paris FC", competition_id=17, reputation=40)
    world.clubs[4] = replace(template, id=4, name="Francs Borains", nation="BEL", competition_id=None, reputation=90)
    world.clubs[5] = replace(template, id=5, name="Saint-Étienne", competition_id=17, reputation=60)
    world.competitions = {16: Competition(16, "Ligue 1", "FRA", 1, [1]), 17: Competition(17, "Ligue 2", "FRA", 2, [3, 5]),
                          20: Competition(20, "Coupe de France", "FRA", 1, [1, 3, 5], kind="cup"),
                          30: Competition(30, "Bundesliga", "GER", 1, [2]), 31: Competition(31, "Coupe d’Allemagne", "GER", 1, [2], kind="cup"),
                          -101: Competition(-101, "Ligue des champions", "EUR", 1, [1, 2], kind="europe", code="C1")}
    world.international.nations = {1: NationalTeam(1, "FRA", "France", "UEFA", 88, 88), 2: NationalTeam(2, "GER", "Allemagne", "UEFA", 86, 86),
                                   3: NationalTeam(3, "SMR", "Saint-Marin", "UEFA", 20, 20)}
    world.controlled_club_id = 1
    return world


def found(world, query, type=None):
    return [(item["kind"], item["name"]) for item in search.search(world, query, type)["items"]]


def names(world, query, type=None):
    return [name for _, name in found(world, query, type)]


def test_a_name_is_found_whatever_the_case_and_the_accents(config):
    world = world_to_search(config)
    for query in ("ribery", "RIBÉRY", "Ribery", "ribéry"):
        assert names(world, query) == ["Franck Ribéry"], query
    # Letters no accent is taken from are read as they are typed without their key.
    assert names(world, "odegaard") == ["Martin Ødegaard"] and names(world, "yildiz") == ["Kenan Yıldız"]
    assert names(world, "conceicao") == ["Francisco Conceição"] and names(world, "paqueta lucas") == ["Lucas Paquetá"]
    assert search.fold("Ærø Straße") == "aero strasse"


def test_a_name_is_found_whatever_the_order_of_its_words(config):
    world = world_to_search(config)
    for query in ("franck ribery", "ribery franck", "Ribéry Fra", "Franck Rib", "rib fra"):
        assert names(world, query) == ["Franck Ribéry"], query
    # Each word typed needs a word of the name of its own.
    assert names(world, "ribery rib") == [] and names(world, "franck franck") == []
    assert names(world, "lucas l") == [] and names(world, "lucas p") == ["Lucas Paquetá"]


def test_a_name_is_found_by_any_of_its_words_and_by_a_part_of_them(config):
    world = world_to_search(config)
    for query in ("bommel", "Bomm", "van bommel", "der", "mark van der bommel"):
        assert "Mark van der Bommel" in names(world, query), query
    # A word of three letters or more is found inside a word too; a shorter one only at its start.
    assert names(world, "dinho") == ["Ronaldinho"] and names(world, "omme") == ["Mark van der Bommel"]
    assert names(world, "nh") == [] and names(world, "ro") == ["Ronaldinho"]
    assert names(world, "zidane") == []


def test_punctuation_in_a_name_or_in_what_is_typed_does_not_matter(config):
    world = world_to_search(config)
    for query in ("ngolo", "n'golo", "N’Golo K", "golo", "kante n"):
        assert names(world, query) == ["N'Golo Kanté"], query
    for query in ("zaire-emery", "zaire emery", "zaireemery", "emery", "Emery Warren", "zaïre"):
        assert names(world, query) == ["Warren Zaïre-Emery"], query
    assert names(world, "saint etienne") == ["Saint-Étienne"] and names(world, "st-etienne") == []
    assert names(world, "saint-") == ["Saint-Marin", "Saint-Étienne"]


def test_nothing_is_searched_under_two_letters(config):
    world = world_to_search(config)
    assert search.search(world, "")["items"] == [] and names(world, "  ") == [] and names(world, "f") == [] and names(world, "-") == []
    assert names(world, "fr")


def test_the_letters_typed_are_marked_in_the_name(config):
    world = world_to_search(config)
    marks = lambda query: search.search(world, query)["items"][0]["marks"]
    assert marks("ribery fra") == [[0, 3], [7, 13]]
    assert marks("bomm") == [[13, 17]]
    assert marks("dinho") == [[5, 10]]
    # Across the punctuation of a group read as one word, and over the letter an accent stands on.
    assert marks("ngo") == [[0, 4]] and marks("zaire-em") == [[7, 15]] and marks("conceicao") == [[10, 19]]
    name = "Müller-Wohlfahrt"
    assert search.marks(name, ("muller", "wohl")) == [[0, 6], [7, 11]] and search.marks("Straße", ("stras",)) == [[0, 5]]


def test_the_best_match_comes_first_then_the_kinds_in_their_order(config):
    world = world_to_search(config)
    # The whole name, a whole word, the start of a word, the inside of one.
    assert found(world, "france")[:2] == [("nation", "France"), ("competition", "Coupe de France")]
    assert found(world, "paris sg")[0] == ("club", "Paris SG")
    # At equal match: national teams, competitions, clubs (those playing first, then by reputation), players.
    assert found(world, "fra") == [("nation", "France"), ("competition", "Coupe de France"), ("club", "Eintracht Francfort"),
                                   ("club", "Francs Borains"), ("player", "Franck Ribéry"), ("player", "Davide Frattesi"),
                                   ("player", "Francisco Conceição"), ("player", "Franco Mastantuono")]
    # The human club's country and Europe before the other countries; a league before a cup.
    assert names(world, "ligue") == ["Ligue 1", "Ligue 2", "Ligue des champions"]
    assert names(world, "coupe") == ["Coupe de France", "Coupe d’Allemagne"]
    assert names(world, "paris") == ["Paris SG", "Paris FC"]


def test_the_human_club_s_players_come_first_then_the_better_ones_and_the_retired_last(config):
    world = world_to_search(config)
    world.retired[900] = "Lucas Hernandez"
    world.players[201].rating = 90
    assert names(world, "lucas") == ["Lucas Chevalier", "Lucas Paquetá", "Lucas Hernandez"]
    world.controlled_club_id = None
    assert names(world, "lucas") == ["Lucas Paquetá", "Lucas Chevalier", "Lucas Hernandez"]
    retired = search.search(world, "hernandez")["items"]
    assert retired == [{"kind": "player", "id": 900, "name": "Lucas Hernandez", "position": None, "club": None, "retired": True, "marks": [[6, 15]]}]


def test_a_list_of_every_kind_keeps_room_for_the_players_and_a_type_keeps_one_kind(config):
    world = world_to_search(config)
    template = world.clubs[3]
    for index in range(20): world.clubs[50 + index] = replace(template, id=50 + index, name=f"Player Club {index}", reputation=index)
    mixed = found(world, "player")
    assert len(mixed) == search.RESULTS
    assert [kind for kind, _ in mixed] == ["club"] * search.SHARES["club"] + ["player"] * (search.RESULTS - search.SHARES["club"])
    assert [name for _, name in mixed[:3]] == ["Player Club 19", "Player Club 18", "Player Club 17"]
    clubs = found(world, "player", "clubs")
    assert len(clubs) == search.RESULTS and {kind for kind, _ in clubs} == {"club"}
    assert {kind for kind, _ in found(world, "fra", "joueurs")} == {"player"}
    assert found(world, "fra", "selections") == [("nation", "France")] and found(world, "fra", "competitions") == [("competition", "Coupe de France")]
    # A kind past its share takes the places the others leave.
    for player in world.players.values(): player.name = "Anonyme"
    assert [kind for kind, _ in found(world, "player")] == ["club"] * search.RESULTS


def test_each_kind_of_result_says_what_its_line_shows(config):
    world = world_to_search(config)
    world.clubs[2].home_kit_major_color, world.clubs[2].home_kit_minor_color = "#e1000f", "#111111"
    # The first line of each kind.
    items = {item["kind"]: item for item in reversed(search.search(world, "fra")["items"])}
    assert items["nation"] == {"kind": "nation", "id": 1, "name": "France", "nation": "FRA", "marks": [[0, 3]]}
    assert items["competition"] == {"kind": "competition", "id": 20, "name": "Coupe de France", "marks": [[9, 12]],
                                    "competition": {"id": 20, "name": "Coupe de France", "kind": "cup", "code": None, "nation": "FRA", "level": 1}}
    assert items["club"] == {"kind": "club", "id": 2, "name": "Eintracht Francfort", "major_color": "#e1000f", "minor_color": "#111111", "nation": "GER",
                             "competition": {"id": 30, "name": "Bundesliga", "kind": "league", "code": None, "nation": "GER", "level": 1}, "marks": [[10, 13]]}
    assert items["player"] == {"kind": "player", "id": 100, "name": "Franck Ribéry", "position": world.players[100].position.value,
                               "club": {"id": 1, "name": "Paris SG", "major_color": None, "minor_color": None}, "retired": False, "marks": [[0, 3]]}
    dormant = search.search(world, "borains")["items"][0]
    assert dormant["competition"] is None and dormant["nation"] == "BEL"
    world.players[100].club_id = None
    assert search.search(world, "ribery")["items"][0]["club"] is None
