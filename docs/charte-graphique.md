# Charte graphique

Référence unique de l'apparence de Football Manager. `docs/ui.md` dit ce que chaque écran
montre ; ce document dit à quoi cela ressemble et comment cela s'écrit. Toute
maquette et tout écran s'y conforment.

| Fichier | Rôle |
|---|---|
| `docs/charte/charte.css` | La feuille de référence : jetons, cadre de l'application, composants. Elle fait foi pour les valeurs |
| `docs/charte/index.html` | Les planches : chaque jeton et chaque composant dessinés avec cette feuille. À ouvrir dans un navigateur |
| `docs/charte/planches.css` | La mise en page des planches ; rien que l'application utilise |
| `web/charte.css` | La charte appliquée aux écrans : ses règles sur le balisage de l'application, chargées en dernier |
| `web/theme.css` | Les jetons de l'application ; `tests/frontend/charte.test.mjs` les tient égaux à ceux de la feuille de référence |

La charte couvre le thème clair. Le thème sombre garde les mêmes jetons ; ses
valeurs restent celles de `web/theme.css` tant qu'elles n'ont pas été revues.

## Tenir la charte à jour

- Une maquette ou un écran n'emploie que les jetons et les composants de
  `charte.css` : aucune couleur, taille de police, graisse, rayon, hauteur ou
  espacement écrit en dur hors de ses échelles.
- Ce que la charte ne couvre pas (composant, variante, convention d'écriture)
  s'y ajoute d'abord, dans le même changement : la règle ici, le style dans
  `charte.css`, un spécimen sur la planche. Pas de style propre à un écran pour
  ce qui peut resservir.
- Une demande qui change l'apparence change la charte : valeur dans
  `charte.css`, légende de la planche, règle ici si elle en dépend ; puis
  l'application : le jeton dans `web/theme.css`, la règle dans `web/charte.css`.
- Une maquette part de `charte.css`, copiée telle quelle, jamais de styles
  réécrits.
- Un écran aligné sur la charte est retiré de la section « Migration ».

La feuille dessine ses tableaux en grilles (`.tr`) ; l'application garde ses
`<table>`. Ce sont les jetons, les mesures et les règles qui s'appliquent, pas
la structure HTML des spécimens.

## Fondations

### Couleurs

| Jetons | Emploi |
|---|---|
| `--bg`, `--panel` | Fond de la page et des cartes : blanc |
| `--panel-2` | En-tête de tableau, bouton, choix ouvert, tuile en relief |
| `--panel-3` | Ce qui est sous le pointeur (voir « Sous le pointeur ») |
| `--stripe` | Une ligne de tableau sur deux |
| `--line`, `--row-line` | Bordures ; séparation des lignes |
| `--strong`, `--ink`, `--ink-2`, `--muted` | Encres, de la plus forte au libellé atténué |
| `--accent`, `--accent-ink` | Le jaune de l'application et l'encre écrite dessus : action principale, marque de ce qui est ouvert |
| `--accent-hover` | L'action principale sous le pointeur |
| `--accent-text` | L'accent en texte sur fond blanc ; le lien dans une phrase |
| `--own-row` | Ligne du club dirigé, ligne choisie |
| `--good`, `--warn`, `--bad`, `--info` et leur `-soft` | États : texte sur son fond pâle |
| `--gk`, `--def`, `--mid`, `--att` | Postes : couleurs pleines, lettres blanches |
| `--pitch-a`, `--pitch-b`, `--pitch-line` | Terrain : deux verts de tonte, lignes |
| `--backdrop` | Voile sur la page, sous une boîte de dialogue |
| `--series-1`, `--series-2`, leur `-soft` et leur `-deep` | Deux séries d'un graphique : le trait et les points d'une courbe, les deux côtés d'une répartition ; en pâle, ce qui y est libre ; en foncé, une troisième part de la même série |

Trois familles de pastilles ne se ressemblent jamais :

- **Note** : fond pâle gradué et sa bordure, du rouge (jusqu'à 70 sur 200, 4
  sur 20) au jaune (110 ; 10) puis au vert (à partir de 150 ; 16).
- **Poste** : couleur pleine, hors de cette échelle (bleu-vert, indigo, violet,
  magenta), la même pour un poste dans toutes les listes. Largeur fixe de 32,
  quel que soit le code : ce qui suit la pastille s'aligne d'une ligne à
  l'autre.
- **Compétition** : contour, ou noir plein pour une coupe d'Europe.

### Typographie

Deux familles, celles du système (rien à télécharger) : `--display`
(Bahnschrift SemiCondensed) pour les titres, les chiffres clés et les titres en
capitales ; `--text` (Segoe UI) pour tout le reste.

| Jeton | Taille / interligne | Graisse | Emploi |
|---|---|---|---|
| `--fs-hero` | 40 / 40 | 700 | Nom d'un club dans son bandeau, score |
| `--fs-page` | 26 / 32 | 700 | Titre de page |
| `--fs-title` | 20 / 24 | 700 | Chiffre clé, date du jour, ce qui suit un nom dans son bandeau |
| `--fs-figure` | 16 / 20 | 700 | Action principale, délai, saison montrée par son pas |
| `--fs-figure` | 16 / 20 | 400 | Saisie de la recherche globale |
| `--fs-body` | 13 / 16 | 600 | Titre de carte (capitales, `--display`) |
| `--fs-body` | 13 / 18 | 400, 600 | Texte, cellule, onglet, bouton |
| `--fs-small` | 11 / 14 | 400, 600 | En-tête de colonne, libellé, légende |
| `--fs-micro` | 10 / 10 | 700 | Pastille, poste sur un maillot |

Sept tailles, trois graisses (400, 600, 700). Seules les capitales sont
espacées (`--caps`, 0.06 em). Les chiffres sont tabulaires.

### Mesures

| | Valeurs |
|---|---|
| Espacements | 4, 8, 12, 16, 24 (`--s1` à `--s6`) : 8 entre deux cartes, 8 et 12 dans une carte, marges de page 8, 16, 12 |
| Hauteurs | Barre du haut 56, ce qui s'y tient 40 (`--h-bar-control`) · onglets 36 · titre de carte 32 · contrôle 28, 22 dans une carte ou une ligne · ligne et en-tête de tableau 26 · pastille 18 |
| Formes | Rayon de 3 (`--radius`), ou rond (points, écussons) |
| Traits | Bordure de 1 ; ce qui est ouvert porte l'accent : 3 sur une barre, le menu, les onglets (`--mark`), 2 sur un contrôle (`--mark-control`) |
| Défilement | La page garde à droite la place de sa barre de défilement sur tous les écrans, qu'elle défile ou non : rien ne se décale d'un écran court à un écran long |

### Marque

Le jeu s'appelle Football Manager. Sa marque est un terrain vu de haut : la
ligne médiane, le rond central et son point, les deux surfaces, sur un carré au
rayon de la charte. Elle a deux formes : tracée à l'encre (`--accent-ink`) sur
un carré jaune (`--accent`), ou inversée, en jaune sur un carré à l'encre, là
où le fond est déjà jaune.

- **Favicon** : la marque sur son carré jaune (`web/favicon.svg`), lisible
  jusqu'en 16.
- **En tête du menu** (`.brand`) : un coin jaune de la hauteur de la barre du
  haut, qu'il ouvre. La marque inversée en 32 (`.logo`), puis, à 12, le nom sur
  deux lignes de 16 en capitales (`.wordmark`), à l'encre : FOOTBALL en 700,
  MANAGER en 400. Elle ouvre la Vue d'ensemble.
- **Titre de l'onglet** : celui de la page, puis le nom (« Rennes · Football
  Manager ») ; le nom seul sur une page sans titre.

