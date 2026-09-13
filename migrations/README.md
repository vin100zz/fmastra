# Sauvegardes

Le format courant est `schema_version: 3` : JSON typé, compressé avec gzip,
configuration effective et états RNG inclus. Le lecteur est dans
`src/infrastructure/persistence/store.py` ; le schéma de sérialisation compilé
est dans `typed_codec.py`. Aucun pickle ni import de classe fourni par le fichier.

La version 1 de développement utilisait un codage JSON balisé. Elle reste
lisible par `codec.py` : l'absence de carnet d'offres est migrée vers un carnet
vide. Au prochain enregistrement, elle est écrite en version 3. Les sauvegardes
v2 antérieures au carnet d'offres utilisent également sa valeur vide par défaut.

La v3 ajoute les comptes mensuels par club et saison, ainsi que le motif et
la saison de chaque mouvement (transfert, fin de contrat, retraite, promotion).
La migration v1/v2 conserve les soldes et les RNG : les finances détaillées
commencent à la date de reprise. Les motifs et promotions anciens sont repris
du journal encore présent. Un départ sans preuve de son motif reste « motif
non archivé » ; aucune dépense passée n'est inventée. La migration est idempotente.

Une version inconnue est refusée, sans remplacer la partie en mémoire.
Toute future suppression ou modification du sens d'un champ requiert une nouvelle
version et une migration explicite. Tester la reprise déterministe avant de
changer les modèles. Modifier les coefficients du dossier `config` n'altère pas
la configuration enregistrée d'une partie existante.

L'écriture utilise un temporaire dans le même répertoire, `fsync` puis
remplacement atomique. Un échec conserve le slot précédent. Les fichiers
inachevés ne sont jamais proposés dans la liste des sauvegardes.
