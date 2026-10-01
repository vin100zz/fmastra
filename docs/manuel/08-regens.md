# Regens et centres de formation

Les regens sont les jeunes joueurs créés par le jeu pour remplacer ceux qui partent. Ils arrivent une fois par an, lors du bilan annuel, juste après les retraites.

## Combien de regens

Le jeu ne fixe pas de quota par club. Il vise un effectif nominal de {{monde.regles_match.joueurs_sur_terrain + ia_gestion.profil_cible.rotations_cibles + ia_gestion.profil_cible.doublures_cibles}} joueurs par club simulé ({{monde.regles_match.joueurs_sur_terrain}} titulaires, {{ia_gestion.profil_cible.rotations_cibles}} joueurs de rotation, {{ia_gestion.profil_cible.doublures_cibles}} doublures) et crée chaque année autant de regens qu'il en manque **au total** dans les clubs simulés. Si ces clubs ont ensemble plus de joueurs que la cible, aucun regen n'y arrive cette année-là.

Les places sont ensuite réparties entre les clubs :

- un club ne reçoit un regen que s'il lui reste une place dans son effectif ({{ia_gestion.garde_fous.effectif_max}} joueurs au plus) et de la marge sous son plafond salarial ;
- un club reçoit au plus {{demographie.centres_formation.allocation_max_par_club}} regens par an ;
- les clubs sous le minimum ({{ia_gestion.garde_fous.effectif_min}} joueurs, {{ia_gestion.garde_fous.gardiens_min}} gardiens) sont servis en premier, et un club à court de gardiens reçoit un gardien ;
- ensuite, plus un effectif est mince, plus il a de chances de recevoir une place.

Un club à l'effectif plein ou au plafond salarial atteint ne reçoit donc aucun jeune : c'est à vous de laisser de la place avant le {{date(monde.dates_cles.promotion_centre_formation.jour, monde.dates_cles.promotion_centre_formation.mois)}}.

Les clubs non simulés et les joueurs libres reçoivent leurs propres regens, de quoi garder constante leur population totale.

## À quoi ressemble un regen

**L'âge et le niveau de départ.** Le potentiel est tiré d'abord, le niveau en découle selon l'âge, à quelques pour cent près.

