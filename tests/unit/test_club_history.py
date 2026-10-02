from dataclasses import replace

from api.club_history import finances, movements
from core.domain.date import Date
from core.domain.clubs import Competition
from core.domain.world import JournalEntry, TransferRecord
from core.world.application import apply
from core.world.events import FinancePosted, PlayerSigned, PlayerReleased, PlayerGenerated, DateAdvanced
from infrastructure.persistence.history_migration import upgrade_history
from test_market import mini_world


def test_world_movements_include_dormant_clubs_and_paginate_each_type(config):
    from api.club_history import world_movements
    world = mini_world(config)
    S = world.season
    world.clubs[2].competition_id = None
    world.transfers = [TransferRecord(world.date.add_days(day), 201, 2, 1, day * 100, 'transfer', S) for day in range(52)]
    world.transfers += [TransferRecord(world.date, 101, 1, None, 0, 'retirement', S),
                        TransferRecord(world.date, 202, None, 2, 0, 'academy', S),
                        TransferRecord(world.date, 102, 1, None, 0, 'release', S)]
    first = world_movements(world, S, 'transfer', 1)
    second = world_movements(world, S, 'transfer', 2)
    assert first['total'] == 53 and len(first['items']) == 50 and len(second['items']) == 3
    assert first['items'][0]['source']['id'] == 2
    for order in ('asc', 'desc'):
        pages = [world_movements(world, S, 'transfer', page, 'fee', order) for page in (1, 2)]
        fees = [row['fee'] for data in pages for row in data['items']]
        assert fees == sorted(fees, reverse=order == 'desc')
        assert all(data['sort'] == 'fee' and data['order'] == order for data in pages)
    assert world_movements(world, S, 'retirement', 1)['total'] == 1
    academy = world_movements(world, S, 'academy', 1)
    assert academy['total'] == 1 and academy['items'][0]['target']['id'] == 2



def season_moves(world):
    """A paid summer transfer, a free winter one, a winter release, and a move of a player since retired."""
    S = world.season
    opening = world.config.world.key_dates.population_review
    summer, winter = Date(S, opening.month, opening.day).add_days(10), Date(S, opening.month, opening.day).add_days(200)
    world.retired[900] = "Ancien Joueur"
    return [TransferRecord(summer, 201, 2, 1, 5_000_000, 'transfer', S), TransferRecord(winter, 202, 2, 1, 0, 'transfer', S),
            TransferRecord(winter.add_days(3), 101, 1, None, 0, 'release', S),
            TransferRecord(summer.add_days(1), 900, 1, 2, 250_000, 'transfer', S, born=Date(S - 34, 1, 1))]


def test_world_transfers_narrow_by_window_nature_position_age_fee_club_and_search(config):
    from api.club_history import MovementFilter, world_movements
    from api.views import normalized
    world = mini_world(config)
    S = world.season
    world.transfers = season_moves(world)
    def players(**chosen):
        return sorted(row['player_id'] for row in world_movements(world, S, 'transfer', 1, chosen=MovementFilter(**chosen))['items'])
    assert players() == [101, 201, 202, 900]
    assert players(window='ete') == [201, 900] and players(window='hiver') == [101, 202]
    assert players(nature='payant') == [201, 900] and players(nature='libre') == [101, 202]
    assert players(fee_min=1_000_000) == [201]
    assert players(club_id=2) == [201, 202, 900] and players(club_id=1) == [101, 201, 202, 900]
    assert players(competition_id=16) == [101, 201, 202, 900] and players(competition_id=99) == []
    # The position is the one the player has today: a retired one has none left to match.
    position = world.players[201].position
    assert players(positions=frozenset({position})) == sorted(pid for pid in (101, 201, 202) if world.players[pid].position == position)
    age = world.players[201].born.age_on(world.transfers[0].date)
    assert 201 in players(age_min=age, age_max=age) and players(age_min=34, age_max=40) == [900]
    assert players(search=normalized(world.players[202].name)) == [202]
    assert players(search='club 2') == [201, 202, 900] and players(search='ancien') == [900]
    # Retirements and promotions only take the search; every tab tells how many movements the season holds.
    world.transfers.append(TransferRecord(world.date, 900, 2, None, 0, 'retirement', S))
    retired = world_movements(world, S, 'retirement', 1, chosen=MovementFilter(window='ete', nature='payant', fee_min=10))
    assert retired['total'] == 1 and retired['counts'] == {'transfer': 4, 'retirement': 1, 'academy': 0}
    assert world_movements(world, S, 'retirement', 1, chosen=MovementFilter(search='inconnu'))['total'] == 0


