# Configuration

## Règle

Les coefficients, seuils, courbes, distributions, formations et cibles sont
contenus dans `config/*.json`. Le code conserve la structure des formules,
les machines à états et les invariants mathématiques. Les règles susceptibles
de varier, dont les nombres de joueurs et de remplacements, sont déjà dans
`monde.regles_match` et ne sont pas dupliquées dans le code.

Les JSON sont la source de vérité pour les valeurs ; les documents définissent
le sens et les unités des champs. Toute contradiction doit être corrigée dans
les deux, pas résolue silencieusement par l'implémentation.

## Catalogue

| Fichier | Contenu |
|---|---|
| `config/monde.json` | date initiale, périmètre, calendrier, mercato, règles de match |
| `config/import.json` | format source, sélection des 30 meilleurs, valeurs manquantes, synthèse |
| `config/attributs.json` | attributs, composites, notes globales, profils de génération |
| `config/implications.json` | matrices d'implication verticale et latérale |
| `config/formations.json` | formations et hauteur de bloc |
| `config/moteur_match.json` | chronologie, transitions, tirs, statistiques, référence Poisson |
| `config/etats.json` | fatigue, blessures, suspensions, forme, moral |
| `config/ia_gestion.json` | utilité, revenus, salaires, mercato, contrats, garde-fous |
| `config/demographie.json` | progression, déclin, estimations, cohortes et sorties |
| `config/benchmarks.json` | protocoles, cibles, tolérances et budgets de performance |

## Modèles et chargement

```text
core/config/
  models/          modèles typés, un module par domaine
  consistency.py   contrôles entre champs et fichiers, sans I/O
  errors.py        erreurs de validation
infrastructure/config/
  loader.py        lecture, fusion, validation, assemblage
  merge.py         fusion des surcharges, retrait des clés _note
```

Utiliser `pydantic.dataclasses.dataclass`, avec `frozen=True`, `slots=True`,
`extra="forbid"` : les modèles typés et leur schéma partagent une définition.
Les champs Python sont anglais ; des alias explicites lisent les clés JSON
françaises existantes. Le métier n'accède jamais au JSON brut ; ses collections
indexées typées restent autorisées. `frozen=True` ne rend pas les collections
imbriquées immuables : convertir les listes de configuration en tuples et
protéger ses tables associatives.

L'objet `Config` contient les dix domaines, dont `import_settings`, et les
métadonnées de version. La config et le RNG sont injectés, jamais globaux.
Le chargeur accepte un dossier de base et un dossier optionnel de surcharge.

Refuser les champs absents, inconnus ou invalides. Un repli explicitement
configuré pour une valeur CSV manquante n'est pas un défaut de schéma : une
clé de configuration absente reste une erreur.

Exception de compatibilité explicite : `ia_gestion.mercato.stabilite_apres_arrivee_jours`
vaut 180 si absent, pour les configurations antérieures à cette règle. Ce délai
est un entier positif ou nul ; zéro désactive la période de stabilité.
De même, `ia_gestion.mercato.gain_qualite_min_recrutement` vaut 3.0 si absent
dans une ancienne configuration. C'est le gain minimal non négatif de qualité
pondérée de l'effectif exigé hors urgence ; un gain nul reste insuffisant.

Les configurations antérieures à la version 8 des sauvegardes reçoivent aussi
les valeurs par défaut de `ia_gestion.mercato` pour la profondeur d'effectif
(`profondeur_effectif_min` 16, `profondeur_effectif_max` 20, bornes de réputation
50 et 80, `poids_profondeur_vente` 0,75), le consentement du joueur
(`tolerance_baisse_reputation` 5, `marge_niveau_joueur` 2, `moral_depart_force`
0,5), la visibilité des talents (`talents_visibles` 10) et la durée des enchères
(`jours_encheres` 2). La profondeur couvre au moins les titulaires et au plus les
places de rotation ; `poids_profondeur_vente` et `moral_depart_force` restent
dans [0, 1] et `jours_encheres` vaut au moins 1.

## Cohérence

- Somme des poids des composites, notes globales et distributions : 1 à la
  tolérance numérique de validation près (1e-6).
- Attributs et postes référencés existants ; formations de onze postes avec
  exactement un gardien ; implications latérales normalisées. Les implications
  verticales sont des intensités, pas des probabilités.
- Bornes ordonnées, probabilités dans [0, 1], dates valides, courbes sans trou
  ni chevauchement ; comportement hors domaine déclaré.
- Maximum importé par club égal au plafond d'effectif v1 ; minimum de gardiens
  importé cohérent avec les garde-fous de l'IA.
- Identifiants des confrontations de référence résolus après import, ou
  effectifs synthétiques explicitement déclarés.
- Chaque métrique définit population, unité, agrégation et prérequis.

## Surcharges

Le CLI accepte `--overrides chemin.json` (objet contenant les domaines, par
exemple `{"moteur_match": {"transitions": {"k_prog": 0.028}}}`) ou un dossier
de JSON portant les mêmes noms que ceux de `config/`. Un chemin inexistant
provoque une erreur. Ces surcharges s'appliquent au benchmark lancé.

Fusion récursive des objets ; remplacement intégral des tableaux et scalaires.
Retirer récursivement uniquement `_note`, pas toutes les clés commençant par
`_` : `_autres` porte une règle de génération d'attributs.
Valider la configuration complète après fusion, y compris les clés inconnues
venant des surcharges. Un benchmark ou une requête ne modifie jamais la base.

## Version et sauvegarde

`monde.version_config` identifie la version des règles par défaut. Chaque
sauvegarde contient la configuration effective après fusion, une empreinte
SHA-256 de son JSON canonique sans `_note`, la version de schéma, la révision
du code et les versions d'exécution.

Une reprise utilise par défaut la configuration sauvegardée. Modifier les
fichiers du dépôt ne change pas une partie existante. Appliquer une nouvelle
configuration à une partie est une action explicite, validée et journalisée ;
elle rompt la comparaison déterministe avec l'ancienne trajectoire.
L'empreinte permet de vérifier la copie, elle ne la remplace pas. Les modèles
de configuration disposent eux aussi de migrations si leur schéma évolue.
