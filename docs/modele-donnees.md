# Modèle de données et import

## Périmètre et volumes

L'export actuel contient 1 394 clubs et 14 404 joueurs. Les divisions sont
identifiées par `DivisionUID` : 216 clubs actifs dans 11 compétitions, 6 405 joueurs
actifs après complément, 7 849 joueurs dans les 1 178 clubs dormants et 186 agents libres.
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

Le moteur utilise 15 attributs. Chacun vient directement de la note source sur
20 (la moyenne de deux notes pour `cpa`), multipliée par 5 pour le stockage interne
sur 100, puis réaffichée sur 20.
Aucune génération ni recentrage à partir de Value ou WeeklyWage n'est appliqué.
Trois autres colonnes alimentent des traits stables du joueur : `InjuryProneness`
(fragilité), `Ambition` (ego), `Aggression` et `Dirtiness` (agressivité), voir
`docs/attributs.md`. Les autres attributs de l'export ne sont pas utilisés par le moteur.

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
| centre | Crossing |
| cpa | moyenne de Corners et FreeKicks |

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

Un regen est tiré sans club (nation, âge, classe de potentiel), puis placé : les meilleurs
regens choisissent en premier, de préférence un club de leur pays et un centre à fort
YouthRecruitment (voir `docs/progression-demographie.md`, sections Génération et
Placement). À réputation et effectif égaux, un meilleur recrutement augmente donc la
probabilité de former de très bons jeunes sans garantir un résultat, et il n'accroît pas
le nombre total de regens. Une donnée absente à l'import utilise un repli neutre de
50/100 ; les anciennes sauvegardes sans ce champ utilisent leur ancienne note de centre.
Seul un club qui complète son propre effectif tire encore son potentiel autour de son
académie. Les cohortes restent bornées par la population et les places disponibles.

La réputation provient de `Reputation`, divisée par 100 pour l'échelle du moteur. Elle sert d'ancre à une
révision annuelle (`docs/reputation.md`) ; `Club.reputation_anchor` la conserve, `World.reputation_ceilings`
fige la médiane de chaque division et `World.reputation_history` garde la valeur de chaque saison.
Les finances demeurent estimées. Les paramètres de synthèse
joueur dans import.json sont conservés pour relire les anciennes configurations,
mais ne sont plus utilisés par l'import actuel.

Les nouvelles données et la pyramide de championnats demandent une nouvelle partie.
Les sauvegardes actuelles restent au format 5 et incluent la configuration du monde
version 3, CA, PA, aptitudes, installations et division courante des clubs.
Les migrations historiques des entités restent présentes, mais les anciennes
configurations sans règles de promotion ne sont pas compatibles. Les mouvements
conservent la date de naissance ; les promotions de jeunes archivent aussi les notes,
la fourchette de potentiel observée, les nationalités et les informations contractuelles.
Une ancienne fiche absente n'est pas reconstituée artificiellement.

## Entités et état à conserver

Les noms d'implémentation sont anglais, avec types partout et
`dataclass(slots=True)`. Les attributs restent fractionnaires en mémoire ;
seul l'affichage les arrondit, afin de conserver les petites progressions.

| Entité | Éléments indispensables |
|---|---|
| `Player` | ID, identité d'affichage et décomposée, nationalités, naissance, poste et affinités, attributs, potentiel privé, fraîcheur, forme, moral, fragilité, ego et agressivité stables, club, contrat, blessure, compteurs disciplinaires, estimations par observateur |
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
contre chaque autre club. Les dates candidates suivent `jours_entre_journees`,
entre le début et la fin de saison configurés. Si nécessaire, des créneaux à
mi-intervalle sont ajoutés pour les grandes divisions ; les journées sont réparties
aussi régulièrement que possible. Un championnat impair comporte une exemption
par journée. Refuser une fenêtre trop courte même avec ces créneaux supplémentaires.
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

Au 1er juillet, `promotion_event` calcule tous les mouvements sur les classements
terminés puis `DivisionsChanged` les applique avant les nouveaux calendriers.
La réserve de chaque pays est identifiée par les `division_ids` configurés, sans
filtrage par nationalité du club. Le tirage de trois clubs sans remise utilise un
flux dérivé de la graine, de l'année et du pays, avec poids `max(1, réputation)²`.
La `source_division_id` reste l'origine importée ; `division_id` suit la division
courante, même hors simulation. Les clubs relégués rejoignent le premier groupe
de la réserve commune et sont éligibles dès l'été suivant. Les archives reconstruisent
les participants à partir des rencontres de leur saison, jamais de l'effectif actuel
du championnat. La configuration du monde passe en version 3 : nouvelle partie requise.

## Historique et persistance

Garder le détail des matches de la saison courante seulement. À l'ouverture de la
saison suivante, tous les matches terminés (championnats, coupes nationales et
coupes d'Europe) sont archivés : score, statut et, pour les rencontres à élimination,
vainqueur et tirs au but, que la validation du monde relit au chargement. Compositions,
statistiques, notes et renforts temporaires du match sont alors abandonnés.

Même dans la saison courante, seuls les événements qu'une vue peut afficher sont
stockés : possession, perte de balle, corner et coup franc sont retirés à
l'application du match (`TRANSIENT_EVENT_KINDS`). Les statistiques d'équipe
comptent déjà corners et coups francs ; buts, tirs, cartons, remplacements,
blessures et tirs au but restent stockés.

Une carrière est agrégée par **joueur, saison,
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
