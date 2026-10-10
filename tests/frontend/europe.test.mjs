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
const data={season:2025,previous_season:null,next_season:2026,seasons:[2026,2025],league_rounds:8,next_round:null,latest_round:17,winner:match.away,
 standings:Array.from({length:36},(_,i)=>({club_id:i+1,club:{id:i+1,name:`Club ${i+1}`},rank:i+1,played:8,won:0,drawn:8,lost:0,
 goals_for:8,goals_against:8,difference:0,points:8,form:'NNNNN',movement:i<8?'direct':i<24?'playoff':'eliminated'})),
 rounds:Array.from({length:17},(_,i)=>({number:i+1,label:i<8?`Phase de ligue · Journée ${i+1}`:i===16?'Finale':i===9?'Barrages · retour':'Phase finale',date:'2026-02-25',complete:i<10,items:i===9?[match]:[]}))};

test('Europe navigation and full 36-club table with qualifying zones',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{
  const html=await europeScreen('C3','table',new URLSearchParams('saison=2025'),cups);
  // The cup opens on a competition's header: its emblem alone on the band, its name, and who won the season shown.
  assert.match(html,/^<header class="club-hero plain">/);assert.doesNotMatch(html,/page-heading|Coupes d’Europe<\/h1>|segmented|class="tabs"/);
  assert.match(html,/<\/div><img class="club-hero-emblem" src="\/emblems\/c3\.png" alt=""><div class="club-hero-identity"><div class="club-hero-name"><h1>Ligue Europa<\/h1><\/div><\/div>/);
  assert.match(html,/<div class="club-hero-tiles"><div class="club-hero-tile"><span>Vainqueur<\/span><strong><a href="#\/club\/2" class="club-link">Away<\/a><\/strong><\/div><\/div>/);assert.doesNotMatch(html,/cup-winner|🏆/);
  // The other cups are stepped to from the band, as a club's neighbours: the open tab and the season are kept.
  assert.match(html,/<div class="club-hero-main"><div class="entity-nav" role="group" aria-label="Choisir une coupe d’Europe"><a class="entity-step prev" href="#\/europe\/C1\/table\?saison=2025" rel="prev" aria-label="Précédent : Ligue des champions"/);
  assert.match(html,/<a class="entity-step next" href="#\/europe\/C4\/table\?saison=2025" rel="next" aria-label="Suivant : Conference League"/);
  assert.match(html,/<summary aria-label="Choisir une coupe d’Europe" title="Coupes d’Europe · 2 \/ 3">/);
  assert.match(html,/<div class="menu" role="menu" aria-label="Choisir une coupe d’Europe"><a href="#\/europe\/C1\/table\?saison=2025" role="menuitemradio" aria-checked="false"><div class="cell"><span class="competition-code europe" title="Ligue des champions">C1<\/span>Ligue des champions<\/div><\/a><a href="#\/europe\/C3\/table\?saison=2025" role="menuitemradio" aria-checked="true">/);
  assert.equal((html.match(/class="europe-direct"/g)||[]).length,8);
  assert.equal((html.match(/class="europe-playoff"/g)||[]).length,16);
  assert.match(html,/Club 36/);
  assert.match(html,/<a class="active" href="#\/europe\/C3\/table\?saison=2025" aria-current="page">Classement<\/a><a class="" href="#\/europe\/C3\/calendar\?saison=2025">Phase de ligue<\/a><a class="" href="#\/europe\/C3\/knockout\?saison=2025">Phase finale<\/a>/);
  // The seasons are stepped through at the end of the row of tabs, as a club's.
  assert.match(html,/Historique<\/a><\/nav><div class="tools"><div class="season" role="group" aria-label="Saison"><button type="button" aria-label="Saison précédente" disabled><svg[^>]*><path[^>]*\/><\/svg><\/button><details class="season-pick"><summary>2025 \/ 2026</);
  assert.match(html,/<\/details><button type="button" aria-label="Saison suivante" data-param="saison" data-param-value="2026"><svg[^>]*><path[^>]*\/><\/svg><\/button><\/div><\/div><\/div><\/header>/);
  assert.doesNotMatch(html,/<select|Afficher/);
  // Until the season shown is won, the tile names who holds the cup; the first cup has nothing before it, the last nothing after.
  globalThis.fetch=async()=>({ok:true,json:async()=>({...data,winner:null,holder:match.home})});
  const first=await europeScreen('C1','table',new URLSearchParams(),cups);
  assert.match(first,/<span>Tenant du titre<\/span><strong><a href="#\/club\/1" class="club-link">Home<\/a><\/strong>/);
  assert.match(first,/<span class="entity-step prev" aria-hidden="true">/);assert.match(first,/src="\/emblems\/c1\.png"/);
  assert.match(await readFile(new URL('../../web/index.html',import.meta.url),'utf8'),/href="#\/europe" data-nav="europe"/);
 }finally{globalThis.fetch=previous;}
});

test('knockout screen draws the bracket with both legs, aggregate and shoot-out; return links to first leg',async()=>{
 const previous=globalThis.fetch;
 const first={...match,id:41,round:9,round_label:'Barrages · aller',home:match.away,away:match.home,score:[2,1],aggregate:null,penalties:null,winner_id:null,first_leg_id:null};
 const knockout={...data,rounds:data.rounds.map(round=>round.number===9?{...round,label:'Barrages · aller',items:[first]}:round)};
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/matches/')?{...match,result:{status:'played'}}:knockout});
 try{
  const html=await europeScreen('C1','knockout',new URLSearchParams(),cups);
  assert.match(html,/class="bracket"/);
  assert.match(html,/<strong>Barrages<\/strong>/);
  assert.match(html,/<strong>Finale<\/strong>/);
  // play-offs and round of 16 have eight boxes each, then four, two and one
  assert.equal((html.match(/class="bracket-tie/g)||[]).length,8+8+4+2+1);
  // the winner's row: 2 away in the first leg, 0 away in the return, no aggregate, 5 in the shoot-out; the box opens the return leg
  assert.match(html,/bracket-team winner"><span class="bracket-club"><a href="#\/club\/2"[^]*?>2<\/a><a class="bracket-score" href="#\/match\/42">0<\/a><span class="bracket-pens" title="Tirs au but">\(5\)<\/span><\/div>/);
  assert.match(html,/<a class="bracket-match" href="#\/match\/42"/);
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
