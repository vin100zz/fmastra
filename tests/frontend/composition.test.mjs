import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pitchLayout,place,remove,dropOnSquad,nextFree,changeFormation,lineupProblems,compositionContent} from '../../web/composition.js';

const F433=['GB','DG','DC','DC','DD','MDC','MC','MC','AILG','BU','AILD'];
const F442=['GB','DG','DC','DC','DD','AILG','MC','MC','AILD','BU','BU'];

test('the pitch puts the keeper at the bottom, forwards at the top and full-backs on the wings',()=>{
 const places=pitchLayout(F433);
 assert.equal(places[0].x,50);assert.ok(places[0].y>places[1].y);
 assert.ok(places[1].x<places[2].x&&places[2].x<places[3].x&&places[3].x<places[4].x);
 // 4-3-3 wingers line up with the striker; 4-4-2 wingers with the midfield.
 assert.equal(places[8].y,places[9].y);
 const flat=pitchLayout(F442);assert.equal(flat[5].y,flat[6].y);
});

test('the diamond stacks its midfield on three lines; the attacking 4-4-2 puts its wingers ahead of two holding midfielders',()=>{
 const diamond=pitchLayout(['GB','DG','DC','DC','DD','MDC','MC','MC','MOC','BU','BU']);
 assert.ok(diamond[5].y>diamond[6].y&&diamond[6].y===diamond[7].y&&diamond[7].y>diamond[8].y&&diamond[8].y>diamond[9].y);
 assert.equal(diamond[5].x,50);assert.equal(diamond[8].x,50);assert.ok(diamond[6].x<50&&diamond[7].x>50);
 const attacking=pitchLayout(['GB','DG','DC','DC','DD','MDC','MDC','AILG','AILD','BU','BU']),flat=pitchLayout(F442);
 assert.equal(attacking[5].y,attacking[6].y);assert.equal(attacking[7].y,attacking[8].y);
 assert.ok(attacking[6].y>attacking[7].y&&attacking[7].y>attacking[9].y&&attacking[7].y<flat[5].y);
 assert.ok(attacking[7].x<attacking[5].x&&attacking[8].x>attacking[6].x);
});

test('dropping swaps places; from the squad list the former holder leaves the lineup',()=>{
 const lineup={slots:[1,2,3],bench:[4,null]};
 assert.deepEqual(place(lineup,1,{kind:'slot',index:2}),{slots:[3,2,1],bench:[4,null]});
 assert.deepEqual(place(lineup,4,{kind:'slot',index:0}),{slots:[4,2,3],bench:[1,null]});
 assert.deepEqual(place(lineup,9,{kind:'slot',index:1}),{slots:[1,9,3],bench:[4,null]});
 assert.deepEqual(place(lineup,9,{kind:'bench',index:1}),{slots:[1,2,3],bench:[4,9]});
 assert.deepEqual(remove(lineup,2),{slots:[1,null,3],bench:[4,null]});
});

test('dropping on a squad row swaps a selected player with an unselected one',()=>{
 const lineup={slots:[1,2,3],bench:[4,null]};
 assert.deepEqual(dropOnSquad(lineup,2,9),{slots:[1,9,3],bench:[4,null]});
 assert.deepEqual(dropOnSquad(lineup,9,2),{slots:[1,9,3],bench:[4,null]});
 assert.deepEqual(dropOnSquad(lineup,9,4),{slots:[1,2,3],bench:[9,null]});
 assert.deepEqual(dropOnSquad(lineup,2,3),{slots:[1,null,3],bench:[4,null]});
 assert.deepEqual(dropOnSquad(lineup,2,null),{slots:[1,null,3],bench:[4,null]});
 assert.deepEqual(dropOnSquad(lineup,9,8),lineup);
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
 const data={match_id:5,home:true,opponent:{id:9,name:'Nice'},bench_size:2,formations:{'4-3-3':F433,'4-4-2 plat':F442},
  players:[player(1,'GB'),player(2,'DC',{unavailable:'injured'}),player(3,'BU',{unavailable:'suspended',match_suspension:2})],
  default:{formation:'4-4-2 plat',titulaires:[[1,'GB'],[2,'DG']],banc:[3]},suggestions:{}};
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{
  const html=await compositionContent(new URLSearchParams(),{awaiting_lineup:5});
  assert.doesNotMatch(html,/composition légale/);
  assert.match(html,/data-tactic="4-4-2 plat" aria-pressed="true"/);
  assert.match(html,/class="pitch-player lineup-slot def invalid" data-slot="1" data-player="2"/);
  assert.match(html,/lineup-icon injury/);assert.match(html,/lineup-icon suspension" title="Suspendu \(2 matchs\)"/);
  assert.match(html,/Joueur 2 est blessé/);
  for(const label of ['COMPO','POSTE','JOUEUR','NIV.','POT.','FATIGUE','MJ','BUTS','PD','NOTE'])assert.ok(html.includes(`>${label}`),label);
 }finally{globalThis.fetch=previous;}
});

test('without a match to play today, the editor prepares the next one, or none between seasons',async()=>{
 const data=(match_id)=>({match_id,home:true,opponent:null,bench_size:1,formations:{'4-3-3':F433},
  players:[{id:1,name:'Joueur 1',position:'GB',rating:100,potential:120,fitness:1,appearances:0,goals:0,assists:0,average:null,unavailable:null}],
  default:{formation:'4-3-3',titulaires:[[1,'GB']],banc:[]},suggestions:{}});
 const previous=globalThis.fetch,urls=[];
 try{
  for(const id of [8,null]){
   globalThis.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>data(id)};};
   const html=await compositionContent(new URLSearchParams(),{awaiting_lineup:null});
   assert.match(html,new RegExp(`id="lineup-form" data-match="${id??0}"`));
   assert.match(html,/data-slot="0" data-player="1"/);
  }
  assert.ok(urls.every(url=>!url.includes('match_id')),urls.join());
 }finally{globalThis.fetch=previous;}
});

