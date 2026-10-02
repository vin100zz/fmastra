"""Screen-oriented, paginated endpoints for the observer interface."""
from __future__ import annotations

import re
from dataclasses import asdict, replace
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from core.domain.date import Date
from core.domain.matches import SubmittedLineup
from core.domain.players import ATTRIBUTE_INDEX, ATTRIBUTE_NAMES
from core.world.human import listed_price, pending_lineup_match
from core.world.transfer_rules import recent_arrival_ids
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
    # "etape" is the screen flow's Continuer (see core.world.steps); the others remain for tools and tests.
    jusqu_a: Literal["etape", "jour", "journee", "fin_mercato"]


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
    # The club's own tactic as the Composition pitch holds it, (position, line, column) of each place; kept for the next matches.
    perso: list[tuple[str, str, int]] | None = None


class RenewalDecision(Command):
    joueur_id: int
    decision: Literal["accepter", "refuser"]


class FeeOffer(Command):
    joueur_id: int
    indemnite: int = Field(ge=0)


class WageOffer(Command):
    joueur_id: int
    salaire_hebdo: int = Field(gt=0)


class Listing(Command):
    joueur_id: int
    indemnite: int | None = Field(default=None, ge=0)  # None takes the player off the list


class OfferToClubs(Command):
    joueur_id: int
    indemnite: int = Field(ge=0)


class OfferDecision(Command):
    offre_id: str
    decision: Literal["accepter", "refuser"]


class NewsRead(Command):
    # None marks the whole feed as read.
    ids: list[int] | None = None


# The attribute view of the player lists sorts on each attribute, their game view on each composite.
AttributeSort = Literal[ATTRIBUTE_NAMES]
CompositeSort = Literal[tuple(v.COMPOSITES)]


def squad_sort_key(world, column: str):
    """Orders the squad table by what a column shows, not by the raw value behind it."""
    if column == "position": return lambda row: position_rank(row["position"])
    if column in ATTRIBUTE_INDEX: return lambda row: row["attributes"][column]
    if column in v.COMPOSITES: return lambda row: row["composites"][column]
    if column == "name": return lambda row: v.normalized(row["name"])
    if column == "contract_end": return lambda row: row["contract_end"] or ""
    if column == "fitness":
        # The cell reads "Blessé", then "N matchs" of suspension, then a percentage.
        return lambda row: (0 if row["injured_until"] else 1 if row["suspension"] else 2, row["fitness"])
    if column == "nation":
        codes = build_nation_table(world.nation_names)
        return lambda row: [codes.get(code, {}).get("display_code", code) for code in row["nationalities"]]
    return lambda row: row[column]


ClubSort = Literal["nom", "pays", "championnat", "reputation", "entrainement", "recrutement", "effectif", "niveau", "potentiel", "formation"]
CLUB_TEXT_SORTS = ("nom", "pays", "championnat", "formation")


def club_sort_key(world, column: str):
    """Orders the club list by what a column shows; None when the club has nothing to show there."""
    if column == "nom": return lambda club: v.normalized(club.name)
    if column == "pays":
        codes = build_nation_table(world.nation_names)
        return lambda club: codes.get(club.nation, {}).get("display_code", club.nation)
    if column == "championnat":
        return lambda club: v.normalized(world.competitions[club.competition_id].name) if club.competition_id is not None else None
    if column == "reputation": return lambda club: club.reputation
    if column == "entrainement": return lambda club: club.training_facilities
    if column == "recrutement": return lambda club: club.youth_recruitment
    if column == "effectif": return lambda club: len(club.player_ids)
    if column == "formation": return lambda club: v.normalized(club.formation)
    field = "top_rating" if column == "niveau" else "top_potential"
    return lambda club: v.squad_strength(world, club.id)[field]


def lineup_player(world, player, competition_id: int, stats: dict) -> dict:
    """A squad row of the lineup screen, with why the player cannot take part in this match."""
    row = {**v.player_row(world, player), **stats, "position_notes": v.position_notes(player, world.config),
           "position_affinities": v.position_affinities(player)}
    injured = player.injury is not None and player.injury.end > world.date
    discipline = player.discipline.get(competition_id)
    row["unavailable"] = "injured" if injured else "suspended" if discipline and discipline.suspended_matches else None
    row["match_suspension"] = discipline.suspended_matches if discipline else 0
    return row


