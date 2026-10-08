# IA de gestion et économie

Les 216 clubs actifs sont pilotés par `AIController`. Les coefficients sont dans
`config/ia_gestion.json`. Les décisions renvoient des intentions ; l'applicateur
est seul responsable des mutations et vérifie à nouveau les contraintes.

## Valeur et salaire

La valeur intrinsèque suit la courbe de niveau `courbe_niveau` de `valorisation`
(valeur en euros d'un joueur de 27-29 ans à un poste neutre), modulée par l'âge et
la rareté du poste. La courbe est interpolée géométriquement entre ses points, donc
convexe ; au-delà de ses extrémités, la pente du segment voisin se prolonge. Le
niveau utilise les attributs de base, sans forme, fatigue ou moral. Pour la prime de
potentiel, employer le centre de l'estimation propre à l'observateur, jamais le
potentiel réel. Les facteurs segmentés d'âge sont interpolés entre les centres des
segments ; prolonger les valeurs extrêmes hors domaine.

Calibrage : la courbe de niveau et les facteurs d'âge sont ajustés sur la colonne
`Value` du CSV source (hors les valeurs sentinelles à 348 M€), à l'import, pour les
joueurs des clubs actifs. À niveau égal, un joueur de 27-29 ans vaut environ 0,5 M€
à 60, 3 M€ à 65, 18 M€ à 70, 46 M€ à 75, 85 M€ à 80 et 140 M€ à 85 ; les meilleurs
joueurs du monde dépassent 200 M€. Un ancien joueur perd sa valeur bien plus vite
qu'avant (0,34 à 32-33 ans, 0,12 à 34-35 ans). Le poids du potentiel (0,75) reste
adapté aux jeunes avec cette courbe. Le rapport valeur source / valeur du jeu
vaut environ 1,0 en médiane sur l'ensemble des joueurs. Les postes (`rarete_poste`)
n'ont pas été recalés : l'écart de niveau entre postes de la source est mêlé à des
différences d'échelle de note.

Les valeurs d'indemnité suivent : le prix demandé vaut la valeur décotée multipliée
par le seuil vendeur, donc les grands transferts atteignent plusieurs dizaines de
millions pour un joueur de haut niveau. Les salaires attendus (fraction annuelle de
la valeur) restent inférieurs aux salaires source à tous les niveaux : un joueur
transféré garde de toute façon son salaire actuel au minimum.

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
- Vente : prix selon le statut du joueur dans l'effectif (voir ci-dessous).

Une bonne doublure a donc une utilité positive même si elle n'améliore pas le
meilleur onze. Les modulations jeunesse/risque s'appliquent ensuite ; elles ne
remplacent pas la valorisation de la profondeur.

Pour la vente, tout joueur a un prix : `can_sell` ne refuse que sous l'effectif
minimal et les gardiens requis. Le prix demandé (`asking_price`, le minimum que le
vendeur accepte) dépend du statut du joueur dans son effectif, de 0 à 1, le plus
haut de trois relevés (`squad_status`) :

- sa place dans la meilleure affectation du club : titulaire (1), rotation (0,6)
  parmi les `profondeur` meilleures places, doublure (0,3) jusqu'au profil nominal,
  aucune au-delà (0). La profondeur va de `profondeur_effectif_min` (16) à
  `profondeur_effectif_max` (20) selon la réputation du club, entre
  `reputation_profondeur_min` et `reputation_profondeur_max`, et l'affectation pèse
  ces places au moins à `poids_profondeur_vente` (0,75) : la rotation se joue toute
  la saison ;
- ses minutes de la saison rapportées à celles du joueur le plus utilisé du club :
  `part_minutes_pilier` (75 %) en fait un pilier (1), avec une confiance qui monte
  jusqu'à `matchs_confiance_minutes` (10) matchs joués ;
- pour un espoir, la marge de son potentiel estimé par le club sur son niveau :
  `marge_potentiel_espoir` (10 points) lui vaut le statut d'un joueur de rotation.

Le statut choisit un coefficient entre `coef_prix_hors_effectif` (0,45),
`coef_prix_doublure` (0,75), `coef_prix_rotation` (1) et `coef_prix_titulaire` (1,5),
appliqué à la valeur de marché vue par le vendeur, à `seuil_vendeur_multiplicateur`
(moins la réduction de surplus) et à la patience du club. Un titulaire ou un pilier
coûte donc environ deux fois sa valeur, un joueur hors de l'effectif utile sans
potentiel part sous sa valeur : le club s'en débarrasse. Les clubs dormants gardent
`multiplicateur_prix_demande`.

Le profil nominal vaut onze titulaires plus les rotations et doublures
configurées (24 joueurs avec les paramètres initiaux). Le plafond dur reste
30, y compris pour les regens. Les 30 joueurs importés ne sont pas tous des
joueurs à vendre immédiatement : un surplus est une priorité de marché, pas
une obligation de libérer sans contrat. La démographie vise à terme la somme
des profils nominaux, avec une phase initiale de stabilisation.

## Revenus et financement initial

Revenus structurels : réputation, classement précédent et coefficient du pays.
La réputation évolue chaque 1er juillet (`docs/reputation.md`), avant le renouvellement des
budgets : les revenus, le niveau visé, la profondeur d'effectif et l'attrait du club pour les
joueurs suivent donc ses résultats, avec de l'inertie ; un club relégué perd ainsi des revenus
et des joueurs devenus trop grands pour lui (`outgrown_by`).
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

Répartition des budgets (`core.world.budgets`) : un club peut déplacer ce qu'il
a de libre entre son budget de transferts et son plafond salarial. Un euro de
plafond hebdomadaire vaut `semaines_par_an` euros de budget, soit une saison de
ce salaire ; aucune trésorerie ne bouge. Le plafond reste au-dessus de la masse
salariale et des salaires réservés par les offres en cours, le budget au-dessus
des indemnités qu'elles réservent. L'écart choisi est gardé sur le club
(`wage_shift`, hebdomadaire, positif vers les salaires) et reconduit au bilan
annuel : vers les salaires, dans la limite de ce que le nouveau budget paie ;
vers les transferts, dans la limite de ce que le nouveau plafond laisse
au-dessus des salaires à honorer. Seul le club de l'utilisateur s'en sert
(`POST /api/partie/budgets`) ; l'IA garde un écart nul, et son bilan annuel est
inchangé.

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

Le joueur peut aussi refuser. Un joueur qui veut partir (voir « Contrats, moral et
départs ») ne cherche pas un mouvement latéral : il n'accepte qu'un club dont la
réputation dépasse la sienne de plus de `tolerance_baisse_reputation`, et aucun
moral ne lui fait accepter moins. Autrement, il ne descend pas vers un club nettement moins
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
ouverte depuis `jours_encheres` jours (2). Un acheteur seul paie le prix demandé.
Des rivaux surenchérissent (`outbid`, `core/world/market.py`) : chacun suit jusqu'à
ce qu'il peut atteindre (`reach` : son prix maximum, dans la limite de son budget et
de sa trésorerie une fois déduites les réservations de ses autres offres) ; le plus
offrant s'arrête `pas_surenchere` (2 %) au-dessus du suivant, les autres finissent à
leur propre limite. Le vendeur retient les offres à moins de `tolerance_vendeur`
(5 %) de la plus haute, et le joueur choisit parmi elles par son score, où la
réputation du club pèse ; l'indemnité est celle du club choisi.

