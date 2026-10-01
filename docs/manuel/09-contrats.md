# Valeur, salaires et contrats

## La valeur marchande

La valeur d'un joueur est le socle de tout le reste : son salaire attendu, son prix de vente, ce qu'un acheteur accepte de payer.

```
valeur = valeur du niveau × facteur d'âge × rareté du poste × décote de fin de contrat
```

**La valeur du niveau.** Le niveau retenu est le plus haut des deux : le niveau actuel, ou {{pct(ia_gestion.valorisation.poids_potentiel_sur_niveau, 0)}} du potentiel estimé. Un jeune vaut donc surtout par son potentiel, un joueur fait par son niveau. La courbe est très convexe : quelques points de plus au sommet valent des dizaines de millions.

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

**La décote de fin de contrat.**

| Durée de contrat restante | Facteur |
|---|---:|
{{#chaque ia_gestion.valorisation.decote_fin_contrat}}| Moins de {{mois_max}} mois | {{facteur}} |

Au-delà, pas de décote. Un joueur libre a une valeur affichée de zéro : il n'y a rien à payer à personne.

> La valeur affichée s'appuie sur une estimation du potentiel, pas sur le potentiel exact que vous voyez. Pour un jeune, elle peut donc être nettement trop haute ou trop basse (voir [Ce que les clubs voient du potentiel](#/aide/regens/ce-que-les-clubs-voient-du-potentiel)).

## Le salaire attendu

Chaque joueur a un salaire de marché, qui découle de sa valeur hors décote de fin de contrat :

```
salaire annuel attendu = {{pct(ia_gestion.budgets.salaires.part_annuelle_valeur_intrinseque, 0)}} de la valeur
```

avec un plancher de {{eur(ia_gestion.budgets.salaires.minimum_hebdomadaire * ia_gestion.budgets.semaines_par_an / 12)}} par mois. Un joueur qui vaut 18 M€ attend ainsi {{eur(18000000 * ia_gestion.budgets.salaires.part_annuelle_valeur_intrinseque / 12)}} par mois.

Ce salaire attendu sert de repère partout : pour le [moral](#/aide/etats/le-moral) (un joueur payé en dessous est mécontent), pour les prolongations et pour ce qu'un joueur demande à un nouveau club. Comme la valeur d'un jeune monte avec son niveau, son salaire attendu monte aussi : un contrat signé à 17 ans devient vite insuffisant.

## Ce qu'un joueur demande pour signer

Le salaire minimal qu'un joueur accepte pour rejoindre un club part du plus haut de deux montants, son salaire actuel et son salaire attendu, puis :

- **s'il monte** vers un club plus réputé, il demande une hausse de {{pct(ia_gestion.contrats.hausse_par_point_reputation, 0)}} par point de réputation d'écart, jusqu'à {{pct(ia_gestion.contrats.hausse_salaire_max, 0)}} ;
- **s'il descend**, il concède une baisse de {{pct(ia_gestion.contrats.baisse_par_point_reputation, 0)}} par point d'écart, jusqu'à {{pct(ia_gestion.contrats.baisse_salaire_max, 0)}} ;
- **l'appât du gain** module les deux : ces chiffres valent pour un joueur moyen ; un joueur très intéressé demande une hausse une fois et demie plus forte et concède une baisse deux fois plus faible, un joueur désintéressé fait l'inverse ;
- une prime s'ajoute enfin, jusqu'à {{pct(ia_gestion.contrats.prime_appat_gain, 0)}} pour l'appât du gain le plus élevé.

Un joueur libre n'a pas de club de départ : il demande son salaire attendu, plus cette prime.

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
- **le salaire convient** : le club propose le salaire attendu, majoré de la prime d'appât du gain, et jamais moins que le salaire actuel. Si le plafond salarial ne le permet pas, il propose le salaire actuel ; un joueur insatisfait refuse alors ;
- **le nouveau contrat apporte quelque chose** : une hausse de salaire, ou des années en plus quand le contrat se termine dans moins de {{ia_gestion.contrats.mois_avant_fin_declenchant}} mois. Un joueur insatisfait dont le contrat court encore longtemps ne demande donc qu'une hausse. Le nouveau contrat ne se termine jamais avant l'actuel.

Un club de l'IA signe aussitôt. Pour votre club, la proposition arrive dans vos actualités et attend votre réponse :

- l'accepter applique le nouveau salaire et la nouvelle durée ; elle est refusée d'office si elle fait dépasser votre plafond salarial ;
- la refuser ne règle rien : tant que les conditions sont réunies, le joueur la représente à la revue suivante ;
- vous ne pouvez pas proposer vous-même une prolongation : c'est le joueur qui la demande ;
- un joueur placé sur votre liste des transferts ne demande plus rien.

Les joueurs dont le club ne veut plus vont au bout de leur contrat : c'est ce qui alimente le marché des joueurs libres.

## La fin de contrat

Le lendemain de la fin de son contrat, le joueur quitte le club sans indemnité et devient libre. Il peut signer dans n'importe quel club pendant un mercato, sans indemnité de transfert. Hors mercato, seuls les clubs passés sous l'effectif minimal recrutent des joueurs libres.

Un joueur libre continue de vieillir et de progresser, au rythme réduit des joueurs sans club (voir [Progression](#/aide/progression/la-progression)).
