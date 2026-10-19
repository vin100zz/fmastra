from dataclasses import replace

from core.domain.clubs import Club, ClubPersonality, ClubStatus
from core.domain.date import Date
from core.domain.players import ATTRIBUTE_NAMES, Attributes, Position
from core.math import interpolate
from core.world.importation.records import SourcePlayer
from core.world.importation.tiers import select_world

START = Date(2026, 7, 1)
FREE = -1


def tiers(config, outside_budget=None, **sections):
    """The configuration with some tiers changed; a tier left out keeps the repository's values."""
    rules = config.import_settings.squad_selection.tiers
    rules = replace(rules, **{name: replace(getattr(rules, name), **values) for name, values in sections.items()})
    if outside_budget is not None: rules = replace(rules, outside_budget=outside_budget)
    selection = replace(config.import_settings.squad_selection, tiers=rules)
    return replace(config, import_settings=replace(config.import_settings, squad_selection=selection))


def quiet(config, **sections):
    """Only the tiers a test looks at: no floor, no free agents, no cup clubs, an unbounded budget."""
    return tiers(config, outside_budget=10 ** 6, **{"floor": {"min_players": 0, "max_players": 0}, "free_agents": {"players": 0},
                                                   "cup": {"clubs": 0}, **sections})


def club(config, cid, nation, division, reputation, competition=None, reserve=False):
    return Club(cid, f"Club {cid}", nation, division, competition, ClubStatus.ACTIVE if competition else ClubStatus.DORMANT,
                None, reputation, 50, next(iter(config.formations.formations)), ClubPersonality(0, 0, 0, 0),
                division_id=division, is_reserve=reserve, cup_nation=nation)


def player(pid, club_id, ability, *, potential=None, born=Date(1998, 1, 1), keeper=False, nation="FRA", reputation=0):
    ratings = {position: 1 for position in Position}
    ratings[Position.GOALKEEPER if keeper else Position.STRIKER] = 20
    return SourcePlayer(pid, f"Nom{pid}, Prénom", (nation,), "GK" if keeper else "ST", club_id, 1000, 100000, born, None,
                        Attributes((50.0,) * len(ATTRIBUTE_NAMES)), ability, potential or ability, ratings,
                        world_reputation=reputation)


def kept(selection, rows, club_id):
    return {row.id for row in rows if row.club_id == club_id and row.id in selection.players}


def test_a_simulated_club_keeps_its_best_with_its_keepers_and_prospects_however_weak(config):
    cfg = quiet(config)
    rule = cfg.import_settings.squad_selection.tiers.simulated
    clubs = {1: club(cfg, 1, "FRA", 16, 70, competition=16)}
    outfield = [player(100 + i, 1, 100 + i) for i in range(30)]
    keepers = [player(200 + i, 1, 60 + i, keeper=True) for i in range(rule.goalkeepers + 1)]
    # Below the wonderkids, whom the stars' tier would keep anyway.
    wonderkid = cfg.import_settings.squad_selection.tiers.stars.wonderkid_potential
    prospects = [player(300 + i, 1, 50, potential=wonderkid - 1 - i, born=Date(2009, 1, 1)) for i in range(rule.prospects + 1)]
    rows = outfield + keepers + prospects
    selection = select_world(clubs, rows, cfg, START, {}, {})
    squad = kept(selection, rows, 1)
    assert len(squad) == rule.players
    # The best keepers, the most promising prospects.
    assert {row.id for row in keepers[-rule.goalkeepers:]} | {row.id for row in prospects[:rule.prospects]} <= squad
    best = rule.players - rule.goalkeepers - rule.prospects
    assert {row.id for row in outfield} & squad == {row.id for row in outfield[-best:]}
    assert all(selection.players[pid] == "simules" for pid in squad)


def test_the_pool_keeps_its_best_and_a_lower_division_only_its_stars(config):
    cfg = quiet(config)
    pool, star = cfg.import_settings.squad_selection.tiers.pool.players, cfg.import_settings.squad_selection.tiers.stars
    division = cfg.world.promotion_relegation.reserves[0].division_ids[0]
    nation = cfg.world.promotion_relegation.reserves[0].nation
    clubs = {2: club(cfg, 2, nation, division, 30), 3: club(cfg, 3, nation, 99999, 10), 4: club(cfg, 4, nation, 99999, 10)}
    rows = [player(400 + i, 2, 80 + i) for i in range(pool + 5)]
    rows += [player(500, 3, 70, reputation=int(star.reputation * 100)), player(501, 3, 120),
             player(502, 3, 40, potential=star.wonderkid_potential, born=Date(2009, 1, 1)), player(503, 4, 120)]
    selection = select_world(clubs, rows, cfg, START, {}, {})
    assert kept(selection, rows, 2) == {row.id for row in rows[5:pool + 5]}
    assert kept(selection, rows, 3) == {500, 502} and selection.players[500] == selection.players[502] == "vedettes"
    # A lower club stays only for a player it keeps; the pool stays whole, for the promotions.
    assert {2, 3} <= selection.clubs and 4 not in selection.clubs


