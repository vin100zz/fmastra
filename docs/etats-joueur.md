# Fatigue, blessures, suspensions, forme et moral

Les paramètres vivent dans `config/etats.json`, `moteur_match.json`,
`formations.json` et `monde.regles_match`. Les valeurs initiales de blessures
sont à calibrer sur les cibles annuelles, pas sur une cible concurrente par match.

## Fraîcheur

Le champ historique `fatigue` représente en fait la fraîcheur : 1 = frais,
0 = épuisé. Nom Python recommandé : `fitness`, libellé affiché « fraîcheur ».
Il multiplie les composites.

Consommation = minutes × consommation de base × intensité / résistance.
Résistance = base + coefficient × endurance normalisée. Interpoler l'intensité
entre bloc bas, équilibré et pressing haut selon la hauteur effective. Au poste
de gardien, la consommation est multipliée par le facteur gardien configuré :
un gardien se fatiguait autant qu'un joueur de champ et perdait près de 40 % de
sa qualité d'arrêt sur un match ; il en perd désormais quelques points. Cette
fatigue des gardiens portait la calibration des buts : la retirer seule faisait
tomber la suite `stats_match` de 1,54 à 0,96 but par équipe, la plupart dans le
premier quart d'heure, car un tireur fatigué affrontait un gardien frais. Le duel
tireur-gardien ignore donc la fraîcheur du tireur (`shots.py`) : 1,45 but par
équipe, répartis à peu près également entre les quarts d'heure, et la suite
`match` passe de 10 à 12 critères sur 15. Le crédit par arrêt des notes passe de
0,10 à 0,08, ce qui ramène la note moyenne des gardiens de 6,64 à 6,58.

Récupération quotidienne = part × (1 − fraîcheur), au moins le minimum configuré,
où part = base + coefficient × endurance normalisée, modulée par la classe
d'âge. Borner à [0, 1]. Mettre à jour aux paliers de match configurés et aux
passages de jour, sans récupérer deux fois un même jour. Un joueur blessé n'est
pas sélectionnable ; à la guérison, réinitialiser sa fraîcheur et sa forme avec
les valeurs de retour configurées, une seule fois.

Une récupération fixe par jour (schéma 30 et avant) donnait un effet binaire :
au-dessus d'environ 7/20 d'endurance, deux matches par semaine ne laissaient
aucune trace, en dessous la fatigue s'accumulait sans limite. La part du
déficit donne au contraire un équilibre qui baisse avec la fréquence des
matches et remonte avec l'endurance : environ 99 % pour un match par semaine,
85 à 95 % trois jours après un match complet. Une semaine ramène à pleine
fraîcheur. Mesuré d'août à novembre 2033 sur une partie (octobre 2026) : 96 % des
titularisations étaient à 100 % avant le changement ; trois jours après un match,
la fraîcheur moyenne au coup d'envoi passe de 98,4 % à 91,5 %, et une semaine
après de 100 % à 99,7 %. Les titularisations trois jours après un match baissent
de 12 % (rotation), le nombre de buts ne change pas.

Le facteur de fatigue des blessures passe de 1,9 à 1,2 : à 50 %, un joueur se
blesse 3,5 fois plus qu'à 100 % (1,6 fois avant). La probabilité de base
(0,0065) garde le total annuel dans la cible : 17,2 blessures par club et par
saison sur la suite `injuries` (18,2 avant, au-dessus du maximum de 18).

L'IA fait souffler un titulaire sous le seuil de rotation, ou qu'un match
complet laisserait sous ce seuil le jour d'un match européen qui suit
immédiatement (projection par la règle de récupération, bloc équilibré).

## Charge

