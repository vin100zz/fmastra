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
import shutil
import tempfile
import zlib
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress
from dataclasses import replace
from pathlib import Path

from core.config.model import Config
from core.domain.players import ATTRIBUTE_INDEX
from core.config.models.management import PLANNING_ROUNDS
from core.config.models.engine import COUNTER_DANGER, DANGER, EXPECTED, RECOVERY_DANGER, SCALE
from core.domain.world import NewsItem, World, history_level, history_month
from core.world.contracts import brings_something
from core.world.application import apply
from core.world.formations import formation_events
from core.world.demography import draw_position_ratings, initialize_targets, secondary_affinities
from core.world.reputation import initialize_reputation
from core.world.age_records import initialize_age_records
from core.world.international import initialize_strengths
from core.world.international_selection import initialize_formations
from core.world.shirts import number_squads
from core.world.transfer_rules import greed_trait
from core.world.validation import validate_world
from infrastructure.config.loader import config_fingerprint, config_payload, decode_config
from infrastructure.importation.readers import ATTRIBUTE_COLUMNS, note
from .codec import encode, decode
from .typed_codec import ADAPTER, SaveEnvelope
from core.config.consistency import validate_consistency
from .history_migration import upgrade_history, recover_birthdates

SCHEMA_VERSION = 45
# Rules introduced by each schema version, newest first, with the value
# an older embedded configuration receives from the model defaults.
MIGRATION_DEFAULTS = (
    # What a club sees of a player is read in stars, its error growing with his youth and shrinking with what he played
    # (see `core.world.estimates` and `_expose_players`).
    (45, ("demographie", "estimation_potentiel"), {
         "ecarts_types_par_age": [{"age": 15, "ecart_type": 2.0}, {"age": 17, "ecart_type": 1.5}, {"age": 19, "ecart_type": 1.0},
                                  {"age": 21, "ecart_type": 0.6}, {"age": 23, "ecart_type": 0.35}],
         "ecart_type_min": 0.25, "part_niveau": 0.25, "moyenne_a_priori": 1.8, "ecart_type_a_priori": 1.15, "rappel": 0.5,
         "demi_largeur_fourchette": 0.67, "facteur_propre_club": 0.4,
         "exposition": {"matches_reference": 60.0, "reduction_max": 0.6, "poids_championnat_par_niveau": [1.0, 0.6, 0.4],
                        "poids_coupe": 0.5, "poids_europe": 1.0, "poids_selection": 1.0, "reputation_inconnu": 3500.0,
                        "reputation_connu": 8000.0}}),
    (45, ("attributs", "etoiles"), {"seuils": [45.0, 50.0, 55.0, 59.0, 63.0, 67.0, 71.0, 76.0, 82.5], "plancher": 35.0,
                                    "etoiles_au_maximum": 6.0}),
    # A selection calls up its 23 for the formation its candidates fill best (see `core.world.international_selection.initialize_formations`).
    (44, ("international", "squad_list"), {"pool_per_position": 6, "min_affinity": 0.5}),
    # A club of the AI plays the formation its first team fills best, kept unless another does clearly better
    # (see `_choose_formations`).
    (43, ("formations", "choix"), {"marge_changement": 0.25, "blessure_longue_jours": 30}),
    # Each try is a duel between its carrier and a defender, and a rating counts the danger a player's actions add or take
    # away, at his position's scale (see `_upgrade_ratings`).
    (42, ("moteur_match", "duels"), {"selection_porteur": 0.02, "selection_defenseur": 0.02, "sensibilite_porteur": 0.02,
                                     "sensibilite_defenseur": 0.02}),
    (42, ("moteur_match", "notes_joueurs"), {
         "danger_par_zone": list(DANGER), "danger_contre_par_zone": list(COUNTER_DANGER),
         "danger_recuperation_par_zone": list(RECOVERY_DANGER), "part_defenseur_battu": 1.0, "part_tir": 0.3,
         "echelle_par_poste": dict(SCALE), "attendu_par_minute_par_poste": dict(EXPECTED)}),
    (42, ("benchmarks", "stats_match"), {"ecart_type_note_poste_min": 0.45, "ecart_type_note_poste_max": 1.0}),
    # Youth given their margin when the automatic lineup rests players: shipped without its migration, so a save made
    # before it, of schema 41 or older, receives it now.
    (42, ("ia_gestion", "selection"), {"poids_espoirs_rotation": 12.0}),
    # A taker's quality from the spot is a composite of the attribute `penalty` and composure (see `_upgrade_penalties`).
    (40, ("attributs", "composites"), {"penalty": {"penalty": 0.75, "sang_froid": 0.25}}),
    # A failed action ends in a foul, the ball out of play, an offside or lost in play; corners and free kicks have a
    # cause, penalties are given, a shot may be followed by a corner or a rebound, and each stoppage has its dead time
    # (see `_upgrade_stoppages`).
    (39, ("moteur_match", "arrets"), {
         "faute": {"part_par_action": {"passe": 0.06, "conduite": 0.3, "occasion_axe": 0.06, "dribble_zone_verite": 0.35,
                                       "centre": 0.03, "duel_aerien": 0.1}, "part_attaquant_duel_aerien": 0.5,
                   "part_surface": {"aile": 0.25, "axe": 0.55}, "facteur_surface": 0.13, "faute_tactique": 0.15,
                   "sensibilite_ecart": 0.03},
         "coup_franc": {"part_a_portee_milieu_haut": 0.25, "part_directe": 0.6, "part_centree_aile_milieu_haut": 0.35,
                        "issues_centre": {"tete": 0.27, "degage": 0.58, "capte": 0.15, "joue_court": 0.0},
                        "part_degagements_en_corner": 0.2},
         "sortie": {"conservation": {"aile": 0.35, "axe": 0.05}, "passe": {"aile": 0.3, "axe": 0.05},
                    "conduite": {"aile": 0.4, "axe": 0.05}, "jeu_long": 0.25,
                    "centre": {"corner": 0.16, "six_metres": 0.12, "touche": 0.05, "capte": 0.15},
                    "occasion_axe_corner": 0.06}, "hors_jeu": {"profondeur": 0.3, "jeu_long_zone_verite": 0.13},
         "apres_tir": {"part_contres": 0.4, "part_contres_de_loin": 0.55, "contre_en_corner": 0.4,
                       "second_ballon_attaque": 0.4, "arret": {"capte": 0.45, "corner": 0.3, "repousse": 0.25},
                       "part_poteaux": 0.05, "poteau_en_jeu": 0.5, "rebond_attaque": 0.4},
         "corner": {"tete": 0.33, "degage": 0.47, "capte": 0.12, "joue_court": 0.08}, "sensibilite_sorties": 0.02,
         "reference_sorties": 70.0,
         "temps_mort": {"forme_gamma": 2.0, "gardien": 8.5, "touche": 17.0, "hors_jeu": 23.0, "coup_franc_court": 25.0,
                        "six_metres": 30.0, "corner": 34.0, "apres_but": 45.0, "coup_franc": 53.0, "penalty": 90.0,
                        "carton": 30.0}}),
    (39, ("moteur_match", "penalty"), {
         "reussite_base": 0.75, "sensibilite": 0.003, "min": 0.5, "max": 0.95, "part_rates_hors_cadre": 0.3}),
    (39, ("moteur_match", "actions"), {"part_dribbles": 0.3, "sensibilite_dribble": 0.08}),
    (39, ("moteur_match", "cartons"), {
         "par_faute": {"jaune": 0.16, "rouge": 0.0012}, "faute_tactique": {"jaune": 0.55, "rouge": 0.015},
         "penalty": {"jaune": 0.25, "rouge": 0.08}}),
    (39, ("moteur_match", "occasion"), {"xg_base_rebond": 0.3}),
    (39, ("moteur_match", "turnover"), {"malus_contre_gardien": -0.5}),
    # Its rating rules for offsides and penalties were retired by schema 42.
    (39, ("moteur_match", "notes_joueurs"), {"faute": -0.02}),
    (39, ("benchmarks", "stats_match"), {
         "fautes_par_equipe": {"min": 10.0, "max": 13.0}, "penaltys_par_equipe": {"min": 0.1, "max": 0.18}}),
    # A possession is a run of actions: what a side tries in each zone, how a defence opens, long balls, strikes from distance
    # and the chances made in the last zone, how long an action lasts, and counters that follow where and how the ball was
    # won (see `_upgrade_possessions`). Its dead time and its share of corners headed were retired by schema 39.
    (38, ("moteur_match", "actions"), {
         "tempo_par_zone": [0.06, 0.08, 0.12, 0.20], "tempo_contre": 0.92, "attrait_ouverture": 0.8, "part_conduites": 0.15,
         "patience": 0.08,
         "conservation": {"biais_par_zone": [3.6, 3.2, 2.6, 2.0], "sensibilite": 0.08, "part_laterale": 0.35,
                          "part_recul_par_zone": [0.0, 0.10, 0.10, 0.18]},
         "ouverture": {"gain_par_passe": 0.10, "max": 0.6, "part_conservee_apres_progression": 0.5},
         "jeu_long": {"part_par_zone": [0.40, 0.15], "biais": -0.65, "sensibilite_passe": 0.03, "reference_passe": 60.0},
         "tir_de_loin": {"part": 0.23, "sensibilite_finition": 0.03, "reference_finition": 60.0, "effet_ouverture": -1.0},
         "creation": {"parts_axe": {"frappe": 0.55, "dribble": 0.20, "profondeur": 0.25}, "attrait_profondeur_ouverture": 1.5,
                      "facteur_profondeur_contre": 2.0, "parts_aile": {"centre": 0.30, "retrait": 0.70}, "sensibilite_centre": 0.03},
         "durees_secondes": {"passe": 3.2, "progression": 4.2, "jeu_long": 4.0, "occasion": 3.0}}),
    (38, ("moteur_match", "occasion"), {"xg_base_dribble": 0.14, "xg_base_profondeur": 0.26, "xg_base_retrait": 0.16,
                                       "xg_base_tir_de_loin": 0.035, "poids_gardien_face_a_face": {"sortie": 0.6, "arret": 0.4}}),
    (38, ("moteur_match", "turnover"), {"probabilite_contre_par_zone": [0.03, 0.06, 0.15, 0.31], "bonus_contre_attaque_engagee": 0.5,
                                        "malus_contre_jeu_long": -1.0}),
    # Rounds of planning through each window instead of chance reviews, long contracts holding a club's regulars, free
    # agents every club sees and who lower their demands with time, and players letting their contract run out
    # (see `_upgrade_market`).
    (37, ("ia_gestion", "mercato"), {
         "tours_planification": [{"mois": month, "jour": day} for month, day in PLANNING_ROUNDS],
         "agents_libres": {"visibles": 10, "baisse_salaire_mensuelle": 0.1, "salaire_plancher": 0.5},
         "contrats_longs": {"annees_min": 1.0, "annees_pleines": 3.0, "prime_max": 0.6, "revenu_club_riche": 100000000}}),
    (37, ("ia_gestion", "contrats"), {"refus_prolongation": {"poids_appat_gain": 0.05, "poids_mecontentement": 0.1}}),
    # Who a new world keeps from the source, tier by tier; a game already created is not concerned.
    (34, ("import", "selection_effectifs"), {"paliers": {
         "clubs_simules": {"joueurs": 30, "gardiens": 3, "espoirs": 3, "age_max_espoir": 21},
         "vivier": {"joueurs": 11},
         "vedettes": {"reputation_min": 60.0, "potentiel_min_pepite": 150, "age_max_pepite": 21},
         "agents_libres": {"joueurs": 300},
         "clubs_etrangers": {"joueurs": 15, "joueurs_min": 11, "clubs_par_place_europe": 2, "clubs_europe_min": 4,
                             "clubs_europe_max": 12, "reputation_min": 60.0},
         "coupe": {"clubs_par_nation": 96},
         "plancher_nation": {"joueurs_min": 23, "joueurs_max": 110, "force_min": 25.0, "force_max": 80.0},
         "plafond_hors_simules": 8000}}),
    # A loaded series slows recovery and raises the injury risk; an older save's players start with no load.
    (32, ("etats", "fatigue"), {"charge_perte_par_jour": 0.05, "charge_seuil": 3.5, "charge_ralentissement": 0.5}),
    (32, ("etats", "blessures"), {"facteur_charge": 0.5}),
    # Daily recovery fills a share of what a player lacks, never less than a floor (see `_upgrade_fatigue`); a goalkeeper
    # spends only a share of an outfield player's condition.
    (31, ("etats", "fatigue"), {"recuperation_minimale_par_jour": 0.03, "facteur_gardien": 0.15}),
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
    # Ratings credited action by action, drawn among those involved. Its dribble and blocked-shot shares, which change the
    # play since schema 39, were moved then; its scale of credits by action, and for the result, retired by schema 42.
    (18, ("moteur_match", "notes_joueurs"), {"sensibilite_qualite": 0.05}),
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
# Attribute `penalty` was appended at schema 40. A player whose source row is unavailable receives the level his finishing
# and composure predict, as (intercept, finishing, composure): a regression on the source's 44,643 players (r² = 0.50).
DELIVERY_ATTRIBUTE_COUNT = 15
PENALTY_ESTIMATE = (-9.27, 0.442, 0.525)
# What generation gives a position from the spot, and how fast the skill declines, as `attributs.json` and
# `demographie.json` ship them since schema 40; a goalkeeper's comes from his `_autres`.
PENALTY_OFFSETS = {"DC": -30, "DG": -23, "DD": -24, "MDC": -21, "MC": -16, "MOC": -12, "AILG": -14, "AILD": -15, "BU": -7}
PENALTY_DECLINE_WEIGHT = 0.40
# Level 6 spends ~2.5x the time of level 3 for a few percent of file size on large worlds; not worth it here.
COMPRESSION_LEVEL = 3
# What a save leaves out besides the values equal to their default, which loading gives back: the UI journal, which no view
# reads any more, and the source players the import left out, which nothing needs once the world exists. Since schema 41;
# a migration of a later schema cannot count on a key holding its default value.
UNSAVED_FIELDS = {"world": {"journal", "excluded_player_ids"}}
# A slot, or the copy a save keeps of the one it replaced, named after the date that one was made at: `Marseille-2033-05-30`.
SLOT_NAME = re.compile(r"[\w-]{1,64}(?:-\d{4}-\d{2}-\d{2})?")
DATED_COPY = r"-\d{4}-\d{2}-\d{2}"
# The world's date is the first field of its document: the head of a save tells the date it was made at.
SAVED_DATE = re.compile(rb'"world":\s*\{"date":\s*\{"year":\s*(\d+),\s*"month":\s*(\d+),\s*"day":\s*(\d+)\}')
# Beside each save, what the list of the saves shows of it without opening it: the user's club.
SUMMARY = ".resume.json"


class SaveError(ValueError):
    pass


class SaveStore:
    def __init__(self, directory: Path, rolling: bool = False) -> None:
        self.directory = directory
        # A rolling store keeps the save a slot held before its last one, and only that one: `Marseille`, saved on 10 June
        # over its save of 30 May, keeps it as `Marseille-2033-05-30`; saved again on 20 June, `Marseille-2033-06-10` takes
        # its place. The copy is made, and the older one deleted, on a thread of their own while the new save is written.
        self.rotation = ThreadPoolExecutor(max_workers=1, thread_name_prefix="save-rotation") if rolling else None

    def path_for(self, slot: str) -> Path:
        if not SLOT_NAME.fullmatch(slot):
            raise SaveError("Nom de sauvegarde invalide (lettres, chiffres, tirets uniquement).")
        return self.directory / f"{slot}.json.gz"

    def summary_path(self, slot: str) -> Path:
        return self.path_for(slot).with_name(f"{slot}{SUMMARY}")

    def save(self, world: World, slot: str) -> Path:
        target = self.path_for(slot)
        self.directory.mkdir(parents=True, exist_ok=True)
        # Made while the new save is serialized: it is long ready when the new save replaces the slot.
        copying = self.rotation.submit(self._keep, slot, world.date.iso()) if self.rotation else None
        payload = SaveEnvelope(SCHEMA_VERSION, "0.1.0", platform.python_version(), config_fingerprint(world.config), world)
        raw = ADAPTER.dump_json(payload, by_alias=True, exclude_defaults=True, exclude=UNSAVED_FIELDS, warnings="error")
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=self.directory, prefix=".save-", suffix=".tmp", delete=False) as handle:
                temporary = Path(handle.name)
                with gzip.GzipFile(fileobj=handle, mode="wb", compresslevel=COMPRESSION_LEVEL, mtime=0) as archive:
                    archive.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
            kept = copying.result() if copying else None
            os.replace(temporary, target)
            self._summarize(world, slot)
            if kept: self.rotation.submit(self._prune, slot, kept)
            return target
        finally:
            if temporary and temporary.exists():
                temporary.unlink()

    def _summarize(self, world: World, slot: str) -> None:
        """Writes what the list of the saves shows of this one; a save without it lists without its club."""
        club = world.clubs.get(world.controlled_club_id)
        summary = {"club": None if club is None else {"id": club.id, "name": club.name, "major_color": club.home_kit_major_color,
                                                      "minor_color": club.home_kit_minor_color}}
        target = self.summary_path(slot)
        with suppress(OSError):
            temporary = target.with_name(f".{target.name}.tmp")
            temporary.write_text(json.dumps(summary, ensure_ascii=False), "utf-8")
            os.replace(temporary, target)

    def _keep(self, slot: str, date: str) -> Path | None:
        """A copy of the slot's save, named after the date it was made at. None for a save made on `date`, which the new one
        only brings up to date, and when it cannot be read or copied: the new save is written all the same."""
        target = self.path_for(slot)
        made = saved_date(target)
        if made is None or made == date: return None
        copy = self.directory / f"{slot}-{made}.json.gz"
        try:
            copy.unlink(missing_ok=True)
            try:
                os.link(target, copy)  # a second name, not a copy: replacing the slot leaves it the former save
            except OSError:
                shutil.copyfile(target, copy)  # a file system without hard links
            with suppress(OSError): shutil.copyfile(self.summary_path(slot), self.summary_path(f"{slot}-{made}"))
            return copy
        except OSError:
            with suppress(OSError): copy.unlink(missing_ok=True)
            return None

    def _prune(self, slot: str, kept: Path) -> None:
        """Deletes the slot's dated copies but `kept`; one that cannot be deleted now is at the slot's next save."""
        dated = re.compile(re.escape(slot) + DATED_COPY + r"\.json\.gz")
        for path in self.directory.glob(f"{slot}-*.json.gz"):
            if path != kept and dated.fullmatch(path.name):
                with suppress(OSError): path.unlink()
                with suppress(OSError): path.with_name(path.name.removesuffix(".json.gz") + SUMMARY).unlink()

    def close(self) -> None:
        if self.rotation: self.rotation.shutdown(wait=True)

    def load(self, slot: str) -> World:
        target = self.path_for(slot)
        try:
            with gzip.open(target, "rb") as handle:
                raw = handle.read()
            # Version 1 used tagged entities; it remains readable during migration.
            if b'"schema_version":1,' in raw[:100] or b'"schema_version": 1,' in raw[:100]:
                payload = json.loads(raw)
                retired = _retire_rules(payload["world"]["fields"]["config"]["$config"], 1)
                world, fingerprint = decode(_rename_positions(payload["world"], skip="config")), payload["config_hash"]
                world.trajectories = _monthly_trajectories(world.trajectories, world.config.world.key_dates.population_review.month)
                version = 1
            else:
                found, retired = re.search(rb'"schema_version":\s*(\d+)', raw[:100]), {}
                if found and int(found.group(1)) < SCHEMA_VERSION:
                    raw, retired = _upgrade_document(raw, int(found.group(1)), self.directory.parent / "data" / "players.csv")
                payload = ADAPTER.validate_json(raw)
                if not 2 <= payload.schema_version <= SCHEMA_VERSION:
                    raise SaveError("Version de sauvegarde incompatible ; une migration est nécessaire.")
                world, fingerprint = payload.world, payload.config_hash
                version = payload.schema_version
            if not isinstance(world, World) or not _config_matches(world, fingerprint, version, retired):
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
            if version < 31: _upgrade_fatigue(world)
            if version < 33: _date_international_windows(world)
            if version < 35: number_squads(world)
            if version < 36:
                initialize_age_records(world)
                initialize_strengths(world)
            if version < 37: _upgrade_market(world)
            if version < 38: _upgrade_possessions(world)
            if version < 39: _upgrade_stoppages(world)
            if version < 40: _upgrade_penalties(world)
            if version < 41: _trim_matches(world)
            if version < 42: _upgrade_ratings(world)
            if version < 43: _choose_formations(world)
            if version < 44: initialize_formations(world)
            if version < 45: _expose_players(world, self.directory.parent / "data" / "players.csv")
            _forget_formation_news(world)
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
        with suppress(OSError): self.summary_path(slot).unlink()

    def slots(self) -> list[dict[str, object]]:
        if not self.directory.exists():
            return []
        # By name, a slot before its dated copy; each with the day its game stands at and the user's club, when known.
        return sorted(({"slot": path.name.removesuffix(".json.gz"), "bytes": path.stat().st_size, "modified": path.stat().st_mtime,
                        "date": saved_date(path), "club": self._club(path)}
                       for path in self.directory.glob("*.json.gz")), key=lambda row: row["slot"].casefold())

    def summary(self, slot: str) -> dict[str, object]:
        """The day a slot's game stands at and its user's club, read without loading it: what the screen shows while it loads."""
        path = self.path_for(slot)
        return {"date": saved_date(path), "club": self._club(path)}

    def _club(self, path: Path) -> dict | None:
        try:
            return json.loads(path.with_name(path.name.removesuffix(".json.gz") + SUMMARY).read_text("utf-8"))["club"]
        except (OSError, ValueError, KeyError, TypeError):
            return None

    def latest(self) -> str | None:
        """The slot saved last, None without any. A dated copy is an older state of its slot: it only counts once the slot is
        gone, whatever its file's date (a copy made without a hard link is written at the same time as the new save)."""
        rows = self.slots()
        names = {row["slot"] for row in rows}
        games = [row for row in rows if original_slot(row["slot"]) == row["slot"] or original_slot(row["slot"]) not in names]
        return max(games, key=lambda row: row["modified"])["slot"] if games else None


