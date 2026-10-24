"""Landing view of a club and the calendar of one of its seasons; read-only projections."""
from collections import Counter

from core.ai.assignment import maximize_assignment
from core.domain.matches import Match
from core.domain.players import Player
from core.domain.world import World
from core.world.cups import ROUND_NAMES
from . import views as v
from .club_archive import cup_run, european_run
from .club_history import navigation
from .rounds import scorers

LAST_MATCHES, NEXT_MATCHES = 5, 3
# The places of an eleven from the goal forward, as the pitch of the Composition lists them.
ROLE_ORDER = ("GB", "DG", "DC", "DD", "MDC", "MC", "AILG", "AILD", "MOC", "BU")
# A start at a place outweighs any note: the note only settles a place nobody started at.
START_WEIGHT = 1000


def outcome(club_id: int, match: Match) -> str:
    """V/N/D from the club's side; a shootout settles a drawn tie."""
    result = match.result
    home = match.home_id == club_id
    goals, conceded = (result.home_goals, result.away_goals) if home else (result.away_goals, result.home_goals)
    if goals == conceded and result.penalties:
        goals, conceded = result.penalties if home else reversed(result.penalties)
    return "V" if goals > conceded else "D" if goals < conceded else "N"


def calendar(world: World, club_id: int, played: list[Match], upcoming: list[Match]) -> dict:
    """The season under way only, the one the calendar tab opens on."""
    played = [match for match in played if match.season == world.season]
    upcoming = [match for match in upcoming if match.season == world.season]
    return {"last": [{**v.match_row(world, match), "outcome": outcome(club_id, match)} for match in reversed(played[-LAST_MATCHES:])],
            "next": [v.match_row(world, match) for match in upcoming[:NEXT_MATCHES]]}


def last_lineup(world: World, club_id: int, played: list[Match]) -> dict | None:
    """The eleven of the latest match that kept one; archived results carry none."""
    for match in reversed(played):
        side = "home" if match.home_id == club_id else "away"
        if getattr(match.result, f"{side}_lineup"):
            return {"match": {**v.match_row(world, match), "outcome": outcome(club_id, match)}, "side": side,
                    "players": v.lineup_rows(world, match, side)}
    return None


def eleven(world: World, squad: list[Player], lineups: list, formation, stats: dict[int, dict], shorts: dict[int, str]) -> dict | None:
    """An équipe-type among `squad`: at each place of the shape fielded most in `lineups`, who started there most. Without
    a lineup, the best eleven at the places of `formation`, by note at each. Each player with his matches, starts and
    goals (`stats`) and his short name (`shorts`). None without enough players."""
    if lineups:
        shape = Counter(tuple(sorted(role for _, role in lineup)) for lineup in lineups).most_common(1)[0][0]
        starts = Counter(start for lineup in lineups for start in lineup)
    else:
        shape, starts = tuple(formation), Counter()
    roles = sorted(shape, key=ROLE_ORDER.index)
    if len(squad) < len(roles): return None
    notes = {player.id: v.position_notes(player, world.config) for player in squad}
    assigned = maximize_assignment([[starts[(player.id, role)] * START_WEIGHT + notes[player.id][role] for player in squad] for role in roles])
    return {"basis": "starts" if lineups else "notes",
            "players": [{"id": player.id, "name": player.name, "short": shorts.get(player.id), "position": role, "shirt": player.shirt,
                         "note": notes[player.id][role], **{key: stats[player.id][key] for key in ("appearances", "starts", "goals")}}
                        for role, player in ((role, squad[index]) for role, index in zip(roles, assigned))]}


def typical_eleven(world: World, club_id: int, played: list[Match]) -> dict | None:
    """The club's équipe-type among its first-team players (`eleven`), from its matches of the season; before its first
    one, or for a club that plays none, at the places of its formation."""
    club = world.clubs[club_id]
    squad = [world.players[pid] for pid in club.player_ids if pid in world.players and world.players[pid].reserve_since is None]
    sides = [getattr(match.result, f"{'home' if match.home_id == club_id else 'away'}_lineup") for match in played if match.season == world.season]
    # The human club's own tactic plays the places of its pitch.
    own = [role for role, _, _ in world.custom_formation] if club_id == world.controlled_club_id and world.custom_formation else None
    formation = world.config.formations.formations.get(club.formation) or own or next(iter(world.config.formations.formations.values()))
    stats = {pid: {"appearances": row["appearances"], "starts": row["appearances"] - row["substitutes"], "goals": row["goals"]}
             for pid, row in v.club_season_stats(world, club_id, [player.id for player in squad]).items()}
    return eleven(world, squad, [lineup for lineup in sides if lineup], formation, stats, v.squad_short_names(world, club_id, {}))


def overview(world: World, club_id: int) -> dict:
    world.clubs[club_id]
    matches = sorted((match for match in world.matches.values() if club_id in (match.home_id, match.away_id)), key=lambda match: (match.date, match.id))
    played = [match for match in matches if match.result]
    upcoming = [match for match in matches if not match.result]
    return {"calendar": calendar(world, club_id, played, upcoming), "finances": v.finance_summary(world, club_id),
            "lineup": last_lineup(world, club_id, played), "eleven": typical_eleven(world, club_id, played)}


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


def place(world: World, club_id: int, competition_id: int, matches: list[Match], season: int) -> str:
    """Where the club stands, or stood, in a competition of a season: its rank in a league or a league phase, otherwise
    the round it is to play next, the round it went out in, or the title."""
    competition = world.competitions[competition_id]
    archived = None if season == world.season else season
    rank = lambda: next((row["rank"] for row in v.table(world, competition_id, archived) if row["club_id"] == club_id), None)
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


def season_calendar(world: World, club_id: int, season: int | None = None) -> dict:
    """Every match of a season of the club, the one under way by default, each played one with its scorers and its outcome,
    and for each competition its record and where the club stands; the seasons to step to, as its finances and its
    transfers give them."""
    world.clubs[club_id]
    steps = navigation(world, season)
    year = steps["season"]
    matches = sorted((match for match in world.matches.values() if match.season == year and club_id in (match.home_id, match.away_id)),
                     key=lambda match: (match.date, match.id))
    rows = [{**v.match_row(world, match), "scorers": scorers(world, match), "outcome": outcome(club_id, match) if match.result else None}
            for match in matches]
    by_competition: dict[int, list[Match]] = {}
    for match in matches: by_competition.setdefault(match.competition_id, []).append(match)
    competitions = []
    for competition_id, games in by_competition.items():
        competition = world.competitions[competition_id]
        competitions.append({"id": competition_id, "name": competition.name, "kind": competition.kind, "code": competition.code,
                             "place": place(world, club_id, competition_id, games, year), **record(club_id, games)})
    # The league first, then the national cup, then Europe.
    competitions.sort(key=lambda row: ({"league": 0, "cup": 1, "europe": 2}.get(row["kind"], 3), row["id"]))
    return {"items": rows, "total": len(rows), "page": 1, "page_size": max(1, len(rows)), "competitions": competitions, **steps}
