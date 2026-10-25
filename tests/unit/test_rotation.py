from dataclasses import replace

from core.ai.selection import LineupContext, select_lineup
from core.domain.players import Position
from test_market import mini_world


def squad(config):
    """The club's twenty, and four weaker outfield players: enough to rest every outfield starter."""
    world = mini_world(config)
    club = world.clubs[1]
    players = [world.players[pid] for pid in club.player_ids]
    model = next(player for player in reversed(players) if player.position != Position.GOALKEEPER)
    extra = [replace(model, id=900 + rank, attributes=replace(model.attributes, values=tuple(value - 5 - rank for value in model.attributes.values)))
             for rank in range(4)]
    return world, club, players + extra


def test_each_level_rests_its_third_of_the_outfield_starters_never_the_keeper(config):
    world, club, players = squad(config)
    context = LineupContext(club, players, 16, world.date, world.seed, 10)
    best = select_lineup(context, config, "4-3-3")
    starters = {slot.player.id for slot in best.slots}
    keeper = best.slots[0].player.id
    for level, rested in ((1, 3), (2, 7), (3, 10)):
        lineup = select_lineup(context, config, "4-3-3", rotation=level)
        ids = [slot.player.id for slot in lineup.slots]
        assert lineup.formation == "4-3-3" and [slot.position for slot in lineup.slots] == [slot.position for slot in best.slots]
        assert lineup.slots[0].player.id == keeper
        assert len(set(ids)) == 11 and len(starters - set(ids)) == rested
        assert not {player.id for player in lineup.bench} & set(ids)
        assert len(lineup.bench) == config.world.match_rules.bench_size


def lowered(player, by):
    return replace(player, attributes=replace(player.attributes, values=tuple(value - by for value in player.attributes.values)))


def test_rotation_rests_first_where_the_second_choice_is_closest(config):
    world, club, players = squad(config)
    context = LineupContext(club, players, 16, world.date, world.seed, 10)
    best = select_lineup(context, config, "4-3-3")
    starters = {slot.player.id for slot in best.slots}
    starter = best.slots[5].player
    # The players left out a little weaker than the starters, but one just behind the starter of the sixth place.
    bench = [player for player in players if player.id not in starters and player.position != Position.GOALKEEPER]
    close = replace(lowered(starter, .3), id=bench[0].id, shirt=bench[0].shirt)
    others = {player.id: lowered(player, 4) for player in bench[1:]}
    players = [close if player.id == close.id else others.get(player.id, player) for player in players]
    context = LineupContext(club, players, 16, world.date, world.seed, 10)
    assert {slot.player.id for slot in select_lineup(context, config, "4-3-3").slots} == starters
    # In this squad every player is as good at every position: the close one plays wherever a starter rests.
    lineup = select_lineup(context, config, "4-3-3", rotation=1)
    assert close.id in {slot.player.id for slot in lineup.slots}
    assert len(starters - {slot.player.id for slot in lineup.slots}) == 3


def test_youth_puts_the_prospects_first_in_the_rotation(config, monkeypatch):
    world, club, players = squad(config)
    context = LineupContext(club, players, 16, world.date, world.seed, 10)
    starters = {slot.player.id for slot in select_lineup(context, config, "4-3-3").slots}
    plain = select_lineup(context, config, "4-3-3", rotation=3)
    left_out = [player for player in players if player.id not in starters | {slot.player.id for slot in plain.slots}
                and player.position != Position.GOALKEEPER]
    assert left_out
    prospect = left_out[0]
    monkeypatch.setattr("core.ai.selection.prospect", lambda player, *args: 1.0 if player.id == prospect.id else 0.0)
    assert prospect.id not in {slot.player.id for slot in select_lineup(context, config, "4-3-3", rotation=3).slots}
    assert prospect.id in {slot.player.id for slot in select_lineup(context, config, "4-3-3", rotation=3, youth=True).slots}


def test_adapting_a_formation_chooses_as_the_club_would_from_it(config):
    world, club, players = squad(config)
    context = LineupContext(club, players, 16, world.date, world.seed, 10)
    assert select_lineup(context, config, "5-4-1").formation == "5-4-1"
    adapted = select_lineup(context, config, "5-4-1", adapt=True)
    own = select_lineup(LineupContext(replace(club, formation="5-4-1"), players, 16, world.date, world.seed, 10), config)
    assert adapted.formation == own.formation
    assert [(slot.player.id, slot.position) for slot in adapted.slots] == [(slot.player.id, slot.position) for slot in own.slots]