def saved_date(path: Path) -> str | None:
    """The date a save was made at, read from the head of its file; None for a missing or unreadable one."""
    try:
        with gzip.open(path, "rb") as handle:
            head = handle.read(512)
    except (OSError, EOFError, zlib.error):
        return None
    found = SAVED_DATE.search(head)
    return None if found is None else "%04d-%02d-%02d" % tuple(int(part) for part in found.groups())


def original_slot(slot: str) -> str:
    """The slot a dated copy was kept for; a slot is its own."""
    found = re.fullmatch(r"(.+)" + DATED_COPY, slot)
    return found.group(1) if found else slot


def _source_attributes(world: dict, source_path: Path, wanted: set[int], names: tuple[str, ...]) -> dict[int, list[float]]:
    """Attributes `names` of imported players, read back only from the exact CSV the game was imported from."""
    if not wanted or not source_path.is_file(): return {}
    raw = source_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != world.get("source_hashes", {}).get("players.csv"): return {}
    source = world["config"]["import"]["format_source"]
    reader = csv.DictReader(io.StringIO(raw.decode(source["encodage"])), delimiter=source["separateur"])
    return {int(row["UID"]): [note(row, *ATTRIBUTE_COLUMNS[name]) * 5 for name in names]
            for row in reader if int(row["UID"]) in wanted}


