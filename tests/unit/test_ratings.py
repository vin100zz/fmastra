"""Duels between a carrier and a defender, and match ratings counting the danger each action adds or takes away."""
from collections import Counter
from dataclasses import replace

import pytest

from benchmarks.fixtures import synthetic_lineup
from core.domain.matches import PlayerMatchStats
from core.domain.players import ATTRIBUTE_NAMES, Attributes, Position
from core.engine.local_state import TeamState
from core.engine.match import PossessionEngine
from core.engine.danger import danger, turnover_danger
from core.engine.results import player_rating
from core.engine.zones import credited, duel_defender, duel_edge, involved_player, refresh
from core.randomness import side_stream, stream
from infrastructure.config.loader import config_payload, decode_config


def with_ratings(config, **changes):
    raw = config_payload(config)
    raw["moteur_match"]["notes_joueurs"].update(changes)
    return decode_config(raw)


def play(config, seed):
    return PossessionEngine().simulate(synthetic_lineup(config, 1, "4-4-2 plat"), synthetic_lineup(config, 2, "4-2-3-1"), config, stream(seed))


def test_the_side_stream_leaves_the_match_stream_untouched(config):
    rng = stream(4)
    state = rng.getstate()
    side = side_stream(rng, "ratings")
    assert rng.getstate() == state
    assert side.random() == side_stream(stream(4), "ratings").random() != stream(4).random()


def test_crediting_actions_differently_never_changes_the_play(config):
    other = with_ratings(config, sensibilite_qualite=0.3, danger_par_zone=[0.5, 0.6, 0.7, 0.8], part_tir=1.0,
                         part_defenseur_battu=0.0, echelle_par_poste={key: 5.0 for key in config.engine.player_ratings.scale},
                         faute=-1.0, but=2.0)
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


def test_the_better_player_carries_the_ball_and_meets_the_carrier_more_often(config):
    lineup = synthetic_lineup(config, 1)
    midfielders = [slot for slot in lineup.slots if slot.position == Position.CENTRAL_MIDFIELDER]
    backs = [slot for slot in lineup.slots if slot.position == Position.CENTER_BACK]
    for (good, poor), names in (((midfielders[0].player, midfielders[1].player), ("passe", "technique", "vision", "vitesse")),
                                ((backs[0].player, backs[1].player), ("placement", "tacle", "vitesse"))):
        for player, level in ((good, 85), (poor, 55)):
            player.attributes = Attributes(tuple(level if name in names else value
                                                 for name, value in zip(ATTRIBUTE_NAMES, player.attributes.values)))
    team = TeamState.from_lineup(lineup, config)
    refresh(team, config)
    rng = stream(12)
    carriers = Counter(involved_player(team, 1, 1, True, rng).player.id for _ in range(4000))
    markers = Counter(duel_defender(team, 0, 1, False, rng).player.id for _ in range(4000))
    assert carriers[midfielders[0].player.id] > 1.5 * carriers[midfielders[1].player.id]
    assert markers[backs[0].player.id] > 1.5 * markers[backs[1].player.id]
    # Better than the player the draw puts there on average, he adds to the duel; the weaker one takes away from it.
    assert duel_edge(team, midfielders[0], 1, 1, "progression_attack", config) > 0 > duel_edge(team, midfielders[1], 1, 1, "progression_attack", config)
    assert duel_edge(team, backs[0], 0, 1, "progression_defense", config) > 0 > duel_edge(team, backs[1], 0, 1, "progression_defense", config)


def test_a_side_of_equal_players_meets_every_duel_even(config):
    team = TeamState.from_lineup(synthetic_lineup(config, 1), config)
    refresh(team, config)
    for slot in team.active:
        for zone in range(len(config.involvement.zones)):
            assert duel_edge(team, slot, zone, 1, "progression_attack", config) == pytest.approx(0, abs=1e-9)
            assert duel_edge(team, slot, zone, 1, "creation_defense", config) == pytest.approx(0, abs=1e-9)


def test_danger_grows_towards_goal_and_a_turnover_gives_the_ball_away_with_it(config):
    zones = range(len(config.involvement.zones))
    assert [danger(config, zone, False) for zone in zones] == sorted(danger(config, zone, False) for zone in zones)
    assert all(danger(config, zone, True) >= danger(config, zone, False) for zone in zones)
    last = len(config.involvement.zones) - 1
    assert turnover_danger(config, 0, False) == pytest.approx(danger(config, 0, False) + config.engine.player_ratings.recovery_danger[last])


