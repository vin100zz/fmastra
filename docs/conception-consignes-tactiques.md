# Consignes tactiques — conception (chantier C)

25 octobre 2026. Proposition à valider : rien n'est codé. S'appuie sur les
possessions construites (chantier A, schéma 38) et les arrêts de jeu (chantier B,
schéma 39) ; l'attribut Penaltys a porté le schéma à 40. Les décisions ouvertes
sont à la fin, chacune avec une recommandation.

## Objectif

- Chaque équipe a une **identité de jeu** : comment elle construit, par où elle
  attaque, si elle frappe de loin, à quelle hauteur elle défend.
- L'entraîneur du club dirigé la règle avant le match et la change en direct.
- Les clubs de l'IA choisissent la leur selon leur effectif et leur adversaire.
- Une consigne change la **nature** du jeu (plus de centres, plus de ballons
  longs, plus de frappes) ; elle ne rend pas une équipe meilleure à elle seule.
  Elle rapporte quand elle s'accorde à l'effectif : un bon centreur et de bons
  joueurs de tête gagnent à attaquer par les ailes, des tireurs de loin à frapper.

À garder :

- les cibles de `config/benchmarks.json` quand toutes les consignes sont au cran
  du milieu ;
- l'équilibre des formations ;
- le budget de 20 ms par match ;
- le déterminisme, et la relecture exacte d'un match en direct par ses ordres ;
- les cibles de la saison, qui sont manquées aujourd'hui, et dont C ne doit pas
  éloigner le jeu (voir « Les cibles de saison »).

## Constat

**Ce que l'entraîneur règle aujourd'hui** : la formation (ou la tactique « Perso »)
et la composition ; en direct, la mentalité, qui déplace la hauteur de bloc
(défensive −0,4, équilibrée 0, offensive +0,4, `formations.hauteur_bloc.mentalites`).
Le bloc de départ suit le rapport de forces et l'avantage du terrain ; une équipe
de l'IA menée le remonte en fin de match.

**Ce qui est commun à toutes les équipes** : tout le reste du jeu. Le tempo par
zone, la part de ballons longs, la part de frappes de loin, le choix entre centre et
centre en retrait, le choix du couloir sont des paramètres de
`moteur_match.actions`, les mêmes pour les deux équipes de tous les matchs. Seuls
les attributs des joueurs les font varier (un bon passeur joue plus long, un bon
finisseur frappe plus de loin, un bon centreur centre plus).

**Les leviers existent déjà dans le moteur** (`core/engine/possession.py`) : un
réglage par équipe n'a pas à inventer de mécanisme, seulement à décaler ces
paramètres pour l'équipe qui a le ballon, ou qui défend.

| Levier | Où | Effet |
|---|---|---|
| Tempo par zone (`tempo_par_zone`, `patience`) | chaque pas d'une possession | Tenter maintenant, ou conserver encore |
| Ballon long (`jeu_long.part_par_zone`) | zones 0 et 1 | Sauter une ligne, au risque du duel aérien |
| Frappe de loin (`tir_de_loin.part`) | avant-dernière zone, axe | Frapper avant d'entrer dans la zone de vérité |
| Couloir (`choose_lane`, `lanes.beta_softmax`) | après une progression, une remise en jeu | Où se joue l'action suivante |
| Centre ou retrait (`creation.parts_aile`) | dernière zone, aile | Tête ou frappe |
| Hauteur de bloc (`hauteur_bloc`) | récupération, contres, fatigue | Récupérer plus haut, s'exposer aux contres |

## Maquette

Avant d'écrire les règles, j'ai joué des styles dans le moteur actuel, par une
surcharge locale qui ne touche pas au code. L'équipe A joue un style, l'équipe B le
jeu livré. Il y a trois scénarios : deux équipes de niveau 70, A favori (74 contre
66), A outsider (66 contre 74). Ce sont des équipes synthétiques de
`AVERAGE_DELIVERY`, avec 2 000 matchs par case, domicile alterné. L'erreur type des
points par match vaut environ 0,03.

