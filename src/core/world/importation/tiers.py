"""Which source players and clubs a new world keeps, tier by tier.

The simulated clubs keep their squads; outside them the world keeps what it needs and no more: the clubs its promoted
clubs come from, the stars and the wonderkids, the best free agents, the clubs that may reach a European cup, and enough
players of every nationality for its national team. A budget bounds the players outside the simulated clubs."""
from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import dataclass

from core.config.model import Config
from core.domain.clubs import Club
from core.domain.date import Date
from core.domain.players import Position
from core.math import clamp, interpolate
from .records import SourcePlayer
from .source_positions import ranked_positions

# In order of priority: a player belongs to the first tier that keeps him, and a full club drops the last ones first.
TIERS = ("simules", "vedettes", "plancher", "vivier", "clubs_etrangers", "agents_libres")


@dataclass(frozen=True, slots=True)
class Selection:
    players: dict[int, str]  # kept source player -> the tier that keeps him
    clubs: frozenset[int]


def association(club: Club, leagues: dict[int, str]) -> str:
    """The nation a club stands for in cups and in Europe: its league's, else its own affiliation."""
    return leagues[club.competition_id] if club.competition_id is not None else club.cup_nation or club.nation


def select_world(clubs: dict[int, Club], rows: list[SourcePlayer], cfg: Config, date: Date,
                 nation_names: dict[str, str], european_places: dict[str, int]) -> Selection:
    rules, selection = cfg.import_settings.squad_selection.tiers, cfg.import_settings.squad_selection
    leagues = {league.division_id: league.nation for league in cfg.world.competitions}
    simulated_nations = set(leagues.values())
    pool_divisions = {did for pool in cfg.world.promotion_relegation.reserves for did in pool.division_ids}
    free_id = cfg.import_settings.source_format.free_agent_club_id
    order: Callable[[SourcePlayer], tuple[int, int]] = lambda row: (-row.current_ability, row.id)
    squads: dict[int | None, list[SourcePlayer]] = defaultdict(list)
    for row in rows: squads[None if row.club_id == free_id else row.club_id].append(row)
    for squad in squads.values(): squad.sort(key=order)
    age = {row.id: row.born.age_on(date) for row in rows}
    keeper = {row.id: ranked_positions(row.position_ratings, row.positions)[0] == Position.GOALKEEPER for row in rows}
    simulated = [club for club in clubs.values() if club.competition_id is not None]
    simulated_ids = {club.id for club in simulated}

    def first_teams(nations: set[str] | None = None) -> dict[str, list[Club]]:
        """First teams outside the simulated leagues, by association, from the most famous."""
        found = defaultdict(list)
        for club in clubs.values():
            nation = association(club, leagues)
            if club.competition_id is None and not club.is_reserve and (nations is None or nation in nations):
                found[nation].append(club)
        return {nation: sorted(group, key=lambda club: (-club.reputation, club.id)) for nation, group in found.items()}

    pool = [club for club in clubs.values() if club.division_id in pool_divisions and not club.is_reserve and club.competition_id is None]
    foreign = set()
    for nation, group in first_teams().items():
        if nation in simulated_nations: continue
        if nation in european_places:
            count = clamp(european_places[nation] * rules.foreign.clubs_per_place, rules.foreign.min_clubs, rules.foreign.max_clubs)
            foreign.update(club.id for club in group[:int(count)])
        foreign.update(club.id for club in group if club.reputation >= rules.foreign.reputation)
    cup = {club.id for group in first_teams(simulated_nations).values() for club in group[:rules.cup.clubs]}

    def choose(foreign_players: int, free_agents: int, pool_players: int) -> dict[int, str]:
        kept: dict[int, str] = {}
        def keep(group, tier: str) -> None:
            for row in group: kept.setdefault(row.id, tier)
        target = rules.simulated
        for club in simulated:
            squad = squads.get(club.id, [])
            keepers = [row for row in squad if keeper[row.id]][:target.goalkeepers]
            taken = {row.id for row in keepers}
            prospects = sorted((row for row in squad if age[row.id] <= target.prospect_max_age and row.id not in taken),
                               key=lambda row: (-row.potential_ability, row.id))[:target.prospects]
            taken.update(row.id for row in prospects)
            keep((keepers + prospects + [row for row in squad if row.id not in taken])[:target.players], "simules")
        stars = rules.stars
        keep((row for row in rows if row.world_reputation / 100 >= stars.reputation
              or (row.potential_ability >= stars.wonderkid_potential and age[row.id] <= stars.wonderkid_max_age)), "vedettes")
        for club in pool: keep(squads.get(club.id, [])[:pool_players], "vivier")
        for club_id in sorted(foreign): keep(squads.get(club_id, [])[:foreign_players], "clubs_etrangers")
        everyone = selection.free_agents == "tous_conserves"
        keep(squads[None] if everyone else squads[None][:free_agents], "agents_libres")
        # Each nationality keeps a squad for its national team, deeper for a strong nation; never from a simulated club,
        # whose squad is already chosen.
        floor = rules.floor
        held = Counter(row.nations[0] for row in rows if row.id in kept)
        by_nation: dict[str, list[SourcePlayer]] = defaultdict(list)
        for row in sorted(rows, key=order):
            if row.id not in kept and row.club_id not in simulated_ids: by_nation[row.nations[0]].append(row)
        for nation, group in sorted(by_nation.items()):
            rule = cfg.nations.get(nation_names.get(nation, nation))
            strength = rule.strength if rule is not None else floor.min_strength
            wanted = round(interpolate(((floor.min_strength, floor.min_players), (floor.max_strength, floor.max_players)), strength))
            keep(group[:max(0, wanted - held[nation])], "plancher")
        return kept

    def outside(kept: dict[int, str]) -> int:
        return sum(1 for row in rows if row.id in kept and row.club_id not in simulated_ids)

    full = (rules.foreign.players, rules.free_agents.players, rules.pool.players)
    steps = [full, (rules.foreign.min_players, full[1], full[2]), (rules.foreign.min_players, full[1] // 2, full[2]),
             (rules.foreign.min_players, 0, full[2]), (rules.foreign.min_players, 0, full[2] // 2), (rules.foreign.min_players, 0, 0)]
    for step in dict.fromkeys(steps):
        kept = choose(*step)
        if outside(kept) <= rules.outside_budget: break
    # A club keeps at most a full squad, its first tiers first.
    members: dict[int, list[SourcePlayer]] = defaultdict(list)
    for row in rows:
        if row.id in kept and row.club_id != free_id: members[row.club_id].append(row)
    for squad in members.values():
        if len(squad) > selection.max_players:
            squad.sort(key=lambda row: (TIERS.index(kept[row.id]), -row.current_ability, row.id))
            for row in squad[selection.max_players:]: del kept[row.id]
    holding = {row.club_id for row in rows if row.id in kept}
    return Selection(kept, frozenset(simulated_ids | {club.id for club in clubs.values() if club.division_id in pool_divisions}
                                     | cup | foreign | (holding & set(clubs))))
