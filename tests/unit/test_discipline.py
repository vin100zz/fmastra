from core.domain.players import Discipline
from core.domain.matches import Match, MatchResult, PlayerMatchStats
from core.world.events import MatchPlayed
from core.world.application import apply
from core.engine.local_state import TeamState, MatchLog
from core.engine.personnel import dismiss
from benchmarks.fixtures import synthetic_lineup
from test_market import mini_world


def test_goalkeeper_red_uses_reserve_without_restoring_eleven(config):
    lineup = synthetic_lineup(config, 1)
    state, log = TeamState.from_lineup(lineup, config), MatchLog()
    dismiss(state, lineup.slots[0].player.id, log, config, True)
    assert len(state.active) == 10
    assert state.goalkeeper().player.id == lineup.bench[0].id
    assert state.substituted == 1 and state.windows == 1
    assert len({slot.player.id for slot in state.active}) == 10


def test_new_suspension_is_not_served_by_match_that_caused_it(config):
    world = mini_world(config)
    player = world.players[101]
    player.discipline[16] = Discipline(yellows=4)
    suspended = world.players[102]
    suspended.discipline[16] = Discipline(suspended_matches=1)
    world.matches[10] = Match(10,16,2025,1,world.date,1,2)
    result = MatchResult(0,0,"possession",player_stats={player.id:PlayerMatchStats(minutes=90,yellows=1)})
    apply(world, MatchPlayed(10,result,{}, {player.id:1}, {}))
    assert player.discipline[16].yellows == 5
    assert player.discipline[16].suspended_matches == 1
    assert suspended.discipline[16].suspended_matches == 0
