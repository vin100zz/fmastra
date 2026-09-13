"""Compose CSV readers and pure world construction."""
from hashlib import sha256
from pathlib import Path
from core.config.model import Config
from core.domain.world import World
from core.world.importation.construction import construct_world
from .readers import read_sources


def import_world(directory: Path, cfg: Config, seed: int) -> World:
    clubs, players, nations = read_sources(directory, cfg)
    world = construct_world(clubs, players, cfg, seed, nations)
    world.source_hashes = {name: sha256((directory / name).read_bytes()).hexdigest()
                           for name in ("clubs.csv", "players.csv", "nations.csv")}
    return world
