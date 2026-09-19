from dataclasses import replace

from api.club_history import finances, movements
from core.domain.date import Date
from core.domain.world import JournalEntry, TransferRecord
from core.world.application import apply
from core.world.events import FinancePosted, PlayerSigned, PlayerReleased, PlayerGenerated, DateAdvanced
from infrastructure.persistence.history_migration import upgrade_history
from test_market import mini_world


def test_world_movements_include_dormant_clubs_and_paginate_each_type(config):
    from api.club_history import world_movements
    world = mini_world(config)
    world.clubs[2].competition_id = None
    world.transfers = [TransferRecord(world.date.add_days(day), 201, 2, 1, day * 100, 'transfer', 2025) for day in range(52)]
    world.transfers += [TransferRecord(world.date, 101, 1, None, 0, 'retirement', 2025),
                        TransferRecord(world.date, 202, None, 2, 0, 'academy', 2025),
                        TransferRecord(world.date, 102, 1, None, 0, 'release', 2025)]
    first = world_movements(world, 2025, 'transfer', 1)
    second = world_movements(world, 2025, 'transfer', 2)
    assert first['total'] == 53 and len(first['items']) == 50 and len(second['items']) == 3
    assert first['items'][0]['source']['id'] == 2
    for order in ('asc', 'desc'):
        pages = [world_movements(world, 2025, 'transfer', page, 'fee', order) for page in (1, 2)]
        fees = [row['fee'] for data in pages for row in data['items']]
        assert fees == sorted(fees, reverse=order == 'desc')
        assert all(data['sort'] == 'fee' and data['order'] == order for data in pages)
    assert world_movements(world, 2025, 'retirement', 1)['total'] == 1
    academy = world_movements(world, 2025, 'academy', 1)
    assert academy['total'] == 1 and academy['items'][0]['target']['id'] == 2


def test_academy_sort_uses_archived_values_before_pagination_and_keeps_unknown_last(config):
    from api.club_history import world_movements
    import pytest
    world = mini_world(config)
    young = replace(world.players[102], id=999)
    apply(world, PlayerGenerated(young))
    original = world.transfers[0]
    world.transfers = [replace(original, player_id=1000+i, snapshot=replace(original.snapshot,
                        value=(i*17)%61, rating=40+i/2, potential_lower=50+i/2, potential_upper=60+i/2, potential=55+i/2)) for i in range(60)]
    world.transfers.append(replace(original, player_id=9000, snapshot=None))
    states = {name: rng.getstate() for name, rng in world.rngs.items()}
    for order in ('asc', 'desc'):
        pages = [world_movements(world, 2025, 'academy', page, 'value', order) for page in (1, 2)]
        details = [row['details'] for data in pages for row in data['items']]
        assert details[-1]['data_at'] == 'unknown'
        values = [item['value'] for item in details[:-1]]
        assert values == sorted(values, reverse=order == 'desc')
    for key in ('position','name','nation','age','rating','potential','club','value','wage','contract_end','fitness','promotion_date','academy_club','data_at'):
        assert world_movements(world, 2025, 'academy', 1, key)['total'] == 61
    assert {name: rng.getstate() for name, rng in world.rngs.items()} == states
    with pytest.raises(ValueError): world_movements(world, 2025, 'academy', 1, 'potential_estimate')
    with pytest.raises(ValueError): world_movements(world, 2025, 'retirement', 1, 'fee')


def test_squad_stats_only_count_current_season_and_current_club(config):
    from core.domain.world import SeasonRecord
    from api.views import squad_rows
    world = mini_world(config)
    world.records = {
        'current': SeasonRecord(2025, 101, 1, 16, minutes=123.8, matches=2, goals=3, assists=1, yellows=2, reds=1, rating_sum=15, rating_count=2),
        'old-club': SeasonRecord(2025, 101, 2, 16, goals=20, matches=10),
        'old-season': SeasonRecord(2024, 101, 1, 16, goals=50, matches=30),
    }
    row = next(row for row in squad_rows(world, 1) if row['id'] == 101)
    assert (row['appearances'],row['minutes'],row['goals'],row['assists'],row['yellows'],row['reds'],row['average']) == (2,124,3,1,2,1,7.5)


