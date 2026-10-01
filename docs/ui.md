# Interface

## Contrainte v1

L'utilisateur est **observateur**. Aucun écran n'a de bouton d'action sur un
club : pas de composition à valider, pas d'offre à émettre. L'interface sert à
consulter et à faire avancer le temps.

Cela n'autorise pas à mélanger lecture et décision dans le code : les endpoints
sont déjà organisés pour qu'ajouter le contrôle utilisateur consiste à ajouter
des routes d'action et une gestion de l'attente, en préservant les vues de lecture.

Afficher à la création le rapport d'import : au maximum 30 joueurs par club,
classement par niveau estimé avec places réservées aux gardiens, joueurs écartés,
agents libres et corrections de données. Les niveaux, potentiels et finances
issus de la synthèse sont signalés comme estimés.

## Principes

**Penser en vues, pas en entités.** Un endpoint renvoie exactement ce qu'un écran
affiche, plutôt qu'un REST générique qui obligerait le front à faire quarante
requêtes pour reconstituer une page.

**Filtrage, tri et pagination côté serveur.** Ne jamais renvoyer tous les joueurs
au navigateur. Toute liste est paginée, y compris la recherche de joueurs qui
porte sur l'ensemble des clubs, actifs et dormants. Seules les courtes listes
renvoyées en entier (les transferts ou le journal financier d'une saison, les
classements archivés, les saisons d'un club sur la page affichée) se trient dans
le navigateur ; le choix survit aux
rafraîchissements de l'écran.

**Interface minimaliste.** Pas de texte explicatif : pas de sous-titre sous un
titre de carte, pas de ligne qui décrit comment une donnée est calculée ou
reconstituée. Un élément secondaire se replie derrière un bouton plutôt que
d'occuper une barre vide, et un bouton reprend le style des autres (carré, même
hauteur) plutôt qu'une forme propre.

**Le plus d'informations visibles sans défiler.** Barre du haut de 48 px, marges
de 8 à 12 px, titres de carte de 32 px, lignes de tableau de 26 px et pastilles
de 18 px. L'en-tête d'un club, d'un joueur ou d'une sélection tient sur une ligne
(écusson réduit, nom, puis les faits séparés par des barres). Une carte ne répète
pas l'onglet qui l'affiche ; une alerte devient un badge dans la barre d'outils
plutôt qu'un bandeau. Sur l'écran Composition, tout tient dans la fenêtre : le
terrain se dimensionne sur la hauteur disponible et la liste de l'effectif
défile dans sa carte.

**Code couleur constant.** Gardien, défense, milieu, attaque gardent la même
teinte partout, de la liste d'effectif au terrain. C'est ce qui permet de lire
une composition en une seconde.

**Trois chiffres par ligne de joueur.** Âge, salaire, fin de contrat. Une
échéance à moins de 12 mois passe en rouge. C'est la liste de tâches implicite,
et elle remplace tous les écrans de gestion supprimés.

## Contrôle du temps

Barre persistante en tête d'application :

- Date courante, saison, prochaine échéance
- Les trois prochains matchs du club dirigé, dans un bandeau segmenté à gauche
  de « Continuer » : pour chacun, le délai en gros (J-6, « Auj. »), puis
  l'adversaire (avion si le match est à l'extérieur) et la compétition dessous,
  en bleu pour une coupe. Le prochain match a son délai et un soulignement en
  couleur d'accent ; deux matchs seulement sous 1200 px, aucun sous 950 px
- Bouton « Continuer »
- Journal des événements du jour : résultats, transferts, blessures

Le mode Auto (enchaîner les journées) et le choix du thème clair ou sombre sont
en bas du menu de gauche, sous « Ma partie » ; sur téléphone, en haut à droite à
côté de l'icône de « Ma partie ».

### Enchaînement de « Continuer »

« Continuer » avance jusqu'au prochain jour que suit le club dirigé
(`core/world/steps.py`) :

- une journée de sa division (pas celles des autres divisions du pays) ;
- un tour de la coupe de son pays, même éliminé ;
- une soirée européenne, même sans y participer : C1, C3 et C4 jouent le même soir ;
- une date de match des sélections (qualifications et phase finale) ;
- le 1er juillet (nouvelle saison) et la veille de la fermeture de chaque mercato.

L'avance s'arrête plus tôt sur une nouvelle actualité qui demande une décision
(offre reçue, négociation de contrat ouverte, demande de prolongation), et ne
dépasse jamais 7 jours.

