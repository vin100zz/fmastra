"""Structural checks for the continental league and two-leg knockout ties."""
from collections import Counter

from core.domain.clubs import Competition
from core.domain.world import World
from core.domain.matches import Match
from .calendar import standings
from .europe import aggregate_score, association


def validate_europe(world: World, cup: Competition) -> None:
    rules = world.config.world.europe
    ids = cup.club_ids
    if len(ids) != rules.club_count or len(set(ids)) != rules.club_count:
        raise ValueError("European competition requires 36 distinct clubs")
    if any(cid not in world.clubs or world.clubs[cid].is_reserve for cid in ids):
        raise ValueError("Invalid European participant")
    if len(cup.round_dates) != len(rules.dates) or cup.round_dates != sorted(set(cup.round_dates)):
        raise ValueError("Invalid European dates")
    matches = [world.matches[mid] for mid in cup.match_ids]
    league = [m for m in matches if m.round_number <= rules.league_rounds]
    pairs = {frozenset((m.home_id, m.away_id)) for m in league}
    if len(league) != rules.club_count * rules.league_rounds // 2 or len(pairs) != len(league):
        raise ValueError("Invalid European league schedule")
    homes = Counter(m.home_id for m in league)
    if any(homes[cid] != rules.league_rounds // 2 for cid in ids):
        raise ValueError("Unbalanced European home fixtures")
    if any(association(world, m.home_id) == association(world, m.away_id) for m in league):
        raise ValueError("Domestic opponents in European league phase")
    for number in range(1, len(cup.round_dates) + 1):
        fixtures = [m for m in matches if m.round_number == number]
        if not fixtures:
            if any(m.round_number > number for m in matches):
                raise ValueError("Missing European round")
            continue
        participants = [cid for m in fixtures for cid in (m.home_id, m.away_id)]
        if len(participants) != len(set(participants)) or not set(participants) <= set(ids):
            raise ValueError("Invalid European round participants")
        if any(m.date != cup.round_dates[number - 1] or m.neutral != (number == len(cup.round_dates)) for m in fixtures):
            raise ValueError("Invalid European fixture date or venue")
        if number <= rules.league_rounds:
            if set(participants) != set(ids):
                raise ValueError("Missing European league participant")
        else:
            stage = (number - rules.league_rounds - 1) // 2
            expected_count = (rules.playoff_places // 2 if stage < 2 else rules.direct_places // 2 ** (stage - 1))
            if len(fixtures) != expected_count:
                raise ValueError("Incorrect number of European knockout ties")
            if (number - rules.league_rounds) % 2 == 0:
                if any(m.first_leg_id is None for m in fixtures):
                    raise ValueError("European return leg without its first leg")
            else:
                if any(m.first_leg_id is not None for m in fixtures):
                    raise ValueError("Unexpected first-leg reference")
                ranked = [r.club_id for r in standings(cup, league, world.config)]
                if stage == 0:
                    seeds = set(ranked[rules.direct_places:rules.direct_places + rules.playoff_places // 2])
                    expected = set(ranked[rules.direct_places:rules.direct_places + rules.playoff_places])
                else:
                    previous = [m for m in matches if m.round_number == number - 1]
                    if any(m.result is None for m in previous):
                        raise ValueError("European draw before previous round completion")
                    expected = {m.result.winner_id for m in previous}
                    seeds = set(ranked[:rules.direct_places]) if stage == 1 else set()
                    expected |= seeds
                if set(participants) != expected or (seeds and {m.away_id for m in fixtures} != seeds):
                    raise ValueError("European draw does not respect qualifiers or seeding")


def validate_european_result(world: World, match: Match) -> None:
    result = match.result
    if match.first_leg_id is not None:
        first = world.matches.get(match.first_leg_id)
        if (first is None or first.competition_id != match.competition_id or first.season != match.season
                or first.round_number != match.round_number - 1
                or (first.home_id, first.away_id) != (match.away_id, match.home_id)):
            raise ValueError("Mismatched European legs")
    if result is None:
        return
    deciding = match.neutral or match.first_leg_id is not None
    if not deciding:
        if result.winner_id is not None or result.penalties:
            raise ValueError("League match or first leg cannot decide qualification")
        return
    home, away = aggregate_score(world, match) or (result.home_goals, result.away_goals)
    if result.winner_id not in (match.home_id, match.away_id):
        raise ValueError("European knockout tie has no winner")
    if home != away:
        if result.penalties or result.winner_id != (match.home_id if home > away else match.away_id):
            raise ValueError("European aggregate winner mismatch")
    elif result.penalties:
        ph, pa = result.penalties
        if min(ph, pa) < 0 or ph == pa or result.winner_id != (match.home_id if ph > pa else match.away_id):
            raise ValueError("Invalid European shootout")
    elif result.status != "double_forfeit":
        raise ValueError("Tied European aggregate without shootout")
