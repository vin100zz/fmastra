import pytest

from benchmarks.fixtures import synthetic_lineup
from core.ai.controller import AIController
from core.ai.human import HumanController
from core.domain.matches import LiveOrder
from core.engine.live import LiveMatch, NOTABLE_KINDS
from core.engine.match import PossessionEngine
from core.randomness import stream
from test_engine_golden import roughened


def lineups(config):
    return synthetic_lineup(config, 1, "4-4-2 plat", 72), synthetic_lineup(config, 2, "4-3-3", 68)


def test_segments_replay_the_whole_match_and_stop_on_what_is_worth_showing(config):
    home, away = lineups(config)
    whole = PossessionEngine().simulate(home, away, config, stream(77))
    match = LiveMatch(home, away, config, stream(77))
    halftime_seen = False
    while not match.finished:
        segment = match.advance_segment()
        assert segment and any(event.kind in NOTABLE_KINDS for event in segment)
        halftime_seen |= match.status == "halftime"
    assert halftime_seen
    assert match.result() == whole


def test_the_break_waits_for_the_second_half_kick_off(config):
    home, away = lineups(config)
    match = LiveMatch(home, away, config, stream(78))
    while match.status != "halftime":
        match.advance_segment()
    assert match.log.events[-1].kind == "period_end" and match.log.period == 1
    match.step()
    assert match.status == "playing" and match.log.period == 2
    assert [event.kind for event in match.log.events if event.period == 2][0] in ("substitution", "kickoff")


def human_match(config, seed=90, rough=False):
    home, away = lineups(config)
    if rough:
        home, away = roughened(home, 0.55, 1.8, 3.0), roughened(away, 0.6, 1.6, 2.5)
    rng = stream(seed)
    return LiveMatch(home, away, config, rng, controllers=(HumanController(config), AIController(config, rng)))


def test_the_human_side_makes_no_decision_of_its_own(config):
    for seed in range(8):
        match = human_match(config, seed, rough=True)
        match.run()
        home = [event for event in match.log.events if event.team_id == 1]
        assert not [event for event in home if event.kind == "substitution"]
        # An injured player of the human side leaves a gap until the manager fills it.
        injured = {event.player_id for event in home if event.kind == "injury"}
        assert not injured & {slot.player.id for slot in match.teams[0].active}
    heights = config.formations.block_height
    match = human_match(config)
    match.apply_orders(0, [LiveOrder(0, False, "mentality", mentality="offensive")])
    match.run()
    assert match.teams[0].block_height == pytest.approx(min(heights.max, match.teams[0].initial_block + heights.mentalities["offensive"]))


def test_orders_follow_the_substitution_rules(config):
    match = human_match(config)
    team = match.teams[0]
    rules = config.world.match_rules
    starters = [slot.player.id for slot in team.active]
    bench = [player.id for player in team.bench]
    change = lambda out, into, position="MC": LiveOrder(0, False, "substitution", out, into, position)
    with pytest.raises(ValueError):
        match.apply_orders(0, [change(starters[1], starters[2])])  # not on the bench
    with pytest.raises(ValueError):
        match.apply_orders(0, [change(bench[0], bench[1])])  # not on the pitch
    match = human_match(config)
    team = match.teams[0]
    goalkeeper = next(player.id for player in team.bench if player.position == "GB")
    with pytest.raises(ValueError):
        match.apply_orders(0, [change(starters[1], goalkeeper, "GB")])  # two keepers
    match = human_match(config)  # a refused order may leave the match half changed: callers rebuild it
    team = match.teams[0]
    for window in range(rules.substitution_windows):
        match.apply_orders(0, [change(starters[window + 1], bench[window + 1])])
    with pytest.raises(ValueError):
        match.apply_orders(0, [change(starters[5], bench[5])])  # no window left
    assert team.windows == rules.substitution_windows and team.substituted == rules.substitution_windows


def test_a_half_time_change_uses_no_window(config):
    match = human_match(config)
    while match.status != "halftime":
        match.advance_segment()
    team = match.teams[0]
    match.apply_orders(0, [LiveOrder(0, True, "substitution", team.active[3].player.id, team.bench[3].id, "DC")])
    assert team.windows == 0 and team.substituted == 1
    events = match.advance_segment()
    assert events[0].kind == "substitution" and events[0].team_id == 1
