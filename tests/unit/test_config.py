import copy
import json
from pathlib import Path
from dataclasses import FrozenInstanceError

import pytest

from core.config.consistency import ConfigError
from infrastructure.config.loader import config_payload, decode_config, config_fingerprint, merge


def test_file_override_is_applied_and_missing_path_is_rejected(tmp_path):
    from infrastructure.config.loader import load_config
    directory = Path(__file__).resolve().parents[2] / "config"
    override = tmp_path / "rules.json"
    override.write_text(json.dumps({"moteur_match":{"transitions":{"k_prog":0.0123}}}), "utf-8")
    assert load_config(directory, override).engine.transitions.progression_sensitivity == 0.0123
    with pytest.raises(ConfigError): load_config(directory, tmp_path / "absent")


def test_immutable_roundtrip(config):
    assert config_fingerprint(config) == config_fingerprint(decode_config(config_payload(config)))
    with pytest.raises(FrozenInstanceError):
        config.world.version = 42
    with pytest.raises(TypeError):
        config.formations.formations["new"] = ()
    assert isinstance(config.formations.formations["4-3-3"], tuple)


@pytest.mark.parametrize("mutation", ["unknown", "missing", "weights", "probability", "formation", "string_number"])
def test_invalid_rules_fail(config, mutation):
    raw = config_payload(config)
    if mutation == "unknown": raw["monde"]["typo"] = 1
    if mutation == "missing": del raw["moteur_match"]["transitions"]["k_prog"]
    if mutation == "weights": raw["attributs"]["composites"]["tir"]["finition"] = .7
    if mutation == "probability": raw["etats"]["blessures"]["probabilite_base_par_possession"] = 2
    if mutation == "formation": raw["formations"]["formations"]["4-3-3"].pop()
    if mutation == "string_number": raw["monde"]["version_config"] = "2"
    with pytest.raises(ConfigError):
        decode_config(raw)


def test_override_does_not_mutate_base(config):
    original = config_payload(config)
    snapshot = copy.deepcopy(original)
    changed = merge(original, {"moteur_match": {"transitions": {"k_prog": .06}}})
    assert original == snapshot
    assert decode_config(changed).engine.transitions.progression_sensitivity == .06
    assert "_autres" in config.attributes.generation_profiles.profiles["GB"]


def test_arrival_stability_configuration(config):
    raw = config_payload(config)
    raw["ia_gestion"]["mercato"]["stabilite_apres_arrivee_jours"] = -1
    with pytest.raises(ConfigError): decode_config(raw)
    del raw["ia_gestion"]["mercato"]["stabilite_apres_arrivee_jours"]
    assert decode_config(raw).management.market.arrival_stability_days == 180


@pytest.mark.parametrize("key,value", [
    ("gain_minimum_rotation", 0), ("poids_deficit_temps_jeu", -1),
    ("marge_potentiel_reference", 0), ("minutes_utiles_minimum", 0),
    ("intervalle_rotation_minutes", 0), ("rotations_par_fenetre", 0),
    ("affinite_minimum_rotation", 1.5),
    ("facteur_rotation_equipe_menee", 2.0), ("facteur_ecart_avantage_confortable", 0.5),
])
def test_invalid_rotation_rules(config, key, value):
    raw = config_payload(config)
    raw["etats"]["remplacements"][key] = value
    with pytest.raises(ConfigError):
        decode_config(raw)