La fraîcheur seule n'a pas de mémoire : sa récupération ne dépend que de son
niveau du moment. La charge (`Player.load`, schéma 32) garde celle des séries.
Après chaque match, club ou sélection, elle reçoit la fraîcheur dépensée divisée
par celle d'un match complet d'un joueur d'endurance moyenne en bloc équilibré
(`match_load`) ; chaque jour, blessé ou non, elle perd la part configurée
(`rested_load`), et tombe à zéro sous 0,05 pour ne pas changer chaque jour tous
les joueurs qui ont cessé de jouer. Au-delà du seuil, la part récupérée chaque
jour est divisée par `1 + ralentissement × dépassement`, et le risque de blessure
en match multiplié par `1 + facteur_charge × dépassement`. La perte quotidienne
fixe la fenêtre : à 5 %, la moitié d'une série est oubliée en deux semaines, et
un match par semaine plafonne à 3,3, sous le seuil de 3,5 ; seuls les calendriers
chargés le dépassent. La projection de l'IA (`projected_fitness`) en tient compte.

Calibré en octobre 2026 sur une saison entière d'une partie (2033-34, IA aux
commandes de tous les clubs). Avec un seuil de 4 et des effets de 0,25, la charge
ne mordait presque jamais : l'IA fait tourner son effectif, et les clubs
européens jouent surtout un match par semaine, un match européen toutes les deux
semaines environ, jusqu'à la phase finale. Seuil 3,5, ralentissement et facteur
de blessure 0,5 : les clubs sans coupe d'Europe ne changent pas (0,3 % des
titularisations au-dessus du seuil, avec ou sans charge) ; les clubs européens
en ont jusqu'à 10 % en février, et ces joueurs démarrent à 85 % trois jours
après un match au lieu de 89 %. Un joueur d'endurance 10 qui jouerait les 51
matches du club de l'utilisateur tombe à 79-83 % au coup d'envoi dans les séries
de janvier-février et de mai, contre 86-90 %. Au-delà d'une charge de 4, on
compte 66 blessures pour 1 000 titularisations contre 48 sans charge ; le total
de la saison ne change guère (3 187 blessures en match contre 3 224), les buts
non plus (−0,7 %).

## Blessures

À chaque possession, choisir un joueur impliqué nommé, parmi les joueurs de
champ des deux équipes pondérés par leur implication dans la zone pertinente
(et le gardien lorsqu'il intervient dans l'action). Évaluer une seule fois le
risque de base × (facteur de fatigue - fraîcheur) × fragilité × intensité.
Borner la probabilité. La fragilité vient, à l'import, de la note `InjuryProneness` (convertie de façon à
conserver la moyenne de 1,2) ; les regens la tirent à la génération. Elle est conservée
et sauvegardée ; les consultations ne la retirent pas.

Hors match, effectuer le tirage quotidien configuré pour les joueurs actifs
non blessés, y compris les remplaçants. Le régime dormant/libre ne simule pas
les blessures en détail en v1. En cas de transfert, une blessure déjà acquise
conserve sa date de guérison et sa pénalité éventuelle.

Gravités initiales :

| Gravité | Part | Durée en jours |
|---|---:|---:|
| Légère | 58 % | 3–10 |
| Moyenne | 34 % | 14–42 |
| Grave | 7 % | 61–150 |
| Très grave | 1 % | 180–365 |

La date de guérison est exclusive de l'indisponibilité : retour possible à
partir de cette date. Une seule blessure active ; pas d'empilement de tirages
quotidiens sur un joueur indisponible. Appliquer une seule fois la pénalité
permanente configurée pour longue durée et âge élevé, en marquant son application.

Cibles de calibrage **toutes blessures actives confondues** :

| Métrique | Cible |
|---|---:|
| Blessures par club et par saison | 12–18 |
| Part hors match | 15–20 % |
| Indisponibles simultanés, moyenne quotidienne par club | 1–2,5 |
| Blessures longues (> 60 jours) par club et par saison | 0,8–1,5 |

La cible ancienne de 1,1 blessure par match est supprimée : elle dépassait à
elle seule la cible annuelle. Ajuster fréquence et gravité ensemble ; rapporter
également la distribution de jours perdus et les pics d'indisponibilité.

## Cartons et suspensions

