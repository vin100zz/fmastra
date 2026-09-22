"""Atomic gzip JSON saves and safe named slots."""
from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import os
import platform
import re
import tempfile
from pathlib import Path

from core.domain.world import World
from core.world.demography import initialize_targets
from core.world.reputation import initialize_reputation
from core.world.validation import validate_world
from infrastructure.config.loader import config_fingerprint, config_payload
from infrastructure.importation.readers import ATTRIBUTE_COLUMNS, note
from .codec import encode, decode
from .typed_codec import ADAPTER, SaveEnvelope
from core.config.consistency import validate_consistency
from .history_migration import upgrade_history, recover_birthdates

SCHEMA_VERSION = 15
# Rules introduced by each schema version, newest first, with the value
# an older embedded configuration receives from the model defaults.
MIGRATION_DEFAULTS = (
    # Regens placed by academy and country: an older save is given the rules its next cohort is drawn with.
    (14, ("demographie", "cohorte"), {
         "probabilite_club_national": 0.9, "part_hors_tri": 0.10, "intensite_tri_centres": 10.0, "poids_reputation_tri": 0.0}),
    (14, ("demographie", "generation"), {
         "poids_age": [0.45, 0.35, 0.15, 0.05], "seuil_potentiel_elite": 85.0, "exposant_nations_elite": 0.5,
         "part_plancher_nation": 0.0002, "noms_minimum_par_nation": 20}),
    (13, ("benchmarks", "economie"), {
         "derive_reputation_moyenne_max": 3.0, "derive_reputation_dispersion_max": 0.25, "variation_reputation_annuelle_min": 0.5,
         "variation_reputation_annuelle_max": 3.0, "variation_reputation_saut_max": 20.0, "persistance_top10_reputation_min": 0.6}),
    # Yearly reputation revision: an older save is given the rules it is revised with from its next July on.
    (13, ("monde", "reputation"), {
         "lissage": 0.4, "gain_par_division": 6.0, "amplitude_classement": 3.0, "marge_plafond": 0.0,
         "niveau_min_plafond": 2, "hausse_max": 15.0, "bornes": {"min": 1.0, "max": 100.0},
         "qualification_europe": {"C1": 3.0, "C3": 1.5, "C4": 0.75},
         "palmares": {"decroissance": 0.7, "championnat_par_niveau": [4.0, 1.5, 0.5], "coupe_nationale": 2.0,
                      "coupe_europe": {"C1": 6.0, "C3": 3.0, "C4": 1.5}}}),
    # Player traits read from the source, delivery quality and foul propensity. `poids_agressivite_tacle` keeps
    # its older value in an older save: as an exponent of 0.006 the foul propensity is practically neutral there.
    (12, ("etats", "blessures"), {"fragilite_note_basse": 2.3, "fragilite_note_reference": 8.3, "fragilite_note_haute": 14.3}),
    (12, ("ia_gestion", "contrats"), {"ego_note_basse": 8.4, "ego_note_reference": 12.4, "ego_note_haute": 16.4}),
    (12, ("moteur_match", "occasion"), {"sensibilite_livraison": 0.02, "niveau_reference_centre": 45.6,
                                        "niveau_reference_cpa": 55.3, "niveau_reference_coup_franc": 58.8}),
    (12, ("moteur_match", "cartons"), {"agressivite_min": 0.25, "agressivite_max": 2.0, "agressivite_note_basse": 4.0,
                                       "agressivite_note_reference": 10.5, "agressivite_note_haute": 17.0}),
    # An empty curve keeps the exponential valuation the older save was played with.
    (11, ("ia_gestion", "valorisation"), {"courbe_niveau": []}),
    (10, ("ia_gestion", "mercato"), {
         "marge_depassement_club": 10.0, "ambition_base": 0.6, "ambition_poids_ego": 0.4,
         "ecart_frustration_maximale": 15.0, "seuil_depart_souhaite": 0.3, "poids_frustration_moral": 0.6}),
    (9, ("etats", "remplacements"), {
         "gain_minimum_rotation": 10.0, "poids_deficit_temps_jeu": 8.0,
         "poids_developpement_jeunes": 10.0, "marge_potentiel_reference": 20.0,
         "minutes_utiles_minimum": 15, "intervalle_rotation_minutes": 10,
         "rotations_par_fenetre": 2, "affinite_minimum_rotation": 0.5,
         "facteur_rotation_match_serre": 0.5, "facteur_rotation_equipe_menee": 0.25,
         "facteur_ecart_avantage_confortable": 2.0}),
    (8, ("ia_gestion", "mercato"), {"profondeur_effectif_min": 16, "profondeur_effectif_max": 20,
         "reputation_profondeur_min": 50.0, "reputation_profondeur_max": 80.0, "poids_profondeur_vente": 0.75,
         "tolerance_baisse_reputation": 5.0, "marge_niveau_joueur": 2.0, "moral_depart_force": 0.5,
         "talents_visibles": 10, "jours_encheres": 2}),
    (7, ("ia_gestion", "mercato"), {"gain_qualite_min_recrutement": 3.0}),
    (6, ("ia_gestion", "mercato"), {"stabilite_apres_arrivee_jours": 180}),
)
# Attributes `centre` and `cpa` were appended at schema 12. Players whose source row is unavailable receive the level
# generation gives their position: rating plus these offsets, as in `profils_generation` of that version.
LEGACY_ATTRIBUTE_COUNT = 13
DELIVERY_OFFSETS = {"GB": (-25, -25), "DC": (-27, -37), "DL": (1, -17), "DR": (-2, -24), "MDC": (-19, -20),
                    "MC": (-14, -16), "MOC": (-10, -11), "AILG": (-6, -15), "AILD": (-4, -15), "BU": (-20, -25)}
