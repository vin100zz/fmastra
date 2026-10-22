import csv
from copy import deepcopy
from pathlib import Path

from fastapi.testclient import TestClient

from api.app import create_app
from infrastructure.importation.loader import import_world


ROOT = Path(__file__).resolve().parents[2]


def test_csv_changes_apply_to_running_and_restored_games_and_cached_creation(config, tmp_path):
    root = tmp_path / "project"
    (root / "data").mkdir(parents=True)
    path = root / "data/clubs.csv"
    with (ROOT / "data/clubs.csv").open(encoding="utf-8-sig", newline="") as handle:
        row = next(row for row in csv.DictReader(handle, delimiter=";") if row["UID"] == "866")

    def write():
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(row), delimiter=";")
            writer.writeheader()
            writer.writerow(row)

    write()
    world = import_world(ROOT / "data", config, 123)
    world.controlled_club_id = 866
    saved_club = deepcopy(world.clubs[866])
    rngs = {key: rng.getstate() for key, rng in world.rngs.items()}
    date = world.date
    app = create_app(root, tmp_path / "saves", resume=False)
    service = app.state.game
    service.world = world
    # Save before editing the CSV; the summary must also pick up future colors.
    service.store.save(world, "old")
    service.catalogue.built = {"clubs": {866: {"id": 866, "name": "Marseille", "order": 0}}}
    with TestClient(app) as client:
        first = client.get("/api/clubs/866").json()
        old_image = client.get(first["kit_url"]).content
        first_creation = client.get("/api/creation/clubs/866").json()
        assert first_creation["kit_url"] == first["kit_url"]

        row.update(HomeKitID="16", HomeKitMajorColorRGB="#102938", HomeKitMinorColorRGB="#AABBCC",
                   HomeKitThirdColorRGB="#DDEEFF", HomeShortsMajorColorRGB="#998877",
                   HomeSocksMajorColorRGB="#665544", AwayKitID="28", AwayKitMajorColorRGB="#332211",
                   AwayShortsMajorColorRGB="#ABCDEF", AwaySocksMajorColorRGB="#FEDCBA")
        write()
        updated = client.get("/api/clubs/866").json()
        assert updated["kit_id"] == 16 and updated["major_color"] == "#102938"
        assert "shorts_major=998877" in updated["kit_url"]
        assert "socks_major=665544" in updated["kit_url"]
        assert "/kits/28/" in updated["away_kit_url"]
        assert "shorts_major=ABCDEF" in updated["away_kit_url"]
        assert "socks_major=FEDCBA" in updated["away_kit_url"]
        assert client.get(updated["kit_url"]).content != old_image
        assert client.get("/api/creation/clubs/866").json()["kit_url"] == updated["kit_url"]
        assert client.get("/api/partie/slots").json()[0]["club"]["major_color"] == "#102938"
        assert client.get("/api/monde/etat").json()["controlled_club"]["major_color"] == "#102938"
        assert world.date == date and world.clubs[866].balance == saved_club.balance
        assert {key: rng.getstate() for key, rng in world.rngs.items()} == rngs

        # Another saved world must update even when the CSV hasn't changed again.
        restored = service.store.load("old")
        assert restored.clubs[866].home_kit_major_color == saved_club.home_kit_major_color
        service.world = restored
        assert client.get("/api/clubs/866").json()["kit_url"] == updated["kit_url"]
        # Loading the game did not rewrite the save on disk.
        assert service.store.load("old").clubs[866].home_kit_major_color == saved_club.home_kit_major_color

        row["HasAwayKitData"] = "False"
        write()
        assert client.get("/api/clubs/866").json()["away_kit_url"] is None
        assert client.get("/api/creation/clubs/866").json()["away_kit_url"] is None
