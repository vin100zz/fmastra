from dataclasses import replace
from random import Random

import pytest

from core.domain.clubs import ClubStatus, Competition
from core.domain.date import Date
from core.domain.matches import Match, MatchResult
from core.domain.players import Contract
from core.world.application import apply
from core.world.events import FinancePosted
from core.world.finances import daily_accounts, league_rights, own_income, rank_share, structural_income
from infrastructure.config.loader import config_payload, decode_config
from test_market import dormant_club, mini_world


def test_a_clubs_own_income_grows_faster_than_its_reputation_and_with_its_stadium(config):
    world = mini_world(config)
    club = world.clubs[1]
    rules = config.management.budgets.club_income
    club.capacity = rules.reference_capacity
    steps = []
    for reputation in (60, 70, 80, 90):
        club.reputation = reputation
        steps.append(own_income(club, config)[1])
    # At the reference reputation and stadium, the reference income; each ten points multiply it alike.
    assert steps[0] == pytest.approx(rules.reference_income)
    assert steps[1] / steps[0] == pytest.approx(steps[2] / steps[1]) == pytest.approx(steps[3] / steps[2])
    assert steps[1] / steps[0] > 2
    # A stadium twice the reference adds the part the gates make; a small one takes off it, never all of it.
    club.capacity = 2 * rules.reference_capacity
    assert own_income(club, config)[1] == pytest.approx(steps[3] * (1 + rules.ticket_share))
    club.capacity = None
    base, own = own_income(club, config)
    assert base == pytest.approx(steps[3]) and base * (1 - rules.ticket_share) < own < base


def test_a_championship_pays_its_clubs_by_nation_level_and_rank(config):
    world = mini_world(config)
    club = world.clubs[1]
    rules = config.management.budgets.club_income
    england, france = rules.league_rights["ENG"], rules.league_rights["FRA"]
    # From the first to the last in the configured ratio, shares averaging 1; a club without a rank takes the average.
    assert rank_share(0, config) / rank_share(1, config) == pytest.approx(rules.first_to_last_ratio)
    assert rank_share(None, config) == pytest.approx((rank_share(0, config) + rank_share(1, config)) / 2) == pytest.approx(1)
    assert league_rights(config, ("ENG", 1), None) == england[0] > league_rights(config, ("FRA", 1), None) == france[0]
    assert league_rights(config, ("FRA", 1), 0) > france[0] > league_rights(config, ("FRA", 1), 1) > league_rights(config, ("FRA", 2), 0)
    # Equal clubs, unequal championships: the income differs by what the championships pay.
    english, rights = structural_income(club, config, ("ENG", 1))
    french, _ = structural_income(club, config, ("FRA", 1))
    assert rights == england[0] and english - french == england[0] - france[0]
    # Outside those championships a club lives off itself: a multiple of its own income, no part named as a prize.
    assert league_rights(config, ("POR", 1), 0) is None and league_rights(config, ("FRA", len(france) + 1), 0) is None
    base, own = own_income(club, config)
    assert structural_income(club, config) == (round(own + rules.other_rights_ratio * base), 0)
    # However small, a club can pay a full squad its minimum wage.
    club.reputation = 5
    assert structural_income(club, config) == (rules.minimum_income, 0)
    budgets = config.management.budgets
    squad = budgets.wages.weekly_minimum * budgets.weeks_per_year * 24
    assert rules.minimum_income * budgets.wage_income_share >= squad


def test_a_club_takes_the_last_share_when_it_comes_up_and_the_first_when_it_comes_down(config):
    from core.world.prizes import league_place
    world = mini_world(config)
    world.competitions = {10: Competition(10, "Top", "FRA", 1, [1]), 20: Competition(20, "Second", "FRA", 2, [2])}
    top, second = world.clubs[1], world.clubs[2]
    top.competition_id, second.competition_id = 10, 20
    # Third of ten in its own championship.
    assert league_place(world, top, {1: (10, 2, 10)}) == pytest.approx(2 / 9)
    # Ranked in the championship below, or in none before: the last place. Ranked in the one above: the first.
    assert league_place(world, top, {1: (20, 0, 10)}) == 1.0 and league_place(world, top, {}) == 1.0
    assert league_place(world, second, {2: (10, 9, 10)}) == 0.0
    second.competition_id = None
    assert league_place(world, second, {2: (10, 9, 10)}) is None


