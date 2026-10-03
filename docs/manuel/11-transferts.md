# Vos achats et vos ventes

Votre club achète et vend aux mêmes prix et sous les mêmes limites que les autres (voir [Le mercato des clubs](#/aide/mercato)). Ce qui change, c'est la manière : vous négociez en direct, et rien ne se fait sans votre accord. Prêter ou emprunter un joueur suit d'autres règles, plus simples (voir [Réserve et prêts](#/aide/reserve-et-prets/preter-et-emprunter)).

## Acheter un joueur

Un achat se fait en trois temps.

**1. L'indemnité, avec le club.** Le club répond aussitôt à votre offre. Il accepte dès qu'elle atteint son [prix demandé](#/aide/mercato/le-prix-demande), celui de la colonne PRIX MIN. ; en dessous, il refuse et vous rappelle ce prix. Il ne cède rien : une offre trop basse ne fait que consommer un tour. Au {{ia_gestion.mercato.tours_negociation}}e refus, les discussions sont rompues pour {{ia_gestion.mercato.jours_rupture_negociation}} jours. Une discussion laissée en plan tombe d'elle-même le lendemain.

Dès que le club accepte, le joueur vous est **réservé** : aucun autre club ne peut plus l'acheter tant que votre dossier est ouvert.

**2. La réponse du joueur.** Il donne sa réponse {{ia_gestion.mercato.delai_reponse_min_jours}} à {{ia_gestion.mercato.delai_reponse_max_jours}} jours plus tard, au plus tard le dernier jour du mercato. S'il est toujours d'accord pour venir, il ouvre la discussion sur son contrat.

**3. Le salaire, avec le joueur.** Il accepte dès que votre offre atteint [ce qu'il demande](#/aide/contrats/ce-qu-un-joueur-demande-pour-signer) ; en dessous, il refuse et annonce son prix. Là encore, {{ia_gestion.mercato.tours_negociation}} refus rompent les discussions pour {{ia_gestion.mercato.jours_rupture_negociation}} jours, et le contrat doit être conclu avant la fermeture du mercato.

Le joueur arrive {{ia_gestion.mercato.delai_reponse_min_jours}} à {{ia_gestion.mercato.delai_reponse_max_jours}} jours après l'accord, même si le mercato a fermé entre-temps. Sa durée de contrat dépend de son âge (voir [La durée des contrats](#/aide/contrats/la-duree-des-contrats)).

Un **joueur libre** se négocie directement à l'étape 3, sans indemnité, pendant un mercato.

Vous pouvez mener autant de dossiers que vous voulez. Chacun réserve son indemnité sur votre budget de transferts et son salaire sur votre masse salariale dès l'ouverture, et les réserve jusqu'à l'arrivée du joueur ou l'échec du dossier. Tant que le contrat n'est pas négocié, le salaire réservé est celui que le joueur demande, la colonne PRÉTENTIONS de la liste des joueurs.

## Ce qui empêche une offre

- Le mercato est fermé.
- Le joueur est arrivé dans son club il y a moins de {{ia_gestion.mercato.stabilite_apres_arrivee_jours}} jours.
- Son club ne peut pas s'en séparer : il est à {{ia_gestion.garde_fous.effectif_min}} joueurs, ou c'est l'un de ses {{ia_gestion.garde_fous.gardiens_min}} derniers gardiens.
- Le joueur est en prêt : il faut attendre son retour dans son club.
- Le joueur refuse votre club : la colonne INTÉRESSÉ de la liste des joueurs n'affiche pas T (voir [Ce qu'un joueur accepte](#/aide/mercato/ce-qu-un-joueur-accepte)).
- Vos moyens ne suivent pas : effectif plein ({{ia_gestion.garde_fous.effectif_max}} joueurs, dossiers en cours compris), budget de transferts insuffisant, trésorerie qui passerait sous {{eur(ia_gestion.garde_fous.solde_minimal_autorise)}}, ou salaire qui ferait dépasser le plafond salarial (voir [Finances](#/aide/finances)).

**Le salaire compte dès l'offre d'indemnité.** Avant même que le club vendeur réponde, il faut que ce que le joueur demande tienne entre votre masse salariale et votre plafond, une fois retirés les salaires que vos autres dossiers réservent. Sinon l'offre est refusée, et le refus donne les deux montants : ce que le joueur demanderait, et ce qu'il vous reste sous le plafond.

Ces conditions sont revérifiées à l'arrivée du joueur. Si l'une ne tient plus à ce moment-là, le transfert échoue.

## Recevoir une offre

Les clubs de l'IA s'intéressent à vos joueurs comme à tous les autres. Leur offre suit le circuit normal : elle reste ouverte {{ia_gestion.mercato.jours_encheres}} jours, le temps que d'autres clubs se déclarent, puis elle arrive dans vos actualités et attend votre réponse.

- Une offre spontanée est faite à {{pct(ia_gestion.mercato.ratio_contre_offre, 0)}} du prix qu'un club de l'IA demanderait à votre place. Vous ne pouvez pas la négocier : vous l'acceptez ou vous la refusez.
- Accepter une offre conclut le transfert et écarte les autres offres pour ce joueur.
- La vente est impossible si elle vous fait passer sous {{ia_gestion.garde_fous.effectif_min}} joueurs ou {{ia_gestion.garde_fous.gardiens_min}} gardiens.
- Une offre sans réponse expire à la fermeture du mercato.

Pour vendre à votre prix plutôt qu'à celui de l'acheteur, utilisez la liste des transferts ou la proposition aux clubs.

## La liste des transferts

Placer un joueur sur la liste, c'est afficher durablement un prix. Tant qu'il y figure :

- tout club de l'IA qui cherche un joueur à son poste l'examine **en premier**, avant tous les autres joueurs du monde ;
- un club intéressé offre **votre prix**, directement, sans ouvrir plus bas ;
- les clubs non simulés qui se manifestent le comptent parmi les joueurs qu'ils regardent ;
- le joueur sait qu'il n'est plus désiré : il accepte un club jusqu'à {{ia_gestion.mercato.tolerance_baisse_joueur_a_vendre}} points de réputation en dessous du vôtre, au lieu de {{ia_gestion.mercato.tolerance_baisse_reputation}}, et ne demande plus de prolongation.

La liste ne force personne : un club n'offre que s'il a un besoin à ce poste, les moyens, et si le joueur améliore son effectif. Elle ne presse pas non plus le marché : les clubs y reviennent à leur rythme, et l'offre met {{ia_gestion.mercato.jours_encheres}} jours à vous parvenir. C'est un outil de fond, à poser en début de mercato.

## Proposer un joueur aux clubs

Proposer un joueur, c'est poser la question à tous les clubs **le jour même**, à un prix donné :

- chaque club de l'IA décide tout de suite, comme il le ferait lors de son prochain passage sur le marché ;
- chaque club non simulé a {{pct(ia_gestion.mercato.clubs_dormants.probabilite_demarchage_par_fenetre, 0)}} de chances de s'y intéresser ;
- vous recevez aussitôt jusqu'à {{ia_gestion.mercato.offres_max_proposition}} offres, celles des clubs que le joueur préfère, à votre prix, sans délai d'enchères ;
- le même joueur ne peut être reproposé qu'après {{ia_gestion.mercato.jours_relance_proposition}} jours. Pendant ce délai, il accepte lui aussi un club jusqu'à {{ia_gestion.mercato.tolerance_baisse_joueur_a_vendre}} points de réputation en dessous du vôtre.

Il faut que le mercato soit ouvert, que le joueur ne vienne pas d'arriver et que votre effectif permette de s'en séparer.

## Liste ou proposition

| | Liste des transferts | Proposition aux clubs |
|---|---|---|
| Durée | Tant que le joueur y reste | Un seul jour |
| Réponse | Au rythme du marché, après {{ia_gestion.mercato.jours_encheres}} jours d'enchères | Immédiate |
| Qui regarde | Les clubs qui passent sur le marché, un par un | Tous les clubs en même temps |
| Prix | Le vôtre, offert tel quel | Le vôtre, offert tel quel |
| Renouvelable | Modifiable à tout moment | Tous les {{ia_gestion.mercato.jours_relance_proposition}} jours |

La proposition sert à savoir tout de suite si un prix trouve preneur ; la liste sert à laisser venir une offre sur la durée. Rien n'empêche de faire les deux.

## Le prix qu'un club accepte de payer

Que le joueur soit listé ou proposé, un acheteur refuse un prix qu'il juge excessif. Il paie au plus le plus haut de deux montants :

- {{ia_gestion.mercato.multiplicateur_prix_max_acheteur}} fois la valeur qu'il voit dans le joueur ;
- le [prix demandé](#/aide/mercato/le-prix-demande) habituel du joueur, celui qu'un club de l'IA afficherait à votre place.

Au-delà, aucun club ne suit. En dessous, le prix n'est jamais le seul critère : il faut encore que le club ait un besoin au poste, la marge salariale pour ce que le joueur demande, et que le joueur accepte d'y aller.
