from collections import Counter
from copy import deepcopy
from dataclasses import replace
from random import Random

import pytest

from api.international import competitions_view, competition_history, nation_summary
from api.nation_archive import history as nation_history
from api.views import international_records
from benchmarks.fixtures import synthetic_lineup
from core.domain.date import Date
from core.domain.world import World
from core.domain.international import NationalCamp
from core.domain.players import Injury, Discipline, Position
from core.domain.matches import MatchResult, PlayerMatchStats, MatchEvent
from core.world.international import (initialize_international, edition_matches, progress_international,
                                     prepare_international_day, play_international_day, best_seconds,
                                     apply_international_result, group_table)
from core.world.international_calendar import create_edition, QUOTAS, windows, draw_final_groups, campaign_draw
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
    called = [line for item in world.news if item.kind == "call_up" and item.club_id == club.id for line in item.lines]
    assert [(line.player_id, line.text, line.key) for line in called] == [(scout.id, team.name, str(team.id))]


def test_qualification_format_and_even_year_cycles(world):
    # The Nations League before the first tournament, then the tournament.
    assert {year: edition.kind for year, edition in world.international.editions.items()} == {2027: "nations", 2028: "euro"}
    assert len(world.international.nations) == 211
    edition = world.international.editions[2028]
    assert Counter(map(len, edition.qualification_groups)) == {5: 6, 6: 4}
    matches = edition_matches(world, edition)
    assert len(matches) == 240
    for group in edition.qualification_groups:
        pairs = Counter((m.home_id, m.away_id) for m in matches if m.home_id in group)
        assert len(pairs) == len(group) * (len(group) - 1)
        assert set(pairs.values()) == {1}
    # From the March after the Nations League's groups to the March of the tournament.
    assert sorted({m.date for m in matches})[0] == Date(2027, 3, 18) and max(m.date for m in matches) == Date(2028, 3, 22)
    assert [first.month for first, _ in edition.windows] == [3, 9, 10, 11, 3]
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
    result = MatchResult(1, 0, "test", player_stats={player.id: PlayerMatchStats(minutes=90, goals=1, final_fitness=.65, rating=7.5)},
                         events=[MatchEvent(1200, 1, 1, "injury", team.id, player.id)])
    apply_international_result(world, edition, match, result, lineups)
    assert player.national_team == team.code
    assert player.international_caps == 1 and player.international_goals == 1
    # His rating counts in the edition's record, not in his club season.
    record = world.international.records[f"{edition.year}:{player.id}"]
    assert (record.matches, record.goals, record.rating_sum, record.rating_count) == (1, 1, 7.5, 1)
    shown = international_records(world, player.id)[0]
    assert shown["average"] == 7.5 and player.rating_count == 0
    # The page names the edition by its badge.
    assert (shown["competition"], shown["code"]) == (edition.name, {"euro": "EU", "world": "CM"}[edition.kind])
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
    # Each selection's strength is kept as the season opens.
    assert all(world.international.strength_history[nid][-1] == (2028, nation.strength) for nid, nation in world.international.nations.items())
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
        # What the engine reports of a match of the selections is written as it is typed: its length, no absentees.
        assert result.duration > 0 and result.status == "played" and result.home_absent == result.away_absent == {}
    assert world.international == restored.international
    store.save(restored, "played")


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
    assert len(world.international.matches) == 240 * 2 + 31 + 63 + 2 * (156 + 3)
    assert world.international.editions[2027].winner_id is not None and world.international.editions[2029].winner_id is not None
    assert all(m.result for m in world.international.matches.values())
    assert not world.international.camps
    assert not world.international.temporary
    assert len(world.international.records) > 0
    validate_international(world)
    # The history of the Euro's winner: the four editions, the latest first, and its title.
    winner = world.international.editions[2028].winner_id
    data = nation_history(world, winner)
    assert [(row['year'], row['code']) for row in data['items']] == [(2030, 'CM'), (2029, 'LN'), (2028, 'EU'), (2027, 'LN')]
    euro = data['items'][2]
    assert euro['stage'] == {'label': 'Vainqueur', 'level': 0} and euro['finals']['winner'] and euro['first_phase'].endswith(tuple('ABCDEFGHIJ'))
    assert {'kind': 'euro', 'code': 'EU', 'competition': 'Euro', 'count': 1, 'years': [2028]} in data['honours'] and data['current'] is None
    played = [m for m in world.international.matches.values() if winner in (m.home_id, m.away_id)]
    assert data['record']['total']['played'] == sum(row['record']['played'] for row in data['items']) == len(played)
    assert sum(row['played'] for row in data['record']['rows']) == len(played)
    assert [row['phase'] for row in data['record']['rows'] if row['code'] == 'EU'] == ['finals', 'qualification']
    # Its players and its records, the age ones kept match after match.
    squad = nation_history(world, winner, 'joueurs')
    assert len(squad['eleven']) == 11 and squad['matches'][0]['matches'] >= squad['matches'][-1]['matches']
    feats = nation_history(world, winner, 'records')
    held = world.international.age_records[winner]
    assert {'youngest', 'oldest', 'youngest_scorer', 'oldest_scorer'} <= set(held) and held['youngest'].days <= held['oldest'].days
    assert [row['kind'] for row in feats['ages']] == ['youngest', 'oldest', 'youngest_scorer', 'oldest_scorer']
    assert all(row['year'] in (2027, 2028, 2029, 2030) for row in feats['ages']) and feats['wins'] and feats['runs']['longest']
    assert feats['opponents']['played']['count'] >= 2


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


