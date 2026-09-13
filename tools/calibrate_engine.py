"""Small explicit sensitivity sweep; writes candidate measurements, never edits config."""
from pathlib import Path
import json
from infrastructure.config.loader import load_config, config_payload, decode_config, merge
from infrastructure.importation.loader import import_world
from core.engine.match import PossessionEngine
from benchmarks.runner import run_match_suite
from benchmarks.suites import run_detailed_suite


def main() -> None:
    cfg = load_config(Path("config"))
    world = import_world(Path("data"), cfg, cfg.benchmarks.execution.default_seed)
    candidates = [
        {"moteur_match":{"occasion":{"sensibilite_tireur_gardien":.015}},"formations":{"hauteur_bloc":{"sensibilite_ecart_force_initial":.007}}},
        {"moteur_match":{"transitions":{"k_prog":.035,"k_occ":.03,"creation_bias":-1.65},"occasion":{"sensibilite_tireur_gardien":.02}},"formations":{"hauteur_bloc":{"sensibilite_ecart_force_initial":.008}}},
        {"moteur_match":{"transitions":{"k_prog":.025,"k_occ":.02,"creation_bias":-1.5},"occasion":{"sensibilite_tireur_gardien":.015}},"formations":{"hauteur_bloc":{"sensibilite_ecart_force_initial":.005}}},
    ]
    reports = []
    for index, override in enumerate(candidates):
        world.config = decode_config(merge(config_payload(cfg), override))
        measures = run_match_suite(world, 180, PossessionEngine(), 20260910)
        stats = run_detailed_suite("stats_match", world, 250, 20260910)
        report = {"override":override, "measurements":[item.payload() for item in measures+stats]}
        reports.append(report)
        print(index, [(item.name, round(item.value,3)) for item in measures+stats if "/win" in item.name or item.name in ("shots","xg","goals","home_advantage")], flush=True)
        Path("reports/engine-sweep.json").write_text(json.dumps(reports, indent=2), "utf-8")


if __name__ == "__main__": main()
