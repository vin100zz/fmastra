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

**Une charte graphique.** L'apparence est fixée par `docs/charte-graphique.md` :
couleurs, typographie, mesures, composants, terrain et maillot, graphiques,
écriture des nombres, des montants, des classements et des compétitions. Ce document-ci dit ce
que chaque écran montre. Là où il parle d'apparence et où la charte dit autre
chose, la charte fait foi : l'écran est à aligner (section « Migration » de la
charte), et un besoin qu'elle ne couvre pas s'y ajoute avant de se coder.

**Penser en vues, pas en entités.** Un endpoint renvoie exactement ce qu'un écran
affiche, plutôt qu'un REST générique qui obligerait le front à faire quarante
requêtes pour reconstituer une page.

**Filtrage, tri et pagination côté serveur.** Ne jamais renvoyer tous les joueurs
au navigateur. Toute liste est paginée, y compris la recherche de joueurs qui
porte sur l'ensemble des clubs, actifs et dormants ; les écrans de liste demandent
la taille de page que la fenêtre peut montrer. Seules les courtes listes
renvoyées en entier (les transferts ou le journal financier d'une saison, les
classements archivés, les saisons d'un club sur la page affichée) se trient dans
le navigateur ; le choix survit aux
rafraîchissements de l'écran.

**Interface minimaliste.** Pas de texte explicatif : pas de sous-titre sous un
titre de carte, pas de ligne qui décrit comment une donnée est calculée ou
reconstituée, pas de libellé qui explique le jeu ou paraphrase l'écran. Une
mécanique du jeu qui doit être expliquée va dans le manuel du jeu (voir « Manuel
du jeu »), pas à l'écran. Un élément secondaire se replie derrière un bouton plutôt que
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
teinte dans toutes les listes : une pastille pleine, hors de l'échelle rouge-jaune-vert
des notes. Sur un terrain, quel qu'il soit (composition, dernier onze, compte rendu,
aptitudes, direct), les maillots prennent les couleurs du club et le poste s'y lit
sur le maillot.

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
- Un bouton à la loupe, à gauche de ces matchs : la recherche globale (voir « Recherche globale »)
- Bouton « Continuer », avec en pastille rouge le nombre de messages d'Actualités qui attendent une réponse ; la
  pastille ouvre le premier d'entre eux
- Journal des événements du jour : résultats, transferts, blessures

Le mode Auto (enchaîner les journées), le choix du thème clair ou sombre et le
manuel du jeu sont en bas du menu de gauche, sous « Ma partie » ; sur téléphone,
en haut à droite à côté de l'icône de « Ma partie ».

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
  directement Actualités.

Avant d'avancer de nouveau, « Continuer » fait lire le fil (`newsStep`, `web/flow.js`) :

1. tant qu'il reste des messages non lus, il ouvre le suivant dans Actualités, du plus récent au plus ancien ;
2. tout étant lu, il ouvre un message qui attend une réponse (offre reçue, contrat demandé par un joueur, contrat à
   négocier avec une recrue) ;
3. ce message à l'écran, il est grisé tant que la réponse n'est pas donnée ;
4. plus rien à lire ni à traiter : il avance.

Les résultats encore dus (le tour joué après un match simulé) passent après la lecture quand on est déjà sur
Actualités, avant elle depuis une autre page, et restent dus si l'on consulte d'autres pages entre-temps (état gardé
dans l'onglet du navigateur). Le mode Auto garde son propre rythme : il enchaîne toutes les dates de matchs du monde
et ne s'arrête jamais, même si des messages attendent une réponse.

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
celui de son entrée dans le menu de gauche : Actualités, Vue d'ensemble, Clubs, Joueurs, Mercato
mondial, Palmarès, Coupes d'Europe, Ma partie, ou le nom du pays pour la page d'un
pays. Les commandes de la page (recherche, filtres, choix des matches d'un pays)
se rangent sur la même ligne, à sa droite. Le Journal, onglet de Vue d'ensemble, porte ce même titre et allume la même
entrée du menu. Les pages championnat et coupe nationale portent le nom de la
compétition. Les fiches club et joueur gardent leur en-tête d'identité (nationalités,
poste, âge, club, stade), qui présente des données et non un titre.

### Actualités

Première entrée du menu (`#/actualites`, `web/news.js`), avec en pastille le nombre de messages non lus. Sous elle,
le club dirigé a sa propre entrée, à ses couleurs, qui ouvre sa fiche. L'écran tient en trois colonnes ; sur un écran
moins large les widgets passent sur une colonne, puis sous le message.

**Le fil**, à gauche, défile dans sa colonne : un message par ligne, du plus récent au plus ancien, avec le badge
coloré de sa catégorie (Transfert, Prêt, Contrat, Moral, Blessure, Suspension, Sélection, Formation, Mercato, Saison,
Trophée, Retraite), sa date et son titre. Un message non lu est en gras sur fond teinté, avec un point ; il est marqué
lu dès qu'il est ouvert. Un point rouge marque un message qui attend une réponse, une coche celui qui l'a reçue. « Tout
lire », au-dessus du fil, marque tout comme lu.

**Le message ouvert**, au centre (`?msg=<id>` ; sans lui, le prochain à lire, sinon un message à traiter, sinon le
dernier) : son badge, sa date, ce qu'il attend ou la réponse donnée, son titre, puis l'essentiel. Chaque nom de joueur,
de club, de compétition ou de sélection est un lien vers sa page ; il n'y a pas de liens à part.

Les événements d'un même genre le même jour font un seul message : les blessés d'un match, les suspendus, les
convoqués, les fins de contrat, les jeunes promus. Un joueur seul tient dans le titre (« Weah blessé 3 semaines ») ;
à plusieurs, le message liste chacun avec ce qui le concerne.

| Message | Contenu |
|---|---|
| Offres pour un joueur (à traiter) | Sa valeur en tuile ; une ligne par offre du jour : club, indemnité, « Accepter » / « Contre-proposer » / « Refuser ». « Contre-proposer » ouvre une boîte de dialogue au prix demandé (l'offre par défaut) : le toast dit si le club a suivi. À plusieurs offres ouvertes, « Tout accepter » (le joueur choisit son club) et « Tout refuser » ; tant que le joueur est au club et sur le marché, « Déclarer intransférable » à leur suite. Une offre traitée garde sa réponse : Acceptée, Refusée, Relevée (le club a offert plus depuis : la nouvelle offre est dans le message de son jour), Non retenue, Sans suite. Un message qui ne porte que des offres relevées s'intitule « n offre(s) relevée(s) pour … » |
| Un joueur veut un nouveau contrat (à traiter) | Salaire et fin de contrat, actuels et demandés ; « Accepter » / « Refuser » |
| Un joueur est prêt à négocier son contrat (à traiter) | Indemnité convenue et club vendeur, salaire qu'il demande s'il l'a dit ; « Négocier le contrat » (la boîte de dialogue de sa fiche) et « Abandonner » |
| Joueurs mécontents | Par joueur : ce qui pèse sur lui (temps de jeu, réserve, salaire, club trop petit, départ refusé à un joueur intransférable) et son moral |
| Contrats qui expirent (à 6 mois, à 1 mois) | Par joueur : son salaire, et « Proposer un contrat », qui ouvre le contrat qu'il signerait ; grisé avec la raison en infobulle s'il ne veut pas prolonger |
| Mercato ouvert | Date de fermeture, budget de transferts, marge sous le plafond salarial, lien vers Joueurs |
| Mercato qui ferme demain | Vos offres en cours, les joueurs dont une offre attend, budget de transferts, lien vers Joueurs |
| Bilan de la saison (1er juin) | Par compétition : la place ou le tour atteint, et le vainqueur ; la coupe d'Europe obtenue ; lien vers Palmarès ; meilleur buteur et meilleure note |
| Les autres (transfert, prêt, offre refusée, promotion, trophée…) | Une phrase, ses noms en liens |

Le fil ne raconte pas les résultats des matches : ils se lisent dans « Derniers matches » et le calendrier.

**Les widgets**, à droite, chacun avec « Voir → » vers sa page : le classement complet de la division (PTS, V, N, P,
BP, BC, DIFF., le club marqué), les indisponibles de l'équipe première (blessés avec leur date de retour, suspendus
avec leurs matchs), le calendrier (derniers et prochains matches), les joueurs (cinq premiers aux buts, aux passes,
à la note parmi ceux qui ont joué au moins la moitié des matches du plus utilisé, et aux matches), les finances (budget
de transferts disponible en grand, masse salariale en anneau rempli à sa part du plafond, rouge à partir de 95 %).

Les offres reçues, les offres en cours, la liste des transferts et les prêts du club se lisent dans l'onglet
Transferts de sa fiche, carte « Mercato en cours ».

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

### Recherche globale

Un bouton à la loupe dans la barre du haut, à gauche des prochains matchs, et le
raccourci Ctrl K ouvrent une boîte de dialogue (`web/search.js`) qui mène à la fiche
d'un joueur, d'un club, d'une compétition (championnat, coupe nationale, coupe
d'Europe) ou d'une sélection nationale. Elle n'existe qu'avec une partie et un club
choisi, et pas pendant un match en direct. Son apparence est dans la charte
(« Recherche globale »).

La recherche se fait sur le serveur (`api/search.py`), à chaque frappe, à partir de
deux lettres :

- sans casse ni accents : « ribery » trouve « Ribéry », « odegaard » « Ødegaard » ;
- sans ordre : « ribéry fra » et « franck rib » trouvent « Franck Ribéry » ; chaque
  mot tapé doit trouver un mot du nom qui lui soit propre ;
- sur une partie du nom : « bommel » trouve « van der Bommel ». Un mot tapé trouve
  un mot du nom en entier, par son début, ou en son milieu à partir de trois
  lettres (« dinho ») ;
- sans ponctuation : « ngolo » et « n'golo » trouvent « N'Golo », « zaire emery » et
  « zaire-emery » « Zaïre-Emery ».

Les résultats, 12 au plus, viennent dans cet ordre : le nom entier, puis un mot
entier, un début de mot, un milieu de mot. À correspondance égale : sélections,
compétitions, clubs, joueurs ; puis la sélection la plus forte, les compétitions du
pays du club dirigé avant les coupes d'Europe et les autres pays (championnats par
niveau, puis coupe), les clubs actifs avant les dormants et par réputation, les
joueurs du club dirigé puis le meilleur niveau, les retraités en dernier. Dans la
liste « Tout », sélections, compétitions et clubs ne prennent d'abord que 2, 3 et
3 lignes, pour laisser la place aux joueurs ; ils prennent celles qui restent. Le
choix du type (Joueurs, Clubs, Compétitions, Sélections) ne garde qu'un genre.

