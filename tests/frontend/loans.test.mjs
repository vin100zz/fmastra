import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clubScreen,playersScreen} from '../../web/screens.js';
import {playerScreen} from '../../web/player.js';
import {movementsHistory} from '../../web/club-history.js';
import {playerTable} from '../../web/ui.js';

const ref=(id,name)=>({id,name,major_color:'#aa0000',minor_color:'#ffcc00'});
const player={id:1,name:'Titulaire',position:'MC',age:27,nationalities:['FRA'],rating:70,potential:72,value:2e6,wage:12000,fitness:1,contract_end:'2030-06-30',
 form:1,morale:.7,appearances:3,substitutes:0,goals:0,assists:0,yellows:0,reds:0,average:6.8,loan:null,reserve:false,away:false};
const loan={parent:ref(7,'Lens'),club:ref(9,'Nice'),end:'2030-06-30'};
const squad=[player,{...player,id:2,name:'Emprunté',loan:{parent:ref(9,'Nice'),club:ref(7,'Lens'),end:'2030-06-30'}},
 {...player,id:3,name:'Espoir',age:18,reserve:true},{...player,id:4,name:'Parti',age:19,loan,away:true}];
const club={id:7,name:'Lens',nation_code:'FRA',competition:'Ligue 1',capacity:38000,formation:'4-3-3',training_facilities:14,youth_recruitment:12,active:true,squad_size:3,standing:null};
const overview={calendar:{last:[],next:[]},finances:{transfer_budget:5e6,reserved_transfer_budget:0,wage_bill:100,wage_cap:200},lineup:null,
 transfers:{season:2029,arrivals:{count:0,total:0,items:[]},departures:{count:0,total:0,items:[]},others:{academy:0,release:0,retirement:0}}};

async function withApi(routes,run){
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>{const path=url.replace(/^\/api/,'').split('?')[0];if(!(path in routes))throw new Error(`unexpected ${url}`);return {ok:true,json:async()=>routes[path]};};
 try{return await run();}finally{globalThis.fetch=previous;}
}
const squadScreen=controlled=>withApi({'/clubs/7':club,'/clubs/7/navigation':null,'/monde/etat':{controlled_club_id:controlled},'/clubs/7/apercu':overview,
 '/clubs/7/effectif':{items:squad,total:4,page:1,page_size:100}},()=>clubScreen(7,'squad',new URLSearchParams()));

test('the squad is two lists: the first team, then the reserve with the players the club has lent',async()=>{
 const html=await squadScreen(null);
 const [first,second]=html.split('<h2>Réserve');
 assert.match(first,/<h2>Équipe première · 2 joueurs<\/h2>/);
 assert.match(first,/Titulaire/);assert.match(first,/Emprunté/);assert.doesNotMatch(first,/Espoir|Parti/);
 assert.match(second,/^ · 1 joueur · 1 prêté<\/h2>/);
 assert.match(second,/Espoir/);assert.match(second,/Parti/);
 // A player on loan is tinted and tagged, whichever way the loan goes.
 assert.match(first,/<tr class="borrowed">.*Emprunté<\/a><\/span><span class="tag loan" title="Prêté par Nice à Lens jusqu’au 30 juin 2030">Prêt<\/span>/);
 assert.match(second,/<tr class="lent">.*Parti<\/a><\/span><span class="tag loan" title="Prêté par Lens à Nice jusqu’au 30 juin 2030">Prêt<\/span>/);
 // Another club's squad is only read.
 assert.doesNotMatch(html,/data-command="reserve"/);
});

test('the lists of the user’s club hold no button either: a player moves between them from his menu or his page',async()=>{
 const html=await squadScreen(7);
 assert.doesNotMatch(html,/data-command="reserve"|action-column/);
 assert.match(html,/<th class="average-column"><button[^>]*>NOTE<\/button><\/th><\/tr>/);
});

