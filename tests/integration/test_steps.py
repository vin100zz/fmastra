import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from core.domain.date import Date
from core.world.human import record
from core.world.simulation import advance_day
from core.world.steps import STEP_DAYS, day_results, european_cup, followed_competitions, key_date, needs_attention, step_over
from infrastructure.importation.loader import import_world

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def world(config):
    world = import_world(ROOT / "data", config, 2025)
    world.controlled_club_id = next(club.id for club in world.clubs.values() if club.name == "Marseille")
    return world


def test_key_dates_are_the_new_season_and_the_eve_of_each_window_closing(world):
    assert [day for day in (Date(2026, 7, 1), Date(2026, 8, 30), Date(2027, 1, 30)) if key_date(world, day)] == [
        Date(2026, 7, 1), Date(2026, 8, 30), Date(2027, 1, 30)]
    assert not any(key_date(world, day) for day in (Date(2026, 7, 2), Date(2026, 8, 31), Date(2027, 1, 31), Date(2026, 12, 24)))


def test_only_decisions_call_for_attention(world):
    start = len(world.news)
    record(world, "injury", "A est blessé", world.controlled_club_id)
    assert not needs_attention(world, start)
    record(world, "offer_received", "B propose 1000000 € pour C", world.controlled_club_id)
    assert needs_attention(world, start) and not needs_attention(world, len(world.news))
    del world.news[start:]


def test_the_european_cup_shown_is_the_clubs_own_or_else_the_champions_league(world):
    cups = {c.code: c for c in world.competitions.values() if c.kind == "europe"}
    assert not any(world.controlled_club_id in cup.club_ids for cup in cups.values())
    assert european_cup(world) == cups["C1"].id
    cups["C3"].club_ids.append(world.controlled_club_id)
    try:
        assert european_cup(world) == cups["C3"].id
    finally:
        cups["C3"].club_ids.remove(world.controlled_club_id)


def test_continuer_stops_on_every_day_the_club_follows_and_never_goes_past_a_week(world):
    """From the opening of the game to the first European evening: the summer weeks, the club's first league days,
    the eve of the transfer deadline and the September international window."""
    league = world.clubs[world.controlled_club_id].competition_id
    followed = followed_competitions(world)
    assert league in followed and all(world.competitions[cid].kind in ("league", "cup", "europe") for cid in followed)
    assert {world.competitions[cid].nation for cid in followed if world.competitions[cid].kind == "cup"} == {world.competitions[league].nation}
    days = {}
    while world.date < Date(2026, 9, 17):
        start, news_from = world.date, len(world.news)
        while True:
            assert advance_day(world, auto=True)
            if step_over(world, start, news_from):
                break
            # A day goes by without a stop only when nothing the club follows was played: other divisions or countries at most.
            assert not {m.competition_id for m in world.matches.values() if m.date == world.date and m.result is not None} & followed
            assert not any(m.date == world.date and m.result is not None for m in world.international.matches.values())
        assert world.date.ordinal() - start.ordinal() <= STEP_DAYS
        days[world.date] = day_results(world)
    assert days[Date(2026, 8, 30)] is None  # the eve of the deadline, nothing played
    assert days[Date(2026, 9, 3)] == ("international", 2028)
    assert days[Date(2026, 9, 16)] == ("club", european_cup(world))
    league_days = sorted({m.date for m in world.matches.values() if m.competition_id == league and m.date <= world.date})
    assert league_days and all(days[day] == ("club", league) for day in league_days)


def test_the_api_step_pauses_on_the_clubs_match_day_with_the_round_to_show(config, tmp_path):
    app = create_app(ROOT, tmp_path)
    world = import_world(ROOT / "data", config, 2025)
    app.state.game.world = world
    with TestClient(app) as client:
        club_id = next(iter(world.active_clubs())).id
        assert client.post("/api/partie/choisir-club", json={"club_id": club_id}).status_code == 200
        assert client.get("/api/monde/etat").json()["news_count"] == len(world.news)
        for _ in range(20):
            job = client.post("/api/monde/avancer", json={"jusqu_a": "etape"}).json()
            deadline = time.monotonic() + 120
            while (job := client.get(f"/api/travaux/{job['id']}").json())["status"] in ("queued", "running"):
                assert time.monotonic() < deadline
                time.sleep(0.05)
            while client.get("/api/monde/etat").json()["job"]: time.sleep(0.05)
            if job["status"] == "awaiting_lineup":
                break
            assert job["status"] == "done", job
            results = day_results(world)
            expected = None if results is None else (
                {"kind": "international", "year": results[1]} if results[0] == "international" else
                {"kind": world.competitions[results[1]].kind, "id": results[1], "code": world.competitions[results[1]].code})
            assert job["competition"] == expected
        else:
            pytest.fail("Le club n'a pas eu de match en 20 étapes.")
        match = world.matches[client.get("/api/monde/etat").json()["awaiting_lineup"]]
        competition = world.competitions[match.competition_id]
        assert job["competition"] == {"kind": competition.kind, "id": competition.id, "code": competition.code}
        assert match.date == world.date and match.result is None