- Le club joue ce jour-là : « Prochains matches » de sa compétition, le bouton
  devient « Match », puis la composition et le match, puis « Derniers matches ».
- Sinon, « Derniers matches » de ce qui s'est joué : la coupe d'Europe du club,
  la C1 s'il n'en joue aucune.
- Rien de suivi n'a été joué (semaine creuse, date clé, décision à prendre) :
  directement Mon club.

Après les résultats, « Continuer » mène à Mon club si une actualité est arrivée
depuis sa dernière visite, sinon avance directement. Ces étapes restent dues si
l'on consulte d'autres pages entre-temps (état gardé dans l'onglet du navigateur,
`web/flow.js`). Le mode Auto garde son propre rythme : il enchaîne toutes les
dates de matchs du monde et ne s'arrête jamais.

Une avance longue renvoie un identifiant de travail et une progression.
Elle s'affiche dans la barre du haut, sans décaler la page : le libellé au
milieu de la barre, la progression le long de son bord inférieur.
Désactiver les commandes incompatibles tant qu'elle est active ; les vues
lisent le dernier état cohérent validé. Une consultation ne tire aucun nouvel
aléa de simulation. Les estimations affichées restent stables sur leur période
d'observation.

## Écrans

### Titres de page

Une page n'affiche que son titre, sans ligne au-dessus ni au-dessous. Ce titre est
celui de son entrée dans le menu de gauche : Vue d'ensemble, Clubs, Joueurs, Mercato
mondial, Palmarès, Coupes d'Europe, Ma partie, ou le nom du pays pour la page d'un
pays. Le Journal, onglet de Vue d'ensemble, porte ce même titre et allume la même
entrée du menu. Les pages championnat et coupe nationale portent le nom de la
compétition. Les fiches club et joueur gardent leur en-tête d'identité (nationalités,
poste, âge, club, stade), qui présente des données et non un titre.

### Navigation entre pairs

Les fiches club, joueur, championnat et coupe nationale portent, dans l'en-tête et à
gauche du nom, un petit bloc vertical qui n'ajoute aucune ligne : un triangle haut
(pair précédent), un menu ☰ (tous les pairs) et un triangle bas (pair suivant). Le
menu est une liste flottante de liens, ouverte sur l'élément courant, avec « n / total » en
tête ; elle se ferme sur un clic ailleurs, sur un choix ou sur Échap, et reste ouverte
quand le mode Auto redessine l'écran. Le premier et le dernier n'ont pas de lien de leur
côté : leur triangle est grisé. Un groupe d'un seul élément n'affiche pas le bloc.

| Fiche | Groupe parcouru | Ordre |
|---|---|---|
| Club | clubs de la même division ; sans division, tous les clubs du pays | alphabétique, sans accents ni casse |
| Joueur | effectif du club du joueur (rien pour un retraité ou un agent libre) | poste (gardiens d'abord), puis nom |
| Compétition | compétitions du même pays | divisions de la plus haute à la plus basse, puis coupe |

Changer de club conserve l'onglet ouvert (Finances reste sur Finances). Les clubs
homonymes de la source (un club et son doublon sans joueurs) affichent leur effectif
entre parenthèses. Dans le menu des joueurs, chaque nom est précédé de la couleur de son poste. Les coupes d'Europe gardent leurs onglets de coupe.

### Club

| Onglet | Contenu |
|---|---|
| Effectif | blocs d'entrée puis liste triable : poste, nom, nationalités, âge, note, potentiel exact, valeur, salaire, fin de contrat, état (blessé, suspendu, fatigue), forme, moral, matches, buts, passes, cartons, note moyenne ; ou, en vue Attributs, les attributs sur 20 ; ou, en vue Jeu, les composites sur 200 |
| Calendrier | matches passés et à venir, résultat, adversaire, domicile/extérieur |
| Budget | budget de transfert, masse salariale et plafond, solde, revenus |
| Transferts | arrivées et départs de la saison, avec montants |
| Historique | une ligne par saison terminée (championnat, rang, réputation à l'ouverture et sa variation, coupe nationale, coupe d'Europe, titre), les 15 joueurs les plus utilisés et les 15 meilleurs buteurs du club, ses 10 plus gros transferts entrants et sortants |

En-tête : nom, pays, compétition, réputation, classement actuel, forme sur les
5 derniers matches.

L'onglet Historique ne reprend pas les classements complets (ils restent dans l'historique de
la compétition) et n'affiche pas de compteur « N résultats » sous le tableau ; la pagination
n'apparaît qu'au-delà de 30 saisons. Chaque saison terminée donne le niveau atteint en coupe
nationale (32es de finale à finale, ou « Vainqueur ») et en coupe d'Europe (phase de ligue,
barrages, huitièmes, quarts, demi-finales, finale, ou « Vainqueur ») ; les deux manches d'une
confrontation comptent pour un seul tour, et « — » signale une coupe non jouée. Un club sans
championnat simulé garde les lignes de ses saisons de coupe. Les colonnes se trient, les coupes
par profondeur du parcours. Dessous, deux classements de 15 joueurs (matches, puis buts) additionnent
toutes les compétitions et toutes les saisons, saison en cours comprise, pour ce seul club ; à
égalité de matches, le meilleur buteur passe devant, à égalité de buts celui qui a joué le moins.
Enfin, les 10 plus gros transferts payants du club (arrivées, puis départs) sont classés par
indemnité décroissante, les plus récents en premier à montant égal ; les départs libres sont exclus.

