from collections import Counter
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from api.views import career, match_detail
from benchmarks.fixtures import synthetic_lineup
from core.domain.date import Date
from core.domain.matches import MatchResult, MatchEvent
from core.domain.world import SeasonRecord
from core.engine.match import PossessionEngine
from core.randomness import stream
from core.world.application import apply
from core.world.cup_matches import cup_lineup, decide_winner
from core.world.cups import participants, progress_cups
from core.world.player_states import match_event
from core.world.simulation import advance_day, target_date
from core.world.validation import validate_world
from infrastructure.importation.loader import import_world
from infrastructure.importation.readers import reserve_team
from infrastructure.persistence.store import SaveStore

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def imported(config):
    return import_world(ROOT / "data", config, 947)


def test_eligibility_and_all_reserved_dates(imported):
    cups = [c for c in imported.competitions.values() if c.kind == "cup"]
    assert {c.nation for c in cups} == {"FRA", "ENG", "ESP", "GER", "ITA"}
    for cup in cups:
        assert len(cup.club_ids) == len(set(cup.club_ids)) == 64
        assert not any(imported.clubs[cid].is_reserve for cid in cup.club_ids)
        mandatory = {cid for league in imported.competitions.values()
                     if league.kind == "league" and league.nation == cup.nation and league.level <= 2
                     for cid in league.club_ids if not imported.clubs[cid].is_reserve}
        assert mandatory <= set(cup.club_ids)
        assert participants(imported, cup, imported.season) == cup.club_ids
        assert cup.round_dates[0].month == 12 and cup.round_dates[-1] == Date(2026, 5, 27)
        for league in imported.competitions.values():
            if league.kind != "league" or league.nation != cup.nation:
                continue
            dates = sorted({imported.matches[mid].date for mid in league.match_ids})
            assert all(b.ordinal() - a.ordinal() >= 3 for a, b in zip(dates, dates[1:]))
            assert all(abs(day.ordinal() - cup_day.ordinal()) >= 3 for day in dates for cup_day in cup.round_dates)
            assert max(dates) < cup.round_dates[-1]
    england = next(c for c in cups if c.nation == "ENG")
    spain = next(c for c in cups if c.nation == "ESP")
    assert {625, 724, 741} <= set(england.club_ids)  # Welsh clubs in English leagues.
    assert 1709 in spain.club_ids  # Andorra.
    assert imported.clubs[1743].is_reserve and imported.clubs[1737].is_reserve
    assert not {1743, 1737} & set(spain.club_ids)


def test_match_only_players_and_archived_identity(imported, tmp_path):
    world = deepcopy(imported, {id(imported.config): imported.config})
    cup = next(c for c in world.competitions.values() if c.kind == "cup")
    match = world.matches[cup.match_ids[0]]
    world.date = match.date
    # Simulate two unavailable squads without deleting the real players.
    for cid in (match.home_id, match.away_id):
        for pid in world.clubs[cid].player_ids:
            from core.domain.players import Discipline
            world.players[pid].discipline[cup.id] = Discipline(suspended_matches=1)
    before = (len(world.players), len(world.transfers), {cid: list(world.clubs[cid].player_ids) for cid in (match.home_id, match.away_id)})
    home, ht = cup_lineup(world, match, match.home_id)
    away, at = cup_lineup(world, match, match.away_id)
    assert len(home.slots) == len(away.slots) == 11
    assert len(ht) == len(at) == 11 and not set(ht) & set(at)
    assert cup_lineup(world, match, match.home_id) == (home, ht)
    result = PossessionEngine().simulate(home, away, world.config, stream(19))
    result.temporary_players = {**ht, **at}
    result.home_goals = result.away_goals = 1  # Exercise shootout persistence explicitly.
    decide_winner(world, match, result, [home, away])
    apply(world, match_event(world, match, result))
    assert result.penalties[0] != result.penalties[1]
    assert not world.records  # Reinforcements never enter season/career statistics.
    assert before == (len(world.players), len(world.transfers), {cid: list(world.clubs[cid].player_ids) for cid in (match.home_id, match.away_id)})
    validate_world(world)
    store = SaveStore(tmp_path)
    store.save(world, "cup")
    restored = store.load("cup")
    assert restored.matches[match.id].result == result
    detail = match_detail(restored, restored.matches[match.id])
    assert all(p["temporary"] and p["name"] for p in detail["result"]["home_lineup"])
    assert all(e["player"] for e in detail["result"]["events"] if e["player_id"] is not None)
    assert all(pid < 0 for pid in result.temporary_players)


