# Vérification de la calibration des matches — 17 septembre 2026

La calibration des confrontations de référence reste **non validée** :
6 critères sur 15 passent. Les huit critères statistiques mesurés sur équipes
synthétiques et les six scores d'équilibre des formations passent.
Cette campagne établit un nouvel état des lieux avec les CSV actuels ; aucun
coefficient du moteur ni seuil de réussite n'a été modifié.

## Protocole

- Moteur par possessions : 5 000 matches par affiche, graine `20260910`.
- Réplication : 1 000 matches par affiche, graine `20260911`.
- Statistiques générales : 5 000 matches synthétiques de niveau 70.
- Formations : 80 répétitions par paire ordonnée et sens domicile/extérieur,
  soit 5 760 matches et 960 observations par formation.
- Référence analytique : 5 000 matches par affiche, graine `20260910` ;
  comparaison diagnostique uniquement.
- Même import initial, graine d'import `20260910`, pour toutes les campagnes.
  Les matches utilisent les mêmes compositions initiales et des états locaux ;
  aucun mercato ni report de fatigue, de blessure ou de suspension entre matches.
  Les états des joueurs importés restent ceux de l'import : condition 1,
  forme 1, moral 0,6. Le moral synthétique vaut 0,5.

Les fréquences ci-dessous sont celles des 5 000 répétitions principales.
Les intervalles à 95 % sont individuels et approximatifs :
`p ± 1,96 × sqrt(p × (1 − p) / n)`.
Les cibles restent les hypothèses internes de `config/benchmarks.json`,
pas des fréquences historiques vérifiées.

## Confrontations

Lecture uniforme : victoire de l'équipe **à domicile**, nul, victoire de
l'équipe **à l'extérieur**. Les plages incluent les tolérances configurées.

| Affiche | Victoire domicile | Nul | Victoire extérieur | Critères conformes |
|---|---:|---:|---:|---:|
| PSG – Toulouse | **66,80 %** / 70–80 % | 20,18 % / 16–24 % | **13,02 %** / 2–8 % | 1/3 |
| Toulouse – PSG | **22,72 %** / 10–18 % | 25,56 % / 20–28 % | **51,72 %** / 57–67 % | 1/3 |
| Man City – Burnley | **63,20 %** / 73–83 % | **20,34 %** / 12–20 % | **16,46 %** / 3–9 % | 0/3 |
| Real Madrid – Barcelona | **52,02 %** / 39–49 % | 25,40 % / 23–31 % | **22,58 %** / 24–34 % | 1/3 |
| Équipes égales, niveau 70 | 44,80 % / 41–49 % | 26,68 % / 23–31 % | 28,52 % / 24–32 % | 3/3 |

Les écarts principaux dépassent l'incertitude d'échantillonnage :

| Mesure | Intervalle à 95 % | Plage attendue |
|---|---:|---:|
| Victoires du PSG à domicile | 65,49–68,11 % | 70–80 % |
| Défaites du PSG à domicile | 12,09–13,95 % | 2–8 % |
| Victoires du PSG à Toulouse | 50,33–53,11 % | 57–67 % |
| Victoires de Toulouse à domicile | 21,56–23,88 % | 10–18 % |
| Victoires de City à domicile | 61,86–64,54 % | 73–83 % |
| Victoires de Burnley à l'extérieur | 15,43–17,49 % | 3–9 % |
| Victoires du Real à domicile | 50,64–53,40 % | 39–49 % |

Le taux de nuls de City est seulement 0,34 point au-dessus du plafond ;
son intervalle 19,22–21,46 % recouvre ce plafond. Cet échec isolé ne constitue
pas une preuve d'écart systématique. Les victoires de Barcelona sont proches
de la limite : intervalle 21,42–23,74 %, contre un minimum de 24 %.

La seconde graine confirme le sens des principaux écarts. En regroupant les
deux graines (6 000 matches par affiche), le PSG gagne 66,43 % à domicile et
51,20 % à Toulouse ; City gagne 62,82 % ; le Real gagne 51,92 %.

## Statistiques et formations

Moyennes par équipe et par match, sauf l'avantage domicile et la part de buts.

| Mesure | Valeur | Plage attendue |
|---|---:|---:|
| Possessions | 110,106 | 100–120 |
| Tirs | 13,133 | 12–14 |
| xG | 1,328 | 1,30–1,50 |
| Buts | 1,319 | 1,25–1,45 |
| Jaunes | 1,994 | 1,75–2,25 |
| Rouges | 0,0638 | 0,05–0,08 |
| Avantage domicile, différence de buts | 0,3418 | 0,22–0,38 |
| Part des buts sur coups de pied arrêtés | 26,31 % | 25–30 % |

Les scores `(victoires + 0,5 × nuls) / matches` des formations sont :
4-4-2 : 0,5120 ; 4-3-3 : 0,5177 ; 4-2-3-1 : 0,4823 ; 3-5-2 : 0,5240 ;
5-3-2 : 0,5240 ; 5-4-1 : 0,4875. Tous respectent la plage 0,45–0,55.

Le harnais mesure 13,77 ms par match synthétique, sous l'objectif de 20 ms.
Plusieurs campagnes ont tourné simultanément : ce chiffre décrit cette
exécution et ne constitue pas une mesure de performance isolée.

## Diagnostic pour la prochaine calibration

Les CSV de clubs **et de joueurs** diffèrent de ceux des anciens rapports
`final-match-*.json`. Leurs résultats ne permettent donc pas d'attribuer
l'évolution des taux au seul moteur.

