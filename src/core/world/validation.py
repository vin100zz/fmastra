"""World invariants checked after import, save load and long simulations."""
from math import isfinite

from core.domain.world import World
from core.engine.abilities import overall


def validate_world(world: World) -> None:
    cfg = world.config
    seen: set[int] = set()
    bounds, guard = cfg.attributes.bounds, cfg.management.guardrails
    for club_id, club in world.clubs.items():
        if any(value is not None and not 1 <= value <= 20 for value in (club.training_facilities, club.youth_recruitment)):
            raise ValueError("Invalid club facility rating")
        if club.id != club_id or len(club.player_ids) != len(set(club.player_ids)):
            raise ValueError("Invalid club or duplicate squad membership")
        if len(club.player_ids) > guard.max_squad:
            raise ValueError(f"{club.name}: overfull squad")
        wages = 0
        for player_id in club.player_ids:
            if player_id in seen or player_id not in world.players:
                raise ValueError("A player belongs to multiple clubs or is missing")
            player = world.players[player_id]
            if player.club_id != club_id or player.contract is None:
                raise ValueError("Player/club/contract mismatch")
            wages += player.contract.weekly_wage
            seen.add(player_id)
        if wages != club.wage_bill or wages > club.wage_cap:
            raise ValueError(f"{club.name}: invalid wage ledger")
    for player_id, player in world.players.items():
        if any(not 1 <= value <= 20 for value in player.position_ratings.values()):
            raise ValueError("Invalid position rating")
        if player.source_current_ability is not None:
            if player.source_potential_ability is None or not 1 <= player.source_current_ability <= player.source_potential_ability <= 200:
                raise ValueError("Invalid imported current/potential ability")
        if player.id != player_id:
            raise ValueError("Player identifier mismatch")
        if player.club_id is None:
            if player.contract is not None: raise ValueError("A free agent cannot have a contract")
        elif player_id not in seen:
            raise ValueError("Missing squad membership")
        if not all(isfinite(value) and bounds.min <= value <= bounds.max for value in player.attributes.values):
            raise ValueError("Attributes outside their bounds")
        if not isfinite(player.potential) or not bounds.min <= player.potential <= bounds.max:
            raise ValueError("Invalid potential")
        if abs(overall(player.attributes, player.position, cfg) - player.rating) > 1e-6 or player.rating > player.potential + 1e-6:
            raise ValueError("Inconsistent current player level")
        if player.contract and (player.contract.weekly_wage < 0 or player.contract.signed > player.contract.end):
            raise ValueError("Invalid contractual terms")
        if not cfg.states.fitness.min <= player.fitness <= cfg.states.fitness.max:
            raise ValueError("Invalid fitness")
    if set(world.players) & set(world.retired): raise ValueError("A retired player is still active")
    if world.next_id <= max((*world.players, *world.retired, *world.matches), default=0):
        raise ValueError("Next identifier would reuse an existing entity")
    for competition in world.competitions.values():
        if any(cid not in world.clubs or world.clubs[cid].competition_id != competition.id for cid in competition.club_ids):
            raise ValueError("Competition/club mismatch")
    for match in world.matches.values():
        if match.home_id == match.away_id or match.home_id not in world.clubs or match.away_id not in world.clubs:
            raise ValueError("Invalid fixture")
