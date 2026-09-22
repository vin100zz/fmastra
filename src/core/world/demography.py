"""Annual retirement and bounded cohort generation with demographic feedback."""
from collections import Counter
from collections.abc import Callable, Iterable, Sequence
from math import exp
from random import Random
from typing import NamedTuple, TypeVar

from core.config.model import Config
from core.domain.date import Date
from core.domain.clubs import Club
from core.domain.players import Player, Position, Contract
from core.domain.world import World
from core.engine.abilities import generate_attributes, overall
from core.math import clamp, interpolate, weighted_choice
from core.randomness import stream
from core.ai.market import nominal_size
from .events import PlayerReleased, PlayerGenerated

T = TypeVar("T")


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


class Prospect(NamedTuple):
    """A regen before he has a club and a position."""
    nation: str
    age: int
    potential: float
    level: float


class Slot(NamedTuple):
    """A place a regen of the clubs playing will take."""
    club: Club
    goalkeeper: bool  # The club is short of keepers, so this place goes to one.


class Regime(NamedTuple):
    """What one population asks of its regens: classes of potential and nation weights."""
    classes: list[tuple[int, ...]]
    class_weights: list[float]
    nations: list[str]
    nation_weights: list[float]
    elite_weights: list[float]


def bucket_index(value: float, buckets: Sequence[Sequence[int]]) -> int:
    """Classes are closed below and open above, except the last one which holds the upper bound."""
    return next((index for index, (_, high) in enumerate(buckets) if value < high), len(buckets) - 1)


def class_shares(potentials: Iterable[float], buckets: Sequence[Sequence[int]]) -> tuple[float, ...]:
    counts = Counter(bucket_index(value, buckets) for value in potentials)
    total = sum(counts.values())
    return tuple(counts[index] / total for index in range(len(buckets))) if total else ()


def initialize_targets(world: World) -> None:
    """Measure the regen targets a world lacks: at import, and for a save made before they existed.

    Only the players the source supplied count, so that generated ones do not carry earlier generations into the
    targets; a save without source abilities is measured on everyone. Existing values are never replaced.
    """
    everyone = list(world.players.values())
    supplied = [player for player in everyone if player.source_potential_ability is not None] or everyone
    playing = {player.id for player in supplied if player.club_id is not None and world.clubs[player.club_id].competition_id is not None}
    outside = [player for player in supplied if player.id not in playing]
    buckets = world.config.demography.cohort.level_buckets
    if not world.potential_targets:
        world.potential_targets = class_shares((player.potential for player in supplied if player.id in playing), buckets)
    if not world.external_potential_targets:
        world.external_potential_targets = class_shares((player.potential for player in outside), buckets)
    if not world.external_nation_targets and outside:
        counts = Counter(player.nation for player in outside)
        world.external_nation_targets = {nation: count / len(outside) for nation, count in sorted(counts.items())}


def corrected(shares: Sequence[float], observed: Sequence[int], total: float, kappa: float) -> list[float]:
    """Sampling weights that push the observed counts towards the target shares, by `(target / observed) ** kappa`."""
    return [share * (total * share / max(1, seen)) ** kappa for share, seen in zip(shares, observed)]


def recruitment(club: Club) -> float:
    return club.youth_recruitment * 5 if club.youth_recruitment is not None else club.academy


def draw_age(cfg: Config, rng: Random) -> int:
    rules = cfg.demography.generation
    return weighted_choice(range(rules.min_age, rules.max_age + 1), rules.age_weights, rng)


def entry_level(cfg: Config, potential: float, age: int, rng: Random) -> float:
    rules = cfg.demography.generation
    ratio = interpolate([(row.age, row.ratio) for row in rules.level_ratios], age)
    return clamp(potential * ratio * rng.gauss(1, rules.level_noise), cfg.attributes.bounds.min, potential)


def draw_level(world: World, club: Club, rng: Random) -> tuple[int, float, float]:
    """Age, potential and level of a youngster produced for one club, whose academy sets the potential."""
    cfg = world.config
    academy = cfg.demography.academies
    age = draw_age(cfg, rng)
    mean = academy.base_mean + academy.reputation_weight * club.reputation + academy.academy_weight * recruitment(club)
    potential = clamp(rng.gauss(mean, academy.potential_noise), cfg.attributes.bounds.min, cfg.attributes.bounds.max)
    return age, potential, entry_level(cfg, potential, age, rng)