# Level 6 spends ~2.5x the time of level 3 for a few percent of file size on large worlds; not worth it here.
COMPRESSION_LEVEL = 3


class SaveError(ValueError):
    pass


class SaveStore:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def path_for(self, slot: str) -> Path:
        if not re.fullmatch(r"[\w-]{1,64}", slot, re.UNICODE):
            raise SaveError("Nom de sauvegarde invalide (lettres, chiffres, tirets uniquement).")
        return self.directory / f"{slot}.json.gz"

    def save(self, world: World, slot: str) -> Path:
        target = self.path_for(slot)
        self.directory.mkdir(parents=True, exist_ok=True)
        payload = SaveEnvelope(SCHEMA_VERSION, "0.1.0", platform.python_version(), config_fingerprint(world.config), world)
        raw = ADAPTER.dump_json(payload, by_alias=True, warnings="error")
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=self.directory, prefix=".save-", suffix=".tmp", delete=False) as handle:
                temporary = Path(handle.name)
                with gzip.GzipFile(fileobj=handle, mode="wb", compresslevel=COMPRESSION_LEVEL, mtime=0) as archive:
                    archive.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, target)
            return target
        finally:
            if temporary and temporary.exists():
                temporary.unlink()

    def load(self, slot: str) -> World:
        target = self.path_for(slot)
        try:
            with gzip.open(target, "rb") as handle:
                raw = handle.read()
            # Version 1 used tagged entities; it remains readable during migration.
            if b'"schema_version":1,' in raw[:100] or b'"schema_version": 1,' in raw[:100]:
                payload = json.loads(raw)
                world, fingerprint = decode(payload["world"]), payload["config_hash"]
                version = 1
            else:
                found = re.search(rb'"schema_version":\s*(\d+)', raw[:100])
                if found and int(found.group(1)) < SCHEMA_VERSION:
                    raw = _extend_attribute_vectors(raw, self.directory.parent / "data" / "players.csv")
                payload = ADAPTER.validate_json(raw)
                if not 2 <= payload.schema_version <= SCHEMA_VERSION:
                    raise SaveError("Version de sauvegarde incompatible ; une migration est nécessaire.")
                world, fingerprint = payload.world, payload.config_hash
                version = payload.schema_version
            if not isinstance(world, World) or not _config_matches(world, fingerprint, version):
                raise SaveError("Sauvegarde incohérente : configuration ou racine invalide.")
            if not {"matches", "market", "states", "progression", "demography"}.issubset(world.rngs):
                raise SaveError("Sauvegarde incomplète : flux aléatoires manquants.")
            validate_consistency(world.config)
            upgrade_history(world)
            initialize_reputation(world)
            initialize_targets(world)
            recover_birthdates(world, self.directory.parent / 'data' / 'players.csv')
            validate_world(world)
            return world
        except (OSError, KeyError, TypeError, ValueError, EOFError) as exc:
            raise SaveError(f"Impossible de charger {slot} : {exc}") from exc

    def delete(self, slot: str) -> None:
        target = self.path_for(slot)
        try:
            target.unlink()
        except FileNotFoundError as exc:
            raise SaveError(f"Sauvegarde introuvable : {slot}") from exc

    def slots(self) -> list[dict[str, object]]:
        if not self.directory.exists():
            return []
        return [{"slot": path.name.removesuffix(".json.gz"), "bytes": path.stat().st_size,
                 "modified": path.stat().st_mtime} for path in sorted(self.directory.glob("*.json.gz"))]


