"""Initial national strength uses the engine's 1–100 scale, not a live ranking."""
from dataclasses import field
from typing import Literal
from pydantic import Field, model_validator
from pydantic.dataclasses import dataclass
from core.config.types import MODEL_CONFIG


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class NationConfig:
    federation: Literal["Europe", "AmSud", "AmNord", "Afrique", "Asie", "Oceanie"]
    active: bool
    strength: float = Field(default=40.0, ge=1, le=100)


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class InternationalConfig:
    first_euro: int = 2028
    first_world_cup: int = 2030
    selection_noise: float = Field(default=1.5, ge=0, le=5)
    qualification_noise: float = Field(default=2.0, ge=0, le=5)
    # Player ID -> nation code or configured nation name, for known historical allegiances.
    historical_nations: dict[int, str] = field(default_factory=dict)

    @model_validator(mode="after")
    def check_years(self):
        if self.first_euro % 2 or self.first_world_cup % 2 or (self.first_world_cup - self.first_euro) % 4 != 2:
            raise ValueError("International tournaments must alternate in even years")
        return self
