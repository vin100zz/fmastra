# Le moteur de match

## Vue d'ensemble

Un match est une suite de **possessions** qui alternent entre les deux équipes, et chaque possession une suite d'actions. L'équipe qui a le ballon le garde par des passes, tente de le faire avancer de zone en zone, puis de créer une occasion, puis de marquer. Chaque passe et chaque tentative se jouent entre ce que vaut l'attaque et ce que vaut la défense à cet endroit du terrain. Une passe manquée ou une tentative ratée rend le plus souvent le ballon à l'adversaire ; elle peut aussi finir en faute, en touche, en corner ou en hors-jeu (voir « Arrêts de jeu »).

L'essentiel se joue entre des notes de zone, calculées à partir des onze joueurs présents, de leurs postes et de leur état. Mais chaque tentative est aussi un **duel** entre le porteur du ballon et le défenseur qui lui fait face : les meilleurs joueurs touchent plus souvent le ballon et le défendent plus souvent, et le meilleur des deux pèse un peu sur l'issue. Le porteur choisit ce qu'il tente selon ses qualités ; celui qui perd le ballon est le porteur, celui qui le récupère le défenseur de son duel.

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

## Une possession

Dans la zone et le couloir où se trouve le ballon, l'écart est la note d'attaque moins la note de défense adverse. Il est borné en douceur : au-delà de {{moteur_match.transitions.ecart_note_max * 2}} points, un écart supplémentaire ne change presque plus rien.

À chaque pas, l'équipe qui a le ballon tente quelque chose ou le garde. La probabilité de tenter, le **tempo**, dépend de la zone ; entre équipes égales et face à une défense en place, elle vaut {{pct(moteur_match.actions.tempo_par_zone[0], 0)}} en défense, {{pct(moteur_match.actions.tempo_par_zone[1], 0)}} au milieu bas, {{pct(moteur_match.actions.tempo_par_zone[2], 0)}} au milieu haut, {{pct(moteur_match.actions.tempo_par_zone[3], 0)}} dans la zone de vérité, et {{pct(moteur_match.actions.tempo_contre, 0)}} pendant un contre.

### Garder le ballon

Entre équipes égales, une passe de conservation réussit dans {{pct(sigmoide(moteur_match.actions.conservation.biais_par_zone[0]), 0)}} des cas en défense et {{pct(sigmoide(moteur_match.actions.conservation.biais_par_zone[3]), 0)}} dans la zone de vérité. Une passe manquée est une **interception** : l'adversaire récupère le ballon à cet endroit, et une interception près de son propre but est la plus coûteuse. Elle peut aussi sortir en touche (voir « Arrêts de jeu »).

Ce qui change ces chances, c'est l'**avantage à la conservation** : l'écart de l'équipe là où se trouve le ballon, moins celui de l'adversaire au même endroit de son propre camp. Il est nul entre équipes égales, quelles que soient leurs formations. Chaque point d'avantage ajoute {{moteur_match.actions.conservation.sensibilite}} au logit de la passe et retire {{moteur_match.actions.patience}} au logit du tempo : l'équipe qui domine prend son temps, celle qui est dominée se presse et perd le ballon plus vite. Avec {{n(10 * 2, 0)}} points d'avantage sur 200, une passe au milieu haut réussit dans {{pct(sigmoide(moteur_match.actions.conservation.biais_par_zone[2] + 10 * moteur_match.actions.conservation.sensibilite), 0)}} des cas au lieu de {{pct(sigmoide(moteur_match.actions.conservation.biais_par_zone[2]), 0)}}, et l'équipe n'y tente plus que dans {{pct(sigmoide(logit(moteur_match.actions.tempo_par_zone[2]) - 10 * moteur_match.actions.patience), 0)}} des pas. C'est ce qui donne le ballon aux meilleures équipes.

Chaque passe réussie **ouvre** la défense adverse, qui doit bouger pour suivre le ballon :

- elle ajoute {{moteur_match.actions.ouverture.gain_par_passe}} au logit des tentatives suivantes, jusqu'à {{moteur_match.actions.ouverture.max}} ;
- elle rend une tentative plus probable : avec l'ouverture au plus haut, le tempo du milieu haut passe à {{pct(moteur_match.actions.tempo_par_zone[2] + (1 - moteur_match.actions.tempo_par_zone[2]) * moteur_match.actions.attrait_ouverture, 0)}} ;
- elle fait passer le ballon dans un couloir voisin dans {{pct(moteur_match.actions.conservation.part_laterale, 0)}} des cas, ou le fait revenir d'une zone (une passe en retrait) dans {{pct(moteur_match.actions.conservation.part_recul_par_zone[1], 0)}} des cas, {{pct(moteur_match.actions.conservation.part_recul_par_zone[3], 0)}} dans la zone de vérité ;
- elle met fin au contre : la défense a eu le temps de se replacer.

### Tenter

Le porteur du ballon est désigné parmi les joueurs impliqués à cet endroit, les meilleurs plus souvent (voir « Le duel »), puis il choisit ce qu'il tente. Ses qualités changent ce qu'il tente, et un peu ses chances de réussir, qui se décident surtout entre notes de zone.

