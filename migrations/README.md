# Sauvegardes

Le format courant est `schema_version: 41` : JSON typé, compressé avec gzip,
configuration effective et états RNG inclus. Le lecteur est dans
`src/infrastructure/persistence/store.py` ; le schéma de sérialisation compilé
est dans `typed_codec.py`. Aucun pickle ni import de classe fourni par le fichier.

La version 1 de développement utilisait un codage JSON balisé, lisible par
`codec.py` : l'absence de carnet d'offres était migrée vers un carnet vide. Depuis
la v12 elle ne l'est plus si ses joueurs n'ont que 13 attributs (voir plus bas) ;
recharger d'abord la partie avec une version antérieure pour la réécrire en JSON typé.
Au prochain enregistrement d'une sauvegarde lisible, elle est écrite en version 12. Les sauvegardes
v2 antérieures au carnet d'offres utilisent également sa valeur vide par défaut.

La v3 ajoute les comptes mensuels par club et saison, ainsi que le motif et
la saison de chaque mouvement (transfert, fin de contrat, retraite, promotion).
La migration v1/v2 conserve les soldes et les RNG : les finances détaillées
commencent à la date de reprise. Les motifs et promotions anciens sont repris
du journal encore présent. Un départ sans preuve de son motif reste « motif
non archivé » ; aucune dépense passée n'est inventée. La migration est idempotente.

Une version inconnue est refusée, sans remplacer la partie en mémoire.

La v6 ajoute `ia_gestion.mercato.stabilite_apres_arrivee_jours` (180 jours).
Pour les sauvegardes v1 à v5 sans ce paramètre, le lecteur vérifie l'empreinte
de la configuration d'origine avant d'accepter cette valeur de migration.
Les autres paramètres restent inchangés. L'historique existant des transferts
suffit pour identifier les arrivées récentes ; aucune date n'est inventée pour
les joueurs importés et les prolongations ne comptent pas comme des arrivées.

La v7 ajoute `ia_gestion.mercato.gain_qualite_min_recrutement` (3.0 points
pondérés). Les empreintes des versions précédentes sont vérifiées avant cet
ajout. Les valeurs personnalisées déjà présentes sont conservées. Le facteur
de financement initial, déjà stocké au club, peut désormais diminuer au bilan
annuel en fonction des charges salariales restantes ; le chargement ne modifie
ni les soldes ni les budgets en cours.

La v8 ajoute dix paramètres de `ia_gestion.mercato` : profondeur d'effectif
(`profondeur_effectif_min`/`max`, `reputation_profondeur_min`/`max`,
`poids_profondeur_vente`),
consentement du joueur (`tolerance_baisse_reputation`, `marge_niveau_joueur`,
`moral_depart_force`), `talents_visibles` et `jours_encheres`. Les sauvegardes
v2 à v7 reçoivent leurs valeurs par défaut après vérification de l'empreinte de
la configuration d'origine ; une valeur personnalisée déjà présente, ou toute
autre modification, est refusée. Les offres en cours sont décidées selon la
nouvelle durée d'enchères ; aucun mouvement passé n'est modifié.

La v9 à la v11 ajoutent des paramètres de rotation, d'ambition et de valorisation
(`MIGRATION_DEFAULTS` dans `store.py` en fait foi).

La v12 ajoute deux attributs (`centre`, `cpa`), le trait `aggression` du joueur et
quatorze paramètres de config (conversion des notes source en fragilité, ego et
agressivité, livraison). Le vecteur d'attributs de chaque joueur passe de 13 à 15
valeurs, les deux nouvelles étant ajoutées à la fin pour conserver les indices.
À la lecture d'une sauvegarde antérieure, avant tout typage, `centre` et `cpa` sont
relus dans `data/players.csv` si son empreinte est exactement celle de l'import
(`source_hashes`) ; les joueurs absents du fichier (regens, joueurs générés) et tous les
joueurs sans fichier reçoivent leur note globale plus le décalage de leur poste,
c'est-à-dire ce que la génération leur aurait donné sans bruit. Les vecteurs déjà à 15
valeurs ne sont pas touchés. `aggression` vaut 1 (neutre) et la fragilité et l'ego déjà
tirés sont conservés. La configuration embarquée n'est complétée que des nouveaux
paramètres, après vérification de l'empreinte d'origine ; `poids_agressivite_tacle`
garde son ancienne valeur (0,006), donc l'agressivité reste neutre dans une partie déjà
commencée. Le format v1 (JSON balisé) n'est pas étendu.

