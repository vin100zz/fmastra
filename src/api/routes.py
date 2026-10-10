"""Screen-oriented, paginated endpoints for the observer interface."""
from __future__ import annotations

from dataclasses import asdict, replace
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from core.domain.matches import SubmittedLineup
from core.domain.players import ATTRIBUTE_INDEX, ATTRIBUTE_NAMES
from core.world.human import listed_price, pending_lineup_match
from core.world.news import draw_notices
from core.world.transfer_rules import recent_arrival_ids
from core.world.simulation import target_date, market_window
from .service import GameService
from . import navigation as nav
from . import news
from . import views as v
from .nations import build_nation_table, competition_colors
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


class ReserveMove(Command):
    joueur_id: int
    reserve: bool  # True sends the player to the reserve, False calls him back to the first team


class BudgetShare(Command):
    plafond_hebdo: int = Field(ge=0)  # the weekly wage cap the club wants: its transfer budget pays the rise, or gets the cut back


class Lending(Command):
    joueur_id: int
    club_id: int
    duree: Literal["saison", "demi_saison"]


class Borrowing(Command):
    joueur_id: int
    duree: Literal["saison", "demi_saison"]


class OfferDecision(Command):
    offre_id: str
    decision: Literal["accepter", "refuser", "contre"]
    indemnite: int | None = Field(default=None, gt=0)  # the price the club names with "contre"


class Untouchable(Command):
    joueur_id: int
    intransferable: bool  # True keeps the player off the market, False puts him back on it


class OffersDecision(Command):
    # Every offer awaiting an answer for this player, at once.
    joueur_id: int
    decision: Literal["accepter", "refuser"]


class PlayerCommand(Command):
    joueur_id: int


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
        # The code of the one nation the column shows.
        codes = build_nation_table(world.nation_names)
        display = lambda code: codes.get(code, {}).get("display_code", code)
        return lambda row: display(v.main_nation(row))
    return lambda row: row[column]


# A squad of the largest size and the players it has lent fit on one page.
SQUAD_PAGE = 100
NEWS_PAGE = 30


ClubSort = Literal["nom", "pays", "championnat", "classement", "forme", "reputation", "entrainement", "recrutement", "effectif", "age",
                   "niveau", "potentiel", "valeur", "budget", "masse_salariale", "formation"]
# Text columns, and the rank in a league, first run from the smallest.
CLUB_ASCENDING_SORTS = ("nom", "pays", "championnat", "classement", "formation")
FORM_POINTS = {"V": 3, "N": 1}


def page_size(default: int = 30):
    """The lists fitted to the window ask for the rows it can show."""
    return Query(default, ge=10, le=100)


