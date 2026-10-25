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

Deux périodes séparées par une mi-temps. Une possession gagnée en jeu commence
aussitôt ; après un arrêt (touche, six mètres, coup franc, hors-jeu, ballon capté,
but), le ballon reste arrêté pendant une durée Gamma de moyenne propre à l'arrêt
(`arrets.temps_mort`, voir `possession.RESTARTS`). Un arrêt à l'intérieur de la
possession (faute subie, touche gagnée, corner, coup franc, penalty, carton) avance
l'horloge de la même façon, hors du temps de possession. La possession avance
ensuite l'horloge de la durée de chacune de ses actions
(`actions.durees_secondes`), et chaque événement porte la seconde de son action.
`possession_seconds` ne compte que ces actions : la possession affichée est la part
du temps de jeu effectif. La fatigue s'intègre après la possession, de son début à
sa fin, en tranches coupées à chaque palier de recalcul des notes : les notes d'une
possession datent du dernier palier qui la précède.

Tirer un temps additionnel par match, le répartir entre les périodes et ajouter
les arrêts survenus dans chacune ; ne pas ajouter deux fois le même arrêt. Aucune
possession ne commence après la fin de la période ; commencée, elle va à son terme,
sauf que l'arbitre siffle à la première passe de conservation jouée après la fin.

À la mi-temps : changer l'engagement, appliquer les changements autorisés et
conserver l'orientation relative des coordonnées. Les fenêtres tactiques à la
mi-temps ne consomment pas les fenêtres de jeu, mais les joueurs remplacés
comptent dans le maximum total. L'IA peut effectuer plusieurs changements dans
une même fenêtre. Un blessé peut sortir dès la première minute.

### Utilisation du banc

Les blessures et les seuils de fatigue restent prioritaires. À partir de la
55e minute, l'IA peut aussi changer un titulaire pour améliorer le niveau
effectif de l'équipe, donner des minutes à un joueur sous-utilisé ou développer
un jeune. Ces motifs peuvent déclencher un changement avant les seuils de
fatigue. Le gardien ne fait pas l'objet d'une rotation ordinaire.

Avant le match, le déficit de temps de jeu compare les minutes de la saison aux
attentes liées au rang du joueur à son poste, comme pour le moral (depuis son
arrivée pour un joueur venu en cours de saison). Sans match déjà disputé, aucun
déficit n'est inventé. La priorité de développement dépend
de l'âge, de la marge au potentiel **estimé par le club**, des minutes du mois
et de la préférence du club pour les jeunes. Ces priorités servent aussi à
choisir le banc parmi des joueurs de niveau comparable, avec un gardien de
réserve et une recherche de couverture des postes. Elles ne modifient pas le
choix des titulaires.

En match, le gain de niveau effectif tient compte de la fraîcheur. Les bonus
de temps de jeu pèsent pleinement avec au moins deux buts d'avance, pour moitié
dans un match à égalité ou avec un but d'avance, et pour un quart lorsque
l'équipe est menée. Un avantage confortable autorise une baisse sportive
limitée ; autrement, le changement doit au moins maintenir le niveau effectif.
L'écart avec le titulaire reposé et l'affinité au poste limitent les choix.

Les rotations sont regroupées par deux au maximum, espacées d'au moins dix
minutes, et doivent laisser au moins quinze minutes réglementaires à jouer.
Une entrée récente n'est pas annulée pour donner du temps de jeu à quelqu'un
d'autre ; une blessure ou une fatigue critique peut néanmoins justifier sa
sortie. Les urgences ne sont pas limitées par cette taille de groupe ou ce
délai. Le plafond de cinq joueurs et les trois fenêtres restent applicables.
Il n'existe pas de quota minimal de changements. Tous les coefficients sont
dans `etats.remplacements` ; les sauvegardes antérieures reçoivent les nouveaux
paramètres par défaut au chargement.

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

