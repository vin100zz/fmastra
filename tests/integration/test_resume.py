from pathlib import Path
from dataclasses import fields
import pytest

from core.world.simulation import advance_day
from infrastructure.importation.loader import import_world
from infrastructure.persistence.store import SaveStore

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.slow
def test_resume_crosses_month_boundary_identically(config, tmp_path):
    world = import_world(ROOT / "data", config, 14)
    for _ in range(29): advance_day(world)
    store = SaveStore(tmp_path)
    store.save(world, "resume")
    restored = store.load("resume")
    for _ in range(3):
        advance_day(world)
        advance_day(restored)
    for field in fields(world):
        if field.name == "rngs":
            assert {key: value.getstate() for key, value in world.rngs.items()} == {key: value.getstate() for key, value in restored.rngs.items()}
        else:
            assert getattr(world, field.name) == getattr(restored, field.name), field.name


def test_failed_replace_preserves_previous_save(config, tmp_path, monkeypatch):
    import infrastructure.persistence.store as module
    world = import_world(ROOT / "data", config, 99)
    store = SaveStore(tmp_path)
    path = store.save(world, "atomic")
    previous = path.read_bytes()
    def fail(source, target): raise OSError("disk failure")
    monkeypatch.setattr(module.os, "replace", fail)
    with pytest.raises(OSError): store.save(world, "atomic")
    assert path.read_bytes() == previous
    assert not list(tmp_path.glob("*.tmp"))
