from dataclasses import replace
from random import Random

import pytest

from benchmarks.fixtures import synthetic_lineup
from core.domain.clubs import Club, ClubPersonality, ClubStatus
from core.domain.date import Date
from core.domain.world import World, TransferRecord
from core.domain.players import Contract
from core.domain.offers import TransferOffer
from core.ai.market import squad_quality
from core.ai.external_market import approach_day
from core.world.application import apply
from core.world.events import PlayerSigned
from core.world.transfer_rules import recent_arrival_ids


def mini_world(config):
    start = Date(config.world.start_date.year, config.world.start_date.month, config.world.start_date.day)
    clubs, players = {}, {}
    for cid in (1, 2):
        lineup = synthetic_lineup(config, cid)
        squad = [slot.player for slot in lineup.slots] + lineup.bench
        for player in squad:
            player.contract = Contract(1000, Date(start.year + 3, 6, 30), start)
            players[player.id] = player
        clubs[cid] = Club(cid, f"Club {cid}", "FRA", 16, 16, ClubStatus.ACTIVE, 30000, 70, 70, "4-3-3",
                          ClubPersonality(.5, .5, .5, .5), [player.id for player in squad],
                          wage_bill=len(squad)*1000, wage_cap=100000, transfer_budget=1000000, balance=2000000)
    return World(start, start.year, 1, config, players, clubs, {}, {}, 1000, rngs={"market":Random(4)})


def test_transfer_moves_money_membership_and_wages_once(config):
    world = mini_world(config)
    player = world.players[201]
    event = PlayerSigned(player.id, 2, 1, Contract(1500, Date(2028, 6, 30), world.date), 50000)
    balance = sum(club.balance for club in world.clubs.values())
    assert apply(world, event)
    assert player.id in world.clubs[1].player_ids and player.id not in world.clubs[2].player_ids
    assert sum(club.balance for club in world.clubs.values()) == balance
    assert world.clubs[1].wage_bill == 21500 and world.clubs[2].wage_bill == 19000
    assert not apply(world, event)
    assert len(world.transfers) == 1


def test_keeper_minimum_and_reservations_block_sale(config):
    world = mini_world(config)
    goalkeeper = world.players[200]
    contract = Contract(1000, Date(2028, 6, 30), world.date)
    assert not apply(world, PlayerSigned(goalkeeper.id, 2, 1, contract, 1000))
    reserved = TransferOffer("reserve", world.date, 202, 2, 1, contract, 990000, 990000, 1)
    world.offers[reserved.key] = reserved
    assert not apply(world, PlayerSigned(201, 2, 1, contract, 50000))


def test_backup_has_positive_marginal_value_without_duplicating_a_starter(config):
    world = mini_world(config)
    squad = [world.players[pid] for pid in world.clubs[1].player_ids[:11]]
    backup = replace(squad[0], id=999)
    assert squad_quality([*squad, backup], world.clubs[1], config) > squad_quality(squad, world.clubs[1], config)


def test_external_approach_is_once_per_window_and_seed_stable():
    start, end = Date(2025, 6, 10), Date(2025, 8, 31)
    assert approach_day(1, 77, start, end, 0) is None
    day = approach_day(1, 77, start, end, 1)
    assert start <= day <= end
    assert day == approach_day(1, 77, start, end, 1)


def test_emergency_recruitment_restores_keeper_before_other_position_needs(config):
    from core.world.market import ensure_minimums

    world = mini_world(config)
    club = world.clubs[1]
    keeper = world.players[100]
    club.player_ids.remove(keeper.id)
    club.wage_bill -= keeper.contract.weekly_wage
    keeper.club_id, keeper.contract = None, None
    # A missing outfield role must not displace the hard goalkeeper minimum.
    for pid in club.player_ids:
        if world.players[pid].position == "DC":
            world.players[pid].position = world.players[101].position
    club.wage_cap = 10000000
    ensure_minimums(world)
    assert keeper.club_id == club.id
    assert sum(world.players[pid].position == "GB" for pid in club.player_ids) == 2


def close_auction(world):
    """Advance to the day the oldest open offer is decided."""
    world.date = world.date.add_days(world.config.management.market.auction_days)


def sign_recent_arrival(world):
    event = PlayerSigned(201, 2, 1, Contract(1500, Date(2028, 6, 30), world.date), 50000)
    assert apply(world, event)
    return world.players[201]


@pytest.mark.parametrize("days,allowed", [(0, False), (30, False), ("last_day", False), ("deadline", True)])
def test_recent_arrival_refuses_until_stability_deadline(config, days, allowed):
    world = mini_world(config)
    player = sign_recent_arrival(world)
    if days == "last_day": days = config.management.market.arrival_stability_days - 1
    if days == "deadline": days = config.management.market.arrival_stability_days
    world.date = world.date.add_days(days)
    before = [(c.balance, c.wage_bill, list(c.player_ids)) for c in world.clubs.values()]
    event = PlayerSigned(player.id, 1, 2, Contract(1500, Date(2029, 6, 30), world.date), 60000)
    assert apply(world, event) is allowed
    if not allowed:
        assert [(c.balance, c.wage_bill, c.player_ids) for c in world.clubs.values()] == before
        assert len(world.transfers) == 1


