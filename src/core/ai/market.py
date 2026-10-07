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
from core.domain.offers import RESERVING_STAGES
from core.domain.world import World
from core.engine.abilities import overall
from core.math import clamp, interpolate
from core.randomness import stream
from core.world.estimates import estimate_potential
from core.world.events import PlayerSigned
from core.world.human import is_human_club, listed_price, untouchable
from core.world.transfer_rules import recent_arrival_ids, accepts_move
from core.world.importation.synthesis import intrinsic_value, expected_wage
from .assignment import maximize_assignment


@dataclass(frozen=True, slots=True)
class Need:
    position: Position
    gap: float


@dataclass(frozen=True, slots=True)
class Bid(PlayerSigned):
    """A signing a club aims at, at the fee asked for the player, and the most it would pay for him (see `price_limit`)."""
    limit: int = 0


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


def _assign(players: list[Player], club: Club, cfg: Config, deep: bool) -> tuple[float, tuple[int, ...]]:
    """Weighted assignment of a squad to the club's places: its score and the player index of each place.

    Recruitment keeps the graded starter/rotation/backup weights. `deep` does not: the
    club plays its rotation players all season, so every place among its `squad_depth`
    best weighs at least `depth_sale_weight`, not the low rotation weight.
    """
    roles, weights = squad_roles(club, cfg)
    if deep:
        depth = squad_depth(club, cfg)
        core = cfg.management.market.depth_sale_weight
        weights = [max(weight, core) if index < depth else weight for index, weight in enumerate(weights)]
    unique_roles = tuple(dict.fromkeys(roles))
    profiles = tuple((role, tuple((ATTRIBUTE_INDEX[key], value) for key, value in cfg.attributes.overall[role].items())) for role in unique_roles)
    signatures = tuple((player.attributes.values, player.position, tuple(player.secondary_positions.items())) for player in players)
    return _assigned(signatures, tuple(roles), tuple(weights), profiles,
                     cfg.attributes.out_of_position.base, cfg.attributes.out_of_position.factor)


def squad_quality(players: list[Player], club: Club, cfg: Config) -> float:
    return _assign(players, club, cfg, False)[0]


def squad_places(players: list[Player], club: Club, cfg: Config) -> dict[int, int]:
    """The place each player holds in his club's useful squad, by index of `squad_roles`; absent when he has none."""
    assignment = _assign(players, club, cfg, True)[1]
    return {players[index].id: place for place, index in enumerate(assignment) if index < len(players)}


@lru_cache(maxsize=8192)
def _assigned(players: tuple, roles: tuple, weights: tuple, profiles: tuple, base: float, factor: float) -> tuple[float, tuple[int, ...]]:
    """Memoize immutable ability snapshots, never mutable Player or World objects."""
    qualities = {}
    for role, coefficients in profiles:
        qualities[role] = [sum(attributes[index] * weight for index, weight in coefficients)
                           * (base + factor * (1 if primary == role else dict(secondary).get(role, 0)))
                           for attributes, primary, secondary in players]
    scores = [[quality * weight for quality in qualities[role]] for role, weight in zip(roles, weights)]
    for row in scores: row.extend([0.0] * max(0, len(roles) - len(players)))
    assignment = maximize_assignment(scores)
    return sum(row[index] for row, index in zip(scores, assignment)), tuple(assignment)


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


# Squad status of a player at his club: what each place of `squad_roles` is worth to it.
BACKUP_STATUS, ROTATION_STATUS, STARTER_STATUS = 0.3, 0.6, 1.0


def squad_status(player: Player, club: Club, world: World) -> float:
    """How much a club relies on a player, from 0 (outside its useful squad) to 1 (a starter).

    The highest of three readings: his place in the club's best assignment (starter,
    rotation within `squad_depth`, backup up to the nominal size), his share of the
    season's minutes against the club's busiest player once enough matches are played,
    and, for a prospect, the margin of his potential over his level as the club sees it.
    """
    cfg = world.config
    rules = cfg.management.market
    squad = [world.players[pid] for pid in club.player_ids]
    place = squad_places(squad, club, cfg).get(player.id)
    role = (0.0 if place is None or place >= nominal_size(cfg) else STARTER_STATUS if place < cfg.world.match_rules.players_on_pitch
            else ROTATION_STATUS if place < squad_depth(club, cfg) else BACKUP_STATUS)
    busiest = max(item.season_minutes for item in squad)
    match_minutes = cfg.engine.timing.match_seconds / 60
    confidence = min(1.0, busiest / (rules.minutes_confidence_matches * match_minutes))
    played = confidence * min(1.0, player.season_minutes / (rules.regular_minutes_share * busiest)) if busiest else 0.0
    estimate = estimate_potential(player, world.date, world.seed, cfg, club.id, club.reputation)
    prospect = ROTATION_STATUS * clamp((estimate.center - player.rating) / rules.prospect_margin, 0, 1)
    return max(role, played, prospect)


