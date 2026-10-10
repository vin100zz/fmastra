from copy import deepcopy
from dataclasses import replace
from pathlib import Path
import gzip
import hashlib
import json

import pytest
from fastapi.testclient import TestClient
from api.app import create_app
from api.views import normalized
from core.domain.date import Date
from core.world.international import prepare_international_day
from core.world.cups import season_fixtures
from core.world.international_calendar import reserved_dates
from core.world.importation.construction import construct_world
from infrastructure.importation.loader import import_world
from infrastructure.importation.readers import read_sources
from infrastructure.config.loader import config_payload
from infrastructure.persistence.store import SaveStore

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope='module')
def imported(config):
    return import_world(ROOT / 'data', config, 981)


def test_international_windows_leave_club_calendars_playable(imported):
    world = deepcopy(imported, {id(imported.config): imported.config})
    for year in range(2026, 2031):
        fixtures = season_fixtures(world, year)
        reserved = reserved_dates(world, year)
        assert len(fixtures) == 4064 + 5 * 32 + 3 * 144
        assert all(abs(m.date.ordinal() - d.ordinal()) >= 3 for m in fixtures for d in reserved)
        for competition in world.competitions.values():
            days = sorted({m.date for m in fixtures if m.competition_id == competition.id})
            assert all(b.ordinal() - a.ordinal() >= 3 for a, b in zip(days, days[1:]))


def test_national_api_and_player_history(imported, tmp_path):
    world = deepcopy(imported, {id(imported.config): imported.config})
    world.date = Date(2026, 8, 31)
    prepare_international_day(world)
    app = create_app(ROOT, tmp_path)
    app.state.game.world = world
    with TestClient(app) as client:
        data = client.get('/api/international').json()
        assert data['enabled'] and len(data['nations']) == 211
        assert [(e['year'], e['code']) for e in data['editions']] == [(2028, 'EU')]
        assert {'titles', 'last_edition'} <= set(data['nations'][0])
        edition = client.get('/api/international/editions/2028').json()
        assert len(edition['qualification_groups']) == 10 and len(edition['matches']) == 240
        # What its header shows: its badge, the Euro's blue crossed by its yellow, and nobody to hold a first title.
        assert (edition['code'], edition['major_color'], edition['minor_color'], edition['ground_color']) == ('EU', '#003399', '#ffcc00', None)
        assert edition['winner'] is None and edition['holder'] is None
        france = next(n for n in data['nations'] if n['name'] == 'France')
        nation = client.get(f"/api/international/nations/{france['id']}").json()
        assert len(nation['squad']) == 23 and nation['camp']
        assert {'age', 'potential', 'club', 'value', 'wage', 'contract_end'} <= set(nation['squad'][0])
        # Its page wears a club's header and widgets: its kit, the edition it plays, its next matches, its group.
        assert (nation['major_color'], nation['minor_color']) == ('#1f3f94', '#ffffff')
        assert nation['competition'] == {'year': 2028, 'name': 'Euro 2028', 'stage': 'Qualifications'}
        assert nation['calendar']['last'] == [] and len(nation['calendar']['next']) == 3 and nation['lineup'] is None
        assert all(m['competition_code'] == 'EU' and france['id'] in (m['home']['id'], m['away']['id']) for m in nation['calendar']['next'])
        group = nation['group']
        assert (group['year'], group['finals'], group['places']) == (2028, False, 1) and len(group['name']) == 1
        assert france['id'] in [row['nation']['id'] for row in group['rows']] and len(group['rows']) in (5, 6)
        # The list is sorted by the server as a club's squad is, on the position by default; what a player did in the edition goes with it.
        assert {'caps', 'international_goals', 'appearances', 'goals', 'assists', 'average', 'form'} <= set(nation['squad'][0])
        assert nation['squad'][0]['position'] == 'GB' and all(p['appearances'] == 0 and p['average'] is None for p in nation['squad'])
        capped = client.get(f"/api/international/nations/{france['id']}?tri=caps&ordre=desc").json()['squad']
        assert [p['caps'] for p in capped] == sorted((p['caps'] for p in capped), reverse=True)
        by_club = client.get(f"/api/international/nations/{france['id']}?tri=club").json()['squad']
        clubs = [normalized(p['club']['name']) for p in by_club if p['club']]
        # A reinforcement has no club: it stays last.
        assert len(clubs) > 1 and clubs == sorted(clubs) and all(p['club'] is None for p in by_club[len(clubs):])
        assert client.get(f"/api/international/nations/{france['id']}?tri=passe&ordre=desc").status_code == 200
        assert client.get(f"/api/international/nations/{france['id']}?tri=morale").status_code == 422
        # Its calendar: the matches of the edition under way, its group there, its record in each edition it played.
        calendar = client.get(f"/api/international/nations/{france['id']}/calendrier").json()
        assert calendar['edition'] == 2028 and calendar['editions'] == [{'year': 2028, 'name': 'Euro 2028'}]
        assert len(calendar['items']) == 2 * (len(group['rows']) - 1) and calendar['group'] == group
        assert all(m['outcome'] is None and m['scorers'] is None and france['id'] in (m['home']['id'], m['away']['id']) for m in calendar['items'])
        assert [m['id'] for m in calendar['items'][:3]] == [m['id'] for m in nation['calendar']['next']]
        record = calendar['competitions'][0]
        assert (record['code'], record['kind'], record['played'], record['winner']) == ('EU', 'international', 0, False)
        assert record['place'].endswith(f" du groupe {group['name']}")
        # A year it played nothing in opens the default edition; the matches no longer travel with the squad.
        assert client.get(f"/api/international/nations/{france['id']}/calendrier?edition=2030").json()['edition'] == 2028
        assert client.get(f"/api/international/nations/{france['id']}/calendrier?edition=x").status_code == 422
        assert 'matches' not in nation
        match = client.get(f"/api/matches/{edition['matches'][0]['id']}").json()
        assert match['international'] and match['home']['national']
        # A selection's report carries its kit under the keys of a club's.
        assert {'major_color', 'minor_color'} <= set(match['home']) and {'major_color', 'minor_color'} <= set(match['away'])
        pid = next(p['id'] for p in nation['squad'] if p['id'] >= 0)
        profile = client.get(f'/api/joueurs/{pid}').json()
        assert 'international_caps' in profile and 'historical_goals' in profile
        assert client.get('/api/international/editions/2026').status_code == 404


