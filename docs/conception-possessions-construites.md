# Possessions construites — conception (chantier A)

18 octobre 2026, implémenté le 24 octobre (A1 à A4 ensemble, schéma de
sauvegarde 38). Les chantiers B (fautes, penaltys, coups francs indirects,
touches) et C (consignes tactiques) viennent après et s'appuient sur celui-ci.
Les cinq décisions de la fin ont été prises comme recommandé.

## Ce qui a changé à l'implémentation

- **L'avantage à la conservation.** Les écarts bruts ne donnaient aucune
  possession au favori (PSG–Toulouse à 50 %) : dans son propre camp, où se joue
  l'essentiel de la circulation, l'écart est positif pour tout le monde et varie
  peu d'une équipe à l'autre. La conservation et le tempo suivent donc l'écart de
  l'attaquant moins celui de l'adversaire au même endroit de son camp, nul entre
  équipes égales : `conservation.sensibilite` (0,08) et la nouvelle clé
  `actions.patience` (0,08). Le favori a 56 à 60 % de possession.
- **Des duels moins sensibles à l'écart.** Une possession compte plus de duels
  et l'avantage à la conservation s'y ajoute : `k_prog` passe de 0,040 à 0,020 et
  `k_occ` de 0,030 à 0,012 pour garder les résultats des affiches de référence.
- **Cartons.** Ils ne tombent que sur une tentative stoppée, pas sur une passe de
  conservation interceptée ni un long ballon perdu ; la probabilité par tentative
  monte pour garder le nombre de cartons.
- **Le relâchement** réduit le tempo (décision 3).
- **Performance.** Écarts en cache entre deux recalculs, composition de chaque
  équipe gardée par `refresh` (composites, poids cumulés), coût de fatigue par
  joueur : 16 à 17 ms par match, contre 25 ms pour l'ancien moteur sur la même
  machine.

Valeurs retenues, mesurées sur 3 000 matchs symétriques et les affiches de la
suite `match` : voir `config/moteur_match.json` et `docs/benchmarks.md`.

## Objectif

- Une possession est une suite d'actions : conserver, progresser, jouer long,
  frapper de loin, créer.
- L'occasion dépend de la façon dont l'action est arrivée : frappe dans la
  surface, frappe de loin, centre, centre en retrait, passe en profondeur, dribble.
- Un contre naît d'une défense prise désorganisée, pas de toute récupération haute.
- La possession affichée mesure le temps de jeu effectif avec le ballon.

À garder :

- les cibles de `config/benchmarks.json`, sauf celles revues plus bas ;
- l'équilibre des formations ;
- le budget de 20 ms par match ;
- le déterminisme ;
- des notes tirées sur leur flux séparé.

## Constat

400 matchs entre deux onzes synthétiques de niveau 70 (4-3-3 contre 4-4-2 plat) :

| Mesure | Aujourd'hui |
|---|---:|
| Possessions par équipe | 114 |
| Possessions sans aucune progression | 48 % |
| Possessions à trois progressions (le maximum) | 6 % |
| Possessions lancées en contre | 44 % |
| Possessions qui finissent sur une occasion | 12 % |
| Occasions : corners / centres / frappes / coups francs | 40 / 25 / 23 / 12 % |
| Temps par match | 19,9 ms |

Répartition du temps d'un match (profilage de 100 matchs) :

| Poste | Part |
|---|---:|
| Possessions (`play_possession`) | 24 % |
| Recalcul des notes de zone (`refresh`) | 23 % |
| Fatigue (`consume`) | 19 % |
| Remplacements | 12 % |
| Reste : blessures, bloc, événements | 22 % |

## Principes

1. **Les notes de zone décident toujours de la réussite.** C'est ce qui tient
   l'équilibre des formations et le calibrage actuel. Le porteur décide de ce
   qu'il tente : ses attributs changent la nature du jeu, pas les chances d'un duel.
2. **Une action, un tirage du flux du match.** Rien de ce qui ne change pas le
   jeu n'y puise. L'étiquette d'une progression (passe, conduite, dribble) et
   l'attribution des notes restent sur le flux des notes.
