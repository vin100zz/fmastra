import time
from pathlib import Path
from threading import Event, Thread

import pytest
from fastapi.testclient import TestClient

from api import views as v
from api.app import create_app
from api.nations import build_nation_table
from core.domain.players import Discipline, Injury
from core.world.simulation import advance_day, target_date
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
    routes = ["/monde/etat", "/monde/journal", "/monde/palmares", "/partie/rapport-import", "/partie/slots", "/clubs", "/clubs?statut=dormant&page=2", "/competitions",
              f"/clubs/{club_id}", *[f"/clubs/{club_id}/{section}" for section in ("effectif", "calendrier", "finances", "transferts", "historique", "apercu")],
              *[f"/competitions/{league_id}/{section}" for section in ("classement", "calendrier", "statistiques", "historique")],
              "/joueurs?page=2", "/joueurs?tri=contract_end&ordre=asc", f"/joueurs/{player_id}", f"/joueurs/{player_id}/historique", f"/matches/{match_id}"]
    for route in routes:
        response = client.get("/api" + route)
        assert response.status_code == 200, (route, response.text)
    for competition_id in (league_id, next(c.id for c in world.competitions.values() if c.kind == "cup"), next(c.id for c in world.competitions.values() if c.kind == "europe")):
        leaders = client.get(f"/api/competitions/{competition_id}/historique").json()["leaders"]
        assert set(leaders) == {"matches", "goals"} and len(leaders["matches"]) <= 15 and len(leaders["goals"]) <= 15
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


def test_honours_show_every_competition_with_the_champions_of_all_seasons(client, monkeypatch):
    world = client.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    data = client.get('/api/monde/palmares').json()
    blocks = data['europe'] + [item for country in data['countries'] for item in country['competitions']]
    assert [item['code'] for item in data['europe']] == ['C1', 'C3', 'C4']
    assert sorted(item['id'] for item in blocks) == sorted(world.competitions)
    assert {country['code'] for country in data['countries']} == {'FRA', 'ENG', 'ESP', 'ITA', 'GER'}
    assert all(item['items'] == [] for item in blocks)
    france = next(country for country in data['countries'] if country['code'] == 'FRA')
    assert [(item['name'], item['kind']) for item in france['competitions']] == [
        ('Ligue 1', 'league'), ('Ligue 2', 'league'), ('National', 'league'), ('Coupe de France', 'cup')]
    first, second = (club.id for club in list(world.clubs.values())[:2])
    division = next(item['id'] for item in france['competitions'] if item['name'] == 'Ligue 1')
    monkeypatch.setitem(world.champions, division, [(2025, first), (2026, second)])
    monkeypatch.setitem(world.champions, -101, [(2025, second)])
    data = client.get('/api/monde/palmares').json()
    top = next(item for country in data['countries'] for item in country['competitions'] if item['id'] == division)
    assert [(row['season'], row['champion']['id']) for row in top['items']] == [(2026, second), (2025, first)]
    assert [(row['season'], row['champion']['id']) for row in data['europe'][0]['items']] == [(2025, second)]
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


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


@pytest.fixture(scope="module")
def played(config, tmp_path_factory):
    """A world where the first active club has played six matches, so it has a last five to show."""
    app = create_app(ROOT, tmp_path_factory.mktemp("api-played"))
    world = import_world(ROOT / "data", config, 779)
    club_id = next(iter(world.active_clubs())).id
    while sum(match.result is not None and club_id in (match.home_id, match.away_id) for match in world.matches.values()) < 6:
        destination = target_date(world, "journee")
        while world.date < destination: advance_day(world)
    app.state.game.world = world
    with TestClient(app) as client:
        yield client


def test_club_overview_summarises_calendar_finances_transfers_and_last_lineup(played):
    world = played.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    club = next(iter(world.active_clubs()))
    overview = played.get(f"/api/clubs/{club.id}/apercu").json()
    last, coming = overview["calendar"]["last"], overview["calendar"]["next"]
    assert len(last) == 5 and len(coming) == 3
    assert all(row["score"] and club.id in (row["home"]["id"], row["away"]["id"]) for row in last)
    assert [row["date"] for row in last] == sorted((row["date"] for row in last), reverse=True)
    assert all(row["score"] is None and row["date"] >= world.date.iso() for row in coming)
    assert [row["date"] for row in coming] == sorted(row["date"] for row in coming)
    for row in last:
        home = row["home"]["id"] == club.id
        goals, conceded = row["score"] if home else row["score"][::-1]
        assert row["outcome"] == ("V" if goals > conceded else "D" if goals < conceded else "N")
    finances = played.get(f"/api/clubs/{club.id}/finances").json()
    assert overview["finances"] == {key: finances[key] for key in overview["finances"]}
    assert {"transfer_budget", "reserved_transfer_budget", "wage_bill", "wage_cap"} <= overview["finances"].keys()
    movements = played.get(f"/api/clubs/{club.id}/transferts").json()["sections"]
    assert overview["transfers"]["season"] == world.season
    for side in ("arrivals", "departures"):
        assert overview["transfers"][side]["count"] == len(movements[side])
        assert overview["transfers"][side]["items"] == movements[side][:len(overview["transfers"][side]["items"])]
    assert overview["transfers"]["others"] == {kind: len(movements[kind]) for kind in ("academy", "release", "retirement")}
    lineup = overview["lineup"]
    assert lineup["match"]["id"] == last[0]["id"] and len(lineup["players"]) == 11
    detail = played.get(f"/api/matches/{lineup['match']['id']}").json()["result"]
    assert lineup["players"] == detail[f"{lineup['side']}_lineup"]
    assert played.get("/api/clubs/999999999/apercu").status_code == 404
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


