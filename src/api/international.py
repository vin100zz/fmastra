"""Read-only international screens, with no dependency on club seasons."""
from dataclasses import asdict
from fastapi import APIRouter
from core.world.international import group_table, best_seconds, edition_matches
from . import navigation as nav
from . import views as v
from .statistics import LISTED_PLAYERS

FINALS_LABELS = {"euro": {14: "Quarts de finale", 15: "Demi-finales", 16: "Finale"},
                  "world": {14: "Huitièmes de finale", 15: "Quarts de finale", 16: "Demi-finales", 17: "Finale"}}


def nation_ref(world, nid):
    team = world.international.nations[nid]
    return {"id": team.id, "name": team.name, "nation": team.code, "national": True,
            "federation": team.federation, "strength": round(team.strength, 1)}


def get_player_or_none(world, pid):
    """A player called up in a past camp may since have retired or been archived."""
    return world.players.get(pid) if pid >= 0 else world.international.temporary.get(pid)


def international_match_row(world, match):
    edition = world.international.editions[match.season]
    number = match.round_number
    label = (f"Qualifications · J{number}" if number <= 10 else f"Groupes · J{number - 10}" if number <= 13
             else FINALS_LABELS[edition.kind][number])
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


def qualification_run(edition, nid):
    """Furthest qualifying outcome; only meaningful for the European groups every edition draws from."""
    if nid not in {n for group in edition.qualification_groups for n in group}:
        return None
    return {"label": "Qualifié", "winner": False} if nid in edition.qualifiers else {"label": "Éliminé", "winner": False}


def finals_run(world, edition, nid):
    """Furthest finals stage reached; only called for finished editions, so every qualifier has played at least the groups."""
    if nid not in edition.qualifiers:
        return None
    matches = [m for m in edition_matches(world, edition, 11) if nid in (m.home_id, m.away_id) and m.result]
    if not matches:
        return {"label": "Phase de groupes", "winner": False}
    last = max(matches, key=lambda m: m.round_number)
    labels = FINALS_LABELS[edition.kind]
    won = last.round_number == max(labels) and last.result.winner_id == nid
    return {"label": "Vainqueur" if won else labels.get(last.round_number, "Phase de groupes"), "winner": won}


def nation_editions(world, nid):
    """One row per finished edition in which the nation played its qualifiers or its finals, latest first."""
    rows = []
    for edition in sorted(world.international.editions.values(), key=lambda e: -e.year):
        if edition.winner_id is None:
            continue
        qualification, finals = qualification_run(edition, nid), finals_run(world, edition, nid)
        if qualification is None and finals is None:
            continue
        rows.append({"year": edition.year, "name": edition.name, "qualification": qualification, "finals": finals})
    return rows


def international_leaders(records):
    """The players with the most caps and the most goals for a nation, every edition included; names come from the
    record itself since a campaign-only reinforcement never enters the player registry."""
    totals: dict[int, dict] = {}
    for record in records:
        total = totals.setdefault(record.player_id, {"matches": 0, "goals": 0, "name": record.name})
        total["matches"] += record.matches
        total["goals"] += record.goals
    def top(key, order):
        ranked = sorted((pid for pid, total in totals.items() if total[key] > 0),
                        key=lambda pid: (*order(totals[pid]), v.normalized(totals[pid]["name"] or ""), pid))
        return [{"player_id": pid, "player": totals[pid]["name"], "matches": totals[pid]["matches"], "goals": totals[pid]["goals"]}
                for pid in ranked[:LISTED_PLAYERS]]
    return {"matches": top("matches", lambda t: (-t["matches"], -t["goals"])),
            "goals": top("goals", lambda t: (-t["goals"], t["matches"]))}


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
        with service.reading() as world:
            team = world.international.nations[nation_id]
            camp, upcoming = world.international.camps.get(nation_id), True
            if camp is None:
                camp, upcoming = world.international.last_camps.get(nation_id), False
            players = []
            if camp:
                for pid in camp.player_ids:
                    player = get_player_or_none(world, pid)
                    if player is None:
                        continue
                    players.append({"id": pid, "name": player.name, "position": player.position,
                                    "rating": round(player.rating, 1), "fitness": player.fitness,
                                    "injured_until": player.injury.end.iso() if player.injury else None,
                                    "caps": player.international_caps, "goals": player.international_goals,
                                    "suspended": player.international_discipline.get(world.international.editions[camp.edition].competition_id, None).suspended_matches
                                        if world.international.editions[camp.edition].competition_id in player.international_discipline else 0})
            return {**nation_ref(world, nation_id), "reference_strength": team.reference_strength,
                    "camp": {"start": camp.start.iso(), "end": camp.end.iso(), "finals": camp.finals, "upcoming": upcoming} if camp else None,
                    "squad": players,
                    "matches": [international_match_row(world, m) for m in sorted(world.international.matches.values(), key=lambda m: (m.date, m.id))
                                if nation_id in (m.home_id, m.away_id)],
                    "editions": nation_editions(world, nation_id),
                    "leaders": international_leaders(r for r in world.international.records.values() if r.nation_id == nation_id)}

    @api.get("/nations/{nation_id}/navigation")
    def nation_navigation(nation_id: int):
        with service.reading() as world:
            return nav.nation_navigation(world, nation_id)
    return api
