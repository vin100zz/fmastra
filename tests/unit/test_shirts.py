"""Shirt numbers: each player of a squad wears his own, after his position and his place in the squad."""
from core.domain.date import Date
from core.domain.players import ATTRIBUTE_NAMES, Attributes, Contract, Position
from core.world.application import apply
from core.world.events import LoanEnded, LoanStarted, PlayerReleased, PlayerSigned
from core.world.shirts import BACKUP, STARTER, YOUTH, number_squad, number_squads, regular_eleven, renumber, renumbering_events, wanted
from infrastructure.importation.readers import shirt_number
from test_market import mini_world


def shape(player, level, position=None, born=None):
    """A player of `level` at every attribute, wholly at home at his position and a stranger to the others."""
    player.position = position or player.position
    player.attributes, player.rating = Attributes((level,) * len(ATTRIBUTE_NAMES)), level
    player.position_ratings = {item: 20 if item == player.position else 5 for item in Position}
    if born is not None: player.born = born


def squad_world(config):
    """Two clubs in a 4-3-3: eleven starters of level 80, each at his position, then nine substitutes of level 50."""
    world = mini_world(config)
    for player in world.players.values():
        shape(player, 80 if player.id % 100 < 11 else 50)
        player.shirt = None
    # The second club plays no league: it can let its players go below the minimum squad.
    world.clubs[2].competition_id = None
    number_squads(world)
    return world


def shirts(world, club_id=1):
    return {pid: world.players[pid].shirt for pid in world.clubs[club_id].player_ids}


def sign(world, player_id, club_id=1, source_id=2):
    return apply(world, PlayerSigned(player_id, source_id, club_id, Contract(1000, Date(2029, 6, 30), world.date), 0))


def test_a_starter_asks_for_the_number_of_his_position_a_backup_and_a_young_player_for_higher_ones():
    assert wanted(Position.STRIKER, STARTER)[:6] == (9, 10, 11, 18, 19, 29)
    assert wanted(Position.STRIKER, BACKUP)[:5] == (18, 19, 29, 29, 39)
    assert wanted(Position.STRIKER, YOUTH)[:3] == (29, 39, 30)
    assert wanted(Position.GOALKEEPER, STARTER)[:3] == (1, 16, 30)
    # From 30 up, the first number free, whatever the position; then those under 30 that no position took.
    assert wanted(Position.CENTER_BACK, YOUTH)[:6] == (24, 25, 34, 35, 30, 31)
    assert sorted(set(wanted(Position.LEFT_BACK, YOUTH))) == list(range(1, 100))


def test_a_squad_wears_the_numbers_of_its_positions_starters_first(config):
    world = squad_world(config)
    numbers = shirts(world)
    assert len(set(numbers.values())) == len(numbers) and all(1 <= number <= 99 for number in numbers.values())
    # The eleven of the 4-3-3: goalkeeper, left back, two centre backs, right back, holding midfielder, two midfielders,
    # left winger, striker, right winger. The second midfielder finds 6, 7 and 11 taken by their owners.
    assert regular_eleven(world, world.clubs[1]) == set(range(100, 111))
    assert [numbers[pid] for pid in range(100, 111)] == [1, 3, 4, 5, 2, 6, 8, 28, 11, 9, 7]
    # The substitutes, of 26: the numbers of a backup at their positions, from 12 to 29.
    assert [numbers[pid] for pid in range(111, 116)] == [16, 13, 14, 15, 12]
    assert sorted(shirts(world, 2).values()) == sorted(numbers.values())


def test_the_numbers_of_the_source_are_kept_and_of_two_alike_the_first_by_claim_keeps_it(config):
    world = mini_world(config)
    for player in world.players.values():
        shape(player, 80 if player.id % 100 < 11 else 50)
        player.shirt = None
    world.players[100].shirt = 9   # the goalkeeper wears the 9 at his club
    world.players[101].shirt = 9   # the left back too: the goalkeeper comes first
    world.players[111].shirt = 77  # a substitute keeps an unusual number
    assert number_squad(world, world.clubs[1]) == 18
    assert (world.players[100].shirt, world.players[101].shirt, world.players[111].shirt) == (9, 3, 77)
    # The striker asks for the 9: it is taken, he has the 10.
    assert world.players[109].shirt == 10


def test_a_player_who_joins_takes_a_free_number_of_his_place_in_the_squad(config):
    world = squad_world(config)
    # A striker better than the club's: a starter, he asks for the 9; it is taken, the 10 is free.
    shape(world.players[209], 95)
    assert sign(world, 209) and world.players[209].shirt == 10
    # Once the 9 is free, the next starting striker takes it.
    for pid in (109, 209): apply(world, PlayerReleased(pid))
    assert world.players[109].shirt is None
    shape(world.players[210], 95, Position.STRIKER)
    assert sign(world, 210) and world.players[210].shirt == 9
    # A striker of 16 does not start: the 29, then the 39.
    for pid in (211, 212):
        shape(world.players[pid], 40, Position.STRIKER, Date(world.date.year - 16, 1, 1))
        assert sign(world, pid)
    assert (world.players[211].shirt, world.players[212].shirt) == (29, 39)
    assert len(set(shirts(world).values())) == len(world.clubs[1].player_ids)


