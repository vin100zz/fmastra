# Le moteur de match

## Vue d'ensemble

Un match est une suite de **possessions** qui alternent entre les deux équipes : environ {{n((moteur_match.chronologie.duree_match_secondes + moteur_match.chronologie.temps_additionnel_max) / moteur_match.chronologie.duree_possession_moyenne, -1)}} par match, de {{moteur_match.chronologie.duree_possession_moyenne}} secondes en moyenne. À chaque possession, l'équipe qui a le ballon tente de le faire avancer de zone en zone, puis de créer une occasion, puis de marquer. Chaque étape est un duel entre ce que vaut l'attaque et ce que vaut la défense à cet endroit du terrain. Dès qu'un duel est perdu, le ballon change de camp.

Rien n'est décidé joueur contre joueur avant le tir : ce sont des notes de zone, calculées à partir des onze joueurs présents, de leurs postes et de leur état, qui s'affrontent. Les joueurs nommés dans le résumé (celui qui porte le ballon, celui qui le récupère) sont désignés ensuite.

## Le terrain : zones et couloirs

Le terrain est découpé en quatre zones dans la longueur (défense, milieu bas, milieu haut, zone de vérité) et trois couloirs (gauche, axe, droite). Les deux équipes voient le terrain en miroir : votre zone de vérité est la zone de défense adverse, votre couloir gauche est son couloir droit.

Chaque poste a une **implication** dans chaque zone, différente selon que son équipe attaque ou défend, et une répartition entre les couloirs. L'implication d'un joueur à un endroit est le produit des deux.

Implication en attaque :

| Poste | Défense | Milieu bas | Milieu haut | Zone de vérité |
|---|---:|---:|---:|---:|
{{#chaque implications.vertical_attaque}}| {{cle}} | {{valeur[0]}} | {{valeur[1]}} | {{valeur[2]}} | {{valeur[3]}} |

Implication en défense (les zones sont celles de sa propre équipe : « Défense » est devant son but) :

| Poste | Défense | Milieu bas | Milieu haut | Zone de vérité |
|---|---:|---:|---:|---:|
{{#chaque implications.vertical_defense}}| {{cle}} | {{valeur[0]}} | {{valeur[1]}} | {{valeur[2]}} | {{valeur[3]}} |

Répartition entre les couloirs :

| Poste | Gauche | Axe | Droite |
|---|---:|---:|---:|
{{#chaque implications.lateral}}| {{cle}} | {{valeur[0]}} | {{valeur[1]}} | {{valeur[2]}} |

Une formation n'est rien d'autre qu'une liste de onze postes : ce sont ces tableaux qui font qu'un 4-3-3 pèse sur les ailes et qu'un 5-3-2 densifie sa surface.

## La force d'une équipe dans une zone

Pour chaque zone, chaque couloir et chaque phase (progresser, défendre la progression, créer, défendre la création), l'équipe a une note.

```
qualité d'un joueur = composite de la phase × forme × condition × moral × affinité au poste
note de zone = moyenne des qualités, pondérée par l'implication
               × (densité ÷ {{moteur_match.densite.reference}}) ^ {{moteur_match.densite.exposant}}
```

La **densité** est la somme des implications des joueurs à cet endroit. La moyenne dit si les joueurs présents sont bons ; la densité dit s'ils sont assez nombreux. Mettre un joueur de plus dans une zone renforce donc la note même s'il n'est pas le meilleur, et vider une zone l'affaiblit quelle que soit la qualité de ceux qui restent.

Les quatre multiplicateurs d'état sont détaillés dans [Forme, moral et condition physique](#/aide/etats). Les notes sont recalculées toutes les {{moteur_match.recalcul_notes.palier_fatigue_minutes}} minutes pour suivre la fatigue, et à chaque remplacement, changement de poste, blessure ou expulsion.

## Progresser et créer

Dans la zone et le couloir où se trouve le ballon, l'écart est la note d'attaque moins la note de défense adverse. Il est borné en douceur : au-delà de {{moteur_match.transitions.ecart_note_max * 2}} points, un écart supplémentaire ne change presque plus rien.

```
chance de réussir = sigmoïde(sensibilité × écart + biais)
```

| Écart (points sur 200) | Avancer d'une zone | Avancer, à domicile | Créer l'occasion |
|---:|---:|---:|---:|
| −40 | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(-20 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.bonus_domicile + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(-20 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.creation_bias + moteur_match.transitions.k_occ * moteur_match.transitions.ecart_note_max * tanh(-20 / moteur_match.transitions.ecart_note_max)), 0)}} |
| −20 | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(-10 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.bonus_domicile + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(-10 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.creation_bias + moteur_match.transitions.k_occ * moteur_match.transitions.ecart_note_max * tanh(-10 / moteur_match.transitions.ecart_note_max)), 0)}} |
| 0 | {{pct(sigmoide(moteur_match.transitions.progression_bias), 0)}} | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.bonus_domicile), 0)}} | {{pct(sigmoide(moteur_match.transitions.creation_bias), 0)}} |
| +20 | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(10 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.bonus_domicile + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(10 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.creation_bias + moteur_match.transitions.k_occ * moteur_match.transitions.ecart_note_max * tanh(10 / moteur_match.transitions.ecart_note_max)), 0)}} |
| +40 | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(20 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.bonus_domicile + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(20 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.creation_bias + moteur_match.transitions.k_occ * moteur_match.transitions.ecart_note_max * tanh(20 / moteur_match.transitions.ecart_note_max)), 0)}} |

