"""What a new game can be made of: the nations it may play and their divisions, and the clubs each choice brings in, read
once from a world built with every division (the clubs keep their figures whatever else is played)."""
from __future__ import annotations

from pathlib import Path
from threading import Lock

from core.world.pyramids import Pyramid, default_levels
from infrastructure.config.loader import configure_world, load_config, load_pyramids
from infrastructure.importation.loader import import_world
from . import views as v
from .nations import build_nation_table

# The best players a club shows before it is picked: those its level is the mean of.
SQUAD = v.TOP_SQUAD
# A sort of the list and what it reads; names and leagues run from the smallest.
SORTS = {"reputation": lambda club: club["reputation"], "niveau": lambda club: club["top_rating"],
         "potentiel": lambda club: club["top_potential"], "stade": lambda club: club["capacity"],
         "nom": lambda club: v.normalized(club["name"]), "championnat": lambda club: (club["order"], club["level"])}
ASCENDING = ("nom", "championnat")


class Catalogue:
    """Built on first use, then kept: a few seconds of import the creation screen waits for once."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.lock = Lock()
        self.built: dict | None = None

    def data(self) -> dict:
        with self.lock:
            if self.built is None: self.built = build(self.root)
            return self.built


def build(root: Path) -> dict:
    cfg = load_config(root / "config")
    pyramids = load_pyramids(root / "config", cfg)
    world = import_world(root / "data", configure_world(cfg, pyramids, {pyramid.nation: len(pyramid.divisions) for pyramid in pyramids}), 0)
    levels = {league.division_id: (league.nation, league.level, league.name) for league in world.config.world.competitions}
    order = {pyramid.nation: index for index, pyramid in enumerate(pyramids)}
    clubs = {}
    for club in world.active_clubs():
        nation, level, competition = levels[club.competition_id]
        players = sorted((world.players[pid] for pid in club.player_ids), key=lambda player: (-player.rating, player.id))[:SQUAD]
        clubs[club.id] = {"id": club.id, "name": club.name, "nation_code": nation, "level": level, "competition": competition,
                          "order": order[nation], "reputation": round(club.reputation, 1), "capacity": club.capacity,
                          "training_facilities": club.training_facilities, "youth_recruitment": club.youth_recruitment,
                          "wage_cap": club.wage_cap, "major_color": club.home_kit_major_color, "minor_color": club.home_kit_minor_color,
                          **v.squad_strength(world, club.id),
                          "squad": [{"name": player.name, "position": player.position, "age": player.born.age_on(world.date),
                                     "rating": player.rating, "potential": player.potential} for player in players]}
    names = world.nation_names
    defaults = default_levels(cfg, pyramids)
    return {"pyramids": pyramids, "clubs": clubs, "date": world.date.iso(), "season": world.season,
            "flags": {code: row for code, row in build_nation_table(names).items() if code in order},
            "nations": [{"code": pyramid.nation, "name": names.get(pyramid.nation, pyramid.nation), "default": defaults[pyramid.nation],
                         "divisions": [{"level": index + 1, "name": division.name, "clubs": division.club_count}
                                       for index, division in enumerate(pyramid.divisions)]} for pyramid in pyramids]}


def parse_levels(text: str, pyramids: tuple[Pyramid, ...]) -> dict[str, int]:
    """`FRA:3,ENG:2`: the divisions each nation plays down to; a nation left out plays none."""
    depth = {pyramid.nation: len(pyramid.divisions) for pyramid in pyramids}
    levels = {}
    for item in filter(None, text.split(",")):
        nation, _, level = item.partition(":")
        if nation not in depth or not level.isdigit() or not 1 <= int(level) <= depth[nation] or nation in levels:
            raise ValueError(f"Choix de divisions invalide : {item}")
        levels[nation] = int(level)
    return levels


def played(club: dict, levels: dict[str, int]) -> bool:
    return club["level"] <= levels.get(club["nation_code"], 0)


def summary(data: dict) -> dict:
    return {key: data[key] for key in ("date", "season", "flags", "nations")}


def club_list(data: dict, levels: dict[str, int], pays: str, recherche: str, tri: str, ordre: str | None, page: int, size: int) -> dict:
    rows = [club for club in data["clubs"].values() if played(club, levels)]
    total = {"clubs": len(rows), "leagues": sum(levels.values())}
    rows = [club for club in rows if (not pays or club["nation_code"] == pays) and v.normalized(recherche) in v.normalized(club["name"])]
    # Ties keep the order of reputation, whichever the sort.
    rows.sort(key=lambda club: (-club["reputation"], club["id"]))
    key = SORTS[tri]
    descending = (ordre or ("asc" if tri in ASCENDING else "desc")) == "desc"
    rows = (sorted((club for club in rows if key(club) is not None), key=key, reverse=descending)
            + [club for club in rows if key(club) is None])
    result = v.paginate([{name: value for name, value in club.items() if name not in ("squad", "order")} for club in rows], page, size)
    return {**result, **total}
