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
4. Stocker ce facteur au club. Il multiplie les revenus structurels futurs mais
   n'est **jamais recalculé pour financer un nouveau recrutement**.
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

Les vendeurs utilisent la valeur décotée, le surplus et leur patience. Le
joueur compare salaire, minutes projetées, réputation et ambition normalisés,
avec le bruit configuré. Les clubs libres de recruter traitent aussi les agents
libres dès l'ouverture de la fenêtre ; ils n'ont pas de vendeur à consulter.
Les négociations inachevées à la clôture expirent et libèrent leurs réservations.

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
