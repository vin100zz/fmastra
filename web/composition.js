import {api,query,toast,escape as e,position,group,levelBadge,number,surname,appearances,positionNote,affinityTag,compositeCell,compositeHeader,formBadge,formArrow,COMPOSITE_SECTIONS,KIT_SVG,kitStyle,clubLink,form,date,safeColor} from './ui.js';
import {outcomeLabels,shortDate} from './club-overview.js';

// The lineup being edited survives the re-renders of the page (auto refresh, busy buttons) until the match is played.
let editor=null;
// The columns of the squad list, 'infos' or 'jeu' (the composites): kept from one match to the next.
let squadView='infos';

const POSITION_ORDER=['GB','DG','DC','DD','MDC','MC','AILG','AILD','MOC','BU'];
const LINE_Y={gk:90,def:73,dm:60,cm:47,am:33,att:15};
const LATERAL={DG:0,AILG:0,DD:2,AILD:2};
// Each position sits on a line of the pitch; wingers join the forwards, the attacking midfielder or the midfield,
// depending on what the rest of the formation leaves in front of them. Without a central midfield to join, they stand
// in front of the holding midfielders.
function line(role,roles){
 if(role==='GB')return 'gk';
 if(['DG','DC','DD'].includes(role))return 'def';
 if(role==='MDC')return 'dm';
 if(role==='MC')return 'cm';
 if(role==='MOC')return 'am';
 if(role==='BU')return 'att';
 const count=value=>roles.filter(item=>item===value).length;
 if(roles.includes('MOC')||!roles.includes('MC'))return 'am';
 return count('BU')<2&&count('MC')+count('MDC')>=3?'att':'cm';
}
// Pitch coordinates (percentages) of each slot of a formation, attack at the top.
export function pitchLayout(roles){
 const lines={};roles.forEach((role,index)=>(lines[line(role,roles)]??=[]).push(index));
 const places=[];
 Object.entries(lines).forEach(([key,indexes])=>{
  indexes.sort((a,b)=>(LATERAL[roles[a]]??1)-(LATERAL[roles[b]]??1)||a-b);
  const wide=indexes.some(index=>roles[index] in LATERAL),count=indexes.length;
  indexes.forEach((slot,rank)=>{
   const x=count===1?50:wide?14+rank*72/(count-1):50+(rank-(count-1)/2)*Math.min(26,72/(count-1));
   places[slot]={x,y:LINE_Y[key]};
  });
 });
 return places;
}

// The club's own tactic is built on a grid of the Composition pitch: five columns on each line from the goal forward.
export const CUSTOM='Perso';
const LINES=['gk','def','dm','cm','am','att'];
const COLUMN_X=[14,32,50,68,86];
const LINE_ROLES={def:['DG','DC','DD'],dm:['DG','MDC','DD'],cm:['AILG','MC','AILD'],am:['AILG','MOC','AILD'],att:['AILG','BU','AILD']};
// The position a cell gives its place: the keeper alone in his goal; on the wings, the full-backs up to the holding
// midfield, the wingers beyond.
export const cellRole=(key,column)=>key==='gk'?'GB':LINE_ROLES[key][column===0?0:column===COLUMN_X.length-1?2:1];
// A formation on the grid: each position on its line of `pitchLayout`, in the column nearest its place there.
export function gridPlaces(roles){
 const layout=pitchLayout(roles),lines={};
 roles.forEach((role,index)=>(lines[line(role,roles)]??=[]).push(index));
 const places=[];
 Object.entries(lines).forEach(([key,indexes])=>{
  indexes.sort((a,b)=>layout[a].x-layout[b].x);
  let column=-1;
  indexes.forEach((slot,rank)=>{
   const nearest=Math.round((layout[slot].x-COLUMN_X[0])/(COLUMN_X[1]-COLUMN_X[0]));
   column=Math.min(COLUMN_X.length-indexes.length+rank,Math.max(column+1,nearest));
   places[slot]={role:roles[slot],line:key,column};
  });
 });
 return places;
}
// A place moved onto a free cell takes the cell's position, its player with it. The places then follow the pitch from
// the goal forward, left to right: `order` gives each one's former index.
export function movePlace(places,index,key,column){
 const moved=places.map((item,rank)=>rank===index?{role:cellRole(key,column),line:key,column}:item);
 const order=moved.map((_,rank)=>rank).sort((a,b)=>LINES.indexOf(moved[a].line)-LINES.indexOf(moved[b].line)||moved[a].column-moved[b].column);
 return {places:order.map(rank=>moved[rank]),order};
}
// Every tactic on the grid, the club's own last when it has one.
function tacticsOf(data){
 const tactics=Object.fromEntries(Object.entries(data.formations).map(([name,roles])=>[name,gridPlaces(roles)]));
 if(data.custom)tactics[CUSTOM]=data.custom.map(([role,key,column])=>({role,line:key,column}));
 return tactics;
}

