"""The human club's match played live, between the day's other matches and the end of the day.

No I/O: the service keeps the rebuilt `LiveMatch` in memory; the world only records the lineup
and the orders, which rebuild it exactly since the match draws from its own stream."""
from dataclasses import replace

from core.ai.controller import AIController
from core.ai.human import HumanController
from core.domain.matches import LiveMatchRecord, LiveOrder, Match, MatchEvent
from core.domain.world import World
from core.engine.live import LiveMatch
from .simulation import close_day, match_lineups, match_stream, settle_match, simulate_matches


def live_side(world: World, match: Match) -> int:
    return 0 if match.home_id == world.controlled_club_id else 1


def start_live_match(world: World) -> LiveMatch:
    """Plays every other match of the day, then opens the human club's match for live play."""
    if world.live_match is not None:
        raise ValueError("Un match est déjà en cours.")
    match = next((match for match in world.matches.values() if match.date == world.date and match.result is None
                  and match.id in world.submitted_lineups), None)
    if world.pending_match_day is None or match is None:
        raise ValueError("Aucun match à jouer en direct aujourd'hui.")
    simulate_matches(world, exclude=match.id)
    world.live_match = LiveMatchRecord(match.id, world.submitted_lineups[match.id])
    return build_live_match(world)


def build_live_match(world: World, second: float | None = None) -> LiveMatch:
    """Rebuilds the match from kick-off, replaying each recorded order where it was given.

    Without `second`, stops where the viewer had got to; with it, at the first possession boundary
    reaching that clock, never before the last segment shown in full nor beyond the one handed out."""
    record = world.live_match
    match = world.matches[record.match_id]
    cfg, rng = world.config, match_stream(world, match)
    lineups, _ = match_lineups(world, match)
    side = live_side(world, match)
    controllers = [AIController(cfg, rng), AIController(cfg, rng)]
    controllers[side] = HumanController(cfg)
    live = LiveMatch(*lineups, cfg, rng, neutral=match.neutral, controllers=tuple(controllers))
    pending = list(record.orders)
    while not live.finished:
        batch = [order for order in pending if (order.possession, order.halftime) == live.order_point]
        if batch:
            live.apply_orders(side, batch)
            pending = pending[len(batch):]
        possession = live.log.possession
        if second is None:
            done = possession >= record.reached
        else:
            done = possession >= record.floor and (live.log.second >= second or possession >= record.reached)
        if done and not pending:
            break
        live.step()
    live.delivered = len(live.log.events)
    return live


def next_segment(world: World, live: LiveMatch) -> list[MatchEvent]:
    record = world.live_match
    record.floor = record.reached
    events = live.advance_segment()
    record.reached = live.log.possession
    return events


def give_orders(world: World, live: LiveMatch, orders: list[LiveOrder], second: float | None = None) -> LiveMatch:
    """Applies the human club's orders where the viewer stopped the match: at the end of what was handed
    out, or back at `second` when the clock was stopped between two chances. ValueError leaves the world
    untouched, but `live` may then be inconsistent: the caller rebuilds it."""
    record = world.live_match
    if second is not None:
        live = build_live_match(world, second)
    possession, halftime = live.order_point
    orders = [replace(order, possession=possession, halftime=halftime) for order in orders]
    live.apply_orders(live_side(world, world.matches[record.match_id]), orders)
    record.orders.extend(orders)
    record.reached = record.floor = live.log.possession
    return live


def play_to_end(world: World, live: LiveMatch) -> list[MatchEvent]:
    """« Fin du match » : the AI takes the rest of the match over."""
    record = world.live_match
    if not live.finished:
        live = give_orders(world, live, [LiveOrder(0, False, "auto")])
        while not live.finished:
            live.step()
    record.floor, record.reached = record.reached, live.log.possession
    return live.undelivered()


def finish_live_match(world: World, live: LiveMatch) -> None:
    """Applies the final result, then closes the day."""
    if not live.finished:
        raise ValueError("Le match n'est pas terminé.")
    match = world.matches[world.live_match.match_id]
    _, temporary = match_lineups(world, match)
    settle_match(world, match, live.result(), [live.home, live.away], temporary)
    world.live_match = None
    close_day(world)
