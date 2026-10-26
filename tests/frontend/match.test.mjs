import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchHero} from '../../web/club-hero.js';
import {matchScreen} from '../../web/match.js';
import {setNations,setFoldOpen,setCompetitions,matchMinute,halfEnd} from '../../web/ui.js';

const home={id:1,name:'Real <Madrid>',major_color:'#F8F8F8',minor_color:'#F8C028'},away={id:2,name:'Marseille',major_color:'#F8F8F8',minor_color:'#2098C8'};

test('a match’s header shares one band between the two sides, the home one first, the score between them',()=>{
 const html=matchHero({home,away,score:[3,1]},'<div class="club-hero-bar"></div>');
 // The header wears the home side's colours; the away side's are set on its half of the band and on its own side.
 assert.match(html,/^<header class="club-hero match-hero" style="--hero-field:#F8C028;/);
 assert.match(html,/<span style="--hero-field:#2098C8;[^"]*"><i class="field"><\/i><i><\/i><i class="thin"><\/i><\/span>/);
 assert.match(html,/<div class="match-hero-side"><div class="crest club-hero-crest">R&lt;<img class="crest-logo" src="\/crests\/TCM1_1\.png"[^>]*><\/div><a class="match-hero-name" href="#\/club\/1">Real &lt;Madrid&gt;<\/a><\/div>/);
 assert.match(html,/<div class="match-hero-side away" style="--hero-field:#2098C8;[^"]*"><div class="crest club-hero-crest">M<img[^>]*><\/div><a class="match-hero-name" href="#\/club\/2">Marseille<\/a><\/div>/);
 assert.match(html,/<div class="club-hero-tile match-score"><strong class="big-score">3 : 1<\/strong><\/div>/);
 assert.ok(html.indexOf('Real &lt;Madrid&gt;')<html.indexOf('3 : 1')&&html.indexOf('3 : 1')<html.indexOf('>Marseille<'));
 assert.doesNotMatch(html,/<Madrid>/);
 assert.match(html,/<div class="club-hero-bar"><\/div><\/header>$/);
});

test('what settled a tie stands under the score; a match to come has no score',()=>{
 assert.match(matchHero({home,away,score:[1,0],aggregate:[2,2],penalties:[4,5]}),/<strong class="big-score">1 : 0<\/strong><span>Cumul 2 – 2 · 4 – 5 t\.a\.b\.<\/span>/);
 assert.match(matchHero({home,away,score:[0,0],penalties:[5,3]}),/<strong class="big-score">0 : 0<\/strong><span>5 – 3 t\.a\.b\.<\/span>/);
 assert.match(matchHero({home,away,score:null}),/<strong class="big-score">VS<\/strong><\/div>/);
});

test('a selection has its flag on the disc; a side without colours keeps the panel’s, whatever the other wears',()=>{
 setNations({ENG:{name:'Angleterre',display_code:'ENG',flag:'gb-eng'}});
 const html=matchHero({home:{id:-1007,name:'Angleterre',nation:'ENG',national:true,major_color:'#ffffff',minor_color:'#0b1f4b'},away:{id:-1008,name:'Écosse',nation:'SCO',national:true},score:[2,0]});
 setNations({});
 assert.match(html,/^<header class="club-hero match-hero" style="--hero-field:#0b1f4b;--hero-ink:#ffffff;/);
 assert.match(html,/<div class="crest club-hero-crest">A<img class="crest-flag" src="\/flags\/gb-eng\.svg" alt=""><\/div><a class="match-hero-name" href="#\/international\/nation\/-1007">Angleterre<\/a>/);
 assert.match(html,/<div class="match-hero-side away" style="--hero-field:var\(--panel-2\);--hero-ink:var\(--ink\);--hero-sash:transparent;[^"]*"><div class="crest club-hero-crest">É<\/div><a class="match-hero-name" href="#\/international\/nation\/-1008">Écosse<\/a>/);
});

const stats={xg:1.2,shots:8,on_target:3,possession_seconds:2700,corners:4,free_kicks:2,yellows:1,reds:0};
const player=(id,name)=>({id,name,position:'GB',stats:{minutes:90,rating:7}});
const report={id:9,competition_id:5,competition:'Ligue des champions',round:10,round_label:'Barrages · retour',date:'2031-09-17',capacity:83186,neutral:false,
 home,away,score:[3,1],aggregate:[4,3],penalties:null,winner_id:1,first_leg_id:8,
 result:{status:'played',duration:5600,replay:true,home_stats:stats,away_stats:stats,home_lineup:[player(11,'Gardien Un')],away_lineup:[player(21,'Gardien Deux')],home_bench:[],away_bench:[],
  events:[{kind:'goal',period:1,second:2400,team_id:1,player_id:11,player:'Gardien Un',secondary_id:null,secondary:null,detail:''},
   {kind:'red',period:2,second:4000,team_id:2,player_id:21,player:'Gardien Deux',secondary_id:null,secondary:null,detail:'direct'}]}};
async function screen(data){
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{return await matchScreen(data.id);}finally{globalThis.fetch=previous;}
}

test('the badge of the match’s line leads to its competition: a European cup, an edition of the selections on its competition’s page',async()=>{
 setCompetitions([{id:30,name:'Ligue des champions',kind:'europe',code:'C1'}]);
 try{
  assert.match(await screen({...report,competition_id:30}),/<div class="match-facts"><a class="competition-code europe" href="#\/europe\/C1" title="Ligue des champions">C1<\/a><strong>/);
  const euro=await screen({...report,competition_id:-102028,competition:'Euro 2028',international:true,competition_code:'EU',season:2028});
  assert.match(euro,/<div class="match-facts"><a class="competition-code international" href="#\/international\/euro\?edition=2028" title="Euro 2028">EU<\/a><strong>/);
 }finally{setCompetitions([]);}
});

test('the band has no bar: the match’s line, over the highlights, says which match it is, then holds the first leg and the summary',async()=>{
 const html=await screen(report);
 assert.match(html,/^<header class="club-hero match-hero"/);
 assert.match(html,/<strong class="big-score">3 : 1<\/strong><span>Cumul 4 – 3<\/span><\/div>/);
 assert.doesNotMatch(html,/club-hero-bar|hero-commands/);
 assert.match(html,/<div class="match-center"><div class="page-heading match-line"><div class="match-facts"><span class="competition-code" title="Ligue des champions">LdC<\/span><strong>Barrages · retour<\/strong><span class="muted">mercredi 17 septembre 2031<\/span><span>Vainqueur : <a href="#\/club\/1" class="club-link">/);
 assert.match(html,/<div class="tools"><a class="button" href="#\/match\/8">Match aller<\/a><button type="button" class="replay-toggle"[^]*?<\/button><\/div><\/div><section class="card"><div class="card-head"><h2>Les temps forts<\/h2>/);
 // The ground's capacity is written nowhere.
 assert.doesNotMatch(html,/places/);
 // A league match names its round by its number and has neither first leg nor winner; a neutral ground is said.
 const league=await screen({...report,round_label:null,round:4,neutral:true,aggregate:null,winner_id:null,first_leg_id:null});
 assert.match(league,/<strong>Journée 4<\/strong><span class="muted">mercredi 17 septembre 2031 · Terrain neutre<\/span><\/div><div class="tools"><button type="button" class="replay-toggle"/);
 assert.doesNotMatch(league,/Vainqueur|Match aller|Cumul/);
 // A match the user's club did not play kept no replay: no summary to open.
 const elsewhere=await screen({...report,first_leg_id:null,result:{...report.result,replay:false}});
 assert.doesNotMatch(elsewhere,/replay-toggle|<div class="tools">/);
 assert.match(elsewhere,/<h2>Les temps forts<\/h2>/);
 // A match to come has its line right under the band, without a command: there is no summary yet.
 const coming=await screen({...report,score:null,aggregate:null,winner_id:null,first_leg_id:null,result:null});
 assert.match(coming,/<strong class="big-score">VS<\/strong>/);
 assert.match(coming,/<\/header><div class="page-heading match-line"><div class="match-facts">[^]*?<\/div><\/div><section class="card">/);
 assert.doesNotMatch(coming,/class="tools"/);
});

test('in a European cup, each club’s country follows its name in the band, on the side of the score; the line does not repeat it',async()=>{
 setNations({ESP:{name:'Espagne',display_code:'ESP',flag:'es'},FRA:{name:'France',display_code:'FRA',flag:'fr'}});
 setCompetitions([{id:5,name:'Ligue des champions',kind:'europe',code:'C1'}]);
 try{
  const european={...report,home:{...home,nation:'ESP',nation_id:-1003},away:{...away,nation:'FRA',nation_id:null}};
  const html=await screen(european);
  // The flag leads to the selection of its country; the away side, drawn from the right, has it on the side of the score too.
  assert.match(html,/<a class="match-hero-name" href="#\/club\/1">Real &lt;Madrid&gt;<\/a><a class="match-hero-flag" href="#\/international\/nation\/-1003"><span class="nation" title="Espagne"><img class="flag" src="\/flags\/es\.svg"[^>]*><\/span><\/a><\/div>/);
  // A country without a selection keeps its flag, which leads nowhere.
  assert.match(html,/<a class="match-hero-name" href="#\/club\/2">Marseille<\/a><span class="match-hero-flag"><span class="nation" title="France"><img class="flag" src="\/flags\/fr\.svg"[^>]*><\/span><\/span><\/div>/);
  assert.match(html,/<span>Vainqueur : <a href="#\/club\/1" class="club-link">[^]*?Real &lt;Madrid&gt;<\/a><\/span>/);
  // Elsewhere, a club's country is not written.
  setCompetitions([{id:5,name:'Ligue 1',kind:'league',nation:'FRA',level:1}]);
  assert.doesNotMatch(await screen({...european,competition:'Ligue 1'}),/match-hero-flag|club-flag/);
 }finally{setNations({});setCompetitions([]);}
});

test('each side is named once, in the band: the line-ups have no heading, nothing names the sides over the cards',async()=>{
 const html=await screen({...report,winner_id:null});
 assert.equal((html.match(/>Marseille</g)||[]).length,1);
 assert.equal((html.match(/>Real &lt;Madrid&gt;</g)||[]).length,1);
 assert.doesNotMatch(html,/match-sides|match-banner|scoreboard/);
 assert.equal((html.match(/<section class="card match-lineup"><div class="pitch short" aria-label="Composition de /g)||[]).length,2);
 // The home side's highlights stand on the left of the minute, the away side's on its right.
 assert.match(html,/<h2>Les temps forts<\/h2><\/div><div class="highlights"><div class="highlight-row"><div class="highlight home"><span class="marks"><span class="match-mark goal"[^]*?<span class="minute">41′<\/span><div class="highlight away"><\/div><\/div>/);
 assert.match(html,/<div class="highlight home"><\/div><span class="minute">67′<\/span><div class="highlight away"><span class="marks"><span class="match-mark booking red"/);
 assert.match(html,/<h2>Le match en chiffres<\/h2><svg class="toggle-arrow"[^]*?<\/svg><\/div><div class="comparisons"><div class="comparison">/);
});

test('on a line-up, a player’s goals stand at the top right of his shirt, a ball for each; the rest follows his note in his block',async()=>{
 const scorer={kind:'goal',period:1,second:600,team_id:1,player_id:11,player:'Gardien Un',secondary_id:null,secondary:null,detail:''};
 const html=await screen({...report,result:{...report.result,events:[scorer,{...scorer,second:3000},{kind:'substitution',period:2,second:4200,team_id:1,player_id:11,player:'Gardien Un',secondary_id:null,secondary:null,detail:''}]}});
 const [,shirt,block]=html.match(/aria-label="Composition de [^"]*">[^]*?(<span class="kit-shirt"[^]*?)<span class="player-block"><span class="block-name">[^<]+<\/span><span>(.*?)<\/span><\/span><\/a>/);
 assert.match(shirt,/<b>GB<\/b><span class="kit-goals" title="2 buts"><i><\/i><i><\/i><\/span><\/span>$/);
 assert.match(block,/^<b class="block-note" style="--hue:\d+" title="Note du match">7\.0<\/b><span class="match-mark sub-off"[^>]*>▼ 71′<\/span>$/);
 // A player without a goal has none on his shirt.
 assert.equal((html.match(/class="kit-goals"/g)||[]).length,1);
 assert.doesNotMatch(html,/pitch-marks|position-note|×2/);
});

test('a substitute’s goal follows his name in the bench’s list, which has no shirt',async()=>{
 const html=await screen({...report,result:{...report.result,home_bench:[player(12,'Remplaçant')],events:[
  {kind:'substitution',period:2,second:3600,team_id:1,player_id:11,player:'Gardien Un',secondary_id:12,secondary:'Remplaçant',detail:''},
  {kind:'goal',period:2,second:4800,team_id:1,player_id:12,player:'Remplaçant',secondary_id:null,secondary:null,detail:''}]}});
 assert.match(html,/<span class="bench-player"><a [^>]*>Remplaçant<\/a><span class="match-mark goal" title="1 but"><\/span><\/span>/);
 assert.doesNotMatch(html,/class="kit-goals"/);
});

test('the bench stands under its pitch on two columns, the first the longer, each substitute by his short name',async()=>{
 const bench=[{...player(12,'Victor Taïpa'),short:'Taïpa',stats:null},{...player(13,'Kevin Pedro'),short:null},{...player(14,'Germain Mbiyavanga Kapela'),short:'Mbiyavanga Kapela',stats:null}];
 const html=await screen({...report,result:{...report.result,home_bench:bench,events:[
  {kind:'substitution',period:2,second:3300,team_id:1,player_id:11,player:'Gardien Un',secondary_id:13,secondary:'Kevin Pedro',detail:''}]}});
 const [,lineup]=html.match(/<div class="match-home">(<section class="card match-lineup">[^]*?<\/section>)<\/div>/);
 const [,first,second]=lineup.match(/<\/div><div class="halves bench-halves">(<div class="table-scroll">[^]*?<\/table><\/div>)(<div class="table-scroll">[^]*?<\/table><\/div>)<\/div><\/section>$/);
 assert.equal((first.match(/<tr class=""/g)||[]).length,2);
 assert.equal((second.match(/<tr class=""/g)||[]).length,1);
 for(const column of [first,second])assert.match(column,/<thead><tr><th><button class="sort-toggle" data-table-sort>REMPLAÇANT<\/button><\/th><th><button class="sort-toggle" data-table-sort>ENTRÉE<\/button><\/th><th><button class="sort-toggle" data-table-sort>NOTE<\/button><\/th><\/tr><\/thead>/);
 // His short name, his whole name in the tooltip; the one who came on with his minute and his note, the others dimmed.
 assert.match(first,/<span class="bench-player unused" title="Victor Taïpa"><a href="#\/player\/12">Taïpa<\/a><\/span>/);
 assert.match(first,/<span class="bench-player" title="Kevin Pedro"><a href="#\/player\/13">Pedro<\/a><\/span><\/td><td[^>]*><span class="match-mark sub-on"[^>]*>▲ 56′<\/span><\/td><td[^>]*><span class="rating graded"/);
 assert.match(second,/<span class="bench-player unused" title="Germain Mbiyavanga Kapela"><a href="#\/player\/14">Mbiyavanga Kapela<\/a><\/span>/);
 // A side without substitutes has no bench.
 assert.equal((html.match(/bench-halves/g)||[]).length,1);
});

test('a highlight takes one line: its marks, the player by his short name, a goal’s passer after him, whole names in tooltips',async()=>{
 const events=[{kind:'goal',period:1,second:840,team_id:1,player_id:11,player:'Lucas Hernandez',player_short:'L. Hernandez',secondary_id:12,secondary:'Benoit Cheyrou',secondary_short:'Be. Cheyrou',detail:''},
  {kind:'red',period:2,second:3840,team_id:2,player_id:21,player:'Honest Ahanor',player_short:'Ahanor',secondary_id:null,secondary:null,detail:'second_yellow'},
  {kind:'injury',period:2,second:4000,team_id:2,player_id:22,player:'Ângelo',player_short:null,secondary_id:null,secondary:null,detail:''}];
 const html=await screen({...report,result:{...report.result,events}});
 assert.match(html,/<div class="highlight home"><span class="marks"><span class="match-mark goal" title="But"><\/span><\/span><span class="highlight-names"><strong title="Lucas Hernandez"><a href="#\/player\/11">L\. Hernandez<\/a><\/strong><small title="Passe de Benoit Cheyrou"><a href="#\/player\/12">Be\. Cheyrou<\/a><\/small><\/span><\/div><span class="minute">15′<\/span>/);
 // A second yellow card: a yellow card, then the red one. No label is written under the name.
 assert.match(html,/<span class="marks"><span class="match-mark booking yellow" title="Carton jaune"><\/span><span class="match-mark booking red" title="Deuxième carton jaune"><\/span><\/span><span class="highlight-names"><strong title="Honest Ahanor"><a href="#\/player\/21">Ahanor<\/a><\/strong><\/span>/);
 // Without a short name from the API, the family name; a single name needs no tooltip.
 assert.match(html,/<strong><a href="#\/player\/22">Ângelo<\/a><\/strong>/);
 assert.doesNotMatch(html,/<small>(But|Blessure)|Passe de <a/);
});

test('the figures of a match fold on their first four lines; the whole head opens the rest, and the choice is kept',async()=>{
 const html=await screen(report);
 assert.match(html,/<section class="card fold match-stats"><div class="card-head toggle" role="button" tabindex="0" aria-expanded="false" data-fold="match-stats"><h2>Le match en chiffres<\/h2><svg class="toggle-arrow"[^>]*><path[^>]*\/><\/svg><\/div><div class="comparisons">/);
 const lines=[...html.matchAll(/<div class="comparison( fold-more)?">.*?<div>([^<]+)</g)].map(([,more,label])=>`${label}${more?' (replié)':''}`);
 assert.deepEqual(lines,['Buts attendus (xG)','Tirs','Tirs cadrés','Possession','Corners (replié)','Coups francs (replié)','Cartons jaunes (replié)','Cartons rouges (replié)']);
 // Opened once, the card is open on the next match.
 setFoldOpen('match-stats',true);
 try{assert.match(await screen(report),/<section class="card fold open match-stats"><div class="card-head toggle" role="button" tabindex="0" aria-expanded="true"/);}
 finally{setFoldOpen('match-stats',false);}
});

test('a match played since passes are counted shows them and their accuracy under the possession',async()=>{
 const counted={...stats,passes:380,passes_attempted:440};
 const html=await screen({...report,result:{...report.result,home_stats:counted,away_stats:{...counted,passes:300,passes_attempted:400}}});
 const lines=[...html.matchAll(/<div class="comparison( fold-more)?">.*?<div>([^<]+)</g)].map(([,more,label])=>label);
 assert.deepEqual(lines.slice(3,6),['Possession','Passes','Précision des passes']);
 assert.match(html,/<span class="lead">86\.4 %<\/span><div>Précision des passes<[^]*?<\/div><span class="">75 %<\/span>/);
});

test('a match played since fouls are counted shows them and the offsides in place of the free kicks',async()=>{
 const counted={...stats,fouls:12,offsides:2};
 const html=await screen({...report,result:{...report.result,home_stats:counted,away_stats:{...counted,fouls:9,offsides:3}}});
 const lines=[...html.matchAll(/<div class="comparison( fold-more)?">.*?<div>([^<]+)</g)].map(([,more,label])=>label);
 assert.deepEqual(lines.slice(4,7),['Corners','Fautes','Hors-jeu']);
 assert.ok(!lines.includes('Coups francs'));
 assert.match(html,/<span class="lead">12<\/span><div>Fautes</);
});

test('a penalty scored says so in place of the passer, and a penalty missed has its own line',async()=>{
 const events=[{kind:'shot',period:1,second:600,team_id:1,player_id:11,player:'Lucas Hernandez',player_short:'L. Hernandez',shot_id:1,detail:'penalty'},
  {kind:'goal',period:1,second:600,team_id:1,player_id:11,player:'Lucas Hernandez',player_short:'L. Hernandez',secondary_id:null,secondary:null,shot_id:1,detail:'penalty'},
  {kind:'shot',period:2,second:3000,team_id:2,player_id:21,player:'Honest Ahanor',player_short:'Ahanor',shot_id:2,detail:'penalty'},
  {kind:'save',period:2,second:3000,team_id:1,player_id:1,shot_id:2,detail:'held'},
  {kind:'shot',period:2,second:4000,team_id:2,player_id:22,player:'Ângelo',player_short:null,shot_id:3,detail:'penalty'},
  {kind:'off_target',period:2,second:4000,team_id:2,player_id:22,shot_id:3,detail:''}];
 const html=await screen({...report,result:{...report.result,events}});
 assert.match(html,/<strong title="Lucas Hernandez"><a href="#\/player\/11">L\. Hernandez<\/a><\/strong><small title="Sur penalty">pen\.<\/small>/);
 assert.match(html,/<span class="match-mark missed" title="Penalty arrêté"><\/span><\/span><span class="highlight-names"><strong title="Honest Ahanor">/);
 assert.match(html,/<span class="match-mark missed" title="Penalty manqué"><\/span>/);
 // The penalty scored is told once, by its goal.
 assert.equal((html.match(/L\. Hernandez/g)||[]).length,1);
});

test('expected goals keep one figure after the point, even round ones',async()=>{
 const html=await screen({...report,result:{...report.result,home_stats:{...stats,xg:2},away_stats:{...stats,xg:0.95}}});
 assert.match(html,/<div class="comparison"><span class="lead">2\.0<\/span><div>Buts attendus \(xG\)<[^]*?<\/div><span class="">1\.0<\/span><\/div>/);
});

test('a minute reads as on television: the minute in progress, added time after 45 and 90, the second half from its restart',()=>{
 const half=2820;// the first half's whistle after 2 minutes of added time
 assert.deepEqual([0,59,60,2699,2700,2819].map(second=>matchMinute(second,half)),['1','1','2','45','45+1','45+2']);
 assert.deepEqual([2821,2880,half+44*60,half+45*60,half+46*60].map(second=>matchMinute(second,half)),['46','47','90','90+1','90+2']);
 // An event's half settles a second on the whistle; a match without one ends its first half at 45 minutes.
 assert.equal(matchMinute(half,half,2),'46');
 assert.equal(halfEnd([{kind:'period_end',period:1,second:half}]),half);
 assert.equal(halfEnd([]),2700);
});

test('the flow of the match adds up each side’s expected goals shot after shot, a ball where one went in',async()=>{
 const shots=[{second:600,team_id:1,xg:.3},{second:2400,team_id:1,xg:.5},{second:3500,team_id:2,xg:.2},{second:5000,team_id:1,xg:.4}];
 const html=await screen({...report,result:{...report.result,shots}});
 const flow=html.match(/<section class="card match-flow">[^]*?<\/section>/)?.[0];
 assert.ok(flow,'the card stands under the figures');
 assert.ok(html.indexOf('Le match en chiffres')<html.indexOf('Fil du match'));
 assert.match(flow,/<h2>Fil du match<\/h2><span class="card-hint">buts attendus cumulés<\/span>/);
 // A line a side, its total at its end; the goal of the 40th minute (second 2400) is a ball on the home line.
 assert.equal((flow.match(/<polyline class="cc-line flow"/g)||[]).length,2);
 assert.match(flow,/>1\.2<\/text>/);assert.match(flow,/>0\.2<\/text>/);
 assert.equal((flow.match(/class="cc-goal"/g)||[]).length,1);
 // Minutes under the axis, the half time dashed.
 assert.match(flow,/class="cc-half"/);assert.match(flow,/>45′<\/text>/);assert.match(flow,/>90′<\/text>/);
 // A match played before its shots were kept has no such card.
 assert.doesNotMatch(await screen(report),/Fil du match/);
});
