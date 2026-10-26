import {test} from 'node:test';
import assert from 'node:assert/strict';
import {movementsHistory,mercatoLedger} from '../../web/club-history.js';

const ref=(id,name)=>({id,name,major_color:'#aa0000',minor_color:'#ffcc00'});
const lens=ref(7,'Lens');
const row=(kind,player_id,player,date,fee,source,target,extra={})=>({kind,player_id,player,date,fee,source,target,position:'MC',age:24,...extra});
const sections=(over={})=>({arrivals:[row('transfer',1,'Recrue','2026-07-22',9.5e6,ref(5,'Toulouse'),lens),row('transfer',2,'Libre','2026-07-02',0,null,lens)],
 departures:[row('transfer',3,'Vendu','2026-08-12',32e6,lens,ref(6,'Newcastle'))],
 academy:[row('academy',4,'<script>alert(1)</script>','2026-07-01',0,null,lens,{age:18})],release:[row('release',5,'Fin','2026-07-01',0,lens,null)],
 retirement:[row('retirement',6,'Ancien','2026-07-01',0,lens,null,{position:'DC',age:null})],departure_unknown:[],loans_in:[],
 loans_out:[row('loan',7,'Prêté','2026-09-02',0,lens,ref(8,'Amiens'))],...over});
const MERCATOS=[{season:2026,summer:{spent:9.5e6,earned:32e6},winter:null},{season:2025,summer:{spent:40e6,earned:0},winter:{spent:0,earned:10e6}}];
const movements=(over={})=>movementsHistory({season:2026,previous_season:2025,next_season:null,history_since:'2025-07-01',arrival_total:9.5e6,departure_total:32e6,mercatos:MERCATOS,sections:sections(over)});
const sides=html=>html.split('aria-label="Départs"');

test('each side lists every kind of movement by date in a sorted table, its foot counting the players and totalling the fees',()=>{
 const html=movements();
 const [arrivals,departures]=sides(html);
 assert.match(arrivals,/<h2>Arrivées<\/h2>/);assert.match(departures,/<h2>Départs<\/h2>/);
 assert.match(arrivals,/<table data-sortable>.*<th class="date-column" data-first="asc"><button class="sort-toggle" data-table-sort>DATE<\/button><\/th>.*<th class="fee-column">/);
 // In date order: the academy promotion of July 1st first.
 const names=[...arrivals.slice(arrivals.indexOf("<table")).matchAll(/<a href="#\/player\/(\d+)">/g)].map(match=>Number(match[1]));
 assert.deepEqual(names,[4,2,1]);
 assert.match(arrivals,/<span class="movement-kind academy">Jeune promu<\/span>.*Centre de formation/);
 assert.match(arrivals,/<span class="muted">Libre<\/span><\/td><td data-value="0"><span class="num">Libre<\/span>/);
 assert.match(arrivals,/<tfoot><tr><td><\/td><td><\/td><td><\/td><td>3 joueurs<\/td><td><\/td><td><\/td><td><span class="num">9\.5\sM€<\/span><\/td><\/tr><\/tfoot>/);
 assert.match(departures,/<td>4 joueurs<\/td>.*<span class="num">32\sM€<\/span><\/td><\/tr><\/tfoot>/);
 assert.match(departures,/<span class="movement-kind release">Fin de contrat<\/span>/);
 // A retired player keeps the position his retirement archived.
 assert.match(departures,/<span class="movement-kind retirement">Retraite<\/span><\/td><td data-value="DC"><span class="position[^"]*"[^>]*>DC<\/span>/);
 assert.match(departures,/<span class="movement-kind loan">Prêt<\/span>/);
 assert.match(html,/<span title="Âge non archivé">—<\/span>/);
 // No buttons keep one kind of movement any more.
 assert.doesNotMatch(html,/movement-filters|data-param="(arrivees|departs)"/);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});

test('the season reads in figures: spending, takings and balance on one tile, the biggest signing and sale after a chevron',()=>{
 const html=movements();
 assert.match(html,/<div class="club-hero-tile split"><div><span>Dépenses<\/span><strong>9\.5\sM€<\/strong><\/div><div><span>Recettes<\/span><strong>32\sM€<\/strong><\/div><div><span>Balance<\/span><strong class="good">\+23\sM€<\/strong>/);
 assert.match(html,/<div class="club-hero-tile record"><span>Plus grosse vente<\/span><strong><a href="#\/player\/3">Vendu<\/a><small><span class="go" aria-hidden="true"><\/span><a [^>]*href="#\/club\/6"[^>]*>.*Newcastle<\/a><\/small><b>32\sM€<\/b><\/strong><\/div>/);
 assert.match(html,/<span>Plus grosse recrue<\/span><strong><a href="#\/player\/1">Recrue<\/a><small><span class="go back" aria-hidden="true"><\/span>/);
 assert.doesNotMatch(html,/[←→]/);
 // The season is stepped through from the row of tabs or the mercatos: the tab draws no step of its own.
 assert.doesNotMatch(html,/class="season"/);
 // Without a paid transfer there is no record to show.
 const quiet=movementsHistory({season:2026,previous_season:2025,next_season:null,history_since:'2025-07-01',arrival_total:0,departure_total:0,sections:sections({arrivals:[],departures:[]})});
 assert.doesNotMatch(quiet,/Plus grosse|class="mercatos"/);assert.match(quiet,/<span>Balance<\/span><strong>0\s€<\/strong>/);
 assert.match(movements({arrivals:[],academy:[]}).split('aria-label="Départs"')[0],/<p class="empty">Aucun transfert<\/p>/);
});

test('the mercatos show each window of every season, the amounts at the end of their bars, and open a season',()=>{
 const html=mercatoLedger(MERCATOS,2026);
 const [shown,earlier]=html.split('data-param-value="2025"');
 assert.match(shown,/<button type="button" class="mercato-season picked" data-param="saison" data-param-value="2026" aria-pressed="true"><span class="mercato-head"><span>2026 \/ 2027<\/span><b class="good">\+23\sM€<\/b><\/span>/);
 // Each bar its share of the largest amount of the game, its amount beside it; nothing for an empty side.
 assert.match(shown,/<span class="mercato-half spent"><b>9\.5\sM€<\/b><i style="--share:0\.237"><\/i><\/span><span class="mercato-half earned"><i style="--share:0\.800"><\/i><b>32\sM€<\/b><\/span>/);
 // The winter under way has not opened.
 assert.match(shown,/<span class="mercato-row future"><span class="mercato-window">Hiver<\/span>/);
 assert.match(earlier,/aria-pressed="false"><span class="mercato-head"><span>2025 \/ 2026<\/span><b class="bad">−30\sM€<\/b>/);
 assert.match(earlier,/<span class="mercato-window">Hiver<\/span><span class="mercato-half spent"><\/span><span class="mercato-half earned"><i style="--share:0\.250"><\/i><b>10\sM€<\/b>/);
 // The key stands over the bars; no balance per window.
 assert.match(html,/^<div class="mercatos" role="group" aria-label="Mercatos"><div class="mercato-row mercato-key" aria-hidden="true"><span><\/span><span class="mercato-half spent"><b>Dépenses<\/b>/);
 assert.equal((html.match(/class="(good|bad)"/g)||[]).length,2);
});
