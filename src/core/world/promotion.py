"""Plan simultaneous league movements from the completed season and reserve pools."""
from core.domain.clubs import Club
from core.domain.world import World
from core.randomness import stream
from .calendar import Standing
from .events import ClubDivisionChanged, DivisionsChanged


def reserve_clubs(world: World, division_ids: tuple[int, ...]) -> list[Club]:
    # League membership, rather than nationality, includes Welsh/Andorran clubs.
    return sorted((club for club in world.clubs.values()
                   if club.competition_id is None and club.division_id in division_ids), key=lambda club: club.id)


def promotion_event(world: World, tables: dict[int, list[Standing]]) -> DivisionsChanged:
    rules = world.config.world.promotion_relegation
    count = rules.club_count
    moves = []
    for reserve in sorted(rules.reserves, key=lambda pool: pool.nation):
        leagues = sorted((league for league in world.competitions.values() if league.nation == reserve.nation),
                         key=lambda league: league.level)
        if not leagues:
            continue
        for league in leagues:
            if len(league.club_ids) < 2 * count:
                raise ValueError(f"{league.name}: overlapping promotion and relegation places")
            if any(world.matches[mid].result is None for mid in league.match_ids):
                raise ValueError(f"{league.name}: season is not complete")
        for upper, lower in zip(leagues, leagues[1:]):
            moves.extend(ClubDivisionChanged(row.club_id, lower.id, upper.id, upper.id)
                         for row in tables[lower.id][:count])
            moves.extend(ClubDivisionChanged(row.club_id, upper.id, lower.id, lower.id)
                         for row in tables[upper.id][-count:])
        bottom = leagues[-1]
        candidates = reserve_clubs(world, reserve.division_ids)
        if len(candidates) < count:
            raise ValueError(f"{reserve.nation}: insufficient clubs in the non-simulated reserve")
        rng = stream(world.seed, "promotion", world.date.year, reserve.nation)
        for _ in range(count):
            club = rng.choices(candidates, weights=[max(1, item.reputation) ** rules.reputation_exponent
                                                   for item in candidates], k=1)[0]
            candidates.remove(club)
            moves.append(ClubDivisionChanged(club.id, None, bottom.id, bottom.id))
        # These clubs enter the pool after the draw, so cannot bounce straight back.
        moves.extend(ClubDivisionChanged(row.club_id, bottom.id, None, reserve.division_ids[0])
                     for row in tables[bottom.id][-count:])
    return DivisionsChanged(tuple(moves))
