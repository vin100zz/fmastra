# Logos des sélections nationales

Les 228 logos de https://football-logos.cc/national-teams/ ont été récupérés le
24 octobre 2026. Chaque fichier est un PNG RGBA (transparence d’origine conservée), livré
centré dans un carré de 400 × 400 pixels, puis rogné à ce qu’il dessine, comme les écussons
de `web/clubs` (`tools/trim_logos.py`, qui met aussi à jour les empreintes de `sources.json`) :
le bandeau d’une sélection lit sa forme sur l’image. Le nom du fichier
reprend le pays dans l’URL source. `sources.json` conserve la page, le PNG original,
les codes du jeu associés et l’empreinte SHA-256 du fichier local.

`web/nation-logos.js` associe les codes stables de `data/nations.csv` aux fichiers
(222 nations). Les identifiants négatifs des sélections dépendent des données de
la partie : ils ne servent donc pas de noms de fichiers. Les six logos sans
équivalent dans les données actuelles sont aussi conservés : Catalogne, Vatican,
Kurdistan, Groenland, Nauru et Palaos.

Les associations du Mali (`MLI`), de Saint-Martin français (`X3B`) et de Zanzibar
(`X4B`) sont explicites ; les drapeaux du Mali et de Saint-Martin sont mal
renseignés sur la page source. Saint-Martin néerlandais conserve son logo distinct.
Les nations absentes de la collection gardent leur drapeau dans l’en-tête.

Les fichiers sont servis par le montage statique existant à `/nations/<pays>.png`.
`nationHero` affiche le logo seul sur le bandeau, comme l’écusson d’un club, et le
drapeau après le nom ; sans logo, les initiales restent sur le disque. Les drapeaux des listes, compétitions
et comptes rendus de matchs suivent leurs conventions existantes.

Les logos restent la propriété de leurs fédérations respectives. Informations
sur la licence et les ayants droit : https://football-logos.cc/license/ et les
pages individuelles enregistrées dans `sources.json`.
