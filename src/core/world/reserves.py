"""A club's reserve: players set apart from its first team to develop without playing its matches.

A player in the reserve is selected for no match of his club. Each month he progresses as if he had played part of
the minutes of reference (see `core.world.player_states`), less and less as his level nears the one his club aims at.
He stays in the squad and on the wage bill. A young player who is not a starter accepts it; any other one resents
playing no match at all (see `core.world.contracts.contentment`).
"""
from __future__ import annotations

from core.config.model import Config
from core.domain.clubs import Club
from core.domain.date import Date
from core.domain.players import Player, Position
from core.domain.world import World
from core.math import clamp
from .application import apply
from .estimates import estimate_potential
from .events import ReserveChanged
from .human import is_human_club
from .transfer_rules import target_level


class ReserveRefused(ValueError):
    """A move between the first team and the reserve the human club cannot make, with the reason shown to the user."""


def in_reserve(player: Player) -> bool:
    return player.reserve_since is not None


def starters_at(club: Club, position: Position, cfg: Config) -> int:
    """The places the club's formation gives a position."""
    return sum(role == position for role in cfg.formations.formations[club.formation])


def depth_rank(world: World, club: Club, player: Player, healthy: bool = False) -> int:
    """The first-team players of a club ahead of a player at his position, 0 when he is (or would be) its best there.

    `healthy` leaves the injured ones aside: what the club can field today."""
    ahead = 0
    for pid in club.player_ids:
        other = world.players[pid]
        if pid == player.id or other.position != player.position or in_reserve(other): continue
        if healthy and other.injury is not None: continue
        ahead += (-other.rating, other.id) < (-player.rating, player.id)
    return ahead


def accepts_reserve(player: Player, club: Club, rank: int, world: World) -> bool:
    """A young player who would not start for his club takes the reserve as a step; `rank` is his `depth_rank`."""
    cfg = world.config
    return (player.born.age_on(world.date) <= cfg.demography.progression.reserve.max_age
            and rank >= starters_at(club, player.position, cfg))


def reserve_factor(player: Player, club: Club, cfg: Config) -> float:
    """The playing factor a whole month in the reserve is worth, fading out as his level nears the club's."""
    rules = cfg.demography.progression.reserve
    ceiling = target_level(club, cfg) - rules.level_margin
    return rules.factor * clamp((ceiling - player.rating) / rules.fade_span, 0, 1)


def reserve_days(player: Player, start: Date, today: Date) -> int:
    """The days he spent in the reserve since `start`, the first day of the month being measured."""
    days = player.reserve_days
    if player.reserve_since is not None:
        days += today.ordinal() - max(player.reserve_since, start).ordinal()
    return days


def first_team(world: World, club: Club) -> list[Player]:
    return [player for pid in club.player_ids if not in_reserve(player := world.players[pid])]


def keeps_first_team(world: World, club: Club, player: Player, leaving: int = 1) -> bool:
    """Whether the first team keeps its hard minimums once `leaving` players, this one among them, are out of it."""
    guard = world.config.management.guardrails
    team = first_team(world, club)
    if len(team) - leaving < guard.min_squad: return False
    keepers = sum(item.position == Position.GOALKEEPER for item in team)
    return player.position != Position.GOALKEEPER or keepers - 1 >= guard.min_goalkeepers


def surplus_prospects(world: World, club: Club) -> list[Player]:
    """The young players an AI club develops away from its first team: far from the potential it sees in them, and
    neither starters nor first substitutes at their position among its healthy players."""
    cfg = world.config
    rules = cfg.management.market.loans
    prospects = []
    for pid in club.player_ids:
        player = world.players[pid]
        if player.loan is not None or player.born.age_on(world.date) > rules.max_age: continue
        estimate = estimate_potential(player, world.date, world.seed, cfg, club.id, club.reputation)
        if estimate.center - player.rating < rules.potential_margin: continue
        if depth_rank(world, club, player, healthy=True) <= starters_at(club, player.position, cfg): continue
        prospects.append(player)
    return prospects


def reserve_events(world: World) -> list[ReserveChanged]:
    """Each week every AI club reviews its reserve: the prospects it helps go there, weakest first, as long as the
    first team keeps its minimums; anyone else comes back."""
    events = []
    growth = world.config.demography.progression
    for club in world.active_clubs():
        if is_human_club(world, club.id): continue
        current = {pid for pid in club.player_ids if in_reserve(world.players[pid])}
        # The review starts from a full first team: the minimums are counted without the players it sends back.
        guard = world.config.management.guardrails
        size = len(club.player_ids)
        keepers = sum(world.players[pid].position == Position.GOALKEEPER for pid in club.player_ids)
        wanted = set()
        for player in sorted(surplus_prospects(world, club), key=lambda item: (item.rating, item.id)):
            if reserve_factor(player, club, world.config) <= playing_floor(club, world.config): continue
            keeper = player.position == Position.GOALKEEPER
            if size - 1 < guard.min_squad or keeper and keepers - 1 < guard.min_goalkeepers: continue
            wanted.add(player.id)
            size -= 1
            keepers -= keeper
        events.extend(ReserveChanged(pid, pid in wanted) for pid in sorted(wanted ^ current))
    return events


def playing_floor(club: Club, cfg: Config) -> float:
    """The playing factor of a player who neither played nor trained with the reserve: the better the club's training, the higher."""
    rules = cfg.demography.progression
    if club.training_facilities is None: return rules.min_playing_factor
    return rules.training_floor.lowest + (rules.training_floor.highest - rules.training_floor.lowest) * (club.training_facilities - 1) / 19


def reserve_obstacle(world: World, player: Player) -> str | None:
    """Why the human club cannot send this player to its reserve, or None."""
    if not is_human_club(world, player.club_id): return "Ce joueur n'est pas dans votre effectif."
    if player.loan is not None: return "Un joueur prêté ne peut pas être placé en réserve."
    if in_reserve(player): return "Ce joueur est déjà en réserve."
    guard = world.config.management.guardrails
    if not keeps_first_team(world, world.clubs[player.club_id], player):
        return f"Votre équipe première doit garder {guard.min_squad} joueurs, dont {guard.min_goalkeepers} gardiens."
    return None


def set_reserve(world: World, player: Player, reserve: bool) -> None:
    """Sends a player of the human club to its reserve, or calls him back to the first team."""
    if reserve:
        if (obstacle := reserve_obstacle(world, player)) is not None: raise ReserveRefused(obstacle)
    elif not is_human_club(world, player.club_id) or not in_reserve(player):
        raise ReserveRefused("Ce joueur n'est pas dans votre réserve.")
    apply(world, ReserveChanged(player.id, reserve))
