import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playerMenu,playerScreen} from '../../web/player.js';
import {menuHtml,menuPlace,playerAt} from '../../web/player-menu.js';
import {compositionContent,lineupAction} from '../../web/composition.js';

const ref=(id,name)=>({id,name,major_color:'#aa0000',minor_color:'#ffcc00'});
const own={id:12,name:'Fidèle',position:'MC',secondary_positions:[],age:24,nationalities:['FRA'],club:ref(7,'Lens'),born:'2005-01-01',wage:1000,contract_end:'2030-06-30',value:2e6,asking_price:3e6,
 transferable:true,greed:.5,rating:70,potential:80,fitness:1,form:1,morale:.5,injured_until:null,discipline:[],attributes:{},position_ratings:{},loan:null};
const other={...own,id:20,name:'Cible',club:ref(9,'Nice')};
const state={controlled_club_id:7,market:true};
const durees=[{cle:'saison',fin:'2030-06-30'}];
const terms={obstacle:null,demande:false,salaire_actuel:1000,fin_contrat_actuelle:'2030-06-30',salaire_propose:1500,fin_contrat_proposee:'2032-06-30'};
const unlisted={prix_liste:null,intransferable:false,obstacle_proposition:null,offres:[]};
const inSquad={pret:null,en_reserve:false,obstacle_reserve:null,sens:'sortant',obstacle_pret:null,durees,clubs:[{...ref(9,'Nice'),reputation:61,competition:'Ligue 1'}]};
const lendable={pret:null,en_reserve:false,obstacle_reserve:null,sens:'entrant',obstacle_pret:null,durees,clubs:[]};
const idle={etape:null,indemnite:null,salaire:null,contre_offre:null,tours_restants:3,date_prevue:null,budget:5e6,obstacle:null};

async function withApi(routes,run){
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>{const path=url.replace(/^\/api/,'').split('?')[0];if(!(path in routes))throw new Error(`unexpected ${url}`);return {ok:true,json:async()=>routes[path]};};
 try{return await run();}finally{globalThis.fetch=previous;}
}
const routes=(player,{contract=terms,sale=unlisted,squad=inSquad,talks=idle}={})=>({[`/ma-partie/contrat/${player.id}`]:contract,[`/ma-partie/vente/${player.id}`]:sale,
 [`/ma-partie/effectif/${player.id}`]:squad,[`/ma-partie/negociation/${player.id}`]:talks});
const menu=(player,terms)=>withApi(routes(player,terms),()=>playerMenu(player,state,'menu-'));
// The rows of a menu, a line between two groups: [label, what stands on its right] (an amount keeps its unit by a no-break space).
const rows=html=>html.replace(/^<div class="menu" role="menu">|<\/div>$/g,'').split('<hr>').map(group=>[...group.matchAll(/<(?:button|p)[^>]*>([^<]+)(?:<span>([^<]*)<\/span>)?/g)].map(match=>match[2]?[match[1],match[2].replace(/\s/g,' ')]:[match[1]]));

test('the menu of an own player holds the actions of his page in three groups: the squad, his contract, his sale',async()=>{
 const parts=await menu(own),html=menuHtml(parts);
 assert.deepEqual(rows(html),[[['Envoyer en réserve'],['Prêter']],[['Proposer un contrat']],[['Mettre sur la liste'],['Proposer aux clubs'],['Déclarer intransférable']]]);
 assert.match(html,/^<div class="menu" role="menu"><button type="button" role="menuitem" data-command="reserve" data-player="12" data-reserve="1">Envoyer en réserve<\/button><button type="button" role="menuitem" data-open-dialog="menu-lend-dialog">Prêter<\/button><hr>/);
 assert.match(html,/data-command="intransferable" data-kept="1" data-player="12">Déclarer intransférable<\/button><\/div>$/);
 // Its dialogs keep ids of their own, apart from the ones of the page under it.
 for(const id of ['lend','contract','listing','proposal'])assert.match(parts.dialogs,new RegExp(`<dialog id="menu-${id}-dialog"`));
 assert.match(parts.dialogs,/<form data-sale="liste">/);assert.match(parts.dialogs,/<form data-loan="preter">/);
 assert.doesNotMatch(parts.dialogs,/<dialog id="(lend|contract|listing|proposal)-dialog"/);
});

