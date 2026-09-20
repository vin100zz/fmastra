# Benchmarks

Dernier réglage des matches avec les CSV actuels :
[recalibration du 18 septembre 2026](calibration-2026-09-18.md), après le
[diagnostic du 17 septembre](calibration-2026-09-17.md).
Le réglage améliore les confrontations PSG–Toulouse et City–Burnley ; le Clasico
reste hors cible. Les statistiques synthétiques et l'équilibre des formations
passent les critères mesurés.

## Statut des cibles

Les valeurs de `config/benchmarks.json` sont des **hypothèses de calibrage**.
Elles n'ont pas été établies ici sur un corpus historique sourcé. Elles guident
le développement et peuvent être révisées avec justification ; ne pas forcer
le moteur à satisfaire un ensemble de cibles mathématiquement contradictoires.

Une suite devient bloquante quand ses mécanismes sont implémentés. Avant le
harnais : tests de configuration et d'import. Ensuite : moteur analytique,
statistiques détaillées, formations, résultats, états, puis monde complet.
La comparaison « oracle » est diagnostique et non bloquante.

## Harnais et rapports

Modules dans `src/benchmarks/` : runner, targets, report et suites. Exécuter
par `python -m benchmarks.runner`, avec suite, répétitions, graines, chemin de
rapport et éventuellement balayage d'une clé réelle de config (par exemple
`moteur_match.transitions.k_prog`). Les dossiers de surcharges remplacent les
paramètres selon `docs/configuration.md` ; aucun fichier de base n'est modifié.

Rapports console + JSON + CSV : valeur, taille d'échantillon, cible, intervalle
d'incertitude, tolérance et statut. Conserver graine(s), config effective et
empreinte, hash des effectifs, révision du code, environnement et version du
protocole. Les comparaisons doivent utiliser le même protocole et les mêmes
instantanés, pas les effectifs courants d'une partie après mercato.

Les effectifs de référence sont figés après import et sélection des 30 joueurs,
stockés dans `benchmarks/effectifs/` lors de leur création. Les identifiants
868/886, 679/622 et 1736/1708 désignent les clubs des confrontations configurées.
Un changement de source invalide les instantanés et demande une régénération
explicite. Les noms servent uniquement à l'affichage.

## Suite match

Répéter chaque confrontation, état initial réinitialisé à chaque match, et
comparer les fréquences domicile/nul/extérieur aux cibles propres au scénario.
Ne pas mélanger la perspective du PSG et celle de l'équipe à domicile.
Un intervalle statistique accompagne chaque fréquence ; un résultat proche de
la limite appelle davantage de simulations, pas des changements de paramètres
sur la seule base du bruit d'échantillonnage.

La distribution des scores porte sur un panel fixe de confrontations équilibrées
domicile/extérieur, dont le protocole et les poids figurent dans le rapport.
`ecart_buts_moyen` signifie différence **absolue**. Le score modal est rapporté
comme diagnostic ; un 1-1 fréquent n'est pas à lui seul un échec. Les proportions
de 0-0 et de matches à au moins quatre buts restent des cibles de distribution,
pas une exigence appliquée séparément à chaque affiche très déséquilibrée.

## Suite stats_match

Tirs, buts, xG, cartons et possessions sont des moyennes par équipe et par match
sur le même panel figé, avec niveau moyen calibré et états neutralisés au départ.
Les effets de fatigue pendant le match restent activés. Les blessures et
suspensions n'affectent pas les matches suivants de cette suite.

La possession temporelle et les proportions par couloir sont vérifiées sur un
scénario synthétique **symétrique**, avec alternance des domiciles. Une équipe
ayant une aile plus forte doit pouvoir l'utiliser davantage ; elle n'est pas
contrainte individuellement à un tiers des attaques dans chaque couloir.
L'avantage domicile est la différence moyenne de buts domicile - extérieur
sur les confrontations avec inversion des domiciles.

Le xG est la qualité préalable de chaque tentative, sans qualité du tireur ou
du gardien. Un but compte dans les tirs et tirs cadrés. Le total des possessions
et leurs durées doivent être cohérents avec la durée effective du match.
Mesurer aussi la dangerosité par attaque axiale ou latérale, séparément du volume.

## Suite formations

Toutes les formations configurées contre toutes les autres, avec autant de
matches dans chaque sens domicile/extérieur. Chaque côté reçoit le même vivier
synthétique : attributs identiques (au niveau du scénario, sauf `centre` et `cpa`,
fixés à `AVERAGE_DELIVERY` : un onze moyen, pas des livreurs d'élite, voir
`docs/calibration-2026-09-20.md`), assez de joueurs et affinités identiques
pour les postes testés, afin d'isoler les matrices de formation. Le sélectionneur
ne doit pas introduire un biais de qualité du onze dans ce benchmark.

La matrice contient les taux V/N/D et le **score d'équilibre** :

`(victoires + poids_nul × nuls) / matches`, avec `poids_nul = 0.5`.

