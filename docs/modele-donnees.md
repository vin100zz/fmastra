# Modèle de données et import

## Périmètre et volumes

L'export actuel contient 1 394 clubs et 14 404 joueurs. Les divisions sont
identifiées par `DivisionUID` : 96 clubs actifs, 2 880 joueurs actifs,
11 338 joueurs dans les 1 298 clubs dormants et 186 agents libres.
Les clubs dormants participent au marché et à la génération de joueurs, sans matches.
Ces volumes sont des observations, pas des constantes du moteur.

## Sélection : les 30 meilleurs de chaque club

Importer les attributs fournis, calculer leur moyenne pondérée selon le poste
principal et conserver jusqu'à 30 joueurs par club. Réserver deux places aux
meilleurs gardiens disponibles, puis compléter par note décroissante, départagée
par ID croissant. Tous les agents libres sont conservés. L'ordre du CSV ne
modifie pas les résultats. Le nouvel export est déjà plafonné à 30 joueurs
par club : aucun joueur n'est écarté actuellement. Les CSV restent inchangés.

## Contrat de lecture et de normalisation

CSV UTF-8 (BOM accepté), séparateur `;`, dates `YYYY-MM-DD`.
Lier `players.ClubUID` à `clubs.UID`, jamais par nom. Un ClubUID vide ou -1
indique un agent libre, sans contrat. Une DivisionUID absente indique un club dormant.
La date initiale reste le 1er juillet 2025, définie par la configuration.

- Clubs : UID, ShortName (Name en repli), Nation, DivisionUID, StadiumCapacity,
  TrainingFacilities, YouthRecruitment, HomeKitID, HomeKitMajorColorRGB,
  HomeKitMinorColorRGB et HomeKitThirdColorRGB.
- Joueurs : UID, Name, FirstName, LastName, CommonName, Nation, Position,
  ClubUID, WeeklyWage, Value, DateOfBirth, ContractEnd, CurrentAbility,
  PotentialAbility, les attributs et les colonnes Position_* ci-dessous.
- Utiliser WeeklyWage et Value, qui sont les montants affichés en euros dans
  l'export, et non les colonnes Raw dans l'unité interne de la source.
- Un salaire nul sous contrat reçoit le salaire attendu. Une échéance absente
  devient le prochain 30 juin futur ; une échéance expirée est avancée par années.
- Capacité inconnue : garder None pour l'affichage et un repli pour les finances.
- Plusieurs nationalités sont conservées. Les nouveaux libellés sont normalisés
  dans `infrastructure/importation/nations.py`, en conservant les codes existants.
  Un pays inconnu bloque l'import au lieu d'être deviné.
- CommonName prime pour l'affichage. FirstName et LastName servent à l'identité
  et au réservoir de noms des regens. Les dates de naissance restent celles du CSV.

## Attributs et progression

Le moteur utilise 13 attributs. Chacun vient directement de la note source sur
20, multipliée par 5 pour le stockage interne sur 100, puis réaffichée sur 20.
Aucune génération ni recentrage à partir de Value ou WeeklyWage n'est appliqué.
Les autres attributs de l'export ne sont pas encore utilisés par le moteur.

| Attribut du moteur | Colonne CSV |
|---|---|
| passe | Passing |
| technique | Technique |
| finition | Finishing |
| tacle | Tackling |
| jeu_tete | Heading |
| vision | Creativity |
| placement | Positioning |
| sang_froid | Composure |
| vitesse | Pace |
| endurance | Stamina |
| reflexes | Reflexes |
| sorties | RushingOut |
| relance | Kicking |

Les notes doivent être dans [1,20]. CA et PA doivent satisfaire
`1 <= CurrentAbility <= PotentialAbility <= 200` ; une valeur invalide bloque
l'import avec l'identifiant du joueur et le champ concerné.
La note globale du jeu reste la moyenne pondérée des attributs selon le poste.
Le potentiel interne est `min(100, note_globale + (PA - CA) / 2)`.
Ainsi CA=PA ne laisse aucune marge ; un écart de 20 laisse 10 points de marge
sur 100. La progression mensuelle existante consomme cette marge selon l'âge
et le temps de jeu, avec le plafond habituel. CA et PA d'origine sont conservés
dans la sauvegarde mais le potentiel exact reste masqué dans l'API publique.

