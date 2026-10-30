# Consignes pour Claude

Le projet est décrit dans `README.md` ; les principes de l'interface sont dans
`docs/ui.md` (« Principes »), son apparence dans `docs/charte-graphique.md`.

## Charte graphique

`docs/charte-graphique.md` est la référence de l'apparence : couleurs,
typographie, mesures, composants, terrain et maillot, graphiques, écriture des
nombres. Sa feuille `docs/charte/charte.css` fait foi pour les valeurs ; ses
planches (`docs/charte/index.html`) les montrent ; `web/charte.css` l'applique
aux écrans. La lire avant toute maquette
et tout travail sur un écran.

- **Toute maquette et tout développement d'interface s'y conforment** : ses
  jetons et ses composants, aucune valeur écrite en dur hors de ses échelles, ses
  conventions d'écriture (point décimal, salaires mensuels, ordre des colonnes
  d'un classement, pastilles de compétition, club après sa pastille, pays après
  son drapeau, colonnes triables de largeur fixe, infobulles, liens non soulignés
  et un seul effet sous le pointeur).
- **Ce que la charte ne couvre pas s'y ajoute dans le même changement**
  (composant, variante, convention) : la règle dans `docs/charte-graphique.md`,
  le style dans `charte.css`, un spécimen sur la planche. Pas de style propre à
  un écran pour ce qui peut resservir.
- **Une demande qui change l'apparence change la charte**, avant ou avec
  l'écran, jamais après.
- Un écran nouveau ou refondu suit la charte ; une fois aligné, il est retiré
  de sa section « Migration ».

## Maquettes

Quand une maquette est demandée, sans qu'il soit besoin de le préciser :

- **À la charte** : la maquette part de `docs/charte/charte.css`, copiée telle
  quelle, sans réécrire ses styles.
- **Thème clair** : fond blanc, jamais le thème sombre.
- **Grand écran** : mise en page pensée pour un écran de bureau large (référence
  1920 × 1080), qui exploite toute la largeur. Pas de version téléphone, sauf
  demande explicite.
- **Minimaliste** : pas de libellé qui explique le jeu ou paraphrase l'écran
  (sous-titre descriptif, phrase d'aide, légende évidente). Une mécanique du jeu
  qui doit être expliquée va dans le manuel du jeu (`docs/manuel/`), pas à
  l'écran.
