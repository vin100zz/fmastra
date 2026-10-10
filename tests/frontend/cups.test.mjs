import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cupScreen} from '../../web/cups.js';
import {fixtures,playerLink} from '../../web/ui.js';
import {matchScreen} from '../../web/match.js';

const cup={id:-3,name:'Coupe de France',kind:'cup',nation:'FRA',clubs:64,level:0};
const match={id:1,home:{id:1,name:'Home'},away:{id:2,name:'Away'},date:'2025-12-10',round:1,round_label:'32es de finale',score:[1,1],penalties:[4,5],winner_id:2};
const data={season:2025,previous_season:2024,next_season:null,seasons:[2025,2024],current_season:2025,latest_round:1,winner:null,rounds:[{number:1,label:'32es de finale',date:'2025-12-10',items:Array.from({length:32},(_,i)=>({...match,id:i+1}))},...['16es de finale','8es de finale','Quarts de finale','Demi-finales','Finale'].map((label,i)=>({number:i+2,label,date:'2026-01-07',items:[]}))]};

test('a cup match names its round and tells a shoot-out apart from the score',()=>{
 const html=fixtures({items:[match]},true);
 assert.match(html,/32es de finale/);
 assert.doesNotMatch(html,/Journée 1/);
 assert.match(html,/1 – 1/);
 assert.match(html,/4 – 5 t.a.b./);
});

test('the bracket is the cup’s only view of its rounds',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/coupe')?data:{items:[]}});
 try{
  // a league's Calendrier section lands on the bracket
  const screen=await cupScreen(cup,'calendar',new URLSearchParams());
  assert.doesNotMatch(screen,/Les tours/);
  assert.match(screen,/class="active" href="#\/league\/-3\/bracket" aria-current="page">Tableau/);
  assert.equal((screen.match(/class="bracket-tie"/g)||[]).length,32);
  assert.equal((screen.match(/bracket-tie empty/g)||[]).length,16+8+4+2+1);
  // the box opens the match, the name opens the club, the shoot-out sits in brackets
  assert.match(screen,/<a class="bracket-match" href="#\/match\/1"/);
  assert.match(screen,/bracket-team winner"><span class="bracket-club"><a href="#\/club\/2"/);
  assert.match(screen,/<span class="bracket-pens" title="Tirs au but">\(5\)<\/span>/);
  // the cup opens on a competition's header; the block stepping between competitions sits in its band, left of the cup's name
  const led=await cupScreen(cup,'bracket',new URLSearchParams(),'<div class="entity-nav"></div>');
  assert.match(led,/^<header class="club-hero plain"><div class="club-hero-band">.*?<div class="club-hero-main"><div class="entity-nav"><\/div><div class="club-hero-identity"><div class="club-hero-name"><h1>Coupe de France<\/h1><\/div><\/div>/);
  assert.doesNotMatch(screen,/entity-nav|page-heading/);
  // its seasons are stepped through at the end of its row of tabs, as a club's: no list to pick from
  assert.match(screen,/<a class="" href="#\/league\/-3\/history">Palmarès<\/a><\/nav><div class="tools"><div class="season" role="group" aria-label="Saison"><button type="button" aria-label="Saison précédente" data-param="saison" data-param-value="2024"><svg[^>]*><path[^>]*\/><\/svg><\/button><details class="season-pick"><summary>2025 \/ 2026</);
  assert.match(screen,/<\/details><button type="button" aria-label="Saison suivante" disabled><svg[^>]*><path[^>]*\/><\/svg><\/button><\/div><\/div><\/div><\/header><section class="card"><div class="bracket/);
  assert.doesNotMatch(screen,/<select|Afficher/);
  // nobody has won the season shown: the tile names who holds the cup, and no line under the tabs tells a winner
  assert.match(screen,/<div class="club-hero-tiles"><\/div>/);
  const held={ok:true,json:async()=>({...data,holder:{id:2,name:'Away'}})},won={ok:true,json:async()=>({...data,winner:{id:1,name:'Home'},holder:{id:2,name:'Away'}})};
  globalThis.fetch=async()=>held;
  assert.match(await cupScreen(cup,'bracket',new URLSearchParams()),/<div class="club-hero-tile"><span>Tenant du titre<\/span><strong><a href="#\/club\/2" class="club-link">Away<\/a><\/strong><\/div>/);
  globalThis.fetch=async()=>won;
  const final=await cupScreen(cup,'bracket',new URLSearchParams());
  assert.match(final,/<div class="club-hero-tile"><span>Vainqueur<\/span><strong><a href="#\/club\/1" class="club-link">Home<\/a><\/strong><\/div>/);assert.doesNotMatch(final,/Tenant du titre|cup-winner|🏆/);
  // a tab that does not read the cup's season keeps what the list of competitions says of its title
  globalThis.fetch=async()=>({ok:true,json:async()=>({items:[],total:0,page:1,page_size:30})});
  const stats=await cupScreen({...cup,holder:{id:2,name:'Away'}},'stats',new URLSearchParams());
  assert.match(stats,/<span>Tenant du titre<\/span>/);assert.doesNotMatch(stats,/class="season"|club-hero-foot/);
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