test('an empty reserve takes a head and nothing else for the user’s club, and no place at all for another club',async()=>{
 const routes=controlled=>({'/clubs/7':club,'/clubs/7/navigation':null,'/monde/etat':{controlled_club_id:controlled},'/clubs/7/apercu':overview,
  '/clubs/7/effectif':{items:[player],total:1,page:1,page_size:100}});
 const own=await withApi(routes(7),()=>clubScreen(7,'squad',new URLSearchParams()));
 assert.match(own,/<h2>Réserve · 0 joueur<\/h2><\/div><\/section><\/div><aside class="club-widgets"/);
 assert.doesNotMatch(await withApi(routes(null),()=>clubScreen(7,'squad',new URLSearchParams())),/Réserve/);
});

test('the list of the world’s players tells who is listed and who is interested, for a transfer or a loan',()=>{
 const items=[{...player,transfer_listed:true,loan_listed:false,interested:true,loan_interested:true},{...player,id:2,transfer_listed:false,loan_listed:true,interested:false,loan_interested:false},
  {...player,id:3,transfer_listed:false,loan_listed:false,interested:null,loan_interested:null}];
 const html=playerTable({items,total:3,page_size:30},true,'value','desc',{asking:true,recruiting:true});
 assert.match(html,/<th class="listed-column"><button data-first="desc" data-sort="listed"><span title="[^"]*">LISTÉ</);
 const rows=[...html.matchAll(/<tr class="">(.*?)<\/tr>/g)].map(row=>row[1]);
 const tags=text=>[...text.matchAll(/<span class="tag( loan)?"[^>]*>([^<]+)<\/span>/g)].map(match=>match[2]);
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(tags),[['T','T','P'],['P'],[]]);
 assert.match(rows[1],/<span class="muted">Non<\/span>/);
});

test('the players list filters on what clubs list and on the interest in a loan',async()=>{
 const previous=globalThis.fetch,asked=[];
 globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>url.includes('/monde/etat')?{controlled_club_id:7}:{items:[player],total:1,page:1,page_size:30}};};
 let html;
 try{html=await playersScreen(new URLSearchParams('liste=pret&interesse=pret'));}finally{globalThis.fetch=previous;}
 assert.match(html,/<select name="liste"[^>]*class="on"><option value="">Listés<\/option><option value="transfert" >Listés pour un transfert<\/option><option value="pret" selected>Listés pour un prêt<\/option>/);
 assert.match(html,/<option value="pret" selected>Intéressés par un prêt<\/option>/);
 assert.ok(asked.some(url=>url.includes('liste=pret')&&url.includes('interesse=pret')));
});

const detail={...player,id:12,name:'Espoir',club:ref(7,'Lens'),born:'2011-01-01',secondary_positions:[],asking_price:1e6,transferable:true,greed:.5,injured_until:null,discipline:[],attributes:{},position_ratings:{}};
const history={career:{items:[{season:2029,club:ref(9,'Nice'),fee:0,loan:true,competition:'Ligue 1',competition_nation:'FRA',matches:4,substitutes:1,goals:1,assists:0,average:6.9}],totals:{fee:0,matches:4,goals:1,assists:0,average:6.9}},trajectory:[]};
const idle={etape:null,indemnite:null,salaire:null,contre_offre:null,tours_restants:3,date_prevue:null,obstacle:null};
const routes=(shown,squadOptions)=>({[`/joueurs/${shown.id}`]:shown,[`/joueurs/${shown.id}/historique`]:history,[`/joueurs/${shown.id}/navigation`]:null,'/monde/etat':{controlled_club_id:7,market:'summer'},
 [`/ma-partie/contrat/${shown.id}`]:{obstacle:'Le joueur n’attend pas de prolongation.',demande:false,salaire_actuel:1000,fin_contrat_actuelle:'2030-06-30',salaire_propose:null,fin_contrat_proposee:null},[`/ma-partie/vente/${shown.id}`]:{prix_liste:null,obstacle_proposition:null,offres:[]},[`/ma-partie/negociation/${shown.id}`]:idle,[`/ma-partie/effectif/${shown.id}`]:squadOptions});
const durees=[{cle:'saison',fin:'2030-06-30'},{cle:'demi_saison',fin:'2029-12-31'}];

