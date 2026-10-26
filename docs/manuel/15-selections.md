# Les sélections nationales

## Quelle nation pour un binational

Un joueur qui a plusieurs nationalités n'est lié à aucune sélection tant qu'il n'a pas joué. Sa **première entrée en jeu** en match officiel fixe définitivement la nation qu'il représente.

Avant cela, à chaque rassemblement, il penche pour la nation la plus attirante parmi les siennes :

```
attrait = 0.3 × force de la nation − 2 × retard sur le dernier sélectionnable à son poste + attachement
```

- **La force de la nation** attire : à chances égales, un joueur préfère la meilleure sélection.
- **Le retard** compte bien davantage : s'il est moins bon que le dernier joueur que cette nation retiendrait à son poste, chaque point de retard (sur 200) lui coûte autant que 3.3 points de force. Un bon joueur barré dans une grande sélection choisit donc la plus petite, où il jouera. Le nombre de joueurs qu'une nation retient à un poste suit sa formation de référence (voir ci-dessous) : deux par place de champ, trois gardiens. Un poste que cette formation n'aligne pas n'est ouvert qu'au meilleur de la nation à ce poste.
- **L'attachement** est une préférence personnelle fixe, de −2 à +2, propre à chaque joueur et à chaque nation.

Les joueurs du fichier de départ qui ont déjà des sélections gardent leur nation.

## La liste des 23

