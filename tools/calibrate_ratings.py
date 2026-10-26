"""Measures the rating scale on synthetic matches; prints candidate values, never edits config.

Every formation meets every other, home and away, with sides of the same level. First the danger tables: how often a
possession ends in a goal once the ball is at each zone (on a counter or not), and once it was won in play at each zone.
Then, with those tables, the danger each position adds per minute and its spread over a full match, read from every
player of at least half an hour as if his spread grew with the root of his minutes: `echelle_par_poste` brings that
spread to the target, and `attendu_par_minute_par_poste` takes off what an ordinary player brings, goals,
assists, fouls and cards included. Ratings never change the play, so both passes replay the same matches.

    python tools/calibrate_ratings.py [matches per pairing] [target spread over a full match]
"""
import json
import sys
from collections import defaultdict
from pathlib import Path
from math import sqrt
from statistics import fmean

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from benchmarks.fixtures import AVERAGE_DELIVERY, synthetic_lineup
from core.engine.match import PossessionEngine
from core.randomness import stream
from infrastructure.config.loader import config_payload, decode_config, load_config

IN_PLAY = {"interception", "tackle", "aerial"}
# Set pieces and restarts bring the defence back in shape, as a pass kept does.
SETTLED = {"circulation", "throw_in", "free_kick", "corner"}
HALF_HOUR = 30


def matches(cfg, count):
    engine, formations = PossessionEngine(), list(cfg.formations.formations)
    for home in formations:
        for away in formations:
            for index in range(count):
                yield engine.simulate(synthetic_lineup(cfg, 1, home, delivery=AVERAGE_DELIVERY),
                                      synthetic_lineup(cfg, 2, away, delivery=AVERAGE_DELIVERY), cfg,
                                      stream(20261026, "ratings", home, away, index))


def danger_tables(cfg, count):
    zones = len(cfg.involvement.zones)
    visits = {counter: [[0, 0] for _ in range(zones)] for counter in (False, True)}
    recoveries = [[0, 0] for _ in range(zones)]
    for result in matches(cfg, count):
        possessions, current, won = [], None, None
        for event in result.events:
            if event.kind == "possession":
                current = {"team": event.team_id, "states": [(event.zone, event.detail == "counter")], "goal": False,
                           "won": won, "counter": event.detail == "counter"}
                possessions.append(current)
                won = None
            elif current is None:
                continue
            elif event.kind == "goal" and event.team_id == current["team"]:
                current["goal"] = True
            elif event.kind == "progress" and event.team_id == current["team"]:
                current["states"].append((event.zone, current["counter"]))
            elif event.kind in SETTLED:
                current["counter"] = False
            elif event.kind == "turnover" and event.detail in IN_PLAY:
                won = event.zone
        for possession in possessions:
            for zone, counter in possession["states"]:
                visits[counter][zone][0] += possession["goal"]
                visits[counter][zone][1] += 1
            if possession["won"] is not None:
                recoveries[possession["won"]][0] += possession["goal"]
                recoveries[possession["won"]][1] += 1
    rate = lambda cell, fallback=0.0: round(cell[0] / cell[1], 4) if cell[1] else fallback
    danger = [rate(cell) for cell in visits[False]]
    return (danger, [rate(cell, danger[zone]) for zone, cell in enumerate(visits[True])],
            [rate(cell) for cell in recoveries])


def with_rules(cfg, **changes):
    raw = config_payload(cfg)
    raw["moteur_match"]["notes_joueurs"].update(changes)
    return decode_config(raw)


def per_player(cfg, count):
    """(position, minutes, rating less the base) of every rated player, match after match."""
    rows = []
    for result in matches(cfg, count):
        for pid, position in result.home_lineup + result.away_lineup:
            stats = result.player_stats[pid]
            if stats.rating is not None:
                rows.append((position, stats.minutes, stats.rating - cfg.engine.player_ratings.base))
    return rows


def main() -> None:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    target = float(sys.argv[2]) if len(sys.argv) > 2 else 0.6
    cfg = load_config(Path(__file__).resolve().parents[1] / "config")
    danger, counter, recovery = danger_tables(cfg, count)
    print(json.dumps({"danger_par_zone": danger, "danger_contre_par_zone": counter, "danger_recuperation_par_zone": recovery}))
    positions = list(cfg.involvement.attack)
    flat = {position: 1.0 for position in positions}
    neutral = {position: 0.0 for position in positions}
    measured = with_rules(cfg, danger_par_zone=danger, danger_contre_par_zone=counter, danger_recuperation_par_zone=recovery,
                          echelle_par_poste=flat, attendu_par_minute_par_poste=neutral)
    # The same matches twice: the danger alone, then all the rest alone.
    actions = per_player(with_rules(measured, but=0.0, passe_decisive=0.0, jaune=0.0, expulsion=0.0, faute=0.0), count)
    rest = per_player(with_rules(measured, echelle_par_poste={position: 1e-9 for position in positions}), count)
    by_position = defaultdict(lambda: {"minutes": 0.0, "danger": 0.0, "rest": 0.0, "played": []})
    for (position, minutes, value), (_, _, other) in zip(actions, rest):
        entry = by_position[position]
        entry["minutes"] += minutes
        entry["danger"] += value
        entry["rest"] += other
        if minutes >= HALF_HOUR: entry["played"].append((minutes, value))
    scale, expected = {}, {}
    for position in positions:
        entry = by_position[position]
        rate = entry["danger"] / entry["minutes"]
        spread = sqrt(fmean([(value - rate * minutes) ** 2 * 90 / minutes for minutes, value in entry["played"]]))
        scale[position] = round(target / spread, 2)
        expected[position] = round((scale[position] * entry["danger"] + entry["rest"]) / entry["minutes"], 5)
        print(f"{position:5} {len(entry['played']):6} joueurs, danger/90 {90 * rate:+.3f}, écart-type sur 90 minutes {spread:.3f}")
    print(json.dumps({"echelle_par_poste": scale, "attendu_par_minute_par_poste": expected}))


if __name__ == "__main__":
    main()
