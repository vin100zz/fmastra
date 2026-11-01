// The human club's match played live (docs/ui.md, « Match en direct »): the whole screen in the window, three columns.
// On the left the players of either side, then the tactic, both edited where they stand; in the middle the match's band,
// the 2D pitch fed one segment at a time with its commentary, the whole match on a line, the commands and the flow of the
// expected goals; on the right the highlights, the stats, the other matches of the day and the table as it stands. The
// screen is modal until the final whistle.
import {api,escape as e,matchNote,roundTitle,kitDot,kitShirt,shirtLabel,playerBlock,matchNoteBadge,matchBlockNote,position,group,shortName,toast,fact,empty,matchMinute,halfEnd,chartColours,tableZone} from './ui.js';
import {liveReplay} from './match-replay.js';
import {replayTeams,statsCard,flowChart} from './match.js';
import {matchHero} from './club-hero.js';
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
// How many places each club has gained (positive) or lost since the day began, by its id.
export function tableMoves(before,now){
 const rank=new Map(before.map((row,index)=>[row.club.id,index]));
 return new Map(now.map((row,index)=>[row.club.id,(rank.get(row.club.id)??index)-index]));
}

// What the other matches show at `second`, and the viewer's own match at the score the pitch shows.
function scoresAt(second){
 const others=view.others.matches.map(game=>({...game,goals:[game.home,game.away].map(team=>game.goals.filter(goal=>goal.second<=second&&goal.club_id===team.id).length)}));
 return [...others,{home:view.state.home,away:view.state.away,goals:view.score,own:true}];
}

// The day's matches, the viewer's first; a score that has just changed lights up. Under them, at the foot of the card on
// nine lines, the table as it would stand now, opened on the user's club: each place marked as the table screen marks it
// (`places` of the table before the day, rank by rank), and before each club the places it has gained or lost since the
// day began.
function othersHtml(second=0){
 if(!view.others.matches.length&&!view.others.table)return '';
 const games=scoresAt(second),seen=view.seenScores??=new Map();
 const row=game=>{
  const key=game.own?'own':game.id,score=game.goals.join(' – '),changed=seen.has(key)&&seen.get(key)!==score;
  seen.set(key,score);
  return `<div class="live-game${game.own?' own':''}${changed?' flash':''}"><span>${e(game.home.name)}${kitDot(game.home)}</span><span class="fixture-score"><b>${score}</b></span><span>${kitDot(game.away)}${e(game.away.name)}</span></div>`;
 };
 const rows=[...games.filter(game=>game.own),...games.filter(game=>!game.own)].map(row).join('');
 const own=view.state.side==='home'?view.state.home.id:view.state.away.id;
 const points=view.others.points,standings=view.others.table&&liveTable(view.others.table,games,points);
 // Before the first round, nobody has a place to gain or lose.
 const moves=standings&&view.others.table.some(row=>row.played)?tableMoves(liveTable(view.others.table,[],points),standings):new Map();
 const move=id=>{const value=moves.get(id);return value>0?`<span class="move up" title="${value} place${value>1?'s':''} gagnée${value>1?'s':''}">▲${value}</span>`:value<0?`<span class="move down" title="${-value} place${value<-1?'s':''} perdue${value<-1?'s':''}">▼${-value}</span>`:'<span class="move"></span>';};
 const place=index=>tableZone(view.others.places?.[index]);
 const table=standings?`<div class="live-table-scroll standings"><table class="live-table"><thead><tr><th class="rank-column">#</th><th></th><th>CLUB</th><th class="total-column">PTS</th><th class="count-column">V</th><th class="count-column">N</th><th class="count-column">D</th><th class="total-column">BP</th><th class="total-column">BC</th><th class="difference-column">DIFF.</th></tr></thead><tbody>${standings.map((row,index)=>{const difference=row.goals_for-row.goals_against;return `<tr class="${[place(index),row.club.id===own?'own':''].filter(Boolean).join(' ')}"><td><span class="rank">${index+1}</span></td><td>${move(row.club.id)}</td><td>${kitDot(row.club)}${e(row.club.name)}</td><td><b>${row.points}</b></td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.goals_for}</td><td>${row.goals_against}</td><td>${difference>0?`+${difference}`:difference}</td></tr>`;}).join('')}</tbody></table></div>`:'';
 return `<div class="card-head"><h2>${e(standings?roundTitle(view.others.competition,standings):view.others.competition)}</h2></div><div class="live-games">${rows}</div>${table}`;
}

