# Recalibration des matches — 18 septembre 2026

Un nouveau réglage global est appliqué dans `config/moteur_match.json`.
Les cibles de `config/benchmarks.json` restent inchangées.
Le réglage améliore les confrontations PSG–Toulouse et City–Burnley, tout en
conservant les statistiques synthétiques et l'équilibre des formations.
Sur 5 000 matches par affiche, **12 critères sur 15 passent, contre 6 avant**.
Le Clasico reste hors cible : ce compromis ne constitue pas une validation
complète du moteur.

## Paramètres retenus

| Paramètre | Avant | Après |
|---|---:|---:|
| `transitions.k_prog` | 0,028 | 0,040 |
| `transitions.k_occ` | 0,023 | 0,030 |
| `occasion.sensibilite_tireur_gardien` | 0,019 | 0,055 |
| `occasion.poids_gardien_sur_tete.sortie` | 0,5 | 0,8 |
| `occasion.poids_gardien_sur_tete.arret` | 0,5 | 0,2 |

Les écarts de qualité influencent davantage la progression, la création
d'occasions et la conversion des tirs. Sur une tête, le composite de sortie
du gardien prend davantage de poids que son composite d'arrêt. Les deux poids
restent normalisés. Les xG de base et le bonus domicile restent identiques.
Ces coefficients s'appliquent à toutes les équipes et compétitions.

## Sélection et protocole

Les essais utilisent des surcharges temporaires, avec les mêmes graines et
compositions pour comparer les réglages. Les premiers balayages utilisent
400 à 600 répétitions par affiche et la graine `20260920`. Le classement
indicatif minimise la somme des carrés des écarts aux cibles V/N/D, chaque
écart étant divisé par sa tolérance. Les statistiques et formations servent
de contrôles supplémentaires ; ce score seul ne décide pas de l'acceptation.

Trois finalistes ont été comparés sur une nouvelle graine, `20260921`, à
2 000 matches par affiche et 3 000 matches synthétiques. Le candidat retenu
(`balanced`) respecte **13 critères de confrontation sur 15** et les huit
critères statistiques. Les deux autres candidats donnent respectivement
11 et 13 critères conformes, avec un écart global aux cibles plus élevé.

Les sources et le code ont évolué depuis le diagnostic du 17 septembre.
La référence avant changement a donc été relancée sur le code et les données
du 18 septembre : 5 000 matches par affiche, graine `20260910`.
Elle retrouve les mêmes fréquences que le diagnostic précédent, soit
6 critères conformes sur 15. La campagne finale utilise les mêmes entrées
et la même graine, avec le nouveau réglage.

Les effectifs restent ceux de l'import initial, graine `20260910`.
Les états de match sont locaux : fatigue, blessures et sanctions ne se
propagent pas entre répétitions. Les paramètres et compositions sont
archivés avec les empreintes des sources et du code de départ.

### Validation finale : 5 000 matches par affiche

Lecture : victoire domicile / nul / victoire extérieur. Les deux campagnes
utilisent la graine `20260910` et les mêmes compositions initiales.

| Affiche | Avant | Après | Critères conformes après |
|---|---:|---:|---:|
| PSG – Toulouse | 66,80 / 20,18 / 13,02 % | 76,64 / 16,58 / 6,78 % | 3/3 |
| Toulouse – PSG | 22,72 / 25,56 / 51,72 % | 12,20 / 21,76 / 66,04 % | 3/3 |
| Man City – Burnley | 63,20 / 20,34 / 16,46 % | 75,10 / 15,68 / 9,22 % | 2/3 |
| Real Madrid – Barcelona | 52,02 / 25,40 / 22,58 % | 55,66 / 26,64 / 17,70 % | 1/3 |
| Équipes égales, niveau 70 | 44,80 / 26,68 / 28,52 % | 44,52 / 25,94 / 29,54 % | 3/3 |

Le score d'écart normalisé passe de 45,47 à 14,64, soit une réduction de
67,8 %. Ce score agrège les 15 fréquences et ne constitue pas un test
statistique indépendant pour chacune d'elles.

Trois critères restent hors cible :

- Défaites de City : 9,22 %, pour un maximum de 9 %. L'intervalle individuel
  approximatif à 95 % est 8,42–10,02 % ; l'écart de 0,22 point reste compatible
  avec le bruit d'échantillonnage. Sur les deux graines regroupées (7 000
  matches), ce taux vaut 8,91 %.
- Victoires du Real : 55,66 %, pour une plage de 39–49 % ; intervalle
  54,28–57,04 %. L'écart est net et **s'aggrave** par rapport aux 52,02 % initiaux.
- Victoires de Barcelona : 17,70 %, pour une plage de 24–34 % ; intervalle
  16,64–18,76 %. L'écart est également net.

Les intervalles utilisent `p ± 1,96 × sqrt(p × (1 − p) / n)` et ne sont pas
des intervalles simultanés. Certaines réussites restent proches d'une borne :
16,58 % de nuls du PSG à domicile pour un minimum de 16 %, et 66,04 % de
victoires à Toulouse pour un maximum de 67 %. La seconde graine donne des
résultats cohérents, présentés ci-dessous.

### Seconde graine : 2 000 matches par affiche

Lecture : victoire domicile / nul / victoire extérieur.