Chaque formation vise un score moyen contre le champ entre 0,45 et 0,55.
Le poids des adversaires est uniforme. Cette cible permet les nuls ; l'ancienne
borne de 45 % de victoires ne le permettait pas avec la fréquence prévue de nuls.
Tester aussi la symétrie gauche/droite et la monotonie d'une zone devenue vide.

## Suite saison

Simuler des saisons indépendantes avec états réinitialisés. L'effectif est figé
pour isoler le moteur ; aucun mercato ou changement démographique dans cette
suite. Le moteur détaillé est requis pour les meilleurs buteurs et notes.

Points du champion, du dernier et dispersion : **points par match**, pour rendre
comparables 34 et 38 rencontres. Présenter aussi les points bruts par compétition.
La corrélation est celle de Spearman entre réputation et rang inversé
(nombre de clubs + 1 - rang), avec rangs moyens pour les égalités de réputation.

La cible de domination du meilleur club porte sur les saisons indépendantes de
chaque championnat, pas sur un monde dont la force change après vingt mercatos.
Les références de réputation issues du stade sont synthétiques ; rapporter en
complément la corrélation force du onze / rang inversé pour interpréter un échec.

## Comparaison analytique

Comparer les mêmes affrontements, équipes et états. Rapporter écarts V/N/D,
moyennes et distribution des buts. La comparaison de taux utilise la tolérance
configurée ; ne pas appliquer aveuglément un test continu à des scores discrets.
Un écart signale soit une différence d'hypothèses, soit un mauvais calibrage,
soit un bug. Examiner les deux moteurs. Cette suite ne remplace pas les tests
de symétrie ou de conservation, qui restent bloquants.

## Blessures

Sur des saisons complètes, cumuler blessures en match et hors match. Rapporter
par club/saison, proportion hors match, jours perdus, moyenne quotidienne des
indisponibles et longue durée (> 60 jours). Les cibles proviennent uniquement
du bloc `blessures`, pas d'une seconde cible incompatible par possession.
Rapporter la durée de calendrier couverte pour comparer les résultats.

## Démographie et économie

L'import contient au maximum 30 joueurs par club ; l'IA vise le profil nominal,
qui peut être inférieur. Exclure la phase de stabilisation configurée des
comparaisons de dérive. Après elle, simuler 30 saisons pour la démographie et
25 pour l'économie, sur les graines de monde configurées.

Comparer les moyennes des fenêtres initiale et finale, de largeur configurée,
pour réduire l'effet d'une cohorte exceptionnelle. Actifs, dormants et libres
sont mesurés séparément. Conserver aussi les totaux de créations, retraites et
transferts entre régimes pour vérifier l'identité comptable des populations.

- Effectif actif : stabilité des moyennes et distance à la cible nominale.
- Parts par poste et nation : écarts en points de proportion.
- Niveaux et âges : histogrammes, moyenne et quantiles rapportés ; les critères
  sans seuil numérique configuré restent diagnostiques.
- Élites au-dessus de 85 : tolérance max(relative, absolue) pour éviter une
  division par zéro sur une population initiale nulle.
- Concentration : joueurs actifs de niveau > 80 dans les trois clubs les mieux
  classés du pays, divisés par tous les joueurs > 80 actifs de ce pays. Si le
  dénominateur est nul, rapporter « non applicable », pas zéro réussi.
- Salaires : dérive **cumulative** des moyennes de masse salariale réelle par
  club entre fenêtres, inflation neutralisée. Ne pas accepter 12 % par an.
- Solde négatif permanent : nombre de clubs présentant un solde négatif à la
  clôture du nombre configuré de saisons consécutives. Rapporter aussi les creux.
- Transferts : arrivées définitives par club et fenêtre ; part depuis dormants
  parmi les arrivées ayant un club vendeur (les libres sont une ligne distincte).
- Champions différents : par pays, sur les 25 saisons après stabilisation.

La démographie et l'économie utilisent le monde complet, avec progression,
contrats, minutes, états et événements nécessaires ; pas une substitution du
moteur analytique laissant ces entrées vides. Des tests isolés peuvent employer
un fournisseur de minutes synthétiques, mais ne sont pas la validation finale.

## Performance

Les budgets configurés sont des objectifs à mesurer, pas des garanties avant
implémentation. Fixer machine, versions, mode et nombre de répétitions dans
chaque rapport ; distinguer temps CPU du moteur et temps réel utilisateur.

- Match détaillé : seul calcul de match, hors lecture/écriture.
- Saison complète : monde, IA, 1 752 matches et autosauvegardes inclus ; rapporter
  aussi une mesure sans I/O pour identifier le goulot. L'objectif de 40 secondes
  devra être réévalué si le coût réel des sauvegardes le rend incohérent.
- 100 saisons analytiques : calendriers et scores seuls, sans économie/démographie.
- Chargement : les CSV complets, normalisation, synthèse, sélection, validation.
- Sauvegarde : monde représentatif avec deux saisons de détails et historique,
  y compris compression et écriture atomique, pas uniquement sérialisation.

Éviter de lancer toute la suite de mille saisons détaillées à chaque modification.
Utiliser d'abord les suites affectées, puis les longues validations aux jalons.
