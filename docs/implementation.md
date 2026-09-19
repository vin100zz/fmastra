# État de l'implémentation — 12 septembre 2026

Touchline est une première version jouable en mode observateur. Lancer
`./run.ps1` depuis le dépôt puis ouvrir http://127.0.0.1:8011. La création
d'un univers importe les CSV locaux ; la reprise charge un slot de `saves/`.
Les commandes d'installation et de benchmark figurent dans le README.

## Fonctionnalités disponibles

- Import des 1 394 clubs et de 14 401 joueurs après sélection des 30 meilleurs
  par club, puis génération de 39 joueurs pour compléter les effectifs actifs.
  Deux places sont réservées aux gardiens, y compris lorsqu'ils manquent à la source.
  Les CSV d'origine ne sont pas modifiés.
- Onze championnats, 216 clubs actifs, 4 064 rencontres aller-retour par saison.
  Les autres clubs participent au marché extérieur sans disputer de rencontres.
- Composition automatique, moteur par possessions, tirs et xG, coups de pied
  arrêtés, cartons, blessures et remplacements. Un gardien expulsé peut être
  remplacé par le gardien du banc en faisant sortir un joueur de champ.
- Calendrier quotidien, récupération, forme, moral, suspensions, progression,
  déclin, contrats, retraite et renouvellement de la population.
- Marché avec offres persistantes, contre-offres, concurrence, réservation des
  budgets et contrôle des effectifs et salaires au moment de signer. Le bilan
  annuel déclenche un recrutement de joueurs libres si les minima manquent ;
  les gardiens sont prioritaires.
- Consultation des clubs, budgets, transferts, joueurs et carrières,
  classements, calendriers, statistiques, compositions et événements des matchs.
  Recherche, filtres, tri et pagination côté serveur ; interface adaptée au mobile.
- Sauvegardes JSON compressées atomiques, slots nommés, sauvegarde automatique
  mensuelle, après chaque commande d'avance et à l'arrêt du mode Auto (qui est
  un travail serveur unique, arrêté par un signal). Configuration effective et états
  des cinq générateurs aléatoires inclus ; lecture du schéma historique v1 et
  écriture du schéma v2. Une reprise garde les règles de sa sauvegarde.

Le serveur local utilise un seul processus et une file de commandes. Une
nouvelle partie ou un chargement ne remplace le monde courant qu'après succès.
Une erreur pendant une journée impose une reprise depuis une sauvegarde.
L'API ne révèle pas le potentiel réel : les fiches montrent une estimation
stable et leur consultation ne consomme pas d'aléatoire.

## Vérifications et mesures

Les rapports détaillés locaux sont dans `reports/`, exclus de Git. Les 40 tests
courants passent (46,42 secondes lors de la vérification complète). Les tests
couvrent l'import réel, le calendrier, l'affectation des postes, les contraintes
de transfert, les sanctions, l'API, les sauvegardes et une reprise déterministe
au passage d'un mois. `tools/verify.py` relance les tests puis les trois suites
de matchs et écrit son avancement dans `reports/verification.json`.
La reprise d'une sauvegarde a également été vérifiée dans le navigateur,
ainsi que l'affichage à 390 pixels et l'accès mobile à « Ma partie ».

Avec la configuration actuelle, 2 000 matchs synthétiques donnent les moyennes
suivantes par équipe et par match, sauf mention contraire :

| Mesure | Valeur | Plage cible | Résultat |
|---|---:|---:|---|
| Possessions | 110,23 | 100–120 | Conforme |
| Tirs | 13,25 | 12–14 | Conforme |
| xG | 1,343 | 1,30–1,50 | Conforme |
| Buts | 1,342 | 1,25–1,45 | Conforme |
| Jaunes | 1,981 | 1,75–2,25 | Conforme |
| Rouges | 0,059 | 0,05–0,08 | Conforme |
| Avantage domicile, différence de buts | 0,286 | 0,22–0,38 | Conforme |
| Part des buts sur coups de pied arrêtés | 26,19 % | 25–30 % | Conforme |
| Temps moyen par match | 16,61 ms | ≤ 20 ms | Conforme |

Source : `reports/final-match-statistics.json`. Le tournoi des six formations
comprend 5 760 matchs ; les six mesures restent entre 0,482 et 0,524 pour une
plage attendue de 0,45 à 0,55 (`reports/final-formations.json`).

Un exercice complet avec sauvegardes mensuelles et contrôles d'intégrité
termine au 1er juillet 2026 : 2 304 joueurs actifs, au moins 21 joueurs et
deux gardiens par club, aucun club actif à solde négatif. Temps mesuré :
163,7 secondes, sauvegarde mensuelle maximale : 4,39 secondes. Les objectifs
de performance restent dépassés. Les blessures atteignent 15,13 par club,
dont 15,08 % hors match ; l'indisponibilité moyenne reste légèrement trop
basse (0,947 joueur par club). Les arrivées estivales sont encore trop rares
(1,83 par club) et proviennent trop souvent de clubs dormants (44,66 %).
Source : `reports/final-world.json`. Les dérives nulles sur ce seul exercice
ne sont pas une preuve de stabilité ; l'horizon de validation échoue
explicitement, de même que la diversité des champions non mesurable en un an.

Les cinq confrontations de référence, à 1 000 répétitions chacune, valident
10 des 15 mesures. Restent hors cible : les nuls et défaites du PSG à domicile
contre Toulouse (15,4 % et 8,9 %), les défaites de Manchester City face à
Burnley (9,8 %), et les victoires/défaites de l'équipe à domicile du Clasico
(51,7 % et 22,2 %). Source : `reports/final-match-fixtures.json`. Les seuils
n'ont pas été élargis pour faire passer ces résultats.

## Limites et travail restant

La version n'est pas encore validée contre l'intégralité de la spécification
de calibrage. Les cibles sont des hypothèses, pas des statistiques historiques
vérifiées. Les attributs et finances sont synthétiques ; un nom de joueur réel
ne garantit pas la reproduction de son niveau réel.

- Affiner les confrontations de référence et compléter les diagnostics fins
  par zone, couloir et type de chance.
- Exécuter les campagnes longues à plusieurs graines : trente saisons pour
  la démographie, vingt-cinq pour l'économie, après stabilisation du moteur.
  Un test d'une ou trois saisons ne permet pas de conclure à leur stabilité.
- Revoir les distributions de postes, blessures, flux de mercato et niveaux
  sur ces campagnes. Le premier exercice comprend volontairement la transition
  des effectifs de 30 joueurs vers une cible nominale de 24.
- Poursuivre l'optimisation de la simulation annuelle et des sauvegardes.
  Un précédent essai de trois saisons, avant les dernières optimisations et
  avec d'autres calculs concurrents, mesurait 171 à 363 secondes par saison
  et jusqu'à 6,75 secondes par sauvegarde, au-delà des objectifs 40 s et 2 s.
  Il ne constitue pas une mesure de performance de la version actuelle.
- Compléter l'influence des personnalités des clubs et les changements de
  profil tactique des remplacements selon le score. Les choix actuels couvrent
  les rôles, disponibilités, fatigue, blessures et avertissements.
- Ajouter les instantanés d'effectifs de benchmark versionnés et une empreinte
  du code non commité : les rapports actuels enregistrent configuration,
  sources, graine, version Python et révision Git.

Le mode joueur, les coupes et les prêts restent hors périmètre. Les anciennes rencontres sont
compactées après deux saisons ; les résultats et archives de carrière restent
consultables, mais leur détail événementiel n'est pas conservé indéfiniment.
