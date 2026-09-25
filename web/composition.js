import {api,escape as e,card,empty,position,group,levelBadge,number} from './ui.js';

// The lineup being edited survives the re-renders of the page (auto refresh, busy buttons) until the match is played.
let editor=null;

const LINE_Y={gk:90,def:73,dm:60,cm:47,am:33,att:15};
const LATERAL={DL:0,AILG:0,DR:2,AILD:2};
// Each position sits on a line of the pitch; wingers join the forwards, the attacking midfielder or the midfield,
// depending on what the rest of the formation leaves in front of them.
function line(role,roles){
 if(role==='GB')return 'gk';
 if(['DL','DC','DR'].includes(role))return 'def';
 if(role==='MDC')return 'dm';
 if(role==='MC')return 'cm';
 if(role==='MOC')return 'am';
 if(role==='BU')return 'att';
 const count=value=>roles.filter(item=>item===value).length;
 if(roles.includes('MOC'))return 'am';
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
const roles=()=>editor.data.formations[editor.formation];
// Problems of the lineup shown on screen; an empty list when it can be played (or when no lineup is being edited).
export function compositionIssues(){const current=mounted();return current?lineupProblems(current,roles(),current.data.players):[];}
// The payload of /partie/composition, or null when the lineup on screen cannot be played.
export function lineupSubmission(){
 const current=mounted();
 if(!current||compositionIssues().length)return null;
 return {match_id:current.matchId,formation:current.formation,
  titulaires:current.slots.map((id,index)=>[id,roles()[index]]).filter(([id])=>id!=null),banc:current.bench.filter(id=>id!=null)};
}

const unavailableIcon=player=>player.unavailable==='injured'?'<span class="lineup-icon injury" title="Blessé" aria-label="Blessé">✚</span>'
 :player.unavailable==='suspended'?`<span class="lineup-icon suspension" title="Suspendu${player.match_suspension?` (${player.match_suspension} match${player.match_suspension>1?'s':''})`:''}" aria-label="Suspendu"></span>`:'';
const surname=name=>name.split(/\s+/).at(-1);
const fatigue=player=>Math.round((1-player.fitness)*100);

function slotHtml(id,role,place,index,byId){
 const player=byId.get(id);
 const classes=`pitch-player lineup-slot ${group(role)}${player?'':' empty'}${player?.unavailable?' invalid':''}`;
 const title=player?`${player.name} · ${player.position} · niveau ${number(player.rating)}${player.unavailable?player.unavailable==='injured'?' · blessé':' · suspendu':''}`:`${role} inoccupé`;
 return `<div class="${classes}" data-slot="${index}"${player?` data-player="${player.id}" draggable="true"`:''} style="left:${place.x}%;top:${place.y}%" title="${e(title)}"><span class="shirt">${e(role)}</span><small>${player?`${unavailableIcon(player)}${e(surname(player.name))}`:'—'}</small></div>`;
}
function benchHtml(id,index,byId){
 const player=byId.get(id);
 return `<div class="bench-slot${player?'':' empty'}${player?.unavailable?' invalid':''}" data-bench="${index}"${player?` data-player="${player.id}" draggable="true" title="${e(player.name)}"`:''}>${player?`${position(player.position)}<span>${unavailableIcon(player)}${e(surname(player.name))}</span>`:'<span class="muted">Remplaçant</span>'}</div>`;
}

const POSITION_ORDER=['GB','DL','DC','DR','MDC','MC','AILG','AILD','MOC','BU'];
const COLUMNS=[['selected','COMPO'],['position','POSTE'],['name','JOUEUR'],['rating','NIV.'],['potential','POT.'],['fatigue','FATIGUE'],['appearances','MJ'],['goals','BUTS'],['assists','PD'],['average','NOTE']];
// Starters come first in their pitch order, then substitutes, then the rest of the squad by position.
function sortValue(player,key){
 const spot=where(editor,player.id);
 if(key==='selected')return spot?spot.kind==='slot'?spot.index:100+spot.index:1000+POSITION_ORDER.indexOf(player.position)*1000-player.rating;
 if(key==='position')return POSITION_ORDER.indexOf(player.position);
 if(key==='fatigue')return fatigue(player);
 if(key==='name')return player.name;
 return player[key]??-1;
}
function squadHtml(byId){
 const {key,direction}=editor.sort,sign=direction==='asc'?1:-1;
 const rows=[...byId.values()].sort((a,b)=>{const x=sortValue(a,key),y=sortValue(b,key);return sign*(typeof x==='string'?x.localeCompare(y,'fr'):x-y)||a.id-b.id;});
 const head=COLUMNS.map(([column,label])=>`<th${column===key?` aria-sort="${direction==='asc'?'ascending':'descending'}"`:''}><button type="button" data-lineup-sort="${column}">${label}</button></th>`).join('');
 const body=rows.map(player=>{
  const spot=where(editor,player.id);
  const selected=spot?spot.kind==='slot'?position(roles()[spot.index]):'<span class="position bench">REMP</span>':'';
  const tired=fatigue(player);
  return `<tr data-player="${player.id}" draggable="true" class="${spot?'chosen':''}${player.unavailable?' invalid':''}"><td>${selected}</td><td>${position(player.position)}</td><td class="strong"><span class="lineup-name">${unavailableIcon(player)}<a href="#/player/${player.id}" draggable="false">${e(player.name)}</a></span></td><td>${levelBadge(player.rating,'Niveau actuel sur 200')}</td><td>${levelBadge(player.potential,'Potentiel sur 200')}</td><td><span class="${tired>=30?'danger':''}" title="Condition physique : ${100-tired} %">${tired} %</span></td><td>${player.appearances}</td><td>${player.goals}</td><td>${player.assists}</td><td>${player.average?number(player.average):'—'}</td></tr>`;
 }).join('');
 return `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function editorHtml(){
 const byId=new Map(editor.data.players.map(player=>[player.id,player]));
 const current=roles(),layout=pitchLayout(current),problems=lineupProblems(editor,current,editor.data.players);
 const tactics=Object.keys(editor.data.formations).map(name=>`<button type="button" data-tactic="${e(name)}" aria-pressed="${name===editor.formation}" class="${name===editor.formation?'active':''}">${e(name)}</button>`).join('');
 const status=problems.length?`<ul class="lineup-problems">${problems.map(problem=>`<li>${e(problem)}</li>`).join('')}</ul>`:'';
 return `<div class="lineup-toolbar"><div class="tactics" role="group" aria-label="Tactique">${tactics}</div><button type="button" data-lineup-suggest>Suggérer la meilleure composition</button></div>${status}
<div class="lineup-layout"><div class="lineup-field"><div class="pitch lineup-pitch" aria-label="Terrain · ${e(editor.formation)}">${editor.slots.map((id,index)=>slotHtml(id,current[index],layout[index],index,byId)).join('')}</div>
<h3>Remplaçants</h3><div class="lineup-bench">${editor.bench.map((id,index)=>benchHtml(id,index,byId)).join('')}</div></div>
<div class="lineup-squad" data-squad-drop>${squadHtml(byId)}</div></div>`;
}

function refresh(){
 const form=document.querySelector('#lineup-form');if(!form)return;
 const scroll=form.querySelector('.lineup-squad .table-scroll')?.scrollTop;
 form.innerHTML=editorHtml();
 if(scroll)form.querySelector('.lineup-squad .table-scroll').scrollTop=scroll;
 document.dispatchEvent(new CustomEvent('lineup-change'));
}
function update(lineup){editor.slots=lineup.slots;editor.bench=lineup.bench;refresh();}
const benchOf=(ids,size)=>Array.from({length:size},(_,index)=>ids[index]??null);
function load(formation,titulaires,banc){
 editor.formation=formation;
 const slots=editor.data.formations[formation].map(()=>null);
 titulaires.forEach(([id],index)=>{if(index<slots.length)slots[index]=id;});
 editor.slots=slots;editor.bench=benchOf(banc,editor.data.bench_size);
}

// The lineup editor of the controlled club, shown in its club page's Composition tab.
export async function compositionContent(params, state) {
 const matchId=Number(params.get('match')||state.awaiting_lineup);
 if(!matchId) return card('Aucune composition à faire',empty('Revenez ici lorsqu’un match de votre club est programmé aujourd’hui.','Rien à composer pour l’instant'));
 const data=await api(`/ma-partie/composition?match_id=${matchId}`);
 if(editor?.matchId!==matchId){
  editor={matchId,data,sort:{key:'selected',direction:'asc'}};
  load(data.default.formation,data.default.titulaires,data.default.banc);
 }else{
  // Fresh squad data (fitness, injuries) under the choices already made; players who left drop out.
  editor.data=data;
  const known=new Set(data.players.map(player=>player.id)),keep=id=>known.has(id)?id:null;
  editor.slots=editor.slots.map(keep);editor.bench=editor.bench.map(keep);
 }
 return card(`Composition · ${data.home?'À domicile':'À l’extérieur'} contre ${e(data.opponent?.name||'?')}`,
  `<div id="lineup-form" data-match="${matchId}">${editorHtml()}</div>`,'','composition-card');
}

function install(){
 let dragged=null;
 const inside=target=>target.closest?.('#lineup-form');
 const dropTarget=target=>target.closest('[data-slot],[data-bench],[data-squad-drop]');
 document.addEventListener('dragstart',event=>{
  const source=event.target.closest?.('[data-player][draggable="true"]');
  if(!source||!inside(source)||!mounted())return;
  dragged=Number(source.dataset.player);
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',String(dragged));
  // The ghost is a shirt like the pitch's, not a table row: the player's place in the lineup, or his own position.
  const player=editor.data.players.find(item=>item.id===dragged),spot=where(editor,dragged);
  const role=spot?.kind==='slot'?roles()[spot.index]:player.position;
  const token=document.createElement('div');
  token.className=`pitch-player lineup-slot drag-token ${group(role)}${player.unavailable?' invalid':''}`;
  token.innerHTML=`<span class="shirt">${e(role)}</span><small>${unavailableIcon(player)}${e(surname(player.name))}</small>`;
  document.body.append(token);
  event.dataTransfer.setDragImage(token,token.offsetWidth/2,18);
  setTimeout(()=>token.remove());
  source.classList.add('dragging');
 });
 document.addEventListener('dragend',event=>{dragged=null;event.target.classList?.remove('dragging');document.querySelectorAll('#lineup-form .drop-hover').forEach(item=>item.classList.remove('drop-hover'));});
 document.addEventListener('dragover',event=>{
  if(dragged==null||!inside(event.target))return;
  const target=dropTarget(event.target);if(!target)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';
  document.querySelectorAll('#lineup-form .drop-hover').forEach(item=>item!==target&&item.classList.remove('drop-hover'));
  target.classList.add('drop-hover');
 });
 document.addEventListener('drop',event=>{
  if(dragged==null||!inside(event.target)||!mounted())return;
  const target=dropTarget(event.target);if(!target)return;
  event.preventDefault();
  const id=dragged;dragged=null;
  // Dropping back on the squad list takes the player out of the lineup.
  if('squadDrop' in target.dataset)update(remove(editor,id));
  else update(place(editor,id,'slot' in target.dataset?{kind:'slot',index:Number(target.dataset.slot)}:{kind:'bench',index:Number(target.dataset.bench)}));
 });
 document.addEventListener('contextmenu',event=>{
  const item=event.target.closest?.('[data-player]');
  if(!item||!inside(item)||!mounted())return;
  const id=Number(item.dataset.player);
  if(!where(editor,id))return;
  event.preventDefault();
  update(remove(editor,id));
 });
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('button');
  if(!button||!inside(button)||!mounted())return;
  if(button.dataset.tactic&&button.dataset.tactic!==editor.formation){
   const next=button.dataset.tactic;
   editor.slots=changeFormation(editor.slots,roles(),editor.data.formations[next]);
   editor.formation=next;refresh();
  }
  if('lineupSuggest' in button.dataset){const best=editor.data.suggestions[editor.formation];load(editor.formation,best.titulaires,best.banc);refresh();}
  if(button.dataset.lineupSort){
   const key=button.dataset.lineupSort,same=editor.sort.key===key;
   editor.sort={key,direction:same?(editor.sort.direction==='asc'?'desc':'asc'):['selected','position','name'].includes(key)?'asc':'desc'};
   refresh();
  }
 });
}
if(typeof document!=='undefined')install();
