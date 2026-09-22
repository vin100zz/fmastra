from pathlib import Path
import pytest

from infrastructure.importation.loader import import_world
from infrastructure.persistence.store import SaveStore, SaveError
from infrastructure.config.loader import config_fingerprint
from core.engine.analytical import AnalyticalEngine
from benchmarks.fixtures import fixture_lineup

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.slow
def test_save_restore_rng_and_config(config, tmp_path):
    world = import_world(ROOT / "data", config, 14)
    world.rngs["matches"].random()
    store = SaveStore(tmp_path)
    store.save(world, "test")
    restored = store.load("test")
    assert restored.date == world.date
    assert config_fingerprint(restored.config) == config_fingerprint(world.config)
    assert restored.players == world.players
    assert restored.rngs["matches"].getstate() == world.rngs["matches"].getstate()
    # Old typed saves lack the new accounting and movement fields.
    import gzip
    import json
    legacy = json.loads(gzip.decompress(store.path_for("test").read_bytes()))
    legacy["schema_version"] = 2
    for name in ("finance_history", "finance_history_since", "movement_history_since"):
        legacy["world"].pop(name)
    for player in legacy['world']['players'].values():
        for name in ('source_current_ability', 'source_potential_ability', 'position_ratings'): player.pop(name)
    for club in legacy['world']['clubs'].values():
        for name in ('training_facilities', 'youth_recruitment'): club.pop(name)
    store.path_for("legacy").write_bytes(gzip.compress(json.dumps(legacy).encode()))
    migrated = store.load("legacy")
    assert migrated.finance_history == {}
    assert migrated.clubs[868].youth_recruitment is None
    assert migrated.players[85139014].source_current_ability is None
    assert not migrated.players[85139014].position_ratings
    assert migrated.finance_history_since == world.date
    assert migrated.rngs["matches"].getstate() == world.rngs["matches"].getstate()
    engine = AnalyticalEngine()
    first = engine.simulate(fixture_lineup(world, 868, -1), fixture_lineup(world, 886, -2), config, world.rngs["matches"])
    second = engine.simulate(fixture_lineup(restored, 868, -1), fixture_lineup(restored, 886, -2), restored.config, restored.rngs["matches"])
    assert first == second
    del restored.rngs["market"]
    store.save(restored, "incomplete")
    with pytest.raises(SaveError, match="flux aléatoires manquants"):
        store.load("incomplete")


def test_bad_slot_and_corrupt_save(tmp_path):
    store = SaveStore(tmp_path)
    with pytest.raises(SaveError): store.path_for("../escape")
    (tmp_path / "bad.json.gz").write_bytes(b"not a gzip archive")
    with pytest.raises(SaveError): store.load("bad")


def test_delete_slot(tmp_path):
    store = SaveStore(tmp_path)
    store.path_for("test").write_bytes(b"data")
    assert any(slot["slot"] == "test" for slot in store.slots())
    store.delete("test")
    assert not any(slot["slot"] == "test" for slot in store.slots())
    with pytest.raises(SaveError): store.delete("test")
    with pytest.raises(SaveError): store.delete("../escape")


