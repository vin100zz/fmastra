from collections import Counter
from copy import deepcopy
from dataclasses import replace
from random import Random

import pytest

from benchmarks.fixtures import synthetic_lineup
from core.domain.date import Date
from core.domain.world import World
from core.domain.international import NationalCamp
from core.domain.players import Injury, Discipline, Position
from core.domain.matches import MatchResult, PlayerMatchStats, MatchEvent
from core.world.international import (initialize_international, edition_matches, progress_international,
                                     prepare_international_day, play_international_day, best_seconds,
                                     apply_international_result, group_table)
from core.world.international_calendar import create_edition, QUOTAS, windows, draw_final_groups
from core.world.international_selection import preferences, fill_camp, camp_lineup, get_player
from core.world.international_validation import validate_international
from core.world.application import apply
from core.world.events import SeasonOpened, PlayerReleased
from core.world.demography import retirement_events
from core.world.simulation import target_date
from infrastructure.persistence.store import SaveStore


@pytest.fixture
def world(config):
    world = World(Date(2025, 7, 1), 2025, 427, config, {}, {}, {}, {}, 1)
    world.nation_names = {f"N{i}": name for i, name in enumerate(config.nations)}
    world.rngs = {name: Random(123) for name in ("matches", "states", "market", "progression", "demography")}
    initialize_international(world)
    return world


def finish_rounds(world, edition, low, high):
    for match in edition_matches(world, edition, low, high):
        match.result = MatchResult(1, 0, "test", winner_id=match.home_id)
    progress_international(world)


def real_players(world, name="France", count=20):
    team = next(n for n in world.international.nations.values() if n.name == name)
    lineup = synthetic_lineup(world.config, 600)
    players = [slot.player for slot in lineup.slots] + lineup.bench
    for p in players[:count]:
        p.club_id = None
        p.nationalities = (team.code,)
        p.secondary_positions = {}
        world.players[p.id] = p
    world.next_id = max(world.next_id, max(world.players, default=0) + 1)
    return team, players[:count]


def test_call_up_reaches_the_human_clubs_news_feed(world):
    from core.domain.clubs import Club, ClubPersonality, ClubStatus
    team, players = real_players(world)
    scout = players[0]
    club = Club(1, "Le Club", "FRA", 16, 16, ClubStatus.ACTIVE, 30000, 70, 70, "4-3-3",
               ClubPersonality(.5, .5, .5, .5), [scout.id])
    world.clubs[club.id] = club
    scout.club_id = club.id
    world.controlled_club_id = club.id
    world.date = Date(2026, 8, 31)
    prepare_international_day(world)
    camp = next(c for c in world.international.camps.values() if c.nation_id == team.id)
    assert scout.id in camp.player_ids  # only 20 real candidates compete for 23 places
    assert any(item.kind == "call_up" and item.player_id == scout.id and item.club_id == club.id for item in world.news)


def test_qualification_format_and_even_year_cycles(world):
    assert set(world.international.editions) == {2028}
    assert len(world.international.nations) == 211
    edition = world.international.editions[2028]
    assert Counter(map(len, edition.qualification_groups)) == {5: 6, 6: 4}
    matches = edition_matches(world, edition)
    assert len(matches) == 240
    for group in edition.qualification_groups:
        pairs = Counter((m.home_id, m.away_id) for m in matches if m.home_id in group)
        assert len(pairs) == len(group) * (len(group) - 1)
        assert set(pairs.values()) == {1}
    assert {m.date.year for m in matches} == {2026, 2027}
    assert target_date(world, "journee") == Date(2026, 8, 10)
    world.season = 2026
    assert target_date(world, "journee") == Date(2026, 9, 3)
    finish_rounds(world, edition, 1, 10)
    assert len(edition.qualifiers) == 16
    assert all(r.played == 8 for r in best_seconds(world, edition))
    assert len(edition_matches(world, edition, 11, 13)) == 24
    validate_international(world)