def test_a_club_that_comes_down_has_the_wages_it_carries_supported_again(config):
    from core.world.finances import annual_funding_factor
    from core.world.prizes import came_down
    world = mini_world(config)
    world.competitions = {10: Competition(10, "Top", "FRA", 1, [1]), 20: Competition(20, "Second", "FRA", 2, [2])}
    top, second = world.clubs[1], world.clubs[2]
    top.competition_id, second.competition_id = 10, 20
    # Ranked in the top championship last season, playing the second now; the other way round is no fall, nor is staying.
    assert came_down(world, second, {2: (10, 9, 10)}) and not came_down(world, top, {1: (20, 0, 10)})
    assert not came_down(world, top, {1: (10, 3, 10)}) and not came_down(world, top, {})
    second.competition_id = None
    assert came_down(world, second, {2: (10, 9, 10)})
    budgets = config.management.budgets
    second.funding_factor, second.wage_bill, base = 1.0, 300_000, 5_000_000
    needed = second.wage_bill * budgets.weeks_per_year * budgets.initial_funding.wage_headroom / budgets.wage_income_share
    # Its support never grows again, save the year it comes down: then it covers what its wages require.
    assert annual_funding_factor(second, config, base) == 1.0
    assert annual_funding_factor(second, config, base, True) == pytest.approx(needed / base) and needed / base > 4
    second.funding_factor = needed / base
    second.wage_bill //= 2
    assert annual_funding_factor(second, config, base) == pytest.approx(needed / base / 2)


def test_the_cups_pay_what_a_club_played_of_them(config):
    from core.world.prizes import cup_prizes, europe_prizes
    world = mini_world(config)
    season, day = world.season, world.date
    scale = config.management.budgets.prizes.europe["C1"]
    rounds = config.world.europe.league_rounds
    world.competitions[900] = Competition(900, "C1", "EUR", 0, [1, 2], kind="europe", code="C1")
    played = [Match(1, 900, season, 1, day, 1, 2, MatchResult(2, 0, "test")), Match(2, 900, season, 2, day, 2, 1, MatchResult(1, 1, "test")),
              # Club 1 goes straight to the round of 16 (second knockout stage), then wins the final.
              Match(3, 900, season, rounds + 3, day, 1, 2, MatchResult(1, 0, "test", winner_id=1)),
              Match(4, 900, season, rounds + 9, day, 1, 2, MatchResult(1, 0, "test", winner_id=1)),
              Match(5, 900, season, 3, day, 1, 2)]
    world.matches = {match.id: match for match in played}
    world.competitions[900].match_ids = [match.id for match in played]
    world.champions[900] = [(season, 1)]
    prizes = europe_prizes(world)
    assert prizes[1] == scale.participation + scale.win + scale.draw + sum(scale.rounds) + scale.winner
    assert prizes[2] == scale.participation + scale.draw + sum(scale.rounds)
    # A national cup pays shares of what its nation's top championship pays, round after round.
    cup = config.management.budgets.prizes.national_cup
    reference = config.management.budgets.club_income.league_rights["FRA"][0]
    world.competitions[-1] = Competition(-1, "Coupe", "FRA", 0, [1, 2], kind="cup")
    final = [Match(6, -1, season, 1, day, 1, 2, MatchResult(1, 0, "test", winner_id=1)), Match(7, -1, season, 2, day, 1, 2, MatchResult(1, 0, "test", winner_id=1))]
    world.matches.update({match.id: match for match in final})
    world.competitions[-1].match_ids = [6, 7]
    world.champions[-1] = [(season, 1)]
    prizes = cup_prizes(world)
    assert prizes[2] == round(reference * sum(cup.round_shares[:2]))
    assert prizes[1] == prizes[2] + round(reference * cup.winner_share)
    assert prizes[1] < 0.1 * reference