def test_old_save_receives_rotation_rules_without_accepting_tampered_config(config, tmp_path):
    import gzip
    import hashlib
    import json
    from infrastructure.persistence.store import MIGRATION_DEFAULTS
    world = import_world(ROOT / "data", config, 14)
    store = SaveStore(tmp_path)
    store.save(world, "rotation")
    legacy = json.loads(gzip.decompress(store.path_for("rotation").read_bytes()))
    legacy["schema_version"] = 8
    rules = legacy["world"]["config"]
    for introduced, path, defaults in MIGRATION_DEFAULTS:
        if introduced > 8:
            for key in defaults: del rules[path[0]][path[1]][key]
            if not rules[path[0]][path[1]]: del rules[path[0]][path[1]]  # A section introduced whole is absent, not empty.
    raw_config = json.dumps(rules, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    legacy["config_hash"] = hashlib.sha256(raw_config.encode("utf-8")).hexdigest()
    store.path_for("rotation").write_bytes(gzip.compress(json.dumps(legacy).encode()))
    restored = store.load("rotation")
    assert restored.config.states.substitutions.playing_time_weight == 8
    assert restored.players == world.players
    assert restored.rngs["matches"].getstate() == world.rngs["matches"].getstate()
    store.save(restored, "upgraded")
    assert store.load("upgraded").config == restored.config
    rules["etats"]["remplacements"]["poids_deficit_temps_jeu"] = 99.0
    store.path_for("rotation").write_bytes(gzip.compress(json.dumps(legacy).encode()))
    with pytest.raises(SaveError, match="configuration"):
        store.load("rotation")


def test_save_from_before_the_delivery_attributes_gains_them_from_the_source_or_from_the_position_level(config, tmp_path):
    import gzip
    import hashlib
    import json
    import shutil
    from infrastructure.config.loader import config_payload, decode_config
    from infrastructure.persistence.store import DELIVERY_OFFSETS, LEGACY_ATTRIBUTE_COUNT, MIGRATION_DEFAULTS
    # An older save embeds an older configuration: no weight for `centre` and `cpa` in the overall rating.
    raw = config_payload(config)
    raw["attributs"]["liste"]["techniques"] = [name for name in raw["attributs"]["liste"]["techniques"] if name not in ("centre", "cpa")]
    for weights in raw["attributs"]["note_globale"].values():
        released = weights.pop("centre", 0) + weights.pop("cpa", 0)
        if released: weights[next(iter(weights))] += released
    world = import_world(ROOT / "data", decode_config(raw), 14)
    config = world.config
    saves = tmp_path / "saves"
    store = SaveStore(saves)
    store.save(world, "modern")
    legacy = json.loads(gzip.decompress(store.path_for("modern").read_bytes()))
    legacy["schema_version"] = 11
    rules = legacy["world"]["config"]
    for introduced, path, defaults in MIGRATION_DEFAULTS:
        if introduced > 11:
            for key in defaults: del rules[path[0]][path[1]][key]
            if not rules[path[0]][path[1]]: del rules[path[0]][path[1]]  # A section introduced whole is absent, not empty.
    legacy["config_hash"] = hashlib.sha256(json.dumps(rules, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()
    for player in legacy["world"]["players"].values():
        del player["attributes"]["values"][LEGACY_ATTRIBUTE_COUNT:]
        del player["aggression"]
    store.path_for("old").write_bytes(gzip.compress(json.dumps(legacy).encode()))
    # Without the exact source file every player receives the level generation gives his position.
    fallback = store.load("old")
    bounds = config.attributes.bounds
    for player in fallback.players.values():
        expected = [min(bounds.max, max(bounds.min, player.rating + offset)) for offset in DELIVERY_OFFSETS[player.position.value]]
        assert list(player.attributes.values[LEGACY_ATTRIBUTE_COUNT:]) == expected
        assert player.attributes.values[:LEGACY_ATTRIBUTE_COUNT] == world.players[player.id].attributes.values[:LEGACY_ATTRIBUTE_COUNT]
        assert player.aggression == 1.0
    # With the file the game was imported from, imported players get exactly their source values.
    (tmp_path / "data").mkdir()
    shutil.copy(ROOT / "data" / "players.csv", tmp_path / "data" / "players.csv")
    migrated = store.load("old")
    from infrastructure.importation.readers import read_sources
    _, rows, _ = read_sources(ROOT / "data", config)
    source = {row.id: row.attributes.values[LEGACY_ATTRIBUTE_COUNT:] for row in rows}
    assert sum(pid in source for pid in world.players) > 0.99 * len(world.players)
    for pid, player in migrated.players.items():
        # Players generated at import have no source row and keep the position level.
        assert player.attributes.values[LEGACY_ATTRIBUTE_COUNT:] == (source[pid] if pid in source else fallback.players[pid].attributes.values[LEGACY_ATTRIBUTE_COUNT:])
    store.save(migrated, "upgraded")
    assert store.load("upgraded").players == migrated.players



@pytest.mark.slow
def test_save_from_before_the_regen_targets_measures_them_on_the_players_the_source_supplied(config, tmp_path):
    import gzip
    import hashlib
    import json
    from infrastructure.persistence.store import MIGRATION_DEFAULTS
    world = import_world(ROOT / "data", config, 14)
    assert any(player.source_potential_ability is None for player in world.players.values())  # Generated to complete squads.
    store = SaveStore(tmp_path)
    store.save(world, "modern")
    legacy = json.loads(gzip.decompress(store.path_for("modern").read_bytes()))
    legacy["schema_version"] = 13
    for name in ("potential_targets", "external_potential_targets", "external_nation_targets"): del legacy["world"][name]
    rules = legacy["world"]["config"]
    for introduced, path, defaults in MIGRATION_DEFAULTS:
        if introduced > 13:
            for key in defaults: del rules[path[0]][path[1]][key]
    legacy["config_hash"] = hashlib.sha256(json.dumps(rules, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()
    store.path_for("old").write_bytes(gzip.compress(json.dumps(legacy).encode()))
    migrated = store.load("old")
    # The older configuration receives the placement rules, and the targets are what the import measured.
    assert migrated.config == world.config
    assert migrated.potential_targets == world.potential_targets
    assert migrated.external_potential_targets == world.external_potential_targets
    assert migrated.external_nation_targets == world.external_nation_targets
    store.save(migrated, "upgraded")
    assert store.load("upgraded").potential_targets == world.potential_targets
