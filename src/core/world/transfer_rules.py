"""Player willingness to move, based on actual arrivals rather than renewals."""
from core.config.model import Config
from core.domain.clubs import Club
from core.domain.date import Date
from core.domain.players import Player
from core.domain.world import World
from core.math import clamp, interpolate
from core.randomness import stream
from .human import on_sale


def greed_trait(loyalty: float | None, cfg: Config, seed: int, player_id: int) -> float:
    """Appetite for money over sport in [0, 1]: the less loyal the source player, the greedier.

    Without a source note the value is drawn, peaked at the neutral 0.5, from a stream of its own."""
    rules = cfg.management.contracts
    if loyalty is None: return stream(seed, "greed", player_id).triangular(0.0, 1.0, 0.5)
    return interpolate(((rules.greed_source_low, 1.0), (rules.greed_source_reference, 0.5), (rules.greed_source_high, 0.0)), loyalty)


def free_to_move_on(world: World, player_id: int) -> Date:
    """The first day a player who arrived recently (see `recent_arrival_ids`) may move again."""
    arrival = next(move.date for move in reversed(world.transfers) if move.player_id == player_id)
    return arrival.add_days(world.config.management.market.arrival_stability_days)


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


def season_arrivals(world: World, club_id: int | None = None) -> dict[int, tuple[int, float]]:
    """Players who joined their club during the season: the matches it has played since, and their minutes in them.

    The matches a club played before a player came were never his to play, and the minutes of a season follow him from
    club to club: neither says how much he plays where he is now. `club_id` keeps one club's players only.
    """
    arrived, seen = {}, set()
    # Movements are appended chronologically: those of this season are the tail.
    for move in reversed(world.transfers):
        if move.season != world.season: break
        if move.player_id in seen: continue
        seen.add(move.player_id)
        player = world.players.get(move.player_id)
        if player is None or move.target_id is None or player.club_id != move.target_id: continue
        if club_id is None or move.target_id == club_id: arrived[player.id] = move.date
    if not arrived: return {}
    played = {world.players[pid].club_id: [] for pid in arrived}
    for match in world.matches.values():
        if match.result is None or match.season != world.season: continue
        for side in (match.home_id, match.away_id):
            if side in played: played[side].append(match)
    arrivals = {}
    for pid, date in arrived.items():
        since = [match.result for match in played[world.players[pid].club_id] if match.date > date]
        arrivals[pid] = (len(since), sum(result.player_stats[pid].minutes for result in since if pid in result.player_stats))
    return arrivals


def target_level(club: Club, cfg: Config) -> float:
    """The level a club aims at, the same profile clubs use to size their ambitions."""
    profile = cfg.management.target_profile
    return profile.base_level + profile.reputation_weight * club.reputation


def outgrown_by(player: Player, club: Club, cfg: Config) -> float:
    """Points by which a player exceeds his club's target level beyond the tolerated margin.

    Zero for a player the club can still hold. Above zero the club is beneath him:
    it can no longer count on keeping him, only sell him well (see `can_sell`),
    and he grows restless (see `frustration`).
    """
    return max(0.0, player.rating - target_level(club, cfg) - cfg.management.market.club_outgrown_margin)


def frustration(player: Player, world: World) -> float:
    """Restlessness in [0, 1] of a player whose club is beneath him.

    The overshoot beyond the tolerated margin, as a share of `frustration_span`,
    scaled by his ambition. Ambition has a floor, so even a modest character
    resents being by far the best player of a small club; ego raises it.
    """
    club = world.clubs.get(player.club_id) if player.club_id is not None else None
    # A player on loan knows the club he was lent to is a step, not his place.
    if club is None or player.loan is not None: return 0.0
    rules = world.config.management.market
    ambition = clamp(rules.ambition_base + rules.ambition_ego_weight * player.ego, 0, 1)
    return ambition * clamp(outgrown_by(player, club, world.config) / rules.frustration_span, 0, 1)


def wants_to_leave(player: Player, world: World) -> bool:
    """A restless player refuses to renew and accepts only a clearly bigger club."""
    return frustration(player, world) >= world.config.management.market.leave_threshold


def accepts_move(player: Player, target: Club, world: World) -> bool:
    """A player who would lower their standing refuses, unless desperate to leave.

    Stepping down means a club whose reputation is clearly lower than the current
    club's *and* whose target level (the same profile clubs use to size their
    ambitions) is below the player's own rating: such a club is beneath them. A
    club at or near their level, a lateral move or a step up is always acceptable,
    and so is any club for a free agent. Only very low morale overrides a refusal.

    A player who wants to leave because his club is beneath him is the exception
    on both counts: he is not looking for a lateral move, so only a club whose
    reputation is higher by more than the same tolerance band is an escape, and no
    morale makes him accept a smaller one.

    A player the human club put up for sale (see `on_sale`) knows he is no longer
    wanted: he accepts a drop in reputation up to `sale_drop_tolerance` instead.
    """
    source = world.clubs.get(player.club_id) if player.club_id is not None else None
    if source is None or source.id == target.id: return True
    rules = world.config.management.market
    if wants_to_leave(player, world):
        return target.reputation - source.reputation > rules.reputation_drop_tolerance
    tolerance = rules.sale_drop_tolerance if on_sale(world, player.id) else rules.reputation_drop_tolerance
    if source.reputation - target.reputation <= tolerance: return True
    if player.rating <= target_level(target, world.config) + rules.player_level_margin: return True
    return player.morale <= rules.forced_exit_morale
