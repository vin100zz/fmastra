import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newsScreen} from '../../web/news.js';
import {playerScreen} from '../../web/player.js';
import {marketBlock} from '../../web/club-overview.js';

const ref=(id,name)=>({id,name,major_color:'#aa0000',minor_color:'#ffcc00'});
const club={id:7,name:'Lens',competition_id:3,competition:'Ligue 1',major_color:'#cc0000',minor_color:'#ffd700'};
const overview={calendar:{last:[],next:[]},finances:{transfer_budget:5e6,reserved_transfer_budget:1e6,wage_bill:170,wage_cap:200},lineup:null};
const row=(id,kind,title,extra={})=>({id,date:'2029-08-02',kind,title,segments:[{text:title}],read:true,pending:false,...extra});
const feed=items=>({items,total:items.length,page:1,page_size:30,unread:items.filter(item=>!item.read).length});
const standings={items:[{rank:1,club:ref(9,'Nice'),played:2,won:2,drawn:0,lost:0,goals_for:5,goals_against:1,difference:4,points:6,form:'VV',movement:null},
 {rank:2,club:ref(7,'Lens'),played:2,won:1,drawn:0,lost:1,goals_for:2,goals_against:3,difference:-1,points:3,form:'VD',movement:null}]};
const member=(id,name,extra={})=>({id,name,position:'MC',away:false,appearances:0,goals:0,assists:0,average:null,injured_until:null,suspension:0,...extra});
const squad={items:[member(1,'Ada Un',{appearances:10,goals:7,assists:1,average:7.4}),member(2,'Bob Deux',{appearances:9,goals:2,assists:6,average:6.9,injured_until:'2029-08-20'}),
 member(3,'Cid Trois',{appearances:1,average:9.5,suspension:2}),member(4,'Dan Quatre',{away:true,injured_until:'2029-09-01'})],total:4,page:1,page_size:100};

async function withApi(routes,run){
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>{const path=url.replace(/^\/api/,'').split('?')[0];if(!(path in routes))throw new Error(`unexpected ${url}`);return {ok:true,json:async()=>routes[path]};};
 try{return await run();}finally{globalThis.fetch=previous;}
}
const screen=(items,message=null,query='')=>withApi({'/monde/etat':{controlled_club_id:7},'/clubs/7':club,'/clubs/7/apercu':overview,'/clubs/7/effectif':squad,
 '/ma-partie/actualites':feed(items),'/competitions/3/classement':standings,...(message?{[`/ma-partie/actualites/${message.id}`]:message}:{})},()=>newsScreen(new URLSearchParams(query)));

test('the feed lists each message with its badge, the unread and those awaiting an answer marked, the one opened selected',async()=>{
 const items=[row(2,'offer_received','2 offres pour Vendu',{read:false,pending:true}),row(1,'offer_rejected','Nice refuse votre offre de 3000000 € pour Cible : le club en attend au moins 4850000 €'),
  row(0,'renewal_proposed','Fidèle veut un nouveau contrat')];
 const html=await screen(items,{...items[1],segments:[{text:'Nice',ref:{club:9}},{text:' refuse votre offre de 3000000 € pour '},{text:'Cible',ref:{player:20}},{text:' : le club en attend au moins 4850000 €'}]},'msg=1');
 assert.doesNotMatch(html,/class="tabs"/);
 assert.match(html,/<div class="page-heading news-heading"><div><h1>Actualités<\/h1><\/div><button type="button" data-news-read="all">Tout lire<\/button><\/div>/);
 assert.match(html,/<a class="news-row unread" href="#\/actualites\?msg=2"><span class="news-row-top"><span class="news-tag transfer">Transfert<\/span><small>2 août<\/small><\/span><span class="news-row-title"><span>2 offres pour Vendu<\/span><i class="news-todo" role="img" aria-label="À traiter"><\/i>/);
 assert.match(html,/<a class="news-row selected" href="#\/actualites\?msg=1" aria-current="true">.*Nice refuse votre offre de 3\sM\s?€ pour Cible : le club en attend au moins 4,85\sM\s?€<\/span><\/span><\/a>/);
 // A message that asked for an answer says it was given.
 assert.match(html,/<span class="news-tag contract">Contrat<\/span>.*Fidèle veut un nouveau contrat<\/span><i class="news-done" role="img" aria-label="Traité">✓<\/i>/);
 // The message opened links each name where it is written.
 assert.match(html,/<h2><a href="#\/club\/9">Nice<\/a> refuse votre offre de 3\sM\s?€ pour <a href="#\/player\/20">Cible<\/a> : le club en attend au moins 4,85\sM\s?€<\/h2>/);
 assert.doesNotMatch(html,/class="news-body"/);  // a plain sentence is all in its title
});

