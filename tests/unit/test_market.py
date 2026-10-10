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
    from core.ai.market import Bid, asking_price, market_value, seller_accepts
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
    event = Bid(player.id, seller.id, 1, player.contract, quote, limit=2 * quote)
    monkeypatch.setattr(market, "propose_transfers", lambda *args, **kwargs: [event])
    open_offers(world, True)
    # The asking price is known to all: the buyer offers it outright, and reserves no more.
    offer = next(iter(world.offers.values()))
    assert (offer.fee, offer.ceiling, offer.limit) == (quote, quote, 2 * quote)
    close_auction(world)
    settle_offers(world, True)
    # Alone, it pays the asking price, however much more it would have paid.
    assert player.club_id == 1
    assert world.transfers[-1].fee == quote


def test_a_clubs_price_limit_follows_its_need_its_appetite_and_its_own_reading(config):
    from core.ai.market import market_value, price_limit
    world = mini_world(config)
    player, buyer = world.players[201], world.clubs[1]
    rules = config.management.market
    value = market_value(player, world, buyer)
    limits = [price_limit(player, buyer, world, need) for need in (0, 0.5, 1)]
    assert limits[0] < limits[1] < limits[2]
    # Its reading of the player is drawn once for the window: asked again, the club says the same.
    assert price_limit(player, buyer, world, 1) == limits[2]
    # Two clubs never read a player quite alike.
    assert price_limit(player, replace(buyer, id=77), world, 1) != limits[2]
    # Without that reading, the limit is the value seen times the multiplier, raised by the need.
    quiet = replace(rules, offers=replace(rules.offers, noise=0.0))
    world.config = replace(config, management=replace(config.management, market=quiet))
    assert price_limit(player, buyer, world, 0) == round(value * rules.buyer_price_multiplier)
    assert price_limit(player, buyer, world, 1) == round(value * (rules.buyer_price_multiplier + rules.offers.need_premium))
    assert price_limit(player, buyer, world, 5) == price_limit(player, buyer, world, 1)
    # A club with an appetite for risk pays more, a cautious one less.
    bold, cautious = (replace(buyer, personality=replace(buyer.personality, risk_appetite=appetite)) for appetite in (0.9, 0.1))
    assert price_limit(player, cautious, world, 1) < price_limit(player, buyer, world, 1) < price_limit(player, bold, world, 1)


def test_a_club_leaves_a_player_asked_more_than_he_is_worth_to_it(config):
    from core.ai.market import propose_transfers, needs_for, asking_price
    world = recruitment_world(config)
    buyer = world.clubs[1]
    priority = needs_for(buyer, [world.players[pid] for pid in buyer.player_ids], world.config)[0].position
    star = add_star(world, world.clubs[2], position=priority)
    world.clubs[2].reputation = 50
    bid = next(p for p in propose_transfers(world, Random(1)) if p.player_id == star.id)
    assert bid.fee == asking_price(star, world.clubs[2], world) <= bid.limit
    # A club that would not pay that much for him turns to another player.
    rules = world.config.management.market
    tight = replace(rules, buyer_price_multiplier=1.0, offers=replace(rules.offers, need_premium=0.0))
    world.config = replace(world.config, management=replace(world.config.management, market=tight))
    proposals = [p for p in propose_transfers(world, Random(1)) if p.target_id == buyer.id]
    assert proposals and all(p.player_id != star.id for p in proposals)


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
    from core.ai.market import wage_demand
    club.wage_cap = club.wage_bill + wage_demand(template, club, world)
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
    from core.ai.market import propose_transfers, wage_demand
    world = recruitment_world(config)
    club = world.clubs[1]
    cheapest = min(wage_demand(p, club, world) for p in world.players.values() if p.club_id is None)
    club.transfer_budget = 0
    club.wage_cap = club.wage_bill + cheapest
    proposals = [p for p in propose_transfers(world, Random(1)) if p.target_id == 1]
    assert len(proposals) == 1
    assert sum(p.contract.weekly_wage for p in proposals) <= cheapest
    assert sum(p.fee for p in proposals) <= club.transfer_budget


