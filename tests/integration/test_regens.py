from collections import Counter
from dataclasses import replace
from pathlib import Path
from random import Random
from statistics import mean

import pytest

from core.domain.players import Position
from core.world.application import apply
from core.world.demography import (Prospect, Slot, bucket_index, cohort_events, draw_age, draw_identity,
                                   draw_position_ratings, draw_prospect, place, place_outside, regime_of)
from core.world.events import PlayerReleased
from core.world.validation import validate_world
from infrastructure.importation.loader import import_world

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def world(config):
    return import_world(ROOT / "data", config, 123)


def ranks(values):
    order = sorted(range(len(values)), key=lambda index: values[index])
    result = [0.0] * len(values)
    for rank, index in enumerate(order): result[index] = rank
    return result


def correlation(first, second):
    left, right = ranks(first), ranks(second)
    mean_left, mean_right = mean(left), mean(right)
    covariance = sum((a - mean_left) * (b - mean_right) for a, b in zip(left, right))
    return covariance / (sum((a - mean_left) ** 2 for a in left) * sum((b - mean_right) ** 2 for b in right)) ** 0.5


def club_of(world, nation, youth_recruitment, club_id):
    return replace(world.clubs[868], id=club_id, nation=nation, youth_recruitment=youth_recruitment, player_ids=[])


def test_targets_are_measured_on_the_players_the_source_supplied(world, config):
    classes = len(config.demography.cohort.level_buckets)
    for shares in (world.potential_targets, world.external_potential_targets):
        assert len(shares) == classes and sum(shares) == pytest.approx(1)
    assert sum(world.external_nation_targets.values()) == pytest.approx(1)
    # The dormant world is weaker than the one playing, and has more nations.
    assert sum(world.external_potential_targets[:3]) > sum(world.potential_targets[:3])
    assert len(world.external_nation_targets) > 100


def test_ages_follow_the_configured_weights(config):
    rng = Random(3)
    counts = Counter(draw_age(config, rng) for _ in range(20000))
    for age, weight in zip(range(config.demography.generation.min_age, config.demography.generation.max_age + 1),
                           config.demography.generation.age_weights):
        assert counts[age] / 20000 == pytest.approx(weight, abs=0.015)
    assert counts[16] + counts[17] > 0.7 * 20000


def test_prospect_potential_follows_the_target_classes(world, config):
    active = [player for player in world.players.values() if player.club_id and world.clubs[player.club_id].competition_id]
    regime = regime_of(world, active, len(world.active_clubs()) * 24, world.potential_targets, world.nation_targets)
    rng = Random(5)
    prospects = [draw_prospect(world, regime, rng) for _ in range(20000)]
    buckets = config.demography.cohort.level_buckets
    counts = Counter(bucket_index(prospect.potential, buckets) for prospect in prospects)
    for index, share in enumerate(world.potential_targets):
        assert counts[index] / len(prospects) == pytest.approx(share, abs=0.03)
    # A regen never enters above what he will become, and starts well below it.
    assert all(prospect.level <= prospect.potential for prospect in prospects)
    assert mean(prospect.level / prospect.potential for prospect in prospects) < 0.5


def test_stars_come_from_small_nations_more_often_than_their_weight_suggests(world, config):
    outside = [player for player in world.players.values() if not (player.club_id and world.clubs[player.club_id].competition_id)]
    regime = regime_of(world, outside, world.external_target, world.external_potential_targets, world.external_nation_targets)
    rng = Random(9)
    prospects = [draw_prospect(world, regime, rng) for _ in range(60000)]
    stars = [prospect for prospect in prospects if prospect.potential >= config.demography.generation.elite_potential]
    big = {"FRA", "ESP", "ITA", "GER", "ENG"}
    share = lambda group: sum(prospect.nation in big for prospect in group) / len(group)
    assert len(stars) > 100
    assert share(stars) < share(prospects) - 0.05
    assert len({prospect.nation for prospect in stars}) > 40


