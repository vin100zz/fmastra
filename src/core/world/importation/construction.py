"""Build a new world from normalized records without file access."""
from __future__ import annotations

from collections import Counter, defaultdict

from core.config.model import Config
from core.domain.clubs import Club, ClubPersonality, ClubStatus, Competition
from core.domain.date import Date, next_annual_date
from core.domain.players import Contract, Player, Position
from core.domain.world import World
from core.engine.abilities import generate_attributes, overall
from core.randomness import stream
from core.world.calendar import schedule
from core.world.finances import initial_finances
from .records import SourceClub, SourcePlayer
from .selection import select_squad
from .source_positions import parse_positions
from .synthesis import club_strength, estimate_level, expected_wage, intrinsic_value


def create_player(row: SourcePlayer, cfg: Config, seed: int, date: Date, corrections: Counter) -> Player:
    rng = stream(seed, "import-player", row.id)
    positions = parse_positions(row.positions)
    age = row.born.age_on(date)
    if age < 0:
        raise ValueError(f"Player {row.id} is born after the start date")
    level = estimate_level(row.value, row.wage, age, positions[0], cfg)
    attributes = generate_attributes(level, positions[0], cfg, rng)
    rating = overall(attributes, positions[0], cfg)
    synthesis = cfg.import_settings.player_synthesis
    margin = rng.uniform(synthesis.default_potential_margin, synthesis.young_potential_margin) if age < synthesis.potential_age_threshold else synthesis.default_potential_margin
    potential = min(cfg.attributes.bounds.max, rating + margin)
    surname, separator, given_name = row.name.partition(",")
    surname, given_name = surname.strip(), given_name.strip() if separator else ""
    free = row.club_id == cfg.import_settings.source_format.free_agent_club_id
    contract = None
    if row.value <= 0: corrections["missing_values"] += 1
    if not free:
        end = row.end
        if end is None:
            # Contract expiry is the day before the configured annual release.
            release = cfg.world.key_dates.contract_release
            end = next_annual_date(date, release.month, release.day).add_days(-1)
            corrections["missing_contracts"] += 1
        elif end <= date:
            while end <= date: end = end.add_years(1)
            corrections["expired_contracts"] += 1
        wage = row.wage
        if wage <= 0:
            wage = expected_wage(intrinsic_value(rating, age, positions[0], cfg), cfg)
            corrections["missing_wages"] += 1
        contract = Contract(wage, end, date)
    injuries = cfg.states.injuries
    contracts = cfg.management.contracts
    return Player(row.id, f"{given_name} {surname}".strip(), surname, given_name, row.nations,
                  row.born, positions[0], {position: cfg.import_settings.positions.secondary_affinity for position in positions[1:]},
                  attributes, rating, potential, cfg.states.fitness.initial, cfg.states.form.initial,
                  cfg.states.moral.initial, rng.uniform(injuries.fragility_min, injuries.fragility_max),
                  rng.uniform(contracts.ego_min, contracts.ego_max), None if free else row.club_id, contract)


