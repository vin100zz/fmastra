from io import BytesIO

from PIL import Image
import pytest

from api.kit_images import (
    _isolate_shirt,
    _load_pattern,
    render_outfit,
    _render_kit,
    normalize_color,
    recolor_pattern,
    render_kit,
)


PRIMARIES = ("#FF0000", "#00FF00", "#0000FF")
CLUB_COLORS = ("#112233", "#DDEEFF", "#AABBCC")


def test_patterns_preserve_primary_pixels_and_alpha():
    patterns = [_load_pattern(i) for i in (1, 8, 16, 28, 44, 55)]
    assert len(patterns) == 6
    assert len({image.tobytes() for image in patterns}) == 6
    for pattern in patterns:
        original = pattern.tobytes()
        assert recolor_pattern(pattern, PRIMARIES).tobytes() == original
        colored = recolor_pattern(pattern, CLUB_COLORS)
        assert colored.getchannel("A").tobytes() == pattern.getchannel("A").tobytes()
        assert colored.tobytes() != original
        assert pattern.tobytes() == original
        assert pattern.getchannel("A").getextrema() == (0, 255)


def test_recolor_uses_weighted_primary_masks_and_preserves_neutral_details():
    source = Image.new("RGBA", (6, 1))
    source.putdata([
        (255, 0, 0, 255), (0, 255, 0, 160), (0, 0, 255, 0),
        (70, 70, 70, 200), (128, 0, 0, 255), (128, 128, 0, 100),
    ])
    colored = recolor_pattern(source, ("#804020", "#204080", "#FFFFFF"))
    assert list(colored.getdata()) == [
        (128, 64, 32, 255), (32, 64, 128, 160), (255, 255, 255, 0),
        (70, 70, 70, 200), (64, 32, 16, 255), (80, 64, 80, 100),
    ]


def test_isolation_removes_detached_speckles_and_preserves_soft_edges():
    source = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
    for x in range(8, 12):
        for y in range(5, 15):
            source.putpixel((x, y), (100, 20, 10, 255))
    source.putpixel((7, 10), (100, 20, 10, 80))
    source.putpixel((1, 1), (100, 20, 10, 255))
    result = _isolate_shirt(source)
    assert result.size == (5, 10)
    assert result.getpixel((0, 5)) == (100, 20, 10, 80)


@pytest.mark.parametrize("pattern_index", [1, 16, 28, 55])
def test_rendered_png_has_bounded_size_and_source_proportions(pattern_index):
    source = _load_pattern(pattern_index)
    expected = recolor_pattern(source, CLUB_COLORS)
    expected.thumbnail((192, 192), Image.Resampling.LANCZOS)
    data = render_kit(pattern_index, CLUB_COLORS)
    with Image.open(BytesIO(data)) as image:
        assert image.format == "PNG"
        assert image.mode == "RGBA"
        assert max(image.size) == 192
        assert image.size == expected.size
        assert abs(image.width / image.height - source.width / source.height) < 0.01
        assert image.tobytes() == expected.tobytes()
        assert image.getpixel((0, 0))[3] == 0


def test_equivalent_palettes_share_bounded_render_cache():
    _render_kit.cache_clear()
    first = render_kit(1, ("112233", " ddeeff ", "#aabbcc"))
    second = render_kit(1, CLUB_COLORS)
    assert first is second
    info = _render_kit.cache_info()
    assert (info.hits, info.misses, info.currsize, info.maxsize) == (1, 1, 1, 128)
    assert _load_pattern.cache_info().maxsize == 8


@pytest.mark.parametrize("pattern_index", [0, 56, -1, 1.0, "1", True, None])
def test_invalid_pattern_indices_are_rejected(pattern_index):
    with pytest.raises(ValueError, match="pattern index"):
        render_kit(pattern_index, PRIMARIES)


@pytest.mark.parametrize("colors", [
    (), ("#FFFFFF",), ("#FFFFFF", "#000000", "#000000", "#000000"),
    ("#FFF", "#000000", "#000000"), ("GG0000", "#000000", "#000000"),
    ("##123456", "#000000", "#000000"), (None, "#000000", "#000000"),
    "#112233", None,
])
def test_invalid_palettes_are_rejected(colors):
    with pytest.raises(ValueError):
        render_kit(1, colors)


def test_color_normalization_accepts_optional_hash_and_whitespace():
    assert normalize_color(" abcDef ") == "#ABCDEF"
    assert normalize_color(" #abcDef ") == "#ABCDEF"


def test_outfits_keep_three_independent_palettes_and_transparency():
    red, green, blue = ("FF0000",) * 3, ("00FF00",) * 3, ("0000FF",) * 3
    with Image.open(BytesIO(render_outfit(1, red, green, blue))) as image:
        assert image.size == (320, 600) and image.mode == "RGBA"
        assert image.getpixel((0, 0))[3] == 0
        for point, channel in [((160, 180), 0), ((120, 370), 1), ((110, 510), 2)]:
            pixel = image.getpixel(point)
            assert pixel[3] >= 250
            assert pixel[channel] > max(pixel[i] for i in range(3) if i != channel) + 50
    base = render_outfit(1, red, green, blue)
    assert render_outfit(1, red, green, blue) is base
    assert render_outfit(1, red, blue, green) != base