def test_world_transfers_tell_who_the_player_is_today_and_sort_on_it_with_a_page_size(config):
    from api.club_history import world_movements
    world = mini_world(config)
    S = world.season
    world.transfers = season_moves(world)
    states = {name: rng.getstate() for name, rng in world.rngs.items()}
    data = world_movements(world, S, 'transfer', 1, size=3)
    assert (len(data['items']), data['page_size'], data['total']) == (3, 3, 4)
    rows = {row['player_id']: row for page in (1, 2) for row in world_movements(world, S, 'transfer', page, size=3)['items']}
    active, gone = rows[201], rows[900]
    player = world.players[201]
    assert (active['position'], active['rating'], active['nationalities']) == (player.position, round(player.rating, 1), list(player.nationalities))
    assert active['value'] > 0
    assert (gone['position'], gone['rating'], gone['value'], gone['nationalities'], gone['age']) == (None, None, None, [], 34)
    for key in ('position', 'nation', 'rating', 'value'):
        for order in ('asc', 'desc'):
            listed = world_movements(world, S, 'transfer', 1, key, order)['items']
            # A retired player has nothing to sort on: he comes last whichever the order.
            assert len(listed) == 4 and listed[-1]['player_id'] == 900
    ratings = [row['rating'] for row in world_movements(world, S, 'transfer', 1, 'rating', 'desc')['items'][:3]]
    assert ratings == sorted(ratings, reverse=True)
    ages = [row['age'] for row in world_movements(world, S, 'transfer', 1, 'age', 'asc')['items']]
    assert ages == sorted(ages)
    assert {name: rng.getstate() for name, rng in world.rngs.items()} == states


def test_market_summary_totals_the_season_by_week_club_and_league(config):
    from api.club_history import market_summary
    world = mini_world(config)
    S = world.season
    world.transfers = season_moves(world)
    world.transfers.append(TransferRecord(world.date, 102, 1, None, 0, 'retirement', S))
    world.competitions[16] = Competition(16, 'Ligue 1', 'FRA', 1, [1, 2])
    summary = market_summary(world, S)
    assert (summary['total'], summary['paid'], summary['volume'], summary['median']) == (4, 2, 5_250_000, 5_000_000)
    assert summary['record'] == {'fee': 5_000_000, 'player_id': 201, 'player': world.players[201].name}
    weeks = summary['weeks']
    assert sum(week['count'] for week in weeks) == 4 and sum(week['volume'] for week in weeks) == 5_250_000
    assert [week['week'] for week in weeks] == sorted(week['week'] for week in weeks)
    # Every week opens on a Monday, in its window.
    assert all((Date.parse(week['week']).ordinal() - 1) % 7 == 0 for week in weeks)
    assert weeks[0]['summer'] and not weeks[-1]['summer']
    clubs = {entry['club']['id']: entry for entry in summary['clubs']}
    assert {key: clubs[1][key] for key in ('arrivals', 'departures', 'spent', 'earned')} == {'arrivals': 2, 'departures': 2, 'spent': 5_000_000, 'earned': 250_000}
    assert {key: clubs[2][key] for key in ('arrivals', 'departures', 'spent', 'earned')} == {'arrivals': 1, 'departures': 2, 'spent': 250_000, 'earned': 5_000_000}
    assert [entry['club']['id'] for entry in summary['clubs']] == [1, 2]
    # Both clubs play in the same league: it paid what it received.
    assert [(entry['id'], entry['name'], entry['arrivals'], entry['departures'], entry['spent'], entry['earned']) for entry in summary['leagues']] == [(16, 'Ligue 1', 3, 4, 5_250_000, 5_250_000)]
    # A club outside the simulated leagues counts for none of them, listed last.
    world.clubs[2].competition_id = None
    assert [(entry['id'], entry['name'], entry['spent']) for entry in market_summary(world, S)['leagues']] == [(16, 'Ligue 1', 5_000_000), (None, None, 250_000)]
    world.transfers = []
    empty = market_summary(world, S)
    assert (empty['total'], empty['volume'], empty['median'], empty['record'], empty['weeks'], empty['clubs']) == (0, 0, 0, None, [], [])


