# Valeur, salaires et contrats

## La valeur marchande

La valeur d'un joueur est le socle de son prix de vente et de ce qu'un acheteur accepte de payer.

```
valeur = (valeur du niveau actuel + prime de potentiel × opinion) × facteur d'âge × rareté du poste
```

**La valeur du niveau.** La courbe est très convexe : quelques points de plus au sommet valent des dizaines de millions.

| Niveau | Valeur à 27-29 ans, poste neutre |
|---:|---:|
{{#chaque ia_gestion.valorisation.courbe_niveau}}| {{niveau * 2}} | {{eur(valeur)}} |

Entre deux lignes, la valeur est interpolée.

**Le facteur d'âge.**

| Âge | Facteur |
|---|---:|
{{#chaque ia_gestion.valorisation.courbe_age}}| {{age_min}} à {{age_max}} ans | {{facteur}} |

Le facteur glisse progressivement d'une tranche à la suivante.

**La rareté du poste.**

| Poste | Facteur |
|---|---:|
{{#chaque ia_gestion.valorisation.rarete_poste}}| {{cle}} | {{valeur}} |

**La prime de potentiel.** Un joueur qui peut encore progresser vaut plus que son niveau. La prime est l'écart entre la valeur du niveau qui correspond à {{pct(ia_gestion.valorisation.poids_potentiel_sur_niveau, 0)}} de son potentiel et celle de son niveau actuel, quand cet écart est positif. Un jeune vaut donc surtout par son potentiel, un joueur fait par son seul niveau.

**L'opinion.** Vous voyez le potentiel exact d'un joueur ; chaque club s'en fait une opinion, et la valeur affichée est celle de l'opinion commune. L'opinion ne touche que la prime de potentiel : elle la multiplie ou la divise par {{n(ia_gestion.valorisation.opinion.facteur_max_jeune, 2)}} au plus pour un joueur de {{demographie.estimation_potentiel.age_debut_convergence}} ans, par {{n(ia_gestion.valorisation.opinion.facteur_max_mur, 2)}} au plus à partir de {{demographie.estimation_potentiel.age_convergence}} ans. Un joueur peut donc être surévalué ou sous-évalué, jamais de beaucoup, et la valeur d'un joueur fait ne dépend d'aucune opinion (voir [Ce que les clubs voient du potentiel](#/aide/regens/ce-que-les-clubs-voient-du-potentiel)).

## La valeur de transfert

La valeur affichée sur la fiche d'un joueur, celle dont partent le prix demandé et le prix maximum d'un acheteur, est sa valeur de transfert :

```
valeur de transfert = (valeur du niveau actuel × forme de la saison + prime de potentiel × opinion)
                    × facteur d'âge × rareté du poste × exposition × décote de fin de contrat
```

**La forme de la saison** ne pèse que sur la valeur du niveau actuel :

```
forme = 1 + {{pct(ia_gestion.valorisation.performance.poids_temps_de_jeu, 0)}} × (2 × part du temps de jeu − 1) + {{pct(ia_gestion.valorisation.performance.poids_note, 0)}} × (note moyenne − {{n(ia_gestion.valorisation.performance.note_reference, 1)}}) ÷ {{n(ia_gestion.valorisation.performance.ecart_note_plein, 1)}}
```

- la part du temps de jeu compare ses minutes de la saison à celles du joueur le plus utilisé de son club ;
- l'écart de note compte pour {{n(ia_gestion.valorisation.performance.ecart_note_plein, 1)}} point au plus dans chaque sens, et pleinement après {{ia_gestion.mercato.matchs_confiance_minutes}} matchs notés ;
- la forme reste entre {{n(ia_gestion.valorisation.performance.facteur_min, 2)}} et {{n(ia_gestion.valorisation.performance.facteur_max, 2)}} ;
- tant que son club n'a pas joué {{ia_gestion.mercato.matchs_confiance_minutes}} matchs, la forme de la saison précédente complète celle de la saison en cours : pendant le mercato d'été, c'est elle qui parle ;
- un joueur d'un club non simulé, ou sans club, n'a pas de forme.

Un titulaire bien noté vaut ainsi jusqu'à {{pct(ia_gestion.valorisation.performance.facteur_max - 1, 0)}} de plus que son niveau, un joueur qui ne joue pas jusqu'à {{pct(1 - ia_gestion.valorisation.performance.facteur_min, 0)}} de moins.

**L'exposition.** Un joueur trop fort pour son club n'a pas été vu face à ses égaux, et son club n'a pas le poids pour en exiger le prix. Le niveau compté est celui de sa valeur : son niveau actuel, ou {{pct(ia_gestion.valorisation.poids_potentiel_sur_niveau, 0)}} de son potentiel s'il est plus haut. Au-delà de {{n(ia_gestion.valorisation.exposition.marge_niveau * 2, 0)}} points au-dessus du [niveau que vise son club](#/aide/mercato/ce-qu-un-club-cherche), chaque point de plus retire {{pct(1 - exp(-ia_gestion.valorisation.exposition.decote_par_point / 2), 1)}} de sa valeur de transfert, jusqu'à n'en laisser que {{pct(ia_gestion.valorisation.exposition.plancher, 0)}}.

Un joueur de niveau 140 dans un club de réputation 20 ne garde ainsi que {{pct(max(ia_gestion.valorisation.exposition.plancher, exp(-ia_gestion.valorisation.exposition.decote_par_point * (70 - ia_gestion.profil_cible.niveau_base - ia_gestion.profil_cible.poids_reputation * 20 - ia_gestion.valorisation.exposition.marge_niveau))), 0)}} de sa valeur ; dans un club de réputation 40, {{pct(min(1, max(ia_gestion.valorisation.exposition.plancher, exp(-ia_gestion.valorisation.exposition.decote_par_point * max(0, 70 - ia_gestion.profil_cible.niveau_base - ia_gestion.profil_cible.poids_reputation * 40 - ia_gestion.valorisation.exposition.marge_niveau)))), 0)}}. Recruté par un club à sa mesure, il retrouve toute sa valeur.

**La décote de fin de contrat.**

| Durée de contrat restante | Facteur |
|---|---:|
{{#chaque ia_gestion.valorisation.decote_fin_contrat}}| Moins de {{mois_max}} mois | {{facteur}} |

Au-delà, pas de décote. Un joueur libre a une valeur affichée de zéro : il n'y a rien à payer à personne.

## Le salaire attendu

Chaque joueur a un salaire de marché, qui ne dépend que de son niveau actuel et des moyens du club qui le paie. Ni son âge, ni son potentiel n'y entrent.

```
salaire annuel attendu = {{eur(ia_gestion.budgets.modele_salaire.salaire_reference)}} × {{n(exp(10 * ia_gestion.budgets.modele_salaire.pente_niveau / 2), 2)}} par tranche de 10 points de niveau au-dessus de {{ia_gestion.budgets.modele_salaire.niveau_reference * 2}}
                       × (revenu annuel du club ÷ {{eur(ia_gestion.budgets.modele_salaire.revenu_reference)}}) ^ {{ia_gestion.budgets.modele_salaire.exposant_revenu}}
                       × rareté du poste
```

| Niveau | Club à {{eur(ia_gestion.budgets.modele_salaire.revenu_reference / 8)}} de revenu | Club à {{eur(ia_gestion.budgets.modele_salaire.revenu_reference)}} | Club à {{eur(ia_gestion.budgets.modele_salaire.revenu_reference * 5)}} |
|---:|---:|---:|---:|
| 110 | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (55 - ia_gestion.budgets.modele_salaire.niveau_reference)) * (1 / 8) ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (55 - ia_gestion.budgets.modele_salaire.niveau_reference)) / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (55 - ia_gestion.budgets.modele_salaire.niveau_reference)) * 5 ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} |
| 120 | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (60 - ia_gestion.budgets.modele_salaire.niveau_reference)) * (1 / 8) ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (60 - ia_gestion.budgets.modele_salaire.niveau_reference)) / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (60 - ia_gestion.budgets.modele_salaire.niveau_reference)) * 5 ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} |
| 130 | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (65 - ia_gestion.budgets.modele_salaire.niveau_reference)) * (1 / 8) ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (65 - ia_gestion.budgets.modele_salaire.niveau_reference)) / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (65 - ia_gestion.budgets.modele_salaire.niveau_reference)) * 5 ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} |
| 140 | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (70 - ia_gestion.budgets.modele_salaire.niveau_reference)) * (1 / 8) ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (70 - ia_gestion.budgets.modele_salaire.niveau_reference)) / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (70 - ia_gestion.budgets.modele_salaire.niveau_reference)) * 5 ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} |
| 150 | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (75 - ia_gestion.budgets.modele_salaire.niveau_reference)) * (1 / 8) ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (75 - ia_gestion.budgets.modele_salaire.niveau_reference)) / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (75 - ia_gestion.budgets.modele_salaire.niveau_reference)) * 5 ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} |
| 160 | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (80 - ia_gestion.budgets.modele_salaire.niveau_reference)) * (1 / 8) ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (80 - ia_gestion.budgets.modele_salaire.niveau_reference)) / 12)}} | {{eur(ia_gestion.budgets.modele_salaire.salaire_reference * exp(ia_gestion.budgets.modele_salaire.pente_niveau * (80 - ia_gestion.budgets.modele_salaire.niveau_reference)) * 5 ** ia_gestion.budgets.modele_salaire.exposant_revenu / 12)}} |

