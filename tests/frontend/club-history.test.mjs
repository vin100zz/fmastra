import {test} from 'node:test';
import assert from 'node:assert/strict';
import {financialHistory,movementsHistory,seasonNavigation,seasonsHistory} from '../../web/club-history.js';

test('season arrows have bounded destinations without the old numeric filter',()=>{
 const html=seasonNavigation({season:2025,previous_season:null,next_season:2026});
 assert.match(html,/data-season="" disabled/);
 assert.match(html,/data-season="2026"/);
 assert.doesNotMatch(html,/<input/);
});

test('displays the three additional movement sections and escapes imported names',()=>{
 const row={date:'2026-07-01',player_id:42,player:'<script>alert(1)</script>'};
 const html=movementsHistory({season:2026,previous_season:2025,next_season:null,history_since:'2025-07-01',sections:{arrivals:[],departures:[],release:[row],retirement:[row],academy:[row],departure_unknown:[]}});
 for(const label of ['Départs libres en fin de contrat','Départs à la retraite','Jeunes promus du centre de formation'])assert.ok(html.includes(label));
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.ok(html.indexOf('aria-label="Arrivées"') < html.indexOf('Jeunes promus'));
 assert.ok(html.indexOf('Jeunes promus') < html.indexOf('aria-label="Départs"'));
 assert.match(html,/ÂGE/);assert.match(html,/Total :/);
});

test('missing financial history is explained without claiming zero spending',()=>{
 const html=financialHistory({season:2025,previous_season:null,next_season:2026,available:false,since:'2026-08-01'});
 assert.match(html,/Historique indisponible/);
 assert.doesNotMatch(html,/Total des dépenses/);
});

const move=(player_id,player,fee,other,side)=>({date:'2026-07-01',player_id,player,fee,[side]:other});
const seasonsData=(extra={})=>({total:2,page:1,page_size:30,items:[
 {season:2026,rank:3,champion:false,competition:'Ligue 1',cup:{label:'Quarts de finale',level:4,winner:false},europe:{code:'C1',competition:'Ligue des champions',label:'Phase de ligue',level:1,winner:false}},
 {season:2025,rank:1,champion:true,competition:'Ligue 1',cup:{label:'Vainqueur',level:7,winner:true},europe:null}],
 leaders:{matches:[{player_id:1,player:'Buteur <b>',matches:80,goals:12}],goals:[{player_id:2,player:'Renard',matches:40,goals:30}]},
 transfers:{arrivals:[move(3,'Recrue',25e6,{id:5,name:'Lyon'},'source')],departures:[move(4,'Vendu',40e6,{id:6,name:'Milan'},'target')]},...extra});

test('the history tab shows the national cup and the European cup reached in each season',()=>{
 const html=seasonsHistory(seasonsData());
 for(const label of ['COUPE NATIONALE','COUPE D’EUROPE','CLASSEMENT','PALMARÈS'])assert.ok(html.includes(label),label);
 assert.match(html,/Quarts de finale/);assert.match(html,/✦ Vainqueur/);
 assert.match(html,/<span title="Ligue des champions">C1 · Phase de ligue<\/span>/);
 // a season without a European run shows a dash, and the columns sort by depth of the run
 assert.match(html,/data-value="4"/);assert.match(html,/data-value="7"/);assert.match(html,/data-value="1"/);
});

test('the history tab no longer lists the full standings nor the number of results',()=>{
 const html=seasonsHistory(seasonsData());
 assert.doesNotMatch(html,/Classement complet/);assert.doesNotMatch(html,/season-archive/);
 assert.doesNotMatch(html,/résultat/);assert.doesNotMatch(html,/class="pager"/);
 assert.match(seasonsHistory(seasonsData({total:45,page:1})),/1–30 sur 45/);
});

test('a season without a league keeps its row and its cup, with dashes elsewhere',()=>{
 const html=seasonsHistory(seasonsData({total:1,items:[{season:2025,rank:null,champion:false,competition:null,cup:{label:'32es de finale',level:1,winner:false},europe:null}]}));
 assert.match(html,/32es de finale/);assert.doesNotMatch(html,/nulle?/);assert.doesNotMatch(html,/undefined/);
});

test('the history tab lists the leaders and the biggest transfers on both sides, and escapes names',()=>{
 const html=seasonsHistory(seasonsData());
 for(const label of ['Joueurs les plus utilisés','Meilleurs buteurs','Plus gros transferts entrants','Plus gros transferts sortants'])assert.ok(html.includes(label),label);
 assert.ok(html.indexOf('Plus gros transferts entrants')<html.indexOf('Plus gros transferts sortants'));
 assert.match(html,/href="#\/player\/1">Buteur &lt;b&gt;/);assert.doesNotMatch(html,/Buteur <b>/);
 assert.match(html,/PROVENANCE/);assert.match(html,/DESTINATION/);assert.match(html,/Lyon/);assert.match(html,/Milan/);
});

test('leaders and transfers without data explain themselves',()=>{
 const html=seasonsHistory(seasonsData({total:0,items:[],leaders:{matches:[],goals:[]},transfers:{arrivals:[],departures:[]}}));
 assert.match(html,/Pas encore de statistiques/);assert.match(html,/Aucun transfert payant enregistré/);
});

test('the history tab shows the reputation held at each season opening and its move, with a dash when unknown',()=>{
 const items=[{season:2026,rank:3,champion:false,competition:'Ligue 1',cup:null,europe:null,reputation:{value:88.4,change:-3.1}},
  {season:2025,rank:1,champion:true,competition:'Ligue 1',cup:null,europe:null,reputation:{value:91.5,change:null}},
  {season:2024,rank:2,champion:false,competition:'Ligue 1',cup:null,europe:null,reputation:null}];
 const html=seasonsHistory(seasonsData({total:3,items}));
 assert.ok(html.includes('RÉPUTATION'));
 assert.match(html,/88,4 <span class="muted">\(−3,1\)<\/span>/);
 assert.match(html,/91,5(?! <span)/);
 assert.match(html,/data-value="88.4"/);assert.match(html,/data-value="91.5"/);
 assert.doesNotMatch(html,/undefined|null/);
 assert.match(seasonsHistory(seasonsData({total:1,items:[{...items[0],reputation:{value:60,change:2.4}}]})),/\(\+2,4\)/);
});
