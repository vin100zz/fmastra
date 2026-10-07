# Les sélections nationales

## Quelle nation pour un binational

Un joueur qui a plusieurs nationalités n'est lié à aucune sélection tant qu'il n'a pas joué. Sa **première entrée en jeu** en match officiel fixe définitivement la nation qu'il représente.

Avant cela, à chaque rassemblement, il penche pour la nation la plus attirante parmi les siennes :

```
attrait = 0.3 × force de la nation − 2 × retard sur le dernier sélectionnable à son poste + attachement
```

- **La force de la nation** attire : à chances égales, un joueur préfère la meilleure sélection.
- **Le retard** compte bien davantage : s'il est moins bon que le dernier joueur que cette nation retiendrait à son poste, chaque point de retard (sur 200) lui coûte autant que 3.3 points de force. Un bon joueur barré dans une grande sélection choisit donc la plus petite, où il jouera.
- **L'attachement** est une préférence personnelle fixe, de −2 à +2, propre à chaque joueur et à chaque nation.

Les joueurs du fichier de départ qui ont déjà des sélections gardent leur nation.

## La liste des 23

Une liste est annoncée trois jours avant le premier match de chaque rassemblement. Elle compte 23 joueurs, toujours avec la même répartition :

| Poste | Places |
|---|---:|
| GB | 3 |
| DC | 4 |
| DG, DD | 2 chacun |
| MDC | 2 |
| MC | 3 |
| MOC | 2 |
| AILG, AILD | 1 chacun |
| BU | 3 |

Pour chaque place, le sélectionneur retient le meilleur joueur disponible parmi ceux qui ont une affinité d'au moins 10 sur 20 avec le poste :

```
note = niveau à ce poste + 6 × (forme − 1) + 6 × (condition − 1) + aléa
```

- **Le niveau prime.** Il est recalculé avec les poids du poste à pourvoir : un milieu peut être retenu comme arrière s'il y est assez à l'aise.
- **La forme et la condition** ne font que départager : une forme de 1.20 vaut 1.2 point de niveau, une condition de 80 % en coûte autant.
- **L'aléa**, entre −{{international.selection_noise * 2}} et +{{international.selection_noise * 2}} points, tiré pour chaque joueur à chaque rassemblement, fait tourner les listes entre joueurs de niveau voisin.
- **Un blessé** n'est pas appelé. **Un suspendu** peut l'être : sa suspension se purge pendant le rassemblement.
- Ni le club, ni le temps de jeu en club, ni le moral, ni l'âge n'entrent dans le choix.

Si un joueur se blesse pendant un rassemblement de qualification, il est remplacé. En phase finale, les blessés ne sont remplacés qu'avant le premier match de la sélection ; ensuite, la liste est figée.

## Le onze de la sélection

Le sélectionneur compose son équipe comme l'[entraîneur IA](#/aide/entraineur) d'un club, sans tenir compte du temps de jeu en club. Toutes les sélections partent de la même formation, la première du tableau des [formations](#/aide/entraineur/le-onze-de-depart), et n'en changent que si elle oblige un joueur à occuper un poste qui lui est étranger. Le banc compte les douze autres joueurs de la liste.

## Ce que la sélection change pour votre club

- **Vos internationaux sont absents** du rassemblement jusqu'à sa fin : ils ne peuvent pas jouer pour vous pendant ce temps. Le calendrier des clubs laisse ces fenêtres libres.
- **La fatigue et les blessures sont partagées** : un joueur rentre avec la condition que lui ont laissée ses matches, et une blessure en sélection le prive de son club.
- **La forme évolue** aussi sur les notes obtenues en sélection, et ses minutes comptent pour sa [progression](#/aide/progression/la-progression) mensuelle.
- **Les cartons et les suspensions sont séparés** : un carton en sélection ne compte pas en club, et inversement.
- **Les statistiques sont séparées** elles aussi : matches, buts, passes et note moyenne de chaque édition se lisent dans la carrière de la fiche du joueur, sous ses clubs, sans entrer dans ses statistiques de saison.
- **Une retraite** décidée pendant un tournoi attend la fin du rassemblement.

## Les renforts

Une nation qui n'a pas assez de joueurs pour remplir sa liste reçoit des joueurs temporaires. Leur niveau se situe un peu en dessous de la force de la nation ; ils restent attachés à leur sélection pendant toute la campagne, avec leur état physique, puis disparaissent. Ils n'ont pas de club et ne sont pas sur le marché.

## La force des nations

Chaque nation a une force sur 100, qui sert aux tirages, à l'attrait des binationaux et au niveau des renforts.

- Après chaque match, le vainqueur gagne et le perdant perd jusqu'à 0.8 point, d'autant plus que le résultat est inattendu ; un nul rapproche les deux.
- Au lancement de chaque campagne, deux ans avant le tournoi, la force fait un dixième du chemin vers un mélange de sa valeur de référence (60 %) et du niveau moyen de ses 23 meilleurs joueurs (40 %).

## Les compétitions

L'Euro se joue tous les quatre ans à partir de {{annee(international.first_euro)}}, la Coupe du monde tous les quatre ans à partir de {{annee(international.first_world_cup)}}.

- **Les qualifications européennes** se jouent en dix groupes, en matches aller et retour, sur cinq rassemblements de deux matches : septembre et novembre de l'avant-dernière année, puis mars, juin et novembre de l'année précédant le tournoi. Les dix premiers de groupe se qualifient, avec les six meilleurs deuxièmes pour l'Euro et les quatre meilleurs pour la Coupe du monde.
- **Hors d'Europe**, les qualifications ne sont pas jouées : les qualifiés de chaque confédération sont désignés selon leur force, avec un aléa qui permet des surprises entre nations proches.
- **Les phases finales** se jouent en juin et juillet sur terrain neutre : des groupes de quatre, deux qualifiés par groupe, puis élimination directe avec tirs au but en cas d'égalité, sans prolongation.