const where=(lineup,id)=>{const slot=lineup.slots.indexOf(id);if(slot>=0)return {kind:'slot',index:slot};const bench=lineup.bench.indexOf(id);return bench>=0?{kind:'bench',index:bench}:null;};
const at=(lineup,target)=>target.kind==='slot'?lineup.slots[target.index]:lineup.bench[target.index];
function put(lineup,target,id){(target.kind==='slot'?lineup.slots:lineup.bench)[target.index]=id;}
// Drops a player on a pitch or bench place: he takes it, and whoever held it takes his former place (none if he came from the squad list).
export function place(lineup,id,target){
 const next={slots:[...lineup.slots],bench:[...lineup.bench]};
 const from=where(next,id),occupant=at(next,target)??null;
 if(from&&from.kind===target.kind&&from.index===target.index)return next;
 if(from)put(next,from,occupant);
 put(next,target,id);
 return next;
}
export function remove(lineup,id){
 const clear=list=>list.map(item=>item===id?null:item);
 return {slots:clear(lineup.slots),bench:clear(lineup.bench)};
}
// Drops a player on a row of the squad list: a selected and an unselected player trade places; otherwise the dropped player leaves the lineup.
export function dropOnSquad(lineup,id,onto){
 const from=where(lineup,id),to=onto==null?null:where(lineup,onto);
 if(from&&onto!=null&&!to)return place(lineup,onto,from);
 if(!from&&to)return place(lineup,id,to);
 return remove(lineup,id);
}
// The first empty place in the order of positions (GB, DG, DC, DD…), substitutes last; null when the lineup is full.
export function nextFree(lineup,roles){
 const slot=lineup.slots.map((id,index)=>({id,index})).filter(item=>item.id==null)
  .sort((a,b)=>POSITION_ORDER.indexOf(roles[a.index])-POSITION_ORDER.indexOf(roles[b.index])||a.index-b.index)[0];
 if(slot)return {kind:'slot',index:slot.index};
 const bench=lineup.bench.indexOf(null);
 return bench>=0?{kind:'bench',index:bench}:null;
}
// Switching tactics keeps each starter: first on a slot of the same position, then on the same line, then anywhere left.
export function changeFormation(slots,fromRoles,toRoles){
 const starters=slots.map((id,index)=>({id,role:fromRoles[index]})).filter(item=>item.id!=null);
 const result=toRoles.map(()=>null);
 const passes=[(a,b)=>a===b,(a,b)=>group(a)===group(b),()=>true];
 for(const same of passes)toRoles.forEach((role,index)=>{
  if(result[index]!=null)return;
  const found=starters.findIndex(item=>same(item.role,role));
  if(found>=0)result[index]=starters.splice(found,1)[0].id;
 });
 return result;
}
// What keeps the lineup from being played: empty positions, injured or suspended players.
export function lineupProblems(lineup,roles,players){
 const byId=new Map(players.map(player=>[player.id,player]));
 const available=players.filter(player=>!player.unavailable).length;
 const problems=[];
 const empties=lineup.slots.map((id,index)=>id==null?roles[index]:null).filter(Boolean);
 if(lineup.slots.length-empties.length<Math.min(roles.length,available))problems.push(`Poste${empties.length>1?'s':''} inoccupé${empties.length>1?'s':''} : ${empties.join(', ')}`);
 [...lineup.slots,...lineup.bench].forEach(id=>{
  const player=byId.get(id);
  if(player?.unavailable==='injured')problems.push(`${player.name} est blessé`);
  else if(player?.unavailable==='suspended')problems.push(`${player.name} est suspendu`);
 });
 return problems;
}

