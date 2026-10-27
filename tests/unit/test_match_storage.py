from collections import Counter
from random import Random

from benchmarks.fixtures import synthetic_lineup
from core.domain.clubs import Competition
from core.domain.international import InternationalEdition, NationalTeam
from core.domain.matches import (Match, MatchEvent, MatchResult, PlayerMatchStats, TeamStats, TRANSIENT_EVENT_KINDS,
                                 REPLAY_EVENT_KINDS, stored_events)
from core.engine.match import PossessionEngine
from core.randomness import stream
from core.world.application import apply
from core.world.events import MatchPlayed, SeasonOpened
from core.world.player_states import match_event
from test_market import mini_world

ALL_KINDS = ("kickoff", "possession", "circulation", "progress", "delivery", "turnover", "shot", "save", "off_target", "corner",
             "free_kick", "goal", "yellow", "red", "injury", "substitution", "period_end", "penalty_scored", "penalty_missed", "foul",
             "penalty", "throw_in", "offside")


def full_result(**changes) -> MatchResult:
    # Each event opens its own possession, so no shot shares its possession with a dropped kind; the turnover is the last event
    # of the possession before the shot's.
    events = [MatchEvent(index * 60, 1, index, kind, 1, 101, possession_id=index) for index, kind in enumerate(ALL_KINDS)]
    return MatchResult(1, 1, "possession", events, TeamStats(shots=3, corners=2), TeamStats(),
                       {101: PlayerMatchStats(minutes=90)}, [(101, "GB")], [(201, "GB")], [102], [202],
                       duration=5400, temporary_players={-1: "Renfort"}, **changes)


def test_applying_a_match_keeps_only_the_events_a_view_can_list(config):
    world = mini_world(config)
    world.controlled_club_id = 1
    world.matches[10] = Match(10, 16, 2025, 1, world.date, 1, 2)
    result = full_result()
    apply(world, MatchPlayed(10, result, {}, {}, {}))
    stored = world.matches[10].result
    # The loss of the ball that gave a side its chance is kept for the replay.
    assert [event.kind for event in stored.events] == [kind for kind in ALL_KINDS if kind not in TRANSIENT_EVENT_KINDS or kind == "turnover"]
    assert TRANSIENT_EVENT_KINDS == {"possession", "circulation", "progress", "delivery", "turnover", "corner", "free_kick", "foul",
                                     "penalty", "throw_in", "offside"}
    # Everything else the match page reads is untouched, and the survivors keep their order.
    assert [event.second for event in stored.events] == sorted(event.second for event in stored.events)
    assert stored.home_stats.corners == 2 and stored.player_stats[101].minutes == 90
    assert stored.home_lineup == [(101, "GB")] and stored.temporary_players == {-1: "Renfort"} and stored.replay


def test_a_match_the_users_club_did_not_play_keeps_only_its_facts(config):
    world = mini_world(config)
    world.controlled_club_id = 3
    world.matches[10] = Match(10, 16, 2025, 1, world.date, 1, 2)
    result = full_result()
    # A penalty missed in play, its save, and a shoot-out kick, beside a shot from play and its save.
    result.events += [MatchEvent(5000, 2, 30, "shot", 1, 101, possession_id=30, shot_id=1, detail="penalty"),
                      MatchEvent(5001, 2, 31, "save", 2, 201, possession_id=30, shot_id=1),
                      MatchEvent(5100, 2, 32, "shot", 1, 101, possession_id=31, shot_id=2, detail="frappe"),
                      MatchEvent(5101, 2, 33, "save", 2, 201, possession_id=31, shot_id=2),
                      MatchEvent(5400, 3, 34, "penalty_scored", 1, 101, 201, detail="1–0")]
    apply(world, MatchPlayed(10, result, {}, {}, {}))
    stored = world.matches[10].result
    assert not stored.replay
    assert [event.kind for event in stored.events] == ["kickoff", "goal", "yellow", "red", "injury", "substitution", "period_end",
                                                       "shot", "save", "penalty_scored"]
    assert {event.shot_id for event in stored.events if event.kind in ("shot", "save")} == {1}
    # Its statistics and its sheet stay whole.
    assert stored.home_stats.corners == 2 and stored.player_stats[101].minutes == 90 and stored.home_lineup == [(101, "GB")]


