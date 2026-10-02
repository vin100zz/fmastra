import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playersScreen} from '../../web/screens.js';

const player={id:1,name:'Cible',position:'BU',age:24,nationalities:['FRA'],rating:70,potential:75,value:2e6,wage:12000,fitness:1,contract_end:'2028-06-30',asking_price:3450000,transferable:true,wage_demand:21462,interested:false,appearances:12,substitutes:2,goals:7,assists:3,average:6.84};

async function render(query,controlled){
 const previous=globalThis.fetch,asked=[];
 globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>url.includes('/monde/etat')?{controlled_club_id:controlled}:{items:[player],total:1,page:1,page_size:30}};};
 try{return {html:await playersScreen(new URLSearchParams(query)),asked};}finally{globalThis.fetch=previous;}
}

test('with a club of his own the user filters the players on their interest and on what they ask',async()=>{
 const {html,asked}=await render('interesse=oui&pretentions_max=93000',7);
 assert.match(html,/<select name="interesse"[^>]*class="on"><option value="">Intérêt<\/option><option value="oui" selected>Joueurs intéressés<\/option><option value="non" >Joueurs non intéressés<\/option>/);
 // The bound on what they ask is folded in a menu, which reads it on its button.
 assert.match(html,/<details class="filter-menu on"><summary>Prétentions <b>≤ 93\s000 €<\/b>/);
 assert.match(html,/<label>Max\. \(€\/mois\) <input name="pretentions_max" type="number" min="0" value="93000"><\/label>/);
 assert.match(html,/data-sort="wage_demand">PRÉTENTIONS</);assert.match(html,/data-sort="interested">INTÉRESSÉ</);
 // The request carries the bound as a weekly wage.
 assert.ok(asked.some(url=>url.includes('interesse=oui')&&url.includes('pretentions_max=21462')));
});

test('without a club the players list has neither the columns nor the filters of a recruiter',async()=>{
 const {html}=await render('',null);
 assert.doesNotMatch(html,/interesse|pretentions_max|PRÉTENTIONS|INTÉRESSÉ/);
 assert.match(html,/PRIX MIN\./);
});

test('the title and the filters stand on one line: positions as chips, ranges in menus, the rest in lists',async()=>{
 const {html,asked}=await render('poste=MC,BU&age_max=23&potentiel_min=180&valeur_min=10&contrat=libre&tri=goals&ordre=desc',7);
 assert.match(html,/^<form class="toolbar" data-filter><h1>Joueurs<\/h1><input name="recherche" type="search"/);
 assert.deepEqual([...html.matchAll(/class="chip \w+ on"[^>]*>(\w+)</g)].map(match=>match[1]),['MC','BU']);
 assert.deepEqual([...html.matchAll(/<details class="filter-menu( on)?"><summary>([^<]+?)(?: <b>([^<]*)<\/b>)?(?:<a|<\/summary)/g)].map(match=>[match[2],match[3]]),
  [['Âge','≤ 23'],['Niveau',undefined],['Potentiel','≥ 180'],['Valeur','≥ 10 M€'],['Prix min.',undefined],['Salaire',undefined],['Prétentions',undefined]]);
 assert.deepEqual([...html.matchAll(/<select name="(\w+)"/g)].map(match=>match[1]),['contrat','statut_club','interesse']);
 assert.match(html,/<button type="button" data-reset-filters >Réinitialiser<\/button><\/form>/);
 // Levels are asked on the server's scale, values in euros; without a window the server keeps its page size.
 const request=decodeURIComponent(asked.find(url=>url.includes('/joueurs?')));
 assert.match(request,/poste=MC,BU/);assert.match(request,/potentiel_min=90/);assert.match(request,/valeur_min=10000000/);
 assert.doesNotMatch(request,/taille|sel=/);
});

test('the list of the world’s players adds the season’s figures, pages from the head of its card and has no preview without a wide window',async()=>{
 const {html,asked}=await render('tri=goals&ordre=desc',7);
 const headers=[...html.matchAll(/<th class="(\w+)-column"><button[^>]*data-sort="(\w+)"/g)].map(match=>match[2]);
 assert.deepEqual(headers,['position','name','nation','age','rating','potential','club','value','asking_price','wage','wage_demand','interested','contract_end','fitness','appearances','goals','assists','average']);
 assert.match(html,/data-order="desc" data-sort="goals">BUTS</);
 assert.match(html,/<span class="num">10 \(2\)<\/span>/);assert.match(html,/<span class="num">6,8<\/span>/);
 assert.match(html,/<div class="split" data-fit="players" data-rows="">/);
 assert.doesNotMatch(html,/class="pager"|data-select|class="side"/);
 assert.equal(asked.length,2);
});
