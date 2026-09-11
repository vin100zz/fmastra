# Moteur de match

Les règles numériques vivent dans `config/moteur_match.json`, `formations.json`,
`implications.json`, `attributs.json`, `etats.json` et `monde.json`. Les valeurs
initiales sont des hypothèses à calibrer, pas une garantie de réalisme.

## Deux moteurs, deux niveaux de détail

`AnalyticalEngine` fournit une référence rapide de distribution des scores.
La force d'une équipe est la moyenne des notes des joueurs affectés aux postes,
avec les états et affinités. À forces égales, partager la moyenne de buts en
ajoutant la moitié du bonus domicile au domicile et en la retirant à l'extérieur.
Multiplier chaque moyenne par l'exponentielle de l'écart de forces signé,
pondérée par `analytique.sensibilite_ecart_force`, puis tirer deux Poisson.

`PossessionEngine` produit événements, statistiques et notes individuelles.
Un écart avec Poisson déclenche une analyse des hypothèses et coefficients des
deux modèles ; ce n'est pas automatiquement un bug du moteur détaillé.

Le résultat analytique indique explicitement l'absence de détail : tirs, xG,
notes et événements inconnus valent `None`, pas zéro. Il ne peut pas remplacer
le moteur détaillé dans une suite qui dépend des minutes, blessures, cartons,
notes ou statistiques individuelles. La performance « 100 saisons analytiques »
concerne calendrier et scores seuls, pas le monde complet avec mercato.

## Chronologie

Deux périodes séparées par une mi-temps. Les possessions consomment une durée
Gamma positive de moyenne configurée (26 secondes au départ). Tirer un temps
additionnel par match, le répartir entre les périodes et ajouter les arrêts
survenus dans chacune ; ne pas ajouter deux fois le même arrêt. Une possession
est limitée au temps restant de la période pour ne pas créer d'événement après
le coup de sifflet. La durée simulée est la somme des durées attribuées aux deux
équipes, ce qui définit la possession temporelle affichée.

À la mi-temps : changer l'engagement, appliquer les changements autorisés et
conserver l'orientation relative des coordonnées. Les fenêtres tactiques à la
mi-temps ne consomment pas les fenêtres de jeu, mais les joueurs remplacés
comptent dans le maximum total. L'IA peut effectuer plusieurs changements dans
une même fenêtre. Un blessé peut sortir dès la première minute.

Mettre à jour la fraîcheur aux paliers configurés, en fractionnant le calcul
si une possession traverse un palier. Recalculer les agrégats sur remplacement,
expulsion, sortie sur blessure, changement de poste ou formation et palier de
fraîcheur. Les effets temporaires de contre se calculent sur les agrégats de
base, puis expirent ; ne jamais les cumuler par erreur de cache.

## Coordonnées

Chaque équipe possède des coordonnées locales : zones de son but vers le but
adverse, couloirs gauche/axe/droite vus dans sa direction d'attaque. La défense
est stockée dans ce même repère local, depuis son propre but.

Pour une attaque en zone `z`, couloir `c`, la défense adverse correspond à la
zone et au couloir **miroirs** : `zones - 1 - z`, `couloirs - 1 - c` en indices
zéro. Ainsi l'aile gauche offensive affronte le côté droit défensif. Le choix
par softmax, les transitions et les joueurs impliqués utilisent tous la même
conversion. Un turnover applique aussi les deux symétries avant toute règle
de contre ou de hauteur de bloc.

Sur une remise en jeu par le gardien après arrêt ou tir non cadré, repartir en
défense ou au milieu bas : sigmoïde du logit de la probabilité de base de relance,
augmenté de sensibilité × (relance du gardien - niveau de référence). Choisir
ensuite le couloir par softmax. Après but ou au début d'une période, engagement
au milieu bas dans l'axe ; le premier engagement est tiré, le second revient
à l'autre équipe. Cette règle donne un effet explicite à l'attribut de relance.

## Qualité, densité et transitions

Implication = poids vertical du poste aligné × poids latéral. La qualité de
zone est la moyenne des composites pondérés par ces implications, après états
et affinités. La note vaut qualité × (densité / référence)^exposant. Une zone
vide vaut zéro, jamais davantage qu'une zone faiblement occupée.

La racine atténue les apports marginaux ; elle n'est pas une saturation bornée.
La note de zone n'est pas nécessairement sur l'échelle [1, 100], contrairement
aux attributs : sa différence combine qualité et densité.

Utiliser le composite de progression pour franchir une zone et le composite
de création pour obtenir une occasion dans la dernière zone. Chaque transition
est une sigmoïde de la différence attaque/défense pondérée par son coefficient.
Le bonus domicile intervient seulement dans la progression du moteur détaillé.
Un échec rend la possession, sauf attribution explicite d'un coup arrêté.

Les tableaux de densités doivent être calculés depuis les JSON, jamais maintenus
à la main. La conservation d'un budget d'implication identique entre tous les
postes n'est pas garantie par les matrices ; vérifier l'équilibre en benchmark.
Aucun bonus de confrontation codé entre formations.

## Couloirs et hauteur de bloc

Choix initial par softmax des écarts de force, utilisant la défense miroir.
Après progression, la probabilité de changer de couloir est la probabilité de
base configurée multipliée par (1 + poids_vision × vision normalisée), bornée
à [0, 1]. Tirer parmi les couloirs adjacents avec le même softmax. La moyenne
proche du tiers est une cible sur scénarios symétriques, pas sur chaque équipe.

