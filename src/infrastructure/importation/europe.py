"""Read national quotas and translate source association codes to world codes."""
import csv
from pathlib import Path

from core.config.model import Config

ALIASES = {"CYP": "Chypre", "SLO": "Slovénie", "ROM": "Roumanie",
           "AZE": "Azerbaïdjan", "MDA": "Moldavie", "ARM": "Arménie", "LAT": "Lettonie"}


def read_quotas(directory: Path, nations: dict[str, str], cfg: Config) -> dict[str, tuple[int, int, int]]:
    by_name = {name: code for code, name in nations.items()}
    quotas = {}
    with (directory / "qualifs_europe.csv").open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        if reader.fieldnames != ["Pays", "C1", "C3", "C4"]:
            raise ValueError("European quotas require the columns Pays;C1;C3;C4")
        for row in reader:
            values = tuple(int(row[key].strip() or 0) for key in ("C1", "C3", "C4"))
            if min(values) < 0:
                raise ValueError("European quotas cannot be negative")
            if not any(values):
                continue
            source = row["Pays"].strip()
            code = source if source in nations else by_name.get(ALIASES.get(source))
            if code is None or code in quotas:
                raise ValueError(f"Unknown or duplicate European association: {source}")
            quotas[code] = values
    if any(sum(row[i] for row in quotas.values()) != cfg.world.europe.club_count for i in range(3)):
        raise ValueError("Each European competition must have exactly 36 qualification places")
    return quotas
