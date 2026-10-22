import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CLUB_VIEWS,NATION_VIEWS,historyView,viewChoice,runChip,rankChart,stageChart,clubHistory,nationHistory} from '../../web/history.js';

const ref=(id,name)=>({id,name,major_color:'#aa0000',minor_color:'#ffcc00'});
const standing={points:60,played:34,won:18,drawn:6,lost:10,goals_for:50,goals_against:40};
const cup=(label,level,winner=false)=>({label,level,winner,competition_id:-3,competition:'Coupe de France'});
const items=[{season:2026,rank:3,champion:false,competition_id:16,competition:'Ligue 1',level:1,standing,cup:cup('Demi-finales',5),
  europe:{code:'C1',competition:'Ligue des champions',label:'Finale',level:6,winner:false,competition_id:-101},scorer:{player_id:9,player:'Buteur <b>',goals:21},reputation:{value:88.4,change:-3.1}},
 {season:2025,rank:1,champion:true,competition_id:16,competition:'Ligue 1',level:1,standing:null,cup:cup('Vainqueur',7,true),europe:null,scorer:null,reputation:{value:91.5,change:null}}];
const leagues=[{id:16,name:'Ligue 1',level:1,clubs:18,europe:5,promotion:0,relegation:3},{id:17,name:'Ligue 2',level:2,clubs:18,europe:0,promotion:3,relegation:3}];
const tally={played:38,won:20,drawn:8,lost:10,goals_for:60,goals_against:41};
const summary=(over={})=>({items,leagues:leagues.slice(0,1),honours:[{kind:'league',competition_id:16,competition:'Ligue 1',code:null,count:1,seasons:[2025]},
  {kind:'cup',competition_id:-3,competition:'Coupe de France',code:null,count:1,seasons:[2025]}],
 record:{rows:[{competition_id:16,competition:'Ligue 1',seasons:2,...tally}],total:{seasons:2,...tally}},reputation:[{season:2025,value:91.5},{season:2026,value:88.4},{season:2027,value:90}],...over});
const club={id:7,name:'Lens',major_color:'#cc0000',minor_color:'#ffd700',competition_id:16,standing:{rank:2,points:30}};

test('the views are chosen at the end of the row of tabs, the overview by default and under the tab’s own address',()=>{
 assert.equal(historyView(CLUB_VIEWS,new URLSearchParams('vue=records')),'records');
 assert.equal(historyView(CLUB_VIEWS,new URLSearchParams('vue=editions')),'ensemble');
 assert.equal(historyView(NATION_VIEWS,new URLSearchParams('vue=editions')),'editions');
 const nav=viewChoice(CLUB_VIEWS,'joueurs','#/club/7/history');
 assert.match(nav,/^<nav class="segmented history-views" aria-label="Vues de l’historique"><a href="#\/club\/7\/history">Vue d’ensemble<\/a><a href="#\/club\/7\/history\?vue=saisons">Saisons<\/a><a class="active" aria-current="page" href="#\/club\/7\/history\?vue=joueurs">Joueurs<\/a>/);
});

test('a run reads its round: a semi-final, a final, and a title with its star',()=>{
 assert.equal(runChip(cup('Quarts de finale',4)),'<span class="run">Quarts de finale</span>');
 assert.equal(runChip(cup('Demi-finales',5)),'<span class="run semi">Demi-finales</span>');
 assert.equal(runChip(cup('Finale',6)),'<span class="run final">Finale</span>');
 assert.match(runChip(cup('Vainqueur',7,true)),/^<span class="run won"><svg viewBox="0 0 10 10" aria-hidden="true">[^]*<\/svg>Vainqueur<\/span>$/);
 assert.equal(runChip(null),'<span class="muted">—</span>');
});

