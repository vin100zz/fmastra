from dataclasses import replace
from random import Random

from benchmarks.fixtures import synthetic_lineup
from core.domain.date import Date
from core.world.estimates import (deviation, estimate_level, estimate_potential, from_stars, imported_exposure, match_weight,
                                  shown_stars, stars_of, to_stars)

TODAY = Date(2026, 7, 1)


def young(config, born=2011, potential=80.0, rating=50.0, exposure=0.0):
    player = synthetic_lineup(config, 1).slots[0].player
    return replace(player, born=Date(born, 1, 1), potential=potential, rating=rating, exposure=exposure, club_id=7)


def test_the_scale_of_stars_runs_through_its_thresholds_both_ways(config):
    rules = config.attributes.stars
    assert to_stars(rules.floor, config) == 0.5 and to_stars(0, config) == 0.5
    for index, value in enumerate(rules.thresholds):
        assert to_stars(value, config) == 1 + index / 2
        assert from_stars(1 + index / 2, config) == value
        assert stars_of(value, config) == 1 + index / 2 and stars_of(value - 0.01, config) == 0.5 + index / 2
    assert to_stars(config.attributes.bounds.max, config) == rules.top
    # A screen never shows more than five stars, nor less than half of one.
    assert shown_stars(5.7) == 5 and shown_stars(0.1) == 0.5


def test_the_error_shrinks_with_age_what_he_played_and_whose_he_is(config):
    rules = config.demography.potential_estimate
    child, grown = young(config, born=2011), young(config, born=2000)
    assert deviation(child, TODAY, config) > deviation(young(config, born=2008), TODAY, config) > deviation(grown, TODAY, config)
    seen = young(config, exposure=rules.exposure.reference_matches)
    assert abs(deviation(seen, TODAY, config) - (1 - rules.exposure.max_reduction) * deviation(child, TODAY, config)) < 1e-9
    assert deviation(child, TODAY, config, 7) == deviation(child, TODAY, config) * rules.own_club
    # A reputed club sees closer to the truth; nobody is ever sure to the last star.
    assert deviation(child, TODAY, config, 3, 90) < deviation(child, TODAY, config, 3, 10)
    assert deviation(replace(grown, exposure=1000), TODAY, config, 7, 100) == rules.min_deviation


def test_an_estimate_is_stable_never_under_his_level_and_holds_its_band(config):
    for player_id in range(60):
        player = replace(young(config), id=player_id)
        estimate = estimate_potential(player, TODAY, 3, config)
        assert estimate == estimate_potential(player, TODAY, 3, config)
        assert player.rating <= estimate.lower <= estimate.center <= estimate.upper <= config.attributes.bounds.max
        level = estimate_level(player, TODAY, 3, config)
        assert abs(to_stars(level.center, config) - to_stars(player.rating, config)) <= 2 * level.deviation + 1e-9


def test_five_stars_seen_in_an_unknown_child_are_a_gamble_not_in_a_player_who_plays(config):
    """Among young players shown five stars, how many truly are: few among children nobody has seen play, most among
    those who already play in a first team."""
    rng = Random(4)
    # Many more ordinary young players than great ones, as in the import.
    pool = rng.choices((45.0, 50.0, 55.0, 60.0, 66.0, 71.0, 76.0, 84.0, 90.0), (25, 20, 15, 12, 10, 7, 5, 4, 2), k=4000)
    def truly_great(born, exposure):
        shown = [potential for player_id, potential in enumerate(pool)
                 if shown_stars(to_stars(estimate_potential(replace(young(config, born, potential, 45.0, exposure), id=player_id),
                                                            TODAY, 5, config).center, config)) == 5]
        return sum(potential >= config.attributes.stars.thresholds[-1] for potential in shown) / len(shown)
    reference = config.demography.potential_estimate.exposure.reference_matches
    assert truly_great(2011, 0) < 0.5 < truly_great(2009, reference)
    assert truly_great(2011, 0) < truly_great(2011, reference)


def test_what_he_played_counts_by_where_and_what_he_was_known_for(config):
    rules = config.demography.potential_estimate.exposure
    assert match_weight(config, "league", 1) == rules.league_weights[0] > match_weight(config, "league", 2)
    assert match_weight(config, "league", 9) == rules.league_weights[-1]
    assert match_weight(config, "cup", 0) == rules.cup_weight and match_weight(config, "europe", 0) == rules.europe_weight
    assert imported_exposure(None, 0, config) == imported_exposure(rules.unknown_reputation, 0, config) == 0
    assert imported_exposure(rules.known_reputation, 3, config) == rules.reference_matches + 3 * rules.selection_weight
