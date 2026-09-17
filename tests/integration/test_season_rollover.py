from dataclasses import fields
from pathlib import Path

from fastapi.testclient import TestClient

from api.app import create_app
from api.views import table
from core.domain.date import Date
from core.domain.matches import MatchResult
from core.world.simulation import advance_day
from core.world.validation import validate_world
from infrastructure.importation.loader import import_world
from infrastructure.persistence.store import SaveStore

ROOT = Path(__file__).resolve().parents[2]


def finish_season(world):
    # Controlled final scores isolate the rollover from the match engine.
    for league in world.competitions.values():
        for mid in league.match_ids:
            match = world.matches[mid]
            match.result = MatchResult(3 if match.home_id < match.away_id else 0,
                                       0 if match.home_id < match.away_id else 3, 'test')
    world.date = Date(world.season + 1, 6, 30)


def test_july_rollover_resume_archives_and_second_season(config, tmp_path):
    world = import_world(ROOT / 'data', config, 123)
    finish_season(world)
    previous = {lid: table(world, lid) for lid in world.competitions}
    assert not any(row['movement'] == 'promotion' for row in previous[16])
    assert sum(row['movement'] == 'promotion' for row in previous[17]) == 3
    assert all(sum(row['movement'] == 'relegation' for row in rows) == 3 for rows in previous.values())
    relegated = previous[18][-1]['club_id']
    promoted = previous[17][0]['club_id']
    store = SaveStore(tmp_path)
    store.save(world, 'june')
    restored = store.load('june')
    for candidate in (world, restored):
        advance_day(candidate)
        validate_world(candidate)
        assert candidate.date == Date(2026, 7, 1) and candidate.season == 2026
        assert len(candidate.active_clubs()) == 216
        assert candidate.clubs[relegated].competition_id is None
        assert candidate.clubs[promoted].competition_id == 16
        assert sum(match.season == 2026 for match in candidate.matches.values()) == 4064
        for lid, league in candidate.competitions.items():
            assert table(candidate, lid, 2025) == previous[lid]
            assert candidate.champions[lid] == [(2025, previous[lid][0]['club_id'])]
            assert all(row['played'] == 0 for row in table(candidate, lid))
            for mid in league.match_ids:
                match = candidate.matches[mid]
                assert match.home_id in league.club_ids and match.away_id in league.club_ids
        incoming = [entry.club_id for entry in candidate.journal if entry.kind == 'promotion'
                    and candidate.clubs[entry.club_id].source_division_id not in candidate.competitions]
        assert len(incoming) == 15
        for cid in incoming:
            squad = [candidate.players[pid] for pid in candidate.clubs[cid].player_ids]
            assert len(squad) >= config.management.guardrails.min_squad
            assert sum(player.position == 'GB' for player in squad) >= 2
    for field in fields(world):
        if field.name == 'rngs':
            assert {key: rng.getstate() for key, rng in world.rngs.items()} == {key: rng.getstate() for key, rng in restored.rngs.items()}
        else:
            assert getattr(world, field.name) == getattr(restored, field.name), field.name

    app = create_app(ROOT, tmp_path)
    app.state.game.world = world
    with TestClient(app) as client:
        for cid, league in ((relegated, 18), (promoted, 17)):
            response = client.get(f'/api/clubs/{cid}/historique')
            assert response.status_code == 200
            row = response.json()['items'][0]
            assert row['competition_id'] == league and row['season'] == 2025
            assert row['standings'] == previous[league]
        response = client.get('/api/competitions/18/historique')
        assert response.status_code == 200
        assert response.json()['items'][0]['standings'] == previous[18]

    # The next day must not replay movements or archive a second champion.
    memberships = {lid: list(league.club_ids) for lid, league in world.competitions.items()}
    advance_day(world)
    assert memberships == {lid: league.club_ids for lid, league in world.competitions.items()}
    assert all(len(champions) == 1 for champions in world.champions.values())

    # Relocated clubs remain eligible in the reserve after a save/load.
    store.save(world, 'july')
    world = store.load('july')
    pool = config.world.promotion_relegation.reserves[0].division_ids
    from core.world.promotion import reserve_clubs
    assert relegated in {club.id for club in reserve_clubs(world, pool)}
    # Make a former National club the overwhelming favourite to prove re-entry.
    for club in reserve_clubs(world, pool):
        club.reputation = 100 if club.id == relegated else 0
    finish_season(world)
    advance_day(world)
    validate_world(world)
    assert world.clubs[relegated].competition_id == 18
    assert world.season == 2027 and len(world.active_clubs()) == 216
    assert all(len(champions) == 2 for champions in world.champions.values())
    assert table(world, 18, 2025) == previous[18]
