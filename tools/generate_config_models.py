"""Developer-only schema generation. Never run this while loading a game.

The generated, checked-in schemas are the contract: runtime JSON cannot teach
the validator new keys. Review generated diffs when intentionally adding rules.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOMAINS = {
    "monde": "world", "import": "import_settings", "attributs": "attributes",
    "implications": "involvement", "formations": "formations",
    "moteur_match": "engine", "etats": "states", "ia_gestion": "management",
    "demographie": "demography", "benchmarks": "benchmarks",
}
# The external JSON vocabulary stays French; all model fields are English.
WORDS = dict(line.split("=", 1) for line in """
version_config=version
date_debut_partie=start_date
annee=year
mois=month
jour=day
competitions_simulees=competitions
pays=nation
nom=name
niveau=level
nb_clubs=club_count
saison=season
debut_mois=start_month
debut_jour=start_day
fin_mois=end_month
fin_jour=end_day
jours_entre_journees=days_between_rounds
points_victoire=win_points
points_nul=draw_points
points_defaite=loss_points
criteres_departage=tiebreakers
mercato=market
ete=summer
hiver=winter
tours_par_jour=rounds_per_day
dates_cles=key_dates
promotion_centre_formation=academy_intake
liberation_contrats_expires=contract_release
bilan_demographique=population_review
regles_match=match_rules
joueurs_sur_terrain=players_on_pitch
remplacements_max=max_substitutions
fenetres_remplacement=substitution_windows
taille_banc=bench_size
joueurs_minimum_poursuite=min_players
score_forfait_buts_vainqueur=forfeit_winner_goals
score_forfait_buts_perdant=forfeit_loser_goals
mi_temps_secondes=half_seconds
format_source=source_format
encodage=encoding
separateur=delimiter
format_date=date_format
identifiant_club_agent_libre=free_agent_club_id
marqueur_date_absente=missing_date
unite_salaire=wage_unit
selection_effectifs=squad_selection
joueurs_max_par_club=max_players
gardiens_reserves_si_disponibles=reserved_goalkeepers
critere=criterion
departage=tiebreaker
joueurs_ecartes=excluded_players
agents_libres=free_agents
valeurs_manquantes=missing_values
valeur_non_positive=nonpositive_value
niveau_repli=fallback_level
salaire_nul_sous_contrat=zero_contracted_wage
capacite_stade_non_positive=nonpositive_capacity
contrat_absent_club=missing_contract
contrat_expire=expired_contract
date_signature_inconnue=unknown_signature
nationalite_principale=primary_nationality
nom_sans_virgule=undivided_name
courbe_age_hors_domaine=outside_age_curve
synthese_attributs=player_synthesis
marge_potentiel_defaut=default_potential_margin
marge_potentiel_jeune_max=young_potential_margin
marge_potentiel_age_seuil=potential_age_threshold
synthese_club=club_synthesis
stad_cap_reference=capacity_reference
reputation_bruit_ecart_type=reputation_noise
note_centre_formation=academy_rating
note_centre_formation_facteur_reputation=academy_reputation_factor
note_centre_formation_bruit_ecart_type=academy_noise
postes=positions
affinite_secondaire_defaut=secondary_affinity
liste=groups
techniques=technical
mentaux=mental
physiques=physical
gardien=goalkeeping
bornes=bounds
progression_attaque=progression_attack
progression_defense=progression_defense
occasion_attaque=creation_attack
occasion_defense=creation_defense
tir=shooting
arret=saving
tete=heading
sortie=claiming
note_globale=overall
profils_generation=generation_profiles
bruit_ecart_type=noise
profils=profiles
malus_hors_poste=out_of_position
facteur=factor
couloirs=lanes
vertical_attaque=attack
vertical_defense=defense
hauteur_bloc=block_height
defaut=default
bonus_zone_recuperation=recovery_bonus
sensibilite_ecart_force_initial=initial_strength_sensitivity
bonus_domicile_initial=initial_home_bonus
probabilite_recuperation_avancee_base=advanced_recovery_probability
malus_vulnerabilite_contre=counter_vulnerability
ajustement_menes_fin_match=late_trailing_adjustment
minutes_fin_match=late_match_minutes
malus_inferiorite_numerique=red_card_adjustment
chronologie=timing
duree_match_secondes=match_seconds
duree_possession_moyenne=possession_mean
duree_possession_forme_gamma=possession_gamma_shape
temps_additionnel_min=stoppage_min
temps_additionnel_max=stoppage_max
secondes_par_arret_de_jeu=seconds_per_stoppage
k_prog=progression_sensitivity
k_occ=creation_sensitivity
bonus_domicile=home_bonus
densite=density
exposant=exponent
note_plancher=empty_rating
probabilite_changement_aile=switch_probability
poids_vision_changement_aile=switch_vision_weight
occasion=chance
xg_base_centre=cross_xg
xg_base_frappe=shot_xg
multiplicateur_contre=counter_multiplier
sensibilite_tireur_gardien=finishing_sensitivity
poids_gardien_sur_tete=header_keeper_weights
probabilite_tir_cadre_base=on_target_probability
sensibilite_cadrage=on_target_sensitivity
niveau_reference_cadrage=on_target_reference
borne_probabilite_min=probability_min
borne_probabilite_max=probability_max
coups_arretes=set_pieces
probabilite_corner_sur_turnover_avance=corner_probability
probabilite_coup_franc_sur_turnover=free_kick_probability
xg_base_corner=corner_xg
xg_base_coup_franc_direct=free_kick_xg
part_cible_buts_sur_cpa=target_goal_share
zone_declenchant_contre=counter_zone
probabilite_contre_depuis_zone_basse=low_counter_probability
sensibilite_ecart_vitesse_contre=counter_pace_sensitivity
malus_defensif_contre=defense_penalty
malus_defensif_couloir_concerne=lane_defense_penalty
duree_malus_possessions=penalty_possessions
relance_gardien=keeper_distribution
probabilite_depart_milieu_bas=midfield_start_probability
sensibilite_relance=distribution_sensitivity
niveau_reference=reference_level
cartons=cards
probabilite_jaune_par_turnover_defensif=yellow_probability
probabilite_rouge_direct_par_turnover_defensif=red_probability
poids_zone_defense=defense_zone_weight
poids_agressivite_tacle=aggression_weight
fragilite_note_basse=fragility_source_low
fragilite_note_reference=fragility_source_reference
fragilite_note_haute=fragility_source_high
ego_note_basse=ego_source_low
ego_note_reference=ego_source_reference
ego_note_haute=ego_source_high
sensibilite_livraison=delivery_sensitivity
niveau_reference_centre=cross_reference
niveau_reference_cpa=set_piece_reference
niveau_reference_coup_franc=free_kick_reference
agressivite_min=aggression_min
agressivite_max=aggression_max
agressivite_note_basse=aggression_source_low
agressivite_note_reference=aggression_source_reference
agressivite_note_haute=aggression_source_high
recalcul_notes=rating_refresh
palier_fatigue_minutes=fitness_interval
sur_remplacement=on_substitution
sur_carton_rouge=on_red_card
analytique=analytical
buts_attendus_base=base_goals
sensibilite_ecart_force=strength_sensitivity
bonus_domicile_buts=home_goal_bonus
notes_joueurs=player_ratings
but=goal
passe_decisive=assist
tir_cadre_sans_but=saved_shot
but_encaisse_gardien=keeper_conceded
jaune=yellow
minutes_minimum_note=min_rating_minutes
fatigue=fitness
initiale=initial
consommation_par_minute=cost_per_minute
resistance_base=resistance_base
resistance_facteur_endurance=stamina_resistance
intensite_par_hauteur_bloc=intensity
bloc_bas=low_block
equilibre=balanced
pressing_haut=high_press
recuperation_base_par_jour=daily_recovery
recuperation_facteur_endurance=stamina_recovery
facteur_age_jeune=young_recovery
seuil_age_jeune=young_age
facteur_age_vieux=old_recovery
seuil_age_vieux=old_age
seuil_alerte=alert_threshold
fatigue_retour_de_blessure=injury_return_fitness
blessures=injuries
probabilite_base_par_possession=possession_probability
facteur_fatigue_max=fitness_factor
fragilite_min=fragility_min
fragilite_max=fragility_max
probabilite_quotidienne_hors_match=daily_probability
gravites=severities
part=share
jours_min=min_days
jours_max=max_days
penalite_permanente=permanent_penalty
duree_minimale_jours=min_duration_days
age_minimal=min_age
points_min=min_points
points_max=max_points
attributs_touches=affected_attributes
forme_retour_de_blessure=injury_return_form
matches_rouge_min=red_min_matches
matches_rouge_max=red_max_matches
matches_double_jaune=second_yellow_matches
seuils_cumul_jaunes=yellow_thresholds
jaunes=yellows
remise_a_zero_apres_seuil=reset_after_threshold
decompte=counting_policy
cumul_sanctions_meme_match=same_match_policy
remise_a_zero_fin_saison=season_reset
forme=form
note_reference=reference_rating
sensibilite_note=rating_sensitivity
vitesse_convergence=convergence_speed
amplitude_effet_match=match_amplitude
poids_temps_de_jeu=playing_time_weight
poids_resultats_club=results_weight
poids_satisfaction_contrat=contract_weight
vitesse_derive=drift_speed
remplacements=substitutions
premiere_minute_evaluation=first_evaluation_minute
intervalle_evaluation_minutes=evaluation_interval
seuil_fatigue_declenchement=fitness_threshold
seuil_fatigue_joueur_averti=booked_fitness_threshold
ecart_niveau_acceptable_remplacant=replacement_gap
gain_minimum_rotation=rotation_min_gain
poids_deficit_temps_jeu=playing_time_weight
poids_developpement_jeunes=development_weight
marge_potentiel_reference=potential_margin_reference
minutes_utiles_minimum=min_useful_minutes
intervalle_rotation_minutes=rotation_interval
rotations_par_fenetre=rotations_per_window
affinite_minimum_rotation=rotation_min_affinity
facteur_rotation_match_serre=close_game_rotation_factor
facteur_rotation_equipe_menee=trailing_rotation_factor
facteur_ecart_avantage_confortable=comfortable_gap_factor
minutes_restantes_ajustement_tactique=tactical_minutes
ecart_buts_ajustement_defensif=defensive_goal_margin
valorisation=valuation
base_euros=base_euros
poids_potentiel_sur_niveau=potential_weight
courbe_age=age_curve
age_min=min_age
age_max=max_age
decote_fin_contrat=contract_discount
mois_max=max_months
rarete_poste=position_scarcity
utilite=utility
poids_titulaire=starter_weight
poids_rotation=rotation_weight
poids_doublure=backup_weight
poids_preference_jeunes=youth_preference_weight
poids_appetit_risque=risk_weight
age_seuil_jeunesse=youth_age
profil_cible=target_profile
niveau_base=base_level
poids_reputation=reputation_weight
decote_rotation=rotation_discount
decote_doublure=backup_discount
rotations_cibles=rotation_places
doublures_cibles=backup_places
part_revenus_transfert=transfer_income_share
part_solde_transfert=transfer_balance_share
part_revenus_salaires=wage_income_share
semaines_par_an=weeks_per_year
financement_initial=initial_funding
marge_plafond_salarial=wage_headroom
reserve_tresorerie_mois=cash_reserve_months
facteur_financement_min=min_funding_factor
salaires=wages
part_annuelle_valeur_intrinseque=annual_value_share
minimum_hebdomadaire=weekly_minimum
ratio_offre_max_pour_score=max_offer_ratio
comptabilite=accounting
periodicite=frequency
part_revenus_autres_charges=other_cost_share
inflation_annuelle=annual_inflation
revenus=income
base_par_point_reputation=per_reputation_point
bonus_classement_premier=first_place_bonus
decroissance_par_place=rank_decay
multiplicateur_pays=nation_multipliers
multiplicateur_autres_pays=other_nations_multiplier
negociations_actives_max=max_negotiations
taille_shortlist=shortlist_size
seuil_vendeur_multiplicateur=seller_multiplier
seuil_vendeur_reduction_surplus=surplus_discount
poids_patience_negociation=patience_weight
ratio_contre_offre=counteroffer_ratio
score_joueur=player_score
poids_salaire=wage_weight
poids_reputation_club=reputation_weight
poids_ambition=ambition_weight
clubs_dormants=dormant_clubs
probabilite_acceptation_offre_au_prix=acceptance_probability
multiplicateur_prix_demande=asking_multiplier
probabilite_demarchage_par_fenetre=approach_probability
part_cible_transferts_entrants=target_incoming_share
contrats=contracts
seuil_satisfaction_negociation=satisfaction_threshold
mois_avant_fin_declenchant=renewal_months
poids_club=club_weight
facteur_ego=ego_factor
duree_proposee_par_age=duration_by_age
annees=years
garde_fous=guardrails
effectif_min=min_squad
effectif_max=max_squad
gardiens_min=min_goalkeepers
gardiens_recommandes=recommended_goalkeepers
plafond_salarial_strict=strict_wage_cap
solde_minimal_autorise=min_balance
personnalite_club=personality
appetit_risque=risk_appetite
preference_jeunes=youth_preference
agressivite_salariale=wage_aggression
patience_negociation=negotiation_patience
correlation_reputation_agressivite=reputation_aggression_correlation
poids_composite=composite_weight
poids_forme=form_weight
poids_fatigue=fitness_weight
seuil_rotation_fatigue=rotation_fitness
ecart_niveau_acceptable_rotation=rotation_gap
minutes_reference_par_mois=monthly_reference_minutes
facteur_jeu_min=min_playing_factor
facteur_jeu_dormants_et_libres=external_playing_factor
declin=decline
points_par_mois=points_per_month
decalage_age_gardien=goalkeeper_age_shift
poids_declin_par_attribut=decline_weights
plafonne_par_potentiel=potential_cap
declin_plafonne=decline_cap
estimation_potentiel=potential_estimate
bruit_max=max_noise
bruit_min=min_noise
age_debut_convergence=start_age
age_convergence=convergence_age
facteur_reputation_observateur=observer_reputation_factor
facteur_observateur_base=observer_base
actualisation=refresh
demi_largeur_en_ecarts_types=interval_width
cohorte=cohort
kappa_correction=correction_exponent
source_cibles=target_source
population_active_cible=active_target
coefficient_retour_effectif_cible=return_coefficient
axes_correction=correction_axes
buckets_niveau=level_buckets
convention_buckets=bucket_convention
sorties_incluent=outflow_types
entrees_hors_regens_incluent=inflow_types
excedent_cohorte=excess_policy
dormants_et_libres=external_policy
candidats_max_par_classe=max_class_candidates
cible_postes=position_targets
affinite_secondaire=secondary_affinity
postes_secondaires_possibles=secondary_positions
probabilite_poste_secondaire=secondary_probability
potentiel_min=min_potential
potentiel_amplitude=potential_amplitude
beta_alpha_nation_moyenne=potential_alpha
beta_beta_nation_moyenne=potential_beta
ratio_niveau_sur_potentiel=level_ratios
bruit_niveau_ecart_type=level_noise
centres_formation=academies
promus_min=min_intake
promus_max=max_intake
allocation_max_par_club=max_club_allocation
moyenne_base=base_mean
poids_note_centre=academy_weight
ecart_type_potentiel=potential_noise
duree_contrat_annees=contract_years
salaire_hebdo_base=base_weekly_wage
sorties=exits
retraite=retirement
facteur_niveau_base=level_base
facteur_niveau_pente=level_slope
sortie_perimetre=perimeter_exit
seuil_potentiel_estime=estimated_potential_threshold
sans_club_requis=free_agent_required
iterations_defaut_match=match_iterations
iterations_defaut_saison=season_iterations
saisons_demographie=demography_seasons
saisons_economie=economy_seasons
graine_defaut=default_seed
graines_monde=world_seeds
fenetre_comparaison_saisons=comparison_window
version_protocole=protocol_version
parallelisme=parallelism
affrontements_reference=fixtures
domicile=home
exterieur=away
victoire=win
nul=draw
defaite=loss
score_modal_diagnostique=diagnostic_mode
part_matches_zero_but=zero_goal_share
part_matches_quatre_buts_ou_plus=four_plus_goal_share
ecart_buts_moyen=mean_goal_difference
possessions_par_equipe=possessions_per_team
tirs_par_equipe=shots_per_team
xg_par_equipe=xg_per_team
buts_par_equipe=goals_per_team
cible=target
avantage_domicile_buts=home_goal_advantage
part_buts_coups_arretes=set_piece_goal_share
jaunes_par_equipe=yellows_per_team
rouges_par_equipe=reds_per_team
repartition_couloirs=lane_shares
xg_axe_superieur_aile=central_xg_above_wide
points_par_match_champion=champion_points_per_match
points_par_match_dernier=bottom_points_per_match
ecart_type_points_par_match=points_per_match_deviation
buts_meilleur_buteur=top_scorer_goals
titres_club_le_plus_fort_sur_100=strongest_title_share
correlation_spearman_reputation_rang_inverse=reputation_rank_correlation
poids_nul=draw_weight
score_equilibre_max_contre_le_champ=max_balance_score
score_equilibre_min_contre_le_champ=min_balance_score
levier_correction=correction_parameter
ecart_max_taux=max_rate_difference
bloquant=blocking
demographie=demography
saisons_stabilisation=warmup_seasons
derive_effectif_total=population_drift
derive_parts_postes=position_drift
derive_parts_nations=nation_drift
derive_joueurs_au_dessus_85=elite_drift
tolerance_absolue_joueurs_au_dessus_85=elite_absolute_tolerance
age_moyen_effectifs=mean_age
economie=economy
part_max_joueurs_80_dans_top3=top_three_talent_share
transferts_par_club_fenetre_ete=summer_transfers_per_club
champions_differents_par_pays_sur_25=different_champions
clubs_solde_negatif_permanent=permanently_negative_clubs
part_transferts_depuis_dormants=dormant_incoming_share
derive_masse_salariale_reelle_sur_horizon_max=real_wage_drift
saisons_consecutives_solde_negatif_permanent=negative_season_count
par_club_par_saison=per_club_season
part_hors_match=outside_match_share
indisponibles_moyens_par_club=mean_unavailable
longues_par_club_par_saison=long_per_club_season
ms_par_match_possession=match_milliseconds
secondes_par_saison_complete=season_seconds
secondes_100_saisons_analytique=analytical_100_seasons_seconds
secondes_chargement_donnees=import_seconds
secondes_sauvegarde=save_seconds
ordre_calibrage=calibration_order
""".strip().splitlines())

MAPS = {
    "attributs.note_globale": "FrozenMap[FrozenMap[float]]",
    "attributs.profils_generation.profils": "FrozenMap[FrozenMap[float]]",
    "implications.vertical_attaque": "FrozenMap[tuple[float, ...]]",
    "implications.vertical_defense": "FrozenMap[tuple[float, ...]]",
    "implications.lateral": "FrozenMap[tuple[float, ...]]",
    "formations.formations": "FrozenMap[tuple[str, ...]]",
    "ia_gestion.valorisation.rarete_poste": "FrozenMap[float]",
    "ia_gestion.budgets.revenus.multiplicateur_pays": "FrozenMap[float]",
    "demographie.progression.poids_declin_par_attribut": "FrozenMap[float]",
    "demographie.cible_postes": "FrozenMap[float]",
    "demographie.generation.postes_secondaires_possibles": "FrozenMap[tuple[str, ...]]",
}
WORDS.update({"promotion_relegation": "promotion_relegation", "exposant_reputation": "reputation_exponent"})
WORDS.update({"derive_reputation_moyenne_max": "reputation_mean_drift", "derive_reputation_dispersion_max": "reputation_spread_drift",
              "variation_reputation_annuelle_min": "min_reputation_change", "variation_reputation_annuelle_max": "max_reputation_change",
              "variation_reputation_saut_max": "max_reputation_jump", "persistance_top10_reputation_min": "min_top_ten_persistence"})
WORDS.update({"probabilite_club_national": "home_club_probability", "part_hors_tri": "unsorted_share",
              "intensite_tri_centres": "sorting_intensity", "poids_reputation_tri": "sorting_reputation_weight",
              "poids_age": "age_weights", "seuil_potentiel_elite": "elite_potential",
              "exposant_nations_elite": "elite_nation_exponent", "part_plancher_nation": "nation_floor",
              "noms_minimum_par_nation": "min_identities"})
WORDS["stabilite_apres_arrivee_jours"] = "arrival_stability_days"
WORDS["gain_qualite_min_recrutement"] = "minimum_quality_gain"
WORDS.update({"profondeur_effectif_min": "min_squad_depth", "profondeur_effectif_max": "max_squad_depth",
              "reputation_profondeur_min": "min_depth_reputation", "reputation_profondeur_max": "max_depth_reputation",
              "tolerance_baisse_reputation": "reputation_drop_tolerance", "marge_niveau_joueur": "player_level_margin",
              "moral_depart_force": "forced_exit_morale", "talents_visibles": "visible_talents",
              "jours_encheres": "auction_days", "poids_profondeur_vente": "depth_sale_weight"})
# Explicit compatibility defaults for configurations embedded in older saves.
DEFAULTS = {"benchmarks.economie.derive_reputation_moyenne_max": 3.0,
            "benchmarks.economie.derive_reputation_dispersion_max": 0.25,
            "benchmarks.economie.variation_reputation_annuelle_min": 0.5,
            "benchmarks.economie.variation_reputation_annuelle_max": 3.0,
            "benchmarks.economie.variation_reputation_saut_max": 20.0,
            "benchmarks.economie.persistance_top10_reputation_min": 0.6,
            "ia_gestion.mercato.stabilite_apres_arrivee_jours": 180,
            "ia_gestion.mercato.gain_qualite_min_recrutement": 3.0,
            "ia_gestion.mercato.profondeur_effectif_min": 16,
            "ia_gestion.mercato.profondeur_effectif_max": 20,
            "ia_gestion.mercato.reputation_profondeur_min": 50.0,
            "ia_gestion.mercato.reputation_profondeur_max": 80.0,
            "ia_gestion.mercato.poids_profondeur_vente": 0.75,
            "ia_gestion.mercato.tolerance_baisse_reputation": 5.0,
            "ia_gestion.mercato.marge_niveau_joueur": 2.0,
            "ia_gestion.mercato.moral_depart_force": 0.5,
            "ia_gestion.mercato.talents_visibles": 10,
            "ia_gestion.mercato.jours_encheres": 2,
            "etats.remplacements.gain_minimum_rotation": 10.0,
            "etats.remplacements.poids_deficit_temps_jeu": 8.0,
            "etats.remplacements.poids_developpement_jeunes": 10.0,
            "etats.remplacements.marge_potentiel_reference": 20.0,
            "etats.remplacements.minutes_utiles_minimum": 15,
            "etats.remplacements.intervalle_rotation_minutes": 10,
            "etats.remplacements.rotations_par_fenetre": 2,
            "etats.remplacements.affinite_minimum_rotation": 0.5,
            "etats.remplacements.facteur_rotation_match_serre": 0.5,
            "etats.remplacements.facteur_rotation_equipe_menee": 0.25,
            "etats.remplacements.facteur_ecart_avantage_confortable": 2.0,
            "etats.blessures.fragilite_note_basse": 2.3,
            "etats.blessures.fragilite_note_reference": 8.3,
            "etats.blessures.fragilite_note_haute": 14.3,
            "ia_gestion.contrats.ego_note_basse": 8.4,
            "ia_gestion.contrats.ego_note_reference": 12.4,
            "ia_gestion.contrats.ego_note_haute": 16.4,
            "moteur_match.occasion.sensibilite_livraison": 0.02,
            "moteur_match.occasion.niveau_reference_centre": 45.6,
            "moteur_match.occasion.niveau_reference_cpa": 55.3,
            "moteur_match.occasion.niveau_reference_coup_franc": 58.8,
            "moteur_match.cartons.agressivite_min": 0.25,
            "moteur_match.cartons.agressivite_max": 2.0,
            "moteur_match.cartons.agressivite_note_basse": 4.0,
            "moteur_match.cartons.agressivite_note_reference": 10.5,
            "moteur_match.cartons.agressivite_note_haute": 17.0,
            "demographie.cohorte.probabilite_club_national": 0.9, "demographie.cohorte.part_hors_tri": 0.10,
            "demographie.cohorte.intensite_tri_centres": 10.0, "demographie.cohorte.poids_reputation_tri": 0.0,
            "demographie.generation.poids_age": (0.45, 0.35, 0.15, 0.05), "demographie.generation.seuil_potentiel_elite": 85.0,
            "demographie.generation.exposant_nations_elite": 0.5, "demographie.generation.part_plancher_nation": 0.0002,
            "demographie.generation.noms_minimum_par_nation": 20}


def clean(value: object) -> object:
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items() if key != "_note"}
    if isinstance(value, list):
        return [clean(item) for item in value]
    return value


def camel(name: str) -> str:
    return "".join(part.capitalize() for part in name.split("_"))


def generate(domain: str, name: str) -> str:
    declarations: list[str] = []

    def infer(value: object, path: str, class_name: str) -> str:
        if path in MAPS:
            return MAPS[path]
        if path.startswith("attributs.composites."):
            return "FrozenMap[float]"
        if path.endswith((".domicile", ".exterieur")):
            return "int | str"
        if isinstance(value, bool):
            return "bool"
        if isinstance(value, int):
            return "int"
        if isinstance(value, float):
            return "float"
        if isinstance(value, str):
            return "str"
        if isinstance(value, list):
            if not value:
                raise ValueError(f"Declare the empty collection schema: {path}")
            if all(isinstance(item, (int, float)) for item in value):
                element = "int" if all(type(item) is int for item in value) else "float"
            else:
                element = infer(value[0], path + "[]", class_name + "Item")
            return f"tuple[{element}, ...]"
        if isinstance(value, dict):
            fields = []
            for key, item in sorted(value.items(), key=lambda pair: path + "." + pair[0] in DEFAULTS):
                field = WORDS.get(key, key)
                annotation = infer(item, path + "." + key, class_name + camel(field))
                default = f"default={DEFAULTS[path + '.' + key]!r}, " if path + "." + key in DEFAULTS else ""
                fields.append(f'    {field}: {annotation} = Field({default}alias="{key}")')
            declarations.append("@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)\n"
                                + f"class {class_name}:\n" + "\n".join(fields) + "\n")
            return class_name
        raise TypeError(path)

    baseline = clean(json.loads((ROOT / "config" / f"{domain}.json").read_text("utf-8")))
    infer(baseline, domain, camel(name) + "Config")
    header = ('"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""\n'
              'from __future__ import annotations\n\nfrom pydantic import Field\n'
              'from pydantic.dataclasses import dataclass\n'
              'from core.config.types import FrozenMap, MODEL_CONFIG\n\n')
    return header + "\n\n".join(declarations)


def main() -> None:
    target = ROOT / "src" / "core" / "config" / "models"
    target.mkdir(parents=True, exist_ok=True)
    (target / "__init__.py").write_text('"""Static, versioned configuration models."""\n', "utf-8")
    for source, name in DOMAINS.items():
        (target / f"{name}.py").write_text(generate(source, name), "utf-8")
    imports = "\n".join(f"from .models.{name} import {camel(name)}Config" for name in DOMAINS.values())
    fields = "\n".join(f'    {name}: {camel(name)}Config = Field(alias="{source}")'
                       for source, name in DOMAINS.items())
    (target.parent / "model.py").write_text(
        '"""The complete game configuration."""\nfrom pydantic import Field\n'
        'from pydantic.dataclasses import dataclass\nfrom .types import MODEL_CONFIG\n'
        + imports + '\n\n@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)\n'
        + 'class Config:\n' + fields + '\n', "utf-8")


if __name__ == "__main__":
    main()
