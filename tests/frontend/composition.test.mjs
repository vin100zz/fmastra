import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pitchLayout,place,remove,nextFree,changeFormation,lineupProblems,compositionContent} from '../../web/composition.js';

const F433=['GB','DL','DC','DC','DR','MDC','MC','MC','AILG','BU','AILD'];
const F442=['GB','DL','DC','DC','DR','AILG','MC','MC','AILD','BU','BU'];

test('the pitch puts the keeper at the bottom, forwards at the top and full-backs on the wings',()=>{
 const places=pitchLayout(F433);
 assert.equal(places[0].x,50);assert.ok(places[0].y>places[1].y);
 assert.ok(places[1].x<places[2].x&&places[2].x<places[3].x&&places[3].x<places[4].x);
 // 4-3-3 wingers line up with the striker; 4-4-2 wingers with the midfield.
 assert.equal(places[8].y,places[9].y);
 const flat=pitchLayout(F442);assert.equal(flat[5].y,flat[6].y);
});

test('dropping swaps places; from the squad list the former holder leaves the lineup',()=>{
 const lineup={slots:[1,2,3],bench:[4,null]};
 assert.deepEqual(place(lineup,1,{kind:'slot',index:2}),{slots:[3,2,1],bench:[4,null]});
 assert.deepEqual(place(lineup,4,{kind:'slot',index:0}),{slots:[4,2,3],bench:[1,null]});
 assert.deepEqual(place(lineup,9,{kind:'slot',index:1}),{slots:[1,9,3],bench:[4,null]});
 assert.deepEqual(place(lineup,9,{kind:'bench',index:1}),{slots:[1,2,3],bench:[4,9]});
 assert.deepEqual(remove(lineup,2),{slots:[1,null,3],bench:[4,null]});
});

test('changing tactics keeps each starter on his position, then on his line',()=>{
 const slots=F433.map((_,index)=>index+1);
 const next=changeFormation(slots,F433,F442);
 assert.deepEqual(next.slice(0,5),[1,2,3,4,5]);
 assert.equal(next[5],9);assert.equal(next[8],11);   // wingers keep their side
 assert.equal(new Set(next).size,11);
});

test('empty positions and unavailable players make the lineup unplayable',()=>{
 const players=[{id:1,name:'A'},{id:2,name:'B',unavailable:'injured'},{id:3,name:'C',unavailable:'suspended'},{id:4,name:'D'}];
 assert.deepEqual(lineupProblems({slots:[1,4],bench:[]},['GB','BU'],players),[]);
 assert.deepEqual(lineupProblems({slots:[1,null],bench:[3]},['GB','BU'],players),['Poste inoccupé : BU','C est suspendu']);
 assert.deepEqual(lineupProblems({slots:[2,4],bench:[]},['GB','BU'],players),['B est blessé']);
 // With too few available players, the eleven may stay short.
 assert.deepEqual(lineupProblems({slots:[1,null,null],bench:[]},['GB','DC','BU'],players.slice(0,3)),[]);
});

test('the editor starts from the previous lineup and flags unavailable players',async()=>{
 const player=(id,position,extra={})=>({id,name:`Joueur ${id}`,position,rating:100,potential:120,fitness:.9,appearances:3,goals:1,assists:0,average:6.5,unavailable:null,...extra});
 const data={match_id:5,home:true,opponent:{id:9,name:'Nice'},bench_size:2,formations:{'4-3-3':F433,'4-4-2':F442},
  players:[player(1,'GB'),player(2,'DC',{unavailable:'injured'}),player(3,'BU',{unavailable:'suspended',match_suspension:2})],
  default:{formation:'4-4-2',titulaires:[[1,'GB'],[2,'DL']],banc:[3]},suggestions:{}};
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{
  const html=await compositionContent(new URLSearchParams(),{awaiting_lineup:5});
  assert.doesNotMatch(html,/composition légale/);
  assert.match(html,/data-tactic="4-4-2" aria-pressed="true"/);
  assert.match(html,/class="pitch-player lineup-slot def invalid" data-slot="1" data-player="2"/);
  assert.match(html,/lineup-icon injury/);assert.match(html,/lineup-icon suspension" title="Suspendu \(2 matchs\)"/);
  assert.match(html,/Joueur 2 est blessé/);
  for(const label of ['COMPO','POSTE','JOUEUR','NIV.','POT.','FATIGUE','MJ','BUTS','PD','NOTE'])assert.ok(html.includes(`>${label}`),label);
 }finally{globalThis.fetch=previous;}
});

test('the next free place follows the order of positions, substitutes last',()=>{
 assert.deepEqual(nextFree({slots:[1,null,2,null,null,3,4,5,null,6,7],bench:[null]},F433),{kind:'slot',index:1});
 assert.deepEqual(nextFree({slots:[1,2,3,4,5,6,7,8,null,null,null],bench:[null]},F433),{kind:'slot',index:8});   // AILG, AILD, then BU
 assert.deepEqual(nextFree({slots:[1,2,3,4,5,6,7,8,9,null,10],bench:[null]},F433),{kind:'slot',index:9});
 assert.deepEqual(nextFree({slots:F433.map((_,index)=>index+1),bench:[20,null]},F433),{kind:'bench',index:1});
 assert.equal(nextFree({slots:F433.map((_,index)=>index+1),bench:[20]},F433),null);
});
