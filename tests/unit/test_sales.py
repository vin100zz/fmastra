"""The human club's sales: its transfer list, and its players offered to every club at once."""
from dataclasses import replace
from random import Random

import pytest

from core.ai.market import asking_price, can_sell, contract_for, needs_for, offered_player_bids, opening_share, propose_transfers, raises_allowed
from core.domain.date import Date
from core.domain.offers import TransferOffer
from core.world.application import apply
from core.world.events import PlayerReleased, PlayerSigned
from core.world.sales import SaleRefused, answer, awaiting_offers, counter, offer_obstacle, offer_to_clubs, set_listing, set_untouchable
from test_market import add_star, close_auction, extra_buyer, mini_world, recruitment_world, renewal_setup


def selling_world(config, level=75):
    """The human club 2 sells a player at the position club 1 needs most, where a free agent rated 80 is also available."""
    world = recruitment_world(config)
    world.controlled_club_id = 2
    buyer = world.clubs[1]
    position = needs_for(buyer, [world.players[pid] for pid in buyer.player_ids], world.config)[0].position
    return world, add_star(world, world.clubs[2], level=level, position=position), buyer


def wanted_world(config):
    """As `selling_world`, without the free agents at his position: club 1 wants the human club's player, unasked."""
    world, player, buyer = selling_world(config)
    for pid in [p.id for p in world.players.values() if p.club_id is None and p.position == player.position]: del world.players[pid]
    return world, player, buyer


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


def test_a_buyer_pays_no_more_than_its_own_price_limit_for_a_listed_player(config):
    world, player, buyer = wanted_world(config)
    limit = next(bid.limit for bid in propose_transfers(world, Random(1)) if bid.target_id == buyer.id and bid.player_id == player.id)
    set_listing(world, player, limit + 1)
    assert not bids_for(world, buyer, {player.id})
    set_listing(world, player, limit)
    assert bids_for(world, buyer, {player.id}) == [(player.id, limit)]
    # Listed, he is offered at the fee asked and no more: the buyer does not raise above it.
    from core.world.market import open_offers, reach
    set_listing(world, player, limit - 1000)
    open_offers(world, True)
    offer = next(offer for offer in world.offers.values() if offer.player_id == player.id)
    assert offer.fee == offer.limit == reach(world, offer) == limit - 1000


def received(world, player):
    """The offer club 1 makes unasked for the player of the human club, once it has reached it."""
    from core.world.market import open_offers, settle_offers
    open_offers(world, True)
    close_auction(world)
    settle_offers(world, True)
    return next(offer for offer in world.offers.values() if offer.player_id == player.id)


def lines_of(world, key):
    return [(line.amount, line.state, line.text) for item in world.news for line in item.lines if line.key == key]


def test_an_unasked_offer_opens_under_the_buyers_limit_the_lower_the_more_patient(config):
    from core.world.market import open_offers, quoted_offer
    fees = {}
    for patience in (0.1, 0.9):
        world, player, buyer = wanted_world(config)
        buyer.personality = replace(buyer.personality, negotiation_patience=patience)
        open_offers(world, True)
        offer = next(offer for offer in world.offers.values() if offer.player_id == player.id)
        usual = asking_price(player, world.clubs[2], world)
        # The club comes only for a player it can pay the usual price of, and reserves at least that.
        assert offer.limit >= usual and offer.ceiling == max(offer.fee, usual)
        assert offer.fee == quoted_offer(round(offer.limit * opening_share(buyer, config))) < offer.limit
        fees[patience] = offer.fee
    assert fees[0.9] < fees[0.1]