# Rules each schema version took out, by section: an older embedded configuration drops them before it is typed, and gets
# them back, with the values it held, to have its fingerprint checked (see `_config_matches`). A rule changed before typing,
# like the attribute list of schema 40, is given back the same way.
RETIRED_RULES = (
    # The error on a potential is read in stars, by age, exposure and observer (see `MIGRATION_DEFAULTS`).
    (45, ("demographie", "estimation_potentiel"), ("bruit_max", "bruit_min", "demi_largeur_en_ecarts_types")),
    # A rating counts the danger an action adds or takes away, no longer a scale of its own for each action, nor the result.
    (42, ("moteur_match", "notes_joueurs"), ("tir_cadre_sans_but", "arret", "but_encaisse_gardien", "progression_par_zone",
                                              "recuperation_par_zone", "perte_par_zone", "defenseur_elimine", "passe_cle",
                                              "participation_occasion", "tir_non_cadre", "contre", "defenseur_battu", "victoire",
                                              "sans_encaisser", "minutes_sans_encaisser", "attendu_par_minute", "hors_jeu",
                                              "penalty_concede", "penalty_obtenu", "penalty_manque", "penalty_arrete")),
    # The length of a possession is the sum of its actions; a counter follows where and how the ball was won.
    (38, ("moteur_match", "chronologie"), ("duree_possession_moyenne", "duree_possession_forme_gamma")),
    (38, ("moteur_match", "turnover"), ("zone_declenchant_contre", "probabilite_contre_depuis_zone_basse")),
    # The dead time follows the cause of each stoppage; corners, free kicks and cards follow from a cause (see `arrets`).
    (39, ("moteur_match", "actions"), ("temps_mort",)),
    (39, ("moteur_match", "coups_arretes"), ("probabilite_corner_sur_turnover_avance", "probabilite_coup_franc_sur_turnover",
                                              "part_corners_frappe", "part_cible_buts_sur_cpa")),
    (39, ("moteur_match", "notes_joueurs"), ("part_dribbles", "sensibilite_dribble", "part_non_cadres_contres",
                                              "part_non_cadres_contres_de_loin")),
    (39, ("moteur_match", "cartons"), ("probabilite_jaune_par_turnover_defensif", "probabilite_rouge_direct_par_turnover_defensif",
                                        "poids_zone_defense")),
)


