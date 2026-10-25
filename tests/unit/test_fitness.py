from dataclasses import replace
from random import Random

import pytest

from benchmarks.fixtures import synthetic_lineup
from core.ai.selection import LineupContext, select_lineup
from core.domain.clubs import Competition
from core.domain.matches import Match
from core.domain.players import ATTRIBUTE_NAMES, Injury, Position
from core.engine.fitness import consume, match_load, overload, projected_fitness, recovered_fitness, rested_load
from core.engine.local_state import TeamState
from core.world.application import apply
from core.world.player_states import daily_player_events
from test_market import mini_world


def with_endurance(player, value):
    values = list(player.attributes.values)
    values[ATTRIBUTE_NAMES.index("endurance")] = value
    return replace(player, attributes=replace(player.attributes, values=tuple(values)))


def test_recovery_is_quick_after_a_match_then_slows_and_a_week_restores_full_condition(config):
    player = with_endurance(synthetic_lineup(config, 1).slots[5].player, 50)
    days = [projected_fitness(player, player.position, 27, day, config) for day in range(8)]
    gains = [after - before for before, after in zip(days, days[1:])]
    assert all(later <= earlier for earlier, later in zip(gains, gains[1:]))
    # A match in midweek still weighs on the weekend; a week later it is gone.
    assert days[3] < 0.92 and days[7] == config.states.fitness.max
    # Endurance and youth recover faster, age slower.
    assert projected_fitness(with_endurance(player, 90), player.position, 27, 3, config) > days[3]
    assert projected_fitness(player, player.position, 20, 3, config) > days[3] > projected_fitness(player, player.position, 33, 3, config)
    # Near full condition the daily floor still brings him back.
    assert recovered_fitness(replace(player, fitness=0.99), 27, config) == config.states.fitness.max


def test_matches_every_three_days_settle_at_a_condition_below_full_that_endurance_raises(config):
    def settled(endurance):
        player, kickoffs = with_endurance(synthetic_lineup(config, 1).slots[5].player, endurance), []
        for _ in range(20):
            kickoffs.append(player.fitness)
            player = replace(player, fitness=projected_fitness(player, player.position, 27, 3, config))
        assert abs(kickoffs[-1] - kickoffs[-2]) < 0.005
        return kickoffs[-1]
    low, high = settled(25), settled(90)
    assert 0.6 < low < high < 0.97


def test_a_goalkeeper_barely_tires_during_a_match_and_is_fresh_two_days_later(config):
    team = TeamState.from_lineup(synthetic_lineup(config, 1), config)
    consume(team, config.engine.timing.match_seconds, config)
    keeper = next(slot for slot in team.active if slot.position == Position.GOALKEEPER).player
    outfield = next(slot for slot in team.active if slot.position == Position.CENTER_BACK).player
    # Same attributes, so the same endurance: in goal he spends only a share of what a defender spends.
    assert 1 - team.fitness[keeper.id] == pytest.approx((1 - team.fitness[outfield.id]) * config.states.fitness.goalkeeper_factor)
    assert team.fitness[keeper.id] > 0.9
    assert projected_fitness(keeper, Position.GOALKEEPER, 27, 2, config) == config.states.fitness.max


def full_match(config):
    """The condition a full match costs a player of average endurance with a balanced block."""
    rules = config.states.fitness
    return rules.cost_per_minute * rules.intensity.balanced * config.engine.timing.match_seconds / 60


def series(config, gaps):
    """A player's load just after each match of a series played with the given gaps between matches."""
    load, loads = 0.0, []
    for gap in gaps:
        for _ in range(gap): load = rested_load(load, config)
        load += match_load(full_match(config), config)
        loads.append(load)
    return loads


def test_only_a_loaded_series_goes_beyond_the_load_threshold(config):
    assert match_load(full_match(config), config) == pytest.approx(1)
    threshold = config.states.fitness.load_threshold
    # A whole season of weekly matches stays below; Saturdays and Wednesdays go beyond it within a few weeks.
    assert max(series(config, [7] * 40)) < threshold
    congested = series(config, [3, 4] * 5)
    assert congested[3] < threshold < congested[-1]
    # A player who stops playing forgets his series.
    load = congested[-1]
    for _ in range(90): load = rested_load(load, config)
    assert load == 0


def test_a_loaded_series_slows_recovery_and_raises_the_injury_risk(config):
    player = with_endurance(synthetic_lineup(config, 1).slots[5].player, 50)
    threshold = config.states.fitness.load_threshold
    tired = replace(player, fitness=0.6)
    gain = recovered_fitness(tired, 27, config) - tired.fitness
    assert recovered_fitness(tired, 27, config, load=threshold) - tired.fitness == pytest.approx(gain)
    slowed = recovered_fitness(tired, 27, config, load=threshold + 2) - tired.fitness
    assert slowed == pytest.approx(gain / (1 + 2 * config.states.fitness.load_slowdown))
    # The match he is about to play leaves him further from full condition three days later.
    assert projected_fitness(replace(player, load=threshold + 1), player.position, 27, 3, config) < projected_fitness(player, player.position, 27, 3, config)
    assert overload(threshold - 1, config) == 0 and overload(threshold + 2, config) == 2