def test_academy_sort_uses_archived_values_before_pagination_and_keeps_unknown_last(config):
    from api.club_history import world_movements
    import pytest
    world = mini_world(config)
    S = world.season
    young = replace(world.players[102], id=999)
    apply(world, PlayerGenerated(young))
    original = world.transfers[0]
    world.transfers = [replace(original, player_id=1000+i, snapshot=replace(original.snapshot,
                        value=(i*17)%61, rating=40+i/2, potential_lower=50+i/2, potential_upper=60+i/2, potential=55+i/2)) for i in range(60)]
    world.transfers.append(replace(original, player_id=9000, snapshot=None))
    states = {name: rng.getstate() for name, rng in world.rngs.items()}
    for order in ('asc', 'desc'):
        pages = [world_movements(world, S, 'academy', page, 'value', order) for page in (1, 2)]
        details = [row['details'] for data in pages for row in data['items']]
        assert details[-1]['data_at'] == 'unknown'
        values = [item['value'] for item in details[:-1]]
        assert values == sorted(values, reverse=order == 'desc')
    for key in ('position','name','nation','age','rating','potential','club','value','wage','contract_end','fitness','promotion_date','academy_club','data_at'):
        assert world_movements(world, S, 'academy', 1, key)['total'] == 61
    assert {name: rng.getstate() for name, rng in world.rngs.items()} == states
    with pytest.raises(ValueError): world_movements(world, S, 'academy', 1, 'potential_estimate')
    with pytest.raises(ValueError): world_movements(world, S, 'retirement', 1, 'fee')


def test_squad_stats_only_count_current_season_and_current_club(config):
    from core.domain.world import SeasonRecord
    from api.views import squad_rows
    world = mini_world(config)
    S = world.season
    world.records = {
        'current': SeasonRecord(S, 101, 1, 16, minutes=123.8, matches=2, goals=3, assists=1, yellows=2, reds=1, rating_sum=15, rating_count=2),
        'old-club': SeasonRecord(S, 101, 2, 16, goals=20, matches=10),
        'old-season': SeasonRecord(S - 1, 101, 1, 16, goals=50, matches=30),
    }
    row = next(row for row in squad_rows(world, 1) if row['id'] == 101)
    assert (row['appearances'],row['minutes'],row['goals'],row['assists'],row['yellows'],row['reds'],row['average']) == (2,124,3,1,2,1,7.5)