def draw_identity(world: World, nation: str, rng: Random) -> tuple[str, str]:
    """Given name and surname; a nation with few names borrows the rest from the whole world."""
    pool = world.identity_pool[nation]
    minimum = world.config.demography.generation.min_identities
    if len(pool) < minimum and rng.random() * minimum >= len(pool):
        nations = sorted(world.identity_pool)
        pool = world.identity_pool[weighted_choice(nations, [len(world.identity_pool[code]) for code in nations], rng)]
    given, surname = rng.choice(pool)
    # Independent draws permit new name combinations without uniqueness retries.
    if given: given = rng.choice(pool)[0] or given
    return given, surname


def generate_player(world: World, player_id: int, club: Club | None, position: Position,
                    nation: str, rng: Random, prospect: Prospect | None = None) -> Player:
    """A regen for `club`; without a prospect the club's academy draws his age, potential and level."""
    cfg = world.config
    rules, academy = cfg.demography.generation, cfg.demography.academies
    age, potential, level = draw_level(world, club, rng) if prospect is None else (prospect.age, prospect.potential, prospect.level)
    attributes = generate_attributes(level, position, cfg, rng)
    given, surname = draw_identity(world, nation, rng)
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


def regime_of(world: World, population: Sequence[Player], total: float, shares: Sequence[float],
           nation_shares: dict[str, float]) -> Regime:
    """Weights for the regens of one population, corrected towards its targets like positions are."""
    cfg = world.config
    kappa = cfg.demography.cohort.correction_exponent
    classes = list(cfg.demography.cohort.level_buckets)
    seen = Counter(bucket_index(player.potential, classes) for player in population)
    nations = sorted(code for code, names in world.identity_pool.items() if names)
    held = Counter(player.nation for player in population)
    rules = cfg.demography.generation
    # Every nation with names keeps a chance, even one absent from the population it is measured on.
    nation_weights = corrected([max(nation_shares.get(code, 0.0), rules.nation_floor) for code in nations],
                               [held[code] for code in nations], total, kappa)
    return Regime(classes, corrected(shares, [seen[index] for index in range(len(classes))], total, kappa),
                  nations, nation_weights, [weight ** rules.elite_nation_exponent for weight in nation_weights])


def draw_prospect(world: World, regime: Regime, rng: Random) -> Prospect:
    """Class of potential first, then the nation (flattened for a star, so a small nation can produce one)."""
    cfg = world.config
    low, high = weighted_choice(regime.classes, regime.class_weights, rng)
    potential = rng.uniform(low, high)
    star = potential >= cfg.demography.generation.elite_potential
    nation = weighted_choice(regime.nations, regime.elite_weights if star else regime.nation_weights, rng)
    age = draw_age(cfg, rng)
    return Prospect(nation, age, potential, entry_level(cfg, potential, age, rng))


def academy_quality(club: Club, cfg: Config) -> float:
    """Recruitment of a club on a scale of 0 to 1, mixed with its reputation if configured."""
    rules = cfg.demography.cohort
    return (recruitment(club) + rules.sorting_reputation_weight * club.reputation) / (1 + rules.sorting_reputation_weight) / cfg.attributes.bounds.max


def pick(options: Sequence[T], club_of: Callable[[T], Club], prospect: Prospect, standing: float, cfg: Config, rng: Random) -> T:
    """A club for one prospect, mostly of his own country.

    The academy weighs `exp(intensity * standing * quality)`: the best prospect (standing 1) is drawn hard to
    the best academies, the weakest (standing 0) takes any, and a few prospects ignore academies altogether.
    """
    rules = cfg.demography.cohort
    if rng.random() < rules.home_club_probability:
        options = [option for option in options if club_of(option).nation == prospect.nation] or options
    unsorted = rng.random() < rules.unsorted_share
    reach = rules.sorting_intensity * standing
    return weighted_choice(options, [1.0 if unsorted else exp(reach * academy_quality(club_of(option), cfg)) for option in options], rng)


def by_standing(prospects: Sequence[Prospect]) -> list[tuple[int, float]]:
    """Indexes of the prospects from the best to the weakest, with each one's standing from 1 down to 0."""
    order = sorted(range(len(prospects)), key=lambda index: -prospects[index].potential)
    return [(index, 1 - rank / max(1, len(order) - 1)) for rank, index in enumerate(order)]


