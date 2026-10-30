---
name: vcdesign
description: "Travail de design sur l'interface : maquette, mockup, pistes visuelles, nouvel écran ou refonte, critique ou polissage visuel d'un écran. À utiliser dès qu'il faut concevoir ou repenser l'apparence d'un écran, pas pour une petite correction de CSS."
effort: high
---

La charte (`CLAUDE.md`, « Charte graphique ») s'applique à tout ce qui suit.

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

## Impeccable

Le skill `impeccable` sert ici, et seulement ici : critique, audit, polissage.
Son contrôle automatique après chaque modification est coupé dans ce projet
(`hook.enabled: false` dans `.impeccable/config.json`). À la place, une fois le
travail terminé, lancer une seule fois son détecteur (`scripts/impeccable
detect` du skill impeccable) sur les fichiers d'interface modifiés. Une alerte
sur une ligne que la tâche n'a pas touchée se signale, sans enquête ni
correction.
