import {test} from 'node:test';
import assert from 'node:assert/strict';
import {movementsHistory} from '../../web/club-history.js';

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
 assert.match(arrivals,/9\.5\sM€<\/b>/);
 assert.match(departures,/<span class="movement-kind release">Fin de contrat<\/span>/);assert.match(departures,/<span class="movement-kind retirement">Retraite<\/span><span class="position">—<\/span>/);
 assert.match(departures,/<span class="movement-kind loan">Prêt<\/span>/);
 assert.match(html,/<span title="Âge non archivé">—<\/span>/);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});

test('the season reads in figures: spending, takings, the balance, the biggest sale and the biggest signing',()=>{
 const html=movements();
 assert.match(html,/<span>Dépenses<\/span><strong>9\.5\sM€<\/strong>/);assert.match(html,/<span>Recettes<\/span><strong>32\sM€<\/strong>/);
 assert.match(html,/<span>Balance<\/span><strong class="good">\+23\sM€<\/strong>/);
 assert.match(html,/<span>Plus grosse vente<\/span><p><a href="#\/player\/3">Vendu<\/a> <small>→ Newcastle<\/small><\/p><\/div><strong>32\sM€<\/strong>/);
 assert.match(html,/<span>Plus grosse recrue<\/span><p><a href="#\/player\/1">Recrue<\/a> <small>← Toulouse<\/small>/);
 // The season is stepped through from the row of tabs: the tab draws no control of its own.
 assert.doesNotMatch(html,/class="segmented steps"|data-param="saison"/);
 assert.match(html,/<div class="card movement-balance"><div><span>Dépenses<\/span>/);
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