3. **Le temps vient des actions.** La durée d'une possession est la somme de ses
   actions. Le temps mort (ballon arrêté) avance l'horloge sans compter dans la
   possession.
4. **Personne n'est nommé pendant la conservation.** Une série de passes est un
   seul événement avec son nombre de passes ; le résumé choisit les passeurs.
   Le porteur est tiré au moment où il tente quelque chose, comme le créateur
   aujourd'hui.

## La possession pas à pas

État : zone (0 à 3 dans le repère de l'attaquant), couloir, contre, **ouverture**,
horloge. L'ouverture mesure, en points de logit, le désordre de la défense que
la circulation a fait bouger.

À chaque pas, l'équipe tente quelque chose ou conserve :

```
p_tente = tempo[zone] + (1 − tempo[zone]) × attrait_ouverture × ouverture ÷ ouverture_max
          (tempo_contre pendant un contre)
```

Une défense qui s'ouvre attire le porteur vers l'avant. Un tirage uniforme
suffit pour décider à la fois de tenter ou de conserver, et de la réussite de la
conservation :

```
u < (1 − p_tente) × p_conservation    → passe de conservation réussie
u < (1 − p_tente)                     → interception
sinon                                 → tentative
```

### Conserver

```
p_conservation = sigmoïde(biais_conservation[zone] + sensibilite_conservation × écart_progression)
```

Une passe réussie :

- ajoute `gain_par_passe` à l'ouverture, plafonnée à `ouverture_max` ;
- change de couloir dans `part_laterale` des cas (couloir voisin, tiré comme
  aujourd'hui selon l'écart) ;
- recule d'une zone dans `part_recul[zone]` des cas : la passe en retrait ;
- met fin au contre : la défense a eu le temps de se replacer.

Une passe manquée est une **interception**. L'adversaire récupère à cet endroit,
et une interception près de son propre but est la plus coûteuse.

### Tenter, en zones 0 à 2

Le porteur est tiré parmi les joueurs impliqués (`involved_player`), puis il choisit :

| Action | Où | Part de départ | Ce qui la fait varier |
|---|---|---:|---|
| Jeu long | zone 0, zone 1 | 40 %, 15 % | `passe` du porteur |
| Frappe de loin | zone 2, axe | 24 % | `finition` du porteur ; moins de frappes quand la défense est ouverte |
| Progression | partout | le reste | — |

Les parts se corrigent en logit : `logit(part) + sensibilité × (attribut − référence)`.

**Progression.** C'est le duel d'aujourd'hui, avec l'ouverture en plus :

```
sigmoïde(k_prog × écart + progression_bias + domicile + ouverture − relâchement)
```

- **Réussite.** Le ballon avance d'une zone, l'ouverture garde
  `part_conservee_apres_progression` de sa valeur, et le changement d'aile se
  tire comme aujourd'hui. L'étiquette passe, conduite ou dribble se tire sur le
  flux des notes, avec la règle actuelle `technique − passe` pour le dribble.
- **Échec.** Interception sur une passe, tacle sur une conduite ou un dribble.

**Jeu long.**

- Le ballon vise la zone +2 (de 0 à 2, de 1 à 3), dans un couloir tiré selon l'écart.
- Réussite : `sigmoïde(biais_jeu_long + k_prog × écart(zone visée))`.
- L'ouverture repart de zéro.
- Un échec est un duel aérien perdu : l'adversaire récupère dans sa moitié, loin
  du but de celui qui a joué long, donc rarement en contre.

**Frappe de loin.** Le porteur frappe, sans duel préalable (voir « Les occasions »).

### Créer, en zone 3

Conserver reste possible : la circulation autour de la surface, avec un recul
vers la zone 2 dans `part_recul[3]` des cas. Tenter, c'est créer :

```
sigmoïde(k_occ × écart_création + creation_bias + ouverture − relâchement)
```

Le type d'occasion se tire selon le couloir (tableau suivant). Un échec donne un
corner, un coup franc ou une perte, comme aujourd'hui.

### Fin de la mi-temps

Une possession ne commence pas après la fin du temps. Commencée, elle va à son
terme, sauf que l'arbitre siffle à la première passe de conservation jouée après
la fin du temps.

## Les occasions

| Occasion | Où | Tirée selon | Tireur | Passeur | Qualité du tireur | Gardien | xG de départ |
|---|---|---|---|---|---|---|---:|
| Frappe dans la surface | zone 3, axe | 55 % | impliqué en zone 3, axe | porteur | Frappe | Arrêts | 0,13 |
| Dribble dans la surface | zone 3, axe | 20 % | le porteur | dernier passeur nommé | Frappe | Arrêts | 0,14 |
| Passe en profondeur | zone 3, axe | 25 %, plus avec l'ouverture, ×2 en contre | impliqué en zone 3, axe, autre que le porteur | porteur | Frappe | 60 % sorties, 40 % arrêts | 0,26 |
| Centre aérien | zone 3, aile | 50 %, plus avec `centre` | impliqué en zone 3, axe | porteur (centreur) | Jeu aérien | comme aujourd'hui | 0,10 + service |
| Centre en retrait | zone 3, aile | 50 % | impliqué en zone 3, axe | porteur | Frappe | Arrêts | 0,16 + service |
| Frappe de loin | zone 2, axe | voir plus haut | le porteur | dernier passeur nommé | Frappe | Arrêts | 0,035 |
| Corner | — | — | comme aujourd'hui | — | Jeu aérien | comme aujourd'hui | 0,09 + service |
| Coup franc direct | — | — | comme aujourd'hui | — | Frappe + avance en CPA | Arrêts | 0,06 |

Précisions :

- **Contre.** Le multiplicateur `multiplicateur_contre` s'applique à la frappe dans
  la surface et à la passe en profondeur.
- **Service.** Le service d'un centre en retrait suit `centre`, comme le centre
  aérien (`delivered_xg`).
- **Tirs contrés.** Une frappe de loin non cadrée est contrée plus souvent
  (`part_non_cadres_contres_de_loin` à 0,55, contre 0,40 pour une autre frappe).

## Coups de pied arrêtés dans A

Les déclencheurs ne changent pas : un corner ou un coup franc direct après une
attaque ratée en zone 2 ou 3. B leur donnera une cause. Une règle de B est
toutefois avancée dans A, parce que le calibrage du mélange de tirs en a besoin :

- **Un corner ne donne une tête que dans `part_corners_frappe` (33 %) des cas.**
- Sinon il est dégagé : l'adversaire récupère dans sa zone 0 (`turnover` de
  détail `clearance`), et il peut partir en contre, l'attaque étant montée.