**Prix maximum d'un acheteur** (`price_limit`, `core/ai/market.py`). Chaque club a,
pour chaque joueur, un prix qu'il ne dépasse pas : la valeur qu'il lui voit ×
(`multiplicateur_prix_max_acheteur` + `offres.prime_besoin` × besoin) × (1 +
`offres.poids_appetit_risque` × (appétit du risque − 0,5)) × une lecture propre au
club et au joueur, tirée une fois par fenêtre (gaussienne d'écart-type
`offres.bruit_ecart_type`, flux `price-limit`). Le besoin, de 0 à 1, est le gain de
qualité pondérée que le joueur apporte à l'effectif projeté, rapporté à
`offres.gain_besoin_plein` ; il vaut 1 pour une recrue exigée par un minimum, et il
est tiré pour la fenêtre (flux `outside-need`) pour un club dormant, qui n'a pas
d'effectif simulé. Un club ne propose rien pour un joueur dont le prix demandé
dépasse ce maximum : il passe au candidat suivant.

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
Le prix demandé suit le statut du joueur chez le vendeur ; il est public, et
l'acheteur l'offre tel quel en le réservant (`TransferOffer.ceiling`), son prix
maximum (`TransferOffer.limit`) ne servant qu'à surenchérir. Une offre relevée
réserve son nouveau montant.
Un refus définitif ou une concurrence perdue libère les réservations et permet
une recherche immédiate d'alternative, en excluant le joueur refusé pour ce tour
et sans ouvrir davantage de dossiers que le nombre de pistes perdues.

