from copy import deepcopy
from dataclasses import replace
from random import Random

from benchmarks.fixtures import synthetic_lineup
from core.ai.controller import AIController
from core.ai.playing_time import playing_time_priorities
from core.ai.selection import LineupContext, select_lineup
from core.ai.substitutions import choose_substitution
from core.domain.date import Date
from core.domain.matches import PlayingTimePriority
from core.domain.players import Position
from core.engine.local_state import MatchLog, TeamState
from core.engine.match import PossessionEngine
from core.engine.personnel import substitutions, injure
from test_market import mini_world


def test_playing_time_and_youth_can_trigger_without_exhaustion(config):
    team = TeamState.from_lineup(synthetic_lineup(config, 1), config)
    candidate = team.bench[-1]
    for slot in team.active:
        team.fitness[slot.player.id] = 0.91
    assert choose_substitution(team, config, minute=60) is None
    team.playing_time[candidate.id] = PlayingTimePriority(satisfaction=1)
    assert choose_substitution(team, config, minute=60).incoming_id == candidate.id
    team.playing_time[candidate.id] = PlayingTimePriority(development=1)
    assert choose_substitution(team, config, minute=60).incoming_id == candidate.id
    assert choose_substitution(team, config, minute=60, goal_difference=-1) is None


def test_comfortable_lead_allows_useful_minutes_for_slightly_weaker_youngster(config):
    team = TeamState.from_lineup(synthetic_lineup(config, 1), config)
    candidate = replace(team.bench[-1], attributes=replace(team.bench[-1].attributes, values=(68.0,) * 13), rating=68)
    team.bench = [candidate]
    team.playing_time[candidate.id] = PlayingTimePriority(1, 1)
    assert choose_substitution(team, config, minute=60) is None
    assert choose_substitution(team, config, minute=60, goal_difference=2).incoming_id == candidate.id
    assert choose_substitution(team, config, minute=89, goal_difference=2) is None
    assert choose_substitution(team, config, minute=20, goal_difference=2) is None


def test_rotation_protects_positions_quality_and_goalkeepers(config):
    team = TeamState.from_lineup(synthetic_lineup(config, 1), config)
    for slot in team.active:
        team.fitness[slot.player.id] = 0.7
    keeper = team.active[0].player
    team.fitness[keeper.id] = 0.1
    team.bench = [team.bench[0]]
    assert choose_substitution(team, config, minute=60, goal_difference=3) is None
    assert choose_substitution(team, config, keeper.id, minute=1).incoming_id == team.bench[0].id
    candidate = replace(synthetic_lineup(config, 1).bench[-1], secondary_positions={},
                        position_ratings={role.value: 1 for role in Position})
    team.bench = [candidate]
    team.fitness[keeper.id] = 1
    team.playing_time[candidate.id] = PlayingTimePriority(1, 1)
    assert choose_substitution(team, config, minute=60, goal_difference=3) is None
    candidate.position_ratings = {}
    candidate.secondary_positions = {role: 1 for role in Position}
    candidate.attributes = replace(candidate.attributes, values=(30.0,) * 13)
    assert choose_substitution(team, config, minute=60, goal_difference=3) is None


def test_batches_cooldown_and_injury_priority(config):
    team = TeamState.from_lineup(synthetic_lineup(config, 1), config)
    for slot in team.active:
        team.fitness[slot.player.id] = 0.75
    log, controller = MatchLog(second=56 * 60), AIController(config, Random(1))
    assert substitutions(team, log, config, controller) == 2
    assert team.windows == 1
    entrants = {event.secondary_id for event in log.events}
    log.second = 61 * 60
    assert substitutions(team, log, config, controller) == 0
    # An injury bypasses the optional-rotation cooldown, even to a substitute.
    injured = min(entrants)
    assert injure(team, injured, log, config, controller) == 1
    assert all(slot.player.id != injured for slot in team.active)
    log.second = 72 * 60
    assert substitutions(team, log, config, controller) == 2
    assert team.substituted == 5 and team.windows == 3
    assert not entrants & {event.player_id for event in log.events if event.kind == "substitution" and event.player_id != injured}
    assert substitutions(team, log, config, controller) == 0


def test_halftime_does_not_spend_window_and_empty_bench_is_safe(config):
    team = TeamState.from_lineup(synthetic_lineup(config, 1), config)
    team.fitness[team.active[1].player.id] = .4
    log, controller = MatchLog(second=46 * 60), AIController(config, Random(1))
    assert substitutions(team, log, config, controller, halftime=True) == 1
    assert team.substituted == 1 and team.windows == 0
    team.bench.clear()
    assert choose_substitution(team, config, minute=60) is None


def test_priority_tracks_minutes_age_and_estimated_not_true_potential(config, monkeypatch):
    world = mini_world(config)
    club = world.clubs[1]
    young = replace(world.players[101], born=Date(2007, 1, 1), potential=100)
    from core.world.estimates import PotentialEstimate
    observed = []
    def estimate(player, date, seed, cfg, observer_id, reputation):
        observed.append((seed, observer_id))
        return PotentialEstimate(70, 90, 100)
    monkeypatch.setattr("core.ai.playing_time.estimate_potential", estimate)
    def priority(player, games=10):
        return playing_time_priorities([player], club, world.date, world.seed, games, config)[player.id]
    before = priority(young)
    assert before.satisfaction == 1 and before.development > 0
    assert priority(replace(young, potential=70)) == before
    assert priority(young, 0).satisfaction == 0
    played = priority(replace(young, season_minutes=900, monthly_minutes=400))
    assert played.satisfaction == played.development == 0
    assert priority(replace(young, born=Date(1990, 1, 1))).development == 0
    assert observed and all(item == (world.seed, club.id) for item in observed)


def test_bench_can_include_overlooked_youngster_without_changing_starting_eleven(config, monkeypatch):
    world = mini_world(config)
    club = world.clubs[1]
    players = [world.players[pid] for pid in club.player_ids]
    youngster = replace(players[-1], id=999, born=Date(2007, 1, 1), rating=68,
                        attributes=replace(players[-1].attributes, values=(68.0,) * 13))
    players.append(youngster)
    context = LineupContext(club, players, 16, world.date, world.seed, 10)
    from core.world.estimates import PotentialEstimate
    monkeypatch.setattr("core.ai.playing_time.estimate_potential", lambda *args: PotentialEstimate(68, 95, 100))
    before = deepcopy(players)
    lineup = select_lineup(context, config)
    assert youngster.id in {player.id for player in lineup.bench}
    assert youngster.id not in {slot.player.id for slot in lineup.slots}
    assert len(lineup.bench) == config.world.match_rules.bench_size
    assert sum(player.position == Position.GOALKEEPER for player in lineup.bench) == 1
    assert len({p.id for p in lineup.bench} | {slot.player.id for slot in lineup.slots}) == 20
    assert players == before


def test_detailed_matches_use_bench_within_legal_windows(config):
    engine = PossessionEngine()
    lineups = synthetic_lineup(config, 1), synthetic_lineup(config, 2)
    before = deepcopy(lineups)
    for seed in range(12):
        result = engine.simulate(*lineups, config, Random(seed))
        for team in (1, 2):
            changes = [event for event in result.events if event.kind == "substitution" and event.team_id == team]
            assert 3 <= len(changes) <= 5
            assert len({event.secondary_id for event in changes}) == len(changes)
            assert len({event.second for event in changes}) <= 3
    assert lineups == before
