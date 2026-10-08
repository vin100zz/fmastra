"""Landing view of a club and its season's calendar; read-only projections."""
from core.domain.matches import Match
from core.domain.world import World
from core.world.cups import ROUND_NAMES
from . import views as v
from .club_archive import cup_run, european_run
from .rounds import scorers

LAST_MATCHES, NEXT_MATCHES = 5, 3


def outcome(club_id: int, match: Match) -> str:
    """V/N/D from the club's side; a shootout settles a drawn tie."""
    result = match.result
    home = match.home_id == club_id
    goals, conceded = (result.home_goals, result.away_goals) if home else (result.away_goals, result.home_goals)
    if goals == conceded and result.penalties:
        goals, conceded = result.penalties if home else reversed(result.penalties)
    return "V" if goals > conceded else "D" if goals < conceded else "N"


def calendar(world: World, club_id: int, played: list[Match], upcoming: list[Match]) -> dict:
    """Current season only, like the calendar tab."""
    played = [match for match in played if match.season == world.season]
    upcoming = [match for match in upcoming if match.season == world.season]
    return {"last": [{**v.match_row(world, match), "outcome": outcome(club_id, match)} for match in reversed(played[-LAST_MATCHES:])],
            "next": [v.match_row(world, match) for match in upcoming[:NEXT_MATCHES]]}


def last_lineup(world: World, club_id: int, played: list[Match]) -> dict | None:
    """The eleven of the latest match that kept one; archived results carry none."""
    for match in reversed(played):
        side = "home" if match.home_id == club_id else "away"
        players = v.lineup_rows(world, match.result, side)
        if players:
            return {"match": {**v.match_row(world, match), "outcome": outcome(club_id, match)}, "side": side, "players": players}
    return None


def overview(world: World, club_id: int) -> dict:
    world.clubs[club_id]
    matches = sorted((match for match in world.matches.values() if club_id in (match.home_id, match.away_id)), key=lambda match: (match.date, match.id))
    played = [match for match in matches if match.result]
    upcoming = [match for match in matches if not match.result]
    return {"calendar": calendar(world, club_id, played, upcoming), "finances": v.finance_summary(world, club_id),
            "lineup": last_lineup(world, club_id, played)}


def record(club_id: int, matches: list[Match]) -> dict:
    """What a side did over the played matches of a list: its results from its own side, its goals for and against."""
    totals = {"played": 0, "won": 0, "drawn": 0, "lost": 0, "goals_for": 0, "goals_against": 0}
    for match in matches:
        if not match.result: continue
        home = match.home_id == club_id
        totals["played"] += 1
        totals[{"V": "won", "N": "drawn", "D": "lost"}[outcome(club_id, match)]] += 1
        totals["goals_for"] += match.result.home_goals if home else match.result.away_goals
        totals["goals_against"] += match.result.away_goals if home else match.result.home_goals
    return totals


def place(world: World, club_id: int, competition_id: int, matches: list[Match]) -> str:
    """Where the club stands in a competition of the season: its rank in a league or a league phase, otherwise the round
    it is to play next, the round it went out in, or the title."""
    competition = world.competitions[competition_id]
    rank = lambda: next((row["rank"] for row in v.table(world, competition_id) if row["club_id"] == club_id), None)
    if competition.kind == "league":
        found = rank()
        return f"{found}{'er' if found == 1 else 'e'}" if found else "—"
    coming = [match for match in matches if not match.result]
    if competition.kind == "europe":
        run = european_run(world, matches, club_id)
        if coming and coming[0].round_number <= world.config.world.europe.league_rounds or run and run["label"] == "Phase de ligue" and not coming:
            found = rank()
            return f"{found}{'er' if found == 1 else 'e'} de la phase de ligue" if found else "Phase de ligue"
        label = v.match_row(world, coming[0])["round_label"] if coming else run["label"] if run else "—"
    else:
        run = cup_run(matches, club_id)
        label = ROUND_NAMES[coming[0].round_number - 1] if coming else run["label"] if run else "—"
    last = max((match for match in matches if match.result), key=lambda match: (match.date, match.id), default=None)
    out = not coming and last is not None and last.result.winner_id not in (None, club_id) and not (run and run["winner"])
    return f"Éliminé · {label}" if out else label


def season_calendar(world: World, club_id: int) -> dict:
    """Every match of the club's season, each played one with its scorers and its outcome, and for each competition its record
    and where the club stands."""
    world.clubs[club_id]
    matches = sorted((match for match in world.matches.values() if match.season == world.season and club_id in (match.home_id, match.away_id)),
                     key=lambda match: (match.date, match.id))
    rows = [{**v.match_row(world, match), "scorers": scorers(world, match), "outcome": outcome(club_id, match) if match.result else None}
            for match in matches]
    by_competition: dict[int, list[Match]] = {}
    for match in matches: by_competition.setdefault(match.competition_id, []).append(match)
    competitions = []
    for competition_id, games in by_competition.items():
        competition = world.competitions[competition_id]
        competitions.append({"id": competition_id, "name": competition.name, "kind": competition.kind, "code": competition.code,
                             "place": place(world, club_id, competition_id, games), **record(club_id, games)})
    # The league first, then the national cup, then Europe.
    competitions.sort(key=lambda row: ({"league": 0, "cup": 1, "europe": 2}.get(row["kind"], 3), row["id"]))
    return {"items": rows, "total": len(rows), "page": 1, "page_size": max(1, len(rows)), "competitions": competitions}
