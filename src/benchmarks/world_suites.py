"""Full-world longitudinal measurements, with the production day scheduler."""
from __future__ import annotations

from collections import Counter
from pathlib import Path
from statistics import mean, pstdev
from time import perf_counter
import json

from core.domain.date import Date
from core.domain.world import World
from core.world.simulation import advance_day
from core.world.validation import validate_world
from infrastructure.persistence.store import SaveStore
from .report import Measurement


def snapshot(world: World, elapsed: float) -> dict:
    active = [player for club in world.active_clubs() for pid in club.player_ids if (player := world.players[pid])]
    total = len(active)
    clubs = world.active_clubs()
    rankings = sorted(clubs, key=lambda club: (-club.reputation, club.id))
    elite = [player for player in active if player.rating >= 80]
    top_ids = {club.id for competition in world.competitions.values() if competition.kind == "league" for club in sorted(
        (world.clubs[cid] for cid in competition.club_ids), key=lambda item: (-item.reputation, item.id))[:3]}
    return {"season": world.season, "date": world.date.iso(), "active": total, "population": len(world.players),
            "external": len(world.players) - total, "free": sum(player.club_id is None for player in world.players.values()),
            "retired": len(world.retired), "age": mean(player.born.age_on(world.date) for player in active),
            "level": mean(player.rating for player in active), "elite85": sum(player.rating > 85 for player in active),
            "potential85": sum(player.potential > 85 for player in active),
            "positions": {key: count / total for key, count in Counter(player.position for player in active).items()},
            "nations": {key: count / total for key, count in Counter(player.nation for player in active).items()},
            "wages": sum(club.wage_bill for club in clubs), "min_balance": min(club.balance for club in clubs),
            "negative_clubs": [club.id for club in clubs if club.balance < 0],
            "min_squad": min(len(club.player_ids) for club in clubs), "max_squad": max(len(club.player_ids) for club in clubs),
            "min_goalkeepers": min(sum(world.players[pid].position == "GB" for pid in club.player_ids) for club in clubs),
            "top3_elite_share": sum(player.club_id in top_ids for player in elite) / max(1, len(elite)),
            "elapsed_seconds": elapsed}


def reputation_row(world: World, held: dict[int, float]) -> dict:
    """How far club reputation moved since `held` and what shape it has, over the clubs playing this season."""
    active = world.active_clubs()
    changes = [abs(club.reputation - held[club.id]) for club in active]
    return {"reputation_mean": mean(club.reputation for club in active), "reputation_spread": pstdev(club.reputation for club in active),
            "reputation_change": mean(changes), "reputation_max_change": max(changes),
            "reputation_top10": [club.id for club in sorted(world.clubs.values(), key=lambda club: (-club.reputation, club.id))[:10]]}


