"""Apply personnel changes only to match-local state."""
from random import Random
from typing import TYPE_CHECKING

from core.config.model import Config
from core.domain.matches import LineupSlot, PlayerMatchStats
from core.domain.players import Position
from core.math import clamp
from .abilities import weighted_rating
from .local_state import MatchLog, TeamState
from .zones import refresh

if TYPE_CHECKING:
    from core.ai.controller import AIController


def ensure_keeper(team: TeamState, cfg: Config) -> None:
    if team.active and not any(slot.position == Position.GOALKEEPER for slot in team.active):
        best = max(team.active, key=lambda slot: weighted_rating(slot.player.attributes, cfg.attributes.composites.saving))
        index = team.active.index(best)
        team.active[index] = LineupSlot(best.player, Position.GOALKEEPER)


def substitutions(team: TeamState, log: MatchLog, cfg: Config, controller: "AIController",
                  forced_id: int | None = None, halftime: bool = False) -> int:
    if team.windows >= cfg.world.match_rules.substitution_windows and not halftime:
        return 0
    changes = 0
    while True:
        decision = controller.decide_substitution(team, forced_id)
        if decision is None:
            break
        outgoing = next(slot for slot in team.active if slot.player.id == decision.outgoing_id)
        incoming = next(player for player in team.bench if player.id == decision.incoming_id)
        team.active[team.active.index(outgoing)] = LineupSlot(incoming, decision.position)
        team.bench.remove(incoming)
        team.individual[incoming.id] = PlayerMatchStats(final_fitness=incoming.fitness)
        team.substituted += 1
        changes += 1
        log.emit("substitution", team, outgoing.player.id, incoming.id, detail=decision.position.value)
        forced_id = None
    if changes:
        if not halftime: team.windows += 1
        refresh(team, cfg)
    return changes


def injure(team: TeamState, player_id: int, log: MatchLog, cfg: Config, controller: "AIController") -> int:
    team.injured.add(player_id)
    log.emit("injury", team, player_id)
    changes = substitutions(team, log, cfg, controller, player_id)
    team.active[:] = [slot for slot in team.active if slot.player.id != player_id]
    ensure_keeper(team, cfg)
    refresh(team, cfg)
    return changes


def dismiss(team: TeamState, player_id: int, log: MatchLog, cfg: Config, direct: bool) -> None:
    keeper_sent_off = any(slot.player.id == player_id and slot.position == Position.GOALKEEPER for slot in team.active)
    stats = team.individual[player_id]
    stats.red = True
    stats.direct_red = direct
    team.stats.reds += 1
    team.dismissed.add(player_id)
    team.active[:] = [slot for slot in team.active if slot.player.id != player_id]
    heights = cfg.formations.block_height
    team.initial_block = clamp(team.initial_block + heights.red_card_adjustment, heights.min, heights.max)
    team.block_height = team.initial_block
    log.emit("red", team, player_id, detail="direct" if direct else "second_yellow")
    reserve_keepers = [player for player in team.bench if player.position == Position.GOALKEEPER]
    if keeper_sent_off and reserve_keepers and team.active and team.substituted < cfg.world.match_rules.max_substitutions and team.windows < cfg.world.match_rules.substitution_windows:
        incoming = max(reserve_keepers, key=lambda player: (player.rating, -player.id))
        outgoing = min(team.active, key=lambda slot: (slot.player.rating, slot.player.id))
        team.active[team.active.index(outgoing)] = LineupSlot(incoming, Position.GOALKEEPER)
        team.bench.remove(incoming)
        team.individual[incoming.id] = PlayerMatchStats(final_fitness=incoming.fitness)
        team.substituted += 1
        team.windows += 1
        log.emit("substitution", team, outgoing.player.id, incoming.id, detail=Position.GOALKEEPER.value)
    ensure_keeper(team, cfg)
    refresh(team, cfg)