def test_cash_accounts_reconcile_months_and_both_sides_of_transfer(config):
    world = mini_world(config)
    S = world.season
    opening = {cid: club.balance for cid, club in world.clubs.items()}
    for club in world.clubs.values(): club.income = 2000000
    apply(world, FinancePosted(1, 200, 0))
    apply(world, DateAdvanced(Date(S, 8, 1)))
    apply(world, FinancePosted(1, 500, 0))
    player = world.players[201]
    signing = PlayerSigned(player.id, 2, 1, player.contract, 50000)
    assert apply(world, signing)
    assert not apply(world, signing)
    for cid in (1, 2):
        data = finances(world, cid, S)
        assert data['opening_balance'] == opening[cid]
        assert data['closing_balance'] == world.clubs[cid].balance
        assert data['net'] == world.clubs[cid].balance - opening[cid]
        assert sum(row['revenue'] for row in data['entries']) == data['revenue']
        assert sum(row['expense'] for row in data['entries']) == data['expenses']
        assert sum('player_id' in row for row in data['entries']) == 1
    assert finances(world, 1, S)['totals']['transfer_expenses'] == 50000
    assert finances(world, 2, S)['totals']['transfer_income'] == 50000
    assert movements(world, 1, S, 1)['arrival_total'] == 50000
    assert movements(world, 2, S, 1)['departure_total'] == 50000


def test_end_of_contract_retirement_and_academy_keep_their_season_and_identity(config):
    world = mini_world(config)
    S = world.season
    world.movement_history_since = world.date
    young = replace(world.players[102], id=999, name='Jeune du club')
    apply(world, DateAdvanced(Date(S + 1, 7, 1)))
    apply(world, PlayerReleased(101))
    apply(world, PlayerReleased(102, retirement=True))
    world.season = S + 1
    assert apply(world, PlayerGenerated(young))
    world.journal.clear()  # The durable history does not rely on the UI journal.
    last = movements(world, 1, S, 1)
    current = movements(world, 1, S + 1, 1)
    assert [row['player_id'] for row in last['sections']['release']] == [101]
    assert [row['player_id'] for row in last['sections']['retirement']] == [102]
    assert last['sections']['retirement'][0]['player'] == world.retired[102]
    assert last['sections']['retirement'][0]['age'] == young.born.age_on(Date(S + 1, 7, 1))
    assert [row['player_id'] for row in current['sections']['academy']] == [999]
    assert not current['sections']['arrivals']
    assert last['previous_season'] is None and last['next_season'] == S + 1
    assert current['next_season'] is None and current['previous_season'] == S


def test_academy_snapshot_survives_progression_and_retirement(config):
    from api.club_history import world_movements
    from infrastructure.persistence.codec import encode, decode
    from infrastructure.persistence.typed_codec import ADAPTER, SaveEnvelope
    world = mini_world(config)
    S = world.season
    young = replace(world.players[102], id=999, name='Jeune archivé', born=Date(S - 17, 1, 1))
    assert apply(world, PlayerGenerated(young))
    before = world_movements(world, S, 'academy', 1)['items'][0]['details']
    assert before['age'] == 17 and before['data_at'] == 'promotion'
    assert before['wage'] == 1000 and before['nationalities']
    assert before['potential'] == round(young.potential, 1) >= young.rating
    young.rating = 99
    young.contract.weekly_wage = 9000
    world.date, world.season = Date(S + 5, 7, 1), S + 5
    apply(world, PlayerReleased(young.id, retirement=True))
    assert world_movements(world, S, 'academy', 1)['items'][0]['details'] == before
    assert movements(world, 1, S + 5, 1)['sections']['retirement'][0]['age'] == 22
    encoded = encode(world.transfers[0])
    assert decode(encoded) == world.transfers[0]
    encoded['fields'].pop('born'); encoded['fields'].pop('snapshot')
    assert decode(encoded).snapshot is None
    saved = ADAPTER.validate_json(ADAPTER.dump_json(SaveEnvelope(5, 'test', '3.12', '', world), by_alias=True))
    assert saved.world.transfers[0].snapshot == world.transfers[0].snapshot