def test_the_club_he_joins_is_told_his_number(config):
    world = squad_world(config)
    world.controlled_club_id = 1
    shape(world.players[209], 95)
    sign(world, 209)
    item = world.news[-1]
    assert (item.kind, item.text, item.lines[0].amount) == ("transfer", f"{world.players[209].name} rejoint Club 1", 10)


def test_a_loan_gives_a_number_at_the_borrower_and_another_at_the_owner_on_return(config):
    world = squad_world(config)
    shape(world.players[209], 95)
    assert apply(world, LoanStarted(209, 1, Date(2027, 6, 30)))
    assert world.players[209].shirt == 10 and world.players[209].shirt not in {world.players[pid].shirt for pid in world.clubs[1].player_ids if pid != 209}
    # Meanwhile the owner's striker took the 9 he left: back, the best striker asks for it and finds the 10.
    world.players[210].shirt = None
    shape(world.players[210], 85, Position.STRIKER)
    number_squad(world, world.clubs[2])
    apply(world, LoanEnded(209))
    assert world.players[209].club_id == 2 and world.players[209].shirt not in (None, 9, world.players[210].shirt)


def test_on_1_july_a_new_starter_takes_a_free_low_number_and_nobody_gives_his_up(config):
    world = squad_world(config)
    world.controlled_club_id = 1
    young = world.players[211]
    shape(young, 40, Position.STRIKER, Date(world.date.year - 17, 1, 1))
    sign(world, young.id)
    assert young.shirt == 29
    # The striker leaves, the young one wins his place; the second midfielder loses his to a substitute.
    apply(world, PlayerReleased(109))
    shape(young, 95)
    shape(world.players[107], 40)
    shape(world.players[117], 90)
    changes = renumber(world, world.clubs[1])
    assert changes == {young.id: 9}
    events = renumbering_events(world)
    assert [(event.club_id, event.numbers) for event in events if event.club_id == 1] == [(1, {young.id: 9})]
    for event in events: apply(world, event)
    assert (young.shirt, world.players[107].shirt, world.players[117].shirt) == (9, 28, 20)
    item = world.news[-1]
    assert (item.kind, item.lines[0].player_id, item.lines[0].amount, item.lines[0].text) == ("shirt_numbers", young.id, 9, "29")
    # A backup who wore a number from 30 up takes one from 12 to 29 left free.
    veteran = world.players[212]
    shape(veteran, 45, Position.STRIKER, Date(world.date.year - 30, 1, 1))
    sign(world, veteran.id)
    veteran.shirt = 44
    assert renumber(world, world.clubs[1]) == {veteran.id: 18}


def test_the_source_number_is_read_from_the_first_column_the_export_has():
    assert shirt_number({"SquadNumber": "9"}) == 9
    assert shirt_number({"SquadNumber": "", "ShirtNumber": "23"}) == 23
    assert shirt_number({"Number": " 7 "}) == 7
    assert [shirt_number(row) for row in ({}, {"SquadNumber": "0"}, {"SquadNumber": "100"}, {"SquadNumber": "-1"}, {"SquadNumber": "x"})] == [None] * 5


def test_a_message_shows_the_number_on_the_club_shirt_never_in_its_title(config):
    from api.news import message
    from core.world.events import ShirtsRenumbered
    world = squad_world(config)
    world.controlled_club_id = 1
    shape(world.players[209], 95)
    sign(world, 209)
    arrival = message(world, len(world.news) - 1)
    assert (arrival["kind"], arrival["title"], arrival["shirt"]) == ("transfer", "Player 2-9 rejoint Club 1", 10)
    apply(world, ShirtsRenumbered(1, {111: 30, 112: 31}))
    change = message(world, len(world.news) - 1)
    assert change["title"] == "2 changements de numéro"
    assert [(row["player"]["id"], row["before"], row["shirt"]) for row in change["players"]] == [(111, 16, 30), (112, 13, 31)]
    apply(world, PlayerReleased(112))
    world.date = world.date.add_days(1)
    apply(world, ShirtsRenumbered(1, {111: 1}))
    assert message(world, len(world.news) - 1)["title"] == "Player 1-11 change de numéro"


def test_a_match_report_shows_the_number_worn_that_day_else_the_players_own_while_he_stays(config):
    from api.views import match_shirt
    from core.domain.matches import Match, MatchResult
    world = squad_world(config)
    result = MatchResult(1, 0, "possession", home_lineup=[(100, "GB")], away_lineup=[(200, "GB"), (209, "BU")], shirts={100: 30})
    match = Match(5000, 16, 2026, 1, world.date, 1, 2, result)
    world.matches[match.id] = match
    assert match_shirt(world, match, "home", 100) == 30
    # A match played before the game had numbers: the player's own, while he plays for that club.
    assert match_shirt(world, match, "away", 200) == world.players[200].shirt == 1
    sign(world, 209)
    assert match_shirt(world, match, "away", 209) is None
