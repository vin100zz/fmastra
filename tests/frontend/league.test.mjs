import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leagueScreen} from '../../web/screens.js';
import {europeScreen} from '../../web/europe.js';

const club=(id,name)=>({id,name});
const league={id:16,name:'Ligue 1',nation:'FRA',kind:'league',level:1,clubs:18};
const row=(id,rank)=>({club:club(id,`Club ${id}`),rank,played:12,won:6,drawn:3,lost:3,goals_for:20+id,goals_against:30-id,difference:rank,points:40-rank,form:'VVNDV',movement:null});
const standings={total:4,page:1,page_size:30,items:[1,2,3,4].map(id=>row(id,id))};
const leaders=type=>({total:12,page:1,page_size:30,items:Array.from({length:12},(_,i)=>({id:type==='clean_sheets'?null:100+i,name:`Joueur ${i}`,club:club(i+1,`Club ${i+1}`),value:12-i}))});
const match=(id,played)=>({id,date:'2026-10-17',round:12,home:club(1,'Club 1'),away:club(2,'Club 2'),score:played?[2,1]:null,
 scorers:played?[[{id:101,name:'Neal Maupay',minutes:['14','75']}],[{id:201,name:'Amine Gouiri',minutes:['26']}]]:null});

async function withApi(answer,run){
 const previous=globalThis.fetch,urls=[];
 globalThis.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>answer(url)};};
 try{return {html:await run(),urls};}finally{globalThis.fetch=previous;}
}
const api=url=>url.endsWith('/navigation')?null:url.includes('/classement')?standings:url.includes('/statistiques')?leaders(new URL(url,'http://x').searchParams.get('type')):
 url.includes('/calendrier')?{total:2,page:1,page_size:30,round:12,rounds:[1,2,3,12,13],items:[match(1,true),match(2,false)]}:{};

test('the league table keeps its points first and sits beside the four leaders it does not show',async()=>{
 const {html}=await withApi(api,()=>leagueScreen(16,'table',new URLSearchParams(),[league]));
 assert.match(html,/<th class="rank-column">#<\/th><th>CLUB<\/th><th class="total-column">PTS<\/th>/);
 assert.match(html,/class="league-layout"/);
 assert.match(html,/Meilleure attaque[^]*Club 4[^]*24 buts/);
 assert.match(html,/Meilleure défense[^]*Club 4[^]*26 buts encaissés/);
 assert.match(html,/Meilleur buteur[^]*Joueur 0/);
 assert.match(html,/Meilleur passeur/);
});

test('the calendar steps through the rounds, one card a match with its scorers, the table and the scorers beside',async()=>{
 const {html}=await withApi(api,()=>leagueScreen(16,'calendar',new URLSearchParams('journee=12'),[league]));
 assert.equal((html.match(/<a class="active" href="#\/league\/16\/calendar\?journee=12"/g)||[]).length,1);
 assert.equal((html.match(/round-pills[^]*?<\/div>/)[0].match(/<a /g)||[]).length,5);
 assert.match(html,/href="#\/league\/16\/calendar\?journee=11"[^>]*aria-label="Journée précédente"/);
 assert.match(html,/href="#\/league\/16\/calendar\?journee=13"[^>]*aria-label="Journée suivante"/);
 assert.equal((html.match(/class="fixture-card"/g)||[]).length,2);
 assert.match(html,/Maupay<\/a> \(14, 75\)/);
 assert.match(html,/Journée 12 · [^<]*2026/);
 assert.match(html,/Classement[^]*Buteurs/);
 // no stepper arrow beyond the first and last rounds
 const first=await withApi(url=>url.includes('/calendrier')?{...api(url),round:1}:api(url),()=>leagueScreen(16,'calendar',new URLSearchParams('journee=1'),[league]));
 assert.match(first.html,/<span class="round-step disabled"[^>]*>‹<\/span>/);
});

test('the statistics list five rankings of ten at once, each opening its whole list',async()=>{
 const {html,urls}=await withApi(api,()=>leagueScreen(16,'stats',new URLSearchParams(),[league]));
 for(const label of ['Meilleurs buteurs','Meilleurs passeurs','Meilleures notes','Cartons jaunes','Clean sheets par club'])assert.ok(html.includes(label),label);
 assert.equal(urls.filter(url=>url.includes('/statistiques')).length,5);
 assert.match(html,/href="#\/league\/16\/stats\?type=cartons"/);
 assert.doesNotMatch(html,/Joueur 10/);
 // a ranking asked for by name is the whole list, as before
 const one=await withApi(api,()=>leagueScreen(16,'stats',new URLSearchParams('type=buteurs'),[league]));
 assert.match(one.html,/Les leaders/);assert.match(one.html,/Joueur 11/);
});

const cups=[{id:-101,code:'C1',name:'Ligue des champions',kind:'europe'}];
const europe={season:2025,seasons:[2025],league_rounds:8,next_round:null,latest_round:null,winner:null,rounds:[],
 standings:Array.from({length:36},(_,i)=>({club_id:i+1,club:club(i+1,`Club ${i+1}`),rank:i+1,played:4,won:1,drawn:2,lost:1,goals_for:4,goals_against:4,difference:0,points:5,form:'NNVD',movement:i<8?'direct':i<24?'playoff':'eliminated'}))};

test('the European league phase is two tables of eighteen, and its history is called Historique',async()=>{
 const {html}=await withApi(()=>europe,()=>europeScreen('C1','table',new URLSearchParams(),cups));
 const halves=html.match(/class="europe-halves">([^]*?)<\/section>/)[1];
 assert.equal((halves.match(/<table/g)||[]).length,2);
 assert.ok(halves.indexOf('Club 18')<halves.indexOf('Club 19'));
 assert.match(html,/1–8 : huitièmes directs/);
 assert.match(html,/>Historique<\/a>/);assert.doesNotMatch(html,/Palmarès/);
 // the season is chosen on the title line
 assert.ok(html.indexOf('name="saison"')<html.indexOf('europe-cups'));
});

test('the European history is three columns: winners and titles by country, the league phase of the chosen season, the leaders',async()=>{
 const history={total:2,page:1,page_size:30,leaders:{matches:[{player_id:1,player:'A',matches:9,goals:1}],goals:[{player_id:2,player:'B',matches:8,goals:5}]},
  items:[{season:2025,champion:club(1,'Club 1'),nation:'ENG'},{season:2024,champion:club(2,'Club 2'),nation:'ENG'}]};
 const {html}=await withApi(url=>url.includes('/historique')?history:europe,()=>europeScreen('C1','history',new URLSearchParams(),cups));
 assert.match(html,/history-layout three/);
 assert.match(html,/Titres par pays[^]*<b>2<\/b>/);
 assert.match(html,/Classement de la phase de ligue · 2025 \/ 2026/);
 assert.ok(html.indexOf('Les vainqueurs')<html.indexOf('Joueurs les plus utilisés'));
 assert.ok(html.indexOf('Joueurs les plus utilisés')<html.indexOf('Classement de la phase de ligue'));
});