def settled_squad(world, seller):
    """Club 2's players without a prospect's margin, so their status is their place and their minutes alone."""
    for pid in seller.player_ids: world.players[pid].potential = world.players[pid].rating
    return [world.players[pid] for pid in seller.player_ids]


def test_asking_price_follows_the_players_status_in_his_squad(config):
    from core.ai.market import asking_price, can_sell, market_value, nominal_size, squad_places, squad_status
    from core.domain.players import Attributes
    world = mini_world(config)
    seller = world.clubs[2]
    # Beyond the nominal squad the weakest players have no place: the first extra is the weakest of all.
    template = world.players[203]
    for index in range(nominal_size(config) + 2 - len(seller.player_ids)):
        drop = 30 if index == 0 else 20
        extra = replace(template, id=870 + index, rating=template.rating - drop, potential=template.rating - drop,
                        attributes=Attributes(tuple(value - drop for value in template.attributes.values)))
        world.players[extra.id] = extra
        seller.player_ids.append(extra.id)
    squad = settled_squad(world, seller)
    places = squad_places(squad, seller, config)
    starter = next(player for player in squad if player.position != "GB" and places.get(player.id, 99) < config.world.match_rules.players_on_pitch)
    # A starter is sold, but well above his value; nothing short of the squad minimums protects him.
    assert can_sell(starter, seller, world) and squad_status(starter, seller, world) == 1
    assert asking_price(starter, seller, world) > 1.5 * market_value(starter, world, seller)
    # Beyond the useful squad, a player without prospects goes below his value.
    assert 870 not in places
    assert squad_status(world.players[870], seller, world) < 0.1
    assert asking_price(world.players[870], seller, world) < market_value(world.players[870], world, seller)
    # The same player as a prospect keeps a rotation player's price.
    world.players[870].potential = world.players[870].rating + 2 * config.management.market.prospect_margin
    assert squad_status(world.players[870], seller, world) >= 0.6


def test_a_player_who_plays_every_match_is_priced_as_a_starter(config):
    from core.ai.market import asking_price, squad_places, squad_status
    world = mini_world(config)
    seller = world.clubs[2]
    squad = settled_squad(world, seller)
    places = squad_places(squad, seller, config)
    bench = next(player for player in squad if places.get(player.id, 0) >= config.world.match_rules.players_on_pitch)
    before = asking_price(bench, seller, world)
    minutes = config.management.market.minutes_confidence_matches * config.engine.timing.match_seconds / 60
    for player in squad: player.season_minutes = minutes
    assert squad_status(bench, seller, world) == 1
    assert asking_price(bench, seller, world) > before


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


def test_simultaneous_sales_recheck_squad_minimums(config):
    from core.ai.market import asking_price
    from core.world.market import settle_offers
    world = recruitment_world(config)
    seller = world.clubs[2]
    minimum = config.management.guardrails.min_squad
    for pid in [pid for pid in seller.player_ids if pid not in (201, 203)][:len(seller.player_ids) - minimum - 1]:
        seller.player_ids.remove(pid)
    for pid in (201, 203):
        player = world.players[pid]
        quote = asking_price(player, seller, world)
        offer = TransferOffer(str(pid), world.date, pid, 2, 1, player.contract, quote, quote, 1)
        world.offers[offer.key] = offer
    close_auction(world)
    rejected = settle_offers(world, True)
    assert len(world.transfers) == 1
    assert len(seller.player_ids) == minimum
    assert rejected == {1: {203}}