| Affiche | Fréquences | Critères conformes |
|---|---:|---:|
| PSG – Toulouse | 76,25 % / 16,90 % / 6,85 % | 3/3 |
| Toulouse – PSG | 11,95 % / 22,30 % / 65,75 % | 3/3 |
| Man City – Burnley | 75,70 % / 16,15 % / 8,15 % | 3/3 |
| Real Madrid – Barcelona | 54,50 % / 26,10 % / 19,40 % | 1/3 |
| Équipes égales, niveau 70 | 44,65 % / 25,80 % / 29,55 % | 3/3 |

## Statistiques et formations

Les 5 000 matches synthétiques de validation, graine `20260910`, donnent
les moyennes suivantes par équipe et par match, sauf mention contraire :

| Mesure | Valeur | Plage attendue |
|---|---:|---:|
| Possessions | 110,315 | 100–120 |
| Tirs | 13,302 | 12–14 |
| xG | 1,340 | 1,30–1,50 |
| Buts | 1,356 | 1,25–1,45 |
| Jaunes | 2,009 | 1,75–2,25 |
| Rouges | 0,0635 | 0,05–0,08 |
| Avantage domicile, différence de buts | 0,2948 | 0,22–0,38 |
| Part des buts sur coups de pied arrêtés | 25,85 % | 25–30 % |

Les six formations passent sur 5 760 matches (80 répétitions par paire
ordonnée et sens domicile/extérieur, 960 observations par formation).
Le score `(victoires + 0,5 × nuls) / matches` vaut :

| Formation | Score | Plage attendue |
|---|---:|---:|
| 4-4-2 | 0,4922 | 0,45–0,55 |
| 4-3-3 | 0,5260 | 0,45–0,55 |
| 4-2-3-1 | 0,4865 | 0,45–0,55 |
| 3-5-2 | 0,4990 | 0,45–0,55 |
| 5-3-2 | 0,5026 | 0,45–0,55 |
| 5-4-1 | 0,4953 | 0,45–0,55 |

Le coût observé est de 13,74 ms par match synthétique pour un objectif de
20 ms. Des campagnes ont tourné simultanément ; ce n'est pas une mesure
de performance isolée.

## Vérifications et limites

Les 47 tests unitaires et les 31 tests d'intégration des coupes nationales
et européennes passent, dont le déterminisme, la conservation des statistiques,
le terrain neutre et la reprise après sauvegarde.

L'équilibrage du Clasico reste à traiter. Le renforcement de la sensibilité
à la qualité favorise aussi le Real ; le poids des sorties sur les têtes
limite cet effet parmi les candidats testés, sans le supprimer.
Les cibles sont des hypothèses internes, pas des statistiques historiques
certifiées. Les critères non couverts par les suites exécutées restent ceux
décrits dans le [diagnostic initial](calibration-2026-09-17.md#limites-du-contrôle) :
distribution des scores, possession en pourcentage, couloirs et dangerosité
axiale. La saison et le monde complet n'ont pas été revalidés.

La nouvelle configuration s'applique aux **nouvelles parties** et aux
benchmarks relancés. Une sauvegarde existante conserve sa configuration
embarquée ; elle n'est pas migrée automatiquement par cette modification.

## Rapports et reproduction

Les rapports locaux sont dans `reports/`, exclus de Git :

- `calibration-20260918-before-context.json` : configuration de départ,
  compositions et bancs, empreintes du code, de la configuration et des sources.
- `calibration-20260918-before-match.json` et `.csv` : référence avant réglage.
- `calibration-20260918-balanced-match.json` et `.csv` : validation du candidat.
- `calibration-20260918-after-stats.json` et `.csv` : statistiques après réglage.
- `tune-20260918-balanced-formations.json` et `.csv` : tournoi des formations.
- `tune-20260918-finalists-balanced.json` : seconde graine et configuration complète.
- `tune-20260918-finalists-summary.json` : comparaison des trois finalistes.
- `tune-20260918-override-balanced.json` : surcharge retenue.
- `calibration-20260918-before-override.json` : paramètres moteur antérieurs.
- `calibration-20260918-after-config.json` : configuration effective retenue.
- `calibration-20260918-current-inputs-check.json` : vérification finale des
  compositions après correction des noms de l'Inter et de la Lazio dans
  `clubs.csv`. Ces deux libellés changent l'empreinte du CSV mais pas les
  entrées des cinq affiches ; compositions, bancs et états sont identiques
  à ceux archivés pour la campagne.

Révision de base : `03e8f4df72f2b25c6e03bc816f4a5a70b5243e57`.
Empreinte avant :
`09443c752736f691e1b8e7bdef771a83fa371e15be89ed91e2c17671f53d861c`.
Empreinte après :
`9062b3337dd32acd3e38adf0cd70f1c1e8396696b2759dfc41aea20643a020b9`.

Depuis la racine, avec les mêmes données :

```powershell
$env:PYTHONPATH = 'src'
.\.venv\Scripts\python.exe -m benchmarks.runner --suite match --iterations 5000 --seed 20260910 --report reports/calibration-20260918-after-match.json
.\.venv\Scripts\python.exe -m benchmarks.runner --suite stats_match --iterations 5000 --seed 20260910 --report reports/calibration-20260918-after-stats.json
.\.venv\Scripts\python.exe -m benchmarks.runner --suite formations --iterations 80 --seed 20260910 --report reports/calibration-20260918-after-formations.json
.\.venv\Scripts\python.exe -m pytest tests/unit tests/integration/test_cups.py tests/integration/test_europe.py -q
```

La suite `match` renvoie encore le code 1 pour les critères hors cible ;
elle écrit ses rapports normalement.
