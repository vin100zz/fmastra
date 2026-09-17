# Football Manager Light — Touchline

Simulateur de football de gestion, usage personnel, mono-utilisateur.
Version allégée : on garde effectif, contrats, transferts, matches, sélection et
remplacements. On supprime entraînement, conférences de presse et discussions
individuelles avec les joueurs.

## Lancer le jeu

Si l'environnement est déjà installé, double-cliquer sur **start.bat** :
le serveur démarre et le navigateur s'ouvre automatiquement. Garder la fenêtre
du serveur ouverte ; `Ctrl+C` arrête le jeu. Si le serveur tourne déjà, le
lanceur ouvre simplement le jeu.

Python 3.12 est requis. Depuis ce dossier, dans PowerShell :

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\run.ps1
```

Ouvrir **http://127.0.0.1:8011**, puis créer une partie ou reprendre une
sauvegarde. Les CSV sont chargés à la création ; aucun service externe n'est
nécessaire pendant le jeu. Pour un autre port : `./run.ps1 -Port 8012`.
Conserver un seul processus serveur : l'état est en mémoire.

L'interface comprend le tableau de bord, les classements, calendriers,
statistiques, clubs et budgets, la recherche de joueurs, les fiches de carrière,
les comptes rendus et les compositions. L'utilisateur reste observateur.

La liste des joueurs affiche toutes leurs nationalités, leur valeur et une fourchette de potentiel estimé à côté du niveau actuel,
avec un tri initial par valeur décroissante. Les clubs sont triés par réputation
décroissante. L'effectif affiche aussi les matchs, minutes, buts, passes décisives,
cartons et note moyenne réalisés avec ce club pendant la saison courante.
Les minutes sont affichées sans décimales et ne figurent plus dans le tableau de carrière. Les historiques du club et du championnat donnent le classement complet de chaque saison, avec la dernière saison dépliée.

**Mercato mondial**, dans le menu principal, regroupe les transferts, fins de
contrat, retraites et promotions de tous les clubs, par saison et avec pagination.
Toutes les colonnes de l'historique des mouvements sont triables par clic, dans les deux sens, avant pagination. Le tri est conservé lors du changement de saison. Les données absentes restent à la fin ; le potentiel est trié par le milieu de sa fourchette estimée.
L'onglet promotions reprend les informations de la liste des joueurs. Les nouvelles promotions archivent les données au moment de l'événement ; pour les anciennes, les données actuelles sont identifiées comme telles, ou signalées manquantes après une retraite.
L'interface utilise une présentation compacte et des tableaux défilants sur les
petits écrans pour conserver l'accès à toutes les colonnes.

Les salaires et plafonds salariaux sont affichés en moyenne mensuelle
(hebdomadaire × 52 ÷ 12), arrondis à deux chiffres significatifs. Les filtres
de salaire utilisent aussi des euros par mois. Les contrats et calculs internes
conservent leur précision ; le journal financier présente les sommes réellement
versées sur chaque période.

Sur la fiche d'un club, **Finances** présente les revenus et dépenses par
saison : revenus structurels, salaires, fonctionnement, indemnités de transfert
et arrondis comptables, avec les soldes d'ouverture et de clôture. Les flux
réguliers sont regroupés par mois. **Transferts** distingue les arrivées,
départs transférés, fins de contrat, retraites et jeunes promus. Les arrivées sont à gauche, les départs à droite, avec leurs montants totaux. Les âges des regens et retraités sont ceux au moment du mouvement ; une donnée non archivée est indiquée par un tiret. Les flèches
**Précédent / Suivant** permettent de parcourir les saisons dans ces deux onglets.
Pour une ancienne sauvegarde, les comptes détaillés commencent à la mise à jour ;
les données historiques manquantes sont signalées. Les dates de naissance des retraités peuvent être récupérées dans le CSV uniquement si son empreinte correspond exactement à celle de l'import initial.

Le bouton **▶ Auto** enchaîne les prochaines journées de championnat, avec
sauvegarde après chaque avance. **⏸ Pause** arrête l'enchaînement après le
calcul en cours. Une erreur ou le rechargement de la page arrête aussi ce mode.

Les sauvegardes sont dans `saves/`. Le slot `autosave` est remplacé après chaque
commande d'avance et chaque changement de mois. Utiliser un slot nommé dans
« Ma partie » pour conserver plusieurs univers. Le chargement restitue la
configuration de la sauvegarde, même si les JSON du dépôt ont changé.

## Vérifier et calibrer

```powershell
.\.venv\Scripts\python.exe -m pytest -q
$env:PYTHONPATH = 'src'
.\.venv\Scripts\python.exe -m benchmarks.runner --suite stats_match --iterations 2000 --report reports/matches.json
.\.venv\Scripts\python.exe -m benchmarks.runner --suite formations --iterations 80 --report reports/formations.json
.\.venv\Scripts\python.exe -m benchmarks.runner --suite world --seasons 3 --warmup 0 --report reports/monde.json
```

Suites disponibles : `analytical`, `match`, `stats_match`, `formations`,
`season` (effectifs figés), `performance`, `injuries`, `demography`, `economy`,
`world`. `--seed` choisit la graine ; `--overrides fichier.json` applique une
surcharge sans modifier les fichiers de configuration. Les rapports sont JSON
et CSV ; les suites de monde écrivent aussi un suivi annuel pendant le calcul.
Un échantillon court ne valide pas la stabilité à trente saisons : le rapport
signale explicitement un horizon insuffisant.

Voir `docs/implementation.md` pour les mesures effectuées et les limites de
calibrage connues. Les sections suivantes restent la spécification de référence.

## Périmètre de la v1

**Inclus**
- 11 championnats simulés : 3 divisions françaises, 2 en Espagne, Italie, Angleterre et Allemagne (216 clubs actifs)
- Promotions et relégations au 1er juillet : 3 clubs dans chaque sens entre niveaux adjacents
- Saison complète en championnat, matches aller-retour
- Effectifs, contrats, mercato, progression et déclin des joueurs
- Génération de joueurs (regens), fatigue, blessures, suspensions
- **L'utilisateur est observateur** : il ne dirige aucun club, il consulte

**Hors périmètre v1** (mais l'architecture doit les rendre possibles)
- Contrôle d'un club par l'utilisateur
- Coupes nationales et compétitions européennes
- Prêts, clauses libératoires, agents

## Données et volumes

Cette évolution nécessite une nouvelle partie. Au 1er juillet, les trois premiers
montent et les trois derniers descendent entre divisions adjacentes. La première
division n'a aucune montée. Les trois derniers du dernier niveau simulé rejoignent
la réserve non simulée ; trois clubs de cette réserve montent par tirage sans remise,
pondéré par `max(1, réputation)²`. Les groupes du niveau inférieur sont réunis.
Les mouvements sont calculés avant leur application : aucun double changement de
niveau ni remontée immédiate le même été. Les équipes réserves montent librement.

Le National compte 18 clubs, sans exemptions. Les divisions de 22 et 24 clubs
disposent de journées en semaine. Les classements indiquent les places de montée
et de descente ; les historiques conservent le championnat et les participants
de chaque saison, y compris pour un club devenu dormant.

Les effectifs incomplets à l'entrée en simulation sont complétés par des joueurs
générés jusqu'aux minima de joueurs et de gardiens. À l'import, des places sont
réservées aux gardiens manquants avant la sélection des meilleurs joueurs. Pour
un promu dont l'effectif est plein, un joueur de champ excédentaire peut être
libéré pour accueillir un gardien. Les compléments sont comptés dans le rapport
d'import et enregistrés dans les mouvements des clubs.

L'utilisateur fournit un jeu de données **bien plus large que le périmètre
simulé** :

| Grandeur | Valeur |
|---|---|
| Clubs fournis (hors en-tête) | 1 394 |
| Joueurs fournis (hors en-tête) | 14 404 |
| Joueurs conservés de la source | 14 401 |
| Joueurs générés pour compléter les effectifs initiaux | 39 |
| Clubs **actifs** (simulés) | 216 |
| Joueurs dans les clubs actifs après import et complément | 6 405 |
| Joueurs dans les clubs dormants après import | 7 849 |
| Agents libres importés | 186 |
| Matches par saison | 4 064 |
| Regens par an | calculés sur les sorties et les flux, aucun quota fixe |

**Import : au maximum les 30 meilleurs joueurs de chaque club, actif ou dormant.**
Le classement utilise la note globale calculée à partir des attributs fournis, pondérée par poste, à état
neutre. Réserver deux places aux meilleurs gardiens si la source en contient
au moins deux, puis compléter par niveau ; départager les égalités par ID.
Les joueurs écartés ne sont ni importés, ni transformés en agents libres.
Les agents libres déjà présents dans le CSV sont conservés sans plafond collectif.
L'export utilise UTF-8, des dates ISO et des attributs sur 20. Les 13 attributs
utilisés par le moteur sont importés directement, sans estimation depuis la valeur.
La marge de progression vaut `(PotentialAbility - CurrentAbility) / 2` sur
l'échelle interne de 100, ajoutée au niveau pondéré et plafonnée à 100.
Les aptitudes `Position_*` déterminent le poste principal et l'aisance à chaque poste.

Les notes `TrainingFacilities` et `YouthRecruitment` sont affichées sur 20 dans
la liste et la fiche des clubs. YouthRecruitment améliore les chances d'obtenir
des regens à fort potentiel ; TrainingFacilities reste informatif.
Ces données sont lues à la création d'une nouvelle partie. Les anciennes
sauvegardes restent chargeables et conservent leurs joueurs et installations.

Les CSV sources restent inchangés. Voir `config/import.json` et le contrat
d'import dans `docs/modele-donnees.md`. Après import, le plafond reste 30 ; le
profil nominal visé par l'IA est de 24 joueurs, avec stabilisation progressive
par le marché. La démographie tient compte de cette transition.

Cette asymétrie est une chance, pas une contrainte : **les 1 178 clubs non
simulés constituent le marché extérieur**. Sans eux, l'économie des 5
championnats serait fermée et aucun club ne recruterait à l'étranger ou en
division inférieure.

Voir `docs/modele-donnees.md` pour la distinction actif / dormant.

Le choix v1 est de conserver le monde en mémoire, sans base de données.
Mesurer la mémoire réellement consommée avec les historiques et les événements ;
le seul nombre d'entités ne suffit pas à l'estimer.

## Pile technique

- **Serveur** : Python 3.12, FastAPI, état en mémoire dans le processus
- **Cœur de simulation** : fonctions pures, RNG injecté, aucun I/O
- **Front** : HTML / CSS / JavaScript vanilla, sans framework
- **Persistance** : sauvegarde de partie en JSON gzippé, pas de base

## Trois exigences transverses

Elles priment sur la rapidité d'écriture. Un code qui les respecte sera plus long
à produire et beaucoup moins long à faire évoluer.

### Testabilité

Une responsabilité par fichier et par classe. Aucune fonction métier ne fait
d'I/O, n'imprime, ni ne lit l'horloge système. Tout aléa passe par un `Random`
injecté. Conséquence : chaque règle de jeu est testable isolément, sans monde
complet ni serveur.

### Extensibilité

Le projet sera enrichi de façon itérative. Les points d'extension connus
(divisions multiples, coupes, contrôle utilisateur, prêts) passent par des
interfaces explicites. Elles limitent les modifications transverses sans
promettre qu'une fonctionnalité entière tiendra dans une seule implémentation.
Voir `docs/architecture.md`.

### Configurabilité

**Aucune valeur de règle de jeu n'est écrite dans le code.** Tous les
coefficients, seuils, courbes, matrices et cibles vivent dans `config/*.json`,
chargés au démarrage et validés par schéma. Le code contient des formules ; les
nombres sont des données.

Les poids d'un composite sont lus dans la configuration, jamais recopiés dans
la formule métier. Voir `docs/configuration.md`.

## Conséquence architecturale du mode observateur

L'utilisateur étant observateur, **les 216 clubs actifs sont pilotés par l'IA**.
Toute décision de club passe par une interface unique :

```python
class ClubController(Protocol):
    def select_lineup(self, context: LineupContext) -> Lineup: ...
    def decide_substitution(self, context: MatchContext) -> Substitution | None: ...
    def evaluate_needs(self, context: SquadContext) -> list[Need]: ...
    def respond_to_offer(self, context: OfferContext) -> OfferResponse: ...
```

En v1, `AIController` est la seule implémentation ; configuration et RNG lui
sont injectés. Le contrôle utilisateur demandera aussi des commandes, une
gestion de l'attente et des écrans d'action, en plus de `HumanController`.
**Aucun code métier ne doit tester « est-ce le club de l'utilisateur ».**

## Structure du dépôt

```
config/          fichiers JSON de règles — voir docs/configuration.md
src/
  core/          règles métier, état et interfaces sans I/O
    domain/      entités et value objects, sans logique de processus
    engine/      moteur de match
    ai/          décisions de club
    world/       progression, démographie, calendrier, mercato
    config/      modèles typés et validation pure de configuration
  infrastructure/ lecteurs CSV/JSON, chargeur config, sauvegardes, migrations
  api/           FastAPI, couche mince au-dessus de core
  benchmarks/    harnais de calibrage — voir docs/benchmarks.md
web/             front statique
tests/
  unit/          tests unitaires, rapides, déterministes
  integration/   tests de scénarios sur plusieurs saisons
data/            données fournies par l'utilisateur (clubs, joueurs, noms)
migrations/      transformations de schéma de sauvegarde
```

Layout `src/` : le code s'importe toujours comme `core.xxx`, `api.xxx`,
`benchmarks.xxx` (pas `src.core.xxx`) — seul l'emplacement physique change,
via `pythonpath = ["src"]` dans `pyproject.toml`. `web/` reste hors de
`src/` : ce n'est pas du code Python installable.

`core` ne doit jamais importer depuis `api`, `web`, `benchmarks` ou
`infrastructure`. Les adaptateurs d'I/O dépendent de ses interfaces et modèles.

## Déterminisme

Toute la simulation est reproductible.

```python
def simulate_match(home: Team, away: Team, cfg: Config, rng: Random) -> MatchResult: ...
```

Jamais d'appel au module `random` global. Sauvegarder la graine initiale et
l'état courant de chaque RNG, la configuration effective et son empreinte.
À données, code, environnement d'exécution, commandes et configuration
identiques, la simulation et sa reprise doivent être identiques. Les lectures
API ne consomment jamais les RNG de simulation. Voir `docs/architecture.md`.

## Conventions

- Code, noms de variables et commentaires **en anglais**
- Les exemples français historiques sont des notations de spécification, pas
  des noms à recopier dans l'implémentation. Les clés JSON françaises existantes
  sont conservées comme format externe ; les modèles Python sont en anglais.
- Type hints partout, `dataclass(slots=True)` pour les entités
- Attributs de joueur sur une échelle **1-100**
- Dates : objet `Date` de jeu, pas `datetime`
- Montants en euros, entiers, pas de flottants
- Nommage des fichiers de config : un domaine par fichier, clés en `snake_case`

## Documents de spécification

| Fichier | Contenu |
|---|---|
| `docs/architecture.md` | Couches, responsabilités, interfaces, testabilité |
| `docs/configuration.md` | Catalogue des fichiers config, chargement, validation |
| `docs/benchmarks.md` | Harnais de calibrage et cibles |
| `docs/modele-donnees.md` | Entités, actif/dormant, persistance, données fournies |
| `docs/attributs.md` | Les 13 attributs et leurs composites |
| `docs/moteur-match.md` | Simulation par possessions, zones, couloirs, formations |
| `docs/etats-joueur.md` | Fatigue, blessures, suspensions |
| `docs/ia-gestion.md` | Valorisation, besoins, mercato, contrats |
| `docs/progression-demographie.md` | Progression, déclin, regens, marché extérieur |
| `docs/ui.md` | Écrans et endpoints |

## Ordre de construction

1. Chargement de la config + validation par schéma
2. Modèle de données + import des données fournies (actif / dormant)
3. Moteur de match analytique (Poisson) — référence statistique
4. **Harnais de benchmarks**
5. Moteur de match par possessions, calibré contre les cibles
6. Progression, déclin, fatigue, blessures, suspensions
7. IA de gestion et mercato
8. Démographie et regens
9. API puis front

Chaque étape valide ses tests et les seules suites dont les dépendances sont
implémentées. Les cibles initiales sont des hypothèses de calibrage, pas des
vérités empiriques : une cible incohérente doit être corrigée et documentée.
Le harnais arrive **avant** le moteur de production ; les suites démographiques
et économiques deviennent bloquantes une fois leurs mécanismes disponibles.