def test_a_nation_with_few_names_borrows_and_a_large_one_does_not(world, config):
    thin = next(code for code, names in world.identity_pool.items() if 0 < len(names) <= 2)
    rng = Random(11)
    own = set(world.identity_pool[thin])
    given = [draw_identity(world, thin, rng) for _ in range(2000)]
    borrowed = sum(name not in own for name in given) / len(given)
    assert borrowed > 0.8
    big = max(world.identity_pool, key=lambda code: len(world.identity_pool[code]))
    assert len(world.identity_pool[big]) >= config.demography.generation.min_identities
    givens, surnames = ({name[index] for name in world.identity_pool[big]} for index in (0, 1))
    assert all(given in givens and surname in surnames for given, surname in (draw_identity(world, big, rng) for _ in range(500)))


def test_prospects_mostly_take_a_club_of_their_country(world, config):
    slots = [Slot(club_of(world, "FRA" if index % 2 else "ESP", 10, 9000 + index), False) for index in range(60)]
    prospects = [Prospect("FRA", 16, 50.0 + index, 20.0) for index in range(30)] + [Prospect("ESP", 16, 40.0, 20.0)] * 30
    placed = place(slots, prospects, config, Random(2))
    assert sorted(prospect.potential for prospect in placed) == sorted(prospect.potential for prospect in prospects)
    home = sum(slot.club.nation == "FRA" for slot, prospect in zip(slots, placed) if prospect.nation == "FRA")
    # Thirty French places for thirty French prospects: chance alone would seat half of them at home.
    assert home >= 24


def test_the_best_prospects_go_to_the_best_academies(world, config):
    clubs = [club_of(world, "FRA", 1 + index % 20, 9000 + index) for index in range(120)]
    slots = [Slot(club, False) for club in clubs]
    rng = Random(4)
    prospects = [Prospect("FRA", 16, rng.uniform(30, 95), 20.0) for _ in range(120)]
    placed = place(slots, prospects, config, Random(6))
    assert sorted(prospect.potential for prospect in placed) == sorted(prospect.potential for prospect in prospects)
    assert correlation([prospect.potential for prospect in placed], [slot.club.youth_recruitment for slot in slots]) > 0.4
    top = sorted(range(120), key=lambda index: -placed[index].potential)[:12]
    assert mean(slots[index].club.youth_recruitment for index in top) > mean(club.youth_recruitment for club in clubs) + 3
    # Some randomness remains: the best academy does not always hold the best prospect.
    best_academy = max(range(120), key=lambda index: (slots[index].club.youth_recruitment, index))
    assert placed[best_academy].potential < max(prospect.potential for prospect in prospects)


def test_dormant_prospects_fill_the_room_and_the_rest_stay_free(world, config):
    clubs = [club_of(world, "FRA", 10, 9000 + index) for index in range(3)]
    prospects = [Prospect("FRA", 16, 40.0 + index, 20.0) for index in range(10)]
    placed = place_outside(prospects, clubs, {club.id: 2 for club in clubs}, config, Random(1))
    assert len(placed) == 10 and sum(club is None for club in placed) == 4
    assert all(Counter(club.id for club in placed if club)[club.id] == 2 for club in clubs)
    assert place_outside(prospects, [], {}, config, Random(1)) == [None] * 10


def rated(config, position, count=2000):
    return [draw_position_ratings(position, config, 5, player_id) for player_id in range(count)]


def test_generated_ratings_follow_the_kinship_of_positions(config):
    rules = config.demography.generation.position_ratings
    for position in Position:
        for ratings in rated(config, position, 300):
            assert set(ratings) == set(Position) and ratings[position] == 20
            others = {other: value for other, value in ratings.items() if other != position}
            assert all(value == 1 or rules.min_rating <= value < 20 for value in others.values())
            # No aptitude where his position gives none.
            assert all(value == 1 for other, value in others.items() if other not in rules.typical[position])
    # A centre-back never leads the attack, and nobody but a keeper keeps goal.
    assert Position.STRIKER not in rules.typical[Position.CENTER_BACK] and not rules.typical[Position.GOALKEEPER]
    assert all(Position.GOALKEEPER not in row for row in rules.typical.values())
    share = lambda position, other: mean(ratings[other] >= 10 for ratings in rated(config, position))
    # An attacking midfielder mostly fills in at centre midfield, a full-back often on the other flank.
    assert share(Position.ATTACKING_MIDFIELDER, Position.CENTRAL_MIDFIELDER) > 0.8
    assert 0.4 < share(Position.LEFT_BACK, Position.RIGHT_BACK) < 0.75
    assert share(Position.CENTER_BACK, Position.CENTRAL_MIDFIELDER) < 0.25
    # One player, one draw: an older save rates him as his generation did.
    assert rated(config, Position.STRIKER, 50) == rated(config, Position.STRIKER, 50)