def asking_price(player: Player, seller: Club, world: World) -> int:
    """One quoted price for buyers and sellers: the lowest fee the seller accepts.

    A starter or a regular costs well above his value, a backup about his value, and a
    player outside the useful squad with no prospect goes cheap (see `squad_status`).
    """
    cfg = world.config
    if seller.competition_id is None:
        return round(market_value(player, world, seller) * cfg.management.market.dormant_clubs.asking_multiplier)
    surplus = len(seller.player_ids) > nominal_size(cfg)
    rules = cfg.management.market
    threshold = market_value(player, world, seller) * (rules.seller_multiplier - rules.surplus_discount * surplus)
    threshold *= 1 + rules.patience_weight * seller.personality.negotiation_patience
    status = interpolate(((0.0, rules.surplus_price_factor), (BACKUP_STATUS, rules.backup_price_factor),
                          (ROTATION_STATUS, rules.rotation_price_factor), (STARTER_STATUS, rules.starter_price_factor)),
                         squad_status(player, seller, world))
    return round(threshold * status)


def can_sell(player: Player, seller: Club, world: World) -> bool:
    """Only a loan, the hard minimums and the human club's word stop a sale; any other player has his price (see `asking_price`)."""
    if player.loan is not None or untouchable(world, player.id): return False
    return seller.competition_id is None or can_spare(player, seller, world)


def can_spare(player: Player, seller: Club, world: World) -> bool:
    """Whether a club keeps its hard squad and goalkeeper minimums without a player."""
    guard = world.config.management.guardrails
    if len(seller.player_ids) <= guard.min_squad: return False
    if player.position == Position.GOALKEEPER and sum(
        world.players[pid].position == Position.GOALKEEPER for pid in seller.player_ids) <= guard.min_goalkeepers: return False
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


def wage_demand(player: Player, club: Club, world: World) -> int:
    """The lowest weekly wage a player accepts to join a club.

    From the higher of his wage and his market wage: a raise to join a more reputed club,
    a limited cut for a less reputed one. The greedier he is, the bigger the raise and
    the smaller the cut he concedes, and the higher the premium on top (see `greed_trait`).
    """
    cfg = world.config
    rules = cfg.management.contracts
    expected = expected_wage(market_value(player, world, club, False), cfg)
    base = max(expected, player.contract.weekly_wage if player.contract else 0)
    source = world.clubs.get(player.club_id) if player.club_id is not None else None
    step = club.reputation - source.reputation if source is not None and source.id != club.id else 0.0
    if step >= 0: move = min(rules.max_raise, rules.raise_per_point * step) * (0.5 + player.greed)
    else: move = -min(rules.max_cut, rules.cut_per_point * -step) * (1.5 - player.greed)
    wage = base * (1 + move) * (1 + rules.greed_premium * player.greed)
    return max(cfg.management.budgets.wages.weekly_minimum, round(wage))


def window_stamp(world: World) -> str:
    """Names the transfer window open today: what a club makes of a player holds for the whole window."""
    for name in ("summer", "winter"):
        window = getattr(world.config.world.market, name)
        if (Date(world.date.year, window.start_month, window.start_day) <= world.date
                <= Date(world.date.year, window.end_month, window.end_day)): return f"{world.date.year}:{name}"
    return world.date.iso()