def test_academy_potential_is_exact_sorted_and_recovered_for_snapshots_archived_earlier(config):
    from api.club_history import world_movements
    from infrastructure.persistence.codec import encode, decode
    world = mini_world(config)
    S = world.season
    young = replace(world.players[102], id=999, potential=88.5)
    assert apply(world, PlayerGenerated(young))
    record = world.transfers[0]
    assert record.snapshot.potential == 88.5
    details = lambda: world_movements(world, S, 'academy', 1)['items'][0]['details']
    assert details()['potential'] == 88.5
    legacy = replace(record, snapshot=replace(record.snapshot, potential=None))
    world.transfers = [legacy]
    assert details()['potential'] == 88.5  # A player still in the world keeps the same potential.
    del world.players[999]
    world.retired[999] = young.name
    assert details()['potential'] is None
    assert world_movements(world, S, 'academy', 1, 'potential')['total'] == 1
    encoded = encode(record.snapshot)
    del encoded['fields']['potential']
    assert decode(encoded).potential is None
    ranked = [replace(record, player_id=1000 + i, snapshot=replace(record.snapshot, potential=60 + (i * 7) % 40)) for i in range(5)]
    world.transfers = ranked + [replace(record, player_id=2000, snapshot=None)]
    for order in ('asc', 'desc'):
        rows = world_movements(world, S, 'academy', 1, 'potential', order)['items']
        values = [row['details'].get('potential') for row in rows]
        assert values[-1] is None
        assert values[:-1] == sorted(values[:-1], reverse=order == 'desc')


def test_archived_standings_only_use_selected_season_and_competition(config):
    from core.domain.clubs import Competition
    from core.domain.matches import Match, MatchResult
    from api.views import table
    world = mini_world(config)
    S = world.season
    world.competitions[16] = Competition(16, 'Test', 'FRA', 1, [1, 2])
    world.matches = {
        1: Match(1, 16, S, 1, Date(S, 8, 1), 1, 2, MatchResult(2, 0, 'test')),
        2: Match(2, 16, S + 1, 1, Date(S + 1, 8, 1), 1, 2, MatchResult(0, 4, 'test')),
        3: Match(3, 99, S, 1, Date(S, 8, 1), 1, 2, MatchResult(0, 9, 'test')),
    }
    rows = table(world, 16, S)
    assert len(rows) == 2
    assert [(row['club']['id'], row['points'], row['difference']) for row in rows] == [(1, 3, 2), (2, 0, -2)]
    assert all(row['played'] == 1 for row in rows)


def test_old_retirement_birthdate_requires_matching_source_hash(config, tmp_path):
    from hashlib import sha256
    from infrastructure.persistence.history_migration import recover_birthdates
    world = mini_world(config)
    S = world.season
    world.retired[999] = 'Ancien joueur'
    world.transfers = [TransferRecord(world.date, 999, 1, None, 0, 'retirement', S)]
    source = tmp_path / 'players.csv'
    source.write_text(f'UID;DateOfBirth\n999;{S - 35}-05-01\n', encoding='utf-8')
    recover_birthdates(world, source)
    assert world.transfers[0].born is None
    world.source_hashes['players.csv'] = sha256(source.read_bytes()).hexdigest()
    recover_birthdates(world, source)
    assert movements(world, 1, S, 1)['sections']['retirement'][0]['age'] == 35


def test_legacy_history_uses_evidence_and_does_not_invent_old_finances(config):
    world = mini_world(config)
    S = world.season
    old = Date(S, 7, 1)
    world.date, world.season = Date(S + 3, 7, 3), S + 3
    world.transfers = [TransferRecord(old, 101, 1, None, 0), TransferRecord(world.date, 102, 1, None, 0)]
    world.journal = [JournalEntry(world.date, 'release', 'Fin de contrat', 1, 102),
                     JournalEntry(world.date, 'academy', 'Promotion', 1, 103)]
    upgrade_history(world)
    assert world.transfers[0].kind == 'departure_unknown'
    assert world.transfers[1].kind == 'release'
    assert world.transfers[2].kind == 'academy'
    upgrade_history(world)
    assert len(world.transfers) == 3
    assert finances(world, 1, S)['available'] is False
    assert finances(world, 1, S)['since'] == f'{S + 3}-07-03'
