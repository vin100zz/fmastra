"""The last round played and the next one to play in a competition, each beside the table it counts for."""
from __future__ import annotations

from dataclasses import asdict
from typing import Literal

from core.domain.matches import Match
from core.domain.world import World
from core.world.cups import ROUND_NAMES
from core.world.europe import round_label as europe_label
from core.world.international import edition_matches, group_table
from . import views as v
from .international import FINALS_LABELS, international_match_row, nation_ref, round_label as international_label
from .statistics import leaders

Which = Literal["derniere", "prochaine"]
HALF_SECONDS = 2700
TOP_SCORERS = 10
GROUP_ROUNDS, FINAL_GROUP_ROUNDS = 10, 13


def goal_minute(second: int, period: int, half_end: int) -> str:
    """A goal's minute as a match sheet gives it: 1 to 45, 45+1…, then 46 to 90, 90+1…; `half_end` is the first half's whistle."""
    minute, cap = (second // 60 + 1, 45) if period == 1 else (46 + max(0, second - half_end) // 60, 90)
    return f"{cap}+{minute - cap}" if minute > cap else str(minute)


def scorers(world: World, match: Match) -> list[list[dict]] | None:
    """Each side's scorers in the order of their first goal, with the minute of each of their goals; the shoot-out does not count."""
    result = match.result
    if result is None:
        return None
    half_end = next((event.second for event in result.events if event.kind == "period_end" and event.period == 1), HALF_SECONDS)
    sides: dict[int, dict[int, dict]] = {match.home_id: {}, match.away_id: {}}
    for event in result.events:
        if event.kind == "goal" and event.period in (1, 2) and event.team_id in sides:
            row = sides[event.team_id].setdefault(event.player_id, {
                "id": event.player_id, "name": v.match_player_name(world, result, event.player_id), "minutes": []})
            row["minutes"].append(goal_minute(event.second, event.period, half_end))
    return [list(sides[match.home_id].values()), list(sides[match.away_id].values())]


def pick(matches: list[Match], which: Which) -> int | None:
    """The round of the latest result, or of the earliest match still to play."""
    if which == "derniere":
        played = [match for match in matches if match.result is not None]
        return max(played, key=lambda match: (match.date, match.round_number)).round_number if played else None
    pending = [match for match in matches if match.result is None]
    return min(pending, key=lambda match: (match.date, match.round_number)).round_number if pending else None


def upcoming(matches: list[Match], which: Which, rounds: int) -> int | None:
    """`pick`, except that a round not drawn yet still comes next when the rounds before it have all been played."""
    number = pick(matches, which)
    if number is None and which == "prochaine":
        following = (pick(matches, "derniere") or 0) + 1
        number = following if following <= rounds else None
    return number


def view(number: int | None, label: str | None, day: str | None, groups: list[dict]) -> dict:
    return {"round": None if number is None else {"number": number, "label": label, "date": day}, "groups": groups}


def competition_round(world: World, competition_id: int, which: Which, season: int | None = None) -> dict:
    """A league, national cup or European cup: one block of matches, with the table beside it in a league or a league phase."""
    competition = world.competitions[competition_id]
    year = world.season if season is None else season
    matches = [match for match in world.matches.values() if match.competition_id == competition.id and match.season == year]
    league_rounds = world.config.world.europe.league_rounds
    rounds = (len(ROUND_NAMES) if competition.kind == "cup" else len(world.config.world.europe.dates) if competition.kind == "europe"
              else max((match.round_number for match in matches), default=0))
    number = upcoming(matches, which, rounds)
    if number is None:
        return view(None, None, None, [])
    fixtures = sorted((match for match in matches if match.round_number == number), key=lambda match: match.id)
    label = (ROUND_NAMES[number - 1] if competition.kind == "cup" else europe_label(world, number) if competition.kind == "europe"
             else f"Journée {number}")
    scheduled = competition.round_dates[number - 1] if year == world.season and number <= len(competition.round_dates) else None
    day = min(match.date for match in fixtures) if fixtures else scheduled
    table = (v.table(world, competition.id, None if year == world.season else year) if competition.kind == "league" else
             v.table(world, competition.id, year) if competition.kind == "europe" and number <= league_rounds else None)
    rows = [{**v.match_row(world, match), "scorers": scorers(world, match)} for match in fixtures]
    # The competition's leading scorers of the season go with its table (a knockout round, spread over two columns, has no room for them).
    top = None if table is None else [{key: row[key] for key in ("id", "name", "club", "goals")}
                                      for row in leaders(world, competition.id, "buteurs", year)[:TOP_SCORERS]]
    return view(number, label, day.iso() if day else None, [{"name": None, "matches": rows, "standings": table, "top_scorers": top}] if rows else [])


def nation_standings(world: World, edition, group: list[int], finals: bool) -> list[dict]:
    """A group table in the shape of a club table; the places going through are marked (only the winner in qualifying)."""
    places = 2 if finals else 1
    return [{**asdict(row), "club": nation_ref(world, row.club_id), "difference": row.difference, "rank": index + 1,
             "form": row.form[-5:], "movement": "qualified" if index < places else None}
            for index, row in enumerate(group_table(world, edition, group, finals))]


def edition_round(world: World, year: int, which: Which) -> dict:
    """A Euro or a World Cup: group by group while there are groups, each beside its table, then the knockout ties."""
    edition = world.international.editions[year]
    matches = edition_matches(world, edition)
    number = upcoming(matches, which, FINAL_GROUP_ROUNDS + len(FINALS_LABELS[edition.kind]))
    if number is None:
        return view(None, None, None, [])
    fixtures = sorted((match for match in matches if match.round_number == number), key=lambda match: match.id)
    rows = {match.id: {**international_match_row(world, match), "scorers": scorers(world, match)} for match in fixtures}
    if number > FINAL_GROUP_ROUNDS:
        groups = [{"name": None, "matches": list(rows.values()), "standings": None}] if rows else []
    else:
        finals = number > GROUP_ROUNDS
        groups = [{"name": f"Groupe {chr(65 + index)}", "matches": [rows[match.id] for match in fixtures if match.home_id in group],
                   "standings": nation_standings(world, edition, group, finals)}
                  for index, group in enumerate(edition.final_groups if finals else edition.qualification_groups)] if rows else []
    day = min(match.date for match in fixtures).iso() if fixtures else None
    top = sorted((row for row in world.international.records.values() if row.edition == year and row.goals > 0),
                 key=lambda row: (-row.goals, row.matches, row.player_id))[:TOP_SCORERS]
    return {**view(number, international_label(edition, number), day, groups),
            "top_scorers": [{"id": row.player_id, "name": row.name, "club": nation_ref(world, row.nation_id), "goals": row.goals} for row in top]}