def test_the_load_fades_every_day_for_the_injured_too(config):
    world = mini_world(config)
    world.rngs["states"] = Random(1)
    rested, injured = (world.players[pid] for pid in world.clubs[1].player_ids[:2])
    rested.load, injured.load = 6.0, 6.0
    injured.injury = Injury(world.date, world.date.add_days(30), "moyenne")
    for event in daily_player_events(world): apply(world, event)
    assert rested.load == injured.load == pytest.approx(6 * (1 - config.states.fitness.load_decay))


def test_starters_are_rested_before_a_european_match_they_would_reach_tired(config):
    club = mini_world(config).clubs[1]
    starters, reserves = synthetic_lineup(config, 1), synthetic_lineup(config, 2, level=66).bench
    players = [slot.player for slot in starters.slots] + reserves

    def eleven(european_in):
        context = LineupContext(club, players, 16, mini_world(config).date, 0, 10, european_in=european_in)
        return {slot.player.id for slot in select_lineup(context, config).slots}

    fresh = eleven(None)
    assert fresh == {slot.player.id for slot in starters.slots}
    # A week is enough to come back; two days are not, and close enough reserves take their places.
    assert eleven(7) == fresh
    rested = eleven(2)
    assert rested != fresh and rested - fresh <= {player.id for player in reserves}
    # A goalkeeper keeps his place: one match barely tires him.
    assert next(slot.player.id for slot in starters.slots if slot.position == Position.GOALKEEPER) in rested


def test_the_lineup_context_knows_when_the_clubs_next_match_is_european(config):
    world = mini_world(config)
    world.competitions = {16: Competition(16, "Ligue", "FRA", 1, [1, 2]),
                          40: Competition(40, "Coupe d'Europe", "EUR", 1, [1, 2], kind="europe")}
    world.matches = {1: Match(1, 16, world.season, 1, world.date, 1, 2),
                     2: Match(2, 40, world.season, 1, world.date.add_days(3), 2, 1)}
    assert LineupContext.from_world(world, 1, 16, world.date).european_in == 3
    # Not for the European match itself, nor when another match comes first.
    assert LineupContext.from_world(world, 1, 40, world.date).european_in is None
    world.matches[3] = Match(3, 16, world.season, 2, world.date.add_days(2), 1, 2)
    assert LineupContext.from_world(world, 1, 16, world.date).european_in is None


def test_an_older_save_takes_the_recalibrated_fatigue_rules_and_keeps_those_chosen(config, tmp_path):
    import gzip
    import hashlib
    import json
    from infrastructure.persistence.store import MIGRATION_DEFAULTS, SaveStore
    world = mini_world(config)
    # A competition the configuration does not describe, so that its size is not checked.
    world.competitions = {-16: Competition(-16, "Ligue", "FRA", 1, [1, 2])}
    for club in world.clubs.values(): club.competition_id = -16
    world.rngs = {key: Random(1) for key in ("market", "matches", "states", "progression", "demography")}
    store = SaveStore(tmp_path)
    path = store.save(world, "old")
    payload = json.loads(gzip.decompress(path.read_bytes()))
    payload["schema_version"] = 30
    rules = payload["world"]["config"]
    for introduced, config_path, defaults in MIGRATION_DEFAULTS:
        if introduced > 30:
            for key in defaults: del rules[config_path[0]][config_path[1]][key]
            if not rules[config_path[0]][config_path[1]]: del rules[config_path[0]][config_path[1]]  # A section introduced whole is absent, not empty.
    rules["etats"]["fatigue"].update(recuperation_base_par_jour=0.10, recuperation_facteur_endurance=0.05)
    rules["etats"]["blessures"].update(facteur_fatigue_max=1.9, probabilite_base_par_possession=0.0025)
    rules["moteur_match"]["notes_joueurs"]["arret"] = 0.10
    rules["ia_gestion"]["selection"]["seuil_rotation_fatigue"] = 0.7  # chosen by hand: kept
    payload["config_hash"] = hashlib.sha256(json.dumps(rules, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    for player in payload["world"]["players"].values(): player.pop("load", None)
    path.write_bytes(gzip.compress(json.dumps(payload).encode()))
    restored = store.load("old")
    cfg = restored.config
    assert all(player.load == 0 for player in restored.players.values())
    assert cfg.states.fitness == config.states.fitness
    assert cfg.states.injuries == config.states.injuries
    assert cfg.engine.player_ratings.saving == config.engine.player_ratings.saving
    assert cfg.management.selection.rotation_fitness == 0.7