| Style de A | Réglage | Points de A, égaux | Favori | Outsider |
|---|---|---:|---:|---:|
| Référence | jeu livré | 1,38 | 2,31 | 0,48 |
| Construction courte | tempo × 0,75, ballons longs −0,8 en logit | −0,14 | −0,11 | −0,03 |
| Construction directe | tempo × 1,35, ballons longs +0,8 | **+0,16** | +0,12 | +0,15 |
| Directe, compensée | la même, progression −0,12 en logit | +0,06 | +0,03 | +0,11 |
| Courte, amplifiée | courte, sensibilité à l'écart de conservation × 2 | −0,12 | −0,06 | −0,07 |
| Par les ailes | +0,6 au poids des couloirs latéraux | −0,01 | +0,03 | −0,01 |
| Par l'axe | −0,6 au poids des couloirs latéraux | −0,05 | +0,06 | +0,02 |
| Frappes de loin | part +0,8 en logit | +0,03 | +0,08 | +0,11 |
| Pressing haut | bloc +0,4 | −0,03 | −0,03 | +0,06 |
| Bloc bas | bloc −0,4 | −0,01 | +0,01 | +0,03 |

La possession de A varie comme attendu : 53 % pour la construction courte, 46 % pour
la directe, et 65 % pour le favori qui construit court en amplifiant l'écart.
Script : `tools/maquette_consignes.py`, à remplacer par la suite `consignes` (voir
« Mesure »).

Ce qu'elle apprend :

1. **Le jeu livré n'est pas un optimum.** Jouer plus vite et plus long rapporte
   0,16 point par match à n'importe quelle équipe : la tentative précoce coûte moins
   cher que la passe de conservation interceptée. Une consigne « directe » laissée
   telle quelle serait le bon choix de tout le monde, toujours.
2. **La possession ne rapporte rien par elle-même.** Les possessions alternent : en
   gardant le ballon plus longtemps, une équipe n'en ôte aucune à l'adversaire. Elle
   en réduit le nombre pour les deux, ce qui aide plutôt le plus faible. Le favori
   qui amplifie son avantage de conservation passe à 65 % de possession et perd
   0,06 point.
3. **Les couloirs et le bloc sont déjà presque neutres** : à moins de deux erreurs
   types, sauf le pressing de l'outsider. Ils changent le visage du match sans
   en fausser l'équilibre.
4. **Frapper de loin rapporte, surtout à l'outsider** (+0,11) : une frappe de plus
   remplace une progression qui aurait échoué.
5. **Une compensation suffit à équilibrer.** Une progression un peu moins sûre
   (−0,12) ôte deux tiers du gain de la construction directe ; il en faudrait
   environ le double pour l'annuler à égalité de niveau.
6. **Ce qui reste profite à l'outsider.** Une fois compensée, la construction
   directe rapporte encore +0,11 à l'outsider et +0,03 au favori : c'est le plus
   faible qui gagne à adapter son jeu, comme dans la réalité.

## Principes

1. **Le cran du milieu est le moteur d'aujourd'hui, au tirage près.** Une équipe
   aux consignes « équilibrées » joue exactement comme maintenant. La référence
   figée des matchs, `stats_match` et `formations` ne bougent pas.
2. **Une consigne a une signature et un prix.** La signature est ce qu'elle
   change et que l'on voit (plus de ballons longs, plus de centres). Le prix est un
   paramètre calibré pour qu'à niveau égal, contre le jeu livré, aucun cran ne
   rapporte ni ne coûte plus de 0,03 point par match. Comme pour les formations,
   une suite le vérifie.
