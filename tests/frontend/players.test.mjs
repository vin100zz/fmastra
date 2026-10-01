import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playersScreen} from '../../web/screens.js';

const player={id:1,name:'Cible',position:'BU',age:24,nationalities:['FRA'],rating:70,potential:75,value:2e6,wage:12000,fitness:1,contract_end:'2028-06-30',asking_price:3450000,transferable:true,wage_demand:21462,interested:false};

async function render(query,controlled){
 const previous=globalThis.fetch,asked=[];
 globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>url.includes('/monde/etat')?{controlled_club_id:controlled}:{items:[player],total:1,page:1,page_size:30}};};
 try{return {html:await playersScreen(new URLSearchParams(query)),asked};}finally{globalThis.fetch=previous;}
}

test('with a club of his own the user filters the players on their interest and on what they ask',async()=>{
 const {html,asked}=await render('interesse=oui&pretentions_max=93000',7);
 assert.match(html,/<select name="interesse"[^>]*><option value="">Tous les joueurs<\/option><option value="oui" selected>Joueurs intéressés<\/option><option value="non" >Joueurs non intéressés<\/option>/);
 assert.match(html,/<details class="filters" open>/);
 assert.match(html,/Prétentions max\. \(€\/mois\) <input name="pretentions_max" type="number" min="0" value="93000">/);
 assert.match(html,/data-sort="wage_demand">PRÉTENTIONS</);assert.match(html,/data-sort="interested">INTÉRESSÉ</);
 // The request carries the bound as a weekly wage.
 assert.ok(asked.some(url=>url.includes('interesse=oui')&&url.includes('pretentions_max=21462')));
});

test('without a club the players list has neither the columns nor the filters of a recruiter',async()=>{
 const {html}=await render('',null);
 assert.doesNotMatch(html,/interesse|pretentions_max|PRÉTENTIONS|INTÉRESSÉ/);
 assert.match(html,/PRIX MIN\./);
});
