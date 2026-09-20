# Sauvegardes

Le format courant est `schema_version: 12` : JSON typé, compressé avec gzip,
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

Toute future suppression ou modification du sens d'un champ requiert une nouvelle
version et une migration explicite. Tester la reprise déterministe avant de
changer les modèles. Modifier les coefficients du dossier `config` n'altère pas
la configuration enregistrée d'une partie existante.

L'écriture utilise un temporaire dans le même répertoire, `fsync` puis
remplacement atomique. Un échec conserve le slot précédent. Les fichiers
inachevés ne sont jamais proposés dans la liste des sauvegardes.
