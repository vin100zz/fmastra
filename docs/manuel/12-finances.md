# Les finances des clubs

Les finances sont volontairement simples : un revenu annuel qui dépend de la taille du club et de son classement, des salaires, des frais de fonctionnement, et les transferts. Il n'y a ni billetterie, ni droits télé par match, ni prime de coupe.

## Les revenus

Chaque club a un revenu annuel, fixé lors du bilan du {{date(monde.dates_cles.bilan_demographique.jour, monde.dates_cles.bilan_demographique.mois)}} et versé jour après jour pendant la saison.

```
revenu annuel = ({{eur(ia_gestion.budgets.revenus.base_par_point_reputation)}} × réputation + prime de classement) × coefficient du pays × soutien initial
```

**La prime de classement** dépend du rang final de la saison précédente, dans la division où le club jouait :

| Rang | Prime |
|---:|---:|
| 1 | {{eur(ia_gestion.budgets.revenus.bonus_classement_premier)}} |
| 2 | {{eur(ia_gestion.budgets.revenus.bonus_classement_premier * ia_gestion.budgets.revenus.decroissance_par_place)}} |
| 4 | {{eur(ia_gestion.budgets.revenus.bonus_classement_premier * ia_gestion.budgets.revenus.decroissance_par_place ** 3)}} |
| 8 | {{eur(ia_gestion.budgets.revenus.bonus_classement_premier * ia_gestion.budgets.revenus.decroissance_par_place ** 7)}} |
| 12 | {{eur(ia_gestion.budgets.revenus.bonus_classement_premier * ia_gestion.budgets.revenus.decroissance_par_place ** 11)}} |
| 18 | {{eur(ia_gestion.budgets.revenus.bonus_classement_premier * ia_gestion.budgets.revenus.decroissance_par_place ** 17)}} |

Chaque place perdue retire {{pct(1 - ia_gestion.budgets.revenus.decroissance_par_place, 0)}} de la prime. Le barème est le même dans toutes les divisions : la différence entre une première et une deuxième division passe par la réputation, pas par la prime. Un club non simulé n'a pas de prime.

**Le coefficient du pays** :

| Pays | Coefficient |
|---|---:|
{{#chaque ia_gestion.budgets.revenus.multiplicateur_pays}}| {{cle}} | {{valeur}} |
| Autres pays | {{ia_gestion.budgets.revenus.multiplicateur_autres_pays}} |

**Le soutien initial.** À la création de la partie, certains clubs ont une masse salariale réelle trop lourde pour le revenu que la formule leur donne. Le jeu gonfle alors leur revenu d'un facteur qui permet de payer ces salaires. Ce soutien n'est pas acquis : chaque année, il est ramené à ce que la masse salariale du moment exige, et ne remonte jamais. Un club qui allège sa masse salariale voit donc son revenu baisser l'année suivante, jusqu'à retrouver celui de la formule.

Ainsi, un club français de réputation 70 classé 5e touche {{eur((ia_gestion.budgets.revenus.base_par_point_reputation * 70 + ia_gestion.budgets.revenus.bonus_classement_premier * ia_gestion.budgets.revenus.decroissance_par_place ** 4) * ia_gestion.budgets.revenus.multiplicateur_pays.FRA)}} par an, hors soutien.

Les résultats sportifs ne rapportent donc rien sur le moment. Ils paient l'été suivant, par la prime de classement, et durablement, par la [réputation](#/aide/reputation).

## Les dépenses

- **Les salaires** : la somme des salaires de l'effectif, payée jour après jour.
- **Le fonctionnement** : {{pct(ia_gestion.budgets.comptabilite.part_revenus_autres_charges, 0)}} du revenu annuel, prélevés de la même façon.
- **Les indemnités de transfert** : payées en une fois le jour de la signature, et encaissées en une fois par le vendeur.

## Le plafond salarial

```
plafond salarial annuel = {{pct(ia_gestion.budgets.part_revenus_salaires, 0)}} du revenu annuel
```

Il est fixé lors du bilan annuel et ne bouge plus de la saison. Il est strict : aucune signature et aucune prolongation ne peut faire dépasser la masse salariale. Si le revenu baisse au point que le plafond passerait sous la masse salariale déjà engagée, le plafond est maintenu à cette masse : le club ne peut plus rien signer de plus cher, mais n'est forcé à aucune vente.

Les salaires réservés par vos offres en cours comptent dans la masse salariale.

## Le budget de transferts

Lors du bilan annuel :

```
budget de transferts = {{pct(ia_gestion.budgets.part_revenus_transfert, 0)}} du revenu annuel + {{pct(ia_gestion.budgets.part_solde_transfert, 0)}} de la trésorerie
```

Pendant la saison, chaque vente l'augmente de son montant et chaque achat le diminue. Il n'est pas réalimenté en hiver.

Un achat doit satisfaire deux limites à la fois : tenir dans le budget, et ne pas faire passer la trésorerie sous {{eur(ia_gestion.garde_fous.solde_minimal_autorise)}}.

Le budget non dépensé n'est pas reporté tel quel. L'argent, lui, reste en trésorerie, et {{pct(ia_gestion.budgets.part_solde_transfert, 0)}} de cette trésorerie reviennent dans le budget suivant : économiser une saison donne des moyens la suivante.

## La trésorerie

À la création de la partie, chaque club dispose de {{ia_gestion.budgets.financement_initial.reserve_tresorerie_mois}} mois de revenu en caisse.

Un club au plafond salarial dépense {{pct(ia_gestion.budgets.part_revenus_salaires + ia_gestion.budgets.comptabilite.part_revenus_autres_charges, 0)}} de son revenu en salaires et en fonctionnement : il dégage donc chaque année au moins {{pct(1 - ia_gestion.budgets.part_revenus_salaires - ia_gestion.budgets.comptabilite.part_revenus_autres_charges, 0)}} de son revenu, que seuls les transferts consomment. Il n'y a pas de faillite : une trésorerie trop basse bloque seulement les achats.

## Ce que voient les joueurs

Les finances n'entrent dans aucune décision de joueur. Un joueur regarde le salaire qu'on lui propose, la réputation du club et la concurrence à son poste, jamais la santé financière du club.
