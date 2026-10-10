"""One deterministic approach opportunity per dormant club and transfer window."""
from functools import lru_cache
from core.domain.date import Date
from core.domain.world import World
from core.domain.clubs import Club
from core.randomness import stream
from .market import wage_room


@lru_cache(maxsize=100000)
def approach_day(seed: int, club_id: int, start: Date, end: Date, probability: float, purpose: str = "external_approach") -> Date | None:
    """The one day of a window a club acts on `purpose`, if it does at all: drawn once, the same whenever it is asked."""
    rng = stream(seed, purpose, club_id, start.iso())
    if rng.random() >= probability: return None
    return start.add_days(rng.randrange(end.ordinal() - start.ordinal() + 1))


def open_window(world: World) -> tuple[Date, Date] | None:
    """The first and last day of the transfer window open today."""
    for name in ("summer", "winter"):
        window = getattr(world.config.world.market, name)
        start = Date(world.date.year, window.start_month, window.start_day)
        end = Date(world.date.year, window.end_month, window.end_day)
        if start <= world.date <= end: return start, end
    return None


def approaching_clubs(world: World) -> list[Club]:
    cfg = world.config
    window = open_window(world)
    if window is None: return []
    start, end = window
    return [club for club in world.clubs.values() if club.competition_id is None
            and club.squad_size < cfg.management.guardrails.max_squad
            and wage_room(club, cfg, 1) >= cfg.management.budgets.wages.weekly_minimum
            and approach_day(world.seed, club.id, start, end, cfg.management.market.dormant_clubs.approach_probability) == world.date]
