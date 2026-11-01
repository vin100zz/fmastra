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
| `--bg` | Fond de la page : un gris pâle, sur lequel les cartes se posent |
| `--panel` | Cartes, menus, champs, boutons : blanc |
| `--panel-2` | Tuile dans une carte, score d'un match, prochains matchs, case du banc |
| `--panel-3` | Ce qui est sous le pointeur (voir « Sous le pointeur ») |
| `--stripe` | Une ligne sur deux d'un tableau ou d'une liste |
| `--line` | Le trait de ce qui en garde un : case à cocher, pastille d'une compétition, étage d'un score, deux tableaux côte à côte |
| `--row-line` | Trait entre deux colonnes (attributs, tuile à colonnes), dans un menu |
| `--head-line` | Sous l'en-tête d'un tableau |
| `--track`, `--track-hover` | La piste d'un choix ; une option sous le pointeur, sur elle |
| `--title-ink`, `--title-wash` | L'indigo des titres : l'encre du titre d'une carte et d'un intertitre ; le lavis du bandeau d'un intertitre. Le même sur toutes les pages, celle d'un club comprise |
| `--strong`, `--ink`, `--ink-2`, `--muted` | Encres, de la plus forte au libellé atténué |
| `--accent`, `--accent-ink` | Le jaune de l'application et l'encre écrite dessus : action principale, marque de ce qui est ouvert |
| `--accent-hover` | L'action principale sous le pointeur |
| `--accent-text` | L'accent en texte sur fond blanc ; le lien dans une phrase ; le nom du vainqueur d'un match dans une liste |
| `--own-row` | Ligne du club dirigé ou d'un de ses joueurs dans un classement, son match dans une liste, ligne choisie, entrée ouverte du menu |
| `--good`, `--warn`, `--bad`, `--info` et leur `-soft` | États : texte sur son fond pâle |
| `--c3`, `--c4` et leur `-soft` | Coupes d'Europe d'une place de championnat : la C3 en violet, la C4 en sarcelle ; la C1 prend `--info` (voir « Classement »). La sarcelle marque aussi les matchs à venir du club dirigé dans la barre du haut |
| `--gk`, `--def`, `--mid`, `--att` | Postes : couleurs pleines, lettres blanches |
| `--pitch-a`, `--pitch-b`, `--pitch-line` | Terrain : deux verts de tonte, lignes |
| `--ball` | Ballon d'un but : blanc, le pentagone du centre et cinq pans coupés au bord, à l'encre `#0b121a` dans les deux thèmes ; dessiné pour 10 (pans larges, contour épais) |
| `--backdrop` | Voile sur la page, sous une boîte de dialogue |
| `--star`, `--star-soft`, `--star-empty` et `--star-soft-dark`, `--star-empty-dark` | Étoiles : l'or de ce qui est sûr, l'ardoise de ce qui n'est que possible, une étoile vide ; sur le noir d'un bloc de terrain, l'ardoise et le vide éclaircis (voir « Étoiles ») |
| `--series-1`, `--series-2`, leur `-soft` et leur `-deep` | Deux séries d'un graphique : le trait et les points d'une courbe, les deux côtés d'une répartition ; en pâle, ce qui y est libre ; en foncé, une troisième part de la même série |

Trois familles de pastilles ne se ressemblent jamais, et les étoiles (voir « Étoiles ») sont à part de toutes, dans leur or :

- **Note** : fond pâle gradué, sans bordure, du rouge (jusqu'à 70 sur 200, 4
  sur 20) au jaune (110 ; 10) puis au vert (à partir de 150 ; 16).
- **Poste** : couleur pleine, hors de cette échelle (bleu-vert, indigo, violet,
  magenta), la même pour un poste dans toutes les listes. Largeur fixe de 32,
  quel que soit le code : ce qui suit la pastille s'aligne d'une ligne à
  l'autre.
- **Compétition** : contour, ou noir plein pour une coupe d'Europe.

Le rang d'une place marquée (voir « Classement ») prend le fond pâle d'un état,
ou de sa coupe d'Europe dans un championnat, cerclé de sa couleur : il ne paraît
que dans un classement, où aucune note ne se lit.

### Typographie

Deux familles, celles du système (rien à télécharger) : `--display`
(Bahnschrift SemiCondensed) pour les titres, les chiffres clés et les titres en
capitales ; `--text` (Segoe UI) pour tout le reste.

| Jeton | Taille / interligne | Graisse | Emploi |
|---|---|---|---|
| `--fs-hero` | 40 / 40 | 700 | Nom d'un club dans son bandeau, numéro d'un joueur devant le sien, score |
| `--fs-page` | 26 / 32 | 700 | Titre de page |
| `--fs-title` | 20 / 24 | 700 | Chiffre clé, date du jour, ce qui suit un nom dans son bandeau |
| `--fs-figure` | 16 / 20 | 700 | Action principale, délai, saison montrée par son pas |
| `--fs-figure` | 16 / 20 | 400 | Saisie de la recherche globale |
| `--fs-body` | 13 / 16 | 600 | Titre de carte (capitales, `--display`, `--title-ink`) |
| `--fs-body` | 13 / 18 | 400, 600 | Texte, cellule, onglet, bouton |
| `--fs-body` | 13 / 13 | 700 | Numéro sur un maillot |
| `--fs-small` | 11 / 14 | 400, 600 | En-tête de colonne, libellé, légende |
| `--fs-small` | 11 / 14 | 700 | Intertitre (capitales, `--display`, `--title-ink`) |
| `--fs-micro` | 10 / 10 | 700 | Pastille, poste sur un maillot |
| `--fs-goal` | 120 / 120 | 700 | Le mot « BUT » sur la bande d'un but, au direct : la seule taille hors de l'échelle |

Sept tailles, et celle du but au direct ; trois graisses (400, 600, 700). Seules les capitales sont
espacées (`--caps`, 0.06 em). Les chiffres sont tabulaires.

### Mesures

| | Valeurs |
|---|---|
| Espacements | 4, 8, 12, 16, 24 (`--s1` à `--s6`) : 8 entre deux cartes et entre deux colonnes d'une carte, 8 et 12 dans une carte, 12 au-dessus d'un intertitre qui suit une section, marges de page 8, 16, 12 |
| Hauteurs | Barre du haut 56, ce qui s'y tient 40 (`--h-bar-control`) · onglets 36 · titre de carte 32 · contrôle 28, 22 dans une carte ou une ligne · choix d'une vue : piste 28 et options 24, piste 26 et options 22 dans l'en-tête d'une carte · ligne et en-tête de tableau, intertitre 26 · pastille 18 |
| Largeurs | Le nom d'un tableau, 200 au plus (`--w-name`) : il prend la largeur de son plus long, puis ce qui reste se partage entre les écarts des colonnes. Voir « Tableaux » |
| Formes | Quatre rayons : 4 pour une pastille, le point d'un club, une case (`--radius-chip`) ; 6 pour un contrôle, une option (`--radius`) ; 8 pour ce qui en tient d'autres, piste d'un choix, menu, tuile, terrain (`--radius-box`) ; 10 pour une carte et un bandeau (`--radius-card`). Ou rond (points, écussons) |
| Traits | Peu : une carte, un bouton, un champ, un menu n'ont pas de bordure ; un tableau a un trait sous son en-tête, aucun entre ses lignes. Ce qui est ouvert porte l'accent : 3 sur la barre, sous l'onglet ouvert en trait aux bouts arrondis (`--mark`) ; 2 sous le prochain match, sous un pas de saison ouvert (`--mark-control`) ; l'option ouverte d'un choix en est remplie |
| Profondeur | Une ombre plutôt qu'une bordure : une carte sur le fond (`--shadow-card`), un bouton ou un champ sur sa carte (`--shadow-field`), un menu au-dessus de la page (`--shadow-float`), l'option ouverte sur sa piste (`--shadow-thumb`), l'action principale éclairée d'en haut (`--shadow-accent`) |
| Défilement | La page garde à droite la place de sa barre de défilement sur tous les écrans, qu'elle défile ou non : rien ne se décale d'un écran court à un écran long. Sur un grand écran, une page faite pour tenir sur un écran (la fiche d'un joueur) s'arrête au bas de la fenêtre : ce qui s'allonge défile dans sa carte (voir « Fiche d'un joueur »). Le match en direct n'a pas de barre de défilement du tout, ni sa place : tout tient dans la fenêtre, et ce qui s'allonge défile dans sa carte (voir « Match en direct ») |

### Marque

Le jeu s'appelle Football Manager. Sa marque est un terrain vu de haut : la
ligne médiane, le rond central et son point, les deux surfaces, sur un carré au
rayon de la charte. Elle a deux formes : tracée à l'encre (`--accent-ink`) sur
un carré jaune (`--accent`), ou inversée, en jaune sur un carré à l'encre, là
où le fond est déjà jaune.

- **Favicon** : la marque sur son carré jaune (`web/favicon.svg`), lisible
  jusqu'en 16.