// What the pitch has shown so far of the goals, cards, injuries and penalties missed: a goal once the score counts it,
// the rest once the clock has passed it.
export function shownHighlights(events,second,score,homeId){
 const counted=[0,0],scored=new Set(events.filter(event=>event.kind==='goal').map(event=>event.shot_id));
 return events.filter(event=>{
  if(event.period===3)return false;
  if(event.kind==='shot')return event.detail==='penalty'&&!scored.has(event.shot_id)&&event.second<=second;
  if(!['goal','injury','red','yellow'].includes(event.kind))return false;
  if(event.kind!=='goal')return event.second<=second;
  const side=event.team_id===homeId?0:1;
  return counted[side]++<score[side];
 });
}
// The highlights by kind, each in the order of the match: the goals, then the cards, the injuries, the penalties missed;
// the kinds nothing happened in are left out.
const HIGHLIGHT_KINDS=[['goal',['goal']],['booking',['yellow','red']],['injury',['injury']],['missed',['shot']]];
export const highlightGroups=events=>HIGHLIGHT_KINDS.map(([kind,kinds])=>({kind,events:events.filter(event=>kinds.includes(event.kind))})).filter(group=>group.events.length);
const mark=(className,title,text='')=>`<span class="match-mark ${className}" title="${e(title)}">${text}</span>`;
const named=(name,short,title=name)=>{const shown=shortName(name,short);return `<span${title&&shown!==title?` title="${e(title)}"`:''}>${e(shown)}</span>`;};
// The highlights, the card of the report: a line each, the minute in the middle and each fact on its side's edge; the
// goals (the scorer and his passer), 12 of space and a rule, then the other kinds, a rule between two.
function highlightsHtml(){
 const head='<div class="card-head"><h2>Les temps forts</h2></div>';
 const events=shownHighlights(view.events,view.second??view.state.second,view.score,view.state.home.id);
 if(!events.length)return `${head}<div class="card-body">${empty('Ni but, ni carton, ni blessure')}</div>`;
 const half=halfEnd(view.events),saved=new Set(view.events.filter(event=>event.kind==='save').map(event=>event.shot_id));
 const line=event=>{
  const marks=event.kind==='goal'?mark('goal','But'):event.kind==='injury'?mark('injury','Blessure'):event.kind==='yellow'?mark('booking yellow','Carton jaune')
   :event.kind==='shot'?mark('missed',saved.has(event.shot_id)?'Penalty arrêté':'Penalty manqué')
   :event.detail==='second_yellow'?mark('booking yellow','Carton jaune')+mark('booking red','Deuxième carton jaune'):mark('booking red','Carton rouge');
  const passer=event.kind!=='goal'?'':event.detail==='penalty'?'<small title="Sur penalty">pen.</small>':event.secondary?`<small title="${e(`Passe de ${event.secondary}`)}">${e(shortName(event.secondary,event.secondary_short))}</small>`:'';
  const content=`<span class="marks">${marks}</span><span class="highlight-names"><strong>${named(event.player||'—',event.player_short)}</strong>${passer}</span>`;
  const home=event.team_id===view.state.home.id;
  return `<div class="highlight-row"><div class="highlight home">${home?content:''}</div><span class="minute">${matchMinute(event.second,half,event.period)}′</span><div class="highlight away">${home?'':content}</div></div>`;
 };
 const groups=highlightGroups(events),goals=groups.find(group=>group.kind==='goal')?.events.length??0;
 // A goal just shown lights its line up.
 const fresh=goals>(view.goalsShown??goals);
 view.goalsShown=goals;
 const blocks=groups.map(group=>{
  const lines=group.events.map(line);
  if(fresh&&group.kind==='goal')lines[lines.length-1]=lines.at(-1).replace('class="highlight-row"','class="highlight-row flash"');
  return `<div class="highlights ${group.kind==='goal'?'goals':'kind'}">${lines.join('')}</div>`;
 }).join('');
 return `${head}<div class="highlights-scroll">${blocks}</div>`;
}

// ---- The flow of the expected goals. ----
// Each shot the pitch has shown, its expected goals, and whether the score has counted it.
function shownShots(){
 const second=view.second??view.state.second,home=view.state.home.id;
 const scored=new Set(shownHighlights(view.events,second,view.score,home).filter(event=>event.kind==='goal').map(event=>event.shot_id));
 return view.events.filter(event=>event.kind==='shot'&&event.period<=2&&event.second<=second&&event.xg!=null)
  .map(event=>({second:event.second,home:event.team_id===home,xg:event.xg,goal:scored.has(event.shot_id)}));
}
// The card under the commands takes the height they leave, as wide as the line of the match, its minutes under the line's;
// with less than FLOW_ROOM for its chart, it gives way to a smaller chart at the head of the match in figures.
const FLOW_ROOM=88,FLOW_MINI=104;
function drawFlow(){
 const centre=document.querySelector('.live-centre'),frise=centre?.querySelector('.frise');
 if(!centre||!frise)return;
 let card=centre.querySelector('.live-flow');
 if(!card){
  card=document.createElement('section');card.className='card live-flow';
  card.innerHTML='<div class="card-head"><h2>Fil du match</h2><span class="card-hint">buts attendus cumulés</span></div><div class="flow-body"></div>';
  centre.append(card);
 }
 const second=view.second??view.state.second,known=view.events.some(event=>event.kind==='period_end'&&event.period===1);
 const half=halfEnd(view.events),end=Math.max(5400,known?half+2700:0,second);
 const chart={shots:shownShots(),colours:chartColours(view.state.home,view.state.away),half,end,now:second,live:true};
 card.hidden=false;
 const body=card.querySelector('.flow-body'),room=body.getBoundingClientRect(),line=frise.getBoundingClientRect();
 const stats=document.querySelector('.live-stats .match-stats');
 if(room.height>=FLOW_ROOM){
  stats?.querySelector('.flow-mini')?.remove();
  body.innerHTML=flowChart({...chart,width:Math.floor(room.width),height:Math.floor(room.height),left:line.left-room.left,right:room.right-line.right,top:10,bottom:22,inner:true});
  return;
 }
 card.hidden=true;
 if(!stats)return;
 const width=Math.floor(stats.getBoundingClientRect().width)-24,mini=stats.querySelector('.flow-mini')??stats.querySelector('.card-head').insertAdjacentElement('afterend',Object.assign(document.createElement('div'),{className:'flow-mini'}));
 mini.innerHTML=flowChart({...chart,width,height:FLOW_MINI,left:20,right:34,top:8,bottom:20});
}

