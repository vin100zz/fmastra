# Les finances des clubs

Chaque club a un revenu annuel, qui dépend de sa réputation, de son stade, de son championnat et de ce que ses compétitions lui ont rapporté. Il paie des salaires, des frais de fonctionnement et des transferts, et dépense la trésorerie dont il ne fait rien.

## Les revenus

Chaque club a un revenu annuel, fixé lors du bilan du {{date(monde.dates_cles.bilan_demographique.jour, monde.dates_cles.bilan_demographique.mois)}} et versé jour après jour pendant la saison.

```
revenu annuel = (revenu propre + droits du championnat + primes de coupes) × soutien initial
```

Il n'est jamais inférieur à {{eur(ia_gestion.budgets.revenus_club.revenu_minimum)}} : de quoi payer un effectif complet au salaire minimum.

**Le revenu propre** est ce que le club gagne par lui-même, sponsors et billetterie. Il croît bien plus vite que la réputation : chaque point le multiplie par {{n(exp(ia_gestion.budgets.revenus_club.pente_reputation), 2)}}, dix points par {{n(exp(10 * ia_gestion.budgets.revenus_club.pente_reputation), 1)}}.

| Réputation | Revenu propre |
|---:|---:|
| 20 | {{eur(ia_gestion.budgets.revenus_club.revenu_propre_reference * exp(ia_gestion.budgets.revenus_club.pente_reputation * (20 - ia_gestion.budgets.revenus_club.reputation_reference)))}} |
| 40 | {{eur(ia_gestion.budgets.revenus_club.revenu_propre_reference * exp(ia_gestion.budgets.revenus_club.pente_reputation * (40 - ia_gestion.budgets.revenus_club.reputation_reference)))}} |
| 50 | {{eur(ia_gestion.budgets.revenus_club.revenu_propre_reference * exp(ia_gestion.budgets.revenus_club.pente_reputation * (50 - ia_gestion.budgets.revenus_club.reputation_reference)))}} |
| 60 | {{eur(ia_gestion.budgets.revenus_club.revenu_propre_reference * exp(ia_gestion.budgets.revenus_club.pente_reputation * (60 - ia_gestion.budgets.revenus_club.reputation_reference)))}} |
| 70 | {{eur(ia_gestion.budgets.revenus_club.revenu_propre_reference * exp(ia_gestion.budgets.revenus_club.pente_reputation * (70 - ia_gestion.budgets.revenus_club.reputation_reference)))}} |
| 80 | {{eur(ia_gestion.budgets.revenus_club.revenu_propre_reference * exp(ia_gestion.budgets.revenus_club.pente_reputation * (80 - ia_gestion.budgets.revenus_club.reputation_reference)))}} |
| 90 | {{eur(ia_gestion.budgets.revenus_club.revenu_propre_reference * exp(ia_gestion.budgets.revenus_club.pente_reputation * (90 - ia_gestion.budgets.revenus_club.reputation_reference)))}} |
| 99 | {{eur(ia_gestion.budgets.revenus_club.revenu_propre_reference * exp(ia_gestion.budgets.revenus_club.pente_reputation * (99 - ia_gestion.budgets.revenus_club.reputation_reference)))}} |

Ces montants valent pour un stade de {{n(ia_gestion.budgets.revenus_club.capacite_reference, 0)}} places. La billetterie y fait {{pct(ia_gestion.budgets.revenus_club.part_billetterie, 0)}} du revenu propre et suit la capacité du stade : deux fois plus de places ajoutent {{pct(ia_gestion.budgets.revenus_club.part_billetterie, 0)}} au revenu propre, deux fois moins en retirent {{pct(ia_gestion.budgets.revenus_club.part_billetterie / 2, 1)}}.

**Les droits du championnat** dépendent du pays, de la division et du classement de la saison précédente.