def test_every_match_keeps_its_shots_when_its_events_are_trimmed(config):
    world = mini_world(config)
    world.controlled_club_id = 3
    world.matches[10] = Match(10, 16, 2025, 1, world.date, 1, 2)
    result = full_result()
    result.events += [MatchEvent(700, 1, 30, "shot", 1, 101, possession_id=30, shot_id=1, xg=0.123456, detail="frappe"),
                      MatchEvent(4100, 2, 31, "shot", 2, 201, possession_id=31, shot_id=2, xg=0.4, detail="cross")]
    apply(world, MatchPlayed(10, result, {}, {}, {}))
    stored = world.matches[10].result
    # The shots leave the events with the rest of the build-up, but each stays as its second, its side and its xg.
    assert not any(event.kind == "shot" and event.xg for event in stored.events)
    assert stored.shots == [[700, 1, 0.123], [4100, 2, 0.4]]


def test_real_engine_log_loses_no_statistic_when_stored(config):
    world = mini_world(config)
    world.controlled_club_id = 1
    world.rngs["states"] = Random(1)
    world.matches[10] = Match(10, 16, 2025, 1, world.date, 1, 2)
    result = PossessionEngine().simulate(synthetic_lineup(config, 1), synthetic_lineup(config, 2), config, stream(7))
    logged = Counter(event.kind for event in result.events)
    played_free_kicks = sum(event.kind == "free_kick" and event.detail != "short" for event in result.events)
    assert all(logged[kind] for kind in ("possession", "turnover", "corner", "free_kick", "foul", "throw_in")), "the match must exercise every dropped kind"
    apply(world, match_event(world, world.matches[10], result))
    kept = world.matches[10].result.events
    stored = Counter(event.kind for event in kept if event.kind not in TRANSIENT_EVENT_KINDS)
    assert stored == Counter({kind: count for kind, count in logged.items() if kind not in TRANSIENT_EVENT_KINDS})
    # The build-up survives only for the possessions that ended in a shot, and entirely, with the loss of the ball or the foul
    # that stopped a counter before it.
    chances = {event.possession_id for event in result.events if event.kind == "shot"}
    def lead_in(event):
        return event.kind in ("turnover", "foul") and event.possession_id + 1 in chances
    assert {event.possession_id for event in kept if event.kind in REPLAY_EVENT_KINDS and not lead_in(event)} == chances
    assert [event for event in kept if event.kind in TRANSIENT_EVENT_KINDS] == [
        event for event in result.events if (event.kind in REPLAY_EVENT_KINDS and event.possession_id in chances) or lead_in(event)]
    assert logged["circulation"] and any(event.kind == "turnover" for event in kept)
    home, away = world.matches[10].result.home_stats, world.matches[10].result.away_stats
    assert home.corners + away.corners == logged["corner"]
    # The free kicks counted are those struck at goal or played into the box; fouls and offsides are counted too.
    assert home.free_kicks + away.free_kicks == played_free_kicks
    assert home.fouls + away.fouls == logged["foul"] and home.offsides + away.offsides == logged["offside"]
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


def test_rollover_archives_the_matches_of_the_editions_over(config):
    world = mini_world(config)
    world.competitions = {16: Competition(16, "Ligue", "FRA", 1, [1, 2])}
    over, under_way = InternationalEdition(2025, "nations"), InternationalEdition(2026, "world")
    world.international.matches = {
        7: Match(7, over.competition_id, 2025, 1, world.date, 1, 2, full_result()),
        8: Match(8, under_way.competition_id, 2026, 1, world.date, 1, 2, full_result())}
    current = world.international.matches[8].result
    apply(world, SeasonOpened(2026, [], {}))
    assert world.international.matches[7].result == MatchResult(1, 1, "archived")
    assert world.international.matches[8].result is current


