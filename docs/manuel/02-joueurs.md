# Les joueurs : attributs, niveau et postes

## Les attributs

Un joueur a quinze attributs. Le moteur de match ne lit jamais le niveau global : il lit ces attributs, à travers les composites décrits plus bas.

| Attribut | Ce qu'il change |
|---|---|
| Passe | Faire remonter le ballon, créer l'occasion |
| Technique | Remonter le ballon, créer, frapper ; un joueur plus technique que passeur dribble davantage |
| Vision | Créer l'occasion avant tout |
| Vitesse | Remonter le ballon et défendre au milieu ; la vitesse moyenne de l'équipe décide des contres |
| Finition | Frapper au but ; tirs au but |
| Sang-froid | Frapper, jouer de la tête ; tirs au but |
| Jeu de tête | Reprendre un centre ou un corner |
| Centres | Qualité du centre : une meilleure occasion pour celui qui le reprend |
| Coups arrêtés | Tirer les corners et les coups francs directs |
| Tacle | Défendre au milieu comme dans la surface |
| Placement | Défendre, et pour un gardien arrêter et sortir |
| Endurance | Moins de fatigue en match, récupération plus rapide |
| Réflexes | Arrêter les tirs ; tirs au but |
| Sorties | Capter centres et corners |
| Relance | Faire repartir son équipe plus haut après un tir adverse |

## Le niveau

Le niveau affiché (NIV.) est une moyenne pondérée des attributs, propre au **poste principal** du joueur :