- **Icône du lanceur** : la même marque en `web/favicon.ico` (16 à 256),
  rendue depuis `web/favicon.svg`, sur le raccourci de `start.bat` que crée
  `shortcut.bat`.
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
| Barre du haut | `.topbar`, `.history-nav`, `.date-block`, `.next-matches`, `.last-match`, `.bar-today`, `.next-match`, `.next-match-fill`, `.roll` | Blanche, 56, ouverte par l'écharpe de la marque ; ce qui s'y tient a 40. Pendant un travail, le jour et le prochain match avancent. Voir « Barre du haut » |
| Onglets d'une page | `.tabs` | Une seule rangée par écran, sans trait dessous. L'ouvert souligné d'un trait de 3 aux bouts arrondis, de l'accent ou de la couleur du club, de la sélection ou de la compétition sur sa fiche (voir « Page d'un club ») |
| Choix d'une vue | `.segmented`, `.small` | Sur la ligne du titre ou dans l'en-tête d'une carte : statut des clubs, derniers ou prochains matches, tactique, colonnes. Une piste sans trait (`--track`), l'option ouverte posée dessus, remplie de l'accent et écrite de son encre ; sur la page d'un club, de ses couleurs (voir « Page d'un club »). Piste de 28, options de 24, leur texte à 16 de leurs bords ; dans l'en-tête d'une carte (`.small`), piste de 26, options de 22, à 12 |
| Vues d'un onglet | `.segmented.views` | Au bout de la rangée d'onglets, à la place du pas de saison : les vues d'un onglet qui ne se lit pas par saison (Historique). L'ouverte prend la couleur de la page, comme tout choix. Voir « Historique » |
| Pas d'une série | `.segmented.steps` | Journées : une flèche à chaque bout, toutes écrites entre elles |
| Pas de saison | `.season`, `.season-pick` | Saisons, éditions des sélections : une flèche de chaque côté de celle montrée, qui ouvre la liste de toutes. Voir « Pas de saison » |
| Bouton | `.button`, `.primary`, `.danger`, `.square`, `.small` | Blanc, cerclé d'une ombre fine (`--shadow-field`), sans bordure ; 28, 22 dans une carte ou une ligne ; carré pour une icône seule. L'action principale sur l'accent éclairé d'en haut (`--shadow-accent`) ; `.danger` garde son trait |
| Pied du menu | `.sidebar-bottom`, `.sidebar-tools` | Ma partie, le mode Auto, le thème et le manuel du jeu : quatre boutons d'une icône, de même largeur, sur une ligne ; leur nom en infobulle. Auto montre ce que fait un clic (lecture, pause), sur fond d'accent tant qu'il tourne ; le thème, celui où il mène |
| Action principale | `.cta`, `.cta.busy` | Une seule par écran ; 36, 40 dans la barre du haut. Elle finit sur un chevron dans une pastille (`.go`), un anneau qui tourne pendant un travail (`.busy`) |
| Champ | `.field` | Recherche, liste déroulante : blancs, cerclés d'une ombre fine, sans bordure |
| Nom de la sauvegarde | `.slot-field` | Dans la barre du haut de « Nouvelle partie », avant « Commencer » : 40 de haut, sur `--panel-2`. Voir « Nouvelle partie » |
| En-tête de page | `.page-heading`, `.page-title`, `.tools` | Le titre, ses commandes sur la même ligne, à droite |
| En-tête de club, de sélection | `.hero`, `.hero-logo`, `.hero-name`, `.hero-context`, `.hero-flag` | Bandeau de 88 aux couleurs du club ou de la sélection, son écusson seul, ses onglets dessous. Voir « Bandeau » et « Clubs et pays » |
| En-tête d'un joueur | `.hero`, `.hero-number`, `.hero-name`, `.hero-context`, `.hero-bar`, `.hero-pills`, `.command-group` | Le bandeau de son club, son numéro devant son nom, ses commandes dessous. Voir « Bandeau » et « En-tête d'un joueur » |
| En-tête d'un match | `.hero.duel`, `.hero-side`, `.tile.match-score`, `.big-score`, `.match-facts` | Le bandeau partagé entre les deux camps, le score où ils se rejoignent ; sans barre, la ligne du match au-dessus des temps forts. Voir « En-tête d'un match » |
| Banc d'une composition | `.bench`, `.bench-slot` | Sous le terrain de la Composition : trois colonnes, une place de 26 sur `--panel-2`, le poste puis le nom court du joueur, entier ; une place vide en pointillés |
| Deux colonnes | `.halves` | Une courte liste en deux tableaux côte à côte, un trait entre eux : le banc sous un terrain. Voir « Compte rendu d'un match » |
| Temps forts d'un match | `.highlight-row`, `.highlight`, `.marks`, `.highlight-names`, `.minute` | Une ligne de 26 par fait, la minute au milieu, chaque camp à son bord. Voir « Temps forts d'un match » |
| Match en direct | `.hero.duel.compact`, `.live-clock`, `.ticker`, `.frise`, `.live-flow`, `.squad-row`, `.advice`, `.waiting-status`, `.goal-burst` | Le bandeau du match en 64 et la minute sur sa tuile, le fil du commentaire aux couleurs du camp qui a l'action, la frise du match et le fil des buts attendus sous elle, la ligne d'un joueur, le conseil de l'adjoint et les changements prévus, la tactique et l'attente de ses ordres, la bande d'un but. Voir « Match en direct » |
| Match dans une liste | `.fixture`, `.fixture-side`, `.fixture-score`, `.fixture-stack`, `.fixture-floor`, `.fixture-scorers` | Face à face : le score entre les deux camps, le nom du vainqueur en gras à l'encre de l'accent, le match du club dirigé sur fond jaune. Voir « Match dans une liste » |
| En-tête d'une compétition | `.hero`, `.hero-emblem`, `.hero-name` | Le bandeau d'un club aux couleurs de la compétition, son emblème seul sur le bandeau ou le drapeau de son pays sur le disque, ses onglets dessous. Voir « En-tête d'une compétition » |
| Navigation d'un bandeau | `.entity-nav`, `.entity-step`, `.entity-menu` | Une colonne à gauche du bandeau : le pair d'avant, la liste de tous, le suivant. Voir « Navigation d'un bandeau » |
| Compétition des sélections en colonne | `.hero.narrow` | Son bandeau en tête de sa colonne, sur Sélections nationales : il ouvre sa page. Voir « Compétitions des sélections » |
| Finale, parcours d'une nation | `.final-score`, `.run` | Une finale du côté de son vainqueur ; le parcours d'une nation, une colonne par édition. Voir « Finales et parcours » |
| Carte | `.card`, `.card-head`, `.card-body` | Blanche, sans bordure, posée sur le fond par une ombre (`--shadow-card`), aux coins de 10. Toute carte a son en-tête, ou ce qui en tient lieu (le bandeau d'une compétition, l'en-tête d'un message) : un bloc a toujours un titre, et ne s'ouvre jamais sur un intertitre. En-tête de 32 sans trait dessous : le titre en capitales à l'encre indigo des titres (`--title-ink`), sa boîte arrêtée à ses capitales, qui se centrent ainsi dans l'en-tête, un pixel plus bas pour l'œil (l'ombre de la carte l'allonge vers le bas, les accents chargent le haut) ; lien ou commandes à droite |
| Intertitre | `.section-title`, `.section-tally`, `.count`, `.aside` | Le titre d'une section, le même partout : capitales de 11 dans la police des titres, en 700, à l'encre indigo des titres (`--title-ink`), sur un bandeau de 26 lavé d'indigo (`--title-wash`) qui s'éclaircit vers la droite jusqu'au blanc (le lavis plein sur un tiers, puis 12 % au bout). Ni trait, ni coins arrondis, ni jaune (il est au club dirigé et à l'action), ni couleur du club : il ne change pas d'une page à l'autre. Le bandeau va d'un bord à l'autre de sa carte ou de sa colonne, son texte à 12, comme les lignes qu'il ouvre. Ses capitales se centrent dans le bandeau quelle que soit la police : tout ce qu'il porte partage sa ligne de base, posée une demi-capitale sous le milieu du bandeau, et une pastille (`.count`, poste) s'y centre comme une boîte. Un compte suit le libellé à 8, en chiffres atténués (`.section-tally`), en pastille rouge s'il appelle une action (`.count`) ; une précision se met au bout (`.aside`). Il se tient à 12 sous ce qui le précède (`--s3`) : un blanc ferme la section d'avant avant que son bandeau n'ouvre la sienne ; sous l'en-tête d'une carte ou en tête d'une colonne, rien au-dessus. Ainsi, il ne se confond ni avec un en-tête de colonne, ni avec la ligne du club dirigé |
| Colonnes d'une carte | `.sections` | Des sections côte à côte dans une carte : des colonnes à 8 l'une de l'autre (`--s2`), sans trait entre elles, deux rangées à 12 (`--s3`). Dans chaque colonne, l'intertitre, les lignes et leurs bandes vont d'un bord à l'autre, leur texte à 12 : deux intertitres voisins ne se touchent pas |
| Carte repliable | `.card.fold`, `.card-head.toggle`, `.toggle-arrow`, `.fold-more` | L'en-tête entier montre ou cache ce qui est secondaire. Voir « Carte repliable » |
| Tableau | `.table`, `.tr`, `.tr.head` | Voir « Tableaux » |
| Fait, tuile | `.fact`, `.tile`, `.tile.graded`, `.tile.split` | Libellé atténué, valeur forte. Une tuile n'a pas de bordure : grise dans une carte, blanche et en relief sur un bandeau, blanche et posée comme une carte dans une rangée (`.tiles.row`). Une tuile graduée prend le fond de la pastille de sa note ; une tuile à colonnes tient plusieurs chiffres, chacun sous son libellé, un trait entre deux ; ses colonnes graduées (`.tile.split > .graded`) la remplissent, chacune sur le fond de sa pastille, le trait entre deux à la couleur du panneau. Sur un bandeau et dans une rangée de tuiles, le contenu de chaque tuile est centré horizontalement, celui de chaque colonne dans la sienne |
| Attributs | `.attributes-grid`, `.attribute`, `.attribute.key` | Une ligne de 26 par attribut, son nom puis sa pastille au bord ; un attribut clé en 700, un point de l'accent après son nom. Dans une section, les attributs suivent l'ordre alphabétique de leurs noms ; les composites, l'ordre des phases du jeu. Une colonne tient le plus long nom de sa section et sa pastille (`--attribute-column` : 140, 204 pour les composites et leurs étoiles) ; une grille en a autant que la largeur en laisse, une au besoin : ni nom coupé, ni pastille hors de sa colonne |
| Attributs en colonnes | `.attribute-columns`, `.attribute-column`, `.composites-column`, `.others-column`, `.attribute-rows` | Sur la fiche d'un joueur, une colonne par section, Jeu en tête : son intertitre `.section-title` sous l'en-tête de la carte, les colonnes à 8 l'une de l'autre comme toutes les colonnes d'une carte (voir « Colonnes d'une carte »), ses lignes d'un bord à l'autre de la colonne, leur texte à 12. Les colonnes se partagent la largeur, aucune plus étroite que `--attribute-column` et ses marges ; la dernière passe à la ligne quand la carte ne les tient pas. La carte s'arrête à sa plus longue colonne. Ce que le poste n'emploie pas (`.others-column`) ferme la rangée, ses noms en `--muted`, ses pastilles neutres. Les six composites d'un joueur de champ sont un radar (`.radar-column`, voir « Radar ») dans une colonne de 248, à la hauteur de la plus longue ; à côté de lui, les autres colonnes ne tiennent plus que leur plus longue ligne. Les deux d'un gardien restent une liste |
| Radar | `.radar`, `.radar-label`, `.radar-label.key`, `.radar-rows` | Un hexagone d'étoiles, ses noms courts autour, le nom entier en infobulle. Voir « Radar » |
| Étoiles | `.stars`, `.stars.big` | Niveau, potentiel, composite, note au poste, installations d'un club : cinq étoiles, demi-étoiles comprises, la fourchette d'une estimation en ardoise. Voir « Étoiles » |
| Affinité à un poste | `.fit` | Un disque rempli à sa part de 20, à la couleur de son palier. Voir « Étoiles » |
| Trait d'un club | `.trait`, `.poles` | Un mot et son cran, de cinq, entre deux pôles. Voir « Étoiles » |
| État d'un joueur | `.cells`, `.arrow`, `.face`, `.state` | Condition, forme, moral en cinq paliers, sans chiffre. Voir « État, forme, moral » |
| Mode debug | `.pill.debug` | Dans la barre du haut, tant que « Valeurs exactes » est cochée dans Ma partie. Voir « Étoiles » |
| Pastilles | `.position`, `.rating`, `.comp`, `.score`, `.form`, `.tag`, `.count`, `.pill`, `.rank`, `.reached`, `.delta` | 18 de haut, aux coins de 4 ; un poste, 32 de large ; un rang, 24 ; `.pill` dit en une phrase où en est un joueur ; `.reached` le tour atteint dans une coupe, `.delta` un écart signé. Voir « Historique » |
| Légende des places | `.legend` | La pastille du rang en carré de 12, devant ce qu'elle marque : une place, une coupe d'Europe. Voir « Classement » |
| Club, pays | `.kit-dot`, `.crest`, `.flag`, `.nation`, `.club-flag` | Voir « Clubs et pays » |
| Compétition après sa pastille | `.comp-link` | La pastille puis le nom, un seul lien vers sa page ; le nom se souligne. Voir « Compétitions » |
| Deux camps comparés, jauge, anneau | `.comparison`, `.gauge`, `.ring` | Voir « Graphiques » |
| Cinq derniers matches | `.recent` | Une barre par match du club, à la hauteur des minutes jouées, jaune au-delà du seuil de charge. Voir « Graphiques » |
| Classement au fil des saisons | `.cc`, `.cc-rank`, `.cc-zone` | Le rang de chaque saison, le parcours de chaque édition d'une sélection. Voir « Graphiques » |
| Palmarès | `.honour-line` | Une ligne par titre. Voir « Historique » |
| Niveau au fil des mois | `.level-chart`, `.plot`, `.curve`, `.chart-point`, `.point-value` | Voir « Graphiques » |
| Répartition réglable | `.balance`, `.balance-end`, `.balance-bar`, `.balance-handle`, `.balance-note` | Voir « Graphiques » |
| Mercatos d'un club | `.mercatos`, `.mercato-season`, `.mercato-head`, `.mercato-row`, `.mercato-half` | Ce que le club a dépensé et reçu à chaque fenêtre de chaque saison ; un bloc ouvre sa saison. Voir « Graphiques » |
| Tuile d'un record | `.tile.record` | Dans une rangée de tuiles, lue de gauche à droite : le joueur, le chevron (`.go`, retourné pour une arrivée), le club après sa pastille, le montant au bout. Le double d'une tuile à chiffres |
| Joueur sur un terrain | `.pitch-player`, `.kit-shirt`, `.kit-shirt.number`, `.kit-shirt.former`, `.shirt-change`, `.player-block`, `.block-note`, `.block-season` | Le maillot du club et son numéro, le bloc dessous : le nom, la note et les faits. Voir « Terrain et maillot » |
| Présentation d'un club | `.tiles.row`, `.presentation`, `.kits`, `.kit-outfit`, `.watch-list`, `.watch-facts` | La fiche d'un club s'ouvre sur elle : une rangée de tuiles, quatre colonnes qui remplissent la fenêtre. Celle d'une sélection aussi. Voir « Présentation d'un club », « Présentation d'une sélection » |
| Classement de joueurs | `.leader-bars`, `.leader-bars.soft`, `.card-hint` | Rang, nom, barre contre le premier, chiffre ; l'unité dans l'en-tête de la carte. Voir « Graphiques » |
| Faits de match | `.mark` | But, cartons, blessure, entrée, sortie |
| Infobulle | `.tooltip` | Voir « Infobulles » |
| Recherche globale | `.palette`, `.palette-head`, `.results`, `.result` ; `.veil` dans une maquette | Voir « Recherche globale » |
| Accueil | `.doors`, `.door`, `.door.main`, `.door-mark`, `.saves-list`, `.arrival` | Deux panneaux l'un sous l'autre : créer une partie, reprendre une partie ; pendant un chargement, le bandeau du club. Voir « Accueil » |
| Nouvelle partie | `.nation-line`, `.segmented.range`, `.check` | Le monde, ses clubs, le club choisi, sur un écran. Voir « Nouvelle partie » |
| Curseur | `.slider` | Une valeur choisie sur une échelle de crans, écrite après lui. Voir « Curseur » |
| Case à cocher | `.check` | 18, bordée ; cochée, l'accent et son encre |
| Option d'un mot | `.check-option` | Une case puis un mot court, sans bordure ; le détail dans son infobulle. Voir « Composition auto » |
| Menu d'un joueur | `.menu` | Voir « Menu d'un joueur » |
| Lien | `a`, `.prose a` | Voir « Sous le pointeur » |
| Suite | `.go`, `.go.back` | Ce qui mène plus loin (« Voir », « Voir le championnat », « Suivant », « Continuer ») finit sur un chevron dessiné, pas un caractère, centré sur sa place, dans la couleur de ce qui le porte ; sur l'action principale, au centre d'une pastille de son encre. « Précédent » le retourne |
| Page d'un club | `.club-page`, `--club`, `--club-fill`, `--club-ink`, `--club-wash` | Voir « Page d'un club » |

### Barre du haut

Une barre blanche de 56, soulignée de l'accent (3), que le coin jaune de la
marque ouvre à gauche.

- **Écharpe** : le coin de la marque se termine dans la barre comme le bandeau
  d'un club, sur 64 : un bord incliné, puis une fine bande parallèle. Le menu,
  blanc sur le fond, n'a pas de bordure.
- **Précédent, Suivant** (`.history-nav`) : à 16 de l'écharpe, une paire de 40
  sur un bandeau gris (`--panel-2`) comme les prochains matchs, une flèche dans
  chaque moitié de 36, le trait du panneau entre elles. Elles parcourent
  l'historique de la fenêtre, qui n'a pas les flèches du navigateur en plein
  écran ni en fenêtre d'application ; au bout de l'historique, la flèche se
  grise. Leur nom et leur raccourci (Alt ←, Alt →) en infobulle. Pas de paire
  sur téléphone, qui a son propre retour.
- **Date** : à 12 de la paire, la saison en libellé (11 / 14), le jour dessous
  en 20 / 22.
- **À droite**, dans cet ordre : la pastille du mercato, la loupe, les matchs du
  club dirigé, l'action principale. Ce qui s'y tient a 40 de haut
  (`--h-bar-control`) ; la pastille garde ses 18.
- **Matchs du club** (`.next-matches`) : un bandeau, sans bordure, qui se lit
  dans le temps : les derniers matchs joués de la saison, un trait pour
  aujourd'hui, puis les trois prochains. Chaque bloc porte l'adversaire après sa
  pastille (un avion à l'extérieur), la compétition dessous, en bleu pour une
  coupe.
  - **Joués** (`.last-match`) : sur le gris du bandeau (`--panel-2`), du plus
    ancien au plus récent. Le score, du côté du club, ses buts d'abord, en
    chiffre clé sur la pastille de son issue (22) : verte pour une victoire,
    ambre pour un nul, rouge pour une défaite, comme au calendrier. Chacun ouvre
    son compte rendu ; l'infobulle dit l'issue, le jour, la compétition, le tour
    et le lieu.
  - **Aujourd'hui** (`.bar-today`) : un trait de 2 en sarcelle (`--c4`), entre
    les joués et les prochains.
  - **À venir** (`.next-match`) : sur le lavis de la sarcelle (`--c4-soft`) ; le
    délai en chiffre clé, atténué. Le prochain a son délai et un soulignement en
    sarcelle. Chacun ouvre la fiche de l'adversaire. Sous le pointeur, un voile
    de sa sarcelle (12 %) : ils sont teintés.
  - **Rang de l'adversaire** (`.next-match-rank`) : un match à venir de
    championnat ou de phase de ligue d'une coupe d'Europe suit sa compétition
    d'un point médian et du rang de l'adversaire ce jour, en ordinal et en gras
    (« Ligue 1 · 5e », « 1er ») : à l'encre de sa place, comme sa pastille au
    classement (vert, bleu de la C1, violet de la C3, sarcelle de la C4, jaune
    du barrage, rouge), en `--ink-2` pour une place qui ne mène nulle part. Pas
    de rang pour une coupe, une phase finale, ni avant la première journée ; un
    match joué garde son score. L'infobulle ajoute le rang et les points
    (« … · Extérieur · 5e · 31 pts »).
  - **Mesures** : un bloc à venir a 220 de large au plus, pour son rang, 180
    pour un match joué ; un nom ou une compétition plus longs y sont coupés.
  - **Selon la place** : trois matchs joués tant que tous les noms de la barre
    se lisent en entier (hors d'un bloc à sa largeur maximale), puis deux, puis
    le score seul après la pastille de l'adversaire (`.last-match.short`, son nom
    dans l'infobulle), trois puis deux. Avant le premier match de la saison, les
    prochains seuls.
- **Pendant un travail** (simulation, sauvegarde, chargement) : rien ne s'écrit au
  milieu de la barre et son trait reste jaune ; rien ne décale la page.
  - **Le jour** : la date suit le jour simulé ; chaque nouveau jour monte à la
    place de l'ancien, qui sort par le haut (`.roll`).
  - **Le prochain match** : son délai monte de même, ceux des matchs suivants
    changent sans bouger ; son bloc se remplit depuis la gauche d'un voile de la
    sarcelle (`.next-match-fill`, 18 % sur son lavis), au-dessus de son
    soulignement, à mesure qu'il approche : la part des jours passés depuis le
    début du travail, ou depuis le dernier match joué en mode Auto, sur ceux qui
    l'en séparaient. Le jour du match, il est plein.
  - **L'action principale** garde son nom et sa couleur ; son chevron devient un
    anneau qui tourne (`.cta.busy`). Le travail et son jour sont dans son
    infobulle. Un travail sans jour (sauvegarde) n'a que l'anneau.

### Pas de saison

Ce qui se lit saison par saison se parcourt avec un seul contrôle, le même sur
tous les écrans (`.season`) : une flèche vers la saison d'avant, la saison
montrée, une flèche vers la suivante. La saison montrée ouvre la liste de
toutes. Les éditions des sélections se parcourent de même : sur le calendrier d'une sélection,
toutes ses éditions (Euro, Coupe du monde, Ligue des nations) ; sur la page d'une compétition des
sélections, les siennes. Jamais une liste déroulante du navigateur, une rangée d'options ni des
blocs repliés.

- **Sans bordure** : ni cadre, ni trait entre ses parties. Un fond (`--panel-3`)
  ne paraît que sous le pointeur ; la saison dont la liste est ouverte prend
  `--panel-2` et la marque de ce qui est ouvert (2).
- **Flèches** : des chevrons dessinés, de 16, d'un trait de 2.4. Sur la fiche
  d'un club, d'une sélection ou d'une compétition, elles sont à sa couleur,
  celle qui souligne l'onglet ouvert ; ailleurs, à l'encre. Sous le pointeur elles gardent leur
  couleur. Celle qui n'a plus rien au-delà reste à sa place, grisée.
- **Saison** : en chiffre clé (`--display`, 16 en 700 ; 13 dans l'en-tête d'une
  carte), suivie d'un chevron atténué. La saison seule (« 2031 / 2032 »), le
  nom de l'édition (« Euro 2032 ») ou, sur la page de sa compétition, son année
  seule (« 2032 ») : le mot « Saison » n'est pas écrit, et ce que le pas montre
  n'est pas répété dans le titre voisin (le bandeau dit « Euro », pas « Euro 2032 »).
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
| Un onglet de la fiche d'un club ou d'une sélection (Calendrier, Finances, Transferts), le tableau d'une coupe nationale, une coupe d'Europe, une compétition des sélections | Au bout de la rangée d'onglets, sous la dernière tuile du bandeau ; absent des onglets qui ne se lisent pas par saison (Historique) | 28 |
| Une seule carte : le classement archivé d'un championnat | Dans son en-tête, à droite | 22 |

D'un onglet à l'autre de la fiche d'un club, la saison choisie est gardée.

**Les formations de la Composition** se parcourent avec le même contrôle, en tête du terrain, à
gauche, sur la ligne de la barre d'outils de la liste : dans leur ordre (la première au bout gauche),
pas la plus récente d'abord ; la liste s'ouvre alignée sur le bord gauche, la tactique du club
(« Perso ») après un trait.

### Composition auto

Sur la ligne au-dessus de la liste de la Composition, tout ce que l'IA sait composer, un clic par
action, sans menu à ouvrir.

- **Niveaux** : un choix (`.segmented`) de quatre mots, « Meilleure », « Légère », « Forte »,
  « Complète ». Un clic compose ; le niveau dont la composition est à l'écran garde la marque de ce
  qui est choisi, perdue au premier changement fait à la main.
- **Options** (`.check-option`) : la case de la charte puis un mot, « Jeunes », « Formation », 4 entre
  deux, 8 après les niveaux. Cochée, la case prend l'accent ; sous le pointeur, le fond d'un contrôle.
- **Infobulles** : le détail que les mots courts taisent (« Légère rotation : un tiers des joueurs de
  champ au repos… »).
- **Place** : après le premier problème de la composition, qui se coupe pour lui laisser la place ;
  un trait (`--line`, 22 de haut) le sépare d'« Infos » / « Jeu ».

**La couleur d'un club sous ses onglets.** L'onglet ouvert d'une fiche et les
flèches de ses saisons prennent, des deux couleurs du club, de la sélection ou
de la compétition, celle qui se lit le mieux sur le fond. Une couleur qui s'y lirait mal (un
contraste sous 3 : un jaune, un bleu ciel sur le blanc) est ramenée à son ton
dans un graphique (voir « La couleur d'un club dans un graphique ») ; sans
couleur lisible (blanc et blanc), l'accent en texte (`--accent-text`) en tient
lieu.

### Curseur

`.slider` : un `<input type="range">` puis sa valeur (`<output>`), dans un
`<label>` qui porte son nom en infobulle (la vitesse de lecture du résumé d'un
match).

- Pour une valeur que l'on règle sans la saisir, sur une échelle de plus de
  quatre crans ; quatre au plus, un choix (`.segmented`).
- Une piste de 4 (`--s1`) et de 120 de long, sur `--track`, remplie de
  l'accent jusqu'au pouce (`--fill`, posé par l'écran) ; sur la page d'un club,
  de ses couleurs (`--club-fill`).
- Le pouce est un rond blanc de 18, posé comme un champ (`--shadow-field`,
  `--shadow-thumb`). Il se déplace aussi aux flèches.
- La valeur s'écrit après, à 8, en 13 / 600, en chiffres de largeur fixe sur
  une place de cinq caractères : rien ne bouge quand elle change. Un facteur
  s'écrit avec son « × » et le point décimal (0.25×, 1.5×).
- Deux curseurs qui se suivent (les deux vitesses du direct) sont chacun
  précédés de leur icône (`.slider-icon`, 18, trait de 1.7 à `--ink-2`), à 8 :
  le ballon pour les actions, le chronomètre pour les temps morts. La piste
  passe alors à 96.

### Sous le pointeur

Ce qui se trouve sous le pointeur prend un seul fond, `--panel-3`. Ce qui est
ouvert, choisi ou teinté garde le sien. Rien d'autre ne bouge : ni couleur d'un
lien, ni bordure, ni ombre. Sur un bandeau, qui a ses couleurs, ce fond est un
voile de son encre.

| Élément | Au repos | Sous le pointeur |
|---|---|---|
| Lien : le nom d'un club, d'un joueur, d'un pays, d'une compétition, le score d'un match, « Voir » | La couleur du texte qui le porte, non souligné | Souligné (trait de 1, à 2 du texte), même couleur |
| Lien dans une phrase : le manuel, le titre et le texte d'une actualité (`.prose`) | `--accent-text`, non souligné | Souligné, même couleur |
| Ligne d'un tableau ou d'une liste, fait | Son fond | `--panel-3` ; la ligne teintée (club dirigé, ligne choisie, état) garde sa teinte |
| Ligne ou carte qui s'ouvre tout entière : une actualité, un match du calendrier, une ligne de la recherche globale | Son fond | `--panel-3` et la main ; aucun texte souligné |
| En-tête d'une carte repliable | Son fond | `--panel-3` et la main ; la flèche garde sa couleur |
| Bouton, pas d'une série, filtre, entrée du menu, ligne d'un menu | Son fond | `--panel-3`, encre `--strong` ; `--accent-hover` pour l'action principale, `--bad-soft` pour `.danger` |
| Option d'un choix, sur sa piste | Aucun fond | `--track-hover`, plus clair que la piste, encre `--strong` |
| Panneau « Créer une partie » de l'accueil | L'accent | `--accent-hover` et la main |
| Case à cocher | Son fond | `--panel-3` tant qu'elle n'est pas cochée |
| Option d'un mot | Aucun fond | `--panel-3` sous la case et le mot, encre `--strong` |
| Flèche d'un pas de saison, saison qui ouvre sa liste | Aucun fond | `--panel-3` ; la flèche garde la couleur du club |
| Flèche de la navigation d'un bandeau, traits qui ouvrent sa liste | Aucun fond | Un voile de l'encre du bandeau, à 12 % ; ils gardent leur couleur |
| Onglet, en-tête de colonne | `--muted` | `--strong` |
| Joueur sur un terrain | Son nom | Son nom souligné |

- Une pastille qui mène quelque part (le score d'un match, la pastille d'une
  compétition) est un lien : son texte se souligne, son fond ne change pas.
  Suivie du nom de sa compétition, les deux forment un seul lien : c'est le nom
  qui se souligne, pas la pastille.
- Un drapeau seul qui mène à sa sélection ne change pas sous le pointeur : la
  main et son infobulle, qui nomme le pays, le disent. Suivi du nom ou du code
  du pays, c'est ce texte qui se souligne.
- Dans une carte dont l'en-tête entier ouvre une page, c'est son lien
  « Voir » qui se souligne.
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

### Accueil

Sans partie, et sur « Ma partie », deux panneaux de même forme, l'un sous l'autre (`.doors`) :
« Créer une partie » en haut, « Reprendre une partie » dessous, jusqu'au bas de la fenêtre.

- **Panneau** (`.door`) : 16 de marge. En tête, sur une ligne, un carré de 40 et son nom en
  capitales, à la taille d'un titre de page (26 / 32, `--display`).
- **Créer une partie** (`.door.main`) : l'action principale de l'écran, une bande aussi haute que
  son en-tête. Sur l'accent, la marque inversée pour carré, une flèche après son nom ; il s'ouvre
  tout entier, `--accent-hover` sous le pointeur. Il mène à « Nouvelle partie ».
- **Reprendre une partie** : sur `--panel-2`, il occupe le reste de la fenêtre. Son carré est
  dessiné comme la marque : un carré de l'encre, une disquette dans le fond. Dessous, dans une
  carte, la liste des sauvegardes
  (`.saves-list`), une ligne chacune : son nom (« Sauvegarde automatique » pour celle du jeu, le
  nom d'une copie datée atténué), son club après sa pastille, la date de la partie, le moment de
  l'enregistrement. La plus récente d'abord ; ses colonnes se trient.
- **Ligne** : elle reprend sa partie tout entière. La poubelle qui la supprime (`.button.small.square`)
  ne paraît qu'au bout de la ligne sous le pointeur, ou quand la ligne a le focus ; elle demande
  confirmation.
- Rien d'autre : ni texte d'accueil, ni compte. Sans sauvegarde, la carte le dit.
- Sans partie, la barre du haut est vide et le menu n'a que le manuel.
- **Chargement** (`.arrival`) : pendant qu'une partie se charge ou se crée, la
  page ne montre que le bandeau de son club, seul au milieu de la page : son
  écusson, son nom, puis le jour où en est la partie ; son écharpe va et vient.
  La barre du haut ne garde que l'historique : la partie d'avant n'y est plus
  (`.arriving` sur la page). Le serveur peut ne plus répondre tant qu'il lit la sauvegarde : rien n'y attend
  de lui, la feuille seule fait bouger le bandeau. Une partie sans club (une
  ancienne sauvegarde) a le bandeau sans couleurs, son jour pour nom.

### Nouvelle partie

Un seul écran, de gauche à droite : le monde, ses clubs, le club choisi.

- **Barre du haut** : la date est le premier jour de la partie (« Saison 2026 / 2027 »,
  « mercredi 1 juillet 2026 ») ; l'action principale est « Commencer », grisée tant qu'aucun club
  n'est choisi ou que le nom de la sauvegarde n'en est pas un ; les prochains matches et le mercato de la partie en cours n'y sont pas. La graine
  n'est écrite nulle part : la partie en tire une.
- **Monde** : une carte, une ligne par nation (`.nation-line`, 26), dans l'ordre de
  `config/creation.json`. La case qui la joue (`.check`), son drapeau et son nom, ses divisions,
  ses clubs à droite ; le total des clubs dans l'en-tête de la carte.
- **Divisions** : un choix jusqu'à une (`.segmented.small.range`), de la première à la plus basse
  que le jeu sait simuler, écrites comme leur pastille (L1, L2, L3 ; D1, D2, D3) : toutes celles
  jouées portent la marque de ce qui est ouvert, jusqu'à la plus basse. Un clic sur une division en
  fait la plus basse jouée, et joue sa nation. Une nation écartée est atténuée, son drapeau gris, ses
  divisions éteintes, « — » pour ses clubs.
- **Clubs** : les clubs du monde choisi, filtrés par pays (les nations jouées), par réputation
  décroissante ; club, championnat, réputation, niveau et potentiel (sur 200, les 16 meilleurs),
  stade. Toutes les colonnes se trient ; la ligne choisie a le fond `--own-row`.
- **Club choisi** : son bandeau (écusson, nom, drapeau et championnat à sa suite), sans tuile ;
  dessous, ses tuiles (réputation, niveau et potentiel gradués, plafond salarial mensuel), ses faits
  (stade, entraînement, recrutement des jeunes) et ses 16 meilleurs joueurs.
- **Nom de la sauvegarde** (`.slot-field`) : dans la barre, juste avant « Commencer », un champ de
  240 × 40 sur `--panel-2`, sans libellé : la disquette de « Reprendre » en tête, le nom en 16 dans
  la police des titres (700, `--display`). Il prend le nom du club choisi (espaces et signes changés
  en tirets) tant qu'on n'en écrit pas d'autre. Écrit, il passe en blanc cerclé de `--accent-text`.
  Un nom déjà pris par une sauvegarde passe sur `--bad-soft` cerclé de `--bad-line`, la disquette en
  `--bad` ; son infobulle dit ce qu'il remplacerait (son nom, son club, la date de sa partie) et
  « Commencer » demande confirmation. Un nom qu'une sauvegarde ne peut pas porter (autre chose que
  lettres, chiffres, `_` et `-`) prend le même rouge, son texte en `--bad`, et grise « Commencer ».
- **Case à cocher** (`.check`) : 18, bordée, au rayon de la charte ; cochée, le fond de l'accent,
  sa bordure `--accent-text`, la coche à l'encre de l'accent. C'est un bouton (`aria-pressed`).

### Bandeau

Le bandeau du choix d'un club (« Nouvelle partie ») montre les tenues complètes
à domicile puis à l'extérieur entre l'écusson et le nom (`.hero-kits`,
`.club-hero-kits` dans l'application). Chaque image transparente tient dans
48 × 80, sans déformation ; l'écart est de 8. Le bandeau reste haut de 88.
Une infobulle distingue Domicile et Extérieur ; un clic ouvre le PNG agrandi.
La tenue extérieure est omise quand ses données sont absentes. La fiche d'un
club ne les porte pas sur son bandeau : elles sont, en grand, dans sa
Présentation (voir « Présentation d'un club »).

Les 55 motifs de maillot reprennent les zones rouge, verte et bleue des templates.
Short et chaussettes emploient chacun leur propre palette du CSV, appliquée
aux deux modèles fournis (bordure du short et revers des chaussettes en vert).
Les différents IDs de short et de chaussettes restent conservés dans les données ;
il n'y a pour le moment qu'un modèle graphique pour chacun.
Le tissu, ses ombres et son alpha sont conservés. Un motif de maillot inconnu
utilise l'uni ; une pièce sans couleurs reprend la couleur principale du maillot.
Sans palette de maillot, la tenue domicile est grise.

La fiche d'un club, d'une sélection, d'un joueur, d'une compétition s'ouvre sur
le même bandeau (`.hero`) : 88 de haut, aux couleurs du club, de la sélection ou
de la compétition, l'écusson à gauche, les tuiles à droite. Tout nouvel en-tête
le reprend. Il a les coins et l'ombre d'une carte ; une lumière traverse ses
couleurs depuis le coin haut gauche, une ombre douce tient son pied, un filet
clair borde son haut. Ses tuiles sont blanches, en relief.

- **Écusson** (`.hero-logo`) : celui d'un club, le logo d'une sélection, seul
  sur le bandeau, sans disque, sous l'ombre des tenues (`0 1px 2px`, encre à
  35 %). Quelle que soit sa forme, il a l'aire d'un carré de 64, sans dépasser
  72 de haut ni 128 de large : un écusson rond fait 64 × 64, celui de Brann,
  trois fois et demie plus large que haut, 118 × 34, celui de Tottenham, deux
  fois plus haut que large, 31 × 72. Les PNG sont rognés à ce qu'ils dessinent
  (`tools/trim_logos.py`) : leur rapport est celui de l'écusson. Sans écusson, ou
  s'il ne se charge pas, le disque de 64 cerclé de blanc garde les initiales sur
  les couleurs du club. Il en va de même sur le bandeau d'un match (voir
  « En-tête d'un match ») ; un championnat a le drapeau de son pays sur le disque.
- **Nom** (`.hero-name`) : en 40, sur une seule ligne. Rien n'est écrit
  au-dessus de lui, ni dessous.
- **À sa suite** (`.hero-context`) : là où il joue, sur la même ligne et la
  même ligne de base, en 20, à 12 du nom. Un lien vers sa fiche quand il en a
  une.
- **Tuiles** : ce que le bandeau chiffre va sur une tuile, jamais dans une ligne
  de texte. La capacité du stade n'y est pas.
- **Centrées** : le libellé et la valeur d'une tuile sont centrés
  horizontalement dans sa largeur ; sur une tuile à colonnes, chacun dans sa
  colonne.
- **Tuiles d'un club** : le niveau et le potentiel de ses 16 meilleurs joueurs,
  sur une tuile de deux colonnes graduées (`.tile.split > .graded`, comme ceux
  d'un joueur), titrées « Niveau » et « Potentiel » sans le 16, que leur
  infobulle précise ; puis sa réputation et l'écart de sa dernière révision. Sa
  tactique, son entraînement et son recrutement des jeunes sont dans sa
  Présentation.

| Bandeau | À la suite du nom |
|---|---|
| Club | Le drapeau de son pays, puis son championnat : deux liens, le drapeau vers la sélection du pays, le championnat vers sa fiche. Hors championnat, son pays après son drapeau : un seul lien, l'ensemble vers la sélection |
| Sélection | Son drapeau (`.hero-flag`), 37 × 28, la hauteur des capitales du nom, sur sa ligne de base, à 16 de lui, sous l'ombre de l'écusson ; sans lien ni infobulle, sur sa propre page |
| Joueur | Son club, lien vers sa fiche ; « Libre » sans club |
| Compétition | Rien : son nom seul ; l'édition d'une compétition des sélections est au pas de saison |

Un drapeau y mène toujours à la sélection de son pays : avec le nom du pays, ils
forment un seul lien ; devant autre chose (un championnat), le drapeau est un
lien à part, ce qui le suit a le sien. Un pays sans sélection dans le jeu garde
son drapeau, sans lien.

Le bandeau d'un match n'a rien à la suite de ses noms, sinon, dans une coupe
d'Europe, le drapeau du pays de chaque club : la ligne du match dit le reste
(voir « En-tête d'un match »).

### Page d'un club

La fiche d'un club, d'une sélection, d'un joueur (celles de son club) ou d'une
compétition prend les couleurs de son bandeau pour toute la page (`.club-page`) :

- **Fond** : un souffle de la couleur du bandeau, 12 % en haut, 6 au tiers,
  4 en bas ; les cartes restent blanches. Sur un match, chaque camp teinte son
  côté de la page.
- **Ce qui est ouvert** : l'option ouverte d'un choix est remplie de la couleur
  du bandeau (`--club-fill`), écrite de son encre (`--club-ink`). L'onglet
  ouvert prend la couleur du club qui se lit sur un panneau (`--club`), la
  saison montrée d'un mercato son lavis (`--club-wash` à 10 %). Les titres
  (d'une carte, d'une section) restent indigo : ils sont les mêmes partout.
- **Ailleurs**, et pour un club sans couleurs, l'accent. L'action principale et
  l'entrée ouverte du menu restent jaunes : elles sont celles du jeu, pas de la
  page.

### Navigation d'un bandeau

La fiche d'un club, d'une sélection, d'un joueur ou d'une compétition passe à
ses pairs par un seul contrôle, à gauche de son bandeau (`.entity-nav`) : le pas
de saison, en colonne. Une flèche vers le pair d'avant, trois traits qui ouvrent
la liste de tous, une flèche vers le suivant. Un groupe d'un seul n'en a pas.

- **Sans bordure ni fond** : une colonne de trois cases de 28 sur 22, devant
  l'écusson, le disque ou l'emblème.
- **Flèches** : les chevrons du pas de saison (16, trait de 2.4), vers le haut et
  vers le bas, dans le sens de la liste. Celle qui n'a plus rien au-delà reste à
  sa place, estompée (30 %).
- **Traits** : trois, au trait d'une icône (1.7), dans la couleur des flèches.
  Leur liste ouverte, leur case prend le voile et la marque de ce qui est ouvert
  (2), dans cette couleur.
- **Couleur** : la seconde couleur du bandeau, celle de son écharpe, quand son
  contraste sur le bandeau atteint 3 ; sinon l'encre du bandeau. Un bandeau sans
  couleurs les a à l'encre.
- **Sous le pointeur** : un voile de l'encre du bandeau, à 12 % ; la flèche garde
  sa couleur.
- **Liste** : le menu de la charte (`.menu`), sous la colonne, aligné sur son
  bord gauche : tous les pairs, douze lignes au plus avant de défiler, ouverte
  sur celui montré, qui a le fond `--own-row`. Un joueur y suit son poste, une
  compétition sa pastille. Ni titre, ni compte : « Ligue 1 · 7 / 18 » est
  l'infobulle des trois traits. Elle se ferme sur un choix, un clic ailleurs ou
  Échap.

| Bandeau | Seconde couleur | Contraste | Flèches |
|---|---|---|---|
| Ligue Europa | `#f26522` sur `#0a0b5c` | 5.48 | `#f26522` |
| Euro | `#ffcc00` sur `#003399` | 7.18 | `#ffcc00` |
| Ligue des nations | `#00a6d6` sur `#0b1e3f` | 5.84 | `#00a6d6` |
| Nice | `#d2122e` sur `#1a1a1a` | 3.20 | `#d2122e` |
| Paris SG | `#da291c` sur `#004170` | 2.17 | L'encre, `#ffffff` |
| Ligue des champions | `#2447e6` sur `#0a0b5c` | 2.57 | L'encre, `#ffffff` |
| Marseille | `#ffffff` sur `#2faee0` | 2.54 | L'encre, `#111418` |

### En-tête d'un joueur

La fiche d'un joueur s'ouvre sur le bandeau de son club (`.hero`) : ses
couleurs, son écusson seul (voir « Bandeau »). Un joueur sans club a un bandeau
neutre, sans écusson.

- **Numéro** (`.hero-number`) : son numéro de maillot, devant son nom, sur la
  même ligne de base, à 12 de lui : en 40 comme lui, dans l'encre du bandeau
  voilée à 55 %. « Numéro de maillot » en infobulle. Un joueur sans club n'en
  a pas.

- **Nom** : celui du bandeau, son club à sa suite (voir « Bandeau »). Son
  poste n'y est pas : il se lit sur le terrain des aptitudes.
- **Tuiles**, dans cet ordre : âge, sélection, niveau et potentiel, valeur et
  prix demandé.
- **Niveau et potentiel** : une tuile de deux colonnes (`.tile.split`), leurs
  étoiles de 16 (`.stars.big`), sans fond gradué : la couleur dirait la
  valeur que les étoiles arrondissent. Ni infobulle, ni « sur 200 ».
- **Valeur et prix demandé** : une tuile de deux colonnes (`.tile.split`) ; le
  prix « N/A » quand personne ne peut le demander, la raison en infobulle.
- **Sélection** (`.tile.split`) : une tuile de trois colonnes, un trait entre
  deux. Le drapeau au-dessus du code de trois lettres (jamais le nom du pays :
  la tuile garde sa largeur), « Sél. » et « Buts », la colonne des buts dès le
  premier. C'est la sélection qui l'a appelé, à défaut la première de ses
  nationalités ; lien vers la sélection du pays quand le jeu en a une. Ses autres
  nationalités sont un fait de la carte État, drapeau puis code.
- **Barre** (`.hero-bar`) : 36, à la place des onglets d'un club, la page
  n'en ayant pas. À gauche, où il en est (`.pill` : « Sur la liste · 45 M€ »,
  « Prolongation en attente », « Prêté à Lorient · retour le 30 juin 2026 ») ;
  à droite, les commandes de 28, par groupes (`.command-group`, 4 entre deux
  boutons, 16 entre deux groupes), ceux de son menu : effectif, vente, puis
  l'action principale au bout (« Proposer un contrat », « Faire une offre »).
  Une commande impossible reste à sa place, grisée, sa raison en infobulle.
  Sans club dirigé, pas de barre.

### Fiche d'un joueur

Sous l'en-tête, la colonne à gauche (280), puis attributs et carrière, enfin
aptitudes et courbe du niveau (voir `docs/ui.md`, « Joueur »).

- **Colonne** (`.player-rail`) : trois cartes l'une sous l'autre, à 8 :
  État, Caractère, Contrat, chacune sous son en-tête. Elle s'arrête à son
  dernier fait, quelle que soit la hauteur de la page.
- **Tenir dans la fenêtre** : à partir de 1728 de large et 860 de haut, la page
  s'arrête au bas de la fenêtre, sans défiler. Les aptitudes gardent leur
  terrain de 280 ; la courbe prend ce qu'il laisse dessous. La carrière vient
  sous les attributs et défile dans sa carte, qui ne dépasse pas ses tableaux.
- **Carrière** : deux blocs dans une carte, les clubs puis la sélection, une
  bande du fond entre eux. Chacun est un tableau qui défile, son en-tête et son
  total toujours visibles ; alignés (`.aligned`), ils gardent les mêmes colonnes
  de chiffres. Tenue plus basse que ses tableaux, la carte partage sa hauteur :
  chaque bloc prend ce qu'il lui faut jusqu'à une part égale, le reste va à
  l'autre.

### En-tête d'un match

Le compte rendu d'un match s'ouvre sur un seul bandeau (`.hero.duel`), partagé
entre les deux camps : celui qui reçoit à gauche, l'autre à droite.

- **Chaque moitié** est l'en-tête de son camp : ses couleurs (un maillot proche
  du blanc cède la place à sa seconde couleur, comme pour un club), son
  écharpe, son écusson seul, sans disque, comme sur la fiche d'un club (le logo
  pour une sélection ; ses initiales sur le disque sans écusson), son nom en 40,
  lien vers sa fiche. Un camp sans couleurs garde le fond `--panel-2`.
- **Drapeau** : dans une coupe d'Europe, le drapeau du pays de chaque club suit
  son nom, en 24 × 18, du côté du score. Comme sur tout bandeau, il mène à la
  sélection de son pays ; un pays sans sélection garde son drapeau, sans lien. La
  ligne du match ne le répète pas après le vainqueur : elle tient sur sa ligne.
- **Score** : en 40, sur une tuile là où les deux moitiés se rejoignent, écrit
  comme dans une liste, un tiret entre deux espaces (« 3 – 0 ») ; « VS »
  avant le match. Dessous, sur une ligne, ce qui a départagé : « Cumul 3 – 3 »,
  « 4 – 2 t.a.b. ». Résumé 2D ouvert, la tuile suit le score de la lecture ;
  replié, elle revient au score final.
- **Pas de barre** sous le bandeau : la ligne qu'elle prenait reste au terrain
  et au banc.
- **Ligne du match** (`.page-heading`, `.match-facts`) : 32, en tête de la
  colonne du milieu, au-dessus des temps forts ; seule sous le bandeau avant le
  match. À gauche la pastille de la compétition, le tour en gras, puis, atténués,
  le jour et « Terrain neutre » ; enfin « Vainqueur : » et le camp qualifié,
  quand le match en désigne un. À son bout, les commandes de 28 : « Match
  aller », puis « Résumé 2D ». La capacité du stade n'est écrite nulle part.
- **Les noms ne sont écrits qu'ici.** Sur le reste de l'écran, rien ne nomme un
  camp : celui qui reçoit est à gauche (sa composition, ses temps forts, sa part
  des barres). Les compositions n'ont pas de titre.

### Présentation d'un club

La fiche d'un club s'ouvre sur son premier onglet, « Présentation » ; l'onglet
« Effectif » ne garde que ses deux listes, sur toute la largeur. Sous les
onglets, une rangée de tuiles, puis, à 8 sous elle, quatre colonnes
(`.presentation`), deux sous 1500 de large, une sous 900.

- **Rangée de tuiles** (`.tiles.row`, chaque tuile à la largeur de son contenu) :
  la place du club dans chaque compétition de la saison, sur une tuile à colonnes
  (la pastille de la compétition puis son nom, à 8, un seul lien vers sa page ;
  le rang en championnat,
  ses points à sa suite, atténués ; sinon le tour atteint ou perdu en coupe) ;
  ses joueurs et leur âge moyen, sur une tuile de deux colonnes ; sa tactique ;
  son entraînement et son recrutement des jeunes, sur une tuile de deux
  colonnes, sur 20 sans le dire (leur infobulle le dit) ; sa personnalité
  (Risque, Jeunes, Patience), sur une tuile de trois colonnes, sur 20 sans le
  dire, l'infobulle de chacune disant ce que le trait fait faire au club ; en
  dernier, la valeur de l'effectif. Un club qui ne joue
  aucune compétition n'a pas la première tuile. Les tuiles se partagent la
  largeur de la rangée, les colonnes d'une tuile la sienne ; le contenu de
  chacune y est centré horizontalement, comme sur le bandeau.
- **Colonnes**, dans cet ordre : les tenues et les finances ; l'équipe-type et
  « À surveiller » (club dirigé seulement) ; le calendrier et le classement ; les
  buteurs, les passeurs et les notes.
- **Elles remplissent la fenêtre.** Leurs listes prennent les lignes que la
  hauteur laisse, sans défilement : le classement entier tant que cinq matches
  tiennent encore à côté de lui, sinon les lignes autour du club ; le calendrier
  le reste, les trois prochains matches au plus, les derniers joués avant eux ;
  les trois classements de joueurs, autant de lignes chacun. Le terrain de
  l'équipe-type se rétrécit à la hauteur qu'il a.
  Un changement de taille de la fenêtre redessine la page.
- **Tenues** (`.kits`) : les deux tenues complètes, domicile d'abord, 165 de
  large au plus, au ratio 320 × 725, sur `--panel-2` (une tenue blanche se
  fondrait dans la carte). Le short et les chaussettes sont proportionnés au
  maillot, sans déformation ; la hauteur accueille les trois pièces sans les réduire.
  Un espace transparent d’environ 16 px à la largeur de 165 sépare le short des
  chaussettes pour laisser la place aux genoux.
  L’écusson du club (le logo d'une sélection) est superposé côté cœur (à droite
  pour l’observateur), dans ses couleurs d’origine, sur les deux tenues, dans une boîte de 19 × 23 px
  à la largeur de 165. Il reste absent si le logo manque.
  Rien dessous : leur infobulle dit Domicile ou Extérieur ; un clic ouvre le PNG.
- **Équipe-type** : le terrain réparti (voir « Terrain et maillot »), les
  lignes de la Composition que sa formation occupe ; chaque joueur dans le
  maillot du club, son numéro dessus, son nom court dans le bloc. La seconde
  ligne du bloc est sa saison (`.block-season`) : ses
  matches, titularisations et entrées comprises, une barre oblique, ses buts,
  puis le ballon des faits de match (« 52 m / 24 » et le ballon) ; « 54 m » seul
  sans but. Elle est en bleu pâle (`--series-1-soft`), hors de l'échelle des
  notes : rien ne s'y lit comme une note. Avant le premier match du club dans
  la saison, ou pour un club qui n'en joue pas, la seconde ligne est la note au
  poste, sur 200, dans sa couleur. L'infobulle donne le nom entier et la saison
  en toutes lettres (« 52 matches dont 41 titularisations, 24 buts »). Le choix
  des joueurs est dans le manuel (« L'entraîneur IA »).
- **À surveiller** (`.watch-list`) : une ligne de 26 par joueur du club dirigé
  qui attend une décision, sa pastille de poste, son nom, puis à droite
  (`.watch-facts`, à 12 l'un de l'autre) : le contrat qui finit dans l'année et
  la blessure en rouge (« Contrat · 30 juin 2034 », « Blessé · 12 juil. »), la
  suspension, le moral sous 70 % et sa cause, comme dans la liste. Six au plus ;
  pas de carte quand personne n'attend rien.
- **Calendrier, classement, finances** : les blocs d'Actualités et de l'ancien
  Effectif (le score du côté du club coloré V, N ou D ; le classement réduit à
  PTS et DIFF ; la trésorerie sous le budget de transferts).
- **Buteurs, passeurs, notes** : trois classements de joueurs (voir
  « Graphiques »), leur unité dans l'en-tête (buts, passes, note moyenne), en
  bleu pâle. Une note compte à partir de la moitié des matches du joueur le plus
  utilisé, comme dans Actualités ; elle s'écrit avec deux chiffres après le
  point.

### Présentation d'une sélection

La fiche d'une sélection s'ouvre elle aussi sur « Présentation » ; son onglet
« Effectif » ne garde que la liste du rassemblement, sur toute la largeur. La
rangée de tuiles et les quatre colonnes d'un club, avec ce qui s'applique à une
sélection : ni finances, ni « À surveiller ».

- **Rangée de tuiles** : la place dans l'édition où elle en est (la pastille de
  l'édition puis son nom, un seul lien vers sa page ; le tour perdu sans
  « Éliminé »), les joueurs du dernier rassemblement et leur âge moyen sur une
  tuile de deux colonnes, leur valeur (celle des renforts, qui n'en ont pas,
  laissée de côté). Ni tactique, ni entraînement, ni recrutement.
- **Colonnes**, dans cet ordre : les tenues et le parcours ; l'équipe-type et
  le groupe ; le calendrier ; les buteurs, les passeurs et les notes.
- **Tenues** : celles d'un club, le logo de la sélection sur la poitrine à la
  place de l'écusson.
- **Parcours** : le bilan de l'onglet Calendrier réduit à ses deux premières
  colonnes, ses huit n'y tenant pas : la pastille et le nom de l'édition, un
  lien vers sa phase finale, puis la place (« Éliminé · Demi-finales »,
  « Division A », « ✦ Vainqueur » en gras). Une ligne de 26 par édition jouée,
  la plus récente d'abord, autant que la colonne en laisse sous les tenues.
- **Équipe-type** : celle d'un club, pour l'édition où la sélection en est. Le
  poste sur le maillot, une sélection n'ayant pas de numéros ; un renfort
  temporaire dans le maillot gris, sans lien, comme sur le terrain d'un match.
  Le terrain se rétrécit à la hauteur que le groupe lui laisse.
- **Groupe** : sous l'équipe-type, le groupe de l'édition en entier, réduit à
  PTS et DIFF comme le classement d'un club ; absent hors d'une édition.
- **Calendrier** : toute la hauteur de sa colonne, toutes éditions confondues :
  les trois prochains matches au plus, les derniers joués avant eux.
  L'adversaire suit son drapeau ; un match d'une autre édition porte sa
  pastille ; un match sur terrain neutre n'a pas d'avion.
- **Buteurs, passeurs, notes** : ceux de la sélection dans l'édition, joueurs
  partis compris ; un renfort temporaire suivi de « (temp.) », sans lien.

### Compte rendu d'un match

Tout tient dans une fenêtre de navigateur sur un écran de 1080 (environ 940 de
haut), même un banc de 12 : trois colonnes sous le bandeau, la composition de
celui qui reçoit à gauche (480), la ligne du match, les temps forts, le match
en chiffres et le fil du match au milieu, la composition de l'autre à droite
(480).

- **Composition** : le terrain raccourci (voir « Terrain et maillot »), son banc
  dessous, dans la même carte, sans titre.
- **Banc** (`.halves`) : deux colonnes côte à côte, un trait entre elles, lues
  de haut en bas, la première la plus longue (9 remplaçants en 5 lignes, 12 en
  6). Chacune est un tableau : « Remplaçant », « Entrée », « Note ». Le
  remplaçant par son nom court, comme sur le terrain, son nom entier en
  infobulle, puis ce qu'il a fait (ses buts, ses cartons) ; celui qui n'est pas
  entré est atténué, ni entrée ni note. Un camp sans remplaçant n'a pas de banc.

### Temps forts d'un match

Les buts, les blessures, les cartons rouges et les penaltys manqués, dans
l'ordre du match (`.highlight-row`) : la minute au milieu, en chiffre clé (16,
`--display`, `--accent-text`), chaque fait au bord de son camp, celui qui reçoit à
gauche.

- **Une ligne de 26 par fait**, quels que soient les noms : aucune ne passe sur
  deux lignes.
- **Marques** (`.marks`), au bord : le ballon (`--ball`), la croix de la
  blessure, le carton rouge ; un carton jaune puis le rouge pour un deuxième avertissement ;
  le ballon barré de rouge (`.mark.missed`) pour un penalty manqué. Aucun libellé
  (« But », « Blessure ») : la marque le dit, son infobulle aussi.
- **Joueur** : son nom court (voir « Joueurs »), en 600 à l'encre forte.
- **Passeur** : après le buteur, en 11, atténué, sans mot ni signe. Quand les
  deux ne tiennent pas, il est coupé avant le buteur. Un but sur penalty porte
  « pen. » à sa place, de la même façon.
- **Infobulles** : le nom entier du joueur ; « Passe de » et le nom entier sur le
  passeur ; « Sur penalty » sur « pen. » ; « Penalty arrêté » ou « Penalty manqué »
  sur le ballon barré.

### Match en direct

Tout tient dans la fenêtre, sans barre de défilement ni sa place : trois
colonnes, l'équipe à gauche (de 300 à 400), le match au milieu, la journée à
droite (de 340 à 500). Ce qui s'allonge défile dans sa carte : l'effectif, les
temps forts au-delà d'un tiers de la hauteur, les matches de la journée, le
classement. Sous 1100 de large ou 600 de haut, la page défile.

- **Bandeau** (`.hero.duel.compact`) : celui du compte rendu, en 64, au-dessus
  du terrain et de sa seule largeur ; écussons en 40, noms en 26, sans lien. Un
  écusson sans disque garde ses proportions et reste dans le bandeau. La
  minute (`.live-clock`), en 20 sur une case de 40 aux coins de 6, se tient sur
  la tuile, à 12 avant le score : sur l'accent pendant une action, sur
  `--panel-2` quand le chronomètre défile ; « MT » à la mi-temps, « Fin » au
  coup de sifflet. Un but fait basculer le chiffre du camp qui marque, et la
  tuile s'entoure un instant de l'accent.
- **Terrain** : aussi large que la hauteur de la fenêtre le permet. Pendant une
  action, les pastilles du résumé, sans trace du ballon ; pendant un temps mort,
  les deux équipes à leur formation, celui qui reçoit à gauche attaquant vers la
  droite, chaque joueur avec son maillot et son bloc (voir « Terrain et
  maillot »), et en haut à chaque bord la formation et la mentalité de son camp,
  sur l'étiquette sombre. Son équipe y est telle que les changements prévus la
  laissent (voir « Changer son équipe »). Le terrain ne porte pas d'autre
  texte : « 2e mi-temps » et « Continuer » se posent au bas du terrain.
- **Fil** (`.ticker`) : une ligne de 44 collée sous le terrain, aux coins du
  bas de 8, à la couleur du camp qui a l'action et dans son encre : l'écusson en
  26, la minute en 16 (`--display`), puis le commentaire en 16 / 600 sur une
  ligne. Entre deux actions, neutre (`--strong`), « Jeu en cours » et une barre
  de l'accent qui court à son bout ; un carton, une blessure ou un changement y
  passe un instant aux couleurs de son camp.
- **Frise** (`.frise`) : les 90 minutes sur une ligne de 28 sous le fil ; le
  temps joué en trait plein de 4 (`--ink-2`), la mi-temps en pointillé, la
  minute en trait de l'accent ; au-dessus les buts, cartons, blessures et
  entrées de celui qui reçoit, dessous ceux de l'autre, avec leurs marques.
- **Commandes** : lecture, « action suivante » (le temps mort défile d'un coup),
  les deux vitesses (voir « Curseur ») retenues d'un match à l'autre, la 3D, les
  occasions montrées, et « Fin du match » au bout. Espace et → font lecture et
  action suivante, T mène à la tactique, Entrée valide les changements prévus.
- **Fil du match** (`.live-flow`) : sous les commandes, dans toute la hauteur
  qu'elles laissent, la carte du compte rendu tenue à jour (voir « Fil du
  match »). Avec moins de 88 pour son graphique, elle passe en tête du match en
  chiffres, en 104 de haut (`.flow-mini`).
- **Équipe** : un choix des deux camps en tête de la carte, puis
  « Sur le terrain » (les changements restants au bout de l'intertitre, ou la
  formation de l'adversaire) et « Remplaçants », les sortis en dernier. Une
  ligne de 30 par joueur (`.squad-row`) : maillot de 24 et son numéro, poste,
  nom entier, buts, cartons, blessure, entrée ou sortie (`▲ 70′`), note ; pour
  son équipe, la fatigue en jauge de 32 et en %, en jaune à partir de 50 %, en
  rouge à partir de 70 %, et le conseil de l'adjoint (`.advice`, 22, aux coins
  de 4) : un ⇄ sur le lavis d'avertissement devant celui qu'il ferait sortir
  (sa ligne sur `--warn-soft`), sur le lavis vert devant celui qu'il ferait
  entrer ; l'infobulle dit pourquoi, un clic prépare ce changement. La fatigue
  de l'adversaire ne se lit pas.
- **Changer son équipe** : sans fenêtre, là où elle se montre. Une ligne glissée
  sur une autre (ou choisie d'un clic, sur `--panel-3`, puis l'autre) : un
  remplaçant sur un joueur du terrain le remplace à son poste, deux joueurs du
  terrain échangent leurs postes. Pendant un temps mort, ses maillots du terrain
  reçoivent de même un remplaçant venu de la liste, ou un autre de ses maillots.
  La cible sous le pointeur est cerclée de l'accent (2 ; sur le terrain, comme
  un maillot choisi, voir « Terrain et maillot »), ce qu'on déplace pâlit. Un
  changement prévu se lit sur ses lignes : le sortant estompé et barré, ▼ ; juste
  après lui l'entrant sur `--good-soft`, ▲, et × (`.advice.undo`, sur le
  panneau) qui le renvoie au banc ; un poste changé cerclé de l'encre de
  l'accent (`.position.moved`). Sur le terrain, l'entrant porte son maillot à la
  place du sortant, son bloc sur `--good`. Le compte des changements restants
  les déduit.
- **Tactique** : sous l'équipe, la formation dans une liste et la mentalité dans
  un choix. Tant qu'un changement est prévu, « Annuler » et « Valider » à droite
  de l'en-tête, précédés en rouge (11 / 600) de ce que les règles refusent
  (`.tactic-problem`, le reste dans l'infobulle). Valider envoie le tout, qui
  s'applique à la fin de l'action en cours : en attendant, une barre de l'accent
  sur une piste de 40, « À la fin de l'action » (`.waiting-status`) et
  « Annuler », les ▲ ▼ qui battent. Pendant un temps mort ou à la mi-temps, tout
  de suite. Sur une blessure ou un carton rouge de son équipe, le match
  s'arrête : « Reprendre » continue sans changement.
- **Temps forts** : une carte, « Les temps forts », les lignes du compte rendu
  (voir « Temps forts d'un match »), cartons jaunes compris : les buts d'abord,
  puis 12 d'espace et un filet `--line`, puis les autres faits groupés par sorte
  (cartons, blessures, penaltys manqués), chaque groupe dans l'ordre du match,
  un filet entre deux. Ni intertitre, ni score : il est au bandeau. Un but qui
  vient d'être montré lave sa ligne de `--own-row`, un instant.
- **Le match en chiffres** : chaque part glisse vers sa nouvelle valeur (0.8 s)
  et le chiffre qui change passe un instant sur le lavis du club dirigé
  (`--own-row`), à l'encre de l'accent.
- **Journée** : le match du joueur en tête, sur `--own-row`, puis les autres,
  qui défilent ; un score qui change s'allume. Au pied de la carte, sur neuf
  lignes, le classement tel qu'il serait à la minute montrée (championnat ou
  phase de ligue d'une coupe d'Europe), son en-tête fixé, ouvert sur la ligne du
  club ; chaque place marquée comme sur l'écran Classement (voir « Classement ») ;
  devant le club, les places gagnées (▲, `--good`) ou perdues (▼, `--bad`)
  depuis le début de la journée, en 10. Dans une fenêtre basse, le classement
  descend jusqu'à cinq lignes pour laisser voir quatre matches.
- **Le but** (`.goal-burst`) : le jeu s'arrête 4 s, quelle que soit la vitesse.
  Un voile, puis une bande aux couleurs du buteur, cerclée de sa seconde
  couleur, traverse le terrain : son écusson en 96, « BUT » en `--fs-goal`, les
  trois lettres frappées l'une après l'autre ; la bande encaisse la dernière,
  puis un reflet la traverse. À côté, son maillot en 48 et son nom en 40, le
  passeur dessous en 16 (« Sur penalty » pour un penalty). Le score n'y est
  pas : il change au bandeau.
- Rien de cela ne bouge sous `prefers-reduced-motion`.

### Match dans une liste

Le tour d'une compétition, la journée d'un championnat, les matches d'un pays,
le tirage d'une coupe dans les actualités s'écrivent avec un seul composant
(`.fixture`) : face à face, celui qui reçoit à gauche. Le calendrier d'un club
ou d'une sélection, qui se lit de son côté (ses buts d'abord, le score coloré V,
N ou D), garde sa ligne propre.

- **Camps** : le nom de celui qui reçoit puis sa pastille, le score, la pastille
  de l'autre puis son nom. Les deux pastilles, les drapeaux pour des sélections,
  touchent le score. Un nom trop long est coupé, jamais sa pastille.
- **Score** : en chiffre clé (16, `--display`) sur un fond de 22 (`--panel-2`),
  lien vers le match. Le chiffre du vainqueur est à l'encre forte, l'autre
  atténué ; à égalité, les deux sont atténués. Avant le match, « À venir »,
  atténué, sans fond.
- **Vainqueur** : son nom en 700, à l'encre de l'accent (`--accent-text`) ; celui
  du battu est en retrait, à l'encre courante (`--ink-2`). À égalité et avant le
  match, les deux noms s'écrivent comme tout nom. Dans un aller-retour, c'est le
  club qualifié qui est en gras, même battu au match retour ; sur le match
  aller, personne tant que le retour n'est pas joué, puis le qualifié.
- **Ce qui a départagé** : un étage sous le score, collé à lui (18, bordé, sur le
  fond de la carte). Au retour d'un aller-retour, le cumul, sans mention, même à
  égalité : « 3 – 2 ». Une séance de tirs au but y ajoute « (TAB) », en 10,
  du côté de celui qui l'a gagnée : « (TAB) 3 – 3 » quand c'est celui qui reçoit,
  « 3 – 3 (TAB) » sinon ; le score de la séance est dans son infobulle. Après un
  match sans aller, « (TAB) » est seul sur l'étage, rangé de son côté. Les
  chiffres de l'étage sont à la même encre, sans gras ; ceux du match passent
  alors à l'encre courante (`--ink-2`), comme ceux d'un match aller, qui ne
  départage rien.
- **Match retour à venir** : sous « À venir », le même étage porte le score de
  l'aller, seul, sans mention, dans l'ordre de la ligne, celui qui reçoit
  d'abord : « 0 – 2 ». Sans fond au-dessus, il est bordé sur ses quatre côtés.
- **Buteurs** : sous chaque camp, en 11 / 14, atténués : le nom court (voir
  « Joueurs »), lien vers le joueur, puis la minute de chaque but suivie d'une
  apostrophe, un point médian entre deux buteurs (« Mendes 12’ · Barcola 58’ 71’ »).
- **Club dirigé** : son match a le fond `--own-row`, sur toute la ligne. Son
  vainqueur s'y lit comme sur les autres : même graisse, même encre.
- **Mesures** : une ligne seule a 26 ; des buteurs ou un étage lui donnent une
  seconde ligne et 4 de marge. La colonne du score a 56, et 88 sur toutes les
  lignes d'une liste où un match a un étage : les noms restent alignés d'une
  ligne à l'autre.
- **Coupe d'un pays** (`.tie`) : la division de chaque club aux deux bouts de sa
  ligne (D1, D2), en 10, atténuée.
- **Coupe d'Europe** : le drapeau du pays de chaque club, du côté extérieur de son
  nom (voir « Clubs et pays ») : les pastilles touchent toujours le score.
- **Tableau d'une coupe** : les mêmes règles. Le nom du qualifié est en 700, à
  l'encre de l'accent, ses chiffres à l'encre forte ; le nom de l'éliminé à
  l'encre courante, ses chiffres atténués. La case du match du club dirigé a le
  fond `--own-row`.

### En-tête d'une compétition

La page d'un championnat, d'une coupe nationale, d'une coupe d'Europe, de l'Euro,
de la Coupe du monde ou de la Ligue des nations s'ouvre sur le bandeau d'un club
(`.hero`), ses onglets dessous. Elle n'a pas de ligne de titre.

- **Emblème** (`.hero-emblem`) : une coupe d'Europe, l'Euro, la Coupe du monde et
  la Ligue des nations ont le leur, seul sur le bandeau, sans disque, dans une boîte de 72 quelle que
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
- **Navigation** : à gauche du bandeau, celle d'un club ou d'un joueur (voir
  « Navigation d'un bandeau »). Elle passe d'une coupe d'Europe à l'autre en
  gardant l'onglet ouvert et la saison, d'une compétition des sélections à
  l'autre (Coupe du monde, Euro, Ligue des nations) en gardant l'onglet, les
  qualifications d'un tournoi répondant à la phase de ligue d'une Ligue des
  nations, d'une compétition d'un pays à l'autre (ses championnats du premier
  au dernier, puis sa coupe). Dans sa liste, chaque compétition suit sa
  pastille.
- **Saison** : le pas de saison ferme la rangée d'onglets d'une coupe d'Europe,
  du tableau d'une coupe nationale et d'une compétition des sélections, dont il
  parcourt les éditions par leur seule année ; son onglet Historique, qui les lit
  toutes, n'en a pas. Un championnat n'en a pas.

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
| Ligue des nations (LN) | Bleu marine `#0b1e3f` | Cyan `#00a6d6` | `#009aca`, le cyan foncé pour se lire |
| Championnat, coupe nationale | Les deux couleurs du maillot de la sélection du pays, avec les règles d'un club (un maillot proche du blanc cède la place à sa seconde couleur) | | Comme sur la fiche de la sélection |

Les emblèmes sont des images (`web/emblems/`), en blanc pour les coupes
d'Europe, à leur métal pour les trophées de l'Euro, de la Coupe du monde et de
la Ligue des nations.

### Classement d'une ligue

L'onglet Classement d'un championnat tient en trois colonnes sous le bandeau :
le classement (680 au plus), puis ses attaques et ses défenses côte à côte, à
la même hauteur (« Classement de clubs ») ; sous elles, sur les deux mêmes
colonnes, les buteurs et les passeurs de la saison (« Classement de joueurs »,
cinq lignes chacun). Pas de tuiles : ce que le classement ne dit pas est dans
ces quatre cartes.

- **Vues** : le choix (`.segmented.small`) ferme l'en-tête de la carte du
  classement : Général, Domicile, Extérieur, 5 derniers. Le général s'ouvre ;
  une autre vue est dans l'adresse (`vue`). Domicile et Extérieur ne comptent
  que les matches du club à domicile ou à l'extérieur, 5 derniers que ses cinq
  derniers matches. Seul le général place les clubs : une autre vue écrit ses
  rangs sans pastille, la ligne du club dirigé seule colorée.
- **Attaques et défenses** : celles de la vue montrée, les dix premières :
  le plus de buts marqués, le moins de buts encaissés.
- Sous 1330 de large, le classement prend toute la largeur, les quatre cartes
  dessous sur deux colonnes.

### Derniers et prochains matches

Les onglets Derniers matches et Prochains matches d'une compétition posent
chaque partie dans sa carte, comme l'onglet Classement : les cartes à 8 l'une de
l'autre, alignées en haut, chacune arrêtée à ses lignes. Ni trait entre elles,
ni blanc sous une colonne plus courte que sa voisine. Le classement et les
buteurs ne sont pas ceux du tour : ils ont leur titre à eux.

- **Matches** : sous le nom du tour (« Journée 2 », « 8es de finale »), sans sa
  date, sur 460 au plus.
- **Classement** : titré de la dernière journée qu'il compte (« Classement ·
  1re journée », voir « Classement »), celle d'avant le tour sur Prochains
  matches ; 680 au plus, jamais plus étroit que ses colonnes.
