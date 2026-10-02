# Sauvegardes

Le format courant est `schema_version: 24` : JSON typé, compressé avec gzip,
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

Sans changer de version, `InternationalRecord` garde les notes de match d'une édition (`rating_sum`, `rating_count`,
comme `SeasonRecord`). Les deux champs ont une valeur par défaut : une sauvegarde antérieure se lit telle quelle, ses
éditions déjà jouées restent sans note, et aucune n'est inventée.

Toute future suppression ou modification du sens d'un champ requiert une nouvelle
version et une migration explicite. Tester la reprise déterministe avant de
changer les modèles. Modifier les coefficients du dossier `config` n'altère pas
la configuration enregistrée d'une partie existante.

L'écriture utilise un temporaire dans le même répertoire, `fsync` puis
remplacement atomique. Un échec conserve le slot précédent. Les fichiers
inachevés ne sont jamais proposés dans la liste des sauvegardes.
