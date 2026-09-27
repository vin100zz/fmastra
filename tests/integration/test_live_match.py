from pathlib import Path

import pytest

from core.ai.selection import LineupContext, select_lineup
from core.domain.matches import LiveOrder, SubmittedLineup
from core.world.live import build_live_match, finish_live_match, give_orders, live_side, next_segment, start_live_match
from core.world.simulation import advance_day
from infrastructure.importation.loader import import_world
from infrastructure.persistence.store import SaveStore

ROOT = Path(__file__).resolve().parents[2]


def paused_world(config):
    """A new game whose human club has a match today, its lineup submitted."""
    world = import_world(ROOT / "data", config, 777)
    world.controlled_club_id = next(iter(world.active_clubs())).id
    for _ in range(400):
        if not advance_day(world):
            break
    match = next(match for match in world.matches.values() if match.date == world.date and match.result is None
                 and world.controlled_club_id in (match.home_id, match.away_id))
    context = LineupContext.from_world(world, world.controlled_club_id, match.competition_id, world.date)
    suggestion = select_lineup(context, world.config)
    world.submitted_lineups[match.id] = SubmittedLineup(world.controlled_club_id, suggestion.formation,
        [(slot.player.id, slot.position) for slot in suggestion.slots], [player.id for player in suggestion.bench])
    return world, match


def test_a_live_day_plays_the_others_first_then_the_human_match_with_its_orders(config, tmp_path):
    world, match = paused_world(config)
    live = start_live_match(world)
    today = [other for other in world.matches.values() if other.date == world.date]
    assert all(other.result is not None for other in today if other.id != match.id) and match.result is None
    assert advance_day(world) is False  # the day waits for the live match

    side = live_side(world, match)
    team = live.teams[side]
    while live.status != "halftime":
        next_segment(world, live)
    live = give_orders(world, live, [LiveOrder(0, False, "substitution", team.active[4].player.id, team.bench[3].id, team.active[4].position.value)])
    team = live.teams[side]
    assert team.substituted == 1 and team.windows == 0

    # Stopped between two chances: the part computed but not shown is replayed with the new orders.
    for _ in range(3):
        next_segment(world, live)
    floor, reached = world.live_match.floor, world.live_match.reached
    events = next_segment(world, live)
    middle = (events[0].second + events[-1].second) / 2
    live = give_orders(world, live, [LiveOrder(0, False, "mentality", mentality="offensive")], second=middle)
    assert reached <= live.log.possession <= world.live_match.reached
    assert live.teams[side].mentality == "offensive"

    rebuilt = build_live_match(world)
    assert rebuilt.log.events == live.log.events and rebuilt.log.possession == live.log.possession

    store = SaveStore(tmp_path)
    store.save(world, "live")
    reloaded = store.load("live")
    assert build_live_match(reloaded).log.events == live.log.events

    while not live.finished:
        next_segment(world, live)
    finish_live_match(world, live)
    assert match.result is not None and world.live_match is None and world.pending_match_day is None
    assert [event.kind for event in match.result.events if event.kind == "substitution" and event.team_id == world.controlled_club_id]


def test_the_other_results_do_not_depend_on_the_human_match_being_played_live(config):
    world, match = paused_world(config)
    start_live_match(world)
    auto, _ = paused_world(config)
    assert advance_day(auto, auto=True)
    for other in world.matches.values():
        if other.date == world.date and other.id != match.id:
            twin = auto.matches[other.id]
            assert (other.result.home_goals, other.result.away_goals) == (twin.result.home_goals, twin.result.away_goals)


def test_a_refused_order_changes_nothing(config):
    world, match = paused_world(config)
    live = start_live_match(world)
    next_segment(world, live)
    with pytest.raises(ValueError):
        give_orders(world, live, [LiveOrder(0, False, "mentality", mentality="kamikaze")])
    assert world.live_match.orders == []


def test_the_live_api_from_kick_off_to_the_end_of_the_day(config, tmp_path):
    import time
    from fastapi.testclient import TestClient
    from api.app import create_app
    app = create_app(ROOT, tmp_path)
    world, match = paused_world(config)
    app.state.game.world = world
    with TestClient(app) as client:
        def wait(job):
            while (job := client.get(f"/api/travaux/{job['id']}").json())["status"] not in ("done", "failed"):
                time.sleep(0.1)
            assert job["status"] == "done", job
        assert client.get("/api/direct").status_code == 409
        wait(client.post("/api/direct/demarrer", json={}).json())
        assert client.get("/api/monde/etat").json()["live_match_id"] == match.id
        assert client.post("/api/monde/avancer", json={"jusqu_a": "jour"}).status_code == 409
        states = {key: rng.getstate() for key, rng in world.rngs.items()}

        opening = client.get("/api/direct").json()
        manager = opening["manager"]
        assert opening["status"] == "playing" and len(manager["active"]) == 11 and manager["windows_left"] == 3
        while (segment := client.post("/api/direct/avancer", json={}).json())["status"] != "halftime":
            assert segment["result"]["events"]
        out, into = manager["active"][6], manager["bench"][4]
        changed = client.post("/api/direct/ordres", json={"ordres": [
            {"type": "remplacement", "sortant": out["id"], "entrant": into["id"], "poste": out["position"]},
            {"type": "mentalite", "mentalite": "defensive"}]}).json()
        kinds = [event["kind"] for event in changed["result"]["events"]]
        assert kinds[-1] == "substitution" and "period_end" in kinds  # the whole match: the screen resyncs on it
        assert changed["manager"]["windows_left"] == 3 and changed["manager"]["substitutions_left"] == 4
        refused = client.post("/api/direct/ordres", json={"ordres": [{"type": "remplacement", "sortant": out["id"], "entrant": into["id"], "poste": "MC"}]})
        assert refused.status_code == 400 and refused.json()["detail"]
        assert client.post("/api/direct/terminer", json={}).status_code == 400
        others = client.get("/api/direct/multiplex").json()
        assert others["matches"] and all(game["final"] is not None for game in others["matches"])
        final = client.post("/api/direct/avancer", json={"jusqu_a": "fin"}).json()
        assert final["status"] == "finished"
        assert {key: rng.getstate() for key, rng in world.rngs.items()} == states

        wait(client.post("/api/direct/terminer", json={}).json())
        assert client.get("/api/monde/etat").json()["live_match_id"] is None
        assert world.matches[match.id].result is not None and world.pending_match_day is None