def price_limit(player: Player, buyer: Club, world: World, need: float) -> int:
    """The most a club pays for a player, whatever is asked for him.

    The value it sees in him, times `buyer_price_multiplier` when it hardly needs him and up to
    `need_premium` more when it needs him most (`need`, from 0 to 1, see `Plan.need`). A club with
    an appetite for risk pays more, a cautious one less, and each club has its own reading of each
    player, drawn once for the window: two clubs never value a player quite alike.
    """
    rules, offers = world.config.management.market, world.config.management.market.offers
    appetite = 1 + offers.risk_weight * (buyer.personality.risk_appetite - 0.5)
    reading = 1 + stream(world.seed, "price-limit", buyer.id, player.id, window_stamp(world)).gauss(0, offers.noise)
    return round(market_value(player, world, buyer) * (rules.buyer_price_multiplier + offers.need_premium * clamp(need, 0, 1))
                 * appetite * max(0.5, reading))


def outside_need(player: Player, buyer: Club, world: World) -> float:
    """How much an unsimulated club needs a player: it has no squad to measure it on, so it is drawn for the window."""
    return stream(world.seed, "outside-need", buyer.id, player.id, window_stamp(world)).random()


def opening_share(buyer: Club, cfg: Config) -> float:
    """The share of its price limit a club opens at when no price is asked: a patient club opens lower."""
    rules = cfg.management.market
    return rules.counteroffer_ratio + rules.offers.opening_spread * (0.5 - buyer.personality.negotiation_patience)


def raises_allowed(buyer: Club, cfg: Config) -> int:
    """How many times a club raises an offer turned down before giving up: a patient club raises more often, by less."""
    offers = cfg.management.market.offers
    return round(offers.min_raises + (offers.max_raises - offers.min_raises) * buyer.personality.negotiation_patience)


def reinforced_positions(world: World) -> dict[int, set[Position]]:
    """Positions each club reinforced by a transfer in the window open today."""
    cfg = world.config
    completed: dict[int, set[Position]] = defaultdict(set)
    for window in (cfg.world.market.summer, cfg.world.market.winter):
        start = Date(world.date.year, window.start_month, window.start_day)
        end = Date(world.date.year, window.end_month, window.end_day)
        if not start <= world.date <= end: continue
        for move in reversed(world.transfers):
            if move.date < start: break
            player = world.players.get(move.player_id)
            if (move.date <= world.date and move.kind == "transfer" and move.target_id is not None
                    and player is not None and player.club_id == move.target_id):
                completed[move.target_id].add(player.position)
        break
    return completed


def short_of_players(squad: list[Player], cfg: Config) -> bool:
    """Below the hard squad or goalkeeper minimum: the club must recruit."""
    guard = cfg.management.guardrails
    return len(squad) < guard.min_squad or sum(player.position == Position.GOALKEEPER for player in squad) < guard.min_goalkeepers


def open_slots(club: Club, pending: list, cfg: Config) -> int:
    """New offers a club may still open beside its pending ones."""
    return min(cfg.management.market.max_negotiations - len(pending), cfg.management.guardrails.max_squad - club.squad_size - len(pending))


@dataclass(slots=True)
class Plan:
    """A club's recruitment round: the squad it projects with its pending offers, and what it can still commit."""
    club: Club
    projected: list[Player]
    quality: float
    money: int
    wages: int
    slots: int
    covered: set[Position]
    urgent: bool
    missing_keeper: bool

    def improved_quality(self, player: Player, cfg: Config) -> float | None:
        """The projected squad quality with the player, if he raises it by the minimum gain or fills a hard minimum."""
        quality = squad_quality([*self.projected, player], self.club, cfg)
        required = (len(self.projected) < cfg.management.guardrails.min_squad
                    or self.missing_keeper and player.position == Position.GOALKEEPER)
        if (quality <= self.quality or quality - self.quality < cfg.management.market.minimum_quality_gain) and not required: return None
        return quality

    def need(self, player: Player, quality: float, cfg: Config) -> float:
        """How much the club needs the player, from 0 to 1: the quality he adds to its squad against
        `full_need_gain`, and 1 for a player it must sign to reach a hard minimum."""
        if len(self.projected) < cfg.management.guardrails.min_squad or self.missing_keeper and player.position == Position.GOALKEEPER:
            return 1.0
        return clamp((quality - self.quality) / cfg.management.market.offers.full_need_gain, 0, 1)

    def take(self, player: Player, fee: int, wage: int, quality: float) -> None:
        self.projected.append(player)
        self.quality = quality
        self.money -= fee
        self.wages -= wage
        self.slots -= 1
        self.covered.add(player.position)


