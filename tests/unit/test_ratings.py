"""Match ratings credited action by action, on their own random stream."""
from collections import Counter
from dataclasses import replace

import pytest

from benchmarks.fixtures import synthetic_lineup
from core.domain.matches import PlayerMatchStats
from core.domain.players import ATTRIBUTE_NAMES, Attributes, Position
from core.engine.local_state import TeamState
from core.engine.match import PossessionEngine
from core.engine.results import player_rating
from core.engine.zones import credited, refresh
from core.randomness import side_stream, stream
from infrastructure.config.loader import config_payload, decode_config


def with_ratings(config, **changes):
    raw = config_payload(config)
    raw["moteur_match"]["notes_joueurs"].update(changes)
    return decode_config(raw)


def play(config, seed):
    return PossessionEngine().simulate(synthetic_lineup(config, 1, "4-4-2"), synthetic_lineup(config, 2, "4-2-3-1"), config, stream(seed))


def test_the_side_stream_leaves_the_match_stream_untouched(config):
    rng = stream(4)
    state = rng.getstate()
    side = side_stream(rng, "ratings")
    assert rng.getstate() == state
    assert side.random() == side_stream(stream(4), "ratings").random() != stream(4).random()


def test_crediting_actions_differently_never_changes_the_play(config):
    other = with_ratings(config, sensibilite_qualite=0.3, part_dribbles=0.9, part_non_cadres_contres=1.0,
                         recuperation_par_zone=[1.0, 1.0, 1.0, 1.0], attendu_par_minute=0.0)
    for seed in range(4):
        played, credited_otherwise = play(config, seed), play(other, seed)
        assert (played.home_goals, played.away_goals) == (credited_otherwise.home_goals, credited_otherwise.away_goals)
        assert played.home_stats == credited_otherwise.home_stats and played.away_stats == credited_otherwise.away_stats
        assert ([(event.kind, event.second, event.shot_id) for event in played.events]
                == [(event.kind, event.second, event.shot_id) for event in credited_otherwise.events])


def test_nobody_sits_at_the_base_rating_any_more(config):
    ratings = [stats.rating for seed in range(3) for stats in play(config, seed).player_stats.values() if stats.rating is not None]
    assert ratings and all(rating != config.engine.player_ratings.base for rating in ratings)


def test_the_better_defender_wins_the_ball_more_often_and_loses_the_duel_less(config):
    lineup = synthetic_lineup(config, 1)
    backs = [slot for slot in lineup.slots if slot.position == Position.CENTER_BACK]
    good, poor = backs[0].player, backs[1].player
    for player, level in ((good, 85), (poor, 55)):
        player.attributes = Attributes(tuple(level if name in ("placement", "tacle", "vitesse") else value
                                             for name, value in zip(ATTRIBUTE_NAMES, player.attributes.values)))
    team = TeamState.from_lineup(lineup, config)
    refresh(team, config)
    rng = stream(11)
    wins = Counter(credited(team, "progression_defense", 0, 1, True, rng) for _ in range(4000))
    beaten = Counter(credited(team, "progression_defense", 0, 1, False, rng) for _ in range(4000))
    assert wins[good.id] > 2 * wins[poor.id]
    assert beaten[poor.id] > 2 * beaten[good.id]
    assert team.active[0].player.id not in Counter(credited(team, "creation_defense", 0, 1, False, rng, outfield=True)
                                                   for _ in range(500))


def test_rating_adds_credits_minutes_result_and_the_clean_sheet_by_depth(config):
    rules = config.engine.player_ratings
    team, opponent = (TeamState.from_lineup(synthetic_lineup(config, club), config) for club in (1, 2))
    keeper, forward = team.active[0].player.id, next(slot.player.id for slot in team.active if slot.position == Position.STRIKER)
    for pid in (keeper, forward):
        team.roles[pid] = team.players[pid].position
        team.individual[pid] = PlayerMatchStats(minutes=90)
    team.credit(forward, 0.4)
    team.goals = 1
    played = rules.base - rules.expected_per_minute * 90 + rules.win
    assert player_rating(team, opponent, forward, config) == pytest.approx(played + 0.4)
    assert player_rating(team, opponent, keeper, config) == pytest.approx(played + rules.clean_sheet)
    opponent.goals = 1
    assert player_rating(team, opponent, keeper, config) == pytest.approx(rules.base - rules.expected_per_minute * 90)
    team.individual[forward] = replace(team.individual[forward], minutes=45)
    opponent.goals = 2
    assert player_rating(team, opponent, forward, config) == pytest.approx(
        rules.base - rules.expected_per_minute * 45 - rules.win / 2 + 0.4)


def test_rating_rules_default_for_configurations_made_before_them(config):
    from infrastructure.persistence.store import MIGRATION_DEFAULTS
    added = [(path, defaults) for introduced, path, defaults in MIGRATION_DEFAULTS if introduced == 18]
    assert {path for path, _ in added} == {("moteur_match", "notes_joueurs"), ("benchmarks", "stats_match")}
    raw = config_payload(config)
    for (domain, section), defaults in added:
        for key in defaults: del raw[domain][section][key]
    older = decode_config(raw)
    # The model defaults, the save migration and the shipped configuration describe the same rules.
    assert older == config
    restored = config_payload(older)
    for (domain, section), defaults in added:
        assert {key: restored[domain][section][key] for key in defaults} == defaults


@pytest.mark.parametrize("key,value", [("progression_par_zone", [0.0, 0.1]), ("part_dribbles", 1.0),
                                       ("part_non_cadres_contres", 1.5), ("sensibilite_qualite", -0.1)])
def test_incoherent_rating_rules_are_rejected(config, key, value):
    from core.config.consistency import ConfigError
    with pytest.raises(ConfigError):
        with_ratings(config, **{key: value})