- **Buteurs** : les dix premiers de la compétition sur la saison (#, joueur,
  club, buts), dans une carte « Buteurs » qui prend le reste de la largeur,
  jamais moins que ses colonnes ; absente avant le premier but. Les matches
  cèdent la place qui manque.
- **Notes** : sous les buteurs, à 8, dans la même colonne, une carte « Notes » :
  les dix meilleures notes moyennes de la saison (#, joueur, club, note à deux
  décimales), parmi les joueurs notés dans au moins la moitié des matches du
  plus noté ; absente avant le premier match. Les sélections n'en ont pas.
- **Sous 1700 de large**, les buteurs passent sous les matches, le classement à
  côté d'eux ; sous 1330, tout s'empile.
- **Tour à élimination directe** : sans classement, ses matches sur deux
  colonnes de leur carte, les bandes d'une ligne à l'autre, un match seul (une
  finale) sur les deux ; les buteurs à côté sur un tiers de la largeur. Sous
  1330, ils passent dessous, sur la moitié ; sous 950, les matches tiennent une
  colonne.
- **Groupes** (qualifications et phase de groupes des sélections, phase de ligue
  d'une Ligue des nations) : dans la carte du tour, chacun sous son intertitre,
  ses matches puis son classement réduit ; les buteurs dans leur carte, sur 360
  à côté, dessous sous 1330.
- Sans buteurs, la carte d'un tour à élimination directe ou des groupes prend
  toute la largeur.

### Compétitions des sélections

La page Sélections nationales donne une colonne à chaque compétition, dans l'ordre
de la navigation de leurs bandeaux : Coupe du monde, Euro, Ligue des nations. La
liste des nations prend toute la largeur dessous.

- **Bandeau** (`.hero.narrow`) : celui de son en-tête, 88 de haut, à ses couleurs
  et sur son fond, son emblème puis son nom ; le nom à la taille d'un titre de page
  (26 / 32, en capitales, `--display`), comme sur les panneaux de l'accueil, pour
  tenir dans la colonne ; l'écharpe repoussée à droite de la colonne. Ni navigation,
  ni tuile. Il ouvre la page de la compétition tout entier : sous le pointeur, le
  voile de son encre, sans soulignement.
- **Faits** (`.fact`), sous le bandeau : le tenant du titre, sa sélection après son
  drapeau ; l'édition en cours, son année et sa phase, lien vers elle, et sa
  prochaine journée, le tour écrit court (J4, Demi-finales) puis le jour ; à
  défaut, la prochaine édition et le jour de son tirage.
- **Palmarès** : sous un intertitre (`.section-title`), ses finales, la plus récente
  d'abord (voir « Finales et parcours »).
- **Nations** : le drapeau et le nom, la fédération, la force sur 100 après sa jauge,
  les titres dans chaque compétition, une colonne par pastille (CM, EU, LN), le nom
  de la compétition en infobulle, « — » atténué sans titre ; enfin la dernière
  édition jouée après sa pastille, son année et le tour atteint (« ✦ Vainqueur »).
  Le choix de la fédération est un `.segmented.small` dans l'en-tête de la carte.

### Finales et parcours

Ce qu'une compétition garde de ses éditions, sur son onglet Historique et sur
Sélections nationales.

- **Une finale** s'écrit du côté de son vainqueur : l'édition (lien vers sa phase
  finale), le vainqueur en 600, le score centré, le finaliste. Le score
  (`.final-score`) est un lien vers le match ; après une séance de tirs au but,
  « (TAB) » le précède, en 10, atténué, le score de la séance dans son infobulle :
  « (TAB) 1 – 1 ».
- **Le parcours d'une nation** dans une édition (`.run`) : une colonne par édition, de
  la première à la dernière, centrée. ✦ le titre, en 700 à l'encre de l'accent,
  comme le vainqueur d'un match ; F la finale, en 600 à l'encre forte ; 1/2, 1/4,
  1/8 le tour où elle est tombée ; Gr. la phase de groupes ; « — » atténué,
  absente. Les mots entiers sont dans l'infobulle.
- **En Ligue des nations**, la case dit la division jouée (A à D), son parcours en
  phase finale à la place du A (✦, F, 1/2), puis, une fois les groupes joués, une
  flèche en 10 : ▲ en vert pour la montée, ▼ en rouge pour la descente.
- **Ordre** : les meilleurs parcours d'abord, titres, finales, demi-finales, quarts,
  puis les participations (en Ligue des nations, les éditions en division A, puis B,
  C et D) ; toutes les colonnes se trient.

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

### Carte repliable

Une carte dont une partie est secondaire la replie (`.card.fold`) : elle montre
l'essentiel, et son en-tête entier montre le reste (`.card-head.toggle`).

- **En-tête** : son titre, puis, à son bout, une flèche nue (`.toggle-arrow`) :
  le chevron de 16 au trait d'une icône (1.7), en `--muted`, vers le bas quand
  la carte est repliée, retourné quand elle est ouverte. Ni bouton, ni bordure,
  ni libellé.
- **Sous le pointeur** : tout l'en-tête prend `--panel-3` et la main ; la flèche
  garde sa couleur.
- **Repliée** : ce qui est secondaire (`.fold-more`) ne prend aucune place, et
  rien ne dit ce qui attend.
- **Le choix est gardé**, carte par carte : d'un match à l'autre, après un
  rechargement.
- Une carte dont l'en-tête porte déjà un lien ou des commandes ne se replie pas
  ainsi.

| Carte | Montré | Replié |
|---|---|---|
| Le match en chiffres (compte rendu, direct) | Buts attendus, tirs, tirs cadrés, possession | Passes et précision des passes, corners, fautes et hors-jeu (pour un match qui les compte ; un match plus ancien montre ses coups francs), cartons jaunes, cartons rouges |

## Terrain et maillot

Un seul terrain et un seul joueur, sur tous les écrans.

- **Terrain** (`.pitch`) : proportions 68 × 88, douze bandes de tonte, lignes de
  1.5 à 8 du bord. L'équipe y attaque vers le haut.
- **Terrain raccourci** (`.pitch.short`) : 68 × 76, celui du compte rendu d'un
  match. Mêmes bandes et lignes, resserrées ; l'attaque se tient dans la surface
  d'en face, sans gazon vide au-dessus d'elle, le bloc du gardien finit à 12 de
  sa ligne.
- **Terrain réparti** (`.pitch.spread`) : 68 × 88, celui de l'équipe-type.
  Seules les lignes de sa formation, sur toute la hauteur : les maillots de
  l'attaque à 12 de la ligne de but d'en face, le bloc du gardien à 12 de la
  sienne, les lignes entre elles à égale distance, quelle que soit la hauteur
  du terrain.
- **Maillot** (`.kit-shirt`) : 32, carré, les manches à l'horizontale. Il porte
  le motif du maillot domicile du club ou de la sélection (son modèle dans le
  CSV, un des 57 de `web/kits/templates`), redessiné à plat dans la silhouette,
  sans perspective ni tissu : des aplats droits, nets à toutes les tailles. Le
  corps est dans la première couleur, blanc compris ; les zones du motif dans la
  deuxième et la troisième, comme sur la tenue complète ; le col et les
  poignets dans la troisième. Une couleur absente reprend la précédente ; un
  modèle inconnu est l'uni. Le gazon n'est pas la page : la règle de la
  pastille, qui passe à la seconde couleur quand la première est proche du
  blanc, ne s'y applique pas. Le corps arrondit son bord et le motif reste
  dedans ; un contour noir à 20 % et une ombre le détachent du gazon. Le numéro
  du joueur est écrit dessus (`.kit-shirt.number`), en 13, dans l'encre lisible
  sur le corps ; sur un motif qui passe sous le numéro (`.kit-shirt.patterned`),
  en blanc cerné de l'encre la plus sombre, comme sur le disque du replay 2D. À
  défaut de numéro (une place vide, un renfort temporaire, le joueur d'une
  sélection), son poste, en 10 ; sur les aptitudes d'un joueur, chaque maillot
  porte le poste qu'il montre. La couleur de poste reste dans les listes, pas
  sur le terrain.
- **Hors du terrain** : dans un message, le maillot du club, en 32, porte le
  numéro qu'un joueur y prend ; celui qu'il quitte est voilé à 45 %
  (`.kit-shirt.former`), une flèche atténuée entre les deux (`.shirt-change`).
- **Buts** (`.kit-goals`) : en haut à droite du maillot, pas dans le bloc. Un
  ballon de 10 par but (`--ball`) avec l'ombre du maillot. Le premier est
  posé sur le bout de la manche droite, 5 sur le maillot et 4 au-dessus ; chaque suivant se glisse à
  sa droite, 3 derrière le précédent : le premier reste entier, devant.
- **Bloc** (`.player-block`) : sous le maillot ; autour, rien que les buts. Des
  lignes de 16 sur l'étiquette sombre (`--pitch-label`, noir à 70 %), autant
  pour tous les joueurs d'un terrain : une ligne vide garde sa hauteur. D'abord
  le nom, puis la note et ce que le joueur a fait. Le joueur se tient par son
  maillot : les maillots d'une ligne restent à niveau, quoi qu'ils portent
  dessous.
- **Note** (`.block-note`) : écrite dans sa couleur, éclaircie pour se lire sur
  le noir, sans pastille.
- **Faits** : à 8 de la note, 4 entre deux. Les cartons, la blessure, la sortie
  (« ▼ 65′ ») toute en blanc : seule une note se lit en rouge. Les buts sont au
  maillot. Sur la composition, la flèche de la forme d'au moins ±5 %, puis
  l'affinité sous 20.
- **États** : place vide en pointillé, son bloc sans fond ; joueur choisi cerclé
  de l'accent, son bloc sur l'accent ; joueur indisponible cerclé de rouge, son
  bloc sur le rouge ; joueur sans couleurs en gris. Sur les aptitudes d'un
  joueur, son poste principal est cerclé d'un blanc voilé.

| Écran | Première ligne | Seconde ligne |
|---|---|---|
| Composition | Nom | Note au poste en étoiles, forme, affinité |
| Match | Nom | Note du match, faits du match |
| Direct · tactique | Nom | Note du match, faits du match |
| Joueur · aptitudes | Note au poste en étoiles, affinité | — |
| Présentation d'un club · équipe-type | Nom | Matches / buts et le ballon, en bleu pâle ; avant le premier match, note au poste en étoiles |
| Présentation d'une sélection · équipe-type | Nom (le poste sur le maillot) | Matches / buts et le ballon, en bleu pâle ; avant le premier match de l'édition, note au poste en étoiles |

Les aptitudes d'un joueur n'ont pas de liste à côté de leur terrain : le bloc de
chaque poste en tient lieu, sur un terrain de 280 de large.

### Match en 2D

Chaque joueur de champ est une pastille ronde taillée dans le torse de son
maillot : le motif et les couleurs du CSV (`/kits/{id}.png`, sans écusson),
rayures, cerceaux ou écharpe compris. Son numéro est blanc, cerné de `#0b121a`
(`.replay-player .number.outlined`), pour se lire sur n'importe quelle bande ;
le terrain garde ses couleurs dans le thème sombre, le trait aussi. Le gardien
reste uni, à la couleur qui le distingue des deux camps, son numéro à l'encre
de cette couleur. Quand les deux maillots domicile sont trop proches, le camp
qui reçoit garde le sien et l'autre passe à sa tenue extérieure, motif et
couleurs compris ; si elle aussi se confond, ou s'il n'en a pas, il repasse à
une pastille unie de sa seconde couleur, ou d'une couleur neutre. Le cercle
autour de la pastille est à la seconde couleur de la tenue portée. La vue 3D,
le fil du commentaire et la bande d'un but prennent les couleurs de cette
tenue ; le bandeau du match garde celles du club. Le ballon ne laisse aucune trace
sur le terrain : ni passe, ni centre, ni conduite, ni tir.

### Match en 3D

La vue du match reprend les couleurs et les numéros des maillots dans un stade
éclairé, cadré depuis la tribune comme une retransmission télévisée. Les joueurs
ont des volumes anatomiques lisibles, des articulations et des matières mates ;
le tissu, la peau, les chaussures et les gants se distinguent par leur relief
et leur réponse à la lumière. Les gestes suivent le ballon : appuis des courses,
préparation et accompagnement des passes et des tirs, contrôles, têtes, plongeon
bas ou haut puis reprise d'appui du gardien. Ces animations procédurales restent
calées sur les contacts et le temps du résumé, sans changer les déplacements ni
le résultat du match. La pause fige l'image, joueurs, ballon, public et caméra
compris ; les commandes autour du terrain gardent les composants de la charte.
Les joueurs ont des phases de foulée et des styles de course individuels,
stables d'une scène à l'autre. La marche, la course et le sprint se distinguent
par les appuis, la suspension, le retour du talon et le mouvement opposé des
bras. Les pieds se déroulent au sol, le bassin absorbe l'atterrissage, le buste
accompagne l'accélération et les virages. À l'arrêt, les mouvements restent
discrets et décalés entre joueurs. Le spécimen rapproché de ces allures est
`tests/fixtures/replay-locomotion.html`.

## Graphiques

Un texte n'est jamais dans la couleur de ce qu'il mesure : chiffres et libellés
gardent les encres, la couleur reste à la barre. Seule exception, le montant au
bout d'une barre des mercatos, dans le ton foncé de sa série (voir « Mercatos
d'un club »).

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
- La carte se replie sur ses quatre premières lignes ; son en-tête montre les
  autres (voir « Carte repliable »).
- Au direct, les parts glissent vers leur nouvelle valeur et le chiffre qui
  change s'allume (voir « Match en direct »).

### Fil du match

`.match-flow` : les buts attendus de chaque camp ajoutés tir après tir, sous le
match en chiffres. Dessiné en SVG à la largeur de sa carte (`.club-chart`).

- **Traits** : un par camp, de 2, en marches : plat entre deux tirs, une marche
  de la valeur du tir à sa seconde. Chacun dans la couleur de son camp dans un
  graphique, comme « Deux camps comparés ».
- **Buts** : un ballon (`.cc-goal`, 10 : fond du panneau cerclé de l'encre
  forte) en haut de la marche du tir qui est entré.
- **Axes** : l'ordonnée en buts attendus, une ligne `--row-line` par but, de 0
  au total le plus haut arrondi au-dessus (1 au moins) ; l'abscisse en minutes
  (0′, 15′… 90′), la seconde mi-temps comptée depuis son coup d'envoi, son
  sifflet en pointillé (`.cc-half`, `--line`). Graduations en 13 `--muted`.
- **Totaux** : au bout de chaque trait, en 16 `--display` à l'encre forte, 16
  au moins entre les deux, le plus haut au-dessus.
- L'unité dans l'en-tête de la carte (`.card-hint`) : buts attendus cumulés.
  Un match joué avant que ses tirs soient conservés n'a pas la carte.
- **Au direct** (`.live-flow`) : sous les commandes, le tracé a la largeur de
  la frise, ses minutes sous les siennes, et l'axe garde les 90 minutes quel que
  soit le temps joué. Les traits s'arrêtent à la minute montrée, tracée en trait
  de 2 à l'encre de l'accent (`.cc-now`) comme sur la frise ; les totaux sont au
  bout des traits, à cette minute. Les valeurs de l'ordonnée s'écrivent dans le
  tracé, sous leur ligne, au bord gauche. Un tir n'y entre qu'une fois montré,
  son ballon qu'une fois le but compté.

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

`.cc` : le rang d'un club en championnat, saison après saison ; le parcours
d'une sélection, édition après édition. Écrit en HTML sur ses colonnes, le
trait seul est dessiné.

- **Colonnes** : une par saison, ou par année pour une sélection, de 44 au
  moins. Peu de saisons remplissent la carte ; plus qu'elle n'en tient, le
  graphique défile, ouvert sur les dernières. Le nom des étages à gauche (112 ;
  136 pour une sélection) et celui des places à droite (96) ne défilent pas.
  Sous les colonnes, la saison en deux années courtes (« 27-28 »), l'année
  d'une sélection ; celle en cours en 600 à l'encre forte.
- **Rang** : écrit dans son point, un disque de 22 en `--series-1`, le chiffre
  en 11 / 700 blanc, cerné du fond. Un titre est sur l'accent, cerclé de
  `--accent-text`. La saison en cours est un disque ouvert, cerclé de
  `--series-1`, au bout d'un trait pointillé. L'infobulle dit la saison, le
  championnat et la place.
- **Trait** : 2, en `--series-1`, entre deux saisons qui se suivent. Une
  saison hors des championnats simulés laisse sa colonne vide et interrompt le
  trait.
- **Étages** : un par division où le club a joué, la plus haute en haut, son
  nom à gauche. Une seule division occupe 192 de haut, chaque division de plus
  en ajoute 64 ; 24 séparent deux étages, un trait `--row-line` en leur milieu.
  Dans chaque étage, les places de la division sont teintées comme un
  classement les marque : Europe en `--info-soft`, montée en `--good-soft`,
  relégation en `--bad-soft`. Leur nom est à droite, en `--muted`.
- **Seconde série** : la réputation à l'ouverture de chaque saison, sous les
  étages, sur les mêmes colonnes : 72 de haut, un trait de 2 en `--series-2`,
  sa valeur en chiffre clé à chaque bout, sur un point de 8.
- **Sélection** : deux étages, les tournois (Euro, Coupe du monde) puis la
  Ligue des nations, chacun en sept niveaux nommés à droite (du titre aux
  qualifications ; du titre à la Division D). Le disque porte le code de
  l'édition (EU, CM, LN) en 10 ; la seconde série est la force de la sélection.

### Niveau au fil des mois

`.level-chart` : le niveau d'un joueur, en étoiles, mois après mois, dessiné à la
largeur de sa carte, sur 240 de haut, quelle que soit la place que la page lui
laisse.

- L'ordonnée en étoiles : une ligne `--row-line` par demi-étoile, pointillée
  entre deux étoiles, le nombre d'étoiles (« 3 ★ ») à chaque étoile, jusqu'à cinq.
- Un trait de 2 en `--series-1`, un point par mois : le niveau tel que le club
  dirigé le lisait ce mois-là ; l'abscisse est le temps.
- Au-dessus, la fourchette du potentiel en bande pâle (`.band`,
  `--series-1-soft` voilé) : elle se resserre avec l'âge et à mesure qu'il joue.
- La pastille du club où il jouait ce mois-là, en 12 (`.kit-dot`, grise
  sans club), cerné du fond, à l'ouverture de chaque saison et au dernier mois.
- Les étoiles du premier et du dernier point s'écrivent à côté d'eux, jamais un
  chiffre ; le mode debug les donne dans l'infobulle des points.
- L'ordonnée et les dates sont en `--muted`, en 13 : du texte, pas du dessin
  étiré.

### Radar

`.radar` : les six composites d'un joueur de champ, en tête de ses attributs
(`radar`, `web/ui.js` ; `compositesGroup`, `web/player.js`). Il remplace leur
liste sur la fiche et dans l'aperçu d'un joueur ; la vue Jeu des listes garde
ses colonnes, et un gardien, qui n'a que deux composites, sa liste.

- **Hexagone à plat** : deux coins par rangée. L'attaque à droite, la défense
  à gauche, chaque phase face à son contraire, de bas en haut comme une action :
  Progr. et Déf. mil. en bas, Créat. et Déf. surf. au milieu, Frappe et Aérien
  en haut.
- **Dessin** : un anneau par étoile en `--row-line`, le cinquième en `--line` ;
  un rayon par coin, en `--row-line` ; la forme du joueur dans l'or des étoiles
  (`--star`, trait de 2, fond à 16 %), un point de 3 à chaque coin. Ni chiffre,
  ni étoile écrite : la forme dit le profil.
- **Noms** : courts (`COMPOSITE_ABBREVIATIONS`), en 13, à 4 de leur coin, en
  dehors du dessin ; le nom entier et ses pondérations en infobulle, la valeur
  sur 200 en plus en mode debug. Les codes de trois lettres (PRO, CRÉ…) restent
  aux en-têtes des tableaux. Sur la rangée du milieu, un nom de deux mots passe
  sur deux lignes, ce qui ne coûte pas de hauteur.
- **Poste** : un composite que le poste choisi demande, en 700 avec le point de
  l'accent, comme dans une liste. Les noms sont mesurés en 700 avec leur point :
  choisir un autre poste ne déplace rien.
- **Taille** : une colonne de 248 (`.radar-column`), 4 de marge, aussi haute
  que la plus longue colonne d'attributs à côté, jamais moins que les six lignes
  qu'il remplace. Le rayon est le plus grand que les noms laissent, le dessin
  décalé vers où ils laissent de la place : 73 à 1920 ; les trois autres
  colonnes y ont 160. Dans l'aperçu, le même radar, de 240, à la hauteur des six
  lignes qu'il remplace, au milieu de sa largeur.
- **Lecture** : l'image porte, pour un lecteur d'écran, chaque composite avec
  ses étoiles (« Progression 2 étoiles… »).

### Classement de joueurs

`.leader-bars` : des joueurs classés sur un chiffre (les buteurs, passeurs et
notes de la Présentation d'un club ; l'Historique classe les siens en tableaux).

- Une ligne de 26 par joueur : son rang, atténué, aligné à droite ; son nom, lien
  vers sa fiche ; une barre ; le chiffre, à droite, à l'encre forte.
- La barre a 8 de haut, son bout arrondi (4) ; sa longueur est la part du
  chiffre du premier de la liste, qui la remplit.
- L'unité est dans l'en-tête de la carte, à droite, en 11 atténué (`.card-hint`) :
  buts, passes, note moyenne.
- La barre est en `--series-1` ; en pâle (`.soft`, `--series-1-soft`) sur la
  Présentation. Sur la page d'un club, d'une sélection ou d'un joueur
  (`.club-page`), elle prend la couleur du club (`--club`), son pâle mêlé à
  45 % au panneau.
- **Joueur du club dirigé** : dans le classement d'une compétition (buteurs,
  passeurs, notes, cartons), en barres comme en tableau, sa ligne est sur
  `--own-row`, comme celle du club dirigé dans un classement de clubs. Pas sur
  la page d'un club, où tous les joueurs sont les siens.

