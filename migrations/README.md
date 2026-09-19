# Sauvegardes

Le format courant est `schema_version: 8` : JSON typé, compressé avec gzip,
configuration effective et états RNG inclus. Le lecteur est dans
`src/infrastructure/persistence/store.py` ; le schéma de sérialisation compilé
est dans `typed_codec.py`. Aucun pickle ni import de classe fourni par le fichier.

La version 1 de développement utilisait un codage JSON balisé. Elle reste
lisible par `codec.py` : l'absence de carnet d'offres est migrée vers un carnet
vide. Au prochain enregistrement, elle est écrite en version 8. Les sauvegardes
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

Toute future suppression ou modification du sens d'un champ requiert une nouvelle
version et une migration explicite. Tester la reprise déterministe avant de
changer les modèles. Modifier les coefficients du dossier `config` n'altère pas
la configuration enregistrée d'une partie existante.

L'écriture utilise un temporaire dans le même répertoire, `fsync` puis
remplacement atomique. Un échec conserve le slot précédent. Les fichiers
inachevés ne sont jamais proposés dans la liste des sauvegardes.