// ---- The assistant. ----
// The assistant's advice: who he would take off (tired, booked and tiring, or having a bad match and tiring) and who he
// would send on in his place, a substitute of the same position, else of the same line, the freshest. Nothing once the
// changes are spent or the match is over.
export function assistantAdvice(squad,changesLeft,status){
 const out=new Map(),into=new Map();
 if(changesLeft<=0||status==='finished')return {out,into};
 const tired=player=>Math.round((1-player.fitness)*100);
 const reasons=player=>{
  const value=tired(player),list=[];
  if(value>=70)list.push(`fatigue ${value} %`);
  if(player.yellows&&value>=50)list.push(`averti, fatigue ${value} %`);
  if(player.rating!=null&&player.rating<6&&value>=50)list.push(`note ${matchNote(player.rating)}`);
  return list;
 };
 const candidates=squad.filter(player=>player.state==='on'&&!player.injured&&!player.red&&reasons(player).length).sort((a,b)=>tired(b)-tired(a));
 const bench=squad.filter(player=>player.state==='bench'&&!player.injured);
 for(const player of candidates){
  if(out.size>=changesLeft)break;
  const role=player.role??player.position,free=bench.filter(sub=>!into.has(sub.id)&&(sub.position==='GB')===(role==='GB'));
  const fresher=list=>list.sort((a,b)=>b.fitness-a.fitness)[0];
  const sub=fresher(free.filter(item=>item.position===role))??fresher(free.filter(item=>group(item.position)===group(role)));
  if(!sub)continue;
  out.set(player.id,{sub,reasons:reasons(player)});into.set(sub.id,player);
 }
 return {out,into};
}

// ---- The draft: the user's side as he is changing it. ----
// `draft.slots` hold the pitch as it will be ({role, id, origin}), `origin` being who stood there when the draft began;
// an injured player nobody replaced keeps his place until someone takes it.
export function tacticsDraft(manager){
 return {mentality:manager.mentality,slots:[...manager.vacancies,...manager.active].map(player=>({role:player.position,id:player.id,origin:player.id}))};
}
const onPitch=(draft,id)=>draft.slots.some(slot=>slot.id===id);
const originalIds=manager=>[...manager.vacancies,...manager.active].map(player=>player.id);
// A player dropped on a place of the pitch: from another place the two swap, from the bench he takes it and its occupant leaves.
export function placeInDraft(draft,manager,id,index){
 if(manager.vacancies.some(player=>player.id===id))return draft;
 const slots=draft.slots.map(slot=>({...slot})),from=slots.findIndex(slot=>slot.id===id);
 if(from===index)return draft;
 if(from>=0)slots[from].id=slots[index].id;
 slots[index].id=id;
 return {...draft,slots};
}
// A substitute sent back to the bench: his place returns to whoever held it, or to the first player left out.
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
// The lines of the user's side as the draft has them: those on the pitch in the order of positions, a substitute coming
// on right after the player he replaces, then the substitutes left on the bench. Each line names its player (`id`), his
// place (`role`, none on the bench), the place of the draft he stands on (`slot`) and what the draft changes for him
// (`change`): 'out' going off, 'in' coming on, 'moved' to another place.
export function draftLines(draft,manager){
 const into=new Map(tacticsOrders(draft,manager).filter(order=>order.type==='remplacement').map(order=>[order.entrant,order.sortant]));
 const before=new Map(manager.active.map(player=>[player.id,player.position])),order=role=>POSITIONS.indexOf(role);
 const slots=draft.slots.map((slot,index)=>({...slot,index})).sort((a,b)=>order(a.role)-order(b.role)||a.index-b.index);
 const pitch=slots.flatMap(slot=>{
  const out=into.get(slot.id),line={id:slot.id,role:slot.role,slot:slot.index,change:out!=null?'in':before.has(slot.id)&&before.get(slot.id)!==slot.role?'moved':null};
  return out!=null?[{id:out,role:before.get(out)??slot.role,slot:null,change:'out'},line]:[line];
 });
 const bench=manager.bench.filter(player=>!onPitch(draft,player.id)).map(player=>({id:player.id,role:null,slot:null,change:null}));
 return {pitch,bench};
}
// The user's side as the screen has shown it: the draft is made on it, never on a segment fetched but not played yet.
const team=()=>view.shown.manager;
const pending=()=>!!view.draft&&tacticsOrders(view.draft,team()).length>0;
// The draft follows the match while it holds nothing. With changes in it, it keeps them as long as the same players stand
// where it found them, and starts again otherwise (a player sent off or injured meanwhile).
function syncDraft(){
 const key=ids=>[...ids].sort((a,b)=>a-b).join();
 const same=view.draft&&key(view.draft.slots.map(slot=>slot.origin))===key(originalIds(team()));
 if(!same||!pending())view.draft=tacticsDraft(team());
}

// ---- The left column: either side's players, the user's own edited where they stand. ----
const SWAP='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5h9l-2.5-2.5M13 11H4l2.5 2.5"/></svg>';
const UNDO='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
// What a player did, as far as the screen has shown it: a ball for each goal (not on the pitch, where they stand on his
// shirt), his cards, his injury, the minute he came on or went off.
function sheetMarks(player,{goals=true}={}){
 const changes=view.changes?.get(player.id)??{};
 return [goals?mark('goal',`${player.goals} but${player.goals>1?'s':''}`).repeat(player.goals):'',
  mark('booking yellow','Carton jaune').repeat(player.red?Math.min(1,player.yellows):player.yellows),
  player.red?mark('booking red','Carton rouge'):'',player.injured?mark('injury','Blessé'):'',
  changes.on?mark('sub-on',`Entré à la ${changes.on}e minute`,`▲ ${changes.on}′`):'',changes.off?mark('sub-off',`Sorti à la ${changes.off}e minute`,`▼ ${changes.off}′`):''].join('');
}
// The minutes each player came on or went off, as the screen has shown them.
function shownChanges(){
 const changes=new Map(),half=halfEnd(view.events),second=view.second??view.state.second;
 for(const event of view.events){
  if(event.kind!=='substitution'||event.period===3||event.second>second)continue;
  const at=matchMinute(event.second,half,event.period);
  changes.set(event.player_id,{...changes.get(event.player_id),off:at});
  if(event.secondary_id!=null)changes.set(event.secondary_id,{...changes.get(event.secondary_id),on:at});
 }
 return changes;
}
const sideOf=mine=>mine?view.state.side:view.state.side==='home'?'away':'home';
const sheetOf=side=>side===view.state.side?view.shown.manager.squad:view.shown.opponent?.squad??[];
// The user's side can be changed until the final whistle, except while its changes wait for the end of the action.
const editable=()=>view.status!=='finished'&&!view.waiting;
const hurt=player=>player.injured||player.red||view.decision?.player_id===player.id;

