"""Screen-oriented, paginated endpoints for the observer interface."""
from __future__ import annotations

from dataclasses import asdict
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from core.domain.matches import SubmittedLineup
from core.domain.offers import TransferOffer
from core.world.human import pending_lineup_match
from core.world.simulation import target_date, market_window
from .service import GameService
from . import navigation as nav
from . import views as v
from .nations import build_nation_table
from .views import position_rank


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")
    commande_id: str = Field(default_factory=lambda: uuid4().hex, min_length=1, max_length=100)


class Advance(Command):
    jusqu_a: Literal["jour", "journee", "fin_mercato"]


class Slot(Command):
    slot: str = Field(pattern=r"^[\w-]{1,64}$")


class NewGame(Command):
    graine: int = Field(default=2025, ge=0, le=2**63 - 1, strict=True)


class ChooseClub(Command):
    club_id: int


class LineupSubmission(Command):
    match_id: int
    formation: str
    titulaires: list[tuple[int, str]]
    banc: list[int]


class RenewalDecision(Command):
    joueur_id: int
    decision: Literal["accepter", "refuser"]


class OutgoingOffer(Command):
    joueur_id: int
    salaire_hebdo: int = Field(gt=0)
    indemnite: int = Field(ge=0)


class OfferDecision(Command):
    offre_id: str
    decision: Literal["accepter", "refuser"]


class NewsRead(Command):
    # None marks the whole feed as read.
    ids: list[int] | None = None


def squad_sort_key(world, column: str):
    """Orders the squad table by what a column shows, not by the raw value behind it."""
    if column == "position": return lambda row: position_rank(row["position"])
    if column == "name": return lambda row: v.normalized(row["name"])
    if column == "contract_end": return lambda row: row["contract_end"] or ""
    if column == "fitness":
        # The cell reads "Blessé", then "N match(s)" of suspension, then a percentage.
        return lambda row: (0 if row["injured_until"] else 1 if row["suspension"] else 2, row["fitness"])
    if column == "nation":
        codes = build_nation_table(world.nation_names)
        return lambda row: [codes.get(code, {}).get("display_code", code) for code in row["nationalities"]]
    return lambda row: row[column]


def lineup_player(world, player, competition_id: int, stats: dict) -> dict:
    """A squad row of the lineup screen, with why the player cannot take part in this match."""
    row = {**v.player_row(world, player), **stats}
    injured = player.injury is not None and player.injury.end > world.date
    discipline = player.discipline.get(competition_id)
    row["unavailable"] = "injured" if injured else "suspended" if discipline and discipline.suspended_matches else None
    row["match_suspension"] = discipline.suspended_matches if discipline else 0
    return row


def previous_lineup(world, match, context, formations: dict) -> dict | None:
    """The club's last starting eleven and bench laid out on the formation they fit, players who left dropped.

    Its formation is the one holding the same positions; otherwise the club's, each player on a slot of his position."""
    club_id = context.club.id
    played = sorted((other for other in world.matches.values() if other.result is not None and other.id != match.id
                     and club_id in (other.home_id, other.away_id)), key=lambda other: (other.date, other.id))
    squad = {player.id for player in context.players}
    for other in reversed(played):
        side = "home" if other.home_id == club_id else "away"
        eleven = getattr(other.result, f"{side}_lineup")
        if not eleven: continue
        positions = sorted(position for _, position in eleven)
        formation = next((name for name, roles in formations.items() if sorted(roles) == positions),
                         context.club.formation if context.club.formation in formations else next(iter(formations)))
        remaining = [(pid, position) for pid, position in eleven if pid in squad]
        slots = []
        for role in formations[formation]:
            found = next((item for item in remaining if item[1] == role), None)
            if found: remaining.remove(found)
            slots.append((found[0] if found else None, role))
        bench = [pid for pid in getattr(other.result, f"{side}_bench") if pid in squad][:world.config.world.match_rules.bench_size]
        return {"formation": formation, "titulaires": slots, "banc": bench}
    return None


