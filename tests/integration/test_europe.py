from collections import Counter, defaultdict
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from api.views import match_row, table
from core.domain.date import Date
from core.domain.matches import MatchResult
from core.world.calendar import Standing, standings
from core.world.cup_matches import cup_lineup
from core.world.cups import season_fixtures
from core.world.europe import (COMPETITIONS, aggregate_score, association, decide_european_winner,
                               league_fixtures, progress_europe, qualify_europe, resolve_european_quotas)
from core.world.simulation import advance_day, target_date
from core.world.validation import validate_world
from infrastructure.importation.loader import import_world
from infrastructure.persistence.store import SaveStore

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def imported(config):
    return import_world(ROOT / "data", config, 421)


def copy_world(world):
    return deepcopy(world, {id(world.config): world.config})


def complete_round(world, number):
    for cup in world.competitions.values():
        if cup.kind != "europe":
            continue
        for mid in cup.match_ids:
            match = world.matches[mid]
            if match.round_number != number:
                continue
            # The same club wins both legs: no artificial shootout needed.
            result = MatchResult(3 if match.home_id < match.away_id else 0,
                                 0 if match.home_id < match.away_id else 3, "test")
            decide_european_winner(world, match, result, [])
            match.result = result
    progress_europe(world)


def test_quota_pots_foreign_opponents_and_home_balance(imported):
    seen = set()
    resolved = resolve_european_quotas(imported, imported.season)
    for index, (cid, _, _) in enumerate(COMPETITIONS):
        cup = imported.competitions[cid]
        assert len(cup.club_ids) == 36 and not seen & set(cup.club_ids)
        seen.update(cup.club_ids)
        assert all(not imported.clubs[club].is_reserve for club in cup.club_ids)
        assert Counter(association(imported, club) for club in cup.club_ids) == {
            nation: counts[index] for nation, counts in resolved.items() if counts[index]}
        ordered = sorted(cup.club_ids, key=lambda club: (-imported.clubs[club].reputation, club))
        pots = {club: i // 9 for i, club in enumerate(ordered)}
        meetings, venues = defaultdict(list), defaultdict(Counter)
        matches = [imported.matches[mid] for mid in cup.match_ids]
        for match in matches:
            assert association(imported, match.home_id) != association(imported, match.away_id)
            meetings[match.home_id].append(match.away_id)
            meetings[match.away_id].append(match.home_id)
            venues[match.home_id][("home", pots[match.away_id])] += 1
            venues[match.away_id][("away", pots[match.home_id])] += 1
        assert len(matches) == 144
        assert Counter(m.round_number for m in matches) == {i: 18 for i in range(1, 9)}
        for club in cup.club_ids:
            assert len(meetings[club]) == len(set(meetings[club])) == 8
            assert venues[club] == {(side, pot): 1 for side in ("home", "away") for pot in range(4)}
    validate_world(imported)


@pytest.mark.parametrize("seed", [0, 1, 7, 23, 99, 2025, 8675309])
def test_draw_reproducible_for_different_seeds(imported, seed):
    world = replace(imported, seed=seed)
    for cid, _, _ in COMPETITIONS:
        cup = world.competitions[cid]
        first = league_fixtures(world, cup, world.season, world.next_id)
        assert first == league_fixtures(world, cup, world.season, world.next_id)
        for number in range(1, 9):
            ids = [club for m in first if m.round_number == number for club in (m.home_id, m.away_id)]
            assert len(ids) == len(set(ids)) == 36


@pytest.mark.parametrize("year", [2025, 2026, 2027, 2028, 2029, 2030, 2031])
def test_calendar_reserves_all_potential_rounds_in_every_division(imported, year):
    world = replace(imported, competitions=deepcopy(imported.competitions))
    fixtures = season_fixtures(world, year)
    europe_dates = world.competitions[-101].round_dates
    domestic_dates = next(c.round_dates for c in world.competitions.values() if c.kind == "cup")
    assert europe_dates[0].month == 9 and europe_dates[-1] == Date(year + 1, 5, 30)
    assert domestic_dates[-1] < europe_dates[-1]
    for competition in world.competitions.values():
        if competition.kind != "league":
            continue
        dates = {m.date for m in fixtures if m.competition_id == competition.id}
        # Covers a future domestic cup winner even in the 46-game Championship.
        all_dates = sorted(dates | set(europe_dates) | set(domestic_dates))
        assert len(all_dates) == len(dates) + len(europe_dates) + len(domestic_dates)
        assert all(b.ordinal() - a.ordinal() >= 3 for a, b in zip(all_dates, all_dates[1:]))
        assert max(dates) < domestic_dates[-1]


@pytest.mark.parametrize("winner_rank", [0, 3, 4, 5, 12, None])
def test_domestic_cup_slot_reallocation_and_lower_division_winner(imported, winner_rank):
    world = replace(imported, competitions=deepcopy(imported.competitions), champions={})
    tables = {c.id: [Standing(cid) for cid in c.club_ids if not world.clubs[cid].is_reserve]
              for c in world.competitions.values() if c.kind == "league"}
    for cup in world.competitions.values():
        if cup.kind == "cup":
            league = next(c for c in world.competitions.values() if c.kind == "league" and c.level == 1 and c.nation == cup.nation)
            world.champions[cup.id] = [(2025, tables[league.id][0].club_id)]
    ranked = [r.club_id for r in tables[16]]
    winner = ranked[winner_rank] if winner_rank is not None else world.competitions[17].club_ids[0]
    french_cup = next(c for c in world.competitions.values() if c.kind == "cup" and c.nation == "FRA")
    world.champions[french_cup.id] = [(2025, winner)]
    # Continental title holders have no extra qualification entitlement.
    world.champions[-101] = [(2025, ranked[-1])]
    c1n, c3n, c4n = resolve_european_quotas(world, 2026)["FRA"]
    qualify_europe(world, 2026, tables)
    selected = [{cid for cid in world.competitions[c].club_ids if association(world, cid) == "FRA"}
                for c in (-101, -103, -104)]
    assert selected[0] == set(ranked[:c1n])
    remaining = [cid for cid in ranked if cid not in selected[0]]
    c3 = set(remaining[:c3n]) if winner in selected[0] else {winner, *[cid for cid in remaining if cid != winner][:c3n - 1]}
    assert selected[1] == c3
    assert selected[2] == set([cid for cid in remaining if cid not in c3][:c4n])
    assert ranked[-1] not in set.union(*selected)


def test_complete_competition_seeding_resume_and_api(imported, tmp_path):
    world = copy_world(imported)
    for number in range(1, 9):
        complete_round(world, number)
    league_tables = {cid: table(world, cid) for cid, _, _ in COMPETITIONS}
    for cid, _, _ in COMPETITIONS:
        cup = world.competitions[cid]
        ranked = [row["club_id"] for row in league_tables[cid]]
        first = [world.matches[mid] for mid in cup.match_ids if world.matches[mid].round_number == 9]
        assert {m.away_id for m in first} == set(ranked[8:16])
        assert {m.home_id for m in first} == set(ranked[16:24])
        assert len(cup.match_ids) == 160
    complete_round(world, 9)
    validate_world(world)
    store = SaveStore(tmp_path)
    store.save(world, "first-legs")
    restored = store.load("first-legs")
    for candidate in (world, restored):
        for number in range(10, 18):
            complete_round(candidate, number)
            validate_world(candidate)
            if number == 10:
                for cid, _, _ in COMPETITIONS:
                    cup = candidate.competitions[cid]
                    seeds = {r["club_id"] for r in league_tables[cid][:8]}
                    legs = [candidate.matches[mid] for mid in cup.match_ids if candidate.matches[mid].round_number == 11]
                    assert {m.away_id for m in legs} == seeds
                    assert not {m.home_id for m in legs} & seeds
        progress_europe(candidate)
        for cid, _, _ in COMPETITIONS:
            cup = candidate.competitions[cid]
            assert len(cup.match_ids) == 189
            assert table(candidate, cid) == league_tables[cid]  # Knockout results never alter the league table.
            final = candidate.matches[cup.match_ids[-1]]
            assert final.neutral and final.first_leg_id is None
            assert candidate.champions[cid] == [(2025, final.result.winner_id)]
    assert world.matches == restored.matches
    assert world.champions == restored.champions
    app = create_app(ROOT, tmp_path / "api")
    app.state.game.world = restored
    states = {key: rng.getstate() for key, rng in restored.rngs.items()}
    with TestClient(app) as client:
        for cid, _, _ in COMPETITIONS:
            response = client.get(f"/api/competitions/{cid}/europe")
            assert response.status_code == 200, response.text
            data = response.json()
            assert len(data["standings"]) == 36 and data["winner"]
            assert len(data["rounds"]) == 17 and data["next_round"] is None
            assert data["rounds"][9]["items"][0]["aggregate"] is not None
            assert client.get(f"/api/competitions/{cid}/historique").json()["items"][0]["champion"] == data["winner"]
    assert states == {key: rng.getstate() for key, rng in restored.rngs.items()}


def test_aggregate_winner_can_lose_return_and_shootout_after_non_draw(imported):
    world = copy_world(imported)
    for number in range(1, 9):
        complete_round(world, number)
    cup = world.competitions[-101]
    second = next(world.matches[mid] for mid in cup.match_ids if world.matches[mid].first_leg_id)
    first = world.matches[second.first_leg_id]
    first.result = MatchResult(3, 0, "test")
    result = MatchResult(2, 0, "test")
    decide_european_winner(world, second, result, [])
    assert result.winner_id == second.away_id and not result.penalties
    assert aggregate_score(world, second, result) == (2, 3)
    # Equal aggregate despite a non-drawn return. There is no away-goals rule.
    first.result = MatchResult(2, 1, "test")
    result = MatchResult(1, 0, "test")
    lineups = [cup_lineup(world, second, cid)[0] for cid in (second.home_id, second.away_id)]
    decide_european_winner(world, second, result, lineups)
    second.result = result
    assert result.penalties and result.penalties[0] != result.penalties[1]
    assert (result.home_goals, result.away_goals) == (1, 0)
    assert match_row(world, second)["aggregate"] == (2, 2)
    from core.world.europe_validation import validate_european_result
    validate_european_result(world, second)


def test_live_european_matchday_temporary_players_and_save(imported, tmp_path):
    world = copy_world(imported)
    date = world.competitions[-101].round_dates[0]
    world.date = date.add_days(-1)
    assert target_date(world, "journee") == date
    advance_day(world)
    matches = [m for m in world.matches.values() if m.date == date]
    assert len(matches) == 54 and all(m.result for m in matches)
    assert all(m.result.winner_id is None and not m.result.penalties for m in matches)
    assert any(m.result.temporary_players for m in matches)
    assert all(row.player_id >= 0 for row in world.records.values())
    validate_world(world)
    store = SaveStore(tmp_path)
    store.save(world, "matchday")
    restored = store.load("matchday")
    assert restored.matches == world.matches and restored.european_quota_ranges == world.european_quota_ranges
