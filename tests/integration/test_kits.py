from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from api.app import create_app
from api.kit_images import render_kit
from api.kits import kit_url


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    root = Path(__file__).resolve().parents[2]
    with TestClient(create_app(root, tmp_path_factory.mktemp("kit-saves"), resume=False)) as client:
        yield client


@pytest.mark.parametrize("kit_id,atlas", [(0, 1), (1, 1), (16, 16), (28, 28), (5, 5), (55, 55), (999, 1)])
def test_csv_codes_select_the_correct_image_without_a_running_game(client, kit_id, atlas):
    response = client.get(f"/kits/{kit_id}.png", params={"major": "FFFFFF", "minor": "004170", "third": "DA291C"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == render_kit(atlas, ("#FFFFFF", "#004170", "#DA291C"))
    with Image.open(BytesIO(response.content)) as image:
        assert image.mode == "RGBA" and max(image.size) == 192


def test_home_colors_keep_their_order_and_missing_colors_have_safe_fallbacks(client):
    club = SimpleNamespace(home_kit_id=16, home_kit_major_color="#ffffff",
                           home_kit_minor_color="#004170", home_kit_third_color="#DA291C")
    assert kit_url(club).startswith("/kits/16/outfit.png?major=FFFFFF&minor=004170&third=DA291C&")
    assert client.get(kit_url(club)).status_code == 200
    club.home_kit_minor_color = club.home_kit_third_color = None
    assert set(parse_qs(urlsplit(kit_url(club)).query)) == {f"{prefix}{key}" for prefix in ("", "shorts_", "socks_") for key in ("major", "minor", "third")}
    assert all(value == ["FFFFFF"] for value in parse_qs(urlsplit(kit_url(club)).query).values())
    club.home_kit_id = None
    club.home_kit_major_color = "invalid"
    assert kit_url(club).startswith("/kits/0/outfit.png?")
    assert all(value == ["8A9193"] for value in parse_qs(urlsplit(kit_url(club)).query).values())
    assert client.get(kit_url(club)).status_code == 200


def test_invalid_image_parameters_are_rejected(client):
    params = {"major": "FFFFFF", "minor": "004170", "third": "DA291C"}
    for color in ("red", "FFFFFF&extra=1", "12345", "<script>"):
        assert client.get("/kits/1.png", params={**params, "major": color}).status_code == 422
    assert client.get("/kits/not-a-code.png", params=params).status_code == 422
    assert client.get("/kits/1.png").status_code == 422


def test_away_outfit_has_its_own_pattern_and_each_garments_colors(client):
    club = SimpleNamespace(home_kit_id=1, home_kit_major_color="#FF0000",
                           away_kit_id=38, away_kit_major_color="#FFFFFF",
                           away_kit_minor_color="#0000FF", away_kit_third_color="#FF0000",
                           away_shorts_major_color="#112233", away_shorts_minor_color="#445566",
                           away_socks_major_color="#778899", away_socks_minor_color="#AABBCC")
    url = kit_url(club, "away")
    assert url.startswith("/kits/38/outfit.png?")
    colors = parse_qs(urlsplit(url).query)
    assert colors["major"] == ["FFFFFF"]
    assert colors["shorts_major"] == ["112233"]
    assert colors["shorts_minor"] == ["445566"]
    assert colors["socks_major"] == ["778899"]
    assert colors["socks_minor"] == ["AABBCC"]
    response = client.get(url)
    assert response.status_code == 200
    with Image.open(BytesIO(response.content)) as image:
        assert image.size == (320, 600)
    assert response.content != client.get(kit_url(club)).content
    assert client.get(url.replace("shorts_major=112233", "shorts_major=red")).status_code == 422
    assert kit_url(SimpleNamespace(), "away") is None
