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
from dataclasses import replace
from pathlib import Path

from core.domain.world import NewsItem, World, history_level, history_month
from core.world.contracts import brings_something
from core.world.demography import draw_position_ratings, initialize_targets, secondary_affinities
from core.world.reputation import initialize_reputation
from core.world.transfer_rules import greed_trait
from core.world.validation import validate_world
from infrastructure.config.loader import config_fingerprint, config_payload, decode_config
from infrastructure.importation.readers import ATTRIBUTE_COLUMNS, note
from .codec import encode, decode
from .typed_codec import ADAPTER, SaveEnvelope
from core.config.consistency import validate_consistency
from .history_migration import upgrade_history, recover_birthdates

SCHEMA_VERSION = 30
# Rules introduced by each schema version, newest first, with the value
# an older embedded configuration receives from the model defaults.
MIGRATION_DEFAULTS = (
    # A player asks a new contract for a raise worth asking for, or for more years (see `_forget_small_demands`).
    (30, ("ia_gestion", "contrats"), {"hausse_min_prolongation": 0.1}),
    # Income by reputation and championship, cup prizes, idle cash spent, bounded opinions, exposure and form in a player's
    # value, scouting of leavers and prospects, dormant clubs sharing their wage cap with the players the game does not hold
    # and bringing nobody on beyond their level: an older save plays on with these rules (see `_upgrade_economy`).
    (29, ("ia_gestion", "valorisation"), {
         "opinion": {"facteur_max_jeune": 1.5, "facteur_max_mur": 1.1, "part_stable": 0.6, "ecarts_types_max": 2.0},
         "exposition": {"marge_niveau": 3.0, "decote_par_point": 0.12, "plancher": 0.05},
         "performance": {"poids_temps_de_jeu": 0.1, "poids_note": 0.2, "note_reference": 6.5, "ecart_note_plein": 0.5,
                         "facteur_min": 0.75, "facteur_max": 1.3}}),
    (29, ("ia_gestion", "budgets"), {
         "revenus_club": {
             "revenu_propre_reference": 6000000, "reputation_reference": 60.0, "pente_reputation": 0.1, "revenu_minimum": 1850000,
             "part_billetterie": 0.15, "capacite_reference": 30000, "capacite_par_defaut": 5000,
             "droits_championnat": {"ENG": [154000000, 30000000], "ITA": [60000000, 8400000], "GER": [51000000, 8800000],
                                    "ESP": [44000000, 14000000], "FRA": [21500000, 1700000, 900000]},
             "ratio_droits_autres_championnats": 1.5, "rapport_premier_dernier": 3.0},
         "primes": {
             "europe": {
                 "C1": {"participation": 8000000, "victoire": 1000000, "nul": 330000,
                        "tours": [500000, 5000000, 5500000, 7000000, 8000000], "vainqueur": 3000000},
                 "C3": {"participation": 2000000, "victoire": 200000, "nul": 70000,
                        "tours": [150000, 800000, 1100000, 1900000, 3200000], "vainqueur": 2700000},
                 "C4": {"participation": 1400000, "victoire": 180000, "nul": 60000,
                        "tours": [100000, 360000, 600000, 1100000, 1800000], "vainqueur": 1350000}},
             "coupe_nationale": {"parts_par_tour": [0.001, 0.002, 0.004, 0.008, 0.015, 0.02], "part_vainqueur": 0.02}},
         "investissements": {"mois_reserve": 6.0, "part_annuelle": 0.25},
         "modele_salaire": {"salaire_reference": 285000, "niveau_reference": 60.0, "pente_niveau": 0.15,
                            "revenu_reference": 40000000, "exposant_revenu": 0.5}}),
    (29, ("ia_gestion", "mercato"), {
         "poids_joueur_connu_club_dormant": 3.0,
         "reperage": {"partants_visibles": 10, "espoirs_visibles": 10, "age_max_espoir": 21, "probabilite_recherche_espoir": 0.5}}),
    (29, ("ia_gestion", "contrats"), {"part_surpaye_conservee": 0.5, "depassement_revenus_sans_prolongation": 1.2}),
    (29, ("demographie", "progression"), {"dormants": {"marge_niveau": 6.0, "plage_extinction": 10.0, "facteur_plancher": 0.2}}),
    (29, ("benchmarks", "economie"), {
         "croissance_tresorerie_annuelle_max": 0.05, "part_salaires_revenus_min": 0.45, "part_salaires_revenus_max": 0.62,
         "tresorerie_mediane_mois_revenu_max": 12.0, "derive_indemnites_sur_horizon_max": 0.5, "reputation_petit_club": 40.0,
         "niveau_vedette_petit_club": 65.0, "vedettes_petits_clubs_max": 30, "salaire_mensuel_petits_clubs_max": 80000}),
    # Buyers' own price limits, raised offers and outbidding: an older save trades with these rules.
    (28, ("ia_gestion", "mercato"), {"offres": {
         "prime_besoin": 1.5, "gain_besoin_plein": 10.0, "poids_appetit_risque": 0.3, "bruit_ecart_type": 0.06,
         "ecart_ouverture": 0.2, "relances_min": 1, "relances_max": 3, "pas_surenchere": 0.02, "tolerance_vendeur": 0.05,
         "malus_moral_intransferable": 0.2}}),
    # Concave minutes, training floor, reserve and loans: an older save progresses and lends with these rules.
    (25, ("demographie", "progression"), {
         "exposant_minutes": 0.5, "plancher_entrainement": {"note_1": 0.2, "note_20": 0.5},
         "reserve": {"facteur": 0.7, "age_max": 21, "marge_niveau": 6.0, "plage_extinction": 10.0}}),
    (25, ("ia_gestion", "mercato"), {"prets": {
         "age_max_ia": 21, "marge_potentiel_min": 5.0, "emprunts_max_ia": 2, "probabilite_hebdomadaire": 0.5}}),
    # Generated players rated at every position: an older save rates its regens, past and to come, with these rules.
    (24, ("demographie", "generation"), {"aptitudes_postes": {
         "notes_types": {
             "GB": {},
             "DC": {"DG": 10.0, "DD": 10.0, "MDC": 9.0, "MC": 6.0},
             "DG": {"DD": 14.0, "AILG": 12.0, "DC": 9.0, "AILD": 9.0, "MDC": 6.0, "MC": 6.0},
             "DD": {"DG": 14.0, "AILD": 12.0, "DC": 9.0, "AILG": 9.0, "MDC": 6.0, "MC": 6.0},
             "MDC": {"MC": 16.0, "DC": 9.0, "MOC": 8.0, "DG": 6.0, "DD": 6.0},
             "MC": {"MDC": 13.0, "MOC": 12.0, "AILG": 10.0, "AILD": 10.0, "DG": 6.0, "DD": 6.0, "DC": 5.0, "BU": 5.0},
             "MOC": {"MC": 14.0, "AILG": 13.0, "AILD": 13.0, "BU": 10.0, "MDC": 8.0},
             "AILG": {"AILD": 17.0, "MOC": 11.0, "BU": 11.0, "MC": 8.0, "DG": 8.0, "DD": 8.0},
             "AILD": {"AILG": 17.0, "MOC": 11.0, "BU": 11.0, "MC": 8.0, "DD": 8.0, "DG": 8.0},
             "BU": {"AILG": 11.0, "AILD": 11.0, "MOC": 9.0}},
         "postes_gauche": ["DG", "AILG"], "postes_droite": ["DD", "AILD"], "ecart_type_polyvalence": 2.0,
         "ecart_type_poste": 2.5, "probabilite_deux_cotes": 0.5, "malus_cote_oppose": 7.0, "note_min": 8}}),
    # The human club's transfer list and players offered to clubs: an older save sells with these rules.
    (20, ("ia_gestion", "mercato"), {
         "tolerance_baisse_joueur_a_vendre": 15.0, "multiplicateur_prix_max_acheteur": 1.35, "jours_relance_proposition": 14,
         "offres_max_proposition": 5}),
    # Transfer talks, asking prices by squad status and wage demands by move: an older save negotiates with these rules.
    (19, ("ia_gestion", "mercato"), {
         "coef_prix_hors_effectif": 0.45, "coef_prix_doublure": 0.75, "coef_prix_rotation": 1.0, "coef_prix_titulaire": 1.5,
         "part_minutes_pilier": 0.75, "matchs_confiance_minutes": 10, "marge_potentiel_espoir": 10.0, "tours_negociation": 3,
         "jours_rupture_negociation": 7, "delai_reponse_min_jours": 1, "delai_reponse_max_jours": 3}),
    (19, ("ia_gestion", "contrats"), {
         "prime_appat_gain": 0.15, "appat_gain_note_basse": 7.5, "appat_gain_note_reference": 11.5, "appat_gain_note_haute": 15.5,
         "hausse_par_point_reputation": 0.01, "hausse_salaire_max": 0.30, "baisse_par_point_reputation": 0.01,
         "baisse_salaire_max": 0.15}),
    # Ratings credited action by action: an older save keeps its older scale for goals, saves and cards,
    # and rates tackles, losses, key passes and results from its next match on.
    (18, ("moteur_match", "notes_joueurs"), {
         "sensibilite_qualite": 0.05, "progression_par_zone": [0.0, 0.01, 0.02, 0.04],
         "recuperation_par_zone": [0.07, 0.04, 0.025, 0.015], "perte_par_zone": [-0.04, -0.03, -0.02, -0.01],
         "part_dribbles": 0.3, "sensibilite_dribble": 0.08, "defenseur_elimine": -0.02, "passe_cle": 0.1,
         "participation_occasion": 0.03, "tir_non_cadre": -0.03, "part_non_cadres_contres": 0.4, "contre": 0.05,
         "defenseur_battu": -0.15, "victoire": 0.1, "sans_encaisser": 0.25, "minutes_sans_encaisser": 60,
         "attendu_par_minute": 0.0055}),
    (18, ("benchmarks", "stats_match"), {"note_moyenne_poste_min": 6.4, "note_moyenne_poste_max": 6.6}),
    # Mentality chosen during a live match: an older save is given the block height shifts of its first live match.
    (17, ("formations", "hauteur_bloc"), {"mentalites": {"defensive": -0.4, "equilibree": 0.0, "offensive": 0.4}}),
    # Bounded rating gaps and score management: an older save plays its next matches without 30-0 mismatches.
    (16, ("moteur_match", "transitions"), {"ecart_note_max": 20.0, "avance_confortable": 2, "relachement_par_but": 0.4}),
    # Regens placed by academy and country: an older save is given the rules its next cohort is drawn with.
    (14, ("demographie", "cohorte"), {
         "probabilite_club_national": 0.9, "part_hors_tri": 0.10, "intensite_tri_centres": 10.0, "poids_reputation_tri": 1.0}),
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
# Schema 21 renamed the 4-4-2 and put two variants beside it: an older save's clubs and lineups follow the new name.
RENAMED_FORMATIONS = {"4-4-2": "4-4-2 plat"}
ADDED_FORMATIONS = {"4-4-2 diamant": ("GB", "DL", "DC", "DC", "DR", "MDC", "MC", "MC", "MOC", "BU", "BU"),
                    "4-4-2 offensif": ("GB", "DL", "DC", "DC", "DR", "MDC", "MDC", "MOC", "MOC", "BU", "BU")}
# Schema 22 named the full-backs like the wingers, left and right (DL/DR became DG/DD), and put two wingers
# in place of the attacking 4-4-2's two attacking midfielders.
RENAMED_POSITIONS = {"DL": "DG", "DR": "DD"}
ATTACKING_442 = ("GB", "DG", "DC", "DC", "DD", "MDC", "MDC", "AILG", "AILD", "BU", "BU")
# Attributes `centre` and `cpa` were appended at schema 12. Players whose source row is unavailable receive the level
# generation gives their position: rating plus these offsets, as in `profils_generation` of that version.
LEGACY_ATTRIBUTE_COUNT = 13
DELIVERY_OFFSETS = {"GB": (-25, -25), "DC": (-27, -37), "DG": (1, -17), "DD": (-2, -24), "MDC": (-19, -20),
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
                world, fingerprint = decode(_rename_positions(payload["world"], skip="config")), payload["config_hash"]
                world.trajectories = _monthly_trajectories(world.trajectories, world.config.world.key_dates.population_review.month)
                version = 1
            else:
                found = re.search(rb'"schema_version":\s*(\d+)', raw[:100])
                if found and int(found.group(1)) < SCHEMA_VERSION:
                    raw = _upgrade_document(raw, int(found.group(1)), self.directory.parent / "data" / "players.csv")
                payload = ADAPTER.validate_json(raw)
                if not 2 <= payload.schema_version <= SCHEMA_VERSION:
                    raise SaveError("Version de sauvegarde incompatible ; une migration est nécessaire.")
                world, fingerprint = payload.world, payload.config_hash
                version = payload.schema_version
            if not isinstance(world, World) or not _config_matches(world, fingerprint, version):
                raise SaveError("Sauvegarde incohérente : configuration ou racine invalide.")
            if version < 21: _upgrade_formations(world)
            if version < 22: _upgrade_configured_positions(world)
            if version < 23:
                for player in world.players.values(): world.record_level(player)
            if not {"matches", "market", "states", "progression", "demography"}.issubset(world.rngs):
                raise SaveError("Sauvegarde incomplète : flux aléatoires manquants.")
            validate_consistency(world.config)
            if version < 19: _assign_greed(world, self.directory.parent / "data" / "players.csv")
            if version < 24: _rate_positions(world)
            if version < 26: _upgrade_news(world)
            if version < 27: _recall_refusals(world)
            if version < 29: _upgrade_economy(world)
            if version < 30: _forget_small_demands(world)
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


def _upgrade_document(raw: bytes, version: int, source_path: Path) -> bytes:
    """What an older save's JSON must receive before it is typed; its configuration is upgraded once verified."""
    document = json.loads(raw)
    if version < 22: document["world"] = _rename_positions(document["world"], skip="config")
    if version < 23:
        world = document["world"]
        world["trajectories"] = _monthly_trajectories(world["trajectories"], world["config"]["monde"]["dates_cles"]["bilan_demographique"]["mois"])
    _extend_attribute_vectors(document["world"], source_path)
    return json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _monthly_trajectories(trajectories: dict, opening_month: int) -> dict:
    """Schema 23: the level history became monthly. Each season point of an older save, taken when the season opened, is
    a run of its own at that month; runs already monthly are left as they are."""
    return {player: [point if isinstance(point[1], list) else (history_month(point[0], opening_month), [history_level(point[1])])
                     for point in points] for player, points in trajectories.items()}


def _rename_positions(node, skip: str | None = None):
    """Schema 22: every position code of a JSON document, value or key; the subtree under a `skip` key is left as it is."""
    if isinstance(node, dict):
        return {RENAMED_POSITIONS.get(key, key): value if key == skip else _rename_positions(value, skip) for key, value in node.items()}
    if isinstance(node, list): return [_rename_positions(item, skip) for item in node]
    return RENAMED_POSITIONS.get(node, node) if isinstance(node, str) else node


def _extend_attribute_vectors(world: dict, source_path: Path) -> None:
    """Schema 12 appended `centre` and `cpa` to every attribute vector; vectors already extended are left alone."""
    stale = [player for player in world["players"].values() if len(player["attributes"]["values"]) == LEGACY_ATTRIBUTE_COUNT]
    if not stale: return
    imported = _source_delivery(world, source_path, {player["id"] for player in stale})
    bounds = world["config"]["attributs"]["bornes"]
    for player in stale:
        extra = imported.get(player["id"]) or [min(bounds["max"], max(bounds["min"], player["rating"] + offset))
                                               for offset in DELIVERY_OFFSETS[player["position"]]]
        player["attributes"]["values"].extend(extra)


def _assign_greed(world: World, source_path: Path) -> None:
    """Schema 19 gave players an appetite for money: from the exact source CSV's loyalty, drawn otherwise."""
    loyalties = {}
    if source_path.is_file():
        raw = source_path.read_bytes()
        if hashlib.sha256(raw).hexdigest() == world.source_hashes.get("players.csv"):
            source = world.config.import_settings.source_format
            reader = csv.DictReader(io.StringIO(raw.decode(source.encoding)), delimiter=source.delimiter)
            loyalties = {int(row["UID"]): float(row["Loyality"]) for row in reader if row.get("Loyality")}
    for player in world.players.values():
        player.greed = greed_trait(loyalties.get(player.id), world.config, world.seed, player.id)


def _rate_positions(world: World) -> None:
    """Schema 24 rates generated players at every position: a player without ratings receives those his generation
    would draw today, and keeps at least the affinity he had at his secondary positions."""
    for player in world.players.values():
        if player.position_ratings: continue
        ratings = draw_position_ratings(player.position, world.config, world.seed, player.id)
        for position, affinity in player.secondary_positions.items():
            ratings[position] = max(ratings[position], round(affinity * 20))
        player.position_ratings = ratings
        player.secondary_positions = secondary_affinities(ratings, player.position)


def _upgrade_news(world: World) -> None:
    """Schema 26: the human club's feed is made of messages with lines, and no longer tells the results of its matches."""
    world.news = [item if isinstance(item, NewsItem) else
                  NewsItem(item.date, item.kind, item.text, item.club_id, item.player_id, item.match_id, item.read)
                  for item in world.news if item.kind != "result"]


def _forget_small_demands(world: World) -> None:
    """Schema 30: a demand for a raise too small to ask for, without more years, is no longer made; one still awaiting an
    answer lapses, and the player asks again when he has something to ask for. So does a demand left behind by a
    contract signed since, which an older save may hold."""
    world.pending_renewals = {pid: proposal for pid, proposal in world.pending_renewals.items()
                              if pid in world.players and brings_something(proposal.contract, world.players[pid].contract, world.config)}


def _recall_refusals(world: World) -> None:
    """Schema 27: a demand the human club turned down is no longer made again every week. The refusals an older save's
    feed tells still stand for the players who are on the contract they had then."""
    for item in world.news:
        if item.kind != "renewal_proposed" or len(item.lines) < 2 or item.lines[-1].state != "refused": continue
        player, had = world.players.get(item.player_id), item.lines[0]
        if player is None or player.owner_id != item.club_id or player.contract is None: continue
        if (player.contract.weekly_wage, player.contract.end) == (had.amount, had.until):
            world.refused_renewals[player.id] = item.date


def _upgrade_formations(world: World) -> None:
    """Schema 21: the embedded 4-4-2 becomes the flat one, the diamond and the box follow it; names already taken are kept."""
    formations = world.config.formations.formations
    renamed = {old: new for old, new in RENAMED_FORMATIONS.items() if old in formations and new not in formations}
    added = {name: roles for name, roles in ADDED_FORMATIONS.items() if name not in formations}
    if not renamed and not added: return
    upgraded = {}
    for name, roles in formations.items():
        upgraded[renamed.get(name, name)] = roles
        if name in renamed: upgraded.update(added)
    upgraded.update(added)
    world.config = replace(world.config, formations=replace(world.config.formations, formations=upgraded))
    for club in world.clubs.values(): club.formation = renamed.get(club.formation, club.formation)
    world.submitted_lineups = {mid: replace(lineup, formation=renamed.get(lineup.formation, lineup.formation))
                               for mid, lineup in world.submitted_lineups.items()}
    if world.live_match is not None:
        lineup = world.live_match.lineup
        world.live_match.lineup = replace(lineup, formation=renamed.get(lineup.formation, lineup.formation))


def _upgrade_configured_positions(world: World) -> None:
    """Schema 22 in the embedded configuration; an attacking 4-4-2 other than the one schema 21 added is kept."""
    payload = _rename_positions(config_payload(world.config))
    formations = payload["formations"]["formations"]
    if formations.get("4-4-2 offensif") == _rename_positions(list(ADDED_FORMATIONS["4-4-2 offensif"])):
        formations["4-4-2 offensif"] = list(ATTACKING_442)
    world.config = decode_config(payload)


# Rules recalibrated by schema 29, as (domain, section, inner section if any, key, value shipped before, value shipped since).
RECALIBRATED_RULES = (("management", "budgets", "accounting", "other_cost_share", 0.15, 0.30),
                      ("management", "guardrails", None, "min_balance", -5000000, 0),
                      ("demography", "potential_estimate", None, "max_noise", 22.0, 10.0),
                      ("demography", "cohort", None, "sorting_reputation_weight", 0.0, 1.0))


def _upgrade_economy(world: World) -> None:
    """Schema 29: an older save takes the recalibrated rules, and its clubs the income those rules give them.

    A rule the save still holds as it shipped takes its new value; any other was chosen, and is kept. Each club then
    earns what the new rules give it. The wages it agreed to during the game, under the former income, are first
    brought back, all in the same proportion, to what the new one pays, within what its unseen squad leaves its known
    players for a dormant club; the contracts of the import, and those of the club the user runs, stay as they are.
    What its wages still require beyond its income is supported as at the creation of a game, a support that retires
    as those contracts end. No wage cap falls under the wages a club pays or has reserved.
    """
    from core.ai.market import unseen_wages
    from core.world.finances import structural_income
    cfg = world.config
    for domain, section, inner, key, before, since in RECALIBRATED_RULES:
        rules = getattr(getattr(cfg, domain), section)
        holder = getattr(rules, inner) if inner else rules
        if getattr(holder, key) != before: continue
        holder = replace(holder, **{key: since})
        rules = replace(rules, **{inner: holder}) if inner else holder
        cfg = replace(cfg, **{domain: replace(getattr(cfg, domain), **{section: rules})})
    world.config = cfg
    budgets = cfg.management.budgets
    floor = budgets.wages.weekly_minimum
    for club in world.clubs.values():
        league = world.competitions.get(club.competition_id) if club.competition_id is not None else None
        ranked = league is not None and club.previous_rank is not None and len(league.club_ids) > 1
        place = min(1.0, (club.previous_rank - 1) / (len(league.club_ids) - 1)) if ranked else None
        base, rights = structural_income(club, cfg, (league.nation, league.level) if league else None, place)
        club.wage_cap = round(base * budgets.wage_income_share / budgets.weeks_per_year)
        if club.id != world.controlled_club_id:
            # Signed during the game by a player it pays: one it lent is still paid by it, one it borrowed by his owner.
            signed = [player for pid in [*club.player_ids, *club.loaned_ids]
                      if pid not in club.borrowed_ids and not (player := world.players[pid]).contract.synthetic]
            paid = sum(player.contract.weekly_wage for player in signed)
            # A club that plays keeps the headroom a new game gives it; a dormant one, what its unseen squad leaves.
            limit = round(club.wage_cap / budgets.initial_funding.wage_headroom) if league is not None else club.wage_cap
            over = club.wage_bill + unseen_wages(club, cfg) - limit
            if over > 0 and paid > 0:
                kept = max(0, paid - over) / paid
                for player in signed:
                    wage = max(floor, round(player.contract.weekly_wage * kept))
                    if wage < player.contract.weekly_wage:
                        club.wage_bill -= player.contract.weekly_wage - wage
                        player.contract = replace(player.contract, weekly_wage=wage)
        needed = club.wage_bill * budgets.weeks_per_year * budgets.initial_funding.wage_headroom / budgets.wage_income_share
        club.funding_factor = max(budgets.initial_funding.min_funding_factor, needed / base)
        club.income = round(base * club.funding_factor)
        club.prize_income = {"league": rights} if rights else {}
        reserved = sum(offer.contract.weekly_wage for offer in world.offers.values() if offer.target_id == club.id)
        club.wage_cap = max(club.wage_bill + reserved, round(club.income * budgets.wage_income_share / budgets.weeks_per_year) + club.wage_shift)


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