### Classement de clubs

`.leader-bars.clubs` : des clubs classés sur un chiffre (les attaques et les
défenses d'un championnat).

- **Le premier en grand** (`.leader-lead`) : sur `--panel-2`, arrondi de 8,
  entre les marges de la liste ; le club après sa pastille (18), en 20
  `--display`, son chiffre à droite en 40 `--display`, et dessous, en 11
  atténué, ce qu'il vaut par match (« 1.9 par match »).
- **Lignes** : celles du classement de joueurs, le club après sa pastille, lien
  vers sa page ; la barre dans la couleur du club dans un graphique (voir « La
  couleur d'un club dans un graphique » : sa première couleur qui en est une,
  ramenée à sa clarté ; `--ink-2` sans couleur). La plus grande valeur de la
  liste remplit la barre : une défense se classe à l'envers (le moins de buts
  d'abord), sa barre la plus courte en tête.
- La ligne du club dirigé sur `--own-row`.

### Jauge, anneau

- **Jauge** (`.gauge`) : 40 × 4, à côté d'un chiffre (part d'un plafond,
  masse salariale) ; verte, jaune (`.warn`) ou rouge (`.bad`), ou dans la
  couleur de la note qu'elle dessine (`.graded`). La condition, la forme et le
  moral d'un joueur n'en ont plus : ils se lisent en paliers (voir « État,
  forme, moral »).
