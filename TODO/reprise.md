# Reprise : après les chantiers A et B, l'attribut Penaltys et la conception de C

Ce fichier donne à une nouvelle conversation tout ce qu'il faut pour reprendre le
travail sur le moteur de match de Touchline. Il date du 25 octobre 2026.

## Où en est le projet

- **Chantier A, les possessions construites** : une possession est une suite de
  passes, de progressions et de tentatives. Fait (schéma 38, commit `33760f9`),
  décrit dans `docs/conception-possessions-construites.md`.
- **Chantier B, les arrêts de jeu** : chaque arrêt a une cause (faute, sortie,
  hors-jeu, tir), avec penaltys, coups francs et corners. Fait (schéma 39, commits
  `ba0a28d` et `4e5829b`), décrit dans `docs/conception-arrets-de-jeu.md`.
- **L'attribut Penaltys** : la colonne `Penalties` est le 16ᵉ attribut (`penalty`).
  Le tireur et sa réussite suivent le composite `attributs.composites.penalty`
  (75 % Penaltys, 25 % Sang-froid), en match comme aux tirs au but. Le gardien garde
  ses Réflexes : chez les gardiens, `Penalties` mesure le talent de tireur, pas celui
  d'arrêter les penaltys (Courtois et E. Martínez y ont 1 sur 20). Fait (schéma 40,
  commit `d4352a1`), décrit dans `docs/attributs.md` (« Penalty ») et
  `migrations/README.md` (v40).