Une possession est une suite d'actions (`possession.play_possession`). À chaque
pas, un seul tirage uniforme décide de tenter (avec la probabilité du tempo de la
zone, `actions.tempo_par_zone`, ou `tempo_contre`), de réussir une passe de
conservation ou d'être intercepté. Le tempo est attiré par l'**ouverture** :
chaque passe de conservation réussie ajoute `ouverture.gain_par_passe` au logit
des tentatives suivantes, jusqu'à `ouverture.max`, et le tempo monte de
`attrait_ouverture` × ouverture ÷ maximum vers 1. Une passe de conservation peut
changer de couloir ou revenir d'une zone ; elle met fin au contre.

L'**avantage à la conservation** est l'écart de progression de l'attaquant à
l'endroit du ballon moins celui du défenseur au même endroit de son propre camp :
nul entre équipes égales, quelles que soient les formations. La passe de
conservation réussit à sigmoïde(`biais_par_zone` + `sensibilite` × avantage), et
le tempo perd `patience` × avantage en logit. C'est ce qui donne la possession à
l'équipe la plus forte ; les écarts bruts, structurellement positifs dans son camp
et négatifs devant le but adverse, n'y suffisent pas.

Une tentative tire un porteur parmi les joueurs impliqués : ses attributs
décident de ce qu'il tente (long ballon selon `passe`, frappe de loin selon
`finition`), jamais de la réussite. Utiliser le composite de progression pour
franchir une zone, ou deux sur un long ballon, et le composite de création pour
obtenir une occasion dans la dernière zone. Chaque transition est une sigmoïde de
la différence attaque/défense pondérée par son coefficient, plus l'ouverture.
L'étiquette d'une progression (passe, conduite, dribble) se tire sur le flux des
notes. Le bonus domicile intervient seulement dans la progression du moteur
détaillé. Un échec rend la possession, sauf attribution explicite d'un coup
arrêté ; une interception sur une passe de conservation et un long ballon perdu ne
donnent ni coup arrêté ni carton.

Les écarts ne changent qu'au recalcul des notes : `zones.gap` les met en cache par
côté, phase, contre, zone et couloir, contre les révisions des deux équipes.
`refresh` garde pour une même composition (`Layout`) les composites de chaque
joueur, son état sans la fraîcheur, les poids d'implication de chaque case et
leurs poids cumulés, dont `involved_player` et `credited` tirent par dichotomie ;
la fatigue garde le coût d'une minute de chaque joueur à son poste.

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

Seul un ballon gagné en jeu peut lancer un contre ; une touche, un six mètres, un
coup franc ou un hors-jeu repartent là où le jeu s'est arrêté (le six mètres par
la relance du gardien), sans contre. Après symétrie et effet de bloc, un tirage
décide du contre : logit de `probabilite_contre_par_zone` à la zone du
récupérateur, plus `bonus_contre_attaque_engagee` si le ballon est perdu sur une
tentative ou dégagé de la surface, plus `malus_contre_jeu_long` sur un long ballon
perdu, plus `malus_contre_gardien` sur un ballon capté par le gardien (qui relance
comme après un tir), plus écart des vitesses moyennes × sensibilité, plus hauteur
adverse × vulnérabilité. En cas de succès depuis le milieu bas ou le milieu haut,
l'équipe qui a perdu le ballon l'arrête d'une faute tactique avec la probabilité
`arrets.faute.faute_tactique` × l'agressivité de ses joueurs à cet endroit : coup
franc court, sans contre. Sinon, avancer d'une zone et marquer le contre. Un ballon
dégagé donne le ballon au défenseur dans sa zone, sans récupération avancée. Le
contre prend fin à la première passe de conservation.

Le contre applique le malus défensif temporaire au défenseur en repli, dans le
repère converti ; dans le couloir concerné, utiliser le malus spécifique à la
place du malus général, pas en supplément. Le marquage de contre augmente le xG
axial et expire après la durée configurée. Une équipe menée en fin de match
augmente sa hauteur depuis la valeur tactique de base, proportionnellement au
retard et à l'avancement de la période finale ; ne pas réajouter le bonus à
chaque possession. Une expulsion applique la baisse de bloc configurée.

## Occasions, tirs et xG

