# Formation choisie par l'effectif — conception

25 octobre 2026. Proposition à valider : rien n'est codé. Les décisions ouvertes
sont à la fin, chacune avec une recommandation. Le document rejoindra `docs/` avec
le code.

## Objectif

- Un club de l'IA joue la formation qui convient à ses joueurs, et en change quand
  son effectif change. Plus de formation tirée au hasard à la création.
- Une sélection nationale fait de même : sa formation en match, et la liste des 23
  qui la sert.
- Le mercato, la réserve et les prêts gardent une base stable pour compter les
  places par poste.

À garder :

- l'équilibre des formations (suite `formations`) : il porte sur les formations
  elles-mêmes, à effectifs synthétiques identiques, et ne change pas ;
- les cibles de `stats_match`, qui ne dépendent pas des formations choisies ;
- le temps d'une saison complète (budget de 40 secondes), et le temps par match ;
- le déterminisme ;
- le club dirigé : son entraîneur choisit sa formation, l'IA ne la lui impose pas.

## Constat

Chaque club reçoit une formation au hasard à l'import
(`rng.choice(...)`, `src/core/world/importation/construction.py:121`) et la garde
toute la partie (`docs/manuel/06-entraineur.md`, « La formation »). Le sélectionneur
n'en change que si son meilleur onze met un joueur à un poste où son affinité est
nulle (`src/core/ai/selection.py:72`). Ce cas est rare : presque tout joueur a une
affinité non nulle à un poste voisin.

Effet mesuré sur la suite `match` (3 000 matchs par affiche, graine par défaut) :

- Barcelone a tiré le 4-4-2 losange, qui n'a pas d'ailiers. Lamine Yamal (80) et
  Raphinha (76) restent sur le banc ; Gabriel Jesus (68) et Abdelkarim (64) jouent
  en pointe. Le Real l'emporte dans 53.6 % des Clasicos, pour une cible de 39 à 49 %.
- Avec, pour chaque club, la formation qui donne le meilleur onze, le Clasico passe
  (48.7 / 27.1 / 24.2 %), et PSG–Toulouse passe ses six critères.
- La suite `season` ne bouge pas (champion 2.03 points par match contre 2.02,
  corrélation réputation / classement 0.45 contre 0.46) : ses manques ont une autre
  cause.

Les sélections nationales partent toutes de la même formation, la première du
tableau (`4-4-2 plat`, `src/core/world/international_selection.py:133`). Leur liste
de 23 suit un gabarit fixe (`ROLES`, même fichier, ligne 16).

Mesures sur les 216 clubs actifs à la création :

| Mesure | Valeur |
|---|---|
| Valeur du meilleur onze, gain moyen sur la formation tirée | 0.57 point par joueur (90e centile 1.24, maximum 2.28) |
| Écart médian entre la meilleure formation et la deuxième | 0.14 point par joueur |
| Clubs dont les deux meilleures formations sont à moins de 0.25 point | 70 % |
| Formation du meilleur onze | 4-4-2 losange 62, 3-5-2 29, 5-3-2 29, 4-2-3-1 28, 4-3-3 20, 5-4-1 20, 4-4-2 offensif 17, 4-4-2 plat 11 |
| Formation qui maximise la qualité d'effectif du mercato (titulaires, rotation, doublures) | 4-3-3 90, 4-2-3-1 72, 4-4-2 losange 18, 3-5-2 12, 5-3-2 8, 4-4-2 plat 7, 5-4-1 6, 4-4-2 offensif 3 |
| Composition de l'IA, une formation | 2.4 ms |
| Composition de l'IA, les huit formations | 14.3 ms |
| Qualité d'effectif du mercato, les huit formations | 7.2 ms par club |

Trois enseignements :

1. **Les formations sont souvent presque à égalité.** Sans marge, un club
   changerait de formation pour un rien : un retour de blessure, une recrue de
   rotation.
2. **Le meilleur onze et le meilleur effectif ne désignent pas la même formation.**
   Le losange tire le meilleur des milieux axiaux, nombreux dans les données ; le
   4-3-3 et le 4-2-3-1 utilisent mieux la profondeur d'un effectif complet.
3. **Recalculer les huit formations à chaque match coûte cher.** Environ 12 ms de
   plus par composition, deux compositions par match, 1 752 matchs : environ
   40 secondes de plus par saison, autant que tout le budget.

## Ce que la formation commande aujourd'hui