def test_idle_cash_is_spent_and_a_dormant_club_pays_its_whole_squad(config):
    from core.ai.market import unseen_wages
    world = mini_world(config)
    budgets = config.management.budgets
    club, days = world.clubs[1], 365
    club.income, club.accounting_remainder = 36_500_000, 0
    running = round(club.income * (1 - budgets.accounting.other_cost_share)) - club.wage_bill * budgets.weeks_per_year
    # Within its reserve, a club keeps what it earns.
    club.balance = round(club.income * budgets.investments.reserve_months / 12)
    assert daily_accounts(club, config, days) == (running // days, running % days, 0)
    # Beyond it, a share of the surplus goes each year, day after day.
    club.balance += 73_000_000
    change, remainder, investment = daily_accounts(club, config, days)
    assert investment == round(73_000_000 * budgets.investments.annual_share / days) and change == running // days - investment
    before = club.balance
    assert apply(world, FinancePosted(club.id, change, remainder, investment))
    month = world.finance_history[club.id][world.season].months[world.date.month]
    assert club.balance == before + change and month.investments == investment
    assert month.income + month.prizes - month.wages - month.operating_costs - month.investments + month.rounding == change
    # A dormant club pays the players the game does not hold: their wages leave its accounts with the others.
    dormant = dormant_club(world, weight=3.0)
    dormant.income, dormant.balance, dormant.accounting_remainder = 5_200_000, 0, 0
    dormant.wage_cap = round(dormant.income * budgets.wage_income_share / budgets.weeks_per_year)
    unseen = unseen_wages(dormant, world.config)
    assert unseen > 10 * dormant.wage_bill
    paid = daily_accounts(dormant, world.config, days, unseen)[0]
    assert paid == daily_accounts(dormant, world.config, days)[0] - unseen * budgets.weeks_per_year // days or paid == pytest.approx(
        daily_accounts(dormant, world.config, days)[0] - unseen * budgets.weeks_per_year / days, abs=1)
    # Its whole squad paid and its running costs covered, it neither hoards nor sinks.
    assert abs(paid * days) < 0.2 * dormant.income


def test_prizes_are_booked_apart_from_the_rest_of_the_income(config):
    world = mini_world(config)
    club = world.clubs[1]
    club.income, club.prize_income = 36_500_000, {"league": 7_300_000, "europe": 3_650_000}
    assert apply(world, FinancePosted(club.id, 0, 0))
    month = world.finance_history[club.id][world.season].months[world.date.month]
    assert month.prizes == pytest.approx(10_950_000 / 365, abs=1) and month.income == pytest.approx(25_550_000 / 365, abs=1)


def test_a_club_whose_wages_outgrew_its_income_lets_its_contracts_run_out(config):
    from core.ai.market import market_wage
    from core.world.contracts import renewal_events
    from core.world.events import PlayerSigned
    world = mini_world(config)
    club, player = world.clubs[2], world.players[201]
    budgets, rules = config.management.budgets, config.management.contracts
    wage = market_wage(player, club, config)
    player.contract = Contract(wage, world.date.add_days(180), world.date)
    club.wage_bill += wage - 1000
    club.wage_cap = 10 ** 9
    signed = lambda: [event for event in renewal_events(world) if isinstance(event, PlayerSigned) and event.player_id == player.id]
    # Wages within what the income allows: he is extended.
    club.income = round(club.wage_bill * budgets.weeks_per_year / budgets.wage_income_share)
    assert signed()
    # Past the tolerated excess, nobody is: its players leave as their contracts end. The human club decides for itself.
    club.income = round(club.income / (rules.renewal_stop_ratio + 0.05))
    assert not signed()
    world.controlled_club_id = club.id
    from core.world.events import RenewalProposed
    assert [event for event in renewal_events(world) if isinstance(event, RenewalProposed) and event.proposal.player_id == player.id]


def test_the_rules_of_the_new_economy_default_for_configurations_made_before_them(config):
    from infrastructure.persistence.store import MIGRATION_DEFAULTS
    added = [(path, defaults) for introduced, path, defaults in MIGRATION_DEFAULTS if introduced == 29]
    assert {path for path, _ in added} == {("ia_gestion", "valorisation"), ("ia_gestion", "budgets"), ("ia_gestion", "mercato"),
                                           ("ia_gestion", "contrats"), ("demographie", "progression"), ("benchmarks", "economie")}
    raw = config_payload(config)
    for (domain, section), defaults in added:
        for key in defaults: del raw[domain][section][key]
    older = decode_config(raw)
    # The model defaults, the save migration and the shipped configuration describe the same rules.
    assert older == config
    restored = config_payload(older)
    for (domain, section), defaults in added:
        assert {key: restored[domain][section][key] for key in defaults} == defaults