def run_world_suite(world: World, suite: str, seasons: int, warmup: int, report_path: Path | None) -> tuple[list[Measurement], list[dict]]:
    cfg = world.config
    rows, injuries, outside, long_injuries, unavailable, days = [], 0, 0, 0, 0, 0
    negative_streak = Counter()
    permanent = set()
    max_save_seconds = 0.0
    store = SaveStore((report_path.parent if report_path else Path("reports")) / "benchmark-saves")
    for index in range(warmup + seasons):
        started = perf_counter()
        held = {cid: club.reputation for cid, club in world.clubs.items()}
        boundary = Date(world.season + 1, cfg.world.key_dates.population_review.month, cfg.world.key_dates.population_review.day)
        while world.date < boundary:
            advance_day(world)
            if index >= warmup:
                active = [world.players[pid] for club in world.active_clubs() for pid in club.player_ids]
                for player in active:
                    if player.injury:
                        unavailable += 1
                        if player.injury.start == world.date:
                            injuries += 1
                            long_injuries += int(player.injury.end.ordinal() - player.injury.start.ordinal() >= cfg.states.injuries.permanent_penalty.min_duration_days)
                outside += sum(entry.kind == "injury" and entry.match_id is None and entry.date == world.date for entry in reversed(world.journal))
                days += 1
            if world.date.day == 1:
                save_start = perf_counter()
                store.save(world, "checkpoint")
                max_save_seconds = max(max_save_seconds, perf_counter() - save_start)
                validate_world(world)
        row = snapshot(world, perf_counter() - started)
        row.update(reputation_row(world, held))
        row["warmup"] = index < warmup
        rows.append(row)
        for club in world.active_clubs():
            negative_streak[club.id] = negative_streak[club.id] + 1 if club.balance < 0 else 0
            if index >= warmup and negative_streak[club.id] >= cfg.benchmarks.economy.negative_season_count: permanent.add(club.id)
        print(f"Season {row['season']}: active={row['active']} age={row['age']:.2f} level={row['level']:.2f} elite85={row['elite85']} {row['elapsed_seconds']:.1f}s", flush=True)
        if report_path:
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.with_suffix(".seasons.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False), "utf-8")
    observed = [row for row in rows if not row["warmup"]]
    count = len(world.active_clubs())
    measures = [Measurement("season_seconds_with_autosaves", mean(row["elapsed_seconds"] for row in observed), 0, cfg.benchmarks.performance.season_seconds, seasons),
                Measurement("largest_monthly_save_seconds", max_save_seconds, 0, cfg.benchmarks.performance.save_seconds, seasons)]
    if suite in ("world", "injuries"):
        for name, value, target in (("injuries_per_club", injuries / (count * seasons), cfg.benchmarks.injuries.per_club_season),
                                    ("outside_injury_share", outside / max(1, injuries), cfg.benchmarks.injuries.outside_match_share),
                                    ("mean_unavailable", unavailable / max(1, days * count), cfg.benchmarks.injuries.mean_unavailable),
                                    ("long_injuries_per_club", long_injuries / (count * seasons), cfg.benchmarks.injuries.long_per_club_season)):
            measures.append(Measurement(name, value, target.min, target.max, seasons))
    if suite in ("world", "demography", "economy"):
        required = cfg.benchmarks.execution.demography_seasons if suite != "economy" else cfg.benchmarks.execution.economy_seasons
        measures.append(Measurement("validation_horizon_seasons", seasons, required, float(required + seasons), seasons))
        window = min(cfg.benchmarks.execution.comparison_window, max(1, seasons // 2))
        first, last = observed[:window], observed[-window:]
        rules = cfg.benchmarks.demography
        for key, tolerance in (("active", rules.population_drift), ("wages", cfg.benchmarks.economy.real_wage_drift)):
            baseline = mean(row[key] for row in first)
            drift = abs(mean(row[key] for row in last) - baseline) / max(1, baseline)
            measures.append(Measurement(f"{key}_window_drift", drift, 0, tolerance, seasons))
        elite_start, elite_end = mean(row["elite85"] for row in first), mean(row["elite85"] for row in last)
        measures.append(Measurement("elite85_absolute_change", abs(elite_end - elite_start), 0, max(rules.elite_absolute_tolerance, elite_start * rules.elite_drift), seasons))
        for axis, tolerance in (("positions", rules.position_drift), ("nations", rules.nation_drift)):
            keys = set().union(*(row[axis] for row in observed))
            drift = max(abs(mean(row[axis].get(key, 0) for row in first) - mean(row[axis].get(key, 0) for row in last)) for key in keys)
            measures.append(Measurement(f"{axis}_max_share_drift", drift, 0, tolerance, seasons))
        economy = cfg.benchmarks.economy
        spread_first = mean(row["reputation_spread"] for row in first)
        measures.extend([
            Measurement("reputation_mean_window_drift", abs(mean(row["reputation_mean"] for row in last) - mean(row["reputation_mean"] for row in first)),
                        0, economy.reputation_mean_drift, seasons),
            Measurement("reputation_spread_window_drift", abs(mean(row["reputation_spread"] for row in last) - spread_first) / spread_first,
                        0, economy.reputation_spread_drift, seasons),
            Measurement("reputation_mean_annual_change", mean(row["reputation_change"] for row in observed),
                        economy.min_reputation_change, economy.max_reputation_change, seasons),
            Measurement("reputation_largest_annual_jump", max(row["reputation_max_change"] for row in observed), 0, economy.max_reputation_jump, seasons)])
        if len(observed) > 1:
            kept = mean(len(set(before["reputation_top10"]) & set(after["reputation_top10"])) / 10 for before, after in zip(observed, observed[1:]))
            measures.append(Measurement("reputation_top10_persistence", kept, economy.min_top_ten_persistence, 1.0, seasons))
        measures.extend([Measurement("active_mean_age", mean(row["age"] for row in observed), rules.mean_age.min, rules.mean_age.max, seasons),
                         Measurement("permanently_negative_clubs", len(permanent), 0, cfg.benchmarks.economy.permanently_negative_clubs.max, seasons),
                         Measurement("minimum_squad", min(row["min_squad"] for row in observed), cfg.management.guardrails.min_squad, cfg.management.guardrails.max_squad, seasons),
                         Measurement("minimum_goalkeepers", min(row["min_goalkeepers"] for row in observed), cfg.management.guardrails.min_goalkeepers, cfg.management.guardrails.max_squad, seasons),
                         Measurement("top3_elite_share", mean(row["top3_elite_share"] for row in observed), 0, cfg.benchmarks.economy.top_three_talent_share, seasons)])
        for cid, winners in world.champions.items():
            measures.append(Measurement(f"different_champions/{cid}", len({winner for _, winner in winners[-seasons:]}), cfg.benchmarks.economy.different_champions.min, seasons + cfg.benchmarks.economy.different_champions.min, seasons))
        first_year = rows[warmup]["season"] - 1
        arrivals = [item for item in world.transfers if item.kind == "transfer" and item.target_id and world.clubs[item.target_id].competition_id and item.date >= Date(first_year, 7, 1)]
        dormant = sum(item.source_id is not None and world.clubs[item.source_id].competition_id is None for item in arrivals)
        summer = sum(cfg.world.market.summer.start_month <= item.date.month <= cfg.world.market.summer.end_month for item in arrivals)
        for name, value, target in (("summer_arrivals_per_club", summer / max(1, seasons * count), cfg.benchmarks.economy.summer_transfers_per_club),
                                    ("dormant_incoming_share", dormant / max(1, len(arrivals)), cfg.benchmarks.economy.dormant_incoming_share)):
            measures.append(Measurement(name, value, target.min, target.max, seasons))
    return measures, rows
