"""The human club's sales: its transfer list, and its players offered to every club at once."""
from dataclasses import replace
from random import Random

import pytest

from core.ai.market import asking_price, contract_for, market_value, needs_for, offered_player_bids, overpriced, propose_transfers
from core.domain.date import Date
from core.world.application import apply
from core.world.events import PlayerReleased, PlayerSigned
from core.world.sales import SaleRefused, offer_obstacle, offer_to_clubs, set_listing
from test_market import add_star, close_auction, extra_buyer, mini_world, recruitment_world, renewal_setup


def selling_world(config, level=75):
    """The human club 2 sells a player at the position club 1 needs most, where a free agent rated 80 is also available."""
    world = recruitment_world(config)
    world.controlled_club_id = 2
    buyer = world.clubs[1]
    position = needs_for(buyer, [world.players[pid] for pid in buyer.player_ids], world.config)[0].position
    return world, add_star(world, world.clubs[2], level=level, position=position), buyer


def with_market(world, **changes):
    rules = replace(world.config.management.market, **changes)
    world.config = replace(world.config, management=replace(world.config.management, market=rules))


def bids_for(world, club, player_ids):
    return [(bid.player_id, bid.fee) for bid in propose_transfers(world, Random(1)) if bid.target_id == club.id and bid.player_id in player_ids]


def test_a_listed_player_reaches_the_buyers_first_at_the_fee_asked(config):
    world, player, buyer = selling_world(config)
    with_market(world, max_candidates_scanned=2)
    rival = next(p for p in world.players.values() if p.club_id is None and p.position == player.position)
    assert rival.rating > player.rating
    # Unlisted, the better free agent takes the place.
    assert bids_for(world, buyer, {player.id, rival.id}) == [(rival.id, 0)]
    set_listing(world, player, 4_000_000)
    assert bids_for(world, buyer, {player.id, rival.id}) == [(player.id, 4_000_000)]
    # Taken off the list, he is a player like any other.
    set_listing(world, player, None)
    assert bids_for(world, buyer, {player.id, rival.id}) == [(rival.id, 0)]


def test_offers_for_a_listed_player_come_at_his_price_and_await_the_answer(config):
    from core.world.market import open_offers, settle_offers
    world, player, buyer = selling_world(config)
    set_listing(world, player, 4_000_000)
    open_offers(world, True)
    offer = next(offer for offer in world.offers.values() if offer.player_id == player.id)
    assert (offer.target_id, offer.fee, offer.ceiling) == (buyer.id, 4_000_000, 4_000_000)
    close_auction(world)
    settle_offers(world, True)
    assert world.offers[offer.key].awaiting_review and player.club_id == 2
    assert any(entry.kind == "offer_received" and entry.player_id == player.id for entry in world.news)


def test_buyers_pay_no_more_than_the_usual_price_or_their_own_valuation(config):
    world, player, buyer = selling_world(config)
    limit = max(asking_price(player, world.clubs[2], world),
                round(market_value(player, world, buyer) * config.management.market.buyer_price_multiplier))
    assert not overpriced(player, buyer, limit, world) and overpriced(player, buyer, limit + 1, world)
    set_listing(world, player, limit + 1)
    assert not bids_for(world, buyer, {player.id})
    set_listing(world, player, limit)
    assert bids_for(world, buyer, {player.id}) == [(player.id, limit)]


@pytest.mark.parametrize("drop,listed,offered_days,allowed", [
    (10, False, None, False),  # a smaller club is beneath him
    (10, True, None, True),  # listed, he knows he may go down a little
    (10, False, 1, True),  # offered to the clubs lately
    (10, False, 0, False),  # offered long enough ago to be settled again
    (20, True, None, False),  # beyond the tolerance of a player for sale
])
def test_a_player_up_for_sale_accepts_a_smaller_club_within_a_wider_tolerance(config, drop, listed, offered_days, allowed):
    from core.world.transfer_rules import accepts_move, target_level
    world = mini_world(config)
    world.controlled_club_id = 2
    player, source, target = world.players[201], world.clubs[2], world.clubs[1]
    source.reputation, target.reputation = 90, 90 - drop
    player.rating, player.morale = target_level(target, config) + config.management.market.player_level_margin + 5, 0.9
    if listed: world.transfer_list[player.id] = 1
    if offered_days is not None: world.offered_until[player.id] = world.date.add_days(offered_days)
    assert accepts_move(player, target, world) is allowed


