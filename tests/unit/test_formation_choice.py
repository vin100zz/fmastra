import json
from dataclasses import replace
from pathlib import Path
from random import Random

import pytest

from benchmarks.fixtures import synthetic_lineup
from core.ai.formation import best_formation, formation_value
from core.domain.players import Injury, Position
from core.world.application import apply
from core.world.events import ReserveChanged
from core.world.formations import formation_events
from infrastructure.config.loader import load_config
from test_market import mini_world

ROOT = Path(__file__).resolve().parents[2]


def squad(config, roles, level=70, club_id=1):
    """Players at the given positions, each at home there and barely able to play anywhere else."""
    template = synthetic_lineup(config, club_id).slots[0].player
    return [replace(template, id=club_id * 100 + index, position=Position(role), secondary_positions={},
                    position_ratings={position: 20 if position == Position(role) else 4 for position in Position})
            for index, role in enumerate(roles)]


def with_margin(tmp_path, margin):
    overrides = tmp_path / "overrides.json"
    overrides.write_text(json.dumps({"formations": {"choix": {"marge_changement": margin}}}), "utf-8")
    return load_config(ROOT / "config", overrides)


def test_a_squad_of_wingers_plays_with_wingers_and_one_without_them_does_not(config):
    wingers = squad(config, config.formations.formations["4-3-3"])
    assert best_formation(wingers, config) == "4-3-3"
    backs = squad(config, config.formations.formations["5-3-2"])
    assert best_formation(backs, config) == "5-3-2"
    assert formation_value(backs, "5-3-2", config) > formation_value(backs, "4-3-3", config)


def test_the_choice_does_not_depend_on_the_order_of_the_players(config):
    players = squad(config, ["GB", "DG", "DC", "DC", "DD", "MDC", "MDC", "AILG", "MOC", "AILD", "BU", "BU", "MC", "DC"])
    expected = best_formation(players, config)
    for seed in range(5):
        shuffled = players.copy()
        Random(seed).shuffle(shuffled)
        assert best_formation(shuffled, config) == expected


def test_a_club_keeps_its_formation_unless_another_does_better_by_the_margin(config, tmp_path):
    players = squad(config, config.formations.formations["4-3-3"])
    gain = formation_value(players, "4-3-3", config) - formation_value(players, "4-2-3-1", config)
    assert gain > 0
    assert best_formation(players, with_margin(tmp_path, gain + 0.01), "4-2-3-1") == "4-2-3-1"
    assert best_formation(players, with_margin(tmp_path, gain - 0.01), "4-2-3-1") == "4-3-3"
    # Never for a tie, even without margin.
    assert best_formation(players, with_margin(tmp_path, 0.0), "4-3-3") == "4-3-3"


def test_fewer_players_than_places_count_the_empty_places_as_nothing(config):
    players = squad(config, ["GB", "DC", "DC"])
    assert formation_value(players, "5-3-2", config) == formation_value(players, "4-4-2 plat", config) == pytest.approx(3 * 70 / 11)
    assert formation_value([], "4-3-3", config) == 0


def test_the_formation_is_chosen_again_only_when_the_first_team_changes(config):
    world = mini_world(config)
    for event in formation_events(world, margin=False): apply(world, event)
    assert formation_events(world) == []
    apply(world, ReserveChanged(210, True))
    assert [event.club_id for event in formation_events(world)] == [2]
    assert 210 not in formation_events(world)[0].squad


def test_a_long_injury_takes_a_player_out_of_the_choice_a_short_one_does_not(config):
    world = mini_world(config)
    for event in formation_events(world, margin=False): apply(world, event)
    days = config.formations.choice.long_injury_days
    world.players[205].injury = Injury(world.date, world.date.add_days(days), "legere")
    assert formation_events(world) == []
    world.players[205].injury = Injury(world.date, world.date.add_days(days + 1), "grave")
    assert [205 not in event.squad for event in formation_events(world)] == [True]


def test_the_human_club_chooses_its_own_formation(config):
    world = mini_world(config)
    world.controlled_club_id = 1
    world.clubs[1].formation = "5-4-1"
    for event in formation_events(world, margin=False): apply(world, event)
    assert world.clubs[1].formation == "5-4-1" and world.clubs[1].formation_squad == ()
    assert world.clubs[2].formation_squad
