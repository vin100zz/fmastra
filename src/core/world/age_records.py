"""The age records of a club or a selection: the youngest and the oldest player to play for it, and to score for it.

Each match a side plays updates them (`note_club_match`, `note_international_match`). A save made before they were kept
rebuilds them once from what it holds (`initialize_age_records`): a match whose detail is kept gives the exact day; a season
already archived keeps only each player's statistics, so his age is read on the first day his club played that competition
that season for a youngest record, and on the last one for an oldest record, the bounds of the real day."""
from __future__ import annotations

from core.domain.date import Date
from core.domain.matches import Match, MatchResult
from core.domain.records import AgeRecord
from core.domain.world import World

KINDS = ("youngest", "oldest", "youngest_scorer", "oldest_scorer")


def _keep(records: dict[str, AgeRecord], kind: str, record: AgeRecord, younger: bool) -> None:
    held = records.get(kind)
    # At equal age the first to get there keeps the record.
    if held is None or (record.days < held.days if younger else record.days > held.days):
        records[kind] = record


def note(records: dict[str, AgeRecord], player_id: int, born: Date, first: Date, last: Date | None = None, scored: bool = False) -> None:
    """A player's appearance for a side: `first` is the day it counts for a youngest record, `last` (the same by default) for an
    oldest one; `scored` when he scored."""
    for young, old in (("youngest", "oldest"), ("youngest_scorer", "oldest_scorer")) if scored else (("youngest", "oldest"),):
        _keep(records, young, AgeRecord(player_id, first, born), younger=True)
        _keep(records, old, AgeRecord(player_id, last or first, born), younger=False)


def note_club_match(world: World, match: Match, result: MatchResult) -> None:
    """Every player who played a club match, for the club he played it for."""
    for pid, stats in result.player_stats.items():
        player = world.players.get(pid)
        if stats.minutes <= 0 or player is None or player.club_id not in (match.home_id, match.away_id): continue
        note(world.age_records.setdefault(player.club_id, {}), pid, player.born, match.date, scored=stats.goals > 0)


def note_international_match(world: World, match: Match, result: MatchResult, team_of: dict[int, int]) -> None:
    """Every player who played a selection's match; `team_of` gives each one's selection."""
    from .international_selection import get_player
    for pid, stats in result.player_stats.items():
        if stats.minutes <= 0 or pid not in team_of: continue
        note(world.international.age_records.setdefault(team_of[pid], {}), pid, get_player(world, pid).born, match.date,
             scored=stats.goals > 0)


def birth_dates(world: World) -> dict[int, Date]:
    """The birth of every player the save still knows of: those in play, the campaign-only ones, and the retired ones by their
    movements."""
    births = {row.player_id: row.born for row in world.transfers if row.born is not None}
    births.update((pid, player.born) for pid, player in world.international.temporary.items())
    births.update((pid, player.born) for pid, player in world.players.items())
    return births


def _sides(match: Match) -> dict[int, int]:
    """Each player of a detailed match, with the side he played for."""
    result = match.result
    return {pid: side for side, lineup, bench in ((match.home_id, result.home_lineup, result.home_bench),
                                                    (match.away_id, result.away_lineup, result.away_bench))
            for pid in [*(pid for pid, _ in lineup), *bench]}


def _detailed(records: dict[int, dict[str, AgeRecord]], match: Match, births: dict[int, Date]) -> None:
    sides = _sides(match)
    for pid, stats in match.result.player_stats.items():
        if stats.minutes > 0 and pid in sides and pid in births:
            note(records.setdefault(sides[pid], {}), pid, births[pid], match.date, scored=stats.goals > 0)


def initialize_age_records(world: World) -> None:
    """The records of a save made before they were kept; sides that have some keep them."""
    births = birth_dates(world)
    if not world.age_records:
        played = sorted((match for match in world.matches.values() if match.result), key=lambda match: (match.date, match.id))
        # The first and the last day each club played each competition of each season.
        spans: dict[tuple[int, int, int], list[Date]] = {}
        for match in played:
            for club_id in (match.home_id, match.away_id):
                spans.setdefault((club_id, match.season, match.competition_id), [match.date, match.date])[1] = match.date
        detailed = {match.season for match in played if match.result.engine != "archived"}
        appearances = []
        for record in world.records.values():
            span = spans.get((record.club_id, record.season, record.competition_id))
            if record.matches and span and record.player_id in births and record.season not in detailed:
                appearances.append((span[0], span[1], record))
        # In the order of the days, so that at equal age the first to get there keeps the record.
        moments = [(first, 0, (first, last, record)) for first, last, record in appearances]
        moments += [(match.date, 1, match) for match in played if match.season in detailed and match.result.engine != "archived"]
        records: dict[int, dict[str, AgeRecord]] = {}
        for _, detail, item in sorted(moments, key=lambda moment: moment[:2]):
            if detail:
                _detailed(records, item, births)
                continue
            first, last, record = item
            note(records.setdefault(record.club_id, {}), record.player_id, births[record.player_id], first, last, scored=record.goals > 0)
        world.age_records = records
    if not world.international.age_records:
        records = {}
        for match in sorted((match for match in world.international.matches.values() if match.result and match.result.player_stats),
                            key=lambda match: (match.date, match.id)):
            _detailed(records, match, births)
        world.international.age_records = records