def test_offering_a_player_asks_every_club_at_once_and_keeps_the_offers_he_prefers(config):
    from core.world.market import resolve_accepted_offer
    world, player, buyer = selling_world(config)
    for club_id in range(3, 9): extra_buyer(world, club_id)
    rules = config.management.market
    offers = offer_to_clubs(world, player, 4_000_000)
    assert len(offers) == rules.max_offers_per_proposal
    assert all(offer.awaiting_review and offer.fee == offer.ceiling == 4_000_000 and offer.source_id == 2 for offer in offers)
    assert [offer.score for offer in offers] == sorted((offer.score for offer in offers), reverse=True)
    assert all(world.offers[offer.key] == offer for offer in offers)
    assert [(entry.kind, entry.player_id) for entry in world.news] == [("offer_received", player.id)]  # one message for them all
    assert [line.key for line in world.news[0].lines] == [offer.key for offer in offers]
    # Offered once, he can be offered again only after the cooldown.
    with pytest.raises(SaleRefused, match="Déjà proposé"): offer_to_clubs(world, player, 4_000_000)
    world.date = world.date.add_days(rules.offer_cooldown_days)
    assert offer_obstacle(world, player) is None
    # Sold, he leaves the human club's list.
    set_listing(world, player, 4_000_000)
    assert resolve_accepted_offer(world, offers[0])
    assert player.club_id == offers[0].target_id
    assert player.id not in world.transfer_list and player.id not in world.offered_until


def test_offering_a_player_nobody_needs_at_that_price_makes_no_offer(config):
    world, player, buyer = selling_world(config)
    assert offer_to_clubs(world, player, 10 ** 12) == []
    assert not world.offers and not world.news
    assert offer_obstacle(world, player).startswith("Déjà proposé")


def test_a_dormant_club_with_the_means_takes_its_chance_with_its_approach_probability(config):
    world, player, buyer = selling_world(config)
    extra_buyer(world, 3).competition_id = None
    for probability, bidders in ((1.0, {1, 3}), (0.0, {1})):
        with_market(world, dormant_clubs=replace(config.management.market.dormant_clubs, approach_probability=probability))
        assert {bid.target_id for bid in offered_player_bids(world, player, 4_000_000, Random(1))} == bidders


def test_a_player_cannot_be_offered_while_the_market_is_closed_or_just_after_arriving(config):
    world, player, buyer = selling_world(config)
    other = world.players[buyer.player_ids[0]]
    assert offer_obstacle(world, other) == "Ce joueur n'est pas dans votre effectif."
    with pytest.raises(SaleRefused): set_listing(world, other, 1)
    newcomer = next(p for p in world.players.values() if p.club_id is None)
    assert apply(world, PlayerSigned(newcomer.id, None, 2, contract_for(newcomer, world, 1000), 0))
    assert offer_obstacle(world, newcomer).startswith("Intransférable jusqu'au")
    world.date = Date(world.date.year, 10, 1)
    assert offer_obstacle(world, player) == "Le mercato est fermé."
    # The list itself stays open all year: buyers come when the window opens.
    set_listing(world, player, 4_000_000)
    assert world.transfer_list == {player.id: 4_000_000}


def test_a_listed_player_asks_for_no_extension_and_leaves_the_list_with_his_contract(config):
    from core.world.contracts import renewal_events
    from core.world.events import RenewalProposed
    world, player = renewal_setup(config, reputation=100)
    world.controlled_club_id = player.club_id
    proposed = lambda: any(isinstance(event, RenewalProposed) and event.proposal.player_id == player.id for event in renewal_events(world))
    assert proposed()
    set_listing(world, player, 1_000_000)
    assert not proposed()
    apply(world, PlayerReleased(player.id))
    assert not world.transfer_list


def test_the_transfer_list_survives_a_save_and_an_older_save_has_none(config, tmp_path):
    import gzip
    import hashlib
    import json
    from core.domain.clubs import Competition
    from infrastructure.persistence.store import MIGRATION_DEFAULTS, SaveStore
    world = mini_world(config)
    world.competitions[-16] = Competition(-16, "Test", "FRA", 1, [1, 2])
    for club in world.clubs.values(): club.competition_id = -16
    world.rngs = {key: Random(1) for key in ("market", "matches", "states", "progression", "demography")}
    world.controlled_club_id = 2
    world.transfer_list[201] = 3_000_000
    world.offered_until[202] = world.date.add_days(3)
    store = SaveStore(tmp_path)
    path = store.save(world, "sale")
    restored = store.load("sale")
    assert (restored.transfer_list, restored.offered_until) == ({201: 3_000_000}, {202: world.date.add_days(3)})
    payload = json.loads(gzip.decompress(path.read_bytes()))
    payload["schema_version"] = 19
    for name in ("transfer_list", "offered_until"): del payload["world"][name]
    rules = payload["world"]["config"]
    for introduced, config_path, defaults in MIGRATION_DEFAULTS:
        if introduced > 19:
            for key in defaults: del rules[config_path[0]][config_path[1]][key]
    payload["config_hash"] = hashlib.sha256(json.dumps(rules, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    path.write_bytes(gzip.compress(json.dumps(payload).encode()))
    older = store.load("sale")
    assert (older.transfer_list, older.offered_until) == ({}, {})
    assert older.config.management.market == config.management.market
