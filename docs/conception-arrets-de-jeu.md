# Arrêts de jeu — conception (chantier B)

24 octobre 2026, implémenté le 25 octobre (B1 à B4 ensemble, schéma de sauvegarde
39). S'appuie sur les possessions construites (chantier A, schéma 38). Le chantier C
(consignes tactiques) vient après. Les sept décisions de la fin ont été prises comme
recommandé.

## Ce qui a changé à l'implémentation

- **Le temps mort dans `arrets.temps_mort`.** La section `actions.temps_mort` est
  retirée entière plutôt que réécrite : les durées par arrêt rejoignent les autres
  règles des arrêts de jeu.
- **Deux règles quittent `notes_joueurs`.** La part de dribbles et la part de tirs
  contrés changent maintenant le jeu (une conduite attire plus de fautes, un tir
  contré donne un corner) : elles passent dans `actions` (`part_dribbles`,
  `sensibilite_dribble`) et `arrets.apres_tir` (`part_contres`,
  `part_contres_de_loin`), et se tirent sur le flux du match. `notes_joueurs` ne
  garde que ce qui ne change pas le jeu.
- **Des actions un peu plus courtes.** Un ballon gagné en jeu repart sans pause et
  une faute ou une touche gagnée prolongent la possession : avec les durées de
  départ, le temps effectif montait à 60,6 minutes et les possessions tombaient
  vers 104. Les actions durent 3,0, 4,0, 3,8 et 2,8 secondes (au lieu de 3,2, 4,2,
  4,0 et 3,0) et les arrêts environ 6 % de plus : 58,2 minutes, 107 possessions.
- **Des contres un peu plus probables** (4, 8, 19 et 38 % selon la zone, au lieu de
  3, 6, 15 et 31 %) : un ballon arrêté n'en donne plus, et la faute tactique en
  arrête. On reste à 11,5 % de possessions lancées en contre.
- **Le jeu ouvert rend les buts que les coups de pied arrêtés ajoutent**, par ses
  xG de départ plus que par le nombre d'occasions : `creation_bias` −1,78, frappe
  0,105, retrait 0,13, profondeur 0,22, centre 0,095, dribble 0,125, et une part de
  frappes de loin de 20 %. Baisser seulement `creation_bias` faisait monter les
  frappes de loin à 40 % et descendre les ailiers sous 6,4.
- **Moins de coups francs centrés** (à portée au milieu haut 25 %, centrés sur une
  aile 35 %, tête 27 %) et de corners sur centre (16 %), pour tenir la part des buts
  sur coups de pied arrêtés sous 30 % ; hors-jeu sur 30 % des passes en profondeur
  ratées et 13 % des longs ballons perdus.
- **Le favori subit plus de fautes** (`arrets.faute.sensibilite_ecart`, 0,03 par
  point d'avantage à la conservation là où l'action échoue). Une faute ne tombant
  que sur une action ratée, un favori qui rate moins en subissait autant que son
  adversaire : City et Burnley avaient 0,18 et 0,19 penalty par match, Burnley plus
  de coups francs que City, et les favoris des affiches de référence gagnaient 4 à
  6 points de moins qu'avec A. À 0,03, PSG obtient environ 0,3 penalty par match
  contre Toulouse et en concède 0,1 ; à 0,04 l'écart des fautes devenait irréaliste
  (8 contre 15).