def _retire_rules(config: dict, version: int) -> dict:
    """Takes out of a configuration of `version` the rules retired since; returns them by section, as they were."""
    retired = {}
    for since, (top, section), keys in RETIRED_RULES:
        rules = config.get(top, {}).get(section)
        if version >= since or rules is None: continue
        for key in keys:
            if key in rules: retired.setdefault((top, section), {})[key] = rules.pop(key)
    return retired


def _upgrade_document(raw: bytes, version: int, source_path: Path) -> tuple[bytes, dict]:
    """What an older save's JSON must receive before it is typed, and the rules taken out of its configuration; the
    configuration is upgraded once verified."""
    document = json.loads(raw)
    retired = _retire_rules(document["world"]["config"], version)
    if version < 22: document["world"] = _rename_positions(document["world"], skip="config")
    if version < 23:
        world = document["world"]
        world["trajectories"] = _monthly_trajectories(world.get("trajectories", {}), world["config"]["monde"]["dates_cles"]["bilan_demographique"]["mois"])
    _extend_attribute_vectors(document["world"], source_path)
    if version < 40: _list_penalty(document["world"]["config"], retired)
    return json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), retired


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
    """Schema 12 appended `centre` and `cpa` to every attribute vector, schema 40 `penalty`; vectors already extended are
    left alone. A selection's campaign-only reinforcements have vectors too, and no source row."""
    players = [*world["players"].values(), *world.get("international", {}).get("temporary", {}).values()]
    stale = {player["id"] for player in players if len(player["attributes"]["values"]) < len(ATTRIBUTE_INDEX)}
    imported = _source_attributes(world, source_path, stale, ("centre", "cpa", "penalty"))
    bounds = world["config"]["attributs"]["bornes"]
    bounded = lambda value: min(bounds["max"], max(bounds["min"], value))
    for player in players:
        values, source = player["attributes"]["values"], imported.get(player["id"])
        if len(values) == LEGACY_ATTRIBUTE_COUNT:
            values.extend(source[:2] if source else [bounded(player["rating"] + offset) for offset in DELIVERY_OFFSETS[player["position"]]])
        if len(values) == DELIVERY_ATTRIBUTE_COUNT:
            intercept, finishing, composure = PENALTY_ESTIMATE
            values.append(source[2] if source else bounded(intercept + finishing * values[ATTRIBUTE_INDEX["finition"]]
                                                           + composure * values[ATTRIBUTE_INDEX["sang_froid"]]))