L'onglet Effectif est le point d'entrée du club. Quatre petits blocs précèdent la
liste, sur une seule ligne (deux par deux sous 1330 px, empilés sur téléphone),
chacun renvoyant vers l'onglet ou le match qu'il résume :

| Bloc | Contenu | Lien |
|---|---|---|
| Calendrier | 5 derniers matches (résultat coloré V/N/D, adversaire, avion rouge à l'extérieur, compétition hors championnat sur la même ligne), puis 3 prochains, sans intertitres | onglet Calendrier |
| Finances | budget de transferts disponible (hors offres en cours), masse salariale mensuelle, plafond et part utilisée | onglet Finances |
| Transferts | les 3 dernières arrivées et les 3 derniers départs de la saison en cours (joueur, club et montant sur une ligne) avec totaux ; les autres mouvements (jeunes promus, fins de contrat, retraites) sont comptés | onglet Transferts |
| Dernier onze aligné | le onze du dernier match dont la composition est conservée, sur le terrain du compte rendu (noms réduits au nom de famille) ; maillot en couleur primaire du club, note du match en couleur secondaire (avec un halo quand elle se lit mal sur la primaire) | compositions du match |

Toutes les colonnes de la liste se trient, sur ce qu'elles affichent : le nom sans
tenir compte des accents ou des majuscules, les nationalités par leur code affiché,
l'état du plus indisponible (blessé, puis suspendu) au plus frais. Il n'y a pas de
colonne de minutes jouées. Les tableaux des autres onglets (transferts, journal
financier, saisons du club et classements archivés) se trient aussi. Un tri ne change
la largeur d'aucune colonne, dans aucun tableau : chaque en-tête triable garde la place
de sa flèche, et les listes triées par le serveur (joueurs, clubs, mercato mondial) ont
des colonnes de largeur fixe, si bien qu'un tri ou une autre page ne les déplace pas ;
la page garde sa position de défilement.

Dans la vue Infos d'un effectif, FORME donne l'effet de la forme sur tout ce que fait le joueur en match, signé (1,11 se lit « +11 % »), en vert ou en rouge, en gris entre −2 % et +2 %. MORAL donne le moral sur 100, une flèche vers la cible qu'il rejoint peu à peu chaque semaine (à partir de 3 points d'écart) et, sous 70 %, ce qui le retient le plus : € pour le salaire, ◷ pour le temps de jeu, ★ pour un club en dessous de son niveau (`morale_target` et `morale_cause` de la liste, tirés du calcul hebdomadaire des contrats). L'infobulle donne la cible et la satisfaction du joueur pour son salaire et son temps de jeu. L'écran Joueurs n'a pas ces colonnes.

