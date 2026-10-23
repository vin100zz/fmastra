# Templates RGB — KIT_1 à KIT_57

Chaque `KIT_n.png` reprend le modèle blanc fourni et les zones du motif
`KIT_n.png` conservé dans `reference/`. Les motifs 1 à 55 proviennent de
`C:\V\fmdata\context\kit_patterns` ; les références 56 et 57 ont été ajoutées
directement dans le projet.

- Rouge : couleur principale du kit.
- Vert : couleur secondaire.
- Bleu : troisième couleur.
- 57 PNG RGBA de 1 254 × 1 254 pixels, fond transparent.
- Détails et ombres du tissu conservés.

Ouvrir `index.html` pour comparer les templates avec les petits masques
d'origine, conservés dans `reference/`. La numérotation reste celle de
`HomeKitID` dans le CSV.

Les images sont produites avec l'outil imagegen intégré. Les consignes
communes et le motif demandé pour chaque fichier sont consignés dans
`generation.json`.

Conformément à la demande, les couples symétriques ne font l'objet que d'une
génération. Le second fichier est un miroir horizontal exact du premier :

| Généré | Miroir |
|---|---|
| 8 | 20 |
| 17 | 18 |
| 28 | 43 |
| 31 | 32 |
| 26 | 27 |
| 38 | 39 |
| 46 | 47 |

Les miroirs sont réalisés avec `PIL.ImageOps.mirror`, sans redimensionnement
ni changement de palette ou d'alpha.

Les intitulés sont repris du catalogue source. En cas d’écart entre un
intitulé et le dessin, le masque visuel est la référence pour les couleurs
et les zones du motif.
