# IA de gestion et économie

Les 216 clubs actifs sont pilotés par `AIController`. Les coefficients sont dans
`config/ia_gestion.json`. Les décisions renvoient des intentions ; l'applicateur
est seul responsable des mutations et vérifie à nouveau les contraintes.

## Valeur et salaire

La valeur intrinsèque est l'exponentielle de niveau décrite par `valorisation`,
modulée par l'âge et la rareté du poste. Le niveau utilise les attributs de base,
sans forme, fatigue ou moral. Pour la prime de potentiel, employer le centre de
l'estimation propre à l'observateur, jamais le potentiel réel. Les facteurs
segmentés d'âge sont interpolés entre les centres des segments ; prolonger les
valeurs extrêmes hors domaine.

Séparer valeur intrinsèque et indemnité de transfert. Cette dernière applique
la décote de durée contractuelle. Un agent libre coûte zéro indemnité, mais
conserve une valeur intrinsèque et des exigences salariales.

Le salaire hebdomadaire attendu vaut la fraction annuelle configurée de la
valeur intrinsèque, divisée par le nombre configuré de semaines, avec un minimum.
Arrondir les montants à l'euro ; la valorisation et les salaires n'utilisent pas
la valeur CSV comme variable cachée après la synthèse initiale.

Le ratio de salaire du score d'offre est borné à la limite configurée ; les
autres composantes sont normalisées dans [0, 1]. Cela évite qu'une surenchère
annule l'effet du temps de jeu et de l'attractivité.

## Utilité et effectif cible

Le profil de titulaires vient de la formation : exactement onze places. Ajouter
les places de rotation et de doublure configurées, réparties pour couvrir ses
postes, avec au moins deux gardiens. Aucun joueur ne remplit deux places d'un
même profil. La polyvalence est une possibilité d'affectation, pas un doublon.

La qualité d'effectif est le score maximal d'affectation à ces places, pondéré
par rôle (titulaire, rotation, doublure). Une place vide vaut zéro. Les cibles de
niveau dérivent de la réputation et des décotes de rôle. Les places de rotation
couvrent d'abord les postes de titulaires sans doublure ; les places restantes
suivent les proportions de postes de la formation, avec départage stable par
poste. La sélection des postes à couvrir n'est pas recalculée pour favoriser
artificiellement chaque candidat évalué.

- Recrutement : qualité(effectif + candidat) - qualité(effectif).
- Conservation/renouvellement : qualité(effectif) - qualité(effectif sans joueur).
- Vente : même coût de départ, comparé au prix, à la masse salariale libérée et
  à la capacité de remplacement.

Une bonne doublure a donc une utilité positive même si elle n'améliore pas le
meilleur onze. Les modulations jeunesse/risque s'appliquent ensuite ; elles ne
remplacent pas la valorisation de la profondeur.

Pour la vente, le club ne juge pas seulement son onze : il protège son effectif
utile, les `profondeur` meilleures places (titulaires et rotation), car la
rotation se joue toute la saison. La profondeur va de `profondeur_effectif_min`
(16) à `profondeur_effectif_max` (20) selon la réputation du club, entre
`reputation_profondeur_min` et `reputation_profondeur_max` : la réputation fixe
les revenus, elle représente donc ici la taille et la richesse. Le coût de
départ de `can_sell` pèse alors chacune de ces places au moins à
`poids_profondeur_vente` (0,75), au lieu du poids de rotation (0,45). Perdre un
joueur de rotation sans relève proche coûte presque autant que perdre un
titulaire, et la vente est refusée si la perte dépasse `poids_doublure` fois son
niveau. Le recrutement garde les poids gradués titulaire, rotation et doublure.

Le profil nominal vaut onze titulaires plus les rotations et doublures
configurées (24 joueurs avec les paramètres initiaux). Le plafond dur reste
30, y compris pour les regens. Les 30 joueurs importés ne sont pas tous des
joueurs à vendre immédiatement : un surplus est une priorité de marché, pas
une obligation de libérer sans contrat. La démographie vise à terme la somme
des profils nominaux, avec une phase initiale de stabilisation.

## Revenus et financement initial

Revenus structurels : réputation, classement précédent et coefficient du pays.
Avant la première saison, utiliser le milieu du classement théorique pour les
clubs actifs ; pas de prime de classement pour les dormants. Le coefficient
`multiplicateur_autres_pays` couvre les nations hors des cinq ligues.

Après sélection des joueurs importés :

1. Calculer les salaires annuels des contrats retenus.
2. Calculer les revenus nécessaires pour couvrir cette masse avec la part
   salariale et la marge de plafond initiale configurées.
3. Fixer un facteur de financement égal au maximum du minimum configuré et du
   rapport revenus nécessaires / revenus structurels.