Ces salaires sont mensuels, à un poste neutre. À niveau égal, un club quatre fois plus riche paie {{n(4 ** ia_gestion.budgets.modele_salaire.exposant_revenu, 1)}} fois plus : le même joueur attend davantage d'un grand club que d'un petit, et un joueur d'un petit club se contente de ce que son club peut offrir. Le plancher est de {{eur(ia_gestion.budgets.salaires.minimum_hebdomadaire * ia_gestion.budgets.semaines_par_an / 12)}} par mois. Ni la forme, ni l'exposition, ni la fin du contrat n'y entrent.

Ce salaire attendu sert de repère partout : pour le [moral](#/aide/etats/le-moral) (un joueur payé en dessous est mécontent), pour les prolongations et pour ce qu'un joueur demande à un nouveau club. Comme il suit le niveau, un jeune qui progresse devient vite sous-payé : un contrat signé à 17 ans ne suffit bientôt plus.

## Ce qu'un joueur demande pour signer

Le salaire minimal qu'un joueur accepte pour rejoindre un club part du salaire attendu dans ce club, auquel s'ajoutent {{pct(ia_gestion.contrats.part_surpaye_conservee, 0)}} de ce qu'il gagne au-dessus : un joueur surpayé ne renonce qu'à une partie de son avantage. Un joueur qui veut quitter un club trop petit pour lui part de son seul salaire attendu, quoi qu'il y gagne. Puis :

- **s'il monte** vers un club plus réputé, il demande une hausse de {{pct(ia_gestion.contrats.hausse_par_point_reputation, 0)}} par point de réputation d'écart, jusqu'à {{pct(ia_gestion.contrats.hausse_salaire_max, 0)}} ;
- **s'il descend**, il concède une baisse de {{pct(ia_gestion.contrats.baisse_par_point_reputation, 0)}} par point d'écart, jusqu'à {{pct(ia_gestion.contrats.baisse_salaire_max, 0)}} ;
- **l'appât du gain** module les deux : ces chiffres valent pour un joueur moyen ; un joueur très intéressé demande une hausse une fois et demie plus forte et concède une baisse deux fois plus faible, un joueur désintéressé fait l'inverse ;
- une prime s'ajoute enfin, jusqu'à {{pct(ia_gestion.contrats.prime_appat_gain, 0)}} pour l'appât du gain le plus élevé.

Un joueur libre n'a pas de club de départ : il demande le salaire attendu dans le club qui le veut, plus cette prime.

Pour votre club, ce montant est la colonne PRÉTENTIONS de la liste des joueurs, par mois et arrondi au-dessus : c'est la contre-offre que le joueur vous fera, et offrir ce montant suffit.

## La durée des contrats

Tout nouveau contrat, à la signature comme à la prolongation, a une durée fixée par l'âge du joueur et se termine un {{date(monde.dates_cles.liberation_contrats_expires.jour, monde.dates_cles.liberation_contrats_expires.mois)}} moins un jour :

| Âge à la signature | Durée en années |
|---|---:|
{{#chaque ia_gestion.contrats.duree_proposee_par_age}}| Jusqu'à {{age_max}} ans | {{annees}} |

## Les prolongations

Tous les {{ia_gestion.mercato.weekly_review_days}} jours, chaque joueur sous contrat est passé en revue. La question d'une prolongation se pose si son contrat se termine dans moins de {{ia_gestion.contrats.mois_avant_fin_declenchant}} mois, ou si sa satisfaction est sous {{pct(ia_gestion.contrats.seuil_satisfaction_negociation, 0)}}.

```
satisfaction = {{pct(ia_gestion.contrats.poids_salaire, 0)}} × salaire + {{pct(ia_gestion.contrats.poids_temps_de_jeu, 0)}} × temps de jeu + {{pct(ia_gestion.contrats.poids_club, 0)}} × standing du club
```

Les trois termes sont ceux du [moral](#/aide/etats/le-moral). La prolongation n'a lieu que si tout ceci est vrai :

- **le joueur ne veut pas partir** : un joueur frustré par un club trop petit pour lui ne prolonge jamais ;
- **le joueur n'arrive pas tout juste** : pendant les {{ia_gestion.mercato.stabilite_apres_arrivee_jours}} jours qui suivent son transfert, il ne rouvre pas le contrat qu'il vient de signer ;
- **le club tient à lui** : son départ affaiblirait le meilleur effectif que le club peut aligner, ou c'est l'un de ses {{ia_gestion.garde_fous.gardiens_min}} premiers gardiens, ou l'effectif est au minimum ;
- **le club en a les moyens** : un club de l'IA dont la masse salariale dépasse {{n(ia_gestion.contrats.depassement_revenus_sans_prolongation, 1)}} fois ce que son revenu autorise ne prolonge plus personne. Ses joueurs partent à la fin de leur contrat, jusqu'à ce que ses salaires redescendent à sa mesure ;
- **le salaire convient** : le club propose le salaire attendu, majoré de la prime d'appât du gain, et jamais moins que le salaire actuel. Si le plafond salarial ne le permet pas, il propose le salaire actuel, augmenté pour un club non simulé de ce que [sa part du plafond](#/aide/finances/le-plafond-salarial) laisse encore ; un joueur insatisfait refuse alors ;
- **le nouveau contrat apporte quelque chose** : une hausse d'au moins {{pct(ia_gestion.contrats.hausse_min_prolongation, 0)}} du salaire actuel, ou des années en plus quand le contrat se termine dans moins de {{ia_gestion.contrats.mois_avant_fin_declenchant}} mois. Un joueur insatisfait dont le contrat court encore longtemps ne demande donc qu'une hausse, et rien s'il gagne déjà presque ce qu'il demanderait. Le nouveau contrat ne se termine jamais avant l'actuel.

Un club de l'IA signe aussitôt. Pour votre club, la demande arrive dans vos actualités et attend votre réponse : tant que vous ne l'avez pas donnée, « Continuer » vous y ramène avant d'avancer.

- l'accepter applique le nouveau salaire et la nouvelle durée ; elle est refusée d'office si elle fait dépasser votre plafond salarial ;
- la refuser clôt la question : le joueur ne la repose pas de semaine en semaine. Il ne redemande un contrat qu'une fois, quand le sien entre dans ses {{ia_gestion.contrats.mois_avant_fin_declenchant}} derniers mois, si votre refus date d'avant. Son salaire continue de peser sur son [moral](#/aide/etats/le-moral), et « Proposer un contrat » reste possible à tout moment ;
- un joueur placé sur votre liste des transferts ne demande plus rien.

**Demander ses conditions à un joueur.** Vous n'avez pas à attendre sa demande : « Proposer un contrat » lui demande ses conditions à tout moment. Il annonce le salaire attendu, majoré de la prime d'appât du gain et jamais inférieur à son salaire actuel, pour la durée de son âge, et signe aussitôt si vous les acceptez. Il n'y a rien à négocier : ce sont ses conditions, ou rien. Il ne s'engage pas :

- s'il veut partir, frustré par un club trop petit pour lui ;
- pendant les {{ia_gestion.mercato.stabilite_apres_arrivee_jours}} jours qui suivent son arrivée ;
- si le nouveau contrat ne lui apporte ni hausse d'au moins {{pct(ia_gestion.contrats.hausse_min_prolongation, 0)}} de son salaire ni année de plus ;
- tant qu'il est prêté : il faut attendre son retour.

Le contrat est refusé s'il fait dépasser votre plafond salarial.

**Les contrats qui arrivent à terme.** Vos actualités vous préviennent quand un contrat arrive à 6 mois de sa fin, puis à 1 mois : chaque joueur y est nommé avec son salaire, et le contrat qu'il signerait.

Les joueurs dont le club ne veut plus vont au bout de leur contrat : c'est ce qui alimente le marché des joueurs libres.

## La fin de contrat

Le lendemain de la fin de son contrat, le joueur quitte le club sans indemnité et devient libre. Il peut signer dans n'importe quel club pendant un mercato, sans indemnité de transfert. Hors mercato, seuls les clubs passés sous l'effectif minimal recrutent des joueurs libres.

Un joueur libre continue de vieillir et de progresser, au rythme réduit des joueurs sans club (voir [Progression](#/aide/progression/la-progression)).
