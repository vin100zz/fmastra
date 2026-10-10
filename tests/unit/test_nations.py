from pathlib import Path
import re
from api.nations import COMPETITION_COLORS, ISO_ALPHA2, KIT_COLORS, competition_colors, flag_code, kit_colors

FLAGS = Path(__file__).resolve().parents[2] / "web" / "flags"


def test_every_active_nation_has_the_two_colours_of_its_kit(config):
    active = {name for name, rule in config.nations.items() if rule.active}
    assert sorted(active - set(KIT_COLORS)) == []
    # No entry for a nation the configuration does not know: a renamed nation would silently lose its colours.
    assert sorted(set(KIT_COLORS) - set(config.nations)) == []
    for name, (major, minor) in KIT_COLORS.items():
        assert re.fullmatch(r"#[0-9a-f]{6}", major) and re.fullmatch(r"#[0-9a-f]{6}", minor), name
        assert major != minor, name
    assert kit_colors("France") == {"major_color": "#1f3f94", "minor_color": "#ffffff"}
    assert kit_colors("Atlantide") == {"major_color": None, "minor_color": None}


def test_a_competition_wears_its_own_colours_or_the_kit_of_its_country():
    for code, (major, minor, ground) in COMPETITION_COLORS.items():
        assert all(colour is None or re.fullmatch(r"#[0-9a-f]{6}", colour) for colour in (major, minor, ground)), code
        assert major and major != minor and major != ground, code
    # The three European cups share their ground and are told apart by their colour; the Euro fills its band with its own.
    assert {COMPETITION_COLORS[code][2] for code in ("C1", "C3", "C4")} == {"#0a0b5c"}
    assert len({COMPETITION_COLORS[code][0] for code in ("C1", "C3", "C4")}) == 3
    assert competition_colors("C3") == {"major_color": "#f26522", "minor_color": None, "ground_color": "#0a0b5c"}
    assert competition_colors("EU") == {"major_color": "#003399", "minor_color": "#ffcc00", "ground_color": None}
    # A league or a national cup has no colours of its own: its selection's kit, and no ground.
    assert competition_colors(None, "France") == {"major_color": "#1f3f94", "minor_color": "#ffffff", "ground_color": None}
    assert competition_colors("", "Atlantide") == competition_colors(None) == {"major_color": None, "minor_color": None, "ground_color": None}
    # Its own colours come first: a European cup is no country's.
    assert competition_colors("C1", "France")["ground_color"] == "#0a0b5c"


def test_home_nations_have_their_own_flag_not_the_uk_one():
    assert [flag_code(code) for code in ("ENG", "SCO", "WAL", "NIR")] == ["gb-eng", "gb-sct", "gb-wls", "gb-nir"]
    assert flag_code("X1B") == "gb"  # Grande-Bretagne keeps the Union Jack.


def test_every_flag_code_has_a_vendored_svg():
    missing = sorted({flag_code(code) for code in ISO_ALPHA2} - {path.stem for path in FLAGS.glob("*.svg")})
    assert missing == []