def test_a_buyer_turned_down_comes_back_higher_until_its_limit_then_gives_up(config):
    from core.world.market import settle_offers
    world, player, buyer = wanted_world(config)
    offer = received(world, player)
    raises = raises_allowed(buyer, config)
    assert offer.awaiting_review and raises == 2 and lines_of(world, offer.key) == [(offer.fee, "pending", "")]
    fees = [offer.fee]
    for turn in range(raises):
        answer(world, offer, False)
        waiting = world.offers[offer.key]
        assert not waiting.awaiting_review and waiting.rounds == turn + 1 and waiting.due > world.date
        assert not awaiting_offers(world, player.id) and player.id not in world.turned_away
        # The higher offer is not known before the day the buyer comes back.
        settle_offers(world, True)
        assert not world.offers[offer.key].awaiting_review
        world.date = waiting.due
        settle_offers(world, True)
        offer = world.offers[offer.key]
        assert offer.awaiting_review and offer.countered and offer.ceiling >= offer.fee
        fees.append(offer.fee)
    # Its raises split what separated it from its limit: the last one is the most it pays.
    assert fees[0] < fees[1] < fees[2] == offer.limit
    assert lines_of(world, offer.key) == [(fees[0], "refused", ""), (fees[1], "refused", "raised"), (fees[2], "pending", "raised")]
    answer(world, offer, False)
    assert offer.key not in world.offers and world.turned_away == {player.id: [buyer.id]}
    assert lines_of(world, offer.key)[-1] == (fees[2], "refused", "raised")
    # Turned away, the club does not come back for him in this window, unless he is put on the list.
    assert not bids_for(world, buyer, {player.id})
    set_listing(world, player, fees[0])
    assert bids_for(world, buyer, {player.id}) == [(player.id, fees[0])]
    set_listing(world, player, None)
    # The window closing wipes the slate: at the next one it may want him again.
    world.date = Date(world.date.year, 10, 1)
    settle_offers(world, False)
    assert not world.turned_away
    world.date = Date(world.date.year + 1, 1, 2)
    assert bids_for(world, buyer, {player.id})


def test_an_impatient_buyer_raises_once_straight_to_its_limit(config):
    from core.world.market import settle_offers
    world, player, buyer = wanted_world(config)
    buyer.personality = replace(buyer.personality, negotiation_patience=0.1)
    offer = received(world, player)
    assert raises_allowed(buyer, config) == config.management.market.offers.min_raises == 1
    answer(world, offer, False)
    world.date = world.offers[offer.key].due
    settle_offers(world, True)
    offer = world.offers[offer.key]
    assert offer.fee == offer.limit
    answer(world, offer, False)
    assert not world.offers and world.turned_away == {player.id: [buyer.id]}


def test_the_club_names_its_price_and_sells_within_what_the_buyer_can_pay(config):
    from core.world.market import settle_offers
    world, player, buyer = wanted_world(config)
    offer = received(world, player)
    with pytest.raises(SaleRefused, match="acceptez-la"): counter(world, offer, offer.fee)
    # Beyond the buyer's limit it is a refusal like any other: the buyer comes back with a higher offer.
    assert not counter(world, offer, offer.limit + 1)
    assert player.club_id == 2 and world.offers[offer.key].rounds == 1
    world.date = world.offers[offer.key].due
    settle_offers(world, True)
    offer = world.offers[offer.key]
    assert offer.fee < offer.limit
    # Within it, the sale is made at the price named.
    before = world.clubs[2].balance
    assert counter(world, offer, offer.limit)
    assert player.club_id == buyer.id and world.transfers[-1].fee == offer.limit
    assert world.clubs[2].balance == before + offer.limit and not world.offers
    assert lines_of(world, offer.key)[-1] == (offer.limit, "accepted", "raised")


def test_rival_offers_for_a_player_of_the_club_raise_each_other(config):
    from math import ceil
    from core.world.market import settle_offers
    world, player, buyer = wanted_world(config)
    step = config.management.market.offers.outbid_step
    million = 1_000_000

    def bid(club_id, fee, limit):
        if club_id not in world.clubs: extra_buyer(world, club_id)
        world.offers[str(club_id)] = TransferOffer(str(club_id), world.date, player.id, 2, club_id, player.contract,
                                                   fee * million, fee * million, 1.0, limit=limit * million)
    bid(1, 100, 200)
    bid(3, 90, 150)
    close_auction(world)
    settle_offers(world, True)
    # They reach the club together, already raised: the keenest one step above the reach of the other, at its own.
    first = ceil(150 * million * (1 + step))
    assert [(offer.key, offer.fee, offer.awaiting_review) for offer in awaiting_offers(world, player.id)] == [("1", first, True), ("3", 150 * million, True)]
    assert len(world.news) == 1 and [(line.key, line.amount, line.text) for line in world.news[0].lines] == [("1", first, ""), ("3", 150 * million, "")]
    assert world.offers["1"].ceiling == first
    # A third club joins: the highest offer rises again and is told anew, the one that cannot follow stays as it is.
    bid(4, 120, 180)
    world.date = world.date.add_days(1)
    settle_offers(world, True)
    second = ceil(180 * million * (1 + step))
    assert {key: world.offers[key].fee for key in "134"} == {"1": second, "3": 150 * million, "4": 180 * million}
    assert lines_of(world, "1") == [(first, "raised", ""), (second, "pending", "raised")]
    assert lines_of(world, "3") == [(150 * million, "pending", "")] and lines_of(world, "4") == [(180 * million, "pending", "")]
    # Nothing new the day after: nothing is told again.
    news = sum(len(item.lines) for item in world.news)
    world.date = world.date.add_days(1)
    settle_offers(world, True)
    assert sum(len(item.lines) for item in world.news) == news
    # At its limit, a buyer turned down gives up at once; the keenest still has room to raise.
    answer(world, world.offers["3"], False)
    assert "3" not in world.offers and world.turned_away == {player.id: [3]}
    answer(world, world.offers["1"], False)
    assert second < world.offers["1"].fee <= 200 * million


