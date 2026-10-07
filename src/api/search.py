"""The search of the top bar: the players, clubs, competitions and national teams a few typed words name; read-only projection.

A name is found whatever the case and the accents ("ribery" finds "Ribéry"), whatever the order of its words ("ribery fra"),
and by any of them ("bommel" finds "van der Bommel"): each word typed must find a word of the name of its own, the whole
of it, its start, or its inside when it is long enough."""
from __future__ import annotations

from functools import lru_cache

from core.domain.clubs import Competition
from core.domain.world import World
from . import navigation as nav
from . import views as v

# The kinds of page a search opens, in the order two equal matches come in: the few before the many.
KINDS = ("nation", "competition", "club", "player")
# The values of the `type` parameter, which keeps one kind.
TYPES = {"joueurs": "player", "clubs": "club", "competitions": "competition", "selections": "nation"}
RESULTS = 12
# In a list of every kind, the places each of the first kinds may take; what is left goes to whatever matches best.
SHARES = {"nation": 2, "competition": 3, "club": 3}
# Fewer letters than this find too much to be worth showing; more words than this are left aside.
SHORTEST, WORDS = 2, 6
# A word typed this long is also found inside a word of a name, not only at its start.
INSIDE = 3
# How well a word typed finds a name, best first: it is the whole name, a whole word of it, the start of one, the inside of one.
NAME, WORD, START, WITHIN = range(4)
# Letters the decomposition of `views.normalized` leaves whole, as they are typed without their key.
PLAIN = str.maketrans({"ø": "o", "đ": "d", "ð": "d", "ł": "l", "ı": "i", "ħ": "h", "æ": "ae", "œ": "oe", "þ": "th"})


def fold(text: str) -> str:
    """Lower case, without accents nor ligatures: "Ribéry" reads "ribery", "Ødegaard" "odegaard"."""
    return v.normalized(text).translate(PLAIN)


def spelled(name: str) -> list[tuple[str, tuple[int, ...]]]:
    """The words a name is found by, each with the place in the name of every letter it is read from: each run of letters
    and digits, and each group of them between two spaces written without its punctuation ("N'Golo": n, golo, ngolo)."""
    groups: list[list[list[tuple[str, int]]]] = [[[]]]
    for index, original in enumerate(name):
        if original.isspace():
            groups.append([[]])
            continue
        folded = fold(original)
        if not folded:  # an accent written apart from its letter
            continue
        if folded.isalnum(): groups[-1][-1].extend((character, index) for character in folded)
        else: groups[-1].append([])
    found = []
    for group in groups:
        parts = [part for part in group if part]
        found.extend(parts)
        if len(parts) > 1: found.append([letter for part in parts for letter in part])
    return [("".join(character for character, _ in word), tuple(index for _, index in word)) for word in found]


@lru_cache(maxsize=1 << 17)
def words(name: str) -> tuple[tuple[str, ...], int]:
    """The words of `spelled`, and how many letters the name counts: every search reads every name, so they are kept."""
    found = tuple(text for text, _ in spelled(name))
    return found, sum(character.isalnum() for original in name for character in fold(original))


def readings(query: str) -> list[tuple[str, ...]]:
    """The words typed. A group holding punctuation is read both ways, as one word ("zaire-emery": zaireemery) and as
    several (zaire, emery): the name may be written either way."""
    joined, split = [], []
    for group in query.split():
        parts = [text for text, _ in spelled(group)]
        if not parts: continue
        joined.append(parts[-1])
        split.extend(parts[:-1] if len(parts) > 1 else parts)
    return [tokens for tokens in dict.fromkeys((tuple(joined[:WORDS]), tuple(split[:WORDS]))) if tokens]


def reach(token: str, word: str) -> tuple[int, int] | None:
    """How a word typed finds a word of a name, and where in it."""
    if word.startswith(token): return (WORD if len(word) == len(token) else START), 0
    place = word.find(token, 1) if len(token) >= INSIDE else -1
    return None if place < 0 else (WITHIN, place)


def fit(tokens: tuple[str, ...], candidates: tuple[str, ...]) -> tuple[tuple[int, int], list[tuple[int, int]]] | None:
    """Each word typed on a word of the name of its own, the best way there is: the worst and the sum of how well they
    are found, then for each word typed the word it finds and where in it. None when a word typed finds nothing."""
    options = [sorted((*found, index) for index, word in enumerate(candidates) if (found := reach(token, word))) for token in tokens]
    if not all(options): return None
    best = None

    def place(position: int, used: frozenset[int], worst: int, total: int, chosen: list[tuple[int, int]]) -> None:
        nonlocal best
        if best is not None and (worst, total) >= best[0]: return
        if position == len(tokens):
            best = ((worst, total), list(chosen))
            return
        for level, start, index in options[position]:
            if index in used: continue
            chosen.append((index, start))
            place(position + 1, used | {index}, max(worst, level), total + level, chosen)
            chosen.pop()

    place(0, frozenset(), NAME, 0, [])
    return best


