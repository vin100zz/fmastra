"""Yearly revision of club reputation; no file access, no randomness.

A club's reputation is pulled towards a target built on its size (the reputation it was imported with, its anchor)
and moved by what it did: the division it will play, its rank, its European place and its honours. A division below
the top flight also caps the target at what its typical club holds, so a fallen giant loses its surplus over the years
while a small promoted club gains only a little. Every club is revised, simulated or not; a club whose division is
unknown (a nation outside the pyramids) is moved by Europe and honours alone.
"""
from collections import defaultdict
from statistics import median

from core.config.model import Config
from core.domain.clubs import Club
from core.domain.world import World
from core.math import clamp
from .calendar import Standing
from .events import ReputationRevised

Level = tuple[str, int]  # (nation, level), level 1 being the top flight


def division_levels(cfg: Config) -> dict[int, Level]:
    """Level of every division that has one: the simulated leagues, and each reserve pool one level below its pyramid."""
    levels = {league.division_id: (league.nation, league.level) for league in cfg.world.competitions}
    for pool in cfg.world.promotion_relegation.reserves:
        bottom = max(league.level for league in cfg.world.competitions if league.nation == pool.nation)
        levels.update({division_id: (pool.nation, bottom + 1) for division_id in pool.division_ids})
    return levels


def club_level(world: World, club: Club, levels: dict[int, Level]) -> Level | None:
    league = world.competitions.get(club.competition_id) if club.competition_id is not None else None
    if league is not None:
        return league.nation, league.level
    return levels.get(club.division_id) if club.division_id is not None else None


def initialize_reputation(world: World) -> None:
    """Fix what the revision needs in a world that lacks it: at import, and for a save older than the revision.

    The ceiling of a division is the median reputation its first teams were imported with, whatever their later
    moves. Existing values are never replaced, so calling this again changes nothing.
    """
    levels = division_levels(world.config)
    groups: dict[Level, list[float]] = defaultdict(list)
    for club in world.clubs.values():
        if club.reputation_anchor is None:
            club.reputation_anchor = club.reputation
        level = levels.get(club.source_division_id)
        if level is not None and not club.is_reserve:
            groups[level].append(club.reputation_anchor)
        world.reputation_history.setdefault(club.id, [(world.season, club.reputation)])
    if not world.reputation_ceilings:
        for (nation, level), values in sorted(groups.items()):
            world.reputation_ceilings.setdefault(nation, {})[level] = median(values)


def honours_scores(world: World, champions: dict[int, int]) -> dict[int, float]:
    """Titles worth points that fade each season; `champions` holds the league winners of the season just played."""
    rules = world.config.world.reputation.honours
    scores: dict[int, float] = defaultdict(float)

    def add(competition_id: int, year: int, club_id: int) -> None:
        competition = world.competitions.get(competition_id)
        if competition is None:
            return
        if competition.kind == "league":
            index = competition.level - 1
            points = rules.league_by_level[index] if 0 <= index < len(rules.league_by_level) else 0.0
        elif competition.kind == "cup":
            points = rules.national_cup
        else:
            points = rules.european_cup.get(competition.code, 0.0)
        scores[club_id] += points * rules.decay ** (world.season - year)

    for competition_id, titles in world.champions.items():
        for year, club_id in titles:
            add(competition_id, year, club_id)
    for competition_id, club_id in champions.items():
        add(competition_id, world.season, club_id)
    return scores


def reputation_events(world: World, tables: dict[int, list[Standing]], champions: dict[int, int]) -> list[ReputationRevised]:
    """One revision per club, from the tables and league champions of the season just played.

    Call once the season's promotions and European places are settled: the division a club will play and its
    qualification are read from the world, its rank from `tables`.
    """
    rules = world.config.world.reputation
    levels = division_levels(world.config)
    honours = honours_scores(world, champions)
    european = {club_id: rules.european_qualification.get(competition.code, 0.0)
                for competition in world.competitions.values() if competition.kind == "europe" for club_id in competition.club_ids}
    ranks = {row.club_id: (index, len(rows)) for rows in tables.values() for index, row in enumerate(rows)}
    events = []
    for club in sorted(world.clubs.values(), key=lambda item: item.id):
        anchor = club.reputation if club.reputation_anchor is None else club.reputation_anchor
        target = anchor + european.get(club.id, 0.0) + honours.get(club.id, 0.0)
        start, now = levels.get(club.source_division_id), club_level(world, club, levels)
        if start is not None and now is not None:
            target += rules.division_gain * (start[1] - now[1])
        if club.id in ranks and ranks[club.id][1] > 1:
            index, size = ranks[club.id]
            target += rules.rank_spread * (1 - 2 * index / (size - 1))
        target = min(target, anchor + rules.max_rise)
        if now is not None and now[1] >= rules.ceiling_min_level:
            ceiling = world.reputation_ceilings.get(now[0], {}).get(now[1])
            if ceiling is not None:
                target = min(target, ceiling + rules.ceiling_margin)
        target = clamp(target, rules.bounds.min, rules.bounds.max)
        events.append(ReputationRevised(club.id, clamp(club.reputation + rules.smoothing * (target - club.reputation),
                                                       rules.bounds.min, rules.bounds.max)))
    return events