// One side's players, a line each: those on the pitch, in the order of their places, then the substitutes, then those who
// went off. The shirt and its number, the position, the whole name, what he did, his note; for the user's side, his
// fatigue and the assistant's advice, and the draft: a player going off struck through, the one coming on after him on
// the green, × to send him back; each line dragged onto another (or picked, then the other) changes the draft.
function squadHtml(){
 const mine=view.team!=='theirs',side=sideOf(mine),kit=replayTeams(view.state)[side],sheet=sheetOf(side);
 view.changes=shownChanges();
 const lines=mine&&view.draft?draftLines(view.draft,team()):null,changing=new Set(lines?[...lines.pitch.filter(line=>line.change==='in'||line.change==='out').map(line=>line.id)]:[]);
 const advice=mine&&!changing.size&&editable()?assistantAdvice(sheet,view.shown.manager.substitutions_left,view.status):{out:new Map(),into:new Map()};
 const byId=new Map(sheet.map(player=>[player.id,player])),fitness=new Map([...team().active,...team().bench].map(player=>[player.id,player.fitness]));
 const row=(player,line=null)=>{
  const tired=Math.round((1-(mine?fitness.get(player.id)??player.fitness:player.fitness))*100),out=advice.out.get(player.id),into=advice.into.get(player.id);
  const tip=out?`L’adjoint ferait entrer ${out.sub.name} : ${out.reasons.join(', ')}`:into?`L’adjoint le ferait entrer à la place de ${into.name}`:'';
  const last=line?.change==='in'?`<button type="button" class="advice undo" data-undo="${player.id}" title="Annuler ce changement" aria-label="Annuler ce changement">${UNDO}</button>`
   :tip?`<button type="button" class="advice${into?' in':''}" data-advice="${out?player.id:into.id}" data-advice-in="${out?out.sub.id:player.id}" title="${e(tip)}" aria-label="${e(tip)}">${SWAP}</button>`:'<span></span>';
  const fatigue=mine?`<span class="fatigue" title="Fatigue ${tired} %"><span class="gauge${tired>=70?' bad':tired>=50?' warn':''}"><i style="width:${Math.min(100,tired)}%"></i></span>${tired} %</span>`:'';
  const role=line?line.role??player.position:player.role??player.position;
  const state=line?(line.slot!=null||line.change==='out'?'on':'bench'):player.state;
  const marks=line?.change==='in'?mark('sub-on waiting','Entrera','▲'):sheetMarks(player)+(line?.change==='out'?mark('sub-off waiting','Sortira','▼'):'');
  const classes=['squad-row',state,out?'advised':'',line?.change==='in'?'entering':line?.change==='out'?'leaving':'',line&&line.slot!=null&&hurt(player)&&!player.red?'invalid':'',line&&view.picked===player.id?'picked':''].filter(Boolean).join(' ');
  const drag=line&&editable()&&line.change!=='out'&&!hurt(player)&&player.state!=='off';
  const target=line?line.slot!=null?` data-slot="${line.slot}"`:line.change!=='out'?` data-bench="${player.id}"`:'':'';
  const chip=position(role).replace('class="position',`class="position${line?.change==='moved'?' moved':''}`);
  return `<div class="${classes}"${target}${drag?` data-player="${player.id}" draggable="true"`:''}>${kitShirt(kit.major,kit.minor,shirtLabel(player,role))}`
   +`<span class="squad-who">${chip}<span class="squad-name" title="${e(player.name)}">${e(player.name)}</span></span>`
   +`<span class="marks">${marks}</span>${line?.change==='in'?'<span></span>':matchNoteBadge(player.rating)||'<span></span>'}${mine?fatigue+last:''}</div>`;
 };
 let on,rest;
 if(lines){
  on=lines.pitch.map(line=>byId.get(line.id)&&row(byId.get(line.id),line)).filter(Boolean);
  const listed=new Set(lines.pitch.map(line=>line.id));
  rest=[...lines.bench.map(line=>byId.get(line.id)&&row(byId.get(line.id),line)).filter(Boolean),...sheet.filter(player=>player.state==='off'&&!listed.has(player.id)).map(player=>row(player))];
 }else{
  const order=player=>POSITIONS.indexOf(player.role);
  on=sheet.filter(player=>player.state==='on').sort((a,b)=>order(a)-order(b)).map(player=>row(player));
  rest=[...sheet.filter(player=>player.state==='bench'),...sheet.filter(player=>player.state==='off')].map(player=>row(player));
 }
 const left=view.shown.manager.substitutions_left-(lines?lines.pitch.filter(line=>line.change==='in').length:0),formation=view.shown.opponent?.formation;
 const count=mine?`${left} changement${left>1?'s':''} restant${left>1?'s':''}`:formation?e(formation):'';
 const names=[view.state[view.state.side],view.state[sideOf(false)]];
 const pick=`<div class="segmented small fill" role="group" aria-label="Équipe"><button type="button" data-live-team="mine" class="${mine?'active':''}" aria-pressed="${mine}">${kitDot(names[0])}${e(names[0].name)}</button><button type="button" data-live-team="theirs" class="${mine?'':'active'}" aria-pressed="${!mine}">${kitDot(names[1])}${e(names[1].name)}</button></div>`;
 return `<div class="live-team-pick">${pick}</div><div class="live-scroll"><div class="section-title"><span class="label">Sur le terrain</span>${count?`<span class="aside">${count}</span>`:''}</div>`
  +`<div class="squad-rows ${mine?'mine':'theirs'}">${on.join('')}</div>${rest.length?`<div class="section-title"><span class="label">Remplaçants</span></div><div class="squad-rows ${mine?'mine':'theirs'}"${lines?' data-list-drop':''}>${rest.join('')}</div>`:''}</div>`;
}

