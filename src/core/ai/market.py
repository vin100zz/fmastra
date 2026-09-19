"""Squad needs and simultaneous transfer proposals, using public estimates."""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from random import Random
from functools import lru_cache

from core.config.model import Config
from core.domain.clubs import Club
from core.domain.date import Date
from core.domain.players import Player, Position, Contract, ATTRIBUTE_INDEX
from core.domain.world import World
from core.engine.abilities import overall
from core.math import clamp
from core.world.estimates import estimate_potential
from core.world.events import PlayerSigned
from core.world.transfer_rules import recent_arrival_ids, accepts_move, outgrown_by
from core.world.importation.synthesis import intrinsic_value, expected_wage
from .assignment import maximize_assignment


@dataclass(frozen=True, slots=True)
class Need:
    position: Position
    gap: float


def nominal_size(cfg: Config) -> int:
    return cfg.world.match_rules.players_on_pitch + cfg.management.target_profile.rotation_places + cfg.management.target_profile.backup_places


def squad_roles(club: Club, cfg: Config) -> tuple[list[Position], list[float]]:
    positions = [Position(role) for role in cfg.formations.formations[club.formation]]
    weights = [cfg.management.utility.starter_weight] * len(positions)
    counts = Counter(positions)
    priority = sorted(counts, key=lambda position: (position != Position.GOALKEEPER, -counts[position], position.value))
    for count, weight in ((cfg.management.target_profile.rotation_places, cfg.management.utility.rotation_weight),
                          (cfg.management.target_profile.backup_places, cfg.management.utility.backup_weight)):
        for index in range(count):
            positions.append(priority[index % len(priority)])
            weights.append(weight)
    return positions, weights


def squad_depth(club: Club, cfg: Config) -> int:
    """Players a club treats as its useful squad, starters and rotation included.

    Rotation over a full season needs a deeper squad at big, rich clubs: reputation
    (which drives income) scales the depth between the configured bounds.
    """
    rules = cfg.management.market
    span = rules.max_depth_reputation - rules.min_depth_reputation
    share = clamp((club.reputation - rules.min_depth_reputation) / span, 0, 1) if span > 0 else 1
    return round(rules.min_squad_depth + share * (rules.max_squad_depth - rules.min_squad_depth))


def squad_quality(players: list[Player], club: Club, cfg: Config, deep: bool = False) -> float:
    """Weighted assignment score; `deep` weighs the whole useful squad heavily.

    Recruitment keeps the graded starter/rotation/backup weights. Retention must not:
    the club plays its rotation players all season, so every place among its
    `squad_depth` best weighs at least `depth_sale_weight`, not the low rotation weight.
    """
    roles, weights = squad_roles(club, cfg)
    if deep:
        depth = squad_depth(club, cfg)
        core = cfg.management.market.depth_sale_weight
        weights = [max(weight, core) if index < depth else weight for index, weight in enumerate(weights)]
    unique_roles = tuple(dict.fromkeys(roles))
    profiles = tuple((role, tuple((ATTRIBUTE_INDEX[key], value) for key, value in cfg.attributes.overall[role].items())) for role in unique_roles)
    signatures = tuple((player.attributes.values, player.position, tuple(player.secondary_positions.items())) for player in players)
    return _quality(signatures, tuple(roles), tuple(weights), profiles,
                    cfg.attributes.out_of_position.base, cfg.attributes.out_of_position.factor)


@lru_cache(maxsize=8192)
def _quality(players: tuple, roles: tuple, weights: tuple, profiles: tuple, base: float, factor: float) -> float:
    """Memoize immutable ability snapshots, never mutable Player or World objects."""
    qualities = {}
    for role, coefficients in profiles:
        qualities[role] = [sum(attributes[index] * weight for index, weight in coefficients)
                           * (base + factor * (1 if primary == role else dict(secondary).get(role, 0)))
                           for attributes, primary, secondary in players]
    scores = [[quality * weight for quality in qualities[role]] for role, weight in zip(roles, weights)]
    for row in scores: row.extend([0.0] * max(0, len(roles) - len(players)))
    assignment = maximize_assignment(scores)
    return sum(row[index] for row, index in zip(scores, assignment))