def test_a_selections_presentation_has_its_matches_its_equipe_type_and_what_its_players_did_in_the_edition(world):
    from api.international import nation_overview
    team, players = real_players(world)
    world.date = Date(2026, 8, 31)
    prepare_international_day(world)
    # Before its first match: its next three, and its best eleven by note among its camp, at the places national coaches play.
    before = nation_overview(world, team.id)
    assert before["calendar"]["last"] == [] and len(before["calendar"]["next"]) == 3
    assert before["eleven"]["basis"] == "notes" and before["players"] == []
    assert {p["id"] for p in before["eleven"]["players"]} <= set(world.international.camps[team.id].player_ids)
    # A selection's players wear no number of their own; a campaign-only reinforcement has no page.
    assert all(p["shirt"] is None and p["temporary"] == (p["id"] < 0) for p in before["eleven"]["players"])
    match = min((m for m in world.international.matches.values() if team.id in (m.home_id, m.away_id)), key=lambda m: (m.date, m.id))
    edition = world.international.editions[match.season]
    world.date = match.date
    lineups = [camp_lineup(world, edition, nid) for nid in (match.home_id, match.away_id)]
    own = lineups[0] if match.home_id == team.id else lineups[1]
    sides = [[(slot.player.id, slot.position.value) for slot in lineup.slots] for lineup in lineups]
    scorer = own.slots[-1].player
    stats = {slot.player.id: PlayerMatchStats(minutes=90, goals=int(slot.player is scorer), rating=7) for lineup in lineups for slot in lineup.slots}
    home = match.home_id == team.id
    match.result = MatchResult(1 if home else 0, 0 if home else 1, "test", player_stats=stats, winner_id=team.id, home_lineup=sides[0], away_lineup=sides[1])
    apply_international_result(world, edition, match, match.result, lineups)
    # Its first match played: its eleven is the one it fielded, each with his match; what each did in the edition.
    after = nation_overview(world, team.id)
    assert [m["id"] for m in after["calendar"]["last"]] == [match.id] and after["calendar"]["last"][0]["outcome"] == "V"
    eleven = after["eleven"]
    assert eleven["basis"] == "starts"
    assert sorted((p["id"], p["position"]) for p in eleven["players"]) == sorted((slot.player.id, slot.position.value) for slot in own.slots)
    assert all(p["appearances"] == p["starts"] == 1 and p["goals"] == int(p["id"] == scorer.id) for p in eleven["players"])
    assert sorted(p["id"] for p in after["players"]) == sorted(slot.player.id for slot in own.slots)
    assert next(p for p in after["players"] if p["id"] == scorer.id)["goals"] == 1 and all(p["average"] == 7 for p in after["players"])