def test_renewal_does_not_restart_stability_period(config):
    world = mini_world(config)
    player = sign_recent_arrival(world)
    world.date = world.date.add_days(config.management.market.arrival_stability_days - 10)
    renewal = PlayerSigned(player.id, 1, 1, Contract(1600, Date(2030, 6, 30), world.date), 0, True)
    assert apply(world, renewal)
    assert player.id in recent_arrival_ids(world)
    world.date = world.date.add_days(10)
    assert player.id not in recent_arrival_ids(world)
    assert apply(world, PlayerSigned(player.id, 1, 2, renewal.contract, 60000))
    assert player.id in recent_arrival_ids(world)


def test_import_and_academy_are_not_arrivals_and_zero_disables_rule(config):
    world = mini_world(config)
    assert not recent_arrival_ids(world)  # Synthetic contracts all start today.
    world.transfers.append(TransferRecord(world.date, 101, None, 1, 0, "academy"))
    assert not recent_arrival_ids(world)
    player = sign_recent_arrival(world)
    market = replace(config.management.market, arrival_stability_days=0)
    world.config = replace(config, management=replace(config.management, market=market))
    assert not recent_arrival_ids(world)
    assert apply(world, PlayerSigned(player.id, 1, 2, player.contract, 60000))


def test_released_player_can_sign_but_free_arrival_cannot_move_again(config):
    from core.world.events import PlayerReleased
    world = mini_world(config)
    player = sign_recent_arrival(world)
    assert apply(world, PlayerReleased(player.id))
    assert player.id not in recent_arrival_ids(world)
    contract = Contract(1500, Date(2028, 6, 30), world.date)
    assert apply(world, PlayerSigned(player.id, None, 2, contract, 0))
    assert not apply(world, PlayerSigned(player.id, 2, 1, contract, 60000))


def test_pending_offer_for_recent_arrival_is_cancelled(config):
    from core.world.market import settle_offers
    world = mini_world(config)
    player = sign_recent_arrival(world)
    offer = TransferOffer("old-offer", world.date, player.id, 1, 2, player.contract, 100000000, 100000000, 1)
    world.offers[offer.key] = offer
    close_auction(world)
    settle_offers(world, True)
    assert not world.offers
    assert player.club_id == 1
    assert len(world.transfers) == 1


@pytest.mark.parametrize("external", [False, True])
def test_recent_arrivals_are_not_approached_by_active_or_external_clubs(config, monkeypatch, external):
    from core.ai.market import propose_transfers
    import core.ai.external_market as external_market
    world = mini_world(config)
    market = replace(config.management.market, daily_proposal_probability=1)
    world.config = replace(config, management=replace(config.management, market=market))
    for club in world.clubs.values():
        club.wage_cap = club.transfer_budget = club.balance = 1000000000
    if external:
        buyer = world.clubs[2]
        buyer.competition_id, buyer.status = None, ClubStatus.DORMANT
        monkeypatch.setattr(external_market, "approaching_clubs", lambda world: [buyer])
        # Populate a real surplus for the external buyer to approach.
        for pid in range(900, 906):
            player = replace(world.players[101], id=pid, rating=1)
            world.players[pid] = player
            world.clubs[1].player_ids.append(pid)
    else:
        # Force a genuine goalkeeper need with affordable candidates.
        club = world.clubs[1]
        club.player_ids = [pid for pid in club.player_ids if world.players[pid].position != "GB"]
        seller = world.clubs[2]
        for pid in range(800, 806):
            extra = replace(world.players[200], id=pid)
            world.players[pid] = extra
            seller.player_ids.append(pid)
            seller.wage_bill += extra.contract.weekly_wage
    assert propose_transfers(world, Random(2))
    world.transfers = [TransferRecord(world.date, p.id, None, p.club_id, 0) for p in world.players.values()]
    assert not propose_transfers(world, Random(2))


