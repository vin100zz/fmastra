"""International windows and edition fixtures, independent of the July rollover."""
from core.domain.date import Date
from core.domain.matches import Match
from core.domain.international import InternationalEdition
from core.domain.world import World
from core.randomness import stream

QUOTAS = {"Europe": 14, "AmSud": 5, "AmNord": 3, "Afrique": 5, "Asie": 4, "Oceanie": 1}
# A Nations League's divisions A, B and C have four groups of four; the last one takes the nations left, in groups of four
# at most so that every group fits in the six match days.
DIVISION_GROUPS, GROUP_SIZE = 4, 4
LEAGUE_ROUNDS = 6
SEMI_FINALS, FINAL = 15, 16
# A camp gathers three days before a window's first match and lets its players go two days after its last.
CAMP_BEFORE, CAMP_AFTER = 3, 2


def edition_kind(world: World, year: int) -> str | None:
    rules = world.config.international
    if year >= rules.first_euro and (year - rules.first_euro) % 4 == 0:
        return "euro"
    if year >= rules.first_world_cup and (year - rules.first_world_cup) % 4 == 0:
        return "world"
    return None


def nations_league(world: World, year: int) -> bool:
    """A Nations League ends in the odd year before each tournament."""
    return edition_kind(world, year) is None and edition_kind(world, year + 1) is not None


def windows(year: int) -> list[tuple[Date, Date]]:
    """A tournament's qualifying windows, once the Nations League before it has played its groups: March, September,
    October and November of the year before, then March of its own."""
    return [(Date(year - 1, 3, 18), Date(year - 1, 3, 22)), (Date(year - 1, 9, 3), Date(year - 1, 9, 7)),
            (Date(year - 1, 10, 8), Date(year - 1, 10, 12)), (Date(year - 1, 11, 12), Date(year - 1, 11, 16)),
            (Date(year, 3, 18), Date(year, 3, 22))]


def league_windows(year: int) -> list[tuple[Date, Date]]:
    """A Nations League's group windows: September, October and November of the year before its finals."""
    return [(Date(year - 1, 9, 3), Date(year - 1, 9, 7)), (Date(year - 1, 10, 8), Date(year - 1, 10, 12)),
            (Date(year - 1, 11, 12), Date(year - 1, 11, 16))]


def league_finals(year: int) -> tuple[Date, Date]:
    """The day of a Nations League's semi-finals and the day of its final, in June: far enough from the European final at
    the end of May that the club calendar keeps it."""
    return Date(year, 6, 6), Date(year, 6, 10)


def finals_camp(edition: InternationalEdition) -> tuple[Date, Date]:
    """When the finalists gather: around a Nations League's semi-finals and final, five weeks from early June for a
    tournament."""
    if edition.kind == "nations":
        semi_finals, final = league_finals(edition.year)
        return semi_finals.add_days(-CAMP_BEFORE), final.add_days(CAMP_AFTER)
    return Date(edition.year, 6, 8), Date(edition.year, 7, 14)


def edition_groups(edition: InternationalEdition) -> list[list[int]]:
    """The groups of an edition's first stage: a tournament's qualifying groups, every group of a Nations League."""
    return edition.qualification_groups or [group for division in edition.divisions for group in division]


def planned_windows(world: World, year: int) -> list[tuple[Date, Date]]:
    """The windows of the edition that ends in a year: as it was drawn once it is, otherwise as the calendar will draw it.
    A Nations League is drawn with the tournament after it: once that one is, a Nations League not drawn with it never will."""
    edition = world.international.editions.get(year)
    if edition:
        return edition.windows
    if edition_kind(world, year):
        return windows(year)
    if nations_league(world, year) and year + 1 not in world.international.editions:
        return league_windows(year)
    return []


def reserved_dates(world: World, season: int) -> list[Date]:
    """The days the club calendar keeps free for the selections. The club calendar leaves its rest around each of them:
    of a window's camp, only the days that rest does not already cover are reserved, so that a club plays up to the day
    before the camp and again from the day after it, never closer than that rest to a match of the window."""
    if not world.international.nations:
        return []
    rest = world.config.world.europe.min_rest_days
    def camp(first: Date, last: Date) -> tuple[Date, Date]:
        return (min(first.add_days(rest - 1 - CAMP_BEFORE), first), max(last.add_days(CAMP_AFTER + 1 - rest), last))
    dates = set()
    for year in range(season, season + 4):
        spans = [camp(first, last) for first, last in planned_windows(world, year)]
        if edition_kind(world, year):
            spans.append((Date(year, 6, 5), Date(year, 7, 16)))
        elif spans:
            spans.append(camp(*league_finals(year)))
        for first, last in spans:
            for offset in range(last.ordinal() - first.ordinal() + 1):
                day = first.add_days(offset)
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


def european(world: World) -> list[int]:
    """The European nations, the strongest first."""
    europe = sorted((n.id for n in world.international.nations.values() if n.federation == "Europe"),
                    key=lambda nid: (-world.international.nations[nid].strength, nid))
    if not 50 <= len(europe) <= 60:
        raise ValueError("International qualifications require 50 to 60 active European nations")
    return europe


def draw_groups(world: World, teams: list[int], count: int, *key) -> list[list[int]]:
    """Teams dealt into `count` groups pot by pot, the strongest first: each pot gives one team to as many groups as it has
    teams, drawn at random."""
    teams = sorted(teams, key=lambda nid: (-world.international.nations[nid].strength, nid))
    rng = stream(world.seed, *key)
    groups = [[] for _ in range(count)]
    for offset in range(0, len(teams), count):
        pot = teams[offset:offset + count]
        rng.shuffle(pot)
        indices = list(range(count))
        rng.shuffle(indices)
        for index, nid in zip(indices, pot):
            groups[index].append(nid)
    return groups


def create_edition(world: World, year: int) -> InternationalEdition:
    kind = edition_kind(world, year)
    if not kind:
        raise ValueError("No international tournament in this year")
    edition = InternationalEdition(year, kind, windows=windows(year))
    edition.qualification_groups = draw_groups(world, european(world), 10, "international-groups", year)
    world.international.editions[year] = edition
    dates = [day for pair in edition.windows for day in pair]
    for group in edition.qualification_groups:
        group_fixtures(world, edition, group, dates, 1, True)
    return edition


def create_league(world: World, year: int, divisions: list[list[int]]) -> InternationalEdition:
    """A Nations League from the nations of each of its divisions, drawn into groups by pots, home and away in each."""
    if not nations_league(world, year):
        raise ValueError("No Nations League ends in this year")
    edition = InternationalEdition(year, "nations", windows=league_windows(year))
    last = len(divisions) - 1
    edition.divisions = [draw_groups(world, teams, DIVISION_GROUPS if index < last else -(-len(teams) // GROUP_SIZE),
                                     "nations-groups", year, index)
                         for index, teams in enumerate(divisions)]
    world.international.editions[year] = edition
    dates = [day for pair in edition.windows for day in pair]
    for group in edition_groups(edition):
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