La formation sert à deux choses très différentes.

**Jouer** : les onze places du match.

**Compter et évaluer** : elle sert aussi de plan d'effectif.

| Usage | Code | Rôle de la formation |
|---|---|---|
| Composition | `select_lineup`, `src/core/ai/selection.py` | Les onze places du match. |
| Qualité d'effectif, utilité | `squad_roles`, `squad_quality`, `squad_places`, `src/core/ai/market.py` | Le profil d'effectif : les onze places, plus les places de rotation et de doublure réparties selon les postes de la formation. |
| Besoins par poste | `needs_for`, `market.py:130` | L'écart au niveau visé à chaque place du profil. |
| Pénurie | `recruitment_plan`, `market.py:483` | Le nombre de joueurs voulus par poste, qui rouvre un poste déjà renforcé. |
| Réserve, prêts, temps de jeu | `starters_at`, `src/core/world/reserves.py:31` | « Il ne serait pas titulaire » : son rang au poste est au moins le nombre de places de ce poste dans la formation. |
| Renforts de coupe | `cup_lineup`, `src/core/world/cup_matches.py:25` | Le poste du joueur temporaire quand l'effectif manque. |
| Numéros de maillot | `src/core/world/shirts.py:51` | L'ordre des titulaires. |
| Équipe-type, affichage | `club_overview.py:66`, `club_archive.py:198`, `scouting.py:33`, `views.py:485`, `routes.py:195` | La formation montrée, avant le premier match de la saison. |
| Club dirigé | `routes.py:258`, `routes.py:459` | La formation proposée par défaut sur la Composition. |

### Utilité et décomptes

Deux mots reviennent dans la suite.

**L'utilité** est la valeur qu'un club donne à un joueur dans son effectif. Le club
répartit ses joueurs sur les places de son profil d'effectif (onze titulaires, des
places de rotation, des doublures) de la meilleure façon possible. Chaque place est
pondérée : titulaire 1, rotation et doublure moins. La somme est la **qualité
d'effectif**. L'utilité d'un joueur est ce qu'il change à cette qualité :

- **recrutement** : qualité avec lui moins qualité sans lui ; le club ne recrute
  que si le gain dépasse `gain_qualite_min_recrutement` ;
- **prolongation** : le club ne prolonge que si son départ coûterait de la qualité ;
- **vente** : sa place dans la répartition (titulaire, rotation, doublure, hors
  effectif utile) fixe son statut, donc le prix demandé ;
- **besoins** : la place la plus mal tenue désigne le poste à renforcer.

**Les décomptes** sont les questions « combien de joueurs ce poste demande-t-il ? » :
la pénurie qui rouvre un poste, le rang qui envoie un espoir en réserve ou en prêt,
le poste d'un renfort de coupe, l'ordre des numéros. Ils ont besoin d'une seule
formation, précise et stable.

## Principes

1. **La formation d'un club de l'IA est un état, choisi par l'IA.** Elle reste
   stockée dans `Club.formation`, mais n'est plus tirée au hasard : elle est la
   meilleure pour l'effectif, recalculée quand l'effectif change.
2. **Une marge contre les bascules.** Un club garde sa formation tant qu'une autre
   ne fait pas mieux d'au moins `marge_changement` points par joueur.
3. **Recalculer quand l'effectif change, pas à chaque match.** Le coût reste celui
   d'une composition, le jour du match.
4. **Le match peut encore s'adapter.** La règle actuelle reste : si le onze du jour
   met un joueur à un poste totalement étranger (blessures, suspensions),
   l'entraîneur essaie les autres formations pour ce match, sans changer la
   formation stockée.
5. **Une seule définition de la meilleure formation**, partagée par les clubs, les
   sélections et le mercato : une fonction de `src/core/ai/`.

## La formation d'un club de l'IA

### Ce qui est mesuré

La valeur d'une formation est la somme, sur ses onze places, de la meilleure
affectation des joueurs de l'équipe première :

```
valeur à un poste = niveau recalculé avec les poids du poste × affinité au poste
```

Sans forme, ni condition, ni moral : la formation décrit l'effectif, pas l'état du
jour. Sont comptés les joueurs de l'équipe première, hors réserve et hors joueurs
prêtés à un autre club ; un joueur prêté au club compte. Les blessés de longue
durée sont écartés (décision 3).

### Quand elle est recalculée

