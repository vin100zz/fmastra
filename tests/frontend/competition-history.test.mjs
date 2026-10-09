import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leagueScreen} from '../../web/screens.js';
import {cupScreen} from '../../web/cups.js';
import {europeScreen} from '../../web/europe.js';
import {leadersCards} from '../../web/ui.js';

const club=(id,name)=>({id,name});
const leaders={matches:[{player_id:1,player:'Fidèle <b>',matches:412,goals:31},{player_id:2,player:'Second',matches:390,goals:5}],
 goals:[{player_id:3,player:'Renard',matches:200,goals:180}]};
const history=(extra={})=>({total:1,page:1,page_size:30,leaders,items:[{season:2025,champion:club(1,'Paris'),scorer:{id:3,name:'Renard',value:20}}],
 archive:{season:2025,previous_season:2024,next_season:null,seasons:[2025,2024],current_season:null,standings:[]},...extra});
const league={id:16,name:'Ligue 1',nation:'FRA',kind:'league',level:1,clubs:18};
const cup={id:-3,name:'Coupe de France',kind:'cup',nation:'FRA',clubs:64,level:0};
const cups=[{id:-101,code:'C1',name:'Ligue des champions',kind:'europe'}];
const europeData={season:2025,seasons:[2025],league_rounds:8,next_round:null,latest_round:null,winner:null,standings:[],rounds:[]};

async function withApi(answer,run){
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>answer(url)});
 try{return await run();}finally{globalThis.fetch=previous;}
}

test('the leaders block ranks matches and goals side by side, links players and escapes names',()=>{
 const html=leadersCards(leaders);
 assert.ok(html.indexOf('Joueurs les plus utilisés · 2')<html.indexOf('Meilleurs buteurs · 1'));
 assert.match(html,/href="#\/player\/1">Fidèle &lt;b&gt;/);assert.doesNotMatch(html,/Fidèle <b>/);
 assert.match(html,/412/);assert.match(html,/180/);
 assert.doesNotMatch(html,/Toutes saisons confondues/);
 assert.match(leadersCards({matches:[],goals:[]}),/Pas encore de statistiques/);
});

test('the league history keeps its champions, the table of one archived season stepped through from its card, and the all-time leaders',async()=>{
 const asked=[];
 await withApi(url=>{asked.push(url);return url.endsWith('/navigation')?null:history();},async()=>{
  const html=await leagueScreen(16,'history',new URLSearchParams('saison=2025'),[league]);
  assert.match(html,/Le palmarès/);assert.match(html,/Joueurs les plus utilisés/);assert.match(html,/Meilleurs buteurs/);
  // One card for the archived table, the seasons stepped through in its head: no folded block per season.
  const archive=html.split('<div class="history-archives">')[1];
  assert.match(archive,/^<section class="card"><div class="card-head"><h2>Classement<\/h2><div class="season" role="group" aria-label="Saison"><button type="button" aria-label="Saison précédente" data-param="saison" data-param-value="2024"><svg[^>]*><path[^>]*\/><\/svg><\/button><details class="season-pick"><summary>2025 \/ 2026</);
  assert.doesNotMatch(html,/Classement complet|season-archive|en cours/);
  // The season of the address goes to the server.
  assert.ok(asked.includes('/api/competitions/16/historique?saison=2025'));
 });
 // Before a first season ends there is no table to show.
 await withApi(url=>url.endsWith('/navigation')?null:history({archive:null}),async()=>{
  assert.match(await leagueScreen(16,'history',new URLSearchParams(),[league]),/<div class="history-archives"><\/div>/);
 });
});

test('a national cup history lists its winners then the all-time leaders',async()=>{
 await withApi(url=>url.endsWith('/navigation')?null:url.includes('/historique')?history():{id:-3,name:'Coupe de France',season:2025,seasons:[2025],rounds:[],latest_round:null,winner:null},async()=>{
  const html=await cupScreen(cup,'history',new URLSearchParams());
  assert.match(html,/Les vainqueurs/);
  assert.ok(html.indexOf('Les vainqueurs')<html.indexOf('Joueurs les plus utilisés'));
  assert.match(html,/Fidèle &lt;b&gt;/);assert.match(html,/Meilleurs buteurs/);
 });
});

test('a European cup history lists its winners then the all-time leaders',async()=>{
 const requested=[];
 await withApi(url=>{requested.push(url);return url.includes('/historique')?history():europeData;},async()=>{
  const html=await europeScreen('C1','history',new URLSearchParams(),cups);
  assert.ok(requested.includes('/api/competitions/-101/historique?page=1'));
  assert.ok(html.indexOf('Les vainqueurs')<html.indexOf('Joueurs les plus utilisés'));
  assert.match(html,/Second/);assert.match(html,/Renard/);
 });
});

test('the other tabs of a competition do not show the leaders',async()=>{
 await withApi(url=>url.endsWith('/navigation')?null:{items:[],total:0,page:1,page_size:30,rounds:[],round:1},async()=>{
  const html=await leagueScreen(16,'calendar',new URLSearchParams(),[league]);
  assert.doesNotMatch(html,/Joueurs les plus utilisés/);
 });
});
