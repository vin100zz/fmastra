// The human club's match played live: the 2D pitch fed one segment at a time, the stats, the other matches of
// the day with the table as it stands, and the Tactique panel. The screen is modal until the final whistle.
import {api,escape as e,number as n,matchNote,card,roundTitle,kitDot,kitShirt,matchNoteBadge,PITCH_BOXES,position,group,surname,toast} from './ui.js';
import {liveReplay} from './match-replay.js';
import {replayTeams,statsCard,highlightsCard} from './match.js';
import {pitchLayout,changeFormation} from './composition.js';

const POSITIONS=['GB','DG','DC','DD','MDC','MC','AILG','AILD','MOC','BU'];
const MENTALITIES={defensive:'Défensive',equilibree:'Équilibrée',offensive:'Offensive'};
let view=null;

export const liveStatus=()=>view?.status??null;

// The table as it would stand if every match of the day ended now: `games` hold [{home, away, goals}] with the
// scores at that moment; ties go to goal difference, then goals scored.
export function liveTable(rows,games,points){
 const table=new Map(rows.map(row=>[row.club.id,{...row}]));
 for(const game of games){
  const home=table.get(game.home.id),away=table.get(game.away.id);
  if(!home||!away)continue;
  const [a,b]=game.goals;
  home.played++;away.played++;home.goals_for+=a;home.goals_against+=b;away.goals_for+=b;away.goals_against+=a;
  if(a>b){home.won++;away.lost++;home.points+=points.win;}
  else if(a<b){away.won++;home.lost++;away.points+=points.win;}
  else{home.drawn++;away.drawn++;home.points+=points.draw;away.points+=points.draw;}
 }
 return [...table.values()].sort((x,y)=>y.points-x.points||(y.goals_for-y.goals_against)-(x.goals_for-x.goals_against)||y.goals_for-x.goals_for||x.club.name.localeCompare(y.club.name));
}

// What the other matches show at `second`, and the viewer's own match at the score the pitch shows.
function scoresAt(second){
 const others=view.others.matches.map(game=>({...game,goals:[game.home,game.away].map(team=>game.goals.filter(goal=>goal.second<=second&&goal.club_id===team.id).length)}));
 return [...others,{home:view.state.home,away:view.state.away,goals:view.score,own:true}];
}

function othersHtml(second=0){
 if(!view.others.matches.length&&!view.others.table)return '';
 const games=scoresAt(second);
 const rows=games.filter(game=>!game.own).map(game=>`<div class="live-game"><span>${kitDot(game.home)}${e(game.home.name)}</span><b>${game.goals[0]} – ${game.goals[1]}</b><span>${kitDot(game.away)}${e(game.away.name)}</span></div>`).join('');
 const own=view.state.side==='home'?view.state.home.id:view.state.away.id;
 const standings=view.others.table&&liveTable(view.others.table,games,view.others.points);
 const table=standings?`<div class="table-scroll standings"><table class="live-table"><thead><tr><th class="rank-column">#</th><th>CLUB</th><th class="total-column">PTS</th><th class="count-column">V</th><th class="count-column">N</th><th class="count-column">D</th><th class="total-column">BP</th><th class="total-column">BC</th><th class="difference-column">DIFF.</th></tr></thead><tbody>${standings.map((row,index)=>`<tr class="${row.club.id===own?'own':''}"><td>${index+1}</td><td>${kitDot(row.club)}${e(row.club.name)}</td><td><b>${row.points}</b></td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.goals_for}</td><td>${row.goals_against}</td><td>${row.goals_for-row.goals_against}</td></tr>`).join('')}</tbody></table></div>`:'';
 return card(standings?roundTitle(view.others.competition,standings):view.others.competition,`<div class="card-body">${rows}</div>${table}`,'','live-others');
}