La v13 ajoute la révision annuelle de la réputation : la section `monde.reputation`, `Club.reputation_anchor`,
`World.reputation_ceilings` et `World.reputation_history` (`docs/reputation.md`). À la lecture d'une sauvegarde
antérieure, la configuration embarquée reçoit les valeurs par défaut de la section, absente d'une partie plus
ancienne, après vérification de l'empreinte d'origine. Au chargement, l'ancre de chaque club devient sa
réputation courante (constante jusque-là), le plafond de chaque division la médiane des ancres de ses équipes
premières d'après `source_division_id`, et l'historique reçoit un premier point à la saison en cours. La
première révision a lieu au prochain 1er juillet.

La v14 change la génération des regens (`docs/progression-demographie.md`) : cibles de potentiel par classe
et cibles de nations propres aux dormants (`World.potential_targets`, `external_potential_targets`,
`external_nation_targets`), et neuf paramètres de config (`demographie.cohorte` : `probabilite_club_national`,
`part_hors_tri`, `intensite_tri_centres`, `poids_reputation_tri` ; `demographie.generation` : `poids_age`,
`seuil_potentiel_elite`, `exposant_nations_elite`, `part_plancher_nation`, `noms_minimum_par_nation`). À la lecture
d'une sauvegarde antérieure, la configuration embarquée reçoit leurs valeurs par défaut après vérification de
l'empreinte d'origine ; ses classes (`buckets_niveau`) restent celles de la partie. Les trois cibles absentes sont
mesurées au chargement sur les joueurs qui viennent encore de la source (`source_potential_ability` renseigné, ou tous
les joueurs à défaut), pas sur les regens déjà générés : la queue de potentiel des regens passés n'entre pas dans les
cibles. Les joueurs existants ne sont pas modifiés ; seuls les regens du prochain 1er juillet suivent les nouvelles
règles. Les paramètres `potentiel_min`, `potentiel_amplitude`, `beta_*` et `candidats_max_par_classe` n'ont plus
d'effet mais restent dans la configuration : supprimer une clé demanderait une migration dédiée.

Les v15 à v19 ajoutent des paramètres de config (`MIGRATION_DEFAULTS` dans `store.py` en fait foi).

La v20 ajoute les ventes du club de l'utilisateur (`docs/ia-gestion.md`, « Mercato ») : `World.transfer_list`
et `World.offered_until`, vides à la lecture d'une sauvegarde antérieure, et quatre paramètres de
`ia_gestion.mercato` (`tolerance_baisse_joueur_a_vendre` 15, `multiplicateur_prix_max_acheteur` 1,35,
`jours_relance_proposition` 14, `offres_max_proposition` 5), reçus par la configuration embarquée après
vérification de l'empreinte d'origine.

La v21 renomme la formation `4-4-2` en `4-4-2 plat` et ajoute `4-4-2 diamant` (4-1-2-1-2) et `4-4-2 offensif`
(4-2-2-2) juste après elle. À la lecture d'une sauvegarde antérieure, l'empreinte de la configuration d'origine
est vérifiée, puis la configuration embarquée est renommée et complétée ; la formation des clubs et des
compositions en attente ou en direct suit le nouveau nom. Un nom déjà présent dans une configuration
personnalisée n'est ni écrasé ni renommé.

La v22 code les latéraux comme les ailiers : `DL` devient `DG` et `DR` devient `DD`. À la lecture d'une sauvegarde
antérieure, avant tout typage, chaque code `DL`/`DR` du monde (valeur ou clé : poste et notes par poste des joueurs,
compositions, événements de match, instantanés des transferts…) est renommé ; la configuration embarquée l'est après
vérification de son empreinte d'origine. Le `4-4-2 offensif` ajouté par la v21 (deux MOC) reçoit ses deux ailiers
(MDC, MDC, AILG, AILD) ; une autre définition de ce nom est conservée. Les codes de la source (`players.csv`) ne changent pas.

