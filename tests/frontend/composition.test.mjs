import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pitchLayout,place,remove,dropOnSquad,nextFree,changeFormation,lineupProblems,compositionContent,autoHtml} from '../../web/composition.js';

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
  assert.match(html,/<summary[^>]*>4-4-2 plat<svg/);
  assert.match(html,/role="menuitemradio" aria-checked="true" data-tactic="4-4-2 plat"/);
  assert.match(html,/class="pitch-player lineup-slot def invalid" data-slot="1" data-player="2"/);
  assert.match(html,/lineup-icon injury/);assert.match(html,/lineup-icon suspension" title="Suspendu \(2 matchs\)"/);
  assert.match(html,/Joueur 2 est blessé/);
  for(const label of ['COMPO','POSTE','JOUEUR','NIV.','POT.','ÉTAT','MJ','BUTS','PD','NOTE'])assert.ok(html.includes(`>${label}`),label);
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

test('under each starter\'s shirt, his block: his name, then his note at his position in its colour and his affinity below 20/20',async()=>{
 const player=(id,position,extra={})=>({id,name:`Joueur ${id}`,position,rating:65,potential:80,fitness:1,appearances:0,goals:0,assists:0,average:null,unavailable:null,...extra});
 const data={match_id:12,home:true,opponent:null,bench_size:1,formations:{'4-3-3':F433},composites_by_position:{GB:['arret','sortie'],MDC:['progression_defense','progression_attaque']},
  players:[player(1,'GB',{position_notes:{GB:70.5},position_affinities:{GB:20}}),player(2,'MOC',{position_notes:{MDC:36.6},position_affinities:{MDC:1}})],
  default:{formation:'4-3-3',titulaires:[[1,'GB'],[null,'DG'],[null,'DC'],[null,'DC'],[null,'DD'],[2,'MDC']],banc:[]},suggestions:{}};
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{
  const html=await compositionContent(new URLSearchParams(),{awaiting_lineup:null});
  assert.match(html,/data-slot="0" data-player="1"[^>]*><span class="kit-shirt plain"><svg[^]*?<\/svg><b>GB<\/b><\/span><span class="player-block"><span class="block-name">[^<]+<\/span><span><span class="stars" role="img" aria-label="3½ étoiles">(<i[^>]*><\/i>){5}<\/span><\/span><\/span>/);
  assert.match(html,/data-slot="5" data-player="2"[^>]*><span class="kit-shirt plain"><svg[^]*?<\/svg><b>MDC<\/b><\/span><span class="player-block"><span class="block-name">[^<]+<\/span><span><span class="stars" role="img" aria-label="½ étoile">(<i[^>]*><\/i>){5}<\/span><i class="fit" style="--hue:4;--p:5" role="img" aria-label="Maladroit" title="Affinité MDC : maladroit"><\/i><\/span><\/span>/);
  assert.doesNotMatch(html,/sur 200|block-note/);
  // An empty place keeps the two lines of a block, without a ground; nothing stands beside a shirt.
  assert.match(html,/data-slot="1"[^>]*><span class="kit-shirt empty">[^]*?<\/span><span class="player-block"><span class="block-name">—<\/span><span><\/span><\/span>/);
  assert.doesNotMatch(html,/position-note|<small>/);
  // The list switches between its infos and the composites, beside the suggestion, over the list.
  assert.match(html,/<div class="lineup-list"><div class="lineup-toolbar"><div class="auto-group">[^]*?<\/div><span class="toolbar-rule"><\/span><div class="segmented" role="group" aria-label="Colonnes"><button type="button" data-lineup-view="infos" aria-pressed="true" class="active">Infos<\/button><button type="button" data-lineup-view="jeu" aria-pressed="false" class="">Jeu<\/button><\/div><\/div><div class="lineup-squad"/);
 }finally{globalThis.fetch=previous;}
});

test('a position picked on the pitch puts everyone\'s note there right after COMPO; the game view lists the composites',async()=>{
 const {lineupColumns}=await import('../../web/composition.js');
 assert.deepEqual(lineupColumns('infos',null).map(([key])=>key),['selected','position','name','rating','potential','fatigue','recent','form','appearances','goals','assists','average']);
 assert.deepEqual(lineupColumns('jeu','MDC').map(([key,label])=>key==='fit'?label:key),
  ['selected','EN MDC','position','name','rating','progression_attaque','occasion_attaque','tir','tete','progression_defense','occasion_defense','arret','sortie']);
 assert.deepEqual(lineupColumns('jeu',null).filter(([,,opens])=>opens).map(([key])=>key),['progression_attaque','progression_defense','arret']);
});

test('the last five matches draw a bar to the minutes, the cross or the card, and turn yellow beyond the load threshold',async()=>{
 const {recentStrip}=await import('../../web/composition.js');
 const match=(date,name,code,home,score)=>({date,home,score,opponent:{id:1,name},competition:{kind:code==='C1'?'europe':'league',code,nation:'FRA',level:1}});
 const matches=[match('2033-05-04','Real Madrid','C1',true,[3,1]),match('2033-05-08','Auxerre','L1',true,[3,1]),match('2033-05-11','Real Madrid','C1',false,[1,3])];
 const player={load:3.84,recent:[{status:'starter',minutes:90},{status:'sub',minutes:27},{status:'injured',minutes:0}]};
 const html=recentStrip(player,matches,3.5);
 // Two empty places before the club's first match of the five, then a full bar, a third of one and the cross.
 assert.match(html,/^<span class="recent loaded" title="[^"]+"><i class="none"><\/i><i class="none"><\/i><i><u style="height:100%"><\/u><\/i><i><u style="height:30%"><\/u><\/i><i class="injured"><span class="match-mark injury"><\/span><\/i><\/span>$/);
 assert.match(html,/title="Charge 3\.8, au-delà de 3\.5 : il récupère moins vite\n[^\n]+Real Madrid \(C1, dom\.\) 3–1 · titulaire, 90 min\n[^\n]+Auxerre \(L1, dom\.\) 3–1 · entré, 27 min\n[^\n]+Real Madrid \(C1, ext\.\) 1–3 · blessé"/);
 // Below the threshold the bars keep their ink; a player left out has a dash, one suspended the red card.
 const calm=recentStrip({load:2.1,recent:[{status:'out',minutes:0},{status:'suspended',minutes:0},{status:'unused',minutes:0},{status:'starter',minutes:90},{status:'starter',minutes:61}]},[],3.5);
 assert.match(calm,/^<span class="recent" title="Charge 2\.1"><i class="out"><\/i><i class="suspended"><span class="match-mark booking red"><\/span><\/i><i><u style="height:0%"><\/u><\/i>/);
});

test('every tactic sits on the grid of the pitch: five columns a line, full-backs and wingers on the outer ones',async()=>{
 const {gridPlaces,cellRole}=await import('../../web/composition.js');
 const cells=places=>places.map(item=>`${item.role}@${item.line}${item.column}`).join(' ');
 assert.equal(cells(gridPlaces(F433)),'GB@gk2 DG@def0 DC@def1 DC@def3 DD@def4 MDC@dm2 MC@cm1 MC@cm3 AILG@att0 BU@att2 AILD@att4');
 assert.equal(cells(gridPlaces(F442)),'GB@gk2 DG@def0 DC@def1 DC@def3 DD@def4 AILG@cm0 MC@cm1 MC@cm3 AILD@cm4 BU@att1 BU@att3');
 assert.equal(cells(gridPlaces(['GB','DG','DC','DC','DC','DD','MDC','MC','MC','BU','BU'])).split(' ').slice(1,6).join(' '),'DG@def0 DC@def1 DC@def2 DC@def3 DD@def4');
 assert.deepEqual(['def','dm','cm','am','att'].map(key=>[0,2,4].map(column=>cellRole(key,column)).join()),
  ['DG,DC,DD','DG,MDC,DD','AILG,MC,AILD','AILG,MOC,AILD','AILG,BU,AILD']);
 assert.equal(cellRole('gk',2),'GB');
});

test('a place moved onto a free cell takes its position with its player, the places following the pitch from the goal',async()=>{
 const {gridPlaces,movePlace}=await import('../../web/composition.js');
 const {places,order}=movePlace(gridPlaces(F433),9,'am',2);
 assert.deepEqual(places[8],{role:'MOC',line:'am',column:2});
 assert.deepEqual(order,[0,1,2,3,4,5,6,7,9,8,10]);
 assert.deepEqual(places.map(item=>item.role),['GB','DG','DC','DC','DD','MDC','MC','MC','MOC','AILG','AILD']);
 // Pushed up the wing, a full-back stays a full-back; further up, he becomes a winger.
 assert.equal(movePlace(gridPlaces(F433),1,'dm',0).places[4].role,'DG');
 assert.equal(movePlace(gridPlaces(F433),1,'cm',0).places.find(item=>item.line==='cm'&&item.column===0).role,'AILG');
});

test('the editor offers the club\'s own tactic beside the others, on its cells, the free ones ready for a dragged place',async()=>{
 const player=(id,position)=>({id,name:`Joueur ${id}`,position,rating:100,potential:120,fitness:1,appearances:0,goals:0,assists:0,average:null,unavailable:null});
 const custom=[['GB','gk',2],['DG','def',0],['DC','def',1],['DC','def',3],['DD','def',4],['MDC','dm',2],['MC','cm',1],['MC','cm',3],['MOC','am',2],['AILG','att',0],['AILD','att',4]];
 const data={match_id:21,home:true,opponent:null,bench_size:1,formations:{'4-3-3':F433},custom,
  players:[player(1,'GB'),player(2,'MOC')],default:{formation:'Perso',titulaires:[[1,'GB'],[null,'DG'],[null,'DC'],[null,'DC'],[null,'DD'],[null,'MDC'],[null,'MC'],[null,'MC'],[2,'MOC']],banc:[]},suggestions:{}};
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{
  const html=await compositionContent(new URLSearchParams(),{awaiting_lineup:null});
  // The club's own tactic closes the list of the formations, after a line.
  assert.match(html,/aria-checked="false" data-tactic="4-3-3">4-3-3<\/button><hr><button type="button" role="menuitemradio" aria-checked="true" data-tactic="Perso">Perso</);
  assert.match(html,/<button type="button" aria-label="Formation précédente" data-tactic="4-3-3">[^]*?<button type="button" aria-label="Formation suivante" disabled>/);
  assert.match(html,/data-slot="8" data-player="2" draggable="true" style="left:50%;top:31%"[^>]*><span class="kit-shirt plain"><svg[^]*?<\/svg><b>MOC</);
  // Empty places move too; the keeper's cell and the taken ones are not offered.
  assert.match(html,/class="pitch-player lineup-slot mid empty" data-slot="6" draggable="true" style="left:32%;top:46%"/);
  assert.equal((html.match(/data-cell=/g)||[]).length,25-10);
  assert.match(html,/data-cell="att:2" style="left:50%;top:14%"><span>BU<\/span>/);
  assert.doesNotMatch(html,/data-cell="am:2"|data-cell="gk/);
 }finally{globalThis.fetch=previous;}
});

test('the lineup shows form: an arrow after the note in the block from ±5 %, the same beside the note of the picked position, and a FORME column',async()=>{
 const player=(id,position,form,extra={})=>({id,name:`Joueur ${id}`,position,form,rating:65,potential:80,fitness:1,appearances:0,goals:0,assists:0,average:null,unavailable:null,
  position_notes:{[position]:60},position_affinities:{[position]:20},...extra});
 const data={match_id:13,home:true,opponent:null,bench_size:1,formations:{'4-4-2 plat':F442},composites_by_position:{DG:['progression_defense'],DC:['occasion_defense']},
  players:[player(1,'DG',1.111),player(2,'DC',.946),player(3,'DC',1.03)],
  default:{formation:'4-4-2 plat',titulaires:[[null,'GB'],[1,'DG'],[2,'DC'],[3,'DC']],banc:[]},suggestions:{}};
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{
  const html=await compositionContent(new URLSearchParams(),{awaiting_lineup:null});
  // Whatever its neighbours, a note stays under its shirt, the arrow after it.
  const block=id=>html.match(new RegExp(`data-player="${id}"[^>]*><span class="kit-shirt plain"><svg[^]*?</svg><b>D[GC]</b></span><span class="player-block"><span class="block-name">[^<]+</span><span>(.*?)</span></span></div>`))[1];
  const note='<span class="stars" role="img" aria-label="2½ étoiles">(<i[^>]*><\\/i>){5}<\\/span>';
  assert.match(block(1),new RegExp(`^${note}<i class="form-arrow up" title="Forme \\+11 %"><\\/i>$`));
  assert.match(block(2),new RegExp(`^${note}<i class="form-arrow down" title="Forme −5 %"><\\/i>$`));
  assert.match(block(3),new RegExp(`^${note}$`));
  assert.match(html,/data-lineup-sort="form">FORME</);
  // The column of the form, its arrow at one of five orientations.
  assert.match(html,/<td><span class="arrow a2" role="img" aria-label="Forme excellente" title="Forme excellente">/);
 }finally{globalThis.fetch=previous;}
});

test('the tactics stand over the pitch and the substitutes on one line; starters wear the club kit, sleeves in its second colour',async()=>{
 const player=(id,position,extra={})=>({id,name:`Joueur ${id}`,position,rating:65,potential:80,fitness:1,appearances:0,goals:0,assists:0,average:null,unavailable:null,...extra});
 const data={match_id:14,home:true,opponent:null,bench_size:9,formations:{'4-3-3':F433,'4-4-2 plat':F442},club:{id:7,name:'Lens',major_color:'#F8D000',minor_color:'#E00000'},
  players:[player(1,'GB'),player(2,'DC')],default:{formation:'4-3-3',titulaires:[[1,'GB']],banc:[2]},suggestions:{}};
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{
  const html=await compositionContent(new URLSearchParams(),{awaiting_lineup:null});
  assert.match(html,/<div class="lineup-field"><div class="field-head"><div class="season" role="group" aria-label="Formation"><button type="button" aria-label="Formation précédente" disabled>[^]*?data-tactic="4-4-2 plat"><svg[^]*?<\/div><\/div><div class="pitch lineup-pitch"/);
  assert.match(html,/<div class="lineup-bench" style="--bench:9">/);
  assert.equal((html.match(/class="bench-slot/g)||[]).length,9);
  // The keeper wears the kit with his position on it; an empty place keeps the outline of a shirt.
  assert.match(html,/data-slot="0" data-player="1"[^>]*><span class="kit-shirt" style="--kit-body:#F8D000;--kit-sleeves:#E00000;--kit-ink:#1c2b22"><svg class="kit-drawing"[^]*?<\/svg><b>GB<\/b><\/span>/);
  assert.match(html,/data-slot="1"[^>]*><span class="kit-shirt empty"><svg[^]*?<\/svg><b>DG<\/b><\/span>/);
  // Without a match there is no opponent to show.
  assert.doesNotMatch(html,/scout-card|with-scout/);
 }finally{globalThis.fetch=previous;}
});

test('beside the list, the opponent: its standing and form, its tactic, its record where it plays, its best players, those out and the last meeting',async()=>{
 const {scoutingHtml}=await import('../../web/composition.js');
 const club={id:9,name:'Lorient <FC>',major_color:'#F84000',minor_color:'#080808',formation:'3-5-2'};
 const scout={match:{id:50,date:'2031-01-18',round_label:'Journée 19',competition:'Ligue 1'},home:true,club,standing:{rank:14,points:19,form:'NDDVN'},
  record:{venue:'away',won:1,drawn:3,lost:5},key_players:[{id:61,name:'Bamba Dieng',position:'BU',rating:70.5,injured_until:null,suspension:0}],
  absent:[{id:62,name:'Théo Le Bris',position:'MC',rating:66,injured_until:'2031-02-01',suspension:0},{id:63,name:'Igor Silva',position:'DC',rating:64,injured_until:null,suspension:1}],
  last_meeting:{id:40,round_label:'Journée 2',home:{id:9,name:'Lorient'},away:{id:7,name:'Lens'},score:[1,1],outcome:'N'}};
 const html=scoutingHtml(scout);
 assert.match(html,/<aside class="card scout-card" aria-label="Adversaire"><div class="card-head"><h2>Adversaire<\/h2>/);
 assert.match(html,/Lorient &lt;FC&gt;/);assert.doesNotMatch(html,/<FC>/);
 assert.match(html,/Journée 19 · 18 janv\. · Domicile/);
 assert.match(html,/14e · 19 pts <span class="form"><i class="N">N<\/i>/);
 assert.match(html,/<span>Tactique<\/span><strong>3-5-2<\/strong>/);
 assert.match(html,/<span>À l’extérieur<\/span><strong>1 V · 3 N · 5 D<\/strong>/);
 assert.match(html,/<h3>Joueurs clés<\/h3>.*Bamba Dieng/);
 assert.match(html,/✚ 1 févr\.<\/span><a href="#\/player\/62">Théo Le Bris/);assert.match(html,/1 match<\/span><a href="#\/player\/63">Igor Silva/);
 assert.match(html,/href="#\/match\/40"><span>Journée 2 · Lorient – Lens<\/span><span class="club-match-score N"/);
 assert.equal(scoutingHtml(null),'');
 const quiet=scoutingHtml({...scout,standing:null,absent:[],key_players:[],last_meeting:null,home:false,record:{venue:'home',won:0,drawn:0,lost:0}});
 assert.match(quiet,/Extérieur/);assert.match(quiet,/À domicile/);assert.doesNotMatch(quiet,/Absents|Joueurs clés|scout-meeting|pts/);
});

test('the automatic lineup offers its four levels and its two options, the level on screen marked',()=>{
 const html=autoHtml(1,{young:true,free:false});
 assert.deepEqual([...html.matchAll(/data-lineup-auto="(\d)"[^>]*>([^<]+)</g)].map(match=>[match[1],match[2]]),[['0','Meilleure'],['1','Légère'],['2','Forte'],['3','Complète']]);
 assert.match(html,/data-lineup-auto="1" title="Légère rotation : [^"]+" aria-pressed="true" class="active">/);
 assert.match(html,/data-lineup-auto="0" title="La meilleure équipe pour ce match" aria-pressed="false" class="">/);
 assert.match(html,/class="check-option" data-lineup-option="young" aria-pressed="true" title="[^"]+"><span class="check">[^]*?<\/span>Jeunes<\/button>/);
 assert.match(html,/data-lineup-option="free" aria-pressed="false"[^>]*>[^]*?Formation<\/button>/);
 assert.doesNotMatch(autoHtml(null,{}),/aria-pressed="true"/);
});
