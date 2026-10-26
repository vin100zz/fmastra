"""History tab of a selection, a read-only projection in the four views of a club's (`club_archive`): the overview and the
editions, its players, its records."""
from collections import defaultdict

from core.domain.international import EDITION_NAMES
from core.domain.world import World
from core.world.international import group_table
from . import records as r
from . import views as v
from .club_archive import LISTED_PLAYERS, LISTED_SEASONS, DEFAULT_FORMATION, ranked
from .international import (DIVISIONS, EDITION_CODES, finals_run, league_division, league_run, nation_ref, qualification_run)

# An average note ranks over twenty caps (fewer in a short history), and over five matches in a single edition.
NOTE_MATCHES = 20
EDITION_NOTE_MATCHES = 5
# The stages an edition can leave a selection at, from the title down: a level of the chart of its editions.
STAGES = {"tournament": ("Vainqueur", "Finale", "Demi-finales", "Quarts de finale", "Huitièmes de finale", "Phase de groupes", "Qualifications"),
          "nations": ("Vainqueur", "Finale", "Demi-finales", *(f"Division {letter}" for letter in DIVISIONS))}
KIND_ORDER = ("world", "euro", "nations")


def tally(played: list[r.Game]) -> dict:
    return {"played": len(played), "won": sum(game.scored > game.conceded for game in played),
            "drawn": sum(game.scored == game.conceded for game in played), "lost": sum(game.scored < game.conceded for game in played),
            "goals_for": sum(game.scored for game in played), "goals_against": sum(game.conceded for game in played)}


def first_phase(world: World, edition, nid: int, moves: dict) -> str | None:
    """Where the first phase left a selection: its rank in its qualifying group, or its division of a Nations League and where
    it went from there."""
    if edition.kind == "nations":
        run = league_run(world, edition, nid, moves)
        return run and run["label"]
    for index, group in enumerate(edition.qualification_groups):
        if nid in group:
            rank = next(rank for rank, row in enumerate(group_table(world, edition, group), 1) if row.club_id == nid)
            return f"{rank}{'er' if rank == 1 else 'e'} du groupe {chr(65 + index)}"
    return "Qualifié" if nid in edition.qualifiers else None


def stage(edition, nid: int, finals: dict | None) -> dict:
    """The stage an edition left a selection at, and its level from the title (0) down."""
    if edition.kind == "nations":
        stages = STAGES["nations"]
        label = finals["label"] if finals else f"Division {DIVISIONS[league_division(edition, nid)]}"
    else:
        stages = STAGES["tournament"]
        label = finals["label"] if finals else "Qualifications"
    return {"label": label, "level": stages.index(label)}


def scorer(world: World, careers: dict[tuple[int, int], dict], year: int) -> dict | None:
    """The selection's top scorer of an edition; at equal goals the one who needed fewer matches."""
    scorers = [(pid, line) for (edition, pid), line in careers.items() if edition == year and line["goals"]]
    if not scorers: return None
    pid, line = min(scorers, key=lambda item: (-item[1]["goals"], item[1]["matches"], v.normalized(item[1]["name"] or ""), item[0]))
    return {"player_id": pid, "player": line["name"], "goals": line["goals"]}


def edition_lines(world: World, nid: int) -> dict[tuple[int, int], dict]:
    """What each player did for the selection in each edition: (edition, player) -> figures."""
    return {(record.edition, record.player_id): {"name": record.name, "matches": record.matches, "goals": record.goals, "assists": record.assists,
                                                  "rating_sum": record.rating_sum, "rating_count": record.rating_count}
            for record in world.international.records.values() if record.nation_id == nid}


def editions(world: World, nid: int, played: list[r.Game], lines: dict) -> list[dict]:
    """One row per finished edition the selection played, latest first: where its first phase left it, the stage of its finals,
    its record, its top scorer, and its strength once the edition was over."""
    by_edition: dict[int, list[r.Game]] = defaultdict(list)
    for game in played: by_edition[game.match.season].append(game)
    held, moves, rows = dict(world.international.strength_history.get(nid, [])), {}, []
    for edition in sorted(world.international.editions.values(), key=lambda edition: -edition.year):
        if edition.winner_id is None: continue
        qualification = league_run(world, edition, nid, moves) if edition.kind == "nations" else qualification_run(edition, nid)
        finals = finals_run(world, edition, nid)
        if qualification is None and finals is None: continue
        strength = held.get(edition.year)
        rows.append({"year": edition.year, "name": edition.name, "kind": edition.kind, "code": EDITION_CODES[edition.kind],
                     "first_phase": first_phase(world, edition, nid, moves), "finals": finals, "stage": stage(edition, nid, finals),
                     "record": tally(by_edition.get(edition.year, [])), "scorer": scorer(world, lines, edition.year),
                     "strength": None if strength is None else {"value": round(strength, 1),
                                                                "change": round(strength - held[edition.year - 1], 1) if edition.year - 1 in held else None}})
    return rows


