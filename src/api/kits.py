"""Home and away outfits with independent shirt, shorts and socks palettes."""
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import Response

from core.domain.clubs import Club
from .kit_images import NATION_CODE, PATTERN_COUNT, normalize_color, render_kit, render_outfit


PATTERNS = {0: 1, **{code: code for code in range(1, PATTERN_COUNT + 1)}}
NEUTRAL = "#8A9193"
HexColor = Annotated[str, Query(pattern=r"^[0-9a-fA-F]{6}$")]
router = APIRouter()


def _color(value: str | None, fallback: str) -> str:
    try:
        return normalize_color(value)
    except ValueError:
        return fallback


def _palette(club: Club, prefix: str, fallback: str) -> tuple[str, str, str]:
    major = _color(getattr(club, f"{prefix}_major_color", None), fallback)
    minor = _color(getattr(club, f"{prefix}_minor_color", None), major)
    third = _color(getattr(club, f"{prefix}_third_color", None), minor)
    return major, minor, third


def kit_url(club: Club, side: str = "home", nation: str | None = None) -> str | None:
    """The picture of a club's outfit, its crest on the chest; a selection's (`nation`, its code) wears its logo there."""
    if side not in ("home", "away"):
        raise ValueError("Unknown kit side")
    prefix = f"{side}_kit"
    kit_id = getattr(club, f"{prefix}_id", None)
    if side == "away" and kit_id is None and not any(
        getattr(club, f"{prefix}_{color}_color", None) for color in ("major", "minor", "third")
    ):
        return None
    shirt = _palette(club, prefix, NEUTRAL)
    shorts = _palette(club, f"{side}_shorts", shirt[0])
    socks = _palette(club, f"{side}_socks", shirt[0])
    query = "&".join(f"{prefix}{key}={value[1:]}"
                     for prefix, palette in (("", shirt), ("shorts_", shorts), ("socks_", socks))
                     for key, value in zip(("major", "minor", "third"), palette))
    if nation is not None:
        query += f"&nation={nation}"
    elif (club_id := getattr(club, "id", None)) is not None:
        query += f"&club_id={club_id}"
    return f"/kits/{kit_id if kit_id is not None else 0}/outfit.png?{query}"


@router.get("/kits/{kit_id}.png")
def kit_image(kit_id: int, major: HexColor, minor: HexColor, third: HexColor):
    image = render_kit(PATTERNS.get(kit_id, 1), (major, minor, third))
    return Response(image, media_type="image/png")


@router.get("/kits/{kit_id}/outfit.png")
def outfit_image(kit_id: int, major: HexColor, minor: HexColor, third: HexColor,
                 shorts_major: HexColor, shorts_minor: HexColor, shorts_third: HexColor,
                 socks_major: HexColor, socks_minor: HexColor, socks_third: HexColor,
                 club_id: Annotated[int | None, Query(gt=0)] = None,
                 nation: Annotated[str | None, Query(pattern=NATION_CODE)] = None):
    image = render_outfit(PATTERNS.get(kit_id, 1), (major, minor, third),
                          (shorts_major, shorts_minor, shorts_third),
                          (socks_major, socks_minor, socks_third), club_id=club_id, nation=nation)
    return Response(image, media_type="image/png")
