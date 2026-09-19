"""Lineup and bench decisions with unique player assignments."""
from dataclasses import dataclass
from typing import TYPE_CHECKING

from core.config.model import Config
from core.domain.clubs import Club
from core.domain.date import Date
from core.domain.matches import Lineup, LineupSlot
from core.domain.players import Player, Position
from core.engine.abilities import overall, state_multiplier
from .assignment import maximize_assignment
from .playing_time import playing_time_priorities, rotation_bonus

if TYPE_CHECKING:
    from core.domain.world import World


@dataclass(frozen=True, slots=True)
class LineupContext:
    club: Club
    players: list[Player]
    competition_id: int
    date: Date
    seed: int = 0
    games_played: int = 0

    @classmethod
    def from_world(cls, world: "World", club_id: int, competition_id: int, date: Date) -> "LineupContext":
        club = world.clubs[club_id]
        games = sum(match.result is not None and match.season == world.season
                    and club_id in (match.home_id, match.away_id) for match in world.matches.values())
        return cls(club, [world.players[pid] for pid in club.player_ids], competition_id, date, world.seed, games)


def select_lineup(context: LineupContext, cfg: Config) -> Lineup:
    players = sorted((player for player in context.players if player.available(context.competition_id, context.date)),
                     key=lambda player: player.id)
    formations = cfg.formations.formations
    formation = context.club.formation
    if len(players) < cfg.world.match_rules.players_on_pitch:
        # Preserve the keeper slot and strongest available outfield coverage.
        roles = [Position(role) for role in formations[formation]][:len(players)]
    else:
        roles = [Position(role) for role in formations[formation]]
    if not roles:
        return Lineup(context.club.id, formation, [], [])
    scores = [[overall(player.attributes, role, cfg) * state_multiplier(player, role, cfg)
               for player in players] for role in roles]
    assigned = maximize_assignment(scores)
    if any(players[index].affinity(role) == 0 for role, index in zip(roles, assigned)):
        best_key = (sum(players[index].affinity(role) > 0 for role, index in zip(roles, assigned)),
                    sum(scores[row][index] for row, index in enumerate(assigned)))
        for name, other in formations.items():
            if name == formation: continue
            candidate_roles = [Position(role) for role in other][:len(players)]
            candidate_scores = [[overall(player.attributes, role, cfg) * state_multiplier(player, role, cfg)
                                 for player in players] for role in candidate_roles]
            candidate_assignment = maximize_assignment(candidate_scores)
            key = (sum(players[index].affinity(role) > 0 for role, index in zip(candidate_roles, candidate_assignment)),
                   sum(candidate_scores[row][index] for row, index in enumerate(candidate_assignment)))
            if key > best_key:
                formation, roles, scores, assigned, best_key = name, candidate_roles, candidate_scores, candidate_assignment, key
    slots = [LineupSlot(players[index], role) for role, index in zip(roles, assigned)]
    # Rotation is evaluated without ever selecting the same replacement twice.
    chosen = {slot.player.id for slot in slots}
    rotation = cfg.management.selection
    for index, slot in enumerate(slots):
        if slot.player.fitness >= rotation.rotation_fitness:
            continue
        alternatives = [player for player in players if player.id not in chosen
                        and player.fitness > slot.player.fitness
                        and overall(player.attributes, slot.position, cfg) >= overall(slot.player.attributes, slot.position, cfg) - rotation.rotation_gap]
        if alternatives:
            replacement = max(alternatives, key=lambda player: (overall(player.attributes, slot.position, cfg)
                                                               * state_multiplier(player, slot.position, cfg), -player.id))
            chosen.remove(slot.player.id)
            chosen.add(replacement.id)
            slots[index] = LineupSlot(replacement, slot.position)
    priorities = playing_time_priorities(context.players, context.club, context.date,
                                        context.seed, context.games_played, cfg)
    remaining = sorted((player for player in players if player.id not in chosen), key=lambda player: (-player.rating * player.fitness, player.id))
    keepers = [player for player in remaining if player.position == Position.GOALKEEPER][:1]
    bench = keepers[:cfg.world.match_rules.bench_size]
    candidates = [player for player in remaining if player.position != Position.GOALKEEPER]
    outfield_roles = set(slot.position for slot in slots if slot.position != Position.GOALKEEPER)
    covered = set()
    rules = cfg.states.substitutions
    while candidates and len(bench) < cfg.world.match_rules.bench_size:
        options = []
        for role in sorted(outfield_roles):
            suitable = [p for p in candidates if p.affinity(role) >= rules.rotation_min_affinity]
            if not suitable:
                continue
            quality = {p.id: overall(p.attributes, role, cfg) * state_multiplier(p, role, cfg) for p in suitable}
            best = max(quality.values())
            for player in suitable:
                if quality[player.id] < best - rules.replacement_gap:
                    continue
                score = quality[player.id] + rotation_bonus(priorities[player.id], cfg)
                if role not in covered:
                    score += rules.replacement_gap
                options.append((score, -player.id, role, player))
        if not options:
            break
        _, _, role, player = max(options, key=lambda option: option[:3])
        bench.append(player)
        candidates.remove(player)
        covered.add(role)
    return Lineup(context.club.id, formation, slots, bench, playing_time=priorities)
