"""Where "Continuer" stops for the human club: the match days its manager follows, a few key dates, and the news that cannot wait."""
from __future__ import annotations

from core.domain.date import Date
from core.domain.world import World
from .europe import association

# Even with nothing to follow (summer, a winter break), a step never covers more than a week.
STEP_DAYS = 7
# News asking for a decision: stepping over it could let an offer or a negotiation lapse unseen.
ATTENTION = frozenset({"offer_received", "talks_open", "renewal_proposed"})


def european_cup(world: World) -> int | None:
    """The European cup the human club plays this season, or the Champions League when it plays none."""
    cups = sorted((c for c in world.competitions.values() if c.kind == "europe"), key=lambda c: c.code)
    return next((c.id for c in cups if world.controlled_club_id in c.club_ids), cups[0].id if cups else None)


def followed_competitions(world: World) -> set[int]:
    """The club's own division, its country's cup and every European cup: their match days are stops."""
    if world.controlled_club_id is None:
        return set()
    club = world.clubs[world.controlled_club_id]
    nation = association(world, club.id)
    followed = {c.id for c in world.competitions.values() if c.kind == "europe" or (c.kind == "cup" and c.nation == nation)}
    if club.competition_id in world.competitions:
        followed.add(club.competition_id)
    return followed


def day_results(world: World) -> tuple[str, int] | None:
    """What the day just played gives to see: ("club", competition id), ("international", edition year), or None.

    The European cups share their dates: the day shows the one the human club plays."""
    followed = followed_competitions(world)
    played = min((m.competition_id for m in world.matches.values()
                  if m.date == world.date and m.result is not None and m.competition_id in followed), default=None)
    if played is not None:
        return "club", european_cup(world) if world.competitions[played].kind == "europe" else played
    # An international match keeps its edition's year as its season.
    edition = min((m.season for m in world.international.matches.values() if m.date == world.date and m.result is not None), default=None)
    return None if edition is None else ("international", edition)


def key_date(world: World, day: Date) -> bool:
    """The opening of a season (budgets, promotions, fixtures) and the last day to act before a transfer window closes."""
    review = world.config.world.key_dates.population_review
    if (day.month, day.day) == (review.month, review.day):
        return True
    tomorrow = day.add_days(1)
    market = world.config.world.market
    return any((tomorrow.month, tomorrow.day) == (window.end_month, window.end_day) for window in (market.summer, market.winter))


def needs_attention(world: World, news_from: int) -> bool:
    return any(item.kind in ATTENTION for item in world.news[news_from:])


def step_over(world: World, start: Date, news_from: int) -> bool:
    """Whether the step started on `start` ends with the day just played; `news_from` is the length of the feed at the start."""
    return (day_results(world) is not None or needs_attention(world, news_from) or key_date(world, world.date)
            or world.date.ordinal() - start.ordinal() >= STEP_DAYS)


def step_target(world: World) -> Date:
    """Where the next step is expected to end, for its progress bar: the next day already known to stop it.

    News and fixtures drawn on the way can still end it sooner."""
    followed = followed_competitions(world)
    known = {m.date for m in world.matches.values() if m.result is None and m.competition_id in followed}
    known.update(day for cid in followed for day in world.competitions[cid].round_dates)
    known.update(m.date for m in world.international.matches.values() if m.result is None)
    for offset in range(1, STEP_DAYS):
        day = world.date.add_days(offset)
        if day in known or key_date(world, day):
            return day
    return world.date.add_days(STEP_DAYS)