def needs_for(club: Club, players: list[Player], cfg: Config) -> list[Need]:
    roles, weights = squad_roles(club, cfg)
    penalty = cfg.attributes.out_of_position
    levels = [[overall(player.attributes, role, cfg) * (penalty.base + penalty.factor * player.affinity(role))
               for player in players] for role in roles]
    for row in levels: row.extend([0.0] * max(0, len(roles) - len(players)))
    assignment = maximize_assignment([[level * weight for level in row] for row, weight in zip(levels, weights)])
    target = cfg.management.target_profile.base_level + club.reputation * cfg.management.target_profile.reputation_weight
    gaps = {}
    for index, (position, weight, assigned) in enumerate(zip(roles, weights, assignment)):
        discount = (0 if index < cfg.world.match_rules.players_on_pitch else
                    cfg.management.target_profile.rotation_discount if index < cfg.world.match_rules.players_on_pitch + cfg.management.target_profile.rotation_places
                    else cfg.management.target_profile.backup_discount)
        gap = (target - discount - levels[index][assigned]) * weight
        gaps[position] = max(gaps.get(position, float("-inf")), gap)
    if sum(player.position == Position.GOALKEEPER for player in players) < cfg.management.guardrails.min_goalkeepers:
        gaps[Position.GOALKEEPER] = cfg.attributes.bounds.max
    return sorted((Need(position, gap) for position, gap in gaps.items()), key=lambda item: (-item.gap, item.position.value))


def market_value(player: Player, world: World, observer: Club | None = None, discounted: bool = True) -> int:
    cfg = world.config
    estimate = estimate_potential(player, world.date, world.seed, cfg, observer.id if observer else None,
                                  observer.reputation if observer else None)
    level = max(player.rating, estimate.center * cfg.management.valuation.potential_weight)
    value = intrinsic_value(level, player.born.age_on(world.date), player.position, cfg)
    if discounted:
        if player.contract is None: return 0
        months = world.date.months_until(player.contract.end)
        for row in cfg.management.valuation.contract_discount:
            if months < row.max_months:
                return round(value * row.factor)
    return value


def contract_for(player: Player, world: World, wage: int) -> Contract:
    rows = world.config.management.contracts.duration_by_age
    age = player.born.age_on(world.date)
    years = next((row.years for row in rows if age <= row.max_age), rows[-1].years)
    release = world.config.world.key_dates.contract_release
    end = Date(world.date.year + years, release.month, release.day).add_days(-1)
    return Contract(wage, end, world.date, synthetic=False)


def asking_price(player: Player, seller: Club, world: World) -> int:
    """One quoted price for buyers and sellers, including replacement cost."""
    cfg = world.config
    if seller.competition_id is None:
        return round(market_value(player, world, seller) * cfg.management.market.dormant_clubs.asking_multiplier)
    surplus = len(seller.player_ids) > nominal_size(cfg)
    rules = cfg.management.market
    threshold = market_value(player, world, seller) * (rules.seller_multiplier - rules.surplus_discount * surplus)
    threshold *= 1 + rules.patience_weight * seller.personality.negotiation_patience
    squad = [world.players[pid] for pid in seller.player_ids]
    quality = squad_quality(squad, seller, cfg)
    departure_cost = quality - squad_quality([item for item in squad if item.id != player.id], seller, cfg)
    return round(threshold * (1 + max(0, departure_cost) / max(1, quality)))


def can_sell(player: Player, seller: Club, world: World) -> bool:
    if seller.competition_id is None: return True
    cfg = world.config
    guard = cfg.management.guardrails
    if len(seller.player_ids) <= guard.min_squad: return False
    if player.position == Position.GOALKEEPER and sum(
        world.players[pid].position == Position.GOALKEEPER for pid in seller.player_ids) <= guard.min_goalkeepers: return False
    # A player far above what the club aims at cannot be kept as cover: he is an asset
    # sold at his price, which funds a replacement. Without this, the better the player,
    # the wider the gap to his replacement, and the best players of small clubs would
    # be unsellable for good. The asking price still applies in `seller_accepts`.
    if outgrown_by(player, seller, cfg) > 0: return True
    squad = [world.players[pid] for pid in seller.player_ids]
    loss = (squad_quality(squad, seller, cfg, deep=True)
            - squad_quality([p for p in squad if p.id != player.id], seller, cfg, deep=True))
    # A player of the useful squad (starters and rotation, see squad_depth) must be
    # adequately covered before being sold, even in a squad above nominal size: a
    # surplus of backups elsewhere must not let the best player at an uncovered
    # position leave, nor a rotation player who plays all season.
    if loss > player.rating * cfg.management.utility.backup_weight + 1e-9: return False
    return True


