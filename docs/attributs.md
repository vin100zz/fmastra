# Attributs et composites

> Toutes les valeurs numériques de ce document sont dans `config/attributs.json` et `config/implications.json`.
> Les tableaux ci-dessous documentent les valeurs initiales ; la source de
> vérité est le JSON. Aucune constante ne doit apparaître dans le code.

## Principe

Les transitions collectives de progression et création traversent trois étages :

```
attribut → composite (par phase de jeu)
         → agrégat d'équipe (par zone et couloir)
         → probabilité de transition
```

Le même attribut sert à plusieurs endroits avec des poids différents. La vitesse
pèse lourd en contre, peu en progression placée, pas du tout sur un tir.
Les duels de tir utilisent les composites individuels ; endurance, vision,
vitesse et relance peuvent aussi moduler les règles explicitement décrites de
fatigue, changement de couloir, contre ou remise en jeu. `centre` et `cpa` fixent le xG
de l'action de leur exécutant, `penalty` le tireur et la réussite d'un penalty. Aucun attribut décoratif.

## Les 16 attributs

Échelle 1-100. Conserver des flottants en mémoire pour préserver les évolutions
mensuelles ; toute valeur affichée est arrondie à un entier.

### Techniques

| Attribut | Utilisé dans |
|---|---|
| `passe` | progression, création d'occasion |
| `technique` | progression, création, tir |
| `finition` | résolution du tir |
| `tacle` | défense, toutes zones |
| `jeu_tete` | centres, coups de pied arrêtés |
| `centre` | qualité du centre : xG de la tête qui suit |
| `cpa` | qualité des coups de pied arrêtés : tireur et xG des corners, tir des coups francs directs |
| `penalty` | choix du tireur et réussite d'un penalty, en match comme aux tirs au but |

### Mentaux

| Attribut | Utilisé dans |
|---|---|
| `vision` | création d'occasion, changement d'aile |
| `placement` | défense, position du gardien |
| `sang_froid` | tir, tête, penalty |

### Physiques

| Attribut | Utilisé dans |
|---|---|
| `vitesse` | progression, contres, replis défensifs |
| `endurance` | pente de la courbe de fatigue |

### Gardien

Attributs dédiés : sans eux, le gardien est noté sur des critères qui ne le
concernent pas et sa valorisation par l'IA est absurde.

| Attribut | Utilisé dans |
|---|---|
| `reflexes` | arrêt |
| `sorties` | centres, coups de pied arrêtés |
| `relance` | zone de départ après remise en jeu par le gardien |

## Ce qui est délibérément exclu

Leadership, esprit d'équipe, flair, pied faible, marquage distinct de
l'interception, spécialiste corners distinct du spécialiste coups francs (une seule
compétence `cpa`, moyenne de Corners et FreeKicks, corrélées à 0,78), duels aériens
entre joueurs nommés, tirs de loin, dribble.

**Règle d'ajout** : pour ajouter un attribut, il faut pouvoir nommer en une
phrase la transition exacte qu'il modifie et son poids dans le composite. Sinon
il est décoratif — il apparaîtra sur la fiche du joueur sans jamais changer un
résultat.

## Traits stables (ni attributs, ni états)

Trois valeurs propres au joueur, fixées une fois, conservées dans la sauvegarde et
**jamais modifiées par la progression** : elles décrivent un caractère, pas un niveau.

| Trait | Source à l'import | Effet |
|---|---|---|
| `fragility` | note `InjuryProneness` | multiplie le risque de blessure (voir `docs/etats-joueur.md`) |
| `ego` | note `Ambition` | demandes de contrat et frustration d'ambition (voir `docs/ia-gestion.md`) |
| `aggression` | moyenne des notes `Aggression` et `Dirtiness` | poids du joueur dans le tirage du fautif, donc de ses cartons |

Chaque note source est convertie par morceaux : la note basse vaut le minimum, la
note de référence (la moyenne de la source) la valeur neutre, la note haute le maximum.
La moyenne reste ainsi celle des anciens tirages uniformes et les calibrages des
blessures et des contrats ne bougent pas. Les regens tirent leurs traits : fragilité
et ego uniformes, agressivité triangulaire centrée sur le facteur neutre 1.
Si la colonne manque à la source, l'import retombe sur l'ancien tirage (fragilité,
ego) ou sur le facteur neutre (agressivité).

