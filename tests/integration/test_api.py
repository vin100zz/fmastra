import time
from pathlib import Path
from threading import Event, Thread

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


def test_player_lists_and_profiles_show_exact_potential_and_sort_by_it(client):
    world = client.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    club_id = next(iter(world.active_clubs())).id
    squad = client.get(f'/api/clubs/{club_id}/effectif?tri=potential&ordre=desc').json()['items']
    assert squad and all(row['potential'] == round(world.players[row['id']].potential, 1) for row in squad)
    assert 'potential_estimate' not in squad[0]
    assert [row['potential'] for row in squad] == sorted((row['potential'] for row in squad), reverse=True)
    ascending = client.get('/api/joueurs?tri=potential&ordre=asc').json()['items']
    assert [row['potential'] for row in ascending] == sorted(row['potential'] for row in ascending)
    top = client.get('/api/joueurs?tri=potential&ordre=desc').json()['items']
    assert top[0]['potential'] == max(round(player.potential, 1) for player in world.players.values())
    player = world.players[squad[0]['id']]
    detail = client.get(f'/api/joueurs/{player.id}').json()
    assert detail['potential'] == round(player.potential, 1) and detail['rating'] <= detail['potential']
    assert 'potential_estimate' not in detail and 'source_potential_ability' not in detail
    assert client.get('/api/joueurs?tri=invalid').status_code == 422
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


def test_views_pagination_and_no_rng_leak(client):
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
    for kind, sort in (('transfer', 'fee'), ('retirement', 'name'), ('academy', 'potential')):
        data = client.get(f'/api/monde/transferts?type={kind}&tri={sort}&ordre=asc').json()
        assert data['sort'] == sort and data['order'] == 'asc'
    assert client.get('/api/monde/transferts?tri=invalid').status_code == 422
    assert client.get('/api/monde/transferts?ordre=invalid').status_code == 422
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


def test_delete_slot(client):
    service = client.app.state.game
    service.store.save(service.world, "to-delete")
    assert any(row["slot"] == "to-delete" for row in client.get("/api/partie/slots").json())
    response = client.post("/api/partie/supprimer", json={"slot": "to-delete"})
    assert response.status_code == 200 and response.json() == {"slot": "to-delete"}
    assert not any(row["slot"] == "to-delete" for row in client.get("/api/partie/slots").json())
    assert client.post("/api/partie/supprimer", json={"slot": "to-delete"}).status_code == 400
    assert client.post("/api/partie/supprimer", json={"slot": "../outside"}).status_code == 422


def wait_until(predicate, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate(): return True
        time.sleep(0.02)
    return False


def test_auto_mode_runs_on_the_server_until_stopped(client, monkeypatch):
    service = client.app.state.game
    saves = []
    monkeypatch.setattr(service.store, "save", lambda world, slot: saves.append((slot, world.date.iso())))
    monkeypatch.setattr(service, "auto_delay", 0)
    start_date = service.world.date
    assert client.get("/api/monde/etat").json()["auto"] == {"running": False, "stopping": False, "job": None}
    assert client.post("/api/monde/auto/arreter").json()["running"] is False  # stopping nothing is harmless

    started = client.post("/api/monde/auto/demarrer", json={"commande_id": "auto-1"})
    assert started.status_code == 202
    job_id = started.json()["id"]
    assert client.post("/api/monde/auto/demarrer", json={"commande_id": "auto-1"}).json()["id"] == job_id
    assert client.post("/api/monde/auto/demarrer", json={"commande_id": "auto-2"}).status_code == 409
    assert client.post("/api/monde/avancer", json={"jusqu_a": "jour"}).status_code == 409
    assert client.post("/api/partie/sauvegarder", json={"slot": "during-auto"}).status_code == 409

    assert wait_until(lambda: service.jobs[job_id].date is not None)
    assert client.get("/api/monde/etat").json()["auto"] == {"running": True, "stopping": False, "job": job_id}
    assert client.get("/api/clubs").status_code == 200  # other screens stay reachable while the world advances

    stopping = client.post("/api/monde/auto/arreter").json()
    assert stopping == {"running": True, "stopping": True, "job": job_id}
    assert client.post("/api/monde/auto/arreter").json() == stopping
    assert wait_until(lambda: service.jobs[job_id].status == "done" and service.active is None)

    assert service.jobs[job_id].error is None and not service.recovery_required
    assert client.get("/api/monde/etat").json()["auto"]["running"] is False
    assert service.world.date.ordinal() > start_date.ordinal()
    assert saves and saves[-1] == ("autosave", service.world.date.iso())
    assert client.post("/api/monde/avancer", json={"jusqu_a": "jour"}).status_code == 202  # commands are accepted again
    assert wait_until(lambda: service.active is None)


def test_closing_the_service_ends_a_running_auto_job(config, tmp_path, monkeypatch):
    app = create_app(ROOT, tmp_path)
    service = app.state.game
    service.world = import_world(ROOT / "data", config, 778)
    monkeypatch.setattr(service, "auto_delay", 0)
    client = TestClient(app)
    job_id = client.post("/api/monde/auto/demarrer", json={}).json()["id"]
    assert wait_until(lambda: service.jobs[job_id].date is not None)
    closer = Thread(target=service.close)
    closer.start()
    try:
        closer.join(30)
        assert not closer.is_alive()
    finally:
        service.auto_stop.set()  # a regression must fail this test, not leave the simulation thread running
        closer.join(30)
    assert service.jobs[job_id].status == "done"