const mounted=()=>editor&&typeof document!=='undefined'&&document.querySelector(`#lineup-form[data-match="${editor.matchId}"]`)?editor:null;
const shape=()=>editor.tactics[editor.formation];
const roles=()=>shape().map(item=>item.role);
// Problems of the lineup shown on screen; an empty list when it can be played (or when no lineup is being edited).
export function compositionIssues(){const current=mounted();return current?lineupProblems(current,roles(),current.data.players):[];}
// The payload of /partie/composition, or null when the lineup on screen cannot be played.
export function lineupSubmission(){
 const current=mounted();
 if(!current||compositionIssues().length)return null;
 return {match_id:current.matchId,formation:current.formation,
  titulaires:current.slots.map((id,index)=>[id,roles()[index]]).filter(([id])=>id!=null),banc:current.bench.filter(id=>id!=null),
  perso:current.tactics[CUSTOM]?.map(item=>[item.role,item.line,item.column])??null};
}

const unavailableIcon=player=>player.unavailable==='injured'?'<span class="lineup-icon injury" title="Blessé" aria-label="Blessé">✚</span>'
 :player.unavailable==='suspended'?`<span class="lineup-icon suspension" title="Suspendu${player.match_suspension?` (${player.match_suspension} match${player.match_suspension>1?'s':''})`:''}" aria-label="Suspendu"></span>`:'';
const fatigue=player=>Math.round((1-player.fitness)*100);
// The position of the pitch picked to compare the squad on it, or null.
const pickedRole=()=>editor.picked==null?null:roles()[editor.picked]??null;
const wantedAt=role=>editor.data.composites_by_position?.[role]||[];
// A player's note at a position with his form and his affinity to it, as the pitch shows them: on the pitch and in the
// list for the picked position.
const fitAt=(player,role)=>`<span class="fit-cell">${positionNote(player,role,wantedAt(role))}${formArrow(player.form)}${affinityTag(player.position_affinities?.[role],role)}</span>`;
// Where a note stands beside its shirt: on the right, unless a place of the next column on the same line (or the pitch's
// edge) takes the room; then on the left, or under the name when both sides are taken.
export function noteSide(cells,cell){
 const taken=column=>column<0||column>=COLUMN_X.length||cells.some(item=>item.line===cell.line&&item.column===column);
 return !taken(cell.column+1)?'':!taken(cell.column-1)?'left':'below';
}