def club_sort_key(world, column: str):
    """Orders the club list by what a column shows; None when the club has nothing to show there."""
    if column in ("classement", "forme"):
        standings: dict = {}
        def standing(club):
            return v.league_standings(world, club.competition_id, standings).get(club.id)
        if column == "classement": return lambda club: row["rank"] if (row := standing(club)) else None
        return lambda club: sum(FORM_POINTS.get(letter, 0) for letter in row["form"]) if (row := standing(club)) else None
    if column == "age": return lambda club: v.squad_profile(world, club.id)["average_age"]
    if column == "valeur": return lambda club: v.squad_profile(world, club.id)["squad_value"] if club.player_ids else None
    if column == "budget":
        reserved = v.reserved_budgets(world)
        return lambda club: max(0, club.transfer_budget - reserved.get(club.id, 0))
    if column == "masse_salariale": return lambda club: club.wage_bill
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
                             "controlled_club": v.club_ref(world, world.controlled_club_id),
                             "awaiting_lineup": pending_lineup_match(world),
                             "news_count": len(world.news),
                             # What Continuer reads before it advances: the unread messages, then those awaiting an answer.
                             "news": news.summary(world) if world.controlled_club_id is not None else None,
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
            # The draws were made before it had a manager: he is told the cup matches that await it.
            draw_notices(world)
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
            # Players away with their national team may be back by a later match; those of the reserve stay out.
            context = replace(context, players=[player for pid in context.club.player_ids
                                                if (player := world.players[pid]).reserve_since is None])
        return match, competition_id, context

    def lineup_suggestion(lineup) -> dict:
        """The AI's lineup as the Composition screen loads it, the substitutes in the order of positions."""
        bench = sorted(lineup.bench, key=lambda player: position_rank(player.position))
        return {"titulaires": [(slot.player.id, slot.position) for slot in lineup.slots], "banc": [player.id for player in bench]}

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
            from .scouting import scouting
            return {"match_id": match.id if match else None, "opponent": v.club_ref(world, opponent) if match else None,
                    "home": match is not None and match.home_id == club_id, "scouting": scouting(world, match, club_id),
                    "club": v.club_ref(world, club_id),
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
        """The answer to the contract a player asked for; the message that told it keeps the answer."""
        from core.world import renewals
        with service.mutating() as world:
            proposal = world.pending_renewals.get(command.joueur_id)
            if proposal is None or proposal.club_id != world.controlled_club_id:
                raise HTTPException(404, "Aucune proposition de renouvellement en attente pour ce joueur.")
            player = world.players[command.joueur_id]
            try: renewals.sign(world, player) if command.decision == "accepter" else renewals.turn_down(world, player)
            except renewals.RenewalRefused as refusal: raise HTTPException(400, str(refusal)) from refusal
        return {"joueur_id": command.joueur_id, "decision": command.decision}

    @api.get("/ma-partie/contrat/{player_id}")
    def contract_terms(player_id: int) -> dict:
        """The contract a player of the human club would sign today, or what keeps him from extending."""
        from core.world import renewals
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            player = world.players.get(player_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            obstacle = renewals.renewal_obstacle(world, player)
            terms = renewals.asked_terms(world, player) if obstacle is None else None
            return {"obstacle": obstacle, "demande": player_id in world.pending_renewals,
                    "salaire_actuel": player.contract.weekly_wage if player.contract else None,
                    "fin_contrat_actuelle": player.contract.end.iso() if player.contract else None,
                    "salaire_propose": terms.weekly_wage if terms else None, "fin_contrat_proposee": terms.end.iso() if terms else None}

    @api.post("/partie/prolongation")
    def extend_contract(command: PlayerCommand) -> dict:
        """The human club extends one of its players on the terms he names (see `/ma-partie/contrat`)."""
        from core.world import renewals
        with service.mutating() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            player = world.players.get(command.joueur_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            try: contract = renewals.sign(world, player)
            except renewals.RenewalRefused as refusal: raise HTTPException(400, str(refusal)) from refusal
            return {"joueur_id": player.id, "salaire": contract.weekly_wage, "fin_contrat": contract.end.iso()}

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

    @api.post("/partie/negociation/abandon")
    def abandon_talks(command: PlayerCommand) -> dict:
        from core.world.talks import TalksRefused, withdraw
        with service.mutating() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            player = world.players.get(command.joueur_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            try: withdraw(world, player)
            except TalksRefused as refusal: raise HTTPException(400, str(refusal)) from refusal
            return v.talks_view(world, player)

    @api.get("/ma-partie/negociation/{player_id}")
    def talks(player_id: int) -> dict:
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            player = world.players.get(player_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            return v.talks_view(world, player)

    @api.post("/partie/reponse-offre")
    def respond_offer(command: OfferDecision) -> dict:
        """The answer to one offer for a player of the human club; the message that told it keeps the answer.

        With "contre" the club names its own price: `vendu` tells whether the buyer took it."""
        from core.world import sales
        with service.mutating() as world:
            offer = world.offers.get(command.offre_id)
            if offer is None or offer.source_id != world.controlled_club_id or not offer.awaiting_review:
                raise HTTPException(404, "Offre introuvable ou déjà traitée.")
            if command.decision == "contre" and command.indemnite is None: raise HTTPException(400, "Indiquez votre prix.")
            sold = command.decision == "accepter"
            try:
                if command.decision == "contre": sold = sales.counter(world, offer, command.indemnite)
                else: sales.answer(world, offer, sold)
            except sales.SaleRefused as refusal: raise HTTPException(400, str(refusal)) from refusal
        return {"offre_id": command.offre_id, "decision": command.decision, "vendu": sold}

    @api.post("/partie/reponse-offres")
    def respond_offers(command: OffersDecision) -> dict:
        """Every offer awaiting an answer for a player at once: all refused, or all accepted, and he picks his club."""
        from core.world import sales
        with service.mutating() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            player = world.players.get(command.joueur_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            try: signed = sales.answer_all(world, player, command.decision == "accepter")
            except sales.SaleRefused as refusal: raise HTTPException(400, str(refusal)) from refusal
            return {"joueur_id": player.id, "decision": command.decision, "club": v.club_ref(world, signed.target_id) if signed else None}

    # The human club's own players up for sale: its transfer list, and players offered to every club at once; and
    # those it keeps off the market.
    def sell(command: Listing | OfferToClubs | Untouchable, act) -> dict:
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

    @api.post("/partie/intransferable")
    def keep_player(command: Untouchable) -> dict:
        from core.world.sales import set_untouchable
        return sell(command, lambda world, player: set_untouchable(world, player, command.intransferable) or {})

    @api.get("/ma-partie/vente/{player_id}")
    def sale(player_id: int) -> dict:
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            player = world.players.get(player_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            return v.sale_view(world, player)

    # The human club's squad beside its transfers: its reserve, and loans either way, each answered at once.
    def manage(command: ReserveMove | Lending | Borrowing, act) -> dict:
        from core.world.loans import LoanRefused
        from core.world.reserves import ReserveRefused
        with service.mutating() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            if world.live_match is not None: raise HTTPException(400, "Un match est en cours : terminez-le d'abord.")
            player = world.players.get(command.joueur_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            if any(player.id in lineup.bench or any(pid == player.id for pid, _ in lineup.slots) for lineup in world.submitted_lineups.values()):
                raise HTTPException(400, "Ce joueur figure dans la composition du match du jour.")
            try: act(world, player)
            except (LoanRefused, ReserveRefused) as refusal: raise HTTPException(400, str(refusal)) from refusal
            return v.squad_view(world, player)

    @api.post("/partie/reserve")
    def move_to_reserve(command: ReserveMove) -> dict:
        from core.world.reserves import set_reserve
        return manage(command, lambda world, player: set_reserve(world, player, command.reserve))

    @api.post("/partie/preter")
    def lend_player(command: Lending) -> dict:
        from core.world.loans import lend
        return manage(command, lambda world, player: lend(world, player, command.club_id, command.duree))

    @api.post("/partie/emprunter")
    def borrow_player(command: Borrowing) -> dict:
        from core.world.loans import borrow
        return manage(command, lambda world, player: borrow(world, player, command.duree))

    @api.post("/partie/budgets")
    def share_budgets(command: BudgetShare) -> dict:
        """The human club's means moved between its transfer budget and its wage cap; answers its finances."""
        from core.world.budgets import BudgetRefused, set_wage_cap
        with service.mutating() as world:
            try: set_wage_cap(world, command.plafond_hebdo)
            except BudgetRefused as refusal: raise HTTPException(400, str(refusal)) from refusal
            return v.finance_summary(world, world.controlled_club_id)

    @api.get("/ma-partie/effectif/{player_id}")
    def squad_options(player_id: int) -> dict:
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            player = world.players.get(player_id)
            if player is None: raise HTTPException(404, "Joueur introuvable.")
            return v.squad_view(world, player)

    @api.get("/ma-partie/transferts")
    def my_transfers() -> dict:
        with service.reading() as world:
            club_id = world.controlled_club_id
            if club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            position = lambda player_id: world.players[player_id].position.value if player_id in world.players else None
            outgoing = [{"offre_id": offer.key, "joueur_id": offer.player_id, "joueur": v.player_name(world, offer.player_id),
                        "poste": position(offer.player_id),
                        "vendeur": v.club_ref(world, offer.source_id), "indemnite": offer.fee, "salaire_propose": offer.contract.weekly_wage,
                        "etape": offer.stage, "date_prevue": offer.due.iso() if offer.due else None}
                       for offer in world.offers.values() if offer.target_id == club_id]
            incoming = dict.fromkeys(offer.player_id for offer in world.offers.values() if offer.source_id == club_id and offer.awaiting_review)
            entrantes = [{"joueur_id": player_id, "joueur": v.player_name(world, player_id), "poste": position(player_id),
                          "valeur": v.market_value(world.players[player_id], world) if player_id in world.players else None,
                          "offres": v.incoming_offers(world, player_id)}
                        for player_id in incoming]
            listed = [{"joueur_id": player_id, "joueur": world.players[player_id].name, "poste": position(player_id), "indemnite": fee}
                      for player_id in world.transfer_list if (fee := listed_price(world, player_id)) is not None]
            club = world.clubs[club_id]
            def loan_row(player, other_id: int) -> dict:
                return {"joueur_id": player.id, "joueur": player.name, "club": v.club_ref(world, other_id), "fin": player.loan.end.iso()}
            lent = [loan_row(world.players[pid], world.players[pid].club_id) for pid in club.loaned_ids]
            taken = [loan_row(player, player.loan.parent_id) for pid in club.player_ids if (player := world.players[pid]).loan is not None]
            return {"sortantes": outgoing, "entrantes": entrantes, "liste": listed, "prets": lent, "emprunts": taken}

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
    def news_feed(page: int | None = Query(None, ge=1), message: int | None = None, taille: int = Query(NEWS_PAGE, ge=1, le=100)) -> dict:
        """A page of the feed, newest first: the one asked for, else the one showing `message`."""
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            return news.feed(world, page, message, taille)

    @api.get("/ma-partie/actualites/{message_id}")
    def news_message(message_id: int) -> dict:
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            if not 0 <= message_id < len(world.news): raise HTTPException(404, "Message introuvable.")
            return news.message(world, message_id)

    @api.post("/partie/actualites-lues")
    def mark_news_read(command: NewsRead) -> dict:
        # A reading flag only, outside the simulation: allowed while the auto mode runs, unlike `mutating`.
        with service.reading() as world:
            if world.controlled_club_id is None: raise HTTPException(400, "Aucun club sélectionné.")
            targets = world.news if command.ids is None else [world.news[index] for index in command.ids if 0 <= index < len(world.news)]
            for item in targets: item.read = True
            return {"unread": sum(not item.read for item in world.news), "news": news.summary(world)}

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
                         taille: int = page_size(50), tri: str | None = None, ordre: Literal['asc', 'desc'] = 'desc',
                         recherche: str = "", fenetre: Literal["ete", "hiver"] | None = None, nature: Literal["payant", "libre", "pret"] | None = None,
                         competition: int | None = None, poste: str | None = None, age_min: int = Query(0, ge=0), age_max: int = Query(100, le=100),
                         montant_min: int = Query(0, ge=0), club: int | None = None, pays: str = "", selectionnes: Literal["oui"] | None = None,
                         niveau_min: float = Query(0, ge=0, le=100), niveau_max: float = Query(100, ge=0, le=100),
                         potentiel_min: float = Query(0, ge=0, le=100), potentiel_max: float = Query(100, ge=0, le=100),
                         interesse: Literal["oui", "non"] | None = None) -> dict:
        from .club_history import MovementFilter, world_movements
        chosen = MovementFilter(v.normalized(recherche), fenetre, nature, competition, frozenset(name for name in (poste or "").split(",") if name),
                                age_min, age_max, montant_min, club, pays or None, selectionnes == "oui", niveau_min, niveau_max,
                                potentiel_min, potentiel_max, interesse)
        with service.reading() as world: return world_movements(world, saison, type, page, tri, ordre, taille, chosen)

    @api.get("/monde/transferts/resume")
    def transfers_summary(saison: int | None = None, type: Literal["transfer", "retirement", "academy"] = "transfer") -> dict:
        from .club_history import academy_summary, market_summary, retirement_summary
        summary = {"transfer": market_summary, "retirement": retirement_summary, "academy": academy_summary}[type]
        with service.reading() as world: return summary(world, saison)

    @api.get("/monde/palmares")
    def honours() -> dict:
        from .honours import honours as world_honours
        with service.reading() as world: return world_honours(world)

    @api.get("/recherche")
    def search(q: str = Query("", max_length=100), type: Literal["joueurs", "clubs", "competitions", "selections"] | None = None) -> dict:
        from .search import search as find
        with service.reading() as world: return find(world, q, type)

    @api.get("/competitions")
    def competitions() -> list[dict]:
        with service.reading() as world:
            return [{"id": item.id, "name": item.name, "nation": item.nation, "level": item.level,
                     "kind": item.kind, "code": item.code, "clubs": len(item.club_ids),
                     # A league's rounds are those of its calendar; a cup's are dated before they are drawn.
                     "rounds": max(len(item.round_dates), max((world.matches[mid].round_number for mid in item.match_ids if mid in world.matches), default=0)),
                     # What its header shows: its colours, the selection its flag leads to, its title this season.
                     **competition_colors(item.code, world.nation_names.get(item.nation)),
                     "nation_id": v.selection_id(world, item.nation), **v.title(world, item.id, world.season)}
                    for item in world.competitions.values()]

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
            seasons = {m.season for m in world.matches.values() if m.competition_id == cup.id}
            return {"id": cup.id, "name": cup.name, **v.season_steps(seasons, year, world.season), "rounds": rounds,
                    "latest_round": latest, **v.title(world, cup.id, year)}

    @api.get("/nations")
    def nations() -> dict[str, dict]:
        with service.reading() as world: return build_nation_table(world.nation_names)

    @api.get("/clubs")
    def clubs(competition: int | None = None, statut: Literal["actif", "dormant"] | None = None, pays: str = "",
              recherche: str = "", page: int = Query(1, ge=1), taille: int = page_size(), tri: ClubSort = "reputation",
              ordre: Literal["asc", "desc"] | None = None) -> dict:
        with service.reading() as world:
            rows = [club for club in world.clubs.values() if (competition is None or club.competition_id == competition)
                    and (statut is None or (club.competition_id is not None) == (statut == "actif"))
                    and (not pays or club.nation == pays) and v.normalized(recherche) in v.normalized(club.name)]
            # Both sorts are stable: ties keep the reputation order whichever the direction.
            rows.sort(key=lambda club: (-club.reputation, club.id))
            key = club_sort_key(world, tri)
            values = {club.id: key(club) for club in rows}
            descending = (ordre or ("asc" if tri in CLUB_ASCENDING_SORTS else "desc")) == "desc"
            # A club without the value (a dash, or no league) comes last whichever the order.
            rows = (sorted((club for club in rows if values[club.id] is not None), key=lambda club: values[club.id], reverse=descending)
                    + [club for club in rows if values[club.id] is None])
            result = v.paginate(rows, page, taille)
            standings, reserved = {}, v.reserved_budgets(world)
            result["items"] = [v.club_detail(world, item.id, standings, reserved) for item in result["items"]]
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
            return v.paginate(rows, page, SQUAD_PAGE)

    @api.get("/clubs/{club_id}/apercu")
    def club_overview(club_id: int) -> dict:
        from .club_overview import overview
        with service.reading() as world: return overview(world, club_id)

    @api.get("/clubs/{club_id}/calendrier")
    def club_calendar(club_id: int, saison: int | None = None) -> dict:
        from .club_overview import season_calendar
        with service.reading() as world: return season_calendar(world, club_id, saison)

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
            from .rounds import scorers
            data = v.paginate([{**v.match_row(world, match), "scorers": scorers(world, match)} for match in matches if match.round_number == selected], page)
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
    def history(competition_id: int, page: int = Query(1, ge=1), saison: int | None = None) -> dict:
        from .statistics import leaders, competition_leaders
        with service.reading() as world:
            competition, champions = world.competitions[competition_id], world.champions.get(competition_id, [])
            seasons = v.paginate([{"season": year, "champion": v.club_ref(world, winner), "nation": world.clubs[winner].nation if winner in world.clubs else None, "scorer": next(iter(leaders(world, competition_id, "buteurs", year)), None)}
                                  for year, winner in reversed(champions)], page)
            # The full table of one finished season of a league, the latest unless another is asked for, and the ones to step to.
            finished = [year for year, _ in champions]
            archive = None
            if finished and competition.kind == "league":
                steps = v.season_steps(finished, saison if saison in finished else finished[-1])
                archive = {**steps, "standings": v.table(world, competition_id, steps["season"])}
            return {**seasons, "archive": archive, "leaders": competition_leaders(world, competition_id)}

    @api.get("/joueurs")
    def players(recherche: str = "", poste: str | None = None, age_min: int = Query(0, ge=0), age_max: int = Query(100, le=100),
                niveau_min: float = Query(1, ge=1, le=100), niveau_max: float = Query(100, ge=1, le=100),
                potentiel_min: float = Query(1, ge=1, le=100), potentiel_max: float = Query(100, ge=1, le=100),
                nation: str | None = None, club: int | None = None,
                statut_club: Literal["actif", "dormant"] | None = None, contrat: Literal["libre", "sous_contrat"] | None = None,
                salaire_min: int = Query(0, ge=0), salaire_max: int | None = Query(None, ge=0),
                valeur_min: int = Query(0, ge=0), valeur_max: int | None = Query(None, ge=0), prix_max: int | None = Query(None, ge=0),
                interesse: Literal["oui", "non", "pret"] | None = None, liste: Literal["transfert", "pret"] | None = None,
                pretentions_max: int | None = Query(None, ge=0), page: int = Query(1, ge=1),
                taille: int = page_size(),
                tri: Literal["rating", "potential", "age", "name", "position", "wage", "contract_end", "fitness", "nation", "club", "value", "asking_price",
                             "wage_demand", "interested", "listed", "appearances", "goals", "assists", "average"] | AttributeSort | CompositeSort = "value",
                ordre: Literal["asc", "desc"] = "desc") -> dict:
        with service.reading() as world:
            selected = []
            search = v.normalized(recherche)
            # Several positions are listed with commas.
            positions = {name for name in (poste or "").split(",") if name}
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
            # Whether a club would let a player go, for good or on loan, and whether he would come on loan.
            flags = v.MarketFlags(world)
            def keen(player) -> bool:
                """The interest the filter asks about: in a loan, or in a transfer (`non`: not in a transfer)."""
                if interesse == "pret": return bool(flags.loan_interested(player))
                return v.interested(world, player) is (interesse == "oui")
            for player in world.players.values():
                wage = player.contract.weekly_wage if player.contract else 0
                owner = world.clubs.get(player.club_id)
                if (search not in v.normalized(player.name) or (positions and player.position not in positions)
                    or not age_min <= player.born.age_on(world.date) <= age_max
                    or not niveau_min <= player.rating <= niveau_max or not potentiel_min <= player.potential <= potentiel_max
                    or (nation and nation not in player.nationalities) or (club is not None and player.club_id != club)
                    or (statut_club and (owner is None or (owner.competition_id is not None) != (statut_club == "actif")))
                    or (contrat and (player.contract is None) != (contrat == "libre"))
                    or wage < salaire_min or (salaire_max is not None and wage > salaire_max)
                    or (valeur_min and v.market_value(player, world) < valeur_min)
                    or (valeur_max is not None and v.market_value(player, world) > valeur_max)
                    or (prix_max is not None and (fee(player) is None or fee(player) > prix_max))
                    or (recruiting and interesse and not keen(player))
                    or (liste == "transfert" and not flags.transfer_listed(player)) or (liste == "pret" and not flags.loan_listed(player))
                    or (recruiting and pretentions_max is not None and (demand(player) is None or demand(player) > pretentions_max))): continue
                selected.append(player)
            codes = build_nation_table(world.nation_names) if tri == 'nation' else {}
            def sort_key(player) -> tuple:
                if tri == 'value': return v.market_value(player, world), player.id
                if tri == 'nation': return codes.get(player.main_nation, {}).get("display_code", player.main_nation), player.id
                if tri == 'asking_price': return fee(player) or 0, player.id
                if tri == 'wage_demand': return demand(player) or 0, player.id
                if tri == 'interested': return bool(v.interested(world, player)) + bool(flags.loan_interested(player)), player.id
                if tri == 'listed': return flags.transfer_listed(player) + flags.loan_listed(player), player.id
                if tri in ATTRIBUTE_INDEX: return player.attributes.get(tri), player.id
                if tri in v.COMPOSITES: return v.composite(player, tri, world.config), player.id
                value ={"rating": player.rating, "potential": player.potential, "age": player.born.age_on(world.date), "name": v.normalized(player.name),
                         "position": position_rank(player.position), "wage": player.contract.weekly_wage if player.contract else 0,
                         "contract_end": player.contract.end.iso() if player.contract else "", "fitness": player.fitness,
                         "club": world.clubs[player.club_id].name if player.club_id else "",
                         "appearances": player.appearances, "goals": player.season_goals, "assists": player.season_assists,
                         "average": player.rating_sum / player.rating_count if player.rating_count else 0}[tri]
                return value, player.id
            selected.sort(key=sort_key, reverse=ordre == "desc")
            # Players their clubs will not sell have no price: they come last whichever the order.
            if tri == 'asking_price': selected.sort(key=lambda player: fee(player) is None)
            # So do the human club's own players, who have nothing to ask or to accept.
            if tri == 'wage_demand': selected.sort(key=lambda player: demand(player) is None)
            if tri == 'interested': selected.sort(key=lambda player: v.interested(world, player) is None)
            data = v.paginate(selected, page, taille)
            data["items"] = [{**v.player_row(world, player), **quote(player), **flags.row(player),
                              "interested": v.interested(world, player), "wage_demand": demand(player)} for player in data["items"]]
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
