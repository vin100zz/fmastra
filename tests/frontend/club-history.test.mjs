import {test} from 'node:test';
import assert from 'node:assert/strict';
import {movementsHistory,seasonNavigation,seasonsHistory} from '../../web/club-history.js';

test('season arrows have bounded destinations without the old numeric filter, in full or in the head of a card',()=>{
 const html=seasonNavigation({season:2025,previous_season:null,next_season:2026});
 assert.match(html,/data-season="" disabled/);
 assert.match(html,/data-season="2026"/);
 assert.doesNotMatch(html,/<input/);
 const compact=seasonNavigation({season:2025,previous_season:2024,next_season:null},true);
 assert.match(compact,/<nav class="season-steps"[^>]*><button type="button" data-season="2024"  aria-label="Saison précédente">‹<\/button><strong>2025 \/ 2026<\/strong><button type="button" data-season="" disabled aria-label="Saison suivante">›<\/button><\/nav>/);
});

const ref=(id,name)=>({id,name,major_color:'#aa0000',minor_color:'#ffcc00'});
const lens=ref(7,'Lens');
const row=(kind,player_id,player,date,fee,source,target,extra={})=>({kind,player_id,player,date,fee,source,target,position:'MC',age:24,...extra});
const sections=(over={})=>({arrivals:[row('transfer',1,'Recrue','2026-07-22',9.5e6,ref(5,'Toulouse'),lens),row('transfer',2,'Libre','2026-07-02',0,null,lens)],
 departures:[row('transfer',3,'Vendu','2026-08-12',32e6,lens,ref(6,'Newcastle'))],
 academy:[row('academy',4,'<script>alert(1)</script>','2026-07-01',0,null,lens,{age:18})],release:[row('release',5,'Fin','2026-07-01',0,lens,null)],
 retirement:[row('retirement',6,'Ancien','2026-07-01',0,lens,null,{position:null,age:null})],departure_unknown:[],loans_in:[],
 loans_out:[row('loan',7,'Prêté','2026-09-02',0,lens,ref(8,'Amiens'))],...over});
const movements=(over={},params)=>movementsHistory({season:2026,previous_season:2025,next_season:null,history_since:'2025-07-01',arrival_total:9.5e6,departure_total:32e6,sections:sections(over)},params);

test('each side lists every kind of movement by date with its badge, its club and its fee, and escapes imported names',()=>{
 const html=movements();
 const [arrivals,departures]=html.split('aria-label="Départs"');
 assert.match(arrivals,/<h2>Arrivées · 3<\/h2>/);assert.match(departures,/<h2>Départs · 4<\/h2>/);
 // In date order: the academy promotion of July 1st first.
 const names=[...arrivals.matchAll(/class="movement-player"><a href="#\/player\/(\d+)">/g)].map(match=>Number(match[1]));
 assert.deepEqual(names,[4,2,1]);
 assert.match(arrivals,/<span class="movement-kind academy">Jeune promu<\/span>.*Centre de formation/);
 assert.match(arrivals,/Libre<\/a><\/span><span class="movement-age">24 ans<\/span><span class="movement-club"><span class="muted">Libre<\/span><\/span><b class="movement-fee">Libre<\/b>/);
 assert.match(arrivals,/9,5\sM\s€<\/b>/);
 assert.match(departures,/<span class="movement-kind release">Fin de contrat<\/span>/);assert.match(departures,/<span class="movement-kind retirement">Retraite<\/span><span class="position">—<\/span>/);
 assert.match(departures,/<span class="movement-kind loan">Prêt<\/span>/);
 assert.match(html,/<span title="Âge non archivé">—<\/span>/);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});