- **Jauge signée** (`.gauge.signed`) : une valeur qui va dans les deux sens part
  du milieu de sa barre, marqué d'un trait : verte vers la droite, rouge vers la
  gauche, vide quand elle ne change rien.
- **Anneau** (`.ring`) : 56, rempli à la part d'un plafond qui reste libre,
  écrite en son centre ; rouge quand il en reste 5 % ou moins (`.ring.full`).

### Cinq derniers matches

Ce qu'un joueur a fait aux cinq derniers matches de son club (`.recent`), dans une
colonne de liste : une barre de 10 × 18 par match, 3 entre deux, du plus ancien au
plus récent.

- **Joué** : la barre se remplit depuis le bas, à l'encre `--ink-2`, à hauteur des
  minutes jouées ; 90 la remplit, un remplaçant entré tard n'en a qu'un peu.
- **Sans jouer** : sur le banc, la piste vide (`--panel-3`) ; non retenu, un tiret
  (`.out`) ; blessé ou suspendu, la croix ou le carton rouge des faits de match
  (`.injured`, `.suspended`) ; avant le premier match du club dans la saison, rien
  (`.none`), la colonne garde sa largeur.
- **Chargé** (`.loaded`) : les barres passent au jaune de l'accent quand la charge
  du joueur dépasse son seuil (voir le manuel, « La condition physique »).
