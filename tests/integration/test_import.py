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
    assert len(imported.players) == 14440
    assert len(imported.competitions) == 16
    assert len(imported.active_clubs()) == 216
    assert imported.import_summary["active_players"] == 6405
    assert imported.import_summary["squad_completion_players"] == 39
    assert imported.import_summary["free_agents"] == 186
    assert len(imported.excluded_player_ids) == 3
    assert len(imported.matches) == 4064 + 5 * 32
    assert len(imported.competitions[18].club_ids) == 18
    assert imported.clubs[825].competition_id == 18  # Cannes completes the National.
    assert len(imported.competitions[18].match_ids) == 306
    assert all(len(club.player_ids) <= 30 for club in imported.clubs.values())
    assert all(club.wage_bill <= club.wage_cap for club in imported.clubs.values())
    assert all(player.rating <= player.potential <= 100 for player in imported.players.values())
    assert not set(imported.players) & set(imported.excluded_player_ids)
    for club in imported.active_clubs():
        assert sum(imported.players[pid].position == "GB" for pid in club.player_ids) >= 2
        assert len(club.player_ids) >= config.management.guardrails.min_squad


def test_calendar_pairs_and_dates(imported):
    for competition in imported.competitions.values():
        if competition.kind != "league":
            continue
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


def test_supplied_attributes_abilities_and_positions(imported, config):
    from dataclasses import replace
    from core.world.importation.construction import create_player
    from core.domain.players import Position
    clubs, rows, _ = read_sources(ROOT / "data", config)
    assert all(imported.clubs[row.id].reputation == row.reputation / 100 for row in clubs)
    source = next(row for row in rows if row.id == 85139014)
    player = imported.players[source.id]
    assert player.attributes.get("finition") == 18 * 5
    assert player.attributes.get("vitesse") == 19 * 5
    assert player.source_current_ability == 195 and player.source_potential_ability == 197
    assert player.potential - player.rating == pytest.approx(1)
    assert player.affinity(Position.LEFT_WINGER) == 1
    assert player.affinity(Position.STRIKER) == .9
    assert player.affinity(Position.CENTER_BACK) == .05
    changed = create_player(replace(source, value=1, wage=1), config, 999, imported.date, Counter())
    assert (changed.attributes, changed.rating, changed.potential) == (player.attributes, player.rating, player.potential)
    reached = create_player(replace(source, potential_ability=195), config, 999, imported.date, Counter())
    assert reached.potential == reached.rating
    assert imported.clubs[868].training_facilities == 20
    assert imported.clubs[868].youth_recruitment == 19


def test_recruitment_improves_intakes_but_training_is_informational(imported):
    from dataclasses import replace
    from random import Random
    from statistics import mean
    from core.world.demography import draw_level, generate_player
    from core.domain.players import Position
    for competition in (16, None):
        club = replace(imported.clubs[868], competition_id=competition, youth_recruitment=1)
        strong = replace(club, youth_recruitment=20)
        low = [draw_level(imported, club, Random(seed))[1] for seed in range(500)]
        high = [draw_level(imported, strong, Random(seed))[1] for seed in range(500)]
        assert mean(high) > mean(low) + 15
        assert sum(value >= 80 for value in high) > sum(value >= 80 for value in low)
        # Check the final bucket-constrained generation too, not only its first draw.
        weak = [generate_player(imported, 999, club, Position.STRIKER, 'FRA', Random(seed), (40, 60)).potential for seed in range(100)]
        best = [generate_player(imported, 999, strong, Position.STRIKER, 'FRA', Random(seed), (40, 60)).potential for seed in range(100)]
        assert mean(best) > mean(weak)
        assert draw_level(imported, strong, Random(12)) == draw_level(imported, replace(strong, training_facilities=1), Random(12))


def test_ca_pa_margin_changes_monthly_progression(imported, config):
    from copy import deepcopy
    from core.domain.date import Date
    from core.world.player_states import monthly_player_events
    from core.domain.world import World
    from random import Random
    player = deepcopy(imported.players[85139014])
    player.born = Date(2007, 1, 1)
    player.club_id = None
    player.contract = None
    world = World(imported.date, imported.season, 1, config, {player.id: player}, {}, {}, {}, 9999999999)
    world.rngs['progression'] = Random(1)
    player.potential = player.rating
    reached = monthly_player_events(world)[0].rating
    world.rngs['progression'] = Random(1)
    player.potential = min(100, player.rating + (200 - 180) / 2)
    assert monthly_player_events(world)[0].rating > reached
