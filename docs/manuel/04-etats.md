# Forme, moral et condition physique

## Le multiplicateur d'état

En match, tout ce que fait un joueur (sa part dans les notes de zone, ses tirs, ses arrêts) est multiplié par quatre facteurs :

```
état = forme × condition × (1 + {{etats.moral.amplitude_effet_match}} × (2 × moral − 1)) × ({{attributs.malus_hors_poste.base}} + {{attributs.malus_hors_poste.facteur}} × affinité ÷ 20)
```

| Facteur | Plage | Poids en match |
|---|---|---|
| Forme | {{etats.forme.min}} à {{etats.forme.max}} | De {{pct(etats.forme.min - 1, 0)}} à +{{pct(etats.forme.max - 1, 0)}} |
| Condition | 0 % à 100 % | Directement proportionnel : à 70 %, le joueur ne vaut plus que 70 % de lui-même |
| Moral | 0 % à 100 % | De −{{pct(etats.moral.amplitude_effet_match, 0)}} à +{{pct(etats.moral.amplitude_effet_match, 0)}} |
| Affinité au poste | 0 à 20 | De {{pct(attributs.malus_hors_poste.base - 1, 0)}} à 0 (voir [Postes et affinité](#/aide/joueurs/postes-et-affinite)) |

La condition est de loin le facteur le plus lourd, la forme vient ensuite, le moral pèse peu en match.

## La forme

La forme dit si un joueur traverse une bonne ou une mauvaise période. Elle commence à {{etats.forme.initiale}}. Les listes et la fiche du joueur l'affichent comme un pourcentage (+8 % pour une forme de 1,08) ; sur la fiche, une barre le situe entre les deux extrêmes.

**Ce qui la fait bouger.** Uniquement les matches où le joueur est noté, en club comme en sélection. Après chacun, la forme se rapproche d'une cible fixée par sa note :

```
cible = 1 + {{etats.forme.sensibilite_note}} × (note − {{etats.forme.note_reference}})
forme = forme + {{etats.forme.vitesse_convergence}} × (cible − forme) + un petit aléa
```

| Note du match | Forme visée |
|---:|---:|
| 5,0 | {{n(1 + etats.forme.sensibilite_note * (5 - etats.forme.note_reference), 2)}} |
| 6,5 | {{n(1 + etats.forme.sensibilite_note * (6.5 - etats.forme.note_reference), 2)}} |
| 7,5 | {{n(1 + etats.forme.sensibilite_note * (7.5 - etats.forme.note_reference), 2)}} |
| 8,5 | {{n(1 + etats.forme.sensibilite_note * (8.5 - etats.forme.note_reference), 2)}} |
| 10 | {{n(1 + etats.forme.sensibilite_note * (10 - etats.forme.note_reference), 2)}} |

Chaque match comble {{pct(etats.forme.vitesse_convergence, 0)}} de l'écart : il faut plusieurs bonnes notes d'affilée pour installer une grande forme, et autant de mauvaises pour la perdre.

- Un joueur qui ne joue pas garde sa forme telle quelle : elle ne revient pas d'elle-même vers 1.
- Un retour de blessure remet la forme à {{etats.blessures.forme_retour_de_blessure}}.
- La forme s'entretient : un joueur en forme est plus efficace, donc mieux noté, donc reste en forme. L'inverse est vrai aussi, et le seul moyen d'en sortir est de rejouer.

**Son impact.** Multiplicateur direct en match. L'IA en tient compte pour composer son équipe, et les sélectionneurs pour leurs listes.

## Le moral

Le moral mesure si un joueur est content de sa situation dans son club. Il commence à {{pct(etats.moral.initial, 0)}}.

**Ce qui le fait bouger.** Tous les {{ia_gestion.mercato.weekly_review_days}} jours, le moral de chaque joueur sous contrat fait {{pct(etats.moral.vitesse_derive, 0)}} du chemin vers un moral visé (la moitié du chemin en {{n(log(0.5) / log(1 - etats.moral.vitesse_derive), 0)}} semaines environ) :

```
moral visé = {{pct(etats.moral.poids_temps_de_jeu + etats.moral.poids_resultats_club * ia_gestion.contrats.poids_temps_de_jeu, 0)}} × temps de jeu
           + {{pct(etats.moral.poids_satisfaction_contrat + etats.moral.poids_resultats_club * ia_gestion.contrats.poids_salaire, 0)}} × salaire
           + {{pct(etats.moral.poids_resultats_club * ia_gestion.contrats.poids_club, 0)}} × standing du club
           − {{pct(ia_gestion.mercato.poids_frustration_moral, 0)}} × frustration
```

Chacun des quatre termes va de 0 à 1.

- **Temps de jeu** : ses minutes de la saison rapportées à celles qu'il attend. Il attend d'autant plus qu'il est bien classé à son poste dans l'effectif : le meilleur à son poste attend tous les matches du club, le deuxième la moitié, le troisième le tiers. Un joueur arrivé en cours de saison n'attend rien des matches joués avant sa venue : seuls comptent ceux du club depuis son arrivée, et les minutes qu'il y a jouées. Avant le premier match de la saison, tout le monde est satisfait. Un joueur placé en réserve ne joue aucun match : il est pleinement satisfait s'il est jeune et ne serait pas titulaire, totalement insatisfait sinon (voir [La réserve](#/aide/reserve-et-prets/la-reserve)).
- **Salaire** : son salaire rapporté à celui que sa valeur lui fait attendre (voir [Valeur, salaires et contrats](#/aide/contrats/le-salaire-attendu)). Un joueur payé au-dessus n'est pas plus content qu'un joueur payé juste.
- **Standing du club** : la réputation du club rapportée à la moitié du niveau du joueur. Un joueur de niveau 150 est pleinement satisfait à partir d'une réputation de 75.
- **Frustration** : celle d'un joueur devenu trop fort pour son club. Un joueur prêté n'en a aucune : son club d'accueil n'est qu'une étape.

**La frustration.** Chaque club vise un niveau qui dépend de sa réputation : {{ia_gestion.profil_cible.niveau_base * 2}} + {{ia_gestion.profil_cible.poids_reputation * 2}} × réputation, soit {{n(ia_gestion.profil_cible.niveau_base * 2 + ia_gestion.profil_cible.poids_reputation * 100, 0)}} pour une réputation de 50 et {{n(ia_gestion.profil_cible.niveau_base * 2 + ia_gestion.profil_cible.poids_reputation * 160, 0)}} pour 80. Un joueur qui dépasse ce niveau de plus de {{ia_gestion.mercato.marge_depassement_club * 2}} points commence à s'impatienter :

```
frustration = ambition × (dépassement au-delà de la marge ÷ {{ia_gestion.mercato.ecart_frustration_maximale * 2}}), plafonnée à l'ambition
ambition = {{ia_gestion.mercato.ambition_base}} + {{ia_gestion.mercato.ambition_poids_ego}} × trait d'ambition
```

À partir d'une frustration de {{ia_gestion.mercato.seuil_depart_souhaite}}, le joueur **veut partir** : il ne prolonge plus et n'accepte qu'un club nettement plus réputé (voir [Le mercato des clubs](#/aide/mercato/ce-qu-un-joueur-accepte)). Jouer tous les matches avec un bon salaire ne suffit pas à le calmer.

**Ce qui ne joue pas.** Les résultats de l'équipe, les notes de match, la forme, les titres et les blessures n'ont aucun effet sur le moral. Un joueur libre garde le moral qu'il avait. Le moral d'un joueur prêté suit sa situation dans son club d'accueil.

**Son impact.**

- En match : de −{{pct(etats.moral.amplitude_effet_match, 0)}} à +{{pct(etats.moral.amplitude_effet_match, 0)}} sur tout ce qu'il fait.
- Sur le marché : à {{pct(ia_gestion.mercato.moral_depart_force, 0)}} ou moins, un joueur accepte de rejoindre un club moins réputé que le sien, ce qu'il refuserait autrement.

Dans l'effectif, la flèche à côté du moral indique vers où il dérive, et l'icône ce qui le tire le plus vers le bas : le salaire (€), le temps de jeu (◷) ou un club trop petit (★). La fiche du joueur porte la même icône devant la barre de son moral.

## La condition physique

La condition va de 0 % à 100 %. Les listes l'affichent dans la colonne ÉTAT ; l'écran de composition montre son complément, la fatigue.

**Ce qui la fait baisser.** Chaque minute jouée :

```
perte par minute = {{etats.fatigue.consommation_par_minute}} × effort du bloc ÷ ({{etats.fatigue.resistance_base}} + {{etats.fatigue.resistance_facteur_endurance}} × endurance ÷ 20)
```

L'effort du bloc vaut 1 pour un bloc neutre, {{etats.fatigue.intensite_par_hauteur_bloc.pressing_haut}} au pressing le plus haut, {{etats.fatigue.intensite_par_hauteur_bloc.bloc_bas}} au bloc le plus bas (voir [Hauteur de bloc et mentalité](#/aide/match/hauteur-de-bloc-et-mentalite)).

**Ce qui la fait remonter.** Chaque jour sans blessure :

```
récupération par jour = ({{etats.fatigue.recuperation_base_par_jour}} + {{etats.fatigue.recuperation_facteur_endurance}} × endurance ÷ 20) × facteur d'âge
```

Le facteur d'âge vaut {{etats.fatigue.facteur_age_jeune}} avant {{etats.fatigue.seuil_age_jeune}} ans, {{etats.fatigue.facteur_age_vieux}} après {{etats.fatigue.seuil_age_vieux}} ans, 1 entre les deux.

| Endurance | Perte en 90 minutes | Récupération par jour | Jours pour s'en remettre |
|---:|---:|---:|---:|
| 5 | {{pct(etats.fatigue.consommation_par_minute * 90 / (etats.fatigue.resistance_base + etats.fatigue.resistance_facteur_endurance * 0.25), 0)}} | {{pct(etats.fatigue.recuperation_base_par_jour + etats.fatigue.recuperation_facteur_endurance * 0.25, 1)}} | {{n(etats.fatigue.consommation_par_minute * 90 / (etats.fatigue.resistance_base + etats.fatigue.resistance_facteur_endurance * 0.25) / (etats.fatigue.recuperation_base_par_jour + etats.fatigue.recuperation_facteur_endurance * 0.25), 1)}} |
| 10 | {{pct(etats.fatigue.consommation_par_minute * 90 / (etats.fatigue.resistance_base + etats.fatigue.resistance_facteur_endurance * 0.5), 0)}} | {{pct(etats.fatigue.recuperation_base_par_jour + etats.fatigue.recuperation_facteur_endurance * 0.5, 1)}} | {{n(etats.fatigue.consommation_par_minute * 90 / (etats.fatigue.resistance_base + etats.fatigue.resistance_facteur_endurance * 0.5) / (etats.fatigue.recuperation_base_par_jour + etats.fatigue.recuperation_facteur_endurance * 0.5), 1)}} |
| 15 | {{pct(etats.fatigue.consommation_par_minute * 90 / (etats.fatigue.resistance_base + etats.fatigue.resistance_facteur_endurance * 0.75), 0)}} | {{pct(etats.fatigue.recuperation_base_par_jour + etats.fatigue.recuperation_facteur_endurance * 0.75, 1)}} | {{n(etats.fatigue.consommation_par_minute * 90 / (etats.fatigue.resistance_base + etats.fatigue.resistance_facteur_endurance * 0.75) / (etats.fatigue.recuperation_base_par_jour + etats.fatigue.recuperation_facteur_endurance * 0.75), 1)}} |
| 20 | {{pct(etats.fatigue.consommation_par_minute * 90 / (etats.fatigue.resistance_base + etats.fatigue.resistance_facteur_endurance), 0)}} | {{pct(etats.fatigue.recuperation_base_par_jour + etats.fatigue.recuperation_facteur_endurance, 1)}} | {{n(etats.fatigue.consommation_par_minute * 90 / (etats.fatigue.resistance_base + etats.fatigue.resistance_facteur_endurance) / (etats.fatigue.recuperation_base_par_jour + etats.fatigue.recuperation_facteur_endurance), 1)}} |

(Bloc neutre, joueur de {{etats.fatigue.seuil_age_jeune}} à {{etats.fatigue.seuil_age_vieux}} ans.)

Un blessé ne récupère pas pendant sa blessure et revient à {{pct(etats.fatigue.fatigue_retour_de_blessure, 0)}} de condition. La condition est partagée entre le club et la sélection : un international rentre avec la fatigue de ses matches.

**Son impact.**

- En match, c'est un multiplicateur direct, et il baisse au fil du match : un titulaire parti à 100 % finit autour de {{pct(1 - etats.fatigue.consommation_par_minute * 90 / (etats.fatigue.resistance_base + etats.fatigue.resistance_facteur_endurance * 0.5), 0)}}. Un remplaçant frais en fin de match vaut donc nettement plus que son niveau ne le laisse penser, et aligner un joueur à 75 % revient à lui retirer un quart de ses moyens dès le coup d'envoi.
- Le risque de blessure augmente quand la condition baisse (voir [Blessures et suspensions](#/aide/blessures)).
- L'IA met au repos un titulaire sous {{pct(ia_gestion.selection.seuil_rotation_fatigue, 0)}} si elle a un remplaçant proche, et remplace en match un joueur tombé sous {{pct(etats.remplacements.seuil_fatigue_declenchement, 0)}} (voir [L'entraîneur IA](#/aide/entraineur)).