test('where an action stands is written on its right: the offers received, the price asked, the contract he waits for',async()=>{
 const sale={prix_liste:45e6,intransferable:true,obstacle_proposition:null,offres:[{offre_id:'a',acheteur:ref(9,'Nice'),indemnite:4e7,salaire_propose:2000},{offre_id:'b',acheteur:ref(8,'Brest'),indemnite:42e6,salaire_propose:2100}]};
 const parts=await menu(own,{sale,contract:{...terms,demande:true},squad:{...inSquad,en_reserve:true}}),html=menuHtml(parts);
 assert.deepEqual(rows(html),[[['Rappeler en équipe première'],['Prêter']],[['Proposer un contrat','En attente']],[['Offres reçues','2'],['Retirer de la liste','45 M€'],['Proposer aux clubs'],['Rendre transférable']]]);
 assert.match(html,/data-open-dialog="menu-offers-dialog">Offres reçues<span>2<\/span>/);
 assert.match(html,/data-command="liste-transferts" data-player="12">Retirer de la liste<span>45\sM€<\/span>/);
 assert.match(html,/data-command="reserve" data-player="12" data-reserve="">Rappeler en équipe première</);
 assert.match(parts.dialogs,/<dialog id="menu-offers-dialog"/);assert.doesNotMatch(parts.dialogs,/menu-listing-dialog/);
});

test('an action that cannot be taken stays in its place, its reason in its tooltip, and carries nothing to send',async()=>{
 const parts=await menu(own,{squad:{...inSquad,obstacle_reserve:'Votre équipe première doit garder 18 joueurs, dont 2 gardiens.',obstacle_pret:'Le mercato est fermé.',durees:[],clubs:[]},
  sale:{...unlisted,obstacle_proposition:'Le mercato est fermé.'},contract:{...terms,obstacle:'Fidèle vient d’arriver : il ne renégocie pas son contrat.',salaire_propose:null,fin_contrat_proposee:null}});
 const html=menuHtml(parts);
 assert.match(html,/<button type="button" role="menuitem" aria-disabled="true" title="Votre équipe première doit garder 18 joueurs, dont 2 gardiens.">Envoyer en réserve<\/button>/);
 assert.match(html,/<button type="button" role="menuitem" aria-disabled="true" title="Le mercato est fermé.">Prêter<\/button>/);
 assert.match(html,/aria-disabled="true" title="Fidèle vient d’arriver : il ne renégocie pas son contrat.">Proposer un contrat</);
 assert.match(html,/aria-disabled="true" title="Le mercato est fermé.">Proposer aux clubs</);
 assert.match(html,/data-open-dialog="menu-listing-dialog">Mettre sur la liste</);
 assert.doesNotMatch(html,/data-command="reserve"|disabled title/);
 assert.doesNotMatch(parts.dialogs,/lend-dialog|contract-dialog|proposal-dialog/);
});

test('on his page too, a move to the reserve that cannot be made sends nothing',async()=>{
 const history={career:{items:[],totals:{fee:0,matches:0,goals:0,assists:0,average:null}},trajectory:[]};
 const html=await withApi({...routes(own,{squad:{...inSquad,obstacle_reserve:'Votre équipe première doit garder 18 joueurs, dont 2 gardiens.'}}),'/joueurs/12':own,'/joueurs/12/historique':history,'/joueurs/12/navigation':null,'/monde/etat':state},()=>playerScreen(12));
 assert.match(html,/<button type="button" disabled title="Votre équipe première doit garder 18 joueurs, dont 2 gardiens.">Envoyer en réserve<\/button>/);
});

