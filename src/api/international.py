"""Read-only international screens, with no dependency on club seasons."""
from dataclasses import asdict
from typing import Literal
from fastapi import APIRouter
from core.world.international import group_table, best_seconds, edition_matches, next_divisions
from core.world.international_calendar import LEAGUE_ROUNDS, SEMI_FINALS
from . import navigation as nav
from . import views as v
from .nations import competition_colors, kit_colors
from .statistics import LISTED_PLAYERS

# The two characters on an edition's badge (docs/charte-graphique.md, « Compétitions »).
EDITION_CODES = {"euro": "EU", "world": "CM", "nations": "LN"}
FINALS_LABELS = {"euro": {14: "Quarts de finale", 15: "Demi-finales", 16: "Finale"},
                  "world": {14: "Huitièmes de finale", 15: "Quarts de finale", 16: "Demi-finales", 17: "Finale"},
                  "nations": {15: "Demi-finales", 16: "Finale"}}
DIVISIONS = "ABCD"
MOVED = {"promotion": "Promu", "relegation": "Relégué"}


def league_groups(edition):
    """A Nations League's groups with their names, A1 to D2: the division's letter and the group's number in it."""
    return [(f"{DIVISIONS[index]}{number}", group) for index, division in enumerate(edition.divisions)
            for number, group in enumerate(division, 1)]


def league_division(edition, nid):
    """The index of the division a nation plays in a Nations League; none for a nation it leaves out."""
    return next((index for index, division in enumerate(edition.divisions) if any(nid in group for group in division)), None)


def league_movements(world, edition):
    """Where each nation of a Nations League goes as its groups stand: `qualified` for the semi-finals (division A's group
    winners), `promotion` up a division, `relegation` down one."""
    moves = {group_table(world, edition, group)[0].club_id: "qualified" for group in edition.divisions[0]}
    for index, division in enumerate(next_divisions(world, edition)):
        for nid in division:
            before = league_division(edition, nid)
            if before != index:
                moves[nid] = "promotion" if index < before else "relegation"
    return moves


def nation_ref(world, nid):
    team = world.international.nations[nid]
    return {"id": team.id, "name": team.name, "nation": team.code, "national": True,
            "federation": team.federation, "strength": round(team.strength, 1)}


def get_player_or_none(world, pid):
    """A player called up in a past camp may since have retired or been archived."""
    return world.players.get(pid) if pid >= 0 else world.international.temporary.get(pid)


def round_label(edition, number, division=None):
    """A round's name; a Nations League's match day names the division of the match when it is given."""
    if edition.kind == "nations" and number <= LEAGUE_ROUNDS:
        return f"{'Phase de ligue' if division is None else f'Division {DIVISIONS[division]}'} · J{number}"
    return (f"Qualifications · J{number}" if number <= 10 else f"Groupes · J{number - 10}" if number <= 13
            else FINALS_LABELS[edition.kind][number])


def international_match_row(world, match):
    edition = world.international.editions[match.season]
    number = match.round_number
    label = round_label(edition, number, league_division(edition, match.home_id))
    return {"id": match.id, "date": match.date.iso(), "round": number, "season": edition.year,
            "competition_id": edition.competition_id, "competition": edition.name, "international": True,
            "competition_code": EDITION_CODES[edition.kind],
            "aggregate": None, "first_leg_id": None, "first_leg_score": None, "return_leg_id": None, "qualified_id": None,
            "home": nation_ref(world, match.home_id),
            "away": nation_ref(world, match.away_id), "score": [match.result.home_goals, match.result.away_goals] if match.result else None,
            "penalties": match.result.penalties if match.result else None, "winner_id": match.result.winner_id if match.result else None,
            "neutral": match.neutral, "round_label": label}


def record_rows(world, year=None, nid=None):
    return [{**asdict(row), "nation": nation_ref(world, row.nation_id)} for row in world.international.records.values()
            if (year is None or row.edition == year) and (nid is None or row.nation_id == nid)]


def standing_row(world, row):
    return {**asdict(row), "difference": row.difference, "nation": nation_ref(world, row.club_id)}


def edition_holder(world, edition):
    """The nation that won the latest earlier edition of the same competition; none before its second edition."""
    earlier = [item for item in world.international.editions.values()
               if item.kind == edition.kind and item.year < edition.year and item.winner_id is not None]
    return nation_ref(world, max(earlier, key=lambda item: item.year).winner_id) if earlier else None


def league_rows(world, edition, group, moves):
    """A Nations League group's table, each row with where its nation goes as it stands (`movement`)."""
    return [{**standing_row(world, row), "movement": moves.get(row.club_id)} for row in group_table(world, edition, group)]


