"""Complete European season view, including archived league tables and ties."""
from core.domain.world import World
from core.world.europe import round_label
from . import views as v


def european_view(world: World, competition_id: int, season: int | None) -> dict:
    cup = world.competitions[competition_id]
    if cup.kind != "europe":
        raise ValueError("Cette compétition n’est pas une coupe d’Europe")
    year = world.season if season is None else season
    matches = sorted((m for m in world.matches.values() if m.competition_id == cup.id and m.season == year),
                     key=lambda m: (m.round_number, m.id))
    rounds = []
    for number in range(1, len(world.config.world.europe.dates) + 1):
        fixtures = [m for m in matches if m.round_number == number]
        day = fixtures[0].date if fixtures else cup.round_dates[number - 1] if year == world.season else None
        rounds.append({"number": number, "label": round_label(world, number),
                       "date": day.iso() if day else None, "items": [v.match_row(world, m) for m in fixtures],
                       "complete": bool(fixtures) and all(m.result is not None for m in fixtures)})
    winner = next((cid for y, cid in world.champions.get(cup.id, []) if y == year), None)
    return {"id": cup.id, "code": cup.code, "name": cup.name, "season": year,
            "seasons": sorted({m.season for m in world.matches.values() if m.competition_id == cup.id}, reverse=True),
            "standings": v.table(world, cup.id, year), "rounds": rounds,
            "league_rounds": world.config.world.europe.league_rounds,
            "latest_round": max((m.round_number for m in matches if m.result), default=None),
            "next_round": min((m.round_number for m in matches if not m.result), default=None),
            "winner": v.club_ref(world, winner)}
