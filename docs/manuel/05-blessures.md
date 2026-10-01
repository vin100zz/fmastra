# Blessures et suspensions

## Se blesser en match

À la fin de chaque possession, un seul joueur est exposé : il est tiré parmi ceux qui étaient impliqués dans l'action, d'un côté ou de l'autre. Son risque de blessure vaut :

```
risque = {{pct(etats.blessures.probabilite_base_par_possession, 2)}} × ({{etats.blessures.facteur_fatigue_max}} − condition) × fragilité × effort du bloc
```

- **La condition** : un joueur frais (100 %) a un facteur de {{etats.blessures.facteur_fatigue_max - 1}}, un joueur à 50 % un facteur de {{etats.blessures.facteur_fatigue_max - 0.5}}. Le risque augmente donc au fil du match, et un joueur aligné fatigué part avec un risque plus élevé.
- **La fragilité** : trait caché, de {{etats.blessures.fragilite_min}} à {{etats.blessures.fragilite_max}}.
- **L'effort du bloc** : de {{etats.fatigue.intensite_par_hauteur_bloc.bloc_bas}} (bloc bas) à {{etats.fatigue.intensite_par_hauteur_bloc.pressing_haut}} (pressing haut).

Les joueurs les plus impliqués à l'endroit où l'action s'est terminée sont les plus souvent exposés.

Un blessé sort aussitôt. L'IA le remplace si elle le peut ; dans votre match en direct, c'est à vous de le faire, sinon l'équipe joue à dix. Si le gardien sort sans remplaçant, le joueur de champ le plus doué pour les arrêts prend les gants.

## Se blesser hors match

Chaque jour, un joueur d'un club simulé ou en rassemblement avec sa sélection a {{pct(etats.blessures.probabilite_quotidienne_hors_match, 3)}} de chances de se blesser, soit environ {{pct(1 - (1 - etats.blessures.probabilite_quotidienne_hors_match) ** 365, 0)}} sur une année. Ni la condition ni la fragilité n'entrent en jeu.

## Gravité et retour

| Gravité | Part des blessures | Durée |
|---|---:|---|
| Légère | {{pct(etats.blessures.gravites[0].part, 0)}} | {{etats.blessures.gravites[0].jours_min}} à {{etats.blessures.gravites[0].jours_max}} jours |
| Moyenne | {{pct(etats.blessures.gravites[1].part, 0)}} | {{etats.blessures.gravites[1].jours_min}} à {{etats.blessures.gravites[1].jours_max}} jours |
| Grave | {{pct(etats.blessures.gravites[2].part, 0)}} | {{etats.blessures.gravites[2].jours_min}} à {{etats.blessures.gravites[2].jours_max}} jours |
| Très grave | {{pct(etats.blessures.gravites[3].part, 0)}} | {{etats.blessures.gravites[3].jours_min}} à {{etats.blessures.gravites[3].jours_max}} jours |

Au retour, le joueur a {{pct(etats.fatigue.fatigue_retour_de_blessure, 0)}} de condition et une forme de {{etats.blessures.forme_retour_de_blessure}} : il lui faut quelques jours et quelques matches pour retrouver son rendement.

**Séquelles.** Une blessure d'au moins {{etats.blessures.penalite_permanente.duree_minimale_jours}} jours chez un joueur de {{etats.blessures.penalite_permanente.age_minimal}} ans ou plus lui coûte définitivement de {{etats.blessures.penalite_permanente.points_min / 5}} à {{etats.blessures.penalite_permanente.points_max / 5}} point sur 20 en vitesse et en endurance.

Les blessures sont communes au club et à la sélection : un joueur blessé en sélection manque les matches de son club.

## Suspensions

- **Rouge direct** : {{etats.suspensions.matches_rouge_min}} à {{etats.suspensions.matches_rouge_max}} matches, tirés au sort.
- **Deux jaunes dans le même match** : {{etats.suspensions.matches_double_jaune}} match.
- **Cumul de cartons jaunes** dans une même compétition, sur la saison :

| Cartons jaunes cumulés | Matches de suspension |
|---:|---:|
{{#chaque etats.suspensions.seuils_cumul_jaunes}}| {{jaunes}} | {{matches}} |

Quand plusieurs sanctions tombent sur le même match, seule la plus longue s'applique.

Une suspension est **propre à la compétition** où elle a été prise : un joueur suspendu en championnat peut jouer en coupe et en coupe d'Europe. Elle se purge au fil des matches de son club dans cette compétition. Les compteurs de cartons jaunes repartent de zéro à l'ouverture de chaque saison.

Les sélections ont leurs propres compteurs, séparés de ceux des clubs (voir [Sélections nationales](#/aide/selections)).
