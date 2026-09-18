# Coupes d’Europe

Une nouvelle partie crée la Ligue des champions (C1), la Ligue Europa (C3) et
la Conference League (C4). Les trois utilisent volontairement le même format.
Les sauvegardes créées avec cette version conservent les quotas importés, les
participants, les dates, les résultats, les liens entre manches et les tirages.
La migration des parties antérieures à cette fonctionnalité n’est pas prévue.

## Qualifications

Le fichier UTF-8 `data/qualifs_europe.csv` possède les colonnes `Pays;C1;C3;C4`.
Une cellule vide correspond à zéro place. Chaque colonne totalise 36 places.
Le lecteur traduit les codes des associations vers les codes internes, notamment
SLO/SVN et les codes internes de Chypre, Arménie, Azerbaïdjan, Moldavie et Lettonie.
Les équipes réserves sont exclues. L’association du championnat prime sur la
nationalité du club, comme pour les coupes nationales.

La première saison, les clubs des pays simulés sont tirés parmi leurs équipes
premières de D1. Dans les autres pays, le vivier contient les équipes premières
disponibles dans les données. Le tirage sans remise est pondéré par
`max(1, réputation)²` et attribue successivement les places C1, C3 puis C4.
Ce tirage est renouvelé chaque saison pour les pays non simulés.

À partir de la deuxième saison, les qualifications des pays simulés sont calculées
sur les classements achevés, avant les promotions et relégations :

1. Les premiers de D1 remplissent le quota C1.
2. Le vainqueur de coupe prend une place du quota C3, sauf s’il est déjà en C1.
   Les places C3 restantes reviennent aux meilleurs clubs de D1 non encore retenus.
3. Les meilleurs clubs de D1 encore disponibles remplissent le quota C4.

Ainsi, pour la France (3/2/1), un vainqueur de coupe classé huitième donne une
qualification C3 au quatrième et à lui-même, puis une qualification C4 au cinquième.
S’il est déjà en C1, les quatrième et cinquième vont en C3 et le sixième en C4.
Un vainqueur de coupe de division inférieure conserve son droit à la C3, même
s’il quitte les championnats simulés. Il n’existe aucun doublon entre compétitions,
aucune qualification automatique des tenants européens et aucun reversement.

## Phase de ligue

Les 36 participants sont répartis dans quatre chapeaux de neuf par réputation.
Chaque club affronte deux adversaires de chaque chapeau, un à domicile et un à
l’extérieur. Les huit adversaires sont distincts et appartiennent à une autre
association. Chaque journée comporte 18 matchs, sans exemption ni double match.

Le tirage construit des cycles au sein de chaque chapeau et deux appariements
distincts entre chaque paire de chapeaux. Il répartit ensuite les rencontres en
huit journées complètes. Les recherches sont reproductibles et limitées par
`draw_attempts` ; une impossibilité produit une erreur explicite.

Le classement ne tient compte que de ces huit journées : points, différence de
buts, buts marqués, puis identifiant du club pour départager une égalité parfaite.
Les huit premiers sont qualifiés directement, les places 9 à 24 vont en barrage,
et les places 25 à 36 sont éliminées.

## Élimination directe

Les barrages opposent par tirage les places 9–16 aux places 17–24 ; le premier
groupe reçoit au retour. Les huitièmes opposent les huit qualifiés directs aux
huit vainqueurs des barrages, avec retour chez les qualifiés directs.

Quarts et demi-finales : tirage intégral des adversaires et du domicile de l’aller.
Les clubs du même pays peuvent se rencontrer dès les barrages. Un nouveau tirage
est effectué après chaque tour, sans tableau fixé à l’avance. Les deux manches
d’une confrontation sont créées ensemble ; le retour référence l’identifiant
de l’aller. Seul le résultat du retour porte l’identifiant du qualifié.

Le score cumulé décide du qualifié, sans prime aux buts à l’extérieur. Une égalité
au cumul entraîne directement une séance de tirs au but, même si le score du
retour n’est pas nul. Les tirs au but restent séparés des scores et statistiques.
La finale est un match unique sur terrain neutre avec les mêmes règles de
départage. Le cas exceptionnel du double forfait reprend le tirage administratif
des coupes nationales lorsque le cumul ne départage pas les équipes.

## Calendrier et simulation

`config/monde.json`, section `europe`, définit le format, les dates cibles, les
jours de semaine, le repos minimal, les critères de classement et les tirages.
Six journées se déroulent de septembre à décembre, deux en janvier, puis les
barrages en février, les huitièmes en mars, les quarts en avril et les
demi-finales en mai. Les trois finales ont lieu le 30 mai.

Les créneaux européens et nationaux sont réservés avant le championnat, y compris
dans les divisions inférieures. Cela permet de respecter trois jours d’écart
pour tous les parcours possibles. Les championnats finissent au plus tard le
18 mai ; les finales nationales ont lieu le mercredi le plus proche du 24 mai.

Les matchs utilisent le moteur habituel : compositions, fatigue, blessures,
suspensions propres à la compétition, statistiques et comptes rendus. Les
renforts temporaires sont générés pour le match uniquement et ne deviennent
ni joueurs sous contrat ni statistiques de carrière. La participation européenne
n’active pas le championnat d’un club étranger. Aucune prime financière n’est ajoutée.

L’interface conserve les 36 lignes du classement sur la même page, distingue
les zones de qualification, sépare phase de ligue et phase finale et donne accès
aux éditions précédentes, buteurs et vainqueurs. Les calendriers de tous les
clubs, y compris étrangers, affichent les rencontres européennes.

## Vérification

Les tests couvrent les quotas, les chapeaux, les restrictions nationales, plusieurs
graines, sept années de calendrier, les doubles qualifications et vainqueurs de
coupe de division inférieure. Ils parcourent les 189 matchs d’une édition avec
scores contrôlés, vérifient les tirages après reprise et les passages de saison.
Une journée européenne est aussi jouée avec le moteur réel, puis sauvegardée
et rechargée. Les tests d’interface vérifient les trois coupes, les 36 lignes,
les archives et la séparation des scores du match, du cumul et des tirs au but.
