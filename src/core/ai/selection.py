"""Lineup and bench decisions with unique player assignments."""
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from core.config.model import Config
from core.domain.clubs import Club
from core.domain.date import Date
from core.domain.matches import Lineup, LineupSlot, SubmittedLineup
from core.domain.players import Player, Position
from core.engine.abilities import overall, state_multiplier
from .assignment import maximize_assignment
from .playing_time import playing_time_priorities, rotation_bonus

if TYPE_CHECKING:
    from core.domain.world import World

# The human club's own tactic, built on the Composition pitch: a lineup submitted under this name plays its positions.
CUSTOM_FORMATION = "Perso"
# The lines of that pitch from the goal forward, each five columns wide; a place of the tactic is a cell of this grid.
CUSTOM_LINES = ("gk", "def", "dm", "cm", "am", "att")
CUSTOM_COLUMNS = 5


@dataclass(frozen=True, slots=True)
class LineupContext:
    club: Club
    players: list[Player]
    competition_id: int
    date: Date
    seed: int = 0
    games_played: int = 0
    # Players who joined during the season, see `season_arrivals`.
    arrivals: dict[int, tuple[int, float]] = field(default_factory=dict)

    @classmethod
    def from_world(cls, world: "World", club_id: int, competition_id: int, date: Date) -> "LineupContext":
        from core.world.transfer_rules import season_arrivals
        club = world.clubs[club_id]
        games = sum(match.result is not None and match.season == world.season
                    and club_id in (match.home_id, match.away_id) for match in world.matches.values())
        called_up = {pid for camp in world.international.camps.values() for pid in camp.player_ids}
        # Neither the players away with their national team nor those of the reserve.
        return cls(club, [player for pid in club.player_ids if pid not in called_up and (player := world.players[pid]).reserve_since is None],
                   competition_id, date, world.seed, games,
                   season_arrivals(world, club_id))


def select_lineup(context: LineupContext, cfg: Config, formation: str | None = None,
                  positions: Sequence[str] | None = None) -> Lineup:
    """Best eleven and bench; a given `formation`, or the `positions` of the club's own tactic, is kept as is,
    otherwise the club's formation may give way to a better-suited one."""
    forced = formation is not None or positions is not None
    players = sorted((player for player in context.players if player.available(context.competition_id, context.date)),
                     key=lambda player: player.id)
    formations = cfg.formations.formations
    formation = formation or (CUSTOM_FORMATION if positions is not None else context.club.formation)
    source = formations[formation] if positions is None else positions
    if len(players) < cfg.world.match_rules.players_on_pitch:
        # Preserve the keeper slot and strongest available outfield coverage.
        roles = [Position(role) for role in source][:len(players)]
    else:
        roles = [Position(role) for role in source]
    if not roles:
        return Lineup(context.club.id, formation, [], [])
    scores = [[overall(player.attributes, role, cfg) * state_multiplier(player, role, cfg)
               for player in players] for role in roles]
    assigned = maximize_assignment(scores)
    if not forced and any(players[index].affinity(role) == 0 for role, index in zip(roles, assigned)):
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
                                        context.seed, context.games_played, cfg, context.arrivals)
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


def validate_custom_formation(places: Sequence[tuple[str, str, int]], cfg: Config) -> None:
    """The club's own tactic, as (position, line, column) places: one for each player on the pitch, a single keeper,
    and never two places on the same cell. Raises ValueError on the first violation found."""
    if len(places) != cfg.world.match_rules.players_on_pitch:
        raise ValueError("La tactique doit placer chaque joueur sur le terrain.")
    if any(position not in {item.value for item in Position} for position, _, _ in places):
        raise ValueError("Poste inconnu.")
    if sum(position == Position.GOALKEEPER for position, _, _ in places) != 1:
        raise ValueError("La tactique doit compter un gardien.")
    cells = [(line, column) for _, line, column in places]
    if any(line not in CUSTOM_LINES or not 0 <= column < CUSTOM_COLUMNS for line, column in cells) or len(set(cells)) != len(cells):
        raise ValueError("Placement invalide sur le terrain.")


def validate_lineup(context: LineupContext, lineup: SubmittedLineup, cfg: Config, custom: Sequence[str] = ()) -> None:
    """Legality checks for a human-submitted lineup; raises ValueError on the first violation found.
    `custom` lists the positions of the club's own tactic, played under CUSTOM_FORMATION."""
    roles = custom if lineup.formation == CUSTOM_FORMATION and custom else cfg.formations.formations.get(lineup.formation)
    if roles is None:
        raise ValueError("Tactique inconnue.")
    available = {player.id: player for player in context.players if player.available(context.competition_id, context.date)}
    slot_ids = [player_id for player_id, _ in lineup.slots]
    chosen = slot_ids + lineup.bench
    if len(chosen) != len(set(chosen)):
        raise ValueError("Un joueur ne peut occuper qu'une seule place.")
    missing = [pid for pid in chosen if pid not in available]
    if missing:
        raise ValueError("Joueur indisponible ou hors effectif.")
    expected = min(len(roles), len(available))
    if len(slot_ids) != expected:
        raise ValueError("Nombre de titulaires incompatible avec la formation et l'effectif disponible.")
    if Counter(position for _, position in lineup.slots) - Counter(roles):
        raise ValueError("Postes incompatibles avec la tactique.")
    if len(lineup.bench) > cfg.world.match_rules.bench_size:
        raise ValueError("Le banc dépasse la taille autorisée.")


def to_lineup(world: "World", submitted: SubmittedLineup, competition_id: int, cfg: Config) -> Lineup:
    """Reconstructs a transient Lineup from ids, with the same playing-time priorities an AI selection would carry."""
    context = LineupContext.from_world(world, submitted.club_id, competition_id, world.date)
    slots = [LineupSlot(world.players[player_id], Position(position)) for player_id, position in submitted.slots]
    bench = [world.players[player_id] for player_id in submitted.bench]
    priorities = playing_time_priorities(context.players, context.club, context.date, context.seed, context.games_played, cfg, context.arrivals)
    return Lineup(submitted.club_id, submitted.formation, slots, bench, playing_time=priorities)
