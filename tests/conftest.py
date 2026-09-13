from pathlib import Path
import pytest
from infrastructure.config.loader import load_config

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def config():
    return load_config(ROOT / "config")
