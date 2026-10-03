"""The human club's reserve and loans through the API, and a first window of loans between AI clubs."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from core.world.loans import lendable, takers
from core.world.simulation import advance_day
from core.world.validation import validate_world
from infrastructure.importation.loader import import_world

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def client(config, tmp_path_factory):
    """A game in its first summer window, a mid-table club of the top flight chosen."""
    app = create_app(ROOT, tmp_path_factory.mktemp("loan-saves"))
    world = import_world(ROOT / "data", config, 777)
    clubs = sorted((club for club in world.active_clubs() if world.competitions[club.competition_id].level == 1), key=lambda club: club.reputation)
    world.controlled_club_id = clubs[len(clubs) // 2].id
    for _ in range(16): advance_day(world, auto=True)
    app.state.game.world = world
    with TestClient(app) as client:
        yield client


def test_ai_clubs_lend_and_keep_a_reserve_and_the_world_stays_valid(client):
    world = client.app.state.game.world
    validate_world(world)
    lent = [player for player in world.players.values() if player.loan is not None]
    assert lent and any(player.reserve_since is not None for player in world.players.values())
    human = world.controlled_club_id
    for player in lent:
        owner, club = world.clubs[player.loan.parent_id], world.clubs[player.club_id]
        assert human not in (owner.id, club.id) and club.competition_id is not None
        assert player.id in owner.loaned_ids and player.id in club.borrowed_ids and player.contract.end > player.loan.end
    limit = world.config.management.market.loans.max_borrowed
    assert all(len(club.borrowed_ids) <= limit for club in world.clubs.values())
    # Nobody of the human club's was moved for it.
    assert all(world.players[pid].reserve_since is None for pid in world.clubs[human].player_ids)


def test_the_squad_lists_the_reserve_and_the_players_lent(client):
    world = client.app.state.game.world
    club = world.clubs[world.controlled_club_id]
    young = min((world.players[pid] for pid in club.player_ids if world.players[pid].position != "GB"), key=lambda player: (player.rating, player.id))
    assert client.post("/api/partie/reserve", json={"joueur_id": young.id, "reserve": True}).json()["en_reserve"] is True
    rows = {row["id"]: row for row in client.get(f"/api/clubs/{club.id}/effectif").json()["items"]}
    assert rows[young.id]["reserve"] is True and rows[young.id]["away"] is False
    form = client.get("/api/ma-partie/composition").json()
    assert young.id not in {row["id"] for row in form["players"]}
    assert client.post("/api/partie/reserve", json={"joueur_id": young.id, "reserve": False}).json()["en_reserve"] is False
    foreign = next(player for player in world.players.values() if player.club_id not in (None, club.id))
    refused = client.post("/api/partie/reserve", json={"joueur_id": foreign.id, "reserve": True})
    assert refused.status_code == 400 and "pas dans votre effectif" in refused.json()["detail"]


def test_the_human_club_lends_one_of_its_players_from_the_clubs_that_would_take_him(client):
    world = client.app.state.game.world
    club = world.clubs[world.controlled_club_id]
    options = {pid: client.get(f"/api/ma-partie/effectif/{pid}").json() for pid in club.player_ids}
    player_id, view = next((pid, view) for pid, view in options.items() if view["clubs"])
    assert view["sens"] == "sortant" and view["obstacle_pret"] is None and view["durees"]
    assert [item["id"] for item in view["clubs"]] == [taker.id for taker in takers(world, world.players[player_id])]
    wages = club.wage_bill
    sent = client.post("/api/partie/preter", json={"joueur_id": player_id, "club_id": view["clubs"][0]["id"], "duree": view["durees"][0]["cle"]})
    assert sent.status_code == 200 and sent.json()["pret"]["club"]["id"] == view["clubs"][0]["id"]
    player = world.players[player_id]
    assert player.club_id == view["clubs"][0]["id"] and player.id in club.loaned_ids and club.wage_bill == wages
    row = next(row for row in client.get(f"/api/clubs/{club.id}/effectif").json()["items"] if row["id"] == player_id)
    assert row["away"] is True and row["loan"]["parent"]["id"] == club.id
    assert [item["joueur_id"] for item in client.get("/api/ma-partie/transferts").json()["prets"]] == [player_id]
    assert client.get(f"/api/ma-partie/negociation/{player_id}").json()["obstacle"] == "Ce joueur est déjà dans votre effectif."
    again = client.post("/api/partie/preter", json={"joueur_id": player_id, "club_id": view["clubs"][0]["id"], "duree": "saison"})
    assert again.status_code == 400
    movements = client.get(f"/api/clubs/{club.id}/transferts").json()["sections"]
    assert [row["player_id"] for row in movements["loans_out"]] == [player_id] and not movements["loans_in"]
    validate_world(world)


def test_the_players_list_tells_who_is_lent_and_the_human_club_borrows_one(client):
    world = client.app.state.game.world
    club = world.clubs[world.controlled_club_id]
    listed = client.get("/api/joueurs", params={"liste": "pret", "taille": 100}).json()
    assert listed["total"] == sum(len(lendable(world, other)) for other in world.active_clubs())
    assert all(row["loan_listed"] for row in listed["items"])
    keen = client.get("/api/joueurs", params={"liste": "pret", "interesse": "pret", "taille": 100, "tri": "listed"}).json()
    assert keen["total"] and all(row["loan_listed"] and row["loan_interested"] for row in keen["items"])
    target = keen["items"][0]
    owner = world.players[target["id"]].club_id
    size = club.squad_size
    taken = client.post("/api/partie/emprunter", json={"joueur_id": target["id"], "duree": "saison"})
    assert taken.status_code == 200 and taken.json()["pret"]["parent"]["id"] == owner
    player = world.players[target["id"]]
    assert player.club_id == club.id and club.squad_size == size and player.id in club.borrowed_ids
    # A borrowed player is neither sold, nor sent to the reserve, nor taken twice.
    assert client.post("/api/partie/liste-transferts", json={"joueur_id": player.id, "indemnite": 1}).status_code == 400
    assert client.post("/api/partie/reserve", json={"joueur_id": player.id, "reserve": True}).status_code == 400
    assert client.post("/api/partie/emprunter", json={"joueur_id": player.id, "duree": "saison"}).status_code == 400
    detail = client.get(f"/api/joueurs/{player.id}").json()
    assert detail["loan"]["parent"]["id"] == owner and detail["transferable"] is False and detail["interested"] is None
    # A starter of a big club is not on offer.
    star = max((item for item in world.players.values() if item.club_id not in (None, club.id) and item.loan is None), key=lambda item: item.rating)
    refused = client.post("/api/partie/emprunter", json={"joueur_id": star.id, "duree": "saison"})
    assert refused.status_code == 400 and "ne souhaite pas prêter" in refused.json()["detail"]
    transfers = client.get("/api/monde/transferts", params={"nature": "pret", "taille": 100}).json()
    assert transfers["total"] and all(row["kind"] == "loan" for row in transfers["items"])
    validate_world(world)