## États (multiplicateurs, pas des attributs)

| État | Plage | Effet |
|---|---|---|
| `forme` | 0.7 – 1.3 | multiplie tous les composites |
| `fatigue` | 0.0 – 1.0 | multiplie tous les composites, 1.0 = frais |
| `moral` | 0.0 – 1.0 | multiplie faiblement, amplitude ±5 % maximum |

Voir `docs/etats-joueur.md` pour leur dynamique.

## Composites

Chaque composite est une combinaison linéaire d'attributs, normalisée sur 1-100.

### Progression

```python
comp_prog_att = 0.45*passe + 0.30*technique + 0.15*vision + 0.10*vitesse
comp_prog_def = 0.45*placement + 0.35*tacle + 0.20*vitesse
```

### Création d'occasion

```python
comp_occ_att = 0.50*vision + 0.30*technique + 0.20*passe
comp_occ_def = 0.60*placement + 0.40*tacle
```

### Tir (individuel, pas agrégé)

```python
comp_tir = 0.60*finition + 0.25*sang_froid + 0.15*technique
comp_arret = 0.70*reflexes + 0.30*placement
```

### Affichage et note au poste

Les écrans montrent les huit composites sur 200, comme le niveau (fiche joueur, vue Jeu des listes
et de la composition). Pour chaque poste, l'API retient ceux qu'il demande surtout, d'après
l'implication du poste dans chaque phase (`implications.json`) et le choix du tireur
(`COMPOSITES_BY_POSITION` dans `src/api/views.py`, liste d'affichage qu'aucun match ne lit). La note
au poste en est la moyenne, multipliée par le facteur hors poste du moteur :

```python
note_poste = moyenne(composites_du_poste) * (malus_hors_poste.base + malus_hors_poste.facteur * affinite)
```

Elle ne tient compte ni de la forme, ni du moral, ni de la fraîcheur, et donne le même poids à chaque
composite du poste.

### Livraison : centre et coups de pied arrêtés (individuel)

`centre` et `cpa` ne forment pas un composite : ils décrivent la qualité du geste,
pas le duel qui suit. Une meilleure livraison rend la même occasion plus dangereuse.

```python
qualite = attribut * fraicheur * forme * moral * affinite       # comme un composite
xg_centre = sigmoide(logit(xg_base_centre) + s * (qualite_centreur - niveau_reference_centre))
xg_corner = sigmoide(logit(xg_base_corner) + s * (qualite_tireur - niveau_reference_cpa))
tir_coup_franc = composite_tir_tireur + (qualite_cpa_tireur - niveau_reference_coup_franc)
```

`s` vaut `occasion.sensibilite_livraison` (0,02 par point, soit environ ±25 % de xG
pour un écart d'un écart-type). Les niveaux de référence sont des qualités
**effectives** mesurées sur de vrais effectifs, fatigue comprise : un joueur à la
référence laisse le taux moyen de but inchangé. Le tireur de corner et de coup franc
est le meilleur `cpa` du terrain, gardien exclu (égalité : plus petit ID) ; le tireur
de corner ne peut pas être aussi le receveur. Le coup franc n'a pas de xG modulé :
le tireur frappe avec son propre composite de tir, majoré des points de `cpa` au-delà
de la référence, contre le composite d'arrêt du gardien.

### Penalty (individuel)

Un composite, comme le tir, que les écrans ne montrent pas parmi les huit : l'attribut
`penalty` (colonne Penalties de la source) pour l'essentiel, le sang-froid pour le reste.

```python
comp_penalty = 0.75*penalty + 0.25*sang_froid
p_but = borne(reussite_base + sensibilite * (comp_penalty_tireur - reflexes_gardien), min, max)
```

Le tireur est le meilleur `comp_penalty` du terrain, gardien exclu (égalité : plus petit ID).
Aux tirs au but, les tireurs passent dans l'ordre de ce composite, avec la même probabilité
(`moteur_match.penalty`). Le composite ne lit ni la forme ni la fraîcheur, et `penalty` ne
compte pas dans la note globale. Sur de vrais effectifs (216 clubs simulés, onze de départ),
le tireur ainsi choisi est le même que celui de l'ancienne règle (moyenne de la finition et
du sang-froid) dans 94 clubs ; l'écart moyen entre le tireur et le gardien ne bouge presque
pas (−5,2 contre −5,3 points) et `reussite_base` reste à 0,75. Il passe d'un écart-type de 7,7 à 9,3 :
les spécialistes se distinguent davantage.

