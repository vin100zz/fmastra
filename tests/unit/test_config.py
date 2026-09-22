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


@pytest.mark.parametrize("key,value", [
    ("marge_depassement_club", -1), ("ambition_base", 1.5), ("ambition_base", -0.1),
    ("ambition_poids_ego", -1), ("ecart_frustration_maximale", 0),
    ("seuil_depart_souhaite", 1.5), ("poids_frustration_moral", 2),
])
def test_invalid_star_departure_rules(config, key, value):
    raw = config_payload(config)
    raw["ia_gestion"]["mercato"][key] = value
    with pytest.raises(ConfigError):
        decode_config(raw)


def test_star_departure_rules_default_for_older_configurations(config):
    raw = config_payload(config)
    for key in ("marge_depassement_club", "ambition_base", "ambition_poids_ego",
                "ecart_frustration_maximale", "seuil_depart_souhaite", "poids_frustration_moral"):
        del raw["ia_gestion"]["mercato"][key]
    rules = decode_config(raw).management.market
    assert (rules.club_outgrown_margin, rules.ambition_base, rules.ambition_ego_weight) == (10.0, 0.6, 0.4)
    assert (rules.frustration_span, rules.leave_threshold, rules.frustration_morale_weight) == (15.0, 0.3, 0.6)


def test_level_curve_passes_through_points_and_interpolates_geometrically(config):
    from math import sqrt
    from core.world.importation.synthesis import level_value
    curve = config.management.valuation.level_curve
    assert len(curve) >= 2
    for row in curve:
        assert level_value(row.level, config) == pytest.approx(row.value)
    for left, right in zip(curve, curve[1:]):
        assert level_value((left.level + right.level) / 2, config) == pytest.approx(sqrt(left.value * right.value))


def test_level_curve_continues_past_its_ends_with_the_nearest_slope(config):
    from core.world.importation.synthesis import level_value
    curve = config.management.valuation.level_curve
    assert level_value(curve[-1].level + 5, config) > curve[-1].value * 1.2
    assert 0 < level_value(curve[0].level - 5, config) < curve[0].value


def test_star_values_reach_realistic_amounts(config):
    from core.domain.players import Position
    from core.world.importation.synthesis import intrinsic_value
    # The exponential valuation capped the best player near 56 M€, a third of real prices.
    star = intrinsic_value(88, 25, Position("MOC"), config)
    assert 150_000_000 <= star <= 300_000_000
    assert intrinsic_value(70, 28, Position("DC"), config) == 18_000_000
    assert intrinsic_value(60, 28, Position("DC"), config) < 1_000_000


@pytest.mark.parametrize("curve", [
    [{"niveau": 60, "valeur": 1_000_000}],
    [{"niveau": 60, "valeur": 1_000_000}, {"niveau": 60, "valeur": 2_000_000}],
    [{"niveau": 70, "valeur": 1_000_000}, {"niveau": 60, "valeur": 2_000_000}],
    [{"niveau": 60, "valeur": 2_000_000}, {"niveau": 70, "valeur": 1_000_000}],
    [{"niveau": 60, "valeur": 0}, {"niveau": 70, "valeur": 1_000_000}],
])
def test_invalid_level_curve_is_rejected(config, curve):
    raw = config_payload(config)
    raw["ia_gestion"]["valorisation"]["courbe_niveau"] = curve
    with pytest.raises(ConfigError):
        decode_config(raw)


def test_older_configurations_keep_the_exponential_valuation(config):
    from math import exp
    from core.world.importation.synthesis import level_value
    raw = config_payload(config)
    del raw["ia_gestion"]["valorisation"]["courbe_niveau"]
    older = decode_config(raw)
    assert older.management.valuation.level_curve == ()
    for level in (55, 70, 88):
        assert level_value(level, older) == pytest.approx(1_000_000 * exp(0.115 * (level - 55)))


@pytest.mark.parametrize("domain,section,key,value", [
    ("moteur_match", "cartons", "agressivite_min", 0), ("moteur_match", "cartons", "agressivite_min", 1.5),
    ("moteur_match", "cartons", "agressivite_max", 0.9), ("moteur_match", "cartons", "poids_agressivite_tacle", -1),
    ("moteur_match", "cartons", "agressivite_note_reference", 2.0),
    ("moteur_match", "occasion", "sensibilite_livraison", -0.01),
    ("etats", "blessures", "fragilite_note_reference", 20.0), ("ia_gestion", "contrats", "ego_note_reference", 3.0),
])
def test_invalid_trait_and_delivery_rules(config, domain, section, key, value):
    raw = config_payload(config)
    raw[domain][section][key] = value
    with pytest.raises(ConfigError):
        decode_config(raw)