def test_live_round_advance_and_resume(imported, tmp_path):
    world = deepcopy(imported, {id(imported.config): imported.config})
    cups = [c for c in world.competitions.values() if c.kind == "cup"]
    date = cups[0].round_dates[0]
    world.date = date.add_days(-1)
    assert target_date(world, "journee") == date
    advance_day(world)
    for cup in cups:
        counts = Counter(world.matches[mid].round_number for mid in cup.match_ids)
        assert counts == {1: 32, 2: 16}
        first = [world.matches[mid] for mid in cup.match_ids if world.matches[mid].round_number == 1]
        assert all(m.result and m.result.winner_id for m in first)
    validate_world(world)
    store = SaveStore(tmp_path)
    store.save(world, "round")
    restored = store.load("round")
    assert restored.competitions == world.competitions
    assert restored.matches == world.matches
    # All remaining rounds use controlled scores: test every draw, title and archive.
    for candidate in (world, restored):
        for number in range(2, 7):
            for cup in [c for c in candidate.competitions.values() if c.kind == "cup"]:
                for mid in list(cup.match_ids):
                    match = candidate.matches[mid]
                    if match.round_number == number:
                        match.result = MatchResult(0, 0, "test", penalties=(5, 4), winner_id=match.home_id)
            progress_cups(candidate)
        progress_cups(candidate)  # Idempotent winner recording.
        validate_world(candidate)
        for cup in [c for c in candidate.competitions.values() if c.kind == "cup"]:
            assert len(cup.match_ids) == 63
            assert Counter(candidate.matches[mid].round_number for mid in cup.match_ids) == {1: 32, 2: 16, 3: 8, 4: 4, 5: 2, 6: 1}
            final = candidate.matches[cup.match_ids[-1]]
            assert final.neutral and candidate.champions[cup.id] == [(2025, final.result.winner_id)]
    assert world.matches == restored.matches and world.champions == restored.champions
    app = create_app(ROOT, tmp_path / "api")
    app.state.game.world = restored
    with TestClient(app) as client:
        cup = cups[0]
        data = client.get(f"/api/competitions/{cup.id}/coupe").json()
        assert data["latest_round"] == 6 and data["winner"]
        assert len(data["rounds"][0]["items"]) == 32  # No pagination dropping two matches.
        assert client.get(f"/api/competitions/{cup.id}/historique").json()["items"][0]["champion"] == data["winner"]
        assert client.get(f"/api/competitions/{cup.id}/classement").json()["items"] == []


def test_shootout_excludes_substituted_sent_off_and_injured(imported):
    world = imported
    cup = next(c for c in world.competitions.values() if c.kind == "cup")
    match = world.matches[cup.match_ids[0]]
    home = synthetic_lineup(world.config, match.home_id)
    away = synthetic_lineup(world.config, match.away_id)
    outgoing, injured, sent_off = [home.slots[i].player.id for i in (1, 2, 3)]
    replacement = home.bench[0].id
    result = MatchResult(0, 0, "test", events=[
        MatchEvent(100, 1, 0, "substitution", home.club_id, outgoing, replacement),
        MatchEvent(200, 1, 1, "injury", home.club_id, injured),
        MatchEvent(300, 1, 2, "red", home.club_id, sent_off)])
    decide_winner(world, match, result, [home, away])
    kicks = [e for e in result.events if e.period == 3]
    assert not {outgoing, injured, sent_off} & {e.player_id for e in kicks}
    assert result.penalties[0] != result.penalties[1]
    assert result.home_goals == result.away_goals == 0
    assert not result.player_stats  # Shootouts do not add goals or player ratings.


def test_career_keeps_league_and_cup_statistics(imported):
    world = deepcopy(imported, {id(imported.config): imported.config})
    player = next(p for p in world.players.values() if p.club_id == 868)
    cup = next(c for c in world.competitions.values() if c.kind == "cup" and c.nation == "FRA")
    world.records = {"league": SeasonRecord(2025, player.id, 868, 16, matches=4, goals=2, rating_sum=28, rating_count=4),
                     "cup": SeasonRecord(2025, player.id, 868, cup.id, matches=2, goals=3, rating_sum=16, rating_count=2)}
    data = career(world, player.id)
    row = data["items"][0]
    assert row["matches"] == 6 and row["goals"] == 5 and row["average"] == 7.33
    assert "Ligue 1" in row["competition"] and cup.name in row["competition"]


def test_reserve_identification():
    for uid, name, parent in [("1", "Club B", "1"), ("2", "Club II", "2"), ("1737", "Castilla", "1737"), ("3", "Other", "4")]:
        assert reserve_team({"UID": uid, "Name": name, "MainTeamUID": parent})
    assert not reserve_team({"UID": "5", "Name": "FC Schalke 04", "MainTeamUID": "5"})


def test_reinforcement_level_and_missing_keeper(imported):
    cup = next(c for c in imported.competitions.values() if c.kind == "cup")
    match = imported.matches[cup.match_ids[0]]
    club = max((imported.clubs[cid] for cid in (match.home_id, match.away_id)), key=lambda c: len(c.player_ids))
    world = replace(imported, clubs={**imported.clubs, club.id: replace(club, player_ids=[], reputation=40)})
    lineup, temporary = cup_lineup(world, match, club.id)
    assert len(temporary) == 11
    assert all(37 <= slot.player.rating <= 43 for slot in lineup.slots)
    # Eleven real outfield players still require a temporary goalkeeper.
    outfield = [pid for pid in club.player_ids if imported.players[pid].position != "GB"][:11]
    assert len(outfield) == 11
    world.clubs[club.id].player_ids = outfield
    lineup, temporary = cup_lineup(world, match, club.id)
    assert len(temporary) == 1 and len(lineup.slots) == 11
    mean_level = sum(imported.players[pid].rating for pid in outfield) / 11
    reinforcement = next(slot.player for slot in lineup.slots if slot.player.id in temporary)
    assert reinforcement.position == "GB" and abs(reinforcement.rating - mean_level) <= 3
    assert imported.clubs[club.id].player_ids == club.player_ids