def test_a_nations_group_follows_it_from_its_qualifiers_to_its_finals(world):
    from api.international import nation_group
    league, edition = world.international.editions[2027], world.international.editions[2028]
    # Its Nations League's group first, then its qualifying group once that one's groups are over.
    first = edition.qualification_groups[0][0]
    group = nation_group(world, first)
    assert (group["year"], group["stage"], group["finals"]) == (2027, "Phase de ligue", False) and first in [row["nation"]["id"] for row in group["rows"]]
    assert {row["movement"] for row in group["rows"]} <= {"qualified", "promotion", "relegation", None}
    finish_rounds(world, league, 1, 6)
    nid = next(nid for group in edition.qualification_groups for nid in group if nid not in league.qualifiers)
    group = nation_group(world, nid)
    index = next(index for index, members in enumerate(edition.qualification_groups) if nid in members)
    assert (group["year"], group["edition"], group["finals"], group["name"], group["places"]) == (2028, "Euro 2028", False, chr(65 + index), 1)
    assert {row["nation"]["id"] for row in group["rows"]} == set(edition.qualification_groups[index])
    # The qualifiers leave out the nations of the other confederations.
    outsider = next(nation.id for nation in world.international.nations.values() if nation.federation != "Europe")
    assert nation_group(world, outsider) is None
    finish_rounds(world, edition, 1, 10)
    group = nation_group(world, edition.final_groups[1][0])
    assert (group["finals"], group["name"], group["places"], len(group["rows"])) == (True, "B", 2, 4)
    # A nation knocked out keeps the group it played in.
    out = next(nid for members in edition.qualification_groups for nid in members if nid not in edition.qualifiers)
    assert nation_group(world, out)["finals"] is False


def test_an_edition_names_who_holds_its_title_the_winner_of_the_latest_one_of_its_kind(world):
    from api.international import edition_holder
    from core.domain.international import InternationalEdition
    editions = world.international.editions
    first, second = list(world.international.nations)[:2]
    for year, kind in ((2030, "world"), (2032, "euro"), (2036, "euro")):
        editions[year] = InternationalEdition(year, kind)
    # Before a first title nobody holds it, and the World Cup's winner does not hold the Euro.
    editions[2030].winner_id = second
    assert edition_holder(world, editions[2028]) is None and edition_holder(world, editions[2032]) is None
    editions[2028].winner_id = first
    assert edition_holder(world, editions[2032])["id"] == first and edition_holder(world, editions[2030]) is None
    # An edition not won yet passes the title on from the one before it.
    assert edition_holder(world, editions[2036])["id"] == first
    editions[2032].winner_id = second
    assert edition_holder(world, editions[2036])["id"] == second and edition_holder(world, editions[2032])["id"] == first


def test_a_camps_list_carries_the_editions_figures_and_sorts_with_what_is_unknown_last(world):
    from api.international import camp_rows, sorted_rows
    from core.domain.international import InternationalRecord
    team, players = real_players(world)
    world.date = Date(2026, 8, 31)
    prepare_international_day(world)
    camp = world.international.camps[team.id]
    rows = camp_rows(world, camp)
    assert [row["id"] for row in rows] == camp.player_ids and len(rows) == 23
    assert all(row["appearances"] == 0 and row["goals"] == 0 and row["average"] is None for row in rows)
    called = next(pid for pid in camp.player_ids if pid >= 0)
    get_player(world, called).international_caps = 7
    # The camp is the Nations League's: its figures are that edition's.
    assert camp.edition == 2027
    world.international.records[f"2027:{called}"] = InternationalRecord(called, "x", team.id, 2027, matches=3, goals=2, assists=1, rating_sum=21.3, rating_count=3)
    row = next(row for row in camp_rows(world, camp) if row["id"] == called)
    assert (row["caps"], row["appearances"], row["goals"], row["assists"], row["average"]) == (7, 3, 2, 1, 7.1)
    # A reinforcement has no value: whichever way the column runs, it stays last.
    reinforcements = {row["id"] for row in rows if row["value"] is None}
    assert reinforcements and all(pid < 0 for pid in reinforcements)
    for descending in (False, True):
        ordered = sorted_rows(world, rows, "value", descending)
        known = [row["value"] for row in ordered if row["value"] is not None]
        assert known == sorted(known, reverse=descending)
        assert {row["id"] for row in ordered[len(known):]} == reinforcements
    assert sorted_rows(world, camp_rows(world, camp), "caps", True)[0]["id"] == called