// The user's tactic, changed in its card: the formation in a list, the mentality in a choice. While the draft holds a
// change, Annuler and Valider in the head (what the rules refuse before them); once validated, where it stands until the
// end of the action. Stopped on an injury or a red card, Reprendre goes on without a change.
function tacticHtml(){
 const manager=team(),draft=view.draft;
 if(view.status==='finished'||!draft)return `<div class="card-head"><h2>Tactique</h2></div><div class="card-body">${fact('Formation',e(manager.formation||'—'))}${fact('Mentalité',e(MENTALITIES[manager.mentality]||manager.mentality))}</div>`;
 const key=list=>[...list].sort().join(),roles=draft.slots.map(slot=>slot.role),changed=pending();
 const current=Object.entries(manager.formations).find(([,list])=>list.length===roles.length&&key(list)===key(roles))?.[0];
 const options=`${current?'':'<option value="" selected>—</option>'}${Object.keys(manager.formations).map(name=>`<option value="${e(name)}"${name===current?' selected':''}>${e(name)}</option>`).join('')}`;
 const choices=manager.mentalities.map(name=>`<button type="button" data-mentality="${e(name)}" class="${name===draft.mentality?'active':''}" aria-pressed="${name===draft.mentality}"${view.waiting?' disabled':''}>${MENTALITIES[name]||e(name)}</button>`).join('');
 const problems=changed?tacticsProblems(draft,manager,view.status==='halftime'):[];
 const actions=view.waiting?'<span class="waiting-status" role="status"><span class="ticker-run" aria-hidden="true"><i></i></span>À la fin de l’action</span><button type="button" class="button small" data-live="annuler">Annuler</button>'
  :changed?`${problems.length?`<span class="tactic-problem" role="status" title="${e(problems.join('\n'))}">${e(problems[0])}</span>`:''}<button type="button" class="button small" data-live="annuler">Annuler</button><button type="button" class="button small primary" data-live="valider"${problems.length?` aria-disabled="true" title="${e(problems.join('\n'))}"`:' title="Valider (Entrée)"'}>Valider</button>`
  :view.decision&&view.status!=='halftime'?'<button type="button" class="button small primary" data-live="reprendre" title="Reprendre (Espace)">Reprendre</button>':'';
 return `<div class="card-head"><h2>Tactique</h2><div class="tactic-actions">${actions}</div></div>`
  +`<div class="card-body tactic-edit"><div class="fact"><span>Formation</span><select data-live-formation aria-label="Formation" title="Formation (T)"${view.waiting?' disabled':''}>${options}</select></div><div class="fact"><span>Mentalité</span><div class="segmented small" role="group" aria-label="Mentalité">${choices}</div></div></div>`;
}

// Between two chances the pitch shows both sides in their formation, the side at home on the left attacking to the
// right: each player's shirt with his goals, his block with his name, his note and what else he did; at the top, each
// side's formation and mentality. The user's side stands as his draft has it, a substitute coming on wearing his shirt on
// the green; its shirts take a player dragged onto them, as the lines of the list do.
const FORMATION_DEPTH={gk:5,def:14,dm:22,cm:30,am:37,att:44};
function formationsHtml(){
 const teams=replayTeams(view.state);
 const side=key=>{
  const own=key===view.state.side,draft=own&&view.status!=='finished'?view.draft:null,sheet=sheetOf(key),byId=new Map(sheet.map(player=>[player.id,player]));
  const into=draft?new Set(tacticsOrders(draft,team()).filter(order=>order.type==='remplacement').map(order=>order.entrant)):new Set();
  const standing=draft?draft.slots.map((slot,index)=>({player:byId.get(slot.id),role:slot.role,index})).filter(item=>item.player)
   :sheet.filter(player=>player.state==='on'&&player.role).map(player=>({player,role:player.role,index:null}));
  const places=pitchLayout(standing.map(item=>item.role)),home=key==='home';
  const players=standing.map(({player,role,index},at)=>{
   // The upright layout laid down: its lines across the half, from the goal, its width down the pitch.
   const place=places[at],depth=FORMATION_DEPTH[place.line],x=home?depth:100-depth,y=home?place.x:100-place.x;
   const coming=into.has(player.id),drag=draft&&editable()&&!hurt(player);
   const second=coming?mark('sub-on waiting','Entrera','▲'):matchBlockNote(player.rating)+sheetMarks(player,{goals:false});
   const classes=['pitch-player',coming?'entering':'',draft&&hurt(player)&&!player.red?'invalid':'',draft&&view.picked===player.id?'picked':''].filter(Boolean).join(' ');
   return `<div class="${classes}"${draft?` data-slot="${index}"`:''}${drag?` data-player="${player.id}" draggable="true"`:''} style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%">${kitShirt(teams[key].major,teams[key].minor,shirtLabel(player,role),{goals:coming?0:player.goals})}`
    +`${playerBlock(e(shortName(player.name,player.short)),second)}</div>`;
  }).join('');
  const info=own?{...view.shown.manager,mentality:draft?.mentality??view.shown.manager.mentality}:view.shown.opponent;
  const tag=[own&&draft?formationOf(draft)??info?.formation:info?.formation,MENTALITIES[info?.mentality]].filter(Boolean).map(e).join(' · ');
  return `${players}${tag?`<span class="formation-tag ${key}">${tag}</span>`:''}`;
 };
 return side('home')+side('away');
}
// The name of the formation the draft stands in, when it is one of those the user can choose.
const formationOf=draft=>{const key=list=>[...list].sort().join(),roles=key(draft.slots.map(slot=>slot.role));return Object.entries(team().formations).find(([,list])=>key(list)===roles)?.[0];};