- **La convention des minutes** : toute minute de match s'écrit comme les buteurs
  sous un score, c'est-à-dire la minute en cours, 45+1′ dans le temps additionnel,
  46′ à la reprise, puis 90+1′ (`matchMinute` dans `web/ui.js`, `goal_minute` dans
  `src/api/rounds.py`). Fait (commit `be7d141`), règle dans la charte (« Conventions
  d'écriture », « Minutes »).
- **Chantier C, les consignes tactiques** : conception rédigée, décisions à valider
  (`TODO/conception-consignes-tactiques.md`, commits `c9792ff` et `a5cc6af`). Rien
  n'est codé.

L'attribut Penaltys est dans `main` (PR https://github.com/vin100zz/fmastra/pull/21).
Les minutes, la conception de C et ce fichier sont sur la branche
`claude/exciting-feynman-6f0ut4`, dans une seconde PR. Vérifier son état avant de
commencer : fusionnée, la reprise part de `main` ; sinon, de cette branche.

À lire avant de toucher au moteur :
- `docs/moteur-match.md` : le moteur tel qu'il est ;
- les deux documents de conception de A et B, en particulier leur section « Ce qui
  a changé à l'implémentation » ;
- `docs/benchmarks.md` : les cibles et ce qu'elles mesurent ;
- `docs/manuel/03-match.md` : les règles telles que le joueur les lit ;
- `migrations/README.md` : l'historique des schémas de sauvegarde.

## Règles de travail

Elles s'ajoutent à `CLAUDE.md`, que la conversation charge d'elle-même.

- **Grands chantiers** : d'abord un document de conception dans `TODO/`, avec ses
  décisions ouvertes et une recommandation pour chacune. On ne code qu'après
  validation. Le document passe dans `docs/` avec le code, dans le même changement :
  il reçoit une section « Ce qui a changé à l'implémentation » et les chiffres
  mesurés, et quitte `TODO/` (voir `TODO/README.md`). `docs/` ne décrit que le jeu tel
  qu'il est.
- **Maquette** : avant d'écrire les règles d'un chantier, chiffrer ses leviers dans le
  moteur actuel par une surcharge locale qui ne touche pas au code
  (`TODO/maquette_consignes.py` en est un exemple).
- **Manuel du jeu** : tout changement de règle met à jour son chapitre dans
  `docs/manuel/`. Les chiffres y sont des emplacements `{{config}}` (par exemple
  `{{pct(moteur_match.penalty.reussite_base, 0)}}`), jamais tapés en dur. Un lien
  vers une section ne peut viser qu'un titre de niveau 2 (`## …`).
  `tests/unit/test_manual.py` vérifie le rendu et les liens.
- **Interface** : la charte graphique fait foi (voir `CLAUDE.md`). Ce qui manque
  à la charte s'y ajoute dans le même changement : règle dans
  `docs/charte-graphique.md`, style dans `docs/charte/charte.css` et
  `web/charte.css`, spécimen sur `docs/charte/index.html`.
- **Fins de ligne** : dans l'index Git, les fichiers sont en LF. Sur la machine
  Windows de Vincent, Git les extrait en CRLF : là, jamais `sed -i`, qui les
  convertit en LF. Modifier avec l'outil d'édition, ou avec un script Python qui lit
  les octets, remplace `\r\n` par `\n`, fait ses remplacements (en vérifiant que
  chaque motif apparaît une seule fois) et réécrit en CRLF. Dans un conteneur Linux,
  les fichiers sont en LF et le restent. Contrôler avec `git ls-files --eol`.
- **Git** : commiter ou pousser seulement sur demande. Ne pas toucher au travail
  non commité de Vincent. Messages de commit en anglais, au style des précédents
  (`feat: …`, corps explicatif).
- **Comptes rendus** à Vincent en français.

## Configuration et sauvegardes

- Les modèles de configuration (`src/core/config/models/*.py`) s'écrivent à la
  main : le générateur est périmé. Une clé nouvelle a pour valeur par défaut, dans
  le modèle, la valeur livrée dans `config/*.json`. La cohérence des valeurs se
  vérifie dans `src/core/config/consistency.py`.
- **Un changement de règle** atteint les sauvegardes existantes par une montée de
  schéma (`SCHEMA_VERSION` dans `src/infrastructure/persistence/store.py`,
  actuellement 41). Trois tables y servent :
  - `MIGRATION_DEFAULTS` : les clés ajoutées, avec leurs valeurs par version ;
  - `RETIRED_RULES` : les clés retirées. Le même chemin rend aussi, pour le contrôle
    d'empreinte, une règle modifiée avant le typage (la liste des attributs au
    schéma 40, `_list_penalty`) ;
  - une table `*_RECALIBRATED_RULES` : les valeurs recalibrées, appliquées par
    `_recalibrated` dans une fonction `_upgrade_*`. Une sauvegarde qui porte encore
    l'ancienne valeur livrée prend la nouvelle ; une valeur choisie par le joueur
    est gardée.

  Les entrées d'anciennes versions doivent perdre les clés retirées depuis. Les
  tests `tests/integration/test_saves.py` et `tests/unit/test_ratings.py`
  vérifient ces migrations. Dans ces tests, une valeur de configuration typée en
  flottant s'écrit en flottant (`-5.0`, pas `-5`), sinon l'empreinte ne correspond
  plus.
- **Ajouter un attribut** : le chemin est celui de `centre` et `cpa` (schéma 12,
  commit `cbec33b`) et de `penalty` (schéma 40, commit `d4352a1`). La clé va à la fin
  de `ATTRIBUTE_NAMES`, et `_extend_attribute_vectors` allonge les vecteurs avant le
  typage : valeur du fichier source exact, sinon une estimation.
- Pour le schéma 39, un script de l'espace de travail régénérait les entrées de
  `MIGRATION_DEFAULTS` depuis la configuration livrée, après chaque changement de
  calibration. Ce script n'existe plus : à réécrire si besoin.
- Pour tester une migration sur une vraie partie : copier
  `saves/autosave.json.gz` dans l'espace de travail, le charger avec
  `SaveStore(<dossier>).load("autosave")`, puis comparer `config_payload` de la
  configuration migrée avec celui de `load_config(Path("config"))`. Seuls les
  réglages du monde choisis à la création doivent différer. **La migration 40 n'a
  pas encore été testée sur la partie de Vincent** (2068) : il n'y avait pas de
  sauvegarde dans le conteneur où elle a été écrite.

## Commandes

Python (depuis la racine du dépôt), sur la machine de Vincent :

```bash
PYTHONPATH=src .venv/Scripts/python.exe -m pytest -q -p no:cacheprovider tests
```

