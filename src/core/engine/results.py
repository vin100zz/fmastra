"""Build detailed results and the players' match ratings."""
from core.config.model import Config
from core.domain.matches import Lineup, MatchResult
from core.math import clamp
from .local_state import TeamState, MatchLog


def assemble(home: TeamState, away: TeamState, initial_home: Lineup, initial_away: Lineup,
             log: MatchLog, cfg: Config, status: str = "played") -> MatchResult:
    rules = cfg.engine.player_ratings
    for team, opponent in ((home, away), (away, home)):
        for pid, stats in team.individual.items():
            if stats.minutes < rules.min_rating_minutes and not (stats.goals or stats.assists or stats.red):
                continue
            stats.rating = player_rating(team, opponent, pid, cfg)
    return MatchResult(home.goals, away.goals, "possession", log.events, home.stats, away.stats,
                       {**home.individual, **away.individual},
                       [(slot.player.id, slot.position.value) for slot in initial_home.slots],
                       [(slot.player.id, slot.position.value) for slot in initial_away.slots],
                       [player.id for player in initial_home.bench], [player.id for player in initial_away.bench],
                       round(log.second), status)


def player_rating(team: TeamState, opponent: TeamState, pid: int, cfg: Config) -> float:
    """The match rating of a player so far: his goals, assists, saves and cards, what his actions added
    beyond what his minutes are expected to bring, and his side's score."""
    rules, stats = cfg.engine.player_ratings, team.individual[pid]
    rating = rules.base + stats.goals * rules.goal + stats.assists * rules.assist + stats.saves * rules.saving
    rating += stats.yellows * rules.yellow + int(stats.red) * rules.expulsion
    rating += team.credits.get(pid, 0.0) - rules.expected_per_minute * stats.minutes
    share = min(1.0, stats.minutes * 60 / cfg.engine.timing.match_seconds)
    rating += rules.win * share * ((team.goals > opponent.goals) - (team.goals < opponent.goals))
    if not opponent.goals and stats.minutes >= rules.clean_sheet_minutes and pid in team.roles:
        # Shared by the defence: the keeper and centre backs in full, the forwards not at all.
        own_box = {position: heights[0] for position, heights in cfg.involvement.defense.items()}
        rating += rules.clean_sheet * own_box[team.roles[pid]] / max(own_box.values())
    return clamp(rating, rules.min, rules.max)
