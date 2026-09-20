from dataclasses import replace

import pytest

from api import navigation as nav
from api import views as v
from core.domain.clubs import Competition
from test_market import mini_world


def world_with_clubs(config):
    """Ligue 1 (ids 1-4, names chosen to test accents, case and ties), Ligue 2 (5), and dormant clubs outside any division (6 in FRA, 7 in POR)."""
    world = mini_world(config)
    template = world.clubs[1]
    names = {1: "Zebra", 2: "élan", 3: "Ajax", 4: "ajax", 5: "Brest", 6: "Dormant FC", 7: "Porto B"}
    world.clubs = {cid: replace(template, id=cid, name=name, player_ids=list(template.player_ids) if cid == 1 else [],
                                competition_id=16 if cid <= 4 else 17 if cid == 5 else None, nation="POR" if cid == 7 else "FRA")
                   for cid, name in names.items()}
    world.competitions = {17: Competition(17, "Ligue 2", "FRA", 2, [5]), 16: Competition(16, "Ligue 1", "FRA", 1, [1, 2, 3, 4])}
    world.nation_names = {"FRA": "France", "POR": "Portugal"}
    return world


def ids(data):
    return [item["id"] for item in data["items"]]


def test_clubs_step_through_their_division_alphabetically_ignoring_accents_and_case(config):
    world = world_with_clubs(config)
    middle = nav.club_navigation(world, 2)
    assert ids(middle) == [3, 4, 2, 1]  # Ajax, ajax (same name: by id), élan, Zebra
    assert middle["scope"] == {"kind": "division", "id": 16, "name": "Ligue 1"}
    assert (middle["index"], middle["total"]) == (2, 4)
    assert middle["previous"] == {"id": 4, "name": "ajax", "squad": 0}
    assert middle["next"] == {"id": 1, "name": "Zebra", "squad": len(world.clubs[1].player_ids)} and middle["next"]["squad"] > 0
    assert nav.club_navigation(world, 3)["previous"] is None
    assert nav.club_navigation(world, 1)["next"] is None
    # Every member of the group sees the same list; a club of another division is not in it.
    assert {tuple(ids(nav.club_navigation(world, cid))) for cid in (1, 2, 3, 4)} == {(3, 4, 2, 1)}
    assert ids(nav.club_navigation(world, 5)) == [5]


def test_a_club_without_division_steps_through_the_clubs_of_its_country(config):
    world = world_with_clubs(config)
    data = nav.club_navigation(world, 6)
    assert data["scope"] == {"kind": "country", "code": "FRA", "name": "France"}
    assert ids(data) == [3, 4, 5, 6, 2, 1]  # Every French club, playing or not; Porto B is elsewhere.
    assert data["items"][data["index"]]["id"] == 6
    alone = nav.club_navigation(world, 7)
    assert (alone["total"], alone["previous"], alone["next"]) == (1, None, None)
    assert alone["scope"]["name"] == "Portugal"


def test_players_step_through_their_squad_by_position_then_name(config):
    world = world_with_clubs(config)
    squad = world.clubs[1].player_ids
    data = nav.player_navigation(world, squad[3])
    assert data["scope"] == {"kind": "club", "id": 1, "name": "Zebra"}
    assert sorted(ids(data)) == sorted(squad) and data["total"] == len(squad)
    ranks = [v.position_rank(item["position"]) for item in data["items"]]
    assert ranks == sorted(ranks) and data["items"][0]["position"] == "GB"
    for rank in set(ranks):
        names = [v.normalized(item["name"]) for item in data["items"] if v.position_rank(item["position"]) == rank]
        assert names == sorted(names)
    assert data["items"][data["index"]]["id"] == squad[3]
    assert data["previous"] == data["items"][data["index"] - 1] and data["next"] == data["items"][data["index"] + 1]


def test_retirees_and_free_agents_have_no_squad_to_step_through(config):
    world = world_with_clubs(config)
    free = world.players[world.clubs[1].player_ids[0]]
    free.club_id = None
    world.retired[999] = "Ancien Joueur"
    assert nav.player_navigation(world, free.id) is None
    assert nav.player_navigation(world, 999) is None
    with pytest.raises(KeyError):
        nav.player_navigation(world, 424242)


def test_competitions_of_a_country_run_from_the_top_division_to_the_cup(config):
    world = world_with_clubs(config)
    world.competitions = {
        -1: Competition(-1, "Coupe de France", "FRA", 0, [], kind="cup"),
        18: Competition(18, "National", "FRA", 3, []), 17: Competition(17, "Ligue 2", "FRA", 2, []),
        16: Competition(16, "Ligue 1", "FRA", 1, []), 21: Competition(21, "Premier League", "ENG", 1, []),
        -9: Competition(-9, "Ligue Europa", "EUR", 0, [], kind="europe", code="UEL"),
        -8: Competition(-8, "Ligue des champions", "EUR", 0, [], kind="europe", code="UCL"),
    }
    world.nation_names = {"FRA": "France"}
    for competition_id in (16, 17, 18, -1):
        data = nav.competition_navigation(world, competition_id)
        assert [item["name"] for item in data["items"]] == ["Ligue 1", "Ligue 2", "National", "Coupe de France"]
        assert data["scope"] == {"kind": "country", "code": "FRA", "name": "France"}
    cup = nav.competition_navigation(world, -1)
    assert [item["kind"] for item in cup["items"]] == ["league", "league", "league", "cup"]
    assert cup["previous"]["name"] == "National" and cup["next"] is None
    top = nav.competition_navigation(world, 16)
    assert top["previous"] is None and top["next"]["name"] == "Ligue 2" and (top["index"], top["total"]) == (0, 4)
    assert nav.competition_navigation(world, 21)["total"] == 1
    assert [item["name"] for item in nav.competition_navigation(world, -9)["items"]] == ["Ligue des champions", "Ligue Europa"]