| Clé | Aujourd'hui | Départ A |
|---|---:|---:|
| `probabilite_corner_sur_turnover_avance` | 0,075 | 0,11 |
| `probabilite_coup_franc_sur_turnover` | 0,025 | 0,012 |
| `xg_base_corner` | 0,05 | 0,09 |
| `part_corners_frappe` (nouvelle) | — | 0,33 |

**Conséquence assumée.**

- Sans penaltys ni coups francs indirects, la part des buts sur coups de pied
  arrêtés tombe vers 12 %. La maquette (plus bas) donne 10 % pour les corners et
  2 % pour les coups francs directs.
- Pour A, la cible `part_buts_coups_arretes` passe donc à 10–16 %.
- B la ramène à 25–30 % : en vrai, les penaltys représentent à eux seuls
  environ 8 % des buts.
- Garder 25–30 % dans A obligerait à multiplier les têtes sur corner, ce qui est
  exactement le défaut d'aujourd'hui.

## Récupérations et contres

Ce qui ne change pas :

- après un but, le ballon repart du milieu bas, dans l'axe ;
- après un tir, le gardien relance comme aujourd'hui ;
- la récupération avancée selon le bloc.

La règle du contre change :

```
logit(p_contre) = logit(probabilite_contre_par_zone[zone de récupération])
                + bonus_contre_attaque_engagee   si le ballon est perdu sur une tentative ou un corner dégagé
                + malus_contre_jeu_long          si c'est un long ballon perdu
                + sensibilite_ecart_vitesse_contre × écart des vitesses moyennes
                + malus_vulnerabilite_contre × bloc de l'équipe qui perd le ballon
```

- La zone de récupération est celle de l'équipe qui récupère, dans son propre
  repère, après la récupération avancée.
