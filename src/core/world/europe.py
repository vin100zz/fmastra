"""Annual European qualification, league draws and fresh knockout draws."""
from core.domain.clubs import Competition
from core.domain.matches import Match, MatchResult, Lineup
from core.domain.world import World, JournalEntry
from core.randomness import stream
from .calendar import Standing, standings
from .cup_matches import decide_winner
from .europe_draw import draw_matchdays
from .human import record as add_news

COMPETITIONS = ((-101, "C1", "Ligue des champions"), (-103, "C3", "Ligue Europa"),
                (-104, "C4", "Conference League"))
KNOCKOUT_NAMES = ("Barrages", "Huitièmes de finale", "Quarts de finale", "Demi-finales", "Finale")


def association(world: World, club_id: int) -> str:
    club = world.clubs[club_id]
    league = world.competitions.get(club.competition_id)
    return league.nation if league else (club.cup_nation or club.nation)


def initialize_europe(world: World) -> None:
    if world.european_quota_ranges:
        for cid, code, name in COMPETITIONS:
            world.competitions[cid] = Competition(cid, name, "EUR", 0, [], kind="europe", code=code)


def resolve_european_quotas(world: World, season: int) -> dict[str, tuple[int, int, int]]:
    """Draw this season's actual quota within each nation's range, keeping each competition's total fixed."""
    ranges = world.european_quota_ranges
    if not ranges:
        return {}
    rng = stream(world.seed, "europe-quota-allocation", season)
    resolved: dict[str, list[int]] = {nation: [] for nation in ranges}
    for index in range(3):
        counts = {nation: bounds[index][0] for nation, bounds in ranges.items()}
        pool = [nation for nation, bounds in sorted(ranges.items())
                for _ in range(bounds[index][1] - bounds[index][0])]
        rng.shuffle(pool)
        for nation in pool[:world.config.world.europe.club_count - sum(counts.values())]:
            counts[nation] += 1
        for nation in resolved:
            resolved[nation].append(counts[nation])
    return {nation: tuple(values) for nation, values in resolved.items()}


def qualify_europe(world: World, season: int, tables: dict[int, list[Standing]] | None = None) -> None:
    """Allocate C1, cup + league C3, then C4, before domestic promotions occur."""
    if not world.european_quota_ranges:
        return
    quotas_by_nation = resolve_european_quotas(world, season)
    selected = [[], [], []]
    for nation, quotas in sorted(quotas_by_nation.items()):
        eligible = sorted(cid for cid, club in world.clubs.items()
                          if not club.is_reserve and association(world, cid) == nation)
        if len(eligible) < sum(quotas):
            raise ValueError(f"{nation}: insufficient first teams for European quotas")
        league = next((c for c in world.competitions.values()
                       if c.kind == "league" and c.level == 1 and c.nation == nation), None)
        used = set()
        if tables is not None and league is not None:
            ranked = [row.club_id for row in tables[league.id] if row.club_id in eligible]
            cup = next(c for c in world.competitions.values() if c.kind == "cup" and c.nation == nation)
            cup_winner = next(cid for year, cid in world.champions[cup.id] if year == season - 1)
            for index, count in enumerate(quotas):
                winners = []
                if index == 1 and count and cup_winner not in used:
                    winners.append(cup_winner)
                winners.extend(cid for cid in ranked if cid not in used and cid not in winners)
                winners = winners[:count]
                if len(winners) != count:
                    raise ValueError(f"{nation}: league cannot fill European quota")
                selected[index].extend(winners)
                used.update(winners)
        else:
            # First season in simulated countries: draw from D1. Abroad: all first teams.
            pool = [cid for cid in eligible if league is None or cid in league.club_ids]
            rng = stream(world.seed, "europe-qualification", season, nation)
            for index, count in enumerate(quotas):
                for _ in range(count):
                    cid = rng.choices(pool, weights=[max(1, world.clubs[cid].reputation) **
                                      world.config.world.europe.reputation_exponent for cid in pool], k=1)[0]
                    selected[index].append(cid)
                    pool.remove(cid)
    for (cid, _, _), club_ids in zip(COMPETITIONS, selected):
        if len(club_ids) != world.config.world.europe.club_count or len(set(club_ids)) != len(club_ids):
            raise ValueError("Invalid European qualification allocation")
        world.competitions[cid].club_ids = sorted(club_ids)


