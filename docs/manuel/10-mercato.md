# Le mercato des clubs

Ce chapitre décrit comment les clubs de l'IA achètent et vendent entre eux, et à vous. Ce que vous faites de votre côté est décrit dans [Vos achats et vos ventes](#/aide/transferts).

Les transferts et les prêts n'ont lieu que pendant les deux fenêtres : du {{date(monde.mercato.ete.debut_jour, monde.mercato.ete.debut_mois)}} au {{date(monde.mercato.ete.fin_jour, monde.mercato.ete.fin_mois)}} et du {{date(monde.mercato.hiver.debut_jour, monde.mercato.hiver.debut_mois)}} au {{date(monde.mercato.hiver.fin_jour, monde.mercato.hiver.fin_mois)}}.

## Ce qu'un club cherche

Chaque club vise un niveau qui dépend de sa réputation : {{ia_gestion.profil_cible.niveau_base * 2}} + {{ia_gestion.profil_cible.poids_reputation * 2}} × réputation pour un titulaire, {{ia_gestion.profil_cible.decote_rotation * 2}} points de moins pour un joueur de rotation, {{ia_gestion.profil_cible.decote_doublure * 2}} de moins pour une doublure.

Il répartit son effectif sur les {{monde.regles_match.joueurs_sur_terrain}} places de sa formation, {{ia_gestion.profil_cible.rotations_cibles}} places de rotation et {{ia_gestion.profil_cible.doublures_cibles}} doublures, de la meilleure façon possible, puis mesure à chaque poste l'écart entre le niveau visé et le joueur qu'il y a. Un manque à un poste de titulaire pèse plein ; à un poste de rotation, {{pct(ia_gestion.utilite.poids_rotation, 0)}} ; à une doublure, {{pct(ia_gestion.utilite.poids_doublure, 0)}}. Le club cherche d'abord à combler son plus gros manque. Un club sous l'effectif minimal ou sans {{ia_gestion.garde_fous.gardiens_min}} gardiens recrute en urgence, quel que soit le niveau.

## Quand et qui il regarde

Le jour d'ouverture d'un mercato, tous les clubs font leur plan. Les jours suivants, un club ne retourne sur le marché qu'avec une faible probabilité chaque jour ({{pct(ia_gestion.mercato.daily_proposal_probability, 0)}} s'il ne peut plus ouvrir qu'un dossier, {{pct(ia_gestion.mercato.daily_proposal_probability / ia_gestion.mercato.negociations_actives_max, 0)}} s'il peut en ouvrir {{ia_gestion.mercato.negociations_actives_max}}), sauf urgence, ou quand une de ses offres vient d'échouer : il cherche alors aussitôt une autre cible.

Un club mène au plus {{ia_gestion.mercato.negociations_actives_max}} dossiers à la fois et ne recrute pas deux fois au même poste dans la même fenêtre, sauf pénurie.

Pour le poste recherché, il examine :

- {{ia_gestion.mercato.max_candidates_scanned}} joueurs de ce poste tirés au hasard dans le monde entier ;
- les {{ia_gestion.mercato.talents_visibles}} meilleurs joueurs vendables de ce poste, que tous les clubs connaissent ;
- les joueurs de ce poste que vous avez placés sur votre liste des transferts, examinés en premier.