3. **Une consigne rapporte quand elle va à l'effectif.** Les sensibilités aux
   attributs existent déjà (un bon passeur réussit mieux ses ballons longs, un bon
   centreur ses centres, un bon finisseur ses frappes de loin) : la consigne
   augmente la part de l'action, l'effectif décide de sa réussite. Choisir les ailes
   avec des latéraux qui centrent mal coûte des points.
4. **Les duels ne changent pas.** Aucune consigne ne modifie la note d'une zone ni
   la sensibilité aux écarts : elle choisit quelles actions se tentent, pas si
   elles réussissent. La seule exception est le prix d'une consigne, quand il porte
   sur la réussite (la progression précipitée de la construction directe).
5. **Lisible en trois crans.** Chaque consigne a trois valeurs, nommées par ce
   qu'elles font : pas de curseur fin, dont le joueur ne verrait pas l'effet.

## Les consignes

Quatre consignes dans un premier lot (décision 1), trois crans chacune. Les
valeurs ci-dessous sont celles de la maquette ; le calibrage les fixe.

### Construction : courte, équilibrée, directe

- **Signature** : le tempo par zone (× 0,75 et × 1,35) et la part de ballons longs
  (−0,8 et +0,8 en logit) de l'équipe qui a le ballon.
- **Prix** :
  - directe : la progression précipitée, un malus de progression (environ −0,25
    en logit, à calibrer) ;
  - courte : la défense qui s'ouvre, un gain d'ouverture par passe plus fort
    (`ouverture.gain_par_passe`). Une longue circulation rend l'occasion meilleure :
    c'est ce que la possession doit rapporter, puisqu'elle n'ôte pas de possession à
    l'adversaire (décision 6).
- **Ce qu'on voit** : la possession (de 46 à 53 % à niveau égal), les passes, les
  ballons longs, les duels aériens perdus.

### Couloirs : axe, équilibré, ailes

- **Signature** : un poids ajouté aux couloirs latéraux (−0,6 ou +0,6) dans le choix
  du couloir de l'équipe qui a le ballon. Le choix suit toujours les écarts de zone :
  une aile plus forte reste préférée.
- **Prix** : aucun en premier lieu, la maquette les trouve neutres ; le calibrage
  le vérifie.
- **Ce qu'on voit** : la répartition des attaques par couloir (`lane_attacks`), les
  centres, les têtes, les corners. L'effectif décide de la valeur : centre et jeu
  de tête pour les ailes, frappe et passe en profondeur pour l'axe.

### Frappes de loin : rares, normales, fréquentes

- **Signature** : la part de frappes de loin (−0,8 ou +0,8 en logit).
- **Prix** : une frappe de loin met fin à l'ouverture de la défense ; le prix porte
  sur `tir_de_loin.effet_ouverture` ou sur le xG de base de la frappe de loin, à
  calibrer. La sensibilité à la finition existe déjà : de bons tireurs y gagnent,
  les autres y perdent.
- **Ce qu'on voit** : les tirs (12,7 → 16 à niveau égal au cran « fréquentes »), la
  part de frappes de loin, des tirs contrés.

### Bloc : bas, médian, haut

- **La mentalité d'aujourd'hui, renommée et réglable avant le match** (décision 3).
  Ses trois crans valent ses trois valeurs (−0,4, 0, +0,4), ajoutées au bloc de
  départ. Ses effets ne changent pas : récupération plus haute, contres subis,
  fatigue et blessures (`hauteur_bloc`, `etats.fatigue.intensite_par_hauteur_bloc`).
- **Prix** : celui d'aujourd'hui, la fatigue et les contres subis. La maquette le
  trouve presque neutre ; le calibrage vérifie le pressing de l'outsider (+0,06).
- **Ce qu'on voit** : les récupérations hautes, les contres pour et contre, la
  fatigue en fin de match.

### Ce que le premier lot ne fait pas

- **L'agressivité** (prudente, normale, engagée) : la part des fautes tactiques et
  des fautes sur action ratée, donc des cartons. Elle est facile à ajouter, mais elle
  touche aux suspensions, donc à la gestion d'effectif : elle viendrait dans un
  deuxième lot (décision 1).