// The match's band, compact, the minute on its tile: grey while the clock runs, on the accent while a chance is played.
function heroHtml(state){
 const clock=`<span class="live-clock${state.status==='playing'?' running':''}">${clockLabel(state.status,matchMinute(state.second,halfEnd(state.result.events))+'′')}</span>`;
 return matchHero(state,'',{clock});
}
const clockLabel=(status,label)=>status==='halftime'?'MT':status==='finished'?'Fin':label;
// The score of the band; a goal turns the figure of the side that scored.
function heroScore(score){
 const figures=document.querySelectorAll('.match-hero.live .big-score i');
 score.forEach((goals,index)=>{
  const figure=figures[index];
  if(!figure||figure.textContent===String(goals))return;
  const scored=Number(figure.textContent)<goals;
  figure.textContent=goals;
  if(!scored)return;
  figure.classList.remove('flip');void figure.offsetWidth;figure.classList.add('flip');
  const tile=figure.closest('.match-score');tile.classList.remove('scored');void tile.offsetWidth;tile.classList.add('scored');
 });
}

// After the final whistle nothing is left to order: Continuer, on the pitch, closes the day.
function actionsHtml(){
 if(view.status==='finished')return '';
 return '<button type="button" class="button" data-live="fin">Fin du match</button>';
}

// The stats card patched in place: each bar slides to its new share and a figure that changed lights up.
function patchStats(slot,html){
 const now=slot.querySelectorAll('.comparison');
 if(!now.length){slot.innerHTML=html;return;}
 const next=new DOMParser().parseFromString(html,'text/html').querySelectorAll('.comparison');
 next.forEach((line,index)=>{
  const current=now[index];
  if(!current){slot.innerHTML=html;return;}
  const [a,b]=[...current.children].filter(node=>node.tagName==='SPAN'),[c,d]=[...line.children].filter(node=>node.tagName==='SPAN');
  for(const [old,fresh] of [[a,c],[b,d]]){
   if(old.textContent!==fresh.textContent){old.textContent=fresh.textContent;old.classList.remove('bump');void old.offsetWidth;old.classList.add('bump');}
   old.classList.toggle('lead',fresh.classList.contains('lead'));
  }
  const bars=current.querySelectorAll('.comparison-bar>i'),wanted=line.querySelectorAll('.comparison-bar>i');
  bars.forEach((bar,at)=>{bar.style.flexGrow=wanted[at].style.flexGrow;});
  current.querySelector('.comparison-bar')?.classList.toggle('none',line.querySelector('.comparison-bar').classList.contains('none'));
 });
}

// Redraws what shows the user's side: its players, its tactic, its shirts on the pitch. A drag under way is left alone:
// what changed is drawn when it ends.
let dragged=null;
function redraw(){
 const root=document.querySelector('.live-layout');if(!root)return;
 if(dragged!=null){view.stale=true;return;}
 view.stale=false;
 const squad=root.querySelector('.live-squad'),scroll=squad.querySelector('.live-scroll')?.scrollTop;
 squad.innerHTML=squadHtml();
 if(scroll)squad.querySelector('.live-scroll').scrollTop=scroll;
 root.querySelector('.live-tactic').innerHTML=tacticHtml();
 const formations=root.querySelector('.live-formations');if(formations)formations.innerHTML=formationsHtml();
}
function refresh(parts=['actions']){
 const root=document.querySelector('.live-layout');if(!root)return;
 if(parts.includes('actions')){const slot=root.querySelector('.live-actions');if(slot)slot.innerHTML=actionsHtml();}
 if(parts.includes('stats')){patchStats(root.querySelector('.live-stats'),statsCard(view.shown));drawFlow();}
 if(parts.includes('stats')||parts.includes('side'))redraw();
}
const replay=()=>document.querySelector('.live-layout match-replay');

// ---- Orders. ----
// Valider sends the draft once the action under way has ended (at once between two chances, at the break or on an
// injury); the match goes on, except at the break and when the action ended on an injury or a red card in the user's
// side, which still waits for him. Annuler drops the draft, and the wait for the end of the action.
async function validate(){
 const halftime=view.status==='halftime',asked=view.decision;
 if(view.waiting||!pending()||tacticsProblems(view.draft,team(),halftime).length)return;
 view.waiting=true;refresh(['side']);
 const rewind=await replay()?.interrupt();
 if(rewind===false)return;
 if(view.waiting){
  try{
   const state=await api('/direct/ordres',{commande_id:crypto.randomUUID(),seconde:rewind??null,ordres:tacticsOrders(view.draft,team())});
   adopt(state);replay()?.resync(state);
  }catch(error){toast(error.message,true);}
 }
 // An injury or a red card met while the orders waited for the end of the action: the match stays stopped on it.
 const met=view.decision&&view.decision!==asked?view.decision:null;
 view.waiting=false;view.decision=met;view.draft=tacticsDraft(team());
 refresh(['actions','stats']);
 if(met)replay()?.stopFor(met);
 else if(view.status!=='halftime')replay()?.resume();
}
function cancel(){
 if(view.waiting){view.waiting=false;replay()?.cancelInterrupt();}
 view.draft=tacticsDraft(team());view.picked=null;
 refresh(['side']);
}
// Stopped on an injury or a red card: the match goes on as it stands.
function goOn(){view.decision=null;refresh(['side']);replay()?.resume();}
async function endMatch(){
 view.waiting=false;
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
 view.status='finished';view.waiting=false;view.decision=null;view.picked=null;
 refresh(['actions','stats']);
 document.dispatchEvent(new CustomEvent('live-status'));
}
// The whole match as the server has it after new orders: what had been fetched before them is gone.
function adopt(state){view.state=state;view.status=state.status;view.shown=state;view.pending=null;view.score=[...state.score];view.events=[...state.result.events];syncDraft();}
// A change made by a drop, or by picking one line then another: `target` is a place of the draft (`slot`), a substitute
// (`bench`) or the bench itself (`list`), where a substitute coming on is sent back.
function dropOn(id,target){
 const draft=view.draft,manager=team(),from=draft.slots.findIndex(slot=>slot.id===id);
 if(target.slot!=null)view.draft=placeInDraft(draft,manager,id,target.slot);
 else if(target.bench!=null&&from>=0)view.draft=placeInDraft(draft,manager,target.bench,from);
 else if(target.list&&from>=0)view.draft=benchInDraft(draft,manager,id);
 view.picked=null;
 redraw();
}
const targetOf=node=>node.dataset.slot!=null?{slot:Number(node.dataset.slot)}:node.dataset.bench!=null?{bench:Number(node.dataset.bench)}:'listDrop' in node.dataset?{list:true}:null;