def test_generated_players_differ_in_versatility_and_in_the_sides_they_play(config):
    wingers = rated(config, Position.LEFT_WINGER)
    filled = Counter(sum(value >= 10 for value in ratings.values()) - 1 for ratings in wingers)
    # Some play nowhere else, others at four more positions.
    assert filled[0] > 20 and sum(count for size, count in filled.items() if size >= 4) > 200
    # A winger of one side only loses the other wing, or plays it clearly less well.
    assert 0.1 < mean(ratings[Position.RIGHT_WINGER] < 10 for ratings in wingers) < 0.4
    assert 0.25 < mean(ratings[Position.RIGHT_WINGER] >= 15 for ratings in wingers) < 0.6
    # A player of the axis has a side too: he plays both wings, one, or none.
    wings = Counter((ratings[Position.LEFT_WINGER] >= 10, ratings[Position.RIGHT_WINGER] >= 10)
                    for ratings in rated(config, Position.ATTACKING_MIDFIELDER))
    assert all(wings[case] > 100 for case in ((True, True), (True, False), (False, True), (False, False)))
    assert abs(wings[(True, False)] - wings[(False, True)]) < 150


def test_a_cohort_of_regens_is_placed_coherently(world, config):
    world.rngs["demography"] = Random(21)
    guard = config.management.guardrails
    keeper = lambda pid: world.players[pid].position == Position.GOALKEEPER
    # Five clubs lose a keeper and fall short; then the clubs playing fall 200 players under their nominal size.
    thin = [club for club in world.active_clubs() if sum(map(keeper, club.player_ids)) == guard.min_goalkeepers][:5]
    for club in thin: apply(world, PlayerReleased(next(pid for pid in club.player_ids if keeper(pid)), True))
    active = [player for player in world.players.values() if player.club_id and world.clubs[player.club_id].competition_id]
    surplus = len(active) - len(world.active_clubs()) * 24
    leavers = sorted((player for player in active if player.position != Position.GOALKEEPER), key=lambda item: item.id)
    for player in Random(7).sample(leavers, surplus + 200):
        apply(world, PlayerReleased(player.id, True))
    world.external_target += 300
    events = cohort_events(world)
    players = [event.player for event in events]
    playing = [player for player in players if player.club_id and world.clubs[player.club_id].competition_id]
    outside = [player for player in players if not (player.club_id and world.clubs[player.club_id].competition_id)]
    assert len(playing) == 200 and len(outside) == 300
    assert len({player.id for player in players}) == len(players) and min(player.id for player in players) == world.next_id
    assert all(player.rating <= player.potential <= 100 for player in players)
    assert all(16 <= player.born.age_on(world.date) <= 19 for player in players)
    assert all(player.contract is None for player in players if player.club_id is None)
    # Rated at every position, his own first; the others he fills are his secondary positions.
    assert all(player.position_ratings[player.position] == 20 and player.secondary_positions == {
        position: rating / 20 for position, rating in player.position_ratings.items() if 1 < rating < 20} for player in players)
    assert sum(bool(player.secondary_positions) for player in players) > 0.6 * len(players)
    assert thin and all(any(player.club_id == club.id and player.position == Position.GOALKEEPER for player in playing) for club in thin)
    # Dormant regens live mostly in their own country, and so do those of a nation with a club playing.
    dormant = [player for player in outside if player.club_id]
    assert sum(player.nation == world.clubs[player.club_id].nation for player in dormant) > 0.8 * len(dormant)
    nations = {club.nation for club in world.active_clubs()}
    local = [player for player in playing if player.nation in nations]
    assert local and sum(player.nation == world.clubs[player.club_id].nation for player in local) > 0.8 * len(local)
    for event in events:
        assert apply(world, event)
    validate_world(world)
