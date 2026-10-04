from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from core.ai.selection import LineupContext, select_lineup, to_lineup, validate_lineup
from core.domain.matches import SubmittedLineup
from core.domain.offers import TransferOffer
from core.world.simulation import advance_day, market_window
from core.world.talks import opening_obstacle
from infrastructure.importation.loader import import_world

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def client(config, tmp_path_factory):
    app = create_app(ROOT, tmp_path_factory.mktemp("human-club-saves"))
    app.state.game.world = import_world(ROOT / "data", config, 777)
    with TestClient(app) as client:
        yield client


def test_choose_club_sets_controlled_club_id_once(client):
    world = client.app.state.game.world
    club_id = next(iter(world.active_clubs())).id
    dormant_id = next(club.id for club in world.clubs.values() if club.competition_id is None)

    assert client.get("/api/monde/etat").json()["controlled_club_id"] is None
    assert client.post("/api/partie/choisir-club", json={"club_id": dormant_id}).status_code == 400

    response = client.post("/api/partie/choisir-club", json={"club_id": club_id})
    assert response.status_code == 200 and response.json()["club_id"] == club_id
    assert world.controlled_club_id == club_id
    assert client.get("/api/monde/etat").json()["controlled_club_id"] == club_id

    again = client.post("/api/partie/choisir-club", json={"club_id": club_id})
    assert again.status_code == 400


def test_advance_day_pauses_for_the_human_clubs_match_and_resumes_after_a_lineup(config):
    world = import_world(ROOT / "data", config, 777)
    club_id = next(iter(world.active_clubs())).id
    world.controlled_club_id = club_id

    for _ in range(400):
        if not advance_day(world):
            break
    else:
        pytest.fail("Le club de l'utilisateur n'a joué aucun match en 400 jours simulés.")

    assert world.pending_match_day == world.date
    match_id = next(match.id for match in world.matches.values()
                    if match.date == world.date and match.result is None and club_id in (match.home_id, match.away_id))
    # Resuming without a submitted lineup keeps waiting instead of silently picking one.
    assert advance_day(world) is False
    assert world.matches[match_id].result is None

    match = world.matches[match_id]
    context = LineupContext.from_world(world, club_id, match.competition_id, world.date)
    suggestion = select_lineup(context, world.config)
    submitted = SubmittedLineup(club_id, suggestion.formation,
                                [(slot.player.id, slot.position) for slot in suggestion.slots],
                                [player.id for player in suggestion.bench])
    validate_lineup(context, submitted, world.config)  # a legal, AI-suggested lineup must pass validation
    with pytest.raises(ValueError):
        validate_lineup(context, SubmittedLineup(club_id, submitted.formation,
                        [*submitted.slots[:-1], submitted.slots[0]], submitted.bench), world.config)  # duplicate player

    world.submitted_lineups[match_id] = submitted
    assert advance_day(world) is True
    assert world.pending_match_day is None and world.submitted_lineups == {}
    result = world.matches[match_id].result
    assert result is not None
    played_ids = {pid for pid, _ in (result.home_lineup if match.home_id == club_id else result.away_lineup)}
    assert played_ids == {pid for pid, _ in submitted.slots}


