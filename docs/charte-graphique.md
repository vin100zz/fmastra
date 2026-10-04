# Charte graphique

Référence unique de l'apparence de Touchline. `docs/ui.md` dit ce que chaque écran
montre ; ce document dit à quoi cela ressemble et comment cela s'écrit. Toute
maquette et tout écran s'y conforment.

| Fichier | Rôle |
|---|---|
| `docs/charte/charte.css` | La feuille de référence : jetons, cadre de l'application, composants. Elle fait foi pour les valeurs |
| `docs/charte/index.html` | Les planches : chaque jeton et chaque composant dessinés avec cette feuille. À ouvrir dans un navigateur |
| `docs/charte/planches.css` | La mise en page des planches ; rien que l'application utilise |

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
  `charte.css`, légende de la planche, règle ici si elle en dépend.
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
| `--panel-3` | Survol |
| `--stripe` | Une ligne de tableau sur deux |
| `--line`, `--row-line` | Bordures ; séparation des lignes |
| `--strong`, `--ink`, `--ink-2`, `--muted` | Encres, de la plus forte au libellé atténué |
| `--accent`, `--accent-ink` | Le jaune de l'application et l'encre écrite dessus : action principale, marque de ce qui est ouvert |
| `--accent-text` | L'accent en texte sur fond blanc |
| `--own-row` | Ligne du club dirigé, ligne choisie |
| `--good`, `--warn`, `--bad`, `--info` et leur `-soft` | États : texte sur son fond pâle |
| `--gk`, `--def`, `--mid`, `--att` | Postes : couleurs pleines, lettres blanches |
| `--pitch-a`, `--pitch-b`, `--pitch-line` | Terrain : deux verts de tonte, lignes |

Trois familles de pastilles ne se ressemblent jamais :

- **Note** : fond pâle gradué et sa bordure, du rouge (jusqu'à 70 sur 200, 4
  sur 20) au jaune (110 ; 10) puis au vert (à partir de 150 ; 16).
- **Poste** : couleur pleine, hors de cette échelle (bleu-vert, indigo, violet,
  magenta), la même pour un poste dans toutes les listes.
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
| Pastilles | `.position`, `.rating`, `.comp`, `.score`, `.form`, `.tag`, `.count` | 18 de haut |
| Club, pays | `.kit-dot`, `.crest`, `.flag`, `.nation` | Voir « Clubs et pays » |
| Jauge, anneau | `.gauge`, `.ring` | Barre de 4 ; anneau pour une part d'un plafond |
| Faits de match | `.mark` | But, cartons, blessure, entrée, sortie |
| Infobulle | `.tooltip` | Voir « Infobulles » |

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
- Chaque colonne a une largeur fixe, et chaque en-tête garde la place de sa
  flèche (après un texte, avant un chiffre) : trier ne déplace aucune colonne.
- En-têtes et lignes de 26 ; chiffres alignés à droite, sous un en-tête aligné
  de même.

### Infobulles

Le composant `.tooltip`, jamais le `title` du navigateur : fond `--strong`,
texte blanc en 13 / 18, détails en 11 / 16, 320 de large au plus, au-dessus de
sa cible (dessous faute de place), une flèche vers elle.

## Migration

Au 4 octobre 2026, l'application (`web/style.css`, `compact.css`, `theme.css`,
`club.css`, `match-replay.css`) ne suit pas encore la charte. Ce qui reste à
aligner :

| Sujet | Aujourd'hui | Charte |
|---|---|---|
| Échelles | 39 tailles de police, 11 graisses, 25 rayons, plus de 30 espacements | 7 tailles, 3 graisses, 1 rayon, 5 espacements |
| Onglets | `.tabs`, `.club-hero-tabs`, `.tabs.europe-cups` (deux rangées sur Coupes d'Europe), `.round-pills`, `.preview-tabs` | `.tabs`, `.segmented`, `.segmented.steps` |
| Terrains | `.pitch`, `.lineup-pitch`, `.side-pitch`, `.pitch.ratings` | `.pitch`, debout ou couché |
| Maillots | `.shirt`, `.shirt.kit`, `.kit-shirt`, `.bench-shirt`, `.live-player-shirt` | `.kit-shirt` |
| Pastilles de poste | Fonds pâles aux teintes de l'échelle des notes | Couleurs pleines hors de cette échelle |
| Pastilles de compétition | Initiales du nom (`competitionCode`, `web/club-calendar.js`) | Codes de deux caractères |
| Nombres | Virgule décimale (`number`, `money`, `price` de `web/ui.js`) ; note moyenne à un chiffre | Point décimal ; moyenne à deux chiffres |
| Classements | Places en fonds colorés sur certains écrans, ordre des colonnes variable | Trait à gauche du rang, ordre fixe |
| En-tête de club | Bandeau de 148, nom en 54 | Bandeau de 88, nom en 40 |
| Clubs, pays | À vérifier écran par écran | Nom toujours précédé de la pastille ou du drapeau |
| Fond | Gris (`#eef1f5`) en thème clair | Blanc |

Les écrans `/squad`, `/composition`, `/match` et `/europe` ont une maquette de
référence à la charte : canevas Design
<https://claude.ai/artifact/MbJqDASJNFF8a6Tu3Lph4a>.