- à la création de la partie, pour chaque club ;
- après chaque changement de l'effectif de l'équipe première : arrivée, départ,
  prêt, retour de prêt, passage en réserve ou retour, retraite, joueur généré ;
- à la fin d'une blessure de longue durée, et à son début (décision 3).

Un club a peu de tels événements par saison : quelques dizaines au plus, contre une
soixantaine de compositions.

### La marge

La formation change si la meilleure fait mieux que l'actuelle d'au moins
`marge_changement` points par joueur (somme divisée par onze). Avec l'écart médian
mesuré (0.14), une marge de 0.25 garde sa formation à la plupart des clubs après un
mouvement mineur, et la change quand l'effectif change vraiment.

### Les nouvelles de la partie

Un changement de formation d'un club de l'IA peut faire une ligne d'actualité,
comme une arrivée (décision 7).

## Le mercato

Le mercato a besoin des deux : une formation pour les décomptes, un profil pour
l'utilité.

### Options pour l'utilité

**A. La formation actuelle.** Le profil d'effectif reste celui de la formation
stockée. C'est le changement le plus petit, et il ne coûte rien de plus.

- Le recrutement suit la formation, et la formation suit l'effectif : un club en
  losange n'achète jamais d'ailier, donc ne passe jamais au 4-3-3. Les styles se
  figent.
- La marge limite les bascules entre deux formations proches, donc les besoins qui
  changent après chaque transfert.

**B. Un profil neutre**, le même pour tous les clubs, en configuration (par exemple
les proportions de `demographie.cibles_postes`).

- Stable et simple.
- Le recrutement ne voit plus la formation jouée : un club en losange achète des
  ailiers qu'il ne fera pas jouer. On perd la cohérence entre mercato et match.

**C. Le maximum sur les formations.** La qualité d'effectif est la meilleure des
huit formations ; l'utilité d'un joueur est ce qu'il change à ce maximum.

- Cohérent avec le choix de la formation : un joueur vaut ce qu'il apporte au
  meilleur système possible.
- Une recrue qui rend une autre formation meilleure a de la valeur : un club peut
  changer de style par ses achats.
- Coût : huit répartitions au lieu d'une, 7.2 ms par club mesurés à froid. Le cache
  `_assigned` en absorbe une partie, puisque les évaluations d'une même journée
  partagent l'effectif.
- Le maximum porte sur le profil complet (rotation et doublures comprises), qui
  préfère le 4-3-3 et le 4-2-3-1 : un club peut recruter pour un 4-3-3 tout en
  jouant en losange tant que la marge n'est pas franchie. L'arrivée qui rend le
  4-3-3 meilleur le fait basculer.

### Recommandation

**Les décomptes sur la formation actuelle (A), l'utilité sur le maximum (C).**

- Pénurie, réserve, prêts, renforts de coupe, numéros : la formation stockée.
- Recrutement, prolongation, statut de vente, besoins : le maximum sur les
  formations. Les besoins (`needs_for`) se lisent sur la formation qui réalise ce
  maximum.

Repli si le coût de C dépasse le budget de la saison : A seul. Le recrutement fige
alors les styles, mais garde le bénéfice principal, puisque la formation de départ
convient à l'effectif.

## Réserve, prêts, coupe, maillots, équipe-type

Ces usages lisent la formation stockée, comme aujourd'hui. Rien ne change dans leur
règle, seulement d'où vient la formation.

- Réserve et prêts : un joueur dont la formation n'aligne pas le poste « ne serait
  pas titulaire ». Un changement de formation peut donc rendre un espoir éligible à
  la réserve ou en rappeler un : la revue hebdomadaire s'en charge déjà.
- Numéros de maillot : attribués une fois, ils ne sont pas renumérotés à chaque
  changement de formation.
- Équipe-type : inchangée ; avant le premier match, elle part de la formation
  stockée.

## Le club dirigé

- À la création de la partie, sa formation est la meilleure pour son effectif,
  comme pour un club de l'IA : c'est la formation proposée sur la Composition.
- Ensuite, c'est celle que l'entraîneur choisit. L'IA ne la recalcule pas.
- Quand l'IA compose pour lui (il ne compose pas lui-même), elle garde sa formation.
- Son mercato est le sien : l'utilité ne sert qu'aux offres reçues et aux prix de
  l'IA envers lui, comme aujourd'hui.

## Les sélections nationales

### La formation en match

