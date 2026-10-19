from pathlib import Path

import pytest

from core.world.pyramids import check_pyramids, default_levels, world_payload
from infrastructure.config.loader import config_payload, configure_world, load_pyramids

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def pyramids(config):
    return load_pyramids(ROOT / "config", config)


def test_the_configuration_opens_each_pyramid_and_plays_its_leagues_by_default(config, pyramids):
    assert [pyramid.nation for pyramid in pyramids] == ["FRA", "ITA", "ESP", "ENG", "GER", "NED", "POR", "BEL", "TUR"]
    # A new game plays the five first nations by default; the others are offered.
    assert default_levels(config, pyramids) == {"FRA": 3, "ITA": 2, "ESP": 2, "ENG": 2, "GER": 2, "NED": 0, "POR": 0, "BEL": 0, "TUR": 0}
    germany = pyramids[4]
    assert germany.reserve_under(2) == (35010926,) and germany.reserve_under(3) == germany.reserve


def test_each_pyramid_follows_the_divisions_of_the_source(pyramids):
    """creation.json takes, level after level, the divisions data/divisions.csv lists alone at their level, with the
    clubs.csv count; the pool under the lowest is the level below, when the source lists it."""
    import csv
    from collections import Counter, defaultdict
    with (ROOT / "data" / "divisions.csv").open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter=";"))
    with (ROOT / "data" / "nations.csv").open(encoding="utf-8-sig", newline="") as handle:
        codes = {row["name"]: row["code"] for row in csv.DictReader(handle)}
    with (ROOT / "data" / "clubs.csv").open(encoding="utf-8-sig", newline="") as handle:
        sizes = Counter(int(row["DivisionUID"]) for row in csv.DictReader(handle, delimiter=";") if row["DivisionUID"])
    levels: dict[str, dict[int, list[int]]] = defaultdict(lambda: defaultdict(list))
    for row in rows: levels[codes[row["Nation"]]][int(row["Level"])].append(int(row["DivisionUID"]))
    for pyramid in pyramids:
        source = levels[pyramid.nation]
        assert [division.division_id for division in pyramid.divisions] == [source[level][0] for level in range(1, len(pyramid.divisions) + 1)]
        assert all(len(source[level]) == 1 for level in range(1, len(pyramid.divisions) + 1)), pyramid.nation
        assert all(division.club_count == sizes[division.division_id] for division in pyramid.divisions), pyramid.nation
        below = source.get(len(pyramid.divisions) + 1)
        assert below is None or sorted(pyramid.reserve) == sorted(below), pyramid.nation


def test_a_choice_of_nations_and_levels_becomes_the_leagues_and_reserves_of_the_world(config, pyramids):
    cfg = configure_world(config, pyramids, {"FRA": 2, "GER": 3})
    assert [(league.nation, league.level, league.name) for league in cfg.world.competitions] == [
        ("FRA", 1, "Ligue 1"), ("FRA", 2, "Ligue 2"), ("GER", 1, "Bundesliga"), ("GER", 2, "Bundesliga 2"), ("GER", 3, "3. Liga")]
    assert {pool.nation: pool.division_ids for pool in cfg.world.promotion_relegation.reserves} == {
        "FRA": (18,), "GER": (26, 91107110, 35010927, 27, 91107111)}
    # Everything else is the configuration's own, and the default choice gives it back unchanged.
    assert cfg.world.season == config.world.season and cfg.engine == config.engine
    assert configure_world(config, pyramids, default_levels(config, pyramids)) == config
    check_pyramids(cfg, pyramids)


def test_a_choice_needs_a_nation_and_divisions_it_has(config, pyramids):
    world = config_payload(config)["monde"]
    with pytest.raises(ValueError, match="at least one nation"): world_payload(world, pyramids, {})
    with pytest.raises(ValueError, match="at least one nation"): world_payload(world, pyramids, {"FRA": 0})
    with pytest.raises(ValueError, match="No such division"): world_payload(world, pyramids, {"ITA": 3})
    with pytest.raises(ValueError, match="Unknown nation"): world_payload(world, pyramids, {"SCO": 1})