def seller_accepts(player: Player, seller: Club, fee: int, world: World, rng: Random) -> bool:
    if not can_sell(player, seller, world) or fee < asking_price(player, seller, world): return False
    return seller.competition_id is not None or rng.random() < world.config.management.market.dormant_clubs.acceptance_probability


def player_offer_score(player: Player, target: Club, wage: int, world: World) -> float:
    cfg = world.config
    weights = cfg.management.market.player_score
    expected = expected_wage(market_value(player, world, target, False), cfg)
    salary = min(wage / expected, cfg.management.budgets.wages.max_offer_ratio) / cfg.management.budgets.wages.max_offer_ratio
    others = [world.players[pid] for pid in target.player_ids if world.players[pid].position == player.position and pid != player.id]
    minutes = 1 / (1 + sum(other.rating > player.rating for other in others))
    reputation = target.reputation / cfg.attributes.bounds.max
    ambition = clamp((cfg.management.target_profile.base_level + cfg.management.target_profile.reputation_weight * target.reputation) / cfg.attributes.bounds.max, 0, 1)
    return weights.wage_weight * salary + weights.playing_time_weight * minutes + weights.reputation_weight * reputation + weights.ambition_weight * ambition


def recruitment_wage(player: Player, club: Club, world: World) -> int:
    expected = expected_wage(market_value(player, world, club, False), world.config)
    return max(expected, player.contract.weekly_wage if player.contract else 0)