def test_a_nations_calendar_lists_one_edition_with_its_group_and_where_it_stands_in_each(world):
    from api.international import edition_place, nation_calendar
    league, edition = world.international.editions[2027], world.international.editions[2028]
    members = edition.qualification_groups[0]
    nid = members[0]
    # The Nations League comes first, then the qualifiers once its groups are over.
    data = nation_calendar(world, nid)
    assert (data["edition"], data["editions"]) == (2027, [{"year": 2028, "name": "Euro 2028"}, {"year": 2027, "name": "Ligue des nations 2027"}])
    assert {item["competition_code"] for item in data["items"]} == {"LN"} and data["items"][0]["round_label"].endswith(" · J1")
    finish_rounds(world, league, 1, 6)
    for number in (15, 16):
        finish_rounds(world, league, number, number)
    data = nation_calendar(world, nid)
    assert data["edition"] == 2028
    # Home and away against each of the others, in the order they are played, nothing played yet.
    assert len(data["items"]) == 2 * (len(members) - 1)
    assert [item["date"] for item in data["items"]] == sorted(item["date"] for item in data["items"])
    assert all(item["outcome"] is None and item["scorers"] is None and item["competition_code"] == "EU" for item in data["items"])
    assert (data["group"]["name"], data["group"]["finals"]) == ("A", False)
    row = data["competitions"][0]
    assert (row["id"], row["year"], row["kind"], row["code"], row["played"], row["winner"]) == (edition.competition_id, 2028, "international", "EU", 0, False)
    assert row["place"].endswith(" du groupe A")
    # A nation of another confederation plays nothing while the qualifiers run.
    outsider = next(nation.id for nation in world.international.nations.values() if nation.federation != "Europe")
    assert nation_calendar(world, outsider) == {"edition": None, "editions": [], "items": [], "group": None, "competitions": []}
    assert edition_place(world, edition, outsider) == {"place": "—", "winner": False}

    finish_rounds(world, edition, 1, 10)
    played = nation_calendar(world, nid)["competitions"][0]
    # Every match went to the home side: as many wins as defeats, a goal for each.
    assert (played["played"], played["won"], played["drawn"], played["lost"]) == (2 * (len(members) - 1), len(members) - 1, 0, len(members) - 1)
    assert (played["goals_for"], played["goals_against"]) == (len(members) - 1, len(members) - 1)
    out = next(item for group in edition.qualification_groups for item in group if item not in edition.qualifiers)
    assert edition_place(world, edition, out) == {"place": "Éliminé · Qualifications", "winner": False}
    through = edition.final_groups[1][0]
    assert edition_place(world, edition, through)["place"].endswith(" du groupe B")
    assert nation_calendar(world, through)["group"]["finals"] is True
    results = nation_calendar(world, out)["items"]
    assert {item["outcome"] for item in results} == {"V", "D"} and all(item["scorers"] == [[], []] for item in results)

    finish_rounds(world, edition, 11, 13)
    quarters = edition_matches(world, edition, 14, 14)
    assert edition_place(world, edition, quarters[0].home_id) == {"place": "Quarts de finale", "winner": False}
    beaten = next(item for group in edition.final_groups for item in group if not any(item in (m.home_id, m.away_id) for m in quarters))
    assert edition_place(world, edition, beaten) == {"place": "Éliminé · Phase de groupes", "winner": False}
    for number in (14, 15, 16):
        finish_rounds(world, edition, number, number)
    assert edition_place(world, edition, edition.winner_id) == {"place": "Vainqueur", "winner": True}
    assert edition_place(world, edition, edition.runner_up_id) == {"place": "Finaliste", "winner": False}
    assert edition_place(world, edition, quarters[0].away_id) == {"place": "Éliminé · Quarts de finale", "winner": False}

    # The edition under way comes first and opens by default; another one is picked by its year.
    create_edition(world, 2030)
    later = nation_calendar(world, nid)
    assert later["edition"] == 2030 and [item["year"] for item in later["editions"]] == [2030, 2028, 2027]
    assert [row["code"] for row in later["competitions"]] == ["CM", "EU", "LN"]
    assert nation_calendar(world, nid, 2028)["edition"] == 2028 and nation_calendar(world, nid, 2026)["edition"] == 2030
    # Out of the qualifiers of a World Cup, a nation of another confederation keeps nothing to show.
    assert nation_calendar(world, outsider)["items"] == []


def test_a_nations_league_has_four_divisions_of_groups_home_and_away_in_the_autumn(world):
    league = world.international.editions[2027]
    europe = {n.id for n in world.international.nations.values() if n.federation == "Europe"}
    assert [[len(group) for group in division] for division in league.divisions] == [[4, 4, 4, 4]] * 3 + [[3, 3]]
    assert {nid for division in league.divisions for group in division for nid in group} == europe
    # The strongest nations make the first division of the first edition.
    strength = lambda nid: world.international.nations[nid].strength
    assert min(strength(nid) for group in league.divisions[0] for nid in group) >= max(strength(nid) for group in league.divisions[1] for nid in group)
    matches = edition_matches(world, league)
    assert len(matches) == 4 * 12 * 3 + 2 * 6
    assert sorted({m.date for m in matches}) == [Date(2026, 9, 3), Date(2026, 9, 7), Date(2026, 10, 8), Date(2026, 10, 12),
                                                 Date(2026, 11, 12), Date(2026, 11, 16)]
    for division in league.divisions:
        for group in division:
            pairs = Counter((m.home_id, m.away_id) for m in matches if m.home_id in group)
            assert len(pairs) == len(group) * (len(group) - 1) and set(pairs.values()) == {1}
    validate_international(world)


