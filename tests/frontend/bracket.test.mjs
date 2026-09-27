import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bracket} from '../../web/bracket.js';

const club=id=>({id,name:`Club ${id}`});
const played=(id,home,away,score,winner)=>({id,home:club(home),away:club(away),score,winner_id:winner,first_leg_id:null});
const order=html=>[...html.matchAll(/href="#\/club\/(\d+)"/g)].map(found=>Number(found[1]));

test('an open draw places each tie beside the tie its winner went on to play',()=>{
 // quarter-finals drawn in id order 1–4, but the semi-finals paired the winners of 1 and 4, then 2 and 3
 const quarters=[played(1,1,2,[1,0],1),played(2,3,4,[0,1],4),played(3,5,6,[2,2],6),played(4,7,8,[3,0],7)];
 const semis=[played(5,1,7,null,null),played(6,4,6,null,null)];
 const html=bracket([{label:'Quarts',matches:quarters},{label:'Demies',matches:semis},{label:'Finale',matches:[]}]);
 assert.deepEqual(order(html).slice(0,8),[1,2,7,8,3,4,5,6]);
 assert.equal((html.match(/bracket-tie empty/g)||[]).length,1);
 // quarters are joined to the semis; the semis to the undrawn final are not
 assert.equal((html.match(/bracket-round linked/g)||[]).length,1);
 assert.match(html,/<strong>Finale<\/strong>/);
});

test('an undrawn round stays unjoined, unless the draw is fixed',()=>{
 const quarters=[played(1,1,2,[1,0],1),played(2,3,4,[0,1],4)];
 const stages=[{label:'Demies',matches:quarters},{label:'Finale',matches:[]}];
 assert.doesNotMatch(bracket(stages),/linked/);
 assert.match(bracket(stages,{fixed:true}),/bracket-round linked/);
});
