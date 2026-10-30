---
name: vccommit
description: Commiter, pousser ou merger le travail en cours. À utiliser dès que la demande porte sur un commit, un push ou un merge (« commite », « commit si c'est bon », « pousse sur main », « merge la branche »).
argument-hint: "[push] [fichiers…]"
effort: low
---

Opération courante : aller droit au but, sans réexplorer le code ni refaire les
vérifications déjà faites dans la session.

- **Seulement les fichiers de la tâche.** D'autres sessions travaillent dans le
  même dossier. `git status --short` d'abord, puis `git add` des fichiers de la
  tâche, nommément, jamais `git add -A` ni `git add .`. Un fichier modifié qui
  ne vient pas de la tâche reste hors du commit et se signale.
- **Message en français**, au format des commits récents : un titre
  « Écran ou sujet : ce qui change », puis un court paragraphe sur le pourquoi,
  en lignes de 72 caractères au plus.
- **Tests** : seulement ceux des fichiers touchés, et seulement s'ils n'ont pas
  tourné depuis la dernière modification (`pytest` sur les tests concernés,
  `node --experimental-detect-module --test tests/frontend/` pour `web/`). Un
  échec dû à la tâche arrête le commit ; un échec antérieur se signale.
- **Push** seulement si la demande le dit. Un merge en conflit : s'arrêter et
  montrer les conflits plutôt que les trancher.
- **Compte rendu** en une ou deux phrases : le hash, ce que le commit contient,
  ce qui est resté en dehors.