def test_the_replay_trail_never_changes_the_match(config):
    """The replay follows the possession from the events alone: a run of passes kept where the ball stands or behind it,
    each move forward one zone and a long ball two, a restart where the play stopped, and a named server for every chance
    played in by a team-mate."""
    result = PossessionEngine().simulate(synthetic_lineup(config, 1), synthetic_lineup(config, 2), config, stream(7))
    by_possession = {}
    for event in result.events:
        by_possession.setdefault(event.possession_id, []).append(event)
    for events in by_possession.values():
        start = next((event for event in events if event.kind == "possession"), None)
        if start is None:
            continue
        zone = start.zone
        for event in events:
            if event.kind == "circulation":
                assert int(event.detail) > 0 and event.zone <= zone
                zone = event.zone
            elif event.kind == "progress":
                assert event.zone == zone + (2 if event.detail == "long" else 1)
                zone = event.zone
            elif event.kind in ("throw_in", "free_kick", "corner") and event.team_id == start.team_id:
                # A long ball lost may leave the side a throw-in or a free kick where it landed.
                zone = event.zone
        # A possession may hold several shots (a rebound, a header from the corner a save gave): each delivery names the
        # server of the shot that follows it.
        sequence = [event for event in events if event.kind in ("delivery", "shot")]
        for index, event in enumerate(sequence):
            if event.kind == "delivery":
                shot = sequence[index + 1]
                assert shot.kind == "shot" and shot.detail == event.detail and event.player_id not in (None, shot.player_id)
            elif event.detail in ("cross", "cutback", "through_ball", "corner", "crossed_free_kick"):
                assert index and sequence[index - 1].kind == "delivery"


def saved_world(config):
    """A world a store accepts: its clubs in one league, its streams, two selections."""
    world = mini_world(config)
    world.competitions[-16] = Competition(-16, "Test", "FRA", 1, [1, 2])
    for club in world.clubs.values(): club.competition_id = -16
    world.rngs = {key: Random(1) for key in ("market", "matches", "states", "progression", "demography")}
    world.international.nations = {nid: NationalTeam(nid, code, code, "Europe", 50, 50) for nid, code in ((-1, "FRA"), (-2, "ITA"))}
    return world


def test_a_save_leaves_out_defaults_the_journal_and_the_excluded_players_and_restores_the_world_whole(config, tmp_path):
    import gzip
    import json
    from infrastructure.persistence.store import SaveStore
    world = saved_world(config)
    world.controlled_club_id = 1
    world.matches[10] = Match(10, -16, 2025, 1, world.date, 1, 2)
    apply(world, MatchPlayed(10, full_result(), {}, {}, {}))
    world.excluded_player_ids = [7, 8]
    store = SaveStore(tmp_path)
    document = json.loads(gzip.decompress(store.save(world, "slot").read_bytes()))["world"]
    assert "journal" not in document and "excluded_player_ids" not in document and "news" not in document
    assert "injury" not in next(iter(document["players"].values())) and "replay" not in document["matches"]["10"]["result"]
    restored = store.load("slot")
    assert restored.journal == [] and restored.excluded_player_ids == []
    assert restored.players == world.players and restored.matches == world.matches


def test_a_save_from_before_schema_41_trims_the_replays_of_other_clubs_and_archives_the_editions_over(config, tmp_path, monkeypatch):
    import gzip
    import json
    import infrastructure.persistence.store as module
    from infrastructure.persistence.store import SaveStore
    # Two bare editions, which a whole calendar alone would make valid.
    monkeypatch.setattr(module, "validate_world", lambda world: None)
    world = saved_world(config)
    world.controlled_club_id = 1
    world.season = 2026
    world.matches = {10: Match(10, -16, 2026, 1, world.date, 1, 2, full_result())}
    over, under_way = InternationalEdition(2024, "euro"), InternationalEdition(2026, "world")
    world.international.editions = {2024: over, 2026: under_way}
    world.international.matches = {
        12: Match(12, over.competition_id, 2024, 1, world.date, -1, -2, full_result()),
        13: Match(13, under_way.competition_id, 2026, 1, world.date, -1, -2, full_result())}
    store = SaveStore(tmp_path)
    payload = json.loads(gzip.decompress(store.save(world, "old").read_bytes()))
    payload["schema_version"] = 40
    store.path_for("old").write_bytes(gzip.compress(json.dumps(payload).encode()))
    migrated = store.load("old")
    # The user's club's match keeps its replay; a selection's, never, and those of an edition over are archived.
    kept = migrated.matches[10].result
    assert kept.replay and kept.events == stored_events(world.matches[10].result.events)
    assert migrated.international.matches[12].result == MatchResult(1, 1, "archived")
    current = migrated.international.matches[13].result
    assert not current.replay and not any(event.kind == "possession" for event in current.events)
    # Without a club of his own, the user keeps no replay.
    del payload["world"]["controlled_club_id"]
    store.path_for("observer").write_bytes(gzip.compress(json.dumps(payload).encode()))
    trimmed = store.load("observer").matches[10].result
    assert not trimmed.replay and [event.kind for event in trimmed.events] == [event.kind for event in current.events]
