from pathlib import Path
from api.nations import ISO_ALPHA2, flag_code

FLAGS = Path(__file__).resolve().parents[2] / "web" / "flags"


def test_home_nations_have_their_own_flag_not_the_uk_one():
    assert [flag_code(code) for code in ("ENG", "SCO", "WAL", "NIR")] == ["gb-eng", "gb-sct", "gb-wls", "gb-nir"]
    assert flag_code("X1B") == "gb"  # Grande-Bretagne keeps the Union Jack.


def test_every_flag_code_has_a_vendored_svg():
    missing = sorted({flag_code(code) for code in ISO_ALPHA2} - {path.stem for path in FLAGS.glob("*.svg")})
    assert missing == []
