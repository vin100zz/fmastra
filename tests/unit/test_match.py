from copy import deepcopy
from dataclasses import asdict
import pytest

from core.engine.match import PossessionEngine
from core.engine.local_state import TeamState
from core.engine.zones import mirror, refresh
from core.randomness import stream
from benchmarks.fixtures import synthetic_lineup


def test_detailed_match_ledgers_and_no_world_mutation(config):
    home, away = synthetic_lineup(config, 1), synthetic_lineup(config, 2)
    before = deepcopy((home, away))
    result = PossessionEngine().simulate(home, away, config, stream(123))
    assert (home, away) == before
    assert result == PossessionEngine().simulate(home, away, config, stream(123))
    assert result.home_goals + result.away_goals == sum(event.kind == "goal" for event in result.events)
    assert result.home_stats.shots + result.away_stats.shots == sum(event.kind == "shot" for event in result.events)
    assert result.home_stats.on_target <= result.home_stats.shots
    assert result.home_stats.xg == pytest.approx(sum(event.xg for event in result.events if event.kind == "shot" and event.team_id == 1))
    assert [event.sequence for event in result.events] == list(range(len(result.events)))
    assert [event.second for event in result.events] == sorted(event.second for event in result.events)
    assert abs(result.home_stats.possession_seconds + result.away_stats.possession_seconds - result.duration) < 1
    assert all(0 <= stats.final_fitness <= 1 for stats in result.player_stats.values())
    for team_id, lineup in ((1, home), (2, away)):
        changes = [event for event in result.events if event.kind == "substitution" and event.team_id == team_id]
        assert len(changes) <= config.world.match_rules.max_substitutions
        assert len({event.secondary_id for event in changes}) == len(changes)


def test_empty_zone_and_coordinate_involution(config):
    team = TeamState.from_lineup(synthetic_lineup(config, 1), config)
    team.active.clear()
    refresh(team, config)
    assert all(value == 0 for table in team.zones.values() for row in table for value in row)
    for zone in range(4):
        for lane in range(3):
            assert mirror(*mirror(zone, lane, config), config) == (zone, lane)
