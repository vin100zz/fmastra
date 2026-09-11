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
entre bloc bas, équilibré et pressing haut selon la hauteur effective.

Récupération quotidienne = vitesse de base + coefficient × endurance normalisée,
modulée par la classe d'âge. Borner à [0, 1]. Mettre à jour aux paliers de match
configurés et aux passages de jour, sans récupérer deux fois un même jour.
Un joueur blessé n'est pas sélectionnable ; à la guérison, réinitialiser sa
fraîcheur et sa forme avec les valeurs de retour configurées, une seule fois.

Avec un seul championnat et sept jours entre journées, la récupération ramène
souvent les joueurs à pleine fraîcheur : ne pas promettre une rotation forte
par la fatigue seule en v1. Blessures, suspensions, remplacements et profondeur
de l'effectif restent utiles ; le calendrier congestionné renforcera ensuite
ce mécanisme. Ne pas ajouter artificiellement des matches hors périmètre.

## Blessures

À chaque possession, choisir un joueur impliqué nommé, parmi les joueurs de
champ des deux équipes pondérés par leur implication dans la zone pertinente
(et le gardien lorsqu'il intervient dans l'action). Évaluer une seule fois le
risque de base × (facteur de fatigue - fraîcheur) × fragilité × intensité.
Borner la probabilité. La fragilité est tirée à l'import ou à la génération,
conservée et sauvegardée ; les consultations ne la retirent pas.

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

Les fautes/cartons sont attribués à un défenseur nommé dans le repère miroir.
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
retour de blessure. Le calcul du barème est dans `moteur_match.notes_joueurs`.

Moral : cible pondérée du temps de jeu, des résultats du club et de la
satisfaction contractuelle, chaque composante normalisée à [0, 1], puis dérive
vers cette cible. Les attentes de minutes sont proratisées aux matches déjà
joués ; sans attente, employer une valeur neutre. L'effet en match vaut
1 + amplitude × (2 × moral - 1), borné par construction à l'amplitude configurée.
Le moral alimente aussi les demandes de contrat et de départ.