Le club de l'utilisateur ne passe pas par les enchères : il négocie
(`core/world/talks.py`). Chaque offre reçoit une réponse immédiate : acceptée si
elle atteint la demande, sinon refusée avec une contre-offre à cette demande. Au
bout de `tours_negociation` (3) offres refusées, les discussions sont rompues
pendant `jours_rupture_negociation` (7) jours.

1. L'indemnité, avec le club vendeur, dont la demande est son prix demandé. Le
   prix affiché et les contre-offres sont arrondis au-dessus à trois chiffres
   significatifs, pour qu'offrir le montant affiché suffise.
2. Une fois l'indemnité acceptée, le joueur est réservé : aucun club IA ne peut plus
   l'acheter. Il répond de `delai_reponse_min_jours` à `delai_reponse_max_jours`
   (1 à 3) jours plus tard, au plus tard le dernier jour de la fenêtre ; une
   actualité ouvre alors la négociation de son salaire, sur le même principe. Un
   agent libre commence directement par le salaire.
3. Une fois le salaire accepté, le joueur arrive 1 à 3 jours plus tard, avec une
   actualité, même si la fenêtre a fermé entre-temps. Une négociation salariale
   encore ouverte à la clôture expire.

L'indemnité et le salaire demandé sont réservés comme pour toute offre ; une offre
qui dépasse le budget, la trésorerie, la masse salariale ou l'effectif est refusée
avec la limite en cause. Le salaire réservé est la contre-offre que fera le joueur,
`wage_demand` arrondi au-dessus à deux chiffres significatifs par mois (`asked_wage`) :
c'est aussi la colonne PRÉTENTIONS de l'écran Joueurs, et le refus pour masse salariale
la cite avec la marge restante sous le plafond, autres offres déduites. Le nombre de négociations simultanées n'est pas limité,
contrairement aux clubs IA. Une offre de l'ancienne forme, encore aux enchères dans une
partie existante, est expliquée dans les actualités quand elle échoue (refus du
vendeur ou du joueur, offre rivale, clôture). Les offres reçues encore en attente à
la clôture sont signalées comme expirées.

**Offres reçues par l'utilisateur** (`core/world/sales.py`). Aucun prix n'est demandé
pour ses joueurs. Un club ne vient que si son prix maximum atteint le prix qu'un club
IA demanderait à sa place, qu'il réserve, et ouvre à une part de ce maximum :
`ratio_contre_offre` (0,75), décalé de `offres.ecart_ouverture` × (0,5 − patience du
club), le montant étant arrondi en dessous à trois chiffres significatifs. Les offres
en cours pour un joueur surenchérissent à chaque règlement (`surface`) : une offre
relevée est annoncée de nouveau, la ligne de son ancien montant passant à l'état
« relevée ». L'utilisateur accepte, refuse ou contre-propose :

