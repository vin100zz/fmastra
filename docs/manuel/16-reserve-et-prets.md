# Réserve et prêts

Un jeune joueur loin de son potentiel a besoin de jouer pour progresser (voir [Progression, déclin et retraite](#/aide/progression/la-progression)), et l'équipe première n'a pas toujours de minutes pour lui. Deux moyens existent pour qu'il progresse quand même : la réserve du club, et le prêt à un autre club.

| | Réserve | Prêt |
|---|---|---|
| Où il joue | Nulle part : aucun match n'est simulé | Dans l'équipe première d'un autre club |
| Progression | Un facteur fixe, qui s'éteint quand il approche du niveau du club | Celle de ses vraies minutes |
| Disponible pour vos matches | Dès que vous le rappelez | Non, jusqu'à la fin du prêt |
| Quand | À tout moment | Pendant un mercato |
| Salaire et place dans l'effectif | Les vôtres | Les vôtres |

## La réserve

Un joueur placé en réserve n'est sélectionné pour aucun match de son club, ni par vous ni par l'entraîneur IA. Il reste dans l'effectif : il compte dans les {{ia_gestion.garde_fous.effectif_max}} places, son salaire est payé, il peut être vendu, prêté, blessé et appelé en sélection comme les autres.

**Ce que la réserve rapporte.** Un mois entier en réserve vaut un facteur de jeu de :

```
facteur de réserve = {{demographie.progression.reserve.facteur}} × extinction
extinction = (niveau visé par le club − {{demographie.progression.reserve.marge_niveau * 2}} − niveau du joueur) ÷ {{demographie.progression.reserve.plage_extinction * 2}}, borné entre 0 et 1
```

Le niveau visé par le club est celui du [mercato](#/aide/mercato/ce-qu-un-club-cherche) : {{ia_gestion.profil_cible.niveau_base * 2}} + {{ia_gestion.profil_cible.poids_reputation * 2}} × réputation. La réserve joue à un niveau bien inférieur à celui de l'équipe première : elle n'apprend plus rien à un joueur qui s'en approche.

| Réputation du club | Plein effet jusqu'au niveau | Plus aucun effet à partir du niveau |
|---:|---:|---:|
| 40 | {{n(ia_gestion.profil_cible.niveau_base * 2 + ia_gestion.profil_cible.poids_reputation * 80 - demographie.progression.reserve.marge_niveau * 2 - demographie.progression.reserve.plage_extinction * 2, 0)}} | {{n(ia_gestion.profil_cible.niveau_base * 2 + ia_gestion.profil_cible.poids_reputation * 80 - demographie.progression.reserve.marge_niveau * 2, 0)}} |
| 60 | {{n(ia_gestion.profil_cible.niveau_base * 2 + ia_gestion.profil_cible.poids_reputation * 120 - demographie.progression.reserve.marge_niveau * 2 - demographie.progression.reserve.plage_extinction * 2, 0)}} | {{n(ia_gestion.profil_cible.niveau_base * 2 + ia_gestion.profil_cible.poids_reputation * 120 - demographie.progression.reserve.marge_niveau * 2, 0)}} |
| 80 | {{n(ia_gestion.profil_cible.niveau_base * 2 + ia_gestion.profil_cible.poids_reputation * 160 - demographie.progression.reserve.marge_niveau * 2 - demographie.progression.reserve.plage_extinction * 2, 0)}} | {{n(ia_gestion.profil_cible.niveau_base * 2 + ia_gestion.profil_cible.poids_reputation * 160 - demographie.progression.reserve.marge_niveau * 2, 0)}} |

Le facteur de réserve ne s'ajoute pas aux minutes jouées : à la fin du mois, le joueur reçoit le meilleur des deux.

```
facteur du mois = le plus grand de :
    le facteur de jeu de ses minutes
    plancher + (facteur de réserve − plancher) × part du mois passée en réserve
```

Le plancher est ce que vaut un mois sans jouer dans ce club (voir [La progression](#/aide/progression/la-progression)). La part du mois compte les jours : un joueur rappelé le 20 garde ses jours de réserve, un joueur envoyé en réserve le 20 n'a que le dernier tiers du mois. Faire l'aller-retour avant chaque match ne rapporte donc rien de plus que de le laisser sur le banc.

**Qui l'accepte.** Pour le [moral](#/aide/etats/le-moral), le terme « temps de jeu » d'un joueur en réserve ne dépend plus de ses minutes :

- un joueur de {{demographie.progression.reserve.age_max}} ans ou moins **qui ne serait pas titulaire** est pleinement satisfait : il a devant lui, dans l'équipe première, au moins autant de joueurs de son poste que la formation du club en aligne ;
- tout autre joueur est totalement insatisfait de son temps de jeu : un joueur plus âgé, ou un jeune qui a déjà le niveau d'un titulaire à son poste.

Un joueur en réserve ne prend la place de personne dans le classement par poste : celui qui le suivait attend désormais les minutes du rang au-dessus.

**Vos limites.** Votre équipe première doit garder {{ia_gestion.garde_fous.effectif_min}} joueurs, dont {{ia_gestion.garde_fous.gardiens_min}} gardiens. Un joueur qu'un autre club vous prête ne peut pas être placé en réserve. Rien ne bouge pendant un match en direct ni pour un joueur de la composition du jour.

**Les clubs de l'IA.** Chaque semaine, un club de l'IA revoit sa réserve. Il y place ses **espoirs en surnombre** :

- {{ia_gestion.mercato.prets.age_max_ia}} ans ou moins ;
- un potentiel, tel que le club l'estime, au moins {{ia_gestion.mercato.prets.marge_potentiel_min * 2}} points au-dessus du niveau ;
- ni titulaire ni premier remplaçant : parmi les joueurs valides de l'équipe première, il a devant lui plus de joueurs de son poste que la formation n'en aligne ;
- un niveau auquel la réserve rapporte plus que le plancher.

Il s'arrête dès que l'équipe première tomberait sous ses minimums, en commençant par les plus faibles, et rappelle tout joueur qui ne remplit plus ces conditions : une blessure devant lui suffit à le ramener dans l'équipe première.

## Les prêts

Un joueur prêté joue pour un autre club jusqu'à une date fixée. Rien n'est payé ni négocié : le club propriétaire est d'accord ou non, le joueur et le club d'accueil aussi.

- **Le propriétaire paie tout le salaire.** Le joueur reste sur sa masse salariale et garde sa place dans son effectif : il compte dans ses {{ia_gestion.garde_fous.effectif_max}} joueurs, pas dans ceux du club d'accueil.
- **Le club d'accueil l'utilise comme un joueur à lui**, sauf qu'il ne peut ni le vendre, ni le prolonger, ni le placer en réserve.
- Pendant le prêt, son propriétaire ne le vend pas et ne le prolonge pas non plus. Le joueur revient le lendemain de la fin du prêt.

**Les durées.** Un prêt ne se conclut que pendant un mercato. Il court jusqu'à la fin de la saison, la veille du {{date(monde.dates_cles.liberation_contrats_expires.jour, monde.dates_cles.liberation_contrats_expires.mois)}}. Au mercato d'été, il peut aussi ne durer qu'une demi-saison : jusqu'à la veille de l'ouverture du mercato d'hiver, le {{date(monde.mercato.hiver.debut_jour, monde.mercato.hiver.debut_mois)}}. Un prêt conclu en été avant la fin des contrats de la saison écoulée vaut pour toute la saison qui vient.

**Ce qui empêche un club de prêter un joueur.**

- Il est déjà prêté, ou blessé.
- Son contrat se termine avant la fin du prêt, ou le jour même.
- Le club tomberait sous {{ia_gestion.garde_fous.effectif_min}} joueurs ou {{ia_gestion.garde_fous.gardiens_min}} gardiens.
- Un transfert est en cours : un club s'est mis d'accord sur son indemnité.

**Ce qu'il faut pour qu'un club l'accueille.** Trois conditions, les mêmes pour vous et pour l'IA :

- **Il a le niveau** : au moins le niveau visé par le club moins {{ia_gestion.profil_cible.decote_doublure * 2}} points, ce que le club demande à une doublure.
- **Il jouerait** : la formation du club utilise son poste, et il y serait titulaire ou premier remplaçant. Il a donc devant lui, dans l'équipe première, au plus autant de joueurs de son poste que la formation en aligne.
- **Le club n'est pas trop petit pour lui** : son niveau ne dépasse pas le niveau visé par le club de plus de {{ia_gestion.mercato.marge_depassement_club * 2}} points.

Seuls les clubs des championnats simulés accueillent un prêt.

**Pendant le prêt.** Le joueur progresse selon les minutes qu'il joue dans son club d'accueil, et son moral suit sa situation là-bas : son rang au poste, ses minutes depuis son arrivée, la réputation du club. Un club d'accueil trop modeste ne le frustre pas : il sait qu'il n'y est que de passage. Ses statistiques de la saison sont celles de son club d'accueil ; sa carrière indique « Prêt ».

## Les prêts entre clubs de l'IA

Un club de l'IA est prêt à prêter les mêmes joueurs qu'il placerait en réserve, ses espoirs en surnombre, quand rien ne l'empêche (voir plus haut). Tant qu'aucun club ne les prend, ils restent en réserve.

Chaque semaine d'un mercato, chacun de ces joueurs a {{pct(ia_gestion.mercato.prets.probabilite_hebdomadaire, 0)}} de chances de chercher un club. Les meilleurs choisissent en premier. Le joueur part, jusqu'à la fin de la saison, dans **le club le plus réputé** parmi ceux qui l'accueilleraient. Un club de l'IA accueille au plus {{ia_gestion.mercato.prets.emprunts_max_ia}} joueurs prêtés à la fois.

Vos joueurs ne sont jamais prêtés sans vous, et un club de l'IA ne vous envoie personne de lui-même.

## Prêter et emprunter

**Prêter.** Depuis la fiche d'un de vos joueurs, « Prêter » liste les clubs de l'IA qui l'accueilleraient aujourd'hui, du plus réputé au moins réputé. Vous choisissez le club et la durée ; le joueur part aussitôt. Si aucun club ne lui offrirait assez de temps de jeu, le bouton est grisé et dit pourquoi.

**Emprunter.** Depuis la fiche d'un joueur d'un autre club, « Emprunter » réussit si deux conditions sont réunies :

- son club est prêt à le prêter : c'est un de ses espoirs en surnombre, que rien n'empêche de partir ;
- il serait accueilli chez vous, selon les trois conditions ci-dessus.

Le joueur arrive aussitôt, gratuitement, et ne prend pas de place dans votre effectif. Le nombre de joueurs que vous empruntez n'est pas limité, mais chacun doit pouvoir être titulaire ou premier remplaçant à son poste.

**Dans la liste des joueurs**, deux colonnes disent tout cela avant d'ouvrir une fiche :

- **LISTÉ** : ce que son club est prêt à faire. **T** : il est à vendre, parce que vous l'avez mis sur votre liste des transferts, ou parce qu'il fait partie des joueurs en surnombre d'un club de l'IA, les plus faibles au-delà de {{monde.regles_match.joueurs_sur_terrain + ia_gestion.profil_cible.rotations_cibles + ia_gestion.profil_cible.doublures_cibles}} joueurs. **P** : son club est prêt à le prêter.
- **INTÉRESSÉ** : ce que le joueur accepte. **T** : il accepterait un transfert chez vous (voir [Ce qu'un joueur accepte](#/aide/mercato/ce-qu-un-joueur-accepte)). **P** : un prêt chez vous lui conviendrait.

Un emprunt est possible quand la colonne LISTÉ et la colonne INTÉRESSÉ affichent toutes deux P.
