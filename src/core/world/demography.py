"""Annual retirement and bounded cohort generation with demographic feedback."""
from collections import Counter
from random import Random

from core.domain.date import Date
from core.domain.clubs import Club
from core.domain.players import Player, Position, Contract
from core.domain.world import World
from core.engine.abilities import generate_attributes, overall
from core.math import clamp, interpolate, weighted_choice
from core.randomness import stream
from core.ai.market import nominal_size
from .events import PlayerReleased, PlayerGenerated


def retirement_events(world: World) -> list[PlayerReleased]:
    cfg, rng = world.config, world.rngs["demography"]
    rule = cfg.demography.exits.retirement
    events = []
    for player in world.players.values():
        age = player.born.age_on(world.date)
        if age < rule.min_age: continue
        probability = rule.coefficient * (age - rule.min_age + 1) ** rule.exponent
        probability *= rule.level_base - rule.level_slope * player.rating / cfg.attributes.bounds.max
        if rng.random() < clamp(probability, 0, 1): events.append(PlayerReleased(player.id, True))
    return events


def draw_level(world: World, club: Club | None, rng: Random) -> tuple[int, float, float]:
    cfg = world.config
    rules, academy = cfg.demography.generation, cfg.demography.academies
    age = rng.randint(rules.min_age, rules.max_age)
    if club:
        recruitment = club.youth_recruitment * 5 if club.youth_recruitment is not None else club.academy
        mean = academy.base_mean + academy.reputation_weight * club.reputation + academy.academy_weight * recruitment
        potential = rng.gauss(mean, academy.potential_noise)
    else:
        potential = rules.min_potential + rules.potential_amplitude * rng.betavariate(rules.potential_alpha, rules.potential_beta)
    potential = clamp(potential, cfg.attributes.bounds.min, cfg.attributes.bounds.max)
    ratio = interpolate([(row.age, row.ratio) for row in rules.level_ratios], age)
    level = clamp(potential * ratio * rng.gauss(1, rules.level_noise), cfg.attributes.bounds.min, potential)
    return age, potential, level


def generate_player(world: World, player_id: int, club: Club | None, position: Position,
                    nation: str, rng: Random, bucket: tuple[int, int] | None = None) -> Player:
    cfg = world.config
    rules, academy = cfg.demography.generation, cfg.demography.academies
    age, potential, level = draw_level(world, club, rng)
    if bucket:
        low, high = bucket
        def distance(value: float) -> float:
            return max(low - value, value - high, 0)
        best = (age, potential, level)
        for _ in range(cfg.demography.cohort.max_class_candidates - 1):
            if low <= best[2] < high or best[2] == high == cfg.attributes.bounds.max: break
            candidate = draw_level(world, club, rng)
            if distance(candidate[2]) < distance(best[2]): best = candidate
        age, potential, level = best
    attributes = generate_attributes(level, position, cfg, rng)
    identity = rng.choice(world.identity_pool[nation])
    given, surname = identity
    # Independent draws permit new name combinations without uniqueness retries.
    if given: given = rng.choice(world.identity_pool[nation])[0] or given
    birthday = world.date.add_years(-age)
    born = birthday.add_days(-rng.randrange(birthday.ordinal() - birthday.add_years(-1).ordinal()))
    secondary = {Position(source): rules.secondary_affinity for source in rules.secondary_positions[position]
                 if rng.random() < rules.secondary_probability}
    contract = None
    if club:
        release = cfg.world.key_dates.contract_release
        end = Date(world.date.year + academy.contract_years, release.month, release.day).add_days(-1)
        contract = Contract(academy.base_weekly_wage, end, world.date, "backup", True)
    injury, agreements, cards = cfg.states.injuries, cfg.management.contracts, cfg.engine.cards
    return Player(player_id, f"{given} {surname}".strip(), surname, given, (nation,), born, position, secondary,
                  attributes, overall(attributes, position, cfg), potential, cfg.states.fitness.initial,
                  cfg.states.form.initial, cfg.states.moral.initial, rng.uniform(injury.fragility_min, injury.fragility_max),
                  rng.uniform(agreements.ego_min, agreements.ego_max), club.id if club else None, contract,
                  # Peaked at the neutral factor, like the imported population.
                  aggression=rng.triangular(cards.aggression_min, cards.aggression_max, 1.0))