Dans les trois premières zones, une réussite fait avancer le ballon d'une zone, et dans environ {{pct(moteur_match.couloirs.probabilite_changement_aile, 0)}} des cas le fait passer dans un couloir voisin, de préférence celui où l'équipe domine le plus. Dans la zone de vérité, une réussite donne une occasion : une frappe si le ballon est dans l'axe, un centre repris de la tête s'il est sur une aile.

Trois correctifs s'appliquent à la chance de réussir :

- **L'avantage du terrain** aide l'équipe à domicile à avancer (colonne du milieu), jamais à créer ni à marquer. Il disparaît sur terrain neutre.
- **Le relâchement** : une équipe qui mène de plus de {{moteur_match.transitions.avance_confortable}} buts gère son avance. Chaque but d'avance supplémentaire réduit ses chances d'avancer et de créer (à écart nul, elle n'avance plus que dans {{pct(sigmoide(moteur_match.transitions.progression_bias - moteur_match.transitions.relachement_par_but), 0)}} des cas avec trois buts d'avance).
- **Le contre** : voir plus bas.

## Les tirs

Le tireur est désigné parmi les joueurs impliqués à l'endroit de l'occasion, en proportion de leur implication offensive : un avant-centre frappe bien plus souvent qu'un milieu défensif. Chaque occasion a une probabilité de but de départ, corrigée par le duel entre le tireur et le gardien.

| Occasion | Probabilité de départ | Qualité du tireur | Qualité du gardien |
|---|---:|---|---|
| Frappe dans l'axe | {{pct(moteur_match.occasion.xg_base_frappe, 1)}} | Frappe | Arrêts |
| Frappe en contre | {{pct(moteur_match.occasion.xg_base_frappe * moteur_match.occasion.multiplicateur_contre, 1)}} | Frappe | Arrêts |
| Centre repris de la tête | {{pct(moteur_match.occasion.xg_base_centre, 1)}} | Jeu aérien | {{pct(moteur_match.occasion.poids_gardien_sur_tete.sortie, 0)}} sorties aériennes, {{pct(moteur_match.occasion.poids_gardien_sur_tete.arret, 0)}} arrêts |
| Corner | {{pct(moteur_match.coups_arretes.xg_base_corner, 1)}} | Jeu aérien | Comme un centre |
| Coup franc direct | {{pct(moteur_match.coups_arretes.xg_base_coup_franc_direct, 1)}} | Frappe, plus son avance en coups arrêtés | Arrêts |

Les qualités du tireur et du gardien sont multipliées par leur état (forme, condition, moral, affinité au poste), comme les notes de zone. Pour une frappe dans l'axe, l'écart entre les deux donne :

