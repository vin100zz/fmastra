"""Explicit tagged data codec. No pickle or imports named by save contents."""
from __future__ import annotations

from dataclasses import fields, is_dataclass
from enum import Enum
from random import Random
from typing import Any

from core.config.model import Config
from core.domain.date import Date
from core.domain.players import Attributes, Contract, Discipline, Injury, Player, Position
from core.domain.clubs import Club, ClubPersonality, ClubStatus, Competition
from core.domain.matches import Match, MatchEvent, MatchResult, PlayerMatchStats, TeamStats, SubmittedLineup
from core.domain.world import World, JournalEntry, SeasonRecord, TransferRecord, MovementSnapshot
from core.domain.offers import RenewalProposal, TransferOffer
from core.domain.finance import FinanceSeason, MonthlyFinance
from core.domain.international import NationalTeam, InternationalEdition, NationalCamp, InternationalRecord, InternationalState, InternationalCareer
from infrastructure.config.loader import config_payload, decode_config

ENTITIES = {cls.__name__: cls for cls in (Date, Attributes, Contract, Discipline, Injury, Player,
            Club, ClubPersonality, Competition, Match, MatchEvent, MatchResult, PlayerMatchStats, TeamStats,
            World, JournalEntry, SeasonRecord, TransferRecord, MovementSnapshot, TransferOffer, FinanceSeason, MonthlyFinance,
            SubmittedLineup, RenewalProposal)}
ENUMS = {cls.__name__: cls for cls in (Position, ClubStatus)}
ENTITIES.update({cls.__name__: cls for cls in (NationalTeam, InternationalEdition, NationalCamp, InternationalRecord, InternationalState, InternationalCareer)})


def encode(value: Any) -> Any:
    if isinstance(value, Enum):
        return {"$enum": type(value).__name__, "value": value.value}
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Config):
        return {"$config": config_payload(value)}
    if isinstance(value, Random):
        return {"$rng": encode(value.getstate())}
    if is_dataclass(value):
        name = type(value).__name__
        if name not in ENTITIES:
            raise TypeError(f"Unregistered save entity {name}")
        return {"$type": name, "fields": {field.name: encode(getattr(value, field.name)) for field in fields(value)}}
    if isinstance(value, dict):
        return {"$map": [[encode(key), encode(item)] for key, item in value.items()]}
    if isinstance(value, tuple):
        return {"$tuple": [encode(item) for item in value]}
    if isinstance(value, list):
        return [encode(item) for item in value]
    raise TypeError(f"Unsupported save value {type(value).__name__}")


def decode(value: Any) -> Any:
    if isinstance(value, list):
        return [decode(item) for item in value]
    if not isinstance(value, dict):
        return value
    if "$config" in value:
        return decode_config(value["$config"])
    if "$enum" in value:
        return ENUMS[value["$enum"]](value["value"])
    if "$rng" in value:
        rng = Random(0)
        rng.setstate(decode(value["$rng"]))
        return rng
    if "$tuple" in value:
        return tuple(decode(item) for item in value["$tuple"])
    if "$map" in value:
        entries = [(decode(key), decode(item)) for key, item in value["$map"]]
        result = dict(entries)
        if len(result) != len(entries):
            raise ValueError("Duplicate keys in save mapping")
        return result
    if "$type" in value:
        cls = ENTITIES[value["$type"]]
        if cls is Club:
            value["fields"].setdefault("division_id", None)
            for name in ("training_facilities", "youth_recruitment", "home_kit_id",
                        "home_kit_major_color", "home_kit_minor_color", "home_kit_third_color"):
                value["fields"].setdefault(name, None)
        if cls is Player:
            for name, default in (("national_team", None), ("international_caps", 0), ("international_goals", 0),
                                  ("historical_caps", 0), ("historical_goals", 0), ("international_discipline", {"$map": []})):
                value["fields"].setdefault(name, default)
            for name in ("source_current_ability", "source_potential_ability"):
                value["fields"].setdefault(name, None)
            value["fields"].setdefault("position_ratings", {"$map": []})
        if cls is World and "offers" not in value["fields"]:
            value["fields"]["offers"] = {"$map": []}
        if cls is InternationalState:
            value["fields"].setdefault("last_camps", {"$map": []})
        if cls is World:
            value["fields"].setdefault("international", encode(InternationalState()))
            for name, default in (("finance_history", {"$map": []}), ("finance_history_since", None), ("movement_history_since", None)):
                value["fields"].setdefault(name, default)
        if cls is MovementSnapshot:
            value["fields"].setdefault("potential", None)
        if cls is TransferRecord:
            value["fields"].setdefault("born", None)
            value["fields"].setdefault("snapshot", None)
            value["fields"].setdefault("kind", "transfer")
            value["fields"].setdefault("season", None)
        expected = {field.name for field in fields(cls)}
        if set(value["fields"]) != expected:
            raise ValueError(f"Save fields for {cls.__name__} need a migration")
        return cls(**{key: decode(item) for key, item in value["fields"].items()})
    raise ValueError("Unrecognized tagged save object")
