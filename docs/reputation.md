# Réputation des clubs

La réputation (échelle 0-100, celle de `Reputation` du CSV divisée par 100) n'est plus
constante : elle est révisée chaque 1er juillet pour **tous** les clubs, simulés ou non.
Elle pèse sur les revenus, le niveau visé au mercato, l'attrait du club pour les joueurs,
les centres de formation, les tirages (coupes, promotions depuis la réserve, Europe) et la
répartition des chapeaux européens ; voir `docs/ia-gestion.md`.

## Principe

Le club garde une **ancre** : la réputation importée, qui résume sa taille (affluence,
finances, histoire). Chaque juillet, elle se déplace vers une **cible** construite à
partir de l'ancre et de ce que le club a fait, avec de l'inertie :

```
cible = ancre
      + gain_par_division × (niveau de départ − niveau joué la saison qui vient)
      + amplitude_classement × (1 − 2 × (rang − 1) / (n − 1))
      + qualification européenne
      + palmarès décroissant
cible = min(cible, ancre + hausse_max)
cible = min(cible, plafond de la division jouée)      # niveaux ≥ niveau_min_plafond
réputation += lissage × (cible − réputation)
```

Tout est borné à `bornes` (1 à 100). La révision est déterministe : aucun aléa.

| Terme | Règle |
|---|---|
| Niveau | 1 = première division ; divisions simulées, puis la réserve non simulée d'un pays = dernier niveau + 1. Le niveau de départ est celui de `source_division_id`. |
| Division | `gain_par_division` (6) points par niveau, à la hausse comme à la baisse. Mesuré à 7 points environ par régression sur l'affluence dans les données fournies ; l'écart des médianes (10) mélange division et taille. |
| Rang | Classement de la saison qui vient de finir, dans sa division : de +3 (1er) à −3 (dernier). Absent hors des ligues simulées. |
| Europe | Qualifié pour la saison qui vient : C1 +3, C3 +1,5, C4 +0,75. |
| Palmarès | Titre de championnat par niveau (4 ; 1,5 ; 0,5), coupe nationale 2, coupe d'Europe (C1 6, C3 3, C4 1,5), chacun multiplié par 0,7 par saison écoulée. Recalculé chaque année depuis `world.champions` : rien de plus n'est stocké. |
| Plafond | Médiane de la réputation importée des équipes premières de la division jouée (+ `marge_plafond`, 0). Il n'existe pas en première division. Il est figé à l'import dans `world.reputation_ceilings`. |
| Lissage | 0,4 : environ 60 % de l'écart à la cible est comblé en deux ans. |

Le **plafond** est ce qui fait perdre son surplus à un club installé trop bas : un géant
relégué reste très haut après un an (l'inertie), puis rejoint le niveau d'un club moyen de
sa nouvelle division. Un petit club promu ne gagne que le gain de division et son rang.

## Ordre dans le bilan de juillet

`annual_review` : classements, places européennes, mouvements de divisions, **révision de
la réputation** (`core/world/reputation.py`, événement `ReputationRevised`), puis budgets :
les revenus (`base_par_point_reputation × réputation × multiplicateur pays`) suivent donc
la réputation révisée. Les tirages de promotion et de qualification étrangère, faits avant,
utilisent la valeur de la saison écoulée ; les chapeaux européens et la génération des
jeunes utilisent la nouvelle.

## Clubs sans division connue

Un club dont la division n'est ni simulée ni dans une réserve (nations hors pyramides) n'a
ni gain de division, ni rang, ni plafond : seuls l'Europe et le palmarès le déplacent, et
seulement vers le haut (retour vers l'ancre l'année suivante). Un club d'une réserve non
simulée n'a pas de résultats mais suit la division et le plafond de son niveau.

## Historique et interface

`world.reputation_history[club]` garde `(saison, réputation)` à l'ouverture de chaque
saison, y compris la première. L'onglet Historique d'un club affiche la colonne
« Réputation » : valeur à l'ouverture de la saison et variation depuis la précédente.

## Configuration

Section `reputation` de `config/monde.json`, modèle `WorldConfigReputation`
(`core/config/models/world.py`, écrit à la main : les valeurs par défaut sont celles que
reçoit une sauvegarde antérieure). Cohérence dans `core/config/consistency.py`.
Sauvegardes : voir `migrations/README.md` (v13). L'ancre et le plafond d'une sauvegarde
antérieure sont reconstruits au chargement à partir de la réputation courante, qui y était
constante.

## Comportement observé

Six saisons du monde complet (graine 20260910, `economy`), 216 clubs actifs :

- Moyenne des clubs actifs stable (61,7 → 61,5), dispersion +4 %, variation annuelle moyenne 1,5 point,
  top 10 mondial conservé à 98 % d'une saison à l'autre, aucun solde négatif.
- Relégués : Man Utd 81,7 → 72,2 la première année ; Monaco 78,4 → 68,8 → 63,1 → 59,7 → 57,6 en
  trois ans de deuxième division, soit le niveau des derniers de première (Leverkusen, Athletic Club
  et Marseille perdent 9 à 10 points la première année). Un club installé au plafond de sa division
  (Stoke, 58,0) n'en bouge plus.
- Promus : +3 à +5 points en un an (Watford 59,5 → 63,0 → 64,1), jamais au niveau d'un ancien géant relégué.
- Les clubs dominants montent vite : PSG 87,5 → 97,2, Real Madrid 91 → 98,1 en trois saisons. Finir
  1er compte trois fois la même année (rang +3, titre +4, place en C1 +3), au plus `hausse_max` (15)
  au-dessus de l'ancre. Pour freiner : `palmares.championnat_par_niveau` [2,5 ; 1 ; 0,5],
  `palmares.coupe_nationale` 1,5, `palmares.coupe_europe` C1 4 / C3 2 / C4 1, `qualification_europe`
  C1 2 / C3 1 / C4 0,5 et `hausse_max` 10 ramènent PSG à ~96 après quatre saisons (contre ~98).

## Vérification

`tests/unit/test_reputation.py` (règles isolées) et `tests/integration/test_reputation_seasons.py`
(deux saisons sur l'import réel, sauvegarde et reprise). Le benchmark multi-saisons
`reputation` de `docs/benchmarks.md` contrôle la dérive sur la durée.