def _list_penalty(config: dict, retired: dict) -> None:
    """Schema 40 lists `penalty` among the technical attributes; the list the save held is checked against its fingerprint."""
    groups = config["attributs"]["liste"]
    if any("penalty" in names for names in groups.values()): return
    retired[("attributs", "liste")] = {"techniques": list(groups["techniques"])}
    groups["techniques"].append("penalty")


def _upgrade_penalties(world: World) -> None:
    """Schema 40: the attribute `penalty` chooses the taker and makes his penalties. Generation gives each position the
    level it ships with, and the skill declines as `cpa` does; a value the save already holds for it is kept."""
    payload = config_payload(world.config)
    for position, offset in PENALTY_OFFSETS.items():
        payload["attributs"]["profils_generation"]["profils"].get(position, {}).setdefault("penalty", offset)
    payload["demographie"]["progression"]["poids_declin_par_attribut"].setdefault("penalty", PENALTY_DECLINE_WEIGHT)
    world.config = decode_config(payload)


def _upgrade_ratings(world: World) -> None:
    """Schema 42: each try is a duel between its carrier and a defender, and a rating counts the danger a player's actions
    add or take away (see `RATING_RECALIBRATED_RULES`). The matches already played keep the ratings they were given."""
    world.config = _recalibrated(world.config, RATING_RECALIBRATED_RULES)


