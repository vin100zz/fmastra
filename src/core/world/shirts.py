"""Shirt numbers: each player of a squad wears his own, after his position and his place in the squad.

A starter takes a low number, one of those of his position from 1 to 11, the most prestigious; a backup one of those
of his position from 12 to 29; a young player who does not start the 20s and 30s of his position. Past those, from
30 up, the first number free. A player keeps his number as long as he stays: on 1 July, the one who has won his
place, or grown out of the youngsters, takes a number of his new rank left free (see `renumber`).
"""
from __future__ import annotations

from core.ai.assignment import maximize_assignment
from core.domain.clubs import Club
from core.domain.players import Player, Position
from core.domain.world import World
from core.engine.abilities import overall
from .events import ShirtsRenumbered

# Under this age, a player who does not start wears the high numbers of his position.
YOUTH_AGE = 21
# A player's place in his squad, and the numbers that go with each: 1 to 11, 12 to 29, from 30 up.
STARTER, BACKUP, YOUTH = 0, 1, 2
# By position: the number of a starter, those he may also take, then the numbers of a backup and those of a young
# player. A midfielder's backup numbers are the 20s the other positions leave.
NUMBERS: dict[Position, tuple[tuple[int, ...], tuple[int, ...], tuple[int, ...], tuple[int, ...]]] = {
    Position.GOALKEEPER: ((1,), (), (16,), (30,)),
    Position.LEFT_BACK: ((3,), (), (13, 23), (23, 33)),
    Position.RIGHT_BACK: ((2,), (), (12, 22), (22, 32)),
    Position.CENTER_BACK: ((4, 5), (6,), (14, 15, 24, 25), (24, 25, 34, 35)),
    Position.DEFENSIVE_MIDFIELDER: ((6,), (8,), (26, 28, 20), (26, 36)),
    Position.CENTRAL_MIDFIELDER: ((8,), (6, 7, 11), (28, 20, 26), (28, 38)),
    Position.ATTACKING_MIDFIELDER: ((10,), (8, 7, 11), (20, 28, 26), (20,)),
    Position.LEFT_WINGER: ((11,), (7, 10), (21,), (21, 31)),
    Position.RIGHT_WINGER: ((7,), (11, 10), (17, 27), (27, 37)),
    Position.STRIKER: ((9,), (10, 11), (18, 19, 29), (29, 39)),
}
# From 30 up a number no longer goes with a position: the first free one. Those under 30 come after, so that a squad
# always finds one.
ANY_NUMBER = (*range(30, 100), *range(12, 30), *range(1, 12))
NO_NUMBER = 3


def tier(number: int | None) -> int:
    """The place a number goes with: STARTER from 1 to 11, BACKUP from 12 to 29, YOUTH from 30; NO_NUMBER without one."""
    return NO_NUMBER if number is None else STARTER if number <= 11 else BACKUP if number <= 29 else YOUTH


def regular_eleven(world: World, club: Club) -> set[int]:
    """The players the club's formation fields when all are fit: the first team (the reserve aside), each at the place he
    fills best, by his level there and his affinity for it."""
    cfg = world.config
    squad = sorted((player for pid in club.player_ids if (player := world.players[pid]).reserve_since is None), key=lambda player: player.id)
    roles = [Position(role) for role in cfg.formations.formations.get(club.formation, ())][:len(squad)]
    if not roles: return set()
    penalty = cfg.attributes.out_of_position
    scores = [[overall(player.attributes, role, cfg) * (penalty.base + penalty.factor * player.affinity(role)) for player in squad]
              for role in roles]
    return {squad[index].id for index in maximize_assignment(scores)}


def standing(world: World, player: Player, eleven: set[int]) -> int:
    """STARTER in the regular eleven, else YOUTH under YOUTH_AGE, else BACKUP."""
    if player.id in eleven: return STARTER
    return YOUTH if player.born.age_on(world.date) < YOUTH_AGE else BACKUP