Trois boutons en tête de la liste des joueurs d'un club et de l'écran Joueurs, « Infos »,
« Attributs » et « Jeu », changent ses colonnes. La vue Attributs garde poste, nom, âge, niveau et potentiel
(et le club sur l'écran Joueurs), puis donne les 15 attributs en badges de 1 à 20, aux couleurs du
bloc Attributs de la fiche joueur, sous quatre intertitres qui couvrent leurs colonnes : Général
(Passe, Vitesse, Endurance), Défense (Tacle, Placement), Attaque (Finition, Sang-froid, Technique,
Vision, Jeu de tête, Centres, Coups arrêtés) et Gardien (Réflexes, Sorties, Relance). Chaque colonne
porte une abréviation de trois lettres, le nom complet en infobulle, et se trie côté serveur. Ce que
la fiche joueur masque ou replie est en gris : le bloc Gardien d'un joueur de champ, Défense (sauf
Placement) et Attaque d'un gardien. La vue Jeu garde les mêmes premières colonnes, puis donne les
huit composites du moteur de match en badges sur 200, comme le niveau, sous trois intertitres :
Attaque (Progression, Création, Frappe, Jeu aérien : PRO, CRÉ, FRA, AÉR), Défense (Défense au milieu,
Défense de surface : DMI, DSU) et Gardien (Arrêts, Sorties aériennes : ARR, SAÉ). Les composites que
le poste du joueur ne demande pas sont en gris (`key_composites` de la liste, voir la fiche joueur).
Changer de vue garde le tri quand l'autre vue a sa colonne ; sinon elle s'ouvre sur son tri par
défaut (le poste pour un effectif ; sur l'écran Joueurs, la valeur, ou le niveau en vues Attributs
et Jeu). La vue suit le passage d'un club à l'autre.

### Compétition

| Onglet | Contenu |
|---|---|
| Classement | position, J, V, N, D, BP, BC, différence, points, forme |
| Calendrier | matches par journée, avec résultats |
| Derniers matches | la dernière journée ou le dernier tour joué, à côté du classement et des 10 meilleurs buteurs |
| Prochains matches | la prochaine journée ou le prochain tour, à côté du classement et des 10 meilleurs buteurs |
| Statistiques | meilleurs buteurs, passeurs, meilleures notes moyennes, clean sheets, cartons |
| Historique | champions par saison, meilleur buteur par saison, puis les 15 joueurs les plus utilisés et les 15 meilleurs buteurs de tous les temps du championnat, puis les classements archivés |

Toutes les compétitions (championnats, coupes nationales, coupes d'Europe, éditions de l'Euro et de
la Coupe du monde) ont les onglets Derniers matches et Prochains matches, juste avant Statistiques.
Le dernier tour est celui du résultat le plus récent, le prochain celui du plus proche match à jouer ;
un tour pas encore tiré garde son nom et sa date, sans matches. Les matches sont à gauche, sur 460 px au
plus, et le classement qu'ils concernent prend le reste de la largeur : le championnat, ou le classement
de la phase de ligue d'une coupe d'Europe. Ce classement est suivi des 10 meilleurs buteurs de la
compétition sur la saison (#, joueur, club, buts), à sa droite à partir de 1450 px, dessous en deçà ;
ils n'apparaissent qu'une fois un but marqué.
Une compétition à groupes (qualifications et phase de groupes des sélections) montre chaque groupe avec
ses matches et son classement réduit (#, points, J, différence), deux groupes par ligne (un seul sous
1330 px), les places qualificatives surlignées. Un tour à élimination directe, sans classement, étale
ses matches sur deux colonnes. Sous chaque match joué, les buteurs de chaque équipe sont alignés sous
elle, par nom de famille (lien vers la fiche), dans l'ordre de leur premier but, avec les minutes de
leurs buts regroupées : « Maupay (14, 75), Welbeck (56) ». Les minutes suivent la feuille de match
(1 à 45, puis 45+1…, 46 à 90, puis 90+1…) ; la séance de tirs au but n'y figure pas.

L'onglet Tableau d'une coupe nationale (sa seule vue des tours, ouverte par défaut), la Phase
finale d'une coupe d'Europe et la phase finale d'une édition internationale dessinent l'arbre à
élimination directe : une colonne par tour, du premier à la finale, chaque confrontation centrée
à droite des deux dont elle réunit les vainqueurs. Une confrontation donne, par équipe, le score
de chaque match (aller puis retour, sans cumul) et, s'il y en a eu, les tirs au but entre
parenthèses. L'équipe qualifiée est surlignée. Un clic sur le bloc ouvre le match (le retour
une fois joué), un clic sur le nom d'une équipe ouvre sa fiche, et en aller-retour chaque score
ouvre son propre match. Les tirages étant ouverts en coupe nationale et en coupe d'Europe,
l'ordre des cases est reconstruit après coup à partir des vainqueurs, et un tour pas encore
tiré reste en cases vides non reliées ; le tableau des sélections, fixé d'avance, relie aussi
les tours à venir. En coupe d'Europe, les barrages occupent autant de cases que les huitièmes :
chacun est aligné sur le huitième où son vainqueur retrouve un club classé de 1 à 8.