- L'infobulle donne la charge, puis un match par ligne : le jour, l'adversaire, la
  compétition, le score, ce que le joueur a fait et ses minutes. La colonne se trie
  sur la charge.

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

### Mercatos d'un club

`.mercatos` : ce qu'un club a dépensé et reçu en indemnités de transfert à
chaque fenêtre, saison après saison, à gauche de l'onglet Transferts ; un bloc
ouvre sa saison.

- Un bloc par saison, la dernière en tête : son nom et sa balance (recettes
  moins dépenses, signée, en vert ou en rouge) en 16 `--display`, puis une
  ligne de 26 par fenêtre, Été puis Hiver. Pas de balance par fenêtre.
- Un axe vertical `--ink-2` partage la ligne : les dépenses partent vers la
  gauche en `--series-1`, les recettes vers la droite en `--series-2`, en barres
  de 12 aux bouts extérieurs arrondis de 4. Chaque barre vaut son montant contre
  le plus gros de la partie.
- Le montant est au bout de sa barre, en 13 / 400, dans le ton foncé de sa
  série (`--series-1-deep`, `--series-2-deep`) ; rien pour un côté vide.
- La légende, Dépenses et Recettes en capitales de 11, est au-dessus des
  barres, de part et d'autre de l'axe.
- La saison montrée est sur le lavis du club (`--club-wash`), marquée de sa
  couleur (3) à son bord gauche ; une autre prend le fond sous le pointeur.
- L'hiver de la saison en cours, pas encore ouvert, garde son axe, en
  pointillé (`--line`).

### Étoiles

Le niveau et le potentiel d'un joueur ne s'écrivent jamais en chiffres : le
jeu les cache, chacun n'en voit qu'une estimation (le manuel, « Ce que l'on voit
d'un joueur »). Ils se lisent en étoiles (`.stars`), comme les notes sans
doute qu'on en rapproche : composites, note au poste, moyennes d'un club,
installations.

- **Cinq étoiles**, demi-étoiles comprises, de la demi-étoile aux cinq : chaque
  demi-étoile est une classe de niveau, aux seuils de la configuration
  (`attributs.etoiles`), plus serrés en haut de l'échelle.
- **Couleurs** : l'or de ce qui est sûr (`--star`), l'ardoise de ce qui n'est
  que possible (`--star-soft`), une étoile vide (`--star-empty`). L'or n'est ni
  une note ni un poste : les étoiles ne prennent pas la couleur de leur note,
  qui dirait la valeur qu'elles arrondissent.
- **Fourchette** : le potentiel s'écrit en or jusqu'à sa borne basse, en
  ardoise jusqu'à sa borne haute ; une estimation sans doute n'a que de l'or.
- **Tailles** : 12 dans un tableau (cinq étoiles, un pixel entre deux, 64 de
  large), 16 sur une tuile (`.big`, deux pixels entre deux), 8 sans écart sur un
  terrain, où l'ardoise et le vide s'éclaircissent sur le noir du bloc
  (`--star-soft-dark`, `--star-empty-dark`) ; sur le bloc d'un joueur choisi, à
  l'encre de l'accent.
- **Tri** : une colonne d'étoiles se trie sur ses étoiles, le potentiel sur le
  milieu de sa fourchette, jamais sur la valeur cachée.
- **Filtre** : une fourchette en demi-étoiles, Min. et Max. ; trois valeurs
  toutes prêtes (« ★★★ et plus ») ; posé, le bouton lit ses étoiles.
- **Infobulle** : aucune sur des étoiles, sauf en **mode debug** : coché dans
  Ma partie (« Valeurs exactes »), une pastille `.pill.debug` dans la barre du
  haut le rappelle, et l'infobulle donne l'estimation, la fourchette, la valeur
  réelle et l'erreur type, sur 200.
- **Installations d'un club** : sa note sur 20 en étoiles, une étoile tous les
  quatre points, à la demi-étoile la plus proche.

Deux mesures à part, qui ne sont pas des qualités :

- **Affinité à un poste** (`.fit`) : un disque de 12 rempli à sa part de 20,
  à la couleur de son palier, Naturel (20), Confirmé (15), Correct (10),
  Hésitant (5), Maladroit ; le mot dans l'infobulle. Sur un terrain, sous 20
  seulement.
- **Trait de la personnalité d'un club** (`.trait`, `.poles`) : ni bon ni
  mauvais, un mot, puis son cran de cinq entre deux pôles, plein à l'encre :
  Risque (Frileux, Prudent, Mesuré, Audacieux, Flambeur), Jeunes (Fermé,
  Réservé, Équilibré, Ouvert, Formateur), Patience (Pressé, Expéditif, Posé,
  Patient, Inflexible).

### État, forme, moral

L'état d'un joueur se lit en cinq paliers, sans chiffre, chacun son icône ;
dans une liste l'icône seule, le mot en infobulle ; sur sa fiche, l'icône et le
mot. Le mode debug ajoute le chiffre à l'infobulle.

| État | Icône | Paliers |
|---|---|---|
| Condition | `.cells` : cinq crans de 6 × 10, verts, jaunes ou rouges | Frais (95 %), Bon (85 %), Juste (75 %), Fatigué (60 %), Épuisé |
| Forme | `.arrow` : une flèche dans un rond de 16, tournée de 45° par palier, verte, grise ou rouge | Excellente (+10 %), Bonne (+3 %), Normale, Mauvaise (−3 %), Très mauvaise (−10 %) |
| Moral | `.face` : un visage de 16 à la couleur de son palier, la bouche de son humeur ; la flèche vers où il va et la cause après lui | Excellent (85 %), Bon (70 %), Correct (55 %), Bas (40 %), Au plus bas |

## Conventions d'écriture

### Nombres

Le séparateur décimal est le point, pour tous les nombres : notes, montants,
moyennes, buts attendus.

Des buts attendus s'écrivent avec un chiffre après le point, même ronds : 2.0,
pas 2.

### Fin de contrat

Dans une liste (effectif, Joueurs, « À surveiller », demandes de contrat), la fin
d'un contrat s'écrit de son mois et de son année : « juin 2027 » ; le jour entier
est dans l'infobulle. Sur une fiche, où la place ne manque pas, elle s'écrit en
entier : « 30 juin 2027 ». À moins de 12 mois, elle passe à l'encre `--warn` ; à
moins de 6 mois, à `--bad` (`contractCell`, `web/ui.js`).

### Saisons

Une saison s'écrit de ses deux années entières, une barre entre deux espaces :
2031 / 2032. Sous l'axe d'un graphique qui en aligne plus de quatre, en deux
années courtes : 31-32. Une édition des sélections porte son nom et l'année de sa
phase finale : Euro 2032.

### Minutes

Une minute de match s'écrit comme à la télévision : la minute en cours, suivie
d'un prime (14′). De 1′ à 45′, puis 45+1′, 45+2′… dans le temps additionnel de la
première mi-temps ; la seconde repart de 46′ à la reprise, quel qu'ait été ce
temps additionnel, jusqu'à 90′, puis 90+1′… Partout la même : temps forts,
marques des joueurs, buteurs sous un score, compteur du résumé et du direct
(`matchMinute`, `web/ui.js` ; `goal_minute`, `src/api/rounds.py`).

### Notes

| Donnée | Écriture | Exemple |
|---|---|---|
| Note d'un match | Un chiffre après le point | 7.8 |
| Note moyenne d'une saison | Deux chiffres après le point | 7.81 |
| Niveau, potentiel, note au poste, composite | En étoiles, jamais en chiffres (voir « Étoiles ») | ★★★½ |
| Attribut, affinité | Entier, sur 20 | 14 |
| Trait du caractère | Entier, sur 20 | 12 |
| Condition, forme, moral | Cinq paliers, sans chiffre (voir « État, forme, moral ») | Juste |

Un trait du caractère se lit selon ce qu'il coûte : l'ambition et l'appât du
gain, ni bons ni mauvais, en pastille neutre ; l'agressivité et la fragilité, qui
ne peuvent que nuire, sur l'échelle d'un attribut lue à l'envers, rouges quand
elles sont hautes (`reverseScoreBadge`, `web/ui.js`).

Une note est une pastille partout, sauf sur un terrain : elle s'y écrit dans sa
couleur, sur le noir du bloc (voir « Terrain et maillot »).

### Montants

- Un salaire, une masse salariale, un plafond salarial sont toujours mensuels.
- Tout montant s'écrit en €, k€ ou M€ : € sous 1 000, k€ sous 1 000 000, M€
  au-delà (850 €, 95 k€, 1.2 M€).
- Un montant de transfert (valeur d'un joueur ou d'un effectif, indemnité, prix
  demandé, offre, budget de transferts) tombe sur un palier qui s'élargit avec
  lui : deux chiffres, et des demi-unités du second dès que le premier vaut 5
  ou plus (37 k€, 95 k€, 340 k€, 550 k€, 4.9 M€, 5.5 M€, 15 M€, 65 M€, 140 M€).
  Un palier pèse ainsi entre 2 et 10 % du montant. Le serveur
  pose un prix demandé sur le palier au-dessus et une offre sur celui en
  dessous ; l'écran arrondit une valeur ou une indemnité au plus proche
  (`price`, `web/ui.js`) et un budget au palier en dessous (`budget`), pour qu'un
  prix affiché sous le budget affiché soit payable.
- Un salaire, une masse salariale, un plafond salarial ont deux chiffres
  significatifs (`monthlySalary`, `web/salaries.js`) ; une marge sous le plafond
  est arrondie en dessous (`monthlyMargin`), pour qu'un salaire affiché sous elle
  y tienne.
- Les totaux comptables (trésorerie, revenus, dépenses, volumes) ont deux
  chiffres significatifs (`money`).

### Joueurs

Là où la place manque, un joueur s'écrit par son nom court : son nom de famille
seul, le dernier mot de son nom avec les particules qui le précèdent
(« De Bruyne », « van der Sar ») ; un nom d'un seul mot reste entier
(« Ângelo »). Quand un coéquipier de l'effectif du club ou de la sélection porte
le même nom, l'initiale du prénom le précède (« L. Hernandez » à côté de Théo),
ou autant de lettres qu'il en faut pour les distinguer (« Be. Cheyrou » à côté
de « Br. Cheyrou »). Le nom entier est dans l'infobulle.

L'API le donne (`short`, et `player_short`, `secondary_short` sur un fait du
match), calculé dans l'effectif du camp : les joueurs du club et ceux du match.
Il s'écrit partout où le nom de famille suffisait :

| Où | Effectif où il se distingue |
|---|---|
| Temps forts d'un match, buteurs sous un match dans une liste | Le camp du joueur dans ce match |
| Terrain du compte rendu, résumé 2D | Le camp du joueur dans ce match |
| Composition : terrain et banc | Le club dirigé |
| Direct : terrain de la tactique, vignettes sous le terrain | Le camp du joueur |

### Transferts

Dans une liste, un transfert s'écrit du club quitté au club rejoint, une flèche
atténuée entre les deux (Monaco → Paris SG), puis son indemnité. Un joueur sans
club vient de « Libre », atténué ; il n'a pas d'indemnité : sa pastille de
niveau en tient lieu. Dans la tuile d'un record, le joueur est suivi du
chevron (`.go`), retourné pour une arrivée, puis du club après sa pastille.

### Classement

Le titre d'une carte de classement nomme le championnat et la dernière journée
jouée, un point médian entre les deux : « Ligue 1 · 11e journée » ; dans une
carte qui nomme déjà le championnat, « Classement · 11e journée ».

Les colonnes sont toujours dans cet ordre : PTS, J, V, N, D, BP, BC, DIFF. ; la
forme vient après. Une version réduite retire des colonnes, jamais elle ne
change l'ordre.

Une place se marque par son rang, écrit dans une pastille (`.rank`) : 24 de
large quel que soit le chiffre, le fond pâle de la place (`-soft`) cerclé de sa
couleur (1), le chiffre en 11 / 700 à son encre (vert : titre, promotion,
qualification directe ; bleu : Europe ; jaune, `--warn` : barrage ; rouge :
relégation, élimination). Dans l'historique d'un club, la place d'un titre est
sur l'accent (`.rank.title`), comme son point dans le graphique. Les autres rangs s'écrivent sans pastille, au même
centre, en `--muted` ; l'en-tête « # » est centré sur eux. Rien ne court le
long de la ligne : seule la ligne du club dirigé est colorée. La légende des
places (`.legend`) montre la même pastille, en carré de 12.

**Coupes d'Europe.** Dans un championnat, une place européenne prend la couleur
de sa coupe (`.rank.c1`, `.c3`, `.c4`) : le bleu de l'Europe (`--info`) pour la
C1, le violet (`--c3`) pour la C3, la sarcelle (`--c4`) pour la C4, trois teintes
tenues loin du rouge, du vert et du jaune des états. Une place du championnat
(titre, montée, relégation) garde sa couleur : sa coupe n'est que dans l'infobulle.

- **Vainqueur de la coupe nationale** : son rang prend la couleur de la C3 où
  qu'il soit classé, en division inférieure aussi, hors d'une place de montée ou
  de relégation.
- **Sous réserve** : tant que la coupe nationale n'a pas de vainqueur, sa place
  en C3 revient au championnat. Une place qu'un autre vainqueur changerait
  (`.tentative`) a son cercle en pointillé ; elle redevient pleine dès que ceux
  encore en lice ne la changent plus.
- **Infobulle** : le nom de la coupe, puis la raison, sur une seconde ligne :
  « Vainqueur de la Coupe de France », « Sous réserve : Conference League si la
  Coupe de France est gagnée par un club moins bien classé ».
- **Pas de légende** : aucun classement ne nomme ses coupes dans l'en-tête de
  sa carte ; la couleur du rang les dit, l'infobulle les nomme.

### Historique

L'onglet Historique d'un club ou d'une sélection se lit en vues, choisies au
bout de sa rangée d'onglets (`.segmented.views`) : vue d'ensemble, saisons (ou
éditions), joueurs, records. La vue d'ensemble est l'adresse de l'onglet, une
autre s'y ajoute (`?vue=`) ; l'option ouverte est marquée de la couleur de
l'onglet ouvert.

- **Vue d'ensemble** : le graphique sur deux tiers de la largeur, le palmarès
  et le bilan dans le dernier.
- **Parcours** (`.reached`) : le tour atteint dans une coupe ou en phase finale, en
  pastille de 18 sur `--panel-2` ; une demi-finale cerclée de bleu, une finale
  de vert, un titre sur l'accent précédé de son étoile.
- **Écart** (`.delta`) : ce qui a bougé depuis la saison d'avant (la
  réputation, la force), signé, après la valeur : vert en hausse, rouge en
  baisse, atténué sans changement. La colonne qui le porte est la dernière.
- **Palmarès** (`.honour-line`) : une ligne de 26 par titre, la pastille de la
  compétition, le titre, les saisons où il a été gagné, le compte ; les
  championnats du plus haut, la coupe nationale, l'Europe ; pour une
  sélection, Coupe du monde, Euro, Ligue des nations.
- **Listes de joueurs** : le chiffre qui classe vient d'abord après le joueur
  (MATCHES, BUTS, SAISONS ; BUTS, MATCHES, SAISONS ; NOTE, MATCHES, SAISONS),
  en gras ; une sélection compte ses sélections (SÉL.) et ses éditions.
