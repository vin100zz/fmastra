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
issus de la synthèse sont signalés comme estimés, sans exposer le potentiel réel.

## Principes

**Penser en vues, pas en entités.** Un endpoint renvoie exactement ce qu'un écran
affiche, plutôt qu'un REST générique qui obligerait le front à faire quarante
requêtes pour reconstituer une page.

**Filtrage, tri et pagination côté serveur.** Ne jamais renvoyer tous les joueurs
au navigateur. Toute liste est paginée, y compris la recherche de joueurs qui
porte sur l'ensemble des clubs, actifs et dormants.

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

### Club

| Onglet | Contenu |
|---|---|
| Effectif | liste triable : poste, nom, âge, note, salaire, fin de contrat, état (blessé, suspendu, fatigue) |
| Calendrier | matches passés et à venir, résultat, adversaire, domicile/extérieur |
| Budget | budget de transfert, masse salariale et plafond, solde, revenus |
| Transferts | arrivées et départs de la saison, avec montants |
| Historique | classements passés, palmarès, transferts marquants |

En-tête : nom, pays, compétition, réputation, classement actuel, forme sur les
5 derniers matches.

### Compétition

| Onglet | Contenu |
|---|---|
| Classement | position, J, V, N, D, BP, BC, différence, points, forme |
| Calendrier | matches par journée, avec résultats |
| Statistiques | meilleurs buteurs, passeurs, meilleures notes moyennes, clean sheets, cartons |
| Historique | champions par saison, meilleur buteur par saison |

### Joueur

| Section | Contenu |
|---|---|
| Identité | nom, nationalité, âge, date de naissance, poste, postes secondaires |
| Caractéristiques | les 13 attributs, groupés par famille, avec barres |
| Potentiel | **fourchette d'estimation**, jamais la valeur réelle |
| État | blessure en cours et durée, fatigue, suspension, forme, moral |
| Contrat | club, salaire hebdomadaire, date de fin, valeur de marché estimée |
| Saison en cours | matches, minutes, buts, passes, note moyenne, cartons |
| Historique | une ligne par saison, club et compétition ; transferts avec montants ; courbe annuelle de la note globale |

### Match

Écran de compte rendu, consultable après simulation :

- Score, compétition, journée, stade
- xG, tirs, possession, corners, cartons
- Fil chronologique des événements avec joueurs nommés
- Compositions des deux équipes avec notes individuelles

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
GET  /api/monde/etat                     date, saison, prochaines échéances
POST /api/monde/avancer                  {commande_id: str, jusqu_a: "jour" | "journee" | "fin_mercato"} -> travail_id
GET  /api/travaux/{id}                  statut, progression, erreur éventuelle
GET  /api/monde/journal?date=             événements du jour

GET  /api/clubs?competition=&statut=actif|dormant&recherche=&page=&tri=
GET  /api/clubs/{id}                      en-tête + résumé
GET  /api/clubs/{id}/effectif
GET  /api/clubs/{id}/calendrier
GET  /api/clubs/{id}/finances
GET  /api/clubs/{id}/transferts?saison=
GET  /api/clubs/{id}/historique

GET  /api/competitions
GET  /api/competitions/{id}/classement
GET  /api/competitions/{id}/calendrier?journee=
GET  /api/competitions/{id}/statistiques?type=buteurs|passeurs|notes
GET  /api/competitions/{id}/historique

GET  /api/joueurs?poste=&age_min=&age_max=&niveau_min=&nation=&club=&statut_club=&page=&tri=
GET  /api/joueurs/{id}
GET  /api/joueurs/{id}/historique

GET  /api/matches/{id}                    compte rendu complet

POST /api/partie/sauvegarder              {slot: str}
POST /api/partie/charger                  {slot: str}
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
