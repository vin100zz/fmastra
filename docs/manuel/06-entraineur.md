# L'entraîneur IA : compositions et remplacements

Tous les clubs que vous ne dirigez pas, et les sélections, confient leurs matches au même entraîneur IA. Il dirige aussi votre équipe quand vous ne le faites pas vous-même.

## Le onze de départ

Sont disponibles les joueurs qui ne sont ni blessés, ni suspendus dans la compétition du jour, ni partis en sélection, ni placés en réserve (voir [Réserve et prêts](#/aide/reserve-et-prets)). Un joueur prêté joue pour son club d'accueil.

Pour chaque place de la formation, chaque joueur disponible reçoit une valeur :

```
valeur à un poste = niveau recalculé avec les poids de ce poste × forme × condition × moral × affinité au poste
```

L'IA retient le onze dont la somme des valeurs est la plus haute, toutes combinaisons confondues : elle ne remplit pas les postes un par un.

**La formation.** Chaque club de l'IA joue, parmi celles-ci, la formation que ses joueurs remplissent le mieux :

| Formation | Postes |
|---|---|
{{#chaque formations.formations}}| {{cle}} | {{liste(valeur)}} |

Pour chaque formation, l'IA cherche le meilleur onze de son équipe première avec la valeur ci-dessus, mais sans forme, ni condition, ni moral : la formation décrit l'effectif, pas l'état du jour. Un joueur en réserve ou blessé pour plus de {{formations.choix.blessure_longue_jours}} jours ne compte pas ; un joueur prêté au club compte. Elle retient la formation dont le onze vaut le plus, en moyenne par place.

Elle refait ce choix chaque fois que son équipe première change : arrivée, départ, prêt, réserve, blessure longue ou retour. Elle ne change de formation que si une autre fait mieux d'au moins {{formations.choix.marge_changement * 2}} points par place : un club ne change pas de système pour une recrue de complément. Votre club joue la formation que vous choisissez ; à la création de la partie, c'est celle qui convient le mieux à son effectif.

Le jour du match, si son meilleur onze oblige un joueur à occuper un poste qui lui est totalement étranger, l'IA essaie les autres formations pour ce match et garde celle qui place le plus de joueurs à un poste qu'ils connaissent, puis la meilleure somme.

**La rotation.** Un titulaire dont la condition est passée sous {{pct(ia_gestion.selection.seuil_rotation_fatigue, 0)}} cède sa place à un joueur plus frais, si celui-ci vaut à ce poste au moins son niveau moins {{ia_gestion.selection.ecart_niveau_acceptable_rotation * 2}} points. Quand le match suivant du club est européen, l'IA ménage aussi le titulaire qu'un match complet laisserait sous ce seuil le jour de ce match (voir [La condition physique](#/aide/etats/la-condition-physique)).

**La composition auto.** Sur l'écran Composition, l'IA compose aussi pour vous, sur la formation affichée. « Meilleure » prend la meilleure équipe pour le match. « Légère », « Forte » et « Complète » mettent au repos un tiers, deux tiers ou tous les joueurs de champ ; le gardien reste toujours le meilleur. Chaque titulaire reposé laisse sa place à son second choix : le meilleur à ce poste parmi ceux qui ne sont pas du onze. L'IA repose d'abord les titulaires dont le second choix est le plus proche, en comptant le temps de jeu qu'il attend : un joueur juste derrière un titulaire, et qui joue peu, passe avant les autres. La fatigue compte aussi, car un joueur fatigué vaut moins. La case « Jeunes » fait passer les grands espoirs avant les seconds choix : leur marge de progression, telle que le club l'estime, s'ajoute à leur note, à raison de {{ia_gestion.selection.poids_espoirs_rotation * 2}} points au plus. La case « Formation » laisse l'IA changer de formation comme elle le fait pour elle-même ; sinon elle garde celle du terrain.

**L'équipe-type.** La Présentation d'un club montre son équipe-type : la forme qu'il a le plus souvent alignée dans la saison, toutes compétitions confondues, et à chaque place le joueur de son équipe première qui y a été le plus souvent titulaire. Un joueur parti ou placé en réserve n'y figure plus ; une place où aucun joueur restant n'a été titulaire revient au meilleur à ce poste. Avant son premier match de la saison, ou pour un club qui n'en joue pas, ce sont ses meilleurs joueurs aux places de sa formation, retenus comme le onze de départ, sur leur seule note au poste : sans forme, ni condition, ni moral.

La Présentation d'une sélection montre la sienne de la même façon, pour l'édition où elle en est (celle de son prochain match, à défaut de son dernier) : la forme qu'elle y a le plus souvent alignée, et à chaque place le joueur qui y a été le plus souvent titulaire, parmi ceux de son dernier rassemblement et ceux qui ont été titulaires pour elle dans l'édition. Un joueur retiré depuis n'y figure plus. Avant son premier match de l'édition, ce sont les meilleurs joueurs de son dernier rassemblement à leur note au poste, aux places de la formation de ce rassemblement (voir [Les sélections nationales](#/aide/selections/la-liste-des-23)).

## Le banc

Le banc compte {{monde.regles_match.taille_banc}} joueurs : un gardien, puis des joueurs de champ choisis pour couvrir les postes du onze. Pour couvrir un poste, il faut une affinité d'au moins {{etats.remplacements.affinite_minimum_rotation * 20}} sur 20. L'IA prend d'abord de quoi couvrir chaque poste, en préférant, à valeur proche, les joueurs qui ont besoin de temps de jeu.

## Les priorités de temps de jeu

Avant chaque match, chaque joueur reçoit deux priorités, qui pèsent sur le choix du banc et sur les remplacements :

- **La dette de temps de jeu** : la part des minutes attendues qu'il n'a pas jouées cette saison, ou depuis son arrivée s'il est venu en cours de saison (le même calcul que pour le [moral](#/aide/etats/le-moral)).
- **Le développement**, pour les joueurs encore en âge de progresser : d'autant plus fort que le joueur est jeune, loin de son potentiel estimé, peu utilisé ce mois-ci, et que le club aime faire jouer ses jeunes. Cette préférence pour les jeunes est un trait du club, tiré à la création de la partie entre {{ia_gestion.personnalite_club.preference_jeunes.min}} et {{ia_gestion.personnalite_club.preference_jeunes.max}}.

Elles donnent un bonus pouvant atteindre {{etats.remplacements.poids_deficit_temps_jeu * 2}} points pour la dette et {{etats.remplacements.poids_developpement_jeunes * 2}} points pour le développement.

## Les remplacements

Une équipe dispose de {{monde.regles_match.remplacements_max}} remplacements en {{monde.regles_match.fenetres_remplacement}} arrêts de jeu ; ceux de la mi-temps ne consomment pas d'arrêt. L'IA réexamine son équipe à la mi-temps, puis toutes les {{etats.remplacements.intervalle_evaluation_minutes}} minutes à partir de la {{etats.remplacements.premiere_minute_evaluation}}e.

Elle remplace, dans cet ordre de priorité :

1. un joueur blessé, immédiatement ;
2. un joueur de champ dont la condition est tombée sous {{pct(etats.remplacements.seuil_fatigue_declenchement, 0)}} ;
3. un joueur de champ averti dont la condition est sous {{pct(etats.remplacements.seuil_fatigue_joueur_averti, 0)}}.

L'entrant est le joueur du banc qui vaut le plus au poste libéré. Un gardien n'est remplacé que sur blessure.

**Les changements de rotation.** S'il lui reste des remplacements, au moins {{etats.remplacements.minutes_utiles_minimum}} minutes à jouer et aucun changement forcé à faire, l'IA peut sortir un titulaire de champ pour faire entrer un joueur qui a besoin de jouer, au plus {{etats.remplacements.rotations_par_fenetre}} par arrêt de jeu et pas plus souvent que toutes les {{etats.remplacements.intervalle_rotation_minutes}} minutes. Le changement se fait si :

```
(valeur de l'entrant − valeur actuelle du sortant, fatigue comprise) + contexte × bonus de temps de jeu ≥ {{etats.remplacements.gain_minimum_rotation * 2}} points
```

Le contexte vaut 1 quand l'équipe mène d'au moins {{etats.remplacements.ecart_buts_ajustement_defensif}} buts, {{etats.remplacements.facteur_rotation_match_serre}} quand le match est serré et {{etats.remplacements.facteur_rotation_equipe_menee}} quand elle est menée : l'IA fait tourner quand le match est joué et cherche l'efficacité quand il ne l'est pas. Un titulaire fatigué sort donc facilement en fin de match, puisque sa valeur actuelle a baissé avec sa condition.

**Cas particuliers.**

- Gardien expulsé : s'il reste un remplacement et un arrêt de jeu, le gardien remplaçant entre à la place du joueur de champ le plus faible. Sinon, le joueur de champ le plus doué pour les arrêts va dans le but.
- Équipe menée : le bloc remonte dans les dernières minutes (voir [Hauteur de bloc et mentalité](#/aide/match/hauteur-de-bloc-et-mentalite)).

## Quand l'IA dirige votre équipe

- **Simuler** : votre composition est jouée telle quelle, l'IA gère les remplacements et la hauteur du bloc.
- **Fin du match**, en direct : l'IA reprend le match là où vous le laissez.
- **Mode Auto** : l'IA compose aussi l'équipe, avec la formation de votre club (colonne FORMATION de la liste des clubs), pas avec votre dernière tactique.

Dans un match en direct que vous dirigez, l'IA ne touche à rien de votre côté : ni remplacement automatique, ni remontée du bloc en fin de match.

**Les conseils de votre adjoint.** En direct, votre adjoint signale d'un ⇄ jaune le joueur qu'il sortirait, et d'un ⇄ vert celui qu'il ferait entrer à sa place ; l'infobulle dit pourquoi. Il propose de sortir un joueur fatigué à 70 % ou plus, ou fatigué à 50 % ou plus s'il est averti ou noté sous 6. Il choisit le remplaçant le plus frais du même poste, sinon de la même ligne (un gardien pour un gardien). Il fait autant de propositions qu'il vous reste de changements, les joueurs les plus fatigués d'abord. Il ne change rien lui-même : un clic sur son ⇄ prépare le changement, que vous validez ou non.

**Vos ordres en direct.** Vous préparez vos changements, votre formation et votre mentalité sans arrêter le match. Une fois validés, ils s'appliquent à la fin de l'action en cours, comme un remplacement attend un arrêt de jeu ; entre deux actions et à la mi-temps, tout de suite. Tous les changements validés ensemble ne consomment qu'un arrêt de jeu. Sur une blessure ou un carton rouge dans votre équipe, le match s'arrête jusqu'à ce que vous changiez quelque chose ou repreniez sans changement.
