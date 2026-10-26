"""Build detailed results and the players' match ratings."""
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
            stats.rating = player_rating(team, pid, cfg)
    return MatchResult(home.goals, away.goals, "possession", log.events, home.stats, away.stats,
                       {**home.individual, **away.individual},
                       [(slot.player.id, slot.position.value) for slot in initial_home.slots],
                       [(slot.player.id, slot.position.value) for slot in initial_away.slots],
                       [player.id for player in initial_home.bench], [player.id for player in initial_away.bench],
                       duration=round(log.second), status=status)


def player_rating(team: TeamState, pid: int, cfg: Config) -> float:
    """The match rating of a player so far: the danger his actions added, at his position's scale, his goals, assists,
    fouls and cards, less what an ordinary player of his position brings in his minutes. His side's score counts only
    through what he did to make it."""
    rules, stats = cfg.engine.player_ratings, team.individual[pid]
    position = team.roles.get(pid) or team.players[pid].position
    rating = rules.base + rules.scale[position] * team.danger.get(pid, 0.0) + stats.goals * rules.goal + stats.assists * rules.assist
    rating += stats.yellows * rules.yellow + int(stats.red) * rules.expulsion + team.credits.get(pid, 0.0)
    rating -= rules.expected_per_minute[position] * stats.minutes
    return clamp(rating, rules.min, rules.max)
