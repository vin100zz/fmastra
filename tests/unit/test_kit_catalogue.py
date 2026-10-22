from infrastructure.importation.kit_catalogue import KitCatalogue


def test_catalogue_reloads_same_size_edits_and_keeps_last_complete_snapshot(tmp_path):
    path = tmp_path / "clubs.csv"
    catalogue = KitCatalogue(path)
    assert catalogue.snapshot() == (0, {})
    header = "UID;HomeKitID;HomeKitMajorColorRGB;AwayKitID;HasAwayKitData\n"
    path.write_text(header + "866;1;#112233;38;True\n", encoding="utf-8-sig")
    first_revision, first = catalogue.snapshot()
    assert first[866]["home_kit_id"] == 1
    assert first[866]["away_kit_id"] == 38
    assert catalogue.snapshot()[1] is first

    path.write_text(header + "866;2;#445566;38;True\n", encoding="utf-8-sig")
    revision, updated = catalogue.snapshot()
    assert revision > first_revision
    assert updated[866]["home_kit_major_color"] == "#445566"
    assert updated[866]["home_kit_id"] == 2
    assert first[866]["home_kit_major_color"] == "#112233"

    for incomplete in ("", "UID;Name\n866;OM\n", header + "866;2\n", header + "bad;1;#112233;1;True\n"):
        path.write_text(incomplete, encoding="utf-8")
        assert catalogue.snapshot() == (revision, updated)
    path.unlink()
    assert catalogue.snapshot() == (revision, updated)

    path.write_text(header + "866;;#778899;38;False\n", encoding="utf-8")
    _, cleared = catalogue.snapshot()
    assert cleared[866]["home_kit_id"] is None
    assert cleared[866]["away_kit_id"] is None
    assert cleared[866]["away_kit_major_color"] is None
