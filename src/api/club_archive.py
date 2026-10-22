"""History tab of a club, a read-only projection in four views: the overview and the seasons (its finished seasons, its
honours and its record), its players, its records."""
from collections import defaultdict
from dataclasses import replace

from core.domain.matches import Match
from core.domain.world import World
from core.world.calendar import standings
from core.world.cups import ROUND_NAMES
from core.world.europe import KNOCKOUT_NAMES
from core.world.finances import financial_season
from . import records as r
from . import views as v

LISTED_PLAYERS = 15
LISTED_TRANSFERS = 10
LISTED_SEASONS = 5
# An average note ranks over fifty matches for the club (fewer in a short history, see `records.note_threshold`), and over
# twenty in a single season.
NOTE_MATCHES = 50
SEASON_NOTE_MATCHES = 20
DEFAULT_FORMATION = "4-3-3"
EUROPE_STAGES = ("Phase de ligue", *KNOCKOUT_NAMES)


def cup_run(matches: list[Match], club_id: int) -> dict | None:
    """Furthest round of a national cup; `level` orders runs from the first round (1) to the title (7)."""
    played = [match for match in matches if match.result]
    if not played: return None
    last = max(played, key=lambda match: match.round_number)
    won = last.round_number == len(ROUND_NAMES) and last.result.winner_id == club_id
    return {"label": "Vainqueur" if won else ROUND_NAMES[last.round_number - 1], "level": last.round_number + int(won), "winner": won}


def european_run(world: World, matches: list[Match], club_id: int) -> dict | None:
    """Furthest stage of a European cup: the league phase, then each knockout round; both legs of a tie are one stage."""
    played = [match for match in matches if match.result]
    if not played: return None
    last = max(played, key=lambda match: match.round_number)
    rules = world.config.world.europe
    stage = 0 if last.round_number <= rules.league_rounds else (last.round_number - rules.league_rounds - 1) // 2 + 1
    won = stage == len(EUROPE_STAGES) - 1 and last.result.winner_id == club_id
    competition = world.competitions[last.competition_id]
    return {"code": competition.code, "competition": competition.name, "label": "Vainqueur" if won else EUROPE_STAGES[stage],
            "level": stage + 1 + int(won), "winner": won}


def reputation_held(held: dict[int, float], year: int) -> dict | None:
    """Reputation the club had when the season opened, and how far it moved from the season before."""
    if year not in held: return None
    return {"value": round(held[year], 1), "change": round(held[year] - held[year - 1], 1) if year - 1 in held else None}


def player_seasons(world: World, club_id: int) -> dict[tuple[int, int], dict]:
    """What each player did for the club each season, every competition added: (season, player) -> figures."""
    totals: dict[tuple[int, int], dict] = {}
    for record in world.records.values():
        if record.club_id != club_id: continue
        total = totals.setdefault((record.season, record.player_id), {"matches": 0, "goals": 0, "assists": 0, "rating_sum": 0.0, "rating_count": 0})
        for name in total: total[name] += getattr(record, name)
    return totals


def best_scorer(world: World, totals: dict[tuple[int, int], dict], year: int) -> dict | None:
    """The club's top scorer of a season, every competition added; at equal goals the one who needed fewer matches."""
    scorers = [(pid, total) for (season, pid), total in totals.items() if season == year and total["goals"]]
    if not scorers: return None
    pid, total = min(scorers, key=lambda item: (-item[1]["goals"], item[1]["matches"], v.normalized(v.player_name(world, item[0]) or ""), item[0]))
    return {"player_id": pid, "player": v.player_name(world, pid), "goals": total["goals"]}


def league_tables(world: World, keys: set[tuple[int, int]]) -> dict[tuple[int, int], list]:
    """The final table of each (league, season) asked for, from one reading of the matches."""
    grouped: dict[tuple[int, int], list[Match]] = defaultdict(list)
    for match in world.matches.values():
        if (match.competition_id, match.season) in keys: grouped[(match.competition_id, match.season)].append(match)
    return {key: standings(replace(world.competitions[key[0]], club_ids=sorted({cid for match in matches for cid in (match.home_id, match.away_id)})),
                           matches, world.config) for key, matches in grouped.items()}


