from itertools import permutations
from core.ai.assignment import maximize_assignment
from core.engine.analytical import AnalyticalEngine
from core.randomness import stream
from benchmarks.fixtures import synthetic_lineup


def test_assignment_matches_exhaustive_optimum():
    scores = [[9, 10, 1, 3], [8, 7, 2, 0], [1, 4, 9, 8]]
    chosen = maximize_assignment(scores)
    expected = max(sum(row[col] for row, col in zip(scores, choice)) for choice in permutations(range(4), 3))
    assert len(set(chosen)) == 3
    assert sum(row[col] for row, col in zip(scores, chosen)) == expected


def test_analytical_reproducible_without_false_detail(config):
    engine = AnalyticalEngine()
    home, away = synthetic_lineup(config, 1), synthetic_lineup(config, 2)
    first = engine.simulate(home, away, config, stream(1))
    second = engine.simulate(home, away, config, stream(1))
    assert first == second
    assert first.home_stats is None and not first.events
