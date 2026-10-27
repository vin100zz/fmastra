"""The human club's news feed as its page shows it: one row per message, and the content of the message opened.

A message names players, clubs, competitions and matches by reference (`ref`), so that the page links each of them
where it is written; a title is a list of segments, each plain or carrying its reference.
"""
from __future__ import annotations

import re
from collections import defaultdict

from core.domain.date import Date, readable_duration
from core.domain.offers import SIGNING
from core.domain.world import NewsItem, World
from core.world.news import PENDING, awaits_answer
from . import views as v

AGGREGATED = {"injury", "injury_end", "suspension", "academy", "release", "retirement", "call_up", "morale", "contract_expiry", "shirt_numbers"}
WINDOWS = {"summer": "d’été", "winter": "d’hiver"}
MORALE = {"temps_de_jeu": "est mécontent de son temps de jeu", "reserve": "ne veut plus être en réserve",
          "salaire": "est mécontent de son salaire", "ambition": "vise un club plus prestigieux",
          "intransferable": "veut partir, mais n’est pas à vendre", "": "est mécontent"}


def headline(text: str) -> str:
    """News read as headlines; entries saved by older versions still carry "N match(s)", ISO dates and a final full stop."""
    text = re.sub(r"\d{4}-\d{2}-\d{2}", lambda found: Date.parse(found[0]).day_month(), text)
    text = re.sub(r"(\d+) match\(s\)", lambda found: f"{found[1]} match{'s' if int(found[1]) > 1 else ''}", text)
    return text[:-1] if text.endswith(".") else text


