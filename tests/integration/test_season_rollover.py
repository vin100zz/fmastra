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


def test_the_season_that_opens_tells_the_human_club_its_first_cup_draws(config):
    world = import_world(ROOT / 'data', config, 123)
    # Controlled scores give every match to the lowest id: the lowest of a first division is its champion, and plays
    # the next Champions League.
    league = next(c for c in world.competitions.values() if c.kind == 'league' and c.level == 1)
    club_id = world.controlled_club_id = min(league.club_ids)
    finish_season(world)
    start = len(world.news)
    advance_day(world, auto=True)
    told = world.news[start:]
    draws = {world.competitions[item.lines[0].competition_id].kind: item for item in told if item.kind == 'cup_draw'}
    assert [item.kind for item in told].count('cup_draw') == 2 and set(draws) == {'cup', 'europe'}
    # They follow the opening of the season: the first round of the national cup, then every match of the league phase.
    kinds = [item.kind for item in told]
    assert kinds.index('season') < kinds.index('cup_draw')
    assert [line.amount for line in draws['cup'].lines] == [1]
    assert world.competitions[draws['europe'].lines[0].competition_id].code == 'C1'
    assert [line.amount for line in draws['europe'].lines] == list(range(1, config.world.europe.league_rounds + 1))
    for item in draws.values():
        for line in item.lines:
            match = world.matches[line.match_id]
            assert match.season == world.season and match.result is None and {match.home_id, match.away_id} == {club_id, line.club_id}
            assert (line.until, line.text) == (match.date, 'home' if match.home_id == club_id else 'away')


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
            body = client.get(f'/api/clubs/{winner}/historique').json()
            row = body['items'][0]
            assert row['season'] == first and row['cup' if kind == 'cup' else 'europe']['winner'] is True
            assert row['cup' if kind == 'cup' else 'europe']['level'] == 7
            # The honours count the title.
            if kind == 'cup': assert body['honours']['cup'] >= 1
            else: assert {'code': 'C1', 'competition': competition.name, 'count': 1} in body['honours']['europe']
        body = client.get(f'/api/clubs/{promoted}/historique').json()
        assert set(body) == {'items', 'total', 'page', 'page_size', 'leaders', 'transfers', 'honours', 'leagues'}
        assert body['honours']['best_rank'] == {'rank': body['items'][0]['rank'], 'season': first, 'competition': body['items'][0]['competition']}
        response = client.get('/api/competitions/18/historique')
        assert response.status_code == 200
        # The table of a finished season is archived apart from the champions, with the seasons to step to.
        assert all('standings' not in row for row in response.json()['items'])
        assert response.json()['archive'] == {'season': first, 'previous_season': None, 'next_season': None, 'seasons': [first],
                                              'current_season': None, 'standings': previous[18]}
        # A season that is not finished falls back on the latest one that is; a cup has no table to archive.
        assert client.get(f'/api/competitions/18/historique?saison={world.season}').json()['archive']['season'] == first
        cup_id = next(c.id for c in world.competitions.values() if c.kind == 'cup')
        assert client.get(f'/api/competitions/{cup_id}/historique').json()['archive'] is None
        assert response.json()['leaders'] == {'matches': [], 'goals': []}  # Controlled scores leave no player record.
        # A club's calendar steps back to the finished season: its matches alone, and where the club ended in its league then.
        calendar = client.get(f'/api/clubs/{promoted}/calendrier?saison={first}').json()
        assert (calendar['season'], calendar['previous_season'], calendar['next_season']) == (first, None, world.season)
        # Every season of the game to pick from, the latest first, and the one under way among them.
        assert (calendar['seasons'], calendar['current_season']) == ([world.season, first], world.season)
        assert calendar['items'] and all(row['season'] == first and row['score'] for row in calendar['items'])
        assert calendar['total'] == sum(m.season == first and promoted in (m.home_id, m.away_id) for m in world.matches.values())
        played = next(row for row in calendar['competitions'] if row['kind'] == 'league')
        assert (played['id'], played['place']) == (17, '1er')
        current = client.get(f'/api/clubs/{promoted}/calendrier').json()
        assert (current['season'], current['previous_season'], current['next_season']) == (world.season, first, None)
        assert all(row['season'] == world.season for row in current['items'])
        assert next(row for row in current['competitions'] if row['kind'] == 'league')['id'] == 16
        for year in (first - 1, world.season + 1):
            assert client.get(f'/api/clubs/{promoted}/calendrier?saison={year}').status_code == 422
        # A cup and a European cup step through the seasons they were played in.
        for competition_id, view in ((cup_id, 'coupe'), (next(c.id for c in world.competitions.values() if c.kind == 'europe'), 'europe')):
            shown = client.get(f'/api/competitions/{competition_id}/{view}').json()
            assert (shown['season'], shown['previous_season'], shown['next_season']) == (world.season, first, None)
            assert (shown['seasons'], shown['current_season']) == ([world.season, first], world.season)
            past = client.get(f'/api/competitions/{competition_id}/{view}?saison={first}').json()
            assert (past['season'], past['previous_season'], past['next_season']) == (first, None, world.season)
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
