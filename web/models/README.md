# Modèles 3D

`footballer.bin` : le corps des joueurs de la vue 3D (`web/replay-player.js`).

Il vient du maillage de base de MakeHuman 1.x (hm08), de son squelette par
défaut et de ses cibles de morphologie, publiés sous **CC0 1.0** par la
communauté MakeHuman (<https://github.com/makehumancommunity/makehuman>,
`LICENSE.ASSETS.md`). `tools/build_player_model.mjs` le reconstruit ; son
en-tête donne les commandes.

`motions.json` : les foulées capturées des joueurs (`web/replay-locomotion.js`),
un cycle de marche, de footing, de course et de course rapide. Elles viennent de
la base de capture de mouvement du CMU (<http://mocap.cs.cmu.edu>, sujets 9, 16
et 35), libre d'usage, y compris commercial, dans la conversion BVH de Bruce
Hahne. « The data used in this project was obtained from mocap.cs.cmu.edu. The
database was created with funding from NSF EIA-0196217. »
`tools/build_motion_clips.mjs` le reconstruit.
