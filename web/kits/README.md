# Tenues des clubs

Les 57 maillots RGB de `templates/KIT_1.png` à `KIT_57.png` sont associés directement
aux IDs du CSV. Les codes inconnus utilisent le modèle uni (1). `patterns.png`
conserve la planche historique de six motifs ; elle n'est plus utilisée au rendu.

`src/api/kit_images.py` recolore les zones rouges, vertes et bleues en conservant
le tissu et l'alpha, puis compose les maillots avec `components/shorts.png` et
`components/socks.png`. Chaque pièce utilise sa propre palette, à domicile comme
à l'extérieur. Les données proviennent de `data/clubs.csv` ; aucun accès au
dossier `fmdata` n'est nécessaire à l'exécution.

Le serveur produit les PNG transparents à la demande et conserve 128 rendus par
type en mémoire. `/kits/{id}.png` sert le maillot seul ; `/kits/{id}/outfit.png`
sert la tenue complète en 320 × 725. Les images de la hero bar ouvrent le PNG agrandi.
Le paramètre `club_id` ajoute `web/clubs/TCM1_{club_id}.png` côté cœur, après
recoloration du tissu. Le logo conserve ses couleurs, ses proportions et son alpha ;
un fichier absent laisse le maillot sans écusson. Le cache distingue les clubs.

Une couleur secondaire manquante reprend la principale ; la troisième reprend
la secondaire. Une pièce sans palette reprend la couleur principale du maillot.
Sans couleur principale du maillot, le gris `#8A9193` est utilisé. Une tenue
extérieure sans données reste absente.

Les IDs et couleurs des six pièces sont relus depuis `data/clubs.csv` dès que
le fichier change. Ils remplacent l’apparence enregistrée dans toute partie,
y compris une ancienne sauvegarde, à la prochaine requête de l’interface.
Après enregistrement du CSV, actualiser la page suffit : aucun redémarrage ni
nouvelle partie n’est nécessaire. Le choix du club avant création et la liste
des sauvegardes utilisent aussi les couleurs courantes. Le moteur de simulation
et la progression de la partie restent inchangés.

Le fichier est mis en cache tant que sa date de modification et sa taille ne
changent pas. Un club absent du CSV conserve ses données de sauvegarde ; un CSV
temporairement illisible pendant son enregistrement conserve le dernier catalogue
valide. Les champs vides et les indicateurs `Has…Data=False` effacent la pièce
concernée ou activent les couleurs de repli décrites ci-dessus. Les PNG d’exemple
de la galerie restent des exports à régénérer avec `tools/export_outfits.py`.

La galerie `outfits/index.html` et `reports/kit-outfits-rgb.zip` sont produits par
`tools/export_outfits.py`. Les 57 tenues RGB et six exemples domicile/extérieur
(PSG, OM et Lens) sont inclus. Voir `components/README.md` pour les pièces fournies.

Pour étendre la collection, ajouter un fichier `templates/KIT_{id}.png`, mettre à
jour le catalogue et `PATTERN_COUNT`. Les couleurs et IDs des shorts et chaussettes
sont conservés ; seul leur modèle graphique fourni est disponible actuellement.