L'onglet Palmarès d'une coupe nationale ou d'une coupe d'Europe (vainqueurs par saison) se termine par
les mêmes deux classements de 15 joueurs. Ils additionnent toutes les saisons, la saison en cours
comprise, et tous les clubs qu'un joueur a servis dans cette seule compétition (les matches et
buts d'une autre compétition ne comptent pas) ; l'égalité se départage comme pour l'historique
d'un club.

### Palmarès

Le lien **Palmarès** du menu de gauche (`#/honours`) réunit sur une page les vainqueurs
de toutes les compétitions, sur toutes les saisons archivées. Une rangée de blocs par
groupe : d'abord les trois coupes d'Europe (C1, C3, C4), puis chaque pays dans l'ordre
du menu (France, Angleterre, Espagne, Italie, Allemagne) avec un bloc par division, de
la D1 vers le bas, suivi du bloc de la coupe nationale. Chaque bloc est un tableau
saison / champion, la saison la plus récente en premier, qui défile dans le bloc quand
il s'allonge, et renvoie par « Historique → » à l'onglet de la compétition. Une
compétition sans vainqueur (début de partie, ou coupe en cours) garde son bloc, avec
un message. Le champion d'un championnat n'est connu qu'à la clôture de la saison ;
celui d'une coupe, à la fin de sa finale.

### Joueur

Une seule page, sans onglets (un joueur retraité n'affiche que son historique).
Les blocs Attributs, Aptitudes par poste et Évolution du niveau occupent une même
ligne de trois colonnes (deux colonnes puis une seule sur écrans étroits) ; l'état et
la carrière sont dessous. Sans aptitude à afficher, l'état prend la place du terrain
dans la ligne du haut et la carrière reste seule dessous.

| Bloc | Contenu |
|---|---|
| En-tête | nom, nationalités, poste et postes secondaires, âge, club ; date de naissance, salaire mensuel, fin de contrat, valeur de marché estimée |
| Attributs | en tête, la section Jeu : les composites du moteur de match en badges sur 200, les six d'un joueur de champ (Progression, Création, Frappe, Jeu aérien, Défense au milieu, Défense de surface) ou les deux d'un gardien (Arrêts, Sorties aériennes), avec leurs poids en infobulle. Ceux que le poste demande sont marqués d'un point, les autres en gris ; le poste lu est celui choisi sur la carte des aptitudes, le poste principal par défaut, et son intertitre le nomme. Puis les 15 attributs en badges de 1 à 20, avec le niveau (Niv.) et le potentiel exact (Pot.), sur 200, dans l'en-tête du bloc. Quatre sections : Gardien (Réflexes, Sorties, Relance), Défense (Tacle, Placement), Attaque (Finition, Sang-froid, Technique, Vision, Jeu de tête, Centres, Coups arrêtés) et Général (Passe, Vitesse, Endurance). Un joueur de champ ne voit pas Gardien ; un gardien ne voit que Gardien (Placement s'y ajoute) et Général, ses autres attributs sont dans un repli « Autres attributs », fermé par défaut. Les sections et les attributs de chacune gardent toujours le même ordre, quel que soit le poste (Défense, Attaque, Général ; pour un gardien, Placement s'insère après Sorties). Un point marque les attributs pesant au moins 14 % de cette note, avec leur poids en infobulle (`attribute_weights` de la fiche, tiré de `note_globale`) |
| État | blessure en cours et durée, fatigue, suspension, forme, moral |
| Évolution du niveau | courbe mensuelle du niveau, sur 200, avec axes gradués ; l'abscisse est le temps (mois sur deux ans au plus, puis années), les saisons antérieures à l'historique mensuel n'y ont qu'un point, à leur ouverture. Un point marque l'ouverture de chaque saison et le dernier mois : il reprend les couleurs du club de la saison (dernier club de la saison en cas de transfert) et son infobulle donne mois, club et niveau |
| Aptitudes par poste | carte de terrain, à la même taille que celle du dernier onze aligné d'un club (maillots et libellés compris) : niveau de 10 à 20 aux seuls postes où il atteint 10, poste principal entouré ; à droite de chaque maillot, la note au poste sur 200 (voir Composition). Cliquer un poste fait lire la section Jeu des attributs pour lui, son libellé passe en jaune |
| Carrière | une ligne par saison et club : transfert, division du championnat, précédée du drapeau de son pays, et code de la coupe d'Europe (pas de coupe nationale), matches, buts, passes, note |

Les textes du graphe ont la même taille que le reste de l'interface. Les niveaux,
potentiels, attributs et aptitudes par poste sont des badges dont la couleur va du
rouge au jaune puis au vert : sur 200, rouge jusqu'à 70, jaune à 110, vert à partir
de 150 ; sur 20, rouge jusqu'à 4, jaune à 10, vert à partir de 16.

Sur la fiche d'un joueur de son club, l'en-tête porte les actions de vente à côté de
« Proposer un contrat » : « Mettre sur la liste », qui ouvre une boîte de dialogue au prix
demandé (valeur de marché par défaut) et devient « Retirer de la liste » avec une pastille
« Sur la liste · prix », et « Proposer aux clubs », même boîte de dialogue, grisé avec la
raison en infobulle pendant le délai de relance, hors mercato ou pour un joueur intransférable.
Dès qu'une offre attend une réponse, « Offres reçues · n » ouvre la liste des offres
pour ce joueur, à accepter ou refuser ; elle s'ouvre seule après une proposition qui en
a obtenu. Dans Mon club, la carte Transferts et contrats liste aussi les joueurs sur la
liste des transferts, avec leur prix.

### Match

Écran de compte rendu, consultable après simulation :

- Score, compétition, journée, stade
- xG, tirs, possession, corners, cartons
- Fil chronologique des événements avec joueurs nommés
- Compositions des deux équipes avec notes individuelles
- Résumé 2D des occasions, replié par défaut : le bouton « Résumé 2D » à droite
  du bandeau du score l'ouvre et lance la lecture, puis le replie (la lecture se
  met en pause). Le terrain n'est construit qu'à la première ouverture.
  Le bouton « 3D » des contrôles bascule sur une vue télévision (`replay-3d.js`,
  Three.js dans `web/vendor/three/`, chargé au premier usage) qui dessine les
  mêmes positions ; le choix est retenu, sans WebGL le bouton disparaît.
  Le stade a des tribunes pleines (supporters aux couleurs des deux clubs, les
  visiteurs dans un coin), des loges, des panneaux LED et des filets. Les joueurs
  sont articulés : ils courent, frappent, reprennent de la tête les centres, le
  gardien plonge et l'équipe qui marque célèbre avec ses supporters.