def recruitment_plan(world: World, club: Club, pending: list, slots: int, reinforced: set[Position]) -> Plan:
    cfg = world.config
    squad = [world.players[pid] for pid in club.player_ids]
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
        covered.update(position for position in reinforced if counts[position] >= max(1, required_counts[position]))
    missing_keeper = sum(player.position == Position.GOALKEEPER for player in projected) < cfg.management.guardrails.min_goalkeepers
    return Plan(club, projected, squad_quality(projected, club, cfg), money, wages, slots, covered,
                short_of_players(squad, cfg), missing_keeper)


def offered_player_bids(world: World, player: Player, fee: int, rng: Random) -> list[Bid]:
    """The clubs that bid, at this fee, for a player the human club offers to every club today.

    An active club decides as in its daily review, without waiting for it: a need at his
    position not already covered, room for a new offer, the means, and at least the
    minimum quality gain. A dormant club with room takes its chance with its
    approach probability. Neither pays more than its `price_limit`.
    """
    cfg = world.config
    guard = cfg.management.guardrails
    reinforced = reinforced_positions(world)
    bids = []
    for club in sorted(world.clubs.values(), key=lambda item: item.id):
        if club.id == player.club_id or is_human_club(world, club.id): continue
        if club.competition_id is None:
            if club.squad_size >= guard.max_squad or rng.random() >= cfg.management.market.dormant_clubs.approach_probability: continue
            if not accepts_move(player, club, world): continue
            wage = wage_demand(player, club, world)
            limit = price_limit(player, club, world, outside_need(player, club, world))
            if fee > club.transfer_budget or club.balance - fee < guard.min_balance or club.wage_bill + wage > club.wage_cap or fee > limit: continue
            bids.append(Bid(player.id, player.club_id, club.id, contract_for(player, world, wage), fee, limit=limit))
            continue
        pending = [offer for offer in world.offers.values() if offer.target_id == club.id]
        slots = open_slots(club, pending, cfg)
        if slots <= 0 or any(offer.player_id == player.id for offer in pending) or not accepts_move(player, club, world): continue
        plan = recruitment_plan(world, club, pending, slots, reinforced[club.id])
        wage = wage_demand(player, club, world)
        if player.position in plan.covered or wage > plan.wages or fee > plan.money: continue
        if not any(need.position == player.position and (need.gap > 0 or plan.urgent) for need in needs_for(club, plan.projected, cfg)): continue
        quality = plan.improved_quality(player, cfg)
        if quality is None: continue
        limit = price_limit(player, club, world, plan.need(player, quality, cfg))
        if fee > limit: continue
        bids.append(Bid(player.id, player.club_id, club.id, contract_for(player, world, wage), fee, limit=limit))
    return bids