Hauteur initiale : écart de forces du onze × sensibilité configurée, plus bonus
domicile éventuel, bornée aux limites de hauteur. Lors d'une récupération, la
probabilité d'avancer la zone de départ d'un cran est la sigmoïde du logit de
`probabilite_recuperation_avancee_base` augmenté de hauteur ×
`bonus_zone_recuperation`. Ne jamais sortir des limites du terrain.

## Turnovers et contres

Une perte près du but du possesseur donne géométriquement une récupération
avancée à l'adversaire. Une perte près du but adverse lui donne une récupération
basse : elle ne doit pas le téléporter directement devant le but opposé.

Après symétrie et effet de bloc, une récupération au moins en zone
`zone_declenchant_contre` démarre un contre. Depuis une zone basse, un tirage
peut lancer une transition rapide : logit de la probabilité configurée, plus
écart des vitesses moyennes × sensibilité, plus hauteur adverse × vulnérabilité.
En cas de succès, avancer d'une zone et marquer le contre.

Le contre applique le malus défensif temporaire au défenseur en repli, dans le
repère converti ; dans le couloir concerné, utiliser le malus spécifique à la
place du malus général, pas en supplément. Le marquage de contre augmente le xG
axial et expire après la durée configurée. Une équipe menée en fin de match
augmente sa hauteur depuis la valeur tactique de base, proportionnellement au
retard et à l'avancement de la période finale ; ne pas réajouter le bonus à
chaque possession. Une expulsion applique la baisse de bloc configurée.

## Occasions, tirs et xG

Les occasions sur une aile sont des centres aboutissant à une tentative de tête ;
les occasions axiales sont des frappes. La probabilité de créer l'occasion
englobe en v1 la réussite préalable du centre. Nommer centreur et réceptionneur
séparément et interdire qu'ils soient la même personne.

Le xG décrit la situation **avant** prise en compte des qualités du tireur et
du gardien : base centre ou frappe, majoration axiale si contre. Il est cumulé
par tentative, même si le tir est non cadré ou arrêté.

- Frappe : composite de tir contre composite d'arrêt.
- Tête sur centre ou corner : composite de tête contre combinaison des
  composites de sortie et d'arrêt du gardien, pondérée dans la configuration.
- Probabilité de but = sigmoïde(logit(xG) + sensibilité × écart des composites).
- Probabilité de cadrage = maximum de la probabilité de but et d'une sigmoïde
  du logit de cadrage de base corrigé du niveau du tireur.
- Un seul tirage catégoriel produit but, arrêt ou non-cadré, avec probabilités
  respectives p_but, p_cadrage - p_but et 1 - p_cadrage.

Borner les entrées du logit aux limites configurées. Un but est un tir cadré,
un arrêt est un tir cadré sans but ; les catégories ne créent pas deux tirs.
Les qualités sont comparées individuellement, jamais diluées dans le onze.

Les corners et coups francs sont des branches de turnover, résolues avec des
probabilités exclusives (leur somme ne peut dépasser 1). Un corner choisit un
receveur parmi les joueurs de champ pondérés par la tête. Un coup franc direct
utilise un tireur pondéré par le composite de tir. Le gardien est nommé.
Les penalties ne sont pas une branche séparée du moteur simplifié v1 ; une
extension devra ajouter attribution, tirage et cibles dédiés ensemble.

## Événements et statistiques

Chaque événement porte seconde de jeu, période, index stable à seconde égale,
équipe, joueurs, zone/couloir et identifiant de possession/tentative si pertinent.
Le journal distingue changement de possession, tentative, issue de tir, corner,
coup franc, faute, carton, blessure, remplacement et fin de période.

Pour un but, la passe décisive est attribuée au dernier passeur nommé de la même
possession, différent du buteur ; pas d'assist sur un coup franc direct ou une
possession sans passeur. Nommer le créateur de la dernière transition réussie
si l'occasion est axiale. Les centres utilisent le centreur comme passeur.

Les minutes proviennent des entrées/sorties, pas du nombre de possessions. Un
joueur entré puis blessé conserve ses minutes. Score, buts, tirs, arrêts et xG
sont déduits des tentatives et issues reliées, sans compter un événement de but
comme une seconde tentative. Les compositions initiales et le banc sont stockés
avant mutation de l'état local.

Notes : base et contributions d'événements dans `notes_joueurs`, puis bornes.
Une expulsion est pénalisée une fois, distinctement des jaunes déjà reçus.
Un joueur sous le minimum de minutes sans but, assist ou expulsion n'est pas
noté ; son absence de note n'est pas un zéro. Ce barème initial doit être
calibré avant d'utiliser les notes comme moteur important de progression/forme.

## Disponibilité et validation

Avant le match, si une équipe n'atteint pas le minimum de joueurs disponibles,
forfait selon la configuration. En cours de match, arrêt si le nombre présent
descend sous ce minimum. Pour un forfait des deux équipes, aucun vainqueur ni
points : statut explicite, exclu des statistiques ordinaires de tirs et buts.
Les cas de gardien absent et de changements épuisés sont décrits dans les états.

Valider les invariants d'événements et les symétries, puis `stats_match`,
`formations`, `match` et `saison`. Les suites de blessures et de monde complet
attendent les mécanismes correspondants. Un benchmark impossible entraîne une
révision documentée du protocole, pas une déformation du moteur pour le réussir.
