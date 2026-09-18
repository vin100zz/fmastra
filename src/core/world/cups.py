"""Annual domestic cups: eligibility, coordinated dates and successive open draws."""
from core.domain.clubs import Competition
from core.domain.date import Date
from core.domain.matches import Match
from core.domain.world import World, JournalEntry
from core.randomness import stream
from .calendar import schedule

CUP_NAMES = {"FRA": "Coupe de France", "ENG": "FA Cup", "ESP": "Coupe du Roi",
             "ITA": "Coupe d’Italie", "GER": "Coupe d’Allemagne"}
ROUND_NAMES = ("32es de finale", "16es de finale", "8es de finale", "Quarts de finale", "Demi-finales", "Finale")


def initialize_cups(world: World) -> None:
    nations = {c.nation for c in world.competitions.values() if c.kind == "league"}
    for index, nation in enumerate(sorted(CUP_NAMES), 1):
        if nation in nations:
            world.competitions[-index] = Competition(-index, CUP_NAMES[nation], nation, 0, [], kind="cup")


def cup_dates(world: World, season: int) -> list[Date]:
    from .europe_calendar import competition_dates
    return competition_dates(world, season, domestic=True)


def participants(world: World, cup: Competition, season: int) -> list[int]:
    leagues = {c.id: c for c in world.competitions.values() if c.kind == "league"}
    eligible = []
    for club in sorted(world.clubs.values(), key=lambda c: c.id):
        league = leagues.get(club.competition_id)
        nation = league.nation if league else (club.cup_nation or club.nation)
        if not club.is_reserve and nation == cup.nation:
            eligible.append(club)
    mandatory = [c.id for c in eligible if c.competition_id in leagues and leagues[c.competition_id].level <= 2]
    if len(mandatory) > 64 or len(eligible) < 64:
        raise ValueError(f"{cup.name}: cannot select exactly 64 first teams")
    selected = set(mandatory)
    pool = [c for c in eligible if c.id not in selected]
    rng = stream(world.seed, "cup-participants", season, cup.id)
    while len(mandatory) < 64:
        club = rng.choices(pool, weights=[max(1, c.reputation) ** 2 for c in pool], k=1)[0]
        mandatory.append(club.id)
        pool.remove(club)
    return sorted(mandatory)


def draw(world: World, cup: Competition, season: int, round_number: int,
         club_ids: list[int], next_id: int) -> list[Match]:
    clubs = sorted(club_ids)
    stream(world.seed, "cup-draw", season, cup.id, round_number).shuffle(clubs)
    return [Match(next_id + i // 2, cup.id, season, round_number, cup.round_dates[round_number - 1],
                  clubs[i], clubs[i + 1], neutral=round_number == 6) for i in range(0, len(clubs), 2)]


def season_fixtures(world: World, season: int) -> list[Match]:
    from .europe import league_fixtures
    from .europe_calendar import competition_dates
    cups = {c.nation: c for c in world.competitions.values() if c.kind == "cup"}
    european_dates = competition_dates(world, season) if world.european_quotas else []
    for cup in cups.values():
        cup.club_ids = participants(world, cup, season)
        cup.round_dates = cup_dates(world, season)
    fixtures, next_id = [], world.next_id
    for competition in world.competitions.values():
        if competition.kind == "cup":
            matches = draw(world, competition, season, 1, competition.club_ids, next_id)
        elif competition.kind == "europe":
            competition.round_dates = european_dates.copy()
            matches = league_fixtures(world, competition, season, next_id)
        else:
            cup = cups.get(competition.nation)
            reserved = (cup.round_dates if cup else []) + european_dates
            matches = schedule(competition, season, next_id, world.config,
                               stream(world.seed, "calendar", season, competition.id), reserved)
        fixtures.extend(matches)
        next_id += len(matches)
    return fixtures


def progress_cups(world: World) -> None:
    for cup in world.competitions.values():
        if cup.kind != "cup" or not cup.match_ids:
            continue
        matches = [world.matches[mid] for mid in cup.match_ids]
        current = max(m.round_number for m in matches)
        last = [m for m in matches if m.round_number == current]
        if any(m.result is None for m in last):
            continue
        winners = [m.result.winner_id for m in last]
        if any(cid is None for cid in winners):
            raise ValueError(f"{cup.name}: a knockout match has no winner")
        if current == 6:
            champions = world.champions.setdefault(cup.id, [])
            if not any(year == world.season for year, _ in champions):
                champions.append((world.season, winners[0]))
                world.journal.append(JournalEntry(world.date, "cup_winner",
                    f"{world.clubs[winners[0]].name} remporte {cup.name}.", winners[0]))
        else:
            for match in draw(world, cup, world.season, current + 1, winners, world.next_id):
                world.matches[match.id] = match
                cup.match_ids.append(match.id)
                world.next_id = match.id + 1
