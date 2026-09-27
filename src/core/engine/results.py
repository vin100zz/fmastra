"""Build detailed results and a consistent event-based rating ledger."""
from core.config.model import Config
from core.domain.matches import Lineup, MatchResult
from core.math import clamp
from .local_state import TeamState, MatchLog


def assemble(home: TeamState, away: TeamState, initial_home: Lineup, initial_away: Lineup,
             log: MatchLog, cfg: Config, status: str = "played") -> MatchResult:
    rules = cfg.engine.player_ratings
    for team in (home, away):
        for pid, stats in team.individual.items():
            if stats.minutes < rules.min_rating_minutes and not (stats.goals or stats.assists or stats.red):
                continue
            stats.rating = player_rating(team, pid, log, cfg)
    return MatchResult(home.goals, away.goals, "possession", log.events, home.stats, away.stats,
                       {**home.individual, **away.individual},
                       [(slot.player.id, slot.position.value) for slot in initial_home.slots],
                       [(slot.player.id, slot.position.value) for slot in initial_away.slots],
                       [player.id for player in initial_home.bench], [player.id for player in initial_away.bench],
                       round(log.second), status)


def player_rating(team: TeamState, pid: int, log: MatchLog, cfg: Config) -> float:
    """The match rating of a player so far: goals, assists, saves and cards, and the goals his keeping let in."""
    rules, stats = cfg.engine.player_ratings, team.individual[pid]
    rating = rules.base + stats.goals * rules.goal + stats.assists * rules.assist + stats.saves * rules.saving
    rating += stats.yellows * rules.yellow + int(stats.red) * rules.expulsion
    for event in log.events:
        if event.kind == "save" and event.secondary_id == pid:
            rating += rules.saved_shot
        if event.kind == "goal" and event.team_id != team.club_id:
            shot = next((item for item in log.events if item.kind == "shot" and item.shot_id == event.shot_id), None)
            if shot and shot.secondary_id == pid: rating += rules.keeper_conceded
    return clamp(rating, rules.min, rules.max)