- **La contre-attaque** (oui ou non) : la probabilité de partir en contre après une
  récupération. Elle recoupe le bloc et la construction directe ; deuxième lot.
- **Les tireurs désignés** (penaltys, coups de pied arrêtés, laissés à C par le
  chantier B) : le meilleur tireur du terrain est déjà choisi d'office. Hors de C,
  sauf demande (décision 1).
- **Les consignes individuelles** (un latéral qui monte, un milieu qui reste) :
  le moteur ne lit que les postes. Hors de C.

## Les clubs de l'IA

Un club de l'IA choisit ses consignes **avant chaque match**, sur trois éléments :

1. **Son effectif**, d'après le onze choisi :
   - les ailes si ses joueurs de couloir centrent bien et que ses attaquants
     jouent bien de la tête ;
   - les frappes de loin si ses milieux offensifs et attaquants frappent bien ;
   - la construction directe si ses passeurs réussissent les ballons longs et que
     ses attaquants gagnent les duels aériens.
2. **Le rapport de forces**, comme le bloc de départ aujourd'hui (même calcul,
   `lineup_strength`) : l'outsider joue plus direct et plus bas, le favori plus
   court et plus haut.
3. **Sa personnalité** : l'appétit du risque du club (`ClubPersonality.risk_appetite`)
   décale le bloc et la construction, pour que deux clubs semblables ne jouent pas
   tous pareil.

Chaque élément donne un score par cran ; le cran au plus haut score est choisi,
sans tirage aléatoire : le même match donne les mêmes consignes. Une fois menée en fin de match,
l'IA remonte son bloc comme aujourd'hui (`late_block`) ; elle ne change pas ses
autres consignes en cours de match (décision 7).

Pour le club dirigé, un bouton « Consignes suggérées » applique ce même choix,
comme « Meilleure composition » pour le onze.

## Les cibles de saison

Mesurées le 25 octobre 2026 (`season`, 10 itérations) :

| Mesure | Aujourd'hui | Cible |
|---|---:|---:|
| Points par match du champion | 2,02 | ≥ 2,10 |
| Corrélation réputation / classement | 0,46 | ≥ 0,70 |
| Titres de l'équipe la plus forte | 0,43 | ≥ 0,55 |

Et sur les affiches de référence (`match`, 3 000) : 53,6 % de victoires du Real
contre le Barça à domicile (cible 39 à 49 %), 19,9 % de défaites (24 à 34 %) ; 10,4 %
de défaites de City contre Burnley (≤ 9 %).

**Ce que C peut y faire, d'après la maquette : peu, et plutôt dans le mauvais sens
pour la saison.** Les consignes équilibrées à niveau égal ne rendent personne plus
fort. Une fois compensée, la consigne qui rapporte le plus rapporte davantage à
l'outsider (+0,11 contre +0,03) : avec une IA qui choisit bien, les petits clubs
gagnent un peu plus de points, et les cibles de saison s'éloignent. Pour le
Clasico, c'est l'inverse : un Barça qui adapte son jeu reprend quelques points au
Real, dans le bon sens.

Ce que le document propose (décision 10) :

- C se mesure à ces cibles à chaque étape, et ne doit pas en éloigner la saison de
  plus d'une erreur type (environ 0,02 point par match pour le champion).
- Le réglage des consignes en tient compte : le prix de la construction directe
  peut être plus lourd pour l'équipe la plus faible si la saison l'exige, mais ce
  serait un choix de jeu, à valider.
- Les trois cibles de saison relèvent d'un autre levier. La suite joue des onze
  figés, sans fatigue entre les matchs ni rotation : l'écart de force y passe
  entièrement par la sensibilité des duels aux écarts (`k_prog`, `k_occ`, l'avantage
  à la conservation), recalée au chantier A sur les affiches de référence, qui ne
  se correspondent plus (City trop faible contre Burnley, Real trop fort contre le
  Barça). Un chantier de calibrage dédié, après C, comparerait la force du onze et
  le rang sur de vrais championnats.

