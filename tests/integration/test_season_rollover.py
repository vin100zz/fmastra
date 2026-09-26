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
    from core.world.cups import progress_cups
    from core.world.europe import progress_europe, decide_european_winner
    for _ in range(6):
        for match in sorted(world.matches.values(), key=lambda m: (m.date, m.id)):
            if match.result:
                continue
            result = MatchResult(3 if match.home_id < match.away_id else 0,
                                 0 if match.home_id < match.away_id else 3, 'test')
            if world.competitions[match.competition_id].kind == 'europe':
                decide_european_winner(world, match, result, [])
            else:
                result.winner_id = min(match.home_id, match.away_id)
            match.result = result
        progress_cups(world)
        progress_europe(world)
    world.date = Date(world.season + 1, 6, 30)


def test_july_rollover_resume_archives_and_second_season(config, tmp_path):
    world = import_world(ROOT / 'data', config, 123)
    first = world.season
    finish_season(world)
    previous = {lid: table(world, lid) for lid, c in world.competitions.items() if c.kind == 'league'}
    assert not any(row['movement'] == 'promotion' for row in previous[16])
    assert sum(row['movement'] == 'promotion' for row in previous[17]) == 3
    assert all(sum(row['movement'] == 'relegation' for row in rows) == 3 for rows in previous.values())
    relegated = previous[18][-1]['club_id']
    promoted = previous[17][0]['club_id']
    outcomes = {m.id: (m.result.home_goals, m.result.away_goals, m.result.status, m.result.winner_id, m.result.penalties)
                for m in world.matches.values()}
    assert {world.competitions[m.competition_id].kind for m in world.matches.values()} == {'league', 'cup', 'europe'}
    store = SaveStore(tmp_path)
    store.save(world, 'june')
    restored = store.load('june')
    for candidate in (world, restored):
        advance_day(candidate)
        validate_world(candidate)
        assert candidate.date == Date(first + 1, 7, 1) and candidate.season == first + 1
        assert len(candidate.active_clubs()) == 216
        assert candidate.clubs[relegated].competition_id is None
        assert candidate.clubs[promoted].competition_id == 16
        assert sum(match.season == first + 1 for match in candidate.matches.values()) == 4064 + 5 * 32 + 3 * 144
        # Every finished match is archived, cups and European ties included, without losing who went through.
        finished = [m for m in candidate.matches.values() if m.season == first]
        assert len(finished) == len(outcomes) and all(m.result.engine == 'archived' for m in finished)
        assert {m.id: (m.result.home_goals, m.result.away_goals, m.result.status, m.result.winner_id, m.result.penalties)
                for m in finished} == outcomes
        assert any(candidate.competitions[m.competition_id].kind == 'cup' and m.result.winner_id for m in finished)
        assert any(candidate.competitions[m.competition_id].kind == 'europe' and m.result.winner_id for m in finished)
        for lid, league in candidate.competitions.items():
            if league.kind == 'europe':
                assert len(candidate.champions[lid]) == 1
                assert len(league.club_ids) == 36 and len(league.match_ids) == 144
                assert all(row['played'] == 0 for row in table(candidate, lid))
                continue
            if league.kind == 'cup':
                assert len(candidate.champions[lid]) == 1
                assert len(league.club_ids) == 64 and len(league.match_ids) == 32
                continue
            assert table(candidate, lid, first) == previous[lid]
            assert candidate.champions[lid] == [(first, previous[lid][0]['club_id'])]
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
            assert row['competition_id'] == league and row['season'] == first
            assert 'standings' not in row
            assert row['rank'] == next(item['rank'] for item in previous[league] if item['club_id'] == cid)
        # Cup and European runs come from the archived matches: the winners of the finals carry the title.
        for kind, code in (('cup', None), ('europe', 'C1')):
            competition = next(c for c in world.competitions.values() if c.kind == kind and c.code == code)
            winner = world.champions[competition.id][0][1]
            row = client.get(f'/api/clubs/{winner}/historique').json()['items'][0]
            assert row['season'] == first and row['cup' if kind == 'cup' else 'europe']['winner'] is True
            assert row['cup' if kind == 'cup' else 'europe']['level'] == 7
        body = client.get(f'/api/clubs/{promoted}/historique').json()
        assert set(body) == {'items', 'total', 'page', 'page_size', 'leaders', 'transfers'}
        response = client.get('/api/competitions/18/historique')
        assert response.status_code == 200
        assert response.json()['items'][0]['standings'] == previous[18]
        assert response.json()['leaders'] == {'matches': [], 'goals': []}  # Controlled scores leave no player record.
        # An archived knockout match still shows its score and winner, with no detail to list.
        cup_match = next(m for m in world.matches.values() if m.season == first and world.competitions[m.competition_id].kind == 'cup')
        response = client.get(f'/api/matches/{cup_match.id}')
        assert response.status_code == 200
        detail = response.json()
        assert detail['winner_id'] == cup_match.result.winner_id and detail['result']['home_stats'] is None
        assert detail['result']['events'] == []

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
    assert world.season == first + 2 and len(world.active_clubs()) == 216
    assert all(len(champions) == 2 for champions in world.champions.values())
    assert table(world, 18, first) == previous[18]