function slotHtml(id,role,cell,index,byId){
 const player=byId.get(id);
 const classes=`pitch-player lineup-slot ${group(role)}${player?'':' empty'}${player?.unavailable?' invalid':''}${index===editor.picked?' picked':''}`;
 const title=player?`${player.name} · ${player.position} · niveau ${number(player.rating)}${player.unavailable?player.unavailable==='injured'?' · blessé':' · suspendu':''}`:`${role} inoccupé`;
 const note=player?positionNote(player,role,wantedAt(role)):'',side=noteSide(shape(),cell);
 // A starter wears the club's kit; an empty place keeps the outline of a shirt.
 const kit=player?kitStyle(editor.data.club?.major_color,editor.data.club?.minor_color):'';
 const shirt=kit?`<span class="shirt kit" style="${kit}">${KIT_SVG}<b>${e(role)}</b>`:`<span class="shirt">${e(role)}`;
 return `<div class="${classes}" data-slot="${index}"${player?` data-player="${player.id}"`:''} draggable="true" style="left:${COLUMN_X[cell.column]}%;top:${LINE_Y[cell.line]}%" title="${e(title)}">${shirt}${player?affinityTag(player.position_affinities?.[role],role)+formArrow(player.form):''}</span>${note?`<span class="position-note${side?` ${side}`:''}">${note}</span>`:''}<small>${player?`${unavailableIcon(player)}${e(surname(player.name))}`:'—'}</small></div>`;
}
// The free cells of the grid, shown while a place of the pitch is dragged.
function cellsHtml(){
 const taken=new Set(shape().map(item=>`${item.line}:${item.column}`));
 return LINES.slice(1).flatMap(key=>COLUMN_X.map((x,column)=>taken.has(`${key}:${column}`)?''
  :`<div class="lineup-cell" data-cell="${key}:${column}" style="left:${x}%;top:${LINE_Y[key]}%"><span>${cellRole(key,column)}</span></div>`)).join('');
}
function benchHtml(id,index,byId){
 const player=byId.get(id);
 return `<div class="bench-slot${player?'':' empty'}${player?.unavailable?' invalid':''}" data-bench="${index}"${player?` data-player="${player.id}" draggable="true" title="${e(player.name)}"`:''}>${player?`${position(player.position)}<span>${unavailableIcon(player)}${e(surname(player.name))}</span>`:'<span class="muted">Remplaçant</span>'}</div>`;
}