def propose_transfers(world: World, rng: Random, emergency: bool = False,
                      rejected: dict[int, set[int]] | None = None) -> list[Bid]:
    """Snapshot all proposals before applying any; competing offers share a round.

    Each proposal names the fee asked for the player (his club's asking price, or the fee the
    human club listed him at) and the most the buyer would pay: a club leaves a player whose
    price is beyond what it would pay for him to others.
    """
    from .controller import AIController
    cfg = world.config
    controller = AIController(cfg, rng)
    # Recent arrivals stay put; players the human club has agreed a fee for are no longer on the market.
    settled = recent_arrival_ids(world) | {offer.player_id for offer in world.offers.values() if offer.stage in RESERVING_STAGES}
    candidates = [player for player in world.players.values() if player.id not in settled and player.loan is None]
    # The human club's transfer list, at the fee it asks: every club with the need sees it first.
    listed = {player.id: fee for player in candidates if (fee := listed_price(world, player.id)) is not None}
    rejected = rejected or {}

    def turned_away(club: Club, player: Player) -> bool:
        """The human club turned this club's offer down for good in this window; listed since, he is offered to all."""
        return player.id not in listed and club.id in world.turned_away.get(player.id, ())
    proposals = []
    opening_day = any((world.date.month, world.date.day) == (window.start_month, window.start_day)
                      for window in (cfg.world.market.summer, cfg.world.market.winter))
    completed_positions = reinforced_positions(world)
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
            quotes[player.id] = listed[player.id] if player.id in listed else asking_price(player, seller, world) if seller else 0
        return quotes[player.id]

    for club in world.active_clubs():
        if is_human_club(world, club.id): continue  # the human club's outgoing offers come from its own command, not this scan
        pending = [offer for offer in world.offers.values() if offer.target_id == club.id]
        urgent = short_of_players([world.players[pid] for pid in club.player_ids], cfg)
        if emergency and not urgent: continue
        slots = open_slots(club, pending, cfg)
        if club.id in rejected: slots = min(slots, len(rejected[club.id]))
        if slots <= 0: continue
        # Opening-day planning covers several positions. Later batch reviews
        # preserve the configured rate of opportunities instead of tripling it.
        review_probability = cfg.management.market.daily_proposal_probability / max(1, slots)
        if not urgent and not opening_day and club.id not in rejected and rng.random() >= review_probability: continue
        plan = recruitment_plan(world, club, pending, slots, completed_positions[club.id])
        needs = controller.evaluate_needs(club, plan.projected)
        if plan.missing_keeper:
            needs.sort(key=lambda need: need.position != Position.GOALKEEPER)
        for need in needs:
            if plan.slots <= 0: break
            if need.position in plan.covered: continue
            if need.gap <= 0 and not urgent: continue
            pool = [player for player in candidates if player.position == need.position and player.club_id != club.id
                    and (not emergency or player.club_id is None)
                    and player.id not in rejected.get(club.id, ())]
            pool = rng.sample(pool, min(len(pool), cfg.management.market.max_candidates_scanned))
            if not emergency:
                scanned = {player.id for player in pool}
                pool += [player for player in known_talents(need.position)
                         if player.id not in scanned and player.club_id != club.id and player.id not in rejected.get(club.id, ())]
                scanned.update(player.id for player in pool)
                pool += [world.players[pid] for pid in listed if world.players[pid].position == need.position
                         and pid not in scanned and pid not in rejected.get(club.id, ())]
            pool.sort(key=lambda player: (player.id not in listed, -player.rating, player.id))
            considered = 0
            for player in pool:
                if not available(player) or turned_away(club, player) or not accepts_move(player, club, world): continue
                wage = wage_demand(player, club, world)
                if wage > plan.wages: continue
                fee = price(player)
                if fee > plan.money: continue
                # Shortlist only affordable, sellable players, not the richest stars.
                if considered >= cfg.management.market.shortlist_size: break
                considered += 1
                quality = plan.improved_quality(player, cfg)
                if quality is None: continue
                # Asked more than he is worth to this club, he is left to a club that needs him more.
                limit = price_limit(player, club, world, plan.need(player, quality, cfg))
                if fee > limit: continue
                proposals.append(Bid(player.id, player.club_id, club.id, contract_for(player, world, wage), fee, limit=limit))
                plan.take(player, fee, wage, quality)
                break
    # Each external club has one scheduled opportunity per transfer window.
    if not emergency:
        from .external_market import approaching_clubs
        surplus = [world.players[pid] for club in world.active_clubs() for pid in sorted(club.player_ids,
                   key=lambda pid: (world.players[pid].rating, pid))[:max(0, len(club.player_ids) - nominal_size(cfg))]]
        external_pool = [player for player in surplus if player.id not in settled and player.loan is None]
        # A listed player is part of the surplus whatever the size of the human club's squad.
        pooled = {player.id for player in external_pool}
        external_pool += [world.players[pid] for pid in listed if pid not in pooled]
        external_pool += [player for player in candidates if player.club_id is None]
        for club in approaching_clubs(world):
            choices = rng.sample(external_pool, min(len(external_pool), cfg.management.market.shortlist_size))
            choices.sort(key=lambda player: (-player.rating, player.id))
            for player in choices:
                if not available(player) or turned_away(club, player) or not accepts_move(player, club, world): continue
                fee = price(player)
                wage = wage_demand(player, club, world)
                limit = price_limit(player, club, world, outside_need(player, club, world))
                if fee > limit: continue
                if fee <= club.transfer_budget and club.balance - fee >= cfg.management.guardrails.min_balance and club.wage_bill + wage <= club.wage_cap:
                    proposals.append(Bid(player.id, player.club_id, club.id, contract_for(player, world, wage), fee, limit=limit))
                    break
    return proposals
