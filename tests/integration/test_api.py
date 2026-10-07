import time
from pathlib import Path
from threading import Event, Semaphore, Thread, current_thread

import pytest
from fastapi.testclient import TestClient

from api import views as v
from api.app import create_app
from api.nations import build_nation_table
from core.domain.players import ATTRIBUTE_NAMES, Discipline, Injury
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



def test_lists_take_a_page_size_several_positions_and_both_bounds_of_a_range(client):
    world = client.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    page = client.get('/api/joueurs?taille=12&poste=GB,BU&niveau_max=60&potentiel_max=80&tri=rating').json()
    assert page['page_size'] == 12 and len(page['items']) == 12
    assert {row['position'] for row in page['items']} <= {'GB', 'BU'}
    assert all(row['rating'] <= 60 and row['potential'] <= 80 for row in page['items'])
    assert page['total'] == sum(player.position in ('GB', 'BU') and player.rating <= 60 and player.potential <= 80 for player in world.players.values())
    floor = sorted(v.market_value(player, world) for player in world.players.values())[len(world.players) // 2]
    assert all(row['value'] >= floor for row in client.get(f'/api/joueurs?valeur_min={floor}&tri=value&ordre=asc').json()['items'])
    for bad in (5, 500): assert client.get(f'/api/joueurs?taille={bad}').status_code == 422
    # The season's figures sort the list of the world's players.
    for tri in ('appearances', 'goals', 'assists', 'average'):
        assert client.get(f'/api/joueurs?tri={tri}').status_code == 200
    # A player's page also tells what the lists tell a recruiter: nothing without a human club.
    detail = client.get(f"/api/joueurs/{page['items'][0]['id']}").json()
    assert detail['interested'] is None and detail['wage_demand'] is None
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


def test_club_list_tells_standing_squad_and_money_and_sorts_on_them(client):
    world = client.app.state.game.world
    rows = client.get('/api/clubs?statut=actif&taille=10&tri=valeur').json()
    assert rows['page_size'] == 10 and len(rows['items']) == 10
    values = [row['squad_value'] for row in rows['items']]
    assert values == sorted(values, reverse=True)
    for row in rows['items']:
        club = world.clubs[row['id']]
        players = [world.players[pid] for pid in club.player_ids]
        assert row['squad_value'] == sum(v.market_value(player, world) for player in players)
        assert row['average_age'] == round(sum(player.born.age_on(world.date) for player in players) / len(players), 1)
        assert (row['wage_bill'], row['wage_cap']) == (club.wage_bill, club.wage_cap)
        assert row['available_budget'] == max(0, club.transfer_budget - sum(offer.ceiling for offer in world.offers.values() if offer.target_id == club.id))
        assert row['standing']['club_id'] == club.id
    # A rank first runs from the top of each league; clubs outside the leagues, without any, come last whichever the order.
    ranked = client.get('/api/clubs?tri=classement').json()['items']
    assert [row['standing']['rank'] for row in ranked] == sorted(row['standing']['rank'] for row in ranked) and ranked[0]['standing']['rank'] == 1
    for ordre in ('asc', 'desc'):
        last = client.get(f'/api/clubs?tri=classement&ordre={ordre}&page={(len(world.clubs) + 29) // 30}').json()['items']
        assert last and last[-1]['standing'] is None
    for tri, field in (('age', 'average_age'), ('budget', 'available_budget'), ('masse_salariale', 'wage_bill')):
        listed = [row[field] for row in client.get(f'/api/clubs?statut=actif&tri={tri}').json()['items']]
        assert listed == sorted(listed, reverse=True)
    assert client.get('/api/clubs?tri=forme').status_code == 200
    assert client.get('/api/clubs?taille=5').status_code == 422


def test_world_transfers_take_filters_and_come_with_a_summary_of_the_season(client):
    world = client.app.state.game.world
    data = client.get('/api/monde/transferts?fenetre=ete&nature=payant&competition=16&poste=BU,MC&age_min=18&age_max=30&montant_min=1&recherche=a&taille=20').json()
    assert data['page_size'] == 20 and set(data['counts']) == {'transfer', 'retirement', 'academy'}
    assert client.get('/api/monde/transferts').json()['page_size'] == 50
    for bad in ('fenetre=printemps', 'nature=gratuit', 'taille=5', 'age_min=-1'):
        assert client.get(f'/api/monde/transferts?{bad}').status_code == 422
    for sort in ('position', 'nation', 'age', 'rating', 'value'):
        assert client.get(f'/api/monde/transferts?tri={sort}').json()['sort'] == sort
    summary = client.get('/api/monde/transferts/resume').json()
    assert summary['season'] == world.season
    assert {'total', 'paid', 'volume', 'median', 'record', 'weeks', 'clubs', 'leagues'} <= summary.keys()
    assert client.get('/api/monde/transferts/resume?saison=1900').status_code == 422



def test_retirements_and_promotions_take_their_filters_and_come_with_their_summaries(client):
    world = client.app.state.game.world
    retired = client.get('/api/monde/transferts?type=retirement&poste=GB,BU&age_min=30&competition=16&selectionnes=oui&club=1&tri=caps').json()
    assert retired['type'] == 'retirement' and retired['sort'] == 'caps'
    assert client.get('/api/monde/transferts?type=retirement').json()['sort'] == 'rating'
    assert client.get('/api/monde/transferts?type=retirement&selectionnes=non').status_code == 422
    promoted = client.get('/api/monde/transferts?type=academy&poste=MC&pays=FRA&niveau_min=20&niveau_max=90&potentiel_min=50&potentiel_max=100&interesse=oui&tri=progress').json()
    assert promoted['type'] == 'academy' and promoted['sort'] == 'progress' and 'nations' in promoted
    for sort in ('level', 'worth', 'wage_demand', 'interested', 'passe', 'tir'):
        assert client.get(f'/api/monde/transferts?type=academy&tri={sort}').json()['sort'] == sort
    assert client.get('/api/monde/transferts?type=academy&niveau_min=101').status_code == 422
    for kind, keys in (('retirement', {'total', 'average_age', 'capped', 'oldest', 'ages', 'clubs', 'leagues'}),
                       ('academy', {'total', 'average_potential', 'best', 'average_progress', 'bins', 'academies', 'nations'})):
        summary = client.get(f'/api/monde/transferts/resume?type={kind}').json()
        assert summary['season'] == world.season and keys <= summary.keys()
    assert client.get('/api/monde/transferts/resume?type=invalid').status_code == 422


def test_club_list_averages_its_sixteen_best_players_and_sorts_on_it(client):
    world = client.app.state.game.world
    def best(club_id: int, key: str) -> float:
        values = sorted((getattr(world.players[pid], key) for pid in world.clubs[club_id].player_ids), reverse=True)[:16]
        return round(sum(values) / len(values), 1)
    for tri, field, key in (("niveau", "top_rating", "rating"), ("potentiel", "top_potential", "potential")):
        rows = client.get(f'/api/clubs?statut=actif&tri={tri}').json()['items']
        assert all(row[field] == best(row['id'], key) for row in rows)
        assert [row[field] for row in rows] == sorted((row[field] for row in rows), reverse=True)
        weakest = client.get(f'/api/clubs?statut=actif&tri={tri}&ordre=asc').json()['items']
        assert [row[field] for row in weakest] == sorted(row[field] for row in weakest) and weakest[0][field] < rows[0][field]
    names = [v.normalized(row['name']) for row in client.get('/api/clubs?tri=nom').json()['items']]
    assert names == sorted(names)
    empty = next((club for club in world.clubs.values() if not club.player_ids), None)
    if empty:
        assert client.get(f'/api/clubs/{empty.id}').json()['top_rating'] is None
        rows = client.get(f'/api/clubs?tri=niveau&ordre=asc&page={(len(world.clubs) + 29) // 30}').json()['items']
        assert rows[-1]['top_rating'] is None


def test_club_list_sorts_on_every_column_and_filters_by_country(client):
    world = client.app.state.game.world
    codes = build_nation_table(world.nation_names)
    shown = {"nom": lambda row: v.normalized(row['name']), "pays": lambda row: codes[row['nation_code']]['display_code'],
             "championnat": lambda row: row['competition'] and v.normalized(row['competition']), "reputation": lambda row: row['reputation'],
             "entrainement": lambda row: row['training_facilities'], "recrutement": lambda row: row['youth_recruitment'],
             "effectif": lambda row: row['squad_size'], "niveau": lambda row: row['top_rating'],
             "potentiel": lambda row: row['top_potential'], "formation": lambda row: v.normalized(row['formation'])}
    for tri, value in shown.items():
        for ordre in ("asc", "desc"):
            data = client.get(f'/api/clubs?pays=ITA&tri={tri}&ordre={ordre}').json()
            assert data['total'] == sum(club.nation == 'ITA' for club in world.clubs.values())
            assert all(row['nation_code'] == 'ITA' for row in data['items'])
            values = [value(row) for row in data['items']]
            present = [item for item in values if item is not None]
            # Clubs with nothing to show there come last whichever the order.
            assert values == present + [None] * (len(values) - len(present)), tri
            assert present == sorted(present, reverse=ordre == "desc"), (tri, ordre)
    ties = client.get('/api/clubs?pays=ITA&statut=actif&tri=championnat&ordre=desc').json()['items']
    league = [row['reputation'] for row in ties if row['competition'] == ties[0]['competition']]
    assert league == sorted(league, reverse=True)
    data = client.get('/api/clubs').json()
    assert data['nations'] == sorted({club.nation for club in world.clubs.values()})
    assert client.get('/api/clubs?pays=ITA').json()['nations'] == data['nations']
    assert client.get('/api/clubs?tri=invalid').status_code == 422


def test_player_history_gives_the_level_month_by_month_after_the_season_points_of_older_saves(client):
    from core.domain.world import history_month
    world = client.app.state.game.world
    player = next(iter(world.players.values()))
    kept = world.trajectories[player.id]
    world.trajectories[player.id] = [(history_month(2024, 7), [100]), (history_month(2025, 6), [104, 106])]
    try:
        trajectory = client.get(f"/api/joueurs/{player.id}/historique").json()["trajectory"]
    finally:
        world.trajectories[player.id] = kept
    assert [{key: point[key] for key in ("year", "month", "season", "level")} for point in trajectory] == [
        {"year": 2024, "month": 7, "season": 2024, "level": 100},
        {"year": 2025, "month": 6, "season": 2024, "level": 104},
        {"year": 2025, "month": 7, "season": 2025, "level": 106}]


def test_player_history_gives_each_month_the_club_played_for_then(client):
    from core.domain.date import Date
    from core.domain.world import TransferRecord, history_month
    world = client.app.state.game.world
    player = next(player for player in world.players.values() if player.club_id is not None)
    first, loaner, last = [club.id for club in world.clubs.values() if club.id != player.club_id][:3]
    kept, transfers = world.trajectories[player.id], world.transfers
    clubs = lambda: [point["club"] and point["club"]["id"] for point in client.get(f"/api/joueurs/{player.id}/historique").json()["trajectory"]]
    world.trajectories[player.id] = [(history_month(2024, 7), [100]), (history_month(2025, 7), [104, 105, 106, 107, 108, 109, 110, 111])]
    try:
        # Without any movement he never left his club.
        world.transfers = [row for row in transfers if row.player_id != player.id]
        assert clubs() == [player.club_id] * 9
        # Sold in the winter, the opening of that season stays with the club he left; then a loan, its return and a release.
        world.transfers = world.transfers + [TransferRecord(Date(2025, 9, 12), player.id, first, last, 1000, "transfer", 2025),
                                             TransferRecord(Date(2025, 11, 1), player.id, last, loaner, 0, "loan", 2025),
                                             TransferRecord(Date(2025, 12, 31), player.id, loaner, last, 0, "loan_return", 2025),
                                             TransferRecord(Date(2026, 2, 3), player.id, last, None, 0, "release", 2025)]
        assert clubs() == [first, first, first, last, last, loaner, last, last, None]
        point = client.get(f"/api/joueurs/{player.id}/historique").json()["trajectory"][0]
        assert point["club"] == {"id": first, "name": world.clubs[first].name, "major_color": world.clubs[first].home_kit_major_color,
                                 "minor_color": world.clubs[first].home_kit_minor_color}
    finally:
        world.trajectories[player.id], world.transfers = kept, transfers


def test_player_lists_carry_the_attributes_and_sort_on_each(client):
    world = client.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    club_id = next(iter(world.active_clubs())).id
    squad = client.get(f'/api/clubs/{club_id}/effectif?tri=reflexes&ordre=desc').json()['items']
    assert squad and all(row['attributes'] == dict(zip(ATTRIBUTE_NAMES, world.players[row['id']].attributes.values)) for row in squad)
    assert [row['attributes']['reflexes'] for row in squad] == sorted((row['attributes']['reflexes'] for row in squad), reverse=True)
    for name in ATTRIBUTE_NAMES:
        rows = client.get(f'/api/joueurs?tri={name}&ordre=asc').json()['items']
        assert [row['attributes'][name] for row in rows] == sorted(row['attributes'][name] for row in rows)
    best = client.get('/api/joueurs?tri=finition&ordre=desc').json()['items'][0]
    assert best['attributes']['finition'] == max(player.attributes.get('finition') for player in world.players.values())
    assert client.get(f'/api/clubs/{club_id}/effectif?tri=invalid').status_code == 422
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


def test_players_carry_the_engine_composites_their_notes_by_position_and_sort_on_each(client):
    world = client.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    club_id = next(iter(world.active_clubs())).id
    composites = world.config.attributes.composites
    squad = client.get(f'/api/clubs/{club_id}/effectif?tri=occasion_attaque&ordre=desc').json()['items']
    assert [row['composites']['occasion_attaque'] for row in squad] == sorted((row['composites']['occasion_attaque'] for row in squad), reverse=True)
    row = squad[0]
    player = world.players[row['id']]
    assert list(row['composites']) == list(v.COMPOSITES)
    assert row['composites']['tir'] == round(sum(player.attributes.get(name) * weight for name, weight in composites.shooting.items()), 1)
    assert row['key_composites'] == list(v.COMPOSITES_BY_POSITION[row['position']])
    for key in v.COMPOSITES:
        rows = client.get(f'/api/joueurs?tri={key}&ordre=asc').json()['items']
        assert [item['composites'][key] for item in rows] == sorted(item['composites'][key] for item in rows)

    # At his own position a player has no affinity to lose: his note is the mean of the composites it asks for.
    detail = client.get(f"/api/joueurs/{row['id']}").json()
    keys = v.COMPOSITES_BY_POSITION[detail['position']]
    exact = {key: v.composite(player, key, world.config) for key in keys}
    assert detail['position_notes'][detail['position']] == round(sum(exact.values()) / len(keys), 1)
    assert set(detail['position_notes']) == set(v.COMPOSITES_BY_POSITION) and detail['composites_by_position']['BU'] == ['tir', 'occasion_attaque', 'tete']
    assert detail['composite_weights']['tir'] == dict(composites.shooting)
    # Elsewhere the engine's out-of-position factor weighs on it.
    penalty = world.config.attributes.out_of_position
    stranger = next(position for position in v.COMPOSITES_BY_POSITION if player.affinity(position) < 1)
    base = sum(v.composite(player, key, world.config) for key in v.COMPOSITES_BY_POSITION[stranger]) / len(v.COMPOSITES_BY_POSITION[stranger])
    assert detail['position_notes'][stranger] == round(base * (penalty.base + penalty.factor * player.affinity(stranger)), 1)

    # The lineup screen gives each player his note and affinity at every position.
    kept, world.controlled_club_id = world.controlled_club_id, club_id
    try:
        lineup = client.get('/api/ma-partie/composition').json()
    finally:
        world.controlled_club_id = kept
    assert lineup['composites_by_position'] == {position: list(keys) for position, keys in v.COMPOSITES_BY_POSITION.items()}
    first = lineup['players'][0]
    assert set(first['position_notes']) == set(first['position_affinities']) == set(v.COMPOSITES_BY_POSITION)
    assert all(0 <= value <= 20 for value in first['position_affinities'].values())
    assert client.get(f'/api/clubs/{club_id}/effectif?tri=composite').status_code == 422
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


def test_squad_shows_form_and_morale_with_where_it_drifts_and_why(client):
    from core.world.contracts import contentment, games_by_club, position_ranks
    world = client.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    club = next(iter(world.active_clubs()))
    rows = client.get(f'/api/clubs/{club.id}/effectif?tri=morale&ordre=asc').json()['items']
    assert [row['morale'] for row in rows] == sorted(row['morale'] for row in rows)
    by_form = client.get(f'/api/clubs/{club.id}/effectif?tri=form&ordre=desc').json()['items']
    assert [row['form'] for row in by_form] == sorted((row['form'] for row in by_form), reverse=True)
    ranks, games = position_ranks(world, club), games_by_club(world)[club.id]
    moral = world.config.states.moral
    for row in rows:
        player = world.players[row['id']]
        mood = contentment(world, player, club, ranks[player.id], games, player.season_minutes)
        assert row['form'] == round(player.form, 3) and row['morale'] == round(player.morale, 3)
        # The target the weekly review moves his morale towards, within the bounds morale keeps.
        assert row['morale_target'] == round(min(moral.max, max(moral.min, mood.morale_target)), 3)
        assert (row['wage_satisfaction'], row['playing_time_satisfaction']) == (round(mood.wage, 3), round(mood.playing_time, 3))
        assert row['morale_cause'] in (None, 'salaire', 'temps_de_jeu', 'ambition')
        if row['morale_cause'] == 'salaire': assert row['wage_satisfaction'] < 1
        if row['morale_cause'] == 'temps_de_jeu': assert row['playing_time_satisfaction'] < 1
    # The player page reads the same outlook for one player, and the bounds his form keeps.
    detail = client.get(f"/api/joueurs/{rows[0]['id']}").json()
    assert all(detail[key] == rows[0][key] for key in ('morale_target', 'morale_cause', 'wage_satisfaction', 'playing_time_satisfaction'))
    assert detail['form_bounds'] == [world.config.states.form.min, world.config.states.form.max]
    free_agent = next(player for player in world.players.values() if player.club_id is None)
    assert client.get(f"/api/joueurs/{free_agent.id}").json()['morale_cause'] is None
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


def test_views_pagination_and_no_rng_leak(client):
    world = client.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    club_id = next(iter(world.active_clubs())).id
    league_id = world.clubs[club_id].competition_id
    player_id = world.clubs[club_id].player_ids[0]
    match_id = world.competitions[league_id].match_ids[0]
    routes = ["/monde/etat", "/monde/palmares", "/partie/rapport-import", "/partie/slots", "/clubs", "/clubs?statut=dormant&page=2", "/competitions",
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
    cap = values[len(values) // 2]
    capped = client.get(f'/api/joueurs?valeur_max={cap}').json()
    assert capped['items'] and all(row['value'] <= cap for row in capped['items']) and capped['total'] < first['total']
    promising = client.get('/api/joueurs?potentiel_min=75').json()
    assert promising['items'] and all(row['potential'] >= 75 for row in promising['items']) and promising['total'] < first['total']
    # The asking price sorts and filters like the value; players their clubs will not sell come last, and never under a cap.
    priced = client.get('/api/joueurs?tri=asking_price&page=1').json()['items']
    prices = [row['asking_price'] or 0 for row in priced if row['transferable']]
    assert prices == sorted(prices, reverse=True) and prices[0] > 0
    cheapest = client.get('/api/joueurs?tri=asking_price&ordre=asc').json()['items']
    assert [row['asking_price'] or 0 for row in cheapest] == sorted(row['asking_price'] or 0 for row in cheapest)
    last = client.get(f"/api/joueurs?tri=asking_price&page={(first['total'] + 29) // 30}").json()['items']
    assert not last[-1]['transferable']
    fee_cap = prices[len(prices) // 2]
    affordable = client.get(f'/api/joueurs?prix_max={fee_cap}&tri=asking_price').json()
    assert affordable['items'] and all(row['transferable'] and (row['asking_price'] or 0) <= fee_cap for row in affordable['items'])
    club_rows = client.get('/api/clubs').json()['items']
    assert all({'training_facilities', 'youth_recruitment'} <= row.keys() for row in club_rows)
    psg = client.get('/api/clubs/868').json()
    assert (psg['training_facilities'], psg['youth_recruitment']) == (20, 19)
    mbappe = client.get('/api/joueurs/85139014').json()
    assert mbappe['attributes_imported'] and mbappe['position_ratings']['BU'] == 18
    assert mbappe['attributes']['finition'] == 90
    assert mbappe['attribute_weights'] == dict(world.config.attributes.overall[mbappe['position']])  # the main position, not BU
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
    # With the champions come the rankings drawn from them, and where the season under way stands.
    assert data['season'] == world.season
    assert [row['club']['id'] for row in data['clubs']] == [second, first] and data['clubs'][0]['europe'] == 1
    assert {'players', 'scorers', 'nations'} <= data.keys() and all({'scorer', 'current'} <= item.keys() for item in blocks)
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


def test_competitions_count_the_rounds_of_their_season(client):
    rounds = {item['name']: item['rounds'] for item in client.get('/api/competitions').json()}
    assert rounds['Ligue 1'] == 34 and rounds['Championship'] == 46 and rounds['Coupe de France'] == 6


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


def test_what_follows_an_advance_waits_for_its_autosave_instead_of_being_refused(config, tmp_path, monkeypatch):
    """An advance reports done before its autosave is written, and the page offers Continuer again at once."""
    app = create_app(ROOT, tmp_path)
    service = app.state.game
    service.world = import_world(ROOT / "data", config, 780)
    started, permits = Semaphore(0), Semaphore(0)
    def save(world, slot):
        if current_thread().name.startswith("autosave"):  # the write an advance leaves running
            started.release()
            assert permits.acquire(timeout=10)
    monkeypatch.setattr(service.store, "save", save)
    client = TestClient(app)
    def advance():
        response = client.post("/api/monde/avancer", json={"jusqu_a": "jour"})
        assert response.status_code == 202, response.text
        return response.json()["id"]
    try:
        first = advance()
        assert started.acquire(timeout=30) and wait_until(lambda: service.jobs[first].status == "done")
        assert client.get("/api/monde/etat").json()["job"] is None
        # A synchronous write waits for the autosave to be written...
        entered = Event()
        def write():
            with service.mutating(): entered.set()
        writer = Thread(target=write)
        writer.start()
        assert not entered.wait(0.3)
        permits.release()
        assert entered.wait(10)
        writer.join(10)
        # ...and the next advance is queued behind it: the world does not move while it is being written.
        second = advance()
        assert started.acquire(timeout=30) and wait_until(lambda: service.jobs[second].status == "done")
        third = advance()
        time.sleep(0.3)
        assert service.jobs[third].status == "queued" and service.world.date.iso() == service.jobs[second].date
        permits.release(2)
        assert wait_until(lambda: service.jobs[third].status == "done" and service.pending_save is None)
        assert not service.recovery_required
    finally:
        permits.release(10)  # a regression must fail this test, not leave the autosave thread waiting
        service.close()


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
    # The transfers have their own tab; the landing view no longer summarises them.
    assert set(overview) == {"calendar", "finances", "lineup"}
    lineup = overview["lineup"]
    assert lineup["match"]["id"] == last[0]["id"] and len(lineup["players"]) == 11
    detail = played.get(f"/api/matches/{lineup['match']['id']}").json()["result"]
    assert lineup["players"] == detail[f"{lineup['side']}_lineup"]
    assert played.get("/api/clubs/999999999/apercu").status_code == 404
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


def test_club_calendar_lists_the_whole_season_with_scorers_outcomes_and_a_record_per_competition(played):
    world = played.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    club = next(iter(world.active_clubs()))
    data = played.get(f"/api/clubs/{club.id}/calendrier").json()
    season = [match for match in world.matches.values() if match.season == world.season and club.id in (match.home_id, match.away_id)]
    assert data["total"] == len(data["items"]) == len(season)
    assert [row["date"] for row in data["items"]] == sorted(row["date"] for row in data["items"])
    for row in data["items"]:
        if row["score"] is None:
            assert row["scorers"] is None and row["outcome"] is None
        else:
            home = row["home"]["id"] == club.id
            goals, conceded = row["score"] if home else row["score"][::-1]
            assert row["outcome"] in "VND" and [sum(len(scorer["minutes"]) for scorer in side) for side in row["scorers"]] == row["score"]
            if not row["penalties"]: assert row["outcome"] == ("V" if goals > conceded else "D" if goals < conceded else "N")
    league = next(row for row in data["competitions"] if row["kind"] == "league")
    assert data["competitions"][0] is not None and data["competitions"][0]["kind"] == "league"
    played_league = [row for row in data["items"] if row["competition_id"] == league["id"] and row["score"]]
    assert league["played"] == len(played_league) == league["won"] + league["drawn"] + league["lost"]
    assert league["won"] == sum(row["outcome"] == "V" for row in played_league)
    assert league["goals_for"] == sum(row["score"][0] if row["home"]["id"] == club.id else row["score"][1] for row in played_league)
    rank = next(row["rank"] for row in v.table(world, league["id"]) if row["club_id"] == club.id)
    assert league["place"] == f"{rank}{'er' if rank == 1 else 'e'}"
    assert all(row["place"] for row in data["competitions"])
    assert played.get("/api/clubs/999999999/calendrier").status_code == 404
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


def test_club_finances_give_the_cash_at_the_end_of_each_month(played):
    world = played.app.state.game.world
    club = next(iter(world.active_clubs()))
    history = played.get(f"/api/clubs/{club.id}/finances").json()["history"]
    assert history["available"] and history["months"]
    assert [month["date"] for month in history["months"]] == sorted(month["date"] for month in history["months"])
    balance = history["opening_balance"]
    for month in history["months"]:
        balance += month["revenue"] - month["expenses"]
        assert month["balance"] == balance
    assert history["months"][-1]["balance"] == history["closing_balance"]
    assert sum(month["revenue"] for month in history["months"]) == history["revenue"]
    assert sum(month["expenses"] for month in history["months"]) == history["expenses"]


def test_club_history_tells_its_honours_and_the_shape_of_its_league(played):
    world = played.app.state.game.world
    club = next(iter(world.active_clubs()))
    data = played.get(f"/api/clubs/{club.id}/historique").json()
    assert data["honours"] == {"league": [], "cup": 0, "europe": [], "best_rank": None, "best_europe": None}
    table = v.table(world, club.competition_id)
    league = next(item for item in data["leagues"] if item["id"] == club.competition_id)
    assert len(data["leagues"]) == 1 and league["name"] == world.competitions[club.competition_id].name
    assert league["clubs"] == len(table) and league["level"] == world.competitions[club.competition_id].level
    assert 0 < league["relegation"] < league["clubs"] and 0 < league["europe"] + league["promotion"] < league["clubs"]
    assert played.get(f"/api/clubs/{club.id}").json()["reputation_change"] is None
    from api.club_archive import honours
    rows = [{"season": 2026, "rank": 2, "champion": False, "competition": "L", "level": 1, "cup": {"label": "Vainqueur", "level": 7, "winner": True},
             "europe": {"code": "C3", "competition": "Ligue Europa", "label": "Vainqueur", "level": 6, "winner": True}},
            {"season": 2025, "rank": 1, "champion": True, "competition": "L", "level": 1, "cup": None,
             "europe": {"code": "C3", "competition": "Ligue Europa", "label": "Finale", "level": 5, "winner": False}},
            {"season": 2024, "rank": 1, "champion": True, "competition": "L", "level": 1, "cup": None, "europe": None}]
    assert honours(rows) == {"league": [{"competition": "L", "level": 1, "count": 2}], "cup": 1, "europe": [{"code": "C3", "competition": "Ligue Europa", "count": 1}],
                             "best_rank": {"rank": 1, "season": 2024, "competition": "L"},
                             "best_europe": {"code": "C3", "competition": "Ligue Europa", "label": "Vainqueur", "level": 6, "winner": True, "season": 2026}}


def test_the_lineup_screen_scouts_the_next_opponent(played):
    world = played.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    club = next(iter(world.active_clubs()))
    kept, world.controlled_club_id = world.controlled_club_id, club.id
    try:
        lineup = played.get("/api/ma-partie/composition").json()
    finally:
        world.controlled_club_id = kept
    scout = lineup["scouting"]
    assert lineup["club"]["id"] == club.id
    assert scout["match"]["id"] == lineup["match_id"] and scout["club"]["id"] == lineup["opponent"]["id"] and scout["home"] == lineup["home"]
    rival = world.clubs[scout["club"]["id"]]
    assert scout["club"]["formation"] == rival.formation
    assert len(scout["key_players"]) <= 3
    assert [player["rating"] for player in scout["key_players"]] == sorted((player["rating"] for player in scout["key_players"]), reverse=True)
    assert all(player["injured_until"] or player["suspension"] for player in scout["absent"])
    assert scout["record"]["venue"] == ("away" if scout["home"] else "home")
    venue = [match for match in world.matches.values() if match.season == world.season and match.result and match.competition_id == rival.competition_id
             and (match.away_id if scout["home"] else match.home_id) == rival.id]
    assert sum(scout["record"][key] for key in ("won", "drawn", "lost")) == len(venue)
    if scout["standing"]: assert set(scout["standing"]) == {"rank", "points", "form"}
    if scout["last_meeting"]: assert {scout["last_meeting"]["home"]["id"], scout["last_meeting"]["away"]["id"]} == {club.id, rival.id}
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


def test_club_overview_before_any_match_has_no_lineup(client):
    world = client.app.state.game.world
    club = next(iter(world.active_clubs()))
    overview = client.get(f"/api/clubs/{club.id}/apercu").json()
    assert overview["calendar"]["last"] == [] and len(overview["calendar"]["next"]) == 3
    assert overview["lineup"] is None


def test_latest_and_next_rounds_list_scorers_beside_the_tables_they_count_for(played):
    world = played.app.state.game.world
    states = {key: rng.getstate() for key, rng in world.rngs.items()}
    get = lambda path: played.get("/api" + path).json()

    def check_scorers(rows):
        for row in rows:
            result = world.matches.get(row["id"]) or world.international.matches[row["id"]]
            if result.result is None:
                assert row["scorers"] is None and row["score"] is None
            elif result.result.status == "played":
                assert [sum(len(scorer["minutes"]) for scorer in side) for side in row["scorers"]] == row["score"]

    def top_scorers(competition_id, query=""):
        leaders = get(f"/competitions/{competition_id}/statistiques?type=buteurs{query}")["items"]
        return [{key: row[key] for key in ("id", "name", "club", "goals")} for row in leaders[:10]]
    for league in (item for item in world.competitions.values() if item.kind == "league"):
        latest, coming = get(f"/competitions/{league.id}/journee/derniere"), get(f"/competitions/{league.id}/journee/prochaine")
        assert coming["round"]["number"] == latest["round"]["number"] + 1 and coming["round"]["label"] == f"Journée {coming['round']['number']}"
        for data, played_out in ((latest, True), (coming, False)):
            [block] = data["groups"]
            assert len(block["matches"]) == len(league.club_ids) // 2
            assert all(row["round"] == data["round"]["number"] and (row["score"] is not None) == played_out for row in block["matches"])
            assert [row["club_id"] for row in block["standings"]] == [row["club_id"] for row in v.table(world, league.id)]
            assert block["top_scorers"] == top_scorers(league.id) and 0 < len(block["top_scorers"]) <= 10
            check_scorers(block["matches"])
    for cup in (item for item in world.competitions.values() if item.kind == "cup"):
        assert get(f"/competitions/{cup.id}/journee/derniere") == {"round": None, "groups": []}
        coming = get(f"/competitions/{cup.id}/journee/prochaine")
        assert coming["round"]["label"] == "32es de finale" and [len(block["matches"]) for block in coming["groups"]] == [32]
        assert coming["groups"][0]["standings"] is None and coming["groups"][0]["top_scorers"] is None
    for europe in (item for item in world.competitions.values() if item.kind == "europe"):
        for which in ("derniere", "prochaine"):
            data = get(f"/competitions/{europe.id}/journee/{which}?saison={world.season}")
            if data["round"] and data["round"]["number"] <= world.config.world.europe.league_rounds:
                assert data["round"]["label"].startswith("Phase de ligue") and len(data["groups"][0]["standings"]) == 36
                assert data["groups"][0]["top_scorers"] == top_scorers(europe.id, f"&saison={world.season}")
                check_scorers(data["groups"][0]["matches"])
    [edition] = world.international.editions.values()
    latest = get(f"/international/editions/{edition.year}/journee/derniere")
    assert latest["round"]["label"].startswith("Qualifications · J") and len(latest["groups"]) == len(edition.qualification_groups) == 10
    for group, block in zip(edition.qualification_groups, latest["groups"]):
        assert {row["club"]["id"] for row in block["standings"]} == set(group) and all(row["club"]["national"] for row in block["standings"])
        assert [row["movement"] for row in block["standings"]] == ["qualified"] + [None] * (len(group) - 1)
        assert all({row["home"]["id"], row["away"]["id"]} <= set(group) and row["score"] for row in block["matches"])
        check_scorers(block["matches"])
    assert sum(len(block["matches"]) for block in latest["groups"]) == sum(len(group) // 2 for group in edition.qualification_groups)
    assert played.get("/api/competitions/999999/journee/derniere").status_code == 404
    assert played.get(f"/api/competitions/{league.id}/journee/hier").status_code == 422
    assert {key: rng.getstate() for key, rng in world.rngs.items()} == states


def test_squad_sorts_by_what_each_column_shows(played):
    world = played.app.state.game.world
    club = world.clubs[next(iter(world.active_clubs())).id]
    hurt, banned = (world.players[player_id] for player_id in club.player_ids[:2])
    # The six simulated matches may have injured or suspended others: only these two must be unavailable.
    for player_id in club.player_ids:
        world.players[player_id].injury = None
        world.players[player_id].discipline.clear()
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