| Tireur moins gardien (points sur 200) | Probabilité de but |
|---:|---:|
| −40 | {{pct(sigmoide(logit(moteur_match.occasion.xg_base_frappe) + moteur_match.occasion.sensibilite_tireur_gardien * moteur_match.transitions.ecart_note_max * tanh(-20 / moteur_match.transitions.ecart_note_max)), 0)}} |
| −20 | {{pct(sigmoide(logit(moteur_match.occasion.xg_base_frappe) + moteur_match.occasion.sensibilite_tireur_gardien * moteur_match.transitions.ecart_note_max * tanh(-10 / moteur_match.transitions.ecart_note_max)), 0)}} |
| 0 | {{pct(moteur_match.occasion.xg_base_frappe, 0)}} |
| +20 | {{pct(sigmoide(logit(moteur_match.occasion.xg_base_frappe) + moteur_match.occasion.sensibilite_tireur_gardien * moteur_match.transitions.ecart_note_max * tanh(10 / moteur_match.transitions.ecart_note_max)), 0)}} |
| +40 | {{pct(sigmoide(logit(moteur_match.occasion.xg_base_frappe) + moteur_match.occasion.sensibilite_tireur_gardien * moteur_match.transitions.ecart_note_max * tanh(20 / moteur_match.transitions.ecart_note_max)), 0)}} |

**La qualité du service** modifie la probabilité de départ d'une tête. Sur un centre, le centreur est désigné dans le couloir, la tête est reprise par un joueur de l'axe ; un attribut Centres au-dessus de {{n(moteur_match.occasion.niveau_reference_centre / 5, 1)}} sur 20 rend l'occasion meilleure, en dessous elle la dégrade. Sur corner, c'est l'attribut Coups arrêtés du tireur qui joue, autour de {{n(moteur_match.occasion.niveau_reference_cpa / 5, 1)}} sur 20.

Un tir est cadré (but compris) avec une probabilité qui part de {{pct(moteur_match.occasion.probabilite_tir_cadre_base, 0)}} pour un tireur dont la qualité vaut {{moteur_match.occasion.niveau_reference_cadrage * 2}} et monte avec elle. Un tir cadré qui n'est pas un but est un arrêt du gardien.

Le **xG** affiché dans les statistiques est la probabilité de départ de chaque occasion (service compris), avant le duel tireur-gardien : il mesure ce que l'équipe a créé, pas la qualité de ses finisseurs.

## Coups de pied arrêtés

Quand une attaque échoue dans le milieu haut ou la zone de vérité, elle obtient un corner dans {{pct(moteur_match.coups_arretes.probabilite_corner_sur_turnover_avance, 1)}} des cas et un coup franc direct dans {{pct(moteur_match.coups_arretes.probabilite_coup_franc_sur_turnover, 1)}}.

Le tireur de tous les coups de pied arrêtés est le joueur de champ qui a le meilleur attribut Coups arrêtés sur le terrain. Sur corner, il ne peut pas être à la réception : la tête est reprise par un autre joueur de champ, tiré en proportion de son Jeu de tête. Sur coup franc, il frappe lui-même : son écart à {{n(moteur_match.occasion.niveau_reference_coup_franc / 5, 1)}} sur 20 en Coups arrêtés s'ajoute à sa qualité de frappe ou s'en retranche, à raison de 10 points de qualité par point d'attribut.

## Récupérations et contres

L'endroit où repart l'équipe qui récupère le ballon dépend de la façon dont elle l'a obtenu.

- **Après un but** : engagement au milieu bas, dans l'axe.
- **Après un tir adverse** : le gardien relance. Il fait repartir son équipe du milieu bas plutôt que de sa défense dans {{pct(moteur_match.relance_gardien.probabilite_depart_milieu_bas, 0)}} des cas pour une Relance de {{n(moteur_match.relance_gardien.niveau_reference / 5, 0)}} sur 20, davantage au-dessus ({{pct(sigmoide(logit(moteur_match.relance_gardien.probabilite_depart_milieu_bas) + moteur_match.relance_gardien.sensibilite_relance * (100 - moteur_match.relance_gardien.niveau_reference)), 0)}} à 20 sur 20).
- **Après une récupération** : l'équipe repart là où elle a gagné le ballon. Plus son bloc est haut, plus elle a de chances de le gagner une zone plus haut ({{pct(formations.hauteur_bloc.probabilite_recuperation_avancee_base, 0)}} des cas avec un bloc neutre).