def honours(rows: list[dict]) -> list[dict]:
    """The titles, a row per competition with the years it was won in, the earliest first: World Cup, Euro, Nations League."""
    found: dict[str, dict] = {}
    for row in sorted(rows, key=lambda row: row["year"]):
        if row["finals"] and row["finals"]["winner"]:
            entry = found.setdefault(row["kind"], {"kind": row["kind"], "code": row["code"], "competition": EDITION_NAMES[row["kind"]], "count": 0, "years": []})
            entry["count"] += 1
            entry["years"].append(row["year"])
    return [found[kind] for kind in KIND_ORDER if kind in found]


def record(world: World, played: list[r.Game]) -> dict:
    """The selection's record in each competition, every edition added (the one under way too): the finals and the qualifiers
    of the World Cup, then of the Euro, then the Nations League; then all of them together."""
    groups: dict[tuple, list[r.Game]] = defaultdict(list)
    for game in played:
        kind = world.international.editions[game.match.season].kind
        phase = "league" if kind == "nations" else "finals" if game.match.round_number > 10 else "qualification"
        groups[(KIND_ORDER.index(kind), phase != "finals", kind, phase)].append(game)
    rows = [{"kind": kind, "code": EDITION_CODES[kind], "phase": phase,
             "competition": "Qualifications" if phase == "qualification" else EDITION_NAMES[kind],
             "editions": len({game.match.season for game in games}), **tally(games)} for (_, _, kind, phase), games in sorted(groups.items())]
    return {"rows": rows, "total": {"editions": len({game.match.season for game in played}), **tally(played)}}


def current(world: World, nid: int) -> dict | None:
    """The edition under way the selection plays in, and where it stands: its division of a Nations League, the group stage of
    a tournament's finals, else its qualifiers."""
    from .international import nation_edition
    edition = nation_edition(world, nid)
    if edition is None or edition.winner_id is not None: return None
    if edition.kind == "nations":
        division = league_division(edition, nid)
        if division is None: return None
        label, stages = f"Division {DIVISIONS[division]}", STAGES["nations"]
    else:
        finals = any(nid in group for group in edition.final_groups)
        if not finals and all(nid not in group for group in edition.qualification_groups): return None
        label, stages = "Phase de groupes" if finals else "Qualifications", STAGES["tournament"]
    return {"year": edition.year, "name": edition.name, "code": EDITION_CODES[edition.kind], "stage": {"label": label, "level": stages.index(label)}}


def summary(world: World, nid: int) -> dict:
    """The overview and the editions: every finished edition and the one under way, the titles, the record in each
    competition and the strength each season opened with."""
    world.international.nations[nid]
    played = r.games(world.international.matches.values(), nid)
    rows = editions(world, nid, played, edition_lines(world, nid))
    return {"items": rows, "current": current(world, nid), "honours": honours(rows), "record": record(world, played),
            "strength": [{"season": year, "value": round(value, 1)} for year, value in sorted(world.international.strength_history.get(nid, []))]}


def positions(world: World) -> dict[int, str]:
    """Each player's position: today's, the campaign-only players' too, or the one he retired with."""
    from .club_archive import positions as club_positions
    known = club_positions(world)
    known.update((pid, player.position.value) for pid, player in world.international.temporary.items())
    return known


