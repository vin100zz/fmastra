"""Traits read from the source (fragility, ego, foul propensity) and the delivery attributes `centre` and `cpa`."""
import re
from collections import Counter
from dataclasses import replace
from pathlib import Path
from statistics import mean

import pytest

from benchmarks.fixtures import synthetic_lineup
from core.domain.date import Date
from core.domain.players import ATTRIBUTE_NAMES, Attributes, Position
from core.engine.local_state import MatchLog, TeamState
from core.engine.shots import delivered_xg, resolve_shot, set_piece_taker
from core.engine.zones import foul_committer
from core.randomness import stream
from core.world.importation.construction import create_player, source_trait
from infrastructure.importation.readers import ATTRIBUTE_COLUMNS, read_sources

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def sources(config):
    _, players, _ = read_sources(ROOT / "data", config)
    return {row.id: row for row in players}


def team_with(config, changes_by_index=None):
    """A 4-3-3 side; `changes_by_index` maps a lineup index to {attribute: value}."""
    lineup = synthetic_lineup(config, 1)
    for index, changes in (changes_by_index or {}).items():
        player = lineup.slots[index].player
        values = list(player.attributes.values)
        for name, value in changes.items(): values[ATTRIBUTE_NAMES.index(name)] = value
        player.attributes = Attributes(tuple(values))
    return TeamState.from_lineup(lineup, config)


def test_every_engine_attribute_has_a_source_column_and_a_web_label():
    assert set(ATTRIBUTE_COLUMNS) == set(ATTRIBUTE_NAMES)
    labels = re.search(r"const ATTRIBUTES=\{(.*?)\};", (ROOT / "web" / "player.js").read_text("utf-8")).group(1)
    assert set(re.findall(r"(\w+):'", labels)) == set(ATTRIBUTE_NAMES)


def test_dead_ball_skill_is_the_mean_of_corners_and_free_kicks(sources):
    row = next(iter(sources.values()))
    assert ATTRIBUTE_COLUMNS["cpa"] == ("Corners", "FreeKicks") and ATTRIBUTE_COLUMNS["centre"] == ("Crossing",)
    assert row.attributes.get("cpa") % 2.5 == 0  # mean of two 1-20 notes, times five


def test_source_notes_are_converted_by_the_configured_scale(config, sources):
    mbappe = sources[85139014]
    assert (mbappe.injury_proneness, mbappe.ambition, mbappe.aggression) == (7.0, 20.0, 6.5)
    player = create_player(mbappe, config, 1, Date(2025, 7, 1), Counter())
    injuries, contracts, cards = config.states.injuries, config.management.contracts, config.engine.cards
    assert player.fragility == pytest.approx(1.2 + 0.1 * (7 - injuries.fragility_source_reference))
    assert player.ego == contracts.ego_max  # ambition 20 is above the top of the scale
    assert player.aggression == pytest.approx(
        cards.aggression_min + (1 - cards.aggression_min) * (6.5 - cards.aggression_source_low)
        / (cards.aggression_source_reference - cards.aggression_source_low))


def test_reference_note_lands_on_the_neutral_value_and_ends_on_the_bounds(config):
    cards = config.engine.cards
    args = (cards.aggression_source_low, cards.aggression_source_reference, cards.aggression_source_high,
            cards.aggression_min, 1.0, cards.aggression_max)
    assert source_trait(cards.aggression_source_reference, *args) == 1.0
    assert source_trait(0, *args) == cards.aggression_min and source_trait(20, *args) == cards.aggression_max


def test_missing_source_columns_fall_back_to_the_previous_random_draw(config, sources):
    row = replace(sources[85139014], injury_proneness=None, ambition=None, aggression=None)
    players = [create_player(row, config, seed, Date(2025, 7, 1), Counter()) for seed in range(20)]
    injuries, contracts = config.states.injuries, config.management.contracts
    assert len({player.fragility for player in players}) > 1 and len({player.ego for player in players}) > 1
    assert all(injuries.fragility_min <= player.fragility <= injuries.fragility_max for player in players)
    assert all(contracts.ego_min <= player.ego <= contracts.ego_max for player in players)
    assert {player.aggression for player in players} == {1.0}


