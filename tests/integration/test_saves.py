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