- **Onze type** : le terrain raccourci de la charte, aux couleurs du club,
  chaque joueur avec ses matches sous son nom ; la tactique dans l'en-tête de
  la carte.
- **Records** : un score se lit du côté du club (`.calendar-score`, lien vers
  son match), l'adversaire après sa pastille, la croix d'un match à
  l'extérieur ; un âge en années et mois (« 16 ans 3 mois »), après le poste et
  le nom.

### Compétitions

Une pastille de deux caractères.

| Famille | Codes | Apparence |
|---|---|---|
| Coupes d'Europe | C1 (Ligue des champions), C3 (Ligue Europa), C4 (Ligue Conférence) | Noir plein |
| Sélections | EU (Euro), CM (Coupe du monde), LN (Ligue des nations) | Noir plein |
| Championnats de France | L1, L2, L3 | Contour gris |
| Autres championnats | D1, D2, précédés du drapeau du pays | Contour gris |
| Coupes nationales | C et l'initiale du pays : CF, CE, CA, CI | Contour bleu |

Deux pays peuvent partager un code (CA pour l'Angleterre et l'Allemagne). Un
pays ajouté suit la règle : CP pour le Portugal.

Dans la carrière d'un joueur, le drapeau du pays précède toujours la pastille
du championnat, y compris pour la France.

La pastille est un lien vers la page de sa compétition : un championnat ou une
coupe nationale, une coupe d'Europe, l'édition d'une compétition des sélections
(Euro 2028). Son nom complet est dans son infobulle. Elle n'est pas un lien :