test('another club’s player is offered for and borrowed, in one group; a free one is offered a contract',async()=>{
 const open=await menu(other,{squad:lendable});
 assert.deepEqual(rows(menuHtml(open)),[[['Faire une offre'],['Emprunter']]]);
 assert.match(menuHtml(open),/data-open-dialog="menu-talks-dialog">Faire une offre<\/button><button type="button" role="menuitem" data-open-dialog="menu-borrow-dialog">Emprunter</);
 assert.match(open.dialogs,/<dialog id="menu-talks-dialog" class="action-dialog"><form id="menu-talks-form" data-kind="indemnite">/);
 const counter=await menu(other,{squad:lendable,talks:{...idle,contre_offre:62e6,tours_restants:2}});
 assert.deepEqual(rows(menuHtml(counter))[0][0],['Faire une offre','Contre-offre · 62 M€']);
 const closed=await menu(other,{squad:{...lendable,obstacle_pret:'Nice ne souhaite pas prêter Cible.'},talks:{...idle,obstacle:'Le mercato est fermé.'}});
 assert.match(menuHtml(closed),/aria-disabled="true" title="Le mercato est fermé.">Faire une offre<\/button><button type="button" role="menuitem" aria-disabled="true" title="Nice ne souhaite pas prêter Cible.">Emprunter</);
 assert.equal(closed.dialogs,'');
 const wage=await menu(other,{squad:lendable,talks:{...idle,etape:'salaire',indemnite:3e6}});
 assert.equal(rows(menuHtml(wage))[0][0][0],'Négocier le contrat');assert.match(wage.dialogs,/data-kind="salaire"/);
 // A free agent has no club to pay and none to borrow him from: only the talks are asked for.
 const parts=await withApi({'/ma-partie/negociation/20':idle},()=>playerMenu({...other,club:null},state,'menu-'));
 assert.deepEqual(rows(menuHtml(parts)),[[['Proposer un contrat']]]);
});

test('where nothing can be decided the menu tells the player’s state alone: talks agreed, a loan, a career over',async()=>{
 const agreed=await menu(other,{squad:{...lendable,obstacle_pret:'Un transfert de Cible est en cours.'},talks:{...idle,etape:'accord_club',indemnite:62e6,date_prevue:'2026-01-22'}});
 assert.match(menuHtml(agreed),/^<div class="menu" role="menu"><p>Accord avec le club · 62\sM€ · réponse le 22 janv\. 2026<\/p><hr><button type="button" role="menuitem" aria-disabled="true" title="Un transfert de Cible est en cours.">Emprunter<\/button><\/div>$/);
 const signed=await menu(other,{squad:{...lendable,obstacle_pret:'Un transfert de Cible est en cours.'},talks:{...idle,etape:'signature',salaire:2000,date_prevue:'2026-02-01'}});
 assert.match(menuHtml(signed),/<p>Arrivée le 1 févr\. 2026 · /);
 // On loan or retired, the game is not even asked.
 const loan={parent:ref(7,'Lens'),club:ref(9,'Nice'),end:'2026-06-30'};
 const away=await withApi({},()=>playerMenu({...own,club:ref(9,'Nice'),loan},state,'menu-'));
 assert.equal(menuHtml(away),'<div class="menu" role="menu"><p>Prêté à Nice · retour le 30 juin 2026</p></div>');
 const borrowed=await withApi({},()=>playerMenu({...own,loan:{parent:ref(9,'Nice'),club:ref(7,'Lens'),end:'2026-06-30'}},state,'menu-'));
 assert.match(menuHtml(borrowed),/<p>Prêté par Nice · retour le 30 juin 2026<\/p>/);
 assert.equal(menuHtml(await withApi({},()=>playerMenu({id:3,name:'Ancien',retired:true},state,'menu-'))),'<div class="menu" role="menu"><p>Retraité</p></div>');
 assert.equal(menuHtml({state:null,groups:[[]],dialogs:''}),'');
});