@pytest.mark.parametrize("year,final_count", [(2028, 31), (2030, 63)])
def test_entire_bracket_quotas_and_opposite_halves(world, year, final_count):
    edition = world.international.editions.get(year) or create_edition(world, year)
    finish_rounds(world, edition, 1, 10)
    if year == 2030:
        assert Counter(world.international.nations[nid].federation for nid in edition.qualifiers) == QUOTAS
        original_groups = deepcopy(edition.final_groups)
        # Try multiple deterministic seeds; draw must never violate federation or pot constraints.
        for seed in range(30):
            world.seed = seed
            edition.final_groups = draw_final_groups(world, edition)
            validate_international(world)
        edition.final_groups = original_groups
    finish_rounds(world, edition, 11, 13)
    first = edition_matches(world, edition, 14, 14)
    ranks = {r.club_id: rank for group in edition.final_groups for rank, r in enumerate(group_table(world, edition, group, True))}
    assert all(ranks[m.home_id] == 0 and ranks[m.away_id] == 1 for m in first)
    for group in edition.final_groups:
        survivors = {r.club_id for r in group_table(world, edition, group, True)[:2]}
        half = len(first) // 2
        assert len(survivors & {nid for m in first[:half] for nid in (m.home_id, m.away_id)}) == 1
    for number in range(14, 18):
        finish_rounds(world, edition, number, number)
    assert edition.winner_id is not None
    assert len(edition_matches(world, edition, 11)) == final_count
    assert max(m.date for m in edition_matches(world, edition)).month == 7
    validate_international(world)


def test_camps_injuries_replacement_and_temporary_continuity(world):
    real_players(world)
    world.date = Date(2026, 8, 31)
    prepare_international_day(world)
    assert len(world.international.camps) == 54
    assert all(len(c.player_ids) == 23 for c in world.international.camps.values())
    camp = next(iter(world.international.camps.values()))
    original = camp.player_ids.copy()
    player = get_player(world, original[0])
    player.injury = Injury(world.date, world.date.add_days(20), "minor")
    world.date = world.date.add_days(1)
    prepare_international_day(world)
    assert player.id not in camp.player_ids
    assert len(set(original) & set(camp.player_ids)) == 22
    assert player.id in world.international.temporary
    # Finals only allow an injury replacement before the first match.
    camp.finals = True
    camp.first_match_played = True
    retained = get_player(world, camp.player_ids[0])
    retained.injury = Injury(world.date, world.date.add_days(20), "minor")
    # Keep a future finals fixture so this artificial camp is still in the competition.
    edition = world.international.editions[2028]
    from core.world.international_calendar import add_match
    add_match(world, edition, 11, Date(2028, 6, 12), camp.nation_id, next(nid for nid in world.international.nations if nid != camp.nation_id), True)
    world.date = world.date.add_days(1)
    prepare_international_day(world)
    assert retained.id in camp.player_ids
    validate_international(world)


def test_allegiance_is_fixed_only_on_appearance_and_club_stats_separate(world):
    team, players = real_players(world)
    world.date = Date(2026, 8, 31)
    prepare_international_day(world)
    assert not any(p.national_team for p in players)
    edition = world.international.editions[2028]
    match = next(m for m in edition_matches(world, edition) if team.id in (m.home_id, m.away_id))
    world.date = match.date
    lineups = [camp_lineup(world, edition, nid) for nid in (match.home_id, match.away_id)]
    player = next(slot.player for lineup in lineups for slot in lineup.slots if slot.player.id >= 0)
    result = MatchResult(1, 0, "test", player_stats={player.id: PlayerMatchStats(minutes=90, goals=1, final_fitness=.65)},
                         events=[MatchEvent(1200, 1, 1, "injury", team.id, player.id)])
    apply_international_result(world, edition, match, result, lineups)
    assert player.national_team == team.code
    assert player.international_caps == 1 and player.international_goals == 1
    assert player.fitness == .65 and player.injury is not None
    assert player.monthly_minutes == 90
    assert player.season_minutes == player.appearances == player.season_goals == 0
    assert not world.records
    player.nationalities += (next(n.code for n in world.international.nations.values() if n.id != team.id),)
    assert preferences(world)[player.id] == team.code


def test_dual_nation_choice_depends_on_opportunity(world):
    strong = next(n for n in world.international.nations.values() if n.name == "France")
    weak = next(n for n in world.international.nations.values() if n.name == "Andorre")
    _, players = real_players(world)
    for p in players:
        p.position = Position.STRIKER
        p.rating = 85
    prospect = players[-1]
    prospect.nationalities = (strong.code, weak.code)
    prospect.rating = 90
    assert preferences(world)[prospect.id] == strong.code
    prospect.rating = 35
    assert preferences(world)[prospect.id] == weak.code


