from pathlib import Path

import pytest

from core.world.pyramids import check_pyramids, default_levels, world_payload
from infrastructure.config.loader import config_payload, configure_world, load_pyramids

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def pyramids(config):
    return load_pyramids(ROOT / "config", config)


def test_the_configuration_opens_each_pyramid_and_plays_its_leagues_by_default(config, pyramids):
    assert [pyramid.nation for pyramid in pyramids] == ["FRA", "ITA", "ESP", "ENG", "GER"]
    assert default_levels(config, pyramids) == {"FRA": 3, "ITA": 2, "ESP": 2, "ENG": 2, "GER": 2}
    germany = pyramids[-1]
    assert germany.reserve_under(2) == (35010926,) and germany.reserve_under(3) == germany.reserve


def test_a_choice_of_nations_and_levels_becomes_the_leagues_and_reserves_of_the_world(config, pyramids):
    cfg = configure_world(config, pyramids, {"FRA": 2, "GER": 3})
    assert [(league.nation, league.level, league.name) for league in cfg.world.competitions] == [
        ("FRA", 1, "Ligue 1"), ("FRA", 2, "Ligue 2"), ("GER", 1, "Bundesliga"), ("GER", 2, "Bundesliga 2"), ("GER", 3, "3. Liga")]
    assert {pool.nation: pool.division_ids for pool in cfg.world.promotion_relegation.reserves} == {
        "FRA": (18,), "GER": (2000469344, 2000469346, 2000469347, 2000469362, 2000469371)}
    # Everything else is the configuration's own, and the default choice gives it back unchanged.
    assert cfg.world.season == config.world.season and cfg.engine == config.engine
    assert configure_world(config, pyramids, default_levels(config, pyramids)) == config
    check_pyramids(cfg, pyramids)


def test_a_choice_needs_a_nation_and_divisions_it_has(config, pyramids):
    world = config_payload(config)["monde"]
    with pytest.raises(ValueError, match="at least one nation"): world_payload(world, pyramids, {})
    with pytest.raises(ValueError, match="at least one nation"): world_payload(world, pyramids, {"FRA": 0})
    with pytest.raises(ValueError, match="No such division"): world_payload(world, pyramids, {"ITA": 3})
    with pytest.raises(ValueError, match="Unknown nation"): world_payload(world, pyramids, {"POR": 1})