| Pays | Première division | Deuxième division |
|---|---:|---:|
{{#chaque ia_gestion.budgets.revenus_club.droits_championnat}}| {{cle}} | {{eur(valeur[0])}} | {{eur(valeur[1])}} |

La troisième division française verse {{eur(ia_gestion.budgets.revenus_club.droits_championnat.FRA[2])}}. Ces montants sont ceux d'un club classé au milieu du tableau : le premier touche {{n(2 * ia_gestion.budgets.revenus_club.rapport_premier_dernier / (ia_gestion.budgets.revenus_club.rapport_premier_dernier + 1), 2)}} fois ce montant et le dernier {{n(2 / (ia_gestion.budgets.revenus_club.rapport_premier_dernier + 1), 2)}} fois, soit {{n(ia_gestion.budgets.revenus_club.rapport_premier_dernier, 0)}} fois moins que le premier ; entre les deux, la part baisse régulièrement d'une place à l'autre. Un promu touche la part du dernier de sa nouvelle division, un relégué celle du premier.

Partout ailleurs, dans les autres pays comme dans les divisions non simulées, le championnat rapporte {{n(ia_gestion.budgets.revenus_club.ratio_droits_autres_championnats, 1)}} fois le revenu propre du club, hors effet du stade : seule la réputation du club compte.

**Les primes de coupes d'Europe** sont celles de la saison passée.

| Coupe | Participation | Victoire en phase de ligue | Nul | Barrages | Huitièmes | Quarts | Demi-finales | Finale | Titre |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
{{#chaque ia_gestion.budgets.primes.europe}}| {{cle}} | {{eur(valeur.participation)}} | {{eur(valeur.victoire)}} | {{eur(valeur.nul)}} | {{eur(valeur.tours[0])}} | {{eur(valeur.tours[1])}} | {{eur(valeur.tours[2])}} | {{eur(valeur.tours[3])}} | {{eur(valeur.tours[4])}} | {{eur(valeur.vainqueur)}} |

Un club touche la prime de chaque tour qu'il atteint ; qualifié directement pour les huitièmes, il touche aussi celle des barrages.

**La prime de coupe nationale** est une part des droits de la première division du pays, pour chaque tour joué :

| Tour joué | Part des droits de la première division |
|---:|---:|
{{#chaque ia_gestion.budgets.primes.coupe_nationale.parts_par_tour}}| {{i + 1}} | {{pct(element, 1)}} |

Le vainqueur touche {{pct(ia_gestion.budgets.primes.coupe_nationale.part_vainqueur, 0)}} de plus. En France, gagner la coupe rapporte ainsi {{eur((sum(ia_gestion.budgets.primes.coupe_nationale.parts_par_tour) + ia_gestion.budgets.primes.coupe_nationale.part_vainqueur) * ia_gestion.budgets.revenus_club.droits_championnat.FRA[0])}} en tout.

**Le soutien initial.** À la création de la partie, certains clubs ont une masse salariale réelle trop lourde pour le revenu que la formule leur donne. Le jeu gonfle alors leur revenu d'un facteur qui permet de payer ces salaires. Ce soutien n'est pas acquis : chaque année, il est ramené à ce que la masse salariale du moment exige, et ne remonte jamais. Un club qui allège sa masse salariale voit donc son revenu baisser l'année suivante, jusqu'à retrouver celui de la formule.

**La relégation** est la seule exception. Les droits d'une division inférieure ne sont qu'une fraction de ceux de la division quittée, alors que les contrats, eux, descendent avec le club. L'année de sa descente, le club retrouve donc le soutien que sa masse salariale exige ; il se retire ensuite comme le soutien initial, à mesure que ces contrats s'achèvent ou que les joueurs partent.

Ainsi, un club français de première division, de réputation 70, classé au milieu du tableau, avec un stade de {{n(ia_gestion.budgets.revenus_club.capacite_reference, 0)}} places, touche {{eur(ia_gestion.budgets.revenus_club.revenu_propre_reference * exp(ia_gestion.budgets.revenus_club.pente_reputation * (70 - ia_gestion.budgets.revenus_club.reputation_reference)) + ia_gestion.budgets.revenus_club.droits_championnat.FRA[0])}} par an, hors coupes et hors soutien ; le même club en Angleterre, {{eur(ia_gestion.budgets.revenus_club.revenu_propre_reference * exp(ia_gestion.budgets.revenus_club.pente_reputation * (70 - ia_gestion.budgets.revenus_club.reputation_reference)) + ia_gestion.budgets.revenus_club.droits_championnat.ENG[0])}}.

Les résultats sportifs ne rapportent donc rien sur le moment. Ils paient l'été suivant, par les droits du championnat et les primes de coupes, et durablement, par la [réputation](#/aide/reputation).

## Les dépenses

- **Les salaires** : la somme des salaires de l'effectif, payée jour après jour. Un club non simulé paie aussi les joueurs que le jeu ne connaît pas : la part de son plafond qu'ils retiennent (voir plus bas) sort de ses comptes avec les autres salaires.
- **Le fonctionnement** : {{pct(ia_gestion.budgets.comptabilite.part_revenus_autres_charges, 0)}} du revenu annuel, prélevés de la même façon.
- **Les investissements** : au-delà de {{n(ia_gestion.budgets.investissements.mois_reserve, 0)}} mois de revenu en caisse, un club dépense chaque année {{pct(ia_gestion.budgets.investissements.part_annuelle, 0)}} de ce qui dépasse, jour après jour, en équipements et en dividendes. Sous cette réserve, rien n'est prélevé. Votre club y est soumis comme les autres : une trésorerie qui dort fond.
- **Les indemnités de transfert** : payées en une fois le jour de la signature, et encaissées en une fois par le vendeur.

## Le plafond salarial

```
plafond salarial annuel = {{pct(ia_gestion.budgets.part_revenus_salaires, 0)}} du revenu annuel
```

Il est fixé lors du bilan annuel ; pendant la saison, seule votre [répartition des budgets](#/aide/finances/la-repartition-des-budgets) le déplace. Il est strict : aucune signature et aucune prolongation ne peut faire dépasser la masse salariale. Si le revenu baisse au point que le plafond passerait sous la masse salariale déjà engagée, le plafond est maintenu à cette masse : le club ne peut plus rien signer de plus cher, mais n'est forcé à aucune vente.

Les salaires réservés par vos offres en cours comptent dans la masse salariale.

Une seule chose passe avant le plafond : l'effectif minimal. Un club simulé qui en manque reçoit toujours les jeunes de son centre qu'il lui faut, et son plafond s'élève de leur salaire.

**Les clubs non simulés.** Le jeu ne connaît souvent que quelques joueurs d'un club non simulé, alors que ce club emploie un effectif complet. Son plafond salarial est donc partagé entre les {{monde.regles_match.joueurs_sur_terrain + ia_gestion.profil_cible.rotations_cibles + ia_gestion.profil_cible.doublures_cibles}} places d'un effectif complet, et les places sans joueur connu retiennent leur part. Les joueurs connus sont ses mieux payés : chacun pèse {{n(ia_gestion.mercato.poids_joueur_connu_club_dormant, 0)}} joueurs absents.

```
part des joueurs connus = plafond × {{n(ia_gestion.mercato.poids_joueur_connu_club_dormant, 0)}} × joueurs connus ÷ ({{n(ia_gestion.mercato.poids_joueur_connu_club_dormant, 0)}} × joueurs connus + places sans joueur connu)
```

Un club dont le jeu ne connaît qu'un joueur ne peut ainsi lui verser que {{pct(ia_gestion.mercato.poids_joueur_connu_club_dormant / (ia_gestion.mercato.poids_joueur_connu_club_dormant + monde.regles_match.joueurs_sur_terrain + ia_gestion.profil_cible.rotations_cibles + ia_gestion.profil_cible.doublures_cibles - 1), 0)}} de son plafond, pas le plafond entier. Un joueur qui arrive prend la place d'un joueur absent ; à partir de {{monde.regles_match.joueurs_sur_terrain + ia_gestion.profil_cible.rotations_cibles + ia_gestion.profil_cible.doublures_cibles}} joueurs connus, le club dispose de tout son plafond. Ce partage n'apparaît dans aucun écran, et il ne revient pas sur un contrat déjà signé.

## Le budget de transferts

Lors du bilan annuel :

```
budget de transferts = {{pct(ia_gestion.budgets.part_revenus_transfert, 0)}} du revenu annuel + {{pct(ia_gestion.budgets.part_solde_transfert, 0)}} de la trésorerie
```

Pendant la saison, chaque vente l'augmente de son montant et chaque achat le diminue. Il n'est pas réalimenté en hiver.

Un achat doit satisfaire deux limites à la fois : tenir dans le budget, et ne pas faire passer la trésorerie sous {{eur(ia_gestion.garde_fous.solde_minimal_autorise)}} : un club n'achète pas à découvert.

Le budget non dépensé n'est pas reporté tel quel. L'argent, lui, reste en trésorerie, et {{pct(ia_gestion.budgets.part_solde_transfert, 0)}} de cette trésorerie reviennent dans le budget suivant : économiser une saison donne des moyens la suivante.

## La répartition des budgets

Le plafond salarial et le budget de transferts sont deux parts d'une même enveloppe, et vous choisissez où passe la limite entre elles : dans l'onglet Finances de votre club, la poignée de la barre déplace de l'argent de l'une à l'autre, à tout moment et sans frais.

```
1 € de plafond salarial par mois = 12 € de budget de transferts
```

Relever le plafond coûte donc une saison du salaire qu'il autorise ; l'abaisser rend la même somme au budget. Les clubs dirigés par l'IA gardent la répartition du bilan annuel.

Seul ce qui est libre se déplace :

- le plafond ne descend pas sous la masse salariale, salaires réservés par vos offres en cours compris ;
- le budget ne descend pas sous les indemnités que ces offres réservent.

Déplacer un budget ne déplace pas d'argent : la trésorerie ne change pas, et un achat doit toujours tenir dans la trésorerie. Les salaires signés grâce à un plafond relevé, eux, se paient jour après jour. Une masse salariale et un fonctionnement qui dépassent le revenu annuel vident la trésorerie saison après saison.

**Au bilan annuel**, votre écart au plafond de la formule est reconduit :

- relevé, le plafond l'est de nouveau, et le nouveau budget de transferts paie d'abord cette saison de salaires. S'il n'y suffit pas, l'écart est réduit à ce qu'il paie, et le plafond ne passe jamais sous la masse salariale engagée ;
- abaissé, le plafond l'est de nouveau, autant que la masse salariale le permet, et la somme rejoint le nouveau budget de transferts.

## La trésorerie

À la création de la partie, chaque club dispose de {{ia_gestion.budgets.financement_initial.reserve_tresorerie_mois}} mois de revenu en caisse.

Un club au plafond salarial dépense {{pct(ia_gestion.budgets.part_revenus_salaires + ia_gestion.budgets.comptabilite.part_revenus_autres_charges, 0)}} de son revenu en salaires et en fonctionnement : il dégage donc chaque année au moins {{pct(1 - ia_gestion.budgets.part_revenus_salaires - ia_gestion.budgets.comptabilite.part_revenus_autres_charges, 0)}} de son revenu, que consomment les transferts et, au-delà de la réserve, les investissements. Il n'y a pas de faillite : une trésorerie trop basse bloque seulement les achats.

## Ce que voient les joueurs

Les finances n'entrent dans aucune décision de joueur. Un joueur regarde le salaire qu'on lui propose, la réputation du club et la concurrence à son poste, jamais la santé financière du club.
