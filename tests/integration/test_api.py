from pathlib import Path
from threading import Event

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from core.world.simulation import advance_day
from infrastructure.importation.loader import import_world

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def client(config, tmp_path_factory):
    app = create_app(ROOT, tmp_path_factory.mktemp("api-saves"))
    app.state.game.world = import_world(ROOT / "data", config, 777)
    with TestClient(app) as client:
        yield client


def test_views_pagination_and_no_rng_or_potential_leak(client):
    world = client.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    club_id = next(iter(world.active_clubs())).id
    league_id = world.clubs[club_id].competition_id
    player_id = world.clubs[club_id].player_ids[0]
    match_id = world.competitions[league_id].match_ids[0]
    routes = ["/monde/etat", "/monde/journal", "/partie/rapport-import", "/partie/slots", "/clubs", "/clubs?statut=dormant&page=2", "/competitions",
              f"/clubs/{club_id}", *[f"/clubs/{club_id}/{section}" for section in ("effectif", "calendrier", "finances", "transferts", "historique")],
              *[f"/competitions/{league_id}/{section}" for section in ("classement", "calendrier", "statistiques", "historique")],
              "/joueurs?page=2", "/joueurs?tri=contract_end&ordre=asc", f"/joueurs/{player_id}", f"/joueurs/{player_id}/historique", f"/matches/{match_id}"]
    for route in routes:
        response = client.get("/api" + route)
        assert response.status_code == 200, (route, response.text)
        assert '"potential":' not in response.text
    first, second = client.get("/api/joueurs").json(), client.get("/api/joueurs?page=2").json()
    assert len(first["items"]) == len(second["items"]) == 30
    assert not {row["id"] for row in first["items"]} & {row["id"] for row in second["items"]}
    assert first["total"] == len(world.players)
    values = [row['value'] for row in first['items'] + second['items']]
    assert values == sorted(values, reverse=True)
    assert all(row['nationalities'] and row['nationality_names'] for row in first['items'])
    ascending = client.get('/api/joueurs?tri=value&ordre=asc').json()['items']
    assert [row['value'] for row in ascending] == sorted(row['value'] for row in ascending)
    club_rows = client.get('/api/clubs').json()['items']
    assert all({'training_facilities', 'youth_recruitment'} <= row.keys() for row in club_rows)
    psg = client.get('/api/clubs/868').json()
    assert (psg['training_facilities'], psg['youth_recruitment']) == (20, 19)
    mbappe = client.get('/api/joueurs/85139014').json()
    assert mbappe['attributes_imported'] and mbappe['position_ratings']['BU'] == 18
    assert mbappe['attributes']['finition'] == 90
    assert 'source_potential_ability' not in mbappe and 'source_current_ability' not in mbappe
    assert [row['reputation'] for row in club_rows] == sorted((row['reputation'] for row in club_rows), reverse=True)
    squad = client.get(f'/api/clubs/{club_id}/effectif?tri=goals').json()['items']
    assert all({'appearances','minutes','goals','assists','yellows','reds','average','value'} <= row.keys() for row in squad)
    for kind in ('transfer', 'retirement', 'academy'):
        history = client.get(f'/api/monde/transferts?type={kind}').json()
        assert history['type'] == kind and history['season'] == world.season
    assert client.get('/api/monde/transferts?type=invalid').status_code == 422
    assert client.get('/api/monde/transferts?saison=1900').status_code == 422
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states
    assert client.get("/api/joueurs?page=0").status_code == 422
    assert client.get("/api/clubs/999999999").status_code == 404
    for section in ('finances', 'transferts'):
        assert client.get(f'/api/clubs/{club_id}/{section}?saison=1900').status_code == 422
    history = client.get(f'/api/clubs/{club_id}/finances').json()['history']
    assert not history['available'] and history['season'] == world.season
    movements = client.get(f'/api/clubs/{club_id}/transferts').json()
    assert movements['previous_season'] is None
    assert {'release', 'retirement', 'academy'} <= movements['sections'].keys()
    assert client.post("/api/partie/sauvegarder", json={"slot": "../outside"}).status_code == 422
    assert client.post("/api/monde/avancer", json={"jusqu_a":"jour"}, headers={"Origin":"https://untrusted.example"}).status_code == 403


def test_commands_are_serialized_and_idempotent(client, monkeypatch):
    service = client.app.state.game
    started, release = Event(), Event()
    def paused_save(world, slot):
        started.set()
        assert release.wait(5)
    monkeypatch.setattr(service.store, "save", paused_save)
    first = client.post("/api/partie/sauvegarder", json={"slot":"test", "commande_id":"unique-save"})
    assert started.wait(3)
    same = client.post("/api/partie/sauvegarder", json={"slot":"test", "commande_id":"unique-save"})
    assert first.json()["id"] == same.json()["id"]
    assert client.post("/api/monde/avancer", json={"jusqu_a":"jour"}).status_code == 409
    assert client.post("/api/partie/sauvegarder", json={"slot":"different", "commande_id":"unique-save"}).status_code == 409
    release.set()
    service.executor.submit(lambda: None).result(timeout=5)
    assert client.get(f'/api/travaux/{first.json()["id"]}').json()["status"] == "done"