def test_wage_demand_rises_for_a_bigger_club_and_may_drop_for_a_smaller_one(config):
    from core.ai.market import market_wage, wage_demand, propose_transfers
    world = recruitment_world(config)
    player, buyer, seller = world.players[201], world.clubs[1], world.clubs[2]
    player.contract.weekly_wage = 2000000  # well above his market wage
    player.greed = 0.0
    seller.reputation, buyer.reputation = 70, 70
    # The move starts from his market wage and the share he keeps of what he earns above it.
    market = market_wage(player, buyer, config)
    start = round(market + config.management.contracts.overpay_kept_share * (2000000 - market))
    assert market < wage_demand(player, buyer, world) == start < 2000000
    buyer.reputation = 80
    assert wage_demand(player, buyer, world) > start
    buyer.reputation = 60
    lower = wage_demand(player, buyer, world)
    assert start * (1 - 1.5 * config.management.contracts.max_cut) - 1 <= lower < start
    # A player who wants to leave a club beneath him asks no more than his market wage.
    seller.reputation, player.rating = 20, 90
    buyer.reputation = 99
    restless = market_wage(player, buyer, config)
    assert wage_demand(player, buyer, world) <= round(restless * (1 + 1.5 * config.management.contracts.max_raise))
    seller.reputation, player.rating, buyer.reputation = 70, 70, 60
    # A greedy player concedes less and asks a premium on top.
    player.greed = 1.0
    assert wage_demand(player, buyer, world) > lower
    # A buyer who cannot pay the demand does not bid.
    buyer.reputation = 70
    buyer.wage_cap = buyer.wage_bill + 100000
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
    assert [(line.key, line.club_id, line.amount, line.state) for line in world.news[-1].lines] == [(offer.key, buyer.id, quote, "pending")]
    # A second settlement pass does not re-announce the same offer.
    news_count = len(world.news)
    settle_offers(world, True)
    assert len(world.news) == news_count


def extra_buyer(world, club_id):
    club = Club(club_id, f"Club {club_id}", "FRA", 16, 16, ClubStatus.ACTIVE, 30000, 70, 70, "4-3-3",
                ClubPersonality(.5, .5, .5, .5), [], wage_cap=1000000000, transfer_budget=1000000000, balance=1000000000)
    world.clubs[club_id] = club
    return club


def rival_offers(world, player, seller, bidders):
    """Offers for a player at his asking price, one per buyer: `bidders` gives each its price limit as a multiple of
    that price, and the score the player gives its club. Returns the asking price."""
    from core.ai.market import asking_price
    quote = asking_price(player, seller, world)
    for club_id, (limit, score) in bidders.items():
        if club_id not in world.clubs: extra_buyer(world, club_id)
        fee = min(quote, round(quote * limit))
        world.offers[str(club_id)] = TransferOffer(str(club_id), world.date, player.id, seller.id, club_id, player.contract,
                                                   fee, fee, score, limit=round(quote * limit))
    return quote


def auction_world(config):
    """Club 2 can let player 201 go: a like-for-like cover stays."""
    world = recruitment_world(config)
    seller, player = world.clubs[2], world.players[201]
    cover = replace(player, id=800)
    world.players[cover.id] = cover
    seller.player_ids.append(cover.id)
    return world, player, seller


@pytest.mark.parametrize("scores,winner", [((1.0, 2.0, 9.0), 3), ((2.0, 1.0, 9.0), 1)])
def test_rivals_outbid_each_other_and_the_player_picks_among_the_highest_offers(config, scores, winner):
    from math import ceil
    from core.world.market import settle_offers
    world, player, seller = auction_world(config)
    quote = rival_offers(world, player, seller, {1: (1.5, scores[0]), 3: (1.3, scores[1]), 4: (1.0, scores[2])})
    before = seller.balance
    close_auction(world)
    rejected = settle_offers(world, True)
    # The keenest stops one step above the reach of the next, who ends at its own; the third cannot follow, and the
    # player's liking for its club no longer counts. Between the two highest offers, he picks.
    step = config.management.market.offers.outbid_step
    fees = {1: ceil(round(quote * 1.3) * (1 + step)), 3: round(quote * 1.3)}
    assert player.club_id == winner and world.transfers[-1].fee == fees[winner] > quote
    assert seller.balance == before + fees[winner]
    assert rejected == {club_id: {player.id} for club_id in (1, 3, 4) if club_id != winner}


def test_a_lone_buyer_pays_the_asking_price_and_one_that_cannot_reach_it_is_turned_down(config):
    from core.world.market import settle_offers
    world, player, seller = auction_world(config)
    quote = rival_offers(world, player, seller, {1: (0.99, 5.0), 3: (1.6, 1.0)})
    close_auction(world)
    assert settle_offers(world, True) == {1: {player.id}}
    assert player.club_id == 3 and world.transfers[-1].fee == quote


