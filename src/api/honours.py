"""Winners of every competition across the archived seasons, and the rankings the honours page draws from them; read-only projection."""
from collections import defaultdict
from core.domain.clubs import Competition
from core.domain.world import World
from core.world.cups import ROUND_NAMES
from core.world.europe import round_label as europe_label
from . import views as v
from .navigation import COMPETITION_KINDS
from .rounds import upcoming
from .statistics import LISTED_PLAYERS

TITLE_KINDS = ("europe", "league", "cup", "lower")


def title_kind(competition: Competition) -> str:
    """A title is a European cup, a top-flight league, a national cup or a lower division."""
    if competition.kind in ("europe", "cup"):
        return competition.kind
    return "league" if competition.level == 1 else "lower"


def tallies(world: World) -> tuple[dict, dict, dict]:
    """One pass over the records: each player's goals and matches by competition, his goals by competition and season,
    and the players who played for a club in a season."""
    careers: dict[int, dict[int, list[int]]] = defaultdict(dict)
    seasons: dict[tuple[int, int], dict[int, int]] = defaultdict(lambda: defaultdict(int))
    squads: dict[tuple[int, int], set[int]] = defaultdict(set)
    for record in world.records.values():
        total = careers[record.competition_id].setdefault(record.player_id, [0, 0])
        total[0] += record.goals
        total[1] += record.matches
        seasons[record.competition_id, record.season][record.player_id] += record.goals
        if record.matches > 0:
            squads[record.season, record.club_id].add(record.player_id)
    return careers, seasons, squads


def leading_scorer(world: World, totals: dict[int, list[int]]) -> dict | None:
    """The all-time leading scorer of a competition; a tie goes to the player who needed fewer matches, as on its history page."""
    scorers = [pid for pid, (goals, _) in totals.items() if goals > 0]
    if not scorers:
        return None
    best = min(scorers, key=lambda pid: (-totals[pid][0], totals[pid][1], v.normalized(v.player_name(world, pid) or ""), pid))
    return {"player_id": best, "player": v.player_name(world, best), "goals": totals[best][0]}


def current(world: World, competition: Competition, matches: list) -> dict | None:
    """Where the season under way stands: the leader of a league once it has started, else the round that comes next.
    None once the title is awarded (the champion of the season says it) or without a calendar."""
    if any(year == world.season for year, _ in world.champions.get(competition.id, [])) or not matches:
        return None
    if competition.kind == "league" and any(match.result for match in matches):
        table = v.table(world, competition.id)
        return {"leader": table[0]["club"], "round": max(row["played"] for row in table)}
    rounds = (len(ROUND_NAMES) if competition.kind == "cup" else len(world.config.world.europe.dates) if competition.kind == "europe"
              else max(match.round_number for match in matches))
    number = upcoming(matches, "prochaine", rounds)
    if number is None:
        return None
    return {"label": ROUND_NAMES[number - 1] if competition.kind == "cup" else europe_label(world, number) if competition.kind == "europe"
            else f"Journée {number}"}


def honours_block(world: World, competition: Competition, scorer: dict | None = None, stage: dict | None = None) -> dict:
    """One competition and its champions, the latest season first, each with the country of the club."""
    return {"id": competition.id, "name": competition.name, "kind": competition.kind, "level": competition.level,
            "code": competition.code, "scorer": scorer, "current": stage,
            "items": [{"season": year, "champion": v.club_ref(world, winner), "nation": getattr(world.clubs.get(winner), "nation", None)}
                      for year, winner in reversed(world.champions.get(competition.id, []))]}


def count_row(counts: dict[str, int]) -> dict:
    return {**{kind: counts.get(kind, 0) for kind in TITLE_KINDS}, "total": sum(counts.values())}


def ranked(rows: dict[int, dict[str, int]], name) -> list[int]:
    """The most titles first, then the most European cups, leagues and cups, then the name."""
    return sorted(rows, key=lambda key: (-sum(rows[key].values()), *(-rows[key].get(kind, 0) for kind in TITLE_KINDS), v.normalized(name(key) or ""), key))


