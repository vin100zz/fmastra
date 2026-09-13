"""Reproducible local verification with a durable status report after each check."""
from pathlib import Path
import json
import os
import subprocess
import sys
from time import perf_counter


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    os.chdir(root)
    reports = root / "reports"
    reports.mkdir(exist_ok=True)
    environment = dict(os.environ, PYTHONPATH=str(root / "src"))
    checks = [("tests", ["-m", "pytest", "-q"]),
              ("statistics", ["-m", "benchmarks.runner", "--suite", "stats_match", "--iterations", "2000", "--report", "reports/final-match-statistics.json"]),
              ("fixtures", ["-m", "benchmarks.runner", "--suite", "match", "--iterations", "1000", "--report", "reports/final-match-fixtures.json"]),
              ("formations", ["-m", "benchmarks.runner", "--suite", "formations", "--iterations", "80", "--report", "reports/final-formations.json"])]
    results = []
    for name, arguments in checks:
        print(f"START {name}", flush=True)
        started = perf_counter()
        with (reports / f"verify-{name}.log").open("w", encoding="utf-8") as log:
            process = subprocess.run([sys.executable, *arguments], stdout=log, stderr=subprocess.STDOUT, env=environment)
        results.append({"check": name, "returncode": process.returncode, "seconds": perf_counter() - started})
        (reports / "verification.json").write_text(json.dumps(results, indent=2), "utf-8")
        print(f"END {name}: exit={process.returncode}", flush=True)
    raise SystemExit(any(row["returncode"] for row in results))


if __name__ == "__main__": main()