test('an own player is sent to the reserve and lent to a club that would take him, from his page',async()=>{
 const html=await withApi(routes(detail,{pret:null,en_reserve:false,obstacle_reserve:null,sens:'sortant',obstacle_pret:null,durees,clubs:[{...ref(9,'Nice'),reputation:61,competition:'Ligue 1'}]}),()=>playerScreen(12));
 assert.match(html,/<button type="button" data-command="reserve" data-player="12" data-reserve="1">Envoyer en réserve<\/button>/);
 assert.match(html,/<button type="button" data-open-dialog="lend-dialog">Prêter<\/button>/);
 assert.match(html,/<form data-loan="preter">.*<select name="club_id"><option value="9">Nice · Ligue 1<\/option><\/select>/);
 assert.match(html,/<select name="duree"><option value="saison">Fin de saison · 30 juin 2030<\/option><option value="demi_saison">Demi-saison · 31 déc\. 2029<\/option><\/select>/);
 // A season spent on loan says so in his career.
 assert.match(html,/Nice<\/a><\/td><td>Prêt<\/td>/);
 const kept=await withApi(routes({...detail,reserve:true},{pret:null,en_reserve:true,obstacle_reserve:null,sens:'sortant',obstacle_pret:'Le mercato est fermé.',durees:[],clubs:[]}),()=>playerScreen(12));
 assert.match(kept,/<span class="pill">En réserve<\/span>/);
 assert.match(kept,/data-reserve="">Rappeler en équipe première<\/button><button type="button" disabled title="Le mercato est fermé.">Prêter<\/button>/);
 assert.match(kept,/<span>Équipe<\/span><strong>Réserve<\/strong>/);assert.doesNotMatch(kept,/lend-dialog/);
});

test('another club’s player is borrowed from his page when his club lends him, and a loan under way leaves nothing to decide',async()=>{
 const other={...detail,id:20,name:'Cible',club:ref(9,'Nice'),loan_listed:true,interested:false,loan_interested:true};
 const open=await withApi(routes(other,{pret:null,en_reserve:false,obstacle_reserve:null,sens:'entrant',obstacle_pret:null,durees,clubs:[]}),()=>playerScreen(20));
 assert.match(open,/<button type="button" data-open-dialog="borrow-dialog">Emprunter<\/button><dialog id="borrow-dialog" class="action-dialog"><form data-loan="emprunter">/);
 const refused=await withApi(routes(other,{pret:null,en_reserve:false,obstacle_reserve:null,sens:'entrant',obstacle_pret:'Nice ne souhaite pas prêter Cible.',durees,clubs:[]}),()=>playerScreen(20));
 assert.match(refused,/<button type="button" disabled title="Nice ne souhaite pas prêter Cible.">Emprunter<\/button>/);
 const away=await withApi(routes({...detail,club:ref(9,'Nice'),loan},null),()=>playerScreen(12));
 assert.match(away,/<span class="pill">Prêté à Nice · retour le 30 juin 2030<\/span>/);
 assert.match(away,/<span>Prêté par<\/span><strong><a href="#\/club\/7"/);
 assert.doesNotMatch(away,/Faire une offre|Emprunter|Mettre sur la liste/);
});

test('a club’s movements list the loans of the season on each side, without a fee',()=>{
 const row={date:'2029-08-02',player_id:4,player:'Parti',source:ref(7,'Lens'),target:ref(9,'Nice'),fee:0,kind:'loan',age:19};
 const sections={arrivals:[],departures:[],release:[],retirement:[],academy:[],departure_unknown:[],loans_in:[],loans_out:[row]};
 const html=movementsHistory({season:2029,previous_season:null,next_season:null,history_since:'2029-07-01',arrival_total:0,departure_total:0,sections});
 const [arrivals,departures]=html.split('aria-label="Départs"');
 assert.match(departures,/<span class="movement-kind loan">Prêt<\/span>.*Parti.*<a href="#\/club\/9"[^>]*>.*Nice<\/a><\/span><b class="movement-fee">—<\/b>/);
 assert.doesNotMatch(arrivals,/movement-kind loan/);
});
