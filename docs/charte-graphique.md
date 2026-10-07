# Charte graphique

Référence unique de l'apparence de Touchline. `docs/ui.md` dit ce que chaque écran
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
| `--series-1` | Le trait et les points d'une courbe |

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
| `--fs-title` | 20 / 24 | 700 | Chiffre clé, date du jour |
| `--fs-figure` | 16 / 20 | 700 | Action principale, délai |
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
| Hauteurs | Barre du haut 48 · onglets 36 · titre de carte 32 · contrôle 28, 22 dans une carte ou une ligne · ligne et en-tête de tableau 26 · pastille 18 |
| Formes | Rayon de 3 (`--radius`), ou rond (points, écussons) |
| Traits | Bordure de 1 ; ce qui est ouvert porte l'accent : 3 sur une barre, le menu, les onglets (`--mark`), 2 sur un contrôle (`--mark-control`) |

## Composants

| Composant | Classes | Règle |
|---|---|---|
| Onglets d'une page | `.tabs` | Une seule rangée par écran. Soulignés de l'accent, ou de la couleur du club sur sa fiche |
| Choix d'une vue | `.segmented`, `.small` | Sur la ligne du titre ou dans l'en-tête d'une carte : coupe d'Europe, derniers ou prochains matches, tactique, colonnes |
| Pas d'une série | `.segmented.steps` | Journées, saisons |
| Bouton | `.button`, `.primary`, `.danger`, `.square`, `.small` | Carré, 28 ; 22 dans une carte ou une ligne |
| Action principale | `.cta` | Une seule par écran |
| Champ | `.field` | Recherche, liste déroulante |
| En-tête de page | `.page-heading`, `.page-title`, `.tools` | Le titre, ses commandes sur la même ligne, à droite |
| En-tête de club | `.hero` | Bandeau de 88 aux couleurs du club, ses onglets dessous |
| Carte | `.card`, `.card-head`, `.card-body`, `.section-title` | Titre en capitales ; lien ou commandes à droite |
| Tableau | `.table`, `.tr`, `.tr.head` | Voir « Tableaux » |
| Fait, tuile | `.fact`, `.tile` | Libellé atténué, valeur forte |
| Pastilles | `.position`, `.rating`, `.comp`, `.score`, `.form`, `.tag`, `.count` | 18 de haut ; un poste, 32 de large |
| Club, pays | `.kit-dot`, `.crest`, `.flag`, `.nation` | Voir « Clubs et pays » |
| Deux camps comparés, jauge, anneau | `.comparison`, `.gauge`, `.ring` | Voir « Graphiques » |
| Classement au fil des saisons | `.club-chart`, `.rank-zone` | Voir « Graphiques » |
| Faits de match | `.mark` | But, cartons, blessure, entrée, sortie |
| Infobulle | `.tooltip` | Voir « Infobulles » |
| Recherche globale | `.palette`, `.palette-head`, `.results`, `.result` ; `.veil` dans une maquette | Voir « Recherche globale » |
| Lien | `a`, `.prose a` | Voir « Sous le pointeur » |

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
| Bouton, option d'un choix, pas d'une série, filtre, entrée du menu | Son fond | `--panel-3`, encre `--strong` ; `--accent-hover` pour l'action principale, `--bad-soft` pour `.danger` |
| Onglet, en-tête de colonne | `--muted` | `--strong` |
| Joueur sur un terrain | Son nom | Son nom souligné |

- Une pastille qui mène quelque part (le score d'un match) est un lien : son
  texte se souligne, son fond ne change pas.
- Dans une carte dont l'en-tête entier ouvre une page, c'est son lien
  « Voir → » qui se souligne.
- Un graphique garde ses propres réactions (repère, infobulle) : voir
  « Graphiques ».

### Recherche globale

Un bouton carré à la loupe, dans la barre du haut à gauche des prochains matchs,
et le raccourci Ctrl K ouvrent une boîte de 720 de large sur la page voilée
(`--backdrop`), à 96 du haut.

- **Tête** : une barre de 48, soulignée de l'accent : la loupe, la saisie en 16,
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

## Terrain et maillot

Un seul terrain et un seul joueur, sur tous les écrans.

- **Terrain** (`.pitch`) : proportions 68 × 88, douze bandes de tonte, lignes de
  1.5 à 8 du bord. Debout (l'équipe attaque vers le haut) ou couché
  (`.pitch.lying`, vers la droite, latéral gauche en haut) : mêmes herbe, lignes
  et maillots.
- **Maillot** (`.kit-shirt`) : 32, aux couleurs du club (corps dans la première,
  manches dans la seconde), un contour autour, aucun trait entre le corps et les
  manches. Le poste est écrit dessus, dans l'encre lisible sur le corps. La
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
- Au-dessus des lignes, chaque camp est nommé de son côté, après sa pastille.

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

### Jauge, anneau

- **Jauge** (`.gauge`) : 40 × 4, à côté d'un chiffre (condition, fatigue, part
  d'un plafond) ; verte, jaune (`.warn`) ou rouge (`.bad`).
- **Anneau** (`.ring`) : 56, la part d'un plafond écrite en son centre ; rouge à
  partir de 95 % (`.ring.full`).

## Conventions d'écriture

### Nombres

Le séparateur décimal est le point, pour tous les nombres : notes, montants,
moyennes, buts attendus.

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
| Onglets | `.tabs` partout, en-tête de club compris ; sur Coupes d'Europe, la coupe se choisit en `.segmented` sur la ligne du titre |
| Terrain et maillot | `.pitch` (debout ou couché) et `.kit-shirt` sur la composition, le match, le dernier onze, les aptitudes et le direct (`kitShirt`, `pitch`, `web/ui.js`) |
| Pastilles | Postes pleins ; compétitions en deux caractères (`competitionCode`, `web/ui.js`) ; notes, scores, statuts à 18 |
| Nombres | Point décimal, notes à un et deux chiffres, montants en €, k€, M€ (`number`, `matchNote`, `averageNote`, `amount`), y compris dans le manuel |
| Classements | Trait à gauche du rang, ordre des colonnes unique |
| En-tête de club | Bandeau de 88, nom en 40 |
| Le match en chiffres | `.comparison`, couleurs calculées (`chartColours`, `web/ui.js`) |
| Tableaux | Toutes les colonnes se trient (`sortValue`), flèche dans la marge |
| Pays | Drapeau dans le menu et sur la Vue d'ensemble |
| Sous le pointeur | Une seule règle pour les liens, les lignes et les commandes, dans `web/charte.css` ; les autres feuilles n'en disent plus rien (`tests/frontend/charte.test.mjs`) |
| Palmarès | Pastilles de compétition de la charte (`competitionBadge`), filtres de poste aux couleurs des postes |
| Classement au fil des saisons | Un étage par division, places aux couleurs du classement, libellés à l'encre (`rankChart`, `web/club-history.js`) |

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
sienne (proposition B) : <https://claude.ai/artifact/JMuUqZ4JkvAsYQMh6uJoNU>.
