"""Landing view of a club: a few lines from each tab it links to; read-only projection."""
from core.domain.matches import Match
from core.domain.world import World
from . import views as v
from .club_history import movements

LAST_MATCHES, NEXT_MATCHES, LISTED_MOVES = 5, 3, 6


def outcome(club_id: int, match: Match) -> str:
    """V/N/D from the club's side; a shootout settles a drawn tie."""
    result = match.result
    home = match.home_id == club_id
    goals, conceded = (result.home_goals, result.away_goals) if home else (result.away_goals, result.home_goals)
    if goals == conceded and result.penalties:
        goals, conceded = result.penalties if home else reversed(result.penalties)
    return "V" if goals > conceded else "D" if goals < conceded else "N"


def calendar(world: World, club_id: int, played: list[Match], upcoming: list[Match]) -> dict:
    return {"last": [{**v.match_row(world, match), "outcome": outcome(club_id, match)} for match in reversed(played[-LAST_MATCHES:])],
            "next": [v.match_row(world, match) for match in upcoming[:NEXT_MATCHES]]}


def transfers(world: World, club_id: int) -> dict:
    data = movements(world, club_id, None, 1)
    sections = data["sections"]
    def side(key: str, total: str) -> dict:
        return {"count": len(sections[key]), "total": data[total], "items": sections[key][:LISTED_MOVES]}
    return {"season": data["season"], "arrivals": side("arrivals", "arrival_total"), "departures": side("departures", "departure_total"),
            "others": {kind: len(sections[kind]) for kind in ("academy", "release", "retirement")}}


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
            "transfers": transfers(world, club_id), "lineup": last_lineup(world, club_id, played)}