| Tentative | Où | Part des tentatives | Ce qui la fait varier |
|---|---|---:|---|
| Long ballon | Défense, milieu bas | {{pct(moteur_match.actions.jeu_long.part_par_zone[0], 0)}}, {{pct(moteur_match.actions.jeu_long.part_par_zone[1], 0)}} | Plus pour un bon passeur (Passes au-dessus de {{n(moteur_match.actions.jeu_long.reference_passe / 5, 0)}} sur 20) |
| Frappe de loin | Milieu haut, axe | {{pct(moteur_match.actions.tir_de_loin.part, 0)}} | Plus pour un bon finisseur (Finition au-dessus de {{n(moteur_match.actions.tir_de_loin.reference_finition / 5, 0)}} sur 20), moins face à une défense ouverte |
| Progression | Hors zone de vérité | Le reste | — |
| Créer l'occasion | Zone de vérité | Toutes | — |

```
chance de réussir = sigmoïde(sensibilité × écart + biais + ouverture)
```

| Écart (points sur 200) | Avancer d'une zone | Avancer, à domicile | Créer l'occasion |
|---:|---:|---:|---:|
| −40 | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(-20 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.bonus_domicile + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(-20 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.creation_bias + moteur_match.transitions.k_occ * moteur_match.transitions.ecart_note_max * tanh(-20 / moteur_match.transitions.ecart_note_max)), 0)}} |
| −20 | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(-10 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.bonus_domicile + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(-10 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.creation_bias + moteur_match.transitions.k_occ * moteur_match.transitions.ecart_note_max * tanh(-10 / moteur_match.transitions.ecart_note_max)), 0)}} |
| 0 | {{pct(sigmoide(moteur_match.transitions.progression_bias), 0)}} | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.bonus_domicile), 0)}} | {{pct(sigmoide(moteur_match.transitions.creation_bias), 0)}} |
| +20 | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(10 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.bonus_domicile + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(10 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.creation_bias + moteur_match.transitions.k_occ * moteur_match.transitions.ecart_note_max * tanh(10 / moteur_match.transitions.ecart_note_max)), 0)}} |
| +40 | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(20 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.transitions.bonus_domicile + moteur_match.transitions.k_prog * moteur_match.transitions.ecart_note_max * tanh(20 / moteur_match.transitions.ecart_note_max)), 0)}} | {{pct(sigmoide(moteur_match.transitions.creation_bias + moteur_match.transitions.k_occ * moteur_match.transitions.ecart_note_max * tanh(20 / moteur_match.transitions.ecart_note_max)), 0)}} |

Ce tableau vaut pour une défense en place ; une défense ouverte au plus haut ajoute {{moteur_match.actions.ouverture.max}} au logit (à écart nul, une progression réussit alors dans {{pct(sigmoide(moteur_match.transitions.progression_bias + moteur_match.actions.ouverture.max), 0)}} des cas).

- **Une progression réussie** fait avancer le ballon d'une zone, par une passe, une conduite ou un dribble. Dans environ {{pct(moteur_match.couloirs.probabilite_changement_aile, 0)}} des cas, elle le fait aussi passer dans un couloir voisin, de préférence celui où l'équipe domine le plus. L'ouverture garde {{pct(moteur_match.actions.ouverture.part_conservee_apres_progression, 0)}} de sa valeur. Ratée, c'est une interception ou un tacle, une faute ou une touche.
- **Un long ballon** saute une zone : de la défense au milieu haut, du milieu bas à la zone de vérité, dans le couloir où l'équipe domine le plus. À écart nul, il trouve son destinataire dans {{pct(sigmoide(moteur_match.actions.jeu_long.biais), 0)}} des cas, et l'ouverture repart de zéro. Raté, c'est un duel aérien perdu loin du but adverse, une faute, une touche ou, dans la zone de vérité, un hors-jeu.
- **Une frappe de loin** part sans duel préalable (voir « Les tirs »).
- **Une occasion créée** se joue selon le couloir (voir « Les tirs »).

Trois correctifs s'appliquent :

- **L'avantage du terrain** aide l'équipe à domicile à avancer (deuxième colonne), jamais à créer ni à marquer. Il disparaît sur terrain neutre.
- **Le relâchement** : une équipe qui mène de plus de {{moteur_match.transitions.avance_confortable}} buts gère son avance. Chaque but d'avance supplémentaire réduit son tempo : elle garde le ballon au lieu de tenter (avec trois buts d'avance, elle ne tente plus au milieu haut que dans {{pct(sigmoide(logit(moteur_match.actions.tempo_par_zone[2]) - moteur_match.transitions.relachement_par_but), 0)}} des pas, défense en place).
- **Le contre** : voir plus bas.

### Le duel