Dans un conteneur Linux sans `.venv` : `pip install -e ".[dev]" pytest-xdist`, puis
`python3` à la place de `.venv/Scripts/python.exe`. Avec `-n 4`, les tests
unitaires prennent 30 s et ceux d'intégration 8 min ; sans parallélisme, la suite
complète prend environ 25 minutes. On vise un fichier précis pendant le travail.

Pour régénérer la référence figée des matchs, seulement après un changement voulu
des règles :

```bash
TOUCHLINE_REGEN_GOLDEN=1 PYTHONPATH=src .venv/Scripts/python.exe -m pytest -q -p no:cacheprovider tests/unit/test_engine_golden.py
```

Tests de l'interface :

```bash
node --experimental-detect-module --test tests/frontend/
```

Dans un conteneur Linux, passer les fichiers : `tests/frontend/*.mjs`.

Suites de mesure : `--suite` vaut `stats_match`, `match`, `formations`,
`performance` ou `season`, avec `--iterations`, `--config` et `--overrides`.

```bash
PYTHONPATH=src .venv/Scripts/python.exe -m benchmarks.runner --suite stats_match
```

- `stats_match` : 10 000 matchs par défaut, plusieurs minutes. Mesurer à 3 000
  pendant la calibration, puis confirmer à 10 000.
- `match` : les affiches de référence, avec `--iterations 3000`.
- `formations` : avec `--iterations 200`.
- `season` : avec `--iterations 10`, entre 15 et 30 minutes.
- `performance` : seulement sur une machine au repos, et en faisant tourner
  l'ancien et le nouveau moteur l'un après l'autre. Pour l'ancien, extraire le
  commit dans un dossier temporaire (`git archive <commit> src config | tar -x -C
  <dossier>`), puis lancer avec `PYTHONPATH=<dossier>/src` et
  `--config <dossier>/config`. Le même procédé donne la référence de toute
  comparaison avant / après.
- Pour attendre une suite lancée en arrière-plan, ne pas tester
  `pgrep -f "benchmarks.runner"` : la boucle d'attente contient ce texte et se
  trouve elle-même. Attendre plutôt une ligne attendue dans le fichier de sortie.

Voir le jeu sans toucher à la partie de Vincent :
- lancer l'application sur une copie des sauvegardes (`create_app(ROOT, <dossier>)`
  dans un petit script uvicorn, déclaré dans `.claude/launch.json`) ;
- faire avancer le temps par `POST /api/monde/avancer` avec
  `{"commande_id": "...", "jusqu_a": "etape"}`, puis suivre `/api/travaux/<id>` ;
- lire un match par `/api/matches/<id>`, et une journée par
  `/api/competitions/<id>/calendrier?journee=N`.

Pour les images du résumé animé, le panneau du navigateur masqué ne repeint pas.
Passer par Chrome sans interface, piloté par le protocole DevTools depuis Node
(`node --experimental-websocket`), en avançant le résumé à la main :
`r.paused=true; r.time+=dt; r.step(dt)`. La mémoire du projet
(`replay-testing`, `isolated-app-preview`) donne le détail.

## Ce qu'on sait de la calibration

- **Chiffres actuels**, `stats_match` sur 10 000 matchs, par équipe :
  - 106.5 possessions, 12.6 tirs, 1.32 xG, 1.43 but ;
  - 10.7 fautes, 0.15 penalty, 1.96 jaune, 0.061 rouge ;
  - 28.6 % de buts sur coups de pied arrêtés, avantage du terrain 0.29 ;
  - notes par poste entre 6.41 et 6.54.

  Les formations sont entre 0.488 et 0.517. Écart cumulé hors tolérance sur les
  affiches de référence : environ 0.10.
- **Sur le panel synthétique, il y a peu de marge.** Les buts valent environ
  1.10 × les xG, et la fenêtre « xG ≥ 1.30, buts ≤ 1.45 » est étroite.
- **`k_prog` et `k_occ` ne bougent presque pas les affiches de référence.** Ce
  qui donne le ballon et les résultats au favori, c'est l'avantage à la
  conservation : l'écart de l'attaquant moins celui de l'adversaire au même
  endroit de son camp (`actions.patience`, `conservation.sensibilite`).