### Composition

L'onglet Composition du club dirigé : tactiques en haut, le terrain et les remplaçants à gauche,
la liste de l'effectif à droite, triable. On glisse un joueur sur un poste ou sur le banc ; un clic
droit sort un joueur de la composition ou met un joueur sur la prochaine place libre ;
« Meilleure composition » reprend la suggestion de l'IA pour la tactique affichée.

Le terrain est une grille : cinq colonnes sur chaque ligne (défense, sentinelles, milieu, milieu
offensif, attaque) et le gardien seul dans son but. Chaque tactique y pose ses postes. Glisser un
poste du terrain, occupé ou vide, fait apparaître les cases libres, chacune avec le poste qu'elle
donne : latéraux sur les ailes jusqu'aux sentinelles, ailiers au-delà ; au centre, DC, MDC, MC, MOC
ou BU selon la ligne. Lâché sur une case, le poste s'y déplace avec son joueur et la tactique devient
« Perso », la tactique du club, à côté des autres (une seule, remplacée au déplacement suivant fait
depuis une autre tactique). Le moteur ne lit que les postes : deux ailiers en attaque ou au milieu
jouent de la même façon, la grille ne fait que les montrer. La tactique « Perso » part avec la
composition envoyée au match et reste dans la sauvegarde ; elle est aussi proposée dans la fenêtre
Tactique du direct.

Sur le terrain, chaque titulaire porte sa note au poste, sur 200 à droite du maillot ; quand la
colonne voisine de la même ligne est occupée (ou au bord du terrain), elle passe à gauche, et sous le
nom si les deux côtés sont pris. Sous 20/20 seulement, son affinité au poste est sur le coin haut
gauche du maillot ; une forme d'au moins ±5 % met une flèche ▲ ou ▼ sur son coin bas droit. La note au poste est la moyenne des
composites que ce poste demande, multipliée par le facteur hors poste du moteur (`malus_hors_poste`).
Les composites demandés par poste sont une liste d'affichage de l'API (`COMPOSITES_BY_POSITION`,
tirée de `implications.json`, la clé en premier) : aucun match ne la lit.