def previous_lineup(world, match, context, formations: dict) -> dict | None:
    """The club's last starting eleven and bench laid out on the formation they fit, players who left dropped.

    Its formation is the first of `formations` holding the same positions (the club's own tactic leads them);
    otherwise the club's, each player on a slot of his position."""
    club_id = context.club.id
    played = sorted((other for other in world.matches.values() if other.result is not None and other is not match
                     and club_id in (other.home_id, other.away_id)), key=lambda other: (other.date, other.id))
    squad = {player.id for player in context.players}
    for other in reversed(played):
        side = "home" if other.home_id == club_id else "away"
        eleven = getattr(other.result, f"{side}_lineup")
        if not eleven: continue
        positions = sorted(position for _, position in eleven)
        formation = next((name for name, roles in formations.items() if sorted(roles) == positions),
                         context.club.formation if context.club.formation in formations else next(iter(world.config.formations.formations)))
        remaining = [(pid, position) for pid, position in eleven if pid in squad]
        slots = []
        for role in formations[formation]:
            found = next((item for item in remaining if item[1] == role), None)
            if found: remaining.remove(found)
            slots.append((found[0] if found else None, role))
        bench = [pid for pid in getattr(other.result, f"{side}_bench") if pid in squad][:world.config.world.match_rules.bench_size]
        return {"formation": formation, "titulaires": slots, "banc": bench}
    return None


def club_next_matches(world, count: int = 3) -> list[dict]:
    """The controlled club's next fixtures for the top bar, each flagged when it belongs to the club's own championship."""
    club_id = world.controlled_club_id
    if club_id is None:
        return []
    league = world.clubs[club_id].competition_id
    upcoming = sorted((match for match in world.matches.values() if not match.result and club_id in (match.home_id, match.away_id)),
                      key=lambda match: (match.date, match.id))[:count]
    return [{**v.match_row(world, match), "league": match.competition_id == league} for match in upcoming]


def headline(text: str) -> str:
    """News read as headlines; entries saved by older versions still carry "N match(s)", ISO dates and a final full stop."""
    text = re.sub(r"\d{4}-\d{2}-\d{2}", lambda found: Date.parse(found[0]).day_month(), text)
    text = re.sub(r"(\d+) match\(s\)", lambda found: f"{found[1]} match{'s' if int(found[1]) > 1 else ''}", text)
    return text[:-1] if text.endswith(".") else text


