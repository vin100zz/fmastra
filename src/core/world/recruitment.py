"""The human club's recruitment cell: at each position of its squad, the players it could sign and would gain by; read only.

It reasons as an AI club does when it plans a window (`core.ai.market.recruitment_plan`, `needs_for`, `quality_with`), with
what the human club may know: the players' levels and potentials as it estimates them (`core.world.estimates`), their
attributes, which every screen shows, and the prices and wages it would be asked. A lead is a player who accepts to join
the club, whose club would let him go, and whom the club can pay out of its free transfer budget and under its wage cap.

- Present: the players who raise the squad's weighted quality by at least the minimum an AI club recruits for, the most
  first; a veteran's gain fades with each year past `age_apport_plein`, since he will not hold it for long.
- Future: the young players whose potential the club reads well above both its target level and their own level, as an
  AI club looks for a prospect, the surest first (the bottom of the band, then its middle).
"""
from __future__ import annotations

from dataclasses import dataclass

from core.ai import market
from core.domain.clubs import Club
from core.domain.offers import RESERVING_STAGES
from core.domain.players import Player, Position
from core.domain.world import World
from core.math import clamp
from . import talks
from .estimates import estimate_level, estimate_potential
from .transfer_rules import accepts_move, recent_arrival_ids, target_level

STARTER, ROTATION, BACKUP = "titulaire", "rotation", "doublure"


@dataclass(frozen=True, slots=True)
class Lead:
    """A player the cell points to: what his club asks (0 for a free agent), the weekly wage he asks the club, what he
    would bring (`score`: the weighted gain to the squad today, his potential as the club reads it for later), the place
    he would take in the squad and the player he would take it from."""
    player_id: int
    fee: int
    wage: int
    score: float
    place: str | None = None
    replaces: int | None = None


@dataclass(frozen=True, slots=True)
class PositionLeads:
    """A position of the squad: how far it falls short of the club's target (`need`, in weighted points), the club's
    player there (its starter today, its best young player for later), and the leads."""
    position: Position
    need: float
    holder_id: int | None
    leads: tuple[Lead, ...]


@dataclass(frozen=True, slots=True)
class Recruitment:
    positions: tuple[PositionLeads, ...]
    surplus: tuple[int, ...]
    money: int
    wages: int


def longevity(age: int, cfg) -> float:
    """The share of a player's gain the cell counts: whole up to `age_apport_plein`, less each year past it."""
    rules = cfg.management.market.recruitment
    return clamp(1 - rules.yearly_fade * max(0, age - rules.full_value_age), rules.minimum_share, 1.0)


def tier(place: int | None, cfg) -> str | None:
    """The kind of a place in the squad profile (see `core.ai.market.squad_roles`): eleven starters, then rotation and backups."""
    if place is None: return None
    starters = cfg.world.match_rules.players_on_pitch
    return STARTER if place < starters else ROTATION if place < starters + cfg.management.target_profile.rotation_places else BACKUP


def recruitment(world: World, future: bool = False, free_agents: bool = False) -> Recruitment:
    """What the human club's cell recommends today, position by position; `free_agents` keeps only players without a club."""
    cfg = world.config
    club = world.clubs[world.controlled_club_id]
    rules = cfg.management.market.recruitment
    pending = [offer for offer in world.offers.values() if offer.target_id == club.id]
    plan = market.recruitment_plan(world, club, pending, len(pending) + 1, set())
    squad = [world.players[pid] for pid in club.player_ids]
    needs = market.needs_for(club, plan.projected, cfg)
    # No one the club cannot approach: on loan, just arrived, already agreed with a club, or with talks broken off.
    blocked = recent_arrival_ids(world) | {offer.player_id for offer in world.offers.values() if offer.stage in RESERVING_STAGES}
    blocked |= {pid for pid, until in world.talks_closed.items() if until > world.date}
    level = lambda player: estimate_level(player, world.date, world.seed, cfg, club.id, club.reputation).center
    pool = [player for player in world.players.values()
            if club.id not in (player.club_id, player.owner_id) and player.loan is None and player.id not in blocked
            and (not free_agents or player.club_id is None)]
    quotes: dict[int, tuple[int, int] | None] = {}

    def terms(player: Player) -> tuple[int, int] | None:
        """The fee and weekly wage the club would pay, if he would come, his club would let him go and the club can pay."""
        if player.id not in quotes:
            quotes[player.id] = None
            seller = world.clubs.get(player.club_id) if player.club_id is not None else None
            if accepts_move(player, club, world) and (wage := talks.asked_wage(world, player)) <= plan.wages:
                if seller is None: quotes[player.id] = (0, wage)
                elif market.can_sell(player, seller, world) and (fee := market.asking_price(player, seller, world)) <= plan.money:
                    quotes[player.id] = (fee, wage)
        return quotes[player.id]

    if future:
        positions = _future(world, club, squad, needs, pool, terms, level)
    else:
        positions = _present(world, club, squad, plan, needs, pool, terms, level)
    places = market.squad_places(squad, club, cfg)
    surplus = sorted((player for player in squad if player.id not in places), key=lambda player: (level(player), player.id))
    return Recruitment(positions, tuple(player.id for player in surplus[:rules.surplus_shown]), max(0, plan.money), max(0, plan.wages))


