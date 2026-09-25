from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from core.ai.selection import LineupContext, select_lineup, to_lineup, validate_lineup
from core.domain.matches import SubmittedLineup
from core.domain.offers import TransferOffer
from core.world.simulation import advance_day, market_window
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


def test_outgoing_offer_and_incoming_offer_response(client):
    world = client.app.state.game.world
    assert market_window(world) is not None  # a fresh game starts inside the summer window
    max_squad = world.config.management.guardrails.max_squad
    roomy = [club for club in world.active_clubs() if len(club.player_ids) < max_squad]
    club_id, other_club = roomy[0].id, roomy[1]
    client.post("/api/partie/choisir-club", json={"club_id": club_id})
    target_player = next(pid for pid in other_club.player_ids)

    lowball = client.post("/api/partie/offre-sortante", json={"joueur_id": target_player, "salaire_hebdo": 1, "indemnite": 1})
    assert lowball.status_code == 200
    assert any(offer.player_id == target_player and offer.target_id == club_id for offer in world.offers.values())

    own_player = min((pid for pid in world.clubs[club_id].player_ids if world.players[pid].position != "GB"),
                     key=lambda pid: world.players[pid].rating)  # the weakest backup: sellable without gutting the squad
    refused = client.post("/api/partie/offre-sortante", json={"joueur_id": own_player, "salaire_hebdo": 1000, "indemnite": 0})
    assert refused.status_code == 400  # cannot bid for your own player

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
    assert world.news[-1].kind == "offer_accepted" and world.news[-1].club_id == club_id

    news = client.get("/api/ma-partie/actualites").json()
    assert news["items"][0]["kind"] == "offer_accepted"  # most recent first
    assert all(row["club_id"] == club_id for row in news["items"])


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
    assert newest["text"] == "Troisième" and newest["id"] == 2

    assert client.post("/api/partie/actualites-lues", json={"ids": [newest["id"]]}).json()["unread"] == 2
    assert world.news[2].read and not world.news[0].read
    assert client.post("/api/partie/actualites-lues", json={}).json()["unread"] == 0
    assert all(row["read"] for row in client.get("/api/ma-partie/actualites").json()["items"])


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

    chosen = data["suggestions"]["4-4-2"]
    assert client.post("/api/partie/composition", json={"match_id": match.id, "formation": "inconnue",
                                                        "titulaires": chosen["titulaires"], "banc": chosen["banc"]}).status_code == 400
    assert client.post("/api/partie/composition", json={"match_id": match.id, "formation": "4-4-2",
                                                        "titulaires": chosen["titulaires"], "banc": chosen["banc"]}).status_code == 200
    advance_day(world)
    following = _play_until_pending(world)

    default = client.get(f"/api/ma-partie/composition?match_id={following.id}").json()["default"]
    assert default["formation"] == "4-4-2"
    squad = set(world.clubs[club_id].player_ids)
    assert [pid for pid, _ in default["titulaires"]] == [pid if pid in squad else None for pid, _ in chosen["titulaires"]]