## Ce que l'interface montre

À la charte (`docs/charte-graphique.md`), sans texte d'aide à l'écran : le manuel
explique les consignes.

- **Composition** : une carte « Consignes » dans la colonne des tactiques, sous le
  choix de la formation. Une ligne de 26 par consigne : son nom, puis ses trois
  crans en `.segmented.small`, le cran choisi marqué comme une vue ouverte. Le
  bouton « Consignes suggérées » est dans l'en-tête de la carte. La charte reçoit un
  composant « Consignes », avec la ligne, la colonne des noms à largeur fixe et le
  spécimen sur la planche.
- **Adversaire** : dans le cadre de l'adversaire de la composition, les consignes de
  son dernier match, en une ligne (« Directe · Ailes · Bloc bas »), au cran du
  milieu non nommé.
- **Direct** : la fenêtre Tactique reprend la carte « Consignes » à la place de la
  mentalité. Un changement est un ordre (`LiveOrder`), relu au même moment.
- **Compte rendu** : les consignes de chaque équipe, sous sa formation, dans la
  même ligne courte. Un match joué avant C n'en montre pas.
- **Présentation d'un club** : son style habituel, ses consignes les plus jouées
  sur la saison, dans le bloc de l'identité. Optionnel (décision 9).

Pas de nouvelle statistique au compte rendu pour le premier lot : la possession,
les tirs, les corners, les fautes et les passes y sont déjà, et montrent l'effet
des consignes.

## Données et moteur

- **Domaine** :
  - `Tactics` (gelé) : `construction`, `lanes`, `long_shots`, `block`, chacun un des
    trois crans, valeur par défaut « équilibré ».
  - `Club.tactics` : celles du club dirigé entre deux matchs ; celles de l'IA ne sont
    pas gardées, elle les recalcule.
  - `Lineup.tactics`, `SubmittedLineup.tactics`.
  - `MatchResult.tactics` : `(domicile, extérieur)`, `None` avant C.
- **Moteur** :
  - `TeamState.play` : les paramètres d'action de l'équipe, calculés une fois depuis
    `cfg.engine.actions` et ses consignes, et recalculés à un ordre. `_Play` lit
    ceux de l'équipe qui a le ballon au lieu de `cfg.engine.actions`.
  - `choose_lane` reçoit le poids des couloirs de l'attaquant.
  - Le bloc de départ ajoute le décalage du cran au calcul d'aujourd'hui.
- **Direct** : un `LiveOrder` de type `tactics` ; l'ordre `mentality` d'une
  sauvegarde antérieure se relit comme un ordre de bloc de même valeur (défensive →
  bas, équilibrée → médian, offensive → haut). Le match en direct sauvegardé se
  rejoue ainsi à l'identique.
- **IA** : `core/ai/tactics.py`, `choose_tactics(lineup, opponent, club, cfg)`,
  appelé là où la composition de l'IA est faite.

## Configuration

Une section `formations.consignes` (décision 8), à côté de `hauteur_bloc` :

```json
"consignes": {
  "construction": {
    "courte":  {"tempo": 0.75, "jeu_long": -0.8, "gain_ouverture": 0.04},
    "directe": {"tempo": 1.35, "jeu_long": 0.8, "progression": -0.25}
  },
  "couloirs": {"axe": {"poids_aile": -0.6}, "ailes": {"poids_aile": 0.6}},
  "frappes_de_loin": {"rares": {"part": -0.8}, "frequentes": {"part": 0.8, "xg": -0.1}},
  "bloc": {"bas": -0.4, "median": 0.0, "haut": 0.4},
  "ia": {"poids_effectif": 1.0, "poids_rapport_de_forces": 1.0, "poids_personnalite": 0.5}
}
```