La v23 rend l'historique du niveau mensuel : `World.trajectories` associe à chaque joueur des suites de mois consécutifs
`(premier mois, niveaux)`, le mois valant `année * 12 + mois - 1` et le niveau étant l'entier sur 200 affiché (note arrondie
au demi-point). Un niveau s'ajoute à chaque progression mensuelle, à l'import et à la génération d'un joueur. À la lecture
d'une sauvegarde antérieure, avant tout typage, chaque point annuel `(saison, note)`, pris à l'ouverture de la saison,
devient une suite d'un seul mois au mois du bilan démographique ; les suites déjà mensuelles sont conservées. Le niveau
courant de chaque joueur est ensuite ajouté au mois de la reprise. Aucun mois antérieur n'est inventé.

La v24 note les joueurs générés à chaque poste (`docs/progression-demographie.md`, Génération) : la section
`demographie.generation.aptitudes_postes`, reçue par la configuration embarquée d'une sauvegarde antérieure après
vérification de l'empreinte d'origine. Jusque-là un regen n'avait pas de `position_ratings`, seulement d'éventuels postes
secondaires à 0,6. Au chargement, tout joueur sans notes reçoit celles que sa génération tirerait aujourd'hui (flux
`position-ratings`, graine et identifiant du joueur) ; à ses postes secondaires il garde au moins l'affinité qu'il avait,
et `secondary_positions` est recalculé depuis les notes. Les joueurs déjà notés (ceux de la source) ne sont pas touchés.
Un regen passe ainsi d'une affinité nulle à 1 sur 20 aux postes qui lui restent fermés, comme les joueurs importés.
`affinite_secondaire`, `postes_secondaires_possibles` et `probabilite_poste_secondaire` n'ont plus d'effet mais restent
dans la configuration.

La v25 ajoute la réserve et les prêts (`docs/ia-gestion.md`, « Réserve et prêts ») et change la progression par les minutes
(`docs/progression-demographie.md`) : `Player.loan`, `Player.reserve_since`, `Player.reserve_days`, `Club.loaned_ids` et
`Club.borrowed_ids`, absents d'une sauvegarde antérieure et lus avec leurs valeurs par défaut (personne n'est prêté ni en
réserve), et deux groupes de paramètres reçus par la configuration embarquée après vérification de l'empreinte d'origine :
`demographie.progression` (`exposant_minutes`, `plancher_entrainement`, `reserve`) et `ia_gestion.mercato.prets`. Une
partie antérieure suit donc les nouvelles règles dès sa reprise : le facteur de jeu devient concave et son plancher suit la
note d'entraînement du club à la prochaine progression mensuelle, les clubs de l'IA placent des joueurs en réserve à leur
prochaine revue hebdomadaire et se prêtent des joueurs au prochain mercato. Aucun joueur n'est déplacé au chargement.

La v26 refond le fil d'actualités du club dirigé (`docs/ui.md`, « Actualités ») : `World.news` devient une liste de
`NewsItem`, un `JournalEntry` portant en plus des lignes (`NewsLine` : joueur, club, compétition, match, montant, date,
libellé, état, clé). Les messages d'un même jour et d'un même genre n'en font qu'un, et ceux qui attendent une réponse
(offres reçues, contrat demandé, contrat à négocier) la portent sur leurs lignes. Une sauvegarde antérieure se lit
telle quelle : ses actualités deviennent des messages d'une phrase, sans ligne, et celles de genre `result` sont
retirées, le fil ne racontant plus les résultats. Une offre reçue avant la reprise n'attend plus de réponse dans le fil :
elle reste visible et se traite depuis la fiche du joueur. Aucun paramètre de configuration n'est ajouté.

La v27 retient les demandes de contrat refusées par le club dirigé (`docs/ia-gestion.md`, « Contrats, moral et
départs ») : `World.refused_renewals` associe à chaque joueur le jour du refus, et il ne redemande plus chaque semaine.
À la lecture d'une sauvegarde antérieure, les refus que racontent ses actualités (message `renewal_proposed` dont la
demande est à l'état `refused`) sont repris, le dernier par joueur, pour les joueurs qui ont encore le contrat que le
message leur connaissait (même salaire, même fin). Un message d'avant la v26, sans ligne, ne dit pas sa réponse : ce
refus-là n'est pas repris et le joueur peut redemander une fois. Aucun paramètre de configuration n'est ajouté.