def seasons(world: World, club_id: int, totals: dict | None = None) -> list[dict]:
    """One row per finished season in which the club played a league, its national cup or a European cup, latest first: its
    league rank and record, its runs in the cups, its top scorer and the reputation it opened with."""
    finished: dict[int, dict[int, list[Match]]] = {}
    for match in world.matches.values():
        if match.season < world.season and club_id in (match.home_id, match.away_id):
            finished.setdefault(match.season, {}).setdefault(match.competition_id, []).append(match)
    tables = league_tables(world, {(cid, year) for year, played in finished.items() for cid in played if world.competitions[cid].kind == "league"})
    totals = player_seasons(world, club_id) if totals is None else totals
    held = dict(world.reputation_history.get(club_id, []))
    rows = []
    for year in sorted(finished, reverse=True):
        row = {"season": year, "rank": None, "champion": False, "competition_id": None, "competition": None, "level": None, "standing": None,
               "cup": None, "europe": None, "scorer": best_scorer(world, totals, year), "reputation": reputation_held(held, year)}
        for competition_id, matches in finished[year].items():
            competition = world.competitions[competition_id]
            if competition.kind == "league":
                table = tables[(competition_id, year)]
                rank, line = next((index + 1, line) for index, line in enumerate(table) if line.club_id == club_id)
                row.update(rank=rank, champion=rank == 1, competition_id=competition_id, competition=competition.name, level=competition.level,
                           standing={"points": line.points, "played": line.played, "won": line.won, "drawn": line.drawn, "lost": line.lost,
                                     "goals_for": line.goals_for, "goals_against": line.goals_against})
            elif competition.kind == "cup":
                run = cup_run(matches, club_id)
                row["cup"] = run and {**run, "competition_id": competition_id, "competition": competition.name}
            elif competition.kind == "europe":
                run = european_run(world, matches, club_id)
                if run and (row["europe"] is None or run["level"] > row["europe"]["level"]):
                    row["europe"] = {**run, "competition_id": competition_id}
        rows.append(row)
    return rows


def honours(rows: list[dict]) -> list[dict]:
    """What the finished seasons won, a row per competition, each with the seasons it was won in, the earliest first: the
    league titles (the highest division first), the national cup, then the European cups."""
    found: dict[int, dict] = {}
    def won(kind: str, competition_id: int, competition: str, year: int, order: tuple, code: str | None = None) -> None:
        entry = found.setdefault(competition_id, {"kind": kind, "competition_id": competition_id, "competition": competition, "code": code,
                                                  "count": 0, "seasons": [], "order": order})
        entry["count"] += 1
        entry["seasons"].append(year)
    for row in sorted(rows, key=lambda row: row["season"]):
        if row["champion"]: won("league", row["competition_id"], row["competition"], row["season"], (0, row["level"]))
        if row["cup"] and row["cup"]["winner"]: won("cup", row["cup"]["competition_id"], row["cup"]["competition"], row["season"], (1, 0))
        if row["europe"] and row["europe"]["winner"]:
            europe = row["europe"]
            won("europe", europe["competition_id"], europe["competition"], row["season"], (2, europe["code"]), europe["code"])
    return [{key: value for key, value in entry.items() if key != "order"} for entry in sorted(found.values(), key=lambda entry: entry["order"])]


def league_shape(world: World, competition_id: int) -> dict:
    """The size of a league today and its places at each end, to draw a club's seasons in it against."""
    competition, rows = world.competitions[competition_id], v.table(world, competition_id)
    return {"id": competition_id, "name": competition.name, "level": competition.level, "clubs": len(rows),
            "europe": sum(row["movement"] in ("champion", "europe") for row in rows),
            "promotion": sum(row["movement"] == "promotion" for row in rows),
            "relegation": sum(row["movement"] == "relegation" for row in rows)}


def record(world: World, played: list[r.Game]) -> dict:
    """The club's record in each competition it played, every season added (the one under way too): the leagues from the
    highest, the national cup, the European cups; then all of them together."""
    def empty() -> dict:
        return {"seasons": set(), "played": 0, "won": 0, "drawn": 0, "lost": 0, "goals_for": 0, "goals_against": 0}
    rows: dict[int, dict] = defaultdict(empty)
    total = empty()
    for game in played:
        for line in (rows[game.match.competition_id], total):
            line["seasons"].add(game.match.season)
            line["played"] += 1
            line["won"] += game.scored > game.conceded
            line["drawn"] += game.scored == game.conceded
            line["lost"] += game.scored < game.conceded
            line["goals_for"] += game.scored
            line["goals_against"] += game.conceded
    def order(competition_id: int) -> tuple:
        competition = world.competitions[competition_id]
        return ({"league": 0, "cup": 1, "europe": 2}.get(competition.kind, 3), competition.level if competition.kind == "league" else 0,
                competition.code or "", competition_id)
    def described(line: dict) -> dict:
        return {**line, "seasons": len(line["seasons"])}
    return {"rows": [{"competition_id": cid, "competition": world.competitions[cid].name, **described(rows[cid])} for cid in sorted(rows, key=order)],
            "total": described(total)}