def cohort_events(world: World) -> list[PlayerGenerated]:
    cfg, rng = world.config, world.rngs["demography"]
    active_clubs = world.active_clubs()
    active = [player for player in world.players.values() if player.club_id and world.clubs[player.club_id].competition_id]
    target = len(active_clubs) * nominal_size(cfg)
    deficit = max(0, target - len(active)) * cfg.demography.cohort.return_coefficient
    count = int(deficit) + int(rng.random() < deficit % 1)
    external_count = max(0, world.external_target - (len(world.players) - len(active)))
    positions = list(cfg.demography.position_targets)
    observed = Counter(player.position for player in active)
    kappa = cfg.demography.cohort.correction_exponent
    weights = [cfg.demography.position_targets[position] * (target * cfg.demography.position_targets[position] / max(1, observed[position])) ** kappa for position in positions]
    nations = [nation for nation in world.nation_targets if world.identity_pool.get(nation)]
    observed_nations = Counter(player.nation for player in active)
    nation_weights = [world.nation_targets[nation] * (target * world.nation_targets[nation] / max(1, observed_nations[nation])) ** kappa for nation in nations]
    buckets = cfg.demography.cohort.level_buckets
    observed_levels = [sum(low <= player.rating < high or player.rating == high == cfg.attributes.bounds.max for player in active)
                       for low, high in buckets]
    level_weights = [share * (target * share / max(1, observed)) ** kappa for share, observed in zip(world.level_targets, observed_levels)]
    allocations = Counter()
    keeper_allocations = Counter()
    keeper_counts = {club.id: sum(world.players[pid].position == Position.GOALKEEPER for pid in club.player_ids) for club in active_clubs}
    capacity = {club.id: max(0, min(cfg.management.guardrails.max_squad - len(club.player_ids),
                                     (club.wage_cap - club.wage_bill) // cfg.demography.academies.base_weekly_wage)) for club in world.clubs.values()}
    candidates = [club for club in active_clubs if capacity[club.id] > 0]
    external = [club for club in world.clubs.values() if club.competition_id is None and capacity[club.id] > 0]
    events = []
    for index in range(count + external_count):
        active_intake = index < count
        viable = [club for club in candidates if allocations[club.id] < min(capacity[club.id], cfg.demography.academies.max_club_allocation)] if active_intake else []
        urgent = [club for club in viable if keeper_counts[club.id] + keeper_allocations[club.id] < cfg.management.guardrails.min_goalkeepers
                  or len(club.player_ids) + allocations[club.id] < cfg.management.guardrails.min_squad]
        if urgent: viable = urgent
        if active_intake and not viable:
            continue
        club = weighted_choice(viable, [max(1, nominal_size(cfg) - len(item.player_ids) - allocations[item.id]) for item in viable], rng) if active_intake else None
        if not active_intake and external:
            club = external[rng.randrange(len(external))]
            if allocations[club.id] >= capacity[club.id]: club = None
        position = Position(weighted_choice(positions, weights, rng))
        if club and club.competition_id:
            if keeper_counts[club.id] + keeper_allocations[club.id] < cfg.management.guardrails.min_goalkeepers: position = Position.GOALKEEPER
        nation = weighted_choice(nations, nation_weights, rng) if nations else sorted(world.identity_pool)[0]
        bucket = weighted_choice(list(buckets), level_weights, rng)
        player = generate_player(world, world.next_id + len(events), club, position, nation, rng, bucket)
        fallback = not (bucket[0] <= player.rating < bucket[1] or player.rating == bucket[1] == cfg.attributes.bounds.max)
        events.append(PlayerGenerated(player, fallback))
        if club:
            allocations[club.id] += 1
            if position == Position.GOALKEEPER: keeper_allocations[club.id] += 1
    return events
