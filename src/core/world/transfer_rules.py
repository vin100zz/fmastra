"""Player willingness to move, based on actual arrivals rather than renewals."""
from core.domain.clubs import Club
from core.domain.players import Player
from core.domain.world import World


def recent_arrival_ids(world: World) -> set[int]:
    """Players who refuse another move during their initial settling-in period.

    Use the durable movement history so existing saves benefit immediately.
    Imported contract signature dates are synthetic and must not freeze the
    initial market. Free agents remain free to sign after a contract ends.
    """
    today = world.date.ordinal()
    cutoff = today - world.config.management.market.arrival_stability_days
    recent, seen = set(), set()
    # Movements are appended chronologically (and sorted by legacy migration).
    # Only scan the recent tail, so long careers do not slow every market day.
    for move in reversed(world.transfers):
        date = move.date.ordinal()
        if date <= cutoff: break
        if date > today or move.player_id in seen: continue
        seen.add(move.player_id)
        player = world.players.get(move.player_id)
        if (move.kind == "transfer" and move.target_id is not None
                and player is not None and player.club_id == move.target_id):
            recent.add(player.id)
    return recent


def accepts_move(player: Player, target: Club, world: World) -> bool:
    """A player who would lower their standing refuses, unless desperate to leave.

    Stepping down means a club whose reputation is clearly lower than the current
    club's *and* whose target level (the same profile clubs use to size their
    ambitions) is below the player's own rating: such a club is beneath them. A
    club at or near their level, a lateral move or a step up is always acceptable,
    and so is any club for a free agent. Only very low morale overrides a refusal.
    """
    source = world.clubs.get(player.club_id) if player.club_id is not None else None
    if source is None or source.id == target.id: return True
    rules, profile = world.config.management.market, world.config.management.target_profile
    if source.reputation - target.reputation <= rules.reputation_drop_tolerance: return True
    target_level = profile.base_level + profile.reputation_weight * target.reputation
    if player.rating <= target_level + rules.player_level_margin: return True
    return player.morale <= rules.forced_exit_morale