- `probabilite_contre_par_zone` part de 3 %, 6 %, 15 % et 31 %.
- Le bonus d'attaque engagée vaut +0,5 et le malus de jeu long −1,0 (en logit).
- Le contre garde sa zone d'entrée gagnée, le malus défensif
  (`malus_defensif_couloir_concerne`) et le multiplicateur de xG.
- Il s'arrête à la première passe de conservation.

`zone_declenchant_contre` et `probabilite_contre_depuis_zone_basse` disparaissent.

## Le temps et la possession

- **Le temps mort** est tiré au début de chaque possession : une loi Gamma de
  moyenne `temps_mort.moyen` (5 s au départ), plus un supplément selon la reprise :
  - 45 s après un but ;
  - 14 s après un tir ;
  - 25 s sur un corner ;
  - 30 s sur un coup franc.

  Il remplace `duree_possession_moyenne` et `duree_possession_forme_gamma`, dont
  le sens change.
- **Durées des actions**, en secondes :

  | Passe | Progression | Jeu long | Occasion |
  |---:|---:|---:|---:|
  | 3,5 | 4,5 | 4,0 | 3,0 |

- **Chaque événement porte la seconde de son action.** Aujourd'hui, tous ceux
  d'une possession portent la seconde de sa fin.
- **La possession comptée** (`possession_seconds`) ne retient que les actions :
  la part de possession devient celle du temps de jeu effectif.
- **La fatigue s'intègre après la possession**, sur toute sa durée, avec les
  mêmes paliers de recalcul. Les notes de zone utilisées pendant une possession
  datent ainsi du dernier palier, comme aujourd'hui à quelques secondes près.

`live.py` change en conséquence. `_possession` tire le temps mort, joue la
possession sur une horloge locale, puis intègre la fatigue et le temps
additionnel.

## Événements

| Type | Joueur | Second joueur | Zone, couloir | Détail | Nouveau |
|---|---|---|---|---|---|
| `possession` | — | — | départ | `counter` ou vide | — |
| `circulation` | — | — | à la fin de la série | nombre de passes (`"4"`) | oui |
| `progress` | porteur | défenseur dribblé | zone atteinte | `pass`, `carry`, `dribble`, `long` | détail |
| `delivery` | passeur ou centreur | — | — | type d'occasion | aussi pour retrait et profondeur |
| `shot` | tireur | gardien | — | `shot`, `long_shot`, `dribble`, `through_ball`, `cross`, `cutback`, `corner`, `free_kick` | types |
| `turnover` | récupérateur | joueur qui perd le ballon | lieu | `interception`, `tackle`, `aerial`, `clearance` | détail |

Une baisse de zone entre deux événements est une passe en retrait, un
changement de couloir une passe latérale. Le résumé les déduit sans champ de
plus. Un ancien `progress` sans détail se lit comme une passe.

**Stockage.**

- La série de passes (`circulation`) rejoint `REPLAY_EVENT_KINDS`.
- La perte de balle qui a lancé une possession à occasion est gardée elle aussi,
  pour que le résumé montre l'interception avant le contre. Le filtre
  `stored_events` (`core/domain/matches.py`) garde un `turnover` dont la
  possession suivante est une occasion.
- Cela fait environ deux ou trois événements de plus par occasion stockée, à
  mesurer contre le budget de sauvegarde (2 s).

## Statistiques et notes

**Statistiques d'équipe.** `TeamStats` gagne `passes` et `passes_tentees`, comptées
dans le moteur : passes de conservation, progressions de type passe, jeux longs.
Le compte rendu affiche « Passes » et « Précision des passes » sous
« Possession ». Ces lignes n'apparaissent pas pour un match joué avant le
changement. Ce sont deux lignes de plus dans le tableau existant, sans nouveau
composant.

**Notes des joueurs.**

- Une passe de conservation ne rapporte rien à personne.
- Une interception crédite le récupérateur et débite celui qui perd le ballon,
  avec les tables actuelles par zone.
- Un jeu long réussi crédite le passeur de la progression de la zone atteinte.
- Les nouveaux types d'occasion suivent la règle actuelle : passe clé pour le
  passeur, participation pour les autres porteurs.