def wanted(position: Position, level: int) -> tuple[int, ...]:
    """The numbers a player of `position` asks for at his `level` (STARTER, BACKUP, YOUTH), his first choice first."""
    first, also, backup, youth = NUMBERS[position]
    numbers = (*first, *also, *backup, *youth) if level == STARTER else (*backup, *youth) if level == BACKUP else youth
    return (*numbers, *ANY_NUMBER)


def assign(world: World, player: Player) -> int:
    """The number of a player who joins a club (`player.club_id`, its squad already counting him): the first free of those
    he asks for at his place in it."""
    club = world.clubs[player.club_id]
    used = {number for pid in club.player_ids if pid != player.id and (number := world.players[pid].shirt) is not None}
    level = standing(world, player, regular_eleven(world, club))
    return next(number for number in wanted(player.position, level) if number not in used)


def _claims(world: World, club: Club) -> list[tuple[int, Player]]:
    """The squad by the claim each has on a number: starters, backups, then the young ones, the best first."""
    eleven, players = regular_eleven(world, club), [world.players[pid] for pid in club.player_ids]
    return sorted(((standing(world, player, eleven), player) for player in players), key=lambda item: (item[0], -item[1].rating, item[1].id))


def _take(numbers: dict[int, int | None], pid: int, choices: tuple[int, ...], used: set[int], under: int = NO_NUMBER + 1) -> bool:
    """Player `pid` takes the first free of `choices` whose tier is under `under`, and leaves his own to the others."""
    number = next((number for number in choices if number not in used and tier(number) < under), None)
    if number is None: return False
    used.discard(numbers[pid])
    numbers[pid] = number
    used.add(number)
    return True


def number_squad(world: World, club: Club) -> int:
    """Numbers the players of a squad who have none and keeps the others' (of two wearing the same, the first by their
    claims keeps it); returns how many it chose. The starters first take the number of their position, then those they
    may also take: a holding midfielder has the 6 before a third centre back."""
    claims = _claims(world, club)
    numbers, used = {}, set()
    for _, player in claims:
        numbers[player.id] = None if player.shirt in used else player.shirt
        used.add(numbers[player.id])
    used.discard(None)
    missing = [(level, player.id, player.position) for level, player in claims if numbers[player.id] is None]
    for level, pid, position in missing:
        if level == STARTER: _take(numbers, pid, NUMBERS[position][0], used)
    for level, pid, position in missing:
        if numbers[pid] is None: _take(numbers, pid, wanted(position, level), used)
    for player in (world.players[pid] for pid in club.player_ids): player.shirt = numbers[player.id]
    return len(missing)


def number_squads(world: World) -> int:
    """Numbers every squad: a new game after its source, a save made before the game had numbers."""
    return sum(number_squad(world, club) for club in world.clubs.values() if club.player_ids)


def renumber(world: World, club: Club) -> dict[int, int]:
    """The squad's new numbers on 1 July, by player: a starter without a number from 1 to 11 takes the number of his
    position, else one he may also take, left free; a backup without one under 30, one of his from 12 to 29. Nobody gives
    his own up: what a player leaves, the next ones can take."""
    claims = _claims(world, club)
    numbers = {player.id: player.shirt for _, player in claims}
    used = {number for number in numbers.values() if number is not None}
    for phase in (0, 1):
        for level, player in claims:
            if level == YOUTH or tier(numbers[player.id]) <= level: continue
            first, also, backup, _ = NUMBERS[player.position]
            choices = (first, also)[phase] if level == STARTER else (backup, ())[phase]
            _take(numbers, player.id, choices, used, tier(numbers[player.id]))
    # A player without a number, which no rule leaves, takes one all the same.
    for level, player in claims:
        if numbers[player.id] is None: _take(numbers, player.id, wanted(player.position, level), used)
    return {pid: number for pid, number in numbers.items() if number != world.players[pid].shirt}


def renumbering_events(world: World) -> list[ShirtsRenumbered]:
    """1 July: the squads whose numbers change, once the players whose contracts ended have left (see `renumber`)."""
    return [ShirtsRenumbered(club.id, numbers) for club in sorted(world.clubs.values(), key=lambda club: club.id)
            if club.player_ids and (numbers := renumber(world, club))]
