"""The human club's live match: its state, segments, orders and the other matches of the day."""
from __future__ import annotations

from dataclasses import asdict
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from core.domain.matches import LiveOrder, MatchEvent, stored_events
from core.domain.world import World
from core.engine.live import LiveMatch
from core.engine.results import player_rating
from core.world.calendar import standings
from core.world.live import give_orders, live_side, next_segment, play_to_end
from . import views as v
from .routes import Command

ORDER_KINDS = {"remplacement": "substitution", "placement": "reposition", "mentalite": "mentality"}


class OrderInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["remplacement", "placement", "mentalite"]
    sortant: int | None = None
    entrant: int | None = None
    poste: str = ""
    placement: list[tuple[int, str]] = []
    mentalite: str = ""

    def order(self) -> LiveOrder:
        return LiveOrder(0, False, ORDER_KINDS[self.type], self.sortant, self.entrant, self.poste,
                         tuple((pid, position) for pid, position in self.placement), self.mentalite)


class LiveOrders(Command):
    # The clock where the viewer stopped between two chances; None at the end of what was shown.
    seconde: float | None = None
    ordres: list[OrderInput]


class LiveAdvance(Command):
    jusqu_a: Literal["evenement", "fin"] = "evenement"


def live_view(world: World, live: LiveMatch, events: list[MatchEvent] | None = None) -> dict:
    """What the live screen shows. Without `events`, the whole match so far (to open or reopen the screen)."""
    match = world.matches[world.live_match.match_id]
    side = live_side(world, match)
    names = {pid: player.name for team in live.teams for pid, player in team.players.items()}

    def event_row(event: MatchEvent) -> dict:
        return {**asdict(event), "player": names.get(event.player_id), "secondary": names.get(event.secondary_id),
                "temporary": (event.player_id or 0) < 0, "secondary_temporary": (event.secondary_id or 0) < 0}

    def lineup(initial) -> list[dict]:
        return [{"id": slot.player.id, "name": slot.player.name, "position": slot.position.value, "temporary": slot.player.id < 0}
                for slot in initial.slots]

    def bench(initial) -> list[dict]:
        return [{"id": player.id, "name": player.name, "temporary": player.id < 0} for player in initial.bench]

    shown = stored_events(live.log.events[:live.delivered]) if events is None else events
    team = live.teams[side]
    decision = next(({"kind": event.kind, "player_id": event.player_id, "player": names.get(event.player_id)}
                     for event in reversed(events or []) if event.kind in ("injury", "red") and event.team_id == team.club_id), None)
    return {**v.match_row(world, match), "side": ("home", "away")[side], "status": live.status,
            "second": round(live.log.second), "period": live.log.period,
            "score": [live.teams[0].goals, live.teams[1].goals], "decision": decision,
            "result": {"events": [event_row(event) for event in shown], "duration": round(live.log.second),
                       "home_stats": asdict(live.teams[0].stats), "away_stats": asdict(live.teams[1].stats),
                       "home_lineup": lineup(live.home), "away_lineup": lineup(live.away),
                       "home_bench": bench(live.home), "away_bench": bench(live.away)},
            "manager": manager_view(world, live, side)}


def manager_view(world: World, live: LiveMatch, side: int) -> dict:
    """The human side as the Tactique panel edits it."""
    cfg, team = world.config, live.teams[side]
    rules = cfg.world.match_rules
    replaced = {event.player_id for event in live.log.events if event.kind == "substitution" and event.team_id == team.club_id}
    vacancies = [pid for pid in sorted(team.injured) if pid not in replaced][:max(0, live.vacancies(team))]
    return {"active": [{"id": slot.player.id, "name": slot.player.name, "position": slot.position.value,
                        "natural": slot.player.position.value, "fitness": round(team.fitness[slot.player.id], 3), "yellows": team.individual[slot.player.id].yellows}
                       for slot in team.active],
            "bench": [{"id": player.id, "name": player.name, "position": player.position.value,
                       "fitness": round(team.fitness[player.id], 3)} for player in team.bench],
            "vacancies": [{"id": pid, "name": team.players[pid].name, "position": team.players[pid].position.value} for pid in vacancies],
            "substitutions_left": rules.max_substitutions - team.substituted,
            "windows_left": rules.substitution_windows - team.windows,
            "squad": squad_strip(live, side),
            "mentality": team.mentality, "mentalities": list(cfg.formations.block_height.mentalities),
            "formations": {name: list(roles) for name, roles in cfg.formations.formations.items()}}