def test_imported_traits_stay_within_bounds_and_keep_the_calibrated_means(config, sources):
    players = [create_player(row, config, 1, Date(2025, 7, 1), Counter()) for row in sources.values()]  # the CSV is sorted by level: only the whole population is unbiased
    injuries, contracts, cards = config.states.injuries, config.management.contracts, config.engine.cards
    assert all(injuries.fragility_min <= p.fragility <= injuries.fragility_max for p in players)
    assert all(cards.aggression_min <= p.aggression <= cards.aggression_max for p in players)
    # The means must not move the injury and contract calibrations set with the former uniform draws.
    assert mean(p.fragility for p in players) == pytest.approx((injuries.fragility_min + injuries.fragility_max) / 2, abs=0.05)
    assert mean(p.ego for p in players) == pytest.approx((contracts.ego_min + contracts.ego_max) / 2, abs=0.05)
    assert mean(p.aggression for p in players) == pytest.approx(1.0, abs=0.06)


def test_set_piece_taker_is_the_best_dead_ball_specialist_and_never_the_goalkeeper(config):
    team = team_with(config, {0: {"cpa": 100}, 5: {"cpa": 80}, 6: {"cpa": 70}})
    assert team.active[0].position == Position.GOALKEEPER
    assert set_piece_taker(team) is team.active[5]
    tied = team_with(config, {5: {"cpa": 80}, 6: {"cpa": 80}})
    assert set_piece_taker(tied).player.id == min(tied.active[5].player.id, tied.active[6].player.id)


def test_delivery_quality_moves_xg_and_the_reference_level_leaves_it_unchanged(config):
    rules = config.engine.chance
    base = rules.cross_xg
    assert delivered_xg(base, rules.cross_reference, rules.cross_reference, config) == pytest.approx(base)
    assert (delivered_xg(base, 90, rules.cross_reference, config) > base
            > delivered_xg(base, 5, rules.cross_reference, config))


def shots(config, kind, seed, changes_by_index=None):
    attacker, defender = team_with(config, changes_by_index), TeamState.from_lineup(synthetic_lineup(config, 2), config)
    log, rng = MatchLog(), stream(seed)
    for _ in range(60):
        resolve_shot(attacker, defender, 3, 0, False, kind, None, log, config, rng)
    return attacker, [event for event in log.events if event.kind == "shot"]


def test_the_corner_taker_never_heads_his_own_corner_and_free_kicks_are_struck_by_the_specialist(config):
    attacker, corners = shots(config, "corner", 5, {5: {"cpa": 90}})
    taker = set_piece_taker(attacker).player.id
    assert taker == attacker.active[5].player.id
    assert corners and all(event.player_id != taker for event in corners)
    _, free_kicks = shots(config, "free_kick", 6, {5: {"cpa": 90}})
    assert free_kicks and {event.player_id for event in free_kicks} == {taker}


def test_a_better_crosser_makes_the_same_cross_more_dangerous(config):
    _, good = shots(config, "cross", 7, {index: {"centre": 90} for index in range(11)})
    _, bad = shots(config, "cross", 7, {index: {"centre": 5} for index in range(11)})
    assert mean(event.xg for event in good) > config.engine.chance.cross_xg > mean(event.xg for event in bad)


def test_fouls_come_from_outfield_players_in_proportion_to_their_propensity(config):
    team = team_with(config)
    centre_backs = [slot for slot in team.active if slot.position == Position.CENTER_BACK]
    assert len(centre_backs) == 2
    centre_backs[0].player.aggression, centre_backs[1].player.aggression = 2.0, 0.5
    rng = stream(9)
    picks = Counter(foul_committer(team, 0, 1, config, rng).player.id for _ in range(6000))
    assert team.active[0].player.id not in picks  # the goalkeeper does not commit fouls
    ratio = picks[centre_backs[0].player.id] / picks[centre_backs[1].player.id]
    assert ratio == pytest.approx((2.0 / 0.5) ** config.engine.cards.aggression_weight, rel=0.15)


def test_a_lone_goalkeeper_can_still_be_the_fouler(config):
    team = team_with(config)
    team.active[:] = [team.active[0]]
    assert foul_committer(team, 0, 1, config, stream(1)) is team.active[0]


def test_player_page_sections_partition_the_attributes():
    source = (ROOT / "web" / "player.js").read_text("utf-8")
    block = re.search(r"const ATTRIBUTE_SECTIONS=\[(.*?)\];", source, re.S).group(1)
    listed = [name for group in re.findall(r"attributes:\[([^\]]*)\]", block) for name in re.findall(r"'(\w+)'", group)]
    assert sorted(listed) == sorted(ATTRIBUTE_NAMES)  # each attribute in exactly one section

