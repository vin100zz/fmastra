"""What a side's matches and players add up to over its history, a club's as a selection's: its widest scores, its runs, the
sides it met most, its best eleven and its age records. Read-only."""
from __future__ import annotations

from collections import Counter
from typing import Callable, Iterable

from core.domain.date import Date
from core.domain.matches import Match
from core.domain.records import AgeRecord

LISTED_SCORES = 5
# A run still going is told once it has lasted this many matches.
ONGOING_RUN = 3
# Each run, in the order the screens list them, and what extends it from the side's goals and the other's.
RUNS: tuple[tuple[str, Callable[[int, int], bool]], ...] = (
    ("wins", lambda scored, conceded: scored > conceded), ("unbeaten", lambda scored, conceded: scored >= conceded),
    ("defeats", lambda scored, conceded: scored < conceded), ("winless", lambda scored, conceded: scored <= conceded),
    ("scoring", lambda scored, conceded: scored > 0), ("scoreless", lambda scored, conceded: scored == 0),
    ("clean_sheets", lambda scored, conceded: conceded == 0), ("conceding", lambda scored, conceded: conceded > 0))
# Where a place of the best eleven looks when no player of its own position is left, the nearest first.
NEIGHBOURS = {"GB": (), "DC": ("DG", "DD"), "DG": ("DD", "DC"), "DD": ("DG", "DC"), "MDC": ("MC", "DC"), "MC": ("MDC", "MOC"),
              "MOC": ("MC", "AILG", "AILD"), "AILG": ("AILD", "MOC"), "AILD": ("AILG", "MOC"), "BU": ("MOC", "AILG", "AILD")}


class Game:
    """A played match from one side's point of view."""
    __slots__ = ("match", "scored", "conceded", "opponent", "home")

    def __init__(self, match: Match, side_id: int):
        result, self.match, self.home = match.result, match, match.home_id == side_id
        self.scored, self.conceded = (result.home_goals, result.away_goals) if self.home else (result.away_goals, result.home_goals)
        self.opponent = match.away_id if self.home else match.home_id


def games(matches: Iterable[Match], side_id: int) -> list[Game]:
    """The side's played matches, the oldest first; a match both sides forfeited counts for neither."""
    played = (match for match in matches if side_id in (match.home_id, match.away_id) and match.result and match.result.status != "double_forfeit")
    return [Game(match, side_id) for match in sorted(played, key=lambda match: (match.date, match.id))]


def widest(played: list[Game], row: Callable[[Game], dict]) -> dict:
    """The widest wins and the heaviest defeats: the margin, then the goals of the side that won it, then the earliest."""
    def top(kept: list[Game], sign: int) -> list[dict]:
        ranked = sorted(kept, key=lambda game: (-sign * (game.scored - game.conceded), -(game.scored if sign > 0 else game.conceded),
                                                game.match.date, game.match.id))
        return [row(game) for game in ranked[:LISTED_SCORES]]
    return {"wins": top([game for game in played if game.scored > game.conceded], 1),
            "defeats": top([game for game in played if game.scored < game.conceded], -1)}


def runs(played: list[Game]) -> dict:
    """The longest run of each kind, the first to reach its length, and the runs still going since at least ONGOING_RUN matches."""
    longest, ongoing = [], []
    for kind, extends in RUNS:
        best, start, count = None, None, 0
        for game in played:
            if extends(game.scored, game.conceded):
                start, count = (start if count else game), count + 1
                if best is None or count > best[2]: best = (start, game, count)
            else:
                count = 0
        if best:
            longest.append({"kind": kind, "count": best[2], "first": best[0].match.date.iso(), "last": best[1].match.date.iso()})
        if count >= ONGOING_RUN:
            ongoing.append({"kind": kind, "count": count, "first": start.match.date.iso()})
    return {"longest": longest, "ongoing": ongoing}


def opponents(played: list[Game]) -> dict:
    """The side met most, the one beaten most often and the one that won most often against it, each with its count; at an
    equal count, the first met."""
    def most(counts: Counter) -> dict | None:
        return {"id": counts.most_common(1)[0][0], "count": counts.most_common(1)[0][1]} if counts else None
    return {"played": most(Counter(game.opponent for game in played)),
            "beaten": most(Counter(game.opponent for game in played if game.scored > game.conceded)),
            "beaten_by": most(Counter(game.opponent for game in played if game.scored < game.conceded))}


def eleven(roles: Iterable[str], matches: dict[int, int], positions: dict[int, str]) -> list[tuple[str, int | None]]:
    """The best eleven of a tactic: at each place, the player of its position with the most matches for the side; a place no
    player of its position is left for takes the nearest positions' (`NEIGHBOURS`), else stays empty."""
    roles = list(roles)
    ranked = sorted((pid for pid in matches if pid in positions), key=lambda pid: (-matches[pid], pid))
    picks: list[int | None] = [None] * len(roles)
    for wanted in (lambda role: (role,), lambda role: NEIGHBOURS.get(role, ())):
        for index, role in enumerate(roles):
            if picks[index] is None:
                picks[index] = next((pid for pid in ranked if positions[pid] in wanted(role) and pid not in picks), None)
    return list(zip(roles, picks))


def note_threshold(most: int, full: int) -> int:
    """The matches an average note needs to rank: `full`, or half the matches of the side's most used player while he has
    fewer than twice as many (a short history)."""
    return max(1, min(full, (most + 1) // 2))


def age(record: AgeRecord) -> dict:
    """An age record as the screens write it: the day it was set and the age in whole years and months."""
    months = (record.date.year - record.born.year) * 12 + record.date.month - record.born.month - (record.date.day < record.born.day)
    return {"player_id": record.player_id, "date": record.date.iso(), "years": months // 12, "months": months % 12}


def season_of(day: Date, opening: tuple[int, int]) -> int:
    """The season a day falls in, seasons opening on `opening` (month, day)."""
    return day.year - ((day.month, day.day) < opening)
