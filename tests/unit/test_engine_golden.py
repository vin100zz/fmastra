"""Frozen fingerprints of full match results: any engine refactor must reproduce them, every event and every figure to its
eighth significant digit.

Set TOUCHLINE_REGEN_GOLDEN=1 to rewrite the reference, only after an intended change of the match rules."""
import json
import os
from dataclasses import asdict, replace
from hashlib import sha256
from pathlib import Path

from benchmarks.fixtures import AVERAGE_DELIVERY, synthetic_lineup
from core.engine.match import PossessionEngine
from core.randomness import stream

GOLDEN = Path(__file__).parent / "data" / "engine_golden.json"


def roughened(lineup, fitness: float, fragility: float, aggression: float):
    """Tired, fragile and rash players, so injuries, cards and forced changes happen often."""
    def change(player):
        return replace(player, fitness=fitness, fragility=fragility, aggression=aggression)
    return replace(lineup, slots=[replace(slot, player=change(slot.player)) for slot in lineup.slots],
                   bench=[change(player) for player in lineup.bench])


def shortened(lineup, size: int):
    return replace(lineup, slots=lineup.slots[:size])


# The formations the reference was frozen with: a formation added to the configuration does not reshuffle the cases.
FORMATIONS = ("4-4-2 plat", "4-3-3", "4-2-3-1", "3-5-2", "5-3-2", "5-4-1")


def cases(config):
    formations = FORMATIONS
    result = {}
    for index in range(12):
        home_formation, away_formation = formations[index % len(formations)], formations[(index * 5 + 1) % len(formations)]
        level_home, level_away = (60, 70, 80)[index % 3], (80, 65, 70)[index % 3]
        home = synthetic_lineup(config, 1, home_formation, level_home, AVERAGE_DELIVERY)
        away = synthetic_lineup(config, 2, away_formation, level_away)
        result[f"plain-{index}"] = (home, away, 1000 + index, index % 4 == 3)
    for index in range(6):
        home = roughened(synthetic_lineup(config, 1, formations[index % len(formations)]), 0.55, 1.8, 3.0)
        away = roughened(synthetic_lineup(config, 2), 0.6, 1.6, 2.5)
        result[f"rough-{index}"] = (home, away, 2000 + index, False)
    full = synthetic_lineup(config, 2)
    result["forfeit"] = (shortened(synthetic_lineup(config, 1), 6), full, 3000, False)
    result["double-forfeit"] = (shortened(synthetic_lineup(config, 1), 6), shortened(full, 5), 3001, False)
    return result


# The significant digits a figure is compared on. The draws of a match go through the logarithm and the exponential of the
# platform's maths library, whose last bit may differ from one machine to another: a reference frozen on one would fail on
# another for a figure off by 1e-16. Eight digits are far finer than anything the game shows, and far coarser than that.
DIGITS = 8


def settled(value):
    """A result's figures rounded to `DIGITS` significant digits, the rest as it is."""
    if isinstance(value, float): return float(f"{value:.{DIGITS}g}")
    if isinstance(value, dict): return {key: settled(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)): return [settled(item) for item in value]
    return value


def fingerprint(result) -> str:
    # The numbers of the match sheet are written by the world once the match is played, not by the engine.
    data = asdict(result)
    del data["shirts"]
    return sha256(json.dumps(settled(data), sort_keys=True, default=repr).encode()).hexdigest()


def play(config):
    engine = PossessionEngine()
    return {name: engine.simulate(home, away, config, stream(seed), neutral=neutral)
            for name, (home, away, seed, neutral) in cases(config).items()}


def test_match_results_match_the_frozen_reference(config):
    results = play(config)
    prints = {name: fingerprint(result) for name, result in results.items()}
    if os.environ.get("TOUCHLINE_REGEN_GOLDEN"):
        GOLDEN.parent.mkdir(exist_ok=True)
        GOLDEN.write_text(json.dumps(prints, indent=1, sort_keys=True) + "\n")
    assert prints == json.loads(GOLDEN.read_text())


def test_reference_covers_every_engine_path(config):
    kinds = {event.kind for result in play(config).values() for event in result.events}
    assert {"goal", "save", "off_target", "yellow", "red", "injury", "substitution", "forfeit", "double_forfeit"} <= kinds
