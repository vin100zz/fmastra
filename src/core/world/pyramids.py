"""The nations a new game can play, and how deep: the leagues each one may simulate, from the first down, and the pool under
the lowest its promoted clubs come from. A choice of nations and lowest levels becomes the configuration of the world."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from core.config.model import Config


@dataclass(frozen=True, slots=True)
class Division:
    name: str
    club_count: int
    division_id: int


@dataclass(frozen=True, slots=True)
class Pyramid:
    nation: str
    divisions: tuple[Division, ...]
    reserve: tuple[int, ...]

    def reserve_under(self, level: int) -> tuple[int, ...]:
        """The pool the promoted clubs of the lowest league come from when the nation plays `level` divisions: the next
        division, or the groups under the last one."""
        return (self.divisions[level].division_id,) if level < len(self.divisions) else self.reserve


def parse_pyramids(payload: dict[str, Any]) -> tuple[Pyramid, ...]:
    pyramids = tuple(Pyramid(item["pays"], tuple(Division(row["nom"], row["nb_clubs"], row["division_id"]) for row in item["divisions"]),
                             tuple(item["reserve"])) for item in payload["nations"])
    if not pyramids or len({pyramid.nation for pyramid in pyramids}) != len(pyramids):
        raise ValueError("Each nation of a new game appears once")
    if any(not pyramid.divisions or not pyramid.reserve for pyramid in pyramids):
        raise ValueError("A nation needs at least one division and a reserve")
    return pyramids


def default_levels(cfg: Config, pyramids: tuple[Pyramid, ...]) -> dict[str, int]:
    """The divisions each nation plays by default, those of the configuration; 0 for a nation it leaves out."""
    return {pyramid.nation: sum(league.nation == pyramid.nation for league in cfg.world.competitions) for pyramid in pyramids}


def check_pyramids(cfg: Config, pyramids: tuple[Pyramid, ...]) -> None:
    """The configuration's leagues open each pyramid, and its reserves are the pools under them."""
    by_nation = {pyramid.nation: pyramid for pyramid in pyramids}
    for nation in {league.nation for league in cfg.world.competitions}:
        if nation not in by_nation: raise ValueError(f"{nation}: no pyramid for a simulated nation")
    for nation, level in default_levels(cfg, pyramids).items():
        pyramid = by_nation[nation]
        leagues = sorted((league for league in cfg.world.competitions if league.nation == nation), key=lambda league: league.level)
        if [(league.name, league.club_count, league.division_id) for league in leagues] != [
                (division.name, division.club_count, division.division_id) for division in pyramid.divisions[:level]]:
            raise ValueError(f"{nation}: the simulated leagues do not open the pyramid")
        reserves = [pool.division_ids for pool in cfg.world.promotion_relegation.reserves if pool.nation == nation]
        if level and reserves != [pyramid.reserve_under(level)]:
            raise ValueError(f"{nation}: the reserve is not the pool under the lowest league")


def world_payload(world: dict[str, Any], pyramids: tuple[Pyramid, ...], levels: dict[str, int]) -> dict[str, Any]:
    """The world's configuration (monde.json) for nations each playing `levels[nation]` divisions, in the order of the pyramids."""
    by_nation = {pyramid.nation: pyramid for pyramid in pyramids}
    if set(levels) - set(by_nation): raise ValueError("Unknown nation")
    chosen = [(pyramid, levels.get(pyramid.nation, 0)) for pyramid in pyramids if levels.get(pyramid.nation, 0)]
    if not chosen: raise ValueError("Choose at least one nation")
    if any(not 0 <= level <= len(by_nation[nation].divisions) for nation, level in levels.items()):
        raise ValueError("No such division")
    # In the configuration's own order, so that its default choice gives it back as it is.
    def ordered(names: list[str]) -> list[tuple[Pyramid, int]]:
        rank = {nation: index for index, nation in enumerate(dict.fromkeys(names))}
        return sorted(chosen, key=lambda item: rank.get(item[0].nation, len(rank)))
    competitions = [{"pays": pyramid.nation, "nom": division.name, "niveau": index + 1, "nb_clubs": division.club_count,
                     "division_id": division.division_id}
                    for pyramid, level in ordered([league["pays"] for league in world["competitions_simulees"]])
                    for index, division in enumerate(pyramid.divisions[:level])]
    reserves = [{"pays": pyramid.nation, "division_ids": list(pyramid.reserve_under(level))}
                for pyramid, level in ordered([pool["pays"] for pool in world["promotion_relegation"]["reserves"]])]
    return {**world, "competitions_simulees": competitions,
            "promotion_relegation": {**world["promotion_relegation"], "reserves": reserves}}