Une récupération dans le milieu haut ou plus haut lance un **contre**. Une récupération plus basse peut aussi en lancer un : {{pct(moteur_match.turnover.probabilite_contre_depuis_zone_basse, 0)}} des cas à vitesse égale, davantage si l'équipe qui récupère est plus rapide en moyenne que celle qui vient de perdre le ballon, et si cette dernière jouait haut. Le contre gagne alors une zone d'entrée.

Pendant tout un contre, la défense adverse est prise à revers : sa note est réduite de {{moteur_match.turnover.malus_defensif_couloir_concerne * 2}} points à chaque duel, et une frappe au bout du contre a une probabilité de départ multipliée par {{moteur_match.occasion.multiplicateur_contre}}.

## Hauteur de bloc et mentalité

Chaque équipe a une hauteur de bloc entre {{formations.hauteur_bloc.min}} (très bas) et {{formations.hauteur_bloc.max}} (pressing haut). Au coup d'envoi, elle dépend du rapport de forces : l'équipe la plus forte joue un peu plus haut, et l'équipe à domicile reçoit {{formations.hauteur_bloc.bonus_domicile_initial}} de plus.

| Jouer plus haut | Effet |
|---|---|
| Récupérations | Plus souvent une zone plus haut, donc plus de contres |
| Fatigue | Effort multiplié par {{etats.fatigue.intensite_par_hauteur_bloc.pressing_haut}} au pressing le plus haut, par {{etats.fatigue.intensite_par_hauteur_bloc.bloc_bas}} au bloc le plus bas |
| Blessures | Le risque suit l'effort |
| Contres subis | L'adversaire part plus souvent en contre depuis une récupération basse |

Ce qui fait bouger le bloc en cours de match :

- **Votre mentalité**, en direct : défensive {{formations.hauteur_bloc.mentalites.defensive}}, équilibrée {{formations.hauteur_bloc.mentalites.equilibree}}, offensive +{{formations.hauteur_bloc.mentalites.offensive}}, ajoutés au bloc de départ. Votre bloc ne bouge que sur votre ordre.
- **Une équipe de l'IA menée** remonte son bloc dans les {{formations.hauteur_bloc.minutes_fin_match}} dernières minutes, de {{formations.hauteur_bloc.ajustement_menes_fin_match}} par but de retard à la dernière minute, progressivement.
- **Une expulsion** abaisse le bloc de l'équipe réduite de {{0 - formations.hauteur_bloc.malus_inferiorite_numerique}}.

## Cartons

Chaque attaque stoppée peut valoir un carton au défenseur qui l'a arrêtée. Il est désigné parmi les joueurs de champ impliqués à cet endroit, en proportion de leur implication défensive et de leur agressivité.

- Carton jaune : {{pct(moteur_match.cartons.probabilite_jaune_par_turnover_defensif, 1)}} par attaque stoppée, multiplié par {{moteur_match.cartons.poids_zone_defense}} dans sa propre zone de défense.
- Un joueur déjà averti fait attention : sa probabilité de second jaune est multipliée par {{moteur_match.cartons.booked_caution_multiplier}}.
- Rouge direct : {{pct(moteur_match.cartons.probabilite_rouge_direct_par_turnover_defensif, 2)}} par attaque stoppée.