Les flèches déplacent la ligne choisie, Entrée ouvre sa fiche, Échap ferme, comme un
clic hors de la boîte. Le nom affiché est celui des fiches (le nom d'usage d'un
joueur) : c'est sur lui que porte la recherche. L'Euro et la Coupe du monde ne sont
pas dans la recherche : leurs pages restent sous « Sélections nationales ».

### Club

| Onglet | Contenu |
|---|---|
| Effectif | la liste triable à gauche (poste, nom, nationalités, âge, note, potentiel exact, valeur, salaire, fin de contrat, état, forme, moral, matches, buts, passes, cartons, note moyenne ; ou, en vue Attributs, les attributs sur 20 ; ou, en vue Jeu, les composites sur 200), les widgets du club à droite |
| Composition | le terrain du club dirigé, la liste de l'effectif et l'adversaire (voir « Composition ») |
| Calendrier | une ligne par match de la saison, buteurs compris, et le bilan de chaque compétition |
| Finances | quatre chiffres clés, la trésorerie et les flux du mois en graphiques, les salaires, la répartition, le journal replié |
| Transferts | le mercato en cours (club dirigé), le bilan de la saison, ses arrivées et ses départs |
| Historique | le classement et la réputation de chaque saison en graphiques, le palmarès, une ligne par saison terminée, les leaders et les plus gros transferts |

**En-tête.** Un bandeau aux couleurs du club (`club-hero.js`) : la couleur principale le remplit,
la seconde le traverse en bande diagonale. Une couleur principale proche du blanc laisserait le
bandeau se fondre dans la page : la seconde le remplit alors, et la bande prend la principale ; deux
couleurs trop proches ne laissent qu'une bande pâle de l'encre. Le texte du bandeau prend l'encre
(claire ou foncée) qui se lit sur son fond. À gauche, le bloc de navigation entre pairs, l'écusson
sur un disque blanc, puis sur une ligne le drapeau, la compétition et la capacité du stade (« Club
dormant » hors championnat), et le nom dessous. À droite, quatre cases : Tactique, Entraînement, Recrutement (des
jeunes, en infobulle) — ces deux-là sur 20 sans le dire — et Réputation, avec l'écart de la dernière
révision annuelle en vert ou en rouge (`reputation_change`, absent la première saison). Ni classement
ni forme : les widgets de l'Effectif les donnent. Les onglets ferment l'en-tête ; l'onglet ouvert est
souligné de la couleur du club la mieux lisible sur le panneau du thème.

**Effectif.** L'onglet est le point d'entrée du club. Il tient en deux listes, aux mêmes colonnes, au
même tri et à la même vue : « Équipe première · n joueurs », puis « Réserve · n joueurs · n prêtés », qui
réunit les joueurs placés en réserve et ceux que le club a prêtés (`away` de l'effectif). Un joueur en
prêt porte la pastille « Prêt » après son nom (les deux clubs et la date de retour en infobulle) et sa
ligne est teintée : en bleu pour un joueur emprunté, en bleu estompé pour un joueur prêté. La réserve
d'un autre club n'apparaît que si elle n'est pas vide ; celle du club de l'utilisateur garde son titre
même vide. Dans son club, chaque ligne se termine par un bouton carré, ↓ (envoyer en réserve) ou ↑
(rappeler en équipe première), absent pour un joueur en prêt ; un refus (équipe première au minimum,
joueur de la composition du jour) s'affiche en notification. La colonne NAT donne le drapeau et le
code de la nationalité principale.

À droite des listes (dessous sous 1250 px), une colonne de widgets, chacun avec « Voir → » vers ce
qu'il résume :

| Widget | Contenu | Lien |
|---|---|---|
| Calendrier | le même bloc qu'Actualités : 5 derniers matches (score domicile – extérieur coloré V/N/D, adversaire, avion rouge à l'extérieur, compétition hors championnat sur la même ligne), puis 3 prochains, sans intertitres | onglet Calendrier |
| Dernier onze aligné | le onze du dernier match dont la composition est conservée, sur un terrain à l'horizontale qui attaque vers la droite (latéral gauche en haut), noms réduits au nom de famille, maillots au corps de la couleur principale et aux manches de la seconde, le poste écrit dessus, sans note | compte rendu du match |
| Championnat | « Ligue 1 – 18e journée » : cinq lignes du classement autour du club, avec les points puis la différence de buts | page de la compétition |
| Finances | budget de transferts disponible (hors offres en cours) en grand, trésorerie, masse salariale mensuelle en anneau rempli à sa part du plafond, rouge à partir de 95 % | onglet Finances |