def squad_strip(live: LiveMatch, side: int) -> list[dict]:
    """Every player of the human side's sheet, starters then substitutes, as the match leaves them now."""
    team, initial = live.teams[side], (live.home, live.away)[side]
    playing = {slot.player.id for slot in team.active}
    waiting = {player.id for player in team.bench}

    def row(player, starter: bool) -> dict:
        stats = team.individual.get(player.id)
        played = stats is not None and player.id not in waiting
        return {"id": player.id, "name": player.name, "position": player.position.value, "starter": starter,
                "state": "on" if player.id in playing else "bench" if player.id in waiting else "off",
                "fitness": round(team.fitness.get(player.id, player.fitness), 3),
                "rating": round(player_rating(team, live.teams[1 - side], player.id, live.cfg), 1) if played else None,
                "goals": stats.goals if stats else 0, "yellows": stats.yellows if stats else 0,
                "red": bool(stats and stats.red), "injured": player.id in team.injured}
    return [row(slot.player, True) for slot in initial.slots] + [row(player, False) for player in initial.bench]


def multiplex(world: World) -> dict:
    """The other matches of the competition that day, revealed along the live clock, and the table before it."""
    cfg = world.config
    match = world.matches[world.live_match.match_id]
    competition = world.competitions[match.competition_id]
    others = sorted((other for other in world.matches.values() if other.date == match.date
                     and other.competition_id == competition.id and other.id != match.id), key=lambda other: other.id)
    games = [{"id": other.id, "home": v.club_ref(world, other.home_id), "away": v.club_ref(world, other.away_id),
              "final": [other.result.home_goals, other.result.away_goals] if other.result else None,
              "goals": [{"second": event.second, "club_id": event.team_id} for event in other.result.events
                        if event.kind == "goal" and event.period in (1, 2)] if other.result else []}
             for other in others]
    table = None
    if competition.kind == "league":
        # The season's own fixtures: world.matches also keeps past seasons, with clubs since relegated.
        before = [other for other in map(world.matches.__getitem__, competition.match_ids)
                  if other.result is not None and other.date < match.date]
        table = [{"club": v.club_ref(world, row.club_id), "played": row.played, "won": row.won, "drawn": row.drawn,
                  "lost": row.lost, "goals_for": row.goals_for, "goals_against": row.goals_against, "points": row.points}
                 for row in standings(competition, before, cfg)]
    return {"competition": competition.name, "matches": games, "table": table,
            "points": {"win": cfg.world.season.win_points, "draw": cfg.world.season.draw_points}}


def live_router(service) -> APIRouter:
    api = APIRouter(prefix="/direct")

    @api.post("/demarrer", status_code=202)
    def start(command: Command) -> dict:
        return service.submit("live_start", command.commande_id, {})

    @api.get("")
    def state() -> dict:
        with service.reading() as world:
            return live_view(world, service.live_match(world))

    @api.post("/avancer")
    def advance(command: LiveAdvance) -> dict:
        with service.mutating() as world:
            live = service.live_match(world)
            if live.finished: raise HTTPException(400, "Le match est terminé.")
            events = next_segment(world, live) if command.jusqu_a == "evenement" else play_to_end(world, live)
            return live_view(world, live, events)

    @api.post("/ordres")
    def orders(command: LiveOrders) -> dict:
        with service.mutating() as world:
            try:
                live = give_orders(world, service.live_match(world), [item.order() for item in command.ordres], command.seconde)
            except ValueError as error:
                service.live = None  # a refused order may have half-changed the match: rebuild it from its record
                raise HTTPException(400, str(error))
            service.live = live
            # The screen resyncs on this view: the whole match so far, the orders' own events included.
            live.undelivered()
            return live_view(world, live)

    @api.get("/multiplex")
    def others() -> dict:
        with service.reading() as world:
            if world.live_match is None: raise HTTPException(404, "Aucun match en cours.")
            return multiplex(world)

    @api.post("/terminer", status_code=202)
    def finish(command: Command) -> dict:
        with service.reading() as world:
            if not service.live_match(world).finished: raise HTTPException(400, "Le match n'est pas terminé.")
        return service.submit("live_finish", command.commande_id, {})

    return api