def test_a_player_declared_not_for_sale_receives_no_offer_and_his_offers_fall(config):
    world, player, buyer = wanted_world(config)
    offer = received(world, player)
    set_listing(world, player, offer.limit)
    set_untouchable(world, player, True)
    assert not world.offers and not world.transfer_list and world.not_for_sale == {player.id: world.date}
    assert lines_of(world, offer.key) == [(offer.fee, "refused", "")] and not world.turned_away
    assert not can_sell(player, world.clubs[2], world) and not bids_for(world, buyer, {player.id})
    # Back on the market, he is a player like any other again.
    set_untouchable(world, player, False)
    assert not world.not_for_sale and bids_for(world, buyer, {player.id})
    # Listing him or offering him to the clubs puts him back on it as well.
    for sell in (lambda: set_listing(world, player, offer.limit), lambda: offer_to_clubs(world, player, offer.limit)):
        set_untouchable(world, player, True)
        assert offer_obstacle(world, player) is None
        sell()
        assert not world.not_for_sale
    # Only a player of the club, and one who is not away on loan; the word falls with his departure.
    with pytest.raises(SaleRefused): set_untouchable(world, world.players[buyer.player_ids[0]], True)
    world.offers.clear()
    set_untouchable(world, player, True)
    apply(world, PlayerReleased(player.id))
    assert not world.not_for_sale


def test_a_player_who_wants_to_leave_resents_being_kept_off_the_market(config):
    from core.world.contracts import contentment, morale_cause
    from core.world.transfer_rules import held_back, wants_to_leave
    world, player = renewal_setup(config, reputation=50)
    club = world.clubs[player.club_id]
    world.controlled_club_id = club.id
    mood = lambda: contentment(world, player, club, 0, 0, 0)
    free = mood()
    assert wants_to_leave(player, world) and not held_back(player, world) and free.held == 0 and morale_cause(world, free) == "ambition"
    set_untouchable(world, player, True)
    held = mood()
    loss = config.management.market.offers.untouchable_morale_loss
    assert held_back(player, world) and held.held == loss > 0
    assert held.morale_target == pytest.approx(free.morale_target - loss) and morale_cause(world, held) == "intransferable"
    # A player content where he is does not mind, nor one another club keeps.
    club.reputation = 100
    assert not wants_to_leave(player, world) and mood().held == 0
    club.reputation = 50
    world.controlled_club_id = None
    assert mood().held == 0


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
    world.not_for_sale[203] = world.date
    world.turned_away[204] = [1]
    offer = TransferOffer("raised", world.date, 204, 2, 1, world.players[204].contract, 5, 6, 1.0, countered=True, due=world.date.add_days(2), rounds=1, limit=9)
    world.offers[offer.key] = offer
    store = SaveStore(tmp_path)
    path = store.save(world, "sale")
    restored = store.load("sale")
    assert (restored.transfer_list, restored.offered_until) == ({201: 3_000_000}, {202: world.date.add_days(3)})
    assert (restored.not_for_sale, restored.turned_away, restored.offers) == ({203: world.date}, {204: [1]}, {offer.key: offer})
    # A save of the version before knew neither: nobody is kept off the market, and its offers stop at what they reserved.
    payload = json.loads(gzip.decompress(path.read_bytes()))
    payload["schema_version"] = 27
    for name in ("not_for_sale", "turned_away"): del payload["world"][name]
    del payload["world"]["offers"][offer.key]["limit"]
    for introduced, config_path, defaults in MIGRATION_DEFAULTS:
        if introduced > 27:
            for key in defaults: del payload["world"]["config"][config_path[0]][config_path[1]][key]
    payload["config_hash"] = hashlib.sha256(json.dumps(payload["world"]["config"], sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    (tmp_path / "before.json.gz").write_bytes(gzip.compress(json.dumps(payload).encode()))
    before = store.load("before")
    assert (before.not_for_sale, before.turned_away, before.offers) == ({}, {}, {offer.key: replace(offer, limit=None)})
    assert before.config.management.market == config.management.market
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
