# L'entraîneur IA : compositions et remplacements

Tous les clubs que vous ne dirigez pas, et les sélections, confient leurs matches au même entraîneur IA. Il dirige aussi votre équipe quand vous ne le faites pas vous-même.

## Le onze de départ

Sont disponibles les joueurs qui ne sont ni blessés, ni suspendus dans la compétition du jour, ni partis en sélection, ni placés en réserve (voir [Réserve et prêts](#/aide/reserve-et-prets)). Un joueur prêté joue pour son club d'accueil.

Pour chaque place de la formation, chaque joueur disponible reçoit une valeur :

```
valeur à un poste = niveau recalculé avec les poids de ce poste × forme × condition × moral × affinité au poste
```

L'IA retient le onze dont la somme des valeurs est la plus haute, toutes combinaisons confondues : elle ne remplit pas les postes un par un.

**La formation.** Chaque club de l'IA a reçu une formation au hasard à la création de la partie, parmi celles-ci, et la garde :

| Formation | Postes |
|---|---|
{{#chaque formations.formations}}| {{cle}} | {{liste(valeur)}} |

Si son meilleur onze oblige un joueur à occuper un poste qui lui est totalement étranger, l'IA essaie les autres formations et garde celle qui place le plus de joueurs à un poste qu'ils connaissent, puis la meilleure somme.

**La rotation.** Un titulaire dont la condition est passée sous {{pct(ia_gestion.selection.seuil_rotation_fatigue, 0)}} cède sa place à un joueur plus frais, si celui-ci vaut à ce poste au moins son niveau moins {{ia_gestion.selection.ecart_niveau_acceptable_rotation * 2}} points.

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
- **Mode Auto** : l'IA compose aussi l'équipe, avec la formation attribuée à votre club à la création de la partie (colonne FORMATION de la liste des clubs), pas avec votre dernière tactique.

Dans un match en direct que vous dirigez, l'IA ne touche à rien de votre côté : ni remplacement automatique, ni remontée du bloc en fin de match.