def test_july_rollover_keeps_edition_and_discipline(world):
    team, players = real_players(world)
    edition = world.international.editions[2028]
    finish_rounds(world, edition, 1, 10)
    finish_rounds(world, edition, 11, 13)
    matches = deepcopy(world.international.matches)
    players[0].international_discipline[edition.competition_id] = Discipline(yellows=1, suspended_matches=1)
    world.date = Date(2028, 7, 1)
    apply(world, SeasonOpened(2028, [], {}))
    assert world.international.matches == matches
    assert players[0].international_discipline[edition.competition_id].yellows == 1
    assert players[0].international_discipline[edition.competition_id].suspended_matches == 1


def test_save_and_real_match_resume(world, tmp_path):
    world.date = Date(2026, 8, 31)
    prepare_international_day(world)
    store = SaveStore(tmp_path)
    store.save(world, "camp")
    restored = store.load("camp")
    assert restored.international == world.international
    # Play one actual fixture on each side of a save, including 23-player benches.
    first = min(world.international.matches.values(), key=lambda m: (m.date, m.id))
    for candidate in (world, restored):
        for match in candidate.international.matches.values():
            if match.date == first.date and match.id != first.id:
                match.result = MatchResult(0, 0, "test")
        candidate.date = first.date
        prepare_international_day(candidate)
        play_international_day(candidate)
        result = candidate.international.matches[first.id].result
        assert len(result.home_lineup) == 11 and len(result.home_bench) == 12
        assert result.temporary_players
        assert any(p.fitness < candidate.config.states.fitness.initial for p in candidate.international.temporary.values())
        validate_international(candidate)
    assert world.international == restored.international


def test_retirement_during_tournament_is_deferred(world):
    team, players = real_players(world)
    player = players[0]
    player.born = Date(1900, 1, 1)
    world.international.camps[team.id] = NationalCamp(team.id, 2028, Date(2028, 6, 8), Date(2028, 7, 14), True, [player.id])
    assert all(event.player_id != player.id for event in retirement_events(world))
    assert player.id in world.international.deferred_retirements
    world.date = Date(2028, 7, 15)
    prepare_international_day(world)
    assert player.id not in world.players and player.id in world.retired
    assert player.id in world.international.retired_careers


def test_two_complete_international_cycles_with_match_engine(world):
    # Exercise every real camp opening, qualification date, knockout progression and July boundary.
    world.date = Date(2026, 8, 30)
    while world.date < Date(2030, 7, 14):
        world.date = world.date.add_days(1)
        prepare_international_day(world)
        play_international_day(world)
    assert world.international.editions[2028].winner_id is not None
    assert world.international.editions[2030].winner_id is not None
    assert len(world.international.matches) == 240 * 2 + 31 + 63
    assert all(m.result for m in world.international.matches.values())
    assert not world.international.camps
    assert not world.international.temporary
    assert len(world.international.records) > 0
    validate_international(world)


def test_international_shootout_and_suspension(world):
    from core.world.cup_matches import decide_winner
    world.date = Date(2026, 8, 31)
    prepare_international_day(world)
    edition = world.international.editions[2028]
    match = min(edition_matches(world, edition), key=lambda m: (m.date, m.id))
    world.date = match.date
    lineups = [camp_lineup(world, edition, nid) for nid in (match.home_id, match.away_id)]
    player = lineups[0].slots[0].player
    result = MatchResult(0, 0, 'test', player_stats={player.id: PlayerMatchStats(minutes=90, red=True, direct_red=True)})
    decide_winner(world, match, result, lineups)
    assert result.penalties and result.winner_id in (match.home_id, match.away_id)
    apply_international_result(world, edition, match, result, lineups)
    assert player.international_goals == 0  # Shootout kicks never become career goals.
    ban = player.international_discipline[edition.competition_id].suspended_matches
    assert ban > 0 and not player.discipline
    next_lineup = camp_lineup(world, edition, match.home_id)
    assert player.id not in [slot.player.id for slot in next_lineup.slots]
    assert player.id not in [p.id for p in next_lineup.bench]
