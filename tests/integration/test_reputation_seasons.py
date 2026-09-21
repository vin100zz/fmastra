from dataclasses import fields
from pathlib import Path

from api.views import table
from core.world.reputation import division_levels
from core.world.simulation import advance_day
from core.world.validation import validate_world
from infrastructure.importation.loader import import_world
from infrastructure.persistence.store import SaveStore
from test_season_rollover import finish_season

ROOT = Path(__file__).resolve().parents[2]


def test_july_revises_every_club_and_the_history_survives_saves_and_a_second_season(config, tmp_path):
    world = import_world(ROOT / 'data', config, 123)
    start = {cid: club.reputation for cid, club in world.clubs.items()}
    levels = division_levels(config)
    assert all(club.reputation_anchor == club.reputation for club in world.clubs.values())
    assert {1, 2, 3, 4} <= set(world.reputation_ceilings['FRA']) and set(world.reputation_ceilings) >= {'ENG', 'ESP', 'GER', 'ITA'}
    assert {cid: history for cid, history in world.reputation_history.items()} == {cid: [(2025, value)] for cid, value in start.items()}

    finish_season(world)
    tables = {lid: table(world, lid) for lid, competition in world.competitions.items() if competition.kind == 'league'}
    relegated, promoted, champion = tables[18][-1]['club_id'], tables[17][0]['club_id'], tables[16][0]['club_id']
    advance_day(world)
    validate_world(world)
    rules = config.world.reputation
    assert all(rules.bounds.min <= club.reputation <= rules.bounds.max for club in world.clubs.values())
    assert world.clubs[relegated].reputation < start[relegated]  # Down to the reserve pool, at the bottom of its league
    assert world.clubs[promoted].reputation > start[promoted]
    assert world.clubs[champion].reputation > start[champion]
    # Clubs outside every pyramid are moved by Europe and honours alone, and only upwards.
    foreign = [club for club in world.clubs.values() if club.source_division_id not in levels]
    assert foreign and all(club.reputation >= start[club.id] for club in foreign)
    assert any(club.reputation > start[club.id] for club in foreign)
    assert all(club.reputation_anchor == start[club.id] for club in world.clubs.values())
    assert all(history == [(2025, start[cid]), (2026, world.clubs[cid].reputation)]
               for cid, history in world.reputation_history.items())

    store = SaveStore(tmp_path)
    store.save(world, 'july')
    restored = store.load('july')
    for field in fields(world):
        if field.name != 'rngs':
            assert getattr(world, field.name) == getattr(restored, field.name), field.name

    for candidate in (world, restored):
        finish_season(candidate)
        advance_day(candidate)
        validate_world(candidate)
    assert candidate.season == 2027
    assert all(len(history) == 3 and history[-1] == (2027, world.clubs[cid].reputation) for cid, history in world.reputation_history.items())
    assert {cid: club.reputation for cid, club in world.clubs.items()} == {cid: club.reputation for cid, club in restored.clubs.items()}
    assert world.reputation_history == restored.reputation_history
