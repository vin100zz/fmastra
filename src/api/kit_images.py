"""Render shirts and complete outfits from RGB templates, preserving fabric shading."""

from functools import lru_cache
from io import BytesIO
from pathlib import Path
import re

from PIL import Image, ImageChops, ImageDraw, ImageFilter


_ASSETS = Path(__file__).resolve().parents[2] / "web" / "kits"
_OUTPUT_SIZE = (192, 192)
_OUTFIT_SIZE = (320, 600)
PATTERN_COUNT = 55


def normalize_color(value: str) -> str:
    """Accept six-digit RGB colors, with an optional leading ``#``."""
    if not isinstance(value, str):
        raise ValueError("A kit color must contain six hexadecimal digits.")
    value = value.strip().removeprefix("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", value):
        raise ValueError("A kit color must contain six hexadecimal digits.")
    return "#" + value.upper()


def _normalize_palette(colors: tuple[str, str, str]) -> tuple[str, str, str]:
    if not isinstance(colors, (tuple, list)) or len(colors) != 3:
        raise ValueError("Exactly three kit colors are required.")
    return tuple(normalize_color(color) for color in colors)


def _isolate_shirt(image: Image.Image) -> Image.Image:
    """Remove detached atlas speckles while retaining the soft alpha edge."""
    alpha = image.getchannel("A")
    core = alpha.point(lambda value: 255 if value >= 160 else 0)
    seed = (image.width // 2, image.height // 2)
    if core.getpixel(seed) != 255:
        raise ValueError("The center of a kit pattern must contain a shirt.")
    ImageDraw.floodfill(core, seed, 128)
    core = core.point(lambda value: 255 if value == 128 else 0)
    edge = core.filter(ImageFilter.MaxFilter(3))
    image.putalpha(ImageChops.multiply(alpha, edge))
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("The kit pattern is empty.")
    return image.crop(bounds)


@lru_cache(maxsize=8)
def _load_pattern(pattern_index: int) -> Image.Image:
    with Image.open(_ASSETS / "templates" / f"KIT_{pattern_index}.png") as source:
        return _isolate_shirt(source.convert("RGBA"))


@lru_cache(maxsize=2)
def _load_component(name: str) -> Image.Image:
    with Image.open(_ASSETS / "components" / f"{name}.png") as source:
        image = source.convert("RGBA")
    return image.crop(image.getchannel("A").getbbox())


def recolor_pattern(
    source: Image.Image, colors: tuple[str, str, str]
) -> Image.Image:
    """Replace RGB primary zones, preserving neutral details and source alpha."""
    palette = [
        tuple(int(color[index:index + 2], 16) for index in (1, 3, 5))
        for color in _normalize_palette(colors)
    ]
    red, green, blue, alpha = source.convert("RGBA").split()
    neutral = ImageChops.darker(ImageChops.darker(red, green), blue)
    masks = [
        ImageChops.subtract(channel, neutral) for channel in (red, green, blue)
    ]
    channels = []
    for component in range(3):
        channel = neutral.copy()
        for mask, color in zip(masks, palette):
            lookup = [(value * color[component] + 127) // 255 for value in range(256)]
            channel = ImageChops.add(channel, mask.point(lookup))
        channels.append(channel)
    return Image.merge("RGBA", (*channels, alpha))


@lru_cache(maxsize=128)
def _render_kit(pattern_index: int, colors: tuple[str, str, str]) -> bytes:
    image = recolor_pattern(_load_pattern(pattern_index), colors)
    image.thumbnail(_OUTPUT_SIZE, Image.Resampling.LANCZOS)
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _validate_pattern(pattern_index: int) -> None:
    if type(pattern_index) is not int or not 1 <= pattern_index <= PATTERN_COUNT:
        raise ValueError("The kit pattern index must be between 1 and 55.")


def render_kit(pattern_index: int, colors: tuple[str, str, str]) -> bytes:
    """Transparent shirt PNG for its native CSV code (1–55)."""
    _validate_pattern(pattern_index)
    return _render_kit(pattern_index, _normalize_palette(colors))


@lru_cache(maxsize=128)
def _render_outfit(pattern_index: int, shirt: tuple, shorts: tuple, socks: tuple) -> bytes:
    canvas = Image.new("RGBA", (640, 1200))
    # The shirt covers the waistband; the shorts cover the top edge of the socks.
    for source, palette, bounds, top in (
        (_load_component("socks"), socks, (300, 360), 835),
        (_load_component("shorts"), shorts, (365, 290), 575),
        (_load_pattern(pattern_index), shirt, (600, 600), 8),
    ):
        garment = recolor_pattern(source, palette)
        garment.thumbnail(bounds, Image.Resampling.LANCZOS)
        canvas.alpha_composite(garment, ((canvas.width - garment.width) // 2, top))
    canvas.thumbnail(_OUTFIT_SIZE, Image.Resampling.LANCZOS)
    output = BytesIO()
    canvas.save(output, format="PNG")
    return output.getvalue()


def render_outfit(pattern_index: int, shirt: tuple[str, str, str],
                  shorts: tuple[str, str, str], socks: tuple[str, str, str]) -> bytes:
    """Assemble the three supplied garments with their independent CSV palettes."""
    _validate_pattern(pattern_index)
    return _render_outfit(pattern_index, *(_normalize_palette(p) for p in (shirt, shorts, socks)))
