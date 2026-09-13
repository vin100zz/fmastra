"""Pure substitution decisions over match-local state."""
from dataclasses import dataclass

from core.config.model import Config
from core.domain.players import Position
from core.engine.abilities import overall, state_multiplier
from core.engine.local_state import TeamState


@dataclass(frozen=True, slots=True)
class Substitution:
    outgoing_id: int
    incoming_id: int
    position: Position


def choose_substitution(team: TeamState, cfg: Config, forced_id: int | None = None) -> Substitution | None:
    if not team.bench or team.substituted >= cfg.world.match_rules.max_substitutions:
        return None
    rules = cfg.states.substitutions
    ordered = sorted(team.active, key=lambda slot: (slot.player.id != forced_id, team.fitness[slot.player.id], slot.player.id))
    for slot in ordered:
        pid = slot.player.id
        stats = team.individual[pid]
        needs = pid == forced_id or team.fitness[pid] < rules.fitness_threshold or (
            stats.yellows and team.fitness[pid] < rules.booked_fitness_threshold)
        if not needs:
            continue
        candidate = max(team.bench, key=lambda player: (overall(player.attributes, slot.position, cfg)
                                                        * state_multiplier(player, slot.position, cfg), -player.id))
        return Substitution(pid, candidate.id, slot.position)
    return None