def test_a_nations_league_ends_with_four_nations_and_moves_each_division(world):
    from core.world.international import next_divisions, league_divisions
    from core.world.international_calendar import create_league
    league = world.international.editions[2027]
    finish_rounds(world, league, 1, 6)
    # Division A's group winners, drawn into two semi-finals on neutral ground in June.
    winners = {group_table(world, league, group)[0].club_id for group in league.divisions[0]}
    assert set(league.qualifiers) == winners
    semis = edition_matches(world, league, 15, 15)
    assert len(semis) == 2 and all(m.neutral and m.date == Date(2027, 6, 6) for m in semis)
    finish_rounds(world, league, 15, 15)
    final = edition_matches(world, league, 16, 16)
    assert len(final) == 1 and final[0].date == Date(2027, 6, 10)
    finish_rounds(world, league, 16, 16)
    assert (league.winner_id, league.runner_up_id) == (final[0].home_id, final[0].away_id)
    validate_international(world)
    # The last of each group goes down, the winner of each group of B and C up, the first two of each group of D up.
    tables = [[[row.club_id for row in group_table(world, league, group)] for group in division] for division in league.divisions]
    after = next_divisions(world, league)
    assert [len(division) for division in after] == [16, 16, 16, 6]
    for index in range(3):
        assert {table[-1] for table in tables[index]} <= set(after[index + 1])
    for index in (1, 2):
        assert {table[0] for table in tables[index]} <= set(after[index - 1])
    assert {nid for table in tables[3] for nid in table[:2]} <= set(after[2])
    assert {nid for table in tables[3] for nid in table[2:]} <= set(after[3])
    # The next Nations League starts from there.
    assert league_divisions(world, 2029) == after
    nxt = create_league(world, 2029, after)
    assert [{nid for group in division for nid in group} for division in nxt.divisions] == [set(division) for division in after]
    validate_international(world)


def test_a_last_division_of_another_size_has_groups_of_four_at_most_and_still_sends_four_up(world):
    from core.world.international import next_divisions
    from core.world.international_calendar import create_league, european
    europe = european(world)
    extra = next(n.id for n in world.international.nations.values() if n.federation != "Europe")
    divisions = [europe[:16], europe[16:32], europe[32:48], europe[48:] + [extra]]
    league = create_league(world, 2031, divisions)
    assert sorted(len(group) for group in league.divisions[3]) == [3, 4]
    larger = max(league.divisions[3], key=len)
    # Every home side wins, so places fall to the tie-breaks; a second of the larger group is compared without its matches
    # against its last.
    finish_rounds(world, league, 1, 6)
    after = next_divisions(world, league)
    assert [len(division) for division in after] == [16, 16, 16, 7]
    promoted = set(after[2]) & set(divisions[3])
    tables = [[row.club_id for row in group_table(world, league, group)] for group in league.divisions[3]]
    assert len(promoted) == 4 and {table[0] for table in tables} <= promoted
    seconds = [table[1] for table in tables]
    trimmed = {nid: row for group in league.divisions[3]
               for row in group_table(world, league, [r.club_id for r in group_table(world, league, group)[:3]])
               for nid in [row.club_id]}
    best = min(seconds, key=lambda nid: (-trimmed[nid].points, -trimmed[nid].difference, -trimmed[nid].goals_for, nid))
    assert best in promoted and len(larger) == 4


def test_club_calendars_keep_the_autumn_and_march_windows_free(world):
    from core.world.international_calendar import reserved_dates
    reserved = set(reserved_dates(world, 2026))
    for day in (Date(2026, 9, 3), Date(2026, 10, 12), Date(2026, 11, 16), Date(2027, 3, 18), Date(2027, 6, 10)):
        assert day in reserved
    # No window in late September, December or June before the Nations League's final four.
    for day in (Date(2026, 9, 20), Date(2026, 12, 10), Date(2027, 5, 20)):
        assert day not in reserved