def router(service: GameService) -> APIRouter:
    api = APIRouter(prefix="/api")
    from .international import international_router
    api.include_router(international_router(service))

    @api.get("/monde/etat")
    def state() -> dict:
        with service.lock:
            world = service.world
            data = {"exists": world is not None, "job": service.active, "recovery_required": service.recovery_required,
                    "auto": service.auto_status()}
            if world and not service.recovery_required:
                data.update({"date": world.date.iso(), "season": world.season, "seed": world.seed,
                             "next_match": target_date(world, "journee").iso(), "market": market_window(world),
                             "players": len(world.players), "active_clubs": len(world.active_clubs()),
                             "played": sum(match.result is not None and match.season == world.season for match in world.matches.values()),
                             "fixtures": sum(match.season == world.season for match in world.matches.values()),
                             "controlled_club_id": world.controlled_club_id,
                             "awaiting_lineup": pending_lineup_match(world)})
            return data

    @api.post("/monde/avancer", status_code=202)
    def advance(command: Advance) -> dict:
        return service.submit("advance", command.commande_id, {"until": command.jusqu_a})

    @api.post("/monde/auto/demarrer", status_code=202)
    def auto_start(command: Command) -> dict:
        return service.submit("auto", command.commande_id, {})

    @api.post("/monde/auto/arreter")
    def auto_stop() -> dict:
        return service.stop_auto()

    @api.get("/travaux/{job_id}")
    def job(job_id: str) -> dict:
        with service.lock:
            if job_id not in service.jobs: raise HTTPException(404, "Travail introuvable.")
            return asdict(service.jobs[job_id])

    @api.post("/partie/creer", status_code=202)
    def create(command: NewGame) -> dict:
        return service.submit("create", command.commande_id, {"seed": command.graine})

    @api.post("/partie/sauvegarder", status_code=202)
    def save(command: Slot) -> dict:
        return service.submit("save", command.commande_id, {"slot": command.slot})

    @api.post("/partie/charger", status_code=202)
    def load(command: Slot) -> dict:
        return service.submit("load", command.commande_id, {"slot": command.slot})

    @api.get("/partie/slots")
    def slots() -> list[dict]:
        return service.store.slots()

    @api.post("/partie/supprimer")
    def delete(command: Slot) -> dict:
        with service.lock:
            service.store.delete(command.slot)
        return {"slot": command.slot}

    @api.post("/partie/choisir-club")
    def choose_club(command: ChooseClub) -> dict:
        with service.mutating() as world:
            if world.controlled_club_id is not None:
                raise HTTPException(400, "Un club est déjà sélectionné pour cette partie.")
            club = world.clubs.get(command.club_id)
            if club is None or club.competition_id is None:
                raise HTTPException(400, "Club invalide ou non actif.")
            world.controlled_club_id = club.id
        return {"club_id": command.club_id}

    @api.post("/partie/composition")
    def submit_lineup(command: LineupSubmission) -> dict:
        from core.ai.selection import LineupContext, validate_lineup
        with service.mutating() as world:
            if world.controlled_club_id is None:
                raise HTTPException(400, "Aucun club sélectionné.")
            club_id = world.controlled_club_id
            match = world.matches.get(command.match_id)
            if match is None or match.date != world.date or match.result is not None or club_id not in (match.home_id, match.away_id):
                raise HTTPException(400, "Ce match n'est pas à composer aujourd'hui.")
            submitted = SubmittedLineup(club_id, command.formation, [tuple(item) for item in command.titulaires], list(command.banc))
            context = LineupContext.from_world(world, club_id, match.competition_id, world.date)
            try:
                validate_lineup(context, submitted, world.config)
            except ValueError as error:
                raise HTTPException(400, str(error))
            world.submitted_lineups[match.id] = submitted
        return {"match_id": command.match_id}

    @api.get("/ma-partie/composition")
    def lineup_form(match_id: int) -> dict:
        from core.ai.selection import LineupContext, select_lineup
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            club_id = world.controlled_club_id
            match = world.matches.get(match_id)
            if match is None or club_id not in (match.home_id, match.away_id):
                raise HTTPException(404, "Match introuvable pour ce club.")
            context = LineupContext.from_world(world, club_id, match.competition_id, world.date)
            formations = world.config.formations.formations
            suggestions = {}
            for name in formations:
                lineup = select_lineup(context, world.config, name)
                suggestions[name] = {"titulaires": [(slot.player.id, slot.position) for slot in lineup.slots],
                                     "banc": [player.id for player in lineup.bench]}
            default = previous_lineup(world, match, context, formations)
            stats = v.club_season_stats(world, club_id, [player.id for player in context.players])
            if default is None:
                formation = context.club.formation if context.club.formation in formations else next(iter(formations))
                default = {"formation": formation, **suggestions[formation]}
            return {"match_id": match_id, "opponent": v.club_ref(world, match.away_id if match.home_id == club_id else match.home_id),
                    "home": match.home_id == club_id, "players": [lineup_player(world, player, match.competition_id, stats[player.id]) for player in context.players],
                    "formations": {name: list(roles) for name, roles in formations.items()},
                    "bench_size": world.config.world.match_rules.bench_size,
                    "default": default, "suggestions": suggestions}

    @api.post("/partie/renouvellement")
    def respond_renewal(command: RenewalDecision) -> dict:
        from core.world.application import apply
        from core.world.events import PlayerSigned
        from core.world.human import record
        with service.mutating() as world:
            proposal = world.pending_renewals.get(command.joueur_id)
            if proposal is None or proposal.club_id != world.controlled_club_id:
                raise HTTPException(404, "Aucune proposition de renouvellement en attente pour ce joueur.")
            player = world.players[command.joueur_id]
            if command.decision == "accepter":
                signed = apply(world, PlayerSigned(proposal.player_id, proposal.club_id, proposal.club_id, proposal.contract, 0, True))
                if not signed: raise HTTPException(400, "Ce renouvellement dépasse le plafond salarial du club.")
                record(world, "renewal_signed", f"{player.name} prolonge à {proposal.contract.weekly_wage} €/semaine.", proposal.club_id, player.id)
            else:
                record(world, "renewal_refused", f"Prolongation refusée pour {player.name}.", proposal.club_id, player.id)
            world.pending_renewals.pop(command.joueur_id, None)
        return {"joueur_id": command.joueur_id, "decision": command.decision}

    @api.post("/partie/offre-sortante")
    def submit_offer(command: OutgoingOffer) -> dict:
        from core.ai.market import contract_for, player_offer_score
        from core.world.application import apply
        from core.world.events import OffersUpdated
        from core.world.market import can_open_offer
        with service.mutating() as world:
            club_id = world.controlled_club_id
            if club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            if market_window(world) is None: raise HTTPException(400, "Le mercato est fermé.")
            player = world.players.get(command.joueur_id)
            if player is None or player.club_id == club_id:
                raise HTTPException(400, "Joueur invalide.")
            club = world.clubs[club_id]
            contract = contract_for(player, world, command.salaire_hebdo)
            reserved = [offer for offer in world.offers.values() if offer.target_id == club_id]
            if not can_open_offer(world, club, contract, command.indemnite, reserved):
                raise HTTPException(400, "Cette offre dépasse vos moyens ou la taille de votre effectif.")
            score = player_offer_score(player, club, command.salaire_hebdo, world)
            offers = [*world.offers.values(), TransferOffer(f"{world.date.iso()}:{club_id}:{player.id}:human", world.date,
                      player.id, player.club_id, club_id, contract, command.indemnite, command.indemnite, score)]
            apply(world, OffersUpdated(offers))
        return {"joueur_id": command.joueur_id}

    @api.post("/partie/reponse-offre")
    def respond_offer(command: OfferDecision) -> dict:
        from core.world.application import apply
        from core.world.events import OffersUpdated
        from core.world.human import record
        from core.world.market import resolve_accepted_offer
        with service.mutating() as world:
            offer = world.offers.get(command.offre_id)
            if offer is None or offer.source_id != world.controlled_club_id or not offer.awaiting_review:
                raise HTTPException(404, "Offre introuvable ou déjà traitée.")
            player = world.players[offer.player_id]
            if command.decision == "accepter":
                signed = resolve_accepted_offer(world, offer)
                if not signed: raise HTTPException(400, "Cette vente n'est plus possible pour le moment (effectif minimal, gardiens requis…).")
                record(world, "offer_accepted", f"{player.name} est transféré à {world.clubs[offer.target_id].name}.", offer.source_id, player.id)
                remaining = [item for item in world.offers.values() if item.player_id != offer.player_id]
            else:
                record(world, "offer_refused", f"Offre refusée pour {player.name}.", offer.source_id, player.id)
                remaining = [item for item in world.offers.values() if item.key != offer.key]
            apply(world, OffersUpdated(remaining))
        return {"offre_id": command.offre_id, "decision": command.decision}

    @api.get("/ma-partie/transferts")
    def my_transfers() -> dict:
        with service.reading() as world:
            club_id = world.controlled_club_id
            if club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            outgoing = [{"offre_id": offer.key, "joueur_id": offer.player_id, "joueur": v.player_name(world, offer.player_id),
                        "vendeur": v.club_ref(world, offer.source_id), "indemnite": offer.fee, "salaire_propose": offer.contract.weekly_wage}
                       for offer in world.offers.values() if offer.target_id == club_id]
            incoming: dict[int, list[dict]] = {}
            for offer in world.offers.values():
                if offer.source_id == club_id and offer.awaiting_review:
                    incoming.setdefault(offer.player_id, []).append({"offre_id": offer.key, "acheteur": v.club_ref(world, offer.target_id),
                                                                     "indemnite": offer.fee, "salaire_propose": offer.contract.weekly_wage})
            entrantes = [{"joueur_id": player_id, "joueur": v.player_name(world, player_id), "offres": offers}
                        for player_id, offers in incoming.items()]
            return {"sortantes": outgoing, "entrantes": entrantes}

    @api.get("/ma-partie/contrats")
    def pending_renewals() -> dict:
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            rows = []
            for proposal in world.pending_renewals.values():
                if proposal.club_id != world.controlled_club_id: continue
                player = world.players[proposal.player_id]
                rows.append({"joueur_id": player.id, "nom": player.name, "salaire_actuel": player.contract.weekly_wage,
                            "salaire_propose": proposal.contract.weekly_wage, "fin_contrat_proposee": proposal.contract.end.iso(),
                            "fin_contrat_actuelle": player.contract.end.iso()})
            rows.sort(key=lambda row: -row["salaire_propose"])
            return {"items": rows, "total": len(rows)}

    @api.get("/partie/rapport-import")
    def import_report() -> dict:
        with service.reading() as world:
            return {"counts": world.import_summary, "source_hashes": world.source_hashes,
                    "max_squad": world.config.management.guardrails.max_squad,
                    "estimated": True}

    @api.get("/ma-partie/actualites")
    def news(page: int = Query(1, ge=1)) -> dict:
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            rows = [{"id": index, "date": item.date.iso(), "kind": item.kind, "text": item.text, "club_id": item.club_id,
                     "player_id": item.player_id, "match_id": item.match_id, "read": item.read}
                    for index, item in reversed(list(enumerate(world.news)))]
            return {**v.paginate(rows, page), "unread": sum(not item.read for item in world.news)}

    @api.post("/partie/actualites-lues")
    def mark_news_read(command: NewsRead) -> dict:
        # A reading flag only, outside the simulation: allowed while the auto mode runs, unlike `mutating`.
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            targets = world.news if command.ids is None else [world.news[index] for index in command.ids if 0 <= index < len(world.news)]
            for item in targets: item.read = True
            return {"unread": sum(not item.read for item in world.news)}

    @api.get("/monde/transferts")
    def global_transfers(saison: int | None = None, type: Literal["transfer", "retirement", "academy"] = "transfer", page: int = Query(1, ge=1),
                         tri: str | None = None, ordre: Literal['asc', 'desc'] = 'desc') -> dict:
        from .club_history import world_movements
        with service.reading() as world: return world_movements(world, saison, type, page, tri, ordre)

    @api.get("/monde/palmares")
    def honours() -> dict:
        from .honours import honours as world_honours
        with service.reading() as world: return world_honours(world)

    @api.get("/competitions")
    def competitions() -> list[dict]:
        with service.reading() as world:
            return [{"id": item.id, "name": item.name, "nation": item.nation, "level": item.level,
                     "kind": item.kind, "code": item.code, "clubs": len(item.club_ids)} for item in world.competitions.values()]

    @api.get("/competitions/{competition_id}/navigation")
    def competition_navigation(competition_id: int) -> dict:
        with service.reading() as world: return nav.competition_navigation(world, competition_id)

    @api.get("/competitions/{competition_id}/europe")
    def europe_view(competition_id: int, saison: int | None = None) -> dict:
        from .europe import european_view
        with service.reading() as world:
            return european_view(world, competition_id, saison)

    @api.get("/competitions/{competition_id}/coupe")
    def cup_view(competition_id: int, saison: int | None = None) -> dict:
        from core.world.cups import ROUND_NAMES
        with service.reading() as world:
            cup = world.competitions[competition_id]
            if cup.kind != "cup":
                raise ValueError("Cette compétition n’est pas une coupe")
            year = world.season if saison is None else saison
            matches = sorted((m for m in world.matches.values() if m.competition_id == cup.id and m.season == year), key=lambda m: (m.round_number, m.id))
            rounds = []
            for number, label in enumerate(ROUND_NAMES, 1):
                fixtures = [m for m in matches if m.round_number == number]
                day = fixtures[0].date if fixtures else cup.round_dates[number - 1] if year == world.season else None
                rounds.append({"number": number, "label": label, "date": day.iso() if day else None,
                               "items": [v.match_row(world, m) for m in fixtures],
                               "complete": bool(fixtures) and all(m.result for m in fixtures)})
            latest = max((m.round_number for m in matches if m.result), default=None)
            winner = next((cid for season, cid in world.champions.get(cup.id, []) if season == year), None)
            return {"id": cup.id, "name": cup.name, "season": year, "rounds": rounds,
                    "latest_round": latest, "winner": v.club_ref(world, winner),
                    "seasons": sorted({m.season for m in world.matches.values() if m.competition_id == cup.id}, reverse=True)}

    @api.get("/nations")
    def nations() -> dict[str, dict]:
        with service.reading() as world: return build_nation_table(world.nation_names)

    @api.get("/clubs")
    def clubs(competition: int | None = None, statut: Literal["actif", "dormant"] | None = None,
              recherche: str = "", page: int = Query(1, ge=1), tri: Literal["nom", "reputation", "effectif"] = "reputation") -> dict:
        with service.reading() as world:
            rows = [club for club in world.clubs.values() if (competition is None or club.competition_id == competition)
                    and (statut is None or (club.competition_id is not None) == (statut == "actif"))
                    and v.normalized(recherche) in v.normalized(club.name)]
            rows.sort(key=lambda club: ((v.normalized(club.name) if tri == "nom" else -club.reputation if tri == "reputation" else -len(club.player_ids)), club.id))
            result = v.paginate(rows, page)
            result["items"] = [v.club_detail(world, item.id) for item in result["items"]]
            return result

    @api.get("/clubs/{club_id}")
    def club(club_id: int) -> dict:
        with service.reading() as world: return v.club_detail(world, club_id)

    @api.get("/clubs/{club_id}/navigation")
    def club_navigation(club_id: int) -> dict:
        with service.reading() as world: return nav.club_navigation(world, club_id)

    @api.get("/clubs/{club_id}/effectif")
    def squad(club_id: int, page: int = Query(1, ge=1), tri: Literal["rating", "potential", "age", "name", "position", "wage", "contract_end", "fitness", "nation", "value", "appearances", "minutes", "goals", "assists", "yellows", "reds", "average"] = "position",
              ordre: Literal["asc", "desc"] = "asc") -> dict:
        with service.reading() as world:
            rows = v.squad_rows(world, club_id)
            sort_key = squad_sort_key(world, tri)
            rows.sort(key=lambda row: (sort_key(row), row["id"]), reverse=ordre == "desc")
            return v.paginate(rows, page)

    @api.get("/clubs/{club_id}/apercu")
    def club_overview(club_id: int) -> dict:
        from .club_overview import overview
        with service.reading() as world: return overview(world, club_id)

    @api.get("/clubs/{club_id}/calendrier")
    def club_calendar(club_id: int, page: int = Query(1, ge=1)) -> dict:
        with service.reading() as world:
            world.clubs[club_id]
            return v.paginate([v.match_row(world, match) for match in sorted(world.matches.values(), key=lambda match: (match.date, match.id))
                               if match.season == world.season and club_id in (match.home_id, match.away_id)], page)

    @api.get("/clubs/{club_id}/finances")
    def finances(club_id: int, saison: int | None = None) -> dict:
        from .club_history import finances as history
        with service.reading() as world:
            data = v.finance_summary(world, club_id)
            data["history"] = history(world, club_id, saison)
            return data

    @api.get("/clubs/{club_id}/transferts")
    def club_transfers(club_id: int, saison: int | None = None, page: int = Query(1, ge=1)) -> dict:
        from .club_history import movements
        with service.reading() as world:
            world.clubs[club_id]
            return movements(world, club_id, saison, page)

    @api.get("/clubs/{club_id}/historique")
    def club_history(club_id: int, page: int = Query(1, ge=1)) -> dict:
        from .club_archive import history
        with service.reading() as world:
            world.clubs[club_id]
            return history(world, club_id, page)

    @api.get("/competitions/{competition_id}/classement")
    def standings(competition_id: int, page: int = Query(1, ge=1)) -> dict:
        with service.reading() as world: return v.paginate(v.table(world, competition_id), page)

    @api.get("/competitions/{competition_id}/calendrier")
    def calendar(competition_id: int, journee: int | None = Query(None, ge=1), page: int = Query(1, ge=1)) -> dict:
        with service.reading() as world:
            competition = world.competitions[competition_id]
            matches = [world.matches[mid] for mid in competition.match_ids]
            rounds = sorted({match.round_number for match in matches})
            selected = journee or min((match.round_number for match in matches if match.result is None), default=max(rounds))
            data = v.paginate([v.match_row(world, match) for match in matches if match.round_number == selected], page)
            return {**data, "round": selected, "rounds": rounds}

    @api.get("/competitions/{competition_id}/statistiques")
    def statistics(competition_id: int, type: Literal["buteurs", "passeurs", "notes", "cartons", "clean_sheets"] = "buteurs", page: int = Query(1, ge=1), saison: int | None = None) -> dict:
        from .statistics import leaders
        with service.reading() as world: return v.paginate(leaders(world, competition_id, type, saison), page)

    @api.get("/competitions/{competition_id}/historique")
    def history(competition_id: int, page: int = Query(1, ge=1)) -> dict:
        from .statistics import leaders, competition_leaders
        with service.reading() as world:
            world.competitions[competition_id]
            seasons = v.paginate([{"season": year, "champion": v.club_ref(world, winner), "scorer": next(iter(leaders(world, competition_id, "buteurs", year)), None),
                                   "standings": v.table(world, competition_id, year)}
                                  for year, winner in reversed(world.champions.get(competition_id, []))], page)
            return {**seasons, "leaders": competition_leaders(world, competition_id)}

    @api.get("/joueurs")
    def players(recherche: str = "", poste: str | None = None, age_min: int = Query(0, ge=0), age_max: int = Query(100, le=100),
                niveau_min: float = Query(1, ge=1, le=100), nation: str | None = None, club: int | None = None,
                statut_club: Literal["actif", "dormant"] | None = None, contrat: Literal["libre", "sous_contrat"] | None = None,
                salaire_min: int = Query(0, ge=0), salaire_max: int | None = Query(None, ge=0),
                valeur_max: int | None = Query(None, ge=0), page: int = Query(1, ge=1), tri: Literal["rating", "potential", "age", "name", "position", "wage", "contract_end", "fitness", "nation", "club", "value"] = "value",
                ordre: Literal["asc", "desc"] = "desc") -> dict:
        with service.reading() as world:
            selected = []
            search = v.normalized(recherche)
            for player in world.players.values():
                wage = player.contract.weekly_wage if player.contract else 0
                owner = world.clubs.get(player.club_id)
                if (search not in v.normalized(player.name) or (poste and player.position != poste)
                    or not age_min <= player.born.age_on(world.date) <= age_max or player.rating < niveau_min
                    or (nation and nation not in player.nationalities) or (club is not None and player.club_id != club)
                    or (statut_club and (owner is None or (owner.competition_id is not None) != (statut_club == "actif")))
                    or (contrat and (player.contract is None) != (contrat == "libre"))
                    or wage < salaire_min or (salaire_max is not None and wage > salaire_max)
                    or (valeur_max is not None and v.market_value(player, world) > valeur_max)): continue
                selected.append(player)
            def sort_key(player) -> tuple:
                if tri == 'value': return v.market_value(player, world), player.id
                value = {"rating": player.rating, "potential": player.potential, "age": player.born.age_on(world.date), "name": v.normalized(player.name),
                         "position": position_rank(player.position), "wage": player.contract.weekly_wage if player.contract else 0,
                         "contract_end": player.contract.end.iso() if player.contract else "", "fitness": player.fitness,
                         "nation": player.nation, "club": world.clubs[player.club_id].name if player.club_id else ""}[tri]
                return value, player.id
            selected.sort(key=sort_key, reverse=ordre == "desc")
            data = v.paginate(selected, page)
            data["items"] = [v.player_row(world, player) for player in data["items"]]
            return data

    @api.get("/joueurs/{player_id}")
    def player(player_id: int) -> dict:
        with service.reading() as world:
            if player_id in world.retired:
                result = {"id": player_id, "name": world.retired[player_id], "retired": True}
                career = world.international.retired_careers.get(player_id)
                if career:
                    result.update(asdict(career))
                    result["national_team_id"] = next((n.id for n in world.international.nations.values() if n.code == career.national_team), None)
                    result["international_records"] = [asdict(row) for row in world.international.records.values() if row.player_id == player_id]
                return result
            return v.player_detail(world, world.players[player_id])

    @api.get("/joueurs/{player_id}/navigation")
    def player_navigation(player_id: int) -> dict | None:
        with service.reading() as world: return nav.player_navigation(world, player_id)

    @api.get("/joueurs/{player_id}/historique")
    def player_history(player_id: int, page: int = Query(1, ge=1)) -> dict:
        with service.reading() as world:
            if player_id not in world.players and player_id not in world.retired: raise KeyError(player_id)
            return {"career": v.career(world, player_id),
                    "trajectory": v.paginate([{"season": year, "rating": rating} for year, rating in reversed(world.trajectories.get(player_id, []))], page)}

    @api.get("/matches/{match_id}")
    def match(match_id: int) -> dict:
        with service.reading() as world:
            match = world.matches.get(match_id) or world.international.matches[match_id]
            return v.match_detail(world, match)

    return api