test('on the Composition screen the menu opens with the lineup: out of it, or onto the next free place',async()=>{
 const F433=['GB','DG','DC','DC','DD','MDC','MC','MC','AILG','BU','AILD'];
 const player=(id,position)=>({id,name:`Joueur ${id}`,position,rating:100,potential:120,fitness:.9,appearances:3,goals:1,assists:0,average:6.5,unavailable:null});
 const data={match_id:41,home:true,opponent:null,bench_size:1,formations:{'4-3-3':F433},players:[player(1,'GB'),player(2,'DC'),player(3,'BU')],
  default:{formation:'4-3-3',titulaires:[[1,'GB']],banc:[2]},suggestions:{}};
 const inEditor={closest:selector=>selector==='#lineup-form'?{}:null},elsewhere={closest:()=>null};
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 // The editor counts as on screen while its form is in the page.
 globalThis.document={querySelector:selector=>selector==='#lineup-form[data-match="41"]'?{}:null};
 try{
  await compositionContent(new URLSearchParams(),{awaiting_lineup:41});
  assert.deepEqual(lineupAction(inEditor,1),{label:'Sortir de la composition',send:{'lineup-move':1}});
  assert.deepEqual(lineupAction(inEditor,2),{label:'Sortir de la composition',send:{'lineup-move':2}});
  assert.deepEqual(lineupAction(inEditor,3),{label:'Mettre dans la composition',send:{'lineup-move':3},obstacle:null});
  // Away from the editor, and for a player who is not of the squad (the opponent's), the lineup has nothing to say.
  assert.equal(lineupAction(elsewhere,1),null);assert.equal(lineupAction(inEditor,99),null);
  const html=menuHtml(await menu({...own,id:3}),lineupAction(inEditor,3));
  assert.match(html,/^<div class="menu" role="menu"><button type="button" role="menuitem" data-lineup-move="3">Mettre dans la composition<\/button><hr><button type="button" role="menuitem" data-command="reserve"/);
  // A player of the match alone has only his place in the lineup.
  assert.equal(menuHtml({state:null,groups:[],dialogs:''},{label:'Sortir de la composition',send:{'lineup-move':-4}}),'<div class="menu" role="menu"><button type="button" role="menuitem" data-lineup-move="-4">Sortir de la composition</button></div>');
  assert.match(menuHtml({state:null,groups:[],dialogs:''},{label:'Mettre dans la composition',send:{'lineup-move':3},obstacle:'Aucune place libre.'}),/aria-disabled="true" title="Aucune place libre.">Mettre dans la composition</);
 }finally{globalThis.fetch=previous;delete globalThis.document;}
});

test('the menu opens at the pointer, to its right and below; without room, to its left or above',()=>{
 assert.deepEqual(menuPlace(100,200,216,236,1920,1080),{left:100,top:200});
 assert.deepEqual(menuPlace(1800,200,216,236,1920,1080),{left:1584,top:200});
 assert.deepEqual(menuPlace(100,1000,216,236,1920,1080),{left:100,top:764});
 assert.deepEqual(menuPlace(100,100,216,236,200,150),{left:0,top:0});
});

// A page reduced to what the menu looks for: what was clicked, what carries the player, the row or the line around it.
const link=id=>({dataset:{},getAttribute:()=>`#/player/${id}`});
const line=(...ids)=>({querySelectorAll:()=>ids.map(link)});
const clicked=(direct,around)=>({closest:selector=>selector==='tr,li'?around:direct});

test('a right click is about the player it lands on, else about the one his row or his line names alone',()=>{
 const name=link(12),row=line(12),carrier={dataset:{player:'8'},getAttribute:()=>null};
 // His name in his row: the row is what the menu marks.
 assert.deepEqual(playerAt(clicked(name,row)),{id:12,element:row});
 // A cell of his row, off his name.
 assert.deepEqual(playerAt(clicked(null,row)),{id:12,element:row});
 // A row that names two players is about neither, unless the click lands on one: his name is then what is marked.
 const shared=line(12,14);
 assert.equal(playerAt(clicked(null,shared)),null);
 assert.deepEqual(playerAt(clicked(name,shared)),{id:12,element:name});
 // A place of a pitch, outside any row; a row or a button that carries him.
 assert.deepEqual(playerAt(clicked(carrier,null)),{id:8,element:carrier});
 assert.deepEqual(playerAt(clicked(carrier,line(8))).id,8);
 assert.equal(playerAt(clicked(null,null)),null);assert.equal(playerAt(clicked(null,line())),null);
});
