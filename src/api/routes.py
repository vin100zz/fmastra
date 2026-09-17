"""Screen-oriented, paginated endpoints for the observer interface."""
from __future__ import annotations

from dataclasses import asdict
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from core.domain.date import Date
from core.world.simulation import target_date, market_window
from .service import GameService
from . import views as v
from .nations import build_nation_table


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")
    commande_id: str = Field(default_factory=lambda: uuid4().hex, min_length=1, max_length=100)


class Advance(Command):
    jusqu_a: Literal["jour", "journee", "fin_mercato"]


class Slot(Command):
    slot: str = Field(pattern=r"^[\w-]{1,64}$")


class NewGame(Command):
    graine: int = Field(default=2025, ge=0, le=2**63 - 1, strict=True)


POSITION_ORDER = ["GB", "DL", "DR", "DC", "MDC", "MC", "MOC", "AILG", "AILD", "BU"]


def position_rank(position: str) -> int:
    return POSITION_ORDER.index(position) if position in POSITION_ORDER else len(POSITION_ORDER)


def router(service: GameService) -> APIRouter:
    api = APIRouter(prefix="/api")

    @api.get("/monde/etat")
    def state() -> dict:
        with service.lock:
            world = service.world
            data = {"exists": world is not None, "job": service.active, "recovery_required": service.recovery_required}
            if world and not service.recovery_required:
                data.update({"date": world.date.iso(), "season": world.season, "seed": world.seed,
                             "next_match": target_date(world, "journee").iso(), "market": market_window(world),
                             "players": len(world.players), "active_clubs": len(world.active_clubs()),
                             "played": sum(match.result is not None and match.season == world.season for match in world.matches.values()),
                             "fixtures": sum(match.season == world.season for match in world.matches.values())})
            return data

    @api.post("/monde/avancer", status_code=202)
    def advance(command: Advance) -> dict:
        return service.submit("advance", command.commande_id, {"until": command.jusqu_a})

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

    @api.get("/partie/rapport-import")
    def import_report() -> dict:
        with service.reading() as world:
            return {"counts": world.import_summary, "source_hashes": world.source_hashes,
                    "max_squad": world.config.management.guardrails.max_squad,
                    "estimated": True}

    @api.get("/monde/journal")
    def journal(date: str | None = None, page: int = Query(1, ge=1)) -> dict:
        with service.reading() as world:
            selected = Date.parse(date) if date else world.date
            rows = [{"date": item.date.iso(), "kind": item.kind, "text": item.text, "club_id": item.club_id,
                     "player_id": item.player_id, "match_id": item.match_id} for item in reversed(world.journal) if item.date == selected]
            return v.paginate(rows, page)

    @api.get("/monde/transferts")
    def global_transfers(saison: int | None = None, type: Literal["transfer", "retirement", "academy"] = "transfer", page: int = Query(1, ge=1),
                         tri: str | None = None, ordre: Literal['asc', 'desc'] = 'desc') -> dict:
        from .club_history import world_movements
        with service.reading() as world: return world_movements(world, saison, type, page, tri, ordre)

    @api.get("/competitions")
    def competitions() -> list[dict]:
        with service.reading() as world:
            return [{"id": item.id, "name": item.name, "nation": item.nation, "clubs": len(item.club_ids)} for item in world.competitions.values()]

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

    @api.get("/clubs/{club_id}/effectif")
    def squad(club_id: int, page: int = Query(1, ge=1), tri: Literal["rating", "age", "name", "position", "wage", "contract_end", "fitness", "nation", "value", "appearances", "minutes", "goals", "assists", "yellows", "reds", "average"] = "position",
              ordre: Literal["asc", "desc"] = "asc") -> dict:
        with service.reading() as world:
            rows = v.squad_rows(world, club_id)
            rows.sort(key=lambda row: (position_rank(row["position"]) if tri == "position" else (row[tri] or "" if tri == "contract_end" else row[tri]), row["id"]), reverse=ordre == "desc")
            return v.paginate(rows, page)

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
            club = world.clubs[club_id]
            data = {name: getattr(club, name) for name in ("balance", "income", "transfer_budget", "wage_bill", "wage_cap", "season_spent", "season_sales")}
            data["reserved_transfer_budget"] = sum(offer.ceiling for offer in world.offers.values() if offer.target_id == club_id)
            data["reserved_wages"] = sum(offer.contract.weekly_wage for offer in world.offers.values() if offer.target_id == club_id)
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
        with service.reading() as world:
            world.clubs[club_id]
            rows = []
            seasons = {(match.season, match.competition_id) for match in world.matches.values()
                       if match.season < world.season and club_id in (match.home_id, match.away_id)}
            for year, competition_id in sorted(seasons, reverse=True):
                positions = v.table(world, competition_id, year)
                rank = next(row["rank"] for row in positions if row["club_id"] == club_id)
                rows.append({"season": year, "rank": rank, "champion": rank == 1,
                             "competition_id": competition_id, "competition": world.competitions[competition_id].name,
                             "standings": positions})
            return v.paginate(rows, page)

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
    def statistics(competition_id: int, type: Literal["buteurs", "passeurs", "notes", "cartons", "clean_sheets"] = "buteurs", page: int = Query(1, ge=1)) -> dict:
        from .statistics import leaders
        with service.reading() as world: return v.paginate(leaders(world, competition_id, type), page)

    @api.get("/competitions/{competition_id}/historique")
    def history(competition_id: int, page: int = Query(1, ge=1)) -> dict:
        from .statistics import leaders
        with service.reading() as world:
            world.competitions[competition_id]
            return v.paginate([{"season": year, "champion": v.club_ref(world, winner), "scorer": next(iter(leaders(world, competition_id, "buteurs", year)), None),
                                "standings": v.table(world, competition_id, year)}
                               for year, winner in reversed(world.champions.get(competition_id, []))], page)

    @api.get("/joueurs")
    def players(recherche: str = "", poste: str | None = None, age_min: int = Query(0, ge=0), age_max: int = Query(100, le=100),
                niveau_min: float = Query(1, ge=1, le=100), nation: str | None = None, club: int | None = None,
                statut_club: Literal["actif", "dormant"] | None = None, contrat: Literal["libre", "sous_contrat"] | None = None,
                salaire_min: int = Query(0, ge=0), salaire_max: int | None = Query(None, ge=0),
                page: int = Query(1, ge=1), tri: Literal["rating", "age", "name", "position", "wage", "contract_end", "fitness", "nation", "club", "value"] = "value",
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
                    or wage < salaire_min or (salaire_max is not None and wage > salaire_max)): continue
                selected.append(player)
            def sort_key(player) -> tuple:
                if tri == 'value': return v.market_value(player, world), player.id
                value = {"rating": player.rating, "age": player.born.age_on(world.date), "name": v.normalized(player.name),
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
            if player_id in world.retired: return {"id": player_id, "name": world.retired[player_id], "retired": True}
            return v.player_detail(world, world.players[player_id])

    @api.get("/joueurs/{player_id}/historique")
    def player_history(player_id: int, page: int = Query(1, ge=1)) -> dict:
        with service.reading() as world:
            if player_id not in world.players and player_id not in world.retired: raise KeyError(player_id)
            return {"career": v.career(world, player_id),
                    "trajectory": v.paginate([{"season": year, "rating": rating} for year, rating in reversed(world.trajectories.get(player_id, []))], page)}

    @api.get("/matches/{match_id}")
    def match(match_id: int) -> dict:
        with service.reading() as world: return v.match_detail(world, world.matches[match_id])

    return api