## Composants

| Composant | Classes | Règle |
|---|---|---|
| Marque | `.brand`, `.logo`, `.wordmark` | Le coin jaune en tête du menu. Voir « Marque » |
| Barre du haut | `.topbar`, `.date-block`, `.next-matches`, `.next-match` | Blanche, 56, ouverte par l'écharpe de la marque ; ce qui s'y tient a 40. Voir « Barre du haut » |
| Onglets d'une page | `.tabs` | Une seule rangée par écran. Soulignés de l'accent, ou de la couleur du club, de la sélection ou de la compétition sur sa fiche (voir « Pas de saison ») |
| Choix d'une vue | `.segmented`, `.small` | Sur la ligne du titre ou dans l'en-tête d'une carte : statut des clubs, derniers ou prochains matches, tactique, colonnes |
| Pas d'une série | `.segmented.steps` | Journées : une flèche à chaque bout, toutes écrites entre elles |
| Pas de saison | `.season`, `.season-pick` | Saisons, éditions des sélections : une flèche de chaque côté de celle montrée, qui ouvre la liste de toutes. Voir « Pas de saison » |
| Bouton | `.button`, `.primary`, `.danger`, `.square`, `.small` | Carré, 28 ; 22 dans une carte ou une ligne |
| Action principale | `.cta` | Une seule par écran ; 36, 40 dans la barre du haut |
| Champ | `.field` | Recherche, liste déroulante |
| En-tête de page | `.page-heading`, `.page-title`, `.tools` | Le titre, ses commandes sur la même ligne, à droite |
| En-tête de club, de sélection | `.hero`, `.hero-name`, `.hero-context` | Bandeau de 88 aux couleurs du club ou de la sélection, ses onglets dessous. Voir « Bandeau » et « Clubs et pays » |
| En-tête d'un joueur | `.hero`, `.hero-name`, `.hero-context`, `.hero-bar`, `.hero-pills`, `.command-group` | Le bandeau de son club, ses commandes dessous. Voir « Bandeau » et « En-tête d'un joueur » |
| En-tête d'un match | `.hero.duel`, `.hero-side`, `.tile.match-score`, `.big-score`, `.match-facts` | Le bandeau partagé entre les deux camps, le score où ils se rejoignent. Voir « En-tête d'un match » |
| En-tête d'une compétition | `.hero`, `.hero-emblem`, `.hero-name` | Le bandeau d'un club aux couleurs de la compétition, son emblème seul sur le bandeau ou le drapeau de son pays sur le disque, ses onglets dessous. Voir « En-tête d'une compétition » |
| Carte | `.card`, `.card-head`, `.card-body`, `.section-title` | Titre en capitales ; lien ou commandes à droite |
| Tableau | `.table`, `.tr`, `.tr.head` | Voir « Tableaux » |
| Fait, tuile | `.fact`, `.tile`, `.tile.graded`, `.tile.split` | Libellé atténué, valeur forte. Une tuile graduée prend le fond de la pastille de sa note ; une tuile à colonnes tient plusieurs chiffres, chacun sous son libellé, un trait entre deux |
| Pastilles | `.position`, `.rating`, `.comp`, `.score`, `.form`, `.tag`, `.count`, `.pill` | 18 de haut ; un poste, 32 de large ; `.pill` dit en une phrase où en est un joueur |
| Club, pays | `.kit-dot`, `.crest`, `.flag`, `.nation` | Voir « Clubs et pays » |
| Deux camps comparés, jauge, anneau | `.comparison`, `.gauge`, `.ring` | Voir « Graphiques » |
| Classement au fil des saisons | `.club-chart`, `.rank-zone` | Voir « Graphiques » |
| Niveau au fil des mois | `.level-chart`, `.plot`, `.curve`, `.chart-point`, `.point-value` | Voir « Graphiques » |
| Répartition réglable | `.balance`, `.balance-end`, `.balance-bar`, `.balance-handle`, `.balance-note` | Voir « Graphiques » |
| Faits de match | `.mark` | But, cartons, blessure, entrée, sortie |
| Infobulle | `.tooltip` | Voir « Infobulles » |
| Recherche globale | `.palette`, `.palette-head`, `.results`, `.result` ; `.veil` dans une maquette | Voir « Recherche globale » |
| Menu d'un joueur | `.menu` | Voir « Menu d'un joueur » |
| Lien | `a`, `.prose a` | Voir « Sous le pointeur » |

### Barre du haut

Une barre blanche de 56, soulignée de l'accent (3), que le coin jaune de la
marque ouvre à gauche.

- **Écharpe** : le coin de la marque se termine dans la barre comme le bandeau
  d'un club, sur 64 : un bord incliné, puis une fine bande parallèle. Le trait
  qui borde le menu est jaune à sa hauteur.
- **Date** : à 16 de l'écharpe, la saison en libellé (11 / 14), le jour dessous
  en 20 / 22.
- **À droite**, dans cet ordre : la pastille du mercato, la loupe, les trois
  prochains matchs, l'action principale. Ce qui s'y tient a 40 de haut
  (`--h-bar-control`) ; la pastille garde ses 18.