| Poste | Poids des attributs dans le niveau |
|---|---|
{{#chaque attributs.note_globale}}| {{cle}} | {{poids(valeur)}} |

Le niveau sert à tout ce qui n'est pas le match : valeur marchande, salaire attendu, besoins des clubs, choix de composition de l'IA, moral. En match, deux joueurs du même niveau peuvent peser très différemment selon la répartition de leurs attributs et le poste où ils jouent.

## Les composites

Le moteur de match regroupe les attributs en huit composites, un par type d'action. Ce sont les colonnes de la vue « Jeu » des listes de joueurs.

| Composite | Sert à | Attributs |
|---|---|---|
| Progression | Faire avancer le ballon d'une zone à la suivante | {{poids(attributs.composites.progression_attaque)}} |
| Création | Transformer une présence devant le but en occasion | {{poids(attributs.composites.occasion_attaque)}} |
| Frappe | Marquer sur un tir | {{poids(attributs.composites.tir)}} |
| Jeu aérien | Marquer de la tête | {{poids(attributs.composites.tete)}} |
| Défense au milieu | Empêcher l'adversaire d'avancer | {{poids(attributs.composites.progression_defense)}} |
| Défense de surface | Empêcher l'occasion | {{poids(attributs.composites.occasion_defense)}} |
| Arrêts | Arrêter un tir (gardien) | {{poids(attributs.composites.arret)}} |
| Sorties aériennes | Capter un centre ou un corner (gardien) | {{poids(attributs.composites.sortie)}} |

## Postes et affinité

Chaque joueur a une affinité de 1 à 20 avec chacun des dix postes : ce sont les aptitudes par poste de sa fiche. Son poste principal est celui où elle est la plus haute. Celles d'un joueur du fichier de départ viennent de ce fichier ; celles d'un regen sont tirées à sa naissance, autour de son poste (voir [Regens](#/aide/regens/a-quoi-ressemble-un-regen)).

Jouer à un poste multiplie tout ce que fait le joueur par :

```
{{attributs.malus_hors_poste.base}} + {{attributs.malus_hors_poste.facteur}} × (affinité ÷ 20)
```

Un joueur totalement étranger à un poste (1 sur 20) y garde donc {{pct(attributs.malus_hors_poste.base + attributs.malus_hors_poste.facteur / 20)}} de ses moyens ; à 10 sur 20, {{pct(attributs.malus_hors_poste.base + attributs.malus_hors_poste.facteur * 0.5)}}.

L'affinité n'est pas le seul effet du poste. Le poste décide aussi **où** le joueur intervient sur le terrain et dans quelles phases (voir [Le moteur de match](#/aide/match/la-force-d-une-equipe-dans-une-zone)) : un excellent finisseur placé arrière central ne se retrouve presque jamais en position de frapper.

La **note au poste**, affichée sous les maillots sur le terrain de la composition et de la fiche, résume les deux : c'est la moyenne des composites que ce poste sollicite le plus, multipliée par le facteur d'affinité.

## Le potentiel

Le potentiel (POT.) est le niveau maximal qu'un joueur peut atteindre. Il est fixé une fois pour toutes, à l'import ou à la naissance du regen, et ne change jamais. Le niveau ne peut pas le dépasser.

Vous voyez le potentiel exact. Les clubs de l'IA, eux, n'en voient qu'une **estimation** (voir [Regens](#/aide/regens/ce-que-les-clubs-voient-du-potentiel)).

## Le caractère

Quatre traits stables, fixés à la création du joueur, pèsent sur sa carrière. La fiche les montre tous les quatre sous Caractère, de 1 à 20.

| Trait | Plage | Effet |
|---|---|---|
| Fragilité | {{etats.blessures.fragilite_min}} à {{etats.blessures.fragilite_max}} (1 à 20 sur la fiche) | Multiplie le risque de blessure en match |
| Agressivité | {{moteur_match.cartons.agressivite_min}} à {{moteur_match.cartons.agressivite_max}} (1 à 20 sur la fiche) | Multiplie la probabilité d'être l'auteur d'une faute sanctionnée |
| Ambition | {{ia_gestion.contrats.ego_min}} à {{ia_gestion.contrats.ego_max}} (1 à 20 sur la fiche) | Rend le joueur impatient dans un club trop petit pour lui |
| Appât du gain | 0 à 1 (1 à 20 sur la fiche) | Gonfle le salaire demandé |

Pour un joueur du fichier de départ, ces traits viennent de ses notes d'origine (propension aux blessures, agressivité, ambition, loyauté : moins il est loyal, plus il regarde le salaire). Pour un regen, ils sont tirés au hasard.

## Le numéro de maillot

Chaque joueur d'un effectif porte son propre numéro, de 1 à 99 : celui du fichier de départ quand il le donne, sinon un numéro choisi comme ci-dessous. Il le garde tant qu'il reste au club ; un joueur libre n'en a pas.

Un joueur qui arrive (transfert, prêt, retour de prêt, jeune promu au centre de formation) prend le premier numéro libre parmi ceux que demande sa place dans l'effectif :

| Poste | Titulaire | Remplaçant | Jeune |
|---|---|---|---|
| GB | 1 | 16 | 30 |
| DG | 3 | 13, 23 | 23, 33 |
| DD | 2 | 12, 22 | 22, 32 |
| DC | 4, 5, sinon 6 | 14, 15, 24, 25 | 24, 25, 34, 35 |
| MDC | 6, sinon 8 | 26, 28, 20 | 26, 36 |
| MC | 8, sinon 6, 7, 11 | 28, 20, 26 | 28, 38 |
| MOC | 10, sinon 8, 7, 11 | 20, 28, 26 | 20 |
| AILG | 11, sinon 7, 10 | 21 | 21, 31 |
| AILD | 7, sinon 11, 10 | 17, 27 | 27, 37 |
| BU | 9, sinon 10, 11 | 18, 19, 29 | 29, 39 |

- **Titulaire** : un joueur du onze type de son club, celui que sa tactique aligne quand tout le monde est disponible, la réserve mise à part. Les numéros de 1 à 11, les plus prestigieux, sont les siens ; s'ils sont pris, il passe à ceux d'un remplaçant.
- **Jeune** : un joueur de moins de 21 ans qui n'est pas titulaire.
- **Remplaçant** : tous les autres ; s'ils sont pris, il passe à ceux d'un jeune.
- À partir de 30, un numéro ne va plus avec un poste : faute de mieux, le joueur prend le premier libre.

Recruté par un club dont le 9 est libre, un avant-centre titulaire le prend ; un attaquant de 16 ans prend le 29, ou le 39.

Le 1er juillet, une fois partis les joueurs en fin de contrat, chaque club revoit ses numéros avant l'arrivée des jeunes du centre de formation : un titulaire sans numéro de 1 à 11 prend un de ceux de son poste resté libre, un remplaçant qui porte un numéro de 30 ou plus en prend un de 12 à 29. Personne ne cède le sien, mais celui qu'un joueur quitte peut servir au suivant. Les actualités de votre club disent le numéro de chaque arrivée et les changements du 1er juillet.