Valeurs indicatives, fixées au calibrage. Le cran du milieu n'a pas d'entrée : il ne
change rien. `formations.hauteur_bloc.mentalites` est retiré au profit de
`consignes.bloc` (`RETIRED_RULES`). `consistency.py` vérifie que chaque consigne a
ses deux crans extrêmes et que le bloc reste dans `[min, max]`.

## Mesure

- **Nouvelle suite `consignes`**, sur le modèle de `formations` : chaque cran de
  chaque consigne contre le jeu livré, à niveau égal, domicile alterné. Le score
  d'équilibre (victoire 1, nul `draw_weight`) doit rester entre 0,485 et 0,515
  (`benchmarks.consignes`). La suite rapporte aussi la signature de chaque cran :
  possession, passes, ballons longs, tirs, frappes de loin, centres, attaques par
  couloir.
- **Asymétrie** : la même suite rejoue favori et outsider (74 contre 66). Elle
  rapporte ce que chaque cran rapporte à chacun : à surveiller, sans cible au
  premier lot.
- **Effectif** : deux équipes égales, l'une avec de bons centreurs et joueurs de
  tête, contre la même avec de mauvais ; « ailes » doit rapporter à la première et
  coûter à la seconde. Même chose pour les frappes de loin et la finition.
- **Inchangées** : `stats_match`, `formations`, la référence figée des matchs (cran
  du milieu).
- **Avec l'IA** : `match` et `season`, consignes choisies par l'IA ; comparées à la
  référence du 25 octobre (tableau plus haut).

## Performance

Les paramètres de l'équipe sont précalculés : le pas d'une possession lit un
attribut de `TeamState` au lieu de la configuration, sans calcul de plus. Le choix
du couloir ajoute une addition par couloir. Le choix des consignes par l'IA coûte
un passage sur le onze par match. Cible : moins de 0,5 ms par match, mesuré par
`performance` sur la machine de Vincent.

## Sauvegardes

Schéma 41 :

- `formations.consignes` reçu par `MIGRATION_DEFAULTS` ; `hauteur_bloc.mentalites`
  retiré par `RETIRED_RULES`, et ses valeurs, si le joueur les avait changées,
  reportées dans `consignes.bloc`.
- `Club.tactics`, `Lineup.tactics`, `SubmittedLineup.tactics` et
  `MatchResult.tactics` ont une valeur par défaut : une sauvegarde antérieure se lit
  telle quelle, tout au cran du milieu, et ses matchs déjà joués n'ont pas de
  consignes.
- Un match en direct en cours se relit avec ses ordres `mentality` (voir « Données
  et moteur »).

## Tests

- Le cran du milieu reproduit la référence figée des matchs sans la régénérer.
- Chaque consigne change sa signature dans le bon sens, sur un match déterministe.
- La suite `consignes` tient ses bornes (test lent).
- L'IA : un effectif de centreurs choisit les ailes, un outsider le bloc bas ; le même
  match donne les mêmes consignes.
- Le direct : un ordre de consignes relu au même moment donne le même match ; un
  ordre `mentality` antérieur se relit comme un ordre de bloc.
- Migration : une sauvegarde 40 se lit, garde ses mentalités changées, et rejoue
  un match en direct en cours.
- L'interface : la carte Consignes, l'adversaire, le compte rendu, la fenêtre du
  direct.

## Documentation