const INFO_COLUMNS=[['potential','POT.'],['fatigue','FATIGUE'],['form','FORME'],['appearances','MJ'],['goals','BUTS'],['assists','PD'],['average','NOTE']];
// The composites by section, a line opening each section.
const GAME_COLUMNS=COMPOSITE_SECTIONS.flatMap(section=>section.composites.map((key,index)=>[key,compositeHeader(key),index===0]));
// The squad list's columns, [key, header, opens a section]: with a position picked on the pitch (`role`), everyone's note there
// comes right after COMPO.
export const lineupColumns=(view,role)=>[['selected','COMPO'],...(role?[['fit',`EN ${e(role)}`]]:[]),['position','POSTE'],['name','JOUEUR'],['rating','NIV.'],...(view==='jeu'?GAME_COLUMNS:INFO_COLUMNS)];
const columns=()=>lineupColumns(squadView,pickedRole());
// Starters come first in their pitch order, then substitutes, then the rest of the squad by position.
function sortValue(player,key){
 const spot=where(editor,player.id);
 if(key==='selected')return spot?spot.kind==='slot'?spot.index:100+spot.index:1000+POSITION_ORDER.indexOf(player.position)*1000-player.rating;
 if(key==='position')return POSITION_ORDER.indexOf(player.position);
 if(key==='fatigue')return fatigue(player);
 if(key==='name')return player.name;
 if(key==='fit')return player.position_notes?.[pickedRole()]??-1;
 if(key in (player.composites||{}))return player.composites[key];
 return player[key]??-1;
}
function squadHtml(byId){
 const {key,direction}=editor.sort,sign=direction==='asc'?1:-1;
 const role=pickedRole(),wanted=role?wantedAt(role):null,shown=columns();
 const rows=[...byId.values()].sort((a,b)=>{const x=sortValue(a,key),y=sortValue(b,key);return sign*(typeof x==='string'?x.localeCompare(y,'fr'):x-y)||a.id-b.id;});
 // In the game view, the composites the picked position asks for stand out in the header; the others are grey in every row.
 const headClass=([column,,opens])=>[opens?'group-start':'',wanted?.includes(column)?'wanted':''].filter(Boolean).join(' ');
 const head=shown.map(item=>{const [column,label]=item,classes=headClass(item);return `<th${classes?` class="${classes}"`:''}${column===key?` aria-sort="${direction==='asc'?'ascending':'descending'}"`:''}><button type="button" data-lineup-sort="${column}">${label}</button></th>`;}).join('');
 const body=rows.map(player=>{
  const spot=where(editor,player.id);
  const tired=fatigue(player);
  const cells={
   selected:spot?spot.kind==='slot'?position(roles()[spot.index]):'<span class="position bench">REMP</span>':'',
   fit:role?fitAt(player,role):'',position:position(player.position),
   name:`<span class="lineup-name">${unavailableIcon(player)}<a href="#/player/${player.id}" draggable="false">${e(player.name)}</a></span>`,
   rating:levelBadge(player.rating,'Niveau actuel sur 200'),potential:levelBadge(player.potential,'Potentiel sur 200'),
   fatigue:`<span class="fatigue-cell${tired>=30?' danger':''}" title="Condition physique : ${100-tired} %"><span class="fatigue-bar"><i style="width:${Math.min(100,tired)}%"></i></span>${tired} %</span>`,
   form:formBadge(player.form),appearances:appearances(player.appearances,player.substitutes),goals:player.goals,assists:player.assists,average:player.average?number(player.average):'—'};
  const cell=([column,,opens])=>{const classes=[column==='name'?'strong':'',opens?'group-start':''].filter(Boolean).join(' ');
   return `<td${classes?` class="${classes}"`:''}>${column in cells?cells[column]:compositeCell(player,column,wanted||player.key_composites)}</td>`;};
  return `<tr data-player="${player.id}" draggable="true" class="${spot?'chosen':''}${player.unavailable?' invalid':''}${spot?.kind==='slot'&&spot.index===editor.picked?' picked':''}">${shown.map(cell).join('')}</tr>`;
 }).join('');
 return `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// What the club knows of its opponent: its standing and form, the tactic it plays, its record where it plays this match, its best
// players, those who cannot play, and the latest meeting of the two clubs.
export function scoutingHtml(scout){
 if(!scout)return '';
 const {club,match,standing,record}=scout;
 const major=safeColor(club.major_color)||'#8a9193',minor=safeColor(club.minor_color)||major;
 const crest=`<span class="crest mini-crest" style="background:linear-gradient(155deg,${major} 55%,${minor} 55%)"><img class="crest-logo" src="/crests/TCM1_${club.id}.png" alt="" loading="lazy" onerror="this.remove()"></span>`;
 const person=player=>`<li>${position(player.position)}<a href="#/player/${player.id}">${e(player.name)}</a>${levelBadge(player.rating)}</li>`;
 const out=player=>`<li>${player.injured_until?`<span class="status danger" title="Retour le ${e(date(player.injured_until))}">✚ ${e(shortDate(player.injured_until))}</span>`:`<span class="status ban">${player.suspension} match${player.suspension>1?'s':''}</span>`}<a href="#/player/${player.id}">${e(player.name)}</a></li>`;
 const last=scout.last_meeting;
 const meeting=last?`<a class="scout-meeting" href="#/match/${last.id}"><span>${e(last.round_label)} · ${e(last.home.name)} – ${e(last.away.name)}</span><span class="club-match-score ${last.outcome}" title="${outcomeLabels[last.outcome]}">${last.score.join(' – ')}</span></a>`:'';
 return `<aside class="card scout-card" aria-label="Adversaire"><div class="card-head"><h2>Adversaire</h2></div><div class="card-body">`
  +`<div class="scout-club">${crest}<div>${clubLink(club)}<small>${e(match.round_label)} · ${e(shortDate(match.date))} · ${scout.home?'Domicile':'Extérieur'}</small>${standing?`<span class="scout-standing">${standing.rank}${standing.rank===1?'er':'e'} · ${standing.points} pts ${form(standing.form)}</span>`:''}</div></div>`
  +`<div class="scout-facts"><div><span>Tactique</span><strong>${e(club.formation||'—')}</strong></div><div><span>${record.venue==='away'?'À l’extérieur':'À domicile'}</span><strong>${record.won} V · ${record.drawn} N · ${record.lost} D</strong></div></div>`
  +(scout.key_players.length?`<h3>Joueurs clés</h3><ul class="scout-players">${scout.key_players.map(person).join('')}</ul>`:'')
  +(scout.absent.length?`<h3>Absents</h3><ul class="scout-players absent">${scout.absent.map(out).join('')}</ul>`:'')
  +meeting+'</div></aside>';
}

function editorHtml(){
 const byId=new Map(editor.data.players.map(player=>[player.id,player]));
 const current=roles(),cells=shape(),problems=lineupProblems(editor,current,editor.data.players);
 const tactics=Object.keys(editor.tactics).map(name=>`<button type="button" data-tactic="${e(name)}" aria-pressed="${name===editor.formation}" class="${name===editor.formation?'active':''}">${e(name)}</button>`).join('');
 // The first problem is spelled out over the list, the others counted; all of them in the tooltip.
 const status=problems.length?`<span class="lineup-problems" role="status" title="${e(problems.join('\n'))}">${e(problems[0])}${problems.length>1?` <b>+${problems.length-1}</b>`:''}</span>`:'';
 const views=[['infos','Infos'],['jeu','Jeu']].map(([key,label])=>`<button type="button" data-lineup-view="${key}" aria-pressed="${key===squadView}" class="${key===squadView?'active':''}">${label}</button>`).join('');
 const scout=scoutingHtml(editor.data.scouting);
 return `<div class="lineup-layout${scout?' with-scout':''}"><div class="lineup-field"><div class="tactics" role="group" aria-label="Tactique">${tactics}</div><div class="pitch lineup-pitch" aria-label="Terrain · ${e(editor.formation)}">${cellsHtml()}${editor.slots.map((id,index)=>slotHtml(id,current[index],cells[index],index,byId)).join('')}</div>
<h3>Remplaçants</h3><div class="lineup-bench" style="--bench:${editor.bench.length}">${editor.bench.map((id,index)=>benchHtml(id,index,byId)).join('')}</div></div>
<div class="lineup-list"><div class="lineup-toolbar">${status}<button type="button" data-lineup-suggest>Meilleure composition</button><div class="segmented" role="group" aria-label="Colonnes">${views}</div></div><div class="lineup-squad" data-squad-drop>${squadHtml(byId)}</div></div>${scout}</div>`;
}

function refresh(){
 const form=document.querySelector('#lineup-form');if(!form)return;
 const scroll=form.querySelector('.lineup-squad .table-scroll')?.scrollTop;
 form.innerHTML=editorHtml();
 if(scroll)form.querySelector('.lineup-squad .table-scroll').scrollTop=scroll;
 document.dispatchEvent(new CustomEvent('lineup-change'));
}
function update(lineup){editor.slots=lineup.slots;editor.bench=lineup.bench;refresh();}
// A place moved onto a free cell makes the tactic on screen the club's own, in place of the one it had.
function reshape(index,key,column){
 const {places,order}=movePlace(shape(),index,key,column);
 editor.tactics[CUSTOM]=places;editor.formation=CUSTOM;
 editor.slots=order.map(rank=>editor.slots[rank]);
 if(editor.picked!=null)editor.picked=order.indexOf(editor.picked);
 refresh();
}
// Picking a position sorts the squad by its note there; letting it go returns to the lineup's order.
function pick(index){
 editor.picked=index;
 if(index!=null)editor.sort={key:'fit',direction:'desc'};
 else if(editor.sort.key==='fit')editor.sort={key:'selected',direction:'asc'};
 refresh();
}
const benchOf=(ids,size)=>Array.from({length:size},(_,index)=>ids[index]??null);
function load(formation,titulaires,banc){
 editor.formation=formation in editor.tactics?formation:Object.keys(editor.tactics)[0];
 const slots=shape().map(()=>null);
 titulaires.forEach(([id],index)=>{if(index<slots.length)slots[index]=id;});
 editor.slots=slots;editor.bench=benchOf(banc,editor.data.bench_size);
}

// The lineup editor of the controlled club, shown in its club page's Composition tab. Without a match to play today,
// it prepares the next one (or none, between seasons): the choices are kept for its day, when they can be played.
export async function compositionContent(params, state) {
 const requested=params.get('match')||state.awaiting_lineup;
 const data=await api(`/ma-partie/composition${requested?`?match_id=${requested}`:''}`);
 const matchId=data.match_id??0;
 if(editor?.matchId!==matchId){
  editor={matchId,data,tactics:tacticsOf(data),sort:{key:'selected',direction:'asc'},picked:null};
  load(data.default.formation,data.default.titulaires,data.default.banc);
 }else{
  // Fresh squad data (fitness, injuries) under the choices already made; players who left drop out.
  editor.data=data;
  const known=new Set(data.players.map(player=>player.id)),keep=id=>known.has(id)?id:null;
  editor.slots=editor.slots.map(keep);editor.bench=editor.bench.map(keep);
 }
 return `<section class="card composition-card"><div id="lineup-form" data-match="${matchId}">${editorHtml()}</div></section>`;
}

// The AI's choice on the club's own tactic is asked for the positions on screen; a tactic changed meanwhile keeps its lineup.
async function suggestCustom(){
 const current=editor,wanted=roles().join(',');
 try{
  const best=await api(`/ma-partie/composition/suggestion?${query({postes:wanted,match_id:current.data.match_id})}`);
  if(editor!==current||editor.formation!==CUSTOM||roles().join(',')!==wanted)return;
  load(CUSTOM,best.titulaires,best.banc);refresh();
 }catch(error){toast(error.message,true);}
}

function install(){
 // The player dragged, and the place of the pitch he is dragged from (a place may be dragged empty).
 let dragged=null;
 const inside=target=>target.closest?.('#lineup-form');
 const dropTarget=target=>target.closest('[data-slot],[data-cell],[data-bench],[data-squad-drop]');
 // A place of the pitch lands on a free cell (the keeper's excepted) or on another place, whose player it takes
 // when it comes empty; a player also lands on the bench and the squad list.
 const accepts=target=>'cell' in target.dataset?dragged.slot!=null&&roles()[dragged.slot]!=='GB'
  :'slot' in target.dataset?dragged.player!=null||'player' in target.dataset:dragged.player!=null;
 document.addEventListener('dragstart',event=>{
  const source=event.target.closest?.('[draggable="true"]');
  if(!source||!inside(source)||!mounted())return;
  const pitch=source.closest('.lineup-pitch');
  dragged={player:source.dataset.player?Number(source.dataset.player):null,slot:pitch?Number(source.dataset.slot):null};
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',String(dragged.player??''));
  // The ghost is a shirt like the pitch's, not a table row: the player's place in the lineup, or his own position.
  const player=editor.data.players.find(item=>item.id===dragged.player),spot=player?where(editor,player.id):null;
  const role=pitch?roles()[dragged.slot]:spot?.kind==='slot'?roles()[spot.index]:player.position;
  const token=document.createElement('div');
  token.className=`pitch-player lineup-slot drag-token ${group(role)}${player?player.unavailable?' invalid':'':' empty'}`;
  token.innerHTML=`<span class="shirt">${e(role)}</span><small>${player?`${unavailableIcon(player)}${e(surname(player.name))}`:'—'}</small>`;
  document.body.append(token);
  event.dataTransfer.setDragImage(token,token.offsetWidth/2,18);
  setTimeout(()=>token.remove());
  source.classList.add('dragging');
  if(pitch&&role!=='GB')pitch.classList.add('placing');
 });
 document.addEventListener('dragend',event=>{
  dragged=null;event.target.classList?.remove('dragging');
  document.querySelectorAll('#lineup-form .drop-hover').forEach(item=>item.classList.remove('drop-hover'));
  document.querySelectorAll('#lineup-form .placing').forEach(item=>item.classList.remove('placing'));
 });
 document.addEventListener('dragover',event=>{
  if(dragged==null||!inside(event.target))return;
  const target=dropTarget(event.target);if(!target||!accepts(target))return;
  event.preventDefault();event.dataTransfer.dropEffect='move';
  document.querySelectorAll('#lineup-form .drop-hover').forEach(item=>item!==target&&item.classList.remove('drop-hover'));
  target.classList.add('drop-hover');
 });
 document.addEventListener('drop',event=>{
  if(dragged==null||!inside(event.target)||!mounted())return;
  const target=dropTarget(event.target);if(!target||!accepts(target))return;
  event.preventDefault();
  const {player:id,slot}=dragged;dragged=null;
  if('cell' in target.dataset){const [key,column]=target.dataset.cell.split(':');reshape(slot,key,Number(column));}
  // Dropping back on the squad list takes the player out of the lineup, or swaps him with the unselected player of that row (and conversely).
  else if('squadDrop' in target.dataset){const row=event.target.closest('tr[data-player]');update(dropOnSquad(editor,id,row?Number(row.dataset.player):null));}
  else if('slot' in target.dataset&&id==null)update(place(editor,Number(target.dataset.player),{kind:'slot',index:slot}));
  else update(place(editor,id,'slot' in target.dataset?{kind:'slot',index:Number(target.dataset.slot)}:{kind:'bench',index:Number(target.dataset.bench)}));
 });
 document.addEventListener('contextmenu',event=>{
  const item=event.target.closest?.('[data-player]');
  if(!item||!inside(item)||!mounted())return;
  const id=Number(item.dataset.player);
  event.preventDefault();
  // Right click takes a selected player out, and puts an unselected one on the next free place.
  if(where(editor,id))update(remove(editor,id));
  else{const target=nextFree(editor,roles());if(target)update(place(editor,id,target));}
 });
 document.addEventListener('click',event=>{
  // A click on a position of the pitch compares the squad on it; a second click, or another tactic, lets it go.
  const slot=event.target.closest?.('.lineup-pitch [data-slot]');
  if(slot&&inside(slot)&&mounted()){pick(editor.picked===Number(slot.dataset.slot)?null:Number(slot.dataset.slot));return;}
  const button=event.target.closest?.('button');
  if(!button||!inside(button)||!mounted())return;
  if(button.dataset.tactic&&button.dataset.tactic!==editor.formation){
   const next=button.dataset.tactic;
   editor.slots=changeFormation(editor.slots,roles(),editor.tactics[next].map(item=>item.role));
   editor.formation=next;pick(null);
  }
  if(button.dataset.lineupView&&button.dataset.lineupView!==squadView){
   squadView=button.dataset.lineupView;
   if(!columns().some(([column])=>column===editor.sort.key))editor.sort={key:'selected',direction:'asc'};
   refresh();
  }
  if('lineupSuggest' in button.dataset){
   if(editor.formation===CUSTOM)suggestCustom();
   else{const best=editor.data.suggestions[editor.formation];load(editor.formation,best.titulaires,best.banc);refresh();}
  }
  if(button.dataset.lineupSort){
   const key=button.dataset.lineupSort,same=editor.sort.key===key;
   editor.sort={key,direction:same?(editor.sort.direction==='asc'?'desc':'asc'):['selected','position','name'].includes(key)?'asc':'desc'};
   refresh();
  }
 });
}
if(typeof document!=='undefined')install();