def test_cash_accounts_reconcile_months_and_both_sides_of_transfer(config):
    world = mini_world(config)
    opening = {cid: club.balance for cid, club in world.clubs.items()}
    for club in world.clubs.values(): club.income = 2000000
    apply(world, FinancePosted(1, 200, 0))
    apply(world, DateAdvanced(Date(2025, 8, 1)))
    apply(world, FinancePosted(1, 500, 0))
    player = world.players[201]
    signing = PlayerSigned(player.id, 2, 1, player.contract, 50000)
    assert apply(world, signing)
    assert not apply(world, signing)
    for cid in (1, 2):
        data = finances(world, cid, 2025)
        assert data['opening_balance'] == opening[cid]
        assert data['closing_balance'] == world.clubs[cid].balance
        assert data['net'] == world.clubs[cid].balance - opening[cid]
        assert sum(row['revenue'] for row in data['entries']) == data['revenue']
        assert sum(row['expense'] for row in data['entries']) == data['expenses']
        assert sum('player_id' in row for row in data['entries']) == 1
    assert finances(world, 1, 2025)['totals']['transfer_expenses'] == 50000
    assert finances(world, 2, 2025)['totals']['transfer_income'] == 50000
    assert movements(world, 1, 2025, 1)['arrival_total'] == 50000
    assert movements(world, 2, 2025, 1)['departure_total'] == 50000


def test_end_of_contract_retirement_and_academy_keep_their_season_and_identity(config):
    world = mini_world(config)
    world.movement_history_since = world.date
    young = replace(world.players[102], id=999, name='Jeune du club')
    apply(world, DateAdvanced(Date(2026, 7, 1)))
    apply(world, PlayerReleased(101))
    apply(world, PlayerReleased(102, retirement=True))
    world.season = 2026
    assert apply(world, PlayerGenerated(young))
    world.journal.clear()  # The durable history does not rely on the UI journal.
    last = movements(world, 1, 2025, 1)
    current = movements(world, 1, 2026, 1)
    assert [row['player_id'] for row in last['sections']['release']] == [101]
    assert [row['player_id'] for row in last['sections']['retirement']] == [102]
    assert last['sections']['retirement'][0]['player'] == world.retired[102]
    assert last['sections']['retirement'][0]['age'] == young.born.age_on(Date(2026, 7, 1))
    assert [row['player_id'] for row in current['sections']['academy']] == [999]
    assert not current['sections']['arrivals']
    assert last['previous_season'] is None and last['next_season'] == 2026
    assert current['next_season'] is None and current['previous_season'] == 2025


