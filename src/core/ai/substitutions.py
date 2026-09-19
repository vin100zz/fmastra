"""Pure substitution decisions over match-local state."""
from dataclasses import dataclass

from core.config.model import Config
from core.domain.players import Position
from core.domain.matches import PlayingTimePriority
from core.engine.abilities import overall, state_multiplier
from core.engine.local_state import TeamState
from .playing_time import rotation_bonus


@dataclass(frozen=True, slots=True)
class Substitution:
    outgoing_id: int
    incoming_id: int
    position: Position


def choose_substitution(team: TeamState, cfg: Config, forced_id: int | None = None, *,
                        minute: float = 0, goal_difference: int = 0,
                        allow_rotation: bool = True) -> Substitution | None:
    if not team.bench or team.substituted >= cfg.world.match_rules.max_substitutions:
        return None
    rules = cfg.states.substitutions
    ordered = sorted(team.active, key=lambda slot: (slot.player.id != forced_id, team.fitness[slot.player.id], slot.player.id))
    for slot in ordered:
        pid = slot.player.id
        stats = team.individual[pid]
        # Keepers are changed for an injury, not routine fatigue or rotation.
        tired = team.fitness[pid] < rules.fitness_threshold
        booked_and_tired = stats.yellows and team.fitness[pid] < rules.booked_fitness_threshold
        needs = pid == forced_id or (slot.position != Position.GOALKEEPER and (tired or booked_and_tired))
        if not needs:
            continue
        candidates = [player for player in team.bench
                      if (player.position == Position.GOALKEEPER) == (slot.position == Position.GOALKEEPER)]
        if not candidates:
            candidates = team.bench if pid == forced_id else []
        if not candidates:
            continue
        candidate = max(candidates, key=lambda player: (overall(player.attributes, slot.position, cfg)
                                                        * state_multiplier(player, slot.position, cfg), -player.id))
        return Substitution(pid, candidate.id, slot.position)

    remaining = cfg.engine.timing.match_seconds / 60 - minute
    if (not allow_rotation or minute < rules.first_evaluation_minute
            or remaining < rules.min_useful_minutes):
        return None
    comfortable = goal_difference >= rules.defensive_goal_margin
    # A comfortable lead permits development; chasing a result favors impact.
    context_weight = 1.0 if comfortable else rules.trailing_rotation_factor if goal_difference < 0 else rules.close_game_rotation_factor
    acceptable_gap = rules.replacement_gap * (rules.comfortable_gap_factor if comfortable else 1)
    permitted_loss = rules.replacement_gap if comfortable else 0
    options = []
    for slot in team.active:
        if slot.position == Position.GOALKEEPER or slot.player.id not in team.starters:
            continue
        outgoing = slot.player
        current = overall(outgoing.attributes, slot.position, cfg) * state_multiplier(
            outgoing, slot.position, cfg, team.fitness[outgoing.id])
        rested = overall(outgoing.attributes, slot.position, cfg) * state_multiplier(outgoing, slot.position, cfg, 1.0)
        for incoming in team.bench:
            if incoming.position == Position.GOALKEEPER or incoming.affinity(slot.position) < rules.rotation_min_affinity:
                continue
            quality = overall(incoming.attributes, slot.position, cfg) * state_multiplier(incoming, slot.position, cfg)
            if quality < rested - acceptable_gap or quality < current - permitted_loss:
                continue
            priority = team.playing_time.get(incoming.id, PlayingTimePriority())
            score = quality - current + context_weight * rotation_bonus(priority, cfg)
            if score >= rules.rotation_min_gain:
                options.append((score, -outgoing.id, -incoming.id, Substitution(outgoing.id, incoming.id, slot.position)))
    return max(options, key=lambda item: item[:3])[3] if options else None
