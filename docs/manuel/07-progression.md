# Progression, déclin et retraite

Le 1er de chaque mois, les attributs de tous les joueurs évoluent, qu'ils soient dans un club simulé, dans un club non simulé ou sans club. Deux mouvements s'additionnent : une progression, qui dépend de l'âge, du temps de jeu et de la marge jusqu'au potentiel, et un déclin, qui ne dépend que de l'âge.

## La progression

```
gain mensuel de niveau = facteur d'âge × facteur de jeu × (potentiel − niveau) ÷ 100 × {{demographie.progression.amplitude}}
```

Le gain s'applique à tous les attributs à la fois, avec un petit aléa mensuel propre à chaque joueur.

**Le facteur d'âge.**

| Âge | Facteur | Gain par mois, 40 points sous le potentiel, en jouant |
|---|---:|---:|
{{#chaque demographie.progression.courbe_age}}| {{age_min}} à {{age_max}} ans | {{facteur}} | {{n(facteur * 0.4 * demographie.progression.amplitude, 2)}} |

**Le facteur de jeu.** Il va de {{demographie.progression.facteur_jeu_min}} pour un joueur qui n'a pas joué du mois à 1 pour un joueur qui a atteint {{demographie.progression.minutes_reference_par_mois}} minutes dans le mois, matches de sélection compris. Au-delà, jouer plus n'apporte rien. Un joueur d'un club non simulé ou sans club progresse avec un facteur fixe de {{demographie.progression.facteur_jeu_dormants_et_libres}}.

Trois conséquences :

- **Plus un joueur est loin de son potentiel, plus il progresse vite.** La progression ralentit d'elle-même en approchant du plafond.
- **Un jeune qui ne joue pas progresse près de trois fois moins vite** qu'un jeune qui joue. Environ {{n(demographie.progression.minutes_reference_par_mois / 90, 1)}} matches pleins par mois suffisent à obtenir la progression maximale.
- **Après {{demographie.progression.courbe_age[-1].age_min - 1}} ans, un joueur ne progresse plus**, même s'il n'a pas atteint son potentiel.

Le niveau ne dépasse jamais le potentiel : si l'aléa l'y porte, les attributs sont ramenés au plafond.

## Le déclin

À partir d'un certain âge, le joueur perd chaque mois des points de niveau, quels que soient son temps de jeu et son potentiel.

| Âge | Perte de niveau par mois | Par an |
|---|---:|---:|
{{#chaque demographie.progression.declin.courbe_age}}| {{age_min}} à {{age_max}} ans | {{points_par_mois * 2}} | {{n(points_par_mois * 24, 1)}} |

Les gardiens vieillissent mieux : leur déclin suit le même tableau avec {{demographie.progression.declin.decalage_age_gardien}} ans de retard.

La perte ne touche pas tous les attributs de la même façon. Les qualités physiques partent les premières (vitesse × {{demographie.progression.poids_declin_par_attribut.vitesse}}, endurance × {{demographie.progression.poids_declin_par_attribut.endurance}}), les qualités techniques suivent (tacle × {{demographie.progression.poids_declin_par_attribut.tacle}}, finition × {{demographie.progression.poids_declin_par_attribut.finition}}, passe × {{demographie.progression.poids_declin_par_attribut.passe}}), et l'expérience reste presque intacte (placement × {{demographie.progression.poids_declin_par_attribut.placement}}, vision × {{demographie.progression.poids_declin_par_attribut.vision}}, sang-froid × {{demographie.progression.poids_declin_par_attribut.sang_froid}}). Ces poids sont ensuite ajustés pour que le niveau du joueur à son poste perde exactement le nombre de points du tableau. Un ailier qui vit de sa vitesse change donc davantage de profil qu'un meneur de jeu.

Une blessure longue après {{etats.blessures.penalite_permanente.age_minimal}} ans peut ajouter une perte définitive en vitesse et en endurance (voir [Blessures et suspensions](#/aide/blessures/gravite-et-retour)).

## Ce qui ne joue pas

- **La note ENTRAÎNEMENT du club** est purement informative : elle n'accélère aucune progression.
- Les notes de match, la forme et le moral n'ont aucun effet sur la progression. Seules les minutes comptent.
- Le poste auquel le joueur est aligné ne change pas ses attributs.

## La retraite

Lors du bilan annuel, chaque joueur de {{demographie.sorties.retraite.age_minimal}} ans ou plus peut prendre sa retraite. La probabilité monte vite avec l'âge et baisse un peu avec le niveau : les meilleurs durent plus longtemps.

```
probabilité = {{demographie.sorties.retraite.coefficient}} × (âge − {{demographie.sorties.retraite.age_minimal - 1}}) ^ {{demographie.sorties.retraite.exposant}} × ({{demographie.sorties.retraite.facteur_niveau_base}} − {{demographie.sorties.retraite.facteur_niveau_pente}} × niveau ÷ 200)
```

| Âge | Niveau 120 | Niveau 160 |
|---:|---:|---:|
| {{demographie.sorties.retraite.age_minimal}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 1 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.6)), 0)}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 1 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.8)), 0)}} |
| {{demographie.sorties.retraite.age_minimal + 1}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 2 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.6)), 0)}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 2 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.8)), 0)}} |
| {{demographie.sorties.retraite.age_minimal + 2}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 3 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.6)), 0)}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 3 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.8)), 0)}} |
| {{demographie.sorties.retraite.age_minimal + 3}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 4 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.6)), 0)}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 4 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.8)), 0)}} |
| {{demographie.sorties.retraite.age_minimal + 4}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 5 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.6)), 0)}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 5 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.8)), 0)}} |
| {{demographie.sorties.retraite.age_minimal + 5}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 6 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.6)), 0)}} | {{pct(min(1, demographie.sorties.retraite.coefficient * 6 ** demographie.sorties.retraite.exposant * (demographie.sorties.retraite.facteur_niveau_base - demographie.sorties.retraite.facteur_niveau_pente * 0.8)), 0)}} |

Le tirage a lieu une fois par an, pour tous les joueurs du monde, sous contrat ou non : un joueur peut partir à la retraite alors qu'il lui reste des années de contrat, sans indemnité pour son club. Le contrat et l'état physique n'entrent pas dans le calcul. Un joueur en plein tournoi avec sa sélection attend la fin de son rassemblement.

Les retraités et les départs sont compensés par les [regens](#/aide/regens).
