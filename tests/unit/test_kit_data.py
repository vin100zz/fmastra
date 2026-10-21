from types import SimpleNamespace

from pydantic import TypeAdapter

from core.domain.clubs import Club, ClubPersonality, ClubStatus, KIT_COMPONENT_FIELDS
from infrastructure.importation.readers import kit_components, enrich_kit_components
from infrastructure.persistence.codec import encode, decode


def test_each_garment_keeps_its_palette_and_absent_flags_win():
    values = kit_components({"AwayKitID": "38", "AwayKitMajorColorRGB": "#FFFFFF",
                             "HomeShortsID": "10", "HomeShortsMajorColorRGB": "#0000FF",
                             "AwaySocksID": "1", "AwaySocksMajorColorRGB": "#FF0000",
                             "HasAwaySocksData": "False"})
    assert values["away_kit_id"] == 38
    assert values["away_kit_major_color"] == "#FFFFFF"
    assert values["home_shorts_major_color"] == "#0000FF"
    assert values["away_socks_id"] is None
    assert values["away_socks_major_color"] is None
    assert all(value is None for value in kit_components({}).values())


def test_both_save_formats_accept_legacy_clubs_and_preserve_new_palettes():
    club = Club(1, "Club", "FRA", 16, 16, ClubStatus.ACTIVE, 20000, 50, 50,
                "4-3-3", ClubPersonality(.5, .5, .5, .5),
                away_kit_id=38, away_shorts_major_color="#112233")
    assert decode(encode(club)) == club
    adapter = TypeAdapter(Club)
    assert adapter.validate_json(adapter.dump_json(club)) == club
    tagged = encode(club)
    typed = adapter.dump_python(club, mode="json")
    for name in KIT_COMPONENT_FIELDS:
        tagged["fields"].pop(name)
        typed.pop(name)
    for restored in (decode(tagged), adapter.validate_python(typed)):
        assert all(getattr(restored, name) is None for name in KIT_COMPONENT_FIELDS)


def test_old_save_enrichment_matches_ids_and_preserves_saved_colors(tmp_path):
    def club(uid):
        return SimpleNamespace(id=uid, **dict.fromkeys(KIT_COMPONENT_FIELDS))
    old, current, unmatched = club(1), club(2), club(3)
    current.away_kit_major_color = "#ABCDEF"
    csv = tmp_path / "clubs.csv"
    csv.write_text("UID;AwayKitID;AwayKitMajorColorRGB;HomeShortsMajorColorRGB\n"
                   "1;38;#FFFFFF;#0000FF\n2;2;#FF0000;#00FF00\n", encoding="utf-8")
    enrich_kit_components([old, current, unmatched], csv)
    assert old.away_kit_id == 38 and old.home_shorts_major_color == "#0000FF"
    assert current.away_kit_major_color == "#ABCDEF"
    assert unmatched.away_kit_id is None
