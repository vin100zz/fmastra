"""Detailed-engine calibration suites."""
from time import perf_counter

from core.engine.match import PossessionEngine
from core.randomness import stream
from .fixtures import synthetic_lineup
from .report import Measurement


def run_detailed_suite(suite: str, world, iterations: int, seed: int) -> list[Measurement]:
    cfg, engine = world.config, PossessionEngine()
    if suite == "match":
        from .runner import run_match_suite
        return run_match_suite(world, iterations, engine, seed)
    if suite == "formations":
        measurements = []
        for formation in cfg.formations.formations:
            score, total = 0.0, 0
            for other in cfg.formations.formations:
                for side in (0, 1):
                    home = synthetic_lineup(cfg, 1, formation if side == 0 else other)
                    away = synthetic_lineup(cfg, 2, other if side == 0 else formation)
                    for index in range(iterations):
                        result = engine.simulate(home, away, cfg, stream(seed, formation, other, side, index))
                        goals, conceded = (result.home_goals, result.away_goals) if side == 0 else (result.away_goals, result.home_goals)
                        score += 1 if goals > conceded else cfg.benchmarks.formations.draw_weight if goals == conceded else 0
                        total += 1
            bounds = cfg.benchmarks.formations
            measurements.append(Measurement(formation, score / total, bounds.min_balance_score, bounds.max_balance_score, total))
        return measurements
    home, away = synthetic_lineup(cfg, 1), synthetic_lineup(cfg, 2)
    totals = {key: 0.0 for key in ("possessions", "shots", "xg", "goals", "yellows", "reds", "set_goals", "home_advantage")}
    started = perf_counter()
    for index in range(iterations):
        result = engine.simulate(home, away, cfg, stream(seed, "symmetric", index))
        for stats in (result.home_stats, result.away_stats):
            for key in ("possessions", "shots", "xg", "yellows", "reds"):
                totals[key] += getattr(stats, key)
            totals["set_goals"] += stats.set_piece_goals
        totals["goals"] += result.home_goals + result.away_goals
        totals["home_advantage"] += result.home_goals - result.away_goals
    elapsed = perf_counter() - started
    if suite == "performance":
        return [Measurement("match_milliseconds", elapsed * 1000 / iterations, 0, cfg.benchmarks.performance.match_milliseconds, iterations)]
    target = cfg.benchmarks.stats_match
    measurements = []
    for key, reference in (("possessions", target.possessions_per_team), ("shots", target.shots_per_team),
                           ("xg", target.xg_per_team), ("yellows", target.yellows_per_team), ("reds", target.reds_per_team)):
        measurements.append(Measurement(key, totals[key] / (2 * iterations), reference.min, reference.max, iterations))
    for key, reference, divisor in (("goals", target.goals_per_team, 2 * iterations),
                                    ("home_advantage", target.home_goal_advantage, iterations)):
        measurements.append(Measurement(key, totals[key] / divisor, reference.target - reference.tolerance,
                                        reference.target + reference.tolerance, iterations))
    bounds = target.set_piece_goal_share
    measurements.append(Measurement("set_piece_goal_share", totals["set_goals"] / max(1, totals["goals"]), bounds.min, bounds.max, iterations))
    measurements.append(Measurement("match_milliseconds", elapsed * 1000 / iterations, 0, cfg.benchmarks.performance.match_milliseconds, iterations))
    return measurements