4. Stocker ce facteur au club. Au bilan annuel, il peut uniquement diminuer,
   vers le facteur nécessaire pour financer les salaires actuels avec la marge
   initiale configurée (et le minimum configuré). Il n'augmente jamais pour
   financer de nouveaux achats. La baisse des anciens salaires importés ne
   doit pas laisser une subvention permanente sans charges correspondantes.
5. Initialiser le solde avec la réserve de trésorerie configurée.

Ce financement synthétique est signalé dans l'import. Il préserve les salaires
source sans provoquer des ventes contraintes avant le premier match. Il pourra
être remplacé par des données financières réelles.

## Comptabilité

Les revenus annuels, salaires et autres charges sont répartis quotidiennement
au prorata de la longueur de l'année de jeu. Conserver les restes d'arrondi
pour obtenir le montant annuel entier exact. Les salaires hebdomadaires sont
annualisés avec `semaines_par_an`. Les revenus et plafonds sont recalculés au
bilan annuel ; les flux de trésorerie suivent les engagements effectivement
signés et les dates, sans compter deux fois les ventes.

Budget de recrutement : part des revenus et du solde prévue par la config,
augmentée des ventes, diminuée des achats et des réservations en cours. Une
vente déjà inscrite au solde ne doit pas être ajoutée une seconde fois lors du
recalcul en cours de saison : conserver une enveloppe de début de saison et
son journal de mouvements.

Toute signature doit respecter simultanément plafond salarial, enveloppe de
transfert, solde minimal, effectif maximal et gardiens requis du vendeur. Les
transferts déplacent réellement de l'argent entre clubs. Les agents libres ne
produisent pas d'indemnité. Pas d'inflation implicite ni de renflouement répété.
Le suivi affiche revenus, charges, salaires, achats, ventes et solde.

## Mercato

Les dates de `monde.mercato` font foi : été du 10 juin au 31 août, hiver du
1er au 31 janvier, bornes incluses. Les offres et négociations persistent dans
le monde et les sauvegardes.

Chaque tour comporte intentions de tous les clubs, émission d'offres, réponse
des vendeurs, choix des joueurs puis application. Limiter les négociations
actives et les shortlists. Réserver argent et places pour empêcher plusieurs
offres simultanées de consommer le même budget. Départager les conflits par le
score du joueur, puis tirage déterministe sur offres ordonnées. Si une
contrainte finale échoue, annuler les réservations et réévaluer au tour suivant.
Une mutation ne peut transférer deux fois le même joueur.

Les vendeurs utilisent la valeur décotée, le surplus et leur patience. Entre
plusieurs offres, le joueur compare salaire, minutes projetées, réputation et
ambition normalisés, avec le bruit configuré. Les clubs libres de recruter
traitent aussi les agents libres dès l'ouverture de la fenêtre ; ils n'ont pas
de vendeur à consulter. Les négociations inachevées à la clôture expirent et
libèrent leurs réservations.

Le joueur peut aussi refuser. Il ne descend pas vers un club nettement moins
réputé que le sien (baisse supérieure à `tolerance_baisse_reputation`, 5 points)
dont le niveau visé, calculé comme dans `profil_cible` (niveau de base plus poids
fois réputation), est inférieur à sa note de plus de `marge_niveau_joueur`
(2 points) : ce club est en dessous de lui. Un club de son niveau, un mouvement
latéral ou une montée restent acceptés, ainsi que tout club pour un agent libre.
Seul un moral inférieur ou égal à `moral_depart_force` (0,5) lève le refus. Le
contrôle s'applique à la recherche, où un club ne cible pas un joueur qui
refuserait, et au règlement : un refus libère les réservations et déclenche la
recherche d'une alternative, comme un refus du vendeur.

Un joueur convoité doit avoir de la concurrence. Chaque club connaît, pour
chaque poste, les `talents_visibles` (10) meilleurs joueurs vendables en plus de
son échantillon aléatoire de `max_candidates_scanned` candidats, sinon un
joueur fort à un poste peu fourni n'atteint un acheteur que par hasard. Les
offres d'un même joueur sont décidées ensemble lorsque la plus ancienne est
ouverte depuis `jours_encheres` jours (2) : les rivaux qui arrivent entre-temps
sont départagés par le score du joueur, où la réputation du club pèse.