def test_academy_snapshot_survives_progression_and_retirement(config):
    from api.club_history import world_movements
    from infrastructure.persistence.codec import encode, decode
    from infrastructure.persistence.typed_codec import ADAPTER, SaveEnvelope
    world = mini_world(config)
    young = replace(world.players[102], id=999, name='Jeune archivé', born=Date(2008, 1, 1))
    assert apply(world, PlayerGenerated(young))
    before = world_movements(world, 2025, 'academy', 1)['items'][0]['details']
    assert before['age'] == 17 and before['data_at'] == 'promotion'
    assert before['wage'] == 1000 and before['nationalities']
    assert before['potential'] == round(young.potential, 1) >= young.rating
    young.rating = 99
    young.contract.weekly_wage = 9000
    world.date, world.season = Date(2030, 7, 1), 2030
    apply(world, PlayerReleased(young.id, retirement=True))
    assert world_movements(world, 2025, 'academy', 1)['items'][0]['details'] == before
    assert movements(world, 1, 2030, 1)['sections']['retirement'][0]['age'] == 22
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
    young = replace(world.players[102], id=999, potential=88.5)
    assert apply(world, PlayerGenerated(young))
    record = world.transfers[0]
    assert record.snapshot.potential == 88.5
    details = lambda: world_movements(world, 2025, 'academy', 1)['items'][0]['details']
    assert details()['potential'] == 88.5
    legacy = replace(record, snapshot=replace(record.snapshot, potential=None))
    world.transfers = [legacy]
    assert details()['potential'] == 88.5  # A player still in the world keeps the same potential.
    del world.players[999]
    world.retired[999] = young.name
    assert details()['potential'] is None
    assert world_movements(world, 2025, 'academy', 1, 'potential')['total'] == 1
    encoded = encode(record.snapshot)
    del encoded['fields']['potential']
    assert decode(encoded).potential is None
    ranked = [replace(record, player_id=1000 + i, snapshot=replace(record.snapshot, potential=60 + (i * 7) % 40)) for i in range(5)]
    world.transfers = ranked + [replace(record, player_id=2000, snapshot=None)]
    for order in ('asc', 'desc'):
        rows = world_movements(world, 2025, 'academy', 1, 'potential', order)['items']
        values = [row['details'].get('potential') for row in rows]
        assert values[-1] is None
        assert values[:-1] == sorted(values[:-1], reverse=order == 'desc')


def test_archived_standings_only_use_selected_season_and_competition(config):
    from core.domain.clubs import Competition
    from core.domain.matches import Match, MatchResult
    from api.views import table
    world = mini_world(config)
    world.competitions[16] = Competition(16, 'Test', 'FRA', 1, [1, 2])
    world.matches = {
        1: Match(1, 16, 2025, 1, Date(2025, 8, 1), 1, 2, MatchResult(2, 0, 'test')),
        2: Match(2, 16, 2026, 1, Date(2026, 8, 1), 1, 2, MatchResult(0, 4, 'test')),
        3: Match(3, 99, 2025, 1, Date(2025, 8, 1), 1, 2, MatchResult(0, 9, 'test')),
    }
    rows = table(world, 16, 2025)
    assert len(rows) == 2
    assert [(row['club']['id'], row['points'], row['difference']) for row in rows] == [(1, 3, 2), (2, 0, -2)]
    assert all(row['played'] == 1 for row in rows)


def test_old_retirement_birthdate_requires_matching_source_hash(config, tmp_path):
    from hashlib import sha256
    from infrastructure.persistence.history_migration import recover_birthdates
    world = mini_world(config)
    world.retired[999] = 'Ancien joueur'
    world.transfers = [TransferRecord(world.date, 999, 1, None, 0, 'retirement', 2025)]
    source = tmp_path / 'players.csv'
    source.write_text('UID;DateOfBirth\n999;1990-05-01\n', encoding='utf-8')
    recover_birthdates(world, source)
    assert world.transfers[0].born is None
    world.source_hashes['players.csv'] = sha256(source.read_bytes()).hexdigest()
    recover_birthdates(world, source)
    assert movements(world, 1, 2025, 1)['sections']['retirement'][0]['age'] == 35


def test_legacy_history_uses_evidence_and_does_not_invent_old_finances(config):
    world = mini_world(config)
    old = Date(2025, 7, 1)
    world.date, world.season = Date(2028, 7, 3), 2028
    world.transfers = [TransferRecord(old, 101, 1, None, 0), TransferRecord(world.date, 102, 1, None, 0)]
    world.journal = [JournalEntry(world.date, 'release', 'Fin de contrat', 1, 102),
                     JournalEntry(world.date, 'academy', 'Promotion', 1, 103)]
    upgrade_history(world)
    assert world.transfers[0].kind == 'departure_unknown'
    assert world.transfers[1].kind == 'release'
    assert world.transfers[2].kind == 'academy'
    upgrade_history(world)
    assert len(world.transfers) == 3
    assert finances(world, 1, 2025)['available'] is False
    assert finances(world, 1, 2025)['since'] == '2028-07-03'
