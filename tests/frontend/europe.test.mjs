import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {europeScreen} from '../../web/europe.js';
import {fixtures} from '../../web/ui.js';
import {matchScreen} from '../../web/match.js';

const cups=[{id:-101,code:'C1',name:'Ligue des champions',kind:'europe'},
 {id:-103,code:'C3',name:'Ligue Europa',kind:'europe'},
 {id:-104,code:'C4',name:'Conference League',kind:'europe'}];
const match={id:42,date:'2026-02-25',round:10,round_label:'Barrages · retour',competition:'Ligue des champions',
 home:{id:1,name:'Home'},away:{id:2,name:'Away'},score:[1,0],aggregate:[2,2],penalties:[4,5],winner_id:2,first_leg_id:41};
const data={season:2025,seasons:[2026,2025],league_rounds:8,next_round:null,latest_round:17,winner:match.away,
 standings:Array.from({length:36},(_,i)=>({club_id:i+1,club:{id:i+1,name:`Club ${i+1}`},rank:i+1,played:8,won:0,drawn:8,lost:0,
 goals_for:8,goals_against:8,difference:0,points:8,form:'NNNNN',movement:i<8?'direct':i<24?'playoff':'eliminated'})),
 rounds:Array.from({length:17},(_,i)=>({number:i+1,label:i<8?`Phase de ligue · Journée ${i+1}`:i===16?'Finale':i===9?'Barrages · retour':'Phase finale',date:'2026-02-25',complete:i<10,items:i===9?[match]:[]}))};

test('Europe navigation and full 36-club table with qualifying zones',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{
  const html=await europeScreen('C3','table',new URLSearchParams('saison=2025'),cups);
  assert.match(html,/Coupes d’Europe/);
  for(const cup of cups)assert.ok(html.includes(cup.name));
  assert.equal((html.match(/class="europe-direct"/g)||[]).length,8);
  assert.equal((html.match(/class="europe-playoff"/g)||[]).length,16);
  assert.match(html,/Club 36/);
  assert.match(html,/#\/europe\/C3\/knockout\?saison=2025/);
  assert.match(html,/value="2025" selected/);
  assert.match(await readFile(new URL('../../web/index.html',import.meta.url),'utf8'),/href="#\/europe" data-nav="europe"/);
 }finally{globalThis.fetch=previous;}
});

test('knockout screen separates aggregate and penalty scores; return links to first leg',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/matches/')?{...match,result:{status:'played'}}:data});
 try{
  const html=await europeScreen('C1','knockout',new URLSearchParams(),cups);
  assert.match(html,/Barrages · retour/);
  assert.match(html,/Cumul 2 – 2/);
  assert.match(html,/4 – 5 t.a.b./);
  assert.doesNotMatch(html,/Phase de ligue · Journée/);
  const detail=await matchScreen(42);
  assert.match(detail,/#\/match\/41/);
  assert.match(detail,/Cumul 2 – 2/);
  assert.match(detail,/Vainqueur/);
  assert.match(fixtures({items:[match]},true),/Ligue des champions/);
 }finally{globalThis.fetch=previous;}
});

test('European scorer request keeps the selected archived season',async()=>{
 const previous=globalThis.fetch;
 const urls=[];
 globalThis.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('/statistiques')?{items:[],total:0,page:1,page_size:30}:data};};
 try{
  await europeScreen('C4','stats',new URLSearchParams('saison=2025'),cups);
  assert.ok(urls.some(url=>url.includes('/-104/statistiques?')&&url.includes('saison=2025')));
 }finally{globalThis.fetch=previous;}
});
