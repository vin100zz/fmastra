import {test} from 'node:test';
import assert from 'node:assert/strict';
import {financialHistory,movementsHistory,seasonNavigation} from '../../web/club-history.js';

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
});

test('missing financial history is explained without claiming zero spending',()=>{
 const html=financialHistory({season:2025,previous_season:null,next_season:2026,available:false,since:'2026-08-01'});
 assert.match(html,/Historique indisponible/);
 assert.doesNotMatch(html,/Total des dépenses/);
});
