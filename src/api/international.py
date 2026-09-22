"""Read-only international screens, with no dependency on club seasons."""
from dataclasses import asdict
from fastapi import APIRouter
from core.world.international import group_table, best_seconds, edition_matches
from core.world.international_selection import get_player


def nation_ref(world, nid):
    team = world.international.nations[nid]
    return {"id": team.id, "name": team.name, "nation": team.code, "national": True,
            "federation": team.federation, "strength": round(team.strength, 1)}


def international_match_row(world, match):
    edition = world.international.editions[match.season]
    number = match.round_number
    labels = {14: "Quarts de finale", 15: "Demi-finales", 16: "Finale"} if edition.kind == "euro" else {
        14: "Huitièmes de finale", 15: "Quarts de finale", 16: "Demi-finales", 17: "Finale"}
    label = f"Qualifications · J{number}" if number <= 10 else f"Groupes · J{number - 10}" if number <= 13 else labels[number]
    return {"id": match.id, "date": match.date.iso(), "round": number, "season": edition.year,
            "competition_id": edition.competition_id, "competition": edition.name, "international": True,
            "aggregate": None, "first_leg_id": None, "home": nation_ref(world, match.home_id),
            "away": nation_ref(world, match.away_id), "score": [match.result.home_goals, match.result.away_goals] if match.result else None,
            "penalties": match.result.penalties if match.result else None, "winner_id": match.result.winner_id if match.result else None,
            "neutral": match.neutral, "round_label": label}


def record_rows(world, year=None, nid=None):
    return [{**asdict(row), "nation": nation_ref(world, row.nation_id)} for row in world.international.records.values()
            if (year is None or row.edition == year) and (nid is None or row.nation_id == nid)]


def edition_view(world, year):
    edition = world.international.editions[year]
    def row_view(row):
        return {**asdict(row), "difference": row.difference, "nation": nation_ref(world, row.club_id)}
    def groups_view(groups, finals):
        return [{"name": chr(65 + index), "rows": [row_view(row) for row in group_table(world, edition, group, finals)]}
                for index, group in enumerate(groups)]
    return {"year": edition.year, "name": edition.name, "kind": edition.kind,
            "qualification_groups": groups_view(edition.qualification_groups, False),
            "final_groups": groups_view(edition.final_groups, True),
            "best_seconds": [row_view(row) for row in best_seconds(world, edition)],
            "second_places": 6 if edition.kind == "euro" else 4,
            "qualifiers": [nation_ref(world, nid) for nid in edition.qualifiers],
            "winner": nation_ref(world, edition.winner_id) if edition.winner_id is not None else None,
            "matches": [international_match_row(world, match) for match in sorted(edition_matches(world, edition), key=lambda m: (m.date, m.id))],
            "records": sorted(record_rows(world, year), key=lambda r: (-r['goals'], -r['matches'], r['player_id']))}


def international_router(service):
    api = APIRouter(prefix="/international")

    @api.get("")
    def overview():
        with service.reading() as world:
            return {"enabled": bool(world.international.nations),
                    "editions": [{"year": e.year, "name": e.name, "kind": e.kind,
                                  "winner": nation_ref(world, e.winner_id) if e.winner_id is not None else None}
                                 for e in sorted(world.international.editions.values(), key=lambda e: -e.year)],
                    "nations": [nation_ref(world, n.id) for n in sorted(world.international.nations.values(), key=lambda n: (-n.strength, n.name))]}

    @api.get("/editions/{year}")
    def edition(year: int):
        with service.reading() as world:
            return edition_view(world, year)

    @api.get("/nations/{nation_id}")
    def nation(nation_id: int):
        from .views import player_row
        with service.reading() as world:
            team = world.international.nations[nation_id]
            camp = world.international.camps.get(nation_id)
            players = []
            if camp:
                for pid in camp.player_ids:
                    player = get_player(world, pid)
                    players.append({"id": pid, "name": player.name, "position": player.position,
                                    "rating": round(player.rating, 1), "fitness": player.fitness,
                                    "injured_until": player.injury.end.iso() if player.injury else None,
                                    "caps": player.international_caps, "goals": player.international_goals,
                                    "suspended": player.international_discipline.get(world.international.editions[camp.edition].competition_id, None).suspended_matches
                                        if world.international.editions[camp.edition].competition_id in player.international_discipline else 0})
            candidates = sorted((p for p in world.players.values() if p.national_team == team.code
                                 or (not p.national_team and team.code in p.nationalities)), key=lambda p: (-p.rating, p.id))[:50]
            return {**nation_ref(world, nation_id), "reference_strength": team.reference_strength,
                    "camp": {"start": camp.start.iso(), "end": camp.end.iso(), "finals": camp.finals} if camp else None,
                    "squad": players, "candidates": [player_row(world, p) for p in candidates],
                    "matches": [international_match_row(world, m) for m in sorted(world.international.matches.values(), key=lambda m: (m.date, m.id))
                                if nation_id in (m.home_id, m.away_id)],
                    "records": record_rows(world, nid=nation_id)}
    return api