- `docs/moteur-match.md` (consignes dans la possession), `docs/configuration.md`,
  `docs/benchmarks.md` (suite `consignes`), `docs/ia-gestion.md` (choix de l'IA),
  `docs/ui.md` (composition, direct, compte rendu), `migrations/README.md` (v41).
- Charte : le composant « Consignes ».
- Manuel : `docs/manuel/03-match.md`, la section « Hauteur de bloc et mentalité »
  devient « Consignes », chiffres en `{{config}}` ; un lien depuis la composition.

## Étapes

Chaque étape laisse les tests au vert et mesure les suites qu'elle touche.

1. **C1 — Moteur et calibrage.** `Tactics`, `TeamState.play`, les quatre
   consignes, la configuration, la suite `consignes`. Le prix de chaque cran est
   calibré jusqu'à l'équilibre. Mesures : `consignes`, `stats_match`, `formations`,
   référence figée inchangée.
2. **C2 — L'IA.** `choose_tactics`, branché sur la composition de l'IA. Mesures :
   `match`, `season`, comparées au 25 octobre.
3. **C3 — Interface.** La carte Consignes (composition, direct), l'adversaire, le
   compte rendu, la charte.
4. **C4 — Autour.** Migration, manuel et documentation, mesure de performance.

## Décisions

1. **Premier lot : construction, couloirs, frappes de loin, bloc.** L'agressivité
   et la contre-attaque viendraient dans un deuxième lot ; les tireurs désignés et
   les consignes individuelles restent hors de C. Recommandé : oui. Ces quatre
   consignes couvrent les styles qu'on reconnaît (possession, jeu direct, jeu sur
   les ailes, bloc bas), sans toucher aux cartons ni aux suspensions.
2. **Trois crans par consigne**, le cran du milieu étant le jeu d'aujourd'hui.
   Recommandé : oui. Un effet doit se voir sur un match.
3. **Le bloc remplace la mentalité**, avec les mêmes valeurs, réglable avant le
   match et en direct. Recommandé : oui. Deux réglages pour la même chose seraient
   confus ; les mêmes valeurs gardent intacts les anciens matchs en direct.
4. **Le cran du milieu reproduit le moteur actuel au tirage près.** Recommandé :
   oui. C'est la garantie qu'aucune cible n'a bougé, et la référence figée le
   vérifie sans être régénérée.
5. **Chaque cran est équilibré à niveau égal** (score entre 0,485 et 0,515), par un
   prix calibré. Recommandé : oui. Sans prix, la construction directe rapporte
   0,16 point par match à tout le monde et deviendrait le seul choix raisonnable.
6. **La construction courte rapporte par l'occasion, pas par la possession** : un
   gain d'ouverture par passe plus fort. Recommandé : oui. Dans le moteur comme dans
   la réalité, les possessions alternent : garder le ballon n'en ôte pas à
   l'adversaire ; ce qu'une longue circulation gagne, c'est une défense ouverte.
   L'autre voie, la fatigue de l'équipe qui défend, toucherait aux états des joueurs
   et à la gestion d'effectif : à garder pour un lot suivant.
7. **L'IA choisit ses consignes avant le match**, d'après son effectif, le rapport
   de forces et sa personnalité, sans tirage ; elle ne les change pas en cours de
   match, sauf le bloc de fin de match d'aujourd'hui. Recommandé : oui. Un
   changement en cours de match par l'IA (mener 1-0, passer bas) est réaliste, mais
   double le travail de calibrage : à un lot suivant.
8. **La configuration va dans `formations.consignes`**, à côté de `hauteur_bloc`.
   Recommandé : oui. Les réglages tactiques d'une équipe sont déjà dans
   `formations.json`.
9. **Les consignes au compte rendu et chez l'adversaire de la composition** ; le
   style habituel sur la présentation d'un club, en option. Recommandé : compte
   rendu et adversaire oui, présentation du club plus tard. Le joueur doit voir ce
   que l'adversaire a joué pour y répondre ; le style d'un club demande des
   statistiques sur la saison.
10. **C ne vise pas les cibles de saison**, mais ne doit pas en éloigner le jeu de
    plus d'une erreur type ; elles relèvent d'un chantier de calibrage après C.
    Recommandé : oui. La maquette montre que des consignes bien choisies aident
    plutôt l'outsider : les cibles de saison ne se règlent pas par les consignes
    sans en faire un avantage caché des favoris.