- un refus (`raised`) fait revenir l'acheteur `delai_reponse_min_jours` à
  `delai_reponse_max_jours` jours plus tard (`TransferOffer.due`) avec une offre plus
  haute ; il se donne de `offres.relances_min` à `offres.relances_max` relances selon
  sa patience (`raises_allowed`) et répartit sur elles l'écart à ce qu'il peut
  atteindre, la dernière étant sa limite. Sans relance ni marge, il abandonne :
  `World.turned_away` le retient et il ne revient pas pour ce joueur avant la fenêtre
  suivante (la clôture vide le registre), sauf si le joueur est listé ou proposé ;
- une contre-proposition (`counter`) conclut la vente au prix nommé s'il tient sous ce
  que l'acheteur peut atteindre, et vaut refus sinon.

L'utilisateur peut déclarer un joueur **intransférable** (`set_untouchable`,
`World.not_for_sale`) : `can_sell` le refuse à tous, ses offres en cours tombent et il
quitte la liste. Le lister ou le proposer lève la déclaration ; un prêt la conserve.

Pour vendre, l'utilisateur place un de ses joueurs sur sa **liste des transferts**, ou
le **propose aux clubs** (`core/world/sales.py`). Dans les deux cas il fixe le prix
demandé, et les offres suivent le circuit des offres reçues : en attente de sa réponse,
avec une actualité.

- **Liste des transferts.** Le joueur y reste, à son prix, jusqu'à sa vente, son départ
  ou son retrait ; la liste reste ouverte hors mercato et sert à l'ouverture suivante.
  Chaque club qui recherche à son poste le voit, quel que soit son tirage de
  candidats, et l'examine avant les autres. Les clubs dormants le comptent dans le
  surplus qu'ils démarchent, quelle que soit la taille de l'effectif. L'acheteur
  offre directement le prix demandé, sans ouvrir plus bas ni surenchérir (sa limite
  est ce prix). Un joueur listé ne demande pas de prolongation.
- **Proposer aux clubs.** Pendant le mercato, tous les clubs examinent le joueur le
  jour même, à ce prix. Un club actif décide comme dans sa revue quotidienne, sans
  attendre son tirage : un besoin à ce poste non encore couvert, une place de
  négociation, les moyens et le gain de qualité minimal. Un club dormant qui a de la
  place tente sa chance avec `probabilite_demarchage_par_fenetre`. Les
  `offres_max_proposition` (5) offres que le joueur préfère (score du joueur, avec son
  bruit, tiré d'un flux propre au joueur et au jour) sont en attente de réponse
  aussitôt, sans période d'enchères. Le même joueur ne peut être reproposé qu'après
  `jours_relance_proposition` (14) jours. Refusé à un joueur arrivé récemment, ou
  dont le départ passerait sous l'effectif ou les gardiens minimaux.

Un prix fixé par l'utilisateur n'est payé que s'il ne dépasse pas le prix maximum de
l'acheteur, comme tout prix demandé. Un joueur listé, ou proposé depuis moins de
`jours_relance_proposition` jours, sait qu'il n'entre plus dans les plans de son club :
il accepte un club moins réputé jusqu'à `tolerance_baisse_joueur_a_vendre` (15 points)
au lieu de `tolerance_baisse_reputation`. Un joueur qui veut partir garde sa propre
règle. Les offres d'un joueur proposé qu'il n'accepterait plus à la fin de ce délai
sont retirées au règlement suivant, comme tout refus du joueur.

Hors urgence d'effectif, le gain de qualité doit être positif et atteindre
`gain_qualite_min_recrutement` (3 points pondérés par défaut). Un club déjà au
niveau cible ne recrute pas uniquement parce qu'il est riche.

Le salaire d'un transfert est la demande du joueur (`wage_demand`), pour les clubs IA
comme pour l'utilisateur. Elle part du plus haut de son salaire et de son salaire de
marché. Rejoindre un club plus réputé exige une hausse de `hausse_par_point_reputation`
(1 %) par point d'écart, jusqu'à `hausse_salaire_max` (30 %) ; un club moins réputé
obtient une baisse de `baisse_par_point_reputation` par point, jusqu'à
`baisse_salaire_max` (15 %). L'appât du gain du joueur (0 à 1) multiplie la hausse
par 0,5 à 1,5 et la baisse par 1,5 à 0,5, puis ajoute une prime de
`prime_appat_gain` (15 %) fois son appât du gain.

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
complète. Le rôle contractuel et l'ego individuel sont stockés ; à l'import l'ego vient
de la note `Ambition` de la source, sur une échelle qui garde la moyenne de 0,5.
L'appât du gain, de 0 (le sportif avant tout) à 1 (l'argent avant tout), vient de la
note `Loyality` de la source : `appat_gain_note_basse` (7,5) ou moins donne 1,
`appat_gain_note_reference` (11,5) donne 0,5, `appat_gain_note_haute` (15,5) ou plus
donne 0. Il est tiré autour de 0,5 pour un regen ou sans note. Le salaire demandé à
une prolongation vaut le salaire de marché augmenté de `prime_appat_gain` fois
l'appât du gain (`facteur_ego` n'est plus lu).

