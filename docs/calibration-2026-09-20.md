# Traits du joueur et livraison — 20 septembre 2026

Cinq changements de données joueur, mesurés sur le moteur avant et après :

1. `fragility` lue dans `InjuryProneness` (au lieu d'un tirage uniforme) ;
2. `ego` lu dans `Ambition` (idem) ;
3. `aggression`, trait stable lu dans `Aggression` et `Dirtiness`, qui pèse dans le tirage
   du joueur fautif ;
4. attribut `centre` (`Crossing`) : xG de la tête qui suit un centre ;
5. attribut `cpa` (moyenne de `Corners` et `FreeKicks`) : tireur et xG des corners, tir des
   coups francs directs.

Règles : `docs/attributs.md`. Sauvegardes : `migrations/README.md` (v12).

## Pourquoi ces cinq-là

53 % des buts venaient d'actions où l'exécutant ne comptait pas (centres 26 %, corners
22 %, coups francs 4 % ; le reste des frappes axiales). Le poids de `tacle` sur les
cartons valait au plus +0,6 %, donc aucun joueur n'était plus sanctionné qu'un autre, et
les gardiens recevaient 9 % des jaunes (poids 0,90 dans la matrice défensive de la zone
basse). Les 13 attributs expliquaient déjà 85 % du CA : les colonnes ajoutées apportent du
style, pas du niveau.

## Niveaux de référence

Une modulation ne doit pas déplacer les taux moyens calibrés. Les références sont des
qualités **effectives** (attribut × fraîcheur × forme × moral × affinité), mesurées sur
de vrais effectifs (24 clubs d'un championnat, toutes les paires, ~1 100 matches) :

| Paramètre | Valeur | Origine |
|---|---:|---|
| `niveau_reference_centre` | 45,6 | moyenne des centreurs 44,6, plus 1 pour la convexité du logit |
| `niveau_reference_cpa` | 55,3 | moyenne du meilleur `cpa` du terrain 54,5, plus 0,8 |
| `niveau_reference_coup_franc` | 58,8 | calé pour que la conversion des coups francs reste à 3,3 % |
| `sensibilite_livraison` | 0,02 | choisie : environ ±25 % de xG pour un écart-type |

Le centreur moyen (44,6) est très en dessous des attributs de ses coéquipiers parce que
le centreur est tiré selon l'implication latérale : ce n'est pas toujours un latéral.

Conversion des notes source en traits, sur une échelle qui garde les moyennes :
fragilité 2,3 / 8,3 / 14,3 → 0,6 / 1,2 / 1,8 ; ego 8,4 / 12,4 / 16,4 → 0 / 0,5 / 1 ;
agressivité 4 / 10,5 / 17 → 0,25 / 1 / 2. Population importée : fragilité 1,206 (uniforme :
1,2), ego 0,473 (0,5), agressivité 0,99.

## Mesures : vrais effectifs

3 graines × 2 208 matches par version, mêmes compositions :

| Mesure par match | Avant | Après |
|---|---:|---:|
| Buts | 2,814 | 2,840 (+0,9 %) |
| Avantage domicile (buts) | 0,343 | 0,342 |
| Buts sur frappe axiale / centre / corner / coup franc | 1,355 / 0,723 / 0,619 / 0,117 | 1,373 / 0,726 / 0,627 / 0,114 |
| Part des buts sur CPA | 26,1 % | 26,1 % |
| Jaunes / rouges | 4,23 / 0,131 | 4,13 / 0,133 |
| Blessures | 0,737 | 0,714 |
| Part des jaunes du gardien | 9,2 % | 0 % |

Toutes les variations sont dans la dispersion entre graines, sauf le gardien, qui ne
commet plus de faute tant qu'il reste un joueur de champ. Les jaunes baissent de 2 % : les
joueurs agressifs sont tirés plus souvent, donc plus souvent déjà avertis, ce qui réduit
la probabilité d'un nouveau carton (`booked_caution_multiplier`).

## Mesures : suites du projet

Mêmes graines et paramètres qu'avant, ancien code (`HEAD`) contre nouveau :

| Suite | Avant | Après |
|---|---:|---:|
| `stats_match` (5 000 matches) | 7 / 8 | 7 / 8 |
| `formations` (80 répétitions) | 6 / 6 | 6 / 6 |
| `match` (10 000 par affiche) | 10 / 15 | 9 / 15 |

Le critère de `stats_match` qui échoue (`goals`, 1,58 puis 1,61 pour 1,25–1,45) échouait
déjà : le moteur a dérivé depuis le 18 septembre, indépendamment de ce travail. Dans
`match`, un critère bascule : défaites de City contre Burnley, 8,90 % → 9,63 % pour un
maximum de 9 %. L'écart est de 1,8 écart-type et son signe n'est pas cohérent entre les
affiches (les favoris gagnent plus pour PSG–Toulouse, moins pour City–Burnley) : c'est du
bruit autour d'une borne qui était déjà à 0,1 point.

## Équipes synthétiques

`synthetic_lineup` met tous les attributs au niveau du scénario. Avec `centre` et `cpa` à 70
(contre des moyennes réelles de 45 et 55), chaque équipe synthétique aurait eu des
livreurs d'élite : +7 % de xG, part de CPA à 24 %. Les benchmarks passent donc
`delivery=AVERAGE_DELIVERY` (`centre` 54,7 et `cpa` 67,7 bruts, soit la qualité de
référence une fois la fatigue appliquée, moyenne mesurée à 0,82). Les tests gardent le
fixture d'origine. Le coup franc des équipes synthétiques convertit 4,5 % contre 6,2 %
avant : l'ancien fixture donnait à son tireur une qualité de tir de 70, très supérieure à
celle d'un vrai tireur, et la part de CPA passe de 27,3 % à 25,5 % (cible 25–30 %).

## Ce que valent ces attributs

Deux équipes synthétiques identiques, dont l'une est meilleure d'environ un écart-type
(+14 bruts, soit 11,5 effectifs) sur toute la ligne, 8 000 matches, domiciles alternés.
La finition sert de repère : c'est le levier le plus fort du moteur.

| B meilleur en | Buts de B − buts de A par match | Score de B (V = 1, N = 0,5) |
|---|---:|---:|
| rien (contrôle) | +0,001 | 0,499 |
| `centre` | +0,061 | 0,508 |
| `cpa` | +0,124 | 0,526 |
| `centre` et `cpa` | +0,193 | 0,540 |
| `finition` (repère) | +0,369 | 0,576 |

`cpa` pèse environ un tiers de la finition et `centre` un sixième ; le score a un
écart-type de 0,005. Pour `centre`, +1 écart-type sur tous les joueurs de l'équipe
donne 2 % de buts en plus, ce qui est peu : `sensibilite_livraison` (0,02) le règle
si l'on veut plus de poids (0,04 le doublerait, au prix de `cpa` aussi).

## Limites

- Les sauvegardes existantes gardent `poids_agressivite_tacle` à 0,006 : devenu exposant,
  il rend l'agressivité neutre pour elles. Elles gardent aussi leur fragilité et leur ego
  tirés au hasard ; seuls `centre` et `cpa` sont relus (fichier source) ou estimés.
- Les références ont été mesurées sur un seul championnat de 24 clubs. Le niveau d'élite
  (livreurs de 65–70 en `cpa`) gagne quelques points de xG au-dessus de la référence :
  c'est voulu, mais non validé sur les championnats les plus forts.
- `aggression` n'a pas d'effet sur la force d'une équipe : elle répartit les cartons
  (donc les suspensions), ce que `tests/unit/test_player_traits.py` vérifie.

## Reproduction

```powershell
$env:PYTHONPATH = 'src'
.\.venv\Scripts\python.exe -m benchmarks.runner --suite stats_match --iterations 5000 --seed 20260910
.\.venv\Scripts\python.exe -m benchmarks.runner --suite formations --iterations 80 --seed 20260910
.\.venv\Scripts\python.exe -m benchmarks.runner --suite match --iterations 10000 --seed 20260910
```
