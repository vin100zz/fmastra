"""Command-line calibration harness. Run with python -m benchmarks.runner."""
from __future__ import annotations

import argparse
import csv
import json
import platform
import subprocess
import time
from pathlib import Path

from core.engine.analytical import AnalyticalEngine
from core.randomness import stream
from infrastructure.config.loader import load_config, config_fingerprint
from infrastructure.importation.loader import import_world
from .fixtures import fixture_lineup
from .report import proportion


def run_match_suite(world, iterations: int, engine, seed: int):
    measurements = []
    for fixture in world.config.benchmarks.fixtures:
        home = fixture_lineup(world, fixture.home, -1)
        away = fixture_lineup(world, fixture.away, -2)
        counts = [0, 0, 0]
        for index in range(iterations):
            result = engine.simulate(home, away, world.config, stream(seed, fixture.id, index))
            counts[0 if result.home_goals > result.away_goals else 1 if result.home_goals == result.away_goals else 2] += 1
        for label, count, target, tolerance in zip(("win", "draw", "loss"), counts,
                                                 (fixture.win, fixture.draw, fixture.loss), fixture.tolerance):
            measurements.append(proportion(f"{fixture.id}/{label}", count, iterations, target, tolerance))
    return measurements


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=["analytical", "match", "stats_match", "formations", "performance", "season", "world", "injuries", "demography", "economy"], default="analytical")
    parser.add_argument("--iterations", type=int)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--seasons", type=int)
    parser.add_argument("--warmup", type=int)
    parser.add_argument("--config", type=Path, default=Path("config"))
    parser.add_argument("--data", type=Path, default=Path("data"))
    parser.add_argument("--overrides", type=Path)
    parser.add_argument("--report", "--rapport", type=Path)
    args = parser.parse_args()
    cfg = load_config(args.config, args.overrides)
    seed = args.seed if args.seed is not None else cfg.benchmarks.execution.default_seed
    iterations = args.iterations or cfg.benchmarks.execution.match_iterations
    if iterations < 1: parser.error("iterations must be positive")
    world = import_world(args.data, cfg, seed if args.suite in ("world", "injuries", "demography", "economy") else cfg.benchmarks.execution.default_seed)
    started = time.perf_counter()
    if args.suite in ("world", "injuries", "demography", "economy"):
        from .world_suites import run_world_suite
        seasons = args.seasons if args.seasons is not None else (cfg.benchmarks.execution.economy_seasons if args.suite == "economy" else cfg.benchmarks.execution.demography_seasons)
        warmup = args.warmup if args.warmup is not None else cfg.benchmarks.demography.warmup_seasons
        if seasons < 1 or warmup < 0: parser.error("Invalid season horizon")
        measurements, _ = run_world_suite(world, args.suite, seasons, warmup, args.report)
    elif args.suite == "season":
        from .season_suite import run_season_suite
        measurements = run_season_suite(world, args.iterations or cfg.benchmarks.execution.season_iterations, seed)
    elif args.suite == "analytical":
        measurements = run_match_suite(world, iterations, AnalyticalEngine(), seed)
        for measurement in measurements: measurement.blocking = cfg.benchmarks.oracle.blocking
    else:
        from .suites import run_detailed_suite
        measurements = run_detailed_suite(args.suite, world, iterations, seed)
    try:
        revision = subprocess.check_output(["git", "-c", f"safe.directory={Path.cwd().as_posix()}", "rev-parse", "HEAD"], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        revision = "unavailable"
    report = {"suite": args.suite, "seed": seed, "iterations": iterations, "config_hash": config_fingerprint(cfg),
              "source_hashes": world.source_hashes, "revision": revision, "python": platform.python_version(),
              "elapsed_seconds": time.perf_counter() - started,
              "seasons": args.seasons, "warmup": args.warmup,
              "measurements": [measurement.payload() for measurement in measurements]}
    for measurement in measurements:
        status = "PASS" if measurement.passed else "FAIL" if measurement.blocking else "DIAGNOSTIC"
        print(f"{status:10} {measurement.name:42} {measurement.value:.4f} [{measurement.minimum:.4f}, {measurement.maximum:.4f}]")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), "utf-8")
        with args.report.with_suffix(".csv").open("w", encoding="utf-8", newline="") as handle:
            rows = report["measurements"]
            if rows:
                writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
                writer.writeheader()
                writer.writerows(rows)
    if any(not measurement.passed and measurement.blocking for measurement in measurements):
        raise SystemExit(1)


if __name__ == "__main__": main()