Il les passe en revue du meilleur au moins bon et écarte ceux qui sont invendables, qui refuseraient de venir, dont le salaire demandé dépasse sa marge salariale ou dont le prix dépasse ses moyens. Parmi les {{ia_gestion.mercato.taille_shortlist}} premiers qui restent, il fait une offre au premier qui **améliore vraiment son effectif** : le gain doit valoir au moins {{ia_gestion.mercato.gain_qualite_min_recrutement * 2}} points de niveau sur une place de titulaire, davantage sur une place de rotation ou de doublure, qui pèsent moins. Il faut encore que le prix demandé tienne sous son [prix maximum](#/aide/mercato/le-prix-maximum-d-un-acheteur) pour ce joueur : sinon il le laisse à un club qui en a davantage besoin et passe au suivant.

Ses moyens sont son budget de transferts et sa trésorerie (voir [Finances](#/aide/finances)), diminués de ce que ses offres en cours ont déjà réservé.

## Le prix demandé

Pour chaque joueur, son club a un prix en dessous duquel il ne vend pas. C'est la colonne PRIX MIN. des listes de joueurs.

```
prix demandé = valeur × ({{ia_gestion.mercato.seuil_vendeur_multiplicateur}} ou {{ia_gestion.mercato.seuil_vendeur_multiplicateur - ia_gestion.mercato.seuil_vendeur_reduction_surplus}} si l'effectif est en surnombre)
             × (1 + {{ia_gestion.mercato.poids_patience_negociation}} × patience du club)
             × coefficient de statut
```

La valeur est celle du chapitre [Valeur, salaires et contrats](#/aide/contrats), décote de fin de contrat comprise. La patience est un trait du club, tiré à la création de la partie entre {{ia_gestion.personnalite_club.patience_negociation.min}} et {{ia_gestion.personnalite_club.patience_negociation.max}} : certains clubs sont durablement plus durs en affaires que d'autres. Un effectif est en surnombre au-delà de {{monde.regles_match.joueurs_sur_terrain + ia_gestion.profil_cible.rotations_cibles + ia_gestion.profil_cible.doublures_cibles}} joueurs.

**Le statut** est ce qui compte le plus :

| Statut dans son club | Coefficient |
|---|---:|
| Titulaire | {{ia_gestion.mercato.coef_prix_titulaire}} |
| Joueur de rotation | {{ia_gestion.mercato.coef_prix_rotation}} |
| Doublure | {{ia_gestion.mercato.coef_prix_doublure}} |
| Hors de l'effectif utile | {{ia_gestion.mercato.coef_prix_hors_effectif}} |

Le club retient la lecture la plus flatteuse parmi trois : la place du joueur dans son meilleur effectif, sa part des minutes jouées cette saison (une fois {{ia_gestion.mercato.matchs_confiance_minutes}} matches disputés, un joueur qui a joué {{pct(ia_gestion.mercato.part_minutes_pilier, 0)}} des minutes du joueur le plus utilisé est traité en titulaire), et pour un jeune l'écart entre son potentiel estimé et son niveau (un espoir est traité au moins comme un joueur de rotation dès {{ia_gestion.mercato.marge_potentiel_espoir * 2}} points de marge).

Un titulaire d'un club patient coûte donc jusqu'à {{n(ia_gestion.mercato.seuil_vendeur_multiplicateur * (1 + ia_gestion.mercato.poids_patience_negociation * ia_gestion.personnalite_club.patience_negociation.max) * ia_gestion.mercato.coef_prix_titulaire, 1)}} fois sa valeur ; un joueur dont son club ne se sert pas, dans un effectif en surnombre, part pour {{n((ia_gestion.mercato.seuil_vendeur_multiplicateur - ia_gestion.mercato.seuil_vendeur_reduction_surplus) * (1 + ia_gestion.mercato.poids_patience_negociation * ia_gestion.personnalite_club.patience_negociation.min) * ia_gestion.mercato.coef_prix_hors_effectif, 1)}} fois sa valeur.

**Les invendables.** Tout joueur a un prix, sauf dans quatre cas : son club est à l'effectif minimal de {{ia_gestion.garde_fous.effectif_min}} joueurs ; c'est un gardien et le club n'en a que {{ia_gestion.garde_fous.gardiens_min}} ; il est arrivé par transfert depuis moins de {{ia_gestion.mercato.stabilite_apres_arrivee_jours}} jours ; il est en prêt (voir [Réserve et prêts](#/aide/reserve-et-prets/les-prets)). Votre club peut en plus déclarer un de ses joueurs intransférable (voir [Vos achats et vos ventes](#/aide/transferts/declarer-un-joueur-intransferable)).

## Le prix maximum d'un acheteur

Face au prix demandé, chaque club a pour chaque joueur un prix qu'il ne dépasse pas. Il ne dépend pas du vendeur, mais de ce que le joueur apporterait à l'acheteur.

```
prix maximum = valeur que le club voit dans le joueur
             × ({{ia_gestion.mercato.multiplicateur_prix_max_acheteur}} + {{ia_gestion.mercato.offres.prime_besoin}} × besoin)
             × (1 + {{ia_gestion.mercato.offres.poids_appetit_risque}} × (appétit du risque − 0.5))
             × lecture du joueur
```

- Le **besoin** va de 0 à 1. C'est le gain que le joueur apporterait à son effectif, celui qui décide déjà du recrutement, rapporté à {{ia_gestion.mercato.offres.gain_besoin_plein * 2}} points de niveau sur une place de titulaire. Un club sous l'effectif minimal, ou qui cherche le gardien qui lui manque, a un besoin de 1.
- L'**appétit du risque** est un trait du club, tiré à la création de la partie entre {{ia_gestion.personnalite_club.appetit_risque.min}} et {{ia_gestion.personnalite_club.appetit_risque.max}} : certains clubs paient durablement plus cher que d'autres, de {{pct(ia_gestion.mercato.offres.poids_appetit_risque * (ia_gestion.personnalite_club.appetit_risque.min - 0.5), 0)}} à +{{pct(ia_gestion.mercato.offres.poids_appetit_risque * (ia_gestion.personnalite_club.appetit_risque.max - 0.5), 0)}}.
- La **lecture du joueur** est propre à chaque club et à chaque joueur. Elle est tirée une fois par mercato autour de 1, avec un écart-type de {{pct(ia_gestion.mercato.offres.bruit_ecart_type, 0)}} : deux clubs n'ont jamais tout à fait le même prix maximum pour un joueur.

Un club qui a à peine besoin d'un joueur n'en donne donc guère plus de {{ia_gestion.mercato.multiplicateur_prix_max_acheteur}} fois sa valeur ; celui qui en a le plus besoin va jusqu'à {{n(ia_gestion.mercato.multiplicateur_prix_max_acheteur + ia_gestion.mercato.offres.prime_besoin, 2)}} fois, davantage s'il aime le risque. C'est ce qui fait qu'un titulaire, demandé bien au-dessus de sa valeur, ne part que vers un club à qui il manque vraiment.

Ce maximum reste borné par les moyens du club : son budget de transferts et sa trésorerie, diminués de ce que ses autres offres réservent.

## Le déroulement d'une offre

1. Le prix demandé est connu de tous : l'acheteur l'offre tel quel, en le réservant sur son budget et le salaire du joueur sur sa masse salariale.
2. Toutes les offres pour un même joueur sont tranchées ensemble, une fois que la plus ancienne a {{ia_gestion.mercato.jours_encheres}} jours : les concurrents ont le temps de se déclarer.
3. Seul, l'acheteur paie le prix demandé, même s'il aurait donné davantage.
4. À plusieurs, **les acheteurs surenchérissent** : chacun suit tant que son prix maximum et ses moyens le permettent. Le plus offrant s'arrête {{pct(ia_gestion.mercato.offres.pas_surenchere, 0)}} au-dessus du maximum du suivant ; les autres finissent à leur propre maximum. Plus un joueur est disputé, plus il part cher.
5. Le vendeur ne retient que les offres à moins de {{pct(ia_gestion.mercato.offres.tolerance_vendeur, 0)}} de la plus haute. Parmi elles, **c'est le joueur qui choisit** (voir plus bas), pas forcément le plus offrant ; l'indemnité payée est celle du club qu'il choisit.
6. Le transfert est conclu si, à cet instant, l'acheteur a toujours le budget, la masse salariale et la place, et si le vendeur peut toujours se séparer du joueur. Les offres perdantes libèrent leurs réservations.

À la fermeture du mercato, les offres encore ouvertes tombent.

Vous ne demandez pas de prix pour vos joueurs : les offres que vous recevez se négocient autrement (voir [Vos achats et vos ventes](#/aide/transferts/recevoir-une-offre)).

## Ce qu'un joueur accepte

Avant toute offre, le joueur doit accepter le club. Les règles :

- Un joueur libre accepte tout club.
- Un club à peu près aussi réputé que le sien, ou plus réputé, est toujours acceptable : la tolérance est de {{ia_gestion.mercato.tolerance_baisse_reputation}} points de réputation vers le bas.
- Un club nettement moins réputé n'est acceptable que s'il reste à sa mesure : le niveau visé par ce club (plus {{ia_gestion.mercato.marge_niveau_joueur * 2}} points) doit atteindre le niveau du joueur. Un joueur accepte donc de descendre là où il sera un titulaire normal, pas là où il serait de loin le meilleur.
- Un joueur au moral de {{pct(ia_gestion.mercato.moral_depart_force, 0)}} ou moins accepte tout de même de descendre.
- Un joueur que son club a mis en vente tolère une baisse de {{ia_gestion.mercato.tolerance_baisse_joueur_a_vendre}} points de réputation au lieu de {{ia_gestion.mercato.tolerance_baisse_reputation}}.
- Un joueur **qui veut partir** parce que son club est trop petit pour lui (voir [Le moral](#/aide/etats/le-moral)) est plus exigeant : il n'accepte qu'un club plus réputé de plus de {{ia_gestion.mercato.tolerance_baisse_reputation}} points, quel que soit son moral.

C'est pour cela que certains joueurs ne sont « pas intéressés » par votre club : il est trop peu réputé par rapport au leur, et son niveau visé est en dessous du leur. La colonne INTÉRESSÉ de la liste des joueurs le dit pour chacun, avant toute offre : elle affiche T quand il accepterait un transfert chez vous.

**Entre plusieurs offres**, le joueur note chaque club :

| Critère | Poids | Mesure |
|---|---:|---|
| Salaire | {{pct(ia_gestion.mercato.score_joueur.poids_salaire, 0)}} | Salaire proposé rapporté au salaire attendu, plafonné à {{ia_gestion.budgets.salaires.ratio_offre_max_pour_score}} fois |
| Temps de jeu | {{pct(ia_gestion.mercato.score_joueur.poids_temps_de_jeu, 0)}} | Concurrence à son poste : 1 s'il serait le meilleur, 1/2 avec un meilleur que lui, 1/3 avec deux |
| Réputation | {{pct(ia_gestion.mercato.score_joueur.poids_reputation_club, 0)}} | Réputation du club |
| Ambition | {{pct(ia_gestion.mercato.score_joueur.poids_ambition, 0)}} | Niveau visé par le club |

Une petite part de hasard s'y ajoute. À salaire égal, un joueur préfère donc le club où il jouera à celui où il sera remplaçant de luxe.

## Les clubs non simulés

Les clubs non simulés participent des deux côtés, avec des règles plus simples.

- **Comme vendeurs** : ils demandent {{ia_gestion.mercato.clubs_dormants.multiplicateur_prix_demande}} fois la valeur du joueur, quel que soit son statut, et n'ont pas d'effectif minimal à protéger. Même au prix, ils ne vendent que {{pct(ia_gestion.mercato.clubs_dormants.probabilite_acceptation_offre_au_prix, 0)}} du temps : sinon toutes les offres pour le joueur sont refusées.
- **Comme acheteurs** : chacun a, à chaque fenêtre, {{pct(ia_gestion.mercato.clubs_dormants.probabilite_demarchage_par_fenetre, 0)}} de chances de se manifester, un seul jour de la fenêtre. Il regarde alors quelques joueurs parmi les joueurs en surnombre des clubs simulés, ceux de votre liste des transferts et les joueurs libres, et prend le meilleur qu'il peut s'offrir sous son prix maximum. Faute d'effectif simulé, son besoin est tiré au hasard pour le mercato.

## Les recrutements d'urgence

Un club ne peut pas descendre sous {{ia_gestion.garde_fous.effectif_min}} joueurs ni {{ia_gestion.garde_fous.gardiens_min}} gardiens par une vente. S'il y tombe autrement (retraites, fins de contrat), il signe immédiatement des joueurs libres, même hors mercato.