def players(world: World, nid: int) -> dict:
    """The players view: the best eleven, the players with the most caps, the most goals and the best average note."""
    world.international.nations[nid]
    careers: dict[int, dict] = {}
    for (edition, pid), line in edition_lines(world, nid).items():
        career = careers.setdefault(pid, {"name": line["name"], "matches": 0, "goals": 0, "assists": 0, "rating_sum": 0.0, "rating_count": 0, "editions": set()})
        for name in ("matches", "goals", "assists", "rating_sum", "rating_count"): career[name] += line[name]
        if line["matches"]: career["editions"].add(edition)
    known = positions(world)
    rows = [{"player_id": pid, "player": career["name"], "position": known.get(pid), "editions": len(career["editions"]),
             "matches": career["matches"], "goals": career["goals"], "assists": career["assists"],
             "note": round(career["rating_sum"] / career["rating_count"], 2) if career["rating_count"] else None}
            for pid, career in careers.items() if career["matches"]]
    threshold = r.note_threshold(max((row["matches"] for row in rows), default=0), NOTE_MATCHES)
    lookup = {row["player_id"]: row for row in rows}
    # The all-time eleven plays the selection's reference formation, revised with its strength.
    formations, reference = world.config.formations.formations, world.international.nations[nid].reference_formation
    shape = reference if reference in formations else DEFAULT_FORMATION
    picks = r.eleven(formations[shape], {row["player_id"]: row["matches"] for row in rows}, {pid: known[pid] for pid in lookup if known.get(pid)})
    return {"formation": shape,
            "eleven": [{"position": role, **({key: lookup[pid][key] for key in ("player_id", "player", "matches")} if pid else {})} for role, pid in picks],
            "matches": ranked(world, rows, lambda row: (-row["matches"], -row["goals"])),
            "goals": ranked(world, [row for row in rows if row["goals"]], lambda row: (-row["goals"], row["matches"])),
            "notes": ranked(world, [row for row in rows if row["note"] is not None and row["matches"] >= threshold], lambda row: (-row["note"], -row["matches"])),
            "note_matches": threshold}


def game_row(world: World, game: r.Game) -> dict:
    match, edition = game.match, world.international.editions[game.match.season]
    return {"match_id": match.id, "date": match.date.iso(), "year": edition.year, "code": EDITION_CODES[edition.kind], "competition": edition.name,
            "opponent": nation_ref(world, game.opponent), "home": game.home, "neutral": match.neutral, "scored": game.scored, "conceded": game.conceded}


def best_editions(world: World, lines: dict, known: dict[int, str]) -> dict:
    """The best editions a player had for the selection: the most goals, the most assists, the best average note over enough matches."""
    rows = [{"player_id": pid, "player": line["name"], "position": known.get(pid), "year": year,
             "code": EDITION_CODES[world.international.editions[year].kind], "matches": line["matches"], "goals": line["goals"], "assists": line["assists"],
             "note": round(line["rating_sum"] / line["rating_count"], 2) if line["rating_count"] else None}
            for (year, pid), line in lines.items() if line["matches"]]
    return {"goals": ranked(world, [row for row in rows if row["goals"]], lambda row: (-row["goals"], row["matches"], row["year"]), LISTED_SEASONS),
            "assists": ranked(world, [row for row in rows if row["assists"]], lambda row: (-row["assists"], row["matches"], row["year"]), LISTED_SEASONS),
            "notes": ranked(world, [row for row in rows if row["note"] is not None and row["matches"] >= EDITION_NOTE_MATCHES],
                            lambda row: (-row["note"], -row["matches"], row["year"]), LISTED_SEASONS),
            "note_matches": EDITION_NOTE_MATCHES}


def ages(world: World, nid: int, played: list[r.Game], lines: dict, known: dict[int, str]) -> list[dict]:
    """The selection's age records, each with the edition of the match it was set in."""
    held, names = world.international.age_records.get(nid, {}), {pid: line["name"] for (_, pid), line in lines.items()}
    edition_on = {game.match.date: world.international.editions[game.match.season] for game in played}
    rows = []
    for kind in ("youngest", "oldest", "youngest_scorer", "oldest_scorer"):
        if kind not in held: continue
        entry, edition = held[kind], edition_on.get(held[kind].date)
        rows.append({"kind": kind, "player": names.get(entry.player_id) or v.player_name(world, entry.player_id), "position": known.get(entry.player_id),
                     "year": edition.year if edition else None, "code": EDITION_CODES[edition.kind] if edition else None, **r.age(entry)})
    return rows


def records(world: World, nid: int) -> dict:
    """The records view, a club's: the widest wins and heaviest defeats, the runs, the selections met most, the best editions
    of its players and its age records."""
    world.international.nations[nid]
    played = r.games(world.international.matches.values(), nid)
    lines, known = edition_lines(world, nid), positions(world)
    met = r.opponents(played)
    return {**r.widest(played, lambda game: game_row(world, game)), "runs": r.runs(played),
            "opponents": {key: found and {"nation": nation_ref(world, found["id"]), "count": found["count"]} for key, found in met.items()},
            "best": best_editions(world, lines, known), "ages": ages(world, nid, played, lines, known)}


VIEWS = {"ensemble": summary, "editions": summary, "joueurs": players, "records": records}


def history(world: World, nid: int, view: str = "ensemble") -> dict:
    return VIEWS[view](world, nid)
