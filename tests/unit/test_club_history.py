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
    assert world_movements(world, 2025, 'retirement', 1)['total'] == 1
    academy = world_movements(world, 2025, 'academy', 1)
    assert academy['total'] == 1 and academy['items'][0]['target']['id'] == 2


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
    assert [row['player_id'] for row in current['sections']['academy']] == [999]
    assert not current['sections']['arrivals']
    assert last['previous_season'] is None and last['next_season'] == 2026
    assert current['next_season'] is None and current['previous_season'] == 2025


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