def _trim_matches(world: World) -> None:
    """Schema 41: only the user's club's matches keep the build-up of their replay, and a selection's matches are archived
    once their edition is over, like a club's at the end of their season."""
    from core.domain.matches import store_events
    from core.world.application import _archived
    for match in world.matches.values():
        if match.result and match.result.engine != "archived":
            store_events(match.result, world.controlled_club_id in (match.home_id, match.away_id))
    for match in world.international.matches.values():
        if match.result and match.result.engine != "archived":
            if match.season < world.season: match.result = _archived(match.result)
            else: store_events(match.result, False)


def _choose_formations(world: World) -> None:
    """Schema 43: a club of the AI no longer keeps the formation drawn for it at creation; it plays the one its first team
    fills best. The human club keeps its own."""
    for event in formation_events(world, margin=False): apply(world, event)


def _expose_players(world: World, source_path: Path) -> None:
    """Schema 45: the world knows a player by the matches he played. A player of the import is worth what his reputation
    in the exact source CSV and his caps then were; everyone adds what the game has recorded him playing since."""
    from core.world.estimates import imported_exposure, match_weight
    cfg = world.config
    reputations = {}
    if source_path.is_file():
        raw = source_path.read_bytes()
        if hashlib.sha256(raw).hexdigest() == world.source_hashes.get("players.csv"):
            source = cfg.import_settings.source_format
            reader = csv.DictReader(io.StringIO(raw.decode(source.encoding)), delimiter=source.delimiter)
            reputations = {int(row["UID"]): float(row["CurrentReputation"]) for row in reader if row.get("CurrentReputation")}
    match_minutes = cfg.engine.timing.match_seconds / 60
    for player in [*world.players.values(), *world.international.temporary.values()]:
        player.exposure = imported_exposure(reputations.get(player.id), player.historical_caps, cfg) if player.source_current_ability else 0.0
    for record in world.records.values():
        player, competition = world.players.get(record.player_id), world.competitions.get(record.competition_id)
        if player is not None and competition is not None:
            player.exposure += record.minutes / match_minutes * match_weight(cfg, competition.kind, competition.level)
    for record in world.international.records.values():
        if (player := world.players.get(record.player_id)) is not None:
            player.exposure += record.minutes / match_minutes * match_weight(cfg, "international", 0)


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


