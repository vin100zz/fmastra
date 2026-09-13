from pathlib import Path
from collections import Counter
import pytest
from core.world.importation.source_positions import parse_positions
from core.world.importation.selection import select_squad
from infrastructure.importation.loader import import_world
from infrastructure.importation.readers import read_sources

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def imported(config):
    return import_world(ROOT / "data", config, 123)


@pytest.mark.slow
def test_real_source_import(imported, config):
    assert len(imported.players) == 25911
    assert len(imported.active_clubs()) == 96
    assert imported.import_summary["active_players"] == 2880
    assert imported.import_summary["free_agents"] == 2808
    assert len(imported.excluded_player_ids) == 6458
    assert len(imported.matches) == 1752
    assert all(len(club.player_ids) <= 30 for club in imported.clubs.values())
    assert all(club.wage_bill <= club.wage_cap for club in imported.clubs.values())
    assert all(player.rating <= player.potential <= 100 for player in imported.players.values())
    assert not set(imported.players) & set(imported.excluded_player_ids)
    for club in imported.active_clubs():
        assert sum(imported.players[pid].position == "GB" for pid in club.player_ids) >= 2


def test_calendar_pairs_and_dates(imported):
    for competition in imported.competitions.values():
        matches = [imported.matches[mid] for mid in competition.match_ids]
        pairs = Counter((match.home_id, match.away_id) for match in matches)
        assert len(pairs) == len(competition.club_ids) * (len(competition.club_ids) - 1)
        assert set(pairs.values()) == {1}
        appearances = Counter((match.date, club_id) for match in matches for club_id in (match.home_id, match.away_id))
        assert set(appearances.values()) == {1}


def test_all_source_position_forms(config):
    _, players, _ = read_sources(ROOT / "data", config)
    for source in {player.positions for player in players}:
        assert parse_positions(source)
    with pytest.raises(ValueError): parse_positions("D banana")


def test_selection_order_independent(imported, config):
    club = imported.active_clubs()[0]
    squad = [imported.players[pid] for pid in club.player_ids]
    first, _ = select_squad(squad, 18, 2)
    second, _ = select_squad(list(reversed(squad)), 18, 2)
    assert [player.id for player in first] == [player.id for player in second]


def test_source_order_independent(config):
    from core.world.importation.construction import create_player
    from core.domain.date import Date
    _, players, _ = read_sources(ROOT / "data", config)
    chosen = players[:20]
    first = {row.id: create_player(row, config, 42, Date(2025, 7, 1), Counter()).attributes for row in chosen}
    second = {row.id: create_player(row, config, 42, Date(2025, 7, 1), Counter()).attributes for row in reversed(chosen)}
    assert first == second