def test_free_agents_european_candidates_and_famous_clubs_abroad(config):
    cfg = quiet(config, free_agents={"players": 2})
    rules = cfg.import_settings.squad_selection.tiers.foreign
    places = 2
    candidates = max(rules.min_clubs, min(rules.max_clubs, places * rules.clubs_per_place))
    portugal = {10 + i: club(cfg, 10 + i, "POR", 7000, 50 - i) for i in range(candidates + 1)}
    clubs = {**portugal, 30: club(cfg, 30, "BRA", 7001, rules.reputation), 31: club(cfg, 31, "BRA", 7001, rules.reputation - 1),
             32: club(cfg, 32, "POR", 7000, 99, reserve=True)}
    rows = [player(1000 + i, 30, 90 + i, nation="BRA") for i in range(rules.players + 3)]
    rows += [player(1100 + i, 31, 120, nation="BRA") for i in range(3)] + [player(1200 + i, FREE, 60 + i) for i in range(5)]
    selection = select_world(clubs, rows, cfg, START, {}, {"POR": places})
    assert {cid for cid in portugal if cid in selection.clubs} == set(list(portugal)[:candidates])
    assert 32 not in selection.clubs  # A reserve team never stands for its country in Europe.
    assert kept(selection, rows, 30) == {row.id for row in rows[3:rules.players + 3]}
    assert 31 not in selection.clubs and not kept(selection, rows, 31)
    assert kept(selection, rows, FREE) == {1203, 1204}


def test_each_nationality_keeps_a_squad_as_deep_as_its_strength(config):
    floor = {"min_players": 3, "max_players": 9, "min_strength": 25.0, "max_strength": 80.0}
    cfg = tiers(config, outside_budget=10 ** 6, floor=floor, free_agents={"players": 0}, cup={"clubs": 0})
    names = {"AND": "Andorre", "ARM": "Arménie", "XXX": "Nulle part"}
    rows = [player(2000 + 100 * index + i, FREE, 50 + i, nation=code) for index, code in enumerate(names) for i in range(12)]
    rows.append(player(2999, 1, 200, nation="AND"))
    clubs = {1: club(cfg, 1, "FRA", 16, 70, competition=16)}
    selection = select_world(clubs, rows, cfg, START, names, {})
    for code, name in names.items():
        strength = cfg.nations[name].strength if name in cfg.nations else floor["min_strength"]
        wanted = round(interpolate(((25.0, 3), (80.0, 9)), strength))
        nationals = [row for row in rows if row.nations == (code,) and row.club_id == FREE]
        # The simulated club's Andorran counts in his country's squad.
        wanted -= code == "AND"
        assert {row.id for row in nationals if row.id in selection.players} == {row.id for row in nationals[len(nationals) - wanted:]}
    assert selection.players[2999] == "simules"


def test_the_budget_trims_the_clubs_abroad_then_the_free_agents(config):
    cfg = quiet(config, free_agents={"players": 4})
    rules = cfg.import_settings.squad_selection.tiers.foreign
    clubs = {30: club(cfg, 30, "BRA", 7001, rules.reputation)}
    rows = [player(1000 + i, 30, 90 + i) for i in range(rules.players + 5)] + [player(1200 + i, FREE, 60 + i) for i in range(6)]
    for budget, abroad, free in ((rules.players + 4, rules.players, 4), (rules.min_players + 4, rules.min_players, 4),
                                 (rules.min_players + 2, rules.min_players, 2), (rules.min_players, rules.min_players, 0)):
        selection = select_world(clubs, rows, tiers(cfg, outside_budget=budget), START, {}, {})
        assert (len(kept(selection, rows, 30)), len(kept(selection, rows, FREE))) == (abroad, free)


def test_no_club_keeps_more_than_a_full_squad(config):
    cfg = quiet(config)
    star = cfg.import_settings.squad_selection.tiers.stars.reputation
    limit = cfg.import_settings.squad_selection.max_players
    clubs = {30: club(cfg, 30, "BRA", 7001, 10)}
    rows = [player(1000 + i, 30, 90 + i, reputation=int(star * 100)) for i in range(limit + 5)]
    selection = select_world(clubs, rows, cfg, START, {}, {})
    assert kept(selection, rows, 30) == {row.id for row in rows[5:]}