Le porteur de la dernière zone choisit ce qu'il tente avant le duel de création
(`actions.creation`) : dans l'axe une frappe dans la surface (`shot`), un dribble
(`dribble`) ou une passe en profondeur (`through_ball`, plus probable avec
l'ouverture et en contre) ; sur une aile un centre aérien (`cross`, plus probable
avec l'attribut `centre`) ou un centre en retrait (`cutback`). Au milieu haut dans
l'axe, une tentative peut être une frappe de loin (`long_shot`), sans duel de
création. La probabilité de créer l'occasion englobe la réussite préalable du
service. Le tireur est tiré dans l'axe de la dernière zone, autre que le passeur
sur un centre ou une passe en profondeur ; sur un dribble ou une frappe de loin,
c'est le porteur. Nommer passeur et tireur séparément.

Le xG décrit la situation **avant** prise en compte des qualités du tireur et
du gardien : base du type d'occasion, majorée en contre pour la frappe dans la
surface et la passe en profondeur, corrigée par le service pour un centre aérien
ou en retrait. Il est cumulé par tentative, même si le tir est non cadré ou arrêté.

- Frappe, dribble, centre en retrait, frappe de loin : composite de tir contre
  composite d'arrêt.
- Passe en profondeur : composite de tir contre une combinaison des composites de
  sortie et d'arrêt (`poids_gardien_face_a_face`).
- Tête sur centre ou corner : composite de tête contre combinaison des
  composites de sortie et d'arrêt du gardien, pondérée dans la configuration.
  Le xG de l'action dépend de sa livraison : qualité du centreur (`centre`) ou du
  tireur de corner (`cpa`), voir `docs/attributs.md`.
- Probabilité de but = sigmoïde(logit(xG) + sensibilité × écart des composites).
  Les composites sont multipliés par l'état, sans la fraîcheur du tireur : le
  gardien se fatigue à peine (facteur gardien de `etats.fatigue`), et un tireur
  fatigué face à lui rendait les buts de plus en plus rares au fil du match.
- Probabilité de cadrage = maximum de la probabilité de but et d'une sigmoïde
  du logit de cadrage de base corrigé du niveau du tireur.
- Un seul tirage catégoriel produit but, arrêt ou non-cadré, avec probabilités
  respectives p_but, p_cadrage - p_but et 1 - p_cadrage.

Borner les entrées du logit aux limites configurées. Un but est un tir cadré,
un arrêt est un tir cadré sans but ; les catégories ne créent pas deux tirs.
Les qualités sont comparées individuellement, jamais diluées dans le onze.

## Arrêts de jeu

Une action ratée (`_Play.failed`) ou une passe de conservation manquée finit, sur un
seul tirage du flux du match, en faute, ballon sorti, hors-jeu ou ballon perdu en
jeu (`arrets.faute`, `arrets.sortie`, `arrets.hors_jeu`). La réussite de l'action
était déjà décidée par les zones.

- **Faute** : `part_par_action` × l'agressivité moyenne des défenseurs impliqués
  (cache `Layout.aggression`, mêmes poids que `foul_committer`), × exp(`sensibilite_ecart`
  × l'avantage de l'attaque là où l'action échoue, le même que pour la conservation, nul
  entre équipes égales), × `facteur_surface` si l'action de la zone de vérité a lieu
  dans la surface (`part_surface`). Une faute ne tombant que sur une action ratée, un
  favori qui rate moins en subirait sinon moins que son adversaire. Le fautif
  est tiré par `foul_committer`, le joueur fauché est le porteur. En défense et au
  milieu bas, coup franc court : la possession continue sur place, ouverture à zéro,
  sans contre. Au milieu haut et dans la zone de vérité, coup franc frappé (tir
  `free_kick`) ou centré (`crossed_free_kick`) selon `arrets.coup_franc` ; dans la
  surface, penalty. Une faute de l'attaquant dans un duel aérien donne un coup franc
  court à la défense.
- **Sortie** : touche pour la défense (passe sortie, restart `throw_in`), pour
  l'attaque (tacle qui sort le ballon : la possession continue), corner, six mètres.
  Le gardien capte une part des centres, plus s'il sort bien (`sensibilite_sorties`).
- **Hors-jeu** : une part des passes en profondeur ratées et des longs ballons
  perdus dans la zone de vérité ; coup franc court pour la défense.

Un **corner** vient d'un tir contré, d'un arrêt détourné, d'une action ratée de la
zone de vérité ou d'un coup franc centré dégagé ; il se joue en tête, dégagement,
prise du gardien ou corner à deux (`arrets.corner`), la possession continuant alors
au coin de la surface. Le tireur de corner et de coup franc est le meilleur `cpa`
du terrain, gardien exclu ; la tête est reprise par un autre joueur de champ
pondéré par la tête ; son xG dépend du `cpa` du tireur, pour un corner comme pour un
coup franc centré. Un coup franc direct est frappé par le spécialiste avec son
propre composite de tir, majoré des points de `cpa` au-delà de la référence.

Le **penalty** est tiré par le meilleur tireur de séance présent (moyenne finition
et sang-froid) et réussit selon la règle des tirs au but, en configuration
(`penalty`, `shots.penalty_probability`) et partagée avec `cup_matches.decide_winner` ;
son xG est la réussite de base. Raté, il est arrêté, sauf `part_rates_hors_cadre`.

**Après un tir** (`arrets.apres_tir`), le même tirage uniforme décide d'un tir
contré (`part_contres`, `part_contres_de_loin` ; jamais une tête ni un penalty)
puis du poteau (`part_poteaux` des autres tirs à côté). Un arrêt est capté,
détourné en corner ou repoussé ; un tir contré va en corner ou laisse un second
ballon à l'attaque (la possession continue) ou à la défense ; un ballon repoussé
ou revenu du poteau donne une reprise (`rebound`) ou un dégagement. Un but marqué
dans une possession qui a eu un corner, un coup franc frappé ou centré ou un penalty
compte comme but sur coup de pied arrêté.

## Événements et statistiques

Chaque événement porte seconde de jeu, période, index stable à seconde égale,
équipe, joueurs, zone/couloir et identifiant de possession/tentative si pertinent.
Le journal distingue changement de possession, série de passes, tentative, issue de
tir, corner, coup franc, faute, carton, blessure, remplacement et fin de période.
Une série de passes de conservation est un seul événement `circulation`, à la zone
et au couloir où elle finit, de détail le nombre de passes ; personne n'y est nommé.
`progress` porte en détail `pass`, `carry`, `dribble` ou `long` (un ancien
`progress` sans détail se lit comme une passe), `turnover` `interception`, `tackle`,
`aerial`, `clearance` ou `claim` (le gardien capte), `delivery` le type d'occasion
qu'un passeur a servie. `foul` nomme le fautif et le joueur fauché, dans le repère
du fautif (`tactical` pour une faute qui arrête un contre) ; `free_kick` porte
`short`, `crossed` ou `direct` ; `corner` sa cause (`cross`, `clearance`, `save`,
`blocked`) ; `save` `held`, `corner` ou `parried` ; `off_target` `blocked`, `post` ou
rien. `penalty`, `throw_in` et `offside` marquent les arrêts correspondants. Le
monde ne stocke pas les changements de possession, séries de passes, progressions,
services, pertes de balle, corners, coups francs, fautes, penaltys, touches ni
hors-jeu (`TRANSIENT_EVENT_KINDS`), sauf pour les possessions qui finissent sur un
tir (`REPLAY_EVENT_KINDS`) et la perte de balle ou la faute qui précède l'une
d'elles, que le résumé montre.

`TeamStats.passes` et `passes_attempted` comptent passes de conservation,
progressions de type passe et longs ballons ; `fouls` et `offsides` les fautes
commises et les hors-jeu ; `free_kicks` les coups francs frappés ou centrés. Les
compteurs ajoutés valent `None` pour un match joué avant qu'ils existent.

Pour un but, la passe décisive est attribuée au dernier passeur nommé de la même
possession, différent du buteur ; pas d'assist sur un coup franc direct ou une
possession sans passeur. Nommer le créateur de la dernière transition réussie
si l'occasion est axiale. Les centres utilisent le centreur comme passeur.

Les minutes proviennent des entrées/sorties, pas du nombre de possessions. Un
joueur entré puis blessé conserve ses minutes. Score, buts, tirs, arrêts et xG
sont déduits des tentatives et issues reliées, sans compter un événement de but
comme une seconde tentative. Les compositions initiales et le banc sont stockés
avant mutation de l'état local.

Cartons : un carton ne tombe que sur une faute, à son auteur, tiré selon son
implication défensive multipliée par `agressivité ** poids_agressivite_tacle`
(gardien exclu tant qu'il reste un joueur de champ). Ses chances dépendent de la
faute (`cartons.par_faute`, `faute_tactique`, `penalty`) et des avertissements déjà
reçus. Le fautif n'est pas le joueur nommé sur une perte de balle, tiré à part
(ci-dessous).

## Notes des joueurs

Les agrégats de zone décident si une action réussit ; la note décide seulement
à qui elle est attribuée. Ces attributions utilisent un flux aléatoire dérivé
de celui du match sans y puiser (`side_stream`) : changer le barème ne change
ni un score, ni un tir, ni une minute.

Le joueur crédité est tiré parmi ceux impliqués dans la zone, pondérés par
exp(± `sensibilite_qualite` × composite de la phase) : les meilleurs sont plus
souvent nommés sur une réussite, les plus faibles sur un échec. Le composite
retient forme, moral et poste mais pas la fraîcheur : les zones font déjà perdre
le ballon à une équipe fatiguée, et un remplaçant frais ne doit pas être gonflé.
`refresh` précalcule ces profils avec les agrégats ; ils ne valent qu'après
chaque changement sur le terrain, comme eux.

- Progression : le porteur déjà nommé par le moteur reçoit `progression_par_zone`
  de la zone atteinte. Quand il dribble (l'étiquette se tire sur le flux du match,
  car une conduite attire plus de fautes : `actions.part_dribbles`,
  `sensibilite_dribble`), il élimine un défenseur, nommé en second sur l'événement
  `progress` (`detail` = `dribble`), qui reçoit `defenseur_elimine`.
- Perte de balle : un récupérateur et un perdant sont nommés sur `turnover`,
  crédités de `recuperation_par_zone` et `perte_par_zone`, chacun dans son
  propre repère : récupérer devant son but vaut plus, perdre devant le sien coûte plus.
- Occasion en jeu : `passe_cle` au passeur ou centreur, `participation_occasion`
  aux autres porteurs de l'action.
- Tir : `tir_cadre_sans_but` ou `tir_non_cadre` au tireur. Une frappe contrée
  (décidée par le moteur, voir « Arrêts de jeu ») nomme le défenseur sur
  `off_target` (`detail` = `blocked`), crédité de `contre`. Un but coûte
  `but_encaisse_gardien` au gardien et `defenseur_battu` à un défenseur de champ,
  sauf sur penalty.
- Faute : `faute` au fautif ; sur un penalty, `penalty_concede` au fautif et
  `penalty_obtenu` au joueur fauché ; `penalty_manque` au tireur qui le rate,
  `penalty_arrete` au gardien qui l'arrête ; `hors_jeu` au joueur hors-jeu.
- Buts, passes décisives, arrêts et cartons gardent leur barème.
- Résultat : `victoire` en plus ou en moins, au prorata des minutes. Sans but
  encaissé, `sans_encaisser` au joueur d'au moins `minutes_sans_encaisser`
  minutes, pondéré par l'implication défensive de son dernier poste dans sa
  propre zone : pleinement au gardien, pas du tout à l'attaquant.
- Chaque minute retire `attendu_par_minute` : un joueur qui apporte ce qu'on
  attend de ses minutes reste à la base, et la moyenne ne dérive pas.

Les crédits s'accumulent pendant le match ; la note en direct et la note finale
sont la même fonction. Une expulsion est pénalisée une fois, distinctement des
jaunes déjà reçus. Un joueur sous le minimum de minutes sans but, assist ou
expulsion n'est pas noté ; son absence de note n'est pas un zéro. La note nourrit
la forme : `stats_match` vérifie que chaque poste reste centré sur la base.

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