- dans un filtre (les compétitions au-dessus du calendrier d'un club) ;
- là où ce qui la porte en est déjà un : une ligne de la recherche globale, un
  match de la Vue d'ensemble d'un club, la liste de la navigation d'un bandeau,
  une compétition du palmarès ;
- pour une compétition que le jeu ne simule pas (un championnat étranger dans
  une carrière) ;
- sur l'écran « Nouvelle partie », où le monde n'est pas encore tiré.

Le nom d'une compétition est lui aussi un lien vers sa page, partout où il
s'écrit : le titre d'une tuile, une colonne CHAMPIONNAT, le bilan et les saisons
d'un historique, une suspension. Après sa pastille, les deux forment un seul
lien (`.comp-link`), à 6 l'un de l'autre (à 8 sur une tuile) ; sous le pointeur,
le nom se souligne, la pastille ne change pas. Le nom n'est pas un lien là où
sa pastille n'en est pas un (ci-dessus), ni :

- dans le titre d'une carte dont le « Voir » mène déjà à sa page ;
- sur sa propre page ;
- pendant le match en direct, qui tient l'écran jusqu'à la fin de la journée ;
- dans une infobulle ou une liste déroulante.

### Clubs et pays

- Le nom d'un club suit toujours sa pastille (`.kit-dot`) : un carré de 14 au
  rayon de la charte, sur le fond du bandeau du club (sa première couleur, ou la
  seconde quand la première est proche du blanc), son autre couleur dans un
  coin, coupé en diagonale. Son écusson la remplace dans un en-tête. Dans un
  match face à face, la pastille de celui qui reçoit suit son nom : voir
  « Match dans une liste ».
- Dans une coupe d'Europe, où se croisent les clubs de plusieurs pays, le nom
  d'un club est suivi du drapeau de son pays (`.club-flag`) : la pastille, le nom,
  puis le drapeau, à 6. Ce drapeau est un lien à part, vers la sélection de son
  pays ; son infobulle nomme le pays. Face à face, celui qui reçoit l'a devant
  son nom : sa pastille garde le contact du score. Un nom trop long est coupé,
  jamais son drapeau. Il s'écrit sur toutes les vues d'une coupe d'Europe
  (classement, phase de ligue, phase
  finale, derniers et prochains matches, statistiques, historique, tuile du
  vainqueur) et dans le compte rendu de ses matches ; ailleurs, le pays d'un club
  se lit sur sa fiche.
- Le nom d'un pays suit toujours son drapeau (16 × 12 ; 24 × 18 dans le bandeau
  d'un match), sauf dans le bandeau de sa sélection, où le drapeau suit le nom, à
  la hauteur de ses capitales (voir « Bandeau »). Une nationalité en colonne : le drapeau, puis le code de trois
  lettres. Un joueur n'y a qu'une
  nation, celle de sa sélection, à défaut la première de ses nationalités ; les
  autres ne sont ni comptées ni nommées : elles se lisent sur sa fiche.
- Un drapeau mène toujours à la sélection de son pays : seul, ou avec le nom ou
  le code qui le suit, en un seul lien ; devant autre chose (un championnat, un
  club), il est un lien à part. Un pays sans sélection dans le jeu garde son
  drapeau, sans lien. Il n'en est pas un dans un filtre (les pays au-dessus
  d'une liste), dans le menu, sur l'écran « Nouvelle partie », ni là où ce qui
  le porte est déjà un lien : une sélection dans une liste, dont le drapeau et
  le nom mènent ensemble à sa fiche ; un pays du palmarès, qui mène à sa page ;
  une ligne de la recherche globale ; un match de la Vue d'ensemble d'un club.
- Une sélection a deux couleurs, celles de son maillot, comme un club : elles
  font son bandeau et ses maillots sur un terrain. Son en-tête est celui d'un
  club ; sur sa fiche, son logo PNG transparent se tient seul sur le bandeau,
  comme l’écusson d’un club, et son drapeau suit son nom. Sans logo ou si son
  chargement échoue, ses initiales restent sur le disque. Dans une liste,
  son nom suit son drapeau, jamais une pastille de couleurs.
- Une liste de joueurs d'une sélection donne le club de chacun là où celle d'un
  club donne sa nationalité.

### Tableaux

- **Vide** : un tableau ou une liste sans ligne le dit en une ligne de 26, à
  l'encre atténuée, au bord de ses lignes (`.empty`) : ce qui manque, et rien
  d'autre (« Aucun transfert », « Aucun titre », « Tirage à venir »). Ni titre
  au-dessus, ni phrase qui explique quand cela viendra.
- Toutes les colonnes de tous les tableaux se trient.
- Chaque colonne garde sa largeur : la flèche d'un en-tête suit son libellé,
  dans l'écart qui le sépare de la colonne suivante, où elle ne prend pas de
  place ; dans la dernière colonne, elle le précède, pour rester dans le
  tableau. Trier ne déplace aucune colonne.
- Un tableau qui ne donne pas de valeur de tri se trie sur ce que ses cellules
  affichent : un chiffre, un montant dans son unité, une date, sinon le texte.
- En-têtes et lignes de 26 ; chiffres alignés à droite, sous un en-tête aligné
  de même.
- **Pied** : ce que les colonnes totalisent (le nombre de joueurs sous le nom,
  la somme sous le montant), sous elles, sur `--panel-2`, un trait
  `--head-line` au-dessus, en 600 à l'encre forte. Il ne se trie pas avec les
  lignes.
- **Tableau qui défile** dans sa boîte (`.table-scroll`, tenue à une hauteur) :
  son en-tête reste en haut, son pied en bas, toujours visibles ; les lignes
  passent dessous.
- Aucun trait entre les lignes : une sur deux sur une bande (`--stripe`).
  L'en-tête n'a pas de fond, un trait pâle dessous (`--head-line`). Les listes
  (matchs, faits, attributs, temps forts) font de même.
- **Club dirigé** : dans un classement, la ligne du club dirigé ou d'un de ses
  joueurs (`tr.own`) est sur `--own-row` à la place de sa bande, sous le
  pointeur aussi.
- Une colonne a la largeur de ce qu'elle tient au plus, son en-tête ou sa plus
  longue valeur, quelle que soit la valeur affichée : rang 36, poste 48,
  pastille 56, chiffre 52 (68 sous un en-tête long : MATCHES, SAISONS), score
  76, montant 84, saison 96, date 108. Un texte trop long est coupé d'une
  ellipse, jamais la colonne voisine.
- Le nom (d'un joueur, d'un club, d'une nation) n'a pas de largeur à lui : il
  prend celle de son plus long, 200 au plus (`--w-name`). Dans une liste en
  pages, où une autre page ou un tri amène d'autres noms, il garde 200, pour
  que rien ne bouge. Dans une liste de joueurs, de clubs ou de transferts, il
  tient 120 au moins.
- **Des écarts égaux** : ce que le tableau a de plus que ses colonnes se
  partage à parts égales entre leurs écarts, si bien que deux colonnes voisines
  ne sont jamais plus proches ni plus éloignées que deux autres ; ses bords
  gardent leur marge. Un tableau qui n'a rien de plus laisse au nom ce qui
  reste, jusqu'à son minimum, puis défile ; ses écarts sont alors les marges de
  ses cellules (`spreadColumns`, `web/columns.js`).
- **Tableaux alignés** (`.aligned`) : deux tableaux l'un sous l'autre dont les
  colonnes se répondent (la carrière d'un joueur : ses clubs, puis sa
  sélection) ne partagent pas leurs écarts. Chaque colonne a la largeur de ce
  qu'elle tient, le nom ce qui reste, la même dans les deux. Tenues à une
  hauteur, leurs boîtes gardent la place d'une barre de défilement, qu'elles
  défilent ou non.
- **Liste de joueurs** : les mêmes colonnes sur tous les écrans (effectif,
  rassemblement, Joueurs, promotions du Mercato mondial), chacune de ce
  qu'elle tient, sans ses marges de 8 : poste 36 · nationalité 54 · âge,
  sélections 24 · note 32 · niveau, potentiel, composite 64 · valeur, salaire 48 · prix
  minimum, prétentions, état 80 · listé 34 · intéressé 60 · contrat 78 · forme
  46 · moral 72 · matches 40 · buts 30 · passes, cartons 16 · promotion 76 ·
  données 88 ; un attribut ou un composite, sa pastille de 32. À côté d'un
  aperçu (Joueurs), les marges de ses cellules passent à 4.
- **Intransférable** : un cadenas de 14 (`.locked`, trait `--muted`) dans la
  colonne « Listé », le mot en infobulle ; le prix minimum est un tiret.

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
| Formation et composition auto | Sur la Composition, le pas des formations (`steps`, options `attribute` et `forward`, `web/ui.js`) à la place des neuf boutons au-dessus du terrain ; la composition auto (`autoHtml`, `web/composition.js` ; `.check-option`, `web/charte.css`) à la place de « Meilleure composition » |
| Fond | Blanc en thème clair |
| Onglets | `.tabs` partout, en-tête de club compris |
| Match en direct | Tout dans la fenêtre, trois colonnes (`liveScreen`, `web/live.js` ; `.live-layout`, `web/charte.css`) : l'équipe en lignes (`squadHtml`, `assistantAdvice`), l'adversaire au même choix, la tactique ; le bandeau du match compact et sa minute (`matchHero`, option `clock`, `web/club-hero.js`), l'écusson sans disque à sa place ; le fil sous le terrain, la frise, les deux vitesses et la bande du but (`ticker`, `drawFrise`, `setDeadSpeed`, `goalBurst`, `web/match-replay.js`), plus de trace du ballon ; les formations pendant les temps morts (`formationsHtml`) ; le fil des buts attendus sous les commandes ou en tête des chiffres (`drawFlow` ; `flowChart`, `web/match.js`) ; les temps forts par sorte, les chiffres qui glissent et dont les parts remplissent la barre, la journée et le classement à son pied, ses places et ses ▲ ▼ (`highlightGroups`, `patchStats`, `othersHtml` ; `tableZone`, `web/ui.js`). Plus de fenêtre Tactique : le brouillon se fait dans la liste et sur le terrain (`draftLines`, `dropOn`, `tacticHtml`), Valider l'envoie à la fin de l'action (`interrupt`, `cancelInterrupt`, `web/match-replay.js`). L'adversaire, sa formation et la place de chaque joueur viennent de `/direct` (`opponent`, `formation`, `role`, `src/api/live.py`), le classement d'une phase de ligue et ses places de `/direct/multiplex` (`table`, `places` ; `table_places`, `src/api/views.py`) |
| Terrain et maillot | `.pitch` et `.kit-shirt` sur la composition, le match, les aptitudes et le direct (`kitShirt`, `pitch`, `web/ui.js`). Le maillot carré, le motif du maillot du club redessiné à plat (corps à la première couleur, motif à la deuxième et à la troisième, col et poignets à la troisième, numéro blanc cerné sur un motif) ; sous lui le bloc (`playerBlock`, `blockNote`, `web/ui.js`) à la place de l'étiquette du nom, de la note à côté du maillot et des faits à gauche : plus de note qui change de côté (`noteSide` retiré de `web/composition.js`), les buts en grappe au coin du maillot (`.kit-goals`), la sortie en blanc. Les aptitudes d'un joueur sans liste des postes, leur terrain à 360 (`positionPitch`, `web/player.js`) ; la liste reste dans l'aperçu d'un joueur. L'étiquette du nom passe à 70 % |
| Pastilles | Postes pleins ; compétitions en deux caractères (`competitionCode`, `web/ui.js`) ; notes, scores, statuts à 18 |
| Nombres | Point décimal, notes à un et deux chiffres, buts attendus à un chiffre, montants en €, k€, M€ (`number`, `matchNote`, `averageNote`, `expectedGoals`, `amount`), y compris dans le manuel |
| Étoiles et états | Niveau, potentiel, composites, notes au poste et installations en étoiles (`stars`, `noteStars`, `levelStars`, `potentialStars`, `facilityRating`, `web/ui.js`) à la place des pastilles sur 200 et des notes sur 20 des installations ; la personnalité d'un club en mots et crans (`.trait`) ; l'affinité en disque (`affinityIcon`) ; condition, forme et moral en paliers (`conditionIcon`, `formIcon`, `moraleCell`, `moraleFace`) à la place des jauges et des pourcentages ; la courbe du niveau en étoiles ; le mode debug (`setDebugMode`) |
| Jeu en radar | Sur la fiche et dans l'aperçu d'un joueur de champ, ses six composites en radar (`radar`, `COMPOSITE_ABBREVIATIONS`, `RADAR_COMPOSITES`, `starsText`, `web/ui.js` ; `compositesRadar`, `compositesGroup`, `web/player.js`) à la place de leur liste ; les autres colonnes à leur plus longue ligne à côté de lui (`.radar-column`, `web/charte.css`) |
| Classements | Le rang d'une place marquée en pastille cerclée, les autres nus (`.standings .rank`, `web/charte.css`), à la place du trait à gauche du rang, dans tous les classements (`standingsTable`, `internationalStandings`, le direct) et la légende de la phase de ligue ; ordre des colonnes unique |
| En-tête de club | Bandeau de 88, nom en 40, son championnat à sa suite en 20 (`clubHero`, `web/club-hero.js`) : ni ligne au-dessus du nom, ni capacité du stade ; une sélection n'a que son nom (`nationHero`). Ses tuiles : niveau et potentiel des 16 meilleurs en deux colonnes graduées (`top_rating`, `top_potential` de l'API), puis la réputation ; plus de tenues ni de tactique, d'entraînement ou de recrutement sur le bandeau de la fiche (le bandeau de « Nouvelle partie » garde ses tenues) |
| Présentation d'un club | Premier onglet de la fiche, ouverte sur lui (`presentationContent`, `web/club-overview.js` ; `clubScreen`, `web/screens.js`) : la rangée de tuiles (`clubTiles`, `web/club-hero.js`), les tenues (`kitsCard`) et les finances sous elles (`financesBlock`), l'équipe-type (`elevenCard` ; `eleven` de `/clubs/{id}/apercu`, `typical_eleven`, `src/api/club_overview.py`), À surveiller (`watchCard`), le calendrier et le classement qui se partagent les lignes, les buteurs, passeurs et notes (`leadersCards`) ; les lignes suivent la hauteur de la fenêtre (`presentationHeight`), redessinées quand elle change (`[data-fill]`, `web/app.js`). Le terrain debout de la Composition est partagé (`pitchLayout`, `pitchLine`, `LINE_Y` passés dans `web/ui.js`) ; l'équipe-type n'en garde que les lignes de sa formation, réparties sur toute la hauteur (`spreadLayout`, `web/ui.js` ; `.pitch.spread`). L'onglet Effectif n'a plus que ses deux listes, sur toute la largeur (`squadWidgets` retiré). La barre d'un classement de joueurs passe dans `web/charte.css` (`.leader-bars` ; `leaderBars`, `web/club-overview.js`), retirée de `web/club.css` avec l'ancien Historique |
| Fiche d'une sélection | L'en-tête d'un club à ses couleurs (`nationHero`, `web/club-hero.js`), son logo seul, son drapeau après son nom (initiales sur le disque sans logo), aux couleurs de son maillot lues dans `data/nations.csv` (`NATION_KITS`, `src/api/nations.py`) ; la Présentation d'un club, premier onglet (`presentationContent`, `web/international.js` ; tuiles `nationTiles`, `web/club-hero.js` ; colonnes `presentationColumns`, tenues `kitsCard`, équipe-type `elevenCard`, calendrier `calendarBlock`, classements de joueurs `leadersCards` de `web/club-overview.js` ; parcours `runsCard` ; `/international/nations/{id}/apercu`, `nation_overview`, `src/api/international.py`), la liste seule sur l'Effectif (les widgets à côté d'elle retirés) ; le calendrier d'un club, par édition ; pastilles EU, CM et LN ; classements dans l'ordre des colonnes de la charte (D, non P) |
| Le match en chiffres | `.comparison`, couleurs calculées (`chartColours`, `web/ui.js`) ; carte repliée sur ses quatre premières lignes, l'en-tête entier montre les autres et le choix est gardé (`foldCard`, `web/ui.js` ; `turnFold`, `web/app.js`), au compte rendu comme au direct |
| Tableaux | Toutes les colonnes se trient (`sortValue`), la flèche après le libellé ; chaque colonne de ce qu'elle tient, le nom de son plus long à 200, des écarts égaux (`spreadColumns`, `web/columns.js`) ; une seule échelle pour les listes de joueurs |
| Pays | Drapeau dans le menu et sur la Vue d'ensemble |
| Sous le pointeur | Une seule règle pour les liens, les lignes et les commandes, dans `web/charte.css` ; les autres feuilles n'en disent plus rien (`tests/frontend/charte.test.mjs`) |
| Palmarès | Pastilles de compétition de la charte (`competitionBadge`), filtres de poste aux couleurs des postes |
| Classement au fil des saisons | Un étage par division, places aux couleurs du classement, libellés à l'encre ; le rang écrit dans son point, une colonne de 44 au moins par saison, défilant sur un long historique et ouvert sur les dernières, toutes les saisons (plus de page) ; la réputation dessous, sur les mêmes colonnes (`rankChart`, `web/history.js`) |
| Historique d'un club, d'une sélection | En vues au bout de la rangée d'onglets (`viewChoice`, `clubHistory`, `nationHistory`, `web/history.js` ; `history` de `src/api/club_archive.py` et `src/api/nation_archive.py`) : vue d'ensemble, saisons ou éditions, joueurs, records. Parcours en `.reached`, titre en `.rank.title`, écart en `.delta`, palmarès en `.honour-line`, colonnes de largeur fixe. Le parcours d'une sélection dans le même graphique qu'un club (`stageChart`), sa force dessous |
| Menu d'un joueur | `.menu` au clic droit, sur tous les écrans (`web/player-menu.js`) ; sur Composition, il remplace le clic droit qui sortait ou alignait un joueur |
| Répartition des budgets | `.balance` sur l'onglet Finances d'un club, à la place des chiffres « Budget transferts » et « Masse salariale » (`shareContent`, `web/club-finances.js` ; la poignée, `web/budget-share.js`) |
| Pas de saison | `.season` partout où une saison ou une édition se choisit (`steps`, `seasonSteps`, `web/ui.js`) : flèches à la couleur du club (`--club`, depuis `--hero-accent`), saison en chiffre clé qui ouvre la liste de toutes (`seasons`, `current_season` de l'API). Au bout de la rangée d'onglets sur Calendrier, Finances et Transferts d'un club, sur Calendrier d'une sélection, sur le tableau d'une coupe nationale et sur une coupe d'Europe (`tools` de `clubHero`, `nationHero` et `competitionHero`), au bout de la ligne du titre sur Mercato mondial, dans l'en-tête de la carte du classement archivé d'un championnat. Ni liste déroulante, ni rangée d'éditions, ni classements repliés. La couleur sous l'onglet ouvert est ramenée à son ton de graphique quand elle se lirait mal (`legibleOn`) |
| Compte rendu d'un match | Tout sur un écran : le bandeau sans barre, la ligne du match (`.match-line`) au-dessus des temps forts avec « Match aller » et « Résumé 2D », plus de capacité du stade (ni à l'écran, ni dans `match_detail`) ; le terrain raccourci à 68 × 76 (`.pitch.short`, `pitch`, `web/ui.js`) ; le banc sous son terrain en deux colonnes de noms courts (`benchHalves`, `web/match.js` ; `.halves`, `web/charte.css`). Le bandeau partagé (`matchHero`, `web/club-hero.js`) à la place de la bannière du score ; les compositions sans titre, les temps forts et les chiffres sans ligne qui nomme les camps, les temps forts de chaque camp à son bord ; une sélection y porte son maillot (`match_detail`). Les temps forts sur une ligne de 26 chacun, sans libellé : les marques, le nom court du joueur, le passeur en petit (`highlightsCard`, `web/match.js` ; `short_names`, `src/api/views.py`, aussi au direct) |
| Noms courts | Le nom de famille, et l'initiale ou les lettres du prénom devant un homonyme de l'effectif (`short_names`, `squad_short_names`, `src/api/views.py` ; `shortName`, `web/ui.js`) : temps forts, buteurs sous un match, terrain du compte rendu, résumé 2D, composition, direct |
| Fiche d'un joueur | L'en-tête de son club (`playerHero`, `web/club-hero.js`) : son nom et son club, ses tuiles, sa sélection en trois colonnes ; ses commandes dans la barre sous le bandeau (`playerBar`, `web/player.js`) ; la colonne en trois cartes, État, Caractère et Contrat, chacune sous son en-tête, à la hauteur de ses faits (`rail`), ses autres nationalités en drapeau et code ; lignes et bandeaux de 26, jauges de 40 ; la carrière en pastilles de compétition (`competition_badges`, EU, CM et LN pour une édition), en deux tableaux alignés qui défilent, en-tête et total visibles (`careerCard` ; `.aligned`, `web/columns.js`) ; la courbe du niveau en `--series-1` ; la page tenue dans la fenêtre sur grand écran, le terrain des aptitudes à 280 |
| Marque et barre du haut | Le terrain en favicon (`web/favicon.svg`) ; en tête du menu, le coin jaune, la marque inversée et le nom « Football Manager » sur deux lignes (`web/index.html`) ; la barre de 56 ouverte par l'écharpe, ses contrôles de 40 (`web/charte.css`) ; le nom dans le titre de l'onglet et sur les panneaux du direct 3D. Les écrans qui tiennent dans la fenêtre (Composition, Actualités, manuel, palmarès) suivent `--h-bar` |
| En-tête d'une compétition | Le bandeau d'un club (`competitionHero`, `web/club-hero.js`) sur un championnat, une coupe nationale, une coupe d'Europe et une édition des sélections, à la place de la ligne du titre : l'emblème seul sur le bandeau (`web/emblems/`) ou le drapeau du pays sur le disque, une tuile pour le vainqueur ou le tenant du titre (`winner`, `holder` de l'API) à la place de la ligne « Vainqueur » sous les onglets ; ses couleurs et son fond (`COMPETITION_COLORS`, `api/nations.py`). Le bloc de navigation du bandeau remplace le choix C1, C3, C4 de Coupes d'Europe et le pas d'édition des sélections (`europeNavigation`, `editionNavigation`, `web/navigation.js`) ; dans sa liste, une compétition suit sa pastille |
| Navigation d'un bandeau | `.entity-nav` à gauche du bandeau d'un club, d'une sélection, d'un joueur et d'une compétition (`neighbours`, `web/navigation.js`) : le pas de saison en colonne, à la place du bloc de trois boutons bordés. Ses flèches et ses traits à la seconde couleur du bandeau quand elle s'y lit, sinon à son encre, et le voile sous le pointeur (`--hero-step`, `--hero-veil`, `heroColors`, `web/club-hero.js`). Sa liste est le menu de la charte, sans titre ; le compte du groupe est l'infobulle des trois traits |
| Pastille d'un club | Le carré de 14 sur le fond du bandeau, son autre couleur dans un coin (`kitDot`, `bandColours`, `web/ui.js`), à la place de la pastille ronde coupée en deux, sur tous les écrans ; le bandeau d'un club lit ses couleurs par la même règle (`heroColors`) |
| Match dans une liste | `fixtureRow` (`web/ui.js`) sur le tour d'une compétition, le calendrier d'un championnat, la Vue d'ensemble, les éditions des sélections et la page d'un pays, à la place de sa ligne propre : les pastilles contre le score, le score en chiffre clé, le nom du vainqueur en 700 à l'encre de l'accent et celui du battu à l'encre courante (`.won`, `.lost`), le match du club dirigé sur fond jaune (`setOwnClub`), l'étage du cumul ou des tirs au but à la place des deux lignes sous le score, les buteurs écrits « Mendes 12’ 58’ ». L'API dit sur les deux matches d'un aller-retour quel club s'est qualifié (`qualified_id`, `return_leg_id`). Dans le tableau d'une coupe, le qualifié et l'éliminé s'écrivent de même, et la case du match du club dirigé a le fond jaune (`web/bracket.js`). La ligne du club dirigé est colorée dans tous les classements, plus seulement sur la page d'un pays et dans Actualités (`standingsTable`) |
| Drapeaux des clubs | Dans une coupe d'Europe, le drapeau du pays de chaque club après son nom, devant lui pour celui qui reçoit d'un match face à face (`clubLink`, option `flag`, `web/ui.js` ; `.club-flag`, `web/charte.css`) : son classement, sa phase de ligue et ses derniers et prochains matches (`flags` de `standingsTable`, `fixtures`, `fixtureRow`, `roundContent`), sa phase finale (`bracket`), ses buteurs, son historique et la tuile de son vainqueur (`competitionHero`). Dans le compte rendu d'un de ses matches, le drapeau de chaque club en 24 × 18 après son nom dans le bandeau, lien vers la sélection (`matchHero`, `web/club-hero.js`) ; la ligne du match ne le répète pas. L'API donne le pays de chaque club (`nation` de `club_ref`, `src/api/views.py`), et sa sélection dans le compte rendu (`nation_id`) |
| Accueil et nouvelle partie | Les deux panneaux de l'accueil (`homeScreen`, `savesList`, `web/home.js`) sans partie et sur « Ma partie », à la place du texte d'accueil, du formulaire de création et de la liste des emplacements ; la liste des sauvegardes y dit le club et la date de chaque partie (`slots`, `src/infrastructure/persistence/store.py`). L'écran « Nouvelle partie » (`newGameScreen`, `web/new-game.js` ; `creationHero`, `web/club-hero.js`) à la place du choix du club après la création : nations, divisions et club choisis avant que la partie ne soit tirée, « Commencer » dans la barre du haut. `.doors`, `.door`, `.saves-list`, `.check`, `.nation-line` dans `web/charte.css` |
| Compétitions des sélections | La Coupe du monde, l'Euro et la Ligue des nations ont chacune leur page (`#/international/coupe-du-monde`, `euro`, `ligue-des-nations` ; `competitionScreen`, `web/international.js`) à la place d'une page par édition : leur nom seul sur le bandeau, la navigation du bandeau entre les trois (`selectionNavigation`, `web/navigation.js`), leurs éditions au pas de saison (`edition` dans l'adresse), un onglet Historique (`competitionHistory` ; `/api/international/competitions/{slug}/historique`) avec les finales, les titres, les parcours des nations (`.run`, `.final-score`) et les joueurs de tous les temps avec leur nation. Sélections nationales en trois colonnes (`competitionColumn`, `competitionBand`, `web/club-hero.js` ; `.club-hero-band.narrow`, `web/charte.css`) et la liste des nations avec leurs titres par compétition, à la place des cartes des éditions en cours, du palmarès mêlé et de la rangée des éditions. Les adresses d'une édition par son année ouvrent sa compétition, et la pastille d'une édition mène à la page de sa compétition, sur cette édition (`editionHref`, `competitionHref`, `web/ui.js`) |
| Places européennes | Dans un championnat, le rang d'une place européenne à la couleur de sa coupe (C1 bleu, C3 violet, C4 sarcelle), en pointillé sous réserve de la coupe nationale, à la place du bleu unique de l'Europe ; son infobulle (`europePlace`, `europeTip`, `web/ui.js`), sans légende des coupes dans l'en-tête de la carte, à la place de « 3 points pour une victoire ». L'API donne la coupe de chaque ligne (`europe`, `european_places`, `src/api/views.py`), le vainqueur de la coupe nationale compris |
| Numéros de maillot | Sur les terrains de la composition, du compte rendu d'un match et du direct, le numéro du joueur à la place de son poste, en 13 (`shirtLabel`, `kitShirt`, `.kit-shirt.number`, `web/ui.js`) : celui qu'il portait ce jour-là pour un match joué (`shirts` du résultat, `match_shirt`, `src/api/views.py`), le poste à défaut (place vide, renfort temporaire, sélection). Le bandeau d'un joueur porte son numéro devant son nom, en 40 et voilé (`playerHero`, `web/club-hero.js` ; `.club-hero-number`). Dans Actualités, le maillot du club sous le titre d'une arrivée, et les deux maillots d'un changement de numéro (`clubShirt`, `web/news.js` ; `.kit-shirt.former`, `.shirt-change`) |
| Attributs | Sur la fiche et dans l'aperçu d'un joueur, une colonne à la mesure du plus long nom de sa section et de sa pastille (`--attribute-column`, `web/charte.css`), à la place des 165 de toutes les sections sur la fiche et des deux colonnes fixes de l'aperçu : dans l'aperçu, la section Jeu passe sur une colonne, ses lignes et celles des attributs à 26. Sur la fiche, les attributs en colonnes, une par section (`.attribute-columns`, `attributesBody`, `web/player.js`), à la place des sections empilées sur trois colonnes : la carte s'arrête à son contenu (`.player-row>.attributes-card`), et sur grand écran la carrière monte sous elle (`.player-main`, `web/theme.css`) ; les attributs d'un gardien qui ne servent pas à son poste en dernière colonne grisée à la place du repli « Autres attributs ». Les attributs de chaque section dans l'ordre alphabétique, sur la fiche, dans l'aperçu et dans la vue Attributs des listes (`ATTRIBUTE_SECTIONS`, `web/ui.js`). L'appât du gain quitte Général pour la sous-section Caractère de la colonne de la fiche (`rail`, `web/player.js`), où l'agressivité, l'ambition et la fragilité le rejoignent |
| Écusson sans disque | Sur le bandeau d'un club, d'une sélection, d'un joueur et de « Nouvelle partie », l'écusson seul, à l'aire d'un carré de 64 (72 de haut, 128 de large au plus), à la place du disque blanc : son rapport lu sur l'image une fois chargée (`initHeroCrests`, `web/club-hero.js` ; `--r`, `web/charte.css`), le disque et ses initiales revenant pour un écusson absent ou qui ne se charge pas (le `onerror` en ligne, bloqué par la CSP, est retiré). Les PNG de `web/clubs` et `web/nations` rognés à ce qu'ils dessinent (`tools/trim_logos.py`, empreintes de `web/nations/sources.json`). Le drapeau d'une sélection après son nom, 37 × 28, à 16 (`.club-hero-flag`), plus dans le disque. Le bandeau d'un match aussi, chaque camp son écusson seul (`matchHero`) ; le disque d'un championnat ne change pas |
| Transferts d'un club | Les mercatos à gauche (`mercatoLedger`, `web/club-history.js` ; `mercatos`, `src/api/club_history.py`), chaque bloc ouvrant sa saison ; à droite la saison : Dépenses, Recettes et Balance sur une tuile à colonnes, la plus grosse recrue et la plus grosse vente en tuiles d'un record, puis Arrivées et Départs en tableaux triables à la charte, leur pied comptant les joueurs et totalisant les indemnités (`movementsHistory`). À la place des chiffres sur 2/1/1 au-dessus de deux colonnes, des flèches en caractères, du compte et du total dans l'en-tête des cartes et des filtres Tous, Transferts, Prêts, Autres. Le poste d'un retraité est celui de son dernier mouvement archivé (`transfer_row`, `src/api/views.py`) |
| Classement d'une ligue | Vues Général, Domicile, Extérieur, 5 derniers dans l'en-tête du classement (`tableViews`, `web/screens.js` ; `vue`, `/competitions/{id}/classement` ; `side`, `last`, `standings`, `src/core/world/calendar.py`) ; attaques et défenses en classements de clubs (`clubBars`, `web/club-overview.js` ; `chartColour`, `web/ui.js`), buteurs et passeurs dessous, à la place des quatre tuiles |
| Fil du match | Sous le match en chiffres (`flowCard`, `web/match.js`), tiré des tirs que tout match garde (`shots`, `MatchResult` ; `store_events`, `src/core/domain/matches.py`) |
| Niveau au fil des mois | 240 de haut, 20 points d'ordonnée au moins (`levelChart`, `web/player.js`) |
| Liste de joueurs | Cadenas d'un intransférable dans « Listé » (`LOCKED`, `web/ui.js`), le prix minimum en tiret |
| Liens des pastilles et des drapeaux | La pastille d'une compétition mène à sa page, le drapeau d'un pays à sa sélection, sur tous les écrans (`competitionBadge`, `competitionHref`, `nationFlag`, `nationBadge`, `nationHref`, `web/ui.js`) : le drapeau d'un club dans une coupe d'Europe (`clubLink`, option `flag`), la nationalité d'une liste de joueurs, la tuile de sélection d'un joueur jamais appelé (`selectionTile`, `web/club-hero.js`), la carrière d'un joueur, le calendrier d'un club ou d'une sélection, la ligne d'un match. L'option `link` les garde sans lien dans un filtre et dans ce qui est déjà un lien. L'API donne la sélection de chaque pays (`selection_id` de `/api/nations`), table relue à chaque changement de partie (`web/app.js`) |
| Intertitres | Un seul intertitre, indigo et dégradé, sur tous les écrans (`.section-title`, `web/charte.css`), à la place du lavis jaune ou du club, du trait et des bandeaux arrondis des colonnes ; les colonnes d'une carte à 8 l'une de l'autre (`.sections`) ; la colonne d'un joueur en trois cartes, les temps forts du direct sous leur en-tête ; le titre d'une carte en indigo. Maquette : <https://claude.ai/artifact/UtpqnnjpKpem234fqiLPHz> (sans repère, indigo, dégradé, colonnes espacées) |
| Derniers et prochains matches | Une carte par partie (`roundContent`, `web/rounds.js` ; `.round-layout`, `web/charte.css`) : le tour, son classement titré de sa journée (`roundTitle`, `web/ui.js`), les buteurs, à la place d'une carte coupée de traits ; les groupes des sélections gardent leur carte, les buteurs à côté dans la leur. Les règles du tour retirées de `web/theme.css` |

Ce qui reste :

| Sujet | État |
|---|---|
| Thème sombre | Hors charte : il garde ses valeurs et fonctionne avec les mêmes composants, sans avoir été revu |
| Feuilles d'origine | `style.css`, `compact.css`, `theme.css`, `club.css`, `match-replay.css` restent chargées sous `web/charte.css` ; leurs règles devenues sans effet sont à retirer |
| Banc d'un match | L'API ne donne pas le poste d'un remplaçant : la liste n'a pas de pastille de poste |
| Manuel | Ses tableaux (Markdown) ne se trient pas |
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
Il tient depuis sur un écran (proposition B, le banc en deux colonnes, terrain en
68 × 76) : <https://claude.ai/artifact/BV74Y91tpDC9BacYTRXFq5> ; les maquettes
antérieures montrent la barre sous le bandeau et le banc d'une colonne.
La marque et la barre du haut ont la leur (logo 1, « Terrain » ; barre,
proposition J) : <https://claude.ai/artifact/5vwPBqcKJkDe99jEWJZZwv>.
L'en-tête d'une compétition aussi (proposition B, le drapeau sur le disque pour
un championnat ou une coupe nationale, une seule tuile) : <https://claude.ai/artifact/G4otUdvsW2uTSohRKR7AUk> ;
sur son écran `/europe`, il remplace celui du premier canevas.
L'écusson sans disque a la sienne (écusson A, « Ombre », aire de 64 ; drapeau
d'une sélection 2, « À la hauteur des capitales », écart porté à 16 à
l'intégration) : <https://claude.ai/artifact/NssfUamcpRBg6QrstRdPKS>, la version 1
pour l'écusson, la version 2 pour le drapeau.
La navigation d'un bandeau a la sienne (proposition A, « Colonne », l'encre sous
un contraste de 3) : <https://claude.ai/artifact/8489MjUnN55vhza5VESzc3> ; les
bandeaux des canevas antérieurs montrent l'ancien bloc.
La pastille d'un club et le match dans une liste ont la leur (pastille « Coin »,
face à face de la proposition A, cumuls et tirs au but en « Étage », sans gras
dans l'étage) : <https://claude.ai/artifact/3uRbkWyENMLACemkt859vX> ; les canevas
antérieurs montrent la pastille ronde. Le nom du vainqueur a été repris depuis
(proposition F : 700 à l'encre de l'accent, le battu à l'encre courante) :
<https://claude.ai/artifact/J9aYxRuK5KGRCFmDpBs6xe> ; ce canevas-là le montre
encore en 600, sans couleur.
Le rang d'un classement a la sienne (proposition F, « Pâle cerclée ») :
<https://claude.ai/artifact/XtXAQFjzDkHCpFNR7hn5R2> ; les canevas et planches
antérieurs montrent le trait à gauche du rang.
La carte repliable et les temps forts d'un match ont la leur (chiffres :
proposition E, « L'en-tête entier » ; temps forts : proposition G, l'initiale
seulement entre homonymes d'un effectif) :
<https://claude.ai/artifact/BY9WbaVsvTNye4bL8CQUan>.
Le joueur sur un terrain a la sienne (le bloc : proposition B « Étiquette », puis
B3 « Étage » et la note en chiffre coloré) : <https://claude.ai/artifact/Hsqs282akMFByN9QUVUufT>,
comme le maillot (« Carré · Manches ») : <https://claude.ai/artifact/7JMrbN6uTc4DS6kgP5EtAR>
et le terrain des aptitudes (proposition B) : <https://claude.ai/artifact/KfuMRqMWEQyzDN2cxaM9us>.
Les drapeaux des clubs d'une coupe d'Europe ont la leur (proposition A, « À la suite du nom ») :
<https://claude.ai/artifact/LAvkbnT5d4k2bFxQg7w7wg>, le bandeau d'un match avec ses drapeaux en 24 × 18.
L'accueil et la nouvelle partie ont la leur (accueil : proposition C0d, ses panneaux
réduits et mis l'un sous l'autre depuis ; nouvelle partie : proposition C, « Tout sur un écran ») :
<https://claude.ai/artifact/Vfd8w6dFsdBPiwZQb5R9xi>.
Les compétitions des sélections ont la leur (page d'une compétition ; Sélections nationales :
proposition A, « Une colonne par compétition ») : <https://claude.ai/artifact/N1DdjSU5sfTAv2w54A7NrB>.
Les places européennes d'un classement ont la leur (proposition E1, « Bleu, violet,
sarcelle ») : <https://claude.ai/artifact/8Q35koGuApLFLJ8HpByX4A>.
Les numéros de maillot ont la leur (bandeau : proposition B, « Devant le nom » ; terrains :
T2, le numéro en 13 ; actualités : le numéro dans le message, jamais dans le titre, et N2, les deux maillots) :
<https://claude.ai/artifact/7nS7K76xDRutXa5D1VJTPB>.
L'historique d'un club et d'une sélection a la sienne (étiquettes B, le rang dans
son point ; le graphique sur deux tiers de la vue d'ensemble) :
<https://claude.ai/artifact/LQomCAjbWUWmmfZgHLCtQc>.
La Présentation d'un club a la sienne (proposition C, « La saison d'abord », et ses versions suivantes) :
<https://claude.ai/artifact/V9bTNBNEmjtxw9NA7VkDkh>.
Les transferts d'un club ont la leur (proposition B, « Les mercatos en registre ») :
<https://claude.ai/artifact/4i36yB8GTgitMjDNd4K7jK>.
Le match en direct a la sienne (but : « Lettres », un reflet après la dernière ; le
score seulement au bandeau) : <https://claude.ai/artifact/3bC1hWU76UP34xpX9ukh5r>.
Les étoiles, les états en paliers et le mode debug ont la leur (couleurs « D », or foncé
et ardoise) : <https://claude.ai/artifact/Kkbr8MeepmpbnckTAp2fsR>.