- `attendu_par_minute` et les tables par zone se recalibrent pour garder chaque
  poste entre 6,4 et 6,6.

## Ce que voit le résumé

Le vocabulaire du résumé 2D/3D couvre déjà l'essentiel. Le plan (`plan()` dans
`web/match-replay.js`) suit les événements au lieu d'inventer les passes.

| Événement | Ce que montre le résumé | Nouveau dans le résumé |
|---|---|---|
| `circulation` de n passes | n passes courtes au sol entre les joueurs de la zone : en retrait si la zone baisse, latérales si le couloir change | affichage limité aux 6 dernières passes |
| `progress` pass, carry ou dribble | passe tendue, conduite, conduite avec feinte | — |
| `progress` long | ballon long en cloche, contrôle de la poitrine ou de la tête | — |
| Frappe de loin | frappe appuyée à 25–30 m | — |
| Passe en profondeur | passe au sol dans l'espace, face-à-face | sortie du gardien |
| Centre en retrait | passe au sol depuis la ligne de but, frappe en une touche | — |
| Corner dégagé | corner, tête d'un défenseur | tête de dégagement |
| Contre | l'action commence à l'interception | interception |

Avec le seuil par défaut (xG ≥ 0,10), le résumé n'affiche pas les frappes de loin
(0,035), sauf si elles finissent au fond. C'est cohérent avec le libellé
« Occasions nettes ».

## Configuration