Ouvrir une négociation en cas d'insatisfaction ou d'échéance proche. Un joueur
arrivé depuis moins de `mercato.stabilite_apres_arrivee_jours` jours ne renégocie
pas. Un renouvellement doit apporter une hausse de salaire, ou une fin plus
tardive si l'échéance est à moins de `mois_avant_fin_declenchant` mois ; sa fin
n'est jamais antérieure à celle du contrat en cours. Valoriser
la conservation du joueur avec le score de départ, pas avec un ajout en double.
Le plafond salarial s'applique aussi aux renouvellements. À échéance inclusive,
le joueur est libéré le lendemain si aucun nouveau contrat n'est signé.
Les attentes et la satisfaction alimentent aussi le moral et les demandes de
transfert. Un joueur ne disparaît pas à cause d'un refus de renouvellement.
Dans le club de l'utilisateur, une demande refusée (`World.refused_renewals`) n'est
pas refaite tant que ce contrat court, sauf une fois quand il entre dans ses
`mois_avant_fin_declenchant` derniers mois après un refus plus ancien.

**Ambition.** Jouer tous les matchs pour un salaire correct ne suffit pas à un joueur
que son club ne peut plus contenter. Le dépassement `d` est l'écart entre son niveau
et le niveau visé par le club, au-delà de `marge_depassement_club` (voir le
mercato). La frustration vaut `ambition × min(1, d / ecart_frustration_maximale)`,
avec `ambition = ambition_base + ambition_poids_ego × ego` (bornée à 1) : un
caractère modeste s'agace aussi d'être de loin le meilleur d'un petit club, l'ego
l'aggrave. Elle est évaluée chaque semaine :

- elle retranche `poids_frustration_moral × frustration` de la cible du moral, qui
  converge ensuite à la vitesse de dérive habituelle ;
- au-dessus de `seuil_depart_souhaite`, le joueur veut partir : il ne prolonge pas
  son contrat, qu'il termine ou qu'il quitte par transfert, et `accepts_move` ne lui
  laisse que les clubs nettement plus réputés que le sien (voir le mercato) ;
- s'il veut partir et que l'utilisateur l'a déclaré intransférable (`held_back`), la
  cible de son moral perd encore `offres.malus_moral_intransferable` (0,2), et la
  cause nommée de son moral devient `intransferable`.

Le club le vend s'il reçoit son prix (règle d'invendabilité levée ci-dessus). S'il ne
reçoit aucune offre, le joueur arrive libre en fin de contrat et signe où son
salaire et sa réputation le mènent. Les joueurs libres, sans club, n'ont pas de
frustration.

## Réserve et prêts

