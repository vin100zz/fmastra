"""Compiled typed JSON serialization; game entities stay independent of persistence."""
from dataclasses import dataclass
from random import Random
from typing import Annotated, Any

from pydantic import GetPydanticSchema, ConfigDict, PlainSerializer, TypeAdapter
from pydantic_core import core_schema

from core.config.model import Config
from core.domain.world import World
from infrastructure.config.loader import config_payload


def restore_random(value: list | Random) -> Random:
    if isinstance(value, Random): return value
    version, state, gaussian = value
    rng = Random(0)
    rng.setstate((version, tuple(state), gaussian))
    return rng


def random_schema(source: Any, handler: Any) -> core_schema.CoreSchema:
    return core_schema.no_info_after_validator_function(
        restore_random,
        core_schema.json_or_python_schema(json_schema=core_schema.list_schema(),
                                           python_schema=core_schema.union_schema([core_schema.is_instance_schema(Random), core_schema.list_schema()])),
        serialization=core_schema.plain_serializer_function_ser_schema(lambda rng: rng.getstate(), when_used="json"))


SavedRandom = Annotated[Random, GetPydanticSchema(random_schema)]
# The rules a game was created with are written whole, a value equal to today's default included: a save leaves its defaults
# out, and a default changed in a later version must not change the rules of a game already under way.
SavedConfig = Annotated[Config, PlainSerializer(config_payload, when_used="json")]


@dataclass
class SavedWorld(World):
    __pydantic_config__ = ConfigDict(extra="forbid", allow_inf_nan=False)
    config: SavedConfig
    rngs: dict[str, SavedRandom] = None


@dataclass
class SaveEnvelope:
    __pydantic_config__ = ConfigDict(extra="forbid", allow_inf_nan=False)
    schema_version: int
    application_version: str
    python_version: str
    config_hash: str
    world: SavedWorld


ADAPTER = TypeAdapter(SaveEnvelope)
