# Architecture

## Objectif et couches

Isoler règles, décisions et adaptateurs pour enrichir le jeu sans disperser les
modifications. Les interfaces réduisent le couplage ; elles ne garantissent
pas qu'une nouvelle fonctionnalité n'affectera qu'un fichier.

| Couche | Responsabilité | Interdits |
|---|---|---|
| `core/domain` | entités, objets valeur, invariants | I/O, config globale |
| `core/engine` | simulation d'un match | calendrier de saison, mercato |
| `core/ai` | produire des décisions | modifier directement le monde |
| `core/world` | orchestration et application des événements | I/O, règles de match dupliquées |
| `core/config` | modèles et validation pure | lecture de fichiers |
| `infrastructure` | CSV, JSON, sauvegarde, migrations | décisions métier |
| `api` | commandes et vues | règles de jeu |
| `web` | affichage et navigation | état métier faisant autorité |
| `benchmarks` | mesurer et calibrer | être importé par le métier |

`api`, `infrastructure` et `benchmarks` dépendent de `core`, jamais l'inverse.
Le point d'assemblage injecte configuration, RNG, contrôleurs et adaptateurs.
Le métier peut employer des dictionnaires typés comme index ; il ne manipule
pas les dictionnaires JSON bruts.

Une responsabilité par module. Une longueur de 200 lignes est un signal de
relecture, pas une limite imposant un découpage artificiel. Noms Python anglais.

## Interfaces

- `ClubController` : sélection, remplacements, besoins, offres ; contextes typés
  en entrée, décisions en sortie. `AIController` en v1, voir le README.
- `MatchEngine` : équipes préparées, configuration et RNG vers `MatchResult`.
  Deux implémentations : `PossessionEngine` et `AnalyticalEngine`.
- `CompetitionRules` : calendrier, classement, décisions de fin de saison.
  L'entité `Competition` stocke les données et porte un nom distinct de
  l'interface de règles. `LeagueRules` en v1.
- `TransferRule` : valide un transfert et produit des événements, sans modifier
  directement le monde. Les prêts pourront ajouter droits contractuels et dates
  de retour au modèle.
- Interfaces d'import et de persistance côté cœur, adaptateurs dans
  `infrastructure`. Aucun chargement dans le moteur de match.

Le contrôle humain demandera aussi des commandes, écrans et points d'attente.
Rejouer un résultat calculé est distinct d'un match interactif où une décision
change la suite. Prévoir des étapes de match reprenables ; le journal seul ne
suffira pas à ce futur mode. Aucune règle ne teste « club de l'utilisateur ».

Activer un club dormant demande de valider son effectif, initialiser contrôleur,
calendrier, finances et statistiques, puis changer son statut. Un service
regroupe ces opérations : ce n'est pas une simple bascule de champ.

## État et événements

Une règle produit des événements typés ; un applicateur central mute le monde
et contrôle ses invariants. L'orchestrateur avance par phases : appliquer une
phase avant les décisions dépendant de son résultat. Toutes les intentions
d'un tour de mercato lisent le même état.

Le moteur fait évoluer un état local de match sans modifier les entités du
monde. Son résultat contient les événements à appliquer. Le journal n'offre
pas à lui seul l'annulation : celle-ci demanderait instantanés ou événements
inverses et reste hors v1.

Un RNG injecté est consommé : ces fonctions sont déterministes relativement à
son état, pas pures au sens mathématique. Les calculs sans tirage sont purs.
Les effets de persistance sont séparés.

## Déterminisme

- Sauvegarder la graine initiale et `getstate()` de chaque RNG persistant ;
  restaurer avec `setstate()`. Préserver les entiers et reconstruire la
  structure attendue depuis le JSON, sans pickle.
- Séparer les flux par sous-système. Import et estimations utilisent des
  graines dérivées d'identifiants stables et d'une empreinte cryptographique,
  jamais de `hash()` Python ni de l'ordre des lignes CSV.
- Trier les entités et offres par clé stable avant les tirages sensibles à
  l'ordre. Définir explicitement le départage des offres simultanées.
- Les consultations API ne modifient ni le monde ni les RNG de simulation.
- En benchmark parallèle, dériver la graine de l'ID de scénario et de l'indice
  de répétition. Le nombre de processus ne change pas les résultats.
- Une reproduction exacte suppose mêmes données, commandes, code,
  configuration et environnement ; enregistrer leurs métadonnées.

## Exécution et sauvegarde

Un seul processus possède le monde : un seul worker serveur en v1. Toutes les
commandes d'écriture passent par une file et un verrou communs.
Une simulation longue est un travail suivi par l'API, hors de sa boucle de
requêtes. Les lectures utilisent la dernière vue cohérente publiée ; une
seconde commande d'avancement est refusée tant que la première est active.
Le mode Auto est un travail de ce type, sans fin propre : il occupe la file jusqu'à
un signal d'arrêt (hors file, pour pouvoir passer), lu entre deux jours simulés.
Un ID de commande reconnaît une relance après interruption réseau.

Écrire les sauvegardes dans un fichier temporaire du même répertoire, puis
remplacer atomiquement après succès ; conserver le dernier slot valide en cas
d'échec. Valider et migrer un chargement avant de remplacer le monde courant.
Les noms de slots sont des identifiants validés, jamais des chemins libres.

## Import

```text
infrastructure/importation/readers.py  lecture CSV cp1252
core/world/importation/
  source_positions.py    grammaire des postes source
  normalization.py       valeurs manquantes, nations, dates et IDs
  synthesis.py           attributs et paramètres initiaux des clubs
  selection.py           au maximum les 30 meilleurs par club
  validation.py          intégrité après sélection
  construction.py        assemblage des entités
```

Un changement de source peut toucher lecteur et normaliseur sans affecter le
jeu. Les règles détaillées sont dans `docs/modele-donnees.md`.

## Vérification et performance

Fabriques de joueurs, clubs et onze pour les tests unitaires ; scénarios pour
les invariants de saison. Vérifier reprise de sauvegarde, lecture sans effet
sur la suite, unicité des joueurs alignés et atomicité des transferts.
Les benchmarks statistiques sont distincts des tests.

Mesurer séparément moteur, orchestration, IA et I/O. Précalculer les notes de
zone, profiler puis optimiser les goulots mesurés. Le mode analytique n'est
utilisé que dans les suites acceptant ses statistiques limitées. Une extension
native reste un dernier recours localisé au moteur.
