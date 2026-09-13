"""Static configuration schema; regenerate intentionally with tools/generate_config_models.py."""
from __future__ import annotations

from pydantic import Field
from pydantic.dataclasses import dataclass
from core.config.types import FrozenMap, MODEL_CONFIG

@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigValuationAgeCurveItem:
    min_age: int = Field(alias="age_min")
    max_age: int = Field(alias="age_max")
    factor: float = Field(alias="facteur")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigValuationContractDiscountItem:
    max_months: int = Field(alias="mois_max")
    factor: float = Field(alias="facteur")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigValuation:
    base_euros: int = Field(alias="base_euros")
    exponent: float = Field(alias="exposant")
    reference_level: int = Field(alias="niveau_reference")
    potential_weight: float = Field(alias="poids_potentiel_sur_niveau")
    age_curve: tuple[ManagementConfigValuationAgeCurveItem, ...] = Field(alias="courbe_age")
    contract_discount: tuple[ManagementConfigValuationContractDiscountItem, ...] = Field(alias="decote_fin_contrat")
    position_scarcity: FrozenMap[float] = Field(alias="rarete_poste")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigUtility:
    starter_weight: float = Field(alias="poids_titulaire")
    rotation_weight: float = Field(alias="poids_rotation")
    backup_weight: float = Field(alias="poids_doublure")
    youth_preference_weight: float = Field(alias="poids_preference_jeunes")
    risk_weight: float = Field(alias="poids_appetit_risque")
    youth_age: int = Field(alias="age_seuil_jeunesse")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigTargetProfile:
    base_level: float = Field(alias="niveau_base")
    reputation_weight: float = Field(alias="poids_reputation")
    rotation_discount: float = Field(alias="decote_rotation")
    backup_discount: float = Field(alias="decote_doublure")
    rotation_places: int = Field(alias="rotations_cibles")
    backup_places: int = Field(alias="doublures_cibles")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigBudgetsInitialFunding:
    wage_headroom: float = Field(alias="marge_plafond_salarial")
    cash_reserve_months: int = Field(alias="reserve_tresorerie_mois")
    min_funding_factor: float = Field(alias="facteur_financement_min")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigBudgetsWages:
    annual_value_share: float = Field(alias="part_annuelle_valeur_intrinseque")
    weekly_minimum: int = Field(alias="minimum_hebdomadaire")
    max_offer_ratio: float = Field(alias="ratio_offre_max_pour_score")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigBudgetsAccounting:
    frequency: str = Field(alias="periodicite")
    other_cost_share: float = Field(alias="part_revenus_autres_charges")
    annual_inflation: float = Field(alias="inflation_annuelle")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigBudgetsIncome:
    per_reputation_point: int = Field(alias="base_par_point_reputation")
    first_place_bonus: int = Field(alias="bonus_classement_premier")
    rank_decay: float = Field(alias="decroissance_par_place")
    nation_multipliers: FrozenMap[float] = Field(alias="multiplicateur_pays")
    other_nations_multiplier: float = Field(alias="multiplicateur_autres_pays")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigBudgets:
    transfer_income_share: float = Field(alias="part_revenus_transfert")
    transfer_balance_share: float = Field(alias="part_solde_transfert")
    wage_income_share: float = Field(alias="part_revenus_salaires")
    weeks_per_year: int = Field(alias="semaines_par_an")
    initial_funding: ManagementConfigBudgetsInitialFunding = Field(alias="financement_initial")
    wages: ManagementConfigBudgetsWages = Field(alias="salaires")
    accounting: ManagementConfigBudgetsAccounting = Field(alias="comptabilite")
    income: ManagementConfigBudgetsIncome = Field(alias="revenus")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigMarketPlayerScore:
    wage_weight: float = Field(alias="poids_salaire")
    playing_time_weight: float = Field(alias="poids_temps_de_jeu")
    reputation_weight: float = Field(alias="poids_reputation_club")
    ambition_weight: float = Field(alias="poids_ambition")
    noise: float = Field(alias="bruit_ecart_type")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigMarketDormantClubs:
    acceptance_probability: float = Field(alias="probabilite_acceptation_offre_au_prix")
    asking_multiplier: float = Field(alias="multiplicateur_prix_demande")
    approach_probability: float = Field(alias="probabilite_demarchage_par_fenetre")
    target_incoming_share: float = Field(alias="part_cible_transferts_entrants")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigMarket:
    daily_proposal_probability: float = Field(alias="daily_proposal_probability")
    max_candidates_scanned: int = Field(alias="max_candidates_scanned")
    weekly_review_days: int = Field(alias="weekly_review_days")
    max_negotiations: int = Field(alias="negociations_actives_max")
    shortlist_size: int = Field(alias="taille_shortlist")
    seller_multiplier: float = Field(alias="seuil_vendeur_multiplicateur")
    surplus_discount: float = Field(alias="seuil_vendeur_reduction_surplus")
    patience_weight: float = Field(alias="poids_patience_negociation")
    counteroffer_ratio: float = Field(alias="ratio_contre_offre")
    player_score: ManagementConfigMarketPlayerScore = Field(alias="score_joueur")
    dormant_clubs: ManagementConfigMarketDormantClubs = Field(alias="clubs_dormants")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigContractsDurationByAgeItem:
    max_age: int = Field(alias="age_max")
    years: int = Field(alias="annees")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigContracts:
    evaluation: str = Field(alias="evaluation")
    satisfaction_threshold: float = Field(alias="seuil_satisfaction_negociation")
    renewal_months: int = Field(alias="mois_avant_fin_declenchant")
    wage_weight: float = Field(alias="poids_salaire")
    playing_time_weight: float = Field(alias="poids_temps_de_jeu")
    club_weight: float = Field(alias="poids_club")
    ego_factor: float = Field(alias="facteur_ego")
    ego_min: float = Field(alias="ego_min")
    ego_max: float = Field(alias="ego_max")
    duration_by_age: tuple[ManagementConfigContractsDurationByAgeItem, ...] = Field(alias="duree_proposee_par_age")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigGuardrails:
    min_squad: int = Field(alias="effectif_min")
    max_squad: int = Field(alias="effectif_max")
    min_goalkeepers: int = Field(alias="gardiens_min")
    recommended_goalkeepers: int = Field(alias="gardiens_recommandes")
    strict_wage_cap: bool = Field(alias="plafond_salarial_strict")
    min_balance: int = Field(alias="solde_minimal_autorise")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigPersonalityRiskAppetite:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigPersonalityYouthPreference:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigPersonalityWageAggression:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigPersonalityNegotiationPatience:
    min: float = Field(alias="min")
    max: float = Field(alias="max")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigPersonality:
    risk_appetite: ManagementConfigPersonalityRiskAppetite = Field(alias="appetit_risque")
    youth_preference: ManagementConfigPersonalityYouthPreference = Field(alias="preference_jeunes")
    wage_aggression: ManagementConfigPersonalityWageAggression = Field(alias="agressivite_salariale")
    negotiation_patience: ManagementConfigPersonalityNegotiationPatience = Field(alias="patience_negociation")
    reputation_aggression_correlation: float = Field(alias="correlation_reputation_agressivite")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfigSelection:
    composite_weight: float = Field(alias="poids_composite")
    form_weight: float = Field(alias="poids_forme")
    fitness_weight: float = Field(alias="poids_fatigue")
    rotation_fitness: float = Field(alias="seuil_rotation_fatigue")
    rotation_gap: float = Field(alias="ecart_niveau_acceptable_rotation")


@dataclass(frozen=True, slots=True, config=MODEL_CONFIG)
class ManagementConfig:
    valuation: ManagementConfigValuation = Field(alias="valorisation")
    utility: ManagementConfigUtility = Field(alias="utilite")
    target_profile: ManagementConfigTargetProfile = Field(alias="profil_cible")
    budgets: ManagementConfigBudgets = Field(alias="budgets")
    market: ManagementConfigMarket = Field(alias="mercato")
    contracts: ManagementConfigContracts = Field(alias="contrats")
    guardrails: ManagementConfigGuardrails = Field(alias="garde_fous")
    personality: ManagementConfigPersonality = Field(alias="personnalite_club")
    selection: ManagementConfigSelection = Field(alias="selection")