Nouvelle section `actions` dans `config/moteur_match.json`. Les noms suivent
ceux du fichier ; les modèles se complètent à la main (voir
`tools/generate_config_models.py`, qui n'est plus à jour).

```json
"actions": {
  "tempo_par_zone": [0.06, 0.08, 0.12, 0.20],
  "tempo_contre": 0.92,
  "attrait_ouverture": 0.8,
  "conservation": {
    "biais_par_zone": [3.6, 3.2, 2.6, 2.0],
    "sensibilite": 0.02,
    "part_laterale": 0.35,
    "part_recul_par_zone": [0.0, 0.10, 0.10, 0.18]
  },
  "ouverture": {"gain_par_passe": 0.10, "max": 0.6, "part_conservee_apres_progression": 0.5},
  "jeu_long": {"part_par_zone": [0.40, 0.15], "biais": -0.5, "sensibilite_passe": 0.03, "reference_passe": 60.0},
  "tir_de_loin": {"part": 0.24, "sensibilite_finition": 0.03, "reference_finition": 60.0, "effet_ouverture": -1.0},
  "creation": {
    "parts_axe": {"frappe": 0.55, "dribble": 0.20, "profondeur": 0.25},
    "attrait_profondeur_ouverture": 1.5,
    "facteur_profondeur_contre": 2.0,
    "parts_aile": {"centre": 0.50, "retrait": 0.50},
    "sensibilite_centre": 0.03
  },
  "durees_secondes": {"passe": 3.5, "progression": 4.5, "jeu_long": 4.0, "occasion": 3.0},
  "temps_mort": {"moyen": 5.0, "forme_gamma": 2.0, "apres_but": 45, "apres_tir": 14, "corner": 25, "coup_franc": 30}
}
```

Valeurs changées ailleurs :

| Clé | Aujourd'hui | Départ A |
|---|---:|---:|
| `transitions.progression_bias` | 0,00 | −0,30 |
| `transitions.creation_bias` | −1,90 | −1,60 |
| `occasion.xg_base_frappe` | 0,150 | 0,13 |
| `occasion.xg_base_dribble`, `_profondeur`, `_retrait`, `_tir_de_loin` | — | 0,14, 0,26, 0,16, 0,035 |
| `occasion.poids_gardien_face_a_face` | — | sortie 0,6, arrêt 0,4 |
| `turnover.probabilite_contre_par_zone` | — | 0,03, 0,06, 0,15, 0,31 |
| `turnover.bonus_contre_attaque_engagee`, `malus_contre_jeu_long` | — | 0,5, −1,0 |
| `notes_joueurs.part_non_cadres_contres_de_loin` | — | 0,55 |
| corners et coups francs | voir « Coups de pied arrêtés » | |

Les références d'attributs (60) sont à caler sur la moyenne des joueurs
importés, comme `niveau_reference_centre`.

## Calibrage

### La maquette

Avant d'écrire le moteur, une chaîne de Markov simplifiée a vérifié que ces
valeurs de départ tiennent ensemble. Tous les écarts y valent zéro, sauf le
malus de contre. Ce n'est pas le moteur : le calibrage se refait sur lui, mais
le point de départ est cohérent.

| Mesure | Maquette | Cible |
|---|---:|---|
| Possessions par équipe | 112 | 100–120 (existante) |
| Passes réussies par équipe | 334 | 320–450 (nouvelle) |
| Passes par possession | 3,0 | 2,8–4,0 (nouvelle) |
| Possessions de 3 passes ou moins | 64 % | 55–70 % (nouvelle) |
| Possessions de 10 passes ou plus | 2,5 % | 2–8 % (nouvelle) |
| Tirs par équipe | 12,7 | 12–14 (existante) |
| xG par équipe | 1,37 | 1,30–1,50 (existante) |
| Possessions lancées en contre | 14 % | 10–20 % (nouvelle) |
| Tirs en contre | 28 % | 15–30 % (nouvelle) |
| Corners par équipe | 4,7 | 4,5–5,5 (nouvelle) |
| Tirs par corner | 0,33 | 0,25–0,40 (nouvelle) |
| Temps de jeu effectif | 57 min | 52–60 min (nouvelle) |
| Frappes de loin | 32 % des tirs | 28–38 % (nouvelle) |
| Têtes (centres et corners) | 29 % des tirs | 15–25 % (nouvelle) : à baisser par `parts_aile` |
| Buts sur coups de pied arrêtés | 12 % | 10–16 % dans A, 25–30 % avec B |

### Une nouvelle cible de possession

**Dans les affiches déséquilibrées de la suite `match`**, comme PSG contre
Toulouse ou City contre Burnley, le favori a 56 à 65 % de possession. Cette
cible vérifie que la possession dit enfin quelque chose.

### Ordre

On suit `ordre_calibrage`.

1. **Structure**, sur le scénario symétrique : tempo, conservation et temps mort
   pour les passes, les possessions et le temps effectif.
2. **Volume et mélange des tirs** : `creation_bias`, parts d'occasions, parts de
   frappe de loin et de jeu long.
3. **xG et buts** : xG de départ. Le duel tireur-gardien ne change pas.
4. **Contres** : `probabilite_contre_par_zone`.
5. **Formations** : `densite.exposant`. La conservation pèse sur les zones 0 et 1,
   ce qui peut avantager les milieux à cinq.
6. **Suites `match` et `saison`**, avec la nouvelle cible de possession.
7. **Notes par poste.**

Le relâchement (`relachement_par_but`) est à revoir à l'étape 6 : voir
« Décisions ».

## Performance

Le budget est de 20 ms par match (`performance.ms_par_match_possession`) ; on
mesure aujourd'hui 19,9 ms. Une possession ferait environ 5 pas au lieu de 2 ;
sans rien d'autre, la part des possessions (24 %) doublerait et un match
prendrait environ 25 ms. A doit donc payer son surcoût.

- **Probabilités en cache.** Les écarts ne changent qu'au recalcul des notes. Les
  logits de réussite de chaque phase, zone, couloir et contre se calculent à ce
  moment-là. Aujourd'hui, `gap()` refait le miroir, la recherche et la tangente
  hyperbolique à chaque duel.
- **Tirage des joueurs impliqués.** Les poids cumulés de chaque zone et couloir
  se calculent au recalcul ; un tirage devient une recherche dichotomique. Ces tirages
  représentent aujourd'hui environ 7 % du temps.
- **Conservation.** Un seul tirage par passe (tenter, conserver ou être
  intercepté), un second seulement pour une passe latérale ou en retrait. Ni
  joueur nommé ni note.
- **Réserve.** Le coût de fatigue de chaque joueur peut se garder jusqu'au
  recalcul suivant : `consume` représente 19 % du temps.

À mesurer : 20 ms par match au plus, et une saison complète (environ 4 min
aujourd'hui) qui ne s'allonge pas de plus de 10 %.

## Sauvegardes

- **Le schéma passe de 37 à 38** (il était à 33 lors de la conception).
  - Les nouvelles clés entrent dans `MIGRATION_DEFAULTS`.
  - Les valeurs changées entrent dans une table recalibrée (`_recalibrated`) :
    une règle restée telle qu'elle a été livrée prend la nouvelle valeur.
- **Les clés retirées** (`duree_possession_moyenne`, `duree_possession_forme_gamma`,
  `zone_declenchant_contre`, `probabilite_contre_depuis_zone_basse`) demandent un
  mécanisme de retrait dans `store.py`. Aujourd'hui, la migration ne sait
  qu'ajouter des clés et changer des valeurs.
- **Les matchs déjà joués** gardent leurs événements. Le résumé lit l'ancien
  format : pas de `circulation`, et un `progress` sans détail est une passe.

## Tests

**Moteur.**

- Une interception pendant la conservation donne la balle à l'adversaire à cet
  endroit.
- Le contre s'arrête à la première passe de conservation.
- Le jeu long saute une zone.
- La frappe de loin ne part que de la zone 2, dans l'axe.
- Le type d'occasion suit le couloir.
- La possession comptée exclut le temps mort.
- L'arbitre siffle à la première conservation après la fin du temps.
- Un corner dégagé ne compte pas de tir.
- Même graine, même match. Les notes ne changent pas le jeu (flux séparé).

**Stockage.** La série de passes et la perte qui précède une occasion sont gardées.

**Référence.** Les tests de référence du moteur (`test_engine_golden`) se régénèrent.

**Front.** `chanceSequences` lit `circulation` et la perte qui précède une
occasion ; le plan traduit chaque nouveau type ; les anciens matchs se lisent
encore.

## Documentation

- **Manuel, `docs/manuel/03-match.md`.**
  - « Progresser et créer » devient « Une possession » : les actions,
    l'ouverture, le temps.
  - Le tableau des tirs prend les nouveaux types, valeurs en `{{config}}`.
  - « Récupérations et contres » suit la nouvelle règle.
  - « Coups de pied arrêtés » dit qu'un corner peut être dégagé.
  - « Ce que la possession ne dit pas » disparaît : elle le dit maintenant.
- **`docs/moteur-match.md`** : les mêmes règles, côté technique.
- **`docs/benchmarks.md`** : les nouvelles cibles.

## Étapes

Chaque étape laisse les tests au vert et mesure les suites qu'elle touche.

1. **A1 — Structure.**
   - Contenu : conservation, ouverture, tentative, jeu long, temps mort, durée
     des actions, nouveaux événements et stockage, caches de performance.
   - Les occasions restent celles d'aujourd'hui.
   - Calibrage : structure et volume de tirs.
2. **A2 — Occasions.**
   - Contenu : frappe de loin, dribble, profondeur, retrait, corner dégagé.
   - Calibrage : mélange des tirs, xG, buts.
3. **A3 — Contres.**
   - Contenu : la nouvelle règle.
   - Calibrage : contres, formations, suites `match` et `saison`, notes.
4. **A4 — Autour.**
   - Contenu : résumé, statistiques de passes, migration, manuel et documentation.

## Décisions

1. **La possession affichée devient celle du temps de jeu effectif.**
   Recommandé : oui. C'est ce que montrent les diffusions, et c'est ce qui la
   rend parlante.
2. **Le porteur ne change pas les chances d'un duel, seulement ce qu'il tente.**
   Recommandé pour A : le calibrage et l'équilibre des formations tiennent. Un
   terme individuel pourra venir plus tard.
3. **Le relâchement devient de la gestion.** Une équipe confortablement devant
   tenterait moins (tempo réduit) au lieu d'échouer plus : on la verrait garder
   le ballon. Recommandé, sous réserve de la cible de matchs à quatre buts ou plus.
4. **Passes et précision dans le compte rendu.** Recommandé : oui.
5. **Le corner dégagé avancé de B dans A**, avec la cible de buts sur coups de
   pied arrêtés abaissée jusqu'à B. Recommandé : sans lui, le mélange de tirs ne
   peut pas se calibrer.
