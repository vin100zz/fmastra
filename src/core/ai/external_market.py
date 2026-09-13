"""One deterministic approach opportunity per dormant club and transfer window."""
from functools import lru_cache
from core.domain.date import Date
from core.domain.world import World
from core.domain.clubs import Club
from core.randomness import stream


@lru_cache(maxsize=100000)
def approach_day(seed: int, club_id: int, start: Date, end: Date, probability: float) -> Date | None:
    rng = stream(seed, "external_approach", club_id, start.iso())
    if rng.random() >= probability: return None
    return start.add_days(rng.randrange(end.ordinal() - start.ordinal() + 1))


def approaching_clubs(world: World) -> list[Club]:
    cfg = world.config
    for name in ("summer", "winter"):
        window = getattr(cfg.world.market, name)
        start = Date(world.date.year, window.start_month, window.start_day)
        end = Date(world.date.year, window.end_month, window.end_day)
        if start <= world.date <= end: break
    else: return []
    return [club for club in world.clubs.values() if club.competition_id is None
            and len(club.player_ids) < cfg.management.guardrails.max_squad
            and club.wage_cap - club.wage_bill >= cfg.management.budgets.wages.weekly_minimum
            and approach_day(world.seed, club.id, start, end, cfg.management.market.dormant_clubs.approach_probability) == world.date]
