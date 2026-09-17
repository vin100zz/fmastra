"""Independent fixed-roster season tests isolate the competition model."""
from dataclasses import replace
from collections import Counter
from statistics import mean, pstdev, correlation

from core.domain.world import World
from core.engine.match import PossessionEngine
from core.world.calendar import standings
from core.randomness import stream
from .fixtures import fixture_lineup
from .report import Measurement


def ranks(values: list[float]) -> list[float]:
    return [1 + sum(other < value for other in values) + (sum(other == value for other in values) - 1) / 2 for value in values]


def run_season_suite(world: World, iterations: int, seed: int) -> list[Measurement]:
    cfg = world.config
    engine = PossessionEngine()
    lineups = {club.id: fixture_lineup(world, club.id, -1) for club in world.active_clubs()}
    samples = {key: [] for key in ("champion", "bottom", "deviation", "scorer", "correlation", "strongest")}
    for iteration in range(iterations):
        for competition in world.competitions.values():
            if competition.kind != "league":
                continue
            goals = Counter()
            matches = []
            for mid in competition.match_ids:
                match = world.matches[mid]
                result = engine.simulate(lineups[match.home_id], lineups[match.away_id], cfg, stream(seed, "season", iteration, mid))
                goals.update({pid: stats.goals for pid, stats in result.player_stats.items()})
                matches.append(replace(match, result=result))
            table = standings(competition, matches, cfg)
            ppm = [row.points / max(1, row.played) for row in table]
            samples["champion"].append(ppm[0]); samples["bottom"].append(ppm[-1]); samples["deviation"].append(pstdev(ppm))
            samples["scorer"].append(max(goals.values(), default=0))
            samples["correlation"].append(correlation(ranks([world.clubs[row.club_id].reputation for row in table]), list(range(len(table), 0, -1))))
            strongest = max(competition.club_ids, key=lambda cid: (mean(slot.player.rating for slot in lineups[cid].slots), -cid))
            samples["strongest"].append(int(table[0].club_id == strongest))
    rules = cfg.benchmarks.season
    return [Measurement(name, mean(samples[key]), target.min, target.max, len(samples[key])) for key, name, target in (
        ("champion", "champion_points_per_match", rules.champion_points_per_match),
        ("bottom", "bottom_points_per_match", rules.bottom_points_per_match),
        ("deviation", "points_per_match_deviation", rules.points_per_match_deviation),
        ("scorer", "top_scorer_goals", rules.top_scorer_goals),
        ("correlation", "reputation_rank_spearman", rules.reputation_rank_correlation),
        ("strongest", "strongest_title_share", rules.strongest_title_share))]
