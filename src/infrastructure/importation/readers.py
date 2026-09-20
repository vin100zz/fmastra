"""Strict UTF-8 CSV reader for the attribute-bearing export."""
from __future__ import annotations

import csv
import re
from pathlib import Path

from core.config.model import Config
from core.domain.date import Date
from core.domain.players import Attributes, ATTRIBUTE_NAMES
from core.world.importation.records import SourceClub, SourcePlayer
from core.world.importation.source_positions import POSITION_COLUMNS
from .nations import ALIASES

# Preserve supplied notes: the engine's 1-100 storage is five times the CSV note.
# An attribute fed by several columns takes their mean: dead-ball skill is Corners and FreeKicks (r = 0.78).
ATTRIBUTE_COLUMNS = {
    "passe": ("Passing",), "technique": ("Technique",), "finition": ("Finishing",), "tacle": ("Tackling",),
    "jeu_tete": ("Heading",), "vision": ("Creativity",), "placement": ("Positioning",),
    "sang_froid": ("Composure",), "vitesse": ("Pace",), "endurance": ("Stamina",), "reflexes": ("Reflexes",),
    "sorties": ("RushingOut",), "relance": ("Kicking",), "centre": ("Crossing",), "cpa": ("Corners", "FreeKicks")}


def source_date(value: str) -> Date:
    return Date.parse(value)


def bounded(row: dict, key: str, low: int, high: int) -> int:
    value = int(row[key])
    if not low <= value <= high:
        raise ValueError(f"{row.get('UID')}: {key} outside [{low}, {high}]: {value}")
    return value


def note(row: dict, *keys: str) -> float:
    return sum(bounded(row, key, 1, 20) for key in keys) / len(keys)


def optional_note(row: dict, *keys: str) -> float | None:
    """Mean of source notes that only feed personality traits; None when the export lacks a column."""
    return None if any(not row.get(key) for key in keys) else note(row, *keys)


def facility(row: dict, key: str) -> int | None:
    if row[key] in ("", "-1", "0"): return None
    return bounded(row, key, 1, 20)


def hex_color(row: dict, key: str) -> str | None:
    return row[key] or None


def reserve_team(row: dict) -> bool:
    """Some standalone B-team exports incorrectly point MainTeamUID at themselves."""
    if (row.get("MainTeamUID", "") not in ("", "0", "-1", row["UID"])
            or row.get("TeamTypeCode", "0") not in ("", "0")):
        return True
    name = row.get("ShortName") or row["Name"]
    return bool(re.search(r"\s(?:B|C|II|III|2|U[- ]?23|U[- ]?21)$", name, re.IGNORECASE)
                or row["UID"] in {"1737"})  # Real Madrid Castilla, named without a B suffix.


def read_sources(directory: Path, cfg: Config) -> tuple[list[SourceClub], list[SourcePlayer], dict[str, str]]:
    fmt = cfg.import_settings.source_format
    if fmt.wage_unit != "euros_par_semaine":
        raise ValueError("Unsupported wage unit")
    with (directory / "nations.csv").open(encoding="utf-8-sig", newline="") as handle:
        nations = {row["name"]: row["code"] for row in csv.DictReader(handle)}
    nations["Allemagne de l'Est"] = "GDR"
    names = {code: name for name, code in nations.items()}
    for alias, canonical in ALIASES.items():
        nations[alias] = nations[canonical]
        names[nations[alias]] = alias
    def rows(filename: str):
        with (directory / filename).open(encoding=fmt.encoding, newline="") as handle:
            yield from csv.DictReader(handle, delimiter=fmt.delimiter)
    clubs = [SourceClub(int(row["UID"]), row.get("ShortName") or row["Name"], nations[row["Nation"]],
                        int(row["DivisionUID"] or -1), int(row["StadiumCapacity"] or 0),
                        facility(row, "TrainingFacilities"), facility(row, "YouthRecruitment"),
                        int(row["HomeKitID"]) if row["HomeKitID"] else None,
                        hex_color(row, "HomeKitMajorColorRGB"), hex_color(row, "HomeKitMinorColorRGB"),
                        hex_color(row, "HomeKitThirdColorRGB"),
                        bounded(row, "Reputation", 0, 10000) if row.get("Reputation") else None,
                        reserve_team(row))
             for row in rows("clubs.csv")]
    players = []
    for row in rows("players.csv"):
        ca, pa = bounded(row, "CurrentAbility", 1, 200), bounded(row, "PotentialAbility", 1, 200)
        if pa < ca: raise ValueError(f"{row['UID']}: PotentialAbility is below CurrentAbility")
        ratings = {position: max(bounded(row, f"Position_{column}", 1, 20) for column in columns)
                   for position, columns in POSITION_COLUMNS.items()}
        players.append(SourcePlayer(
            int(row["UID"]), row["Name"], tuple(nations[n.strip()] for n in row["Nation"].split("/")),
            row["Position"], int(row["ClubUID"] or fmt.free_agent_club_id),
            int(row["WeeklyWage"] or 0), int(row["Value"] or 0), source_date(row["DateOfBirth"]),
            source_date(row["ContractEnd"]) if row["ContractEnd"] else None,
            Attributes(tuple(note(row, *ATTRIBUTE_COLUMNS[name]) * 5 for name in ATTRIBUTE_NAMES)),
            ca, pa, ratings, row["FirstName"], row["LastName"], row["CommonName"],
            injury_proneness=optional_note(row, "InjuryProneness"), ambition=optional_note(row, "Ambition"),
            aggression=optional_note(row, "Aggression", "Dirtiness")))
    if len({club.id for club in clubs}) != len(clubs) or len({player.id for player in players}) != len(players):
        raise ValueError("Duplicate source ID")
    return clubs, players, names