- **Fautes et favori.** Une faute ne tombe que sur une action ratée : sans
  correction, le favori subissait autant de fautes que l'outsider.
  `arrets.faute.sensibilite_ecart` (0.03) fait suivre l'avantage de l'attaque. À
  0.04, l'écart des fautes devient irréaliste.
- **Penaltys du panel synthétique.** `AVERAGE_DELIVERY` donne `penalty` 46.5 à tous ;
  les avant-centres gardent le niveau de l'équipe et tirent les penaltys. Quand
  l'avant-centre est remplacé, c'est l'arrière gauche qui tire (31 % des penaltys).
  Réussite mesurée sur 3 000 matchs : 76.1 % (77.3 % avant l'attribut, dans le
  bruit).
- **Ce que la maquette du chantier C a appris** (détail dans
  `TODO/conception-consignes-tactiques.md`, « Maquette ») :
  - jouer plus vite et plus long rapporte 0.16 point par match à n'importe quelle
    équipe : le jeu livré n'est pas un optimum ;
  - garder le ballon ne rapporte rien par soi-même, puisque les possessions
    alternent ;
  - couloirs et bloc sont presque neutres ;
  - ce qu'une consigne rapporte, une fois compensée, profite plutôt à l'outsider.

## Ce qui reste à faire

### 1. Chantier C : faire valider les décisions, puis coder

`TODO/conception-consignes-tactiques.md` propose quatre consignes à trois crans
(construction, couloirs, frappes de loin, bloc), le cran du milieu reproduisant le
moteur actuel au tirage près. Ses dix décisions attendent l'avis de Vincent ; on ne
code pas avant. Ensuite, les étapes C1 à C4 du document : moteur et calibrage, IA,
interface, migration (schéma 41) et documentation.

### 2. Les cibles déjà manquées avant A

- **Saison** (`season`, 10 itérations, mesuré le 25 octobre) :

  | Mesure | Actuel | Cible |
  |---|---|---|
  | Points par match du champion | 2.02 | ≥ 2.10 |
  | Corrélation réputation / classement | 0.46 | ≥ 0.70 |
  | Titres de l'équipe la plus forte | 0.43 | ≥ 0.55 |

  C'est le plus gros manque de réalisme. D'après la maquette, le chantier C ne
  le comblera pas : sa décision 10 propose un chantier de calibrage dédié après C
  (sensibilité des duels aux écarts, sur de vrais championnats).
- **Affiches de référence** (`match`, 3 000) :
  - Clasico à domicile : 53.6 % de victoires pour le Real (cible 39 à 49 %) et
    19.9 % de défaites (cible 24 à 34 %) ;
  - City – Burnley : 72.8 % de victoires (cible ≥ 73 %) et 10.4 % de défaites pour
    City (cible ≤ 9 %) ;
  - PSG – Toulouse à domicile : 15.6 % de nuls (cible ≥ 16 %) ; deux équipes égales :
    32.2 % de défaites à domicile (cible ≤ 32 %).
- **Temps par match** : environ 22 ms pour un budget de 20 ms, sur la machine de
  Vincent. À remesurer après l'attribut Penaltys (`performance`, machine au repos).
- **Scores**, cibles indicatives : 5.7 % de matchs sans but (cible 7 à 9 %) et
  32 % à quatre buts ou plus (cible 22 à 28 %).

### 3. Vérifications à faire chez Vincent

- La migration 40 sur sa partie (`saves/autosave.json.gz`), comme décrit plus haut.
- La suite `performance` sur une machine au repos.

### Points réglés ou écartés

- **Tireur du panel synthétique** : réglé avec l'attribut Penaltys.
- **Minutes du compte rendu et du résumé** : réglé, convention télévisée.
- **Mur du coup franc direct** : ses pastilles (3.1 m de diamètre à l'échelle,
  espacées de 0.62 m) se recouvrent. Vincent juge normal qu'un mur soit compact :
  laissé tel quel. Un écart d'environ 2 m les ferait se toucher, si l'on voulait
  pouvoir les compter.
- **Penaltys et gardiens** : on garde les Réflexes, la colonne `Penalties` ne dit
  rien de l'arrêt des penaltys.