def test_the_players_list_tells_the_human_club_who_would_join_it_and_at_what_wage(client):
    from core.world.talks import asked_wage
    from core.world.transfer_rules import accepts_move
    world = client.app.state.game.world
    # Without a club nobody is a recruit: no figure, and the two filters are left aside.
    assert all(row["interested"] is None and row["wage_demand"] is None for row in client.get("/api/joueurs").json()["items"])
    assert client.get("/api/joueurs?interesse=oui&pretentions_max=0").json()["total"] == len(world.players)

    max_squad = world.config.management.guardrails.max_squad
    clubs = sorted((club for club in world.active_clubs() if len(club.player_ids) < max_squad), key=lambda club: club.reputation)
    club = clubs[len(clubs) // 2]  # a middling club with room in its squad: the best players refuse it
    client.post("/api/partie/choisir-club", json={"club_id": club.id})
    rows = client.get("/api/joueurs").json()["items"]
    for row in rows:
        player = world.players[row["id"]]
        assert row["interested"] is accepts_move(player, club, world) and row["wage_demand"] == asked_wage(world, player) > 0
    assert not all(row["interested"] for row in rows)

    keen, reluctant = (client.get(f"/api/joueurs?interesse={choice}").json() for choice in ("oui", "non"))
    assert keen["items"] and all(row["interested"] is True for row in keen["items"])
    assert reluctant["items"] and all(row["interested"] is False for row in reluctant["items"])
    assert keen["total"] + reluctant["total"] == len(world.players) - len(club.player_ids)

    cap = sorted(row["wage_demand"] for row in rows)[len(rows) // 2]
    modest = client.get(f"/api/joueurs?pretentions_max={cap}&tri=wage_demand").json()
    demands = [row["wage_demand"] for row in modest["items"]]
    assert demands == sorted(demands, reverse=True) and demands[0] == cap and modest["total"] < len(world.players) - len(club.player_ids)

    # Its own players have nothing to ask or to accept, and come last in either sort.
    own = client.get("/api/joueurs", params={"club": club.id}).json()["items"]
    assert own and all(row["interested"] is None and row["wage_demand"] is None for row in own)
    for sort in ("wage_demand", "interested"):
        for order in ("asc", "desc"):
            last = client.get(f"/api/joueurs?tri={sort}&ordre={order}&page={(len(world.players) + 29) // 30}").json()["items"]
            assert last[-1]["club"]["id"] == club.id, (sort, order)
    first = client.get("/api/joueurs?tri=interested").json()["items"]
    assert all(row["interested"] is True for row in first)

    # A bid stops on the wage he would ask when it does not fit under the cap, and says both figures.
    target = next(world.players[row["id"]] for row in keen["items"] if row["club"] and opening_obstacle(world, world.players[row["id"]]) is None)
    club.wage_cap = club.wage_bill
    refused = client.post("/api/partie/negociation/indemnite", json={"joueur_id": target.id, "indemnite": 1})
    assert refused.status_code == 400
    assert refused.json()["detail"].startswith(f"{target.name} demanderait ") and "il vous reste 0 € / mois sous le plafond salarial" in refused.json()["detail"]


def test_outgoing_offer_and_incoming_offer_response(client):
    world = client.app.state.game.world
    assert market_window(world) is not None  # a fresh game starts inside the summer window
    max_squad = world.config.management.guardrails.max_squad
    roomy = [club for club in world.active_clubs() if len(club.player_ids) < max_squad]
    club_id, other_club = roomy[0].id, roomy[1]
    client.post("/api/partie/choisir-club", json={"club_id": club_id})
    target_player = next(pid for pid in other_club.player_ids if opening_obstacle(world, world.players[pid]) is None)

    # The club answers at once: a counter-offer at its asking price, which is then accepted.
    lowball = client.post("/api/partie/negociation/indemnite", json={"joueur_id": target_player, "indemnite": 1})
    assert lowball.status_code == 200
    reply = lowball.json()
    assert reply["resultat"] == "contre_offre" and reply["etape"] == "indemnite" and reply["contre_offre"] > 1
    listed = client.get("/api/joueurs", params={"club": other_club.id}).json()["items"]
    assert next(row for row in listed if row["id"] == target_player)["asking_price"] == reply["contre_offre"]
    assert client.get(f"/api/ma-partie/negociation/{target_player}").json()["tours_restants"] == reply["tours_restants"]
    agreed = client.post("/api/partie/negociation/indemnite", json={"joueur_id": target_player, "indemnite": reply["contre_offre"]}).json()
    assert agreed["resultat"] == "accepte" and agreed["etape"] == "accord_club" and agreed["date_prevue"]
    outgoing = client.get("/api/ma-partie/transferts").json()["sortantes"]
    assert [(row["joueur_id"], row["etape"]) for row in outgoing] == [(target_player, "accord_club")]
    # The player answers only days later.
    early = client.post("/api/partie/negociation/salaire", json={"joueur_id": target_player, "salaire_hebdo": 1000})
    assert early.status_code == 400

    own_player = min((pid for pid in world.clubs[club_id].player_ids if world.players[pid].position != "GB"),
                     key=lambda pid: world.players[pid].rating)  # the weakest backup: sellable without gutting the squad
    refused = client.post("/api/partie/negociation/indemnite", json={"joueur_id": own_player, "indemnite": 0})
    assert refused.status_code == 400  # cannot bid for your own player
    detail = client.get(f"/api/joueurs/{own_player}").json()
    assert 0 <= detail["greed"] <= 1 and detail["transferable"] and detail["asking_price"] > 0

    # Simulate an AI club's offer having cleared the auction window, awaiting the human seller's review.
    player = world.players[own_player]
    incoming = TransferOffer("incoming-test", world.date, own_player, club_id, other_club.id, player.contract, 5_000_000, 5_000_000, 1, awaiting_review=True)
    world.offers[incoming.key] = incoming

    listing = client.get("/api/ma-partie/transferts").json()
    assert listing["entrantes"] and listing["entrantes"][0]["joueur_id"] == own_player
    assert listing["entrantes"][0]["offres"][0]["offre_id"] == incoming.key

    missing = client.post("/api/partie/reponse-offre", json={"offre_id": "unknown", "decision": "accepter"})
    assert missing.status_code == 404

    accepted = client.post("/api/partie/reponse-offre", json={"offre_id": incoming.key, "decision": "accepter"})
    assert accepted.status_code == 200
    assert player.club_id == other_club.id
    assert incoming.key not in world.offers
    assert world.news[-1].kind == "transfer" and world.news[-1].club_id == club_id

    news = client.get("/api/ma-partie/actualites").json()
    assert news["items"][0]["kind"] == "transfer"  # most recent first
    assert news["items"][0]["title"] == f"{player.name} rejoint {other_club.name}"
    assert news["items"][0]["segments"] == [{"text": player.name, "ref": {"player": own_player}}, {"text": " rejoint "},
                                           {"text": other_club.name, "ref": {"club": other_club.id}}]


def test_own_player_on_the_transfer_list_and_offered_to_the_clubs(client):
    world = client.app.state.game.world
    club = world.active_clubs()[0]
    client.post("/api/partie/choisir-club", json={"club_id": club.id})
    own_player = min((pid for pid in club.player_ids if world.players[pid].position != "GB"), key=lambda pid: world.players[pid].rating)
    other_player = world.active_clubs()[1].player_ids[0]
    assert client.get(f"/api/ma-partie/vente/{own_player}").json() == {"prix_liste": None, "obstacle_proposition": None, "offres": []}

    listed = client.post("/api/partie/liste-transferts", json={"joueur_id": own_player, "indemnite": 2_000_000})
    assert listed.status_code == 200 and listed.json()["prix_liste"] == 2_000_000
    assert client.get("/api/ma-partie/transferts").json()["liste"] == [{"joueur_id": own_player, "joueur": world.players[own_player].name, "indemnite": 2_000_000}]
    refused = client.post("/api/partie/liste-transferts", json={"joueur_id": other_player, "indemnite": 1})
    assert refused.status_code == 400 and refused.json()["detail"] == "Ce joueur n'est pas dans votre effectif."

    offered = client.post("/api/partie/proposer-aux-clubs", json={"joueur_id": own_player, "indemnite": 2_000_000}).json()
    assert offered["proposees"] == len(offered["offres"]) <= world.config.management.market.max_offers_per_proposal
    assert offered["obstacle_proposition"].startswith("Déjà proposé")
    assert client.post("/api/partie/proposer-aux-clubs", json={"joueur_id": own_player, "indemnite": 2_000_000}).status_code == 400
    incoming = {row["joueur_id"]: row["offres"] for row in client.get("/api/ma-partie/transferts").json()["entrantes"]}
    assert incoming.get(own_player, []) == offered["offres"]

    removed = client.post("/api/partie/liste-transferts", json={"joueur_id": own_player, "indemnite": None}).json()
    assert removed["prix_liste"] is None and client.get("/api/ma-partie/transferts").json()["liste"] == []


def test_news_requires_a_selected_club(client):
    assert client.get("/api/ma-partie/actualites").status_code == 400


def test_news_stay_unread_until_opened(client):
    from core.world.human import record
    world = client.app.state.game.world
    club_id = next(iter(world.active_clubs())).id
    client.post("/api/partie/choisir-club", json={"club_id": club_id})
    for text in ("Première", "Deuxième", "Troisième"):
        record(world, "season", text, club_id)

    news = client.get("/api/ma-partie/actualites").json()
    assert news["unread"] == 3 and [row["read"] for row in news["items"]] == [False, False, False]
    newest = news["items"][0]
    assert newest["title"] == "Troisième" and newest["id"] == 2 and not newest["pending"]
    assert client.get("/api/monde/etat").json()["news"] == {"unread": 3, "next_unread": 2, "pending": []}

    opened = client.post("/api/partie/actualites-lues", json={"ids": [newest["id"]]}).json()
    assert opened["unread"] == 2 and opened["news"] == {"unread": 2, "next_unread": 1, "pending": []}
    assert world.news[2].read and not world.news[0].read
    assert client.post("/api/partie/actualites-lues", json={}).json()["unread"] == 0
    assert all(row["read"] for row in client.get("/api/ma-partie/actualites").json()["items"])

    # Entries saved by older versions read as headlines too: no final full stop, "match" agreed with its number.
    record(world, "suspension", "A est suspendu 1 match(s).", club_id)
    record(world, "suspension", "B est suspendu 3 match(s).", club_id)
    record(world, "injury", "C indisponible jusqu'au 2027-05-01.", club_id)
    assert [row["title"] for row in client.get("/api/ma-partie/actualites").json()["items"][:3]] == [
        "C indisponible jusqu'au 1er mai", "B est suspendu 3 matchs", "A est suspendu 1 match"]
    # A page of the feed can be asked for by the message it must show.
    assert client.get("/api/ma-partie/actualites?taille=2&message=0").json()["page"] == 3
    assert client.get("/api/ma-partie/actualites/99").status_code == 404


def test_messages_tell_their_kind_and_those_awaiting_an_answer_are_answered_from_them(client):
    from dataclasses import replace
    from core.domain.offers import RenewalProposal
    from core.domain.world import NewsLine
    from core.world import news as feed
    from core.world.application import apply
    from core.world.events import RenewalProposed
    from core.world.human import report
    world = client.app.state.game.world
    club, buyer = world.active_clubs()[:2]
    client.post("/api/partie/choisir-club", json={"club_id": club.id})
    sold, asking, hurt, other = sorted((pid for pid in club.player_ids if world.players[pid].position != "GB"), key=lambda pid: world.players[pid].rating)[:4]
    player = world.players[sold]

    # Two offers for a player the same day: one message, answered offer by offer or all at once.
    for key, fee in (("first", 4_000_000), ("second", 5_000_000)):
        offer = TransferOffer(key, world.date, sold, club.id, buyer.id, player.contract, fee, fee, 1, awaiting_review=True)
        world.offers[key] = offer
        feed.offer_received(world, offer)
    state = client.get("/api/monde/etat").json()
    assert state["controlled_club"]["name"] == club.name
    assert state["news"] == {"unread": 1, "next_unread": 0, "pending": [0]}
    message = client.get("/api/ma-partie/actualites/0").json()
    assert message["title"] == f"2 offres pour {player.name}" and message["pending"]
    assert message["segments"][1] == {"text": player.name, "ref": {"player": sold}}
    assert [(offer["key"], offer["fee"], offer["state"]) for offer in message["offers"]["offers"]] == [("second", 5_000_000, "pending"), ("first", 4_000_000, "pending")]
    assert message["offers"]["value"] > 0 and message["offers"]["offers"][0]["club"]["id"] == buyer.id
    refused = client.post("/api/partie/reponse-offres", json={"joueur_id": sold, "decision": "refuser"})
    assert refused.status_code == 200 and refused.json()["club"] is None and not world.offers
    message = client.get("/api/ma-partie/actualites/0").json()
    assert [offer["state"] for offer in message["offers"]["offers"]] == ["refused", "refused"] and not message["pending"]
    assert client.post("/api/partie/reponse-offres", json={"joueur_id": sold, "decision": "accepter"}).status_code == 400
    assert client.get("/api/monde/etat").json()["news"]["pending"] == []

    # A contract a player asks for, accepted from its message.
    asker = world.players[asking]
    asked = replace(asker.contract, weekly_wage=asker.contract.weekly_wage + 100, end=asker.contract.end.add_years(1))
    apply(world, RenewalProposed(RenewalProposal(asking, club.id, asked, world.date)))
    message = client.get("/api/ma-partie/actualites/1").json()
    assert message["title"] == f"{asker.name} veut un nouveau contrat" and message["pending"]
    assert message["renewal"]["asked"] == {"wage": asked.weekly_wage, "end": asked.end.iso()} and message["renewal"]["state"] == "pending"
    terms = client.get(f"/api/ma-partie/contrat/{asking}").json()
    assert terms["demande"] and terms["obstacle"] is None and terms["salaire_propose"] == asked.weekly_wage
    assert client.post("/api/partie/renouvellement", json={"joueur_id": asking, "decision": "accepter"}).status_code == 200
    assert asker.contract == asked and client.get("/api/ma-partie/actualites/1").json()["renewal"]["state"] == "accepted"
    assert client.post("/api/partie/renouvellement", json={"joueur_id": asking, "decision": "accepter"}).status_code == 404

    # Several players in one message, one in its title.
    back = world.date.add_days(21)
    report(world, "injury", NewsLine(player_id=hurt, until=back), club.id)
    assert client.get("/api/ma-partie/actualites/2").json()["title"] == f"{world.players[hurt].name} blessé 3 semaines"
    report(world, "injury", NewsLine(player_id=other, until=world.date.add_days(3)), club.id)
    message = client.get("/api/ma-partie/actualites/2").json()
    assert message["title"] == "2 joueurs blessés" and [row["days"] for row in message["players"]] == [21, 3]
    assert message["players"][0]["player"] == {"id": hurt, "name": world.players[hurt].name, "gone": False}

    # Contracts running out: the club asks each player for his terms and signs them.
    late = world.players[other]
    late.contract = replace(late.contract, end=world.date.add_days(150))
    report(world, "contract_expiry", NewsLine(player_id=other, amount=late.contract.weekly_wage, until=late.contract.end), club.id, text="6")
    message = client.get("/api/ma-partie/actualites/3").json()
    assert message["title"] == f"Le contrat de {late.name} expire dans 6 mois" and message["expiry"]["months"] == 6
    row = message["expiry"]["players"][0]
    if row["obstacle"] is None:
        signed = client.post("/api/partie/prolongation", json={"joueur_id": other})
        assert signed.status_code == 200 and late.contract.end.iso() == row["terms"]["end"] == signed.json()["fin_contrat"]
        assert client.get("/api/ma-partie/actualites/3").json()["expiry"]["players"][0].get("settled")
    assert client.post("/api/partie/prolongation", json={"joueur_id": buyer.player_ids[0]}).status_code == 400

    # The review of the season.
    feed.season_review(world, club)
    review = client.get(f"/api/ma-partie/actualites/{len(world.news) - 1}").json()
    assert review["kind"] == "season_review" and review["title"] == f"Bilan de la saison {world.date.year - 1} / {world.date.year}"
    league = review["review"]["competitions"][0]
    assert league["competition"]["id"] == club.competition_id and league["rank"] >= 1 and league["winner"]["id"] in world.competitions[club.competition_id].club_ids


def test_talks_are_given_up_from_their_message(client):
    from core.domain.offers import WAGE_TALKS
    from core.world.talks import open_wage_talks
    world = client.app.state.game.world
    club, seller = world.active_clubs()[:2]
    client.post("/api/partie/choisir-club", json={"club_id": club.id})
    target = world.players[seller.player_ids[0]]
    key = f"talks:{club.id}:{target.id}"
    world.offers[key] = open_wage_talks(world, TransferOffer(key, world.date, target.id, seller.id, club.id, target.contract, 1_000_000, 1_000_000, 0.0), target)
    assert world.offers[key].stage == WAGE_TALKS
    message = client.get("/api/ma-partie/actualites/0").json()
    assert message["pending"] and message["talks"]["state"] == "pending" and message["talks"]["fee"] == 1_000_000
    assert message["talks"]["club"]["id"] == seller.id and message["talks"]["profile"]["name"] == target.name
    assert client.get("/api/monde/etat").json()["news"]["pending"] == [0]
    given_up = client.post("/api/partie/negociation/abandon", json={"joueur_id": target.id})
    assert given_up.status_code == 200 and given_up.json()["etape"] is None and key not in world.offers
    message = client.get("/api/ma-partie/actualites/0").json()
    assert not message["pending"] and message["talks"]["state"] == "closed"
    assert client.post("/api/partie/negociation/abandon", json={"joueur_id": target.id}).status_code == 400


def _play_until_pending(world):
    for _ in range(400):
        if not advance_day(world):
            return next(match for match in world.matches.values() if match.date == world.date and match.result is None
                        and world.controlled_club_id in (match.home_id, match.away_id))
    pytest.fail("Le club de l'utilisateur n'a joué aucun match en 400 jours simulés.")


def test_lineup_form_offers_every_tactic_and_starts_from_the_previous_eleven(client):
    world = client.app.state.game.world
    world.controlled_club_id = club_id = next(iter(world.active_clubs())).id
    match = _play_until_pending(world)

    data = client.get(f"/api/ma-partie/composition?match_id={match.id}").json()
    assert data["formations"] == {name: list(roles) for name, roles in world.config.formations.formations.items()}
    assert set(data["suggestions"]) == set(data["formations"])
    for name, suggestion in data["suggestions"].items():
        assert [position for _, position in suggestion["titulaires"]] == data["formations"][name][:len(suggestion["titulaires"])]
    assert {player["id"] for player in data["players"]} <= set(world.clubs[club_id].player_ids)
    assert all(player["unavailable"] in (None, "injured", "suspended") for player in data["players"])

    chosen = data["suggestions"]["4-4-2 plat"]
    assert client.post("/api/partie/composition", json={"match_id": match.id, "formation": "inconnue",
                                                        "titulaires": chosen["titulaires"], "banc": chosen["banc"]}).status_code == 400
    assert client.post("/api/partie/composition", json={"match_id": match.id, "formation": "4-4-2 plat",
                                                        "titulaires": chosen["titulaires"], "banc": chosen["banc"]}).status_code == 200
    advance_day(world)
    following = _play_until_pending(world)

    default = client.get(f"/api/ma-partie/composition?match_id={following.id}").json()["default"]
    assert default["formation"] == "4-4-2 plat"
    squad = set(world.clubs[club_id].player_ids)
    assert [pid for pid, _ in default["titulaires"]] == [pid if pid in squad else None for pid, _ in chosen["titulaires"]]


def test_lineup_form_is_open_any_day_for_the_next_match_or_the_league(client):
    world = client.app.state.game.world
    world.controlled_club_id = club_id = next(iter(world.active_clubs())).id
    club = world.clubs[club_id]
    upcoming = sorted((match for match in world.matches.values() if match.result is None and club_id in (match.home_id, match.away_id)),
                      key=lambda match: (match.date, match.id))
    assert upcoming[0].date > world.date  # a fresh game starts before the season's first round

    data = client.get("/api/ma-partie/composition").json()
    assert data["match_id"] == upcoming[0].id and {player["id"] for player in data["players"]} == set(club.player_ids)
    assert data["default"]["titulaires"] and set(data["suggestions"]) == set(data["formations"])
    # Only a lineup for today's match can be submitted.
    chosen = data["suggestions"]["4-4-2 plat"]
    assert client.post("/api/partie/composition", json={"match_id": upcoming[0].id, "formation": "4-4-2 plat",
                                                        "titulaires": chosen["titulaires"], "banc": chosen["banc"]}).status_code == 400

    # Between seasons, with no fixture left, the lineup is tried out for the club's league.
    for match in upcoming: del world.matches[match.id]
    empty = client.get("/api/ma-partie/composition").json()
    assert empty["match_id"] is None and empty["opponent"] is None and len(empty["players"]) == len(club.player_ids)


def test_the_club_plays_a_tactic_of_its_own_and_starts_from_it_next_time(client):
    world = client.app.state.game.world
    world.controlled_club_id = next(iter(world.active_clubs())).id
    match = _play_until_pending(world)
    assert client.get(f"/api/ma-partie/composition?match_id={match.id}").json()["custom"] is None

    # A 4-3-3 whose striker drops behind the wingers, as the Composition pitch places it.
    places = [["GB", "gk", 2], ["DG", "def", 0], ["DC", "def", 1], ["DC", "def", 3], ["DD", "def", 4], ["MDC", "dm", 2],
              ["MC", "cm", 1], ["MC", "cm", 3], ["MOC", "am", 2], ["AILG", "att", 0], ["AILD", "att", 4]]
    positions = [position for position, _, _ in places]
    best = client.get(f"/api/ma-partie/composition/suggestion?match_id={match.id}&postes={','.join(positions)}").json()
    assert [position for _, position in best["titulaires"]] == positions[:len(best["titulaires"])]
    assert client.get("/api/ma-partie/composition/suggestion?postes=GB,BU").status_code == 400

    lineup = {"match_id": match.id, "formation": "Perso", "titulaires": best["titulaires"], "banc": best["banc"]}
    # Nothing is played under that name before the club has a tactic of its own, nor with a second keeper,
    # nor on positions the tactic does not hold.
    assert client.post("/api/partie/composition", json=lineup).status_code == 400
    assert client.post("/api/partie/composition", json={**lineup, "perso": [*places[:-1], ["GB", "att", 4]]}).status_code == 400
    strikers = [best["titulaires"][0], *[[pid, "BU"] for pid, _ in best["titulaires"][1:]]]
    assert client.post("/api/partie/composition", json={**lineup, "titulaires": strikers, "perso": places}).status_code == 400
    assert world.custom_formation == ()
    assert client.post("/api/partie/composition", json={**lineup, "perso": places}).status_code == 200
    assert world.custom_formation == tuple(tuple(place) for place in places)

    advance_day(world)
    following = _play_until_pending(world)
    data = client.get(f"/api/ma-partie/composition?match_id={following.id}").json()
    assert data["custom"] == places and "Perso" not in data["formations"]
    assert data["default"]["formation"] == "Perso" and [position for _, position in data["default"]["titulaires"]] == positions