- **Fautes et cartons** : faute tactique 15 %, facteur de surface 0,13 (0,15 donnait
  0,17 penalty par équipe, plus qu'en vrai) ; jaune sur 16 % des fautes ordinaires,
  rouges 0,12 %, 1,5 % et 8 %.
- **Le barème des notes** : le gardien ne gagne rien sur un ballon capté ; passe clé
  0,12, progression vers la zone de vérité 0,05, récupération en défense 0,06, arrêt
  0,09, `attendu_par_minute` 0,0056 ; le hors-jeu ne coûte rien (les ailiers
  tombaient sous 6,4).
- **Le poteau** : 5 % des tirs à côté, plutôt que 2,5 % des tirs non cadrés.
- **Le corner joué à deux** n'a pas de détail propre : le résumé le reconnaît au jeu
  qui suit le corner dans la même possession.
- **Le résumé** joue chaque tir d'une possession à part : une reprise, ou la tête
  sur le corner qu'un arrêt a donné, sont des occasions à elles seules, et un but
  n'est jamais caché derrière le tir qui le précède.

Mesuré sur la suite `stats_match` (10 000 matchs), par équipe : 107 possessions,
12,6 tirs, 1,32 xG, 1,43 but, 10,7 fautes, 0,15 penalty, 1,96 jaune, 0,061 rouge,
28,8 % de buts sur coups de pied arrêtés, avantage du terrain 0,29 ; toutes les notes
par poste entre 6,41 et 6,59 (l'arrière gauche en haut : à attributs égaux, il tire
les penaltys du panel synthétique). Les formations restent entre 0,488 et 0,517. Sur
les affiches de référence (3 000 matchs), l'écart cumulé hors tolérance revient à
0,10 comme avec A, presque tout sur le Clasico. Diagnostics (3 000 matchs, avant la
règle du favori) : 5,2 corners, 16,5 touches, 2,3 hors-jeu, 1,0 faute tactique,
2,7 % de tirs sur rebond, 75 % de penaltys réussis (8 % des buts), 398 passes,
58,4 minutes de jeu effectif, 11,5 % de possessions en contre, 35 % de frappes de
loin et 24 % de têtes. Comme avec A, 5,7 % de matchs sans but et 32 % à quatre buts
ou plus (cibles indicatives : 7 à 9 % et 22 à 28 %).

Vocabulaire : un coup franc est **direct** quand il est frappé au but, **centré**
quand il est joué dans la surface, **court** quand il relance simplement le jeu.
Le coup franc indirect au sens de la loi est, dans un match, presque toujours un
hors-jeu : il est traité comme tel.

## Objectif

- Un arrêt de jeu a une cause : une faute, un ballon sorti, un tir.
- Une faute a un auteur et un endroit, et parfois un carton. Elle donne un coup
  franc court, centré ou direct, ou un **penalty** dans la surface.
- Un corner vient d'un tir contré, d'un arrêt détourné ou d'un centre dégagé. Il
  ne donne pas toujours un tir : il peut être dégagé, capté ou joué à deux.
- Après un tir, le gardien capte, détourne ou repousse ; un ballon repoussé ou
  renvoyé par un poteau peut donner un second tir.
- Un ballon sorti donne une touche ou un six mètres, sans contre.
- Le temps mort vient de ces arrêts : un ballon gagné en jeu repart sans pause.

À garder :

- les cibles de `config/benchmarks.json`, sauf celles revues plus bas ;
- l'équilibre des formations ;
- le budget de 20 ms par match ;
- le déterminisme ;
- des notes tirées sur leur flux séparé.

## Constat

400 matchs du scénario symétrique de la suite `stats_match` (4-3-3 de niveau 70),
moteur A. Par équipe et par match :

| Mesure | Aujourd'hui |
|---|---:|
| Possessions | 113 |
| Tentatives stoppées (progressions et occasions ; longs ballons à part) | 64,6 |
| … en zone 0 / 1 / 2 / 3 | 8,1 / 13,9 / 16,3 / 26,3 |
| Passes de conservation interceptées | 17,6 |
| Longs ballons perdus | 20,1 |
| Tirs : à côté / contrés / arrêtés / buts | 5,1 / 2,8 / 2,9 / 1,6 |
| Corners (dont têtes) | 5,0 (1,6) |
| Coups francs directs | 0,5 |
| Cartons jaunes / rouges | 2,04 / 0,07 |
| Buts sur coups de pied arrêtés | 13 % |
| Temps mort (par match) | 40,5 min |

Ce qui manque :

- **Les coups de pied arrêtés n'ont pas de cause.** Un corner ou un coup franc
  direct se tire au hasard sur 12 % et 1,2 % des tentatives ratées en zones 2 et 3.
- **Un carton tombe sans faute.** 3 % des tentatives stoppées valent un jaune à
  un défenseur, et le jeu continue comme si rien ne s'était passé.
- **Le ballon ne sort jamais**, sauf après un tir : chaque perte peut lancer un
  contre, même celle d'un ballon qui aurait fini en touche.
- **Un tir n'a pas de suite.** Contré ou arrêté, il finit toujours dans les mains
  du gardien : ni corner, ni rebond.
- **Le temps mort est uniforme.** 7,6 s en moyenne précèdent chaque possession,
  même après une interception, où le ballon n'a pas cessé d'être en jeu.
- **La règle des tirs au but est écrite dans le code** (`core/world/cup_matches.py` :
  75 %, 0,003 par point, entre 50 et 95 %) ; le manuel la cite en chiffres.
- `coups_arretes.part_cible_buts_sur_cpa` (0,27) n'est lu par rien.

## Principes

1. **Les notes de zone décident toujours de la réussite.** B ne change aucun
   duel : il décide comment finit une action ratée, et ce qui suit un tir.
2. **Une fin d'action, un tirage du flux du match.** Un seul tirage uniforme se
   partage entre la faute, la sortie et le ballon perdu en jeu, comme le pas de A
   entre tenter, conserver et être intercepté. Deux tirages des notes passent sur
   le flux du match, parce qu'ils changent maintenant le jeu : l'étiquette d'une
   progression (une conduite attire plus de fautes qu'une passe) et le tir contré
   (qui peut donner un corner).
3. **Le joueur change la nature, pas la réussite.** L'agressivité du défenseur
   rend la faute plus probable ; les sorties du gardien font capter plus de
   ballons ; aucune ne change les chances du duel qui précède.
4. **Le temps mort vient des arrêts.** Une possession qui change en jeu repart
   aussitôt ; chaque arrêt a sa durée. À l'intérieur d'une possession (une faute
   subie, une touche gagnée), l'arrêt avance l'horloge sans compter dans la
   possession.

## La fin d'une action ratée

Quand une tentative échoue (passe vers l'avant, conduite, dribble, occasion,
long ballon) ou qu'une passe de conservation est manquée, un tirage décide :

```
u < p_faute                  → faute (voir plus bas)
u < p_faute + p_sortie       → ballon sorti : touche, corner ou six mètres
sinon                        → ballon perdu en jeu, comme aujourd'hui
```

### La faute

```
p_faute = part_faute[action] × agressivité(défenseur) ^ poids × (facteur_surface dans la surface)
```

- **Le défenseur du duel** est tiré parmi les joueurs de champ impliqués à cet
  endroit, en proportion de leur implication défensive (`foul_committer` sans le
  poids d'agressivité, qui passe dans `p_faute`). Il est l'auteur de la faute.
- **Le joueur fauché** est le porteur, déjà tiré par A.

| Action ratée | `part_faute` de départ |
|---|---:|
| Passe vers l'avant interceptée | 6 % |
| Conduite ou dribble taclé | 30 % |
| Occasion axiale de zone 3 (frappe, profondeur) | 6 % |
| Dribble de zone 3 | 35 % |
| Centre ou centre en retrait | 3 % |
| Duel aérien d'un long ballon | 10 %, dont la moitié commise par l'attaquant |
| Passe de conservation | 0 % : il n'y a pas de duel |

**Où.** En zone 3, l'action a lieu dans la surface dans `part_surface` des cas :
55 % dans l'axe, 25 % sur une aile. Un défenseur y fait bien plus attention :
`facteur_surface` vaut 0,17.

**Ce qu'elle donne**, dans le repère de l'équipe qui subit la faute :

| Lieu | Coup de pied arrêté |
|---|---|
| Zones 0 et 1 | Coup franc court |
| Zone 2, axe | À portée de tir dans 30 % des cas : direct (60 %) ou centré ; sinon court |
| Zone 2, aile | Centré (50 %) ou court |
| Zone 3, hors de la surface | Axe : direct (60 %) ou centré ; aile : centré |
| Surface | Penalty |
| Faute de l'attaquant dans un duel aérien | Coup franc court pour la défense, à cet endroit |

**Le coup franc court** rend le ballon à l'équipe qui a subi la faute, là où elle
l'a subie : la possession continue, l'ouverture repart de zéro, le contre s'arrête.

### La sortie

| Action ratée | Sortie | Qui reprend |
|---|---|---|
| Passe de conservation manquée | 35 % sur une aile, 5 % dans l'axe | Touche pour la défense |
| Passe vers l'avant interceptée | 30 % sur une aile, 5 % dans l'axe | Touche pour la défense |
| Conduite ou dribble taclé | 40 % sur une aile, 5 % dans l'axe | Touche pour l'attaque : le défenseur a sorti le ballon |
| Long ballon perdu | 25 % | Touche, pour l'un ou l'autre à parts égales |
| Centre raté | corner 18 %, six mètres 12 %, touche 5 % | |
| Occasion axiale ratée en zone 3 | corner 6 % | |

- **Une touche pour l'attaque** continue la possession à cet endroit, ouverture à
  zéro, sans contre.
- **Une touche pour la défense** lance sa possession à cet endroit, sans contre.
- **Un six mètres** lance la possession de la défense par la relance du gardien,
  comme après un tir à côté aujourd'hui.

### Le ballon perdu en jeu

C'est la perte d'aujourd'hui (interception, tacle, duel aérien perdu), avec un
cas de plus : **le gardien capte** 15 % des centres ratés. Le ballon est à lui ;
un contre reste possible sur une relance rapide (`malus_contre_gardien`).

### Le hors-jeu

- Une passe en profondeur ratée est un hors-jeu dans 35 % des cas, un long ballon
  perdu en zone 3 dans 15 %. Le joueur hors-jeu est celui qui aurait reçu le ballon.
- La défense joue un coup franc court dans sa zone 0, sans contre.

## Les fautes et les cartons

**Les cartons ne tombent que sur une faute.**

| Faute | Jaune | Rouge |
|---|---:|---:|
| Ordinaire | 12 % | 0,2 % |
| Tactique, pour arrêter un contre | 55 % | 2 % (dernier défenseur) |
| Dans la surface (penalty) | 25 % | 10 % (occasion nette annihilée) |

- Un joueur déjà averti fait attention, comme aujourd'hui : sa probabilité de
  jaune est multipliée par `booked_caution_multiplier`.
- `poids_zone_defense` disparaît : le facteur de surface et la règle du penalty
  le remplacent.

**La faute tactique.** Quand une équipe lance un contre depuis sa zone 1 ou 2,
celle qui vient de perdre le ballon l'arrête par une faute dans `faute_tactique`
des cas (12 %, multiplié par l'agressivité du fautif). Le contre n'a pas lieu :
l'équipe qui récupère joue un coup franc court. Plus haut, personne ne s'y risque.

## Les penaltys

- **Le tireur** est le meilleur tireur de tirs au but présent sur le terrain :
  la moyenne de Finition et de Sang-froid, comme pour la séance.
- **La réussite suit la règle des tirs au but**, qui passe dans la configuration
  (`penalty`) : 75 % à qualité égale, 0,003 par point d'écart avec les Réflexes du
  gardien, entre 50 et 95 %. La séance la lit au même endroit ; ses résultats ne
  changent pas.
- **Raté** : arrêté dans 70 % des cas (le gardien capte ou détourne, comme un
  arrêt), à côté dans 30 % (six mètres).
- Son xG est la réussite de départ (0,75). Il compte dans les xG et dans les buts
  sur coups de pied arrêtés.

## Les coups francs

- **Direct** : la règle d'aujourd'hui, avec un xG de départ de 0,065 au lieu de
  0,05 (environ 6 % de réussite).
- **Centré** : le spécialiste (`cpa`) le joue dans la surface, comme un corner.
  Tête dans 30 % des cas, dégagé dans 55 %, capté par le gardien dans 15 %.

## Les corners

**Causes.**

| Cause | Part |
|---|---:|
| Tir contré | 40 % des tirs contrés |
| Arrêt détourné | 30 % des arrêts |
| Centre dégagé | 18 % des centres ratés |
| Occasion axiale ratée en zone 3 | 6 % |
| Coup franc centré dégagé | 20 % des dégagements |

**Issues.**

| Issue | Part | Suite |
|---|---:|---|
| Tête | 33 % | Le tir d'aujourd'hui |
| Dégagé | 47 % | La défense repart de sa zone 0, l'attaque encore montée (A) |
| Capté | 12 % | Le ballon est au gardien ; ses sorties en font capter plus |
| Joué à deux | 8 % | La possession continue en zone 3 sur cette aile, ouverture à zéro |

`probabilite_corner_sur_turnover_avance` et `probabilite_coup_franc_sur_turnover`
disparaissent : les corners et les coups francs ont maintenant une cause.

## Après un tir

| Issue du tir | Suite |
|---|---|
| But | Comme aujourd'hui |
| Arrêté | Capté (45 %) ; détourné en corner (30 %) ; repoussé (25 %) |
| Contré | En corner (40 %) ; sinon second ballon, à l'attaque dans 40 % des cas |
| Sur le poteau | 2,5 % des tirs non cadrés ; le ballon revient en jeu une fois sur deux |
| À côté | Six mètres |

- **Un ballon repoussé ou revenu du poteau** tombe à l'attaque dans 40 % des cas :
  **tir sur rebond**, d'un joueur impliqué en zone 3 dans l'axe, xG de départ
  0,30. Sinon, la défense dégage (perte en jeu, depuis sa zone 0).
- **Un second ballon après un tir contré** gardé par l'attaque continue la
  possession en zone 3, sans tir immédiat.
- **Le gardien capte** comme aujourd'hui : il relance, sans contre.

## Récupérations et contres

- **Un contre ne part que d'un ballon gagné en jeu** : interception, tacle, duel
  aérien, dégagement, ballon capté par le gardien (avec `malus_contre_gardien`).
- **Après un arrêt de jeu** (touche, six mètres, coup franc, hors-jeu), pas de
  contre : la défense a eu le temps de se replacer.
- La faute tactique en arrête une partie.
- `probabilite_contre_par_zone` se recale pour garder 10 à 20 % de possessions
  lancées en contre.

## Le temps

**Le temps mort par cause** remplace la pause tirée avant chaque possession
(`temps_mort.moyen`, `apres_tir`). Chaque durée varie selon une loi Gamma de forme
`forme_gamma` (2) autour de sa moyenne :

| Arrêt | Durée moyenne de départ |
|---|---:|
| Ballon gagné en jeu | 0 s |
| Le gardien capte | 8 s |
| Touche | 16 s |
| Hors-jeu | 22 s |
| Coup franc court | 24 s |
| Six mètres | 28 s |
| Corner | 32 s |
| But | 45 s |
| Coup franc direct ou centré | 50 s |
| Penalty | 90 s |
| Carton (en plus) | 30 s |

- Un arrêt dans la possession (faute subie, touche gagnée, corner joué à deux)
  avance l'horloge sans compter dans la possession, comme le corner dans A.
- Avec ces durées, la maquette donne 39 minutes de temps mort par match, contre
  40,5 aujourd'hui : le temps de jeu effectif ne bouge pas.

## Événements

| Type | Joueur | Second joueur | Zone, couloir | Détail | Nouveau |
|---|---|---|---|---|---|
| `foul` | auteur | joueur fauché | repère du fautif | `tactical` ou vide | oui |
| `free_kick` | tireur (aucun s'il est court) | — | repère du tireur | `short`, `crossed`, `direct` | détail |
| `penalty` | tireur | — | — | — | oui |
| `throw_in` | — | — | repère de qui la joue | — | oui |
| `offside` | joueur hors-jeu | passeur | repère de l'attaque | — | oui |
| `corner` | — | — | — | cause : `blocked`, `save`, `cross`, `clearance` ; `short` s'il est joué à deux | détail |
| `save` | gardien | tireur | — | `held`, `corner`, `parried` | détail |
| `off_target` | tireur | contreur | — | `blocked`, `post`, vide | `post` |
| `shot` | | | | + `penalty`, `crossed_free_kick`, `rebound` | types |
| `turnover` | | | | + `claim` : le gardien capte | détail |

- Le six mètres n'a pas d'événement : la relance du gardien suit déjà un tir.
- `foul`, `penalty`, `throw_in` et `offside` sont transitoires ; les trois premiers
  rejoignent `REPLAY_EVENT_KINDS`, pour qu'un résumé commence à la faute ou à la
  touche qui a lancé l'action.
- Les tirs au but gardent leurs événements (`penalty_scored`, `penalty_missed`,
  période 3) et `MatchResult.penalties` reste le score de la séance : rien ne s'appelle
  ainsi pour un penalty du match.

## Statistiques et notes

**Statistiques d'équipe.** `TeamStats` gagne `fouls` et `offsides` (None pour un
match plus ancien). `free_kicks` compte les coups francs directs et centrés.

**But sur coup de pied arrêté.** Un but compte comme tel s'il est marqué dans la
possession qui a eu un corner, un coup franc direct ou centré, ou un penalty,
quelle que soit sa forme : la tête, le rebond, le centre qui suit un corner joué à
deux. Un coup franc court ne compte pas.

**Notes des joueurs.**

| Fait | Points de départ |
|---|---:|
| Faute | −0,02 |
| Hors-jeu | −0,02 |
| Penalty concédé | −0,30 |
| Penalty obtenu | +0,10 |
| Penalty manqué | −0,30 |
| Penalty arrêté (gardien) | +0,30 |

`attendu_par_minute` et les tables par zone se recalibrent pour garder chaque
poste entre 6,4 et 6,6.

## Ce que voient le résumé et le compte rendu

**Le résumé** (`plan()`, `web/match-replay.js`) :

| Événement | Ce que montre le résumé |
|---|---|
| `foul` | le joueur fauché tombe ; légende « Faute de … sur … » |
| `free_kick` centré | le ballon posé, le centre du spécialiste, la tête ou le dégagement |
| `penalty` | le ballon au point, la course, la frappe, le plongeon |
| `throw_in` | le ballon remis en jeu à la main, au début d'une action |
| `corner` joué à deux | une passe courte, puis le centre ou le retrait |
| `save` repoussé, `off_target` sur le poteau | le ballon qui revient, le tir sur rebond |
| `turnover` `claim` | le gardien qui sort et capte |

**Le compte rendu.**

- « Le match en chiffres » gagne « Fautes » et « Hors-jeu » après « Corners ».
  « Coups francs » disparaît : ce serait les fautes et les hors-jeu de l'adversaire.
  Un match plus ancien garde ses lignes.
- « Les temps forts » : un but sur penalty porte « pen. » à la place du passeur
  (11, atténué, infobulle « Sur penalty »). Un penalty manqué y prend sa ligne
  (voir « Décisions »).

**Charte.** La règle des temps forts (`docs/charte-graphique.md`) gagne la marque du
penalty, avec un spécimen sur la planche ; le tableau du « Match en chiffres »
prend les nouvelles lignes.

## Configuration

Nouvelle section `arrets` dans `config/moteur_match.json` ; les modèles se
complètent à la main.

```json
"arrets": {
  "faute": {
    "part_par_action": {"passe": 0.06, "conduite": 0.30, "occasion_axe": 0.06, "dribble_zone_verite": 0.35,
                        "centre": 0.03, "duel_aerien": 0.10},
    "part_attaquant_duel_aerien": 0.5,
    "part_surface": {"axe": 0.55, "aile": 0.25},
    "facteur_surface": 0.17,
    "faute_tactique": 0.12
  },
  "coup_franc": {
    "part_a_portee_milieu_haut": 0.30, "part_directe": 0.60, "part_centree_aile_milieu_haut": 0.50,
    "issues_centre": {"tete": 0.30, "degage": 0.55, "capte": 0.15}
  },
  "sortie": {
    "conservation": {"aile": 0.35, "axe": 0.05}, "passe": {"aile": 0.30, "axe": 0.05},
    "conduite": {"aile": 0.40, "axe": 0.05}, "jeu_long": 0.25,
    "centre": {"corner": 0.18, "six_metres": 0.12, "touche": 0.05, "capte": 0.15},
    "occasion_axe_corner": 0.06
  },
  "hors_jeu": {"profondeur": 0.35, "jeu_long_zone_verite": 0.15},
  "apres_tir": {
    "contre_en_corner": 0.40, "second_ballon_attaque": 0.40,
    "arret": {"capte": 0.45, "corner": 0.30, "repousse": 0.25},
    "part_poteaux": 0.025, "poteau_en_jeu": 0.5, "rebond_attaque": 0.40
  }
},
"penalty": {"reussite_base": 0.75, "sensibilite": 0.003, "min": 0.50, "max": 0.95, "part_rates_hors_cadre": 0.30}
```

Valeurs changées ailleurs :

| Clé | Aujourd'hui | Départ B |
|---|---:|---:|
| `coups_arretes.issues_corner` | — | tête 0,33, dégagé 0,47, capté 0,12, à deux 0,08 |
| `coups_arretes.xg_base_coup_franc_direct` | 0,05 | 0,065 |
| `occasion.xg_base_rebond` | — | 0,30 |
| `cartons` | 3 % et 0,055 % par tentative stoppée | par faute : voir « Les fautes et les cartons » |
| `actions.temps_mort` | moyenne 7,6 s, après un tir 14 s, corner 25 s, coup franc 30 s | voir « Le temps » |
| `turnover.malus_contre_gardien` | — | −0,5 |
| `notes_joueurs` | — | voir « Statistiques et notes » |

Clés retirées : `coups_arretes.probabilite_corner_sur_turnover_avance`,
`probabilite_coup_franc_sur_turnover`, `part_corners_frappe` (devenue
`issues_corner.tete`), `part_cible_buts_sur_cpa` ; `cartons.probabilite_jaune_par_turnover_defensif`,
`probabilite_rouge_direct_par_turnover_defensif`, `poids_zone_defense` ;
`actions.temps_mort.moyen`, `apres_tir`.

## Calibrage

### La maquette

Les comptes du moteur A, multipliés par les parts de départ (script de la
conception, au premier ordre : une faute qui rend le ballon donne d'autres
tentatives, qu'il ne compte pas). Par équipe et par match :

| Mesure | Maquette | Cible |
|---|---:|---|
| Fautes | 10,7 | 10–13 (nouvelle) |
| … dont tactiques | 1,6 | — |
| Penaltys | 0,14 | 0,10–0,18 (nouvelle) |
| Cartons jaunes | 2,00 | 1,75–2,25 (existante) |
| Cartons rouges | 0,065 | 0,05–0,08 (existante) |
| Corners | 5,3 | 4,5–5,5 (diagnostic de A) |
| Coups francs centrés / directs | 1,4 / 0,56 | — |
| Touches | 17,7 | 15–25 (diagnostic) |
| Six mètres | 6,8 | 5–9 (diagnostic) |
| Hors-jeu | 2,0 | 1,5–2,5 (diagnostic) |
| Tirs sur rebond | 0,29 | 2–4 % des tirs (diagnostic) |
| Temps mort par match | 39 min | jeu effectif 52–60 min (existante) |
| Buts sur coups de pied arrêtés | 24 %, 28 % une fois le jeu ouvert recalé | 25–30 % |
| … dont penaltys | 7 % des buts, une fois recalé | — |

**Les buts.** Sans rien recaler, B ajoute environ 0,34 but par équipe : les
penaltys, les têtes sur coups francs centrés, les rebonds, le second ballon. Le jeu
ouvert doit en rendre autant pour garder les cibles de buts et de xG, par les xG
de départ plutôt que par le nombre d'occasions (les tirs restent entre 12 et 14 :
B en ajoute environ un par équipe).

### Ordre

1. **Structure** : parts de faute et de sortie, puis durées des arrêts, pour les
   fautes, les touches et le temps effectif.
2. **Contres** : `probabilite_contre_par_zone` et la faute tactique.
3. **Cartons.**
4. **Corners et après le tir** : causes, issues, rebonds.
5. **Penaltys et coups francs**, puis la part des buts sur coups de pied arrêtés.
6. **xG et buts** : les xG de départ du jeu ouvert.
7. **Formations, suites `match` et `saison`.**
8. **Notes par poste.**

## Performance

- Un tirage de plus par action ratée (environ 65 par équipe) et par tir : de l'ordre
  de 0,1 ms par match.
- Environ 60 événements de plus par match (fautes, touches, coups francs, hors-jeu),
  à 1 µs chacun.
- L'agressivité du défenseur se lit sur le profil déjà tiré ; rien ne se recalcule.

À mesurer : 20 ms par match au plus (A : 17 à 22 ms selon la charge), et la saison
complète.

## Sauvegardes

- **Le schéma passe de 38 à 39.** Les nouvelles clés entrent dans
  `MIGRATION_DEFAULTS`, les valeurs changées dans une table recalibrée.
- **Les clés retirées** passent par `RETIRED_RULES`, qui doit apprendre les
  sections imbriquées (`actions.temps_mort`).
- **La section `arrets` est introduite entière** : les tests qui fabriquent une
  ancienne sauvegarde la retirent, au lieu de la laisser vide.
- **Les valeurs par défaut des modèles** sont celles du fichier livré : une
  sauvegarde réelle échouerait sinon au contrôle d'empreinte (`test_config` le
  vérifie).
- **Les matchs déjà joués** gardent leurs événements : pas de faute, pas de touche,
  et un `save` sans détail est un arrêt capté.

## Tests

**Moteur.**

- Une faute en zone 0 ou 1 rend le ballon à l'équipe qui la subit, ouverture à
  zéro, sans contre.
- Une faute dans la surface donne un penalty ; hors de la surface, à portée, un
  coup franc direct ou centré.
- Un carton ne tombe que sur une faute.
- La touche va à l'équipe qui n'a pas sorti le ballon ; aucun contre ne suit un
  arrêt de jeu.
- Le hors-jeu donne un coup franc à la défense dans sa zone 0.
- La faute tactique arrête un contre.
- Un corner a une cause ; joué à deux, il continue la possession ; capté, il donne
  le ballon au gardien.
- Un tir sur rebond ne suit qu'un arrêt repoussé ou un poteau revenu en jeu.
- Le but marqué après un corner joué à deux compte comme un but sur coup de pied
  arrêté.
- Le temps mort d'un arrêt dans la possession ne compte pas dans la possession.
- Même graine, même match ; les notes ne changent pas le jeu.

**Penalty.** La séance lit la règle dans la configuration et donne les mêmes
résultats qu'avant.

**Stockage.** La faute, le penalty et la touche qui précèdent une occasion sont
gardés.

**Référence.** Les tests de référence du moteur (`test_engine_golden`) se régénèrent.

**Front.** Le plan traduit les nouveaux événements ; « Fautes » et « Hors-jeu »
n'apparaissent que pour un match qui les compte ; « pen. » et le penalty manqué
dans les temps forts ; les anciens matchs se lisent encore.

## Documentation

- **Manuel, `docs/manuel/03-match.md`.**
  - « Coups de pied arrêtés » devient « Arrêts de jeu » : fautes, coups francs,
    penaltys, corners, touches, six mètres, hors-jeu.
  - « Les tirs » prend le penalty, le coup franc centré, le rebond et le poteau.
  - « Récupérations et contres » : pas de contre après un arrêt, la faute tactique.
  - « Cartons » : par faute.
  - « Durée et temps additionnel » : le temps mort par cause.
  - Les tirs au but citent la règle en `{{config}}`, au lieu de ses chiffres.
- **`docs/manuel/02-joueurs.md`** : l'agressivité rend la faute plus probable ;
  Finition et Sang-froid servent aux penaltys.
- **`docs/moteur-match.md`**, **`docs/benchmarks.md`** : les mêmes règles, les
  nouvelles cibles.
- **`docs/charte-graphique.md`** : la marque du penalty, les lignes du « Match en
  chiffres ».

## Étapes

Chaque étape laisse les tests au vert et mesure les suites qu'elle touche.

1. **B1 — Fautes et sorties.**
   - Contenu : la fin d'une action ratée, le coup franc court, les touches, le
     hors-jeu, la faute tactique, les cartons sur faute, le temps mort par cause,
     les événements et les statistiques.
   - Les coups de pied arrêtés gardent leur tirage d'aujourd'hui ; une faute près
     de la surface donne pour l'instant un coup franc direct.
   - Calibrage : fautes, touches, temps effectif, contres, cartons.
2. **B2 — Corners et après le tir.**
   - Contenu : les causes et les issues du corner, les arrêts, les rebonds, les
     poteaux, les tirs contrés en corner.
   - Calibrage : corners, mélange des tirs, rebonds.
3. **B3 — Penaltys et coups francs.**
   - Contenu : le penalty et sa règle partagée, les coups francs centrés et
     directs, les buts sur coups de pied arrêtés avec le second ballon.
   - Calibrage : penaltys, part des buts sur coups de pied arrêtés, xG et buts,
     formations, suites `match` et `saison`, notes.
4. **B4 — Autour.**
   - Contenu : résumé, compte rendu, temps forts et charte, migration, manuel et
     documentation.

## Décisions

1. **Le hors-jeu entre dans B.** C'est le vrai coup franc indirect d'un match, et
   il coûte peu : une part des passes en profondeur et des longs ballons ratés.
   Recommandé : oui.
2. **Le temps mort par cause remplace la pause uniforme** ; un ballon gagné en jeu
   repart sans pause. Recommandé : oui. La maquette garde le même temps effectif.
3. **La faute tactique arrête des contres**, avec un jaune une fois sur deux.
   Recommandé : oui. C'est la faute la plus parlante d'un match, et elle fait
   environ 0,9 des 2 jaunes par équipe.
4. **Une seule règle de penalty**, partagée avec les tirs au but et mise en
   configuration. Recommandé : oui. La séance donne les mêmes résultats, et le
   manuel peut citer la règle en `{{config}}`.
5. **« Fautes » et « Hors-jeu » remplacent « Coups francs »** dans le match en
   chiffres. Recommandé : oui.
6. **Le penalty manqué dans les temps forts**, avec une marque de plus à la charte
   (le ballon barré, infobulle « Penalty arrêté » ou « Penalty manqué »).
   Recommandé : oui. C'est un fait du match aussi marquant qu'un but.
7. **La cible des buts sur coups de pied arrêtés revient à 25–30 %**, en comptant
   le second ballon (un but marqué dans la possession qui a eu le coup de pied
   arrêté). Recommandé : oui. Une fois le jeu ouvert recalé, la maquette donne
   26 % sans le second ballon, au bord bas de la cible, et 28 % avec lui.

Ce que B ne fait pas : l'avantage, la main, les fautes du gardien, la blessure
née d'une faute, la touche longue, les tireurs désignés par le manager (qui
relèvent des consignes de C).