def place(slots: Sequence[Slot], prospects: Sequence[Prospect], cfg: Config, rng: Random) -> list[Prospect]:
    """Give every place a prospect, the best choosing first; the result follows the order of `slots`."""
    free = list(range(len(slots)))
    placed: dict[int, Prospect] = {}
    for index, standing in by_standing(prospects):
        chosen = pick(free, lambda slot: slots[slot].club, prospects[index], standing, cfg, rng)
        free.remove(chosen)
        placed[chosen] = prospects[index]
    return [placed[index] for index in range(len(slots))]


def place_outside(prospects: Sequence[Prospect], clubs: Sequence[Club], room: dict[int, int],
                  cfg: Config, rng: Random) -> list[Club | None]:
    """A club with room for each prospect of the dormant and free population, the best choosing first.

    A prospect left with no club at all stays free; the result follows the order of `prospects`.
    """
    open_clubs = [club for club in clubs if room[club.id] > 0]
    placed: dict[int, Club | None] = {}
    for index, standing in by_standing(prospects):
        club = pick(open_clubs, lambda item: item, prospects[index], standing, cfg, rng) if open_clubs else None
        if club is not None:
            room[club.id] -= 1
            if room[club.id] == 0: open_clubs.remove(club)
        placed[index] = club
    return [placed[index] for index in range(len(prospects))]


def cohort_events(world: World) -> list[PlayerGenerated]:
    cfg, rng = world.config, world.rngs["demography"]
    guard = cfg.management.guardrails
    active_clubs = world.active_clubs()
    active = [player for player in world.players.values() if player.club_id and world.clubs[player.club_id].competition_id]
    active_ids = {player.id for player in active}
    outside = [player for player in world.players.values() if player.id not in active_ids]
    target = len(active_clubs) * nominal_size(cfg)
    deficit = max(0, target - len(active)) * cfg.demography.cohort.return_coefficient
    count = int(deficit) + int(rng.random() < deficit % 1)
    external_count = max(0, world.external_target - len(outside))
    positions = list(cfg.demography.position_targets)
    observed = Counter(player.position for player in active)
    kappa = cfg.demography.cohort.correction_exponent
    weights = corrected([cfg.demography.position_targets[position] for position in positions],
                        [observed[position] for position in positions], target, kappa)
    playing_regime = regime_of(world, active, target, world.potential_targets, world.nation_targets)
    outside_regime = regime_of(world, outside, world.external_target, world.external_potential_targets,
                               world.external_nation_targets or world.nation_targets)
    allocations = Counter()
    keeper_allocations = Counter()
    keeper_counts = {club.id: sum(world.players[pid].position == Position.GOALKEEPER for pid in club.player_ids) for club in active_clubs}
    capacity = {club.id: max(0, min(guard.max_squad - len(club.player_ids),
                                     (club.wage_cap - club.wage_bill) // cfg.demography.academies.base_weekly_wage)) for club in world.clubs.values()}
    candidates = [club for club in active_clubs if capacity[club.id] > 0]
    external = [club for club in world.clubs.values() if club.competition_id is None and capacity[club.id] > 0]
    slots = []
    for _ in range(count):
        viable = [club for club in candidates if allocations[club.id] < min(capacity[club.id], cfg.demography.academies.max_club_allocation)]
        urgent = [club for club in viable if keeper_counts[club.id] + keeper_allocations[club.id] < guard.min_goalkeepers
                  or len(club.player_ids) + allocations[club.id] < guard.min_squad]
        if urgent: viable = urgent
        if not viable:
            continue
        club = weighted_choice(viable, [max(1, nominal_size(cfg) - len(item.player_ids) - allocations[item.id]) for item in viable], rng)
        keeper = keeper_counts[club.id] + keeper_allocations[club.id] < guard.min_goalkeepers
        slots.append(Slot(club, keeper))
        allocations[club.id] += 1
        if keeper: keeper_allocations[club.id] += 1
    events = []

    def add(club: Club | None, prospect: Prospect, keeper: bool = False) -> None:
        position = Position.GOALKEEPER if keeper else Position(weighted_choice(positions, weights, rng))
        events.append(PlayerGenerated(generate_player(world, world.next_id + len(events), club, position, prospect.nation, rng, prospect)))

    prospects = [draw_prospect(world, playing_regime, rng) for _ in slots]
    for slot, prospect in zip(slots, place(slots, prospects, cfg, rng)):
        add(slot.club, prospect, slot.goalkeeper)
    prospects = [draw_prospect(world, outside_regime, rng) for _ in range(external_count)]
    for prospect, club in zip(prospects, place_outside(prospects, external, {club.id: capacity[club.id] for club in external}, cfg, rng)):
        add(club, prospect)
    return events
