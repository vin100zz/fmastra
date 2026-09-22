"""Read national quota ranges and translate source association codes to world codes."""
import csv
from pathlib import Path

from core.config.model import Config

ALIASES = {"CYP": "Chypre", "SLO": "Slovénie", "ROM": "Roumanie",
           "AZE": "Azerbaïdjan", "MDA": "Moldavie", "ARM": "Arménie", "LAT": "Lettonie",
           "KOS": "Kosovo", "KAZ": "Kazakhstan", "FAR": "Îles Féroé", "MLT": "Malte",
           "LTU": "Lituanie", "LIE": "Liechtenstein", "EST": "Estonie", "LUX": "Luxembourg",
           "GEO": "Géorgie", "BLR": "Biélorussie", "AND": "Andorre"}


def parse_range(cell: str) -> tuple[int, int]:
    """A cell is a fixed count ("2"), a "min-max" range, or empty for zero."""
    cell = cell.strip()
    if not cell:
        return 0, 0
    low, _, high = cell.partition("-")
    low = int(low)
    high = int(high) if high else low
    if low < 0 or high < low:
        raise ValueError("European quota ranges must be non-negative and ordered")
    return low, high


def read_quotas(directory: Path, nations: dict[str, str], cfg: Config) -> dict[str, tuple[tuple[int, int], tuple[int, int], tuple[int, int]]]:
    by_name = {name: code for code, name in nations.items()}
    quotas = {}
    with (directory / "qualifs_europe.csv").open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        if reader.fieldnames != ["Pays", "C1", "C3", "C4"]:
            raise ValueError("European quotas require the columns Pays;C1;C3;C4")
        for row in reader:
            values = tuple(parse_range(row[key]) for key in ("C1", "C3", "C4"))
            if not any(high for _, high in values):
                continue
            source = row["Pays"].strip()
            code = source if source in nations else by_name.get(ALIASES.get(source))
            if code is None or code in quotas:
                raise ValueError(f"Unknown or duplicate European association: {source}")
            quotas[code] = values
    club_count = cfg.world.europe.club_count
    if any(sum(bounds[i][0] for bounds in quotas.values()) > club_count or
           sum(bounds[i][1] for bounds in quotas.values()) < club_count for i in range(3)):
        raise ValueError("Each European competition must be able to reach exactly 36 qualification places")
    return quotas
