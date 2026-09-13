"""Strict CSV readers. Reading and encoding live outside the simulation."""
from __future__ import annotations

import csv
from pathlib import Path

from core.config.model import Config
from core.domain.date import Date
from core.world.importation.records import SourceClub, SourcePlayer


def source_date(value: str) -> Date:
    day, month, year = map(int, value.split("."))
    return Date(year, month, day)


def read_sources(directory: Path, cfg: Config) -> tuple[list[SourceClub], list[SourcePlayer], dict[str, str]]:
    fmt = cfg.import_settings.source_format
    if fmt.date_format != "%d.%m.%Y" or fmt.wage_unit != "euros_par_semaine":
        raise ValueError("Unsupported source date format or wage unit")
    with (directory / "nations.csv").open(encoding="utf-8", newline="") as handle:
        nations = {row["name"]: row["code"] for row in csv.DictReader(handle)}
    with (directory / "clubs.csv").open(encoding=fmt.encoding, newline="") as handle:
        clubs = [SourceClub(int(row["Unique ID"]), row["Name"], nations[row["Nation"]],
                            int(row["Division ID"]), int(row["Stad Cap"])) for row in csv.DictReader(handle, delimiter=fmt.delimiter)]
    with (directory / "players.csv").open(encoding=fmt.encoding, newline="") as handle:
        players = [SourcePlayer(int(row["Unique ID"]), row["Name"],
                                tuple(nations[n.strip()] for n in row["Nation"].split("/")), row["Position"],
                                int(row["Club ID"]), int(row["Wage"]), int(row["Value"]),
                                source_date(row["Date Of Birth"]),
                                None if row["Contract End"] == fmt.missing_date else source_date(row["Contract End"]))
                   for row in csv.DictReader(handle, delimiter=fmt.delimiter)]
    if len({club.id for club in clubs}) != len(clubs) or len({player.id for player in players}) != len(players):
        raise ValueError("Duplicate source ID")
    return clubs, players, {code: name for name, code in nations.items()}
