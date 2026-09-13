from copy import deepcopy
from core.world.estimates import estimate_potential
from core.world.events import PlayerChanged, PlayerSigned
from core.world.player_states import monthly_player_events
from core.domain.date import Date
from core.domain.players import Position
from core.ai.market import squad_quality
from benchmarks.fixtures import synthetic_lineup


def test_observation_is_stable_and_not_true_center(config):
    player = synthetic_lineup(config, 1).slots[0].player
    player.potential = 92
    player.born = Date(2007, 1, 1)
    first = estimate_potential(player, Date(2025, 7, 1), 14, config)
    assert first == estimate_potential(player, Date(2025, 7, 1), 14, config)
    assert first.center != player.potential


def test_monthly_decline_at_reached_potential(config):
    from core.domain.world import World
    from core.randomness import stream
    player = synthetic_lineup(config, 1).slots[-1].player
    player.club_id = None
    player.born = Date(1980, 1, 1)
    player.potential = player.rating
    world = World(Date(2025, 7, 1), 2025, 1, config, {player.id: player}, {}, {}, {}, 1000)
    world.rngs["progression"] = stream(22)
    before = deepcopy(player)
    changes = monthly_player_events(world)
    assert changes[0].rating < player.rating
    assert player == before