def test_a_bid_rises_no_further_than_the_buyers_means(config):
    from core.world.market import outbid, reach
    world, player, seller = auction_world(config)
    quote = rival_offers(world, player, seller, {1: (3.0, 1.0), 3: (2.0, 1.0)})
    rich, other = world.offers["1"], world.offers["3"]
    assert (reach(world, rich), reach(world, other)) == (3 * quote, 2 * quote)
    # What its other offers reserve is no longer there to raise this one.
    buyer = world.clubs[1]
    buyer.transfer_budget = buyer.balance = 4 * quote
    world.offers["else"] = TransferOffer("else", world.date, 202, seller.id, 1, player.contract, 0, 2 * quote, 1.0)
    assert reach(world, rich) == 2 * quote
    # Never less than it already offers, and an offer made before buyers had a limit stops at what it reserved.
    buyer.transfer_budget = 0
    assert reach(world, rich) == quote
    assert reach(world, replace(other, limit=None, ceiling=quote + 5)) == quote + 5
    assert outbid(world, [rich], quote) == {"1": quote}


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
    # The same player at a club whose ambitions he does not exceed is sold all the same, as the starter he is.
    seller.reputation = club_within_reach_of(star, config)
    assert can_sell(star, seller, world)


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
    from core.ai.market import propose_transfers, needs_for, asking_price
    world = recruitment_world(config)
    buyer = world.clubs[1]
    priority = needs_for(buyer, [world.players[pid] for pid in buyer.player_ids], world.config)[0].position
    star = add_star(world, world.clubs[2], position=priority)
    world.clubs[2].reputation = 50
    bids = [p for p in propose_transfers(world, Random(1)) if p.player_id == star.id]
    assert bids and all(p.target_id == 1 for p in bids)
    assert all(p.fee == asking_price(star, world.clubs[2], world) for p in bids)


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
    from core.ai.market import market_wage
    world, player, club = restless_setup(config, reputation=reputation, ego=0.2)
    club.wage_cap = 10 ** 9
    wage = market_wage(player, club, world.config)
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


def test_a_demand_turned_down_is_made_again_only_once_when_the_end_comes_in_sight(config, monkeypatch):
    from collections import Counter
    from core.world import contracts, renewals
    from core.world.events import RenewalProposed
    world, player = renewal_setup(config, reputation=100)
    club = world.clubs[player.club_id]
    world.controlled_club_id = club.id
    # Underpaid and never fielded, with years left on his contract: he asks for a raise.
    club.competition_id = -16
    monkeypatch.setattr(contracts, "games_by_club", lambda world: Counter({club.id: 10}))
    player.contract.weekly_wage //= 2
    player.contract.end = Date(world.date.year + 3, 6, 30)

    def asks():
        events = [e for e in contracts.renewal_events(world) if isinstance(e, RenewalProposed) and e.proposal.player_id == player.id]
        for event in events: apply(world, event)
        return bool(events)
    assert asks()
    renewals.turn_down(world, player)
    assert world.refused_renewals == {player.id: world.date}
    # Turned down, he does not ask again week after week.
    for _ in range(4):
        world.date = world.date.add_days(7)
        assert not asks()
    # The end of his contract comes in sight: he asks once more, for more years, and no longer once turned down again.
    world.date = player.contract.end.add_days(-300)
    assert asks() and world.pending_renewals[player.id].contract.end > player.contract.end
    renewals.turn_down(world, player)
    for _ in range(4):
        world.date = world.date.add_days(7)
        assert not asks()
    # The club can still ask him for his terms: signed, the refusal goes with the contract it was about.
    renewals.sign(world, player)
    assert not world.refused_renewals