test('the chart writes each rank in its disc, a column for each season, the title on the accent and the season under way open',()=>{
 const chart=rankChart(items,leagues.slice(0,1),{standing:{rank:2},today:2027,home:16,reputation:summary().reputation});
 // Three seasons, three columns of 44 pixels at least: a long history scrolls.
 assert.match(chart,/<div class="cc-plot" role="img" aria-label="Classement en championnat par saison" style="width:max\(100%,132px\)/);
 assert.match(chart,/<span class="cc-rank title"[^>]*title="2025 \/ 2026 · Ligue 1 : 1er">1<\/span>/);
 assert.match(chart,/<span class="cc-rank"[^>]*title="2026 \/ 2027 · Ligue 1 : 3e">3<\/span>/);
 assert.match(chart,/<span class="cc-rank open"[^>]*title="2027 \/ 2028 · Ligue 1 : 2e \(en cours\)">2<\/span>/);
 assert.equal((chart.match(/class="cc-line dashed"/g)||[]).length,1);
 assert.match(chart,/<i class="cc-zone europe"/);assert.match(chart,/<i class="cc-zone relegation"/);
 assert.match(chart,/<div class="cc-side right"[^>]*><span[^>]*>Europe<\/span><span[^>]*>Relégation<\/span><\/div>/);
 // The reputation under the ranks, written at both ends; the season under way marked on the axis.
 assert.match(chart,/<div class="cc-side left"[^>]*><span[^>]*>Ligue 1<\/span><span[^>]*>Réputation<\/span><\/div>/);
 assert.match(chart,/<span class="cc-label first"[^>]*>91\.5<\/span>/);assert.match(chart,/<span class="cc-label last"[^>]*>90<\/span>/);
 assert.match(chart,/<span class="cc-year now"[^>]*>27-28<\/span>/);
 assert.match(rankChart([],leagues,{}),/Aucune saison de championnat terminée/);
});

test('a season in another division is drawn on its storey, and one out of the simulated leagues breaks the line',()=>{
 const row=(season,rank,competition_id)=>({season,rank,competition_id,competition:competition_id===16?'Ligue 1':'Ligue 2'});
 const chart=rankChart([row(2029,3,17),row(2028,6,17),row(2027,18,16),row(2026,2,16)],leagues);
 const top=title=>Number(chart.match(new RegExp(`top:([\\d.]+)px" title="${title}`))[1]);
 const last=top('2027 / 2028 · Ligue 1 : 18e'),third=top('2029 / 2030 · Ligue 2 : 3e'),sixth=top('2028 / 2029 · Ligue 2 : 6e');
 assert.ok(top('2026 / 2027 · Ligue 1 : 2e')<last&&last<third&&third<sixth);
 assert.equal((chart.match(/<i class="cc-zone relegation"/g)||[]).length,2);assert.match(chart,/>Montée<\/span>/);
 // A gap of a season: no line across it.
 const gap=rankChart([row(2028,20,17),row(2026,12,17)],leagues);
 assert.doesNotMatch(gap.match(/<svg[^]*<\/svg>/)[0],/<path class="cc-line"/);
 assert.equal((gap.match(/class="cc-year/g)||[]).length,3);
});

test('the overview sets the chart beside the honours and the record',()=>{
 const html=clubHistory('ensemble',summary(),club,2027);
 assert.match(html,/^<div class="history-overview"><section class="card history-chart"><div class="card-head"><h2>Classement et réputation<\/h2><\/div><div class="cc-body"><div class="cc">/);
 assert.match(html,/<div class="honour-line"><span class="competition-code"[^>]*>L1<\/span><b>Champion de Ligue 1<\/b><small>2025 \/ 2026<\/small><strong>1<\/strong><\/div>/);
 assert.match(html,/<b>Coupe de France<\/b>/);
 assert.match(html,/<section class="card history-record">[^]*<tfoot><tr[^>]*><td[^>]*>Toutes compétitions<\/td>/);
 assert.doesNotMatch(html,/undefined|NaN|<h2>Records<\/h2>/);
 const none=clubHistory('ensemble',summary({items:[],honours:[],record:{rows:[],total:{}},reputation:[]}),{},null);
 assert.match(none,/Palmarès vierge/);assert.match(none,/Pas encore de match/);
});

test('the seasons give the league line, the cups with their runs, the top scorer, then the reputation and its move',()=>{
 const html=clubHistory('saisons',summary(),club,2027);
 const heads=[...html.matchAll(/data-table-sort>([^<]+)<\/button>/g)].map(match=>match[1]);
 assert.deepEqual(heads,['SAISON','CHAMPIONNAT','CL.','PTS','J','V','N','D','BP','BC','DIFF.','COUPE NATIONALE','COUPE D’EUROPE','MEILLEUR BUTEUR','BUTS','RÉPUTATION']);
 assert.match(html,/<h2>Les saisons du club · 2<\/h2>/);
 assert.match(html,/<span class="rank info">3<\/span>/);assert.match(html,/<span class="rank title">1<\/span>/);
 assert.match(html,/<span class="num">\+10<\/span>/);
 assert.match(html,/<span class="run semi">Demi-finales<\/span>/);assert.match(html,/<span class="run final">Finale<\/span>/);
 assert.match(html,/<a href="#\/player\/9">Buteur &lt;b&gt;<\/a><\/td><td[^>]*><span class="num"><b>21<\/b><\/span>/);
 assert.match(html,/<span class="with-delta">88\.4<span class="delta down">−3\.1<\/span><\/span>/);
 // A season without its league line, its scorer or its European run keeps dashes.
 assert.match(html,/<span class="with-delta">91\.5<\/span>/);
 assert.doesNotMatch(html,/undefined|null|NaN/);
 assert.match(clubHistory('saisons',summary({items:[]}),club),/Pas encore de saison terminée/);
});

const player=(player_id,name,matches,goals,extra={})=>({player_id,player:name,position:'MC',seasons:3,matches,goals,assists:0,note:null,...extra});
test('the players view puts the figure each list ranks on first, and the best eleven on the pitch',()=>{
 const data={formation:'4-3-3',eleven:[{position:'GB',player_id:1,player:'Gardien',matches:120},{position:'DG'}],matches:[player(1,'Gardien',120,0,{position:'GB'})],
  goals:[player(2,'Renard',80,40)],notes:[player(3,'Meneur',60,5,{note:7.4})],note_matches:50,academy:[],
  transfers:{arrivals:[{player_id:4,player:'Recrue',fee:25e6,season:2026,source:ref(5,'Lyon')}],departures:[],gains:[{player_id:6,player:'Revendu',bought:5e6,sold:9e6,gain:4e6,season:2027,target:ref(6,'Milan')}]}};
 const html=clubHistory('joueurs',data,club);
 const heads=title=>[...html.split(`<h2>${title}</h2>`)[1].split('</thead>')[0].matchAll(/data-table-sort>([^<]+)</g)].map(match=>match[1]);
 assert.deepEqual(heads('Plus de matches'),['#','POSTE','JOUEUR','MATCHES','BUTS','SAISONS']);
 assert.deepEqual(heads('Plus de buts'),['#','POSTE','JOUEUR','BUTS','MATCHES','SAISONS']);
 assert.deepEqual(heads('Meilleures notes'),['#','POSTE','JOUEUR','NOTE','MATCHES','SAISONS']);
 assert.match(html,/<span class="rating graded" style="--hue:[\d.]+">7\.40<\/span>/);
 assert.match(html,/<h2>Onze type<\/h2><span class="card-hint">4-3-3<\/span>/);assert.match(html,/120 matches/);
 assert.match(html,/Aucun jeune promu n’a joué/);
 assert.match(html,/<h2>Plus-values<\/h2>[^]*<span class="delta up">\+4\sM€<\/span>/);
 assert.match(html,/Aucun transfert payant enregistré/);
});

test('the records view tells the widest scores to their match, the runs, the clubs met, the best seasons and the ages',()=>{
 const score={match_id:41,date:'2026-09-12',competition_id:16,competition:'Ligue 1',opponent:ref(5,'Lyon'),home:false,neutral:false,scored:5,conceded:0};
 const data={wins:[score],defeats:[],runs:{longest:[{kind:'wins',count:9,first:'2026-08-01',last:'2026-10-20'}],ongoing:[{kind:'unbeaten',count:4,first:'2027-01-02'}]},
  opponents:{played:{club:ref(5,'Lyon'),count:12},beaten:null,beaten_by:null},
  best:{goals:[{player_id:9,player:'Buteur',position:'BU',season:2026,matches:30,goals:31,assists:2,note:7.2}],assists:[],notes:[],note_matches:20},
  ages:[{kind:'youngest',player_id:8,player:'Minot',position:'AILG',season:2026,date:'2026-09-12',years:16,months:3},{kind:'oldest',player_id:7,player:'Ancien',position:'GB',season:2025,date:'2026-05-02',years:38,months:0}]};
 const html=clubHistory('records',data,club);
 assert.match(html,/<a class="calendar-score V" href="#\/match\/41">5 – 0<\/a>/);
 assert.match(html,/Pas encore de résultat/);
 assert.match(html,/>Victoires<\/td><td[^>]*><span class="num"><b>9<\/b><\/span>/);
 assert.match(html,/<div class="section-title">En cours<\/div>[^]*>Sans défaite</);
 assert.match(html,/<span>Le plus affronté<\/span><strong>[^]*Lyon[^]*· 12 matches<\/strong>/);assert.doesNotMatch(html,/Le plus souvent battu/);
 assert.match(html,/<h2>Buts sur une saison<\/h2>/);assert.match(html,/<span>Plus jeune joueur<\/span><strong><span class="cell">[^]*Minot<\/a><\/span><span>16 ans 3 mois<\/span>/);
 assert.match(html,/<span>38 ans<\/span>/);
 assert.doesNotMatch(html,/undefined|NaN/);
});

const edition={year:2028,name:'Euro 2028',kind:'euro',code:'EU',first_phase:'1er du groupe C',finals:{label:'Vainqueur',level:7,winner:true},stage:{label:'Vainqueur',level:0},
 record:{played:10,won:8,drawn:1,lost:1,goals_for:20,goals_against:6},scorer:{player_id:6,player:'Buteur',goals:7},strength:{value:84.2,change:1.5}};
const league={...edition,year:2027,name:'Ligue des nations 2027',kind:'nations',code:'LN',first_phase:'Relégué en Division B',finals:null,stage:{label:'Division A',level:3},scorer:null,strength:null};

test('a selection’s chart sets the tournaments and the Nations League on their storeys, its code in each disc',()=>{
 const chart=stageChart([edition,league],{year:2030,name:'Coupe du monde 2030',code:'CM',stage:{label:'Qualifications',level:6}},[{season:2027,value:82.7},{season:2028,value:84.2}]);
 assert.match(chart,/^<div class="cc wide">/);
 assert.match(chart,/<span class="cc-rank code title"[^>]*title="Euro 2028 : Vainqueur">EU<\/span>/);
 assert.match(chart,/<span class="cc-rank code"[^>]*title="Ligue des nations 2027 : Division A">LN<\/span>/);
 assert.match(chart,/<span class="cc-rank code open"[^>]*title="Coupe du monde 2030 : Qualifications \(en cours\)">CM<\/span>/);
 assert.match(chart,/<span[^>]*>Tournois<\/span><span[^>]*>Ligue des nations<\/span><span[^>]*>Force<\/span>/);
 assert.match(chart,/<span class="cc-year now"[^>]*>2030<\/span>/);
 assert.match(stageChart([],null,[]),/Pas encore d’édition terminée/);
});

test('a selection’s history reads as a club’s: its editions, its players by caps, its records',()=>{
 const html=nationHistory('editions',{items:[edition,league]});
 assert.match(html,/<h2>Les éditions · 2<\/h2>/);
 assert.match(html,/<span class="competition-code international"[^>]*>EU<\/span><a class="strong" href="#\/international\/2028\/finals">Euro 2028<\/a>/);
 assert.match(html,/<span class="bad">Relégué en Division B<\/span>/);assert.match(html,/<span class="run won">/);
 assert.match(html,/<span class="with-delta">84\.2<span class="delta up">\+1\.5<\/span><\/span>/);
 assert.doesNotMatch(html,/undefined|NaN/);
 const players=nationHistory('joueurs',{formation:'4-3-3',eleven:[],matches:[{player_id:5,player:'Cap',position:'DC',editions:3,matches:40,goals:2,assists:0,note:null}],goals:[],notes:[],note_matches:20},{});
 assert.match(players,/<h2>Plus de sélections<\/h2>/);assert.match(players,/data-table-sort>SÉL\.<\/button><\/th><th[^>]*><button class="sort-toggle" data-table-sort>BUTS</);
 const overview=nationHistory('ensemble',{items:[edition],current:null,honours:[{kind:'euro',code:'EU',competition:'Euro',count:1,years:[2028]}],
  record:{rows:[{kind:'euro',code:'EU',phase:'finals',competition:'Euro',editions:1,...edition.record}],total:{editions:1,...edition.record}},strength:[]},{});
 assert.match(overview,/<h2>Parcours et force<\/h2>/);assert.match(overview,/<b>Euro<\/b><small>2028<\/small><strong>1<\/strong>/);
 assert.match(overview,/data-table-sort>ÉDITIONS</);
});
