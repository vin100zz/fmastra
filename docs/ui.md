# Interface

## Contrainte v1

L'utilisateur est **observateur**. Aucun écran n'a de bouton d'action sur un
club : pas de composition à valider, pas d'offre à émettre. L'interface sert à
consulter et à faire avancer le temps.

Cela n'autorise pas à mélanger lecture et décision dans le code : les endpoints
sont déjà organisés pour qu'ajouter le contrôle utilisateur consiste à ajouter
des routes d'action et une gestion de l'attente, en préservant les vues de lecture.

Afficher à la création le rapport d'import : au maximum 30 joueurs par club,
classement par niveau estimé avec places réservées aux gardiens, joueurs écartés,
agents libres et corrections de données. Les niveaux, potentiels et finances
issus de la synthèse sont signalés comme estimés.

## Principes

**Penser en vues, pas en entités.** Un endpoint renvoie exactement ce qu'un écran
affiche, plutôt qu'un REST générique qui obligerait le front à faire quarante
requêtes pour reconstituer une page.

**Filtrage, tri et pagination côté serveur.** Ne jamais renvoyer tous les joueurs
au navigateur. Toute liste est paginée, y compris la recherche de joueurs qui
porte sur l'ensemble des clubs, actifs et dormants. Seules les courtes listes
renvoyées en entier (les transferts ou le journal financier d'une saison, les
classements archivés, les saisons d'un club sur la page affichée) se trient dans
le navigateur ; le choix survit aux
rafraîchissements de l'écran.

**Interface minimaliste.** Pas de texte explicatif : pas de sous-titre sous un
titre de carte, pas de ligne qui décrit comment une donnée est calculée ou
reconstituée. Un élément secondaire se replie derrière un bouton plutôt que
d'occuper une barre vide, et un bouton reprend le style des autres (carré, même
hauteur) plutôt qu'une forme propre.

**Code couleur constant.** Gardien, défense, milieu, attaque gardent la même
teinte partout, de la liste d'effectif au terrain. C'est ce qui permet de lire
une composition en une seconde.

**Trois chiffres par ligne de joueur.** Âge, salaire, fin de contrat. Une
échéance à moins de 12 mois passe en rouge. C'est la liste de tâches implicite,
et elle remplace tous les écrans de gestion supprimés.

## Contrôle du temps

Barre persistante en tête d'application :

- Date courante, saison, prochaine échéance
- Boutons : avancer d'un jour, avancer à la prochaine journée de championnat,
  avancer à la fin de la fenêtre de mercato
- Journal des événements du jour : résultats, transferts, blessures

Une avance longue renvoie un identifiant de travail et une progression.
Désactiver les commandes incompatibles tant qu'elle est active ; les vues
lisent le dernier état cohérent validé. Une consultation ne tire aucun nouvel
aléa de simulation. Les estimations affichées restent stables sur leur période
d'observation.

## Écrans

### Titres de page

Une page n'affiche que son titre, sans ligne au-dessus ni au-dessous. Ce titre est
celui de son entrée dans le menu de gauche : Vue d'ensemble, Clubs, Joueurs, Mercato
mondial, Palmarès, Coupes d'Europe, Ma partie, ou le nom du pays pour la page d'un
pays. Le Journal, onglet de Vue d'ensemble, porte ce même titre et allume la même
entrée du menu. Les pages championnat et coupe nationale portent le nom de la
compétition. Les fiches club et joueur gardent leur en-tête d'identité (nationalités,
poste, âge, club, stade), qui présente des données et non un titre.

### Navigation entre pairs

Les fiches club, joueur, championnat et coupe nationale portent, dans l'en-tête et à
gauche du nom, un petit bloc vertical qui n'ajoute aucune ligne : un triangle haut
(pair précédent), un menu ☰ (tous les pairs) et un triangle bas (pair suivant). Le
menu est une liste flottante de liens, ouverte sur l'élément courant, avec « n / total » en
tête ; elle se ferme sur un clic ailleurs, sur un choix ou sur Échap, et reste ouverte
quand le mode Auto redessine l'écran. Le premier et le dernier n'ont pas de lien de leur
côté : leur triangle est grisé. Un groupe d'un seul élément n'affiche pas le bloc.