À l'ouverture de chaque fenêtre, chaque club évalue son effectif et peut ouvrir
jusqu'à `negociations_actives_max` dossiers sur des postes différents (trois).
Les besoins utilisent une affectation unique aux places de titulaire, rotation
et doublure, avec les postes secondaires et les décotes de niveau configurées.
Les cibles en cours sont intégrées à l'effectif projeté : pas de doublon au même
poste ni de budget ou de salaire promis plusieurs fois. Les revues ultérieures
divisent `daily_proposal_probability` par le nombre de places de négociation
disponibles, afin que les dossiers multiples ne triplent pas la fréquence.
Un poste renforcé reste traité jusqu'à la prochaine fenêtre : le club ne
rachète pas plusieurs améliorations successives au même poste. Un manque réel
de joueurs pour la formation, de gardiens ou d'effectif minimal peut rouvrir
le dossier. Le plan est reconstitué depuis l'historique des transferts, y compris
après rechargement et lorsque la fenêtre estivale traverse le bilan annuel.

La shortlist est constituée après les contrôles de disponibilité, de salaire
et de prix. Un poste sans candidat viable n'empêche pas d'examiner les suivants.
Le plafond offert et le prix demandé partagent le même calcul, incluant le coût
du départ pour le vendeur. L'offre initiale reste négociable jusqu'à ce plafond.
Un refus définitif ou une concurrence perdue libère les réservations et permet
une recherche immédiate d'alternative, en excluant le joueur refusé pour ce tour
et sans ouvrir davantage de dossiers que le nombre de pistes perdues.

Hors urgence d'effectif, le gain de qualité doit être positif et atteindre
`gain_qualite_min_recrutement` (3 points pondérés par défaut). Un club déjà au
niveau cible ne recrute pas uniquement parce qu'il est riche. Un vendeur à
l'effectif nominal ou inférieur conserve un joueur si son départ coûte plus
que sa contribution de doublure ; il doit d'abord préparer sa relève. Les
salaires proposés ne sont jamais inférieurs au contrat en cours.

Un joueur refuse de changer à nouveau de club pendant les
`mercato.stabilite_apres_arrivee_jours` jours suivant son arrivée (180 par défaut).
La date vient du dernier transfert vers son club actuel, y compris une signature
gratuite ; une prolongation ne redémarre pas le délai. La règle couvre les clubs
actifs et dormants, les recherches, les offres en attente et leur application.
Un joueur libéré peut signer immédiatement. Les dates de contrat synthétiques
à l'import et les promotions du centre ne sont pas des transferts. Les parties
existantes utilisent leur historique enregistré ; le passé n'est pas modifié.

## Clubs dormants

Pas de composition, calendrier ou statistiques simulés. Progression simplifiée,
contrats et finances restent à jour. Leurs offres et acceptations passent par
les mêmes contraintes de budget, de salaire et de places que les autres clubs,
avec une réponse et une shortlist simplifiées. Ils n'ont pas de minimum dur
d'effectif, puisqu'une grande partie est incomplète dans la source.

La probabilité de démarchage s'applique par club dormant et par fenêtre, une
fois, pas chaque jour. Échantillonner seulement les clubs disposant de moyens
et de places. La part de transferts depuis les dormants est une cible mesurée,
pas un quota imposé par le moteur de résolution.

## Contrats, moral et départs

Évaluer les renouvellements chaque semaine. Satisfaction : salaire par rapport
à l'attente, minutes jouées par rapport aux minutes attendues **à cette date**,
attractivité du club. Si aucune minute n'est encore attendue, le ratio de temps
de jeu est neutre, pas une division par zéro ou une comparaison à une saison
complète. Le rôle contractuel et l'ego individuel sont stockés.

Ouvrir une négociation en cas d'insatisfaction ou d'échéance proche. Valoriser
la conservation du joueur avec le score de départ, pas avec un ajout en double.
Le plafond salarial s'applique aussi aux renouvellements. À échéance inclusive,
le joueur est libéré le lendemain si aucun nouveau contrat n'est signé.
Les attentes et la satisfaction alimentent aussi le moral et les demandes de
transfert. Un joueur ne disparaît pas à cause d'un refus de renouvellement.

## Composition et remplacements

Exclure blessés et suspendus ; retenir la formation préférée si elle est
remplissable, sinon la meilleure couverture. Optimiser une affectation unique
joueur/poste, y compris pour les polyvalents et le banc. La qualité du poste
comprend forme, fraîcheur, moral et affinité ; la rotation utilise les seuils
configurés. La hauteur de bloc initiale dépend de l'écart de forces du onze,
pas de noms de clubs. Ses coefficients sont dans `formations.hauteur_bloc`.

Les remplacements et cas d'effectif insuffisant suivent `docs/etats-joueur.md`
et `monde.regles_match`. Les invariants d'effectif portent sur les contrats ;
ils ne garantissent pas que tous les joueurs sont disponibles chaque jour.

## Validation

La suite économique couvre 25 saisons après stabilisation, plusieurs graines,
et des valeurs réelles sans inflation. Mesurer dérive cumulative des salaires,
concentration, trésorerie et diversité des transferts ; ne pas confondre une
croissance annuelle bornée avec une croissance durablement bornée.