def propose_transfers(world: World, rng: Random, emergency: bool = False,
                      rejected: dict[int, set[int]] | None = None) -> list[PlayerSigned]:
    """Snapshot all proposals before applying any; competing offers share a round."""
    from .controller import AIController
    cfg = world.config
    controller = AIController(cfg, rng)
    settled = recent_arrival_ids(world)
    candidates = [player for player in world.players.values() if player.id not in settled]
    rejected = rejected or {}
    proposals = []
    opening_day = any((world.date.month, world.date.day) == (window.start_month, window.start_day)
                      for window in (cfg.world.market.summer, cfg.world.market.winter))
    completed_positions: dict[int, set[Position]] = defaultdict(set)
    for window in (cfg.world.market.summer, cfg.world.market.winter):
        start = Date(world.date.year, window.start_month, window.start_day)
        end = Date(world.date.year, window.end_month, window.end_day)
        if not start <= world.date <= end: continue
        for move in reversed(world.transfers):
            if move.date < start: break
            player = world.players.get(move.player_id)
            if (move.date <= world.date and move.kind == "transfer" and move.target_id is not None
                    and player is not None and player.club_id == move.target_id):
                completed_positions[move.target_id].add(player.position)
        break
    # Quotes are valid for this snapshot; settlement checks the seller again.
    quotes: dict[int, int] = {}
    sale_permissions: dict[int, bool] = {}
    def available(player: Player) -> bool:
        if player.id not in sale_permissions:
            seller = world.clubs.get(player.club_id)
            sale_permissions[player.id] = seller is None or can_sell(player, seller, world)
        return sale_permissions[player.id]

    ranked: dict[Position, list[Player]] = {}
    talents: dict[Position, list[Player]] = {}
    def known_talents(position: Position) -> list[Player]:
        """Best sellable players of a position, seen by every club whatever the sample.

        A random scan alone lets a star at a thin position reach one buyer by luck;
        every club with the need should be able to bid for the best players.
        """
        if position not in talents:
            if position not in ranked:
                ranked[position] = sorted((player for player in candidates if player.position == position),
                                          key=lambda player: (-player.rating, player.id))
            best = ranked[position][:cfg.management.market.max_candidates_scanned]
            talents[position] = [player for player in best if available(player)][:cfg.management.market.visible_talents]
        return talents[position]

    def price(player: Player) -> int:
        if player.id not in quotes:
            seller = world.clubs.get(player.club_id)
            quotes[player.id] = asking_price(player, seller, world) if seller else 0
        return quotes[player.id]

    for club in world.active_clubs():
        pending = [offer for offer in world.offers.values() if offer.target_id == club.id]
        squad = [world.players[pid] for pid in club.player_ids]
        urgent = len(squad) < cfg.management.guardrails.min_squad or sum(player.position == Position.GOALKEEPER for player in squad) < cfg.management.guardrails.min_goalkeepers
        if emergency and not urgent: continue
        slots = min(cfg.management.market.max_negotiations - len(pending),
                    cfg.management.guardrails.max_squad - len(squad) - len(pending))
        if club.id in rejected: slots = min(slots, len(rejected[club.id]))
        if slots <= 0: continue
        # Opening-day planning covers several positions. Later batch reviews
        # preserve the configured rate of opportunities instead of tripling it.
        review_probability = cfg.management.market.daily_proposal_probability / max(1, slots)
        if not urgent and not opening_day and club.id not in rejected and rng.random() >= review_probability: continue
        reserved_money = sum(offer.ceiling for offer in pending)
        money = min(club.transfer_budget, club.balance - cfg.management.guardrails.min_balance) - reserved_money
        wages = club.wage_cap - club.wage_bill - sum(offer.contract.weekly_wage for offer in pending)
        projected = squad + [world.players[offer.player_id] for offer in pending if offer.player_id in world.players]
        covered = {player.position for player in projected[len(squad):]}
        # Keep the window's plan after signatures; don't buy successive small
        # upgrades at an already reinforced position. Actual shortages reopen it.
        counts = Counter(player.position for player in projected)
        required_counts = Counter(Position(role) for role in cfg.formations.formations[club.formation])
        required_counts[Position.GOALKEEPER] = cfg.management.guardrails.min_goalkeepers
        if len(projected) >= cfg.management.guardrails.min_squad:
            covered.update(position for position in completed_positions[club.id]
                           if counts[position] >= max(1, required_counts[position]))
        needs = controller.evaluate_needs(club, projected)
        missing_keeper = sum(player.position == Position.GOALKEEPER for player in projected) < cfg.management.guardrails.min_goalkeepers
        if missing_keeper:
            needs.sort(key=lambda need: need.position != Position.GOALKEEPER)
        quality = squad_quality(projected, club, cfg)
        for need in needs:
            if slots <= 0: break
            if need.position in covered: continue
            if need.gap <= 0 and not urgent: continue
            pool = [player for player in candidates if player.position == need.position and player.club_id != club.id
                    and (not emergency or player.club_id is None)
                    and player.id not in rejected.get(club.id, ())]
            pool = rng.sample(pool, min(len(pool), cfg.management.market.max_candidates_scanned))
            if not emergency:
                scanned = {player.id for player in pool}
                pool += [player for player in known_talents(need.position)
                         if player.id not in scanned and player.club_id != club.id and player.id not in rejected.get(club.id, ())]
            pool.sort(key=lambda player: (-player.rating, player.id))
            considered = 0
            for player in pool:
                if not available(player) or not accepts_move(player, club, world): continue
                wage = recruitment_wage(player, club, world)
                if wage > wages: continue
                fee = price(player)
                if fee > money: continue
                # Shortlist only affordable, sellable players, not the richest stars.
                if considered >= cfg.management.market.shortlist_size: break
                considered += 1
                new_quality = squad_quality([*projected, player], club, cfg)
                required = (len(projected) < cfg.management.guardrails.min_squad
                            or missing_keeper and need.position == Position.GOALKEEPER)
                if (new_quality <= quality or new_quality - quality < cfg.management.market.minimum_quality_gain) and not required: continue
                proposals.append(PlayerSigned(player.id, player.club_id, club.id, contract_for(player, world, wage), fee))
                projected.append(player)
                quality = new_quality
                money -= fee
                wages -= wage
                slots -= 1
                covered.add(need.position)
                break
    # Each external club has one scheduled opportunity per transfer window.
    if not emergency:
        from .external_market import approaching_clubs
        surplus = [world.players[pid] for club in world.active_clubs() for pid in sorted(club.player_ids,
                   key=lambda pid: (world.players[pid].rating, pid))[:max(0, len(club.player_ids) - nominal_size(cfg))]]
        external_pool = [player for player in surplus if player.id not in settled] + [player for player in candidates if player.club_id is None]
        for club in approaching_clubs(world):
            choices = rng.sample(external_pool, min(len(external_pool), cfg.management.market.shortlist_size))
            choices.sort(key=lambda player: (-player.rating, player.id))
            for player in choices:
                if not available(player) or not accepts_move(player, club, world): continue
                fee = price(player)
                wage = recruitment_wage(player, club, world)
                if fee <= club.transfer_budget and club.balance - fee >= cfg.management.guardrails.min_balance and club.wage_bill + wage <= club.wage_cap:
                    offer = PlayerSigned(player.id, player.club_id, club.id, contract_for(player, world, wage), fee)
                    proposals.append(offer)
                    break
    return proposals