def plural(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


def player_ref(world: World, player_id: int | None) -> dict | None:
    """A player as a message names him; one who left the world keeps his name, without a page to open."""
    if player_id is None: return None
    return {"id": player_id, "name": v.player_name(world, player_id) or "Joueur archivé", "gone": player_id not in world.players}


def competition_ref(world: World, competition_id: int) -> dict:
    competition = world.competitions[competition_id]
    return {"id": competition.id, "name": competition.name, "kind": competition.kind, "code": competition.code}


def opponent(world: World, item: NewsItem) -> dict | None:
    """The club the human club played in the match a message tells of."""
    match = world.matches.get(item.match_id) if item.match_id is not None else None
    if match is None: return None
    return v.club_ref(world, match.away_id if match.home_id == item.club_id else match.home_id)


def linked(text: str, names: list[tuple[str, dict]]) -> list[dict]:
    """A sentence cut where it names one of `names` ([name, reference]), each named once at most."""
    segments = [{"text": text}]
    for name, ref in names:
        for index, segment in enumerate(segments):
            if "ref" in segment or not name or name not in segment["text"]: continue
            before, _, after = segment["text"].partition(name)
            segments[index:index + 1] = [part for part in ({"text": before}, {"text": name, "ref": ref}, {"text": after}) if part["text"]]
            break
    return segments


def mentions(world: World, item: NewsItem) -> list[tuple[str, dict]]:
    """Who a plain sentence speaks of: its player, then the clubs of its lines."""
    names = []
    if item.player_id in world.players: names.append((world.players[item.player_id].name, {"player": item.player_id}))
    for line in item.lines:
        if line.club_id in world.clubs: names.append((world.clubs[line.club_id].name, {"club": line.club_id}))
    return names


def sentence(*parts: str | tuple[str, dict]) -> list[dict]:
    return [{"text": part} if isinstance(part, str) else {"text": part[0], "ref": part[1]} for part in parts if part]


def named(world: World, player_id: int) -> tuple[str, dict] | str:
    ref = player_ref(world, player_id)
    return ref["name"] if ref["gone"] else (ref["name"], {"player": player_id})


def round_name(world: World, competition_id: int, number: int) -> str:
    """A round of a cup as its page names it, without the leg of a European tie."""
    from core.world.europe import round_label
    european = world.competitions[competition_id].kind == "europe"
    return (round_label(world, number) if european else v.ROUND_NAMES[number - 1]).split(" · ")[0]


def title(world: World, item: NewsItem) -> list[dict]:
    """The title of a message, in segments."""
    kind, lines, count = item.kind, item.lines, len(item.lines)
    one = named(world, lines[0].player_id) if count == 1 and lines[0].player_id is not None else None
    rival = opponent(world, item)
    against = (" contre ", (rival["name"], {"club": rival["id"]})) if rival else ()
    if kind == "offer_received" and lines:
        # A message of raised offers only says so; beside a new one they are offers like the others.
        raised = all(line.text == "raised" for line in lines)
        what = plural(count, "offre relevée", "offres relevées") if raised else plural(count, "offre", "offres")
        return sentence(f"{what} pour ", named(world, item.player_id))
    # A demand always reads the same, answered or not, whatever sentence an older version wrote for it.
    if kind == "renewal_proposed":
        return sentence(named(world, item.player_id), " veut un nouveau contrat")
    if kind == "injury" and lines:
        if one: return sentence(one, f" blessé {readable_duration(lines[0].until.ordinal() - item.date.ordinal())}")
        return sentence(f"{count} blessés", *against) if rival else sentence(f"{count} joueurs blessés")
    if kind == "injury_end" and lines:
        return sentence(one, " est de nouveau disponible") if one else sentence(f"{count} joueurs de nouveau disponibles")
    if kind == "suspension" and lines:
        if one: return sentence(one, f" suspendu {plural(lines[0].amount, 'match', 'matchs')}")
        return sentence(f"{count} joueurs suspendus", *against)
    if kind == "academy" and lines:
        return sentence(one, " rejoint le centre de formation") if one else sentence(f"{count} joueurs rejoignent le centre de formation")
    if kind == "shirt_numbers" and lines:
        return sentence(one, " change de numéro") if one else sentence(f"{count} changements de numéro")
    if kind in ("release", "retirement") and lines:
        end = "contrat" if kind == "release" else "carrière"
        return sentence(one, f" : fin de {end}") if one else sentence(f"{count} fins de {end}")
    if kind == "call_up" and lines:
        if one: return sentence(one, " convoqué avec ", (lines[0].text, {"nation": int(lines[0].key)}))
        return sentence(f"{count} joueurs convoqués en sélection")
    if kind == "morale" and lines:
        return sentence(one, f" {MORALE.get(lines[0].text, MORALE[''])}") if one else sentence(f"{count} joueurs mécontents")
    if kind == "contract_expiry" and lines:
        when = f"dans {item.text} mois"
        return sentence("Le contrat de ", one, f" expire {when}") if one else sentence(f"{count} contrats expirent {when}")
    if kind in ("market_open", "market_close"):
        return sentence("Le ", (f"mercato {WINDOWS.get(item.text, '')}".strip(), {"page": "transfers"}),
                        " est ouvert" if kind == "market_open" else " ferme demain")
    if kind == "market_recap":
        return sentence("Bilan du ", (f"mercato {WINDOWS.get(item.text, '')}".strip(), {"page": "transfers"}))
    if kind == "cup_draw" and lines:
        cup, rival = competition_ref(world, lines[0].competition_id), v.club_ref(world, lines[0].club_id)
        stage = round_name(world, cup["id"], lines[0].amount)
        stage = f"{stage[0].lower()}{stage[1:]}"
        # A league phase gives several opponents: the message lists them.
        if len({line.club_id for line in lines}) > 1: return sentence((cup["name"], {"competition": cup}), f" : tirage de la {stage}")
        return sentence((cup["name"], {"competition": cup}), " : ", (rival["name"], {"club": rival["id"]}), f" en {stage}")
    if kind == "season_review":
        season = item.date.year - 1
        return sentence(f"Bilan de la saison {season} / {season + 1}")
    return linked(headline(item.text), mentions(world, item))


def groups(world: World) -> dict[int, list[int]]:
    """The demands for a new contract a club received on one day make one message on the page: each of their indices
    to all of that day's, oldest first. The newest stands for them (`head`)."""
    days = defaultdict(list)
    for index, item in enumerate(world.news):
        if item.kind == "renewal_proposed": days[(item.club_id, item.date)].append(index)
    return {index: indices for indices in days.values() if len(indices) > 1 for index in indices}


def head(grouped: dict[int, list[int]], index: int) -> int:
    return grouped[index][-1] if index in grouped else index


def members(grouped: dict[int, list[int]], index: int) -> list[int]:
    return grouped.get(index, [index])


def shown(world: World, grouped: dict[int, list[int]]) -> list[int]:
    """The messages as the page lists them, newest first: a day's demands once, at the newest."""
    return [index for index in range(len(world.news) - 1, -1, -1) if head(grouped, index) == index]


def row(world: World, index: int, item: NewsItem, grouped: dict[int, list[int]] | None = None) -> dict:
    indices = members(grouped or {}, index)
    if len(indices) > 1:
        segments = sentence(f"{len(indices)} joueurs veulent un nouveau contrat")
        read = all(world.news[member].read for member in indices)
        pending = any(awaits_answer(world, world.news[member]) for member in indices)
    else:
        segments, read, pending = title(world, item), item.read, awaits_answer(world, item)
    return {"id": index, "date": item.date.iso(), "kind": item.kind, "title": "".join(segment["text"] for segment in segments),
            "segments": segments, "read": read, "pending": pending}


def summary(world: World) -> dict:
    """What the top bar and the menu tell of the feed: the messages still to read, newest first, and those awaiting an answer."""
    grouped = groups(world)
    order = shown(world, grouped)
    unread = [index for index in order if not all(world.news[member].read for member in members(grouped, index))]
    pending = [index for index in order if any(awaits_answer(world, world.news[member]) for member in members(grouped, index))]
    return {"unread": len(unread), "next_unread": unread[0] if unread else None, "pending": pending}


def mark_read(world: World, ids: list[int] | None) -> None:
    """Opening a message reads it, and with it the other demands of its day."""
    grouped = groups(world)
    targets = range(len(world.news)) if ids is None else [member for index in ids if 0 <= index < len(world.news) for member in members(grouped, index)]
    for index in targets: world.news[index].read = True


def feed(world: World, page: int | None, selected: int | None, size: int) -> dict:
    """A page of the feed, newest first: the page asked for, else the one showing the message `selected`."""
    grouped = groups(world)
    order = shown(world, grouped)
    if page is None:
        target = head(grouped, selected) if selected is not None and 0 <= selected < len(world.news) else None
        page = order.index(target) // size + 1 if target is not None else 1
    data = v.paginate(order, page, size)
    data["items"] = [row(world, index, world.news[index], grouped) for index in data["items"]]
    return {**data, "unread": sum(not all(world.news[member].read for member in members(grouped, index)) for index in order)}


def squad_line(world: World, player_id: int, **fields) -> dict:
    return {"player": player_ref(world, player_id), **fields}


def offers_body(world: World, item: NewsItem) -> dict:
    """The offers of a message, highest first, each with its answer; the value of the player and whether the club
    keeps him off the market (`untouchable`), both None once he has left it."""
    from core.ai.market import market_value
    from core.world.human import untouchable
    player = world.players.get(item.player_id)
    own = player is not None and player.club_id == item.club_id

    def state(line) -> str:
        if line.state != PENDING: return line.state
        offer = world.offers.get(line.key)
        return PENDING if offer is not None and offer.awaiting_review else "lapsed"
    return {"player": player_ref(world, item.player_id), "value": market_value(player, world) if own else None,
            "untouchable": untouchable(world, player.id) if own else None,
            "offers": [{"key": line.key, "club": v.club_ref(world, line.club_id), "fee": line.amount, "state": state(line)}
                       for line in sorted(item.lines, key=lambda line: (-line.amount, line.key))]}


def renewal_body(world: World, item: NewsItem) -> dict:
    waiting = awaits_answer(world, item)
    if item.lines:
        current, asked = item.lines[0], item.lines[-1]
        terms = {"current": {"wage": current.amount, "end": current.until.iso()}, "asked": {"wage": asked.amount, "end": asked.until.iso()}}
        state = asked.state if asked.state != PENDING else PENDING if waiting else "lapsed"
    else:  # A demand written before messages had lines: its terms are those still awaiting an answer.
        proposal, contract = world.pending_renewals[item.player_id], world.players[item.player_id].contract
        terms = {"current": {"wage": contract.weekly_wage, "end": contract.end.iso()},
                 "asked": {"wage": proposal.contract.weekly_wage, "end": proposal.contract.end.iso()}}
        state = PENDING
    return {"player": player_ref(world, item.player_id), **terms, "state": state}


def renewals_body(world: World, indices: list[int]) -> list[dict]:
    """The demands of a day, the highest wage asked first: each player with his position and level, his contract and the
    one he asks for, and the answer."""
    rows = []
    for index in indices:
        body = renewal_body(world, world.news[index])
        player = world.players.get(body["player"]["id"])
        rows.append({**body, "position": player.position.value if player else None, "rating": round(player.rating, 1) if player else None})
    return sorted(rows, key=lambda entry: (-entry["asked"]["wage"], entry["player"]["name"]))


def injury_body(world: World, item: NewsItem) -> dict:
    """What an injury costs the club: the day each player is back, and the club's matches he misses until then."""
    club_matches = sorted((match for match in world.matches.values()
                           if item.club_id in (match.home_id, match.away_id) and match.date > item.date),
                          key=lambda match: (match.date, match.id))
    back = max(line.until for line in item.lines)
    missed = [match for match in club_matches if match.date < back]
    return {"back": back.iso(),
            "matches": [{"id": match.id, "date": match.date.iso(), "competition": competition_ref(world, match.competition_id),
                         "opponent": v.club_ref(world, match.away_id if match.home_id == item.club_id else match.home_id),
                         "home": match.home_id == item.club_id, "played": match.result is not None} for match in missed],
            "missed": {line.player_id: sum(match.date < line.until for match in missed) for line in item.lines}}


def talks_body(world: World, item: NewsItem) -> dict:
    from core.world.talks import talks_for
    player, waiting = world.players.get(item.player_id), awaits_answer(world, item)
    talks = talks_for(world, item.player_id)
    line = item.lines[0] if item.lines else None
    body = {"player": player_ref(world, item.player_id), "club": v.club_ref(world, line.club_id) if line else None,
            "fee": line.amount if line else None, "state": PENDING if waiting else "closed", "arrival": None}
    if not waiting and talks is not None and talks.stage == SIGNING and talks.created <= item.date:
        body.update(state="agreed", arrival=talks.due.iso())
    if waiting:
        body["talks"] = v.talks_view(world, player)
        body["profile"] = {"id": player.id, "name": player.name, "club": v.club_ref(world, player.club_id),
                           "wage": player.contract.weekly_wage if player.contract else 0}
    return body


def expiry_body(world: World, item: NewsItem) -> dict:
    from core.world.renewals import asked_terms, renewal_obstacle
    rows = []
    for line in sorted(item.lines, key=lambda line: (-line.amount, line.player_id)):
        player = world.players.get(line.player_id)
        entry = squad_line(world, line.player_id, wage=line.amount, end=line.until.iso(), terms=None, obstacle=None)
        # The contract he would sign today, as long as the one the message tells of still runs.
        if player is not None and player.owner_id == item.club_id and player.contract.end == line.until:
            entry["obstacle"], entry["demande"] = renewal_obstacle(world, player), player.id in world.pending_renewals
            if entry["obstacle"] is None:
                terms = asked_terms(world, player)
                entry["terms"] = {"wage": terms.weekly_wage, "end": terms.end.iso(), "current_wage": player.contract.weekly_wage}
        else:
            entry["settled"] = True
        rows.append(entry)
    return {"months": int(item.text), "players": rows}


def market_body(world: World, item: NewsItem) -> dict:
    figures = {line.text: line for line in item.lines if line.text in ("budget", "wages", "end")}
    players = lambda key: [player_ref(world, line.player_id) for line in item.lines if line.text == key]
    return {"window": item.text, "budget": figures["budget"].amount if "budget" in figures else None,
            "wages": figures["wages"].amount if "wages" in figures else None,
            "end": figures["end"].until.iso() if "end" in figures else None,
            "talks": players("talks"), "offers": players("offers")}


def recap_body(world: World, item: NewsItem) -> dict:
    """The main transfers of a window: those of the division the human club played in, then those of the world (no
    competition). A free player has no fee: his level stands in its place."""
    scopes = {}
    for line in item.lines:
        free = line.state == "free"
        scope = scopes.setdefault(line.text, {"competition": competition_ref(world, line.competition_id) if line.competition_id in world.competitions else None,
                                              "transfers": []})
        scope["transfers"].append({"player": player_ref(world, line.player_id), "source": v.club_ref(world, int(line.key)) if line.key else None,
                                   "target": v.club_ref(world, line.club_id), "fee": None if free else line.amount,
                                   "rating": line.amount / 2 if free else None})
    return {"window": item.text, "scopes": list(scopes.values())}


def draw_body(world: World, item: NewsItem) -> dict:
    """The matches a cup drew for the human club, in the order it plays them: the opponent, the day and where."""
    return {"matches": [{"id": line.match_id, "opponent": v.club_ref(world, line.club_id), "date": line.until.iso(), "venue": line.text}
                        for line in item.lines]}


def review_body(world: World, item: NewsItem) -> dict:
    competitions, body = [], {"season": item.date.year - 1, "europe": None, "scorer": None, "rating": None}
    for line in item.lines:
        if line.text == "europe": body["europe"] = competition_ref(world, line.competition_id)
        elif line.text == "scorer": body["scorer"] = {"player": player_ref(world, line.player_id), "goals": line.amount}
        elif line.text == "rating": body["rating"] = {"player": player_ref(world, line.player_id), "average": line.amount / 100}
        elif line.competition_id in world.competitions:
            competition = world.competitions[line.competition_id]
            entry = {"competition": competition_ref(world, competition.id), "winner": v.club_ref(world, line.club_id),
                     "rank": None, "points": None, "round": None, "won": line.state == "won"}
            match = world.matches.get(line.match_id) if line.match_id is not None else None
            if competition.kind == "league": entry.update(rank=line.amount, points=int(line.text or 0))
            elif match is not None: entry["round"] = round_name(world, competition.id, match.round_number)
            competitions.append(entry)
    return {**body, "competitions": competitions}


def message(world: World, index: int) -> dict:
    """A message opened: its row, and what its kind tells."""
    grouped = groups(world)
    index = head(grouped, index)
    item = world.news[index]
    data = row(world, index, item, grouped)
    kind, lines = item.kind, item.lines
    if index in grouped: data["renewals"] = renewals_body(world, grouped[index])
    elif kind == "offer_received" and lines: data["offers"] = offers_body(world, item)
    elif kind == "renewal_proposed" and (lines or data["pending"]): data["renewal"] = renewal_body(world, item)
    elif kind == "talks_open": data["talks"] = talks_body(world, item)
    elif kind == "contract_expiry" and lines: data["expiry"] = expiry_body(world, item)
    elif kind in ("market_open", "market_close"): data["market"] = market_body(world, item)
    elif kind == "market_recap": data["recap"] = recap_body(world, item)
    elif kind == "cup_draw" and lines: data["draw"] = draw_body(world, item)
    elif kind == "season_review": data["review"] = review_body(world, item)
    # A player who comes to the club: the number he takes there, which the message shows on the club's shirt.
    elif kind in ("transfer", "loan", "loan_return"):
        data["shirt"] = next((line.amount for line in lines if line.amount is not None), None)
    elif kind in AGGREGATED and lines:
        if kind == "academy" and len(lines) == 1: data["shirt"] = lines[0].amount
        rival = opponent(world, item)
        data["match"] = {"id": item.match_id, "opponent": rival} if rival else None
        injury = injury_body(world, item) if kind == "injury" and all(line.until for line in lines) else None
        if injury: data["injury"] = {"back": injury["back"], "matches": injury["matches"]}
        data["players"] = [squad_line(world, line.player_id,
                                      days=line.until.ordinal() - item.date.ordinal() if kind == "injury" else None,
                                      back=line.until.iso() if kind == "injury" else None,
                                      missed=injury["missed"].get(line.player_id) if injury else None,
                                      matches=line.amount if kind == "suspension" else None,
                                      team={"id": int(line.key), "name": line.text} if kind == "call_up" else None,
                                      cause=line.text if kind == "morale" else None,
                                      morale=line.amount if kind == "morale" else None,
                                      shirt=line.amount if kind in ("academy", "shirt_numbers") else None,
                                      before=int(line.text) if kind == "shirt_numbers" and line.text else None) for line in lines]
    return data
