import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchHero} from '../../web/club-hero.js';
import {matchScreen} from '../../web/match.js';
import {setNations} from '../../web/ui.js';

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
 result:{status:'played',duration:5600,home_stats:stats,away_stats:stats,home_lineup:[player(11,'Gardien Un')],away_lineup:[player(21,'Gardien Deux')],home_bench:[],away_bench:[],
  events:[{kind:'goal',period:1,second:2400,team_id:1,player_id:11,player:'Gardien Un',secondary_id:null,secondary:null,detail:''},
   {kind:'red',period:2,second:4000,team_id:2,player_id:21,player:'Gardien Deux',secondary_id:null,secondary:null,detail:'direct'}]}};
async function screen(data){
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{return await matchScreen(data.id);}finally{globalThis.fetch=previous;}
}

test('under the band, the bar says which match it is, then holds the first leg and the summary',async()=>{
 const html=await screen(report);
 assert.match(html,/^<header class="club-hero match-hero"/);
 assert.match(html,/<strong class="big-score">3 : 1<\/strong><span>Cumul 4 – 3<\/span>/);
 assert.match(html,/<div class="club-hero-bar"><div class="hero-pills"><div class="match-facts"><span class="competition-code" title="Ligue des champions">LdC<\/span><strong>Barrages · retour<\/strong><span class="muted">mercredi 17 septembre 2031 · 83\s186 places<\/span><span>Vainqueur : <a href="#\/club\/1" class="club-link">/);
 assert.match(html,/<div class="hero-commands"><a class="button" href="#\/match\/8">Match aller<\/a><button type="button" class="replay-toggle"/);
 // A neutral ground has no capacity; a league match names its round by its number and has neither first leg nor winner.
 const league=await screen({...report,round_label:null,round:4,capacity:null,neutral:true,aggregate:null,winner_id:null,first_leg_id:null});
 assert.match(league,/<strong>Journée 4<\/strong><span class="muted">mercredi 17 septembre 2031 · Terrain neutre<\/span><\/div><\/div><div class="hero-commands"><button type="button" class="replay-toggle"/);
 assert.doesNotMatch(league,/Vainqueur|Match aller|Cumul/);
 // A match to come has no summary: the bar holds no command.
 const coming=await screen({...report,score:null,aggregate:null,winner_id:null,first_leg_id:null,result:null});
 assert.match(coming,/<strong class="big-score">VS<\/strong>/);assert.doesNotMatch(coming,/hero-commands/);
});

test('each side is named once, in the band: the line-ups have no heading, nothing names the sides over the cards',async()=>{
 const html=await screen({...report,winner_id:null});
 assert.equal((html.match(/>Marseille</g)||[]).length,1);
 assert.equal((html.match(/>Real &lt;Madrid&gt;</g)||[]).length,1);
 assert.doesNotMatch(html,/match-sides|match-banner|scoreboard/);
 assert.equal((html.match(/<section class="card match-lineup"><div class="pitch" aria-label="Composition de /g)||[]).length,2);
 // The home side's highlights stand on the left of the minute, the away side's on its right.
 assert.match(html,/<h2>Les temps forts<\/h2><\/div><div class="highlights"><div class="highlight-row"><div class="highlight home"><span class="match-mark goal"[^]*?<span class="minute">40′<\/span><div class="highlight away"><\/div><\/div>/);
 assert.match(html,/<div class="highlight home"><\/div><span class="minute">66′<\/span><div class="highlight away"><span class="match-mark booking red"/);
 assert.match(html,/<h2>Le match en chiffres<\/h2><\/div><div class="comparisons"><div class="comparison">/);
});