Mesures (25 octobre 2026, mêmes graines qu'avant l'attribut) : `stats_match` sur 10 000 matchs
reste dans toutes ses cibles (0,150 penalty par équipe, 1,43 but, 28,6 % de buts sur coups de
pied arrêtés) ; sur 3 000 matchs, les penaltys du panel synthétique réussissent à 76,1 %
contre 77,3 % avant (environ 890 penaltys, un écart-type de 1,4 point), l'avant-centre les
tirant tant qu'il est sur le terrain. Les affiches de la suite `match` ne bougent pas au-delà
de 0,3 point, ni la suite `season` (10 itérations : 2,02 points par match pour le champion,
corrélation réputation / classement 0,46, 43 % de titres pour l'équipe la plus forte).

### Centre et tête (individuel)

```python
comp_tete = 0.65*jeu_tete + 0.20*placement + 0.15*sang_froid
comp_sortie = 0.60*sorties + 0.40*placement
```

## Collectif ou individuel

Distinction structurante, à respecter strictement :

| Transition | Résolution |
|---|---|
| Progression | agrégat de zone (collectif) |
| Création d'occasion | agrégat de zone (collectif) |
| Tir | **deux joueurs nommés** : tireur contre gardien |
| Tête sur centre | **deux joueurs nommés** : réceptionneur contre gardien ; le centreur fixe le xG |
| Corner, coup franc direct | l'exécutant fixe le xG (corner) ou le tir (coup franc) |

Si le tir est résolu sur un agrégat, un buteur à 90 de finition disparaît dans la
moyenne de l'équipe. Le tireur est tiré au sort, pondéré par son implication dans
la zone et le couloir concernés.

## Matrice d'implication

Chaque joueur porte deux vecteurs, dérivés de son poste. Ils sont **séparables** :

```python
impl[j][zone][couloir] = impl_vert[j][zone] * impl_lat[j][couloir]
```

Sept nombres par joueur et par phase (4 verticaux + 3 latéraux) au lieu de douze.

### Implication verticale — attaque

Zones : 1 défense, 2 milieu bas, 3 milieu haut, 4 zone de vérité.

| Poste | Z1 | Z2 | Z3 | Z4 |
|---|---|---|---|---|
| GB | 0.10 | 0.05 | 0.00 | 0.00 |
| DC | 0.30 | 0.25 | 0.05 | 0.05 |
| DG / DD | 0.25 | 0.40 | 0.30 | 0.10 |
| MDC | 0.20 | 0.55 | 0.30 | 0.05 |
| MC | 0.10 | 0.45 | 0.50 | 0.15 |
| MOC | 0.05 | 0.25 | 0.60 | 0.40 |
| AIL | 0.05 | 0.20 | 0.55 | 0.55 |
| BU | 0.00 | 0.05 | 0.35 | 0.80 |

### Implication verticale — défense

| Poste | Z1 | Z2 | Z3 | Z4 |
|---|---|---|---|---|
| GB | 0.90 | 0.05 | 0.00 | 0.00 |
| DC | 0.85 | 0.35 | 0.05 | 0.00 |
| DG / DD | 0.70 | 0.45 | 0.15 | 0.00 |
| MDC | 0.45 | 0.70 | 0.25 | 0.00 |
| MC | 0.25 | 0.60 | 0.35 | 0.05 |
| MOC | 0.10 | 0.30 | 0.35 | 0.10 |
| AIL | 0.05 | 0.25 | 0.30 | 0.10 |
| BU | 0.00 | 0.05 | 0.20 | 0.15 |

Attaque et défense sont stockées dans le repère local de chaque équipe, depuis
son propre but. Pour opposer attaque et défense adverse, inverser les zones
**et** les couloirs, comme spécifié dans `docs/moteur-match.md`.

### Implication latérale

Couloirs : gauche, axe, droite.

| Poste | G | A | D |
|---|---|---|---|
| GB | 0.20 | 0.60 | 0.20 |
| DC | 0.25 | 0.50 | 0.25 |
| DG | 0.75 | 0.25 | 0.00 |
| DD | 0.00 | 0.25 | 0.75 |
| MDC / MC | 0.20 | 0.60 | 0.20 |
| MOC | 0.20 | 0.60 | 0.20 |
| AIL G | 0.70 | 0.30 | 0.00 |
| AIL D | 0.00 | 0.30 | 0.70 |
| BU | 0.15 | 0.70 | 0.15 |

## Joueur hors poste

Un joueur aligné à un poste qui n'est pas le sien subit un malus multiplicatif
sur ses composites :

```python
affinite = joueur.aptitudes_par_poste[poste] / 20
malus = 0.70 + 0.30 * affinite
```

Importées ou tirées à la génération, les aptitudes vont de 1 à 20 : un joueur étranger
au poste (1) conserve 71,5 % de son niveau. Il utilise la matrice
d'implication du poste **où il est aligné**, pas du sien.

## Profils d'attributs à la génération

Les attributs d'un regen se répartissent autour de son niveau cible selon un
profil de poste, avec du bruit. Deux joueurs de même note globale doivent avoir
des profils différents — c'est ce qui rend les choix de recrutement intéressants.

Décalages par rapport au niveau cible, en points :

| Poste | Attributs renforcés | Attributs affaiblis |
|---|---|---|
| GB | reflexes +15, sorties +12, relance +8 | tous les autres −25 |
| DC | tacle +12, placement +10, jeu_tete +10 | finition −18, vision −8 |
| DG/DD | vitesse +10, endurance +8, passe +5 | finition −15, jeu_tete −8 |
| MDC | tacle +10, placement +10, passe +8 | finition −12 |
| MC | passe +12, vision +8, endurance +8 | jeu_tete −6 |
| MOC | vision +14, technique +12, passe +8 | tacle −15 |
| AIL | vitesse +14, technique +12 | tacle −12, jeu_tete −8 |
| BU | finition +16, sang_froid +10, jeu_tete +6 | tacle −18, placement −10 |

Les décalages `centre`, `cpa` et `penalty` sont relevés sur les joueurs importés des clubs actifs
(moyenne de l'attribut moins moyenne de la note globale du poste) :

| Poste | centre | cpa | penalty | Poste | centre | cpa | penalty |
|---|---:|---:|---:|---|---:|---:|---:|
| DC | −27 | −37 | −30 | MOC | −10 | −11 | −12 |
| DG | +1 | −17 | −23 | AILG | −6 | −15 | −14 |
| DD | −2 | −24 | −24 | AILD | −4 | −15 | −15 |
| MDC | −19 | −20 | −21 | BU | −20 | −25 | −7 |
| MC | −14 | −16 | −16 | GB | −25 | −25 | −25 (`_autres`) |

Ajouter ensuite le bruit gaussien configuré. Recentrer le profil obtenu en
retranchant l'écart entre sa note globale pondérée et le niveau cible, puis
borner à [1, 100]. Répéter le recentrage sur les attributs encore ajustables
jusqu'à la précision numérique visée ou à saturation des bornes. Ne pas
ajouter automatiquement les bonus de profil à la note globale cible : un
buteur ne doit pas gagner plusieurs points de niveau sans compensation.

Vérifier le niveau global final et la limite de potentiel après application
des bornes. La croissance est plafonnée sur la note globale, pas sur chaque
attribut pris séparément ; un spécialiste peut avoir un attribut supérieur à
son potentiel global. Les états et malus de poste s'appliquent **une seule
fois** : conserver les composites de base et leurs versions effectives séparés.