// Goals, injuries and red cards as far as the pitch has shown them: a goal once the score counts it.
export function shownHighlights(events,second,score,homeId){
 const counted=[0,0];
 return events.filter(event=>{
  if(event.period===3||!['goal','injury','red'].includes(event.kind))return false;
  if(event.kind!=='goal')return event.second<=second;
  const side=event.team_id===homeId?0:1;
  return counted[side]++<score[side];
 });
}
const highlightsHtml=()=>highlightsCard({...view.state,result:{events:shownHighlights(view.events,view.second??view.state.second,view.score,view.state.home.id)}},(id,name)=>e(name));

// The human side's sheet under the pitch: rating, goals, cards, injury and fatigue of each player.
function squadHtml(){
 const kit=replayTeams(view.state)[view.state.side];
 const item=player=>{
  const tired=Math.round((1-player.fitness)*100);
  const marks=[player.goals?`<span class="match-mark goal">${player.goals>1?`×${player.goals}`:''}</span>`:'',
   ...Array.from({length:player.red?Math.min(1,player.yellows):player.yellows},()=>'<span class="match-mark booking yellow"></span>'),
   player.red?'<span class="match-mark booking red"></span>':'',player.injured?'<span class="match-mark injury"></span>':''].join('');
  const title=`${player.name} · ${player.position}${player.rating!=null?` · note ${matchNote(player.rating)}`:''} · fatigue ${tired} %`;
  return `<div class="live-player ${player.state}" title="${e(title)}">${kitShirt(kit.major,kit.minor,player.position)}${matchNoteBadge(player.rating)}<span class="live-player-name">${e(surname(player.name))}</span><span class="live-player-marks">${marks}</span><span class="fatigue-bar${tired>=30?' danger':''}"><i style="width:${Math.min(100,tired)}%"></i></span></div>`;
 };
 const squad=view.shown.manager.squad;
 return `${squad.filter(player=>player.starter).map(item).join('')}<span class="live-squad-gap"></span>${squad.filter(player=>!player.starter).map(item).join('')}`;
}

// After the final whistle nothing is left to order: Continuer, on the pitch, closes the day.
function actionsHtml(){
 if(view.status==='finished')return '';
 return `<button type="button" data-live="tactique">Tactique</button><button type="button" data-live="fin">Fin du match</button>`;
}

