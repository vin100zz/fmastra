from dataclasses import replace

from benchmarks.fixtures import synthetic_lineup
from core.domain.date import Date
from core.domain.players import Contract
from core.world import talks
from core.world.recruitment import longevity, recruitment, tier, STARTER, ROTATION, BACKUP
from core.world.transfer_rules import target_level
from test_market import recruitment_world


def human_world(config):
    """Two clubs, the first one the user's, and free specialists at level 80 who would improve every position."""
    world = recruitment_world(config)
    world.controlled_club_id = 1
    return world


def all_leads(found):
    return [lead for item in found.positions for lead in item.leads]


def test_a_veterans_contribution_fades_each_year_past_the_age_of_full_value(config):
    rules = config.management.market.recruitment
    assert longevity(rules.full_value_age, config) == longevity(20, config) == 1
    assert longevity(rules.full_value_age + 1, config) == 1 - rules.yearly_fade
    assert longevity(60, config) == rules.minimum_share


def test_a_place_reads_as_starter_rotation_or_backup(config):
    starters, rotation = config.world.match_rules.players_on_pitch, config.management.target_profile.rotation_places
    assert [tier(0, config), tier(starters, config), tier(starters + rotation, config), tier(None, config)] == [STARTER, ROTATION, BACKUP, None]


def test_present_leads_raise_the_squad_and_fit_its_means(config):
    world = human_world(config)
    found = recruitment(world)
    leads = all_leads(found)
    assert leads, "the free specialists improve the squad"
    rules = config.management.market.recruitment
    for item in found.positions:
        assert len(item.leads) <= rules.leads_per_position
        assert [lead.score for lead in item.leads] == sorted((lead.score for lead in item.leads), reverse=True)
        assert all(world.players[lead.player_id].position == item.position for lead in item.leads)
        assert item.holder_id is None or item.holder_id in world.clubs[1].player_ids
    for lead in leads:
        player = world.players[lead.player_id]
        assert player.club_id != 1 and lead.wage == talks.asked_wage(world, player) and lead.wage <= found.wages
        assert lead.fee <= found.money and lead.place in (STARTER, ROTATION, BACKUP)
        assert lead.score >= config.management.market.minimum_quality_gain * config.management.market.recruitment.minimum_share


def test_no_lead_beyond_the_wage_cap(config):
    world = human_world(config)
    club = world.clubs[1]
    club.wage_cap = club.wage_bill
    assert not all_leads(recruitment(world))


def test_free_agents_keep_only_players_without_a_club(config):
    world = human_world(config)
    assert all(world.players[lead.player_id].club_id is None for lead in all_leads(recruitment(world, free_agents=True)))


def test_future_leads_are_young_players_the_club_reads_far_above_its_aim(config):
    world = human_world(config)
    # A modest club, whose aim a prospect's estimated potential can clear.
    world.clubs[1].reputation = 0
    prospect = synthetic_lineup(config, 70, level=45).slots[5].player
    prospect.id, prospect.club_id, prospect.contract = 900, None, None
    prospect.born = Date(world.date.year - 18, 1, 1)
    prospect.potential = 99
    world.players[prospect.id] = prospect
    found = recruitment(world, future=True)
    leads = all_leads(found)
    assert [lead.player_id for lead in leads] == [prospect.id]
    aim = target_level(world.clubs[1], config) + config.management.market.prospect_margin
    assert leads[0].score >= aim and leads[0].place is None


def test_players_out_of_reach_are_left_out(config):
    world = human_world(config)
    leads = {lead.player_id for lead in all_leads(recruitment(world))}
    blocked = next(iter(leads))
    world.talks_closed[blocked] = Date(world.date.year, 12, 31)
    assert blocked not in {lead.player_id for lead in all_leads(recruitment(world))}


def test_surplus_is_the_squad_without_a_place(config):
    world = human_world(config)
    club = world.clubs[1]
    spare = synthetic_lineup(config, 60, level=30)
    for slot in spare.slots:
        player = slot.player
        player.club_id, player.contract = 1, Contract(1000, Date(world.season + 3, 6, 30), world.date)
        world.players[player.id] = player
        club.player_ids.append(player.id)
    found = recruitment(world)
    assert found.surplus and len(found.surplus) <= config.management.market.recruitment.surplus_shown
    assert set(found.surplus) <= set(club.player_ids)


def test_the_cell_settings_are_checked(config):
    from core.config.consistency import validate_consistency
    import pytest
    rules = replace(config.management.market.recruitment, leads_per_position=50)
    market = replace(config.management.market, recruitment=rules)
    with pytest.raises(ValueError):
        validate_consistency(replace(config, management=replace(config.management, market=market)))