export async function liveScreen(){
 const [state,others]=await Promise.all([api('/direct'),api('/direct/multiplex')]);
 view={state,others,status:state.status,shown:state,score:[...state.score],events:[...state.result.events],decision:null,waiting:false,picked:null,draft:tacticsDraft(state.manager),minute:null,pending:null,team:view?.team??'mine',second:state.second};
 const next=()=>api('/direct/avancer',{commande_id:crypto.randomUUID()});
 const teams=replayTeams(state);
 // The commentary and the goal carry the crest of a club; a selection has none.
 for(const side of ['home','away'])if(!state[side].national)teams[side].crest=`/crests/TCM1_${state[side].id}.png`;
 // The replay builds itself once the page is drawn: its formations, its commands and the flow under them are filled then.
 setTimeout(()=>{refresh(['actions','stats']);centreOwnRow();});
 return `<div class="live-layout">
<div class="live-column"><section class="card live-squad">${squadHtml()}</section><section class="card live-tactic">${tacticHtml()}</section></div>
<div class="live-column live-centre">${heroHtml(state)}${liveReplay(state,teams,next)}</div>
<div class="live-column"><section class="card live-highlights">${highlightsHtml()}</section><div class="live-stats">${statsCard(state)}</div><section class="card live-others">${othersHtml(state.second)}</section></div></div>`;
}
// The table opens on the user's club, in the middle of its lines, the first of them whole under the head.
function centreOwnRow(){
 const box=document.querySelector('.live-table-scroll'),row=box?.querySelector('tr.own');
 if(!box||!row)return;
 const lines=Math.floor((box.clientHeight-box.querySelector('thead').offsetHeight)/row.offsetHeight);
 box.scrollTop=Math.max(0,(row.sectionRowIndex-Math.floor((lines-1)/2))*row.offsetHeight);
}