**Calendrier.** Une ligne par match de la saison, du premier au dernier, sans intertitre de mois :
le jour, la pastille de la compétition (deux caractères, voir la charte : C1, L1, D2, CF ; le
championnat en contour gris, la coupe nationale en contour bleu, la coupe d'Europe en noir plein),
le tour (J12, 32es), un avion à l'extérieur, l'adversaire, le score du côté
du club (ses buts d'abord, coloré V/N/D, la séance de tirs au but à côté de l'adversaire), les buteurs
du club avec leurs minutes, puis ceux de l'adversaire en gris. Le prochain match est surligné. Des
boutons au-dessus de la liste gardent une compétition (`competition` dans l'adresse). À droite, le
bilan de chaque compétition : la place (rang en championnat ou en phase de ligue, sinon le tour à
jouer, le tour de l'élimination ou « Vainqueur »), les matches, victoires, nuls et défaites en barre,
les buts marqués et encaissés ; une compétition pas encore jouée ne donne que sa place.

**Finances.** Quatre chiffres : le budget de transferts disponible avec la part réservée aux offres
en cours, la trésorerie et ce qu'elle a gagné depuis l'ouverture de la saison en cours, la masse
salariale mensuelle avec sa jauge sur le plafond (repère à 95 %), la balance des transferts de la
saison (achats, ventes). Dessous, la trésorerie à la fin de chaque mois sur les douze mois de la
saison, la plus grosse vente et le plus gros achat nommés sur leur mois ; les dix plus gros salaires
mensuels de l'effectif (hors joueurs prêtés), les autres additionnés ; les revenus et les dépenses
de chaque mois côte à côte ; la répartition des revenus (structurels, ventes) et des dépenses
(salaires, achats, fonctionnement), les régularisations d'arrondi masquées sous 1 % ; enfin le
journal financier, replié. Les flèches de saison, dans la carte de la trésorerie, changent tout sauf
les quatre chiffres.

**Transferts.** Pour le club dirigé, le mercato en cours sur quatre colonnes : les offres reçues
regroupées par joueur (avec sa valeur), chacune avec « Accepter » / « Refuser » ; ses offres et où en
sont les discussions ; sa liste des transferts ; les prêts dans les deux sens. Son en-tête dit si le
mercato est ouvert et donne le budget et la marge sous le plafond salarial. Puis, pour la saison
choisie : dépenses, recettes et balance, la plus grosse vente et la plus grosse recrue avec l'écusson
de l'autre club ; enfin les arrivées et les départs, chacun en une liste datée qui réunit tous les
mouvements (transfert, prêt, jeune promu, fin de contrat, retraite), avec badge du genre, poste, âge
au jour du mouvement, club et indemnité, et des boutons qui gardent un genre (`arrivees`, `departs`).

**Historique.** Le classement en championnat de chaque saison terminée, en courbe, la saison en
cours en pointillé après elles. La courbe a un étage par division où le club a joué, la plus haute
en haut, nommée à gauche : une saison de Ligue 2 se lit sous celles de Ligue 1. Chaque étage porte
les places de sa division telle qu'elle est aujourd'hui (Europe, montée, relégation) ; une saison
hors des championnats simulés laisse sa place vide et interrompt la courbe. À côté, le palmarès
(titres de champion, une ligne par division, la plus haute d'abord : « Champion de Ligue 1 »,
« Champion de Ligue 2 » ; coupes nationales, coupes d'Europe, meilleur classement, lu dans la plus
haute division jouée, meilleur parcours européen) et la réputation à l'ouverture de chaque saison. L'onglet ne reprend pas
les classements complets (ils restent dans l'historique de la compétition) et n'affiche pas de
compteur « N résultats » sous le tableau des saisons ; la pagination n'apparaît qu'au-delà de 30
saisons. Chaque saison terminée donne le rang (en pastille : or pour le titre, bleu en place
européenne, vert en place de montée, rouge en relégation, selon les places de la division de cette
saison), la réputation à l'ouverture et son écart, le niveau atteint en coupe
nationale (32es de finale à finale, ou « Vainqueur ») et en coupe d'Europe (phase de ligue, barrages,
huitièmes, quarts, demi-finales, finale, ou « Vainqueur ») ; les deux manches d'une confrontation
comptent pour un seul tour, et « — » signale une coupe non jouée. Un club sans championnat simulé
garde les lignes de ses saisons de coupe. Les colonnes se trient, les coupes par profondeur du
parcours. Dessous, deux classements de 15 joueurs en barres (matches, puis buts) additionnent toutes
les compétitions et toutes les saisons, saison en cours comprise, pour ce seul club ; à égalité de
matches, le meilleur buteur passe devant, à égalité de buts celui qui a joué le moins. Enfin, les 10
plus gros transferts payants du club (arrivées, puis départs), avec leur saison, sont classés par
indemnité décroissante, les plus récents en premier à montant égal ; les départs libres sont exclus.

Toutes les colonnes de la liste se trient, sur ce qu'elles affichent : le nom sans
tenir compte des accents ou des majuscules, les nationalités par leur code affiché,
l'état du plus indisponible (blessé, puis suspendu) au plus frais. Il n'y a pas de
colonne de minutes jouées. Tous les autres tableaux se trient aussi : celui qui ne
donne pas de valeur de tri se trie sur ce que ses cellules affichent (un chiffre, un
montant dans son unité, une date, sinon le texte ; `sortValue`, `web/ui.js`). Un tri ne change
la largeur d'aucune colonne, dans aucun tableau : la flèche d'un en-tête se loge dans sa
marge, et les listes triées par le serveur (joueurs, clubs, mercato mondial) ont
des colonnes de largeur fixe, si bien qu'un tri ou une autre page ne les déplace pas ;
la page garde sa position de défilement.

Dans la vue Infos d'un effectif, FORME donne l'effet de la forme sur tout ce que fait le joueur en match, signé (1,11 se lit « +11 % »), en vert ou en rouge, en gris entre −2 % et +2 %. MORAL donne le moral sur 100, une flèche vers la cible qu'il rejoint peu à peu chaque semaine (à partir de 3 points d'écart) et, sous 70 %, ce qui le retient le plus : € pour le salaire, ◷ pour le temps de jeu, ★ pour un club en dessous de son niveau, ⊘ pour un départ refusé à un joueur déclaré intransférable (`morale_target` et `morale_cause` de la liste, tirés du calcul hebdomadaire des contrats). L'infobulle donne la cible et la satisfaction du joueur pour son salaire et son temps de jeu. L'écran Joueurs n'a pas ces colonnes.

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
| Classement | position, points, J, V, N, D, BP, BC, différence, forme, à gauche ; à droite, quatre tuiles : meilleure attaque, meilleure défense, meilleur buteur et meilleur passeur. Un championnat n'a pas de choix de saison. Une coupe d'Europe montre ses 36 clubs en deux tableaux de 18 côte à côte (1 à 18, puis 19 à 36), légende des zones dans l'en-tête de la carte |
| Calendrier | une journée à la fois : une pastille par journée au-dessus (la journée affichée allumée, une flèche de chaque côté), puis les matches de la journée en deux colonnes, chacun avec ses buteurs et leurs minutes, la date en tête ; à droite, le classement réduit (#, points, J, différence) et les 5 meilleurs buteurs |
| Derniers matches | la dernière journée ou le dernier tour joué, à côté du classement et des 10 meilleurs buteurs |
| Prochains matches | la prochaine journée ou le prochain tour, à côté du classement et des 10 meilleurs buteurs |
| Statistiques | les cinq classements (meilleurs buteurs, passeurs, meilleures notes moyennes, cartons, clean sheets) côte à côte, 10 lignes chacun ; « Voir tout » ouvre la liste complète et paginée du classement, avec un menu pour passer de l'un à l'autre ou revenir aux cinq |
| Historique | trois colonnes : les champions par saison avec leur meilleur buteur, puis les titres par club ; les classements archivés ; les 15 joueurs les plus utilisés et les 15 meilleurs buteurs de tous les temps du championnat |

Sur Coupes d'Europe, la coupe (C1, C3, C4) et la saison se choisissent sur la ligne du titre ; la seule
rangée d'onglets est celle des rubriques de la coupe.

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
à droite des deux dont elle réunit les vainqueurs. Le tableau d'une coupe nationale se lit des deux
côtés : la première moitié de chaque tour va de gauche à droite, la seconde de droite à gauche, et
les deux demi-finales rejoignent la finale au centre (la moitié de la hauteur d'un arbre à sens unique) ;
la Phase finale d'une coupe d'Europe, avec ses barrages, reste d'un seul sens. Une confrontation donne, par équipe, le score
de chaque match (aller puis retour, sans cumul) et, s'il y en a eu, les tirs au but entre
parenthèses. L'équipe qualifiée est surlignée. Un clic sur le bloc ouvre le match (le retour
une fois joué), un clic sur le nom d'une équipe ouvre sa fiche, et en aller-retour chaque score
ouvre son propre match. Les tirages étant ouverts en coupe nationale et en coupe d'Europe,
l'ordre des cases est reconstruit après coup à partir des vainqueurs, et un tour pas encore
tiré reste en cases vides non reliées ; le tableau des sélections, fixé d'avance, relie aussi
les tours à venir. En coupe d'Europe, les barrages occupent autant de cases que les huitièmes :
chacun est aligné sur le huitième où son vainqueur retrouve un club classé de 1 à 8.

L'onglet Palmarès d'une coupe nationale et l'onglet Historique d'une coupe d'Europe (vainqueurs par saison)
gardent à droite les mêmes deux classements de 15 joueurs, l'un sous l'autre. Les vainqueurs sont suivis des titres par club (par pays en coupe d'Europe, dont l'historique s'ouvre aussi sur trois colonnes, avec au milieu le classement de la phase de ligue de la saison choisie). Ils additionnent toutes les saisons, la saison en cours
comprise, et tous les clubs qu'un joueur a servis dans cette seule compétition (les matches et
buts d'une autre compétition ne comptent pas) ; l'égalité se départage comme pour l'historique
d'un club.

### Palmarès

Le lien **Palmarès** du menu de gauche (`#/honours`) réunit sur une page les vainqueurs
de toutes les compétitions, sur toutes les saisons archivées, dans un seul tableau : une
ligne par compétition, une colonne par saison. Les lignes vont par groupe, nommé une fois
à leur gauche : d'abord les trois coupes d'Europe (C1, C3, C4), puis chaque pays dans
l'ordre du menu (France, Angleterre, Espagne, Italie, Allemagne), ses divisions de la D1
vers le bas puis sa coupe nationale. Une ligne donne la pastille de la compétition (celle de
la charte : C1, L1, D2, CF), son nom, qui ouvre son historique, son meilleur buteur de tous les temps avec ses
buts, puis la saison en cours, en gris : le leader d'un championnat et le nombre de
journées jouées, sinon le tour qui vient ; et le champion de la saison dès qu'il est
connu (celui d'un championnat à la clôture de la saison, celui d'une coupe à la fin de sa
finale). Suivent les saisons passées, la plus récente en premier, autant que la largeur en
montre ; les autres se parcourent par les deux boutons de l'en-tête du tableau. Un tiret
marque une saison sans champion.

À droite du tableau, à partir de 1500 px, les clubs titrés : rang, drapeau, club, titres
européens (EUR), de première division (D1), de coupe nationale (CP), des divisions
inférieures (D2+) et total. La carte prend la hauteur de la fenêtre et défile ; la
recherche de la ligne du titre ne garde que les clubs dont le nom la contient, chacun à son
rang parmi tous. Un clic sur un club, dans cette liste ou dans le tableau, surligne tous
ses titres sans redessiner la page ; un second clic le libère. Le club choisi est dans
l'adresse (`sel`).

Sous le tableau, trois classements, chacun omis tant qu'il n'a pas de ligne :

- **Joueurs les plus titrés** (15) : poste, maillot de son club actuel puis nom, et les
  mêmes colonnes de titres. Un joueur gagne ce que gagne, la même saison, un club pour
  lequel il a joué au moins un match, toutes compétitions confondues : un joueur transféré
  en cours de saison compte les titres de ses deux clubs.
- **Titres de meilleur buteur** (15) : les saisons qu'un joueur a terminées meilleur
  buteur d'une compétition, lesquelles, et les buts de ces saisons. Seules comptent les
  saisons qui ont un champion ; à égalité de buts, le plus petit identifiant, comme dans
  les statistiques de la compétition.
- **Coupes d'Europe par pays** : le pays des clubs vainqueurs, leurs titres par coupe et
  le total.

À égalité de titres, l'ordre est le même partout : coupes d'Europe, puis championnats de
première division, coupes nationales, et le nom.

### Pays

Le lien d'un pays du menu de gauche (`#/country/FRA`) met côte à côte ses divisions, de
la plus haute à la plus basse, puis sa coupe : quatre colonnes pour la France, trois pour
les autres. Une colonne trop étroite pour un classement passe à la ligne suivante. La ligne
du titre porte le drapeau, le nom du pays et le choix « Derniers matches » / « Prochains
matches » (`matches=prochains`), qui vaut pour toutes les colonnes.

Une division donne, sous son nom et le nombre de journées jouées sur celles de la saison
(« J3 / 34 », lien vers le championnat), la journée choisie : un match par ligne, le
vainqueur en gras, et sous un match joué les buteurs de chaque équipe, alignés sous
elle comme dans l'onglet Derniers matches ; puis son classement complet (#, club, PTS, J, V, N, D, BP, BC, DIFF.,
sans la forme) et ses cinq meilleurs buteurs. Sans journée à montrer (avant la première,
après la dernière), le classement et les buteurs restent. Les places sont marquées par un
trait à gauche du rang (vert pour le titre, la promotion ou la qualification directe, bleu
pour l'Europe, jaune pour un barrage, rouge pour la relégation), et seule la ligne du club
dirigé est colorée, comme son match.

La coupe montre un de ses tours : le dernier joué, ou le premier qui reste à jouer en
« Prochains matches ». Une rangée de boutons, un par tour, en choisit un autre (`tour`) ;
changer de choix de matches le libère. Chaque club porte la division où il joue (D1, D2…,
rien pour un club des divisions non simulées) ; une séance de tirs au but se lit dans
l'infobulle du score, son vainqueur en gras. Un tour pas encore tiré le dit.

### Manuel du jeu

Le bouton au livre ouvert, à droite du thème (`#/aide`), ouvre le manuel des mécanismes
internes : ce que le jeu calcule sans le montrer (moteur de match, forme, moral, fatigue,
progression, regens, contrats, mercato, finances, réputation, sélections). Il ne décrit
pas les écrans. Les chapitres sont à gauche, avec les sections du chapitre ouvert ; le
chapitre est à droite. `#/aide/<chapitre>/<section>` ouvre un chapitre sur une section.
Le manuel s'ouvre aussi sans partie, depuis l'écran d'accueil.

Les chapitres sont les fichiers Markdown de `docs/manuel/` (`NN-adresse.md`, la première
ligne `# Titre`), dans l'ordre de leurs noms. **Aucun chiffre de règle n'y est tapé** :
un chapitre écrit `{{expression}}`, calculée par le serveur sur la configuration de la
partie en cours (celle de la sauvegarde, ou celle du dépôt sans partie).

- Une expression adresse la configuration par les clés de `config/*.json`
  (`etats.forme.min`, `demographie.progression.courbe_age[0].facteur` ; `importation`
  pour `import.json`) et accepte `+ - * / **`.
- Fonctions : `n(x, décimales)`, `pct(x, décimales)`, `eur(x)`, `date(jour, mois)`,
  `annee(x)`, `poids(table)` (poids d'attributs en clair), `liste(x)`, `attribut(nom)`,
  `min`, `max`, `abs`, `len`, `sum`, `exp`, `log`, `tanh`, `sigmoide`, `logit`.
- Une ligne qui commence par `{{#chaque expression}}` est écrite une fois par élément
  d'une liste (ses clés deviennent des noms, avec `element` et `i`) ou d'une table
  (`cle`, `valeur`) : c'est ainsi que s'écrivent les lignes d'un tableau.
- Les écrans affichent le niveau sur 200 et les attributs sur 20 : un seuil interne se
  convertit dans l'expression (`* 2`, `/ 5`).
- Les liens entre chapitres s'écrivent `[texte](#/aide/chapitre/section)`, la section
  étant le titre `##` en minuscules, sans accents, mots séparés par des tirets.
- Markdown reconnu : titres `##` et `###`, paragraphes, listes `-` et `1.`, tableaux
  (colonne de chiffres : `---:`), notes `>`, blocs ``` pour les formules, `code`,
  gras, italique, liens internes.

**Tenir le manuel à jour fait partie de tout changement de règle.** Un mécanisme ajouté,
modifié ou retiré met à jour son chapitre dans le même changement ; un nouveau domaine
reçoit son chapitre. Recalibrer une valeur ne demande rien : le manuel la relit. Les
nombres écrits dans le code plutôt que dans la configuration (tirs au but, listes des
sélections) sont les seuls tapés dans un chapitre, et sont à reprendre à la main.
`tests/unit/test_manual.py` échoue si un chapitre lit une clé de configuration qui
n'existe plus ou pointe vers un chapitre ou une section disparus.

Avec la configuration d'une ancienne sauvegarde, une valeur absente s'affiche « — »
plutôt que de faire échouer la page.

### Joueur

Une seule page, sans onglets, qui tient sur un écran quand la fenêtre le permet. À gauche,
une colonne de 280 px dit qui est le joueur, comment il va et ce que prévoit son contrat ;
à droite, les blocs Attributs et Aptitudes par poste sur une ligne, puis Évolution du niveau
et Carrière sur la suivante. Sans aptitude à afficher, les attributs prennent toute la
première ligne. À partir de 1728 px de large, la partie droite devient une grille de deux colonnes : attributs
et aptitudes sur la première ligne, carrière (sous les attributs) et courbe sur la seconde ;
la liste des postes s'affiche alors à côté du terrain. Sous 1400 px la courbe passe au-dessus de la carrière, sous
1050 px la colonne passe au-dessus du reste. Un joueur retraité n'affiche que son nom, sa courbe et
sa carrière.

| Bloc | Contenu |
|---|---|
| Colonne · identité | à gauche du nom, le bloc de navigation dans l'effectif puis le drapeau de sa nation principale (celle de sa sélection, lien vers elle ; à défaut la première de ses nationalités), seul, le nom en infobulle ; le nom du joueur passe à la ligne s'il est long. Trois tuiles : âge (date de naissance en infobulle), niveau et potentiel exact sur 200, colorés comme les badges. Puis une ligne : le club à gauche, à droite le total en sélection : « 0 sél », « 12 sél », « 12 sél - 3 buts » (il passe sous le club quand la ligne ne suffit pas). Dessous, pour un joueur qui en a, une ligne « Autre nationalité » (« Autres nationalités ») avec leurs drapeaux, seuls, le nom en infobulle. Ni initiales ni liste des postes : les postes se lisent sur le terrain |
| Colonne · État | condition, forme et moral, chacun avec une barre et sa valeur. La barre de la forme part de son milieu, entre les bornes de la configuration (`form_bounds` de la fiche) : verte vers la droite au-dessus de 1, rouge vers la gauche en dessous, vide entre −2 % et +2 % ; la valeur est l'effet signé, comme dans les listes (1,09 se lit « +9 % »). La barre du moral prend la couleur de son niveau ; devant elle, l'icône de ce qui le retient le plus (€ salaire, ◷ temps de jeu, ★ club en dessous de son niveau, ⊘ départ refusé), dès que le serveur nomme une cause (`morale_cause` de la fiche, même calcul que la liste de l'effectif), avec la cause en infobulle ; l'infobulle de la ligne donne la cible et la satisfaction pour le salaire et le temps de jeu. Puis la blessure (« Disponible » ou la date de retour), le total des cartons jaunes (détail par compétition en infobulle) et une ligne par suspension en cours, avec sa compétition |
| Colonne · Contrat | salaire mensuel, fin du contrat, valeur de marché estimée, prix minimum (« Intransférable » le cas échéant ; absent pour un joueur libre) |
| Colonne · actions | au pied de la colonne, les pastilles puis les boutons, empilés sur toute la largeur (voir plus bas) |
| Attributs | chaque section sous un bandeau de titre, ses attributs sur trois colonnes, moins quand la largeur du bloc ne suffit pas au nom le plus long et à son badge. En tête, la section Jeu : les composites du moteur de match en badges sur 200, les six d'un joueur de champ (Progression, Création, Frappe, Jeu aérien, Défense au milieu, Défense de surface) ou les deux d'un gardien (Arrêts, Sorties aériennes), avec leurs poids en infobulle. Ceux que le poste demande sont marqués d'un point, les autres en gris ; le poste lu est celui choisi sur la carte des aptitudes, le poste principal par défaut, et son bandeau le nomme. Puis les 15 attributs en badges de 1 à 20. Quatre sections : Gardien (Réflexes, Sorties, Relance), Défense (Tacle, Placement), Attaque (Finition, Sang-froid, Technique, Vision, Jeu de tête, Centres, Coups arrêtés) et Général (Passe, Vitesse, Endurance, puis l'appât du gain de 1 à 20, en badge neutre : ni bon ni mauvais en soi). Un joueur de champ ne voit pas Gardien ; un gardien ne voit que Gardien (Placement s'y ajoute) et Général, ses autres attributs sont dans un repli « Autres attributs », fermé par défaut. Les sections et les attributs de chacune gardent toujours le même ordre, quel que soit le poste (Défense, Attaque, Général ; pour un gardien, Placement s'insère après Sorties). Un point marque les attributs pesant au moins 14 % de cette note, avec leur poids en infobulle (`attribute_weights` de la fiche, tiré de `note_globale`) |
| Aptitudes par poste | carte de terrain, avec les maillots et libellés de celle du dernier onze aligné d'un club : aux seuls postes où son affinité atteint 10, le maillot de son club avec le poste écrit dessus et l'affinité sous 20 sur son coin, le poste principal entouré ; à côté de chaque maillot, la note au poste sur 200 (voir Composition), à droite du maillot, ou à gauche le long de la touche droite pour rester sur le terrain. Les lignes de l'axe sont espacées d'au moins 16 % de la hauteur et les ailiers placés entre l'avant-centre et le meneur, pour qu'aucun maillot ne chevauche le suivant. Sur écran large, les notes quittent le terrain pour une liste à sa droite : poste, affinité sur 20, note sur 200, de la meilleure note à la moins bonne. Cliquer un poste, sur le terrain ou dans la liste, fait lire la section Jeu des attributs pour lui : son libellé passe en jaune et sa ligne est surlignée |
| Évolution du niveau | courbe mensuelle du niveau, sur 200, avec axes gradués ; l'abscisse est le temps (mois sur deux ans au plus, puis années), les saisons antérieures à l'historique mensuel n'y ont qu'un point, à leur ouverture. Un point marque l'ouverture de chaque saison et le dernier mois : il reprend les couleurs du club où le joueur évoluait ce mois-là (celui où il le termine en cas de transfert dans le mois, neutre sans club) et son infobulle donne mois, club et niveau |
| Carrière | un seul bloc et un seul tableau. D'abord les clubs, une ligne par saison et club : transfert, division du championnat, précédée du drapeau de son pays, et code de la coupe d'Europe (pas de coupe nationale), matches, buts, passes, note, puis le total. Chaque saison ouverte dans un club a sa ligne, de celle où le joueur est entré dans la partie à la saison en cours, même sans match ni mouvement (joueur jamais aligné, club hors des championnats simulés) ; le club quitté dans la première moitié de la saison (mercato d'été) n'a de ligne que si le joueur y a joué. La division est toujours nommée, même pour une saison sans match de championnat, et c'est celle du club cette saison-là, pas celle d'aujourd'hui : le nom d'un championnat simulé (« Ligue 1 · C1 ») ; pour un club hors des championnats simulés, « D » et le niveau de sa division (« D1 · C3 »). La source ne donne pas ce niveau : un vivier de réserve est un niveau sous sa pyramide (c'est là qu'était, une saison sans match de championnat, un club qui joue aujourd'hui un championnat simulé), toute autre division un niveau sous la plus basse connue de son pays, donc D1 dans un pays sans championnat simulé. Dessous, pour un joueur déjà sélectionné, la sélection : le nom de la nation en tête de colonne (lien vers elle), une ligne par édition, la plus récente d'abord, une ligne « Historique importé » pour les sélections d'avant la partie, et le total (`international_caps`, `international_goals`). Une bande vide sépare les clubs de la sélection. Le nom de la nation et la première cellule de ses lignes couvrent les quatre premières colonnes : matches, buts, passes et note restent dans les colonnes qu'ils ont pour les clubs. La note d'une édition est la moyenne de ses matches notés (`average` de `international_records`), « — » pour une édition jouée avant que le jeu ne les garde. |

Les textes du graphe ont la même taille que le reste de l'interface. Les niveaux,
potentiels, attributs et aptitudes par poste sont des badges dont la couleur va du
rouge au jaune puis au vert : sur 200, rouge jusqu'à 70, jaune à 110, vert à partir
de 150 ; sur 20, rouge jusqu'à 4, jaune à 10, vert à partir de 16.

Sur la fiche d'un joueur de son club, le pied de la colonne porte les actions de vente
au-dessus de « Proposer un contrat » : « Mettre sur la liste », qui ouvre une boîte de dialogue au prix
demandé (valeur de marché par défaut) et devient « Retirer de la liste » avec une pastille
« Sur la liste · prix », et « Proposer aux clubs », même boîte de dialogue, grisé avec la
raison en infobulle pendant le délai de relance, hors mercato ou pour un joueur qui vient d'arriver.
« Déclarer intransférable » le sort du marché, avec une pastille « Intransférable », et devient
« Rendre transférable » ; le mettre sur la liste ou le proposer le remet aussi sur le marché.
Dès qu'une offre attend une réponse, « Offres reçues · n » ouvre la liste des offres
pour ce joueur, à accepter ou refuser ; elle s'ouvre seule après une proposition qui en
a obtenu. Dans l'onglet Transferts de son club, la carte « Mercato en cours » liste aussi les joueurs sur la
liste des transferts, avec leur prix.

« Proposer un contrat » ouvre le contrat que le joueur signerait aujourd'hui (`/api/ma-partie/contrat/{id}`) : salaire
et fin de contrat, actuels et demandés, et « Signer ». Si le joueur a lui-même demandé ce contrat, une pastille
« Prolongation en attente » le dit et « Refuser » accompagne « Signer ». Le bouton est grisé, la raison en infobulle,
quand il ne veut pas prolonger.

Deux boutons suivent, pour la réserve et les prêts (`/api/ma-partie/effectif/{id}`) :
« Envoyer en réserve », qui devient « Rappeler en équipe première » avec une pastille
« En réserve », et « Prêter », qui ouvre une boîte de dialogue à deux listes : le club,
parmi ceux qui accueilleraient le joueur, du plus réputé au moins réputé, et la durée
(« Fin de saison » ou « Demi-saison », chacune avec sa date ; seules celles que le contrat
permet). Chacun est grisé avec la raison en infobulle quand l'action est impossible. Sur la
fiche d'un joueur d'un autre club, « Emprunter » suit « Faire une offre » : une boîte de
dialogue demande la durée, ou le bouton est grisé avec la raison (son club ne souhaite pas
le prêter, il n'aurait pas assez de temps de jeu, mercato fermé…). Un joueur en prêt, quel
que soit le sens, n'a qu'une pastille : « Prêté à Nice · retour le 30 juin 2027 » ou
« Prêté par… ». La colonne Contrat ajoute alors « Prêté par » et « Fin du prêt », et
« Équipe : Réserve » pour un joueur en réserve ; la carrière écrit « Prêt » dans la colonne
du transfert. Dans l'onglet Transferts de son club, la carte « Mercato en cours » gagne une section « Prêts »
quand il y en a : une ligne par joueur, → vers le club d'accueil ou ← depuis le club
propriétaire, et la date de retour.

Mercato ouvert, « Faire une offre » grisé s'accompagne d'une pastille qui nomme l'obstacle
(« Intransférable jusqu'au 21 septembre ») ; la raison qui suit les deux-points dans le
message (« il vient d'arriver ») reste dans son infobulle. Une pastille trop longue pour la
colonne passe à la ligne, jamais hors de la colonne.

### Match

Écran de compte rendu, consultable après simulation :

- Score, compétition, journée, stade
- xG, tirs, possession, corners, cartons : une barre par ligne, partagée entre les deux camps, chacun à sa
  couleur (charte, « Graphiques »)
- Fil chronologique des événements avec joueurs nommés
- Compositions des deux équipes sur le terrain de la charte : le poste sur le maillot, la note du match à sa
  droite, les faits du match à sa gauche ; les remplaçants en liste, avec leur entrée et leur note
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

L'onglet Composition du club dirigé : à gauche les tactiques, au-dessus du terrain, puis le terrain
et les remplaçants sur une ligne (autant de places que `bench_size`) ; au centre la liste de
l'effectif, triable, avec au-dessus d'elle le premier problème de la composition, « Meilleure
composition » et « Infos » / « Jeu » ; à droite l'adversaire (sous 1400 px, il passe sous les deux). On
glisse un joueur sur un poste ou sur le banc ; un clic droit sort un joueur de la composition ou met
un joueur sur la prochaine place libre ; « Meilleure composition » reprend la suggestion de l'IA pour la
tactique affichée. Un titulaire porte le maillot du club (corps de la couleur principale, manches de la
seconde) marqué de son poste ; une place vide garde le contour d'un maillot.

L'adversaire (`scouting` de la composition) : son écusson, la journée, le jour et le lieu du match, son
rang, ses points et sa forme en championnat, la tactique qu'il joue, son bilan de la saison en
championnat là où il joue ce match (à l'extérieur quand le club le reçoit), ses trois meilleurs joueurs
de l'équipe première, ceux qui ne peuvent pas jouer (blessés avec leur date de retour, suspendus avec
leurs matchs) et le dernier match entre les deux clubs.

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
  mène aux « Derniers matches » de la compétition, puis aux Actualités. « 2e mi-temps » et « Continuer » reprennent le style du
  bouton « Continuer » du bandeau (classe \`cta\`).

« Simuler », à côté de « Jouer » dans le bandeau de la composition, joue le match
sans le regarder et affiche le compte rendu, puis « Derniers matches » et les Actualités. Le mode Auto ne joue jamais en direct.

Pour un résultat analytique, signaler l'absence de détail et masquer les
statistiques inconnues au lieu d'afficher des zéros. Garder les compositions
initiales indépendantes des remplacements enregistrés ensuite.

### Listes : Joueurs, Clubs, Mercato mondial

Les trois écrans de liste partagent la même mise en page (`web/listing.js`).

- **Une ligne pour le titre et les filtres** (classe `toolbar`) : le titre, la recherche,
  les filtres, puis « Réinitialiser » au bout. Elle passe sur deux lignes quand la fenêtre
  ne suffit pas. Mercato mondial a deux lignes : le titre avec ses onglets et la saison,
  puis les filtres.
- **Des filtres qui se voient.** Un filtre posé prend le fond jaune d'une ligne
  sélectionnée. Les postes et les pays jouables sont des pastilles, un choix entre deux ou
  trois valeurs un sélecteur segmenté, un choix plus long une liste, et une fourchette
  (âge, niveau, valeur, salaire…) un bouton qui ouvre ses champs Min. et Max. avec
  quelques valeurs toutes prêtes ; posée, le bouton lit la fourchette (« Âge ≤ 23 ») et
  une croix la retire. Un seul menu ouvert à la fois ; il se ferme sur un clic ailleurs,
  sur un choix ou sur Échap, et reste ouvert pendant qu'on tape dans ses champs.
  Pastilles et sélecteurs sont des liens : ils gardent les autres filtres, le tri et la
  vue, et reviennent à la première page.
- **Une liste à la hauteur de la fenêtre.** L'écran demande au serveur autant de lignes
  que la fenêtre en montre (`taille`, de 10 à 100) : il part d'une estimation, mesure les
  lignes une fois affiché, et se redessine une fois si le compte diffère. La liste occupe
  toute la hauteur, même avec peu de résultats, et la page ne défile pas. Une nouvelle
  taille de fenêtre refait le calcul.
- **Les pages dans l'en-tête de la carte** : « 1–33 sur 13 013 » et deux boutons carrés,
  à droite du titre de la carte ; rien quand tout tient sur une page.
- **Les chiffres à droite** de leur colonne, sous un en-tête aligné de même ; une barre
  fine accompagne ceux qui se comparent (réputation, masse salariale, indemnité, condition).
- **La nationalité** tient en un drapeau et son code ; les autres sont comptées (« +1 »)
  et nommées en infobulle. Cela vaut pour toutes les listes de joueurs.
- **Un volet à droite à partir de 1880 px de large**, la largeur où la liste garde toutes
  ses colonnes à côté de lui. Sur Joueurs et Clubs, c'est
  l'aperçu de la ligne sélectionnée, la première par défaut : un clic sur une ligne le
  met à jour sans redessiner la liste, les flèches haut et bas passent d'une ligne à
  l'autre, Entrée ouvre la fiche. Sur Mercato mondial, c'est le résumé de la saison. Le
  volet prend la hauteur de la liste et défile en lui-même. La ligne sélectionnée est
  dans l'adresse (`sel`) ; elle n'est ni un filtre ni retenue d'une visite à l'autre.

### Recherche de joueurs

Vue transversale sur les joueurs importés (25 911 avec les CSV présents).
Filtres serveur : les postes (plusieurs à la fois), puis des fourchettes d'âge, de
niveau, de potentiel, de valeur, de prix minimum (un plafond) et de salaire, puis le
statut contractuel et le statut du club (actif ou dormant). Tri sur toute colonne,
pagination obligatoire.

La vue Infos ajoute les chiffres de la saison aux colonnes d'un effectif : MJ, BUTS, PD
et NOTE, triables comme les autres.

L'aperçu d'un joueur reprend les mots de sa fiche : drapeau, nom et poste, club et
sélections, les tuiles âge, niveau et potentiel, puis État (condition, forme, moral,
et la blessure ou la suspension s'il y en a une), Contrat (avec ses prétentions et son
intérêt quand l'utilisateur dirige un club), Postes (affinité et note, un clic lit la
section Jeu pour ce poste), Jeu et Attributs. Au pied, « Ouvrir la fiche » et les
actions de la fiche (« Faire une offre », « Proposer un contrat », mise en vente),
avec leurs boîtes de dialogue.

Quand l'utilisateur dirige un club, la vue Infos a deux colonnes de plus, après le
salaire : PRÉTENTIONS, le salaire mensuel que le joueur demande pour le rejoindre (sa
contre-offre, celle que le club réserve sur sa masse salariale dès l'offre
d'indemnité), et INTÉRESSÉ, Oui ou Non selon qu'il accepte ou non de le rejoindre
(`wage_demand` et `interested` de la liste). Ses propres joueurs y ont un tiret et
viennent en dernier quand on trie dessus. Deux filtres les accompagnent : la liste
« Intérêt » (joueurs intéressés ou non) et la fourchette « Prétentions », un plafond
en €/mois. Sans club, ni colonnes ni filtres.

Transferts et prêts se lisent par deux initiales, nommées en infobulle : T (transfert,
en vert) et P (prêt, en bleu). La colonne LISTÉ, après le prix minimum, dit ce que le
club du joueur est prêt à faire (`transfer_listed`, `loan_listed`) : T pour un joueur de
la liste des transferts de l'utilisateur ou en surnombre dans un club de l'IA, P pour un
joueur que son club est prêt à prêter, un tiret sinon. La colonne INTÉRESSÉ dit ce que le
joueur accepte : T pour un transfert chez l'utilisateur, P pour un prêt (`interested`,
`loan_interested`), « Non » s'il n'accepte ni l'un ni l'autre. Dans l'aperçu, les lignes
« Listé » et « Intéressé » l'écrivent en toutes lettres. La liste « Listés » filtre sur
l'une ou l'autre mise en vente, pour tout le monde ; la liste « Intérêt » propose
« Intéressés par un transfert », « Intéressés par un prêt » et « Non intéressés » (par un
transfert). Un joueur en prêt porte la pastille « Prêt » après son nom.

### Liste des clubs

Filtres serveur : les cinq pays jouables en pastilles, tous les pays dans une liste
(les jouables d'abord), le championnat, et le statut (tous, actifs, dormants).

Une ligne par club : son rang dans la liste, le club, le pays, le championnat
(« Marché extérieur » en gris hors des championnats simulés), son classement (★ pour un
champion, ↑ et ↓ pour une place de promotion ou de relégation) et sa forme sur cinq
matches, la réputation avec sa barre, l'entraînement et le recrutement des jeunes en
badges sur 20, l'effectif et son âge moyen, le niveau et le potentiel moyens des
16 meilleurs, la valeur de l'effectif, le budget de transferts disponible et la masse
salariale mensuelle, avec une barre de la part du plafond utilisée, rouge à partir de
95 %. Toutes les colonnes se trient ; les noms et le classement partent du plus petit.
Un club sans classement vient en dernier quel que soit l'ordre. Les en-têtes abrégés
(CLASS., ENTR., JEUNES, EFF., NIV. 16, POT. 16, MASSE SAL.) donnent leur nom en infobulle.

L'aperçu d'un club : écusson et nom, pays, championnat et capacité, les tuiles
réputation, classement et points, la tactique et les deux notes d'installations, ses
cinq derniers matches et les trois prochains (comme le bloc Calendrier de sa fiche), ses
finances (budget, solde, masse salariale et plafond, achats et ventes de la saison) et
ses huit meilleurs joueurs. Au pied, un bouton par onglet de sa fiche.

### Mercato mondial

La ligne du titre porte les onglets Transferts, Retraites et Promotions des centres,
chacun avec le nombre de mouvements de la saison, et à droite la saison avec ses deux
flèches. Chaque onglet a ses filtres, ses colonnes et, à droite sur un écran large, son
résumé de la saison, qui ne suit pas les filtres : quatre tuiles, un graphique en barres,
puis deux tableaux triés dans le navigateur, dont le premier prend la hauteur restante
et défile dans sa carte. « Mon club » ne paraît que quand l'utilisateur en dirige un.

#### Transferts

Filtres : recherche d'un joueur ou d'un club, fenêtre (saison, été, hiver), type (tous,
payants, libres), championnat de l'un des deux clubs, poste, âge au moment du transfert,
montant minimum en M€, et « Mon club ».

Un transfert donne la date, le poste, le joueur, sa nationalité, son âge au transfert,
son niveau, le club de provenance, une flèche, le club de destination, le montant avec
une barre rapportée au record de la saison (« Libre », « Fin de contrat » ou « Motif
non archivé » sinon) et la valeur du joueur. Poste, niveau et valeur sont ceux du
joueur aujourd'hui : un mouvement ne les archive pas, et un joueur retraité n'en a plus.

Le résumé de la saison :

- quatre tuiles : nombre de transferts, volume des indemnités, médiane des transferts
  payants, record (le joueur en infobulle) ;
- l'activité par semaine : une barre par semaine, la fenêtre d'été puis celle d'hiver,
  en nombre de transferts ou en volume d'indemnités (`mesure`). Seule la semaine la plus
  chargée de chaque fenêtre porte son chiffre ; l'infobulle d'une barre donne les deux ;
- les clubs qui ont payé ou reçu une indemnité : arrivées, départs, achats, ventes,
  balance, les plus dépensiers d'abord ; la carte prend la hauteur restante et défile ;
- les championnats, avec les mêmes colonnes ; un club compte pour le championnat où il
  joue aujourd'hui, les autres clubs sont réunis sous « Marché extérieur », en dernier.

#### Retraites

Les retraites tombent presque toutes le même jour (la revue annuelle des effectifs) :
la liste n'a pas de colonne de date et s'ouvre sur les meilleurs niveaux. Filtres :
recherche, postes en pastilles, âge au départ, championnat du dernier club,
« Internationaux » et « Mon club ».

Une retraite donne le poste, le joueur, sa nationalité, son âge, son dernier club et le
championnat de ce club, puis trois groupes de chiffres sous leur intertitre : Niveau
(FINAL, le niveau le jour du départ, et PIC, le meilleur de son historique), Carrière
(matches, buts, passes et note moyenne dans la partie, tous clubs confondus) et
Sélection (sélections et buts). Le poste, les nationalités et le niveau final sont
archivés le jour de la retraite (`snapshot` du mouvement, comme pour une promotion) :
le joueur quitte ensuite le monde. Une retraite archivée avant cela garde un tiret au
poste ; elle reprend son niveau dans son historique et, pour un international, la
nation de sa sélection.

Le résumé : nombre de retraites, âge moyen, internationaux, doyen (son nom en
infobulle) ; les retraites par âge ; les clubs quittés (championnat, retraites, âge
moyen, matches joués dans la partie par ces joueurs), les plus touchés d'abord ; les
championnats, dont la barre se mesure aux seuls championnats simulés.

#### Promotions des centres

Les promotions ont toutes lieu à l'ouverture de la saison : pas de colonne de date non
plus, et la liste s'ouvre sur les meilleurs potentiels. Filtres : recherche, postes,
âge à la promotion, niveau actuel et potentiel (sur 200), pays et championnat du club
formateur, « Intérêt » pour un recruteur, et « Mon club ».

Une promotion donne ce que le joueur était ce jour-là et ce qu'il est aujourd'hui :
poste, joueur, nationalité, âge à la promotion, club formateur (suivi d'une flèche et de
son club actuel quand il l'a quitté), niveau à la promotion (PROMO), niveau actuel,
PROGRESSION (les niveaux gagnés depuis, avec une barre de la part du chemin parcouru
vers son potentiel), potentiel, valeur actuelle, et pour un recruteur ses prétentions et
son intérêt. Un joueur qui a quitté le monde depuis ne garde que le jour de sa promotion.

Les boutons « Infos », « Attributs » et « Jeu » de la liste Joueurs changent les
colonnes : les deux dernières vues montrent les joueurs tels qu'ils sont aujourd'hui
(niveau actuel, attributs ou composites), l'âge restant celui de la promotion et le
club le club formateur. La vue Attributs prend toute la largeur, sans le résumé.

Le résumé : nombre de promus, potentiel moyen, meilleur potentiel (le joueur en
infobulle), progression moyenne depuis la promotion ; les promus par tranche de
10 niveaux de potentiel (une tranche pour tout ce qui est sous 100) ; les centres de
formation (promus, potentiel moyen, meilleur joueur et son potentiel, recrutement des
jeunes), par meilleur potentiel ; les 12 pays qui ont promu le plus de joueurs.

Une offre que la masse salariale ne permet pas est refusée avec les deux montants :
« Ibrahim Mbaye demanderait 310 000 € / mois : il vous reste 260 000 € / mois sous le
plafond salarial », suivi de ce que les autres offres en cours réservent quand il y en
a. La marge est arrondie en dessous, à deux chiffres significatifs comme les salaires.

Les écrans Clubs et Joueurs retiennent leurs filtres et leur tri, et Joueurs sa vue (pas la page), dans
le navigateur : y revenir par le menu, ou après un rechargement, les rouvre tels
qu'on les a laissés. Changer un filtre garde le tri et la vue, et revient à la première page. « Réinitialiser », au bout de la ligne de filtres, les vide
et garde le tri et la vue ; il est grisé quand aucun filtre n'est actif.

Un club dormant est consultable — nom, effectif, fiches joueurs — mais n'a ni
classement, ni calendrier, ni statistiques de saison. L'interface doit le
signaler explicitement plutôt que d'afficher des sections vides.

## Endpoints

```
GET  /api/monde/etat                     date, saison, prochaines échéances, mode auto (auto.running / auto.stopping),
                                          controlled_club, news : {unread, next_unread, pending: [id]} (messages non lus, le prochain à lire, ceux à traiter)
POST /api/monde/avancer                  {commande_id: str, jusqu_a: "etape" | "jour" | "journee" | "fin_mercato"} -> travail_id
POST /api/monde/auto/demarrer            {commande_id: str} -> travail_id ; enchaîne les journées jusqu'à l'arrêt
POST /api/monde/auto/arreter             signal d'arrêt idempotent -> {running, stopping, job}
GET  /api/travaux/{id}                  statut, progression, erreur éventuelle, compétition dont le tour suit (competition)
GET  /api/monde/journal?date=             événements du jour
GET  /api/recherche?q=&type=joueurs|clubs|competitions|selections   recherche globale : {items}, 12 au plus, la meilleure correspondance d'abord
                                          chaque item : kind (player, club, competition, nation), id, name, marks ([début, fin[ des lettres tapées dans le nom)
                                          player : position, club, retired ; club : major_color, minor_color, nation, competition ; competition : competition ({id, name, kind, code, nation, level}) ; nation : nation (code)
GET  /api/monde/palmares                  champions de chaque compétition, toutes saisons : {season, europe, countries, clubs, players, scorers, nations}
                                          chaque compétition : items (saison, champion, pays du club), scorer (meilleur buteur de tous les temps),
                                          current (saison en cours : {leader, round} ou {label}, null une fois le champion connu)
GET  /api/monde/transferts?saison=&type=transfer|retirement|academy&page=&taille=&tri=&ordre=&recherche=   counts : mouvements de la saison par onglet
                  &competition=&poste=&age_min=&age_max=&club=   tous les onglets ; poste : un ou plusieurs
                  &fenetre=ete|hiver&nature=payant|libre|pret&montant_min=   transferts (les prêts, kind "loan", sont listés mais hors du résumé)
                  &selectionnes=oui   retraites
                  &pays=&niveau_min=&niveau_max=&potentiel_min=&potentiel_max=&interesse=oui|non   promotions
                                          un transfert donne aussi position, nationalities, rating et value du joueur aujourd'hui (null une fois retraité)
                                          une retraite : position, nationalities, rating (le jour du départ), peak, league, matches, goals, assists, average, caps, caps_goals
                                          une promotion : details (le jour de la promotion) et details.current (le joueur aujourd'hui, avec interested et wage_demand ; null s'il a quitté le monde) ; nations : pays des clubs formateurs
                                          tri d'une promotion : level, progress, worth, wage_demand, interested, attributs et composites lisent le joueur aujourd'hui
GET  /api/monde/transferts/resume?saison=&type=   transfer : {total, paid, volume, median, record, weeks: [{week, summer, count, volume}], clubs, leagues}
                                          retirement : {total, average_age, capped, oldest, ages: [{age, count}], clubs, leagues}
                                          academy : {total, average_potential, best, average_progress, bins: [{from, count}], academies, nations}
GET  /api/manuel[/{chapitre}]             manuel : {pages: [{slug, title}], page: {slug, title, sections: [{id, title}], markdown}} ; sans partie, configuration du dépôt

GET  /api/clubs?competition=&statut=actif|dormant&pays=&recherche=&page=&taille=&tri=&ordre=   tri : toute colonne (classement, forme, age, valeur, budget, masse_salariale ; niveau et potentiel : moyenne des 16 meilleurs) ; nations : pays ayant des clubs
                                          chaque club : standing, average_age, squad_value, available_budget, wage_bill et wage_cap (hebdomadaires)
GET  /api/clubs/{id}                      en-tête + résumé ; reputation_change : écart de la dernière révision annuelle (null la première saison)
GET  /api/clubs/{id}/apercu               widgets de l'effectif : calendrier, finances, dernier onze
GET  /api/clubs/{id}/navigation           pairs de la division (ou du pays) : précédent, suivant, liste
GET  /api/clubs/{id}/effectif?tri=&ordre=&page=   tri : une colonne de la liste, un attribut (passe, reflexes…) ou un composite (tir, occasion_attaque…)
                                          chaque joueur : reserve, loan ({parent, club, end} | null), away (prêté par ce club) ; 100 lignes par page
GET  /api/clubs/{id}/calendrier           tous les matches de la saison, chacun avec scorers et outcome (V/N/D du côté du club, null à venir) ;
                                          competitions : {id, name, kind, code, place, played, won, drawn, lost, goals_for, goals_against}
GET  /api/clubs/{id}/finances?saison=     résumé + history (journal de la saison ; months : {date, revenue, expenses, balance} en fin de mois)
GET  /api/clubs/{id}/transferts?saison=
GET  /api/clubs/{id}/historique           saisons terminées paginées (rang, division et son niveau, réputation, coupe, Europe) + honours {league : titres par division [{competition, level, count}], cup, europe, best_rank, best_europe} + leagues : les divisions de ces saisons et celle d'aujourd'hui {id, name, level, clubs, europe, promotion, relegation}
                                          + league {clubs, europe, relegation, level} (championnat actuel) + leaders {matches, goals} + transfers {arrivals, departures} (avec season)

GET  /api/competitions                    chacune : clubs, et rounds (journées de son calendrier, tours d'une coupe)
GET  /api/competitions/{id}/classement
GET  /api/competitions/{id}/calendrier?journee=      matches de la journée (avec scorers, comme journee/derniere), numéros des journées
GET  /api/competitions/{id}/journee/derniere|prochaine?saison=   {round: {number, label, date} | null, groups: [{name, matches (avec scorers), standings | null, top_scorers (10 premiers buteurs de la saison, avec le classement) | null}]}
GET  /api/international/editions/{année}/journee/derniere|prochaine   idem sans top_scorers, un groupe par groupe de qualification ou de phase finale
GET  /api/competitions/{id}/statistiques?type=buteurs|passeurs|notes
GET  /api/competitions/{id}/historique    champions par saison paginés (avec classement archivé) + leaders {matches, goals} de tous les temps
GET  /api/competitions/{id}/navigation    compétitions du même pays : précédent, suivant, liste

GET  /api/joueurs?poste=&age_min=&age_max=&niveau_min=&niveau_max=&potentiel_min=&potentiel_max=&valeur_min=&valeur_max=&prix_max=&salaire_min=&salaire_max=
                  &nation=&club=&statut_club=&contrat=&page=&taille=&tri=   poste : un ou plusieurs, séparés par des virgules ; tri : idem, attributs, composites et chiffres de la saison (appearances, goals, assists, average) compris
                  &interesse=oui|non|pret&pretentions_max=   pour le club de l'utilisateur (ignorés sans club) ; tri : wage_demand, interested
                  &liste=transfert|pret   joueurs que leur club vend ou prête ; tri : listed ; chaque joueur : transfer_listed, loan_listed, loan_interested, loan, reserve
GET  /api/joueurs/{id}                    la fiche, avec interested et wage_demand comme dans la liste
GET  /api/joueurs/{id}/historique         carrière + trajectory : niveau sur 200 mois par mois {year, month, season, level, club}, du plus ancien au plus récent
GET  /api/joueurs/{id}/navigation        effectif du club : précédent, suivant, liste (null sans club)

GET  /api/matches/{id}                    compte rendu complet

GET  /api/ma-partie/actualites?page=&message=&taille=   le fil, du plus récent au plus ancien : la page demandée, sinon celle du message ;
                                          chaque ligne : {id, date, kind, title, segments: [{text, ref?}], read, pending}
GET  /api/ma-partie/actualites/{id}       un message : sa ligne, et selon son genre offers, renewal, talks, players, expiry, market ou review
POST /api/partie/actualites-lues          {ids: [id] | null} ; null marque tout le fil -> {unread, news}
POST /api/partie/reponse-offre            {commande_id, offre_id, decision: "accepter" | "refuser" | "contre", indemnite?} ; "contre" donne le prix du club
                                          (indemnite, au-dessus de l'offre) -> {vendu} : conclu à ce prix, ou pris comme un refus
POST /api/partie/intransferable           {commande_id, joueur_id, intransferable: bool} ; sort un joueur du club du marché, ou l'y remet -> sa vente
                                          ({prix_liste, intransferable, obstacle_proposition, offres}, comme GET /api/ma-partie/vente/{id})
POST /api/partie/reponse-offres           {commande_id, joueur_id, decision} ; toutes les offres en attente pour ce joueur -> {club} signé ou null
POST /api/partie/renouvellement           {commande_id, joueur_id, decision} ; réponse au contrat qu'un joueur demande
GET  /api/ma-partie/contrat/{id}          le contrat qu'un joueur du club signerait : {obstacle, demande, salaire_actuel, salaire_propose, fin_contrat_actuelle, fin_contrat_proposee}
POST /api/partie/prolongation             {commande_id, joueur_id} ; signe ce contrat
POST /api/partie/negociation/abandon      {commande_id, joueur_id} ; abandonne un dossier d'achat avant l'accord sur le contrat
GET  /api/ma-partie/effectif/{id}         réserve et prêt d'un joueur : {pret, en_reserve, obstacle_reserve, sens: "sortant" | "entrant", obstacle_pret, durees: [{cle, fin}], clubs}
POST /api/partie/reserve                  {commande_id, joueur_id, reserve: bool}
POST /api/partie/preter                   {commande_id, joueur_id, club_id, duree: "saison" | "demi_saison"}
POST /api/partie/emprunter                {commande_id, joueur_id, duree}
GET  /api/ma-partie/composition?match_id=   effectif, tactiques, tactique du club (custom : [poste, ligne, colonne] | null), onze de départ, suggestions,
                                          club (couleurs du maillot), scouting : {match, home, club (avec formation), standing, record {venue, won, drawn, lost},
                                          key_players, absent, last_meeting} | null
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
