import gzip
import json
from pathlib import Path

from fastapi.testclient import TestClient

from api.app import create_app
from core.world.simulation import advance_day
from core.world.validation import validate_world
from infrastructure.importation.loader import import_world
from infrastructure.persistence.store import SaveStore
from test_season_rollover import finish_season

ROOT = Path(__file__).resolve().parents[2]


def test_the_human_club_shares_its_budgets_and_the_annual_review_carries_the_share_over(config, tmp_path):
    world = import_world(ROOT / "data", config, 123)
    weeks = config.management.budgets.weeks_per_year
    club = max(world.active_clubs(), key=lambda item: item.transfer_budget)
    world.controlled_club_id = club.id
    cap, budget, balance = club.wage_cap, club.transfer_budget, club.balance
    app = create_app(ROOT, tmp_path)
    app.state.game.world = world
    with TestClient(app) as client:
        summary = client.get(f"/api/clubs/{club.id}/finances").json()
        lowest, highest = summary["wage_cap_range"]
        assert (lowest, highest, summary["wage_shift"]) == (club.wage_bill, cap + budget // weeks, 0)
        # Another club's finances show its budgets, with nothing to move.
        other = next(item for item in world.active_clubs() if item.id != club.id)
        assert client.get(f"/api/clubs/{other.id}/finances").json()["wage_cap_range"] is None
        for refused in (lowest - 1, highest + 1):
            assert client.post("/api/partie/budgets", json={"plafond_hebdo": refused}).status_code == 400
        moved = (highest - cap) // 2
        answer = client.post("/api/partie/budgets", json={"plafond_hebdo": cap + moved})
        assert answer.status_code == 200
        assert {key: answer.json()[key] for key in ("wage_cap", "transfer_budget", "wage_shift", "balance")} == {
            "wage_cap": cap + moved, "transfer_budget": budget - moved * weeks, "wage_shift": moved, "balance": balance}
        assert answer.json()["wage_cap_range"] == [lowest, highest]
    validate_world(world)

    # The share is saved with the club; a save from before it has none, and keeps the budgets it had.
    store = SaveStore(tmp_path)
    store.save(world, "shared")
    assert store.load("shared").clubs[club.id].wage_shift == moved
    path = store.path_for("shared")
    document = json.loads(gzip.decompress(path.read_bytes()))
    for saved in document["world"]["clubs"].values(): del saved["wage_shift"]
    path.write_bytes(gzip.compress(json.dumps(document).encode("utf-8")))
    older = store.load("shared")
    assert (older.clubs[club.id].wage_shift, older.clubs[club.id].wage_cap) == (0, cap + moved)

    # In July the cap is raised again and the new transfer budget pays for it: the same club without a share gets the
    # whole budget and the cap of the formula.
    for candidate in (world, older):
        finish_season(candidate)
        advance_day(candidate)
        validate_world(candidate)
    shared, plain = world.clubs[club.id], older.clubs[club.id]
    assert (shared.wage_shift, plain.wage_shift) == (moved, 0)
    assert shared.wage_cap == plain.wage_cap + moved
    assert shared.transfer_budget == plain.transfer_budget - moved * weeks