// The replay tells how far the viewer has got; everything else on the screen follows it.
globalThis.document?.addEventListener('live-segment',event=>{
 if(!view)return;
 // The stats of a segment are shown once it has played out: those of the previous one when the next is fetched.
 if(view.pending){view.shown=view.pending;syncDraft();refresh(['stats']);}
 const known=new Set(view.events.map(item=>item.sequence));
 view.events.push(...event.detail.result.events.filter(item=>!known.has(item.sequence)));
 view.pending=event.detail;view.status=event.detail.status==='finished'?view.status:event.detail.status;
});
const settle=event=>{if(!view)return;view.shown=event.detail;view.pending=null;syncDraft();};
// An injury or a red card on the last action of the half is dealt with at the break: the player is marked there.
globalThis.document?.addEventListener('live-halftime',event=>{if(!view)return;settle(event);view.status='halftime';view.decision=event.detail.decision??null;refresh(['actions','stats']);});
// An injury or a red card in the user's side holds the match until he changes something or goes on.
globalThis.document?.addEventListener('live-decision',event=>{
 if(!view)return;settle(event);view.decision=event.detail.decision;view.team='mine';
 refresh(['actions','stats']);
});
// The play button of a match stopped on an injury or a red card goes on, as Reprendre does.
globalThis.document?.addEventListener('live-go-on',()=>{if(view?.decision)goOn();});
globalThis.document?.addEventListener('live-finished',()=>{if(!view)return;if(view.pending){view.shown=view.pending;view.pending=null;}finished();});
globalThis.document?.addEventListener('live-error',event=>toast(event.detail.error?.message||'Le match ne peut pas continuer.',true));
// Each minute the other matches, the table, the highlights, the flow and the players' sheet catch up with the clock.
const updateOthers=second=>{
 const others=document.querySelector('.live-others');
 if(others){
  const box=others.querySelector('.live-table-scroll'),scroll=box?.scrollTop,games=others.querySelector('.live-games')?.scrollTop;
  others.innerHTML=othersHtml(second);
  if(box)others.querySelector('.live-table-scroll').scrollTop=scroll;
  if(games)others.querySelector('.live-games').scrollTop=games;
 }
 const highlights=document.querySelector('.live-highlights');
 if(highlights){const scroll=highlights.querySelector('.highlights-scroll')?.scrollTop;highlights.innerHTML=highlightsHtml();if(scroll)highlights.querySelector('.highlights-scroll').scrollTop=scroll;}
 drawFlow();
};
// The minute on the band: grey while the clock runs between chances, on the accent while one is played; MT at the break.
const clockTile=()=>document.querySelector('.match-hero.live .live-clock');
globalThis.document?.addEventListener('replay-phase',event=>{
 if(!view)return;
 const clock=clockTile(),phase=event.detail.phase;
 clock?.classList.toggle('running',phase==='dead');
 if(clock&&(phase==='halftime'||phase==='finished'))clock.textContent=clockLabel(phase,'');
});
globalThis.document?.addEventListener('replay-clock',event=>{
 if(!view)return;
 const minute=Math.floor(event.detail.second/60),clock=clockTile();
 view.second=event.detail.second;
 if(clock&&view.status!=='halftime'&&view.status!=='finished')clock.textContent=event.detail.label;
 if(minute!==view.minute){view.minute=minute;updateOthers(event.detail.second);const squad=document.querySelector('.live-squad');if(squad&&shownChanges().size!==view.changes?.size)refresh(['stats']);}
});
globalThis.document?.addEventListener('replay-score',event=>{if(!view)return;view.score=event.detail.score;heroScore(view.score);updateOthers(view.second??0);});
globalThis.addEventListener?.('resize',()=>{if(view&&document.querySelector('.live-layout'))drawFlow();});
globalThis.document?.addEventListener('change',event=>{
 const select=event.target.closest?.('.live-layout [data-live-formation]');
 if(!view||!select||!select.value)return;
 view.draft=formationInDraft(view.draft,team().formations[select.value]);redraw();
});
globalThis.document?.addEventListener('click',event=>{
 if(!view||!document.querySelector('.live-layout'))return;
 const target=event.target;
 const team=target.closest?.('.live-layout [data-live-team]');
 if(team){view.team=team.dataset.liveTeam;view.picked=null;redraw();return;}
 const mentality=target.closest?.('.live-layout [data-mentality]');
 if(mentality&&editable()){view.draft={...view.draft,mentality:mentality.dataset.mentality};redraw();return;}
 const undo=target.closest?.('.live-layout [data-undo]');
 if(undo){dropOn(Number(undo.dataset.undo),{list:true});return;}
 const advice=target.closest?.('.live-layout [data-advice]');
 if(advice&&editable()){const slot=view.draft.slots.findIndex(item=>item.id===Number(advice.dataset.advice));if(slot>=0)dropOn(Number(advice.dataset.adviceIn),{slot});return;}
 const button=target.closest?.('.live-layout [data-live]');
 if(button){
  const action=button.dataset.live;
  if(action==='valider')validate();
  else if(action==='annuler')cancel();
  else if(action==='reprendre')goOn();
  else if(action==='second-half'){view.status='playing';view.decision=null;refresh(['actions','side']);replay()?.resume();}
  else if(action==='fin')endMatch();
  else if(action==='continuer')document.querySelector('#advance')?.click();
  return;
 }
 // A line of the user's side picked, then another: the same change as a drop of the first on the second.
 const line=target.closest?.('.live-squad .squad-rows.mine .squad-row,.live-formations .pitch-player[data-slot]');
 if(!line||!editable()||target.closest('button'))return;
 const picked=view.picked,drop=targetOf(line);
 if(picked==null){if(line.dataset.player){view.picked=Number(line.dataset.player);redraw();}return;}
 if(Number(line.dataset.player)===picked||!drop){view.picked=null;redraw();return;}
 dropOn(picked,drop);
});
// The keys of a player: Space plays and pauses, → runs the clock to the next chance, T reaches the tactic, Entrée sends
// the draft, Échap drops a line picked.
globalThis.document?.addEventListener('keydown',event=>{
 if(!view||!document.querySelector('.live-layout')||event.ctrlKey||event.metaKey||event.altKey)return;
 if(event.key==='Escape'&&view.picked!=null){view.picked=null;redraw();return;}
 if(document.querySelector('dialog[open]')||event.target.closest?.('input,select,textarea,[contenteditable]'))return;
 const press=selector=>{const button=document.querySelector(`.live-layout ${selector}`);if(button&&!button.hidden){event.preventDefault();button.click();}};
 if(event.key===' '&&!event.target.closest?.('button,.card-head.toggle'))press('[data-replay="play"]');
 else if(event.key==='ArrowRight')press('[data-replay="next"]');
 else if(event.key==='Enter'&&pending()&&!event.target.closest?.('button'))press('[data-live="valider"]');
 else if((event.key==='t'||event.key==='T')&&view.status!=='finished'){event.preventDefault();document.querySelector('.live-tactic select')?.focus();}
});

// Drag and drop on the user's side: a line of the list or a shirt of the pitch, onto another line or shirt, or back to the bench.
if(globalThis.document){
 const mine=node=>node?.closest?.('.live-squad .squad-rows.mine,.live-formations');
 const dropTarget=node=>node.closest?.('.live-squad .squad-rows.mine [data-slot],.live-squad .squad-rows.mine [data-bench],.live-squad [data-list-drop],.live-formations .pitch-player[data-slot]');
 const clear=except=>document.querySelectorAll('.live-layout .drop-hover').forEach(item=>item!==except&&item.classList.remove('drop-hover'));
 document.addEventListener('dragstart',event=>{
  const source=event.target.closest?.('[data-player][draggable="true"]');
  if(!view||!source||!mine(source)||!editable())return;
  dragged=Number(source.dataset.player);view.picked=null;
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',String(dragged));
  // The ghost: the line's shirt and name from the list, the shirt and its block from the pitch.
  const ghost=source.cloneNode(true);
  if(source.classList.contains('squad-row')){ghost.className='squad-row drag-ghost';while(ghost.children.length>2)ghost.lastElementChild.remove();}
  else ghost.className='pitch-player drag-token';
  document.body.append(ghost);
  event.dataTransfer.setDragImage(ghost,source.classList.contains('squad-row')?18:ghost.offsetWidth/2,source.classList.contains('squad-row')?15:18);
  setTimeout(()=>ghost.remove());
  source.classList.add('dragging');
 });
 document.addEventListener('dragend',event=>{if(dragged==null)return;dragged=null;event.target.classList?.remove('dragging');clear();if(view?.stale)redraw();});
 document.addEventListener('dragover',event=>{
  if(dragged==null)return;
  const target=dropTarget(event.target);if(!target)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';
  clear(target);target.classList.add('drop-hover');
 });
 document.addEventListener('drop',event=>{
  if(dragged==null||!view?.draft)return;
  const target=dropTarget(event.target),drop=target&&targetOf(target);if(!drop)return;
  event.preventDefault();
  const id=dragged;dragged=null;clear();
  dropOn(id,drop);
 });
}