def test_rating_counts_danger_at_the_scale_of_the_position_and_never_the_result(config):
    rules = config.engine.player_ratings
    team, opponent = (TeamState.from_lineup(synthetic_lineup(config, club), config) for club in (1, 2))
    keeper, forward = team.active[0].player.id, next(slot.player.id for slot in team.active if slot.position == Position.STRIKER)
    for pid in (keeper, forward):
        team.roles[pid] = team.players[pid].position
        team.individual[pid] = PlayerMatchStats(minutes=90)
    team.threaten(forward, 0.4)
    team.individual[forward] = replace(team.individual[forward], goals=1)
    played = rules.base - rules.expected_per_minute[Position.STRIKER] * 90
    assert player_rating(team, forward, config) == pytest.approx(played + rules.scale[Position.STRIKER] * 0.4 + rules.goal)
    assert player_rating(team, keeper, config) == pytest.approx(rules.base - rules.expected_per_minute[Position.GOALKEEPER] * 90)
    team.goals, opponent.goals = 4, 0
    assert player_rating(team, keeper, config) == pytest.approx(rules.base - rules.expected_per_minute[Position.GOALKEEPER] * 90)
    team.individual[forward] = replace(team.individual[forward], minutes=45)
    assert player_rating(team, forward, config) == pytest.approx(
        rules.base - rules.expected_per_minute[Position.STRIKER] * 45 + rules.scale[Position.STRIKER] * 0.4 + rules.goal)


def test_every_position_is_rated_around_the_base_with_the_same_spread(config):
    from statistics import fmean, pstdev
    ratings = {}
    for seed in range(40):
        result = PossessionEngine().simulate(synthetic_lineup(config, 1), synthetic_lineup(config, 2), config, stream(seed, "spread"))
        for pid, position in result.home_lineup + result.away_lineup:
            if result.player_stats[pid].rating is not None: ratings.setdefault(position, []).append(result.player_stats[pid].rating)
    base = config.engine.player_ratings.base
    for position, values in ratings.items():
        assert abs(fmean(values) - base) < 0.3, position
        assert 0.35 < pstdev(values) < 1.1, position


def test_rating_rules_default_for_configurations_made_before_them(config):
    from infrastructure.persistence.store import MIGRATION_DEFAULTS, RATING_RECALIBRATED_RULES, _recalibrated
    added = [(path, defaults) for introduced, path, defaults in MIGRATION_DEFAULTS if introduced == 42]
    assert {path for path, _ in added} == {("moteur_match", "duels"), ("moteur_match", "notes_joueurs"), ("benchmarks", "stats_match"),
                                           ("ia_gestion", "selection")}
    raw = config_payload(config)
    for (domain, section), defaults in added:
        for key in defaults: del raw[domain][section][key]
        if not raw[domain][section]: del raw[domain][section]
    # As schema 41 shipped the rules that stay.
    raw["moteur_match"]["notes_joueurs"].update(base=6.5, but=0.8, passe_decisive=0.5)
    raw["etats"]["forme"].update(note_reference=6.5, sensibilite_note=0.06)
    raw["ia_gestion"]["valorisation"]["performance"].update(note_reference=6.5, ecart_note_plein=0.5)
    raw["benchmarks"]["stats_match"].update(note_moyenne_poste_min=6.4, note_moyenne_poste_max=6.6)
    older = decode_config(raw)
    # The model defaults and the save migration describe the rules as they ship; the recalibration brings the rest.
    assert _recalibrated(older, RATING_RECALIBRATED_RULES) == config


@pytest.mark.parametrize("key,value", [("danger_par_zone", [0.0, 0.1]), ("danger_contre_par_zone", [0.0, 0.1, 0.2, 1.5]),
                                       ("part_defenseur_battu", 1.5), ("echelle_par_poste", {"GB": 1.0}),
                                       ("sensibilite_qualite", -0.1)])
def test_incoherent_rating_rules_are_rejected(config, key, value):
    from core.config.consistency import ConfigError
    with pytest.raises(ConfigError):
        with_ratings(config, **{key: value})