La v28 donne à chaque acheteur son prix maximum et fait monter les offres (`docs/ia-gestion.md`, « Mercato ») :
`TransferOffer.limit` (le prix maximum de l'acheteur), `World.not_for_sale` (joueurs que le club dirigé déclare
intransférables, avec le jour) et `World.turned_away` (par joueur, les clubs éconduits pour la fenêtre en cours), et la
section `ia_gestion.mercato.offres` (dix paramètres, `MIGRATION_DEFAULTS` en fait foi), reçue par la configuration
embarquée après vérification de l'empreinte d'origine. Une sauvegarde antérieure se lit telle quelle : personne n'est
intransférable ni éconduit, et ses offres en cours, sans limite propre, ne montent pas au-delà de ce qu'elles
réservaient (le prix demandé) ; celles qui attendaient la réponse du club dirigé à 75 % de ce prix y montent dès que
plusieurs se disputent le joueur. `TransferOffer.countered` marque désormais une offre relevée, `due` et `rounds`
servent aussi aux relances d'une offre refusée par le club dirigé. `ratio_contre_offre` et
`multiplicateur_prix_max_acheteur` gardent leurs valeurs et changent d'emploi (`docs/configuration.md`). Une partie
antérieure suit les nouvelles règles dès sa reprise ; aucun transfert passé n'est modifié.

La v30 ajoute `ia_gestion.contrats.hausse_min_prolongation` (0,10) : un joueur ne demande plus de nouveau contrat pour
une hausse plus faible quand il ne lui apporte pas d'année de plus (`docs/ia-gestion.md`, « Contrats, moral et
départs »). La configuration embarquée la reçoit après vérification de l'empreinte d'origine. À la lecture d'une
sauvegarde antérieure, une demande en attente qui n'apporte ni cette hausse ni d'année de plus est retirée de
`World.pending_renewals` : son message reste sans suite, et le joueur redemandera quand il aura de quoi.

La v33 ajoute la Ligue des nations (`docs/manuel/15-selections.md`) et décale les qualifications de l'Euro et de la
Coupe du monde au mois de mars qui suit ses groupes : `InternationalEdition.windows` (les fenêtres de matches de groupe
d'une édition, premier et dernier jour) et `InternationalEdition.divisions` (les divisions d'une Ligue des nations, chacune
une liste de groupes). À la lecture d'une sauvegarde antérieure, chaque édition déjà tirée reçoit les fenêtres où ses
qualifications ont été datées, lues deux matches à la fois : elle se joue jusqu'au bout sur l'ancien calendrier, et le
calendrier des clubs continue de lui laisser ces dates. La première Ligue des nations vient avec la campagne suivante,
tirée le 1er août deux ans avant le tournoi d'après, en même temps que lui. Un renfort temporaire suit désormais sa
sélection d'une édition à l'autre de la campagne. Le calendrier des clubs ne garde plus de jours de repos en plus autour
d'un rassemblement : un club joue jusqu'à la veille de son ouverture et dès le lendemain de sa fin, toujours à trois jours
au moins d'un match de sélection ; les saisons déjà tirées gardent leurs dates. Aucun paramètre de configuration n'est ajouté.

La v34 ajoute les paliers de sélection de l'import (`import.selection_effectifs.paliers`, `MIGRATION_DEFAULTS` dans
`store.py` en fait foi), reçus par la configuration embarquée après vérification de l'empreinte d'origine : ils ne décident que
de ce que garde un monde nouveau, une partie déjà créée n'est pas concernée.