def test_refusals_survive_a_save_and_an_older_save_recalls_those_its_feed_tells(config, tmp_path):
    import gzip
    import json
    from core.domain.clubs import Competition
    from core.domain.offers import RenewalProposal
    from core.world import renewals
    from core.world.events import RenewalProposed
    from infrastructure.persistence.store import SaveStore
    world = mini_world(config)
    world.competitions[-16] = Competition(-16, "Test", "FRA", 1, [1, 2])
    for club in world.clubs.values(): club.competition_id = -16
    world.rngs = {key: Random(1) for key in ("market", "matches", "states", "progression", "demography")}
    world.controlled_club_id = 1
    kept, extended = (world.players[pid] for pid in world.clubs[1].player_ids[:2])
    for player in (kept, extended):
        asked = replace(player.contract, weekly_wage=player.contract.weekly_wage + 100)
        apply(world, RenewalProposed(RenewalProposal(player.id, 1, asked, world.date)))
        renewals.turn_down(world, player)
    refused = world.date
    world.date = world.date.add_days(7)
    # One of them signs a new contract since: the refusal was about the one he had.
    assert apply(world, PlayerSigned(extended.id, 1, 1, replace(extended.contract, weekly_wage=1500), 0, True))
    store = SaveStore(tmp_path)
    path = store.save(world, "refusal")
    assert store.load("refusal").refused_renewals == {kept.id: refused}
    # A save of the version before did not keep them: they are read back from its feed.
    payload = json.loads(gzip.decompress(path.read_bytes()))
    payload["schema_version"] = 26
    del payload["world"]["refused_renewals"]
    path.write_bytes(gzip.compress(json.dumps(payload).encode()))
    assert store.load("refusal").refused_renewals == {kept.id: refused}