@pytest.mark.parametrize("version", [1, 2, 5, 6, 7, 8, 9, 10, 11, 12])
def test_stability_survives_loading_current_and_legacy_saves(config, tmp_path, version):
    import gzip
    import hashlib
    import json
    from core.domain.clubs import Competition
    from infrastructure.persistence.codec import encode
    from infrastructure.persistence.store import SaveStore, SaveError

    world = mini_world(config)
    world.competitions[-16] = Competition(-16, "Test", "FRA", 1, [1, 2])
    for club in world.clubs.values(): club.competition_id = -16
    world.rngs = {key: Random(1) for key in ("market", "matches", "states", "progression", "demography")}
    player = sign_recent_arrival(world)
    world.date = world.date.add_days(30)
    store = SaveStore(tmp_path)
    path = store.save(world, "recent")
    payload = json.loads(gzip.decompress(path.read_bytes()))
    payload["schema_version"] = version
    if version == 1:
        payload["world"] = encode(world)
        rules = payload["world"]["fields"]["config"]["$config"]
    else:
        rules = payload["world"]["config"]
    from infrastructure.persistence.store import MIGRATION_DEFAULTS, SCHEMA_VERSION
    for introduced, config_path, defaults in MIGRATION_DEFAULTS:
        if version < introduced:
            for key in defaults: del rules[config_path[0]][config_path[1]][key]
            # A section introduced whole is absent from the older configuration, not empty.
            if not rules[config_path[0]][config_path[1]]: del rules[config_path[0]][config_path[1]]
    if version < SCHEMA_VERSION:
        raw = json.dumps(rules, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        payload["config_hash"] = hashlib.sha256(raw.encode()).hexdigest()
    path.write_bytes(gzip.compress(json.dumps(payload).encode()))
    restored = store.load("recent")
    assert restored.config.management.market.arrival_stability_days == (180 if version < 6 else config.management.market.arrival_stability_days)
    assert restored.config.management.market.minimum_quality_gain == 3.0
    assert restored.config.world.reputation == config.world.reputation
    assert all(club.reputation_anchor == club.reputation for club in restored.clubs.values())
    assert restored.reputation_history == {cid: [(restored.season, club.reputation)] for cid, club in restored.clubs.items()}
    assert restored.config.management.market.auction_days == 2
    assert (restored.config.management.market.club_outgrown_margin, restored.config.management.market.leave_threshold) == (10.0, 0.3)
    assert (restored.config.management.market.min_squad_depth, restored.config.management.market.max_squad_depth) == (16, 20)
    assert player.id in recent_arrival_ids(restored)
    assert not apply(restored, PlayerSigned(player.id, 1, 2, player.contract, 60000))
    assert restored.rngs["market"].getstate() == world.rngs["market"].getstate()
    store.save(restored, "migrated")
    assert player.id in recent_arrival_ids(store.load("migrated"))
    # Compatibility must not allow unrelated configuration tampering.
    rules["ia_gestion"]["mercato"]["daily_proposal_probability"] = 0.9
    path.write_bytes(gzip.compress(json.dumps(payload).encode()))
    with pytest.raises(SaveError, match="incohérente"):
        store.load("recent")


def recruitment_world(config, probability=1):
    world = mini_world(config)
    rules = replace(config.management.market, daily_proposal_probability=probability)
    world.config = replace(config, management=replace(config.management, market=rules))
    if probability == 1: world.date = Date(2025, 6, 10)
    for club in world.clubs.values():
        club.wage_cap = club.balance = club.transfer_budget = 1000000000
    # Available specialists who improve all the main needs.
    lineup = synthetic_lineup(config, 9, level=80)
    for slot in lineup.slots:
        player = slot.player
        player.club_id, player.contract = None, None
        world.players[player.id] = player
    return world


def test_buyer_can_pay_useful_players_actual_asking_price(config, monkeypatch):
    from core.ai.market import asking_price, market_value, seller_accepts
    from core.world.market import open_offers, settle_offers
    import core.world.market as market
    world = recruitment_world(config)
    player, seller = world.players[201], world.clubs[2]
    for pid in range(800, 804):
        extra = replace(player, id=pid)
        world.players[pid] = extra
        seller.player_ids.append(pid)
        seller.wage_bill += extra.contract.weekly_wage
    rules = config.management.market
    old_ceiling = round(market_value(player, world, seller) * rules.seller_multiplier
                        * (1 + rules.patience_weight * seller.personality.negotiation_patience))
    quote = asking_price(player, seller, world)
    assert quote > old_ceiling
    assert not seller_accepts(player, seller, old_ceiling, world, Random(1))
    assert seller_accepts(player, seller, quote, world, Random(1))
    event = PlayerSigned(player.id, seller.id, 1, player.contract, quote)
    monkeypatch.setattr(market, "propose_transfers", lambda *args, **kwargs: [event])
    open_offers(world, True)
    close_auction(world)
    settle_offers(world, True)
    assert next(iter(world.offers.values())).countered
    world.date = world.date.add_days(1)
    settle_offers(world, True)
    assert player.club_id == 1
    assert world.transfers[-1].fee <= quote


def test_parallel_recruitment_covers_distinct_positions_and_pending_offers(config):
    from core.world.market import open_offers
    world = recruitment_world(config)
    open_offers(world, True)
    pending = [o for o in world.offers.values() if o.target_id == 1]
    assert len(pending) == 3
    assert len({world.players[o.player_id].position for o in pending}) == 3
    # A second review cannot duplicate existing targets or their positions.
    keys = set(world.offers)
    open_offers(world, True)
    assert set(world.offers) == keys


def test_shortlist_skips_unaffordable_stars_to_find_cheaper_player(config):
    from core.ai.market import propose_transfers, needs_for
    from core.domain.players import Attributes, ATTRIBUTE_NAMES
    world = recruitment_world(config)
    club = world.clubs[1]
    position = needs_for(club, [world.players[pid] for pid in club.player_ids], world.config)[0].position
    template = next(p for p in world.players.values() if p.club_id is None and p.position == position)
    # Only one affordable free agent remains for the priority position.
    for pid in [p.id for p in world.players.values() if p.club_id is None and p.id != template.id]:
        del world.players[pid]
    for index in range(15):
        star = replace(template, id=1000+index, rating=95, potential=95,
                       attributes=Attributes(tuple(95 for _ in ATTRIBUTE_NAMES)))
        world.players[star.id] = star
    from core.ai.market import expected_wage, market_value
    club.wage_cap = club.wage_bill + expected_wage(market_value(template, world, club, False), world.config)
    club.transfer_budget = 0
    proposals = [p for p in propose_transfers(world, Random(4)) if p.target_id == club.id]
    assert [p.player_id for p in proposals] == [template.id]


def test_failed_priority_position_does_not_block_other_positions(config):
    from core.ai.market import propose_transfers, needs_for
    world = recruitment_world(config)
    club = world.clubs[1]
    priority = needs_for(club, [world.players[pid] for pid in club.player_ids], world.config)[0].position
    rejected = {club.id: {p.id for p in world.players.values() if p.position == priority}}
    proposals = [p for p in propose_transfers(world, Random(1), rejected=rejected) if p.target_id == club.id]
    assert proposals
    assert all(world.players[p.player_id].position != priority for p in proposals)


def test_rejected_offer_triggers_immediate_alternative_even_without_daily_review(config):
    from core.ai.market import asking_price
    from core.world.market import settle_offers, open_offers
    world = recruitment_world(config, probability=0)
    player = world.players[201]
    quote = asking_price(player, world.clubs[2], world)
    offer = TransferOffer("refused", world.date, player.id, 2, 1, player.contract, 1, 1, 1, True)
    world.offers[offer.key] = offer
    close_auction(world)
    rejected = settle_offers(world, True)
    assert rejected == {1: {player.id}}
    assert quote > 1
    open_offers(world, True, rejected)
    alternatives = [o for o in world.offers.values() if o.target_id == 1]
    assert alternatives
    assert all(o.player_id != player.id for o in alternatives)


def test_planned_offers_share_one_wage_and_transfer_envelope(config):
    from core.ai.market import propose_transfers, expected_wage, market_value
    world = recruitment_world(config)
    club = world.clubs[1]
    cheapest = min(expected_wage(market_value(p, world, club, False), world.config)
                   for p in world.players.values() if p.club_id is None)
    club.transfer_budget = 0
    club.wage_cap = club.wage_bill + cheapest
    proposals = [p for p in propose_transfers(world, Random(1)) if p.target_id == 1]
    assert len(proposals) == 1
    assert sum(p.contract.weekly_wage for p in proposals) <= cheapest
    assert sum(p.fee for p in proposals) <= club.transfer_budget


def test_sale_of_important_player_requires_cover_in_thin_squad(config):
    from core.ai.market import can_sell
    world = mini_world(config)
    seller, player = world.clubs[2], world.players[201]
    assert not can_sell(player, seller, world)
    for pid in range(800, 804):
        extra = replace(player, id=pid)
        world.players[pid] = extra
        seller.player_ids.append(pid)
    assert can_sell(player, seller, world)


def club_within_reach_of(player, config):
    """A reputation whose target level the player exceeds by less than the tolerated margin."""
    profile, rules = config.management.target_profile, config.management.market
    return (player.rating - rules.club_outgrown_margin - profile.base_level) / profile.reputation_weight + 1


def add_star(world, seller, level=95, position=None):
    star = synthetic_lineup(world.config, 90, level=level).slots[0].player
    star.id, star.club_id, star.contract = 850, seller.id, Contract(1000, Date(world.season + 3, 6, 30), world.date)
    if position is not None: star.position = position
    world.players[star.id] = star
    seller.player_ids.append(star.id)
    return star


def test_sale_of_important_player_requires_cover_even_with_surplus_squad(config):
    from core.ai.market import can_sell, nominal_size
    world = mini_world(config)
    seller = world.clubs[2]
    star = add_star(world, seller)
    # The club aims high enough that the star is one of its own: cover is required.
    seller.reputation = club_within_reach_of(star, config)
    # Fill the squad above nominal size with low-value, non-goalkeeper backups:
    # a numerical surplus elsewhere must not excuse leaving the star uncovered.
    for pid in range(800, 806):
        extra = replace(world.players[203], id=pid)
        world.players[pid] = extra
        seller.player_ids.append(pid)
    assert len(seller.player_ids) > nominal_size(config)
    assert not can_sell(star, seller, world)


def test_simultaneous_sales_recheck_remaining_cover(config):
    from core.ai.market import asking_price
    from core.world.market import settle_offers
    world = recruitment_world(config)
    seller = world.clubs[2]
    for pid in range(800, 801):
        extra = replace(world.players[201], id=pid)
        world.players[pid] = extra
        seller.player_ids.append(pid)
        seller.wage_bill += extra.contract.weekly_wage
    for pid in (201, 203):
        player = world.players[pid]
        quote = asking_price(player, seller, world)
        offer = TransferOffer(str(pid), world.date, pid, 2, 1, player.contract, quote, quote, 1)
        world.offers[offer.key] = offer
    close_auction(world)
    rejected = settle_offers(world, True)
    assert len(world.transfers) == 1
    assert len(seller.player_ids) == 20
    assert rejected == {1: {203}}


def test_transfer_wage_cannot_cut_existing_contract(config):
    from core.ai.market import recruitment_wage, propose_transfers
    world = recruitment_world(config)
    player = world.players[201]
    player.contract.weekly_wage = 2000000
    assert recruitment_wage(player, world.clubs[1], world) == 2000000
    world.clubs[1].wage_cap = world.clubs[1].wage_bill + 100000
    assert all(p.player_id != player.id for p in propose_transfers(world, Random(1)) if p.target_id == 1)


def test_needs_account_for_secondary_positions_and_distinct_players(config):
    from core.ai.market import needs_for
    world = mini_world(config)
    club = world.clubs[1]
    squad = [world.players[pid] for pid in club.player_ids]
    # All these synthetic players are equally capable at every position.
    # Changing primary labels does not create fictitious outfield shortages.
    original = needs_for(club, squad, config)
    relabelled = [replace(p, position=world.players[101].position) if p.position != "GB" else p for p in squad]
    assert needs_for(club, relabelled, config) == original


def test_minimum_gain_prevents_marginal_shopping(config):
    from core.ai.market import propose_transfers
    world = recruitment_world(config)
    rules = replace(world.config.management.market, minimum_quality_gain=10000)
    world.config = replace(world.config, management=replace(world.config.management, market=rules))
    assert not propose_transfers(world, Random(1))


def test_reinforced_position_stays_completed_until_next_window(config, monkeypatch):
    from core.ai.market import propose_transfers, Need
    from core.ai.controller import AIController
    world = recruitment_world(config)
    position = world.players[101].position
    monkeypatch.setattr(AIController, "evaluate_needs", lambda *args: [Need(position, 100)])
    assert any(p.target_id == 1 for p in propose_transfers(world, Random(1)))
    world.transfers.append(TransferRecord(world.date, 101, 2, 1, 1000))
    assert not any(p.target_id == 1 for p in propose_transfers(world, Random(1)))
    world.date = Date(2026, 1, 1)
    assert any(p.target_id == 1 for p in propose_transfers(world, Random(1)))


def test_completed_position_reopens_for_a_real_shortage(config):
    from core.ai.market import propose_transfers
    world = recruitment_world(config)
    club = world.clubs[1]
    keeper_ids = [pid for pid in club.player_ids if world.players[pid].position == "GB"]
    world.transfers.append(TransferRecord(world.date, keeper_ids[0], None, 1, 0))
    club.player_ids.remove(keeper_ids[1])
    assert any(world.players[p.player_id].position == "GB" and p.target_id == 1
               for p in propose_transfers(world, Random(1)))


def test_initial_funding_shrinks_with_payroll_and_never_refills(config):
    from core.world.finances import annual_funding_factor
    from core.world.events import BudgetRenewed
    world = mini_world(config)
    club = world.clubs[1]
    club.funding_factor = 5
    club.wage_bill = 200000
    before_cash = club.balance
    base = 10000000
    factor = annual_funding_factor(club, config, base)
    assert 1 < factor < 5
    income = round(base * factor)
    cap = round(income * config.management.budgets.wage_income_share / 52)
    apply(world, BudgetRenewed(club.id, income, cap, club.transfer_budget, 1, factor))
    assert club.balance == before_cash
    assert club.wage_cap >= club.wage_bill
    club.wage_bill *= 2  # New spending cannot recreate an expired subsidy.
    assert annual_funding_factor(club, config, base) == factor
    club.wage_bill = 0
    assert annual_funding_factor(club, config, base) == 1


def test_squad_depth_grows_with_club_reputation(config):
    from core.ai.market import squad_depth
    rules = config.management.market
    club = mini_world(config).clubs[1]
    club.reputation = rules.min_depth_reputation - 10
    assert squad_depth(club, config) == rules.min_squad_depth
    club.reputation = rules.max_depth_reputation + 10
    assert squad_depth(club, config) == rules.max_squad_depth
    club.reputation = (rules.min_depth_reputation + rules.max_depth_reputation) / 2
    assert squad_depth(club, config) == round((rules.min_squad_depth + rules.max_squad_depth) / 2)


def test_rotation_player_needs_cover_before_sale_even_when_a_backup_bench_exists(config):
    from core.ai.market import can_sell
    from core.domain.players import Attributes
    world = mini_world(config)
    seller = world.clubs[2]
    def weaken(player):
        return replace(player, rating=50, attributes=Attributes(tuple(v - 20 for v in player.attributes.values)))
    # Sixteen regulars, then a bench twenty points weaker: the useful squad (19 players
    # at this reputation) is not covered beyond its sixteenth member.
    regulars = {pid: world.players[pid] for pid in range(216, 220)}
    for pid, regular in regulars.items(): world.players[pid] = weaken(regular)
    for index, position in enumerate(["GB", "DL", "DC", "DR", "MC", "AILD"]):
        extra = replace(weaken(world.players[200 + index]), id=860 + index, position=position)
        world.players[extra.id] = extra
        seller.player_ids.append(extra.id)
    world.players[217] = regulars[217]
    player = world.players[217]
    squad = [world.players[pid] for pid in seller.player_ids]
    replaced = [item for item in squad if item.id != player.id]
    tolerance = player.rating * config.management.utility.backup_weight
    # Under the graded weights this rotation player is nearly free to sell...
    assert squad_quality(squad, seller, config) - squad_quality(replaced, seller, config) <= tolerance
    # ...but a club that plays its rotation all season keeps him without cover.
    assert not can_sell(player, seller, world)
    # With regulars all the way down the useful squad, losing him costs a rotation slot only.
    world.players.update(regulars)
    assert can_sell(player, seller, world)


@pytest.mark.parametrize("case,rating,morale,target_reputation,allowed", [
    ("step down to a club beneath the player", 74, 0.74, 57, False),
    ("step down but extremely unhappy", 74, 0.4, 57, True),
    ("lateral move within tolerance", 74, 0.74, 88, True),
    ("club at the player's own level", 74, 0.74, 70, True),
    ("weaker player joins a smaller club", 50, 0.74, 57, True),
])
def test_player_refuses_to_step_down_unless_desperate(config, case, rating, morale, target_reputation, allowed):
    from core.world.transfer_rules import accepts_move
    world = mini_world(config)
    player, source, target = world.players[201], world.clubs[2], world.clubs[1]
    source.reputation, target.reputation = 91, target_reputation
    player.rating, player.morale = rating, morale
    assert accepts_move(player, target, world) is allowed, case


def test_step_ups_and_free_agents_are_never_refused(config):
    from core.world.transfer_rules import accepts_move
    world = mini_world(config)
    player, buyer = world.players[201], world.clubs[1]
    player.rating, player.morale = 90, 1.0
    buyer.reputation, world.clubs[2].reputation = 91, 40
    assert accepts_move(player, buyer, world) is True  # step up
    world.clubs[2].reputation, buyer.reputation = 91, 30
    player.club_id = None
    assert accepts_move(player, buyer, world) is True  # free agent


def test_settlement_cancels_offer_the_player_refuses(config):
    from core.ai.market import asking_price
    from core.world.market import settle_offers
    world = mini_world(config)
    player, seller, buyer = world.players[201], world.clubs[2], world.clubs[1]
    seller.reputation, buyer.reputation = 91, 57
    player.rating, player.morale = 74, 0.74
    quote = asking_price(player, seller, world)
    offer = TransferOffer("refused", world.date, player.id, seller.id, buyer.id, player.contract, quote, quote, 1)
    world.offers[offer.key] = offer
    close_auction(world)
    assert settle_offers(world, True) == {buyer.id: {player.id}}
    assert player.club_id == seller.id and not world.offers and not world.transfers


def test_settlement_surfaces_offers_for_the_human_seller_instead_of_deciding(config):
    from core.ai.market import asking_price
    from core.world.market import settle_offers
    world = mini_world(config)
    player, seller, buyer = world.players[201], world.clubs[2], world.clubs[1]
    world.controlled_club_id = seller.id
    quote = asking_price(player, seller, world)
    offer = TransferOffer("human-seller", world.date, player.id, seller.id, buyer.id, player.contract, quote, quote, 1)
    world.offers[offer.key] = offer
    close_auction(world)
    rejected = settle_offers(world, True)
    assert not rejected  # not decided at all, not rejected
    assert player.club_id == seller.id  # still unsold
    pending = world.offers[offer.key]
    assert pending.awaiting_review is True
    assert world.news and world.news[-1].kind == "offer_received" and world.news[-1].club_id == seller.id
    # A second settlement pass does not re-announce the same offer.
    news_count = len(world.news)
    settle_offers(world, True)
    assert len(world.news) == news_count


def extra_buyer(world, club_id):
    club = Club(club_id, f"Club {club_id}", "FRA", 16, 16, ClubStatus.ACTIVE, 30000, 70, 70, "4-3-3",
                ClubPersonality(.5, .5, .5, .5), [], wage_cap=1000000000, transfer_budget=1000000000, balance=1000000000)
    world.clubs[club_id] = club
    return club


def test_rival_bids_during_the_auction_period_compete_on_player_score(config):
    from core.ai.market import asking_price
    from core.world.market import settle_offers
    world = recruitment_world(config)
    seller, player = world.clubs[2], world.players[201]
    extra_buyer(world, 3)
    cover = replace(player, id=800)
    world.players[cover.id] = cover
    seller.player_ids.append(cover.id)
    quote = asking_price(player, seller, world)
    first_day = world.date
    early = TransferOffer("early", first_day, player.id, seller.id, 1, player.contract, quote, quote, 1.0)
    world.offers[early.key] = early
    world.date = first_day.add_days(1)
    late = TransferOffer("late", world.date, player.id, seller.id, 3, player.contract, quote, quote, 5.0)
    world.offers[late.key] = late
    # The early offer alone would have been decided the next day; it now waits for rivals.
    auction_days = config.management.market.auction_days
    assert auction_days >= 2
    world.date = first_day.add_days(auction_days - 1)
    assert settle_offers(world, True) == {} and len(world.offers) == 2 and player.club_id == seller.id
    world.date = first_day.add_days(auction_days)
    rejected = settle_offers(world, True)
    assert player.club_id == 3 and rejected == {1: {player.id}}


def test_best_sellable_players_reach_every_club_despite_random_scanning(config):
    from core.ai.market import propose_transfers, needs_for
    from core.domain.players import Attributes, ATTRIBUTE_NAMES
    world = recruitment_world(config)
    club = world.clubs[1]
    position = needs_for(club, [world.players[pid] for pid in club.player_ids], world.config)[0].position
    template = next(p for p in world.players.values() if p.club_id is None and p.position == position)
    for pid in [p.id for p in world.players.values() if p.club_id is None]: del world.players[pid]
    for index in range(30):
        weak = replace(template, id=2000 + index, rating=40, attributes=Attributes(tuple(40 for _ in ATTRIBUTE_NAMES)))
        world.players[weak.id] = weak
    star = replace(template, id=3000, rating=95, potential=95, attributes=Attributes(tuple(95 for _ in ATTRIBUTE_NAMES)))
    world.players[star.id] = star
    rules = replace(world.config.management.market, max_candidates_scanned=2)
    world.config = replace(world.config, management=replace(world.config.management, market=rules))
    for seed in range(8):
        targets = {p.player_id for p in propose_transfers(world, Random(seed)) if p.target_id == club.id}
        assert star.id in targets, seed


def test_star_far_above_a_small_club_is_sellable_but_only_at_his_price(config):
    from core.ai.market import can_sell, asking_price, seller_accepts
    world = mini_world(config)
    seller = world.clubs[2]
    star = add_star(world, seller)
    seller.reputation = 50
    assert can_sell(star, seller, world)
    quote = asking_price(star, seller, world)
    assert not seller_accepts(star, seller, quote - 1, world, Random(1))
    assert seller_accepts(star, seller, quote, world, Random(1))
    # The same player at a club whose ambitions he does not exceed is still protected.
    seller.reputation = club_within_reach_of(star, config)
    assert not can_sell(star, seller, world)


def test_outgrown_star_still_cannot_leave_below_squad_minimums(config):
    from core.ai.market import can_sell
    from core.domain.players import Position
    world = mini_world(config)
    seller = world.clubs[2]
    seller.reputation = 50
    star = add_star(world, seller, position=Position.STRIKER)
    assert can_sell(star, seller, world)
    guard = config.management.guardrails
    squad = list(seller.player_ids)
    seller.player_ids = squad[-guard.min_squad:]
    assert not can_sell(star, seller, world)
    seller.player_ids = squad
    # A star goalkeeper stays while he is one of the minimum number of keepers.
    for pid in squad:
        if world.players[pid].position == Position.GOALKEEPER: world.players[pid].position = Position.CENTER_BACK
    star.position = Position.GOALKEEPER
    for pid in range(901, 901 + guard.min_goalkeepers - 1):
        world.players[pid] = replace(world.players[201], id=pid, position=Position.GOALKEEPER)
        seller.player_ids.append(pid)
    assert not can_sell(star, seller, world)
    world.players[999] = replace(world.players[201], id=999, position=Position.GOALKEEPER)
    seller.player_ids.append(999)
    assert can_sell(star, seller, world)


def test_buyers_bid_for_a_star_stuck_at_a_small_club(config):
    from core.ai.market import propose_transfers, needs_for
    world = recruitment_world(config)
    buyer = world.clubs[1]
    priority = needs_for(buyer, [world.players[pid] for pid in buyer.player_ids], world.config)[0].position
    star = add_star(world, world.clubs[2], position=priority)
    world.clubs[2].reputation = 50
    bids = [p for p in propose_transfers(world, Random(1)) if p.player_id == star.id]
    assert bids and all(p.target_id == 1 for p in bids)
    # A club that can hold him keeps its star: nobody may even bid.
    world.clubs[2].reputation = club_within_reach_of(star, config)
    assert not [p for p in propose_transfers(world, Random(1)) if p.player_id == star.id]


def restless_setup(config, rating=94, reputation=59, ego=0.0):
    world = mini_world(config)
    player, club = world.players[201], world.clubs[2]
    player.rating, player.ego, club.reputation = rating, ego, reputation
    return world, player, club


def test_player_beyond_a_small_club_wants_to_leave_even_with_a_modest_ego(config):
    from core.world.transfer_rules import frustration, wants_to_leave
    world, player, club = restless_setup(config)
    assert wants_to_leave(player, world)
    assert frustration(player, world) < 1
    # Ego raises the restlessness; a smaller club raises it too; both are bounded by 1.
    calm = frustration(player, world)
    player.ego = 1.0
    assert calm < frustration(player, world) <= 1
    player.ego = 0.0
    club.reputation = 40
    assert frustration(player, world) > calm


def test_player_within_reach_of_his_club_or_without_one_is_not_restless(config):
    from core.world.transfer_rules import frustration, wants_to_leave, target_level
    world, player, club = restless_setup(config, ego=1.0)
    rules = config.management.market
    player.rating = target_level(club, config) + rules.club_outgrown_margin
    assert frustration(player, world) == 0 and not wants_to_leave(player, world)
    player.rating += 1
    assert frustration(player, world) > 0  # restless, not yet keen to leave
    assert not wants_to_leave(player, world)
    world, player, club = restless_setup(config)
    player.club_id = None
    assert frustration(player, world) == 0.0


def test_restless_star_does_not_step_down_even_when_very_unhappy(config):
    from core.world.transfer_rules import accepts_move
    world, player, source = restless_setup(config)
    target = world.clubs[1]
    target.reputation = 40
    player.morale = 0.3
    assert source.reputation - target.reputation > config.management.market.reputation_drop_tolerance
    assert accepts_move(player, target, world) is False
    target.reputation = 75  # a bigger club is welcome
    assert accepts_move(player, target, world) is True


def test_restless_star_accepts_only_a_clearly_bigger_club(config):
    from core.world.transfer_rules import accepts_move
    world, player, source = restless_setup(config)
    target = world.clubs[1]
    band = config.management.market.reputation_drop_tolerance
    for gain, allowed in ((-15, False), (0, False), (band, False), (band + 0.5, True), (30, True)):
        target.reputation = source.reputation + gain
        assert accepts_move(player, target, world) is allowed, gain
    # A player who is not restless still takes a lateral move.
    player.rating = 70
    target.reputation = source.reputation
    assert accepts_move(player, target, world) is True


def renewal_setup(config, reputation):
    from core.ai.market import expected_wage, market_value
    world, player, club = restless_setup(config, reputation=reputation, ego=0.2)
    club.wage_cap = 10 ** 9
    wage = expected_wage(market_value(player, world, club, False), world.config)
    player.contract = Contract(wage, world.date.add_days(180), Date(2024, 7, 1))
    club.wage_bill += wage
    player.morale = 0.9
    return world, player


def test_restless_star_refuses_to_extend_and_loses_morale_while_a_settled_one_extends(config):
    from core.world.contracts import renewal_events
    from core.world.events import PlayerChanged, PlayerSigned
    world, player = renewal_setup(config, reputation=50)
    events = renewal_events(world)
    restless_morale = next(e.morale for e in events if isinstance(e, PlayerChanged) and e.player_id == player.id)
    assert not [e for e in events if isinstance(e, PlayerSigned) and e.player_id == player.id]
    world, player = renewal_setup(config, reputation=100)
    events = renewal_events(world)
    settled_morale = next(e.morale for e in events if isinstance(e, PlayerChanged) and e.player_id == player.id)
    assert [e for e in events if isinstance(e, PlayerSigned) and e.player_id == player.id]
    assert restless_morale < player.morale - 0.01 < settled_morale + 0.01
    assert restless_morale < settled_morale


def test_renewal_forks_to_a_pending_proposal_for_the_human_club(config):
    from core.world.contracts import renewal_events
    from core.world.events import RenewalProposed
    world, player = renewal_setup(config, reputation=100)
    world.controlled_club_id = player.club_id
    events = renewal_events(world)
    proposed = [e for e in events if isinstance(e, RenewalProposed) and e.proposal.player_id == player.id]
    assert proposed and proposed[0].proposal.club_id == player.club_id
    assert not [e for e in events if isinstance(e, PlayerSigned) and e.player_id == player.id]
    for event in events:
        apply(world, event)
    assert player.id in world.pending_renewals
    assert world.pending_renewals[player.id].contract.weekly_wage >= player.contract.weekly_wage
    assert world.news and world.news[-1].kind == "renewal_proposed" and world.news[-1].club_id == player.club_id
    # A pending proposal is not regenerated on the next weekly pass.
    again = renewal_events(world)
    assert not [e for e in again if isinstance(e, RenewalProposed) and e.proposal.player_id == player.id]
