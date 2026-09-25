import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cupSummaryCard,cupScreen} from '../../web/cups.js';
import {countryScreen} from '../../web/screens.js';
import {fixtures,playerLink} from '../../web/ui.js';
import {matchScreen} from '../../web/match.js';

const cup={id:-3,name:'Coupe de France',kind:'cup',nation:'FRA',clubs:64,level:0};
const match={id:1,home:{id:1,name:'Home'},away:{id:2,name:'Away'},date:'2025-12-10',round:1,round_label:'32es de finale',score:[1,1],penalties:[4,5]};
const data={season:2025,seasons:[2025],latest_round:1,winner:null,rounds:[{number:1,label:'32es de finale',date:'2025-12-10',items:Array.from({length:32},(_,i)=>({...match,id:i+1}))},{number:2,label:'16es de finale',date:'2026-01-07',items:[]}]};

test('cup summary preserves all 32 results and distinguishes penalty scores',()=>{
 const html=cupSummaryCard(cup,data);
 assert.equal((html.match(/class="fixture"/g)||[]).length,32);
 assert.match(html,/32es de finale/);
 assert.match(html,/1 – 1/);
 assert.match(html,/4 – 5 t.a.b./);
 assert.match(fixtures({items:[match]},true),/32es de finale/);
 assert.doesNotMatch(fixtures({items:[match]},true),/Journée 1/);
});

test('country places the cup between the first and second divisions',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/coupe')?data:url.includes('/calendrier')?{items:[],round:1}: {items:[]}});
 try{
  const html=await countryScreen('FRA',[{id:17,name:'Ligue 2',nation:'FRA',level:2,clubs:18},cup,{id:16,name:'Ligue 1',nation:'FRA',level:1,clubs:18}]);
  assert.ok(html.indexOf('FRA · Ligue 1')<html.indexOf('Coupe de France'));
  assert.ok(html.indexOf('Coupe de France')<html.indexOf('FRA · Ligue 2'));
  // the title is the left-menu entry alone, with no line above or below it
  assert.match(html,/^<div class="page-heading"><div><h1>FRA<\/h1><\/div><\/div>/);
  const screen=await cupScreen(cup,'calendar',new URLSearchParams());
  assert.match(screen,/Tirage à venir/);
  assert.equal((screen.match(/class="fixture"/g)||[]).length,32);
  // the block stepping between competitions sits in the header, left of the cup's name
  const led=await cupScreen(cup,'calendar',new URLSearchParams(),'<div class="entity-nav"></div>');
  assert.match(led,/^<div class="page-heading"><div class="heading-with-lead"><div class="entity-nav"><\/div><div><h1>Coupe de France<\/h1>/);
  assert.doesNotMatch(screen,/heading-with-lead/);
 }finally{globalThis.fetch=previous;}
});

test('temporary players have no profile links on pitch, bench or timeline',async()=>{
 const previous=globalThis.fetch;
 const player={id:-123,name:'Renfort <test>',temporary:true,position:'GB',stats:{minutes:90,rating:6}};
 globalThis.fetch=async()=>({ok:true,json:async()=>({...match,competition:cup.name,neutral:true,result:{status:'played',home_stats:{},away_stats:{},home_lineup:[player],away_lineup:[],home_bench:[player],away_bench:[],events:[{kind:'goal',period:2,second:4000,team_id:1,player_id:-123,player:player.name,detail:'',xg:.3},{kind:'penalty_scored',period:3,second:5400,team_id:1,player_id:-123,player:player.name,detail:'4–5',xg:null}]}})});
 try{
  const html=await matchScreen(1);
  for(const part of [html.slice(html.indexOf('match-lineup')),html.slice(html.indexOf('Les temps forts')),playerLink(player.id,player.name)]){
   assert.doesNotMatch(part,/href="#\/player\/-123"/);
   assert.match(part,/temporary-player/);
   assert.match(part,/Renfort &lt;test&gt;/);
  }
  assert.match(html,/Terrain neutre/);
  // one view, no tabs; the highlights keep goals but leave the shoot-out to the scoreboard
  assert.doesNotMatch(html,/class="tabs"/);
  assert.equal((html.match(/class="highlight-row"/g)||[]).length,1);
 }finally{globalThis.fetch=previous;}
});