def _forget_formation_news(world: World) -> None:
    """The feed no longer tells the formation changes of the other clubs: a save that heard of some drops them."""
    world.news = [item for item in world.news if item.kind != "formation_change"]


def _upgrade_possessions(world: World) -> None:
    """Schema 38: possessions are built action after action, and an older save takes the rules recalibrated with them (see
    `POSSESSION_RECALIBRATED_RULES`). Its matches keep their events: the replay reads a move forward without a label as a
    pass, and a match without passes counted shows none."""
    world.config = _recalibrated(world.config, POSSESSION_RECALIBRATED_RULES)


def _upgrade_stoppages(world: World) -> None:
    """Schema 39: a failed action ends in a foul, the ball out of play, an offside or lost in play, and corners, free kicks,
    penalties and cards follow from it; an older save takes the rules recalibrated with them (see
    `STOPPAGE_RECALIBRATED_RULES`). Its matches keep their events: they hold no foul, and a save without a detail was held."""
    world.config = _recalibrated(world.config, STOPPAGE_RECALIBRATED_RULES)


def _upgrade_market(world: World) -> None:
    """Schema 37: clubs plan their windows in rounds rather than by chance (see `MARKET_RECALIBRATED_RULES`), and a free
    agent lowers his demands with the time he goes without a contract. A player without a club is dated by his last
    release; one who never had a contract stays undated (see `core.ai.market.months_free`)."""
    world.config = _recalibrated(world.config, MARKET_RECALIBRATED_RULES)
    for move in world.transfers:
        player = world.players.get(move.player_id)
        if player is not None and player.club_id is None and move.kind == "release": player.free_since = move.date


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
                      ("demography", "cohort", None, "sorting_reputation_weight", 0.0, 1.0))
# Rules recalibrated by schema 31, in the same form: a slower recovery, a stronger link between fatigue and injuries,
# and an AI that rests its starters sooner. Its smaller credit per save was retired with the scale by schema 42.
RECALIBRATED_FATIGUE_RULES = (("states", "fitness", None, "daily_recovery", 0.10, 0.24),
                              ("states", "fitness", None, "stamina_recovery", 0.05, 0.20),
                              ("states", "injuries", None, "fitness_factor", 1.9, 1.2),
                              ("states", "injuries", None, "possession_probability", 0.0025, 0.0065),
                              ("management", "selection", None, "rotation_fitness", 0.65, 0.90))
# Rules recalibrated by schema 37, in the same form: the planning rounds replace chance reviews.
MARKET_RECALIBRATED_RULES = (("management", "market", None, "daily_proposal_probability", 0.06, 0.0),)
# Rules recalibrated by schema 38, in the same form: the duels of a possession built action after action, which weigh the
# gaps less since a possession holds more of them, and the target for set-piece goals until penalties and free kicks played
# into the box exist. Its cards and its corners and free kicks drawn without a cause were retired by schema 39.
POSSESSION_RECALIBRATED_RULES = (("engine", "transitions", None, "progression_bias", 0.0, -0.07),
                                 ("engine", "transitions", None, "creation_bias", -1.9, -1.575),
                                 ("engine", "transitions", None, "progression_sensitivity", 0.04, 0.02),
                                 ("engine", "transitions", None, "creation_sensitivity", 0.03, 0.012),
                                 ("engine", "transitions", None, "home_bonus", 0.3, 0.38),
                                 ("engine", "chance", None, "shot_xg", 0.15, 0.13),
                                 ("engine", "set_pieces", None, "corner_xg", 0.05, 0.09),
                                 ("benchmarks", "stats_match", "set_piece_goal_share", "min", 0.25, 0.1),
                                 ("benchmarks", "stats_match", "set_piece_goal_share", "max", 0.3, 0.16))
