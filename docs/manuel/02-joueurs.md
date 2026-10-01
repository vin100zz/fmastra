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

La **note au poste**, affichée à côté des maillots sur le terrain de la composition et de la fiche, résume les deux : c'est la moyenne des composites que ce poste sollicite le plus, multipliée par le facteur d'affinité.

## Le potentiel

Le potentiel (POT.) est le niveau maximal qu'un joueur peut atteindre. Il est fixé une fois pour toutes, à l'import ou à la naissance du regen, et ne change jamais. Le niveau ne peut pas le dépasser.

Vous voyez le potentiel exact. Les clubs de l'IA, eux, n'en voient qu'une **estimation** (voir [Regens](#/aide/regens/ce-que-les-clubs-voient-du-potentiel)).

## Le caractère

Quatre traits stables, fixés à la création du joueur, pèsent sur sa carrière. Seul l'appât du gain est affiché sur la fiche.

| Trait | Plage | Effet |
|---|---|---|
| Fragilité | {{etats.blessures.fragilite_min}} à {{etats.blessures.fragilite_max}} | Multiplie le risque de blessure en match |
| Agressivité | {{moteur_match.cartons.agressivite_min}} à {{moteur_match.cartons.agressivite_max}} | Multiplie la probabilité d'être l'auteur d'une faute sanctionnée |
| Ambition | {{ia_gestion.contrats.ego_min}} à {{ia_gestion.contrats.ego_max}} | Rend le joueur impatient dans un club trop petit pour lui |
| Appât du gain | 0 à 1 (1 à 20 sur la fiche) | Gonfle le salaire demandé |

Pour un joueur du fichier de départ, ces traits viennent de ses notes d'origine (propension aux blessures, agressivité, ambition, loyauté : moins il est loyal, plus il regarde le salaire). Pour un regen, ils sont tirés au hasard.
