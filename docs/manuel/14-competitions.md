# Les compétitions

## Championnats

Chaque championnat se joue en matches aller et retour, du {{date(monde.saison.debut_jour, monde.saison.debut_mois)}} au {{date(monde.saison.fin_jour, monde.saison.fin_mois)}} au plus tard. Une victoire vaut {{monde.saison.points_victoire}} points, un nul {{monde.saison.points_nul}}.

Les égalités au classement sont départagées, dans l'ordre, par la différence de buts, les buts marqués, puis les points pris dans les confrontations directes entre les clubs à égalité.

Le calendrier réserve d'abord les dates des coupes d'Europe, des coupes nationales et des sélections, puis place les journées de championnat en gardant au moins {{monde.europe.min_rest_days}} jours entre deux matches d'un même club. Les championnats les plus longs jouent des journées en semaine.

## Montées et descentes

Lors du bilan annuel, les {{monde.promotion_relegation.nb_clubs}} premiers de chaque division montent et les {{monde.promotion_relegation.nb_clubs}} derniers descendent, entre niveaux voisins d'un même pays.

Tout en bas, les {{monde.promotion_relegation.nb_clubs}} derniers de la dernière division simulée quittent les championnats simulés et deviennent des clubs non simulés. Ils sont remplacés par {{monde.promotion_relegation.nb_clubs}} clubs tirés au sort dans la division non simulée du dessous. Le tirage est pondéré par la réputation, à la puissance {{monde.promotion_relegation.exposant_reputation}} : un club deux fois plus réputé a {{2 ** monde.promotion_relegation.exposant_reputation}} fois plus de chances de monter. Un club qui vient de descendre ne peut pas remonter le même été.

Un club qui entre dans les championnats simulés avec un effectif trop court est complété par des jeunes (voir [Regens](#/aide/regens/les-joueurs-de-complement)).

## Coupes nationales

Chaque pays simulé a une coupe à 64 clubs, en six tours à élimination directe sur un seul match.

- **Les participants** : toutes les équipes premières de première et de deuxième division, puis des clubs des divisions inférieures tirés au sort, là encore selon le carré de leur réputation. Les équipes réserves ne participent pas.
- **Les tirages** : intégraux à chaque tour, sans tête de série, terrain compris. La finale se joue sur terrain neutre.
- **En cas d'égalité** : tirs au but directement, sans prolongation.
- Le vainqueur prend une des places de son pays en C3 pour la saison suivante, s'il n'est pas déjà qualifié pour la C1.

## Coupes d'Europe

Trois coupes (C1, C3, C4) de {{monde.europe.club_count}} clubs chacune.

**Qui se qualifie.** Chaque pays a, pour chaque coupe, une fourchette de places. Le nombre exact est tiré chaque saison à l'intérieur de cette fourchette, à total constant. Dans un pays simulé, les places vont dans l'ordre du classement de première division : d'abord la C1, puis la C3 (dont une place pour le vainqueur de la coupe nationale), puis la C4. La première saison, et pour les pays non simulés, les clubs sont tirés au sort selon leur réputation. Le tenant du titre n'a pas de place réservée.

**La phase de ligue.** Les clubs sont répartis en {{monde.europe.pot_count}} chapeaux par réputation. Chacun joue {{monde.europe.league_rounds}} matches contre des adversaires différents, dans un classement unique.

**La phase finale.**

- Les {{monde.europe.direct_places}} premiers vont directement en huitièmes de finale.
- Les {{monde.europe.playoff_places}} suivants jouent un barrage : les mieux classés reçoivent au retour.
- Les autres sont éliminés.
- Chaque tour fait l'objet d'un nouveau tirage, en matches aller et retour. En huitièmes, les qualifiés directs affrontent les vainqueurs des barrages et reçoivent au retour.
- Une égalité au cumul des deux matches mène directement aux tirs au but : pas de prolongation, pas de règle des buts à l'extérieur.
- La finale se joue sur un match, sur terrain neutre.

## Ce que rapporte une coupe

Aucune prime n'est versée pour un match ou un titre de coupe. Une coupe rapporte par la [réputation](#/aide/reputation) : la qualification européenne et les titres relèvent la cible de réputation, donc le revenu des saisons suivantes.

Elle coûte en revanche de la condition physique et des risques de blessure : l'écart minimal de {{monde.europe.min_rest_days}} jours entre deux matches ne suffit pas toujours à récupérer entièrement (voir [La condition physique](#/aide/etats/la-condition-physique)).

## Joueurs temporaires

Un club qui ne peut pas aligner onze joueurs disponibles, dont un gardien, pour un match de coupe ou de coupe d'Europe reçoit des renforts pour ce seul match. C'est surtout le cas des clubs non simulés.

- Leur niveau est proche de la moyenne de l'effectif du club, ou de sa réputation s'il n'a aucun joueur.
- Ils n'ont ni fiche, ni contrat, ni carrière : ils sont hors du marché et disparaissent après le match.
- Ils apparaissent en grisé dans les comptes rendus.

Les sélections nationales ont leur propre mécanisme de renfort (voir [Sélections nationales](#/aide/selections/les-renforts)).