Chaque tentative (progression, long ballon, création d'occasion) oppose le porteur à un défenseur, tiré parmi ceux qui défendent cet endroit. Dans ces deux tirages, un joueur pèse son implication multipliée par exp({{moteur_match.duels.selection_porteur}} × qualité) en attaque et exp({{moteur_match.duels.selection_defenseur}} × qualité) en défense : à implication égale, un joueur qui vaut 20 points de plus sur 200 est désigné {{n(exp(10 * moteur_match.duels.selection_porteur), 2)}} fois plus souvent. La qualité est le composite de la phase multiplié par la forme, le moral, l'affinité au poste et la condition.

```
duel = {{moteur_match.duels.sensibilite_porteur}} × (qualité du porteur − qualité attendue) − {{moteur_match.duels.sensibilite_defenseur}} × (qualité du défenseur − qualité attendue)
```

Le duel s'ajoute au logit de la tentative. La qualité attendue est celle du joueur que le tirage désigne en moyenne à cet endroit : le duel ne rend pas une équipe plus forte, il répartit ses réussites entre ses joueurs. À écart de zone nul, un porteur qui vaut 20 points de plus sur 200 que la moyenne avance dans {{pct(sigmoide(moteur_match.transitions.progression_bias + 10 * moteur_match.duels.sensibilite_porteur), 0)}} des cas au lieu de {{pct(sigmoide(moteur_match.transitions.progression_bias), 0)}}.

## Les tirs

Ce que le porteur tente dans la zone de vérité dépend du couloir :

- **dans l'axe**, une frappe dans la surface, un dribble ou une passe en profondeur, dans {{pct(moteur_match.actions.creation.parts_axe.frappe / (moteur_match.actions.creation.parts_axe.frappe + moteur_match.actions.creation.parts_axe.dribble + moteur_match.actions.creation.parts_axe.profondeur), 0)}}, {{pct(moteur_match.actions.creation.parts_axe.dribble / (moteur_match.actions.creation.parts_axe.frappe + moteur_match.actions.creation.parts_axe.dribble + moteur_match.actions.creation.parts_axe.profondeur), 0)}} et {{pct(moteur_match.actions.creation.parts_axe.profondeur / (moteur_match.actions.creation.parts_axe.frappe + moteur_match.actions.creation.parts_axe.dribble + moteur_match.actions.creation.parts_axe.profondeur), 0)}} des cas face à une défense en place. Une défense ouverte au plus haut multiplie la part de la passe en profondeur par {{n(exp(moteur_match.actions.creation.attrait_profondeur_ouverture), 1)}}, un contre par {{moteur_match.actions.creation.facteur_profondeur_contre}} ;
- **sur une aile**, un centre aérien dans {{pct(moteur_match.actions.creation.parts_aile.centre / (moteur_match.actions.creation.parts_aile.centre + moteur_match.actions.creation.parts_aile.retrait), 0)}} des cas pour un centreur à {{n(moteur_match.occasion.niveau_reference_centre / 5, 1)}} sur 20 en Centres, davantage s'il centre mieux, sinon un centre en retrait.

Le tireur est désigné parmi les joueurs impliqués dans l'axe de la zone de vérité, en proportion de leur implication offensive : un avant-centre frappe bien plus souvent qu'un milieu défensif. Sur un dribble ou une frappe de loin, c'est le porteur qui frappe. Chaque occasion a une probabilité de but de départ, corrigée par le duel entre le tireur et le gardien.

| Occasion | Probabilité de départ | Qualité du tireur | Qualité du gardien |
|---|---:|---|---|
| Frappe dans la surface | {{pct(moteur_match.occasion.xg_base_frappe, 1)}} | Frappe | Arrêts |
| Frappe dans la surface, en contre | {{pct(moteur_match.occasion.xg_base_frappe * moteur_match.occasion.multiplicateur_contre, 1)}} | Frappe | Arrêts |
| Dribble dans la surface | {{pct(moteur_match.occasion.xg_base_dribble, 1)}} | Frappe | Arrêts |
| Passe en profondeur | {{pct(moteur_match.occasion.xg_base_profondeur, 1)}}, {{pct(moteur_match.occasion.xg_base_profondeur * moteur_match.occasion.multiplicateur_contre, 1)}} en contre | Frappe | {{pct(moteur_match.occasion.poids_gardien_face_a_face.sortie, 0)}} sorties, {{pct(moteur_match.occasion.poids_gardien_face_a_face.arret, 0)}} arrêts |
| Centre repris de la tête | {{pct(moteur_match.occasion.xg_base_centre, 1)}} | Jeu aérien | {{pct(moteur_match.occasion.poids_gardien_sur_tete.sortie, 0)}} sorties aériennes, {{pct(moteur_match.occasion.poids_gardien_sur_tete.arret, 0)}} arrêts |
| Centre en retrait | {{pct(moteur_match.occasion.xg_base_retrait, 1)}} | Frappe | Arrêts |
| Frappe de loin | {{pct(moteur_match.occasion.xg_base_tir_de_loin, 1)}} | Frappe | Arrêts |
| Reprise après un arrêt ou un poteau | {{pct(moteur_match.occasion.xg_base_rebond, 0)}} | Frappe | Arrêts |
| Tête sur corner ou coup franc centré | {{pct(moteur_match.coups_arretes.xg_base_corner, 1)}} | Jeu aérien | Comme un centre |
| Coup franc frappé au but | {{pct(moteur_match.coups_arretes.xg_base_coup_franc_direct, 1)}} | Frappe, plus son avance en coups arrêtés | Arrêts |
| Penalty | {{pct(moteur_match.penalty.reussite_base, 0)}} | Penaltys et Sang-froid | Réflexes (voir « Arrêts de jeu ») |

Les qualités du tireur et du gardien sont multipliées par leur état (forme, condition, moral, affinité au poste), comme les notes de zone, sauf la condition du tireur : un gardien se fatigue à peine (voir [La condition physique](#/aide/etats/la-condition-physique)), et la fatigue des attaquants pèse déjà sur la création des occasions. Pour une frappe dans l'axe, l'écart entre les deux donne :

| Tireur moins gardien (points sur 200) | Probabilité de but |
|---:|---:|
| −40 | {{pct(sigmoide(logit(moteur_match.occasion.xg_base_frappe) + moteur_match.occasion.sensibilite_tireur_gardien * moteur_match.transitions.ecart_note_max * tanh(-20 / moteur_match.transitions.ecart_note_max)), 0)}} |
| −20 | {{pct(sigmoide(logit(moteur_match.occasion.xg_base_frappe) + moteur_match.occasion.sensibilite_tireur_gardien * moteur_match.transitions.ecart_note_max * tanh(-10 / moteur_match.transitions.ecart_note_max)), 0)}} |
| 0 | {{pct(moteur_match.occasion.xg_base_frappe, 0)}} |
| +20 | {{pct(sigmoide(logit(moteur_match.occasion.xg_base_frappe) + moteur_match.occasion.sensibilite_tireur_gardien * moteur_match.transitions.ecart_note_max * tanh(10 / moteur_match.transitions.ecart_note_max)), 0)}} |
| +40 | {{pct(sigmoide(logit(moteur_match.occasion.xg_base_frappe) + moteur_match.occasion.sensibilite_tireur_gardien * moteur_match.transitions.ecart_note_max * tanh(20 / moteur_match.transitions.ecart_note_max)), 0)}} |

**La qualité du service** modifie la probabilité de départ d'un centre, aérien ou en retrait, et d'un corner. Sur un centre, le centreur est le porteur dans le couloir, la reprise est faite par un joueur de l'axe ; un attribut Centres au-dessus de {{n(moteur_match.occasion.niveau_reference_centre / 5, 1)}} sur 20 rend l'occasion meilleure, en dessous elle la dégrade. Sur corner, c'est l'attribut Coups arrêtés du tireur qui joue, autour de {{n(moteur_match.occasion.niveau_reference_cpa / 5, 1)}} sur 20.

Un tir est cadré (but compris) avec une probabilité qui part de {{pct(moteur_match.occasion.probabilite_tir_cadre_base, 0)}} pour un tireur dont la qualité vaut {{moteur_match.occasion.niveau_reference_cadrage * 2}} et monte avec elle. Un tir cadré qui n'est pas un but est un arrêt du gardien. Une frappe non cadrée est contrée par un défenseur dans {{pct(moteur_match.arrets.apres_tir.part_contres, 0)}} des cas, {{pct(moteur_match.arrets.apres_tir.part_contres_de_loin, 0)}} pour une frappe de loin ; une tête ou un penalty ne sont jamais contrés. Ce qui suit un tir est décrit dans « Arrêts de jeu ».

Le **xG** affiché dans les statistiques est la probabilité de départ de chaque occasion (service compris), avant le duel tireur-gardien : il mesure ce que l'équipe a créé, pas la qualité de ses finisseurs.

## Arrêts de jeu

### Comment finit une action ratée

Quand une tentative échoue, ou qu'une passe de conservation est manquée, un seul tirage décide de la suite : une faute, un ballon sorti, un hors-jeu, ou le ballon perdu en jeu comme décrit plus haut. La faute et la sortie ne changent rien à la réussite de l'action, déjà décidée entre notes de zone : elles disent comment le jeu s'arrête.

| Action ratée | Faute | Sinon, ballon sorti ou hors-jeu |
|---|---:|---|
| Passe vers l'avant interceptée | {{pct(moteur_match.arrets.faute.part_par_action.passe, 0)}} | Touche pour l'adversaire : {{pct(moteur_match.arrets.sortie.passe.aile, 0)}} des cas sur une aile, {{pct(moteur_match.arrets.sortie.passe.axe, 0)}} dans l'axe |
| Conduite ou dribble taclé | {{pct(moteur_match.arrets.faute.part_par_action.conduite, 0)}} | Touche pour l'équipe qui attaquait : {{pct(moteur_match.arrets.sortie.conduite.aile, 0)}} sur une aile, {{pct(moteur_match.arrets.sortie.conduite.axe, 0)}} dans l'axe |
| Frappe ou passe en profondeur ratée, zone de vérité | {{pct(moteur_match.arrets.faute.part_par_action.occasion_axe, 0)}} | Corner : {{pct(moteur_match.arrets.sortie.occasion_axe_corner, 0)}} ; une passe en profondeur est un hors-jeu dans {{pct(moteur_match.arrets.hors_jeu.profondeur, 0)}} des cas |
| Dribble raté, zone de vérité | {{pct(moteur_match.arrets.faute.part_par_action.dribble_zone_verite, 0)}} | Corner : {{pct(moteur_match.arrets.sortie.occasion_axe_corner, 0)}} |
| Centre ou centre en retrait raté | {{pct(moteur_match.arrets.faute.part_par_action.centre, 0)}} | Corner {{pct(moteur_match.arrets.sortie.centre.corner, 0)}}, six mètres {{pct(moteur_match.arrets.sortie.centre.six_metres, 0)}}, touche {{pct(moteur_match.arrets.sortie.centre.touche, 0)}} ; le gardien capte {{pct(moteur_match.arrets.sortie.centre.capte, 0)}} des centres |
| Long ballon perdu | {{pct(moteur_match.arrets.faute.part_par_action.duel_aerien, 0)}}, dont {{pct(moteur_match.arrets.faute.part_attaquant_duel_aerien, 0)}} commises par l'attaquant | Touche : {{pct(moteur_match.arrets.sortie.jeu_long, 0)}}, pour l'une ou l'autre équipe ; dans la zone de vérité, hors-jeu : {{pct(moteur_match.arrets.hors_jeu.jeu_long_zone_verite, 0)}} |
| Passe de conservation manquée | Jamais | Touche pour l'adversaire : {{pct(moteur_match.arrets.sortie.conservation.aile, 0)}} sur une aile, {{pct(moteur_match.arrets.sortie.conservation.axe, 0)}} dans l'axe |

Les parts de sortie portent sur les actions ratées sans faute. Une touche, un coup franc ou un hors-jeu se jouent là où le jeu s'est arrêté ; un six mètres, par la relance du gardien.

### Les fautes

La part de faute vaut pour une défense d'agressivité moyenne : elle est multipliée par l'agressivité des défenseurs impliqués à cet endroit (voir [Le caractère](#/aide/joueurs/le-caractere)), et l'auteur de la faute est l'un d'eux, désigné en proportion de son implication et de son agressivité. Dans la zone de vérité, l'action a lieu dans la surface dans {{pct(moteur_match.arrets.faute.part_surface.axe, 0)}} des cas dans l'axe et {{pct(moteur_match.arrets.faute.part_surface.aile, 0)}} sur une aile ; un défenseur y fait bien plus attention, et la part de faute y est multipliée par {{moteur_match.arrets.faute.facteur_surface}}.

Un défenseur souvent battu s'en sort plus souvent par une faute : la part de faute suit aussi l'avantage à la conservation de l'équipe qui attaque, là où l'action échoue (voir [Une possession](#/aide/match/une-possession)). Avec {{n(10 * 2, 0)}} points d'avantage, elle est multipliée par {{n(exp(10 * moteur_match.arrets.faute.sensibilite_ecart), 2)}} ; l'équipe dominée en subit d'autant moins. C'est ce qui donne aux meilleures équipes plus de coups francs et de penaltys qu'à leurs adversaires.

Ce que la faute donne dépend de l'endroit, vu par l'équipe qui la subit :

- **en défense ou au milieu bas**, un coup franc joué court : elle garde le ballon là où elle l'a subie, et la défense adverse a eu le temps de se replacer ;
- **au milieu haut**, dans l'axe, un coup franc à portée de tir dans {{pct(moteur_match.arrets.coup_franc.part_a_portee_milieu_haut, 0)}} des cas, frappé au but dans {{pct(moteur_match.arrets.coup_franc.part_directe, 0)}} d'entre eux et centré sinon ; sur une aile, un coup franc centré dans {{pct(moteur_match.arrets.coup_franc.part_centree_aile_milieu_haut, 0)}} des cas ; sinon, un coup franc joué court ;
- **dans la zone de vérité**, hors de la surface, un coup franc frappé au but dans l'axe dans {{pct(moteur_match.arrets.coup_franc.part_directe, 0)}} des cas, centré sinon ;
- **dans la surface**, un penalty.

Une faute de l'attaquant dans un duel aérien donne un coup franc joué court à la défense.

**La faute tactique.** Quand une équipe part en contre depuis son milieu bas ou son milieu haut, celle qui vient de perdre le ballon l'arrête par une faute dans {{pct(moteur_match.arrets.faute.faute_tactique, 0)}} des cas pour une équipe d'agressivité moyenne. Le contre n'a pas lieu : l'équipe qui avait récupéré le ballon joue un coup franc court.

### Les coups francs et les penaltys

Le tireur des corners et des coups francs est le joueur de champ qui a le meilleur attribut Coups arrêtés sur le terrain.

- **Un coup franc frappé au but** : le tireur frappe lui-même ; son écart à {{n(moteur_match.occasion.niveau_reference_coup_franc / 5, 1)}} sur 20 en Coups arrêtés s'ajoute à sa qualité de frappe ou s'en retranche, à raison de 10 points de qualité par point d'attribut.
- **Un coup franc centré** : il le joue dans la surface, comme un corner. Il finit sur une tête dans {{pct(moteur_match.arrets.coup_franc.issues_centre.tete, 0)}} des cas ; il est dégagé dans {{pct(moteur_match.arrets.coup_franc.issues_centre.degage, 0)}}, dont {{pct(moteur_match.arrets.coup_franc.part_degagements_en_corner, 0)}} derrière la ligne pour un corner ; le gardien le capte dans {{pct(moteur_match.arrets.coup_franc.issues_centre.capte, 0)}}.
- **Un penalty** : le joueur de champ présent sur le terrain qui a la meilleure qualité de tireur ({{poids(attributs.composites.penalty)}}) le tire. Il marque dans {{pct(moteur_match.penalty.reussite_base, 0)}} des cas à qualité égale ; chaque point d'écart sur 20 entre cette qualité et les Réflexes du gardien déplace cette probabilité de {{pct(moteur_match.penalty.sensibilite * 5, 1)}}, entre {{pct(moteur_match.penalty.min, 0)}} et {{pct(moteur_match.penalty.max, 0)}}. Un penalty manqué est arrêté, sauf dans {{pct(moteur_match.penalty.part_rates_hors_cadre, 0)}} des cas où il passe à côté.

### Les corners

Un corner vient d'un tir contré ({{pct(moteur_match.arrets.apres_tir.contre_en_corner, 0)}} des tirs contrés), d'un arrêt détourné ({{pct(moteur_match.arrets.apres_tir.arret.corner, 0)}} des arrêts), d'une action ratée dans la zone de vérité (voir le tableau plus haut) ou d'un coup franc centré dégagé derrière la ligne.

| Issue du corner | Part | Suite |
|---|---:|---|
| Tête | {{pct(moteur_match.arrets.corner.tete, 0)}} | Un tir (voir « Les tirs ») |
| Dégagé | {{pct(moteur_match.arrets.corner.degage, 0)}} | L'adversaire repart de sa défense alors que l'attaque est encore montée |
| Capté par le gardien | {{pct(moteur_match.arrets.corner.capte, 0)}} | Le gardien relance |
| Joué à deux | {{pct(moteur_match.arrets.corner.joue_court, 0)}} | L'équipe garde le ballon au coin de la surface |

Sur corner, le tireur ne peut pas être à la réception : la tête est reprise par un autre joueur de champ, tiré en proportion de son Jeu de tête. Un gardien qui sort bien capte plus de ballons, sur un corner, un coup franc centré ou un centre : chaque point de sa qualité de sortie au-dessus de {{moteur_match.arrets.reference_sorties * 2}} sur 200 ajoute {{n(moteur_match.arrets.sensibilite_sorties / 2, 3)}} au logit de la part qu'il capte, et le retire à la part dégagée.

### Après un tir

| Issue du tir | Suite |
|---|---|
| Arrêté | Capté dans {{pct(moteur_match.arrets.apres_tir.arret.capte, 0)}} des cas (le gardien relance), détourné en corner dans {{pct(moteur_match.arrets.apres_tir.arret.corner, 0)}}, repoussé dans {{pct(moteur_match.arrets.apres_tir.arret.repousse, 0)}} |
| Contré | En corner dans {{pct(moteur_match.arrets.apres_tir.contre_en_corner, 0)}} des cas ; sinon le second ballon revient à l'attaque dans {{pct(moteur_match.arrets.apres_tir.second_ballon_attaque, 0)}} des cas, et elle garde la possession là où elle a frappé ; la défense dégage les autres fois |
| À côté | Six mètres ; {{pct(moteur_match.arrets.apres_tir.part_poteaux, 0)}} de ces tirs touchent le poteau, et le ballon revient alors en jeu dans {{pct(moteur_match.arrets.apres_tir.poteau_en_jeu, 0)}} des cas |

Un ballon repoussé par le gardien ou revenu du poteau tombe à l'attaque dans {{pct(moteur_match.arrets.apres_tir.rebond_attaque, 0)}} des cas : c'est une **reprise**, par un joueur impliqué dans l'axe de la zone de vérité ; sinon, la défense le dégage.

Un but compte comme un **but sur coup de pied arrêté** s'il est marqué dans la possession qui a eu un corner, un coup franc frappé ou centré, ou un penalty, quelle que soit sa forme : la tête, la reprise, le centre qui suit un corner joué à deux.

## Récupérations et contres

L'endroit où repart l'équipe qui récupère le ballon dépend de la façon dont elle l'a obtenu.

- **Après un but** : engagement au milieu bas, dans l'axe.
- **Après un tir adverse capté ou à côté, ou un centre ou un corner que le gardien capte** : le gardien relance. Il fait repartir son équipe du milieu bas plutôt que de sa défense dans {{pct(moteur_match.relance_gardien.probabilite_depart_milieu_bas, 0)}} des cas pour une Relance de {{n(moteur_match.relance_gardien.niveau_reference / 5, 0)}} sur 20, davantage au-dessus ({{pct(sigmoide(logit(moteur_match.relance_gardien.probabilite_depart_milieu_bas) + moteur_match.relance_gardien.sensibilite_relance * (100 - moteur_match.relance_gardien.niveau_reference)), 0)}} à 20 sur 20).
- **Après une récupération** : l'équipe repart là où elle a gagné le ballon. Plus son bloc est haut, plus elle a de chances de le gagner une zone plus haut ({{pct(formations.hauteur_bloc.probabilite_recuperation_avancee_base, 0)}} des cas avec un bloc neutre).
- **Après un ballon dégagé de sa surface** : de sa défense.
- **Après une touche, un coup franc ou un hors-jeu** : là où le jeu s'est arrêté, sans contre : l'adversaire a eu le temps de se replacer.

Un ballon gagné en jeu peut lancer un **contre**, d'autant plus souvent qu'il l'est haut : à vitesse égale et bloc neutre, dans {{pct(moteur_match.turnover.probabilite_contre_par_zone[0], 0)}} des cas en défense, {{pct(moteur_match.turnover.probabilite_contre_par_zone[1], 0)}} au milieu bas, {{pct(moteur_match.turnover.probabilite_contre_par_zone[2], 0)}} au milieu haut et {{pct(moteur_match.turnover.probabilite_contre_par_zone[3], 0)}} dans la zone de vérité. C'est plus fréquent :

- quand l'équipe qui a perdu le ballon tentait quelque chose (une passe vers l'avant, un dribble, un centre, un corner) : ses joueurs sont montés ({{pct(sigmoide(logit(moteur_match.turnover.probabilite_contre_par_zone[2]) + moteur_match.turnover.bonus_contre_attaque_engagee), 0)}} au milieu haut) ;
- quand l'équipe qui récupère est plus rapide en moyenne, et quand l'adversaire jouait haut.

C'est plus rare après un long ballon perdu, loin du but qu'il visait, ou un ballon que le gardien a capté avant de relancer vite. Le contre gagne alors une zone d'entrée, sauf si l'équipe qui a perdu le ballon l'arrête d'une faute tactique (voir « Les fautes »).

Pendant un contre, l'équipe tente presque à chaque pas, la défense adverse est prise à revers (sa note est réduite de {{moteur_match.turnover.malus_defensif_couloir_concerne * 2}} points à chaque duel), et une frappe dans la surface ou une passe en profondeur au bout du contre a une probabilité de départ multipliée par {{moteur_match.occasion.multiplicateur_contre}}. Le contre s'arrête à la première passe de conservation : la défense a eu le temps de se replacer.

## Hauteur de bloc et mentalité

Chaque équipe a une hauteur de bloc entre {{formations.hauteur_bloc.min}} (très bas) et {{formations.hauteur_bloc.max}} (pressing haut). Au coup d'envoi, elle dépend du rapport de forces : l'équipe la plus forte joue un peu plus haut, et l'équipe à domicile reçoit {{formations.hauteur_bloc.bonus_domicile_initial}} de plus.

| Jouer plus haut | Effet |
|---|---|
| Récupérations | Plus souvent une zone plus haut, donc plus de contres |
| Fatigue | Effort multiplié par {{etats.fatigue.intensite_par_hauteur_bloc.pressing_haut}} au pressing le plus haut, par {{etats.fatigue.intensite_par_hauteur_bloc.bloc_bas}} au bloc le plus bas |
| Blessures | Le risque suit l'effort |
| Contres subis | L'adversaire part plus souvent en contre |

Ce qui fait bouger le bloc en cours de match :

- **Votre mentalité**, en direct : défensive {{formations.hauteur_bloc.mentalites.defensive}}, équilibrée {{formations.hauteur_bloc.mentalites.equilibree}}, offensive +{{formations.hauteur_bloc.mentalites.offensive}}, ajoutés au bloc de départ. Votre bloc ne bouge que sur votre ordre.
- **Une équipe de l'IA menée** remonte son bloc dans les {{formations.hauteur_bloc.minutes_fin_match}} dernières minutes, de {{formations.hauteur_bloc.ajustement_menes_fin_match}} par but de retard à la dernière minute, progressivement.
- **Une expulsion** abaisse le bloc de l'équipe réduite de {{0 - formations.hauteur_bloc.malus_inferiorite_numerique}}.

## Cartons

Un carton ne tombe que sur une faute (voir « Arrêts de jeu »), à son auteur :

| Faute | Carton jaune | Rouge direct |
|---|---:|---:|
| Ordinaire | {{pct(moteur_match.cartons.par_faute.jaune, 0)}} | {{pct(moteur_match.cartons.par_faute.rouge, 2)}} |
| Tactique, pour arrêter un contre | {{pct(moteur_match.cartons.faute_tactique.jaune, 0)}} | {{pct(moteur_match.cartons.faute_tactique.rouge, 1)}} |
| Dans la surface, sur un penalty | {{pct(moteur_match.cartons.penalty.jaune, 0)}} | {{pct(moteur_match.cartons.penalty.rouge, 0)}} |

Un joueur déjà averti fait attention : sa probabilité de second jaune est multipliée par {{moteur_match.cartons.booked_caution_multiplier}}.

Une équipe réduite à moins de {{monde.regles_match.joueurs_minimum_poursuite}} joueurs perd par forfait {{monde.regles_match.score_forfait_buts_vainqueur}}–{{monde.regles_match.score_forfait_buts_perdant}}. Les suspensions sont décrites dans [Blessures et suspensions](#/aide/blessures).

## Durée et temps additionnel

Chaque mi-temps dure {{monde.regles_match.mi_temps_secondes / 60}} minutes, plus un temps additionnel : entre {{moteur_match.chronologie.temps_additionnel_min / 60}} et {{moteur_match.chronologie.temps_additionnel_max / 60}} minutes tirées au sort pour le match et partagées entre les deux mi-temps, plus {{moteur_match.chronologie.secondes_par_arret_de_jeu}} secondes par but, blessure ou remplacement.

Le temps passe avec les actions : {{moteur_match.actions.durees_secondes.passe}} secondes pour une passe, {{moteur_match.actions.durees_secondes.progression}} pour une progression, {{moteur_match.actions.durees_secondes.jeu_long}} pour un long ballon et {{moteur_match.actions.durees_secondes.occasion}} pour une occasion. Un ballon gagné en jeu repart aussitôt ; un arrêt de jeu dure en moyenne :

| Arrêt | Secondes |
|---|---:|
| Le gardien capte un ballon | {{moteur_match.arrets.temps_mort.gardien}} |
| Touche | {{moteur_match.arrets.temps_mort.touche}} |
| Hors-jeu | {{moteur_match.arrets.temps_mort.hors_jeu}} |
| Coup franc joué court | {{moteur_match.arrets.temps_mort.coup_franc_court}} |
| Six mètres | {{moteur_match.arrets.temps_mort.six_metres}} |
| Corner | {{moteur_match.arrets.temps_mort.corner}} |
| But | {{moteur_match.arrets.temps_mort.apres_but}} |
| Coup franc frappé ou centré | {{moteur_match.arrets.temps_mort.coup_franc}} |
| Penalty | {{moteur_match.arrets.temps_mort.penalty}} |
| Carton, en plus | {{moteur_match.arrets.temps_mort.carton}} |

Un arrêt à l'intérieur d'une possession (une faute subie, une touche gagnée, un corner joué à deux) avance l'horloge sans compter dans la possession.

Une possession ne commence pas une fois le temps écoulé. Commencée, elle va à son terme, mais l'arbitre siffle à la première passe de conservation.

En coupe, une égalité à la fin du temps réglementaire se règle directement aux tirs au but, sans prolongation. Chaque tir suit la règle d'un penalty du match : {{pct(moteur_match.penalty.reussite_base, 0)}} de réussite à qualité égale, déplacée par l'écart entre la qualité du tireur ({{poids(attributs.composites.penalty)}}) et les Réflexes du gardien, entre {{pct(moteur_match.penalty.min, 0)}} et {{pct(moteur_match.penalty.max, 0)}}. Les meilleurs tireurs présents sur le terrain à la fin du match tirent en premier.

## Les notes de match

La note d'un joueur part de {{moteur_match.notes_joueurs.base}} et reste entre {{moteur_match.notes_joueurs.min}} et {{moteur_match.notes_joueurs.max}}. Il faut avoir joué {{moteur_match.notes_joueurs.minutes_minimum_note}} minutes pour être noté, sauf but, passe décisive ou expulsion.

Une action vaut le **danger** qu'elle ajoute à son équipe ou retire à l'adversaire : la probabilité que la possession finisse en but, qui dépend de l'endroit où se trouve le ballon.

| Danger | Défense | Milieu bas | Milieu haut | Zone de vérité |
|---|---:|---:|---:|---:|
| Possession | {{pct(moteur_match.notes_joueurs.danger_par_zone[0], 1)}} | {{pct(moteur_match.notes_joueurs.danger_par_zone[1], 1)}} | {{pct(moteur_match.notes_joueurs.danger_par_zone[2], 1)}} | {{pct(moteur_match.notes_joueurs.danger_par_zone[3], 1)}} |
| Contre | {{pct(moteur_match.notes_joueurs.danger_contre_par_zone[0], 1)}} | {{pct(moteur_match.notes_joueurs.danger_contre_par_zone[1], 1)}} | {{pct(moteur_match.notes_joueurs.danger_contre_par_zone[2], 1)}} | {{pct(moteur_match.notes_joueurs.danger_contre_par_zone[3], 1)}} |
| Ballon gagné en jeu à cet endroit | {{pct(moteur_match.notes_joueurs.danger_recuperation_par_zone[0], 1)}} | {{pct(moteur_match.notes_joueurs.danger_recuperation_par_zone[1], 1)}} | {{pct(moteur_match.notes_joueurs.danger_recuperation_par_zone[2], 1)}} | {{pct(moteur_match.notes_joueurs.danger_recuperation_par_zone[3], 1)}} |

| Action | Danger |
|---|---|
| Faire avancer le ballon (passe, conduite, dribble, long ballon) | Le danger gagné, au porteur ; le défenseur de son duel en perd {{pct(moteur_match.notes_joueurs.part_defenseur_battu, 0)}} |
| Créer une occasion | Son xG moins le danger de la possession, au porteur ; le défenseur de son duel en perd {{pct(moteur_match.notes_joueurs.part_defenseur_battu, 0)}} |
| Perdre le ballon en jeu | Le danger de la possession, et celui de la possession qu'il donne à l'adversaire ; le défenseur qui le gagne les reçoit |
| Le mettre dehors, ou être hors-jeu | Le danger de la possession ; le défenseur qui l'a poussé dehors le reçoit |
| Dégager le ballon, le capter (gardien) | Le danger écarté |
| Obtenir ou concéder un penalty | Ce que vaut le penalty de plus que l'action qu'il arrête |
| Tir (tireur) | {{pct(moteur_match.notes_joueurs.part_tir, 0)}} de 1 − xG s'il marque ; {{pct(moteur_match.notes_joueurs.part_tir, 0)}} de son xG retirés sinon |
| Tir cadré (gardien) | {{pct(moteur_match.notes_joueurs.part_tir, 0)}} de la part des tirs comparables qui entrent, moins 1 s'il encaisse |
| Tir contré (défenseur) | {{pct(moteur_match.notes_joueurs.part_tir, 0)}} de son xG |

Chaque poste convertit ce danger en points de note à sa propre échelle, et chaque minute jouée retire ce qu'un joueur ordinaire de son poste apporte, en points (buts, passes décisives, fautes et cartons compris). Un joueur qui fait son match sans plus finit autour de {{moteur_match.notes_joueurs.base}}, et chaque poste peut briller ou décevoir autant que les autres.

| Poste | Points par but de danger | Attendu sur 90 minutes |
|---|---:|---:|
{{#chaque moteur_match.notes_joueurs.echelle_par_poste}}| {{cle}} | {{n(valeur, 2)}} | {{n(90 * moteur_match.notes_joueurs.attendu_par_minute_par_poste[cle], 2)}} |

| En plus | Effet sur la note |
|---|---:|
| But | +{{moteur_match.notes_joueurs.but}} |
| Passe décisive | +{{moteur_match.notes_joueurs.passe_decisive}} |
| Faute commise | {{moteur_match.notes_joueurs.faute}} |
| Carton jaune | {{moteur_match.notes_joueurs.jaune}} |
| Expulsion | {{moteur_match.notes_joueurs.expulsion}} |

Le résultat ne compte pas en lui-même : une équipe qui gagne a des joueurs bien notés parce qu'elle a mieux joué, pas l'inverse. Une passe de conservation perdue, un dégagement ou un contre sont attribués parmi les joueurs impliqués, de préférence aux meilleurs pour une réussite et aux moins bons pour un échec. Les notes ne modifient jamais le déroulement du match ; elles comptent pourtant, car elles pilotent la [forme](#/aide/etats/la-forme).

## La possession et les passes

Le pourcentage de possession affiché est la part du temps de jeu effectif où l'équipe avait le ballon : le ballon arrêté n'y compte pas. Une équipe qui a l'avantage à la conservation garde le ballon plus longtemps, joue plus de passes et en réussit une plus grande part. Le compte rendu donne aussi le nombre de passes réussies (passes de conservation, passes vers l'avant et longs ballons) et leur précision, les fautes commises et les hors-jeu ; un match joué avant qu'ils soient comptés n'en montre pas.