## Aptitudes par poste

Les colonnes Position_* sont lues sur 20 ; l'affinité du moteur vaut note / 20,
y compris pour le poste principal. Le poste ayant la meilleure aptitude devient
principal ; le libellé Position départage les égalités de façon stable.
Les notes sont visibles sur la fiche joueur.
DefenderCentral et Sweeper sont regroupés en DC ; DefenderLeft/Right et
WingbackLeft/Right en DL/DR ; MidfielderLeft/Right et AttackingMidfielderLeft/Right
en AILG/AILD. Chaque regroupement prend la meilleure note. Les autres rôles ont
une correspondance directe. FreeRole n'est pas un poste du moteur.

## Installations et regens

TrainingFacilities et YouthRecruitment sont conservés et affichés sur 20.
Les valeurs -1, 0 ou absentes signifient inconnues (tiret dans l'UI).
TrainingFacilities n'a aucun effet sur la progression, les finances ou les regens.

HomeKitID et les trois couleurs RGB du maillot domicile (HomeKitMajorColorRGB,
HomeKitMinorColorRGB, HomeKitThirdColorRGB) sont conservés tels quels pour
l'affichage ; ce sont des couleurs hexadécimales (`#RRGGBB`), sans effet sur
la simulation. Absents pour certains clubs (colonnes vides dans l'export,
soit `HasHomeKitData=False`), ils restent alors None plutôt que devinés.

Pour un regen rattaché à un club actif ou dormant, le potentiel est tiré autour de
`moyenne_base + poids_reputation * reputation + poids_note_centre * YouthRecruitment * 5`,
avec le bruit configuré. À réputation et effectif égaux, un meilleur recrutement
augmente donc la probabilité de former de très bons jeunes sans garantir un résultat.
Une donnée absente à l'import utilise un repli neutre de 50/100 ; les anciennes
sauvegardes sans ce champ utilisent leur ancienne note de centre.
Les cohortes restent bornées par la population et les places disponibles.

La réputation et les finances demeurent estimées. Les paramètres de synthèse
joueur dans import.json sont conservés pour relire les anciennes configurations,
mais ne sont plus utilisés par l'import actuel.

Les nouvelles données s'appliquent aux nouvelles parties. Les sauvegardes de
versions 1 à 3 restent lisibles ; leurs attributs ne sont pas remplacés à la lecture
et les installations absentes restent inconnues. Les nouvelles sauvegardes sont
au format 5 et conservent CA, PA, aptitudes et installations. Le format 4 reste lisible. Les mouvements conservent désormais la date de naissance ; les promotions archivent aussi les notes, la fourchette de potentiel observée, les nationalités et les informations contractuelles à la promotion. Une ancienne fiche absente n'est pas reconstituée artificiellement.

## Entités et état à conserver

Les noms d'implémentation sont anglais, avec types partout et
`dataclass(slots=True)`. Les attributs restent fractionnaires en mémoire ;
seul l'affichage les arrondit, afin de conserver les petites progressions.

| Entité | Éléments indispensables |
|---|---|
| `Player` | ID, identité d'affichage et décomposée, nationalités, naissance, poste et affinités, attributs, potentiel privé, fraîcheur, forme, moral, fragilité et ego stables, club, contrat, blessure, compteurs disciplinaires, estimations par observateur |
| `Contract` | salaire hebdomadaire entier, signature et échéance, rôle/temps de jeu attendu, origine réelle ou synthétique |
| `Club` | ID, noms, nation, division source, compétition simulée optionnelle, statut, capacité connue ou absente, réputation, centre, formation, personnalité, revenus de référence et facteur initial de financement, budget, plafond salarial, solde, kit domicile (ID et couleurs, optionnels) |
| `ClubPersonality` | goût du risque, préférence jeunes, agressivité salariale, patience ; tirés une fois |
| `Competition` | ID, pays, niveau, clubs, journées, références aux règles |
| `Match` | ID, compétition, journée, date, clubs, résultat optionnel |
| `MatchResult` | moteur utilisé et détail disponible, score, compositions initiales et bancs, rôles, événements horodatés et ordonnés, statistiques et notes éventuelles |
| `World` | date, saison, joueurs, clubs, compétitions, matches, historique, négociations, objectifs démographiques, cohorte en attente, ID suivant, graine et états RNG, configuration effective et empreinte |

Une suspension contient sa compétition, son nombre de matches restant et sa
date d'effet. Les compteurs jaunes et seuils déjà sanctionnés sont séparés.
Les dates de contrat sont inclusives : un contrat au 30 juin se termine après
cette journée. L'expiration quotidienne libère le joueur le lendemain ; le
rendez-vous du 1er juillet regroupe les échéances usuelles, sans ignorer les
contrats expirant à d'autres dates.

## Validation

Avant sélection : schéma CSV, IDs uniques, références clubs, dates de naissance,
nations et postes reconnus. Après sélection :

- Club actif : au moins 18 joueurs sous contrat, dont deux gardiens ; au plus 30.
- Club dormant : peut être incomplet ; jamais plus de 30 joueurs importés.
- Bon nombre de clubs dans chaque compétition ; aucune association en double.
- Attributs dans [1, 100], potentiel au moins égal à la note initiale, état valide.
- Salaire initial couvert par le plafond financé ; tous les replis journalisés.

Un import ne peut pas libérer implicitement des joueurs pour satisfaire les
contrôles. Rapporter effectifs source/retenus/écartés, agents libres, corrections,
financement synthétique et empreintes des sources. Aucun invariant de validation
ne compare le nombre importé à un ancien ordre de grandeur de 2 400 joueurs.

## Calendrier et ordre du jour

Chaque championnat produit des aller-retour avec une réception et un déplacement
contre chaque autre club. Les dates candidates sont espacées du minimum
`jours_entre_journees`, entre le début et la fin de saison configurés ; répartir
les journées aussi régulièrement que possible sur ces dates. Les journées
libres sont possibles : ne pas imposer simultanément un intervalle strict de
sept jours et une date finale incompatible. Refuser une fenêtre trop courte.
Le départage applique les critères configurés, puis un départage stable par ID
si l'égalité persiste. Ces règles communes simplifiées ne prétendent pas
reproduire les règlements spécifiques des cinq pays.

Ordre quotidien : expirations et guérisons, clôtures/ouvertures de saison si
nécessaire, retraites et budgets au bilan annuel, calcul et allocation des
cohortes, décisions de contrats/mercato, matches, états et statistiques,
comptabilité, publication d'une vue cohérente puis autosauvegarde. La progression
mensuelle consomme les minutes du mois terminé avant remise à zéro du compteur.
Chaque échéance garde une marque de dernière exécution pour ne pas être rejouée
après chargement. Le premier jour d'une partie n'exécute pas un bilan annuel
fictif : ses cibles viennent de l'import, sans cohorte additionnelle.

## Historique et persistance

Garder le détail des matches de la saison courante et précédente, puis les
scores, classements et agrégats. Une carrière est agrégée par **joueur, saison,
club et compétition** : un transfert en cours de saison produit plusieurs lignes.
Conserver minutes, buts, passes, cartons, somme des notes et nombre de notes
pour calculer les moyennes sans moyenne de moyennes.

Conserver les transferts, palmarès, retraites et une trajectoire annuelle des
attributs. Archiver les retraités sous forme compacte ; ils ne restent pas dans
les boucles de progression ou de recherche des joueurs disponibles.

JSON gzippé avec `schema_version`, sérialisation explicite, migrations testées,
configuration complète et états RNG. Autosauvegarde après chaque journée de jeu
validée, slots multiples. Les sauvegardes atomiques et la reprise déterministe
sont décrites dans `docs/architecture.md`. Les benchmarks incluent les I/O
lorsqu'ils mesurent l'avancement complet ; proposer aussi une mesure sans I/O.

Fichiers d'identité à produire avant les regens : listes pondérées de noms et
prénoms par nation et table des nations. Les tirer des identités source
exploitables ; déclarer les replis pour les nations trop peu représentées.
L'unicité est portée par l'ID, pas par le nom : les homonymes sont autorisés.