La v35 donne à chaque joueur d'un effectif son numéro de maillot (`Player.shirt`, `core/world/shirts.py`), et à chaque match
de club joué les numéros de sa feuille (`MatchResult.shirts`). À la lecture d'une sauvegarde antérieure, chaque effectif est
numéroté par les règles d'une nouvelle partie sans numéro source (`number_squads`) : les titulaires du onze type d'abord, les
remplaçants, puis les jeunes, chacun par niveau décroissant, le premier numéro libre de ceux de sa place. Les matches déjà
joués n'ont pas de numéros : leur compte rendu montre celui du joueur s'il est encore au club, son poste sinon. Aucun
paramètre de configuration n'est ajouté ; la règle de numérotation n'a pas de paramètre.

La v37 ajoute à `ia_gestion.mercato` les tours de planification des mercatos (`tours_planification`), les agents libres
visibles et leurs prétentions décroissantes (`agents_libres`) et la tenue des contrats longs (`contrats_longs`), et à
`ia_gestion.contrats` le refus de prolonger (`refus_prolongation`) ; voir `docs/ia-gestion.md`, « Mercato ». La
configuration embarquée les reçoit après vérification de l'empreinte d'origine. Les tours remplacent les revues au
hasard : une sauvegarde dont `ia_gestion.mercato.daily_proposal_probability` vaut encore 0,06, la valeur livrée, passe
à 0 ; une autre valeur, choisie, est gardée (`_upgrade_market`). `Player.free_since` date le dernier contrat d'un joueur
sans club : à la lecture d'une sauvegarde antérieure, chaque agent libre reçoit la date de sa dernière fin de contrat ;
un joueur qui n'a jamais eu de contrat reste sans date et compte depuis le début de la partie.