def edition_view(world, year):
    edition = world.international.editions[year]
    def row_view(row):
        return standing_row(world, row)
    def groups_view(groups, finals):
        return [{"name": chr(65 + index), "rows": [row_view(row) for row in group_table(world, edition, group, finals)]}
                for index, group in enumerate(groups)]
    league = edition.kind == "nations"
    moves = league_movements(world, edition) if league else {}
    return {"year": edition.year, "name": edition.name, "kind": edition.kind,
            # What its header shows: its badge, its colours, and who holds the title until it is won.
            "code": EDITION_CODES[edition.kind], **competition_colors(EDITION_CODES[edition.kind]), "holder": edition_holder(world, edition),
            "qualification_groups": groups_view(edition.qualification_groups, False),
            "final_groups": groups_view(edition.final_groups, True),
            # A Nations League's divisions, each with its groups, every row marked with where its nation goes.
            "divisions": [{"name": f"Division {DIVISIONS[index]}",
                           "groups": [{"name": f"{DIVISIONS[index]}{number}", "rows": league_rows(world, edition, group, moves)}
                                      for number, group in enumerate(division, 1)]}
                          for index, division in enumerate(edition.divisions)],
            "knockout_rounds": [{"number": number, "label": label} for number, label in FINALS_LABELS[edition.kind].items()],
            "best_seconds": [] if league else [row_view(row) for row in best_seconds(world, edition)],
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


def league_run(world, edition, nid, moves=None):
    """Where a Nations League's groups left a nation: its division, and the one it went up or down to. `moves` keeps each
    edition's movements across the nations of one request."""
    division = league_division(edition, nid)
    if division is None:
        return None
    moves = {} if moves is None else moves
    if edition.year not in moves:
        moves[edition.year] = league_movements(world, edition)
    moved = MOVED.get(moves[edition.year].get(nid))
    return {"label": f"Division {DIVISIONS[division]}{f' · {moved}' if moved else ''}", "winner": False}


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


def nation_editions(world, nid, moves=None):
    """One row per finished edition in which the nation played its first phase or its finals, latest first."""
    rows = []
    for edition in sorted(world.international.editions.values(), key=lambda e: -e.year):
        if edition.winner_id is None:
            continue
        first = league_run(world, edition, nid, moves) if edition.kind == "nations" else qualification_run(edition, nid)
        qualification, finals = first, finals_run(world, edition, nid)
        if qualification is None and finals is None:
            continue
        rows.append({"year": edition.year, "name": edition.name, "qualification": qualification, "finals": finals})
    return rows


def nation_summary(world, nid, moves=None):
    """What the nations list shows beside a nation's strength: its titles and how its latest finished edition went."""
    titles = sum(1 for edition in world.international.editions.values() if edition.winner_id == nid)
    rows = nation_editions(world, nid, moves)
    run = rows[0]["finals"] or rows[0]["qualification"] if rows else None
    return {"titles": titles, "last_edition": {"name": rows[0]["name"], "label": run["label"], "winner": run["winner"]} if run else None}


def edition_group(world, edition, nid):
    """A nation's group in an edition: its group of the finals once it is drawn into one, otherwise its qualifying group,
    or its group of a Nations League, every row marked with where its nation goes; none for a nation the edition leaves out."""
    if edition.kind == "nations":
        for name, group in league_groups(edition):
            if nid in group:
                return {"year": edition.year, "edition": edition.name, "stage": "Phase de ligue", "finals": False, "name": name,
                        "places": 0, "rows": league_rows(world, edition, group, league_movements(world, edition))}
        return None
    for finals, groups in ((True, edition.final_groups), (False, edition.qualification_groups)):
        for index, group in enumerate(groups):
            if nid in group:
                return {"year": edition.year, "edition": edition.name, "stage": "Phase finale" if finals else "Qualifications",
                        "finals": finals, "name": chr(65 + index),
                        # The places that qualify: the first of a qualifying group, the first two of a group of the finals.
                        "places": 2 if finals else 1,
                        "rows": [standing_row(world, row) for row in group_table(world, edition, group, finals)]}
    return None


def current_edition(world):
    """The edition under way, or the latest one once it is over; none before the first."""
    editions = sorted(world.international.editions.values(), key=lambda edition: edition.year)
    return next((item for item in editions if item.winner_id is None), editions[-1] if editions else None)


def nation_edition(world, nid):
    """The edition a nation is at: that of its next match, else of its latest one, else the edition under way."""
    matches = [m for m in world.international.matches.values() if nid in (m.home_id, m.away_id)]
    coming = [m for m in matches if m.result is None]
    if coming or matches:
        match = min(coming, key=lambda m: (m.date, m.id)) if coming else max(matches, key=lambda m: (m.date, m.id))
        return world.international.editions[match.season]
    return current_edition(world)


def nation_group(world, nid):
    """The group a nation plays in: of the edition it is at, from its Nations League to the qualifiers and the finals."""
    edition = nation_edition(world, nid)
    return edition_group(world, edition, nid) if edition else None


def edition_place(world, edition, nid):
    """Where a nation stands in an edition, as a club's calendar says it of a cup: its rank in its group while the groups
    are played, then the round it is to play, the round it went out in, or the title (`winner`)."""
    if edition.winner_id == nid:
        return {"place": "Vainqueur", "winner": True}
    if edition.runner_up_id == nid:
        return {"place": "Finaliste", "winner": False}
    group, labels = edition_group(world, edition, nid), FINALS_LABELS[edition.kind]
    if group is None:
        return {"place": "—", "winner": False}
    rank = next(index for index, row in enumerate(group["rows"], 1) if row["nation"]["id"] == nid)
    standing = f"{rank}{'er' if rank == 1 else 'e'} du groupe {group['name']}"
    if edition.kind == "nations":
        knockouts = sorted((m for m in edition_matches(world, edition, SEMI_FINALS) if nid in (m.home_id, m.away_id)), key=lambda m: (m.date, m.id))
        coming = [m for m in knockouts if not m.result]
        if coming:
            return {"place": labels[coming[0].round_number], "winner": False}
        if knockouts:
            return {"place": f"Éliminé · {labels[knockouts[-1].round_number]}", "winner": False}
        # Its groups over, where they left it.
        return {"place": league_run(world, edition, nid)["label"] if edition.qualifiers else standing, "winner": False}
    if not group["finals"]:
        # Its qualifiers are still played, or it went no further.
        return {"place": "Éliminé · Qualifications" if edition.final_groups else standing, "winner": False}
    finals = sorted((m for m in edition_matches(world, edition, 11) if nid in (m.home_id, m.away_id)), key=lambda m: (m.date, m.id))
    coming = [m for m in finals if not m.result]
    if coming:
        number = coming[0].round_number
        return {"place": standing if number <= 13 else labels[number], "winner": False}
    played = [m for m in finals if m.round_number >= 14]
    if played:
        last = played[-1]
        # The day a round ends, its winners wait for the next one to be drawn.
        through = last.result.winner_id == nid and last.round_number + 1 in labels
        return {"place": labels[last.round_number + 1] if through else f"Éliminé · {labels[last.round_number]}", "winner": False}
    drawn = bool(edition_matches(world, edition, 14)) or edition.winner_id is not None
    return {"place": "Éliminé · Phase de groupes" if drawn else standing, "winner": False}


def nation_calendar(world, nid, year=None):
    """A nation's matches of one edition, each played one with its scorers and its outcome, its group in that edition, and
    for each edition it played, the latest first, where it stands or stood and its record. `year` picks the edition: by
    default the one under way if the nation plays in it, otherwise the latest it played in."""
    from .club_overview import outcome, record
    from .rounds import scorers
    world.international.nations[nid]
    by_edition: dict[int, list] = {}
    for match in world.international.matches.values():
        if nid in (match.home_id, match.away_id):
            by_edition.setdefault(match.season, []).append(match)
    if not by_edition:
        return {"edition": None, "editions": [], "items": [], "group": None, "competitions": []}
    editions = [world.international.editions[item] for item in sorted(by_edition, reverse=True)]
    current = nation_edition(world, nid)
    picked = year if year in by_edition else current.year if current.year in by_edition else editions[0].year
    games = sorted(by_edition[picked], key=lambda m: (m.date, m.id))
    return {"edition": picked, "editions": [{"year": edition.year, "name": edition.name} for edition in editions],
            "items": [{**international_match_row(world, m), "scorers": scorers(world, m), "outcome": outcome(nid, m) if m.result else None}
                      for m in games],
            "group": edition_group(world, world.international.editions[picked], nid),
            "competitions": [{"id": edition.competition_id, "year": edition.year, "name": edition.name, "kind": "international",
                              "code": EDITION_CODES[edition.kind], **edition_place(world, edition, nid), **record(nid, by_edition[edition.year])}
                             for edition in editions]}


def camp_rows(world, camp):
    """The players of a camp as a squad lists them, each with his caps and goals for the selection and what he did in the
    camp's edition: matches, goals, assists, average."""
    edition = world.international.editions[camp.edition]
    rows = []
    for pid in camp.player_ids:
        player = get_player_or_none(world, pid)
        if player is None:
            continue
        discipline = player.international_discipline.get(edition.competition_id)
        record = world.international.records.get(f"{edition.year}:{pid}")
        row = v.player_row(world, player)
        if pid < 0:
            # A campaign-only reinforcement has neither a club nor a contract.
            row.update({"value": None, "wage": None, "contract_end": None, "expiring": False})
        rows.append({**row, "id": pid, "caps": player.international_caps, "international_goals": player.international_goals,
                     "suspension": discipline.suspended_matches if discipline else 0,
                     "appearances": record.matches if record else 0, "substitutes": 0,
                     "goals": record.goals if record else 0, "assists": record.assists if record else 0,
                     "average": round(record.rating_sum / record.rating_count, 2) if record and record.rating_count else None})
    return rows


def sorted_rows(world, rows, column, descending):
    """A camp's list in the order of one of its columns; a figure a player lacks (a reinforcement's value) stays last."""
    from .routes import squad_sort_key
    key = (lambda row: v.normalized(row["club"]["name"]) if row["club"] else None) if column == "club" else squad_sort_key(world, column)
    known = sorted((row for row in rows if key(row) is not None), key=lambda row: (key(row), row["id"]), reverse=descending)
    return known + [row for row in rows if key(row) is None]


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


NationSquadSort = Literal["position", "name", "club", "age", "rating", "potential", "value", "wage", "contract_end", "fitness",
                          "form", "caps", "international_goals", "appearances", "goals", "assists", "average"]


def international_router(service):
    from .routes import AttributeSort, CompositeSort
    api = APIRouter(prefix="/international")

    @api.get("")
    def overview():
        with service.reading() as world:
            moves = {}
            return {"enabled": bool(world.international.nations),
                    "editions": [{"year": e.year, "name": e.name, "kind": e.kind, "code": EDITION_CODES[e.kind],
                                  "winner": nation_ref(world, e.winner_id) if e.winner_id is not None else None}
                                 for e in sorted(world.international.editions.values(), key=lambda e: -e.year)],
                    "nations": [{**nation_ref(world, n.id), **nation_summary(world, n.id, moves)} for n in sorted(world.international.nations.values(), key=lambda n: (-n.strength, n.name))]}

    @api.get("/editions/{year}")
    def edition(year: int):
        with service.reading() as world:
            return edition_view(world, year)

    @api.get("/editions/{year}/journee/{quand}")
    def edition_round(year: int, quand: Literal["derniere", "prochaine"]):
        from .rounds import edition_round as round_view
        with service.reading() as world:
            return round_view(world, year, quand)

    @api.get("/nations/{nation_id}")
    def nation(nation_id: int, tri: NationSquadSort | AttributeSort | CompositeSort = "position", ordre: Literal["asc", "desc"] = "asc"):
        from .club_overview import LAST_MATCHES, NEXT_MATCHES, last_lineup, outcome
        with service.reading() as world:
            team = world.international.nations[nation_id]
            camp, upcoming = world.international.camps.get(nation_id), True
            if camp is None:
                camp, upcoming = world.international.last_camps.get(nation_id), False
            matches = [m for m in sorted(world.international.matches.values(), key=lambda m: (m.date, m.id)) if nation_id in (m.home_id, m.away_id)]
            played, coming = [m for m in matches if m.result], [m for m in matches if not m.result]
            group = nation_group(world, nation_id)
            return {**nation_ref(world, nation_id), **kit_colors(team.name), "reference_strength": team.reference_strength,
                    # The edition the nation plays and how far it stands in it.
                    "competition": {"year": group["year"], "name": group["edition"], "stage": group["stage"]} if group else None,
                    "camp": {"start": camp.start.iso(), "end": camp.end.iso(), "finals": camp.finals, "upcoming": upcoming} if camp else None,
                    "squad": sorted_rows(world, camp_rows(world, camp), tri, ordre == "desc") if camp else [],
                    # Beside the squad, as on a club's page: the latest and the next matches, the last eleven, the group.
                    "calendar": {"last": [{**international_match_row(world, m), "outcome": outcome(nation_id, m)} for m in reversed(played[-LAST_MATCHES:])],
                                 "next": [international_match_row(world, m) for m in coming[:NEXT_MATCHES]]},
                    "lineup": last_lineup(world, nation_id, played),
                    "group": group,
                    "editions": nation_editions(world, nation_id),
                    "leaders": international_leaders(r for r in world.international.records.values() if r.nation_id == nation_id)}

    @api.get("/nations/{nation_id}/calendrier")
    def nation_matches(nation_id: int, edition: int | None = None):
        with service.reading() as world:
            return nation_calendar(world, nation_id, edition)

    @api.get("/nations/{nation_id}/navigation")
    def nation_navigation(nation_id: int):
        with service.reading() as world:
            return nav.nation_navigation(world, nation_id)
    return api
