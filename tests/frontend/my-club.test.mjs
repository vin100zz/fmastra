import {test} from 'node:test';
import assert from 'node:assert/strict';
import {myClubScreen} from '../../web/my-club.js';
import {playerScreen} from '../../web/player.js';

const ref=(id,name)=>({id,name,major_color:'#aa0000',minor_color:'#ffcc00'});
const club={id:7,name:'Lens',competition_id:3,competition:'Ligue 1',major_color:'#cc0000',minor_color:'#ffd700'};
const overview={calendar:{last:[],next:[]},finances:{transfer_budget:5e6,reserved_transfer_budget:0,wage_bill:100,wage_cap:200},lineup:null};
const news={items:[{id:1,date:'2029-08-02',kind:'offer_received',text:'Nice propose 3 M€ pour Vendu.',player_id:11,player:'Vendu',match_id:null,read:false},{id:0,date:'2029-08-01',kind:'season',text:'Ouverture.',player_id:null,match_id:null,read:true}],total:2,page:1,page_size:30,unread:1};
const transfers={sortantes:[{offre_id:'out',joueur_id:20,joueur:'Cible',vendeur:ref(9,'Nice'),indemnite:1e6,salaire_propose:1000}],
 entrantes:[{joueur_id:11,joueur:'Vendu',offres:[{offre_id:'in-1',acheteur:ref(9,'Nice'),indemnite:3e6,salaire_propose:2000}]}]};
const contracts={items:[{joueur_id:12,nom:'Fidèle',salaire_actuel:1000,salaire_propose:1500,fin_contrat_proposee:'2032-06-30',fin_contrat_actuelle:'2030-06-30'}],total:1};
const standings={items:[{rank:1,club:ref(7,'Lens'),played:1,difference:2,points:3,form:'V',movement:null}]};

async function withApi(routes,run){
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>{const path=url.replace(/^\/api/,'').split('?')[0];if(!(path in routes))throw new Error(`unexpected ${url}`);return {ok:true,json:async()=>routes[path]};};
 try{return await run();}finally{globalThis.fetch=previous;}
}

test('the dashboard shows an inbox with unread entries and the club widgets, without tabs',async()=>{
 const html=await withApi({'/monde/etat':{controlled_club_id:7,awaiting_lineup:null},'/clubs/7':club,'/clubs/7/apercu':overview,'/ma-partie/actualites':news,
  '/ma-partie/transferts':transfers,'/ma-partie/contrats':contracts,'/competitions/3/classement':standings},()=>myClubScreen(new URLSearchParams()));
 assert.doesNotMatch(html,/class="tabs"/);
 assert.match(html,/<div class="inbox-item unread" data-news="1">/);
 assert.match(html,/Nice propose 3 M€ pour <a href="#\/player\/11">Vendu<\/a>\./);
 assert.match(html,/<div class="inbox-item" data-news="0">.*<span class="inbox-text">Ouverture\.<\/span>/);
 assert.match(html,/Actualités · 1 non lue/);
 for(const link of ['#/club/7/calendar','#/league/3','#/club/7/composition','#/club/7/finances','#/club/7/transfers'])assert.ok(html.includes(`href="${link}"`),link);
 assert.match(html,/data-command="reponse-offre" data-decision="accepter" data-offer="in-1"/);
 assert.match(html,/href="#\/player\/12">Répondre →/);
});

const player={id:20,name:'Cible',position:'BU',secondary_positions:[],age:24,nationalities:['FRA'],club:ref(9,'Nice'),born:'2005-01-01',wage:1000,contract_end:'2030-06-30',value:2e6,
 rating:70,potential:80,fitness:1,form:0,morale:.5,injured_until:null,discipline:[],attributes:{},position_ratings:{}};
const history={career:{items:[],totals:{fee:0,matches:0,goals:0,assists:0,average:null}},trajectory:{items:[]}};
const playerRoutes=(detail,state)=>({[`/joueurs/${detail.id}`]:detail,[`/joueurs/${detail.id}/historique`]:history,[`/joueurs/${detail.id}/navigation`]:null,'/monde/etat':state,'/ma-partie/transferts':transfers,'/ma-partie/contrats':contracts});

test('an inbox entry links its player and its match, never the whole entry but for a result',async()=>{
 const items=[{id:2,date:'2029-08-03',kind:'injury',text:'Ada Un se blesse en match',player_id:5,player:'Ada Un',match_id:40,read:false},
  {id:1,date:'2029-08-02',kind:'result',text:'Lens 2–1 Metz',player_id:null,player:null,match_id:41,read:false},
  {id:0,date:'2029-08-01',kind:'suspension',text:'Bob <Deux> est suspendu 1 match',player_id:6,player:'Bob <Deux>',match_id:42,read:true}];
 const html=await withApi({'/monde/etat':{controlled_club_id:7,awaiting_lineup:null},'/clubs/7':club,'/clubs/7/apercu':overview,'/ma-partie/actualites':{...news,items},
  '/ma-partie/transferts':transfers,'/ma-partie/contrats':contracts,'/competitions/3/classement':standings},()=>myClubScreen(new URLSearchParams()));
 assert.match(html,/<a href="#\/player\/5">Ada Un<\/a> se blesse en <a href="#\/match\/40">match<\/a><\/span>/);
 assert.match(html,/<span class="inbox-text"><a href="#\/match\/41">Lens 2–1 Metz<\/a><\/span>/);
 assert.match(html,/<a href="#\/player\/6">Bob &lt;Deux&gt;<\/a> est suspendu 1 match<\/span>/);
});

test('another club’s player can receive an offer from his page, only while the market is open',async()=>{
 const open=await withApi(playerRoutes(player,{controlled_club_id:7,market:true}),()=>playerScreen(20));
 assert.match(open,/<button class="primary" type="button" data-open-dialog="offer-dialog" >Faire une offre<\/button>/);
 assert.match(open,/<form id="offer-form">/);assert.match(open,/Offre en cours/);
 const closed=await withApi(playerRoutes(player,{controlled_club_id:7,market:false}),()=>playerScreen(20));
 assert.match(closed,/data-open-dialog="offer-dialog" disabled/);
});

test('an own player gets a contract proposal instead, enabled when he awaits a renewal',async()=>{
 const own={...player,id:12,name:'Fidèle',club:ref(7,'Lens')};
 const html=await withApi(playerRoutes(own,{controlled_club_id:7,market:true}),()=>playerScreen(12));
 assert.doesNotMatch(html,/Faire une offre/);
 assert.match(html,/data-open-dialog="contract-dialog" >Proposer un contrat/);
 assert.match(html,/data-command="renouvellement" data-decision="accepter" data-player="12"/);
 const settled=await withApi(playerRoutes({...own,id:13},{controlled_club_id:7}),()=>playerScreen(13));
 assert.match(settled,/data-open-dialog="contract-dialog" disabled/);
});
