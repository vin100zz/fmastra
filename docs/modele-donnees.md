# Modèle de données et import

## Périmètre actif, dormant et libre

Les cinq divisions sont identifiées par `Division ID`, jamais par leur nom.
Les 96 clubs actifs jouent leurs championnats et disposent de l'IA complète.
Les 26 663 autres clubs restent consultables et accessibles au mercato, sans
matches ni classement. Un club dormant peut être vide. Ses joueurs suivent
une progression simplifiée et ses finances une comptabilité allégée.
Un agent libre est un joueur sans club et sans contrat ; il appartient à une
population distincte, pas à un club dormant fictif.

Activer un club dormant est une opération validée et orchestrée, décrite dans
`docs/architecture.md`, pas une simple modification du statut.

## Volumes constatés

CSV cp1252, séparateur `;`, champs entre guillemets. Les nombres ci-dessous
excluent les en-têtes et concernent le jeu de données fourni.

| Population | Source | Après sélection |
|---|---:|---:|
| Joueurs des 96 clubs actifs | 7 276 | 2 880 |
| Joueurs des clubs dormants | 22 285 | 20 223 |
| Agents libres (`Club ID = -1`) | 2 808 | 2 808 |
| Total joueurs | 32 369 | 25 911 |

26 759 clubs sont conservés. Aucun identifiant club ou joueur n'est dupliqué.
Les clubs actifs ont tous entre 42 et 111 joueurs avant sélection et disposent
d'au moins deux gardiens. Le nombre de joueurs retenus est une observation,
pas une constante à imposer si le CSV change.

## Sélection : les 30 meilleurs de chaque club

La sélection est identique pour les clubs actifs et dormants :

1. Normaliser les lignes et synthétiser les attributs de chaque candidat avec
   un RNG dérivé de la graine de partie et de son ID. L'ordre du CSV ne doit
   pas influencer la synthèse ou la sélection.
2. Calculer la note globale non arrondie, pondérée selon le poste principal,
   à forme/fraîcheur/moral neutres, sans prendre le potentiel comme critère.
3. Réserver les deux meilleurs gardiens quand au moins deux sont disponibles ;
   s'il n'y en a qu'un, le réserver. Compléter jusqu'à 30 par note décroissante,
   en départageant les égalités par identifiant numérique croissant.
4. Si le club a moins de 30 joueurs, conserver tous ses joueurs. Le minimum de
   gardiens est une exigence dure seulement pour un club actif.
5. Ne pas importer les autres joueurs : ni réserve simulée, ni transfert, ni
   création d'agents libres à partir des exclus. Conserver seulement leurs IDs
   et le motif dans le rapport d'import, pas dans le monde.

Tous les agents libres présents dans la source sont conservés ; ils ne forment
pas un « effectif » collectif plafonné à 30. Les CSV sources sont inchangés.
Le plafond d'import n'est pas réappliqué aux sauvegardes : après création, la
limite de 30 est contrôlée par les décisions de recrutement et de génération.

## Contrat de lecture et de normalisation

Colonnes clubs : `Unique ID`, `Name`, `Nation`, `Division`, `Status`, `Stad Cap`,
`Division ID`. Colonnes joueurs : `Name`, `Nation`, `Position`, `Club`,
`Int Caps`, `Int Goals`, `Wage`, `Value`, `Date Of Birth`, `Contract End`,
`Unique ID`, `Club ID`. Lier par ID, jamais par nom.

- `Club ID = -1` devient `club_id = None`, avec `contract = None`. Tous les
  autres IDs doivent correspondre à un club, même si le joueur sera écarté.
- Dates source au format `dd.MM.yyyy`. La date initiale par défaut est le
  **1er juillet 2025**, choisie pour démarrer avant les nombreuses échéances
  du 30 juin 2026. Elle est configurable, jamais issue de l'horloge système.
- Les contrats des joueurs sans club sont supprimés du modèle et signalés.
  Pour un joueur rattaché, une fin absente devient le prochain 30 juin
  strictement futur. Une fin expirée est avancée d'autant d'années que
  nécessaire ; conserver jour/mois, rabattre un 29 février au 28 si nécessaire.
  La signature inconnue reçoit la date initiale et un marqueur « synthétique ».