« Infos » et « Jeu », à côté de « Meilleure composition », changent les colonnes de la liste :
potentiel, fatigue, forme (son effet signé, comme dans l'effectif) et saison, ou les huit composites. Cliquer un poste du terrain le choisit : la
liste ajoute après COMPO la colonne « EN » suivie du poste, avec la note, la flèche de forme et l'affinité de chacun à
ce poste, et se trie dessus ; en vue Jeu, les composites de ce poste passent en jaune dans l'en-tête,
les autres en gris. Un second clic, ou une autre tactique, le libère.

### Match en direct

« Jouer » depuis la composition joue les autres matches du jour puis ouvre
`#/direct`, modal jusqu'au coup de sifflet final : l'écran prend toute la
fenêtre, sans menu ni bandeau. À gauche, le résumé 2D alimenté
segment par segment : seules les occasions sont animées, le compteur défile entre
elles. Sous le terrain, une vignette par joueur de l'équipe (titulaires puis
remplaçants) : note, buts, cartons, blessure et fatigue. À droite, les temps forts
(le widget du compte rendu, sans liens, un but n'y paraît qu'une fois marqué à
l'écran), les statistiques, le multiplex de la compétition et le classement tel
qu'il serait si les matches s'arrêtaient à la minute affichée.

- « Tactique » termine l'occasion en cours, ou arrête le compteur tout de suite
  entre deux occasions, puis ouvre une fenêtre dans le style de la composition :
  le terrain à gauche, les joueurs (sur le terrain, remplaçants, sortis) à droite.
  Glisser un remplaçant sur le terrain le fait entrer, glisser deux joueurs du
  terrain l'un sur l'autre échange leurs postes, renvoyer un entrant vers la liste
  annule son entrée ; tactiques et mentalité en haut. « Reprendre » applique les
  ordres et relance le match, « Annuler » (ou Échap) le relance sans rien changer.
- Une blessure ou un carton rouge dans l'équipe du joueur arrête le match et ouvre
  la fenêtre Tactique.
- À la mi-temps le compteur reste sur 45′ jusqu'à « 2e mi-temps », bouton affiché
  sur le terrain sous « Mi-temps ».
- « Fin du match » laisse l'IA finir le match sans l'afficher.
- Au coup de sifflet final, « Continuer », sur le terrain, clôt la journée et
  mène aux « Derniers matches » de la compétition, puis à Mon club. « 2e mi-temps » et « Continuer » reprennent le style du
  bouton « Continuer » du bandeau (classe \`cta\`).

« Simuler », à côté de « Jouer » dans le bandeau de la composition, joue le match
sans le regarder et affiche le compte rendu, puis « Derniers matches » et Mon club. Le mode Auto ne joue jamais en direct.

Pour un résultat analytique, signaler l'absence de détail et masquer les
statistiques inconnues au lieu d'afficher des zéros. Garder les compositions
initiales indépendantes des remplacements enregistrés ensuite.

### Recherche de joueurs

Vue transversale sur les joueurs importés (25 911 avec les CSV présents).
Filtres serveur : poste, statut du club (actif ou dormant), statut contractuel,
puis en filtres avancés âge, niveau et potentiel minimum, salaire, valeur et prix
maximum. Tri sur toute colonne, pagination obligatoire.

Les écrans Clubs et Joueurs retiennent leurs filtres et leur tri, et Joueurs sa vue (pas la page), dans
le navigateur : y revenir par le menu, ou après un rechargement, les rouvre tels
qu'on les a laissés. Changer un filtre garde le tri et la vue, et revient à la première page. « Réinitialiser », au bout de la ligne de filtres, les vide
et garde le tri et la vue ; il est grisé quand aucun filtre n'est actif.

Un club dormant est consultable — nom, effectif, fiches joueurs — mais n'a ni
classement, ni calendrier, ni statistiques de saison. L'interface doit le
signaler explicitement plutôt que d'afficher des sections vides.

## Endpoints

```
GET  /api/monde/etat                     date, saison, prochaines échéances, mode auto (auto.running / auto.stopping)
POST /api/monde/avancer                  {commande_id: str, jusqu_a: "etape" | "jour" | "journee" | "fin_mercato"} -> travail_id
POST /api/monde/auto/demarrer            {commande_id: str} -> travail_id ; enchaîne les journées jusqu'à l'arrêt
POST /api/monde/auto/arreter             signal d'arrêt idempotent -> {running, stopping, job}
GET  /api/travaux/{id}                  statut, progression, erreur éventuelle, compétition dont le tour suit (competition)
GET  /api/monde/journal?date=             événements du jour
GET  /api/monde/palmares                  champions de chaque compétition, toutes saisons : {europe, countries}

GET  /api/clubs?competition=&statut=actif|dormant&pays=&recherche=&page=&tri=&ordre=   tri : toute colonne (niveau et potentiel : moyenne des 16 meilleurs) ; nations : pays ayant des clubs
GET  /api/clubs/{id}                      en-tête + résumé
GET  /api/clubs/{id}/apercu               blocs d'entrée : calendrier, finances, transferts, dernier onze
GET  /api/clubs/{id}/navigation           pairs de la division (ou du pays) : précédent, suivant, liste
GET  /api/clubs/{id}/effectif?tri=&ordre=&page=   tri : une colonne de la liste, un attribut (passe, reflexes…) ou un composite (tir, occasion_attaque…)
GET  /api/clubs/{id}/calendrier
GET  /api/clubs/{id}/finances
GET  /api/clubs/{id}/transferts?saison=
GET  /api/clubs/{id}/historique           saisons terminées paginées (rang, réputation, coupe, Europe) + leaders {matches, goals} + transfers {arrivals, departures}

GET  /api/competitions
GET  /api/competitions/{id}/classement
GET  /api/competitions/{id}/calendrier?journee=
GET  /api/competitions/{id}/journee/derniere|prochaine?saison=   {round: {number, label, date} | null, groups: [{name, matches (avec scorers), standings | null, top_scorers (10 premiers buteurs de la saison, avec le classement) | null}]}
GET  /api/international/editions/{année}/journee/derniere|prochaine   idem sans top_scorers, un groupe par groupe de qualification ou de phase finale
GET  /api/competitions/{id}/statistiques?type=buteurs|passeurs|notes
GET  /api/competitions/{id}/historique    champions par saison paginés (avec classement archivé) + leaders {matches, goals} de tous les temps
GET  /api/competitions/{id}/navigation    compétitions du même pays : précédent, suivant, liste

GET  /api/joueurs?poste=&age_min=&age_max=&niveau_min=&nation=&club=&statut_club=&page=&tri=   tri : idem, attributs et composites compris
GET  /api/joueurs/{id}
GET  /api/joueurs/{id}/historique         carrière + trajectory : niveau sur 200 mois par mois {year, month, season, level}, du plus ancien au plus récent
GET  /api/joueurs/{id}/navigation        effectif du club : précédent, suivant, liste (null sans club)

GET  /api/matches/{id}                    compte rendu complet

GET  /api/ma-partie/composition?match_id=   effectif, tactiques, tactique du club (custom : [poste, ligne, colonne] | null), onze de départ, suggestions
GET  /api/ma-partie/composition/suggestion?postes=&match_id=   meilleur onze et banc de l'IA sur les postes de la tactique du club
POST /api/partie/composition              {commande_id, match_id, formation, titulaires, banc, perso} ; perso garde la tactique du club

POST /api/direct/demarrer                 {commande_id} -> travail_id ; joue les autres matches du jour, ouvre le direct
GET  /api/direct                          le match jusqu'ici : score, seconde, statut, événements montrés, stats, effectif du joueur
POST /api/direct/avancer                  {commande_id, jusqu_a: "evenement" | "fin"} -> segment suivant (ou la fin, jouée par l'IA)
POST /api/direct/ordres                   {commande_id, seconde: float|null, ordres: [...]} ; seconde = compteur arrêté entre deux occasions
GET  /api/direct/multiplex                autres matches du jour (buts horodatés) et classement avant la journée
POST /api/direct/terminer                 {commande_id} -> travail_id ; applique le résultat et clôt la journée

POST /api/partie/sauvegarder              {slot: str}
POST /api/partie/charger                  {slot: str}
POST /api/partie/supprimer                {slot: str}
GET  /api/partie/slots
POST /api/partie/creer                   graine et date/config initiales explicites
GET  /api/partie/rapport-import          volumes et corrections de la création
```

## Front

HTML, CSS et JS vanilla. L'essentiel des écrans est constitué de tableaux
triables — un framework n'apporterait rien ici.

- Une page par écran, navigation par ancres ou petit routeur maison
- Aucun état applicatif dupliqué côté client : le serveur est la source de vérité
- Rafraîchir après chaque avancée de temps

Les mêmes commandes d'écriture sont sérialisées côté serveur ; désactiver les
boutons ne remplace pas ce contrôle. Une sauvegarde reprend par défaut sa
configuration enregistrée. Les noms de slots ne sont pas des chemins libres.

Compter environ la moitié du temps total du projet sur l'interface si l'on veut
quelque chose d'agréable à utiliser. Ne pas commencer avant que le harnais de
calibrage donne des résultats corrects.
