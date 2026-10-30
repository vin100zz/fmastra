import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import create_app

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    app = create_app(ROOT, tmp_path_factory.mktemp("creation-saves"))
    with TestClient(app) as client:
        yield client


def finish(client, job):
    for _ in range(600):
        state = client.get(f"/api/travaux/{job['id']}").json()
        if state["status"] not in ("queued", "running"): return state
        time.sleep(.1)
    pytest.fail("La création ne se termine pas.")


def test_the_nations_of_a_new_game_open_on_the_divisions_played_by_default(client):
    data = client.get("/api/creation").json()
    assert data["date"] == "2026-07-01" and data["season"] == 2026
    assert [(nation["code"], nation["default"], [division["name"] for division in nation["divisions"]]) for nation in data["nations"]] == [
        ("FRA", 3, ["Ligue 1", "Ligue 2", "National"]), ("ITA", 2, ["Serie A", "Serie B"]), ("ESP", 2, ["La Liga", "La Liga 2"]),
        ("ENG", 2, ["Premier League", "Championship"]), ("GER", 2, ["Bundesliga", "Bundesliga 2", "3. Liga"]),
        ("NED", 0, ["Eredivisie", "Eerste Divisie", "Tweede Divisie"]), ("POR", 0, ["Primeira Liga", "Liga Portugal 2"]),
        ("BEL", 0, ["Pro League", "Challenger Pro League"]), ("TUR", 0, ["Süper Lig", "1. Lig"])]
    assert data["flags"]["FRA"]["name"] == "France" and data["flags"]["ENG"]["flag"]


def test_the_clubs_of_a_choice_are_those_of_its_divisions(client):
    page = client.get("/api/creation/clubs", params={"nations": "FRA:2,GER:3", "taille": 100}).json()
    assert (page["total"], page["clubs"], page["leagues"]) == (92, 92, 5)
    assert {(club["nation_code"], club["level"]) for club in page["items"]} == {("FRA", 1), ("FRA", 2), ("GER", 1), ("GER", 2), ("GER", 3)}
    reputations = [club["reputation"] for club in page["items"]]
    assert reputations == sorted(reputations, reverse=True)
    french = client.get("/api/creation/clubs", params={"nations": "FRA:2,GER:3", "pays": "FRA", "tri": "nom"}).json()
    assert (french["total"], french["clubs"]) == (36, 92)
    names = [club["name"] for club in french["items"]]
    assert names == sorted(names, key=str.casefold)
    by_league = client.get("/api/creation/clubs", params={"nations": "FRA:3", "tri": "championnat", "ordre": "desc"}).json()
    assert by_league["items"][0]["competition"] == "National"
    assert client.get("/api/creation/clubs", params={"nations": "ITA:3"}).status_code == 400
    assert client.get("/api/creation/clubs", params={"nations": ""}).status_code == 400


def test_a_club_shows_its_figures_and_its_best_players_before_it_is_chosen(client):
    rennes = client.get("/api/creation/clubs", params={"nations": "FRA:1", "recherche": "rennes"}).json()["items"][0]
    club = client.get(f"/api/creation/clubs/{rennes['id']}").json()
    assert club["name"] == "Rennes" and club["competition"] == "Ligue 1" and club["wage_cap"] > 0
    assert club["kit_id"] is not None and club["third_color"]
    assert client.get(club["kit_url"]).headers["content-type"] == "image/png"
    assert client.get(club["away_kit_url"]).headers["content-type"] == "image/png"
    assert len(club["squad"]) == 16 and club["top_rating"] == pytest.approx(sum(p["rating"] for p in club["squad"]) / 16, abs=.1)
    assert client.get("/api/creation/clubs/1").status_code == 404


def test_a_new_game_plays_the_divisions_chosen_with_its_club_and_a_drawn_seed(client):
    rennes = client.get("/api/creation/clubs", params={"nations": "FRA:1", "recherche": "rennes"}).json()["items"][0]
    refused = client.post("/api/partie/creer", json={"nations": {"ENG": 2}, "club_id": rennes["id"]})
    assert refused.status_code == 400
    job = client.post("/api/partie/creer", json={"nations": {"FRA": 2, "ENG": 0}, "club_id": rennes["id"]})
    # While the world is made, the job tells the screen the club and the first day of the game.
    assert job.json()["club"]["name"] == "Rennes" and job.json()["date"] == "2026-07-01"
    assert job.status_code == 202 and finish(client, job.json())["status"] == "done"
    world = client.app.state.game.world
    assert [league.name for league in world.config.world.competitions] == ["Ligue 1", "Ligue 2"]
    assert world.controlled_club_id == rennes["id"] and 0 <= world.seed < 2**53
    state = client.get("/api/monde/etat").json()
    assert state["controlled_club_id"] == rennes["id"]
    # The save lists its club without being opened.
    [autosave] = client.get("/api/partie/slots").json()
    assert autosave["slot"] == "autosave" and autosave["date"] == "2026-07-01" and autosave["club"]["name"] == "Rennes"


def test_a_new_game_is_saved_under_the_name_it_is_given(client):
    rennes = client.get("/api/creation/clubs", params={"nations": "FRA:1", "recherche": "rennes"}).json()["items"][0]
    refused = client.post("/api/partie/creer", json={"nations": {"FRA": 1}, "club_id": rennes["id"], "slot": "ma partie"})
    assert refused.status_code == 422
    job = client.post("/api/partie/creer", json={"nations": {"FRA": 1}, "club_id": rennes["id"], "slot": "Rennes-carrière"})
    assert job.status_code == 202 and finish(client, job.json())["status"] == "done"
    assert client.get("/api/monde/etat").json()["slot"] == "Rennes-carrière"
    [save] = [save for save in client.get("/api/partie/slots").json() if save["slot"] == "Rennes-carrière"]
    assert save["club"]["name"] == "Rennes"
