from collections import Counter
from random import Random

from benchmarks.fixtures import synthetic_lineup
from core.domain.clubs import Competition
from core.domain.matches import Match, MatchEvent, MatchResult, PlayerMatchStats, TeamStats, TRANSIENT_EVENT_KINDS
from core.engine.match import PossessionEngine
from core.randomness import stream
from core.world.application import apply
from core.world.events import MatchPlayed, SeasonOpened
from core.world.player_states import match_event
from test_market import mini_world

ALL_KINDS = ("kickoff", "possession", "turnover", "shot", "save", "off_target", "corner", "free_kick", "goal",
             "yellow", "red", "injury", "substitution", "period_end", "penalty_scored", "penalty_missed")


def full_result(**changes) -> MatchResult:
    events = [MatchEvent(index * 60, 1, index, kind, 1, 101) for index, kind in enumerate(ALL_KINDS)]
    return MatchResult(1, 1, "possession", events, TeamStats(shots=3, corners=2), TeamStats(),
                       {101: PlayerMatchStats(minutes=90)}, [(101, "GB")], [(201, "GB")], [102], [202],
                       duration=5400, temporary_players={-1: "Renfort"}, **changes)


def test_applying_a_match_keeps_only_the_events_a_view_can_list(config):
    world = mini_world(config)
    world.matches[10] = Match(10, 16, 2025, 1, world.date, 1, 2)
    result = full_result()
    apply(world, MatchPlayed(10, result, {}, {}, {}))
    stored = world.matches[10].result
    assert [event.kind for event in stored.events] == [kind for kind in ALL_KINDS if kind not in TRANSIENT_EVENT_KINDS]
    assert TRANSIENT_EVENT_KINDS == {"possession", "turnover", "corner", "free_kick"}
    # Everything else the match page reads is untouched, and the survivors keep their order.
    assert [event.second for event in stored.events] == sorted(event.second for event in stored.events)
    assert stored.home_stats.corners == 2 and stored.player_stats[101].minutes == 90
    assert stored.home_lineup == [(101, "GB")] and stored.temporary_players == {-1: "Renfort"}


def test_real_engine_log_loses_no_statistic_when_stored(config):
    world = mini_world(config)
    world.rngs["states"] = Random(1)
    world.matches[10] = Match(10, 16, 2025, 1, world.date, 1, 2)
    result = PossessionEngine().simulate(synthetic_lineup(config, 1), synthetic_lineup(config, 2), config, stream(7))
    logged = Counter(event.kind for event in result.events)
    assert logged["possession"] and logged["turnover"] and logged["corner"] + logged["free_kick"], "the match must exercise every dropped kind"
    apply(world, match_event(world, world.matches[10], result))
    stored = Counter(event.kind for event in world.matches[10].result.events)
    assert stored == Counter({kind: count for kind, count in logged.items() if kind not in TRANSIENT_EVENT_KINDS})
    home, away = world.matches[10].result.home_stats, world.matches[10].result.away_stats
    assert home.corners + away.corners == logged["corner"] and home.free_kicks + away.free_kicks == logged["free_kick"]
    assert home.shots + away.shots == stored["shot"]
    assert home.yellows + away.yellows == stored["yellow"]


def test_rollover_archives_every_kind_of_competition_and_keeps_the_knockout_outcome(config):
    world = mini_world(config)
    world.competitions = {16: Competition(16, "Ligue", "FRA", 1, [1, 2]),
                          17: Competition(17, "Coupe", "FRA", 0, [1, 2], kind="cup"),
                          18: Competition(18, "Europe", "EUR", 0, [1, 2], kind="europe")}
    world.matches = {
        1: Match(1, 16, 2025, 1, world.date, 1, 2, full_result()),
        2: Match(2, 17, 2025, 1, world.date, 1, 2, full_result(penalties=(4, 3), winner_id=1)),
        3: Match(3, 17, 2025, 2, world.date, 1, 2, MatchResult(0, 0, "possession", status="double_forfeit", winner_id=2)),
        4: Match(4, 18, 2025, 1, world.date, 1, 2, full_result(penalties=(2, 4), winner_id=2)),
        5: Match(5, 17, 2026, 1, world.date, 1, 2, full_result(penalties=(4, 3), winner_id=1)),
        6: Match(6, 16, 2025, 3, world.date, 1, 2),
    }
    current = world.matches[5].result
    apply(world, SeasonOpened(2026, [], {}))
    assert world.matches[1].result == MatchResult(1, 1, "archived")
    assert world.matches[2].result == MatchResult(1, 1, "archived", penalties=(4, 3), winner_id=1)
    assert world.matches[3].result == MatchResult(0, 0, "archived", status="double_forfeit", winner_id=2)
    assert world.matches[4].result == MatchResult(1, 1, "archived", penalties=(2, 4), winner_id=2)
    assert world.matches[5].result is current and current.engine == "possession"  # The new season keeps its detail.
    assert world.matches[6].result is None