def summary(world: World, club_id: int) -> dict:
    """The overview and the seasons: every finished season, the leagues they were played in and the one played today, the
    honours, the record in each competition and the reputation each season opened with."""
    rows = seasons(world, club_id)
    played = {row["competition_id"] for row in rows} | {world.clubs[club_id].competition_id}
    leagues = sorted((league_shape(world, competition_id) for competition_id in played if competition_id is not None), key=lambda league: league["level"])
    return {"items": rows, "leagues": leagues, "honours": honours(rows), "record": record(world, r.games(world.matches.values(), club_id)),
            "reputation": [{"season": year, "value": round(value, 1)} for year, value in sorted(world.reputation_history.get(club_id, []))]}


def positions(world: World) -> dict[int, str]:
    """Each player's position: today's for those in play, the one he retired with for the others."""
    known = {row.player_id: row.snapshot.position.value for row in world.transfers if row.kind == "retirement" and row.snapshot}
    known.update((pid, player.position.value) for pid, player in world.players.items())
    return known


def player_row(world: World, pid: int, career: dict, known: dict[int, str]) -> dict:
    count = career["rating_count"]
    return {"player_id": pid, "player": v.player_name(world, pid), "position": known.get(pid), "seasons": len(career["seasons"]),
            "matches": career["matches"], "goals": career["goals"], "assists": career["assists"],
            "note": round(career["rating_sum"] / count, 2) if count else None}


def ranked(world: World, rows: list[dict], key, limit: int = LISTED_PLAYERS) -> list[dict]:
    return sorted(rows, key=lambda row: (*key(row), v.normalized(row["player"] or ""), row["player_id"]))[:limit]


def formation(world: World, club_id: int) -> tuple[str, tuple[str, ...]]:
    """The club's tactic and the position of each of its places; the user's own tactic is its own places."""
    club, formations = world.clubs[club_id], world.config.formations.formations
    if club.formation in formations: return club.formation, formations[club.formation]
    if club_id == world.controlled_club_id and world.custom_formation: return club.formation, tuple(place[0] for place in world.custom_formation)
    return DEFAULT_FORMATION, formations[DEFAULT_FORMATION]


def biggest_transfers(world: World, club_id: int) -> dict:
    """The paid transfers with the highest fees, all seasons: those the club bought and those it sold."""
    paid = [row for row in world.transfers if row.kind == "transfer" and row.fee > 0]
    def top(side: str) -> list[dict]:
        rows = sorted((row for row in paid if getattr(row, side) == club_id), key=lambda row: (row.fee, row.date, row.player_id), reverse=True)
        return [{**v.transfer_row(world, row), "season": row.season if row.season is not None else financial_season(world, row.date)}
                for row in rows[:LISTED_TRANSFERS]]
    return {"arrivals": top("target_id"), "departures": top("source_id")}


def gains(world: World, club_id: int) -> list[dict]:
    """What each player the club bought and then sold brought in: the two fees and the difference, the largest first."""
    bought, rows = {}, []
    for row in world.transfers:
        if row.kind != "transfer": continue
        if row.target_id == club_id: bought[row.player_id] = row
        elif row.source_id == club_id and row.fee > 0 and row.player_id in bought:
            purchase = bought.pop(row.player_id)
            rows.append({"player_id": row.player_id, "player": v.player_name(world, row.player_id), "bought": purchase.fee, "sold": row.fee,
                         "gain": row.fee - purchase.fee, "season": row.season if row.season is not None else financial_season(world, row.date),
                         "target": v.club_ref(world, row.target_id)})
    return sorted(rows, key=lambda row: (-row["gain"], row["season"], row["player_id"]))[:LISTED_TRANSFERS]


