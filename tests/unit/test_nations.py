from pathlib import Path
import re
from api.nations import ISO_ALPHA2, KIT_COLORS, flag_code, kit_colors

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


def test_home_nations_have_their_own_flag_not_the_uk_one():
    assert [flag_code(code) for code in ("ENG", "SCO", "WAL", "NIR")] == ["gb-eng", "gb-sct", "gb-wls", "gb-nir"]
    assert flag_code("X1B") == "gb"  # Grande-Bretagne keeps the Union Jack.


def test_every_flag_code_has_a_vendored_svg():
    missing = sorted({flag_code(code) for code in ISO_ALPHA2} - {path.stem for path in FLAGS.glob("*.svg")})
    assert missing == []
