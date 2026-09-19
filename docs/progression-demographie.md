# Progression, déclin et démographie

Les paramètres sont dans `config/demographie.json`. Les attributs restent
fractionnaires en mémoire ; l'affichage arrondit. Une variation mensuelle
inférieure à un point ne doit pas disparaître par arrondi.

## Progression mensuelle

Croissance = facteur d'âge positif × facteur de temps de jeu × marge au
potentiel normalisée × amplitude. Le facteur de jeu passe du minimum configuré
à 1 selon les minutes du mois et la référence. La croissance cesse à l'âge
défini par sa courbe et ne peut pas dépasser le potentiel.

Le déclin est un **terme indépendant**, en points de note globale par mois,
issu de sa propre courbe d'âge. Il n'est multiplié ni par la marge au potentiel,
ni par le temps de jeu. Un vétéran ayant atteint son plafond décline donc quand
même. Pour les gardiens, décaler l'âge de la courbe de déclin selon la config.
Prolonger les courbes par leur valeur extrême hors de leur domaine.

Répartir le déclin sur les attributs selon les poids configurés, normalisés par
les poids de note globale du poste, pour que l'effet global corresponde au taux
voulu. Les physiques déclinent davantage que placement, vision et sang-froid.
Appliquer le bruit mensuel puis les bornes ; plafonner tout gain net à la marge
réelle au potentiel. Les blessures peuvent ajouter une pénalité permanente.

Pour les joueurs dormants et libres, utiliser le facteur de jeu simplifié
configuré, sans inventer des minutes ou des statistiques de matches. Les
retraites et changements de régime ne doivent pas appliquer deux progressions
au même joueur sur un même mois.

## Potentiel estimé

La progression, la génération et l'API (affichage du potentiel exact) accèdent
au potentiel réel. L'IA des clubs reçoit une estimation produite par un service
dédié.

L'écart-type diminue avec l'âge depuis `age_debut_convergence` jusqu'à
`age_convergence`, avec un minimum non nul ; la réputation de l'observateur le
module. Tirer un biais normal avec un RNG dérivé de la graine, du joueur, de
l'observateur et de l'année d'observation. Le centre vaut potentiel + biais,
borné entre niveau connu et maximum d'attribut. La fourchette est centrée sur
**cette estimation**, pas sur le potentiel réel, et utilise la largeur configurée.

Conserver le biais et la période d'observation. Des consultations répétées ou
un rechargement de page ne provoquent pas de nouveau tirage. Le potentiel reste
incertain après l'âge de convergence ; le minimum de bruit évite sa révélation
exacte dans les décisions des clubs. Chaque club dispose de sa propre
estimation ; l'API n'expose pas le biais d'estimation.

## Population cible et cohorte

L'import charge 2 880 joueurs actifs avec les données présentes. À terme, la
cible d'effectif actif est la somme des profils nominaux des clubs (24 par club,
soit 2 304 avec la configuration initiale), avec maximum 30 par club. Les
premières saisons constituent une transition, pas une dérive à compenser en
réinjectant systématiquement tous les joueurs vendus.

Conserver un comptage annuel distinct : actifs, dormants, libres, retraités.
Les transferts entre ces populations ne créent pas de joueurs. Les cibles de
niveaux et de nations sont établies à partir des proportions importées après
sélection, puis stockées dans la partie ; les postes utilisent `cible_postes`.
Les ajustements vers ces cibles sont progressifs et seront calibrés : le
premier CSV ne constitue pas nécessairement un régime démographique stable.

Au bilan annuel, après retraites et expirations du jour :

- Mesurer la population active courante. Elle inclut déjà l'effet des départs,
  arrivées et retraites depuis le dernier bilan : ne pas les compter deux fois.
- Calculer le déficit positif par rapport à la cible nominale. La cohorte active
  autorisée est ce déficit multiplié par le coefficient de retour configuré
  (1 par défaut), arrondi stochastiquement avec le RNG de démographie si besoin.
  Un coefficient inférieur à 1 peut laisser un déficit durable en présence de
  sorties annuelles ; ce compromis doit être mesuré, pas présenté comme neutre.
- Répartir la cohorte entre clubs avec places et budget salarial disponibles,
  dans la limite annuelle par club. Aucun minimum obligatoire par centre.