Les fautes/cartons sont attribués à un joueur de champ nommé de l'équipe qui défend,
dans le repère miroir, tiré selon son implication défensive et son agressivité
(`docs/attributs.md`, traits stables). Le gardien n'est jamais tiré s'il reste un
joueur de champ.
Les probabilités sont dans le moteur ; jaune et rouge direct sont des issues
exclusives d'un même tirage. Un second jaune provoque une expulsion, distincte
d'un rouge direct dans les statistiques mais incluse dans le total des expulsions.

Conserver, pour chaque joueur et compétition :

- jaunes du match courant ;
- jaunes cumulés de la saison ;
- seuils de cumul déjà sanctionnés ;
- sanctions en attente et nombre de matches restant.

Ne pas remettre le cumul saisonnier à zéro au seuil de cinq. Le seuil de dix
reste alors atteignable ; chaque seuil ne déclenche qu'une seule sanction.
Les deux jaunes d'un match comptent dans le cumul saisonnier. Si plusieurs
motifs surviennent dans le même match, retenir le maximum de leurs durées selon
la règle simplifiée configurée, plutôt que les compter plusieurs fois.

La suspension porte un `competition_id`. Décrémenter uniquement après un match
effectivement joué ou déclaré forfait par le **club du joueur** dans cette
compétition, si la sanction était déjà active au coup d'envoi. Ne pas purger
une nouvelle sanction dans le match où elle est infligée ; un match reporté
ne compte pas. Le transfert ne supprime pas la sanction : elle reste attachée
à sa compétition. Remettre les compteurs jaunes à zéro en fin de saison, mais
conserver les suspensions restant à purger.

## Expulsion, blessure et remplacement

Une expulsion retire immédiatement le joueur et interdit son remplacement.
Recalculer les zones, appliquer la baisse de bloc configurée ; pas de malus
numérique supplémentaire qui ferait double emploi avec la perte de densité.

Une blessure exige une sortie immédiate à toute minute, y compris avant la
première évaluation tactique. Remplacer si le quota et les fenêtres le permettent ;
sinon poursuivre à moins de joueurs. Si le gardien sort, donner priorité au
gardien du banc, en sortant un joueur de champ si le gardien a été expulsé.
Sans remplacement possible, réaffecter le joueur présent ayant le meilleur
composite de gardien, avec les attributs et malus de poste habituels.

Évaluer les changements tactiques toutes les cinq minutes à partir de la minute
configurée. Priorités : blessure, fraîcheur faible, averti fatigué en défense,
équipe menée en fin de match, économie d'un cadre si avance suffisante.
Maximum de joueurs remplacés et fenêtres dans `monde.regles_match`. Une fenêtre
peut contenir plusieurs changements ; la mi-temps ne consomme pas une fenêtre
de jeu. Une composition ne peut réintroduire un joueur déjà sorti.

Le nombre minimal de joueurs pour commencer ou poursuivre et les forfaits
sont dans les règles de match. Un banc incomplet est autorisé, sans génération
spontanée de joueurs pour le remplir.

## Forme et moral

La forme suit un retour à une cible issue de la dernière note, avec bruit et
bornes configurés. Un joueur non noté ne reçoit pas une note artificielle de
zéro ; conserver sa forme jusqu'à une prochaine performance notée ou son
retour de blessure. Le calcul du barème est dans `moteur_match.notes_joueurs`
(`docs/moteur-match.md`, « Notes des joueurs »).

Moral : cible pondérée du temps de jeu, des résultats du club et de la
satisfaction contractuelle, chaque composante normalisée à [0, 1], puis dérive
vers cette cible. Les attentes de minutes sont proratisées aux matches déjà
joués ; pour un joueur arrivé en cours de saison, aux matches du club depuis
son arrivée, face aux minutes qu'il y a jouées (`season_arrivals`). Sans
attente, employer une valeur neutre. L'effet en match vaut
1 + amplitude × (2 × moral - 1), borné par construction à l'amplitude configurée.
Le moral alimente aussi les demandes de contrat et de départ. La cible du moral
retranche en outre la frustration d'ambition du joueur dont le club est en dessous
de son niveau (`docs/ia-gestion.md`, « Ambition »).