def test_an_older_save_lets_a_demand_for_a_raise_too_small_to_ask_for_lapse(config, tmp_path):
    import gzip
    import hashlib
    import json
    from core.domain.clubs import Competition
    from core.domain.offers import RenewalProposal
    from core.world import news
    from core.world.events import RenewalProposed
    from infrastructure.persistence.store import SaveStore
    world = mini_world(config)
    world.competitions[-16] = Competition(-16, "Test", "FRA", 1, [1, 2])
    for club in world.clubs.values(): club.competition_id = -16
    world.rngs = {key: Random(1) for key in ("market", "matches", "states", "progression", "demography")}
    world.controlled_club_id = 1
    small, fair = (world.players[pid] for pid in world.clubs[1].player_ids[:2])
    for player, factor in ((small, 1.01), (fair, 1.2)):
        asked = replace(player.contract, weekly_wage=round(player.contract.weekly_wage * factor))
        apply(world, RenewalProposed(RenewalProposal(player.id, 1, asked, world.date)))
    store = SaveStore(tmp_path)
    path = store.save(world, "demands")
    # A save of the version before did not have the rule: the demand it breaks lapses, the other still awaits its answer.
    payload = json.loads(gzip.decompress(path.read_bytes()))
    payload["schema_version"] = 29
    rules = payload["world"]["config"]
    del rules["ia_gestion"]["contrats"]["hausse_min_prolongation"]
    payload["config_hash"] = hashlib.sha256(json.dumps(rules, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    path.write_bytes(gzip.compress(json.dumps(payload).encode()))
    restored = store.load("demands")
    assert restored.config == config and set(restored.pending_renewals) == {fair.id}
    assert [news.awaits_answer(restored, item) for item in restored.news if item.kind == "renewal_proposed"] == [False, True]


def test_a_newcomer_settles_before_asking_for_a_renewal(config):
    from core.world.contracts import renewal_events
    from core.world.events import RenewalProposed
    world, player = renewal_setup(config, reputation=100)
    world.controlled_club_id = player.club_id
    player.contract.end = world.date.add_days(300)
    proposed = lambda: any(isinstance(e, RenewalProposed) and e.proposal.player_id == player.id for e in renewal_events(world))
    assert proposed()
    world.transfers.append(TransferRecord(world.date, player.id, 1, player.club_id, 0, "transfer", world.season))
    assert not proposed()
    world.date = world.date.add_days(config.management.market.arrival_stability_days)
    assert proposed()


def test_an_unhappy_player_on_a_long_contract_asks_for_a_raise_or_nothing(config, monkeypatch):
    from collections import Counter
    from core.ai.market import market_wage
    from core.world import contracts
    from core.world.events import RenewalProposed
    world, player = renewal_setup(config, reputation=100)
    club = world.clubs[player.club_id]
    world.controlled_club_id = club.id
    # Fairly paid but never fielded: unhappy, with years left on his contract.
    club.competition_id = -16
    monkeypatch.setattr(contracts, "games_by_club", lambda world: Counter({club.id: 10}))
    player.greed, player.contract.end = 0.0, Date(world.date.year + 6, 6, 30)
    proposals = lambda: [e.proposal for e in contracts.renewal_events(world) if isinstance(e, RenewalProposed) and e.proposal.player_id == player.id]
    assert not proposals()
    # Paid a twentieth under what his value commands: a raise too small to ask a new contract for.
    player.contract.weekly_wage = round(market_wage(player, club, config) / 1.05)
    assert not proposals()
    # Underpaid, he asks for a raise, on a contract that does not end sooner.
    player.contract.weekly_wage //= 2
    proposal, = proposals()
    assert proposal.contract.weekly_wage >= player.contract.weekly_wage * (1 + config.management.contracts.min_raise)
    assert proposal.contract.end == player.contract.end


def test_a_player_who_joined_during_the_season_answers_only_for_the_matches_since(config):
    from core.domain.matches import Match, MatchResult, PlayerMatchStats
    from core.world.contracts import contentment, renewal_events
    from core.world.events import PlayerChanged
    from core.world.transfer_rules import season_arrivals
    world, player = renewal_setup(config, reputation=100)
    club = world.clubs[player.club_id]
    club.competition_id = 16
    other = next(cid for cid in world.clubs if cid != club.id)
    start, full = world.date, config.engine.timing.match_seconds / 60
    arrival = start.add_days(30)
    # Three matches before he came and two since, both played in full; his season minutes include those of his former club.
    for index, day in enumerate((7, 14, 21, 37, 44)):
        stats = {player.id: PlayerMatchStats(minutes=full)} if day > 30 else {}
        world.matches[index] = Match(index, 16, world.season, index, start.add_days(day), club.id, other, MatchResult(1, 0, "possession", player_stats=stats))
    player.season_minutes = 3 * full
    world.date = start.add_days(50)
    target = lambda: next(e.morale for e in renewal_events(world) if isinstance(e, PlayerChanged) and e.player_id == player.id)
    assert season_arrivals(world) == {}
    assert contentment(world, player, club, 0, 5, player.season_minutes).playing_time == pytest.approx(0.6)
    there_all_season = target()
    world.transfers.append(TransferRecord(arrival, player.id, other, club.id, 0, "transfer", world.season))
    assert season_arrivals(world) == season_arrivals(world, club.id) == {player.id: (2, 2 * full)}
    assert season_arrivals(world, other) == {}
    assert contentment(world, player, club, 0, *season_arrivals(world)[player.id]).playing_time == 1
    assert target() > there_all_season
    # Neither a move of an earlier season nor one he has since left the club of is an arrival.
    world.transfers[-1] = replace(world.transfers[-1], season=world.season - 1)
    assert season_arrivals(world) == {}
    world.transfers[-1] = replace(world.transfers[-1], season=world.season, target_id=other)
    assert season_arrivals(world) == {}


def sellable_world(config):
    """A market where club 2 can let player 201 go (a like-for-like cover stays) and the human club 1 bids."""
    world = recruitment_world(config)
    seller, player = world.clubs[2], world.players[201]
    cover = replace(player, id=800)
    world.players[cover.id] = cover
    seller.player_ids.append(cover.id)
    world.controlled_club_id = 1
    return world, player, seller


def test_human_buyer_learns_the_asking_price_of_a_refused_offer(config):
    from core.ai.market import asking_price, can_sell, seller_accepts
    from core.world.market import settle_offers, quoted_minimum
    world, player, seller = sellable_world(config)
    assert can_sell(player, seller, world)
    quote = asking_price(player, seller, world)
    low = TransferOffer("low", world.date, player.id, seller.id, 1, player.contract, quote // 2, quote // 2, 1.0)
    world.offers[low.key] = low
    close_auction(world)
    assert settle_offers(world, True) == {1: {player.id}}
    news = world.news[-1]
    assert (news.kind, news.club_id, news.player_id) == ("offer_rejected", 1, player.id)
    minimum = int(news.text.rsplit("au moins ", 1)[1].removesuffix(" €"))
    assert minimum == quoted_minimum(asking_price(player, seller, world))
    assert seller_accepts(player, seller, minimum, world, Random(1))


def test_human_buyer_is_told_when_the_player_refuses_or_prefers_a_rival(config):
    from core.world.market import settle_offers
    world, player, seller = sellable_world(config)
    rival = extra_buyer(world, 3)
    fee = 10 ** 9 // 2
    for key, target, score in (("mine", 1, 1.0), ("rival", rival.id, 5.0)):
        world.offers[key] = TransferOffer(key, world.date, player.id, seller.id, target, player.contract, fee, fee, score)
    close_auction(world)
    settle_offers(world, True)
    assert player.club_id == rival.id
    assert world.news[-1].kind == "offer_rejected" and f"a préféré l'offre de {rival.name}" in world.news[-1].text

    world, player, seller = sellable_world(config)
    seller.reputation, world.clubs[1].reputation = 91, 57
    player.rating, player.morale = 74, 0.74
    world.offers["mine"] = TransferOffer("mine", world.date, player.id, seller.id, 1, player.contract, fee, fee, 1.0)
    close_auction(world)
    assert settle_offers(world, True) == {1: {player.id}}
    assert world.news[-1].kind == "offer_rejected" and "refuse de rejoindre" in world.news[-1].text


def test_offers_still_open_when_the_window_closes_lapse_and_the_buyer_is_told(config):
    from core.world.market import settle_offers
    world, player, seller = sellable_world(config)
    own = world.players[world.clubs[1].player_ids[0]]
    world.offers["out"] = TransferOffer("out", world.date, player.id, seller.id, 1, player.contract, 1, 1, 1.0)
    world.offers["in"] = TransferOffer("in", world.date, own.id, 1, seller.id, own.contract, 1, 1, 1.0, awaiting_review=True)
    settle_offers(world, False)
    assert not world.offers
    # The offer the human club made is told as expired; the one it left unanswered simply no longer awaits an answer.
    assert [(entry.kind, entry.player_id) for entry in world.news] == [("offer_expired", player.id)]


def dormant_club(world, keep=1, weight=1.0):
    """Club 2 as a dormant club the game holds only `keep` players of, each weighing `weight` unseen ones in its wage cap."""
    market = replace(world.config.management.market, known_player_weight=weight)
    world.config = replace(world.config, management=replace(world.config.management, market=market))
    club = world.clubs[2]
    club.competition_id, club.status = None, ClubStatus.DORMANT
    for pid in club.player_ids[keep:]: del world.players[pid]
    club.player_ids = club.player_ids[:keep]
    club.wage_bill = sum(world.players[pid].contract.weekly_wage for pid in club.player_ids)
    return club


def test_a_dormant_club_keeps_a_share_of_its_wage_cap_for_each_player_the_game_does_not_hold(config):
    from core.ai.market import nominal_size, unseen_wages, wage_room
    world = mini_world(config)
    size, share = nominal_size(config), 3000
    active, club = world.clubs[1], dormant_club(world)
    club.wage_cap = share * size
    # A club that plays has its whole cap, less what it pays.
    assert unseen_wages(active, world.config) == 0 and wage_room(active, world.config) == active.wage_cap - active.wage_bill
    # The game holds one of its players: the others take their share, and he is left with his.
    assert unseen_wages(club, world.config) == share * (size - 1)
    assert wage_room(club, world.config) == share - club.wage_bill
    # A player who joins takes the place of an unseen one.
    assert wage_room(club, world.config, 1) == 2 * share - club.wage_bill
    # A full squad leaves nobody unseen.
    club.player_ids = list(range(size))
    assert unseen_wages(club, world.config) == 0


def test_a_known_player_of_a_dormant_club_weighs_several_unseen_ones(config):
    from core.ai.market import nominal_size, unseen_wages
    world = mini_world(config)
    size, club = nominal_size(config), dormant_club(world, weight=3.0)
    club.wage_cap = 1000 * (size + 2)
    # Its one known player is among its best paid: he counts for three of the places the cap is shared between.
    assert club.wage_cap - unseen_wages(club, world.config) == 3000
    # The more of its players the game holds, the less each of them adds: the cap is never theirs alone before the squad is full.
    held = [club.wage_cap - unseen_wages(club, world.config, arrivals) for arrivals in range(size)]
    assert held == sorted(held) and held[-1] == club.wage_cap
    assert all(later - earlier <= 3000 for earlier, later in zip(held, held[1:]))
    # The configured weight is the one the simulated clubs' own best paid players hold.
    assert config.management.market.known_player_weight == 3.0


def test_a_dormant_club_cannot_pay_its_known_players_the_wages_of_its_whole_squad(config):
    from core.ai.market import nominal_size
    from core.world.market import offer_limit
    world = mini_world(config)
    club, share = dormant_club(world), 3000
    club.wage_cap = share * nominal_size(config)
    player, newcomer = world.players[club.player_ids[0]], world.players[101]
    # His share of the cap, no more, though the club pays nobody else the game knows of.
    assert not apply(world, PlayerSigned(player.id, club.id, club.id, replace(player.contract, weekly_wage=share + 1), 0, True))
    assert apply(world, PlayerSigned(player.id, club.id, club.id, replace(player.contract, weekly_wage=share), 0, True))
    assert club.wage_bill == share
    # A newcomer takes the place of an unseen player, and his share with it.
    assert offer_limit(world, club, replace(newcomer.contract, weekly_wage=share + 1), 0, []) == "wages"
    assert offer_limit(world, club, replace(newcomer.contract, weekly_wage=share), 0, []) is None
    assert not apply(world, PlayerSigned(newcomer.id, 1, club.id, replace(newcomer.contract, weekly_wage=share + 1), 0))
    assert apply(world, PlayerSigned(newcomer.id, 1, club.id, replace(newcomer.contract, weekly_wage=share), 0))
    # Over what is left to it, by contracts signed before, it still extends a player who asks no more.
    club.wage_cap //= 2
    assert apply(world, PlayerSigned(player.id, club.id, club.id, replace(player.contract, end=player.contract.end.add_years(1)), 0, True))
    assert not apply(world, PlayerSigned(player.id, club.id, club.id, replace(player.contract, weekly_wage=share + 1), 0, True))


def test_a_dormant_club_extends_its_star_with_what_its_unseen_squad_leaves(config):
    from core.ai.market import market_wage, nominal_size
    from core.world.contracts import renewal_events
    world = mini_world(config)
    club = dormant_club(world)
    player = world.players[club.player_ids[0]]
    expected = market_wage(player, club, world.config)
    # Paid half the wage his value commands, at a club whose cap would hold that wage many times over.
    wage, share = expected // 2, expected * 3 // 4
    player.contract = Contract(wage, world.date.add_days(180), world.date)
    club.wage_bill, club.wage_cap = wage, share * nominal_size(config)
    signed = [event for event in renewal_events(world) if isinstance(event, PlayerSigned) and event.player_id == player.id]
    # He is offered his share of the cap, not the wage he would ask of a club that plays.
    assert [event.contract.weekly_wage for event in signed] == [share]
    assert apply(world, signed[0]) and club.wage_bill == share


def test_regens_take_the_places_a_dormant_club_keeps_for_unseen_players(config):
    from core.ai.market import nominal_size
    from core.world.demography import intake_room
    world = mini_world(config)
    wage, limit = config.demography.academies.base_weekly_wage, config.management.guardrails.max_squad
    active, club = world.clubs[1], dormant_club(world)
    assert intake_room(active, world.config) == min(limit - active.squad_size, (active.wage_cap - active.wage_bill) // wage)
    # Its known player holds exactly his share: each regen comes with the share of the unseen player he replaces.
    club.wage_cap = 2 * wage * nominal_size(config)
    world.players[club.player_ids[0]].contract = Contract(2 * wage, world.date.add_days(400), world.date)
    club.wage_bill = 2 * wage
    assert intake_room(club, world.config) == limit - 1
    # Its known player holds the wages of the whole squad: nothing is left for a regen.
    club.wage_bill = club.wage_cap
    assert intake_room(club, world.config) == 0