| Équipe | Formation sélectionnée | Force effective du onze |
|---|---|---:|
| PSG | 4-4-2 | 76,07 |
| Toulouse | 4-2-3-1 | 64,62 |
| Man City | 4-2-3-1 | 76,03 |
| Burnley | 4-4-2 | 70,67 |
| Real Madrid | 5-4-1 | 78,62 |
| Barcelona | 4-4-2 | 75,65 |

La force est calculée par `lineup_strength`, avec les postes et états initiaux.
Elle résume le onze ; le moteur détaillé tient aussi compte des attributs par
phase, des gardiens, du banc et des formations.

La cible de City exige davantage de domination que celle du PSG, alors que
son écart de force est inférieur : 5,36 contre 11,46 points. Ce constat invite
à réexaminer la pertinence des cibles pour ces effectifs, sans démontrer à lui
seul leur incompatibilité avec le moteur détaillé.

Sur la seconde graine, les moyennes domicile/extérieur sont :

| Affiche | Buts | xG | Tirs |
|---|---:|---:|---:|
| PSG – Toulouse | 2,013 / 0,804 | 2,168 / 1,036 | 18,730 / 10,563 |
| Toulouse – PSG | 1,058 / 1,573 | 1,386 / 1,712 | 13,660 / 15,329 |
| Man City – Burnley | 1,982 / 0,906 | 1,985 / 1,118 | 17,606 / 11,350 |
| Real Madrid – Barcelona | 1,586 / 1,011 | 1,789 / 1,252 | 16,338 / 12,212 |

Les favoris dominent donc déjà les occasions. L'oracle analytique manque
également les cibles de victoires du PSG et de City : respectivement 63,52 %
à domicile, 49,78 % à Toulouse et 54,34 % pour City.
Il n'est pas une référence validée qui permettrait de corriger automatiquement
le moteur par possessions.

La prochaine étape consiste à stabiliser les effectifs de référence et à
justifier leurs cibles, puis à mesurer la sensibilité aux écarts de qualité
(`k_prog`, `k_occ`, duel tireur/gardien) par surcharges temporaires.
Chaque candidat devra préserver les statistiques générales, l'équilibre des
formations et les résultats à forces égales ; un réglage global destiné à
renforcer les favoris pourrait aussi accentuer l'excès de victoires du Real.

## Limites du contrôle

La suite `stats_match` actuelle utilise uniquement un duel synthétique en
4-3-3. Elle ne réalise pas tout le panel réel décrit dans la spécification.
Les cibles de distribution des scores (0-0, quatre buts ou plus, écart absolu),
de possession en pourcentage, de répartition des couloirs et de dangerosité
axiale ne sont pas évaluées par les suites exécutées. Elles ne sont donc pas
déclarées conformes. La saison et le monde complet n'ont pas été relancés.

Les deux tests de `tests/unit/test_match.py` passent : déterminisme,
non-mutation des entrées, cohérence des événements et statistiques,
conservation du temps, remplacements et symétrie des coordonnées.

## Rapports et reproduction

Les fichiers locaux dans `reports/` sont exclus de Git :

- `calibration-20260917-match.json` et `.csv` : campagne principale.
- `calibration-20260917-replication.json` : seconde graine, moyennes et scores.
- `calibration-20260917-stats.json` et `.csv` : statistiques synthétiques.
- `calibration-20260917-formations.json` et `.csv` : équilibre des formations.
- `calibration-20260917-analytical.json` et `.csv` : référence analytique.
- `calibration-20260917-context.json` : configuration effective, compositions
  complètes et bancs, empreintes SHA-256 des fichiers Python et de configuration
  du répertoire de travail, empreintes des CSV sources, version du protocole.

Révision de base : `59e4a30401a9d67fa229bd3396aa4e1cccbfc8de`.
Le répertoire de travail comporte des modifications non commitées ; les
empreintes archivées complètent donc cette révision. Protocole configuré : 2.

Empreinte de configuration :
`b852594a6e8fe0a1b152eea46abee74bb4ea819721ecb10bc332e1f1dd1dd64b`.

Empreintes des sources :

- `clubs.csv` : `510af17ba94c2117d59753ae72600db1bed1493df493c5cc72195791b56e9494`
- `players.csv` : `64ce459dcb90a295c490ba8a9736a71a7fd52fe78bc2140403cbce24b527f44c`
- `nations.csv` : `97ac1c4a3c3d8a9e3fbd2f5eb86026142f78d047c70d78cade1290b6e6d35fb0`

Depuis la racine du dépôt, avec les mêmes sources et configuration :

```powershell
$env:PYTHONPATH = 'src'
.\.venv\Scripts\python.exe -m benchmarks.runner --suite match --iterations 5000 --seed 20260910 --report reports/calibration-20260917-match.json
.\.venv\Scripts\python.exe -m benchmarks.runner --suite match --iterations 1000 --seed 20260911 --report reports/calibration-20260917-second-seed.json
.\.venv\Scripts\python.exe -m benchmarks.runner --suite stats_match --iterations 5000 --seed 20260910 --report reports/calibration-20260917-stats.json
.\.venv\Scripts\python.exe -m benchmarks.runner --suite formations --iterations 80 --seed 20260910 --report reports/calibration-20260917-formations.json
.\.venv\Scripts\python.exe -m benchmarks.runner --suite analytical --iterations 5000 --seed 20260910 --report reports/calibration-20260917-analytical.json
.\.venv\Scripts\python.exe -m pytest tests/unit/test_match.py -q
```

Le code de sortie 1 de la suite `match` correspond aux critères hors cible ;
la campagne se termine et écrit ses rapports normalement.