| Fiche | Groupe parcouru | Ordre |
|---|---|---|
| Club | clubs de la même division ; sans division, tous les clubs du pays | alphabétique, sans accents ni casse |
| Joueur | effectif du club du joueur (rien pour un retraité ou un agent libre) | poste (gardiens d'abord), puis nom |
| Compétition | compétitions du même pays | divisions de la plus haute à la plus basse, puis coupe |

Changer de club conserve l'onglet ouvert (Finances reste sur Finances). Les clubs
homonymes de la source (un club et son doublon sans joueurs) affichent leur effectif
entre parenthèses. Dans le menu des joueurs, chaque nom est précédé de la couleur de son poste. Les coupes d'Europe gardent leurs onglets de coupe.

### Club

| Onglet | Contenu |
|---|---|
| Effectif | blocs d'entrée puis liste triable : poste, nom, nationalités, âge, note, potentiel exact, valeur, salaire, fin de contrat, état (blessé, suspendu, fatigue), matches, buts, passes, cartons, note moyenne |
| Calendrier | matches passés et à venir, résultat, adversaire, domicile/extérieur |
| Budget | budget de transfert, masse salariale et plafond, solde, revenus |
| Transferts | arrivées et départs de la saison, avec montants |
| Historique | une ligne par saison terminée (championnat, rang, réputation à l'ouverture et sa variation, coupe nationale, coupe d'Europe, titre), les 15 joueurs les plus utilisés et les 15 meilleurs buteurs du club, ses 10 plus gros transferts entrants et sortants |

En-tête : nom, pays, compétition, réputation, classement actuel, forme sur les
5 derniers matches.

L'onglet Historique ne reprend pas les classements complets (ils restent dans l'historique de
la compétition) et n'affiche pas de compteur « N résultats » sous le tableau ; la pagination
n'apparaît qu'au-delà de 30 saisons. Chaque saison terminée donne le niveau atteint en coupe
nationale (32es de finale à finale, ou « Vainqueur ») et en coupe d'Europe (phase de ligue,
barrages, huitièmes, quarts, demi-finales, finale, ou « Vainqueur ») ; les deux manches d'une
confrontation comptent pour un seul tour, et « — » signale une coupe non jouée. Un club sans
championnat simulé garde les lignes de ses saisons de coupe. Les colonnes se trient, les coupes
par profondeur du parcours. Dessous, deux classements de 15 joueurs (matches, puis buts) additionnent
toutes les compétitions et toutes les saisons, saison en cours comprise, pour ce seul club ; à
égalité de matches, le meilleur buteur passe devant, à égalité de buts celui qui a joué le moins.
Enfin, les 10 plus gros transferts payants du club (arrivées, puis départs) sont classés par
indemnité décroissante, les plus récents en premier à montant égal ; les départs libres sont exclus.

L'onglet Effectif est le point d'entrée du club. Quatre petits blocs précèdent la
liste, sur une seule ligne (deux par deux sous 1330 px, empilés sur téléphone),
chacun renvoyant vers l'onglet ou le match qu'il résume :