// ---- Tactique: the Composition editor's look, on the players the match still has. ----
// `draft.slots` hold the pitch as it will be ({role, id, origin}), `origin` being who stood there when the panel
// opened; an injured player nobody replaced keeps his place until someone takes it.
export function tacticsDraft(manager){
 return {mentality:manager.mentality,slots:[...manager.vacancies,...manager.active].map(player=>({role:player.position,id:player.id,origin:player.id}))};
}
const onPitch=(draft,id)=>draft.slots.some(slot=>slot.id===id);
const originalIds=manager=>[...manager.vacancies,...manager.active].map(player=>player.id);
// A player dropped on a place of the pitch: from another place the two swap, from the list he takes it and its occupant leaves.
export function placeInDraft(draft,manager,id,index){
 if(manager.vacancies.some(player=>player.id===id))return draft;
 const slots=draft.slots.map(slot=>({...slot})),from=slots.findIndex(slot=>slot.id===id);
 if(from===index)return draft;
 if(from>=0)slots[from].id=slots[index].id;
 slots[index].id=id;
 return {...draft,slots};
}
// A substitute dragged back to the list: his place returns to whoever held it, or to the first player left out.
export function benchInDraft(draft,manager,id){
 const index=draft.slots.findIndex(slot=>slot.id===id);
 if(index<0||!manager.bench.some(player=>player.id===id))return draft;
 const back=[draft.slots[index].origin,...originalIds(manager)].find(candidate=>!onPitch(draft,candidate));
 return {...draft,slots:draft.slots.map((slot,at)=>at===index?{...slot,id:back}:slot)};
}
// Another formation keeps each player on a place of the same position, then of the same line; the places
// nobody can fill (after a red card) are dropped.
export function formationInDraft(draft,roles){
 const moved=changeFormation(draft.slots.map((_,index)=>index),draft.slots.map(slot=>slot.role),roles);
 return {...draft,slots:moved.map((from,index)=>from==null?null:{...draft.slots[from],role:roles[index]}).filter(Boolean)};
}
// The orders the draft describes: changes first, then the positions of whoever is on the pitch after them, then the mentality.
export function tacticsOrders(draft,manager){
 const originals=new Set(originalIds(manager)),injured=new Set(manager.vacancies.map(player=>player.id));
 const leaving=originalIds(manager).filter(id=>!onPitch(draft,id));
 const entering=draft.slots.filter(slot=>!originals.has(slot.id));
 // Each newcomer replaces whoever held his place if that player went off, otherwise one of those left over.
 const paired=new Set(entering.map(slot=>slot.origin).filter(id=>leaving.includes(id)));
 const spare=leaving.filter(id=>!paired.has(id)),orders=[];
 for(const slot of entering)orders.push({type:'remplacement',sortant:leaving.includes(slot.origin)?slot.origin:spare.shift(),entrant:slot.id,poste:slot.role});
 const placement=draft.slots.filter(slot=>!injured.has(slot.id)).map(slot=>[slot.id,slot.role]);
 const before=new Map(manager.active.map(player=>[player.id,player.position]));
 if(entering.length||placement.some(([id,role])=>before.get(id)!==role))orders.push({type:'placement',placement});
 if(draft.mentality!==manager.mentality)orders.push({type:'mentalite',mentalite:draft.mentality});
 return orders;
}
// What the rules refuse in the draft; an empty list when it can be sent.
export function tacticsProblems(draft,manager,halftime){
 const originals=new Set(originalIds(manager)),injured=new Set(manager.vacancies.map(player=>player.id));
 const changes=draft.slots.filter(slot=>!originals.has(slot.id)).length,left=manager.substitutions_left,problems=[];
 if(changes>left)problems.push(`${left} remplacement${left>1?'s':''} restant${left>1?'s':''}`);
 if(changes&&!halftime&&manager.windows_left<=0)problems.push('Plus de fenêtre de remplacement');
 if(draft.slots.filter(slot=>slot.role==='GB'&&!injured.has(slot.id)).length>1)problems.push('Un seul gardien sur le terrain');
 return problems;
}

const squad=()=>new Map([...view.manager.vacancies.map(player=>({...player,injured:true})),...view.manager.active,...view.manager.bench].map(player=>[player.id,player]));
const hurt=player=>player.injured||view.decision?.player_id===player.id;
const marks=player=>`${hurt(player)?'<span class="lineup-icon injury" aria-label="Blessé">✚</span>':''}${player.yellows?'<span class="match-mark booking yellow"></span>':''}`;

