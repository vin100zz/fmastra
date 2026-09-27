import {test} from 'node:test';
import assert from 'node:assert/strict';
import {liveTable,shownHighlights,tacticsDraft,tacticsOrders,tacticsProblems,placeInDraft,benchInDraft,formationInDraft} from '../../web/live.js';

const club=(id,name)=>({id,name});
const row=(id,name,points,goals_for=0,goals_against=0)=>({club:club(id,name),played:5,won:0,drawn:0,lost:0,goals_for,goals_against,points});

test('the live table counts every match of the day at its current score',()=>{
 const rows=[row(1,'Alpha',10,8,4),row(2,'Bravo',9,6,5),row(3,'Charlie',9,7,6),row(4,'Delta',4,2,9)];
 const games=[{home:club(2,'Bravo'),away:club(1,'Alpha'),goals:[2,0]},{home:club(3,'Charlie'),away:club(4,'Delta'),goals:[1,1]}];
 const table=liveTable(rows,games,{win:3,draw:1});
 assert.deepEqual(table.map(item=>item.club.name),['Bravo','Alpha','Charlie','Delta']);
 assert.equal(table[0].points,12);
 assert.equal(table[0].played,6);
 assert.equal(table[2].points,10);
 assert.equal(rows[1].points,9); // the table before the day is left untouched
});

test('equal points are split by goal difference, then by goals scored',()=>{
 const rows=[row(1,'Alpha',10,5,5),row(2,'Bravo',10,9,5),row(3,'Charlie',10,6,2)];
 assert.deepEqual(liveTable(rows,[],{win:3,draw:1}).map(item=>item.club.name),['Bravo','Charlie','Alpha']);
});

const manager=()=>({mentality:'equilibree',substitutions_left:3,windows_left:1,
 active:[{id:1,position:'GB'},{id:2,position:'DC'},{id:3,position:'MC'},{id:4,position:'BU'}],
 vacancies:[{id:9,position:'DL'}],bench:[{id:20,position:'DL'},{id:21,position:'GB'},{id:22,position:'BU'}]});

test('an untouched draft gives no order',()=>{
 const data=manager();
 assert.deepEqual(tacticsOrders(tacticsDraft(data),data),[]);
});

test('a substitute dropped on a place replaces its occupant there, then everyone is placed',()=>{
 const data=manager();
 const draft=placeInDraft(tacticsDraft(data),data,22,4);
 assert.deepEqual(tacticsOrders(draft,data),[
  {type:'remplacement',sortant:4,entrant:22,poste:'BU'},
  {type:'placement',placement:[[1,'GB'],[2,'DC'],[3,'MC'],[22,'BU']]}]);
});

test('the injured player left unreplaced is the one a newcomer takes over',()=>{
 const data=manager();
 const draft=placeInDraft(tacticsDraft(data),data,20,0);
 assert.equal(tacticsOrders(draft,data)[0].sortant,9);
 assert.deepEqual(placeInDraft(tacticsDraft(data),data,9,1),tacticsDraft(data)); // the injured cannot be moved
});

test('two players of the pitch swap places, and a substitute sent back restores the draft',()=>{
 const data=manager();
 const swapped=placeInDraft(tacticsDraft(data),data,3,4);
 assert.deepEqual(tacticsOrders(swapped,data),[{type:'placement',placement:[[1,'GB'],[2,'DC'],[4,'MC'],[3,'BU']]}]);
 const entered=placeInDraft(tacticsDraft(data),data,22,3);
 assert.deepEqual(benchInDraft(entered,data,22),tacticsDraft(data));
});

test('the draft checks the rules: changes left, windows, a single keeper',()=>{
 const data=manager();
 const keepers=tacticsDraft(data);keepers.slots[2].role='GB';
 assert.deepEqual(tacticsProblems(keepers,data,false),['Un seul gardien sur le terrain']);
 assert.equal(placeInDraft(tacticsDraft(data),data,21,2).slots[2].role,'DC'); // a substitute takes the position of his place
 const closed={...data,windows_left:0};
 const draft=placeInDraft(tacticsDraft(closed),closed,22,4);
 assert.deepEqual(tacticsProblems(draft,closed,false),['Plus de fenêtre de remplacement']);
 assert.deepEqual(tacticsProblems(draft,closed,true),[]);
});

test('another formation keeps the players and changes their places',()=>{
 const data=manager();
 const draft=formationInDraft(tacticsDraft(data),['GB','DL','DC','MC','MC']);
 assert.deepEqual(draft.slots.map(slot=>[slot.id,slot.role]),[[1,'GB'],[9,'DL'],[2,'DC'],[3,'MC'],[4,'MC']]);
});

test('the highlights show a goal once the score counts it, other events once the clock has passed them',()=>{
 const events=[{kind:'goal',team_id:1,second:600,period:1},{kind:'injury',team_id:2,second:700,period:1},{kind:'goal',team_id:2,second:800,period:1},{kind:'shot',team_id:1,second:900,period:1}];
 assert.deepEqual(shownHighlights(events,650,[0,0],1),[]);
 assert.deepEqual(shownHighlights(events,750,[1,0],1).map(event=>event.kind),['goal','injury']);
 assert.equal(shownHighlights(events,950,[1,1],1).length,3);
});