- `Wage` est interprété en euros hebdomadaires et `Value` en euros. Un salaire
  nul sous contrat reçoit le salaire attendu synthétique. Ne pas attribuer de
  contrat ni de salaire payé à un agent libre.
- Une valeur de marché non positive est manquante, pas une valeur logarithmique
  valide. Repli : équivalent de valeur calculé depuis le salaire positif selon
  la règle salariale ; sinon niveau de repli de `import.json`.
- Capacité de stade non positive : utiliser la borne minimale de référence
  pour la synthèse, mais garder « capacité inconnue » pour l'affichage.
- Plusieurs nationalités : conserver la liste, utiliser la première comme
  nationalité principale. Une table de correspondance versionnée, produite à
  l'étape d'import pour tous les libellés observés, utilise les codes football
  retenus par la config (`ENG`, `GER`, etc.), pas une promesse de codes ISO.
  Un libellé inconnu est une erreur de normalisation à ajouter à cette table.
- Nom avec virgule : `nom, prénom`. Sans virgule : garder le nom d'affichage
  complet et un prénom vide, sans découpage arbitraire sur les espaces.
- Les 250 notations de poste sont analysées par une grammaire testée contre
  toutes les valeurs distinctes. Le premier rôle source reconnu est principal ;
  les autres deviennent secondaires avec l'affinité configurée. Définir un ordre
  stable pour les positions composées ; aucune notation inconnue n'est ignorée.
- Conserver les dates de naissance réelles. Les courbes prolongent leur valeur
  d'extrémité hors des âges tabulés ; aucune indexation invalide pour les joueurs
  très jeunes ou âgés. La retraite est évaluée à la fin de saison, même si
  l'âge initial est déjà supérieur aux tables.

Chaque correction figure dans le rapport. La source contient notamment 541
valeurs négatives, 3 442 valeurs nulles, 3 719 salaires nuls et 3 707 fins de
contrat `-` ; les replis ne sont donc pas des cas théoriques.

## Synthèse provisoire

Aucun attribut de jeu ni potentiel n'est fourni. Estimer le niveau depuis la
valeur positive en inversant la formule intrinsèque de valorisation, avec
correction d'âge et de rareté, sans décote contractuelle ni prime de potentiel
inconnue. Borner au domaine configuré. En repli salaire, inverser d'abord le
rapport salaire annuel / valeur intrinsèque. Les profils par poste donnent la
forme des attributs : les recentrer pour que leur note globale corresponde au
niveau cible, puis borner à [1, 100] et consigner les écarts dus aux bornes.

Fixer le potentiel à au moins la note réelle générée, avec la marge d'âge
configurée, sans dépasser 100. Il ne constitue jamais le score de sélection.
Les niveaux et potentiels sont **synthétiques**, pas les attributs réels des
joueurs. Le calibrage contre la valeur source est partiellement circulaire.

Réputation et centre de formation sont approchés depuis la capacité de stade.
Finances initiales : voir `docs/ia-gestion.md` pour un financement compatible
avec les salaires des seuls joueurs retenus. La synthèse est isolée pour être
remplacée lorsque de meilleures données deviennent disponibles.

## Entités et état à conserver

Les noms d'implémentation sont anglais, avec types partout et
`dataclass(slots=True)`. Les attributs restent fractionnaires en mémoire ;
seul l'affichage les arrondit, afin de conserver les petites progressions.

| Entité | Éléments indispensables |
|---|---|
| `Player` | ID, identité d'affichage et décomposée, nationalités, naissance, poste et affinités, attributs, potentiel privé, fraîcheur, forme, moral, fragilité et ego stables, club, contrat, blessure, compteurs disciplinaires, estimations par observateur |
| `Contract` | salaire hebdomadaire entier, signature et échéance, rôle/temps de jeu attendu, origine réelle ou synthétique |
| `Club` | ID, noms, nation, division source, compétition simulée optionnelle, statut, capacité connue ou absente, réputation, centre, formation, personnalité, revenus de référence et facteur initial de financement, budget, plafond salarial, solde |
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
