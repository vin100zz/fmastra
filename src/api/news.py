"""The human club's news feed as its page shows it: one row per message, and the content of the message opened.

A message names players, clubs, competitions and matches by reference (`ref`), so that the page links each of them
where it is written; a title is a list of segments, each plain or carrying its reference.
"""
from __future__ import annotations

import re

from core.domain.date import Date, readable_duration
from core.domain.offers import SIGNING
from core.domain.world import NewsItem, World
from core.world.news import PENDING, awaits_answer
from . import views as v

AGGREGATED = {"injury", "injury_end", "suspension", "academy", "release", "retirement", "call_up", "morale", "contract_expiry"}
WINDOWS = {"summer": "d’été", "winter": "d’hiver"}
MORALE = {"temps_de_jeu": "est mécontent de son temps de jeu", "reserve": "ne veut plus être en réserve",
          "salaire": "est mécontent de son salaire", "ambition": "vise un club plus prestigieux", "": "est mécontent"}


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


def title(world: World, item: NewsItem) -> list[dict]:
    """The title of a message, in segments."""
    kind, lines, count = item.kind, item.lines, len(item.lines)
    one = named(world, lines[0].player_id) if count == 1 and lines[0].player_id is not None else None
    rival = opponent(world, item)
    against = (" contre ", (rival["name"], {"club": rival["id"]})) if rival else ()
    if kind == "offer_received" and lines:
        return sentence(f"{plural(count, 'offre', 'offres')} pour ", named(world, item.player_id))
    if kind == "renewal_proposed" and (lines or awaits_answer(world, item)):
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
    if kind == "season_review":
        season = item.date.year - 1
        return sentence(f"Bilan de la saison {season} / {season + 1}")
    return linked(headline(item.text), mentions(world, item))


def row(world: World, index: int, item: NewsItem) -> dict:
    segments = title(world, item)
    return {"id": index, "date": item.date.iso(), "kind": item.kind, "title": "".join(segment["text"] for segment in segments),
            "segments": segments, "read": item.read, "pending": awaits_answer(world, item)}


def summary(world: World) -> dict:
    """What the top bar and the menu tell of the feed: the messages still to read, newest first, and those awaiting an answer."""
    unread = [index for index in range(len(world.news) - 1, -1, -1) if not world.news[index].read]
    pending = [index for index in range(len(world.news) - 1, -1, -1) if awaits_answer(world, world.news[index])]
    return {"unread": len(unread), "next_unread": unread[0] if unread else None, "pending": pending}


def feed(world: World, page: int | None, selected: int | None, size: int) -> dict:
    """A page of the feed, newest first: the page asked for, else the one showing the message `selected`."""
    count = len(world.news)
    if page is None:
        page = (count - 1 - selected) // size + 1 if selected is not None and 0 <= selected < count else 1
    order = list(range(count - 1, -1, -1))
    data = v.paginate(order, page, size)
    data["items"] = [row(world, index, world.news[index]) for index in data["items"]]
    return {**data, "unread": sum(not item.read for item in world.news)}


def squad_line(world: World, player_id: int, **fields) -> dict:
    return {"player": player_ref(world, player_id), **fields}


def offers_body(world: World, item: NewsItem) -> dict:
    from core.ai.market import market_value
    player = world.players.get(item.player_id)

    def state(line) -> str:
        if line.state != PENDING: return line.state
        offer = world.offers.get(line.key)
        return PENDING if offer is not None and offer.awaiting_review else "lapsed"
    return {"player": player_ref(world, item.player_id),
            "value": market_value(player, world) if player is not None and player.club_id == item.club_id else None,
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


def review_body(world: World, item: NewsItem) -> dict:
    from core.world.europe import round_label
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
            elif match is not None:
                entry["round"] = (round_label(world, match.round_number) if competition.kind == "europe"
                                  else v.ROUND_NAMES[match.round_number - 1]).split(" · ")[0]
            competitions.append(entry)
    return {**body, "competitions": competitions}


def message(world: World, index: int) -> dict:
    """A message opened: its row, and what its kind tells."""
    item = world.news[index]
    data = row(world, index, item)
    kind, lines = item.kind, item.lines
    if kind == "offer_received" and lines: data["offers"] = offers_body(world, item)
    elif kind == "renewal_proposed" and (lines or data["pending"]): data["renewal"] = renewal_body(world, item)
    elif kind == "talks_open": data["talks"] = talks_body(world, item)
    elif kind == "contract_expiry" and lines: data["expiry"] = expiry_body(world, item)
    elif kind in ("market_open", "market_close"): data["market"] = market_body(world, item)
    elif kind == "season_review": data["review"] = review_body(world, item)
    elif kind in AGGREGATED and lines:
        rival = opponent(world, item)
        data["match"] = {"id": item.match_id, "opponent": rival} if rival else None
        data["players"] = [squad_line(world, line.player_id,
                                      days=line.until.ordinal() - item.date.ordinal() if kind == "injury" else None,
                                      matches=line.amount if kind == "suspension" else None,
                                      team={"id": int(line.key), "name": line.text} if kind == "call_up" else None,
                                      cause=line.text if kind == "morale" else None,
                                      morale=line.amount if kind == "morale" else None) for line in lines]
    return data