def test_an_older_save_takes_the_recalibrated_rules_and_the_income_they_give(config, tmp_path):
    import gzip
    import hashlib
    import json
    from infrastructure.persistence.store import MIGRATION_DEFAULTS, RECALIBRATED_RULES, SaveStore
    world = mini_world(config)
    world.competitions[-16] = Competition(-16, "Test", "FRA", 1, [1])
    world.clubs[1].competition_id = -16
    world.rngs = {key: Random(1) for key in ("market", "matches", "states", "progression", "demography")}
    # A dormant club paying one of its two known players a wage signed during the game.
    small = dormant_club(world, keep=2, weight=3.0)
    star, other = (world.players[pid] for pid in small.player_ids)
    star.contract = Contract(80_000, star.contract.end, world.date, synthetic=False)
    other.contract = replace(other.contract, synthetic=True)
    small.reputation, small.income, small.funding_factor = 20, 9_000_000, 1.0
    small.wage_bill, small.wage_cap = 81_000, 100_000
    # A simulated club whose imported wages need support, and a club with nobody to pay.
    backed, plain = world.clubs[1], replace(world.clubs[1], id=3, name="Club 3", player_ids=[], wage_bill=0, competition_id=None, status=ClubStatus.DORMANT)
    backed.funding_factor, backed.income = 2.5, 50_000_000
    world.clubs[3] = plain
    store = SaveStore(tmp_path)
    path = store.save(world, "old")
    payload = json.loads(gzip.decompress(path.read_bytes()))
    payload["schema_version"] = 28
    rules = payload["world"]["config"]
    for introduced, config_path, defaults in MIGRATION_DEFAULTS:
        if introduced > 28:
            for key in defaults: del rules[config_path[0]][config_path[1]][key]
    rules["ia_gestion"]["budgets"]["comptabilite"]["part_revenus_autres_charges"] = 0.15
    rules["ia_gestion"]["garde_fous"]["solde_minimal_autorise"] = -5000000
    rules["demographie"]["estimation_potentiel"]["bruit_max"] = 22.0
    rules["demographie"]["cohorte"]["poids_reputation_tri"] = 0.5  # chosen by hand: kept
    for club in payload["world"]["clubs"].values(): del club["prize_income"]
    for player in payload["world"]["players"].values(): del player["past_performance"]
    payload["config_hash"] = hashlib.sha256(json.dumps(rules, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    path.write_bytes(gzip.compress(json.dumps(payload).encode()))
    restored = store.load("old")
    cfg = restored.config
    assert len(RECALIBRATED_RULES) == 4
    assert cfg.management.budgets.accounting.other_cost_share == config.management.budgets.accounting.other_cost_share
    assert cfg.management.guardrails.min_balance == config.management.guardrails.min_balance == 0
    assert cfg.demography.potential_estimate.max_noise == config.demography.potential_estimate.max_noise
    assert cfg.demography.cohort.sorting_reputation_weight == 0.5
    assert cfg.management.budgets.club_income == config.management.budgets.club_income
    budgets = cfg.management.budgets
    # The wage the dormant club signed during the game comes back to what its unseen squad leaves; the imported one stays.
    kept = other.contract.weekly_wage
    small, star, other = restored.clubs[2], restored.players[star.id], restored.players[other.id]
    assert budgets.wages.weekly_minimum <= star.contract.weekly_wage < 8_000 and other.contract.weekly_wage == kept
    assert small.wage_bill == star.contract.weekly_wage + other.contract.weekly_wage
    # What its wages still require is supported, as at the creation of a game.
    base = structural_income(small, cfg)[0]
    assert base == budgets.club_income.minimum_income
    needed = small.wage_bill * budgets.weeks_per_year * budgets.initial_funding.wage_headroom / budgets.wage_income_share
    assert small.funding_factor == pytest.approx(max(1.0, needed / base)) and small.income == round(base * small.funding_factor)
    assert small.wage_cap >= small.wage_bill
    # The simulated club is supported for what its wages require; its championship's money is named as a prize.
    backed = restored.clubs[1]
    base, rights = structural_income(backed, cfg, ("FRA", 1))
    needed = backed.wage_bill * budgets.weeks_per_year * budgets.initial_funding.wage_headroom / budgets.wage_income_share
    assert backed.funding_factor == pytest.approx(max(1.0, needed / base)) and backed.income == round(base * backed.funding_factor)
    assert backed.prize_income == {"league": rights} and backed.wage_cap >= backed.wage_bill
    assert restored.clubs[3].funding_factor == 1.0 and restored.clubs[3].income == structural_income(restored.clubs[3], cfg)[0]
    assert all(player.past_performance == 1.0 for player in restored.players.values())
    # Saved again, it loads as it is.
    store.save(restored, "new")
    assert store.load("new").clubs[2].income == small.income


def test_a_wage_follows_the_level_and_the_means_of_the_club_that_pays_it(config):
    from core.ai.market import market_wage
    from core.domain.players import Position
    from core.world.importation.synthesis import level_wage
    budgets = config.management.budgets
    rules = budgets.wage_model
    neutral = Position("MC")
    assert config.management.valuation.position_scarcity[neutral] == 1
    reference = level_wage(rules.reference_level, neutral, config, rules.reference_income)
    assert reference == round(rules.reference_wage / budgets.weeks_per_year)
    # Without a club to pay it, the wage of the reference club.
    assert level_wage(rules.reference_level, neutral, config) == reference
    # Each point of level multiplies it alike; a club four times as rich pays twice as much, at the shipped exponent.
    higher = level_wage(rules.reference_level + 10, neutral, config, rules.reference_income)
    assert higher / reference == pytest.approx(2.718281828 ** (10 * rules.level_slope), rel=1e-3)
    assert level_wage(rules.reference_level, neutral, config, 4 * rules.reference_income) / reference == pytest.approx(4 ** rules.income_exponent, rel=1e-3)
    # A scarce position earns more, and nobody less than the minimum.
    striker = Position("BU")
    assert level_wage(rules.reference_level, striker, config) == pytest.approx(reference * config.management.valuation.position_scarcity[striker], abs=1)
    assert level_wage(20, neutral, config, 1_000_000) == budgets.wages.weekly_minimum
    # The same player expects more of a rich club than of a poor one; neither his age nor his promise changes it.
    world = mini_world(config)
    player, poor, rich = world.players[201], world.clubs[1], world.clubs[2]
    poor.income, rich.income = 5_000_000, 200_000_000
    assert market_wage(player, poor, config) < market_wage(player, None, config) < market_wage(player, rich, config)
    wage = market_wage(player, rich, config)
    player.potential, player.born = 99, Date(world.date.year - 17, 1, 1)
    assert market_wage(player, rich, config) == wage


def test_a_club_that_plays_always_fields_its_minimum_squad(config):
    from core.ai.market import short_of_players, wage_room
    from core.world.demography import generate_player, intake_room
    from core.world.events import PlayerGenerated
    from core.world.market import ensure_minimums
    world = mini_world(config)
    world.rngs["demography"] = Random(3)
    world.identity_pool = {"FRA": [("Jean", "Dupont"), ("Paul", "Martin")]}
    guard = config.management.guardrails
    wage = config.demography.academies.base_weekly_wage
    club = world.clubs[1]
    # No wage left at all, and a squad two players short of the minimum.
    for pid in club.player_ids[guard.min_squad - 2:]: del world.players[pid]
    club.player_ids = club.player_ids[:guard.min_squad - 2]
    club.wage_bill = sum(world.players[pid].contract.weekly_wage for pid in club.player_ids)
    club.wage_cap = club.wage_bill
    assert wage_room(club, config) == 0 and short_of_players([world.players[pid] for pid in club.player_ids], config)
    # Its academy still owes it the players it lacks: the cap gives way to their wage, and no further.
    assert intake_room(club, config) == 2
    position = world.players[club.player_ids[-1]].position
    first = generate_player(world, world.next_id, club, position, "FRA", Random(1))
    assert apply(world, PlayerGenerated(first))
    assert club.wage_cap == club.wage_bill == sum(world.players[pid].contract.weekly_wage for pid in club.player_ids)
    # With no free agent it can pay, the squad is completed from the academy.
    ensure_minimums(world)
    assert len(club.player_ids) == guard.min_squad and not short_of_players([world.players[pid] for pid in club.player_ids], config)
    assert club.wage_cap == club.wage_bill
    # At its minimum again, it takes nobody it cannot pay.
    assert intake_room(club, config) == 0
    extra = generate_player(world, world.next_id, club, position, "FRA", Random(2))
    assert not apply(world, PlayerGenerated(extra))
    # A dormant club has no minimum to field.
    dormant = dormant_club(world)
    dormant.wage_cap = dormant.wage_bill
    assert intake_room(dormant, world.config) == 0
    late = generate_player(world, world.next_id, dormant, position, "FRA", Random(4))
    assert not apply(world, PlayerGenerated(late))