Une liste est annoncée trois jours avant le premier match de chaque rassemblement. Elle compte 23 joueurs, choisis pour une [formation](#/aide/entraineur/le-onze-de-depart) :

1. **Les candidats.** Pour chaque poste, le sélectionneur retient les {{international.squad_list.pool_per_position}} meilleurs joueurs disponibles qui y ont une affinité d'au moins {{international.squad_list.min_affinity * 20}} sur 20.
2. **La formation.** Il choisit celle que ces candidats remplissent le mieux, comme l'entraîneur d'un club. Il garde celle du rassemblement précédent si une autre ne fait pas mieux d'au moins {{formations.choix.marge_changement * 2}} points par place.
3. **La liste.** Le onze de cette formation, une doublure pour chaque place de champ, et trois gardiens. Une formation à deux défenseurs centraux en appelle donc quatre, une formation sans ailier n'en appelle aucun. La liste retenue est celle qui vaut le plus au total, toutes combinaisons confondues.

La valeur d'un joueur à une place :

```
note = niveau à ce poste + 6 × (forme − 1) + 6 × (condition − 1) + aléa, multipliée par l'affinité au poste
```

- **Le niveau prime.** Il est recalculé avec les poids du poste à pourvoir : un milieu peut être retenu comme arrière s'il y est assez à l'aise, mais il y vaut moins.
- **La forme et la condition** ne font que départager : une forme de 1.20 vaut 1.2 point de niveau, une condition de 80 % en coûte autant.
- **L'aléa**, entre −{{international.selection_noise * 2}} et +{{international.selection_noise * 2}} points, tiré pour chaque joueur à chaque rassemblement, fait tourner les listes entre joueurs de niveau voisin.
- **Un blessé** n'est pas appelé. **Un suspendu** peut l'être : sa suspension se purge pendant le rassemblement.
- Ni le club, ni le temps de jeu en club, ni le moral, ni l'âge n'entrent dans le choix.

Une place qu'aucun joueur de la nation ne peut tenir revient à un **renfort temporaire**, généré pour la campagne au niveau de la nation.

**La formation de référence.** Une fois par an, à la révision des forces, chaque nation fixe la formation que l'ensemble de ses joueurs remplit le mieux, sans forme, ni condition, ni aléa. Elle ne sert qu'aux binationaux (voir plus haut).

Si un joueur se blesse pendant un rassemblement de Ligue des nations ou de qualification, il est remplacé à sa place de la formation du rassemblement, qui ne change pas. En phase finale (celle d'un tournoi comme celle de la Ligue des nations), les blessés ne sont remplacés qu'avant le premier match de la sélection ; ensuite, la liste est figée.

## Le onze de la sélection

Le sélectionneur compose son équipe comme l'[entraîneur IA](#/aide/entraineur) d'un club, sans tenir compte du temps de jeu en club, dans la formation de sa liste. Il n'en change, pour un match, que si les absents l'obligent à placer un joueur à un poste qui lui est totalement étranger. Le banc compte les douze autres joueurs de la liste.

## Ce que la sélection change pour votre club

- **Vos internationaux sont absents** du rassemblement jusqu'à sa fin : ils ne peuvent pas jouer pour vous pendant ce temps. Le calendrier des clubs laisse ces jours libres : votre club peut jouer la veille du départ et le lendemain du retour, jamais à moins de {{monde.europe.min_rest_days}} jours d'un match de sélection.
- **La fatigue et les blessures sont partagées** : un joueur rentre avec la condition que lui ont laissée ses matches, et une blessure en sélection le prive de son club.
- **La forme évolue** aussi sur les notes obtenues en sélection, et ses minutes comptent pour sa [progression](#/aide/progression/la-progression) mensuelle.
- **Les cartons et les suspensions sont séparés** : un carton en sélection ne compte pas en club, et inversement. Chaque compétition a les siens : un carton en Ligue des nations ne compte pas en qualifications.
- **Les statistiques sont séparées** elles aussi : matches, buts, passes et note moyenne de chaque édition se lisent dans la carrière de la fiche du joueur, sous ses clubs, sans entrer dans ses statistiques de saison.
- **Une retraite** décidée pendant un tournoi attend la fin du rassemblement.

## Les renforts

Une nation qui n'a pas assez de joueurs pour remplir sa liste reçoit des joueurs temporaires. Leur niveau se situe un peu en dessous de la force de la nation ; ils restent attachés à leur sélection pendant toute la campagne, de la Ligue des nations au tournoi, avec leur état physique, puis disparaissent à la fin de la dernière compétition pour laquelle ils ont été appelés. Ils n'ont pas de club et ne sont pas sur le marché.

## La force des nations

Chaque nation a une force sur 100, qui sert aux tirages, à l'attrait des binationaux et au niveau des renforts.

- Après chaque match, le vainqueur gagne et le perdant perd jusqu'à 0.8 point, d'autant plus que le résultat est inattendu ; un nul rapproche les deux.
- Au lancement de chaque campagne, deux ans avant le tournoi, la force fait un dixième du chemin vers un mélange de sa valeur de référence (60 %) et du niveau moyen de ses 23 meilleurs joueurs (40 %).

## Les compétitions

L'Euro se joue tous les quatre ans à partir de {{annee(international.first_euro)}}, la Coupe du monde tous les quatre ans à partir de {{annee(international.first_world_cup)}} : un tournoi chaque été pair. Chacun clôt une campagne de deux ans, la Ligue des nations puis les qualifications.

| Quand | Ce qui se joue |
|---|---|
| Septembre, octobre et novembre, deux ans avant le tournoi | Ligue des nations : les groupes, deux matches par mois |
| Mars de l'année précédant le tournoi | Qualifications : deux matches |
| Juin de l'année précédant le tournoi | Ligue des nations : demi-finales et finale |
| Septembre, octobre et novembre de l'année précédant le tournoi | Qualifications : deux matches par mois |
| Mars de l'année du tournoi | Qualifications : les deux derniers matches |
| Juin et juillet de l'année du tournoi | Phase finale du tournoi |

- **Les qualifications européennes** se jouent en dix groupes, en matches aller et retour, sur ces cinq rassemblements de deux matches. Les dix premiers de groupe se qualifient, avec les six meilleurs deuxièmes pour l'Euro et les quatre meilleurs pour la Coupe du monde.
- **Hors d'Europe**, les qualifications ne sont pas jouées : les qualifiés de chaque confédération sont désignés selon leur force, avec un aléa qui permet des surprises entre nations proches.
- **Les phases finales** se jouent en juin et juillet sur terrain neutre : des groupes de quatre, deux qualifiés par groupe, puis élimination directe avec tirs au but en cas d'égalité, sans prolongation.

## La Ligue des nations

Toutes les nations européennes la jouent, réparties en quatre divisions :

- **Divisions A, B et C** : quatre groupes de quatre chacune.
- **Division D** : les autres nations, en groupes de trois ou quatre.

Chaque groupe se joue en matches aller et retour. La première édition range les nations par force : les seize plus fortes en A, les seize suivantes en B, les seize suivantes en C, les autres en D. Dans chaque division, les groupes sont tirés par chapeaux, selon la force.

**La phase finale.** Les quatre premiers de groupe de la division A se retrouvent en juin, sur terrain neutre : deux demi-finales tirées au sort, puis la finale. Un match nul se décide aux tirs au but, sans prolongation.

**Montées et descentes**, pour l'édition suivante :

- le dernier de chaque groupe des divisions A, B et C descend d'une division ;
- le premier de chaque groupe des divisions B et C monte d'une division ;
- de la division D montent autant de nations qu'il en descend de la C, quatre : les mieux classées, place par place, soit les deux premiers de chaque groupe quand elle en a deux. Entre groupes de tailles différentes, une nation d'un groupe plus grand est comparée sans ses matches contre le dernier de son groupe.

La Ligue des nations ne qualifie ni pour l'Euro ni pour la Coupe du monde.
