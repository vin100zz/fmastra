"""History tab of a club: finished seasons with cup runs, all-time leaders, biggest transfers; read-only projection."""
from core.domain.matches import Match
from core.domain.world import World
from core.world.cups import ROUND_NAMES
from core.world.europe import KNOCKOUT_NAMES
from . import views as v
from .statistics import career_leaders

LISTED_TRANSFERS = 10
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


def seasons(world: World, club_id: int) -> list[dict]:
    """One row per finished season in which the club played a league, its national cup or a European cup, latest first."""
    finished: dict[int, dict[int, list[Match]]] = {}
    for match in world.matches.values():
        if match.season < world.season and club_id in (match.home_id, match.away_id):
            finished.setdefault(match.season, {}).setdefault(match.competition_id, []).append(match)
    held = dict(world.reputation_history.get(club_id, []))
    rows = []
    for year in sorted(finished, reverse=True):
        row = {"season": year, "rank": None, "champion": False, "competition_id": None, "competition": None, "cup": None, "europe": None,
               "reputation": reputation_held(held, year)}
        for competition_id, matches in finished[year].items():
            competition = world.competitions[competition_id]
            if competition.kind == "league":
                rank = next(item["rank"] for item in v.table(world, competition_id, year) if item["club_id"] == club_id)
                row.update(rank=rank, champion=rank == 1, competition_id=competition_id, competition=competition.name)
            elif competition.kind == "cup":
                row["cup"] = cup_run(matches, club_id)
            elif competition.kind == "europe":
                run = european_run(world, matches, club_id)
                if run and (row["europe"] is None or run["level"] > row["europe"]["level"]): row["europe"] = run
        rows.append(row)
    return rows


def leaders(world: World, club_id: int) -> dict:
    """The players with the most matches and the most goals for the club, every competition and season included."""
    return career_leaders(world, (record for record in world.records.values() if record.club_id == club_id))


def biggest_transfers(world: World, club_id: int) -> dict:
    """The paid transfers with the highest fees, all seasons: those the club bought and those it sold."""
    paid = [row for row in world.transfers if row.kind == "transfer" and row.fee > 0]
    def top(side: str) -> list[dict]:
        rows = sorted((row for row in paid if getattr(row, side) == club_id), key=lambda row: (row.fee, row.date, row.player_id), reverse=True)
        return [v.transfer_row(world, row) for row in rows[:LISTED_TRANSFERS]]
    return {"arrivals": top("target_id"), "departures": top("source_id")}


def history(world: World, club_id: int, page: int) -> dict:
    return {**v.paginate(seasons(world, club_id), page), "leaders": leaders(world, club_id), "transfers": biggest_transfers(world, club_id)}
