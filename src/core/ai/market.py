"""Squad needs and simultaneous transfer proposals, using public estimates."""
from __future__ import annotations

from collections import Counter
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


def squad_quality(players: list[Player], club: Club, cfg: Config) -> float:
    roles, weights = squad_roles(club, cfg)
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
    counts = Counter(player.position for player in players)
    required = Counter(Position(role) for role in cfg.formations.formations[club.formation])
    required[Position.GOALKEEPER] = cfg.management.guardrails.min_goalkeepers
    target = cfg.management.target_profile.base_level + club.reputation * cfg.management.target_profile.reputation_weight
    result = []
    for position, minimum in required.items():
        levels = sorted((player.rating for player in players if player.position == position), reverse=True)
        level = levels[min(minimum, len(levels)) - 1] if levels else 0
        shortage = max(0, minimum - counts[position])
        result.append(Need(position, target - level + shortage * cfg.attributes.bounds.max))
    return sorted(result, key=lambda item: (-item.gap, item.position.value))


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


def seller_accepts(player: Player, seller: Club, fee: int, world: World, rng: Random) -> bool:
    cfg = world.config
    if seller.competition_id is None:
        threshold = round(market_value(player, world, seller) * cfg.management.market.dormant_clubs.asking_multiplier)
        return fee >= threshold and rng.random() < cfg.management.market.dormant_clubs.acceptance_probability
    if len(seller.player_ids) <= cfg.management.guardrails.min_squad: return False
    surplus = len(seller.player_ids) > nominal_size(cfg)
    rules = cfg.management.market
    threshold = market_value(player, world, seller) * (rules.seller_multiplier - rules.surplus_discount * surplus)
    threshold *= 1 + rules.patience_weight * seller.personality.negotiation_patience
    squad = [world.players[pid] for pid in seller.player_ids]
    departure_cost = squad_quality(squad, seller, cfg) - squad_quality([item for item in squad if item.id != player.id], seller, cfg)
    threshold *= 1 + max(0, departure_cost) / max(1, squad_quality(squad, seller, cfg))
    return fee >= round(threshold)


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


def propose_transfers(world: World, rng: Random, emergency: bool = False) -> list[PlayerSigned]:
    """Snapshot all proposals before applying any; competing offers share a round."""
    from .controller import AIController
    cfg = world.config
    controller = AIController(cfg, rng)
    candidates = list(world.players.values())
    proposals: dict[int, list[tuple[float, PlayerSigned]]] = {}
    for club in world.active_clubs():
        pending = [offer for offer in world.offers.values() if offer.target_id == club.id]
        if len(pending) >= cfg.management.market.max_negotiations and not emergency: continue
        squad = [world.players[pid] for pid in club.player_ids]
        urgent = len(squad) < cfg.management.guardrails.min_squad or sum(player.position == Position.GOALKEEPER for player in squad) < cfg.management.guardrails.min_goalkeepers
        if emergency and not urgent: continue
        if len(squad) >= cfg.management.guardrails.max_squad: continue
        if not urgent and rng.random() >= cfg.management.market.daily_proposal_probability: continue
        needs = controller.evaluate_needs(club, squad)
        position = (Position.GOALKEEPER if sum(player.position == Position.GOALKEEPER for player in squad) < cfg.management.guardrails.min_goalkeepers
                    else needs[0].position)
        pool = [player for player in candidates if player.position == position and player.club_id != club.id
                and (not emergency or player.club_id is None)
                and not any(offer.player_id == player.id for offer in pending)]
        pool = rng.sample(pool, min(len(pool), cfg.management.market.max_candidates_scanned))
        pool.sort(key=lambda player: (-player.rating, player.id))
        quality = squad_quality(squad, club, cfg)
        for player in pool[:cfg.management.market.shortlist_size]:
            seller = world.clubs.get(player.club_id)
            if seller and seller.competition_id and len(seller.player_ids) <= cfg.management.guardrails.min_squad: continue
            fee = market_value(player, world, seller) if seller else 0
            if seller:
                multiplier = cfg.management.market.dormant_clubs.asking_multiplier if seller.competition_id is None else (
                    cfg.management.market.seller_multiplier * (1 + cfg.management.market.patience_weight * seller.personality.negotiation_patience))
                fee = round(fee * multiplier)
            wage = expected_wage(market_value(player, world, club, False), cfg)
            if club.wage_bill + wage > club.wage_cap or fee > club.transfer_budget or club.balance - fee < cfg.management.guardrails.min_balance: continue
            gain = squad_quality([*squad, player], club, cfg) - quality
            if gain <= 0 and not urgent: continue
            score = player_offer_score(player, club, wage, world) + rng.gauss(0, cfg.management.market.player_score.noise)
            offer = PlayerSigned(player.id, player.club_id, club.id, contract_for(player, world, wage), fee)
            proposals.setdefault(player.id, []).append((score, offer))
            break
    # Each external club has one scheduled opportunity per transfer window.
    if not emergency:
        from .external_market import approaching_clubs
        surplus = [world.players[pid] for club in world.active_clubs() for pid in sorted(club.player_ids,
                   key=lambda pid: (world.players[pid].rating, pid))[:max(0, len(club.player_ids) - nominal_size(cfg))]]
        external_pool = surplus + [player for player in candidates if player.club_id is None]
        for club in approaching_clubs(world):
            choices = rng.sample(external_pool, min(len(external_pool), cfg.management.market.shortlist_size))
            choices.sort(key=lambda player: (-player.rating, player.id))
            for player in choices:
                seller = world.clubs.get(player.club_id)
                fee = round(market_value(player, world, seller) * cfg.management.market.seller_multiplier * (1 + cfg.management.market.patience_weight * seller.personality.negotiation_patience)) if seller else 0
                wage = expected_wage(market_value(player, world, club, False), cfg)
                if fee <= club.transfer_budget and club.balance - fee >= cfg.management.guardrails.min_balance and club.wage_bill + wage <= club.wage_cap:
                    offer = PlayerSigned(player.id, player.club_id, club.id, contract_for(player, world, wage), fee)
                    proposals.setdefault(player.id, []).append((player_offer_score(player, club, wage, world), offer))
                    break
    return [offer for _, offers in sorted(proposals.items()) for _, offer in offers]