def test_historical_caps_import_and_explicit_allegiance(config):
    clubs, players, nations = read_sources(ROOT / 'data', config)
    source = next(p for p in players if len(p.nations) > 1 and p.nations[0] == 'FRA' and p.nations[1] in nations)
    players = [replace(p, international_caps=12, international_goals=3) if p.id == source.id else p for p in players]
    historical = replace(config.international, historical_nations={source.id: source.nations[1]})
    world = construct_world(clubs, players, replace(config, international=historical), 11, nations)
    if source.id not in world.players:
        pytest.fail('Historical test player was filtered out at import')
    p = world.players[source.id]
    assert p.international_caps == p.historical_caps == 12
    assert p.international_goals == p.historical_goals == 3
    assert p.national_team == source.nations[1]


def test_actual_legacy_schema_without_national_config(config, tmp_path):
    # A schema-14 configuration really lacked both fields; migrations must verify its old fingerprint.
    world = import_world(ROOT / 'data', replace(config, nations={}), 9)
    store = SaveStore(tmp_path)
    store.save(world, 'legacy')
    document = json.loads(gzip.decompress(store.path_for('legacy').read_bytes()))
    document['schema_version'] = 14
    document['world'].pop('international')
    cfg = document['world']['config']
    cfg.pop('nations')
    cfg.pop('international')
    for player in document['world']['players'].values():
        for key in ('national_team','international_caps','international_goals','historical_caps','historical_goals','international_discipline'):
            player.pop(key)
    document['config_hash'] = hashlib.sha256(json.dumps(cfg,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
    store.path_for('legacy').write_bytes(gzip.compress(json.dumps(document).encode()))
    loaded = store.load('legacy')
    assert not loaded.international.nations and not loaded.config.nations
