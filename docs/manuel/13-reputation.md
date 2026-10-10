# La réputation des clubs

La réputation, de {{monde.reputation.bornes.min}} à {{monde.reputation.bornes.max}}, résume la taille d'un club. Elle est révisée une fois par an, lors du bilan annuel, pour tous les clubs du monde.

## À quoi elle sert

La réputation est le levier le plus puissant du jeu, parce qu'elle entre partout :

- **le revenu** : chaque point ajoute {{pct(exp(ia_gestion.budgets.revenus_club.pente_reputation) - 1, 0)}} au revenu propre du club, donc relève le plafond salarial et le budget de transferts (voir [Finances](#/aide/finances)) ;
- **le niveau visé** par le club, {{ia_gestion.profil_cible.niveau_base * 2}} + {{ia_gestion.profil_cible.poids_reputation * 2}} × réputation, qui fixe ce qu'il cherche sur le marché ;
- **les joueurs qui acceptent de venir**, et ceux qui s'impatientent de rester (voir [Ce qu'un joueur accepte](#/aide/mercato/ce-qu-un-joueur-accepte)) ;
- **les salaires demandés** : venir d'un club plus réputé se paie, y monter aussi ;
- **le moral** des joueurs, pour une petite part ;
- **la justesse du regard** porté sur le potentiel des jeunes (voir [Regens](#/aide/regens/ce-que-les-clubs-voient-du-potentiel)) ;
- **les tirages** : places en coupe nationale, montée depuis les divisions non simulées, chapeaux européens.

## La révision annuelle

Chaque club a une **ancre** : sa réputation à la création de la partie. La révision construit une cible autour de cette ancre, puis rapproche la réputation de la cible.

```
cible = ancre + division + classement + Europe + palmarès
réputation = réputation + {{pct(monde.reputation.lissage, 0)}} × (cible − réputation)
```

| Terme | Valeur |
|---|---|
| Division | +{{monde.reputation.gain_par_division}} par niveau gagné depuis la création de la partie, −{{monde.reputation.gain_par_division}} par niveau perdu |
| Classement | De +{{monde.reputation.amplitude_classement}} pour le premier à −{{monde.reputation.amplitude_classement}} pour le dernier de sa division |
| Qualification européenne | C1 +{{monde.reputation.qualification_europe.C1}}, C3 +{{monde.reputation.qualification_europe.C3}}, C4 +{{monde.reputation.qualification_europe.C4}} |
| Palmarès | Voir ci-dessous |

**Le palmarès.** Chaque titre apporte des points, qui s'estompent : ils sont multipliés par {{monde.reputation.palmares.decroissance}} à chaque saison qui passe.

| Titre | Points l'année du titre |
|---|---:|
| Championnat de premier niveau | {{monde.reputation.palmares.championnat_par_niveau[0]}} |
| Championnat de deuxième niveau | {{monde.reputation.palmares.championnat_par_niveau[1]}} |
| Championnat de troisième niveau | {{monde.reputation.palmares.championnat_par_niveau[2]}} |
| Coupe nationale | {{monde.reputation.palmares.coupe_nationale}} |
| C1 | {{monde.reputation.palmares.coupe_europe.C1}} |
| C3 | {{monde.reputation.palmares.coupe_europe.C3}} |
| C4 | {{monde.reputation.palmares.coupe_europe.C4}} |

## Les plafonds

Deux limites encadrent la cible :

- **Un club ne s'éloigne pas indéfiniment de son ancre** : la cible ne dépasse pas l'ancre de plus de {{monde.reputation.hausse_max}} points.
- **Une division inférieure plafonne ses clubs** : à partir du niveau {{monde.reputation.niveau_min_plafond}}, la cible ne dépasse pas la réputation médiane qu'avaient les clubs de cette division à la création de la partie. La première division n'a pas de plafond.

Conséquences : un grand club relégué perd son surplus de réputation année après année tant qu'il reste en bas, et un petit club promu ne gagne que peu à chaque saison. Construire une réputation prend des années de présence et de résultats au plus haut niveau ; un seul titre ne suffit pas, puisque son effet s'efface.

Un club d'un pays sans championnat simulé ne bouge que par l'Europe et le palmarès.