def test_trait_and_delivery_rules_default_for_older_configurations(config):
    from infrastructure.persistence.store import MIGRATION_DEFAULTS
    raw = config_payload(config)
    added = [(path, defaults) for introduced, path, defaults in MIGRATION_DEFAULTS if introduced == 12]
    assert added
    for (domain, section), defaults in added:
        for key in defaults: del raw[domain][section][key]
    older = decode_config(raw)
    # The model defaults, the save migration and the shipped configuration describe the same rules.
    assert older == config
    restored = config_payload(older)
    for (domain, section), defaults in added:
        assert {key: restored[domain][section][key] for key in defaults} == defaults


def test_reputation_rules_default_for_configurations_without_the_section(config):
    from infrastructure.persistence.store import MIGRATION_DEFAULTS
    added = [(path, defaults) for introduced, path, defaults in MIGRATION_DEFAULTS if introduced == 13]
    assert {path for path, _ in added} == {("monde", "reputation"), ("benchmarks", "economie")}
    raw = config_payload(config)
    for (domain, section), defaults in added:
        # A whole new section is absent from an older configuration; new keys of an existing one are missing.
        if section == "reputation": del raw[domain][section]
        else:
            for key in defaults: del raw[domain][section][key]
    older = decode_config(raw)
    # The model defaults, the save migration and the shipped configuration describe the same rules.
    assert older == config
    restored = config_payload(older)
    for (domain, section), defaults in added:
        assert {key: restored[domain][section][key] for key in defaults} == defaults


@pytest.mark.parametrize("domain,section,key,value", [
    ("monde", "reputation", "lissage", 0), ("monde", "reputation", "lissage", 1.5),
    ("monde", "reputation", "hausse_max", -1), ("monde", "reputation", "niveau_min_plafond", 0),
    ("monde", "reputation", "qualification_europe", {"C2": 1.0}),
    ("monde", "reputation", "bornes", {"min": 5.0, "max": 1.0}), ("monde", "reputation", "bornes", {"min": 0.0, "max": 150.0}),
])
def test_incoherent_reputation_rules_are_rejected(config, domain, section, key, value):
    raw = config_payload(config)
    raw[domain][section][key] = value
    with pytest.raises(ConfigError):
        decode_config(raw)


def test_regen_rules_default_for_configurations_made_before_them(config):
    from infrastructure.persistence.store import MIGRATION_DEFAULTS
    added = [(path, defaults) for introduced, path, defaults in MIGRATION_DEFAULTS if introduced == 14]
    assert {path for path, _ in added} == {("demographie", "cohorte"), ("demographie", "generation")}
    raw = config_payload(config)
    for (domain, section), defaults in added:
        for key in defaults: del raw[domain][section][key]
    older = decode_config(raw)
    # The model defaults, the save migration and the shipped configuration describe the same rules.
    assert older == config
    restored = config_payload(older)
    for (domain, section), defaults in added:
        assert {key: restored[domain][section][key] for key in defaults} == defaults


@pytest.mark.parametrize("section,key,value", [
    ("cohorte", "probabilite_club_national", 1.5), ("cohorte", "part_hors_tri", -0.1),
    ("cohorte", "intensite_tri_centres", -1), ("cohorte", "poids_reputation_tri", -0.5),
    ("generation", "poids_age", [1.0, 1.0]), ("generation", "poids_age", [0.0, 0.0, 0.0, 0.0]),
    ("generation", "poids_age", [1.0, -0.5, 1.0, 1.0]), ("generation", "exposant_nations_elite", 0),
    ("generation", "exposant_nations_elite", 1.5), ("generation", "part_plancher_nation", -0.001),
    ("generation", "noms_minimum_par_nation", 0), ("generation", "seuil_potentiel_elite", 150.0),
])
def test_incoherent_regen_rules_are_rejected(config, section, key, value):
    raw = config_payload(config)
    raw["demographie"][section][key] = value
    with pytest.raises(ConfigError):
        decode_config(raw)