Une équipe réduite à moins de {{monde.regles_match.joueurs_minimum_poursuite}} joueurs perd par forfait {{monde.regles_match.score_forfait_buts_vainqueur}}–{{monde.regles_match.score_forfait_buts_perdant}}. Les suspensions sont décrites dans [Blessures et suspensions](#/aide/blessures).

## Durée et temps additionnel

Chaque mi-temps dure {{monde.regles_match.mi_temps_secondes / 60}} minutes, plus un temps additionnel : entre {{moteur_match.chronologie.temps_additionnel_min / 60}} et {{moteur_match.chronologie.temps_additionnel_max / 60}} minutes tirées au sort pour le match et partagées entre les deux mi-temps, plus {{moteur_match.chronologie.secondes_par_arret_de_jeu}} secondes par but, blessure ou remplacement.

En coupe, une égalité à la fin du temps réglementaire se règle directement aux tirs au but, sans prolongation. Chaque tireur marque dans 75 % des cas à qualité égale ; l'écart entre la moyenne de sa Finition et de son Sang-froid et les Réflexes du gardien déplace cette probabilité, qui reste entre 50 % et 95 %. Les meilleurs tireurs présents sur le terrain à la fin du match tirent en premier.

## Les notes de match

La note d'un joueur part de {{moteur_match.notes_joueurs.base}} et reste entre {{moteur_match.notes_joueurs.min}} et {{moteur_match.notes_joueurs.max}}. Il faut avoir joué {{moteur_match.notes_joueurs.minutes_minimum_note}} minutes pour être noté, sauf but, passe décisive ou expulsion.

| Action | Effet sur la note |
|---|---:|
| But | +{{moteur_match.notes_joueurs.but}} |
| Passe décisive | +{{moteur_match.notes_joueurs.passe_decisive}} |
| Dernière passe avant un tir | +{{moteur_match.notes_joueurs.passe_cle}} |
| Participation à l'action d'un tir | +{{moteur_match.notes_joueurs.participation_occasion}} |
| Faire avancer le ballon (selon la zone atteinte) | jusqu'à +{{moteur_match.notes_joueurs.progression_par_zone[3]}} |
| Récupération (selon la zone, plus près de son but) | +{{moteur_match.notes_joueurs.recuperation_par_zone[3]}} à +{{moteur_match.notes_joueurs.recuperation_par_zone[0]}} |
| Perte de balle (selon la zone, plus près de son but) | {{moteur_match.notes_joueurs.perte_par_zone[3]}} à {{moteur_match.notes_joueurs.perte_par_zone[0]}} |
| Tir cadré arrêté | +{{moteur_match.notes_joueurs.tir_cadre_sans_but}} |
| Tir non cadré | {{moteur_match.notes_joueurs.tir_non_cadre}} |
| Tir contré (pour le défenseur) | +{{moteur_match.notes_joueurs.contre}} |
| Arrêt (gardien) | +{{moteur_match.notes_joueurs.arret}} |
| But encaissé (gardien) | {{moteur_match.notes_joueurs.but_encaisse_gardien}} |
| Défenseur battu sur un but | {{moteur_match.notes_joueurs.defenseur_battu}} |
| Défenseur dribblé | {{moteur_match.notes_joueurs.defenseur_elimine}} |
| Carton jaune | {{moteur_match.notes_joueurs.jaune}} |
| Expulsion | {{moteur_match.notes_joueurs.expulsion}} |
| Victoire ou défaite (au prorata des minutes jouées) | ±{{moteur_match.notes_joueurs.victoire}} |
| Match sans but encaissé, {{moteur_match.notes_joueurs.minutes_sans_encaisser}} minutes jouées | jusqu'à +{{moteur_match.notes_joueurs.sans_encaisser}}, selon le poids défensif du poste |

Chaque minute jouée retire {{moteur_match.notes_joueurs.attendu_par_minute}} : c'est ce qu'un joueur ordinaire accumule en petites actions. Un joueur qui fait son match sans plus finit donc autour de {{moteur_match.notes_joueurs.base}}.

Quand une action réussit, elle est attribuée de préférence aux meilleurs joueurs impliqués à cet endroit ; quand elle échoue, aux moins bons. Cette attribution se fait à part : les notes ne modifient jamais le déroulement du match. Elles comptent pourtant, car elles pilotent la [forme](#/aide/etats/la-forme).

## Ce que la possession ne dit pas

Les possessions alternent strictement et leurs durées sont tirées au hasard. Le pourcentage de possession affiché mesure donc le temps passé avec le ballon, proche de 50 % pour tout le monde : il ne dit rien de la domination. Pour juger un match, regardez les tirs, le xG et les couloirs d'attaque.