def router(service: GameService) -> APIRouter:
    api = APIRouter(prefix="/api")
    from .international import international_router
    from .live import live_router
    api.include_router(international_router(service))
    api.include_router(live_router(service))

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
                             "awaiting_lineup": pending_lineup_match(world),
                             # The feed only grows: the page compares it with its last visit to Mon club.
                             "news_count": len(world.news),
                             "live_match_id": world.live_match.match_id if world.live_match else None,
                             "club_next_matches": club_next_matches(world)})
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
        from core.ai.selection import LineupContext, validate_custom_formation, validate_lineup
        with service.mutating() as world:
            if world.controlled_club_id is None:
                raise HTTPException(400, "Aucun club sélectionné.")
            club_id = world.controlled_club_id
            match = world.matches.get(command.match_id)
            if match is None or match.date != world.date or match.result is not None or club_id not in (match.home_id, match.away_id):
                raise HTTPException(400, "Ce match n'est pas à composer aujourd'hui.")
            submitted = SubmittedLineup(club_id, command.formation, [tuple(item) for item in command.titulaires], list(command.banc))
            context = LineupContext.from_world(world, club_id, match.competition_id, world.date)
            custom = world.custom_formation if command.perso is None else tuple(tuple(place) for place in command.perso)
            try:
                if command.perso is not None: validate_custom_formation(custom, world.config)
                validate_lineup(context, submitted, world.config, [position for position, _, _ in custom])
            except ValueError as error:
                raise HTTPException(400, str(error))
            world.custom_formation = custom
            world.submitted_lineups[match.id] = submitted
        return {"match_id": command.match_id}

    def lineup_context(world, match_id: int | None):
        """The controlled club's match being prepared, its competition and its lineup context: `match_id`, or the club's next match."""
        from core.ai.selection import LineupContext
        if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
        club_id = world.controlled_club_id
        if match_id is None:
            # A lineup can be tried any day: for the club's next match, or for its league while no fixture is scheduled.
            upcoming = [match for match in world.matches.values() if match.result is None and club_id in (match.home_id, match.away_id)]
            match = min(upcoming, key=lambda match: (match.date, match.id), default=None)
        else:
            match = world.matches.get(match_id)
            if match is None or club_id not in (match.home_id, match.away_id):
                raise HTTPException(404, "Match introuvable pour ce club.")
        competition_id = match.competition_id if match else world.clubs[club_id].competition_id
        context = LineupContext.from_world(world, club_id, competition_id, world.date)
        if match is None or match.date != world.date:
            # Players away with their national team may be back by a later match.
            context = replace(context, players=[world.players[pid] for pid in context.club.player_ids])
        return match, competition_id, context

    def lineup_suggestion(lineup) -> dict:
        return {"titulaires": [(slot.player.id, slot.position) for slot in lineup.slots], "banc": [player.id for player in lineup.bench]}

    @api.get("/ma-partie/composition")
    def lineup_form(match_id: int | None = None) -> dict:
        from core.ai.selection import CUSTOM_FORMATION, select_lineup
        with service.reading() as world:
            match, competition_id, context = lineup_context(world, match_id)
            club_id = context.club.id
            formations = world.config.formations.formations
            suggestions = {name: lineup_suggestion(select_lineup(context, world.config, name)) for name in formations}
            custom = {CUSTOM_FORMATION: [position for position, _, _ in world.custom_formation]} if world.custom_formation else {}
            default = previous_lineup(world, match, context, {**custom, **formations})
            stats = v.club_season_stats(world, club_id, [player.id for player in context.players])
            if default is None:
                formation = context.club.formation if context.club.formation in formations else next(iter(formations))
                default = {"formation": formation, **suggestions[formation]}
            opponent = None if match is None else match.away_id if match.home_id == club_id else match.home_id
            return {"match_id": match.id if match else None, "opponent": v.club_ref(world, opponent) if match else None,
                    "home": match is not None and match.home_id == club_id,
                    "players": [lineup_player(world, player, competition_id, stats[player.id]) for player in context.players],
                    "formations": {name: list(roles) for name, roles in formations.items()},
                    "custom": [list(place) for place in world.custom_formation] or None,
                    "composites_by_position": {position: list(keys) for position, keys in v.COMPOSITES_BY_POSITION.items()},
                    "bench_size": world.config.world.match_rules.bench_size,
                    "default": default, "suggestions": suggestions}

    @api.get("/ma-partie/composition/suggestion")
    def custom_lineup_suggestion(postes: str, match_id: int | None = None) -> dict:
        """The best eleven and bench on the club's own tactic being built, `postes` listing its positions place by place."""
        from core.ai.selection import select_lineup
        from core.domain.players import Position
        positions = postes.split(",")
        with service.reading() as world:
            if (len(positions) != world.config.world.match_rules.players_on_pitch
                    or any(position not in {item.value for item in Position} for position in positions)):
                raise HTTPException(400, "Tactique invalide.")
            _, _, context = lineup_context(world, match_id)
            return lineup_suggestion(select_lineup(context, world.config, positions=positions))

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
                record(world, "renewal_signed", f"{player.name} prolonge à {proposal.contract.weekly_wage} €/semaine", proposal.club_id, player.id)
            else:
                record(world, "renewal_refused", f"Prolongation refusée pour {player.name}", proposal.club_id, player.id)
            world.pending_renewals.pop(command.joueur_id, None)
        return {"joueur_id": command.joueur_id, "decision": command.decision}

    def negotiate(command: FeeOffer | WageOffer, offer) -> dict:
        from core.world.talks import TalksRefused
        with service.mutating() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            player = world.players.get(command.joueur_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            try: reply = offer(world, player)
            except TalksRefused as refusal: raise HTTPException(400, str(refusal)) from refusal
            return {"resultat": reply.outcome, **v.talks_view(world, player)}

    # Each offer is answered at once: accepted, or refused with a counter-offer until the talks break off.
    @api.post("/partie/negociation/indemnite")
    def offer_fee(command: FeeOffer) -> dict:
        from core.world.talks import offer_fee
        return negotiate(command, lambda world, player: offer_fee(world, player, command.indemnite))

    @api.post("/partie/negociation/salaire")
    def offer_wage(command: WageOffer) -> dict:
        from core.world.talks import offer_wage
        return negotiate(command, lambda world, player: offer_wage(world, player, command.salaire_hebdo))

    @api.get("/ma-partie/negociation/{player_id}")
    def talks(player_id: int) -> dict:
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            player = world.players.get(player_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            return v.talks_view(world, player)

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
                record(world, "offer_accepted", f"{player.name} est transféré à {world.clubs[offer.target_id].name}", offer.source_id, player.id)
                remaining = [item for item in world.offers.values() if item.player_id != offer.player_id]
            else:
                record(world, "offer_refused", f"Offre refusée pour {player.name}", offer.source_id, player.id)
                remaining = [item for item in world.offers.values() if item.key != offer.key]
            apply(world, OffersUpdated(remaining))
        return {"offre_id": command.offre_id, "decision": command.decision}

    # The human club's own players up for sale: its transfer list, and players offered to every club at once.
    def sell(command: Listing | OfferToClubs, act) -> dict:
        from core.world.sales import SaleRefused
        with service.mutating() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            player = world.players.get(command.joueur_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            try: result = act(world, player)
            except SaleRefused as refusal: raise HTTPException(400, str(refusal)) from refusal
            return {**result, **v.sale_view(world, player)}

    @api.post("/partie/liste-transferts")
    def list_player(command: Listing) -> dict:
        from core.world.sales import set_listing
        return sell(command, lambda world, player: set_listing(world, player, command.indemnite) or {})

    @api.post("/partie/proposer-aux-clubs")
    def offer_to_clubs(command: OfferToClubs) -> dict:
        from core.world.sales import offer_to_clubs
        return sell(command, lambda world, player: {"proposees": len(offer_to_clubs(world, player, command.indemnite))})

    @api.get("/ma-partie/vente/{player_id}")
    def sale(player_id: int) -> dict:
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            player = world.players.get(player_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            return v.sale_view(world, player)

    @api.get("/ma-partie/transferts")
    def my_transfers() -> dict:
        with service.reading() as world:
            club_id = world.controlled_club_id
            if club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            outgoing = [{"offre_id": offer.key, "joueur_id": offer.player_id, "joueur": v.player_name(world, offer.player_id),
                        "vendeur": v.club_ref(world, offer.source_id), "indemnite": offer.fee, "salaire_propose": offer.contract.weekly_wage,
                        "etape": offer.stage, "date_prevue": offer.due.iso() if offer.due else None}
                       for offer in world.offers.values() if offer.target_id == club_id]
            incoming = dict.fromkeys(offer.player_id for offer in world.offers.values() if offer.source_id == club_id and offer.awaiting_review)
            entrantes = [{"joueur_id": player_id, "joueur": v.player_name(world, player_id), "offres": v.incoming_offers(world, player_id)}
                        for player_id in incoming]
            listed = [{"joueur_id": player_id, "joueur": world.players[player_id].name, "indemnite": fee}
                      for player_id in world.transfer_list if (fee := listed_price(world, player_id)) is not None]
            return {"sortantes": outgoing, "entrantes": entrantes, "liste": listed}

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
            rows = [{"id": index, "date": item.date.iso(), "kind": item.kind, "text": headline(item.text), "club_id": item.club_id,
                     "player_id": item.player_id, "match_id": item.match_id, "read": item.read,
                     "player": world.players[item.player_id].name if item.player_id in world.players else None}
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

    @api.get("/manuel")
    @api.get("/manuel/{chapitre}")
    def manual(chapitre: str | None = None) -> dict:
        from infrastructure.config.loader import config_payload, load_config
        from .manual import manual_view
        # Outside the lock: a configuration never changes, and the manual also opens before any game exists.
        world = service.world
        cfg = world.config if world is not None else load_config(service.root / "config")
        return manual_view(service.root / "docs" / "manuel", config_payload(cfg), chapitre)

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
    def clubs(competition: int | None = None, statut: Literal["actif", "dormant"] | None = None, pays: str = "",
              recherche: str = "", page: int = Query(1, ge=1), tri: ClubSort = "reputation",
              ordre: Literal["asc", "desc"] | None = None) -> dict:
        with service.reading() as world:
            rows = [club for club in world.clubs.values() if (competition is None or club.competition_id == competition)
                    and (statut is None or (club.competition_id is not None) == (statut == "actif"))
                    and (not pays or club.nation == pays) and v.normalized(recherche) in v.normalized(club.name)]
            # Both sorts are stable: ties keep the reputation order whichever the direction.
            rows.sort(key=lambda club: (-club.reputation, club.id))
            key = club_sort_key(world, tri)
            values = {club.id: key(club) for club in rows}
            descending = (ordre or ("asc" if tri in CLUB_TEXT_SORTS else "desc")) == "desc"
            # A club without the value (a dash, or no league) comes last whichever the order.
            rows = (sorted((club for club in rows if values[club.id] is not None), key=lambda club: values[club.id], reverse=descending)
                    + [club for club in rows if values[club.id] is None])
            result = v.paginate(rows, page)
            result["items"] = [v.club_detail(world, item.id) for item in result["items"]]
            result["nations"] = sorted({club.nation for club in world.clubs.values()})
            return result

    @api.get("/clubs/{club_id}")
    def club(club_id: int) -> dict:
        with service.reading() as world: return v.club_detail(world, club_id)

    @api.get("/clubs/{club_id}/navigation")
    def club_navigation(club_id: int) -> dict:
        with service.reading() as world: return nav.club_navigation(world, club_id)

    @api.get("/clubs/{club_id}/effectif")
    def squad(club_id: int, page: int = Query(1, ge=1), tri: Literal["rating", "potential", "age", "name", "position", "wage", "contract_end", "fitness", "form", "morale", "nation", "value", "appearances", "minutes", "goals", "assists", "yellows", "reds", "average"] | AttributeSort | CompositeSort = "position",
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

    @api.get("/competitions/{competition_id}/journee/{quand}")
    def round_matches(competition_id: int, quand: Literal["derniere", "prochaine"], saison: int | None = None) -> dict:
        from .rounds import competition_round
        with service.reading() as world: return competition_round(world, competition_id, quand, saison)

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
                niveau_min: float = Query(1, ge=1, le=100), potentiel_min: float = Query(1, ge=1, le=100),
                nation: str | None = None, club: int | None = None,
                statut_club: Literal["actif", "dormant"] | None = None, contrat: Literal["libre", "sous_contrat"] | None = None,
                salaire_min: int = Query(0, ge=0), salaire_max: int | None = Query(None, ge=0),
                valeur_max: int | None = Query(None, ge=0), prix_max: int | None = Query(None, ge=0),
                interesse: Literal["oui", "non"] | None = None, pretentions_max: int | None = Query(None, ge=0), page: int = Query(1, ge=1),
                tri: Literal["rating", "potential", "age", "name", "position", "wage", "contract_end", "fitness", "nation", "club", "value", "asking_price",
                             "wage_demand", "interested"] | AttributeSort | CompositeSort = "value",
                ordre: Literal["asc", "desc"] = "desc") -> dict:
        with service.reading() as world:
            selected = []
            search = v.normalized(recherche)
            # Asking prices weigh each player's place in his squad: computed only when a filter or the sort needs them.
            settled, quotes = recent_arrival_ids(world), {}
            def quote(player) -> dict:
                if player.id not in quotes: quotes[player.id] = v.asking_quote(world, player, settled)
                return quotes[player.id]
            def fee(player) -> int | None:
                """What his club asks, 0 for a free agent, None for a player his club will not sell."""
                row = quote(player)
                return None if not row["transferable"] else row["asking_price"] or 0
            # What a player asks to join the human club weighs his value as that club sees it: computed only when needed too.
            # Without a human club nobody is a recruit: its two filters are left aside.
            recruiting, demands = world.controlled_club_id is not None, {}
            def demand(player) -> int | None:
                if player.id not in demands: demands[player.id] = v.asked_wage(world, player)
                return demands[player.id]
            for player in world.players.values():
                wage = player.contract.weekly_wage if player.contract else 0
                owner = world.clubs.get(player.club_id)
                if (search not in v.normalized(player.name) or (poste and player.position != poste)
                    or not age_min <= player.born.age_on(world.date) <= age_max or player.rating < niveau_min or player.potential < potentiel_min
                    or (nation and nation not in player.nationalities) or (club is not None and player.club_id != club)
                    or (statut_club and (owner is None or (owner.competition_id is not None) != (statut_club == "actif")))
                    or (contrat and (player.contract is None) != (contrat == "libre"))
                    or wage < salaire_min or (salaire_max is not None and wage > salaire_max)
                    or (valeur_max is not None and v.market_value(player, world) > valeur_max)
                    or (prix_max is not None and (fee(player) is None or fee(player) > prix_max))
                    or (recruiting and interesse and v.interested(world, player) is not (interesse == "oui"))
                    or (recruiting and pretentions_max is not None and (demand(player) is None or demand(player) > pretentions_max))): continue
                selected.append(player)
            def sort_key(player) -> tuple:
                if tri == 'value': return v.market_value(player, world), player.id
                if tri == 'asking_price': return fee(player) or 0, player.id
                if tri == 'wage_demand': return demand(player) or 0, player.id
                if tri == 'interested': return bool(v.interested(world, player)), player.id
                if tri in ATTRIBUTE_INDEX: return player.attributes.get(tri), player.id
                if tri in v.COMPOSITES: return v.composite(player, tri, world.config), player.id
                value ={"rating": player.rating, "potential": player.potential, "age": player.born.age_on(world.date), "name": v.normalized(player.name),
                         "position": position_rank(player.position), "wage": player.contract.weekly_wage if player.contract else 0,
                         "contract_end": player.contract.end.iso() if player.contract else "", "fitness": player.fitness,
                         "nation": player.nation, "club": world.clubs[player.club_id].name if player.club_id else ""}[tri]
                return value, player.id
            selected.sort(key=sort_key, reverse=ordre == "desc")
            # Players their clubs will not sell have no price: they come last whichever the order.
            if tri == 'asking_price': selected.sort(key=lambda player: fee(player) is None)
            # So do the human club's own players, who have nothing to ask or to accept.
            if tri == 'wage_demand': selected.sort(key=lambda player: demand(player) is None)
            if tri == 'interested': selected.sort(key=lambda player: v.interested(world, player) is None)
            data = v.paginate(selected, page)
            data["items"] = [{**v.player_row(world, player), **quote(player), "interested": v.interested(world, player), "wage_demand": demand(player)}
                             for player in data["items"]]
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
                    result["international_records"] = v.international_records(world, player_id)
                return result
            return v.player_detail(world, world.players[player_id])

    @api.get("/joueurs/{player_id}/navigation")
    def player_navigation(player_id: int) -> dict | None:
        with service.reading() as world: return nav.player_navigation(world, player_id)

    @api.get("/joueurs/{player_id}/historique")
    def player_history(player_id: int) -> dict:
        with service.reading() as world:
            if player_id not in world.players and player_id not in world.retired: raise KeyError(player_id)
            return {"career": v.career(world, player_id), "trajectory": v.level_history(world, player_id)}

    @api.get("/matches/{match_id}")
    def match(match_id: int) -> dict:
        with service.reading() as world:
            match = world.matches.get(match_id) or world.international.matches[match_id]
            return v.match_detail(world, match)

    return api
