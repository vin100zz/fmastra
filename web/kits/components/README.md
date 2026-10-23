# Shorts et chaussettes

`shorts.png` et `socks.png` sont les deux templates fournis, conservés sans modification.
Rouge = couleur principale de la pièce ; vert = couleur secondaire. Les ombres et
la transparence sont conservées par `src/api/kit_images.py`.

Les tenues domicile et extérieur utilisent indépendamment les colonnes `HomeKit`,
`AwayKit`, `HomeShorts`, `AwayShorts`, `HomeSocks` et `AwaySocks` de `data/clubs.csv`.
Les IDs de short et de chaussettes sont conservés ; seul le modèle fourni de chaque
pièce est disponible actuellement. Leurs deux zones n'utilisent pas de troisième couleur.

Les 57 maillots sont composés avec ces pièces dans `../outfits/`. Les exemples
`example-home.png` et `example-away.png` montrent les palettes du PSG et servent
au spécimen de la charte. Pour régénérer les exports, depuis la racine :

```powershell
$env:PYTHONPATH='src'
& .venv/Scripts/python.exe tools/export_outfits.py
```

Le générateur de l'application produit chaque tenue à la demande :
`/kits/{id}/outfit.png`, avec neuf couleurs hexadécimales (maillot, short, chaussettes).
Une tenue extérieure sans données est omise ; les pièces sans palette reprennent
la couleur principale du maillot. Les IDs et palettes du CSV sont appliqués aux
parties existantes à la prochaine requête : actualiser la page après avoir modifié
`data/clubs.csv` suffit, sans recréer la partie ni redémarrer le serveur.