- **Prochains matchs** (`.next-matches`) : un bandeau de trois blocs ; pour
  chacun le délai en chiffre clé, l'adversaire après sa pastille (un avion à
  l'extérieur), la compétition dessous, en bleu pour une coupe. Le prochain a
  son délai et un soulignement à l'accent. Chacun ouvre la fiche de
  l'adversaire.
- **Avancement d'une simulation** : il se dessine dans le trait jaune de la
  barre, sans décaler la page.

### Pas de saison

Ce qui se lit saison par saison se parcourt avec un seul contrôle, le même sur
tous les écrans (`.season`) : une flèche vers la saison d'avant, la saison
montrée, une flèche vers la suivante. La saison montrée ouvre la liste de
toutes. Sur le calendrier d'une sélection, les éditions (Euro, Coupe du monde)
se parcourent de même ; la page d'une édition, elle, passe aux autres par le
bloc de son bandeau (voir « En-tête d'une compétition »). Jamais une liste
déroulante du navigateur, une rangée d'options ni des blocs repliés.

- **Sans bordure** : ni cadre, ni trait entre ses parties. Un fond (`--panel-3`)
  ne paraît que sous le pointeur ; la saison dont la liste est ouverte prend
  `--panel-2` et la marque de ce qui est ouvert (2).
- **Flèches** : des chevrons dessinés, de 16, d'un trait de 2.4. Sur la fiche
  d'un club, d'une sélection ou d'une compétition, elles sont à sa couleur,
  celle qui souligne l'onglet ouvert ; ailleurs, à l'encre. Sous le pointeur elles gardent leur
  couleur. Celle qui n'a plus rien au-delà reste à sa place, grisée.
- **Saison** : en chiffre clé (`--display`, 16 en 700 ; 13 dans l'en-tête d'une
  carte), suivie d'un chevron atténué. La saison seule (« 2031 / 2032 ») ou le
  nom de l'édition (« Euro 2032 ») : le mot « Saison » n'est pas écrit, et ce
  que le pas montre n'est pas répété dans le titre voisin.
- **Liste** : le menu de la charte (`.menu`), sous le contrôle, aligné sur son
  bord droit : toutes les saisons, la plus récente d'abord, douze lignes au
  plus avant de défiler. La saison montrée a le fond `--own-row` ; celle en
  cours est dite « en cours », à droite, atténué. Elle se ferme sur un choix,
  un clic ailleurs ou Échap.
- **Largeur** : celle du plus long libellé de la série (`--chars`) : les flèches
  ne bougent pas d'un pas à l'autre.
- **Place** : en haut à droite de ce qu'il change.

| Ce qu'il change | Place | Hauteur |
|---|---|---|
| Une page sous son titre : Mercato mondial | Au bout de la ligne du titre, après ses autres commandes | 28 |
| Un onglet de la fiche d'un club ou d'une sélection (Calendrier, Finances, Transferts), le tableau d'une coupe nationale, une coupe d'Europe | Au bout de la rangée d'onglets, sous la dernière tuile du bandeau ; absent des onglets qui ne se lisent pas par saison | 28 |
| Une seule carte : le classement archivé d'un championnat | Dans son en-tête, à droite | 22 |

D'un onglet à l'autre de la fiche d'un club, la saison choisie est gardée.

**La couleur d'un club sous ses onglets.** L'onglet ouvert d'une fiche et les
flèches de ses saisons prennent, des deux couleurs du club, de la sélection ou
de la compétition, celle qui se lit le mieux sur le fond. Une couleur qui s'y lirait mal (un
contraste sous 3 : un jaune, un bleu ciel sur le blanc) est ramenée à son ton
dans un graphique (voir « La couleur d'un club dans un graphique ») ; sans
couleur lisible (blanc et blanc), l'accent en texte (`--accent-text`) en tient
lieu.

### Sous le pointeur

Ce qui se trouve sous le pointeur prend un seul fond, `--panel-3`. Ce qui est
ouvert, choisi ou teinté garde le sien. Rien d'autre ne bouge : ni couleur d'un
lien, ni bordure, ni ombre.

| Élément | Au repos | Sous le pointeur |
|---|---|---|
| Lien : le nom d'un club, d'un joueur, d'un pays, d'une compétition, le score d'un match, « Voir → » | La couleur du texte qui le porte, non souligné | Souligné (trait de 1, à 2 du texte), même couleur |
| Lien dans une phrase : le manuel, le titre et le texte d'une actualité (`.prose`) | `--accent-text`, non souligné | Souligné, même couleur |
| Ligne d'un tableau ou d'une liste, fait | Son fond | `--panel-3` ; la ligne teintée (club dirigé, ligne choisie, état) garde sa teinte |
| Ligne ou carte qui s'ouvre tout entière : une actualité, un match du calendrier, une ligne de la recherche globale | Son fond | `--panel-3` et la main ; aucun texte souligné |
| Bouton, option d'un choix, pas d'une série, filtre, entrée du menu, ligne d'un menu | Son fond | `--panel-3`, encre `--strong` ; `--accent-hover` pour l'action principale, `--bad-soft` pour `.danger` |
| Flèche d'un pas de saison, saison qui ouvre sa liste | Aucun fond | `--panel-3` ; la flèche garde la couleur du club |
| Onglet, en-tête de colonne | `--muted` | `--strong` |
| Joueur sur un terrain | Son nom | Son nom souligné |

- Une pastille qui mène quelque part (le score d'un match) est un lien : son
  texte se souligne, son fond ne change pas.
- Dans une carte dont l'en-tête entier ouvre une page, c'est son lien
  « Voir → » qui se souligne.
- Un graphique garde ses propres réactions (repère, infobulle) : voir
  « Graphiques ».
- Ce que vise le menu d'un joueur garde cet état tant que le menu est ouvert :
  sa ligne le fond, son nom le soulignement.

### Recherche globale

Un bouton carré à la loupe, dans la barre du haut à gauche des prochains matchs,
et le raccourci Ctrl K ouvrent une boîte de 720 de large sur la page voilée
(`--backdrop`), à 112 du haut, deux fois la barre.

- **Tête** : une barre de 56, soulignée de l'accent : la loupe, la saisie en 16,
  puis le choix du type (`.segmented.small` : Tout, Joueurs, Clubs,
  Compétitions, Sélections).
- **Liste** : une seule, tous types mêlés, la meilleure correspondance d'abord ;
  12 lignes de 26 au plus. Rien sous deux lettres tapées ; « Aucun résultat »,
  atténué, quand rien n'est trouvé.
- **Ligne** : elle ouvre sa fiche tout entière. D'abord la pastille de son
  genre, dans une colonne de 32 (la largeur d'un poste) pour que les noms
  s'alignent ; puis son nom, les lettres tapées en 600 dans l'encre forte ;
  enfin, à droite et atténué, ce qui la distingue de ses homonymes.
- **Le genre n'est jamais écrit** : la pastille le dit.
- **Ligne choisie** : celle qu'Entrée ouvre a le fond `--own-row`, la première
  par défaut ; les flèches la déplacent. Sous le pointeur, une autre ligne prend
  `--panel-3`.

| Genre | Pastille | À droite |
|---|---|---|
| Joueur | Son poste | Son club, après sa pastille ; « Libre » sans club ; « Retraité », sans poste |
| Club | La pastille à ses couleurs | Le drapeau de son pays, puis la pastille de sa division |
| Compétition | Sa pastille | Son pays, après son drapeau ; rien pour une coupe d'Europe |
| Sélection | Son drapeau | Rien |

### Bandeau

La fiche d'un club, d'une sélection, d'un joueur, d'une compétition s'ouvre sur
le même bandeau (`.hero`) : 88 de haut, aux couleurs du club, de la sélection ou
de la compétition, le disque à gauche, les tuiles à droite. Tout nouvel en-tête
le reprend.

- **Nom** (`.hero-name`) : en 40, sur une seule ligne. Rien n'est écrit
  au-dessus de lui, ni dessous.
- **À sa suite** (`.hero-context`) : là où il joue, sur la même ligne et la
  même ligne de base, en 20, à 12 du nom. Un lien vers sa fiche quand il en a
  une.
- **Tuiles** : ce que le bandeau chiffre va sur une tuile, jamais dans une ligne
  de texte. La capacité du stade n'y est pas : elle se lit dans la barre d'un
  match.

| Bandeau | À la suite du nom |
|---|---|
| Club | Le drapeau de son pays, puis son championnat : deux liens, le drapeau vers la sélection du pays, le championnat vers sa fiche. Hors championnat, son pays après son drapeau : un seul lien, l'ensemble vers la sélection |
| Sélection | Rien : son nom seul |
| Joueur | Son club, lien vers sa fiche ; « Libre » sans club |
| Compétition | Rien : son nom seul, avec l'année de sa phase finale pour une édition des sélections (Euro 2032) |

Un drapeau y mène toujours à la sélection de son pays : avec le nom du pays, ils
forment un seul lien ; devant autre chose (un championnat), le drapeau est un
lien à part, ce qui le suit a le sien. Un pays sans sélection dans le jeu garde
son drapeau, sans lien.

Le bandeau d'un match n'a rien à la suite de ses noms : sa barre dit le reste
(voir « En-tête d'un match »).

### En-tête d'un joueur

La fiche d'un joueur s'ouvre sur le bandeau de son club (`.hero`) : ses
couleurs, son écusson sur le disque. Un joueur sans club a un bandeau neutre,
sans disque.

- **Nom** : celui du bandeau, son club à sa suite (voir « Bandeau »). Son
  poste n'y est pas : il se lit sur le terrain des aptitudes.
- **Tuiles**, dans cet ordre : âge, sélection, niveau, potentiel, valeur, prix
  demandé (« N/A » quand personne ne peut le demander, la raison en infobulle).
  Niveau et potentiel sont gradués (`.tile.graded`) : le fond et l'encre de
  leur pastille.
- **Sélection** (`.tile.split`) : une tuile de trois colonnes, un trait entre
  deux. Le drapeau au-dessus du code de trois lettres (jamais le nom du pays :
  la tuile garde sa largeur), « Sél. » et « Buts », la colonne des buts dès le
  premier. C'est la sélection qui l'a appelé, lien vers elle ; à défaut la
  première de ses nationalités, sans lien. Ses autres nationalités sont un fait
  de la carte État, drapeau puis code.
- **Barre** (`.hero-bar`) : 36, à la place des onglets d'un club, la page
  n'en ayant pas. À gauche, où il en est (`.pill` : « Sur la liste · 45 M€ »,
  « Prolongation en attente », « Prêté à Lorient · retour le 30 juin 2026 ») ;
  à droite, les commandes de 28, par groupes (`.command-group`, 4 entre deux
  boutons, 16 entre deux groupes), ceux de son menu : effectif, vente, puis
  l'action principale au bout (« Proposer un contrat », « Faire une offre »).
  Une commande impossible reste à sa place, grisée, sa raison en infobulle.
  Sans club dirigé, pas de barre.

### En-tête d'un match

Le compte rendu d'un match s'ouvre sur un seul bandeau (`.hero.duel`), partagé
entre les deux camps : celui qui reçoit à gauche, l'autre à droite.

- **Chaque moitié** est l'en-tête de son camp : ses couleurs (un maillot proche
  du blanc cède la place à sa seconde couleur, comme pour un club), son
  écharpe, son écusson sur le disque (le drapeau pour une sélection), son nom en
  40, lien vers sa fiche. Un camp sans couleurs garde le fond `--panel-2`.
- **Score** : en 40, sur une tuile là où les deux moitiés se rejoignent ; « VS »
  avant le match. Dessous, sur une ligne, ce qui a départagé : « Cumul 3 – 3 »,
  « 4 – 2 t.a.b. ».
- **Barre** (`.hero-bar`) : 36. À gauche (`.match-facts`) la pastille de la
  compétition, le tour en gras, puis, atténués, le jour, les places du stade,
  « Terrain neutre » ; enfin « Vainqueur : » et le camp qualifié, quand le match
  en désigne un. À droite, les commandes de 28 : « Match aller », puis
  « Résumé 2D ».
- **Les noms ne sont écrits qu'ici.** Sur le reste de l'écran, rien ne nomme un
  camp : celui qui reçoit est à gauche (sa composition, ses temps forts, sa part
  des barres). Les compositions n'ont pas de titre.

### En-tête d'une compétition

La page d'un championnat, d'une coupe nationale, d'une coupe d'Europe, d'une
édition de l'Euro ou de la Coupe du monde s'ouvre sur le bandeau d'un club
(`.hero`), ses onglets dessous. Elle n'a pas de ligne de titre.

- **Emblème** (`.hero-emblem`) : une coupe d'Europe, l'Euro et la Coupe du monde
  ont le leur, seul sur le bandeau, sans disque, dans une boîte de 72 quelle que
  soit sa forme : le nom garde sa place d'une compétition à l'autre. Un
  championnat et une coupe nationale ont le drapeau de leur pays sur le disque,
  comme sa sélection, lien vers elle ; un pays sans sélection garde son drapeau,
  sans lien. La pastille de la compétition n'y est pas écrite.
- **Nom** : seul, rien à sa suite (voir « Bandeau »).
- **Tuile** : une seule, qui dit à qui est le titre. « Vainqueur » (« Champion »
  pour un championnat) et son nom une fois décerné celui de la saison ou de
  l'édition montrée ; jusque-là « Tenant du titre », le dernier à l'avoir gagné.
  Le club après sa pastille, la sélection après son drapeau, lien vers sa fiche.
  Pas de tuile avant un premier titre. Ni journée, ni tour : le bandeau ne dit
  pas où en est la compétition, et aucune ligne sous les onglets ne nomme le
  vainqueur.
- **Bloc de navigation** : à gauche du bandeau, celui d'un club ou d'un joueur
  (précédent, liste, suivant). Il passe d'une coupe d'Europe à l'autre en
  gardant l'onglet ouvert et la saison, d'une édition des sélections à l'autre
  (de la première à la dernière, Euro et Coupe du monde mêlés) en gardant
  l'onglet, d'une compétition d'un pays à l'autre (ses championnats du premier
  au dernier, puis sa coupe). Dans sa liste, chaque compétition suit sa
  pastille.
- **Saison** : le pas de saison ferme la rangée d'onglets d'une coupe d'Europe
  et du tableau d'une coupe nationale. Un championnat n'en a pas ; une édition
  non plus, le bloc du bandeau en tient lieu.

Les couleurs sont celles d'un club : la première remplit le bandeau, la seconde
le traverse en écharpe, et l'onglet ouvert prend celle qui se lit sur le fond
(voir « La couleur d'un club sous ses onglets »). Une compétition peut aussi
tenir sur un **fond** qui n'est pas sa couleur : il remplit le bandeau, sa
couleur le traverse, et c'est elle, jamais ce fond, que prend l'onglet ouvert.

| Compétition | Bandeau | Écharpe | Sous l'onglet ouvert |
|---|---|---|---|
| Ligue des champions (C1) | Bleu nuit `#0a0b5c`, le fond des trois coupes d'Europe | Bleu `#2447e6` | `#2447e6` |
| Ligue Europa (C3) | `#0a0b5c` | Orange `#f26522` | `#f26522` |
| Ligue Conférence (C4) | `#0a0b5c` | Vert `#16be28` | `#00ab00`, le vert foncé pour se lire |
| Coupe du monde (CM) | Noir `#111418` | Or `#d4a72c` | `#b18500`, l'or foncé pour se lire |
| Euro (EU) | Bleu `#003399` | Jaune `#ffcc00` | `#003399` |
| Championnat, coupe nationale | Les deux couleurs du maillot de la sélection du pays, avec les règles d'un club (un maillot proche du blanc cède la place à sa seconde couleur) | | Comme sur la fiche de la sélection |

Les emblèmes sont des images (`web/emblems/`), en blanc pour les coupes
d'Europe, à leur métal pour les trophées de l'Euro et de la Coupe du monde.

### Menu d'un joueur

Un clic droit sur un joueur (son nom, sa ligne dans une liste, son maillot sur
un terrain) ouvre `.menu` au pointeur : ce que la fiche du joueur permet, dans
les mêmes mots. Il s'ouvre vers la droite et le bas ; vers la gauche ou le haut
faute de place.

- **Ligne** : 26 de haut, en 13 / 18, 216 de large au moins. Ni icône, ni
  en-tête : la cible du menu est marquée sur la page (voir « Sous le
  pointeur »).
- **Où en est une action** : à droite de son libellé, dans l'encre atténuée
  (« Retirer de la liste · 45 M€ », « Offres reçues · 2 », « Proposer un
  contrat · En attente », « Faire une offre · Contre-offre · 62 M€ »).
- **Groupes** : un trait `--row-line` entre deux, 4 de part et d'autre.
- **Action impossible** : elle reste à sa place, grisée comme un bouton
  désactivé ; sa raison est dans son infobulle.
- **Rien à décider** : l'état du joueur seul, sur une ligne atténuée (« Prêté à
  Lorient · retour le 30 juin 2026 », « Accord avec le club · … », « Arrivée
  le … », « Retraité »).
- **Fermeture** : un choix, un clic ailleurs, Échap, un défilement.

| Joueur | Groupes, dans cet ordre |
|---|---|
| Du club dirigé | Effectif : Envoyer en réserve ou Rappeler en équipe première, Prêter · Contrat : Proposer un contrat · Vente : Offres reçues, Mettre sur la liste ou Retirer de la liste, Proposer aux clubs, Déclarer intransférable ou Rendre transférable |
| D'un autre club | Faire une offre, Négocier le contrat ou Proposer un contrat (joueur libre), puis Emprunter |
| Sur l'écran Composition | D'abord « Sortir de la composition » ou « Mettre dans la composition », seul dans son groupe |

## Terrain et maillot

Un seul terrain et un seul joueur, sur tous les écrans.

- **Terrain** (`.pitch`) : proportions 68 × 88, douze bandes de tonte, lignes de
  1.5 à 8 du bord. Debout (l'équipe attaque vers le haut) ou couché
  (`.pitch.lying`, vers la droite, latéral gauche en haut) : mêmes herbe, lignes
  et maillots.
- **Maillot** (`.kit-shirt`) : 32, aux couleurs du club ou de la sélection (corps
  dans la première, manches dans la seconde), un contour autour, aucun trait
  entre le corps et les manches. Le poste est écrit dessus, dans l'encre lisible sur le corps. La
  couleur de poste reste dans les listes, pas sur le terrain.
- **Autour du maillot** : le nom dessous, sur une étiquette sombre ; la note à
  droite (à gauche le long de la touche droite) ; l'affinité sous 20 sur le coin
  haut gauche ; la forme d'au moins ±5 % sur le coin bas droit ; les faits du
  match à gauche, sur une étiquette à leur largeur.
- **États** : place vide en pointillé, joueur choisi cerclé de l'accent, joueur
  indisponible cerclé de rouge, joueur sans couleurs en gris.

| Écran | Sens | À droite du maillot | Autour |
|---|---|---|---|
| Composition | Debout | Note au poste, sur 200 | Affinité, forme |
| Match | Debout | Note du match | Faits du match |
| Direct · tactique | Debout | Note du match | Faits du match |
| Joueur · aptitudes | Debout | Note au poste, sur 200 | Affinité |
| Effectif, Actualités · dernier onze | Couché | — | — |

## Graphiques

Un texte n'est jamais dans la couleur de ce qu'il mesure : chiffres et libellés
gardent les encres, la couleur reste à la barre.

### Deux camps comparés

`.comparison` : les statistiques d'un match, face à face.

- Une ligne de 36 par statistique : le chiffre de chaque camp aux extrémités, le
  libellé (11 / 14) au-dessus d'une seule barre partagée entre les deux.
- La barre a 8 de haut et des bouts arrondis de 4. Chaque part vaut la part de son
  camp dans le total des deux chiffres ; 2 de fond les séparent.
- Rien de part et d'autre (0 – 0) laisse la barre vide, en `--panel-3`.
- Le plus grand des deux chiffres est en gras, l'autre atténué ; à égalité, les
  deux sont atténués.
- Les camps ne sont pas nommés : celui qui reçoit est à gauche, comme dans le
  bandeau du match.

### La couleur d'un club dans un graphique

Une couleur de club ne se pose pas telle quelle sur le fond : un blanc y
disparaît, un bleu nuit s'y lit comme du noir. La couleur d'un camp se calcule :

1. Des deux couleurs du club, la première puis la seconde, ne garder que celles
   qui en sont une (saturation d'au moins 0.04 en OKLCH) : ni blanc, ni gris, ni
   noir.
2. Ramener sa clarté entre 0.48 et 0.64 (OKLCH) et sa saturation à 0.11 au moins :
   une couleur pâle fonce, une couleur sombre s'éclaircit.
3. Le club qui reçoit prend sa première couleur ainsi obtenue. Le visiteur prend
   la première des siennes qui s'en écarte d'au moins 15 (distance OKLab × 100).
4. Sans couleur, ou sans couleur assez distincte, un camp prend le gris `--ink-2`
   (`--muted` si l'autre camp a déjà ce gris).

| Club | Couleurs | Dans un graphique |
|---|---|---|
| Monaco | `#e2001a`, `#ffffff` | `#e2001a`, inchangée |
| Marseille | `#ffffff`, `#2faee0` | `#0099ca` : la seconde, foncée |
| Paris SG | `#004170`, `#da291c` | `#206198` : la première, éclaircie |
| Nice | `#1a1a1a`, `#d2122e` | `#d2122e` : la seconde |
| Lille, à Monaco | `#e01e13`, `#20325f` | `#405a9b` : la seconde, la première étant trop proche du rouge de Monaco |
| Juventus | `#ffffff`, `#111111` | `--ink-2` |

### Classement au fil des saisons

`.club-chart` : le rang d'un club en championnat, saison après saison, dessiné à
la largeur de sa carte.

- Un trait de 2 en `--series-1` relie les saisons qui se suivent ; un point de 6
  de rayon, cerné du fond, marque chacune. La saison en cours est un point
  ouvert, au bout d'un trait pointillé.
- Le rang s'écrit à son point, en 16 `--display` : dessous pour les deux
  premières places, dessus sinon.
- Un étage par division où le club a joué, la plus haute en haut, son nom à
  gauche : une saison de Ligue 2 se lit sous celles de Ligue 1. Une seule
  division occupe 192 de haut, chaque division de plus en ajoute 64 ; 24
  séparent deux étages, un trait `--row-line` en leur milieu.
- Dans chaque étage, les places de la division sont teintées comme un
  classement les marque : Europe en `--info-soft`, montée en `--good-soft`,
  relégation en `--bad-soft`. Leur nom est à droite, en `--muted`.
- Une saison hors des championnats simulés garde sa place sur l'axe et
  interrompt le trait.

### Niveau au fil des mois

`.level-chart` : le niveau d'un joueur, sur 200, mois après mois, dessiné à la
taille de sa carte.

- Un trait de 2 en `--series-1`, un point par mois ; l'abscisse est le temps.
- Un point de 12 aux couleurs du club où il jouait ce mois-là (`.kit-dot`, gris
  sans club), cerné du fond, à l'ouverture de chaque saison et au dernier mois.
- Le niveau s'écrit au premier et au dernier point, en 16 `--display`.
- L'ordonnée, une ligne `--row-line` par graduation, et les dates sont en
  `--muted`, en 13 : du texte, pas du dessin étiré.

### Jauge, anneau

- **Jauge** (`.gauge`) : 40 × 4, à côté d'un chiffre (condition, fatigue, part
  d'un plafond) ; verte, jaune (`.warn`) ou rouge (`.bad`), ou dans la couleur
  de la note qu'elle dessine (`.graded` : le moral).
- **Jauge signée** (`.gauge.signed`) : une valeur qui va dans les deux sens (la
  forme) part du milieu de sa barre, marqué d'un trait : verte vers la droite,
  rouge vers la gauche, vide quand elle ne change rien.
- **Anneau** (`.ring`) : 56, la part d'un plafond écrite en son centre ; rouge à
  partir de 95 % (`.ring.full`).

### Répartition réglable

`.balance` : deux enveloppes sur une même barre, et la poignée qui déplace leur
part (le budget de transferts et le plafond salarial d'un club).

- Chaque enveloppe est nommée à son bout, son chiffre dessous : la première à
  gauche, la seconde à droite, alignée à droite.
- La barre a 8 de haut et des bouts arrondis de 4 ; 2 de fond séparent deux
  parts. Chaque part vaut son montant sur une saison : la barre entière est la
  somme des deux enveloppes.
- Ce qui est engagé est en couleur pleine, aux deux bouts ; ce qui est libre en
  pâle, de part et d'autre de la poignée. La première enveloppe est en
  `--series-1`, la seconde en `--series-2`.
- La poignée est un bouton carré de 22, à la rencontre des deux parts libres.
  Elle s'arrête sur ce qui est engagé, et se déplace aussi aux flèches gauche et
  droite. Un écran qui ne permet pas le réglage montre la barre sans poignée.
- Tenue, la poignée porte le trait de l'accent ; à côté de chaque chiffre
  s'écrit, atténué, ce qu'il gagne ou cède. Lâchée, la part est fixée : ni
  confirmation, ni annulation.
- Sous la barre, en 11 / 14 : à gauche ce que la première enveloppe a d'engagé,
  à droite ce qu'occupe la seconde et sa part du plafond.
- La part engagée d'un plafond passe au rouge à partir de 95 % (`.full`).

## Conventions d'écriture

### Nombres

Le séparateur décimal est le point, pour tous les nombres : notes, montants,
moyennes, buts attendus.

### Saisons

Une saison s'écrit de ses deux années entières, une barre entre deux espaces :
2031 / 2032. Sous l'axe d'un graphique qui en aligne plus de quatre, en deux
années courtes : 31-32. Une édition des sélections porte son nom et l'année de sa
phase finale : Euro 2032.

### Notes

| Donnée | Écriture | Exemple |
|---|---|---|
| Note d'un match | Un chiffre après le point | 7.8 |
| Note moyenne d'une saison | Deux chiffres après le point | 7.81 |
| Niveau, potentiel, note au poste | Entier, sur 200 | 168 |
| Attribut, affinité | Entier, sur 20 | 14 |
| Forme | Effet signé, en pour cent | +6 % |

### Montants

- Un salaire, une masse salariale, un plafond salarial sont toujours mensuels.
- Tout montant s'écrit en €, k€ ou M€ : € sous 1 000, k€ sous 1 000 000, M€
  au-delà (850 €, 95 k€, 1.2 M€).

### Transferts

Dans une liste, un transfert s'écrit du club quitté au club rejoint, une flèche
atténuée entre les deux (Monaco → Paris SG), puis son indemnité. Un joueur sans
club vient de « Libre », atténué ; il n'a pas d'indemnité : sa pastille de
niveau en tient lieu.

### Classement

Les colonnes sont toujours dans cet ordre : PTS, J, V, N, D, BP, BC, DIFF. ; la
forme vient après. Une version réduite retire des colonnes, jamais elle ne
change l'ordre.

Une place se marque d'un trait à gauche du rang (vert : titre, promotion,
qualification directe ; bleu : Europe ; jaune : barrage ; rouge : relégation,
élimination). Seule la ligne du club dirigé est colorée.

### Compétitions

Une pastille de deux caractères.

| Famille | Codes | Apparence |
|---|---|---|
| Coupes d'Europe | C1 (Ligue des champions), C3 (Ligue Europa), C4 (Ligue Conférence) | Noir plein |
| Sélections | EU (Euro), CM (Coupe du monde) | Noir plein |
| Championnats de France | L1, L2, L3 | Contour gris |
| Autres championnats | D1, D2, précédés du drapeau du pays | Contour gris |
| Coupes nationales | C et l'initiale du pays : CF, CE, CA, CI | Contour bleu |

Deux pays peuvent partager un code (CA pour l'Angleterre et l'Allemagne). Un
pays ajouté suit la règle : CP pour le Portugal.

### Clubs et pays

- Le nom d'un club suit toujours la pastille à ses couleurs (`.kit-dot` : 10,
  coupée en diagonale, première puis seconde couleur) ; son écusson la remplace
  dans un en-tête.
- Le nom d'un pays suit toujours son drapeau (16 × 12). Une nationalité en
  colonne : le drapeau, puis le code de trois lettres.
- Une sélection a deux couleurs, celles de son maillot, comme un club : elles
  font son bandeau et ses maillots sur un terrain. Son en-tête est celui d'un
  club ; son drapeau remplit le disque où un club a son écusson. Dans une liste,
  son nom suit son drapeau, jamais une pastille de couleurs.
- Une liste de joueurs d'une sélection donne le club de chacun là où celle d'un
  club donne sa nationalité.

### Tableaux

- Toutes les colonnes de tous les tableaux se trient.
- Chaque colonne garde sa largeur : la flèche d'un en-tête se loge dans sa
  marge, où elle ne prend pas de place ; trier ne déplace aucune colonne.
- Un tableau qui ne donne pas de valeur de tri se trie sur ce que ses cellules
  affichent : un chiffre, un montant dans son unité, une date, sinon le texte.
- En-têtes et lignes de 26 ; chiffres alignés à droite, sous un en-tête aligné
  de même.

### Infobulles

Le composant `.tooltip`, jamais le `title` du navigateur : fond `--strong`,
texte blanc en 13 / 18, détails en 11 / 16, 320 de large au plus, au-dessus de
sa cible (dessous faute de place), une flèche vers elle.

## Migration

Depuis le 4 octobre 2026, les écrans suivent la charte : `web/charte.css`, chargée
après les feuilles d'origine, porte ses règles, et ces feuilles ont été ramenées à
ses échelles (tailles, graisses, rayons, capitales).

| Sujet | Fait |
|---|---|
| Échelles | Sept tailles, trois graisses, un rayon, dans toutes les feuilles |
| Fond | Blanc en thème clair |
| Onglets | `.tabs` partout, en-tête de club compris |
| Terrain et maillot | `.pitch` (debout ou couché) et `.kit-shirt` sur la composition, le match, le dernier onze, les aptitudes et le direct (`kitShirt`, `pitch`, `web/ui.js`) |
| Pastilles | Postes pleins ; compétitions en deux caractères (`competitionCode`, `web/ui.js`) ; notes, scores, statuts à 18 |
| Nombres | Point décimal, notes à un et deux chiffres, montants en €, k€, M€ (`number`, `matchNote`, `averageNote`, `amount`), y compris dans le manuel |
| Classements | Trait à gauche du rang, ordre des colonnes unique |
| En-tête de club | Bandeau de 88, nom en 40, son championnat à sa suite en 20 (`clubHero`, `web/club-hero.js`) : ni ligne au-dessus du nom, ni capacité du stade ; une sélection n'a que son nom (`nationHero`) |
| Fiche d'une sélection | L'en-tête d'un club à ses couleurs (`nationHero`, `web/club-hero.js`), son drapeau sur le disque ; la liste d'un club et ses widgets (calendrier, dernier onze, groupe) ; le calendrier d'un club, par édition ; pastilles EU et CM ; classements dans l'ordre des colonnes de la charte (D, non P) |
| Le match en chiffres | `.comparison`, couleurs calculées (`chartColours`, `web/ui.js`) |
| Tableaux | Toutes les colonnes se trient (`sortValue`), flèche dans la marge |
| Pays | Drapeau dans le menu et sur la Vue d'ensemble |
| Sous le pointeur | Une seule règle pour les liens, les lignes et les commandes, dans `web/charte.css` ; les autres feuilles n'en disent plus rien (`tests/frontend/charte.test.mjs`) |
| Palmarès | Pastilles de compétition de la charte (`competitionBadge`), filtres de poste aux couleurs des postes |
| Classement au fil des saisons | Un étage par division, places aux couleurs du classement, libellés à l'encre (`rankChart`, `web/club-history.js`) |
| Menu d'un joueur | `.menu` au clic droit, sur tous les écrans (`web/player-menu.js`) ; sur Composition, il remplace le clic droit qui sortait ou alignait un joueur |
| Répartition des budgets | `.balance` sur l'onglet Finances d'un club, à la place des chiffres « Budget transferts » et « Masse salariale » (`shareContent`, `web/club-finances.js` ; la poignée, `web/budget-share.js`) |
| Pas de saison | `.season` partout où une saison ou une édition se choisit (`steps`, `seasonSteps`, `web/ui.js`) : flèches à la couleur du club (`--club`, depuis `--hero-accent`), saison en chiffre clé qui ouvre la liste de toutes (`seasons`, `current_season` de l'API). Au bout de la rangée d'onglets sur Calendrier, Finances et Transferts d'un club, sur Calendrier d'une sélection, sur le tableau d'une coupe nationale et sur une coupe d'Europe (`tools` de `clubHero`, `nationHero` et `competitionHero`), au bout de la ligne du titre sur Mercato mondial, dans l'en-tête de la carte du classement archivé d'un championnat. Ni liste déroulante, ni rangée d'éditions, ni classements repliés. La couleur sous l'onglet ouvert est ramenée à son ton de graphique quand elle se lirait mal (`legibleOn`) |
| Compte rendu d'un match | Le bandeau partagé (`matchHero`, `web/club-hero.js`) et sa barre à la place de la bannière du score ; les compositions sans titre, les temps forts et les chiffres sans ligne qui nomme les camps, les temps forts de chaque camp à son bord ; une sélection y porte son maillot (`match_detail`) |
| Fiche d'un joueur | L'en-tête de son club (`playerHero`, `web/club-hero.js`) : son nom et son club, ses tuiles, sa sélection en trois colonnes ; ses commandes dans la barre sous le bandeau (`playerBar`, `web/player.js`) ; la colonne réduite à la carte État et Contrat, ses autres nationalités en drapeau et code ; lignes et bandeaux de 26, jauges de 40 ; la carrière en pastilles de compétition (`competition_badges`, EU et CM pour une édition) ; la courbe du niveau en `--series-1` |
| Marque et barre du haut | Le terrain en favicon (`web/favicon.svg`) ; en tête du menu, le coin jaune, la marque inversée et le nom « Football Manager » sur deux lignes (`web/index.html`) ; la barre de 56 ouverte par l'écharpe, ses contrôles de 40 (`web/charte.css`) ; le nom dans le titre de l'onglet et sur les panneaux du direct 3D. Les écrans qui tiennent dans la fenêtre (Composition, Actualités, manuel, palmarès) suivent `--h-bar` |
| En-tête d'une compétition | Le bandeau d'un club (`competitionHero`, `web/club-hero.js`) sur un championnat, une coupe nationale, une coupe d'Europe et une édition des sélections, à la place de la ligne du titre : l'emblème seul sur le bandeau (`web/emblems/`) ou le drapeau du pays sur le disque, une tuile pour le vainqueur ou le tenant du titre (`winner`, `holder` de l'API) à la place de la ligne « Vainqueur » sous les onglets ; ses couleurs et son fond (`COMPETITION_COLORS`, `api/nations.py`). Le bloc de navigation du bandeau remplace le choix C1, C3, C4 de Coupes d'Europe et le pas d'édition des sélections (`europeNavigation`, `editionNavigation`, `web/navigation.js`) ; dans sa liste, une compétition suit sa pastille |

Ce qui reste :

| Sujet | État |
|---|---|
| Thème sombre | Hors charte : il garde ses valeurs et fonctionne avec les mêmes composants, sans avoir été revu |
| Feuilles d'origine | `style.css`, `compact.css`, `theme.css`, `club.css`, `match-replay.css` restent chargées sous `web/charte.css` ; leurs règles devenues sans effet sont à retirer |
| Banc d'un match | L'API ne donne pas le poste d'un remplaçant : la liste n'a pas de pastille de poste |
| Manuel | Ses tableaux (Markdown) ne se trient pas |
| Direct | Non contrôlé à l'écran : il faut jouer un match |
| Petits écrans | Non contrôlés |

Les écrans `/squad`, `/composition`, `/match` et `/europe` ont une maquette de
référence à la charte : canevas Design
<https://claude.ai/artifact/MbJqDASJNFF8a6Tu3Lph4a>. La recherche globale a la
sienne (proposition B) : <https://claude.ai/artifact/JMuUqZ4JkvAsYQMh6uJoNU>,
le menu d'un joueur aussi : <https://claude.ai/artifact/KYSJcrD8ikiX5uoJfikeH3>,
comme la répartition des budgets : <https://claude.ai/artifact/Ga78jdTYs5RHHZweXDyjYd>
et la fiche d'une sélection (proposition A) : <https://claude.ai/artifact/THiSHcUqdwdres8yWJc5NR>,
et celle d'un joueur (proposition D, bloc sélection 3) : <https://claude.ai/artifact/1dXpFEK4mUHwaxcZmX8q7s>.
Le pas de saison a la sienne (proposition C1, page « Tour 2 ») : <https://claude.ai/artifact/JWEMGket7W9htqxx7FoCps>.
Le compte rendu d'un match a été redessiné depuis (proposition A) :
<https://claude.ai/artifact/X8NKTayKm5YXFuCJQTBWKo> ; sa planche du canevas montre l'ancienne bannière.
La marque et la barre du haut ont la leur (logo 1, « Terrain » ; barre,
proposition J) : <https://claude.ai/artifact/5vwPBqcKJkDe99jEWJZZwv>.
L'en-tête d'une compétition aussi (proposition B, le drapeau sur le disque pour
un championnat ou une coupe nationale, une seule tuile) : <https://claude.ai/artifact/G4otUdvsW2uTSohRKR7AUk> ;
sur son écran `/europe`, il remplace celui du premier canevas.