- Comptabiliser séparément les flux nets de l'année pour expliquer le déficit
  et diagnostiquer la stabilité. Ne jamais ajouter un quota fixe de 175.

Le bilan, l'allocation et la promotion des centres ont lieu le **1er juillet**,
dans cet ordre, après expiration des contrats et mise à jour des budgets.
Un jeune de la cohorte qui ne peut pas être placé faute de place ou de budget
rejoint une capacité de génération dormante, en remplacement d'un jeune qui
aurait été produit dans ce régime ; il n'est pas ajouté au total en supplément.
S'il n'existe aucune capacité, ne pas générer cette place et rapporter le déficit.

Le régime dormant/libre conserve sa population combinée après retraites et
flux nets avec les actifs. Les agents libres vieillissent, progressent et
prennent leur retraite ; ils ne forment pas une population oubliée en croissance
illimitée. Répartir les remplacements du régime externe vers des clubs dormants
ayant des places et des moyens ; à défaut, créer des agents libres dans la
limite de la cohorte autorisée. Les créations ont toujours un ID neuf.

## Correction des distributions

Pour chaque axe niveau, poste, nation, comparer parts observées et cibles.
Corriger les poids de tirage par le rapport cible / observé élevé à `kappa`,
puis renormaliser. Les classes de niveau sont semi-ouvertes, dernière borne
incluse ; elles couvrent [1, 100]. Utiliser des effectifs cibles et un plancher
d'un individu au dénominateur pour les classes vides.

Ne pas fabriquer une table de tous les triplets niveau/poste/nation. Le contrôleur
corrige les marges séparément ; ses courbes de réponse et limites se vérifient
sur plusieurs graines. Il ne garantit pas la stabilité par construction.
Conserver les cibles dans la sauvegarde, pas les recalculer chaque année depuis
une population qui dérive.

## Génération

1. Nation tirée dans les poids de production dérivés de la population source,
   avec correction démographique ; les identités proviennent des listes de noms.
2. Poste tiré dans la cible corrigée. Pour chaque poste secondaire autorisé
   dans la table configurée, tirage indépendant à la probabilité configurée,
   puis affinité secondaire configurée. Aucune affinité totale gardien/champ.
3. Âge dans la plage de génération, niveau cible issu du potentiel et du ratio
   d'âge, avec bruit. Les gardiens ne sont pas évalués sur les mêmes poids que
   les joueurs de champ.
4. Pour un centre actif, potentiel normal autour de la moyenne réputation/centre,
   avec l'écart-type configuré, borné à [1, 100]. Pour le régime externe,
   potentiel issu de la loi bêta configurée. Ce sont deux modes exclusifs :
   on ne superpose pas deux tirages de potentiel au même joueur.
5. Répartir les attributs selon le profil de poste ; recentrer pour que la note
   globale corresponde au niveau cible. Le plafonnement peut réduire l'écart
   effectif ; vérifier après génération niveau <= potentiel.
6. ID unique, identité avec homonymes autorisés, contrat de centre si financé.

La correction de niveau agit sur les poids des classes de niveau initial,
pas en multipliant les attributs après coup. Réaliser un tirage conditionnel
par classes à l'aide d'un nombre borné de candidats configuré ; en l'absence
d'un candidat dans la classe, choisir le plus proche et journaliser ce repli.
Le calibrage doit suivre les distributions de niveau initial **et** de
potentiel ; elles ne sont pas interchangeables.

## Sorties

Retraite annuelle : probabilité liée à l'âge et au niveau selon `sorties`,
bornée explicitement à [0, 1]. Un joueur retraité sort des boucles actives mais
conserve une identité et une carrière archivées.

Un joueur faible libre peut recevoir une offre d'un club dormant : cela suit
le marché, les places et le budget, pas une téléportation forcée. Le seuil
`sortie_perimetre` alimente les priorités de shortlist. Un joueur sans offre
reste libre et pourra être recruté plus tard ou prendre sa retraite.

## Validation

Mesurer 30 saisons après la période de stabilisation configurée. Comparer
fenêtres de plusieurs saisons et plusieurs graines ; suivre effectifs, âges,
niveaux, postes, nations, flux et joueurs au-dessus de 85. Une tolérance
absolue accompagne celle en pourcentage pour les populations d'élite faibles.
La stabilité du total ne suffit pas si les joueurs d'élite disparaissent.
