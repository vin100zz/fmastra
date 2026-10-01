import gzip
import hashlib
import json
from random import Random

import pytest

from core.domain.clubs import Competition
from core.domain.matches import SubmittedLineup
from core.domain.players import Position
from infrastructure.persistence.store import ADDED_FORMATIONS, SaveError, SaveStore
from test_market import mini_world

OLDER_POSITIONS = {"DG": "DL", "DD": "DR"}


def older_positions(node):
    """A JSON document as it was before schema 22: full-backs coded DL and DR."""
    if isinstance(node, dict): return {OLDER_POSITIONS.get(key, key): older_positions(value) for key, value in node.items()}
    if isinstance(node, list): return [older_positions(item) for item in node]
    return OLDER_POSITIONS.get(node, node) if isinstance(node, str) else node


def saved_world(config, tmp_path):
    world = mini_world(config)
    world.competitions[-16] = Competition(-16, "Test", "FRA", 1, [1, 2])
    for club in world.clubs.values(): club.competition_id = -16
    # Rated at every position, as they play: the save carries ratings under its position codes, and none is left to draw.
    for player in world.players.values(): player.position_ratings = {position: 20 for position in Position}
    world.rngs = {key: Random(1) for key in ("market", "matches", "states", "progression", "demography")}
    world.clubs[1].formation = "4-4-2 plat"
    world.submitted_lineups[7] = SubmittedLineup(1, "4-4-2 plat", [(200, "GB"), (201, "DG"), (204, "DD")], [])
    store = SaveStore(tmp_path)
    path = store.save(world, "older")
    return world, store, path, json.loads(gzip.decompress(path.read_bytes()))


def write(path, payload):
    raw = json.dumps(payload["world"]["config"], sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    payload["config_hash"] = hashlib.sha256(raw.encode()).hexdigest()
    path.write_bytes(gzip.compress(json.dumps(payload).encode()))


def test_an_older_save_renames_its_4_4_2_the_flat_one_and_gains_the_diamond_and_the_attacking_one(config, tmp_path):
    _, store, path, payload = saved_world(config, tmp_path)
    payload["schema_version"] = 20
    payload["world"] = world = older_positions(payload["world"])
    rules = world["config"]["formations"]
    rules["formations"] = {"4-4-2" if name == "4-4-2 plat" else name: roles
                           for name, roles in rules["formations"].items() if name not in ADDED_FORMATIONS}
    world["clubs"]["1"]["formation"] = world["submitted_lineups"]["7"]["formation"] = "4-4-2"
    write(path, payload)
    older = store.load("older")
    assert list(older.config.formations.formations.items()) == list(config.formations.formations.items())
    assert (older.clubs[1].formation, older.clubs[2].formation, older.submitted_lineups[7].formation) == ("4-4-2 plat", "4-3-3", "4-4-2 plat")
    store.save(older, "upgraded")
    assert store.load("upgraded").config == older.config
    # The configuration it was saved with is still verified before the new formations are added.
    rules["formations"]["4-4-2"][1] = "DC"
    path.write_bytes(gzip.compress(json.dumps(payload).encode()))
    with pytest.raises(SaveError, match="configuration"):
        store.load("older")


def test_a_save_from_before_schema_22_codes_its_full_backs_dg_and_dd_and_gives_the_attacking_4_4_2_its_wingers(config, tmp_path):
    world, store, path, payload = saved_world(config, tmp_path)
    payload["schema_version"] = 21
    payload["world"] = older_positions(payload["world"])
    payload["world"]["config"]["formations"]["formations"]["4-4-2 offensif"] = list(ADDED_FORMATIONS["4-4-2 offensif"])
    assert b'"DG"' not in json.dumps(payload).encode()
    write(path, payload)
    older = store.load("older")
    assert older.config == config
    assert older.players == world.players
    assert {player.position for player in older.players.values()} >= {Position.LEFT_BACK, Position.RIGHT_BACK}
    assert older.submitted_lineups[7].slots == [(200, "GB"), (201, "DG"), (204, "DD")]
    # The attacking 4-4-2 of a configuration of one's own stays as it was.
    custom = ["GB", "DL", "DC", "DC", "DR", "MC", "MC", "MOC", "MOC", "BU", "BU"]
    payload["world"]["config"]["formations"]["formations"]["4-4-2 offensif"] = custom
    write(path, payload)
    assert store.load("older").config.formations.formations["4-4-2 offensif"] == ("GB", "DG", "DC", "DC", "DD", "MC", "MC", "MOC", "MOC", "BU", "BU")