def honours(world: World) -> dict:
    """The European cups, then each country: its divisions from the top down, then its cup. With them, the clubs and the players
    by titles won, the players by seasons ended as the leading scorer of a competition, and the European cups by country."""
    europe = sorted((item for item in world.competitions.values() if item.kind == "europe"), key=lambda item: (item.code or "", item.id))
    nations: dict[str, list[Competition]] = {}
    for competition in world.competitions.values():
        if competition.kind != "europe":
            nations.setdefault(competition.nation, []).append(competition)
    countries = [(code, sorted(members, key=lambda item: (COMPETITION_KINDS.get(item.kind, len(COMPETITION_KINDS)), item.level, item.code or "", item.id)))
                 for code, members in sorted(nations.items())]
    ordered = europe + [item for _, members in countries for item in members]
    careers, season_goals, squads = tallies(world)
    under_way: dict[int, list] = defaultdict(list)
    for match in world.matches.values():
        if match.season == world.season:
            under_way[match.competition_id].append(match)

    clubs: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    players: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    awards: dict[int, dict] = {}
    cups_by_nation: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for competition in ordered:
        kind = title_kind(competition)
        for year, winner in world.champions.get(competition.id, []):
            if winner in world.clubs:
                clubs[winner][kind] += 1
                if kind == "europe":
                    cups_by_nation[world.clubs[winner].nation][competition.id] += 1
            # Whoever played for the champion that season, in any competition, won the title with it.
            for pid in squads.get((year, winner), ()):
                players[pid][kind] += 1
            # The season's leading scorer of the competition; a tie goes to the lowest id, as in its statistics.
            goals = {pid: scored for pid, scored in season_goals.get((competition.id, year), {}).items() if scored > 0}
            if goals:
                best = min(goals, key=lambda pid: (-goals[pid], pid))
                award = awards.setdefault(best, {"titles": 0, "goals": 0, "competitions": defaultdict(int)})
                award["titles"] += 1
                award["goals"] += goals[best]
                award["competitions"][competition.id] += 1

    def block(competition: Competition) -> dict:
        return honours_block(world, competition, leading_scorer(world, careers.get(competition.id, {})),
                             current(world, competition, under_way.get(competition.id, [])))
    def player_row(pid: int) -> dict:
        player = world.players.get(pid)
        return {"player_id": pid, "player": v.player_name(world, pid), "position": player.position.value if player else None,
                "club": v.club_ref(world, player.club_id) if player else None, **count_row(players[pid])}
    scorers = sorted(awards, key=lambda pid: (-awards[pid]["titles"], -awards[pid]["goals"], v.normalized(v.player_name(world, pid) or ""), pid))
    return {"season": world.season,
            "europe": [block(item) for item in europe],
            "countries": [{"code": code, "name": world.nation_names.get(code, code), "competitions": [block(item) for item in members]}
                          for code, members in countries],
            "clubs": [{"club": v.club_ref(world, cid), "nation": world.clubs[cid].nation, **count_row(clubs[cid])}
                      for cid in ranked(clubs, lambda cid: world.clubs[cid].name)],
            "players": [player_row(pid) for pid in ranked(players, lambda pid: v.player_name(world, pid))[:LISTED_PLAYERS]],
            "scorers": [{"player_id": pid, "player": v.player_name(world, pid), "titles": awards[pid]["titles"], "goals": awards[pid]["goals"],
                         "competitions": [{"id": item.id, "name": item.name, "code": item.code, "titles": awards[pid]["competitions"][item.id]}
                                          for item in ordered if item.id in awards[pid]["competitions"]]}
                        for pid in scorers[:LISTED_PLAYERS]],
            "nations": [{"code": code, "name": world.nation_names.get(code, code), "titles": [counts.get(item.id, 0) for item in europe],
                         "total": sum(counts.values())}
                        for code, counts in sorted(cups_by_nation.items(), key=lambda pair: (-sum(pair[1].values()),
                                                                                          *(-pair[1].get(item.id, 0) for item in europe), pair[0]))]}