Règles dans `core/world/reserves.py` et `core/world/loans.py`, paramètres dans
`demographie.progression.reserve` et `ia_gestion.mercato.prets`. Le manuel du jeu
(`docs/manuel/16-reserve-et-prets.md`) en donne le détail chiffré.

**Réserve.** `Player.reserve_since` est le jour d'entrée en réserve (None en équipe
première). Un joueur en réserve n'entre dans aucun `LineupContext` : ni composition
de l'IA, ni composition soumise, ni renfort de coupe. Il reste dans `Club.player_ids`
et sur la masse salariale. Son rang au poste (`contracts.position_ranks`) est celui
qu'il aurait en équipe première et il ne décale pas celui des autres ; sa satisfaction
de temps de jeu vaut 1 s'il a `reserve.age_max` ans au plus et ne serait pas titulaire
(rang ≥ nombre de titulaires de son poste dans la formation), 0 sinon. Un transfert,
un prêt ou une libération le sort de la réserve.

Chaque semaine (`reserves.reserve_events`), un club de l'IA y place ses espoirs en
surnombre (`surplus_prospects`) : `age_max_ia` ans au plus, potentiel estimé par le
club supérieur au niveau d'au moins `marge_potentiel_min`, et plus de joueurs valides
devant lui à son poste que la formation n'en aligne. Il ne retient que ceux à qui la
réserve rapporte plus que le plancher d'entraînement, du plus faible au plus fort,
tant que l'équipe première garde `effectif_min` joueurs et `gardiens_min` gardiens,
et rappelle les autres. Le club de l'utilisateur décide seul (`reserves.set_reserve`).

**Prêts.** `Player.loan` (club propriétaire, début, dernier jour) ; le joueur est dans
les `player_ids` et les `borrowed_ids` du club d'accueil, et dans les `loaned_ids` du
propriétaire. Le propriétaire garde le salaire sur sa masse salariale et la place dans
son effectif : `Club.squad_size`, que toutes les limites d'effectif lisent, compte les
joueurs sous contrat avec le club, prêtés compris, empruntés exclus. Un joueur prêté
n'est ni vendu ni prolongé (`can_sell` faux, `PlayerSigned` refusé) et n'a aucune
frustration de club trop petit. Les mouvements `loan` et `loan_return` sont ajoutés à
`World.transfers` ; ils ne comptent pas comme une arrivée récente.

Un prêt commence pendant un mercato (`loans.loan_ends`) : jusqu'à la veille de la
libération des contrats (« saison »), ou, en été, jusqu'à la veille de l'ouverture du
mercato d'hiver (« demi_saison »). Un prêt conclu en été avant la fin des contrats
court sur la saison suivante. Le retour (`return_events`) précède les expirations du
jour. Un club ne prête pas un joueur blessé, déjà prêté, dont le contrat ne dépasse pas
la fin du prêt, objet d'un transfert en cours, ou qui le ferait passer sous ses
minimums (`lender_obstacle`). Un club simulé accueille un joueur qui a au moins le
niveau visé moins `decote_doublure`, y serait titulaire ou premier remplaçant, et ne
le dépasse pas de plus de `marge_depassement_club` (`borrower_obstacle`).

Chaque semaine d'un mercato (`run_loan_round`), chaque espoir en surnombre d'un club de
l'IA que rien n'empêche de partir a `probabilite_hebdomadaire` chances de chercher un
club, les mieux notés d'abord ; il part jusqu'à la fin de la saison dans le club de
l'IA le plus réputé qui l'accueille, chaque club accueillant au plus `emprunts_max_ia`
joueurs. Le tirage a son propre flux (`loans`, graine et jour). Le club de
l'utilisateur prête (`lend`, à un club de `takers`) et emprunte (`borrow`, un joueur de
`lendable`) par ses propres commandes, réglées aussitôt ; aucun quota ne le limite.

## Composition et remplacements

Exclure blessés, suspendus et joueurs en réserve ; retenir la formation préférée si elle est
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