def test_club_overview_before_any_match_has_no_lineup(client):
    world = client.app.state.game.world
    club = next(iter(world.active_clubs()))
    overview = client.get(f"/api/clubs/{club.id}/apercu").json()
    assert overview["calendar"]["last"] == [] and len(overview["calendar"]["next"]) == 3
    assert overview["lineup"] is None


def test_squad_sorts_by_what_each_column_shows(played):
    world = played.app.state.game.world
    club = world.clubs[next(iter(world.active_clubs())).id]
    hurt, banned = (world.players[player_id] for player_id in club.player_ids[:2])
    hurt.injury = Injury(world.date, world.date.add_days(20), "minor")
    banned.discipline[club.competition_id] = Discipline(suspended_matches=2)
    def rows(sort, order="asc"):
        return played.get(f"/api/clubs/{club.id}/effectif?tri={sort}&ordre={order}").json()["items"]
    condition = rows("fitness")
    assert [row["id"] for row in condition[:2]] == [hurt.id, banned.id]
    assert [row["fitness"] for row in condition[2:]] == sorted(row["fitness"] for row in condition[2:])
    assert [row["id"] for row in rows("fitness", "desc")][-2:] == [banned.id, hurt.id]
    accented, plain = (world.players[player_id] for player_id in club.player_ids[2:4])
    accented.name, plain.name = "Élie Test", "Zack Test"
    names = [row["name"] for row in rows("name")]
    assert names == sorted(names, key=v.normalized) and names.index("Élie Test") < names.index("Zack Test")
    codes = build_nation_table(world.nation_names)
    nations = [[codes[code]["display_code"] for code in row["nationalities"]] for row in rows("nation")]
    assert nations == sorted(nations)
    for sort in ("position", "age", "rating", "potential", "value", "wage", "contract_end", "appearances", "goals", "assists", "yellows", "reds", "average"):
        assert played.get(f"/api/clubs/{club.id}/effectif?tri={sort}&ordre=desc").status_code == 200


def test_clubs_navigate_within_their_division_or_else_their_country(client):
    world = client.app.state.game.world
    playing = next(club for club in world.clubs.values() if club.competition_id == 16)
    data = client.get(f"/api/clubs/{playing.id}/navigation").json()
    names = [item["name"] for item in data["items"]]
    assert data["scope"] == {"kind": "division", "id": 16, "name": "Ligue 1"} and data["total"] == len(names) == 18
    assert names == sorted(names, key=v.normalized) and data["items"][data["index"]]["id"] == playing.id
    assert {item["id"] for item in data["items"]} == set(world.competitions[16].club_ids)
    # Stepping forward from the first club visits the whole division once.
    visited, step = [], data["items"][0]["id"]
    while step is not None:
        visited.append(step)
        step = (client.get(f"/api/clubs/{step}/navigation").json()["next"] or {}).get("id")
    assert visited == [item["id"] for item in data["items"]]
    dormant = next(club for club in world.clubs.values() if club.competition_id is None)
    data = client.get(f"/api/clubs/{dormant.id}/navigation").json()
    country = [club for club in world.clubs.values() if club.nation == dormant.nation]
    assert data["scope"]["kind"] == "country" and data["scope"]["code"] == dormant.nation and data["total"] == len(country)
    assert {item["id"] for item in data["items"]} == {club.id for club in country}
    assert client.get("/api/clubs/999999/navigation").status_code == 404


def test_players_navigate_within_their_club_and_retirees_have_none(client):
    world = client.app.state.game.world
    club = next(iter(world.active_clubs()))
    member = world.players[club.player_ids[5]]
    data = client.get(f"/api/joueurs/{member.id}/navigation").json()
    assert data["scope"] == {"kind": "club", "id": club.id, "name": club.name} and data["total"] == len(club.player_ids)
    assert {item["id"] for item in data["items"]} == set(club.player_ids)
    assert data["items"][data["index"]] == {"id": member.id, "name": member.name, "position": member.position.value}
    assert data["items"][0]["position"] == "GB"
    free_agent = next(player for player in world.players.values() if player.club_id is None)
    assert client.get(f"/api/joueurs/{free_agent.id}/navigation").json() is None
    world.retired[987654] = "Ancien Joueur"
    try:
        assert client.get("/api/joueurs/987654/navigation").json() is None
    finally:
        del world.retired[987654]
    assert client.get("/api/joueurs/999999/navigation").status_code == 404


def test_competitions_navigate_within_their_country(client):
    world = client.app.state.game.world
    league = next(item for item in world.competitions.values() if item.nation == "FRA" and item.level == 1)
    data = client.get(f"/api/competitions/{league.id}/navigation").json()
    assert [item["name"] for item in data["items"]] == ["Ligue 1", "Ligue 2", "National", "Coupe de France"]
    assert data["scope"]["code"] == "FRA" and data["previous"] is None and data["next"]["name"] == "Ligue 2"
    cup = next(item for item in data["items"] if item["kind"] == "cup")
    ending = client.get(f"/api/competitions/{cup['id']}/navigation").json()
    assert ending["previous"]["name"] == "National" and ending["next"] is None and ending["items"] == data["items"]
    assert client.get("/api/competitions/999999/navigation").status_code == 404