def match(tried: list[tuple[str, ...]], name: str) -> tuple[tuple[int, int], tuple[str, ...]] | None:
    """How well the words typed find a name, under the reading that finds it best, and that reading."""
    candidates, letters = words(name)
    best = None
    for tokens in tried:
        # Most names hold none of the letters typed: they are set aside before any word is weighed.
        if not all(any(token in word for word in candidates) for token in tokens): continue
        found = fit(tokens, candidates)
        if found is None: continue
        worst, total = found[0]
        if worst == WORD and sum(map(len, tokens)) == letters: worst = NAME
        if best is None or (worst, total) < best[0]: best = ((worst, total), tokens)
    return best


def marks(name: str, tokens: tuple[str, ...]) -> list[list[int]]:
    """The letters of the name the words typed stand for, as [start, end) runs of its characters, for the screen to set them out."""
    spelling = spelled(name)
    places = fit(tokens, tuple(text for text, _ in spelling))[1]
    runs: list[list[int]] = []
    for start, end in sorted((spelling[index][1][at], spelling[index][1][at + len(token) - 1] + 1) for token, (index, at) in zip(tokens, places)):
        if runs and start <= runs[-1][1]: runs[-1][1] = max(runs[-1][1], end)
        else: runs.append([start, end])
    return runs


def competition_ref(competition: Competition | None) -> dict | None:
    return {"id": competition.id, "name": competition.name, "kind": competition.kind, "code": competition.code,
            "nation": competition.nation, "level": competition.level} if competition else None


def shortlist(found: list[tuple], kind: str | None) -> list[tuple]:
    """The matches shown, best first. In a list of every kind, a kind past its share waits for a place the others leave."""
    found.sort()
    if kind is not None: return found[:RESULTS]
    kept, waiting, counts = [], [], dict.fromkeys(SHARES, 0)
    for entry in found:
        if entry[1] in counts and counts[entry[1]] >= SHARES[entry[1]]:
            waiting.append(entry)
            continue
        kept.append(entry)
        if entry[1] in counts: counts[entry[1]] += 1
    kept = kept[:RESULTS]
    return sorted(kept + waiting[:RESULTS - len(kept)])


def search(world: World, query: str, type: str | None = None) -> dict:
    """The pages the words typed lead to, best match first: the whole name before a whole word, a word's start, its
    inside. At equal match a national team comes before a competition, a club, a player; then the stronger team, the
    human club's country and the higher division, the club playing and the more renowned, the human club's own player
    and the better one, a retired player last."""
    tried, kind = readings(query), TYPES.get(type)
    if not tried or sum(map(len, tried[0])) < SHORTEST: return {"items": []}
    own = world.clubs.get(world.controlled_club_id)
    found: list[tuple] = []

    def look(of: str, item_id: int, name: str, order: tuple, item) -> None:
        if (result := match(tried, name)) is not None:
            found.append(((*result[0], KINDS.index(of), *order, words(name)[0], item_id), of, name, result[1], item))

    if kind in (None, "nation"):
        for team in world.international.nations.values():
            look("nation", team.id, team.name, (-team.strength,), team)
    if kind in (None, "competition"):
        for competition in world.competitions.values():
            circle = 1 if competition.kind == "europe" else 0 if own and competition.nation == own.nation else 2
            look("competition", competition.id, competition.name,
                 (circle, nav.COMPETITION_KINDS.get(competition.kind, len(nav.COMPETITION_KINDS)), competition.level, competition.code or ""), competition)
    if kind in (None, "club"):
        for club in world.clubs.values():
            look("club", club.id, club.name, (club.competition_id is None, -club.reputation), club)
    if kind in (None, "player"):
        for player in world.players.values():
            look("player", player.id, player.name, (0 if own and player.club_id == own.id else 1, -player.rating), player)
        for player_id, name in world.retired.items():
            if player_id not in world.players: look("player", player_id, name, (2, 0), None)

    def view(of: str, name: str, item) -> dict:
        if of == "nation": return {"id": item.id, "name": name, "nation": item.code}
        if of == "competition": return {"id": item.id, "name": name, "competition": competition_ref(item)}
        if of == "club": return {**v.club_ref(world, item.id), "nation": item.nation, "competition": competition_ref(world.competitions.get(item.competition_id))}
        return {"name": name, "position": item.position.value if item else None, "club": v.club_ref(world, item.club_id) if item else None, "retired": item is None}

    return {"items": [{"kind": of, "id": key[-1], **view(of, name, item), "marks": marks(name, tokens)} for key, of, name, tokens, item in shortlist(found, kind)]}