# Rules recalibrated by schema 39, in the same form: shorter actions now that the dead time comes from the stoppages,
# fewer and less dangerous chances in open play now that set pieces give penalties, headers from free kicks and rebounds,
# counters a little likelier since a dead ball gives none, and set-piece goals back to their target. Its scale that kept
# each position's mean rating was retired by schema 42.
STOPPAGE_RECALIBRATED_RULES = (("engine", "actions", "durations", "pass_", 3.2, 3.0),
                               ("engine", "actions", "durations", "progression", 4.2, 4.0),
                               ("engine", "actions", "durations", "long_ball", 4.0, 3.8),
                               ("engine", "actions", "durations", "chance", 3.0, 2.8),
                               ("engine", "actions", "long_shot", "share", 0.23, 0.20),
                               ("engine", "transitions", None, "creation_bias", -1.575, -1.78),
                               ("engine", "chance", None, "cross_xg", 0.103, 0.095),
                               ("engine", "chance", None, "shot_xg", 0.13, 0.105),
                               ("engine", "chance", None, "dribble_xg", 0.14, 0.125),
                               ("engine", "chance", None, "through_ball_xg", 0.26, 0.22),
                               ("engine", "chance", None, "cutback_xg", 0.16, 0.13),
                               ("engine", "set_pieces", None, "free_kick_xg", 0.05, 0.065),
                               ("engine", "turnover", None, "counter_probability_by_zone", (0.03, 0.06, 0.15, 0.31), (0.04, 0.08, 0.19, 0.38)),
                               ("benchmarks", "stats_match", "set_piece_goal_share", "min", 0.1, 0.25),
                               ("benchmarks", "stats_match", "set_piece_goal_share", "max", 0.16, 0.3))


# Rules recalibrated by schema 42, in the same form: a rating centred higher and spread wider, with goals and assists worth
# less beside the danger they come with, the form and the value that follow it, and the benchmarks that check it.
RATING_RECALIBRATED_RULES = (("engine", "player_ratings", None, "base", 6.5, 6.8),
                             ("engine", "player_ratings", None, "goal", 0.8, 0.4),
                             ("engine", "player_ratings", None, "assist", 0.5, 0.3),
                             ("states", "form", None, "reference_rating", 6.5, 6.8),
                             ("states", "form", None, "rating_sensitivity", 0.06, 0.04),
                             ("management", "valuation", "performance", "reference_rating", 6.5, 6.8),
                             ("management", "valuation", "performance", "full_rating_gap", 0.5, 0.75),
                             ("benchmarks", "stats_match", None, "min_position_rating", 6.4, 6.7),
                             ("benchmarks", "stats_match", None, "max_position_rating", 6.6, 6.9))


def _recalibrated(cfg: Config, recalibrated: tuple) -> Config:
    """A rule the save still holds as it shipped takes its new value; any other was chosen, and is kept."""
    for domain, section, inner, key, before, since in recalibrated:
        rules = getattr(getattr(cfg, domain), section)
        holder = getattr(rules, inner) if inner else rules
        if getattr(holder, key) != before: continue
        holder = replace(holder, **{key: since})
        rules = replace(rules, **{inner: holder}) if inner else holder
        cfg = replace(cfg, **{domain: replace(getattr(cfg, domain), **{section: rules})})
    return cfg


def _date_international_windows(world: World) -> None:
    """Schema 33: a Nations League now comes before each tournament, whose qualifiers move to the March after it. An
    edition drawn before keeps the windows its qualifiers were dated in, read from them two matches at a time; the first
    Nations League comes with the next campaign."""
    for edition in world.international.editions.values():
        if not edition.windows:
            days = sorted({match.date for match in world.international.matches.values()
                           if match.season == edition.year and match.round_number <= 10})
            edition.windows = list(zip(days[::2], days[1::2]))


def _upgrade_fatigue(world: World) -> None:
    """Schema 31: an older save takes the recalibrated fatigue rules. Daily recovery became a share of what a player
    lacks, so the two rules that set it change meaning along with their value."""
    world.config = _recalibrated(world.config, RECALIBRATED_FATIGUE_RULES)


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
    cfg = world.config = _recalibrated(world.config, RECALIBRATED_RULES)
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


def _config_matches(world: World, fingerprint: str, version: int, retired: dict | None = None) -> bool:
    if config_fingerprint(world.config) == fingerprint: return True
    # Verify each historical configuration before accepting only its explicit
    # migration defaults. Existing/custom rules must retain their fingerprint.
    if version >= SCHEMA_VERSION: return False
    previous = config_payload(world.config)
    for (top, section), rules in (retired or {}).items(): previous[top][section].update(rules)
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