def _source_delivery(world: dict, source_path: Path, wanted: set[int]) -> dict[int, list[float]]:
    """`centre` and `cpa` of imported players, read back only from the exact CSV the game was imported from."""
    if not source_path.is_file(): return {}
    raw = source_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != world.get("source_hashes", {}).get("players.csv"): return {}
    source = world["config"]["import"]["format_source"]
    reader = csv.DictReader(io.StringIO(raw.decode(source["encodage"])), delimiter=source["separateur"])
    return {int(row["UID"]): [note(row, *ATTRIBUTE_COLUMNS[name]) * 5 for name in ("centre", "cpa")]
            for row in reader if int(row["UID"]) in wanted}


def _extend_attribute_vectors(raw: bytes, source_path: Path) -> bytes:
    """Schema 12 appended `centre` and `cpa` to every attribute vector; vectors already extended are left alone."""
    document = json.loads(raw)
    world = document["world"]
    stale = [player for player in world["players"].values() if len(player["attributes"]["values"]) == LEGACY_ATTRIBUTE_COUNT]
    if not stale: return raw
    imported = _source_delivery(world, source_path, {player["id"] for player in stale})
    bounds = world["config"]["attributs"]["bornes"]
    for player in stale:
        extra = imported.get(player["id"]) or [min(bounds["max"], max(bounds["min"], player["rating"] + offset))
                                               for offset in DELIVERY_OFFSETS[player["position"]]]
        player["attributes"]["values"].extend(extra)
    return json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _config_matches(world: World, fingerprint: str, version: int) -> bool:
    if config_fingerprint(world.config) == fingerprint: return True
    # Verify each historical configuration before accepting only its explicit
    # migration defaults. Existing/custom rules must retain their fingerprint.
    if version >= SCHEMA_VERSION: return False
    previous = config_payload(world.config)
    if version < 15:
        from core.config.models.international import InternationalConfig
        from dataclasses import asdict
        if not previous.get("nations") and previous.get("international") == asdict(InternationalConfig()):
            previous.pop("nations", None)
            previous.pop("international", None)
        raw = json.dumps(previous, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        if hashlib.sha256(raw.encode("utf-8")).hexdigest() == fingerprint:
            return True
    for introduced, path, defaults in MIGRATION_DEFAULTS:
        if version >= introduced: continue
        rules = previous[path[0]][path[1]]
        if any(rules[key] != default for key, default in defaults.items()): return False
        for key in defaults: del rules[key]
        if not rules: del previous[path[0]][path[1]]  # A whole section that did not exist yet.
        raw = json.dumps(previous, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        if hashlib.sha256(raw.encode("utf-8")).hexdigest() == fingerprint: return True
    return False