| Bloc | Contenu | Lien |
|---|---|---|
| Calendrier | 5 derniers matches (résultat coloré V/N/D, adversaire, avion rouge à l'extérieur, compétition hors championnat sur la même ligne), puis 3 prochains, sans intertitres | onglet Calendrier |
| Finances | budget de transferts disponible (hors offres en cours), masse salariale mensuelle, plafond et part utilisée | onglet Finances |
| Transferts | les 3 dernières arrivées et les 3 derniers départs de la saison en cours (joueur, club et montant sur une ligne) avec totaux ; les autres mouvements (jeunes promus, fins de contrat, retraites) sont comptés | onglet Transferts |
| Dernier onze aligné | le onze du dernier match dont la composition est conservée, sur le terrain du compte rendu (noms réduits au nom de famille) ; maillot en couleur primaire du club, note du match en couleur secondaire (avec un halo quand elle se lit mal sur la primaire) | compositions du match |

Toutes les colonnes de la liste se trient, sur ce qu'elles affichent : le nom sans
tenir compte des accents ou des majuscules, les nationalités par leur code affiché,
l'état du plus indisponible (blessé, puis suspendu) au plus frais. Il n'y a pas de
colonne de minutes jouées. Les tableaux des autres onglets (transferts, journal
financier, saisons du club et classements archivés) se trient aussi.

### Compétition

| Onglet | Contenu |
|---|---|
| Classement | position, J, V, N, D, BP, BC, différence, points, forme |
| Calendrier | matches par journée, avec résultats |
| Statistiques | meilleurs buteurs, passeurs, meilleures notes moyennes, clean sheets, cartons |
| Historique | champions par saison, meilleur buteur par saison, puis les 15 joueurs les plus utilisés et les 15 meilleurs buteurs de tous les temps du championnat, puis les classements archivés |

L'onglet Palmarès d'une coupe nationale ou d'une coupe d'Europe (vainqueurs par saison) se termine par
les mêmes deux classements de 15 joueurs. Ils additionnent toutes les saisons, la saison en cours
comprise, et tous les clubs qu'un joueur a servis dans cette seule compétition (les matches et
buts d'une autre compétition ne comptent pas) ; l'égalité se départage comme pour l'historique
d'un club.

### Palmarès

Le lien **Palmarès** du menu de gauche (`#/honours`) réunit sur une page les vainqueurs
de toutes les compétitions, sur toutes les saisons archivées. Une rangée de blocs par
groupe : d'abord les trois coupes d'Europe (C1, C3, C4), puis chaque pays dans l'ordre
du menu (France, Angleterre, Espagne, Italie, Allemagne) avec un bloc par division, de
la D1 vers le bas, suivi du bloc de la coupe nationale. Chaque bloc est un tableau
saison / champion, la saison la plus récente en premier, qui défile dans le bloc quand
il s'allonge, et renvoie par « Historique → » à l'onglet de la compétition. Une
compétition sans vainqueur (début de partie, ou coupe en cours) garde son bloc, avec
un message. Le champion d'un championnat n'est connu qu'à la clôture de la saison ;
celui d'une coupe, à la fin de sa finale.

### Joueur

Une seule page, sans onglets (un joueur retraité n'affiche que son historique).
Les blocs Attributs, Aptitudes par poste et Évolution du niveau occupent une même
ligne de trois colonnes (deux colonnes puis une seule sur écrans étroits) ; l'état et
la carrière sont dessous. Sans aptitude à afficher, l'état prend la place du terrain
dans la ligne du haut et la carrière reste seule dessous.

| Bloc | Contenu |
|---|---|
| En-tête | nom, nationalités, poste et postes secondaires, âge, club ; date de naissance, salaire mensuel, fin de contrat, valeur de marché estimée |
| Attributs | les 15 attributs en badges de 1 à 20, avec le niveau (Niv.) et le potentiel exact (Pot.), sur 200, dans l'en-tête du bloc. Quatre sections : Gardien (Réflexes, Sorties, Relance), Défense (Tacle, Placement), Attaque (Finition, Sang-froid, Technique, Vision, Jeu de tête, Centres, Coups arrêtés) et Général (Passe, Vitesse, Endurance). Un joueur de champ ne voit pas Gardien ; un gardien ne voit que Gardien (Placement s'y ajoute) et Général, ses autres attributs sont dans un repli « Autres attributs », fermé par défaut. Les sections et les attributs de chacune gardent toujours le même ordre, quel que soit le poste (Défense, Attaque, Général ; pour un gardien, Placement s'insère après Sorties). Un point marque les attributs pesant au moins 14 % de cette note, avec leur poids en infobulle (`attribute_weights` de la fiche, tiré de `note_globale`) |
| État | blessure en cours et durée, fatigue, suspension, forme, moral |
| Évolution du niveau | courbe annuelle du niveau, sur 200, avec axe gradué ; chaque point reprend les couleurs du club de la saison (dernier club de la saison en cas de transfert) et son infobulle donne saison, club et niveau |
| Aptitudes par poste | carte de terrain, à la même taille que celle du dernier onze aligné d'un club (maillots et libellés compris) : niveau de 10 à 20 aux seuls postes où il atteint 10, poste principal entouré |
| Carrière | une ligne par saison et club : transfert, division du championnat, précédée du drapeau de son pays, et code de la coupe d'Europe (pas de coupe nationale), matches, buts, passes, note |

Les textes du graphe ont la même taille que le reste de l'interface. Les niveaux,
potentiels, attributs et aptitudes par poste sont des badges dont la couleur va du
rouge au jaune puis au vert : sur 200, rouge jusqu'à 70, jaune à 110, vert à partir
de 150 ; sur 20, rouge jusqu'à 4, jaune à 10, vert à partir de 16.

### Match

Écran de compte rendu, consultable après simulation :

- Score, compétition, journée, stade
- xG, tirs, possession, corners, cartons
- Fil chronologique des événements avec joueurs nommés
- Compositions des deux équipes avec notes individuelles
- Résumé 2D des occasions, replié par défaut : le bouton « Résumé 2D » à droite
  du bandeau du score l'ouvre et lance la lecture, puis le replie (la lecture se
  met en pause). Le terrain n'est construit qu'à la première ouverture.

En v1 le match détaillé est simulé avant consultation. Les événements horodatés
permettent une animation différée. Un futur match interactif demandera aussi
des points de pause et des commandes influençant la suite du moteur.
Pour un résultat analytique, signaler l'absence de détail et masquer les
statistiques inconnues au lieu d'afficher des zéros. Garder les compositions
initiales indépendantes des remplacements enregistrés ensuite.

### Recherche de joueurs

Vue transversale sur les joueurs importés (25 911 avec les CSV présents).
Filtres serveur : poste, âge, niveau,
nationalité, club, statut du club (actif ou dormant), fourchette de salaire,
statut contractuel. Tri sur toute colonne, pagination obligatoire.

Un club dormant est consultable — nom, effectif, fiches joueurs — mais n'a ni
classement, ni calendrier, ni statistiques de saison. L'interface doit le
signaler explicitement plutôt que d'afficher des sections vides.

## Endpoints

```
GET  /api/monde/etat                     date, saison, prochaines échéances, mode auto (auto.running / auto.stopping)
POST /api/monde/avancer                  {commande_id: str, jusqu_a: "jour" | "journee" | "fin_mercato"} -> travail_id
POST /api/monde/auto/demarrer            {commande_id: str} -> travail_id ; enchaîne les journées jusqu'à l'arrêt
POST /api/monde/auto/arreter             signal d'arrêt idempotent -> {running, stopping, job}
GET  /api/travaux/{id}                  statut, progression, erreur éventuelle
GET  /api/monde/journal?date=             événements du jour
GET  /api/monde/palmares                  champions de chaque compétition, toutes saisons : {europe, countries}

GET  /api/clubs?competition=&statut=actif|dormant&recherche=&page=&tri=
GET  /api/clubs/{id}                      en-tête + résumé
GET  /api/clubs/{id}/apercu               blocs d'entrée : calendrier, finances, transferts, dernier onze
GET  /api/clubs/{id}/navigation           pairs de la division (ou du pays) : précédent, suivant, liste
GET  /api/clubs/{id}/effectif
GET  /api/clubs/{id}/calendrier
GET  /api/clubs/{id}/finances
GET  /api/clubs/{id}/transferts?saison=
GET  /api/clubs/{id}/historique           saisons terminées paginées (rang, réputation, coupe, Europe) + leaders {matches, goals} + transfers {arrivals, departures}

GET  /api/competitions
GET  /api/competitions/{id}/classement
GET  /api/competitions/{id}/calendrier?journee=
GET  /api/competitions/{id}/statistiques?type=buteurs|passeurs|notes
GET  /api/competitions/{id}/historique    champions par saison paginés (avec classement archivé) + leaders {matches, goals} de tous les temps
GET  /api/competitions/{id}/navigation    compétitions du même pays : précédent, suivant, liste

GET  /api/joueurs?poste=&age_min=&age_max=&niveau_min=&nation=&club=&statut_club=&page=&tri=
GET  /api/joueurs/{id}
GET  /api/joueurs/{id}/historique
GET  /api/joueurs/{id}/navigation        effectif du club : précédent, suivant, liste (null sans club)

GET  /api/matches/{id}                    compte rendu complet

POST /api/partie/sauvegarder              {slot: str}
POST /api/partie/charger                  {slot: str}
POST /api/partie/supprimer                {slot: str}
GET  /api/partie/slots
POST /api/partie/creer                   graine et date/config initiales explicites
GET  /api/partie/rapport-import          volumes et corrections de la création
```

## Front

HTML, CSS et JS vanilla. L'essentiel des écrans est constitué de tableaux
triables — un framework n'apporterait rien ici.

- Une page par écran, navigation par ancres ou petit routeur maison
- Aucun état applicatif dupliqué côté client : le serveur est la source de vérité
- Rafraîchir après chaque avancée de temps

Les mêmes commandes d'écriture sont sérialisées côté serveur ; désactiver les
boutons ne remplace pas ce contrôle. Une sauvegarde reprend par défaut sa
configuration enregistrée. Les noms de slots ne sont pas des chemins libres.

Compter environ la moitié du temps total du projet sur l'interface si l'on veut
quelque chose d'agréable à utiliser. Ne pas commencer avant que le harnais de
calibrage donne des résultats corrects.