test('the next free place follows the order of positions, substitutes last',()=>{
 assert.deepEqual(nextFree({slots:[1,null,2,null,null,3,4,5,null,6,7],bench:[null]},F433),{kind:'slot',index:1});
 assert.deepEqual(nextFree({slots:[1,2,3,4,5,6,7,8,null,null,null],bench:[null]},F433),{kind:'slot',index:8});   // AILG, AILD, then BU
 assert.deepEqual(nextFree({slots:[1,2,3,4,5,6,7,8,9,null,10],bench:[null]},F433),{kind:'slot',index:9});
 assert.deepEqual(nextFree({slots:F433.map((_,index)=>index+1),bench:[20,null]},F433),{kind:'bench',index:1});
 assert.equal(nextFree({slots:F433.map((_,index)=>index+1),bench:[20]},F433),null);
});

test('the pitch names a player by surname, particles included',async()=>{
 const {surname}=await import('../../web/ui.js');
 assert.equal(surname('Jeffrey de Lange'),'de Lange');assert.equal(surname('Thomás De Martis'),'De Martis');
 assert.equal(surname('Edwin van der Sar'),'van der Sar');assert.equal(surname('Mason Greenwood'),'Greenwood');assert.equal(surname('Pedri'),'Pedri');
});

test('the pitch shows each starter\'s note at his position beside the shirt, and his affinity on it below 20/20',async()=>{
 const player=(id,position,extra={})=>({id,name:`Joueur ${id}`,position,rating:65,potential:80,fitness:1,appearances:0,goals:0,assists:0,average:null,unavailable:null,...extra});
 const data={match_id:12,home:true,opponent:null,bench_size:1,formations:{'4-3-3':F433},composites_by_position:{GB:['arret','sortie'],MDC:['progression_defense','progression_attaque']},
  players:[player(1,'GB',{position_notes:{GB:70.5},position_affinities:{GB:20}}),player(2,'MOC',{position_notes:{MDC:36.6},position_affinities:{MDC:1}})],
  default:{formation:'4-3-3',titulaires:[[1,'GB'],[null,'DG'],[null,'DC'],[null,'DC'],[null,'DD'],[2,'MDC']],banc:[]},suggestions:{}};
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{
  const html=await compositionContent(new URLSearchParams(),{awaiting_lineup:null});
  assert.match(html,/data-slot="0" data-player="1"[^>]*><span class="shirt">GB<\/span><span class="position-note"><span class="rating graded" style="--hue:\d+" title="Note au poste GB : Arrêts, Sorties aériennes, affinité au poste comprise">141</);
  assert.match(html,/data-slot="5" data-player="2"[^>]*><span class="shirt">MDC<i class="affinity-tag" style="--hue:0" title="Affinité MDC : 1 \/ 20">1<\/i><\/span><span class="position-note"><span[^>]*>73</);
  // The list switches between its infos and the composites, beside the suggestion.
  assert.match(html,/<button type="button" data-lineup-view="infos" aria-pressed="true" class="active">Infos<\/button><button type="button" data-lineup-view="jeu" aria-pressed="false" class="">Jeu<\/button><\/div><button type="button" data-lineup-suggest>/);
 }finally{globalThis.fetch=previous;}
});

test('a position picked on the pitch puts everyone\'s note there right after COMPO; the game view lists the composites',async()=>{
 const {lineupColumns}=await import('../../web/composition.js');
 assert.deepEqual(lineupColumns('infos',null).map(([key])=>key),['selected','position','name','rating','potential','fatigue','appearances','goals','assists','average']);
 assert.deepEqual(lineupColumns('jeu','MDC').map(([key,label])=>key==='fit'?label:key),
  ['selected','EN MDC','position','name','rating','progression_attaque','occasion_attaque','tir','tete','progression_defense','occasion_defense','arret','sortie']);
 assert.deepEqual(lineupColumns('jeu',null).filter(([,,opens])=>opens).map(([key])=>key),['progression_attaque','progression_defense','arret']);
});
