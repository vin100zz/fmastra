# Le monde et son calendrier

Ce manuel décrit ce que le jeu calcule sans le montrer : comment un match se joue, pourquoi un joueur progresse ou se lasse, ce qui décide un club à acheter ou à vendre. Il ne décrit pas les écrans.

> Les chiffres de ces pages ne sont pas recopiés à la main : ils sont lus dans la configuration de la partie en cours. Une partie créée avec d'autres réglages affiche ici ses propres valeurs.

## Lire les chiffres

Le moteur calcule sur une échelle interne de {{attributs.bornes.min}} à {{attributs.bornes.max}}. Les écrans la présentent autrement, et ce manuel parle comme les écrans :

- le **niveau**, le **potentiel** et les **composites** sont affichés sur 200 (échelle interne × 2) ;
- les **attributs** et les **aptitudes par poste** sont affichés sur 20 (échelle interne ÷ 5) ;
- la **condition physique** et le **moral** sont des pourcentages ; la **forme** est un multiplicateur autour de 1.

Sauf mention contraire, un « point » de niveau désigne donc un point sur 200.

## Clubs simulés et marché extérieur

Seuls les clubs de ces championnats jouent leurs matches :

| Pays | Championnat | Niveau | Clubs |
|---|---|---:|---:|
{{#chaque monde.competitions_simulees}}| {{pays}} | {{nom}} | {{niveau}} | {{nb_clubs}} |

Les autres clubs que la partie garde du fichier de départ (voir [Les joueurs de départ](#/aide/monde/les-joueurs-de-depart)) sont **non simulés**. Ils ne jouent pas de championnat, mais ils existent : ils gardent un effectif et des finances, leurs joueurs vieillissent, progressent et prennent leur retraite, ils reçoivent des regens, et ils achètent et vendent des joueurs. Ils forment le **marché extérieur**, sans lequel les championnats simulés tourneraient en vase clos.

Un club non simulé peut apparaître dans une coupe nationale ou une coupe d'Europe. S'il ne peut pas aligner onze joueurs, il reçoit pour ce seul match des joueurs temporaires, hors marché (voir [Compétitions](#/aide/competitions/joueurs-temporaires)).

## Les joueurs de départ

Le fichier de départ compte bien plus de joueurs que la partie n'en suit. À sa création, elle n'en garde qu'une partie, palier par palier ; chaque palier prend les meilleurs au niveau du fichier :

- **Chaque club simulé** garde ses {{importation.selection_effectifs.paliers.clubs_simules.joueurs}} meilleurs joueurs, dont toujours ses {{importation.selection_effectifs.paliers.clubs_simules.gardiens}} meilleurs gardiens et ses {{importation.selection_effectifs.paliers.clubs_simules.espoirs}} plus forts potentiels de {{importation.selection_effectifs.paliers.clubs_simules.age_max_espoir}} ans ou moins.
- **Les clubs d'où montent les promus**, sous la plus basse division simulée, gardent chacun leurs {{importation.selection_effectifs.paliers.vivier.joueurs}} meilleurs joueurs.
- **Les vedettes**, où qu'elles jouent : les joueurs d'une réputation mondiale d'au moins {{n(importation.selection_effectifs.paliers.vedettes.reputation_min, 0)}} sur 100, et les pépites, d'un potentiel d'au moins {{importation.selection_effectifs.paliers.vedettes.potentiel_min_pepite}} sur 200 à {{importation.selection_effectifs.paliers.vedettes.age_max_pepite}} ans ou moins.
- **Les {{importation.selection_effectifs.paliers.agents_libres.joueurs}} meilleurs joueurs libres.**
- **Les clubs étrangers qui comptent** : dans chaque pays non simulé, les plus réputés, {{importation.selection_effectifs.paliers.clubs_etrangers.clubs_par_place_europe}} par place européenne du pays (entre {{importation.selection_effectifs.paliers.clubs_etrangers.clubs_europe_min}} et {{importation.selection_effectifs.paliers.clubs_etrangers.clubs_europe_max}}), et tout club d'une réputation d'au moins {{n(importation.selection_effectifs.paliers.clubs_etrangers.reputation_min, 0)}}. Chacun garde ses {{importation.selection_effectifs.paliers.clubs_etrangers.joueurs}} meilleurs joueurs.
- **Une liste pour chaque sélection** : chaque nationalité garde au moins {{importation.selection_effectifs.paliers.plancher_nation.joueurs_min}} joueurs, et jusqu'à {{importation.selection_effectifs.paliers.plancher_nation.joueurs_max}} pour les plus fortes : le nombre croît avec la [force de la nation](#/aide/selections/la-force-des-nations), de {{n(importation.selection_effectifs.paliers.plancher_nation.force_min, 0)}} à {{n(importation.selection_effectifs.paliers.plancher_nation.force_max, 0)}}. Les joueurs déjà gardés comptent ; les autres sont pris parmi les meilleurs hors des clubs simulés. Une nation qui manque encore de joueurs complète sa liste avec des [renforts](#/aide/selections/les-renforts).

Aucun club ne garde plus de {{importation.selection_effectifs.joueurs_max_par_club}} joueurs. Hors des clubs simulés, la partie garde au plus {{importation.selection_effectifs.paliers.plafond_hors_simules}} joueurs : au-delà, les clubs étrangers descendent à {{importation.selection_effectifs.paliers.clubs_etrangers.joueurs_min}} joueurs, puis les joueurs libres sont réduits de moitié puis écartés, et enfin ceux du vivier de même.

Restent alors les clubs simulés, ceux du vivier, les {{importation.selection_effectifs.paliers.coupe.clubs_par_nation}} clubs les plus réputés de chaque nation simulée pour sa coupe, les clubs étrangers qui comptent et tout club qui garde un joueur ; les autres ne sont pas repris. Les joueurs écartés ne reviennent pas, mais leurs noms servent aux regens de leur pays. Les clubs d'une nation qui a des places européennes sans championnat à elle, comme le Liechtenstein dont les clubs jouent en Suisse, la représentent en coupe d'Europe.

## Ce qui se passe chaque jour

Chaque jour de jeu déroule les mêmes étapes, dans cet ordre :

1. Les contrats arrivés à terme la veille sont rompus : le joueur devient libre.
2. Les blessés guéris reviennent, chaque joueur peut se blesser hors match, et tous les autres récupèrent de la condition physique.
3. Les sélections nationales ouvrent ou complètent leurs rassemblements.
4. Le 1er du mois, tous les joueurs progressent ou déclinent (voir [Progression](#/aide/progression)).
5. Le {{date(monde.dates_cles.bilan_demographique.jour, monde.dates_cles.bilan_demographique.mois)}}, le bilan annuel a lieu (voir plus bas).
6. Tous les {{ia_gestion.mercato.weekly_review_days}} jours, le moral de chaque joueur évolue et les prolongations de contrat sont étudiées.
7. Vos négociations avancent : réponse d'un joueur, arrivée d'une recrue.
8. Le mercato : les offres assez anciennes sont tranchées, puis les clubs en émettent de nouvelles.
9. Les matches du jour se jouent.
10. Les coupes tirent leur tour suivant, les sélections jouent, et chaque club encaisse ses revenus et paie ses salaires du jour.

## Les dates qui comptent

| Date | Événement |
|---|---|
| {{date(monde.dates_cles.bilan_demographique.jour, monde.dates_cles.bilan_demographique.mois)}} | Bilan annuel et ouverture de la saison |
| {{date(monde.mercato.ete.debut_jour, monde.mercato.ete.debut_mois)}} au {{date(monde.mercato.ete.fin_jour, monde.mercato.ete.fin_mois)}} | Mercato d'été |
| {{date(monde.saison.debut_jour, monde.saison.debut_mois)}} au {{date(monde.saison.fin_jour, monde.saison.fin_mois)}} | Championnats |
| {{date(monde.mercato.hiver.debut_jour, monde.mercato.hiver.debut_mois)}} au {{date(monde.mercato.hiver.fin_jour, monde.mercato.hiver.fin_mois)}} | Mercato d'hiver |
| Le lendemain d'un mercato | Bilan de ses principaux transferts, dans vos actualités |
| 1er juin | Bilan de la saison de votre club, dans vos actualités |
| Le 1er de chaque mois | Progression et déclin des joueurs |
| Tous les {{ia_gestion.mercato.weekly_review_days}} jours | Moral et prolongations |

Le bilan annuel enchaîne, dans cet ordre : les classements finaux et les champions ; les qualifications européennes ; les montées et descentes ; la révision de la [réputation](#/aide/reputation) ; les [retraites](#/aide/progression/la-retraite) ; les nouveaux [budgets](#/aide/finances) ; le calendrier de la nouvelle saison et la remise à zéro des statistiques et des cartons ; enfin l'arrivée des [regens](#/aide/regens).

Vos actualités vous annoncent l'ouverture de chaque mercato, avec votre budget de transferts et votre marge sous le plafond salarial, puis sa fermeture la veille de son dernier jour, avec vos dossiers encore ouverts. Le lendemain de la fermeture, un bilan donne les principaux transferts de la fenêtre, dans votre championnat puis dans le monde entier : les 5 plus grosses indemnités, puis les 3 joueurs libres du plus haut niveau. Un transfert compte pour votre championnat quand le joueur a rejoint ou quitté un de ses clubs. Le soir d'un tour de coupe, nationale ou d'Europe, le tirage du tour suivant vous donne votre adversaire, le lieu et la date du match. À l'ouverture de la saison, vous recevez de même votre adversaire du premier tour de la coupe nationale et, si vous êtes qualifié, tous vos adversaires de la phase de ligue de votre coupe d'Europe ; en début de partie, ces tirages vous sont donnés dès que vous choisissez votre club. Le 1er juin, le bilan de la saison donne votre place ou votre parcours dans chaque compétition, son vainqueur, la coupe d'Europe que votre classement vous ouvre, votre meilleur buteur et votre joueur le mieux noté parmi ceux notés dans au moins la moitié des matches du plus utilisé.

Les contrats se terminent la veille du bilan : un joueur en fin de contrat est libre au matin du {{date(monde.dates_cles.liberation_contrats_expires.jour, monde.dates_cles.liberation_contrats_expires.mois)}}.

## Le hasard

Toute la partie découle de la graine choisie à sa création. Chaque match tire ses aléas d'une source qui lui est propre, déterminée par la graine et par le match lui-même.

- Rejouer le même match avec la même composition et les mêmes ordres donne exactement le même résultat : recharger une sauvegarde ne change pas un score.
- Changer un seul titulaire, un poste ou le moment d'un remplacement modifie toute la suite du match.
- Le résultat d'un match ne dépend pas de l'ordre dans lequel les matches du jour sont joués.

## Votre club et ceux de l'IA

Votre club obéit aux mêmes règles que les autres : même plafond salarial, même budget de transferts, mêmes prix, effectif de {{ia_gestion.garde_fous.effectif_min}} à {{ia_gestion.garde_fous.effectif_max}} joueurs dont au moins {{ia_gestion.garde_fous.gardiens_min}} gardiens. Les différences tiennent à qui décide :

- vous composez l'équipe et donnez vos ordres en direct ; si vous simulez le match, l'entraîneur IA le dirige avec votre composition, et en mode Auto il la choisit aussi (voir [L'entraîneur IA](#/aide/entraineur)) ;
- une prolongation ou une offre reçue attend votre réponse, alors qu'un club de l'IA tranche seul ;
- vous négociez vos achats tour par tour (voir [Vos achats et vos ventes](#/aide/transferts)), sans limite de dossiers ouverts ; un club de l'IA passe par des enchères et mène au plus {{ia_gestion.mercato.negociations_actives_max}} dossiers à la fois.

En mode Auto, ces différences tombent jusqu'à la pause : l'IA dirige votre club comme les siens. Elle prolonge ou laisse partir vos joueurs, tranche les offres reçues, y compris celles qui attendaient votre réponse, recrute, prête et gère la réserve. Votre liste des transferts et vos joueurs intransférables n'ont plus d'effet ; ils le retrouvent à la pause. Vos actualités continuent de raconter ce qui arrive au club.