Le sélectionneur choisit la meilleure formation pour les 23 qu'il a convoqués, avec
la même fonction. La formation reste celle de la sélection pour le rassemblement ;
le repli « poste totalement étranger » vaut pour chaque match. Elle est stockée par
sélection, avec la même marge d'un rassemblement à l'autre.

### La liste des 23

Aujourd'hui, le gabarit fixe impose un seul ailier par côté et trois avant-centres
à toutes les sélections, et génère un renfort temporaire là où une nation n'a
personne.

Proposition :

1. **Les candidats** : les joueurs disponibles qui ont choisi la nation, réduits aux
   meilleurs par poste (`vivier_par_poste`, par exemple 6), pour borner le calcul
   dans les grands pays.
2. **La formation** : la meilleure pour ce vivier, au sens de la valeur ci-dessus,
   plus l'aléa de sélection et la forme et la condition (`note` du manuel), avec la
   marge par rapport à la formation du rassemblement précédent.
3. **Le onze** : la meilleure affectation de cette formation.
4. **Les doublures** : trois gardiens au total, puis une doublure par place de
   champ, puis les places restantes (23 − 11 − 2 − 10 = 0 avec onze places ; la
   décision 9 fixe la règle si le nombre ne tombe pas juste), chaque doublure étant
   le meilleur joueur restant à ce poste, polyvalence comprise (affinité au moins
   `affinite_min_liste`).
5. **Les renforts temporaires** ne servent plus que si une place n'a vraiment aucun
   candidat. Une petite nation sans ailier ne joue plus avec un ailier inventé :
   elle choisit une formation sans ailier.

Les retenus d'un rassemblement précédent (`retain`) gardent leur place comme
aujourd'hui ; les places restantes suivent la formation.

### Les binationaux

`preferences()` mesure le retard d'un joueur sur le dernier sélectionnable à son
poste, avec le nombre de places de `ROLES`. Il le mesurera avec le nombre de places
de la formation de la nation (onze places plus les doublures de ce poste). Pour
éviter la circularité (la formation dépend des joueurs qui choisissent la nation),
la formation de référence de chaque nation est fixée une fois par an, à la révision
des forces (`revise_strengths`), sur tous ses joueurs, binationaux compris.

## Ce que l'interface montre

- La formation d'un club, partout où elle apparaît (aperçu, liste des clubs,
  observation de l'adversaire), est sa formation actuelle. Le libellé ne change pas.
- L'équipe-type d'une sélection, avant son premier match, utilise la formation de
  la sélection au lieu du 4-3-3 fixe (`DEFAULT_FORMATION`, `nation_archive.py:162`).
- Le club dirigé : rien ne change sur la Composition, sinon la formation proposée
  au début de la partie.
- Aucun composant nouveau : la charte n'est pas touchée.

## Configuration

Dans `config/formations.json`, un bloc `choix` :

| Clé | Valeur proposée | Rôle |
|---|---|---|
| `marge_changement` | 0.25 | Gain minimal, en points par joueur, pour changer de formation. |
| `blessure_longue_jours` | 30 | Un blessé pour plus longtemps sort du calcul de la formation. |

Dans `config/international.json` :

| Clé | Valeur proposée | Rôle |
|---|---|---|
| `vivier_par_poste` | 6 | Candidats gardés par poste avant l'affectation. |
| `affinite_min_liste` | 0.5 | Affinité minimale d'une doublure (la valeur actuelle du gabarit). |

Les modèles de `src/core/config/models/` reçoivent ces clés à la main, avec la
valeur livrée par défaut ; `consistency.py` vérifie que la marge est positive ou
nulle.

## Mesure

- `match` : relancer à 3 000. Avant implémentation, la maquette donne le Clasico
  et PSG–Toulouse conformes, City–Burnley hors cible (69.1 % de victoires, 12.5 % de
  défaites), équipes égales inchangées.
- `season` : relancer à 10 itérations, pour vérifier qu'elle ne se dégrade pas.
- `economy` et `demography` : relancer sur l'horizon et les graines configurés. À
  surveiller : arrivées par club et par fenêtre, parts par poste, ventes de
  doublures, joueurs en réserve.
- `formations`, `stats_match` : inchangées par construction ; une passe de contrôle.
- Nouveau diagnostic, non bloquant : la répartition des formations des clubs actifs
  à la création et après 15 saisons, et le nombre de changements par club et par
  saison. Il signale une formation qui écraserait les autres ou des bascules trop
  fréquentes.