test('nothing left to read greys Tout lire out, and an empty feed says so',async()=>{
 const html=await screen([]);
 assert.match(html,/data-news-read="all" disabled>Tout lire/);
 assert.match(html,/Rien à signaler pour l’instant\./);
 assert.match(html,/<section class="card news-message" aria-label="Message"><\/section>/);
});

test('the widgets show the table, the players out, the calendar, the leaders and the finances',async()=>{
 const html=await screen([]);
 for(const link of ['#/league/3','#/club/7/composition','#/club/7/calendar','#/club/7','#/club/7/finances'])assert.ok(html.includes(`href="${link}"`),link);
 assert.doesNotMatch(html,/Composition<\/a>|Dernier onze|Transferts et contrats/);
 // The table: points first, then won, drawn, lost, goals for and against, difference; the user's club marked.
 assert.match(html,/<h2>Classement · 2e journée<\/h2>/);
 assert.deepEqual([...html.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map(found=>found[1]),['#','CLUB','PTS','V','N','P','BP','BC','DIFF.']);
 assert.match(html,/<tr class="own"><td><span class="rank ">2<\/span><\/td>.*<td><b>3<\/b><\/td><td>1<\/td><td>0<\/td><td>1<\/td><td>2<\/td><td>3<\/td><td>-1<\/td><\/tr>/);
 // Injured and suspended players of the first team; one lent elsewhere is not the club's to field.
 assert.match(html,/<h2>Indisponibles · 2<\/h2>/);
 assert.match(html,/<a href="#\/player\/2">Bob Deux<\/a><\/span><b class="danger">Blessé · 20 août<\/b>/);
 assert.match(html,/<a href="#\/player\/3">Cid Trois<\/a><\/span><b class="news-ban">Suspendu · 2 matchs<\/b>/);
 assert.doesNotMatch(html,/Dan Quatre/);
 // Leaders: goals, assists, ratings (a single match does not count), matches.
 const list=title=>html.match(new RegExp(`<h3>${title}</h3><ul class="moves">(.*?)</ul>`))[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 assert.equal(list('Buts'),'Ada Un 7 Bob Deux 2');
 assert.equal(list('Passes'),'Bob Deux 6 Ada Un 1');
 assert.equal(list('Notes'),'Ada Un 7,4 Bob Deux 6,9');
 assert.equal(list('Matches'),'Ada Un 10 Bob Deux 9 Cid Trois 1');
 // Finances: what is left to spend, and the wage bill as a share of its cap.
 assert.match(html,/<span>Budget transferts<\/span><strong>4\sM\s?€<\/strong>/);
 assert.match(html,/aria-label="85 % du plafond salarial utilisé"/);assert.match(html,/stroke-dasharray="138\.9 163\.4"/);
 assert.match(html,/<span>Masse salariale<\/span><strong>740\s€<\/strong><small>sur 870\s€ \/ mois<\/small>/);
});

test('the offers of a day for a player are answered one by one or all at once',async()=>{
 const offers={player:{id:11,name:'Vendu',gone:false},value:28300000,offers:[{key:'a',club:ref(9,'Nice'),fee:34e6,state:'pending'},{key:'b',club:ref(8,'Metz'),fee:29e6,state:'pending'},{key:'c',club:ref(6,'Brest'),fee:2e6,state:'refused'}]};
 const message={...row(2,'offer_received','3 offres pour Vendu',{pending:true}),segments:[{text:'3 offres pour '},{text:'Vendu',ref:{player:11}}],offers};
 const html=await screen([message],message,'msg=2');
 assert.match(html,/<span class="news-status todo"><i class="news-todo" aria-hidden="true"><\/i>À traiter<\/span>/);
 assert.match(html,/<h2>3 offres pour <a href="#\/player\/11">Vendu<\/a><\/h2><div class="tile fee-value"><span>Valeur<\/span><strong>28,3\sM\s?€<\/strong><\/div>/);
 assert.match(html,/<a href="#\/club\/9" class="club-link">.*Nice<\/a><\/span><b>34\sM\s?€<\/b><span class="market-actions"><button data-command="reponse-offre" data-decision="accepter" data-offer="a">Accepter<\/button><button data-command="reponse-offre" data-decision="refuser" data-offer="a">Refuser<\/button>/);
 assert.match(html,/<span class="news-state ">Refusée<\/span>/);
 assert.match(html,/<button class="primary" data-command="reponse-offres" data-decision="accepter" data-player="11">Tout accepter<\/button><button class="danger" data-command="reponse-offres" data-decision="refuser" data-player="11">Tout refuser<\/button>/);
 // A single offer left is answered on its line; once they all are, the message tells the outcome.
 const single={...message,offers:{...offers,offers:[offers.offers[0],{...offers.offers[1],state:'refused'}]}};
 const one=await screen([single],single,'msg=2');
 assert.match(one,/<button class="primary" data-command="reponse-offre" data-decision="accepter" data-offer="a">Accepter/);assert.doesNotMatch(one,/reponse-offres/);
 const done={...message,pending:false,offers:{...offers,value:null,offers:[{...offers.offers[0],state:'accepted'},{...offers.offers[1],state:'declined'},{...offers.offers[2],state:'lapsed'}]}};
 const settled=await screen([done],done,'msg=2');
 assert.match(settled,/<span class="news-status">Offre acceptée · Nice<\/span>/);assert.doesNotMatch(settled,/data-command|fee-value/);
 assert.match(settled,/<span class="news-state good">Acceptée<\/span>.*Non retenue.*Sans suite/);
});

test('a contract asked for shows what he has beside what he asks, to accept or refuse',async()=>{
 const renewal={player:{id:12,name:'Fidèle',gone:false},current:{wage:1000,end:'2030-06-30'},asked:{wage:1500,end:'2032-06-30'},state:'pending'};
 const message={...row(4,'renewal_proposed','Fidèle veut un nouveau contrat',{pending:true}),segments:[{text:'Fidèle',ref:{player:12}},{text:' veut un nouveau contrat'}],renewal};
 const html=await screen([message],message,'msg=4');
 assert.match(html,/<h2><a href="#\/player\/12">Fidèle<\/a> veut un nouveau contrat<\/h2>/);
 assert.match(html,/<span class="news-head">ACTUEL<\/span><span class="news-head">DEMANDÉ<\/span><span>Salaire \/ mois<\/span><span>4\s300\s€<\/span><b>6\s500\s€<\/b><span>Fin de contrat<\/span><span>30 juin 2030<\/span><b>30 juin 2032<\/b>/);
 assert.match(html,/<button class="primary" data-command="renouvellement" data-decision="accepter" data-player="12">Accepter<\/button><button class="danger" data-command="renouvellement" data-decision="refuser" data-player="12">Refuser<\/button>/);
 const signed={...message,pending:false,renewal:{...renewal,state:'accepted'}};
 const done=await screen([signed],signed,'msg=4');
 assert.match(done,/<span class="news-status">Prolongé jusqu’au 30 juin 2032<\/span>/);assert.doesNotMatch(done,/data-command/);
});

test('a player whose club agreed the fee negotiates his wage from the message, or the talks are given up',async()=>{
 const talks={player:{id:20,name:'Cible',gone:false},club:ref(9,'Nice'),fee:3450000,state:'pending',arrival:null,
  talks:{etape:'salaire',indemnite:3450000,salaire:null,contre_offre:2000,tours_restants:2,date_prevue:null,budget:1e6,obstacle:null},profile:{id:20,name:'Cible',club:ref(9,'Nice'),wage:1000}};
 const message={...row(5,'talks_open','Cible est prêt à négocier son contrat',{pending:true}),segments:[{text:'Cible',ref:{player:20}},{text:' est prêt à négocier son contrat'}],talks};
 const html=await screen([message],message,'msg=5');
 assert.match(html,/<span>Indemnité convenue<\/span><strong>3,45\sM\s?€ · <a href="#\/club\/9" class="club-link">/);
 assert.match(html,/<span>Salaire demandé<\/span><strong>8\s700\s€ \/ mois<\/strong>/);
 assert.match(html,/data-open-dialog="talks-dialog">Négocier le contrat<\/button>/);assert.match(html,/<form id="talks-form" data-kind="salaire">/);
 assert.match(html,/<button class="danger" data-command="abandon-negociation" data-player="20">Abandonner<\/button>/);
 const agreed={...message,pending:false,talks:{...talks,state:'agreed',arrival:'2029-08-06',talks:undefined,profile:undefined}};
 assert.match(await screen([agreed],agreed,'msg=5'),/<span class="news-status">Arrivée le 6 août 2029<\/span>/);
});

test('several players share a message: who, and what it says of each',async()=>{
 const people=(kind,title,players)=>({...row(6,kind,title),players,match:null});
 const injured=people('injury','2 blessés contre Nice',[{player:{id:1,name:'Ada Un',gone:false},days:21},{player:{id:2,name:'Bob Deux',gone:false},days:3}]);
 const hurt=await screen([injured],{...injured,segments:[{text:'2 blessés contre '},{text:'Nice',ref:{club:9}}]},'msg=6');
 assert.match(hurt,/<h2>2 blessés contre <a href="#\/club\/9">Nice<\/a><\/h2>/);
 assert.match(hurt,/<ul class="news-lines"><li><span><a href="#\/player\/1">Ada Un<\/a><\/span><span>3 semaines<\/span><\/li><li><span><a href="#\/player\/2">Bob Deux<\/a><\/span><span>3 jours<\/span><\/li><\/ul>/);
 // One player: the title says it all.
 const alone=people('injury','Ada Un blessé 3 semaines',[{player:{id:1,name:'Ada Un',gone:false},days:21}]);
 assert.doesNotMatch(await screen([alone],alone,'msg=6'),/class="news-body"/);
 const called=people('call_up','2 joueurs convoqués en sélection',[{player:{id:1,name:'Ada Un',gone:false},team:{id:33,name:'France'}},{player:{id:9,name:'Parti',gone:true},team:{id:34,name:'Mali'}}]);
 const html=await screen([called],called,'msg=6');
 assert.match(html,/<span class="news-tag call-up">Sélection<\/span>/);
 assert.match(html,/<a href="#\/international\/nation\/33">France<\/a>/);assert.match(html,/<li><span>Parti<\/span>/);
 const unhappy=people('morale','2 joueurs mécontents',[{player:{id:1,name:'Ada Un',gone:false},cause:'temps_de_jeu',morale:38},{player:{id:2,name:'Bob Deux',gone:false},cause:'reserve',morale:44}]);
 const mood=await screen([unhappy],unhappy,'msg=6');
 assert.match(mood,/<span>Mécontent de son temps de jeu<\/span><span class="rating graded" style="--hue:0" title="Moral">38 %<\/span>/);
 assert.match(mood,/<span>Ne veut plus être en réserve<\/span>/);
});

test('contracts running out offer each player the contract he asks for',async()=>{
 const expiry={months:6,players:[{player:{id:12,name:'Fidèle',gone:false},wage:1000,end:'2030-06-30',obstacle:null,demande:false,terms:{wage:1500,end:'2033-06-30',current_wage:1000}},
  {player:{id:13,name:'Pressé',gone:false},wage:800,end:'2030-06-30',obstacle:'Pressé ne veut pas prolonger : il vise un club plus prestigieux.',terms:null},
  {player:{id:14,name:'Signé',gone:false},wage:500,end:'2030-06-30',obstacle:null,terms:null,settled:true}]};
 const message={...row(7,'contract_expiry','3 contrats expirent dans 6 mois'),expiry};
 const html=await screen([message],message,'msg=7');
 assert.match(html,/<a href="#\/player\/12">Fidèle<\/a><\/span><span>4\s300\s€ <small>\/ mois<\/small><\/span><span><button type="button" data-open-dialog="contract-dialog-12">Proposer un contrat<\/button><dialog id="contract-dialog-12"/);
 assert.match(html,/<span>Salaire demandé<\/span><strong>6\s500\s€ \/ mois<\/strong>.*<span>Fin de contrat proposée<\/span><strong>30 juin 2033<\/strong>.*<button class="primary" data-command="prolongation" data-player="12">Signer<\/button>/);
 assert.match(html,/<button type="button" disabled title="Pressé ne veut pas prolonger : il vise un club plus prestigieux.">Proposer un contrat<\/button>/);
 assert.match(html,/<a href="#\/player\/14">Signé<\/a><\/span><span>2\s200\s€ <small>\/ mois<\/small><\/span><span><\/span><\/li>/);
});

test('a transfer window is told when it opens and on the eve of its last day',async()=>{
 const opened={...row(8,'market_open','Le mercato d’hiver est ouvert'),segments:[{text:'Le '},{text:'mercato d’hiver',ref:{page:'transfers'}},{text:' est ouvert'}],
  market:{window:'winter',budget:24e6,wages:2000,end:'2030-01-31',talks:[],offers:[]}};
 const html=await screen([opened],opened,'msg=8');
 assert.match(html,/<span class="news-tag market">Mercato<\/span>/);
 assert.match(html,/<h2>Le <a href="#\/transfers">mercato d’hiver<\/a> est ouvert<\/h2>/);
 assert.match(html,/<span>Fermeture<\/span><strong>31 janv\. 2030<\/strong>.*<a href="#\/club\/7\/finances">Budget transferts<\/a><\/span><strong>24\sM\s?€<\/strong>.*<span>Marge salariale \/ mois<\/span><strong>8\s700\s€<\/strong>/);
 assert.match(html,/<a class="news-more" href="#\/players">Joueurs →<\/a>/);
 const closing={...row(8,'market_close','Le mercato d’hiver ferme demain'),market:{window:'winter',budget:19e6,wages:null,end:null,talks:[{id:20,name:'Cible',gone:false}],offers:[{id:11,name:'Vendu',gone:false}]}};
 const eve=await screen([closing],closing,'msg=8');
 assert.match(eve,/<span>Vos offres en cours<\/span><strong><a href="#\/player\/20">Cible<\/a><\/strong>.*<span>Offres reçues<\/span><strong><a href="#\/player\/11">Vendu<\/a><\/strong>/);
 assert.doesNotMatch(eve,/Fermeture|Marge salariale/);
});

test('the review of the season tells each competition with its winner, and the best players',async()=>{
 const review={season:2029,europe:{id:-101,name:'Ligue des champions',kind:'europe',code:'C1'},scorer:{player:{id:1,name:'Ada Un',gone:false},goals:21},rating:{player:{id:2,name:'Bob Deux',gone:false},average:7.38},
  competitions:[{competition:{id:3,name:'Ligue 1',kind:'league',code:null},winner:ref(9,'Nice'),rank:2,points:74,round:null,won:false},
   {competition:{id:-3,name:'Coupe de France',kind:'cup',code:null},winner:ref(7,'Lens'),rank:null,points:null,round:'Finale',won:true},
   {competition:{id:-101,name:'Ligue des champions',kind:'europe',code:'C1'},winner:null,rank:null,points:null,round:'Huitièmes de finale',won:false}]};
 const message={...row(9,'season_review','Bilan de la saison 2029 / 2030'),review};
 const html=await screen([message],message,'msg=9');
 assert.match(html,/<span class="news-head">Lens<\/span><span class="news-head">VAINQUEUR<\/span><span><a href="#\/league\/3">Ligue 1<\/a><\/span><span>2e · 74 pts<\/span><span><a href="#\/club\/9" class="club-link">/);
 assert.match(html,/<a href="#\/league\/-3">Coupe de France<\/a><\/span><span>Vainqueur<\/span>/);
 assert.match(html,/<a href="#\/europe\/C1">Ligue des champions<\/a><\/span><span>Huitièmes de finale<\/span><span>—<\/span>/);
 assert.match(html,/<span class="news-good">Qualifié pour la <a href="#\/europe\/C1">Ligue des champions<\/a> 2030 \/ 2031<\/span><a class="news-more" href="#\/honours">Palmarès →<\/a>/);
 assert.match(html,/<span>Meilleur buteur<\/span><strong><a href="#\/player\/1">Ada Un<\/a> · 21 buts<\/strong>.*<span>Meilleure note<\/span><strong><a href="#\/player\/2">Bob Deux<\/a> · 7,4<\/strong>/);
});

const transfers={sortantes:[{offre_id:'out',joueur_id:20,joueur:'Cible',vendeur:ref(9,'Nice'),indemnite:1e6,salaire_propose:1000,etape:'salaire',date_prevue:null}],
 entrantes:[{joueur_id:11,joueur:'Vendu',offres:[{offre_id:'in-1',acheteur:ref(9,'Nice'),indemnite:3e6,salaire_propose:2000}]}],
 liste:[{joueur_id:13,joueur:'Partant',indemnite:4500000}],prets:[],emprunts:[]};

test('the market under way stands over the history of the club’s transfers',()=>{
 const html=marketBlock(transfers);
 assert.match(html,/<h2>Mercato en cours<\/h2>/);
 assert.match(html,/data-command="reponse-offre" data-decision="accepter" data-offer="in-1"/);
 assert.match(html,/<a href="#\/player\/20">Négocier →<\/a>/);
 assert.match(html,/<h3>Liste des transferts<span class="market-count">1<\/span><\/h3><ul class="market-list"><li><div class="market-line"><span class="market-player"><a href="#\/player\/13">Partant<\/a><\/span><b>4,5\sM\s?€<\/b><\/div><\/li>/);
 assert.match(html,/Aucun prêt en cours/);assert.doesNotMatch(html,/Prolongations/);
});

const player={id:20,name:'Cible',position:'BU',secondary_positions:[],age:24,nationalities:['FRA'],club:ref(9,'Nice'),born:'2005-01-01',wage:1000,contract_end:'2030-06-30',value:2e6,asking_price:3450000,transferable:true,greed:.5,
 rating:70,potential:80,fitness:1,form:0,morale:.5,injured_until:null,discipline:[],attributes:{},position_ratings:{}};
const history={career:{items:[],totals:{fee:0,matches:0,goals:0,assists:0,average:null}},trajectory:[]};
const idle={etape:null,indemnite:null,salaire:null,contre_offre:null,tours_restants:3,date_prevue:null,obstacle:null};
const unlisted={prix_liste:null,obstacle_proposition:null,offres:[]};
const noLoan={pret:null,en_reserve:false,obstacle_reserve:null,sens:'entrant',clubs:[],durees:[],obstacle_pret:'Le mercato est fermé.'};
const terms={obstacle:null,demande:false,salaire_actuel:1000,fin_contrat_actuelle:'2030-06-30',salaire_propose:1500,fin_contrat_proposee:'2032-06-30'};
const playerRoutes=(detail,state,talks=idle,sale=unlisted,squad=noLoan,contract=terms)=>({[`/joueurs/${detail.id}`]:detail,[`/ma-partie/effectif/${detail.id}`]:squad,[`/ma-partie/negociation/${detail.id}`]:talks,[`/ma-partie/vente/${detail.id}`]:sale,
 [`/ma-partie/contrat/${detail.id}`]:contract,[`/joueurs/${detail.id}/historique`]:history,[`/joueurs/${detail.id}/navigation`]:null,'/monde/etat':state});

test('another club’s player can receive an offer from his page, only while the market is open',async()=>{
 const open=await withApi(playerRoutes(player,{controlled_club_id:7,market:true}),()=>playerScreen(20));
 assert.match(open,/<span>Prix demandé<\/span><strong>3,45\sM\s?€<\/strong>/);
 assert.match(open,/<button class="primary" type="button" data-open-dialog="talks-dialog">Faire une offre<\/button>/);
 assert.match(open,/<form id="talks-form" data-kind="indemnite">/);assert.doesNotMatch(open,/name="accepter"/);
 const closed=await withApi(playerRoutes(player,{controlled_club_id:7,market:false},{...idle,obstacle:'Le mercato est fermé.'}),()=>playerScreen(20));
 assert.match(closed,/<button class="primary" type="button" disabled title="Le mercato est fermé.">Faire une offre/);
 assert.doesNotMatch(closed,/talks-dialog/);
});

test('an obstacle to an offer is named in a pill, the reason after its colon left to the tooltip',async()=>{
 const fresh=await withApi(playerRoutes(player,{controlled_club_id:7,market:true},{...idle,obstacle:'Intransférable jusqu’au 21 septembre : il vient d’arriver.'}),()=>playerScreen(20));
 assert.match(fresh,/<span class="pill" title="Intransférable jusqu’au 21 septembre : il vient d’arriver.">Intransférable jusqu’au 21 septembre<\/span><button class="primary" type="button" disabled/);
 const kept=await withApi(playerRoutes(player,{controlled_club_id:7,market:true},{...idle,obstacle:'Nice ne peut pas s’en séparer.'}),()=>playerScreen(20));
 assert.match(kept,/<span class="pill">Nice ne peut pas s’en séparer.<\/span>/);
});

test('a counter-offer comes back in the dialog, ready to accept, and agreed steps wait in a pill',async()=>{
 const countered=await withApi(playerRoutes(player,{controlled_club_id:7,market:true},{...idle,etape:'indemnite',contre_offre:3450000,tours_restants:2}),()=>playerScreen(20));
 assert.match(countered,/Nice demande 3,45\sM\s?€<\/strong> · 2 offres restantes/);
 assert.match(countered,/<button type="submit" name="accepter" value="3450000">Accepter 3,45\sM\s?€<\/button>/);
 assert.match(countered,/name="montant" type="number" min="0" step="0.01" value="3.45"/);
 const agreed=await withApi(playerRoutes(player,{controlled_club_id:7,market:true},{...idle,etape:'accord_club',indemnite:3450000,date_prevue:'2029-08-04'}),()=>playerScreen(20));
 assert.match(agreed,/<span class="pill">Accord avec le club · 3,45\sM\s?€ · réponse le/);assert.doesNotMatch(agreed,/<dialog id="talks-dialog"/);
 const wage=await withApi(playerRoutes(player,{controlled_club_id:7,market:true},{...idle,etape:'salaire',indemnite:3450000}),()=>playerScreen(20));
 assert.match(wage,/data-open-dialog="talks-dialog">Négocier le contrat<\/button>/);assert.match(wage,/<form id="talks-form" data-kind="salaire">/);
 assert.match(wage,/Salaire proposé \(€\/mois\)/);
});

test('an own player is asked for his terms, signed from his page; a demand of his own can be refused too',async()=>{
 const own={...player,id:12,name:'Fidèle',club:ref(7,'Lens')};
 const html=await withApi(playerRoutes(own,{controlled_club_id:7,market:true}),()=>playerScreen(12));
 assert.doesNotMatch(html,/Faire une offre|Prolongation en attente/);
 assert.match(html,/<button class="primary" type="button" data-open-dialog="contract-dialog">Proposer un contrat<\/button>/);
 assert.match(html,/<dialog id="contract-dialog"[^]*<span>Salaire demandé<\/span><strong>6\s500\s€ \/ mois<\/strong>[^]*<button class="primary" data-command="prolongation" data-player="12">Signer<\/button>/);
 assert.doesNotMatch(html,/data-command="renouvellement"/);
 const asked=await withApi(playerRoutes(own,{controlled_club_id:7},idle,unlisted,noLoan,{...terms,demande:true}),()=>playerScreen(12));
 assert.match(asked,/<span class="pill">Prolongation en attente<\/span>/);
 assert.match(asked,/data-command="renouvellement" data-decision="refuser" data-player="12">Refuser<\/button><button class="primary" data-command="renouvellement" data-decision="accepter" data-player="12">Signer/);
 const unwilling=await withApi(playerRoutes({...own,id:13},{controlled_club_id:7},idle,unlisted,noLoan,{...terms,obstacle:'Fidèle vient d’arriver : il ne renégocie pas son contrat.',salaire_propose:null,fin_contrat_proposee:null}),()=>playerScreen(13));
 assert.match(unwilling,/<button class="primary" type="button" disabled title="Fidèle vient d’arriver : il ne renégocie pas son contrat.">Proposer un contrat<\/button>/);
 assert.doesNotMatch(unwilling,/contract-dialog/);
});

test('an own player goes on the transfer list or is offered to the clubs, and his offers open in a dialog',async()=>{
 const own={...player,id:12,name:'Fidèle',club:ref(7,'Lens'),value:2e6};
 const unsold=await withApi(playerRoutes(own,{controlled_club_id:7,market:true}),()=>playerScreen(12));
 assert.match(unsold,/data-open-dialog="listing-dialog">Mettre sur la liste<\/button>/);
 assert.match(unsold,/<form data-sale="liste">[^]*name="montant" type="number" min="0" step="0.01" value="2"/);
 assert.match(unsold,/data-open-dialog="proposal-dialog">Proposer aux clubs<\/button>/);assert.match(unsold,/<form data-sale="proposition">/);
 assert.doesNotMatch(unsold,/Offres reçues|Sur la liste/);
 const sale={prix_liste:4500000,obstacle_proposition:'Déjà proposé : nouvelle proposition le 12 août.',
  offres:[{offre_id:'proposition:1',acheteur:ref(9,'Nice'),indemnite:4500000,salaire_propose:2000}]};
 const listed=await withApi(playerRoutes(own,{controlled_club_id:7,market:true},idle,sale),()=>playerScreen(12));
 assert.match(listed,/<span class="pill">Sur la liste · 4,5\sM\s?€<\/span>/);
 assert.match(listed,/data-command="liste-transferts" data-player="12">Retirer de la liste<\/button>/);assert.doesNotMatch(listed,/listing-dialog/);
 assert.match(listed,/<button type="button" disabled title="Déjà proposé : nouvelle proposition le 12 août.">Proposer aux clubs<\/button>/);
 assert.doesNotMatch(listed,/proposal-dialog/);
 assert.match(listed,/data-open-dialog="offers-dialog">Offres reçues · 1<\/button>/);
 assert.match(listed,/<dialog id="offers-dialog"[^]*href="#\/club\/9"[^]*data-command="reponse-offre" data-decision="accepter" data-offer="proposition:1"/);
});
