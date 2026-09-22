"""International windows and edition fixtures, independent of the July rollover."""
from core.domain.date import Date
from core.domain.matches import Match
from core.domain.international import InternationalEdition
from core.domain.world import World
from core.randomness import stream

QUOTAS = {"Europe": 14, "AmSud": 5, "AmNord": 3, "Afrique": 5, "Asie": 4, "Oceanie": 1}


def edition_kind(world: World, year: int) -> str | None:
    rules = world.config.international
    if year >= rules.first_euro and (year - rules.first_euro) % 4 == 0:
        return "euro"
    if year >= rules.first_world_cup and (year - rules.first_world_cup) % 4 == 0:
        return "world"
    return None


def windows(year: int) -> list[tuple[Date, Date]]:
    return [(Date(year - 2, 9, 3), Date(year - 2, 9, 7)),
            (Date(year - 2, 11, 12), Date(year - 2, 11, 16)),
            (Date(year - 1, 3, 18), Date(year - 1, 3, 22)),
            (Date(year - 1, 6, 10), Date(year - 1, 6, 14)),
            (Date(year - 1, 11, 12), Date(year - 1, 11, 16))]


def reserved_dates(world: World, season: int) -> list[Date]:
    if not world.international.nations:
        return []
    dates = set()
    for year in range(season, season + 4):
        if not edition_kind(world, year):
            continue
        for first, last in windows(year):
            for offset in range(-3, last.ordinal() - first.ordinal() + 3):
                day = first.add_days(offset)
                if season <= day.year <= season + 1:
                    dates.add(day)
        for offset in range(42):
            day = Date(year, 6, 5).add_days(offset)
            if season <= day.year <= season + 1:
                dates.add(day)
    return sorted(dates)


def add_match(world: World, edition: InternationalEdition, number: int, day: Date,
              home: int, away: int, neutral: bool = False) -> Match:
    match = Match(world.next_id, edition.competition_id, edition.year, number, day, home, away, neutral=neutral)
    world.next_id += 1
    world.international.matches[match.id] = match
    return match


def group_fixtures(world: World, edition: InternationalEdition, group: list[int], dates: list[Date],
                   first_round: int, double: bool) -> None:
    rotating = list(group)
    if len(rotating) % 2:
        rotating.append(None)
    rounds = []
    for index in range(len(rotating) - 1):
        pairs = [(rotating[i], rotating[-i - 1]) for i in range(len(rotating) // 2)
                 if rotating[i] is not None and rotating[-i - 1] is not None]
        rounds.append(pairs if index % 2 == 0 else [(b, a) for a, b in pairs])
        rotating = [rotating[0], rotating[-1], *rotating[1:-1]]
    if double:
        rounds += [[(b, a) for a, b in pairs] for pairs in rounds[:]]
    for index, pairs in enumerate(rounds):
        for home, away in pairs:
            add_match(world, edition, first_round + index, dates[index], home, away, not double)


def create_edition(world: World, year: int) -> InternationalEdition:
    kind = edition_kind(world, year)
    if not kind:
        raise ValueError("No international tournament in this year")
    edition = InternationalEdition(year, kind)
    europe = sorted((n.id for n in world.international.nations.values() if n.federation == "Europe"),
                    key=lambda nid: (-world.international.nations[nid].strength, nid))
    if not 50 <= len(europe) <= 60:
        raise ValueError("International qualifications require 50 to 60 active European nations")
    rng = stream(world.seed, "international-groups", year)
    groups = [[] for _ in range(10)]
    for offset in range(0, len(europe), 10):
        pot = europe[offset:offset + 10]
        rng.shuffle(pot)
        indices = list(range(10))
        rng.shuffle(indices)
        for index, nid in zip(indices, pot):
            groups[index].append(nid)
    edition.qualification_groups = groups
    world.international.editions[year] = edition
    dates = [day for pair in windows(year) for day in pair]
    for group in groups:
        group_fixtures(world, edition, group, dates, 1, True)
    return edition


def draw_final_groups(world: World, edition: InternationalEdition) -> list[list[int]]:
    count = 4 if edition.kind == "euro" else 8
    teams = sorted(edition.qualifiers, key=lambda nid: (-world.international.nations[nid].strength, nid))
    rng = stream(world.seed, "international-finals-draw", edition.year)
    pots = [teams[i:i + count] for i in range(0, len(teams), count)]
    groups = [[] for _ in range(count)]
    for pot in pots:
        rng.shuffle(pot)
    # Backtracking across pots avoids a greedy draw painting itself into a corner.
    def place(index: int) -> bool:
        if index == len(teams):
            return True
        pot, position = divmod(index, count)
        nid = pots[pot][position]
        federation = world.international.nations[nid].federation
        choices = list(range(count))
        rng.shuffle(choices)
        for group_index in choices:
            group = groups[group_index]
            if len(group) != pot:
                continue
            same = sum(world.international.nations[other].federation == federation for other in group)
            if edition.kind == "world" and same >= (2 if federation == "Europe" else 1):
                continue
            group.append(nid)
            if place(index + 1):
                return True
            group.pop()
        return False
    if not place(0):
        raise ValueError("Cannot draw final groups with federation restrictions")
    return groups