- Sélections : la part de renforts temporaires dans les listes, avant et après.

## Performance

- Composition du jour : inchangée, une formation.
- Recalcul de la formation d'un club : huit affectations de onze places, sans banc
  ni rotation, à chaque changement d'effectif. À mesurer ; l'estimation est d'une
  à deux millisecondes par recalcul.
- Utilité par le maximum : jusqu'à huit fois le coût actuel du mercato. À mesurer
  sur une saison complète avec I/O, contre la référence du code actuel.
- Liste des 23 : huit affectations par rassemblement et par sélection, sur un
  vivier borné.

## Sauvegardes

Montée de schéma : le prochain numéro libre (41 aujourd'hui).

- Les clubs de l'IA reçoivent leur meilleure formation au chargement, sans marge :
  leur formation tirée n'a pas de valeur à préserver.
- Le club dirigé garde la sienne.
- Les nouvelles clés de configuration entrent dans `MIGRATION_DEFAULTS`.
- Les sélections reçoivent leur formation de référence au chargement.

## Tests

- Choix : un effectif riche en ailiers choisit une formation avec ailiers ; sans
  ailiers, une formation sans ailiers ; la marge garde la formation actuelle sur un
  gain inférieur ; un changement d'effectif qui franchit la marge la change.
- Déterminisme : à effectif égal, même formation, quel que soit l'ordre des joueurs.
- Le club dirigé n'est jamais recalculé.
- Mercato : un joueur qui fait passer la meilleure formation au-dessus de la marge
  a une utilité positive, même s'il n'améliore pas la formation actuelle.
- Réserve : un espoir dont le poste disparaît de la formation devient éligible.
- Sélections : la liste compte 23 joueurs dont trois gardiens ; une nation sans
  ailier ne reçoit pas de renfort d'ailier ; les retenus gardent leur place.
- Sauvegardes : montée 41 sur une sauvegarde 40, formation recalculée pour l'IA,
  conservée pour le club dirigé.
- Référence figée des matchs (`test_engine_golden.py`) : régénérée seulement si
  ses compositions passent par le choix de formation.

## Documentation

- `docs/manuel/06-entraineur.md` : « La formation » décrit le choix par l'effectif
  et la marge, chiffres en `{{config}}`.
- `docs/manuel/10-mercato.md` : le profil d'effectif et la pénurie.
- `docs/manuel/15-selections.md` : « La liste des 23 », « Le onze de la
  sélection », et le retard des binationaux.
- `docs/manuel/16-reserve-et-prets.md` : la formation actuelle du club.
- `docs/ia-gestion.md` : « Utilité et effectif cible ».
- `docs/benchmarks.md` : le diagnostic des formations.
- `migrations/README.md` : la version 41.

## Étapes

Chaque étape laisse les tests au vert et mesure les suites qu'elle touche.

1. **Choix de la formation des clubs.** La fonction partagée, le recalcul sur
   changement d'effectif, la marge, la création et la montée de schéma. Mesure :
   `match`, `season`, diagnostic des formations.
2. **Mercato.** L'utilité par le maximum, ou A seul selon la décision 4. Mesure :
   `economy`, `demography`, temps d'une saison.
3. **Sélections.** La formation en match, la liste des 23, les binationaux.
   Mesure : part de renforts, forces des nations.
4. **Interface et documentation.** Équipe-type des sélections, manuel, `docs/`.

## Avancement

Les dix recommandations sont validées.

### Étape 1, faite

Code : `core.ai.formation` (`best_formation`, `formation_value`), `core.world.formations`
(`formation_events`), l'événement `FormationChosen`, le champ `Club.formation_squad`, la
configuration `formations.choix`, la montée de schéma 41 (`_choose_formations`). Le manuel
(chapitre 06, « La formation »), `docs/ia-gestion.md`, `docs/benchmarks.md`,
`docs/configuration.md` et `migrations/README.md` décrivent la règle.

Ce qui a changé à l'implémentation :

- **Pas d'appel à chaque événement.** Plutôt que de relancer le choix dans chaque
  événement qui touche l'effectif, chaque jour, avant les matches, un club de l'IA dont
  l'équipe première n'est plus celle de `Club.formation_squad` refait son choix. Cela
  couvre aussi la blessure qui passe sous les 30 jours restants, qui ne fait l'objet
  d'aucun événement. La liste est sauvegardée : une partie rechargée refait les mêmes
  choix qu'une partie continue.
- **Tous les clubs**, dormants compris : ils jouent l'Europe et les coupes. Un club
  sans joueur garde la première formation de la configuration.
- **Égalités** : la première formation de la configuration. Un club ne change jamais
  pour une égalité, même avec une marge nulle.
- **Le coût** : la valeur de chaque joueur à chaque poste est calculée une fois et
  partagée entre les huit formations. Un choix coûte 1.85 ms pour un club actif ; la
  vérification quotidienne, 4 à 5 ms pour les 1 826 clubs. Sur 150 jours depuis la
  création (1 229 choix), le choix prend 2.7 % du temps simulé.
- **Décision 7** (l'actualité au changement de formation) : reportée à l'étape 4,
  avec l'interface.

Mesures, graine par défaut :

| Suite | Avant | Après |
|---|---|---|
| `match` (3 000) | 9 critères sur 15 | 12 sur 15 : Clasico 48.7 / 27.1 / 24.2 %, PSG–Toulouse conforme ; restent City–Burnley (69.1 % de victoires, 12.5 % de défaites) et les défaites des équipes égales (32.2 %, inchangé) |
| `season` (10) | champion 2.02, corrélation 0.46, plus fort 0.43 | 2.03, 0.45, 0.40 : inchangée dans le bruit |
| `world`, 2 saisons | — | 0.45 changement de formation par club actif et par saison ; formation la plus jouée : 24 % des clubs actifs |
| `formations`, `stats_match` | — | inchangées par construction : effectifs synthétiques |

À la création, les clubs actifs jouent : 4-4-2 losange 62, 3-5-2 29, 5-3-2 29, 4-2-3-1 28,
4-3-3 20, 5-4-1 20, 4-4-2 offensif 17, 4-4-2 plat 11.

Sur deux saisons du monde, les autres mesures restent proches de la référence du code
précédent, lancée en même temps sur la même graine. `small_club_stars` passe de 27 à 35
(maximum 30) : deux saisons ne suffisent pas à trancher, à revoir avec la suite `economy`
de l'étape 2.

## Décisions

1. **Ce qui définit la meilleure formation.** Le meilleur onze (valeur au poste ×
   affinité), ou le profil complet du mercato (titulaires, rotation, doublures).
   *Recommandation : le meilleur onze.* C'est ce qui joue ; c'est lui qui corrige
   le Clasico. Le profil complet préfère presque toujours le 4-3-3 ou le 4-2-3-1 et
   réduirait la variété.
2. **La marge.** *Recommandation : 0.25 point par joueur*, à revoir avec le
   diagnostic des changements par saison.
3. **Les blessés.** Exclus du calcul au-delà d'une durée, ou toujours comptés.
   *Recommandation : exclus au-delà de 30 jours.* Un club ne change pas de système
   pour une blessure d'une semaine, mais s'adapte à une absence de plusieurs mois.
4. **L'utilité au mercato.** A (formation actuelle), B (profil neutre) ou C
   (maximum sur les formations). *Recommandation : C, avec A en repli si le temps
   d'une saison dépasse le budget.*
5. **Les besoins par poste** sous C : lus sur la formation actuelle ou sur celle
   qui réalise le maximum. *Recommandation : celle qui réalise le maximum*, pour que
   le club cherche les joueurs qui feraient monter sa meilleure formation.
6. **Le choix au match.** Garder le repli « poste totalement étranger » pour le
   match du jour. *Recommandation : oui*, sans changer la formation stockée.
7. **Une actualité au changement de formation.** *Recommandation : oui pour le
   prochain adversaire du club dirigé et ses rivaux de championnat, non pour les
   autres*, pour ne pas noyer les nouvelles.
8. **La formation de référence d'une sélection** pour les binationaux : fixée une
   fois par an, ou à chaque rassemblement. *Recommandation : une fois par an*, à la
   révision des forces.
9. **La composition de la liste des 23** au-delà du onze. Trois gardiens, une
   doublure par place de champ, et les places qui restent aux postes que la
   formation aligne plusieurs fois. *Recommandation : cette règle*, qui tombe juste
   avec onze places (11 + 2 gardiens + 10 doublures).
10. **Le club dirigé à la création.** Sa formation de départ, tirée au hasard ou
    choisie par l'effectif. *Recommandation : choisie par l'effectif*, il peut la
    changer dès la première Composition.
