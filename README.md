# Football Manager Light — spécifications

Simulateur de football de gestion, usage personnel, mono-utilisateur.
Version allégée : on garde effectif, contrats, transferts, matches, sélection et
remplacements. On supprime entraînement, conférences de presse et discussions
individuelles avec les joueurs.

## Périmètre de la v1

**Inclus**
- 5 championnats simulés : France, Espagne, Italie, Angleterre, Allemagne
- Première division uniquement pour chacun (~96 clubs actifs)
- Saison complète en championnat, matches aller-retour
- Effectifs, contrats, mercato, progression et déclin des joueurs
- Génération de joueurs (regens), fatigue, blessures, suspensions
- **L'utilisateur est observateur** : il ne dirige aucun club, il consulte

**Hors périmètre v1** (mais l'architecture doit les rendre possibles)
- Contrôle d'un club par l'utilisateur
- Divisions inférieures actives, promotion et relégation
- Coupes nationales et compétitions européennes
- Prêts, clauses libératoires, agents

## Données et volumes

L'utilisateur fournit un jeu de données **bien plus large que le périmètre
simulé** :

| Grandeur | Valeur |
|---|---|
| Clubs fournis (hors en-tête) | 26 759 |
| Joueurs fournis (hors en-tête) | 32 369 |
| Joueurs importés après limitation | 25 911 |
| Clubs **actifs** (simulés) | 96 |
| Joueurs dans les clubs actifs après import | 2 880 |
| Joueurs dans les clubs dormants après import | 20 223 |
| Agents libres importés | 2 808 |
| Matches par saison | 1 752 |
| Regens par an | calculés sur les sorties et les flux, aucun quota fixe |

**Import : au maximum les 30 meilleurs joueurs de chaque club, actif ou dormant.**
Le classement utilise la note globale synthétisée, pondérée par poste, à état
neutre. Réserver deux places aux meilleurs gardiens si la source en contient
au moins deux, puis compléter par niveau ; départager les égalités par ID.
Les joueurs écartés ne sont ni importés, ni transformés en agents libres.
Les agents libres déjà présents dans le CSV sont conservés sans plafond collectif.
Les CSV sources restent inchangés. Voir `config/import.json` et le contrat
d'import dans `docs/modele-donnees.md`. Après import, le plafond reste 30 ; le
profil nominal visé par l'IA est de 24 joueurs, avec stabilisation progressive
par le marché. La démographie tient compte de cette transition.

Cette asymétrie est une chance, pas une contrainte : **les 26 663 clubs non
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

L'utilisateur étant observateur, **les 96 clubs actifs sont pilotés par l'IA**.
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