def league_fixtures(world: World, cup: Competition, season: int, next_id: int) -> list[Match]:
    rules = world.config.world.europe
    ordered = sorted(cup.club_ids, key=lambda cid: (-world.clubs[cid].reputation, cid))
    size = rules.club_count // rules.pot_count
    pots = [ordered[i:i + size] for i in range(0, len(ordered), size)]
    days = draw_matchdays(pots, {cid: association(world, cid) for cid in ordered},
                         stream(world.seed, "europe-league-draw", season, cup.id),
                         rules.league_rounds, rules.draw_attempts)
    fixtures = []
    for number, pairs in enumerate(days, 1):
        for home, away in pairs:
            fixtures.append(Match(next_id + len(fixtures), cup.id, season, number,
                                  cup.round_dates[number - 1], home, away))
    return fixtures


def round_label(world: World, number: int) -> str:
    league_rounds = world.config.world.europe.league_rounds
    if number <= league_rounds:
        return f"Phase de ligue · Journée {number}"
    offset = number - league_rounds - 1
    label = KNOCKOUT_NAMES[offset // 2]
    return label if offset // 2 == len(KNOCKOUT_NAMES) - 1 else f"{label} · {'aller' if offset % 2 == 0 else 'retour'}"


def draw_knockout(world: World, cup: Competition, number: int, seeded: list[int],
                  unseeded: list[int] | None = None) -> None:
    rng = stream(world.seed, "europe-knockout-draw", world.season, cup.id, number)
    clubs = sorted(seeded)
    rng.shuffle(clubs)
    if unseeded is None:
        pairs = list(zip(clubs[::2], clubs[1::2]))
    else:
        others = sorted(unseeded)
        rng.shuffle(others)
        pairs = list(zip(others, clubs))  # Seeded clubs host the return leg.
    final = number == len(cup.round_dates)
    for home, away in pairs:
        first_id = world.next_id
        legs = [(home, away)] if final else [(home, away), (away, home)]
        for leg, (host, visitor) in enumerate(legs):
            match = Match(world.next_id, cup.id, world.season, number + leg,
                          cup.round_dates[number + leg - 1], host, visitor,
                          neutral=final, first_leg_id=first_id if leg else None)
            world.matches[match.id] = match
            cup.match_ids.append(match.id)
            world.next_id += 1


def aggregate_score(world: World, match: Match, result: MatchResult | None = None) -> tuple[int, int] | None:
    result = result or match.result
    if match.first_leg_id is None or result is None:
        return None
    first = world.matches[match.first_leg_id]
    if first.result is None:
        raise ValueError("Return leg played before the first leg")
    return result.home_goals + first.result.away_goals, result.away_goals + first.result.home_goals


def decide_european_winner(world: World, match: Match, result: MatchResult, lineups: list[Lineup]) -> None:
    cup = world.competitions[match.competition_id]
    if match.neutral:
        decide_winner(world, match, result, lineups)
    elif match.first_leg_id is not None:
        home, away = aggregate_score(world, match, result)
        if home != away:
            result.winner_id = match.home_id if home > away else match.away_id
        else:
            decide_winner(world, match, result, lineups, force_shootout=True)
    elif match.round_number > len(cup.round_dates):
        raise ValueError("Unknown European round")


def progress_europe(world: World) -> None:
    rules = world.config.world.europe
    for cup in world.competitions.values():
        if cup.kind != "europe" or not cup.match_ids:
            continue
        matches = [world.matches[mid] for mid in cup.match_ids]
        current = max(m.round_number for m in matches)
        last = [m for m in matches if m.round_number == current]
        if any(m.result is None for m in last):
            continue
        if current == rules.league_rounds:
            if any(m.result is None for m in matches):
                continue
            ranked = [row.club_id for row in standings(cup, matches, world.config)]
            cut = rules.direct_places
            half = rules.playoff_places // 2
            draw_knockout(world, cup, current + 1, ranked[cut:cut + half], ranked[cut + half:cut + 2 * half])
            continue
        winners = [m.result.winner_id for m in last]
        if any(cid is None for cid in winners):
            raise ValueError("European knockout tie without a winner")
        if current == len(cup.round_dates):
            champions = world.champions.setdefault(cup.id, [])
            if not any(year == world.season for year, _ in champions):
                champions.append((world.season, winners[0]))
                text = f"{world.clubs[winners[0]].name} remporte {cup.name}"
                world.journal.append(JournalEntry(world.date, "europe_winner", text, winners[0]))
                add_news(world, "europe_winner", text, winners[0])
        elif current == rules.league_rounds + 2:
            direct = [row.club_id for row in standings(cup, matches, world.config)][:rules.direct_places]
            draw_knockout(world, cup, current + 1, direct, winners)
        else:
            draw_knockout(world, cup, current + 1, winners)
