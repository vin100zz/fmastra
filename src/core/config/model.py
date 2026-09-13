"""The complete game configuration."""
from pydantic import Field
from pydantic.dataclasses import dataclass
from .types import MODEL_CONFIG
from .models.world import WorldConfig
from .models.import_settings import ImportSettingsConfig
from .models.attributes import AttributesConfig
from .models.involvement import InvolvementConfig
from .models.formations import FormationsConfig
from .models.engine import EngineConfig
from .models.states import StatesConfig
from .models.management import ManagementConfig
from .models.demography import DemographyConfig
from .models.benchmarks import BenchmarksConfig

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class Config:
    world: WorldConfig = Field(alias="monde")
    import_settings: ImportSettingsConfig = Field(alias="import")
    attributes: AttributesConfig = Field(alias="attributs")
    involvement: InvolvementConfig = Field(alias="implications")
    formations: FormationsConfig = Field(alias="formations")
    engine: EngineConfig = Field(alias="moteur_match")
    states: StatesConfig = Field(alias="etats")
    management: ManagementConfig = Field(alias="ia_gestion")
    demography: DemographyConfig = Field(alias="demographie")
    benchmarks: BenchmarksConfig = Field(alias="benchmarks")