def players(world: World, club_id: int) -> dict:
    """The players view: the best eleven of the club's tactic, the players with the most matches, the most goals and the best
    average note, those its academy promoted, and its biggest transfers either way and what its sales brought in."""
    careers: dict[int, dict] = {}
    for (season, pid), total in player_seasons(world, club_id).items():
        career = careers.setdefault(pid, {"matches": 0, "goals": 0, "assists": 0, "rating_sum": 0.0, "rating_count": 0, "seasons": set()})
        for name, value in total.items(): career[name] += value
        if total["matches"]: career["seasons"].add(season)
    known = positions(world)
    rows = [player_row(world, pid, career, known) for pid, career in careers.items() if career["matches"]]
    threshold = r.note_threshold(max((row["matches"] for row in rows), default=0), NOTE_MATCHES)
    academy = {row.player_id for row in world.transfers if row.kind == "academy" and row.target_id == club_id}
    name, roles = formation(world, club_id)
    lookup = {row["player_id"]: row for row in rows}
    picks = r.eleven(roles, {row["player_id"]: row["matches"] for row in rows}, {pid: known[pid] for pid in lookup if known.get(pid)})
    return {"formation": name, "eleven": [{"position": role, **({key: lookup[pid][key] for key in ("player_id", "player", "matches")} if pid else {})}
                                         for role, pid in picks],
            "matches": ranked(world, rows, lambda row: (-row["matches"], -row["goals"])),
            "goals": ranked(world, [row for row in rows if row["goals"]], lambda row: (-row["goals"], row["matches"])),
            "notes": ranked(world, [row for row in rows if row["note"] is not None and row["matches"] >= threshold], lambda row: (-row["note"], -row["matches"])),
            "note_matches": threshold,
            "academy": ranked(world, [row for row in rows if row["player_id"] in academy], lambda row: (-row["matches"], -row["goals"]), LISTED_TRANSFERS),
            "transfers": {**biggest_transfers(world, club_id), "gains": gains(world, club_id)}}


def game_row(world: World, game: r.Game) -> dict:
    match = game.match
    return {"match_id": match.id, "date": match.date.iso(), "season": match.season, "competition_id": match.competition_id,
            "competition": world.competitions[match.competition_id].name, "opponent": v.club_ref(world, game.opponent), "home": game.home, "neutral": match.neutral,
            "scored": game.scored, "conceded": game.conceded}


def best_seasons(world: World, totals: dict[tuple[int, int], dict], known: dict[int, str]) -> dict:
    """The best seasons a player had for the club: the most goals, the most assists, the best average note over enough matches."""
    rows = [{"player_id": pid, "player": v.player_name(world, pid), "position": known.get(pid), "season": season, "matches": total["matches"],
             "goals": total["goals"], "assists": total["assists"],
             "note": round(total["rating_sum"] / total["rating_count"], 2) if total["rating_count"] else None}
            for (season, pid), total in totals.items() if total["matches"]]
    order = lambda key: (lambda row: (-row[key], row["matches"], row["season"]))
    return {"goals": ranked(world, [row for row in rows if row["goals"]], order("goals"), LISTED_SEASONS),
            "assists": ranked(world, [row for row in rows if row["assists"]], order("assists"), LISTED_SEASONS),
            "notes": ranked(world, [row for row in rows if row["note"] is not None and row["matches"] >= SEASON_NOTE_MATCHES],
                            lambda row: (-row["note"], -row["matches"], row["season"]), LISTED_SEASONS),
            "note_matches": SEASON_NOTE_MATCHES}


def ages(world: World, held: dict, known: dict[int, str]) -> list[dict]:
    """The side's age records, in the order the screens list them, with the season each was set in."""
    review = world.config.world.key_dates.population_review
    return [{"kind": kind, "player": v.player_name(world, held[kind].player_id), "position": known.get(held[kind].player_id),
             "season": r.season_of(held[kind].date, (review.month, review.day)), **r.age(held[kind])}
            for kind in ("youngest", "oldest", "youngest_scorer", "oldest_scorer") if kind in held]


def records(world: World, club_id: int) -> dict:
    """The records view: the widest wins and heaviest defeats, the longest runs and those going on, the clubs met most, the
    best seasons of its players and its age records."""
    played = r.games(world.matches.values(), club_id)
    known = positions(world)
    met = r.opponents(played)
    return {**r.widest(played, lambda game: game_row(world, game)), "runs": r.runs(played),
            "opponents": {key: found and {"club": v.club_ref(world, found["id"]), "count": found["count"]} for key, found in met.items()},
            "best": best_seasons(world, player_seasons(world, club_id), known), "ages": ages(world, world.age_records.get(club_id, {}), known)}


VIEWS = {"ensemble": summary, "saisons": summary, "joueurs": players, "records": records}


def history(world: World, club_id: int, view: str = "ensemble") -> dict:
    return VIEWS[view](world, club_id)