test('the season reads in figures: spending, takings, the balance, the biggest sale and the biggest signing',()=>{
 const html=movements();
 assert.match(html,/<span>Dépenses<\/span><strong>9,5\sM\s€<\/strong>/);assert.match(html,/<span>Recettes<\/span><strong>32\sM\s€<\/strong>/);
 assert.match(html,/<span>Balance<\/span><strong class="good">\+23\sM\s€<\/strong>/);
 assert.match(html,/<span>Plus grosse vente<\/span><p><a href="#\/player\/3">Vendu<\/a> <small>→ Newcastle<\/small><\/p><\/div><strong>32\sM\s€<\/strong>/);
 assert.match(html,/<span>Plus grosse recrue<\/span><p><a href="#\/player\/1">Recrue<\/a> <small>← Toulouse<\/small>/);
 assert.match(html,/class="season-steps"/);
 // Without a paid transfer there is no record to show.
 const quiet=movementsHistory({season:2026,previous_season:2025,next_season:null,history_since:'2025-07-01',arrival_total:0,departure_total:0,sections:sections({arrivals:[],departures:[]})});
 assert.doesNotMatch(quiet,/Plus grosse/);assert.match(quiet,/<span>Balance<\/span><strong class="">0\s€<\/strong>/);
});

test('buttons keep one kind of movement on a side, from the address',()=>{
 const html=movements({},new URLSearchParams('departs=other'));
 const [arrivals,departures]=html.split('aria-label="Départs"');
 assert.match(arrivals,/data-param="arrivees" data-param-value="" aria-pressed="true" class="active">Tous <span class="count">3<\/span>/);
 assert.match(arrivals,/data-param-value="transfer" aria-pressed="false" class="">Transferts <span class="count">2<\/span>/);
 assert.match(departures,/data-param="departs" data-param-value="other" aria-pressed="true" class="active">Autres <span class="count">2<\/span>/);
 assert.doesNotMatch(departures,/movement-player"><a href="#\/player\/3"/);assert.match(departures,/Fin<\/a>/);
 // A side of one kind needs no buttons; an unknown kind shows them all.
 assert.doesNotMatch(movements({arrivals:[],academy:[],loans_in:[]}).split('aria-label="Départs"')[0],/movement-filters/);
 assert.match(movements({},new URLSearchParams('departs=bogus')),/data-param="departs" data-param-value="" aria-pressed="true"/);
 assert.match(movements({arrivals:[],academy:[]}).split('aria-label="Départs"')[0],/Aucun mouvement enregistré pour cette saison/);
});

const move=(player_id,player,fee,other,side,season)=>({date:'2026-07-01',player_id,player,fee,season,[side]:other});
const seasonsData=(extra={})=>({total:2,page:1,page_size:30,items:[
 {season:2026,rank:3,champion:false,competition:'Ligue 1',competition_id:16,cup:{label:'Quarts de finale',level:4,winner:false},europe:{code:'C1',competition:'Ligue des champions',label:'Phase de ligue',level:1,winner:false},reputation:{value:88.4,change:-3.1}},
 {season:2025,rank:1,champion:true,competition:'Ligue 1',competition_id:16,cup:{label:'Vainqueur',level:7,winner:true},europe:null,reputation:{value:91.5,change:null}}],
 honours:{league:1,cup:1,europe:[],best_rank:{rank:1,season:2025,competition:'Ligue 1'},best_europe:{code:'C1',competition:'Ligue des champions',label:'Phase de ligue',season:2026}},
 league:{clubs:18,europe:5,relegation:3,level:1},
 leaders:{matches:[{player_id:1,player:'Buteur <b>',matches:80,goals:12},{player_id:3,player:'Second',matches:40,goals:2}],goals:[{player_id:2,player:'Renard',matches:40,goals:30}]},
 transfers:{arrivals:[move(3,'Recrue',25e6,ref(5,'Lyon'),'source',2026)],departures:[move(4,'Vendu',40e6,ref(6,'Milan'),'target',2025)]},...extra});
const club={id:7,name:'Lens',competition:'Ligue 1',competition_id:16,reputation:90,standing:{rank:2,points:30}};

test('the seasons table shows the rank, the reputation, the national cup and the European cup reached, sorted by depth',()=>{
 const html=seasonsHistory(seasonsData(),club,2027);
 for(const label of ['COUPE NATIONALE','COUPE D’EUROPE','CLASSEMENT','PALMARÈS','RÉPUTATION'])assert.ok(html.includes(label),label);
 assert.match(html,/<span class="run-chip">Quarts de finale<\/span>/);assert.match(html,/<span class="run-chip won">✦ Vainqueur<\/span>/);
 assert.match(html,/<span class="competition-code europe c1" title="Ligue des champions">C1<\/span><span class="run-chip">Phase de ligue<\/span>/);
 assert.match(html,/<span class="rank-chip europe">3e<\/span>/);assert.match(html,/<span class="rank-chip first">1er<\/span>/);
 assert.match(html,/88,4 <span class="bad">−3,1<\/span>/);assert.match(html,/91,5<\/td>/);
 assert.match(html,/data-value="4"/);assert.match(html,/data-value="7"/);assert.match(html,/data-value="88.4"/);
 assert.doesNotMatch(html,/undefined|null|NaN/);
 assert.doesNotMatch(html,/Classement complet|season-archive|class="pager"/);
 assert.match(seasonsHistory(seasonsData({total:45,page:1}),club,2027),/1–30 sur 45/);
});

test('the league rank of each season is drawn against the places of the league, the season under way dashed',()=>{
 const html=seasonsHistory(seasonsData(),club,2027);
 const chart=html.match(/<svg class="club-chart" viewBox="0 0 1000 254"[^]*?<\/svg>/)[0];
 assert.match(chart,/<rect class="rank-zone europe"/);assert.match(chart,/<rect class="rank-zone relegation"/);
 assert.equal((chart.match(/<circle class="cc-point"/g)||[]).length,2);
 assert.match(chart,/<circle class="cc-point open"[^>]*><title>2027 \/ 2028 : 2e \(en cours\)<\/title>/);
 assert.match(chart,/class="cc-line dashed"/);
 // Seasons read from the oldest: the title of 2025 first.
 assert.ok(chart.indexOf('2025 / 2026 : 1er')<chart.indexOf('2026 / 2027 : 3e'));
 // Without a finished league season nor a standing, the chart says so.
 assert.match(seasonsHistory(seasonsData({items:[],total:0}),{...club,standing:null},2027),/Aucune saison de championnat terminée/);
});

test('the honours tell the titles and the best the club has done; the reputation is drawn season after season',()=>{
 const html=seasonsHistory(seasonsData(),club,2027);
 assert.match(html,/<b>Champion<\/b><\/div><strong>×1<\/strong>/);assert.match(html,/<b>Coupe nationale<\/b><\/div><strong>×1<\/strong>/);
 assert.match(html,/<b>Meilleur classement<\/b><small>Ligue 1 2025 \/ 2026<\/small><\/div><strong>1er<\/strong>/);
 assert.match(html,/<b>Meilleur parcours européen<\/b>.*<span class="honour-text">Phase de ligue<\/span>/);
 assert.match(html,/aria-label="Réputation à l’ouverture de chaque saison"/);
 assert.match(html,/<title>2027 \/ 2028 : 90<\/title>/);
 assert.match(seasonsHistory(seasonsData({honours:{league:0,cup:0,europe:[],best_rank:null,best_europe:null}}),club,2027),/Aucun titre pour l’instant/);
});

test('the leaders are bars against the first of them, and the biggest transfers name their season',()=>{
 const html=seasonsHistory(seasonsData(),club,2027);
 for(const label of ['Plus utilisés','Meilleurs buteurs','Plus gros transferts'])assert.ok(html.includes(`<h2>${label}</h2>`),label);
 assert.match(html,/href="#\/player\/1">Buteur &lt;b&gt;<\/a><\/span><i style="width:100%"><\/i><b>80<\/b>/);
 assert.match(html,/href="#\/player\/3">Second<\/a><\/span><i style="width:50%"><\/i><b>40<\/b>/);
 assert.doesNotMatch(html,/Buteur <b>/);
 assert.match(html,/Recrue<\/a> <small>← Lyon<\/small><\/span><small>26-27<\/small><b>25\sM\s€<\/b>/);
 assert.match(html,/Vendu<\/a> <small>→ Milan<\/small><\/span><small>25-26<\/small><b>40\sM\s€<\/b>/);
 const none=seasonsHistory(seasonsData({total:0,items:[],leaders:{matches:[],goals:[]},transfers:{arrivals:[],departures:[]}}),club,2027);
 assert.match(none,/Pas encore de statistiques/);assert.match(none,/Aucun transfert payant enregistré/);assert.match(none,/Pas encore de saison terminée/);
});
