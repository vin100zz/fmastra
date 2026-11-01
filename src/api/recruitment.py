"""The Recrutement screen: what the human club's recruitment cell recommends, position by position; read-only projection.

The leads come from `core.world.recruitment`; this view sets them in the order of the lists (`POSITION_ORDER`), with what the
screens show of each player, the club's budgets as its Finances tab gives them, its squad against the limit and the window.
Working the leads out weighs some hundreds of players: the view is kept until the day, the squad, the offers or the budgets
change.
"""
from __future__ import annotations

from collections import OrderedDict

from core.domain.date import Date
from core.domain.world import World
from core.world.market import quoted_minimum
from core.world.recruitment import recruitment as leads_of
from core.world.talks import window_end
from . import views as v

PRESENT, FUTURE = "present", "avenir"
_cache: OrderedDict = OrderedDict()
_KEPT = 4


def _key(world: World, mode: str, free_agents: bool) -> tuple:
    club = world.clubs[world.controlled_club_id]
    offers = tuple(sorted((offer.key, offer.stage, offer.fee) for offer in world.offers.values() if club.id in (offer.target_id, offer.source_id)))
    return (id(world), world.seed, world.date.iso(), club.id, mode, free_agents, tuple(club.player_ids), offers,
            club.transfer_budget, club.wage_cap, club.wage_bill, club.balance, tuple(sorted(world.talks_closed.items(), key=lambda row: row[0])))


def next_opening(world: World) -> Date:
    """The first day of the next transfer window."""
    market = world.config.world.market
    starts = sorted((window.start_month, window.start_day) for window in (market.summer, market.winter))
    today = (world.date.month, world.date.day)
    month, day = next((start for start in starts if start > today), starts[0])
    return Date(world.date.year + (0 if (month, day) > today else 1), month, day)


def recruitment(world: World, mode: str = PRESENT, free_agents: bool = False) -> dict:
    key = _key(world, mode, free_agents)
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    view = _project(world, mode, free_agents)
    _cache[key] = view
    while len(_cache) > _KEPT: _cache.popitem(last=False)
    return view


def _project(world: World, mode: str, free_agents: bool) -> dict:
    cfg = world.config
    club = world.clubs[world.controlled_club_id]
    found = leads_of(world, mode == FUTURE, free_agents)
    full = cfg.management.market.offers.full_need_gain
    finances = v.finance_summary(world, club.id)

    def person(player_id: int | None) -> dict | None:
        if player_id is None: return None
        row = v.player_row(world, world.players[player_id])
        return {key: row[key] for key in ("id", "name", "position", "age", "nation", "stars", "estimate", "value", "club", "wage",
                                          "contract_end", "expiring", "expiring_soon")}

    def lead(item) -> dict:
        row = person(item.player_id)
        replaced = world.players.get(item.replaces) if item.replaces is not None else None
        return {**row, "asking_price": quoted_minimum(item.fee) if item.fee else None, "wage_demand": item.wage,
                # What a lead brings today, on the scale of the need: a full bar is the gain an AI club needs most.
                "contribution": round(min(1.0, item.score / full), 3) if mode == PRESENT else None,
                "place": item.place, "replaces": {"id": replaced.id, "name": replaced.name} if replaced else None}

    positions = sorted(found.positions, key=lambda item: v.position_rank(item.position.value))
    closes = window_end(world)
    return {"mode": mode, "free_agents": free_agents,
            "finances": {name: finances[name] for name in ("transfer_budget", "reserved_transfer_budget", "wage_bill", "wage_cap", "reserved_wages")},
            "squad": {"size": len(club.player_ids), "max": cfg.management.guardrails.max_squad},
            "window": {"closes": closes.iso() if closes else None, "opens": None if closes else next_opening(world).iso()},
            "positions": [{"position": item.position.value, "need": round(max(0.0, min(1.0, item.need / full)), 3),
                           "holder": person(item.holder_id), "leads": [lead(row) for row in item.leads]} for item in positions],
            # The players to let go, as every list of players shows them.
            "surplus": [v.player_row(world, world.players[player_id]) for player_id in found.surplus]}
