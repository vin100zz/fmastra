import csv
from pathlib import Path
import re
from urllib.parse import parse_qs, urlsplit

from api.nations import COMPETITION_COLORS, ISO_ALPHA2, NATION_KITS, competition_colors, flag_code, kit_colors, kit_outfits
from infrastructure.importation.nations import ALIASES

ROOT = Path(__file__).resolve().parents[2]
FLAGS = ROOT / "web" / "flags"


def nation_rows() -> dict[str, dict]:
    with (ROOT / "data" / "nations.csv").open(encoding="utf-8-sig", newline="") as handle:
        return {row["code"]: row for row in csv.DictReader(handle, delimiter=";")}


def test_every_active_nation_wears_the_kits_of_the_nations_file(config):
    rows = nation_rows()
    codes = {row["name"]: code for code, row in rows.items()}
    active = {name for name, rule in config.nations.items() if rule.active}
    # The configuration names some nations as the game shows them, the file as the export writes them.
    assert sorted(name for name in active if ALIASES.get(name, name) not in codes) == []
    for name in active:
        kit = kit_colors(codes[ALIASES.get(name, name)])
        assert all(re.fullmatch(r"#[0-9A-Fa-f]{6}", kit[key]) for key in ("major_color", "minor_color", "third_color")), name
        assert 0 <= kit["kit_id"] <= 57, name  # 0, unknown, is the plain pattern
    # By the nation's code, as the file has them: the home shirt's colours and pattern, then the two outfits with its logo.
    france = rows["FRA"]
    assert kit_colors("FRA") == {"major_color": france["HomeKitMajorColorRGB"], "minor_color": france["HomeKitMinorColorRGB"],
                                 "third_color": france["HomeKitThirdColorRGB"], "kit_id": int(france["HomeKitID"])}
    outfits = kit_outfits("FRA")
    home, away = (parse_qs(urlsplit(outfits[key]).query) for key in ("kit_url", "away_kit_url"))
    assert outfits["kit_url"].startswith(f"/kits/{france['HomeKitID']}/outfit.png?")
    assert outfits["away_kit_url"].startswith(f"/kits/{france['AwayKitID']}/outfit.png?")
    assert home["major"] == [france["HomeKitMajorColorRGB"][1:]] and home["shorts_major"] == [france["HomeShortsMajorColorRGB"][1:]]
    assert away["socks_major"] == [france["AwaySocksMajorColorRGB"][1:]]
    assert home["nation"] == away["nation"] == ["FRA"] and "club_id" not in home
    assert kit_colors("ZZZ") == kit_colors(None) == {"major_color": None, "minor_color": None, "third_color": None, "kit_id": None}
    assert kit_outfits("ZZZ") == {"kit_url": None, "away_kit_url": None}
    assert NATION_KITS.key == "code"


def test_a_competition_wears_its_own_colours_or_the_kit_of_its_country():
    for code, (major, minor, ground) in COMPETITION_COLORS.items():
        assert all(colour is None or re.fullmatch(r"#[0-9a-f]{6}", colour) for colour in (major, minor, ground)), code
        assert major and major != minor and major != ground, code
    # The three European cups share their ground and are told apart by their colour; the Euro fills its band with its own.
    assert {COMPETITION_COLORS[code][2] for code in ("C1", "C3", "C4")} == {"#0a0b5c"}
    assert len({COMPETITION_COLORS[code][0] for code in ("C1", "C3", "C4")}) == 3
    assert competition_colors("C3") == {"major_color": "#f26522", "minor_color": None, "ground_color": "#0a0b5c"}
    assert competition_colors("EU") == {"major_color": "#003399", "minor_color": "#ffcc00", "ground_color": None}
    # A league or a national cup has no colours of its own: its selection's kit, by its country's code, and no ground.
    assert competition_colors(None, "FRA") == {"major_color": kit_colors("FRA")["major_color"],
                                               "minor_color": kit_colors("FRA")["minor_color"], "ground_color": None}
    assert competition_colors("", "ZZZ") == competition_colors(None) == {"major_color": None, "minor_color": None, "ground_color": None}
    # Its own colours come first: a European cup is no country's.
    assert competition_colors("C1", "FRA")["ground_color"] == "#0a0b5c"


def test_home_nations_have_their_own_flag_not_the_uk_one():
    assert [flag_code(code) for code in ("ENG", "SCO", "WAL", "NIR")] == ["gb-eng", "gb-sct", "gb-wls", "gb-nir"]
    assert flag_code("X1B") == "gb"  # Grande-Bretagne keeps the Union Jack.


def test_every_flag_code_has_a_vendored_svg():
    missing = sorted({flag_code(code) for code in ISO_ALPHA2} - {path.stem for path in FLAGS.glob("*.svg")})
    assert missing == []