def _present(world, club: Club, squad, plan, needs, pool, terms, level) -> tuple[PositionLeads, ...]:
    cfg = world.config
    rules = cfg.management.market.recruitment
    floor = target_level(club, cfg) - 2 * cfg.management.target_profile.backup_discount
    seen = {player.id: level(player) for player in pool}
    roles = market.squad_place_roles(squad, club, cfg)
    before = {pid: tier(place, cfg) for pid, (place, _) in roles.items()}
    rank = {STARTER: 3, ROTATION: 2, BACKUP: 1, None: 0}
    found = []
    for need in needs:
        weighed = []
        candidates = sorted((player for player in pool if player.position == need.position and seen[player.id] >= floor),
                            key=lambda player: (-seen[player.id], player.id))
        for player in candidates:
            if len(weighed) >= rules.candidates_per_position: break
            if (quote := terms(player)) is None: continue
            gain = market.quality_with(plan.projected, player, club, cfg, plan.scores) - plan.quality
            weighed.append(player)
            if gain >= cfg.management.market.minimum_quality_gain:
                found.append((need, player, quote, gain * longevity(player.born.age_on(world.date), cfg)))
    leads: dict[Position, list[Lead]] = {need.position: [] for need in needs}
    for need, player, (fee, wage), score in sorted(found, key=lambda row: (-row[3], row[1].id)):
        shown = leads[need.position]
        if len(shown) >= rules.leads_per_position: continue
        after = market.squad_place_roles([*squad, player], club, cfg)
        taken = after.get(player.id)
        place = tier(taken[0], cfg) if taken else None
        # The player he would take his place from: one who held a place of that position and kind, and holds it no more.
        replaces = None
        if taken:
            held = [pid for pid, (spot, role) in sorted(roles.items(), key=lambda row: row[1][0]) if role == taken[1] and before[pid] == place]
            replaces = next((pid for pid in held if pid not in after or after[pid][1] != taken[1]
                             or rank[tier(after[pid][0], cfg)] < rank[place]), None)
        shown.append(Lead(player.id, fee, wage, round(score, 2), place, replaces))
    holders = {}
    for pid, (place, role) in sorted(roles.items(), key=lambda row: row[1][0]):
        if tier(place, cfg) == STARTER: holders.setdefault(role, pid)
    for player in sorted(squad, key=lambda player: (-level(player), player.id)):
        holders.setdefault(player.position, player.id)
    return tuple(PositionLeads(need.position, round(need.gap, 2), holders.get(need.position), tuple(leads[need.position])) for need in needs)


def _future(world, club: Club, squad, needs, pool, terms, level) -> tuple[PositionLeads, ...]:
    cfg = world.config
    rules = cfg.management.market.recruitment
    margin = cfg.management.market.prospect_margin
    aim = target_level(club, cfg) + margin
    read = lambda player: estimate_potential(player, world.date, world.seed, cfg, club.id, club.reputation)
    youth = {}
    for player in pool:
        if player.born.age_on(world.date) > cfg.management.market.scouting.prospect_max_age: continue
        potential = read(player)
        if potential.center >= aim and potential.center - level(player) >= margin:
            youth.setdefault(player.position, []).append((potential, player))
    positions = []
    for need in needs:
        shown = []
        for potential, player in sorted(youth.get(need.position, []), key=lambda row: (-row[0].lower, -row[0].center, row[1].id)):
            if len(shown) >= rules.leads_per_position: break
            if (quote := terms(player)) is not None: shown.append(Lead(player.id, *quote, round(potential.center, 2)))
        own = [player for player in squad if player.position == need.position and player.born.age_on(world.date) <= rules.own_prospect_max_age]
        best = max(own, key=lambda player: (read(player).center, -player.id), default=None)
        positions.append(PositionLeads(need.position, round(need.gap, 2), best.id if best else None, tuple(shown)))
    return tuple(positions)