| Âge | Part des regens | Niveau de départ, en part du potentiel |
|---:|---:|---:|
{{#chaque demographie.generation.ratio_niveau_sur_potentiel}}| {{age}} ans | {{pct(demographie.generation.poids_age[i], 0)}} | {{pct(ratio, 0)}} |

Un regen arrive donc très loin de son potentiel : c'est sa progression des premières années, et donc son temps de jeu, qui fera de lui un joueur (voir [Progression](#/aide/progression)).

**Le potentiel.** Il est tiré dans une classe, puis uniformément à l'intérieur de cette classe :

| Classe de potentiel (sur 200) |
|---|
{{#chaque demographie.cohorte.buckets_niveau}}| {{element[0] * 2}} à {{element[1] * 2}} |

La part de chaque classe est celle mesurée sur les joueurs du fichier de départ, séparément pour les clubs simulés et pour le reste du monde. Chaque année, le tirage est corrigé : une classe devenue trop rare dans la population reçoit davantage de regens, une classe trop fournie en reçoit moins. Le monde garde ainsi, saison après saison, à peu près autant de grands talents qu'au départ.

**La nationalité.** Elle suit la répartition des nationalités du fichier de départ, avec la même correction. Pour un très grand potentiel ({{demographie.generation.seuil_potentiel_elite * 2}} et plus), la répartition est aplatie : un petit pays peut produire une star. Un regen n'a qu'une nationalité, et son nom est composé à partir des prénoms et des noms des joueurs de son pays.

**Le poste.** Sauf pour les places de gardien réservées, il est tiré selon cette répartition cible, corrigée elle aussi vers les postes qui manquent dans les clubs simulés :

| Poste | Part visée |
|---|---:|
{{#chaque demographie.cible_postes}}| {{cle}} | {{pct(valeur, 0)}} |

**Les aptitudes par poste.** Un regen vaut 20 à son poste. Ailleurs, son aptitude part d'une note type qui traduit la parenté entre les deux postes ; un poste absent de sa ligne lui reste fermé (1 sur 20) :

| Poste du regen | Notes types aux autres postes |
|---|---|
{{#chaque demographie.generation.aptitudes_postes.notes_types}}| {{cle}} | {{notes(valeur)}} |

Deux tirages distinguent ensuite un joueur d'un autre :

- **la polyvalence** : un écart propre au joueur (écart-type de {{demographie.generation.aptitudes_postes.ecart_type_polyvalence}} points) s'ajoute à toutes ses notes à la fois, puis un aléa à chacune (écart-type de {{demographie.generation.aptitudes_postes.ecart_type_poste}} points). Certains regens dépannent partout autour de leur poste, d'autres nulle part ;
- **le côté** : un joueur de couloir a le côté de son poste, un joueur axial un côté tiré au hasard. {{pct(demographie.generation.aptitudes_postes.probabilite_deux_cotes, 0)}} des regens jouent des deux côtés ; pour les autres, les postes du côté opposé ({{liste(demographie.generation.aptitudes_postes.postes_gauche)}} à gauche, {{liste(demographie.generation.aptitudes_postes.postes_droite)}} à droite) perdent {{demographie.generation.aptitudes_postes.malus_cote_oppose}} points.

Une note inférieure à {{demographie.generation.aptitudes_postes.note_min}} ne compte pas : l'aptitude reste à 1. Aucune n'atteint 20, réservé au poste principal. Ces aptitudes sont fixées à la naissance et ne changent plus.

**Les attributs.** Ils sont répartis autour du niveau de départ selon le profil du poste (un avant-centre reçoit plus de finition que de tacle), avec un aléa par attribut, puis ajustés pour que le niveau au poste tombe juste.

**Le caractère.** Fragilité, agressivité, ambition et appât du gain sont tirés au hasard (voir [Le caractère](#/aide/joueurs/le-caractere)).

**Le contrat.** {{demographie.centres_formation.duree_contrat_annees}} ans, à {{eur(demographie.centres_formation.salaire_hebdo_base * ia_gestion.budgets.semaines_par_an / 12)}} par mois.

## Quel club reçoit qui : RECRUTEMENT JEUNES

Tous les regens de l'année sont d'abord créés sans club. Ils sont ensuite classés du plus fort potentiel au plus faible, et **les meilleurs choisissent leur club en premier**, parmi ceux qui ont encore une place.

- Dans {{pct(demographie.cohorte.probabilite_club_national, 0)}} des cas, un regen choisit parmi les clubs de son pays, s'il y en a un avec une place.
- Chaque club pèse dans le tirage selon sa note RECRUTEMENT JEUNES, et ce poids compte d'autant plus que le regen est bien classé. Pour le meilleur regen de l'année, un club noté 20 a {{n(exp(demographie.cohorte.intensite_tri_centres * 0.5), 0)}} fois plus de chances d'être choisi qu'un club noté 10 ; pour un regen du milieu du classement, {{n(exp(demographie.cohorte.intensite_tri_centres * 0.25), 0)}} fois ; le dernier prend n'importe quel club.
- {{pct(demographie.cohorte.part_hors_tri, 0)}} des regens ignorent ces notes et tombent au hasard : même un petit centre voit passer un talent de temps en temps.

La note RECRUTEMENT JEUNES ne crée donc pas de talents : elle décide de **qui les récupère**. Elle ne donne pas non plus davantage de regens ; ce nombre dépend des places libres. Un club dont la note n'est pas renseignée est traité comme un club noté 10.

## ENTRAÎNEMENT

La note ENTRAÎNEMENT du club est affichée à titre d'information. Elle n'a aucun effet : ni sur la progression des joueurs, ni sur les regens, ni sur les blessures.

## Ce que les clubs voient du potentiel

Vous voyez le potentiel exact de chaque joueur. Les clubs de l'IA décident à partir d'une estimation, d'autant plus floue que le joueur est jeune :

- à {{demographie.estimation_potentiel.age_debut_convergence}} ans, l'erreur type est de {{demographie.estimation_potentiel.bruit_max * 2}} points ; elle se réduit régulièrement jusqu'à {{demographie.estimation_potentiel.age_convergence}} ans, où elle n'est plus que de {{demographie.estimation_potentiel.bruit_min * 2}} points ;
- un club réputé voit plus juste : l'erreur est multipliée par {{demographie.estimation_potentiel.facteur_observateur_base}} − {{demographie.estimation_potentiel.facteur_reputation_observateur}} × réputation ÷ 100 ;
- chaque club a sa propre erreur sur chaque joueur, et elle est retirée chaque année.

C'est cette estimation qui entre dans la valeur que l'IA attribue à un jeune, dans le prix qu'elle en demande et dans sa décision de le faire jouer. L'IA surpaie donc parfois un jeune ordinaire et laisse passer un futur grand joueur ; votre vue exacte du potentiel est un avantage réel sur le marché des jeunes.

## Les joueurs de complément

Quand un club entre dans les championnats simulés avec trop peu de joueurs (à la création de la partie, ou en montant depuis les divisions non simulées), il est complété jusqu'au minimum par des jeunes de son centre. Leur potentiel moyen vaut {{demographie.centres_formation.moyenne_base * 2}} + {{demographie.centres_formation.poids_reputation * 2}} × réputation + {{demographie.centres_formation.poids_note_centre * 10}} × note RECRUTEMENT JEUNES, avec une forte dispersion.