La v38 construit les possessions action après action (`docs/moteur-match.md`, `docs/manuel/03-match.md`). Elle ajoute
la section `moteur_match.actions`, des clés à `occasion` (types d'occasions et gardien face à face), `coups_arretes`
(`part_corners_frappe`), `turnover` (contres selon la zone et la façon dont le ballon est perdu) et `notes_joueurs`
(`part_non_cadres_contres_de_loin`), reçues après vérification de l'empreinte d'origine. Elle **retire** quatre clés
dont le sens disparaît : `chronologie.duree_possession_moyenne` et `duree_possession_forme_gamma` (la durée d'une
possession est la somme de ses actions), `turnover.zone_declenchant_contre` et `probabilite_contre_depuis_zone_basse`.
`RETIRED_RULES` les ôte de la configuration embarquée avant son typage, et les lui rend, avec les valeurs qu'elle
portait, pour vérifier son empreinte : une sauvegarde modifiée à la main reste refusée. Les règles recalibrées avec les
possessions (`POSSESSION_RECALIBRATED_RULES`) prennent leur nouvelle valeur si la sauvegarde porte encore celle de la
v37, et sont gardées sinon (`_upgrade_possessions`). Les matchs déjà joués gardent leurs événements : le résumé lit un
`progress` sans détail comme une passe, et le compte rendu n'affiche les passes que d'un match où elles sont comptées
(`TeamStats.passes`, `None` avant).

La v39 donne une cause aux arrêts de jeu (`docs/conception-arrets-de-jeu.md`, `docs/moteur-match.md`,
`docs/manuel/03-match.md`) : une action ratée finit en faute, ballon sorti, hors-jeu ou ballon perdu en jeu, les
corners, coups francs, penaltys et cartons en découlent, un tir peut donner un corner ou une reprise, et chaque arrêt
a son temps mort. Elle ajoute les sections `moteur_match.arrets` et `moteur_match.penalty` (la règle des tirs au but,
partagée avec les penaltys du match), des clés à `actions` (`part_dribbles`, `sensibilite_dribble`, qui changent
maintenant le jeu), `cartons` (les chances d'un carton par faute), `occasion` (`xg_base_rebond`), `turnover`
(`malus_contre_gardien`), `notes_joueurs` (fautes et penaltys) et `benchmarks.stats_match` (fautes et penaltys par
équipe). Elle **retire** `actions.temps_mort` (le temps mort suit la cause de l'arrêt), quatre clés de
`coups_arretes` (corners et coups francs tirés au hasard, `part_corners_frappe`, `part_cible_buts_sur_cpa` qui n'était
lue par rien), les cartons par tentative stoppée de `cartons`, et de `notes_joueurs` les parts de dribbles et de tirs
contrés, déplacées. Les entrées de `MIGRATION_DEFAULTS` et de `POSSESSION_RECALIBRATED_RULES` des versions antérieures
perdent ces clés. Les règles recalibrées (`STOPPAGE_RECALIBRATED_RULES`) prennent leur nouvelle valeur si la sauvegarde
porte encore celle de la v38, et sont gardées sinon (`_upgrade_stoppages`). Les matchs déjà joués gardent leurs
événements : ils n'ont ni faute ni touche, un `save` sans détail est un arrêt capté, et le compte rendu montre leurs
coups francs à la place des fautes et des hors-jeu (`TeamStats.fouls`, `None` avant).

La v40 ajoute l'attribut `penalty` (colonne Penalties), qui choisit le tireur et fait sa réussite, en match comme aux
tirs au but (`docs/attributs.md`, `docs/manuel/03-match.md`). Chaque vecteur d'attributs passe de 15 à 16 valeurs avant
le typage (`_extend_attribute_vectors`, qui allonge aussi d'abord un vecteur de 13 valeurs de la v11). Un joueur trouvé
dans le fichier source exact (même empreinte que `source_hashes`) prend sa valeur Penalties × 5 ; les autres, joueurs
générés ou fichier modifié depuis l'import, reçoivent la valeur que prédisent leur finition et leur sang-froid
(`PENALTY_ESTIMATE` : −9,27 + 0,442 × finition + 0,525 × sang-froid, régression sur les 44 643 joueurs de la source,
bornée à [1, 100]). Aucune note ni valeur de joueur ne bouge : `penalty` ne compte pas dans la note globale. La
configuration embarquée reçoit le composite `attributs.composites.penalty` (`MIGRATION_DEFAULTS`) ; `penalty` rejoint
`attributs.liste.techniques` avant le typage, et la liste d'origine lui est rendue pour vérifier son empreinte
(`_list_penalty`, par le même chemin que `RETIRED_RULES`). Une fois l'empreinte vérifiée, `_upgrade_penalties` donne aux
`profils_generation` les décalages livrés (`PENALTY_OFFSETS`) et à `poids_declin_par_attribut` le poids de `cpa`
(0,40), sauf valeur déjà présente. Les règles du penalty (`moteur_match.penalty`) ne changent pas : l'écart moyen entre
le tireur et le gardien reste le même sur de vrais effectifs.

Sans changer de version, `InternationalRecord` garde les notes de match d'une édition (`rating_sum`, `rating_count`,
comme `SeasonRecord`). Les deux champs ont une valeur par défaut : une sauvegarde antérieure se lit telle quelle, ses
éditions déjà jouées restent sans note, et aucune n'est inventée.

Sans changer de version non plus, `Club.wage_shift` retient les salaires hebdomadaires qu'un club a fait passer de son
budget de transferts à son plafond salarial (`docs/ia-gestion.md`, « Comptabilité »). Le champ a une valeur par
défaut : une sauvegarde antérieure se lit telle quelle, sans écart, et garde ses budgets ; aucun paramètre de
configuration n'est ajouté.

La v41 remplace la formation tirée au hasard à la création par celle que l'équipe première remplit le mieux
(`docs/manuel/06-entraineur.md`, « La formation »). `Club.formation_squad` retient les joueurs pour qui elle a été
choisie ; il a une valeur par défaut vide. Au chargement, `_choose_formations` donne à chaque club de l'IA sa meilleure
formation, sans marge : la formation tirée n'avait rien à préserver. Le club de l'utilisateur garde la sienne. La
configuration embarquée reçoit `formations.choix` (`marge_changement` 0,25, `blessure_longue_jours` 30,
`MIGRATION_DEFAULTS`).

Toute future suppression ou modification du sens d'un champ requiert une nouvelle
version et une migration explicite. Tester la reprise déterministe avant de
changer les modèles. Modifier les coefficients du dossier `config` n'altère pas
la configuration enregistrée d'une partie existante.

L'écriture utilise un temporaire dans le même répertoire, `fsync` puis
remplacement atomique. Un échec conserve le slot précédent. Les fichiers
inachevés ne sont jamais proposés dans la liste des sauvegardes.