// The shirt of the user's side, with a position on it.
const ownShirt=role=>{const kit=replayTeams(view.state)[view.state.side];return kitShirt(kit.major,kit.minor,role);};
function tacticsSlotHtml(slot,place,index,byId){
 const player=byId.get(slot.id);
 return `<div class="pitch-player lineup-slot ${group(slot.role)}${hurt(player)?' invalid':''}" data-slot="${index}"${player.injured?'':` data-player="${player.id}" draggable="true"`} style="left:${place.x}%;top:${place.y}%" title="${e(player.name)}">${ownShirt(slot.role)}<small>${marks(player)}${e(surname(player.name))}</small></div>`;
}
// Those on the pitch in the order of positions, then the substitutes, then the players taken off in the draft.
function tacticsListHtml(byId){
 const draft=view.draft,originals=new Set(view.manager.active.map(player=>player.id));
 const order=role=>POSITIONS.indexOf(role);
 const playing=draft.slots.map((slot,index)=>({slot,index})).filter(({slot})=>!byId.get(slot.id).injured).sort((a,b)=>order(a.slot.role)-order(b.slot.role)||a.index-b.index);
 const row=(player,label,classes)=>{
  const tired=Math.round((1-player.fitness)*100);
  return `<tr data-player="${player.id}" draggable="true" class="${classes}"><td>${label}</td><td>${position(player.natural??player.position)}</td><td class="strong"><span class="lineup-name">${marks(player)}${e(player.name)}</span></td><td><span class="fatigue-cell${tired>=30?' danger':''}"><span class="fatigue-bar"><i style="width:${Math.min(100,tired)}%"></i></span>${tired} %</span></td></tr>`;
 };
 const body=[...playing.map(({slot})=>row(byId.get(slot.id),position(slot.role),'chosen')),
  ...view.manager.bench.filter(player=>!onPitch(draft,player.id)).map(player=>row(player,'<span class="position bench">REMP</span>','')),
  ...view.manager.active.filter(player=>!onPitch(draft,player.id)).map(player=>row(player,'<span class="position bench">SORTI</span>','outgoing'))].join('');
 return `<div class="table-scroll"><table><thead><tr><th>COMPO</th><th>POSTE</th><th>JOUEUR</th><th>FATIGUE</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function tacticsHtml(){
 const manager=view.manager,draft=view.draft,byId=squad(),halftime=view.status==='halftime';
 const roles=draft.slots.map(slot=>slot.role),layout=pitchLayout(roles),key=list=>[...list].sort().join();
 const pressed=(attribute,name,active)=>`<button type="button" data-${attribute}="${e(name)}" aria-pressed="${active}" class="${active?'active':''}">`;
 const formations=Object.entries(manager.formations).map(([name,list])=>`${pressed('formation',name,list.length===roles.length&&key(list)===key(roles))}${e(name)}</button>`).join('');
 const mentalities=manager.mentalities.map(name=>`${pressed('mentality',name,name===draft.mentality)}${MENTALITIES[name]||e(name)}</button>`).join('');
 const problems=tacticsProblems(draft,manager,halftime);
 const status=problems.length?`<span class="lineup-problems" role="status" title="${e(problems.join('\n'))}">${e(problems[0])}${problems.length>1?` <b>+${problems.length-1}</b>`:''}</span>`:'';
 const counters=`<span class="lineup-fixture">Remplacements <b>${manager.substitutions_left}</b> · Fenêtres <b>${halftime?'∞':manager.windows_left}</b></span>`;
 const blocked=problems.length?` aria-disabled="true" title="${e(problems.join('\n'))}"`:'';
 return `<div class="lineup-toolbar"><div class="tactics" role="group" aria-label="Tactique">${formations}</div><div class="tactics" role="group" aria-label="Mentalité">${mentalities}</div>${counters}${status}<div class="live-tactics-actions"><button type="button" data-live="annuler">Annuler</button><button type="button" class="primary" data-live="valider"${blocked}>${halftime?'Valider':'Reprendre'}</button></div></div>
<div class="lineup-layout"><div class="lineup-field"><div class="pitch lineup-pitch">${PITCH_BOXES}${draft.slots.map((slot,index)=>tacticsSlotHtml(slot,layout[index],index,byId)).join('')}</div></div>
<div class="lineup-squad" data-list-drop>${tacticsListHtml(byId)}</div></div>`;
}
const dialog=()=>document.querySelector('#live-tactics');
function renderTactics(){
 const box=dialog();if(!box)return;
 const scroll=box.querySelector('.lineup-squad .table-scroll')?.scrollTop;
 box.innerHTML=tacticsHtml();
 if(scroll)box.querySelector('.lineup-squad .table-scroll').scrollTop=scroll;
}
function showTactics(){
 view.draft=tacticsDraft(view.manager);
 let box=dialog();
 if(!box){
  box=document.createElement('dialog');box.id='live-tactics';box.className='live-tactics';
  box.addEventListener('cancel',event=>{event.preventDefault();closeTactics(false);});
  document.body.append(box);
 }
 renderTactics();
 if(!box.open)box.showModal();
}

function refresh(parts=['actions']){
 const root=document.querySelector('.live-layout');if(!root)return;
 if(parts.includes('actions'))root.querySelector('.live-actions').innerHTML=actionsHtml();
 if(parts.includes('stats')){root.querySelector('.live-stats').innerHTML=statsCard(view.shown);root.querySelector('.live-squad').innerHTML=squadHtml();}
}
const replay=()=>document.querySelector('.live-layout match-replay');

async function openPanel(){
 if(view.panel)return;
 view.panel=true;
 view.rewind=await replay()?.interrupt();
 showTactics();
}
// Valider sends the draft's orders, Annuler (or Échap) drops them; either way the match goes on, except at the break.
async function closeTactics(apply){
 if(apply){
  if(tacticsProblems(view.draft,view.manager,view.status==='halftime').length)return;
  const orders=tacticsOrders(view.draft,view.manager);
  if(orders.length){
   try{
    const state=await api('/direct/ordres',{commande_id:crypto.randomUUID(),seconde:view.rewind,ordres:orders});
    adopt(state);replay()?.resync(state);
   }catch(error){toast(error.message,true);return;}
  }
 }
 dialog()?.close();
 view.panel=false;view.decision=null;view.rewind=null;view.draft=null;
 refresh(['actions','stats']);
 if(view.status!=='halftime')replay()?.resume();
}
async function endMatch(){
 await replay()?.interrupt();
 try{
  await api('/direct/avancer',{commande_id:crypto.randomUUID(),jusqu_a:'fin'});
  const state=await api('/direct');
  adopt(state);
  replay()?.resync(state);
 }catch(error){toast(error.message,true);return;}
 finished();
}
function finished(){
 view.status='finished';view.panel=false;view.draft=null;
 dialog()?.close();
 refresh(['actions','stats']);
 document.dispatchEvent(new CustomEvent('live-status'));
}
function adopt(state){view.state=state;view.manager=state.manager;view.status=state.status;view.shown=state;view.score=[...state.score];view.events=[...state.result.events];}

export async function liveScreen(){
 const [state,others]=await Promise.all([api('/direct'),api('/direct/multiplex')]);
 dialog()?.remove();
 view={state,others,manager:state.manager,status:state.status,shown:state,score:[...state.score],events:[...state.result.events],panel:false,decision:null,rewind:null,draft:null,minute:null,pending:null};
 const next=()=>api('/direct/avancer',{commande_id:crypto.randomUUID()});
 const context=`<div class="match-context"><span class="eyebrow">${e(state.competition)} · ${e(state.round_label||`Journée ${state.round}`)}</span></div>`;
 return `<div class="live-layout"><div><section class="card match-replay-card live-card">${context}${liveReplay(state,replayTeams(state),next)}<div class="live-squad">${squadHtml()}</div><div class="live-actions">${actionsHtml()}</div></section></div>
<aside><div class="live-highlights">${highlightsHtml()}</div><div class="live-stats">${statsCard(state)}</div><div class="live-others-slot">${othersHtml(state.second)}</div></aside></div>`;
}

// The replay tells how far the viewer has got; everything else on the screen follows it.
globalThis.document?.addEventListener('live-segment',event=>{
 if(!view)return;
 // The stats of a segment are shown once it has played out: those of the previous one when the next is fetched.
 if(view.pending){view.shown=view.pending;refresh(['stats']);}
 const known=new Set(view.events.map(item=>item.sequence));
 view.events.push(...event.detail.result.events.filter(item=>!known.has(item.sequence)));
 view.pending=event.detail;view.manager=event.detail.manager;view.status=event.detail.status==='finished'?view.status:event.detail.status;
});
const settle=event=>{if(!view)return;view.shown=event.detail;view.pending=null;view.manager=event.detail.manager;};
globalThis.document?.addEventListener('live-halftime',event=>{if(!view)return;settle(event);view.status='halftime';refresh(['actions','stats']);});
globalThis.document?.addEventListener('live-decision',event=>{
 if(!view)return;settle(event);view.decision=event.detail.decision;
 view.panel=true;view.rewind=null;refresh(['actions','stats']);showTactics();
});
globalThis.document?.addEventListener('live-finished',()=>{if(!view)return;if(view.pending){view.shown=view.pending;view.pending=null;}finished();});
globalThis.document?.addEventListener('live-error',event=>toast(event.detail.error?.message||'Le match ne peut pas continuer.',true));
const updateOthers=second=>{
 const slot=document.querySelector('.live-others-slot');if(slot)slot.innerHTML=othersHtml(second);
 const highlights=document.querySelector('.live-highlights');if(highlights)highlights.innerHTML=highlightsHtml();
};
globalThis.document?.addEventListener('replay-clock',event=>{if(!view)return;const minute=Math.floor(event.detail.second/60);view.second=event.detail.second;if(minute!==view.minute){view.minute=minute;updateOthers(event.detail.second);}});
globalThis.document?.addEventListener('replay-score',event=>{if(!view)return;view.score=event.detail.score;updateOthers(view.second??0);});
globalThis.document?.addEventListener('click',event=>{
 if(!view)return;
 if(view.draft&&event.target.closest?.('#live-tactics')){
  const mentality=event.target.closest('[data-mentality]'),formation=event.target.closest('[data-formation]');
  if(mentality){view.draft={...view.draft,mentality:mentality.dataset.mentality};renderTactics();return;}
  if(formation){view.draft=formationInDraft(view.draft,view.manager.formations[formation.dataset.formation]);renderTactics();return;}
 }
 const button=event.target.closest?.('.live-layout [data-live],#live-tactics [data-live]');
 if(!button)return;
 const action=button.dataset.live;
 if(action==='tactique')openPanel();
 else if(action==='valider')closeTactics(true);
 else if(action==='annuler')closeTactics(false);
 else if(action==='second-half'){view.status='playing';refresh();replay()?.resume();}
 else if(action==='fin')endMatch();
 else if(action==='continuer')document.querySelector('#advance')?.click();
});

// Drag and drop in the Tactique panel, as on the Composition screen.
if(globalThis.document){
 let dragged=null;
 const inside=target=>target.closest?.('#live-tactics');
 const dropTarget=target=>target.closest('[data-slot],[data-list-drop]');
 const clear=except=>document.querySelectorAll('#live-tactics .drop-hover').forEach(item=>item!==except&&item.classList.remove('drop-hover'));
 document.addEventListener('dragstart',event=>{
  const source=event.target.closest?.('[data-player][draggable="true"]');
  if(!source||!inside(source)||!view?.draft)return;
  dragged=Number(source.dataset.player);
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',String(dragged));
  // The ghost is a shirt like the pitch's: the player's place in the draft, or his own position.
  const player=squad().get(dragged),role=view.draft.slots.find(slot=>slot.id===dragged)?.role??player.natural??player.position;
  const token=document.createElement('div');
  token.className=`pitch-player lineup-slot drag-token ${group(role)}`;
  token.innerHTML=`${ownShirt(role)}<small>${e(surname(player.name))}</small>`;
  document.body.append(token);
  event.dataTransfer.setDragImage(token,token.offsetWidth/2,18);
  setTimeout(()=>token.remove());
  source.classList.add('dragging');
 });
 document.addEventListener('dragend',event=>{if(dragged==null)return;dragged=null;event.target.classList?.remove('dragging');clear();});
 document.addEventListener('dragover',event=>{
  if(dragged==null||!inside(event.target))return;
  const target=dropTarget(event.target);if(!target)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';
  clear(target);target.classList.add('drop-hover');
 });
 document.addEventListener('drop',event=>{
  if(dragged==null||!inside(event.target)||!view?.draft)return;
  const target=dropTarget(event.target);if(!target)return;
  event.preventDefault();
  const id=dragged;dragged=null;
  view.draft='listDrop' in target.dataset?benchInDraft(view.draft,view.manager,id):placeInDraft(view.draft,view.manager,id,Number(target.dataset.slot));
  renderTactics();
 });
}