def construct_world(source_clubs: list[SourceClub], source_players: list[SourcePlayer], cfg: Config,
                    seed: int, nation_names: dict[str, str]) -> World:
    initial = cfg.world.start_date
    date = Date(initial.year, initial.month, initial.day)
    leagues = {league.division_id: league for league in cfg.world.competitions}
    clubs: dict[int, Club] = {}
    for row in sorted(source_clubs, key=lambda item: item.id):
        if row.id in clubs: raise ValueError(f"Duplicate club ID {row.id}")
        rng = stream(seed, "import-club", row.id)
        reputation, academy = club_strength(row.capacity, cfg, rng)
        rules = cfg.management.personality
        personality = ClubPersonality(*(rng.uniform(getattr(rules, name).min, getattr(rules, name).max)
                                        for name in ("risk_appetite", "youth_preference", "wage_aggression", "negotiation_patience")))
        active = row.division_id in leagues
        clubs[row.id] = Club(row.id, row.name, row.nation, row.division_id, row.division_id if active else None,
                             ClubStatus.ACTIVE if active else ClubStatus.DORMANT, row.capacity if row.capacity > 0 else None,
                             reputation, academy, rng.choice(tuple(cfg.formations.formations)), personality)
    grouped: dict[int | None, list[Player]] = defaultdict(list)
    corrections = Counter()
    seen = set()
    identities: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for row in source_players:
        if row.id in seen: raise ValueError(f"Duplicate player ID {row.id}")
        seen.add(row.id)
        if row.club_id != cfg.import_settings.source_format.free_agent_club_id and row.club_id not in clubs:
            raise ValueError(f"Player {row.id}: unknown club {row.club_id}")
        player = create_player(row, cfg, seed, date, corrections)
        grouped[player.club_id].append(player)
        identities[player.nation].append((player.given_name, player.surname))
    players: dict[int, Player] = {}
    excluded: list[int] = []
    selection = cfg.import_settings.squad_selection
    for club_id, squad in grouped.items():
        if club_id is None:
            retained = sorted(squad, key=lambda player: player.id)
        else:
            retained, removed = select_squad(squad, selection.max_players, selection.reserved_goalkeepers)
            excluded.extend(removed)
            clubs[club_id].player_ids = [player.id for player in retained]
        players.update((player.id, player) for player in retained)
    competitions: dict[int, Competition] = {}
    for league in cfg.world.competitions:
        ids = [club.id for club in clubs.values() if club.competition_id == league.division_id]
        if len(ids) != league.club_count:
            raise ValueError(f"{league.name}: expected {league.club_count} clubs, found {len(ids)}")
        competitions[league.division_id] = Competition(league.division_id, league.name, league.nation, league.level, ids)
    guard = cfg.management.guardrails
    for club in clubs.values():
        squad = [players[player_id] for player_id in club.player_ids]
        if club.competition_id is not None:
            if len(squad) < guard.min_squad or sum(player.position == Position.GOALKEEPER for player in squad) < guard.min_goalkeepers:
                raise ValueError(f"{club.name}: insufficient contracted squad or goalkeepers")
        initial_finances(club, squad, cfg, leagues[club.competition_id].club_count if club.competition_id else None)
        if club.wage_bill > club.wage_cap:
            raise ValueError(f"{club.name}: starting wages exceed funding")
    season = date.year if date.month >= cfg.world.key_dates.population_review.month else date.year - 1
    next_id = max([*clubs, *seen], default=0) + 1
    world = World(date, season, seed, cfg, dict(sorted(players.items())), clubs, competitions, {}, next_id)
    world.nation_names = nation_names
    world.identity_pool = {code: sorted(pool) for code, pool in sorted(identities.items())}
    world.excluded_player_ids = sorted(excluded)
    world.last_annual_review = season
    world.rngs = {name: stream(seed, name) for name in ("matches", "market", "states", "progression", "demography")}
    for competition in competitions.values():
        matches = schedule(competition, season, world.next_id, cfg, stream(seed, "calendar", season, competition.id))
        competition.match_ids = [match.id for match in matches]
        world.matches.update((match.id, match) for match in matches)
        world.next_id += len(matches)
    active_players = [player for player in players.values() if player.club_id and clubs[player.club_id].competition_id]
    nations = Counter(player.nation for player in active_players)
    world.nation_targets = {nation: count / len(active_players) for nation, count in sorted(nations.items())}
    buckets = cfg.demography.cohort.level_buckets
    counts = [sum(low <= player.rating < high or (index == len(buckets) - 1 and player.rating == high)
                  for player in active_players) for index, (low, high) in enumerate(buckets)]
    world.level_targets = tuple(count / len(active_players) for count in counts)
    world.external_target = len(players) - len(active_players)
    world.import_summary = {"source_clubs": len(source_clubs), "source_players": len(source_players),
                            "players": len(players), "active_players": len(active_players), "excluded": len(excluded),
                            "free_agents": len(grouped[None]), "active_clubs": len(world.active_clubs()),
                            "missing_capacities": sum(row.capacity <= 0 for row in source_clubs), **corrections}
    for player in players.values(): world.trajectories[player.id] = [(season, player.rating)]
    world.finance_history_since = world.movement_history_since = world.date
    return world