def test_a_reinforcement_stays_with_its_selection_from_the_nations_league_to_the_qualifiers(world):
    world.date = Date(2026, 8, 31)
    prepare_international_day(world)
    team = next(n for n in world.international.nations.values() if n.name == "Andorre")
    autumn = set(world.international.camps[team.id].player_ids)
    assert all(world.international.temporary_editions[pid] == 2027 for pid in autumn)
    world.date = Date(2027, 3, 15)
    prepare_international_day(world)
    camp = world.international.camps[team.id]
    assert camp.edition == 2028 and set(camp.player_ids) == autumn
    assert all(world.international.temporary_editions[pid] == 2028 for pid in autumn)
    validate_international(world)


def test_an_edition_drawn_before_the_nations_league_keeps_its_windows(world):
    from infrastructure.persistence.store import _date_international_windows
    edition = world.international.editions[2028]
    windows = list(edition.windows)
    edition.windows = []
    _date_international_windows(world)
    assert edition.windows == windows


def test_a_league_of_twenty_four_clubs_fits_every_season_beside_the_selections_and_the_cups(world):
    from random import Random
    from core.domain.clubs import Competition
    from core.world.calendar import schedule
    from core.world.europe_calendar import competition_dates
    from core.world.international_calendar import reserved_dates
    league = Competition(1, "Championship", "ENG", 2, list(range(1, 25)))
    for season in range(2026, 2042):
        reserved = competition_dates(world, season) + competition_dates(world, season, domestic=True) + reserved_dates(world, season)
        matches = schedule(league, season, 1, world.config, Random(season), reserved)
        assert len({m.date for m in matches}) == 46


def test_a_club_plays_up_to_the_day_before_a_camp_and_from_the_day_after_it(world):
    from core.world.international_calendar import reserved_dates
    rest = world.config.world.europe.min_rest_days
    reserved = reserved_dates(world, 2026)
    free = lambda day: all(abs(day.ordinal() - other.ordinal()) >= rest for other in reserved)
    # The September window's camp runs from 31 August to 9 September.
    assert free(Date(2026, 8, 30)) and not free(Date(2026, 8, 31))
    assert not free(Date(2026, 9, 9)) and free(Date(2026, 9, 10))


def test_each_competition_keeps_its_finals_titles_runs_and_players(world):
    """A Nations League and a Euro played to the end: each competition's holder, its final from the winner's side, the
    titles and the finals of each nation, how far each nation went, and the next edition with the day it is drawn."""
    league, euro = world.international.editions[2027], world.international.editions[2028]
    finish_rounds(world, league, 1, 6)
    finish_rounds(world, league, 15, 15)
    for match in edition_matches(world, league, 16, 16):
        match.result = MatchResult(1, 1, "test", winner_id=match.away_id, penalties=(3, 4))
    progress_international(world)
    for low, high in ((1, 10), (11, 13), (14, 14), (15, 15), (16, 16)):
        finish_rounds(world, euro, low, high)
    assert league.winner_id is not None and euro.winner_id is not None
    world_cup, euros, leagues = competitions_view(world)
    assert world_cup["finals"] == [] and world_cup["next"] == {"year": 2030, "draw": "2028-08-01"}
    assert euros["holder"]["id"] == euro.winner_id and euros["next"] == {"year": 2032, "draw": "2030-08-01"}
    final = leagues["finals"][0]
    # A shoot-out the side away won: the score and the shoot-out are written from the winner's side.
    assert (final["winner"]["id"], final["runner_up"]["id"]) == (league.winner_id, league.runner_up_id)
    assert (final["score"], final["penalties"]) == ([1, 1], [4, 3])
    assert leagues["next"] == {"year": 2029, "draw": campaign_draw(world, 2029).iso()} and campaign_draw(world, 2029) == Date(2028, 8, 1)
    history = competition_history(world, "euro")
    assert history["editions"] == [2028] and len(history["runs"]) == 16
    assert [row["runs"][0]["stage"] for row in history["runs"][:4]] == ["winner", "final", "semi", "semi"]
    assert {row["runs"][0]["stage"] for row in history["runs"][4:]} == {"quarter", "groups"}
    assert history["titles"][0] == {"nation": history["runs"][0]["nation"], "titles": 1, "finals": 1}
    nations = competition_history(world, "nations")
    moved = [row["runs"][0]["move"] for row in nations["runs"]]
    assert nations["runs"][0]["runs"][0] == {"division": "A", "stage": "winner", "move": None}
    assert moved.count("up") == moved.count("down") > 0
    assert nation_summary(world, euro.winner_id)["titles"]["euro"] == 1
    assert nation_summary(world, euro.winner_id)["last_edition"]["code"] == "EU"
