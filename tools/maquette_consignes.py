"""Mock-up of the tactical instructions (docs/conception-consignes-tactiques.md), never edits code or config.

Side A plays a style through local patches of the engine, side B the shipped play: equal sides, A favourite (74 against
66), A underdog. Run from the repository: PYTHONPATH=src python tools/maquette_consignes.py [matches] [style,style...]
"""
import sys, json
from dataclasses import replace
from math import exp, log
from multiprocessing import Pool
from pathlib import Path
import core.engine.possession as possession
import core.engine.live as live
from core.engine.match import PossessionEngine
from core.engine.zones import gap
from core.math import weighted_choice, logit, sigmoid
from core.randomness import stream
from infrastructure.config.loader import load_config
from benchmarks.fixtures import AVERAGE_DELIVERY, synthetic_lineup

CFG = load_config(Path("config"))
A = 1
STYLES = {
    "reference": {},
    "possession": {"tempo": 0.75, "long": -0.8},
    "direct": {"tempo": 1.35, "long": 0.8},
    "ailes": {"wings": 0.6},
    "axe": {"wings": -0.6},
    "frappes_loin": {"long_shot": 0.8},
    "pressing_haut": {"block": 0.4},
    "bloc_bas": {"block": -0.4},
    "courte_amplifiee": {"tempo": 0.75, "long": -0.8, "keep_sens": 2.0},
    "directe_compensee": {"tempo": 1.35, "long": 0.8, "prog_bias": -0.12},
}
STYLE = {}

def variant(cfg, style):
    a = cfg.engine.actions
    if "tempo" in style:
        a = replace(a, tempo_by_zone=tuple(min(0.95, t * style["tempo"]) for t in a.tempo_by_zone))
    if "long" in style:
        a = replace(a, long_ball=replace(a.long_ball, share_by_zone=tuple(sigmoid(logit(s) + style["long"]) for s in a.long_ball.share_by_zone)))
    if "long_shot" in style:
        a = replace(a, long_shot=replace(a.long_shot, share=sigmoid(logit(a.long_shot.share) + style["long_shot"])))
    if "keep_sens" in style:
        a = replace(a, patience=a.patience * style["keep_sens"], conservation=replace(a.conservation, sensitivity=a.conservation.sensitivity * style["keep_sens"]))
    engine = replace(cfg.engine, actions=a)
    if "prog_bias" in style:
        engine = replace(engine, transitions=replace(engine.transitions, progression_bias=engine.transitions.progression_bias + style["prog_bias"]))
    return replace(cfg, engine=engine)

original_init = possession._Play.__init__
def patched_init(self, attacker, defender, *args):
    original_init(self, attacker, defender, *args)
    if attacker.club_id == A and STYLE.get("cfg") is not None: self.cfg = STYLE["cfg"]
possession._Play.__init__ = patched_init

original_choose = possession.choose_lane
def patched_choose(attacker, defender, zone, cfg, rng, candidates=None):
    bias = STYLE.get("style", {}).get("wings", 0) if attacker.club_id == A else 0
    if not bias: return original_choose(attacker, defender, zone, cfg, rng, candidates)
    lanes = candidates if candidates is not None else list(range(len(cfg.involvement.lanes)))
    centre = len(cfg.involvement.lanes) // 2
    scores = [cfg.engine.lanes.beta_softmax * gap(attacker, defender, zone, lane, False, cfg) + (bias if lane != centre else 0) for lane in lanes]
    top = max(scores)
    return weighted_choice(lanes, [exp(s - top) for s in scores], rng)
possession.choose_lane = patched_choose

original_live = live.LiveMatch.__init__
def patched_live(self, *args, **kwargs):
    original_live(self, *args, **kwargs)
    shift = STYLE.get("style", {}).get("block", 0)
    for team in self.teams:
        if team.club_id == A and shift:
            team.block_height = max(-1, min(1, team.block_height + shift)); team.initial_block = team.block_height
live.LiveMatch.__init__ = patched_live

def task(args):
    name, scenario, n = args
    style = STYLES[name]
    STYLE.clear(); STYLE.update(style=style, cfg=variant(CFG, style) if style else None)
    levels = {"egaux": (70, 70), "favori": (74, 66), "outsider": (66, 74)}[scenario]
    a = synthetic_lineup(CFG, A, level=levels[0], delivery=AVERAGE_DELIVERY)
    b = synthetic_lineup(CFG, 2, level=levels[1], delivery=AVERAGE_DELIVERY)
    engine = PossessionEngine()
    t = dict(points=0, gf=0, ga=0, poss=0, shots=0, shots_against=0, xg=0, xga=0, fouls_against=0, draws=0)
    for i in range(n):
        home_a = i % 2 == 0
        r = engine.simulate(a if home_a else b, b if home_a else a, CFG, stream(777, name, scenario, i))
        sa, sb = (r.home_stats, r.away_stats) if home_a else (r.away_stats, r.home_stats)
        gf, ga = (r.home_goals, r.away_goals) if home_a else (r.away_goals, r.home_goals)
        t["points"] += 3 if gf > ga else 1 if gf == ga else 0; t["draws"] += gf == ga
        t["gf"] += gf; t["ga"] += ga; t["poss"] += sa.possession_seconds / max(1, sa.possession_seconds + sb.possession_seconds); t["fouls_against"] += sb.fouls or 0
        t["shots"] += sa.shots; t["shots_against"] += sb.shots; t["xg"] += sa.xg; t["xga"] += sb.xg
    return name, scenario, {k: round(v / n, 3) for k, v in t.items()}

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    jobs = [(name, scenario, n) for name in (sys.argv[2].split(",") if len(sys.argv) > 2 else STYLES) for scenario in ("egaux", "favori", "outsider")]
    with Pool(4) as pool:
        for name, scenario, row in pool.imap(task, jobs):
            print(json.dumps([name, scenario, row]), flush=True)
