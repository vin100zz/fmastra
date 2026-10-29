// The human club's match played live (docs/ui.md, « Match en direct »): the whole screen in the window, three columns.
// On the left the players of either side, then the tactic; in the middle the match's band, the 2D pitch fed one segment
// at a time with its commentary, the whole match on a line and the commands; on the right the highlights, the stats,
// the other matches of the day and the table as it stands. The screen is modal until the final whistle.
import {api,escape as e,matchNote,roundTitle,kitDot,kitShirt,shirtLabel,playerBlock,matchNoteBadge,matchBlockNote,PITCH_BOXES,position,group,shortName,toast,fact,empty,matchMinute,halfEnd} from './ui.js';
import {liveReplay} from './match-replay.js';
import {replayTeams,statsCard} from './match.js';
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

// The day's matches, the viewer's first, then the table as it would stand now, scrolling in its card: a club that has
// gained or lost places since the day began says so before its name; a score that has just changed lights up.
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
 const table=standings?`<div class="live-table-scroll standings"><table class="live-table"><thead><tr><th class="rank-column">#</th><th></th><th>CLUB</th><th class="total-column">PTS</th><th class="count-column">V</th><th class="count-column">N</th><th class="count-column">D</th><th class="total-column">BP</th><th class="total-column">BC</th><th class="difference-column">DIFF.</th></tr></thead><tbody>${standings.map((row,index)=>{const difference=row.goals_for-row.goals_against;return `<tr class="${row.club.id===own?'own':''}"><td><span class="rank">${index+1}</span></td><td>${move(row.club.id)}</td><td>${kitDot(row.club)}${e(row.club.name)}</td><td><b>${row.points}</b></td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.goals_for}</td><td>${row.goals_against}</td><td>${difference>0?`+${difference}`:difference}</td></tr>`;}).join('')}</tbody></table></div>`:'';
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
const mark=(className,title,text='')=>`<span class="match-mark ${className}" title="${e(title)}">${text}</span>`;
const named=(name,short,title=name)=>{const shown=shortName(name,short);return `<span${title&&shown!==title?` title="${e(title)}"`:''}>${e(shown)}</span>`;};
// The highlights in two sections: the goals, each with the score it made, the figure of the side that scored in bold
// and its minute by the ball; then the cards, injuries and penalties missed, the minute in the middle as on the report.
function highlightsHtml(){
 const events=shownHighlights(view.events,view.second??view.state.second,view.score,view.state.home.id);
 const head='<div class="card-head"><h2>Temps forts</h2></div>';
 if(!events.length)return `${head}<div class="card-body">${empty('Ni but, ni carton, ni blessure')}</div>`;
 const half=halfEnd(view.events),minute=event=>`${matchMinute(event.second,half,event.period)}′`,home=event=>event.team_id===view.state.home.id;
 const score=[0,0],goals=events.filter(event=>event.kind==='goal').map(event=>{
  const side=home(event)?0:1;score[side]++;
  const passer=event.detail==='penalty'?'<small title="Sur penalty">pen.</small>':event.secondary?`<small title="${e(`Passe de ${event.secondary}`)}">${e(shortName(event.secondary,event.secondary_short))}</small>`:'';
  const who=`<span class="highlight-names"><strong>${named(event.player||'—',event.player_short)}</strong>${passer}</span>`,ball=`<span class="marks">${mark('goal','But')}</span><span class="minute">${minute(event)}</span>`;
  const figures=side?`${score[0]} – <b>${score[1]}</b>`:`<b>${score[0]}</b> – ${score[1]}`;
  return `<div class="goal-row"><div class="highlight home">${side?'':who+ball}</div><span class="fixture-score">${figures}</span><div class="highlight away">${side?ball+who:''}</div></div>`;
 });
 const saved=new Set(view.events.filter(event=>event.kind==='save').map(event=>event.shot_id));
 const others=events.filter(event=>event.kind!=='goal').map(event=>{
  const marks=event.kind==='injury'?mark('injury','Blessure'):event.kind==='yellow'?mark('booking yellow','Carton jaune')
   :event.kind==='shot'?mark('missed',saved.has(event.shot_id)?'Penalty arrêté':'Penalty manqué')
   :event.detail==='second_yellow'?mark('booking yellow','Carton jaune')+mark('booking red','Deuxième carton jaune'):mark('booking red','Carton rouge');
  const content=`<span class="marks">${marks}</span><span class="highlight-names"><strong>${named(event.player||'—',event.player_short)}</strong></span>`;
  return `<div class="highlight-row"><div class="highlight home">${home(event)?content:''}</div><span class="minute">${minute(event)}</span><div class="highlight away">${home(event)?'':content}</div></div>`;
 });
 // A goal just shown lights its line up.
 const fresh=goals.length>(view.goalsShown??goals.length);
 view.goalsShown=goals.length;
 if(fresh)goals[goals.length-1]=goals.at(-1).replace('class="goal-row"','class="goal-row flash"');
 return `${head}${goals.length?`<div class="section-title"><span class="label">Buts</span></div><div class="goal-rows">${goals.join('')}</div>`:''}`
  +`${others.length?`<div class="section-title"><span class="label">Cartons, blessures, penaltys</span></div><div class="highlights">${others.join('')}</div>`:''}`;
}

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

const SWAP='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5h9l-2.5-2.5M13 11H4l2.5 2.5"/></svg>';
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

// One side's players, a line each: those on the pitch, in the order of their places, then the substitutes, then those who
// went off. The shirt and its number, the position, the whole name, what he did, his note; for the user's side, his
// fatigue and the assistant's advice.
function squadHtml(){
 const mine=view.team!=='theirs',side=sideOf(mine),kit=replayTeams(view.state)[side],sheet=sheetOf(side);
 view.changes=shownChanges();
 const advice=mine?assistantAdvice(sheet,view.shown.manager.substitutions_left,view.status):{out:new Map(),into:new Map()};
 const row=player=>{
  const tired=Math.round((1-player.fitness)*100),out=advice.out.get(player.id),into=advice.into.get(player.id);
  const tip=out?`L’adjoint ferait entrer ${out.sub.name} : ${out.reasons.join(', ')}`:into?`L’adjoint le ferait entrer à la place de ${into.name}`:'';
  const chip=tip?`<button type="button" class="advice${into?' in':''}" data-live="tactique" title="${e(tip)}" aria-label="${e(tip)}">${SWAP}</button>`:'<span></span>';
  const fatigue=mine?`<span class="fatigue" title="Fatigue ${tired} %"><span class="gauge${tired>=70?' bad':tired>=50?' warn':''}"><i style="width:${Math.min(100,tired)}%"></i></span>${tired} %</span>`:'';
  return `<div class="squad-row ${player.state}${out?' advised':''}">${kitShirt(kit.major,kit.minor,shirtLabel(player,player.role??player.position))}`
   +`<span class="squad-who">${position(player.role??player.position)}<span class="squad-name" title="${e(player.name)}">${e(player.name)}</span></span>`
   +`<span class="marks">${sheetMarks(player)}</span>${matchNoteBadge(player.rating)||'<span></span>'}${mine?fatigue+chip:''}</div>`;
 };
 const order=player=>POSITIONS.indexOf(player.role);
 const on=sheet.filter(player=>player.state==='on').sort((a,b)=>order(a)-order(b));
 const rest=[...sheet.filter(player=>player.state==='bench'),...sheet.filter(player=>player.state==='off')];
 const left=view.shown.manager.substitutions_left,formation=view.shown.opponent?.formation;
 const count=mine?`${left} changement${left>1?'s':''} restant${left>1?'s':''}`:formation?e(formation):'';
 const names=[view.state[view.state.side],view.state[sideOf(false)]];
 const pick=`<div class="segmented small fill" role="group" aria-label="Équipe"><button type="button" data-live-team="mine" class="${mine?'active':''}" aria-pressed="${mine}">${kitDot(names[0])}${e(names[0].name)}</button><button type="button" data-live-team="theirs" class="${mine?'':'active'}" aria-pressed="${!mine}">${kitDot(names[1])}${e(names[1].name)}</button></div>`;
 return `<div class="live-team-pick">${pick}</div><div class="live-scroll"><div class="section-title"><span class="label">Sur le terrain</span>${count?`<span class="aside">${count}</span>`:''}</div>`
  +`<div class="squad-rows ${mine?'mine':'theirs'}">${on.map(row).join('')}</div>${rest.length?`<div class="section-title"><span class="label">Remplaçants</span></div><div class="squad-rows ${mine?'mine':'theirs'}">${rest.map(row).join('')}</div>`:''}</div>`;
}

// The user's tactic: its formation and mentality; « Modifier » opens the Tactique panel.
function tacticHtml(){
 const manager=view.shown.manager,open=view.status!=='finished';
 return `<div class="card-head"><h2>Tactique</h2>${open?'<button type="button" class="button small" data-live="tactique" title="Tactique (T)">Modifier</button>':''}</div>`
  +`<div class="card-body">${fact('Formation',e(manager.formation||'—'))}${fact('Mentalité',e(MENTALITIES[manager.mentality]||manager.mentality))}</div>`;
}

// Between two chances the pitch shows both sides in their formation, the side at home on the left attacking to the
// right: each player's shirt with his goals, his block with his name, his note and what else he did; at the top, each
// side's formation and mentality.
const FORMATION_DEPTH={gk:5,def:14,dm:22,cm:30,am:37,att:44};
function formationsHtml(){
 const teams=replayTeams(view.state);
 const side=key=>{
  const sheet=sheetOf(key).filter(player=>player.state==='on'&&player.role),places=pitchLayout(sheet.map(player=>player.role)),home=key==='home';
  const players=sheet.map((player,index)=>{
   // The upright layout laid down: its lines across the half, from the goal, its width down the pitch.
   const place=places[index],depth=FORMATION_DEPTH[place.line],x=home?depth:100-depth,y=home?place.x:100-place.x;
   return `<div class="pitch-player" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%">${kitShirt(teams[key].major,teams[key].minor,shirtLabel(player,player.role),{goals:player.goals})}`
    +`${playerBlock(e(shortName(player.name,player.short)),matchBlockNote(player.rating)+sheetMarks(player,{goals:false}))}</div>`;
  }).join('');
  const own=key===view.state.side,info=own?view.shown.manager:view.shown.opponent;
  const tag=[info?.formation,MENTALITIES[info?.mentality]].filter(Boolean).map(e).join(' · ');
  return `${players}${tag?`<span class="formation-tag ${key}">${tag}</span>`:''}`;
 };
 return side('home')+side('away');
}

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
// What a player did, as far as the match has shown it: a ball for each goal (unless `goals` is false, on the pitch where
// they stand on his shirt), his cards, his injury.
const shownSheet=id=>view.shown?.manager?.squad?.find(player=>player.id===id);
const shownGoals=player=>shownSheet(player.id)?.goals??0;
const marks=(player,{goals=true}={})=>{
 const sheet=shownSheet(player.id),yellows=sheet?.yellows??player.yellows??0;
 return '<span class="match-mark goal"></span>'.repeat(goals?shownGoals(player):0)+'<span class="match-mark booking yellow"></span>'.repeat(sheet?.red?Math.min(1,yellows):yellows)
  +(sheet?.red?'<span class="match-mark booking red"></span>':'')+(hurt(player)?'<span class="match-mark injury" aria-label="Blessé"></span>':'');
};
// The block under a player of the pitch: his name, then his note and what else he did.
const tacticsBlock=player=>playerBlock(e(shortName(player.name,player.short)),matchBlockNote(shownSheet(player.id)?.rating)+marks(player,{goals:false}));

// The shirt of the user's side, with the player's number (a position without one) and his goals on it.
const ownShirt=(player,role,goals=0)=>{const kit=replayTeams(view.state)[view.state.side];return kitShirt(kit.major,kit.minor,shirtLabel(player,role),{goals});};
function tacticsSlotHtml(slot,place,index,byId){
 const player=byId.get(slot.id);
 return `<div class="pitch-player lineup-slot ${group(slot.role)}${hurt(player)?' invalid':''}" data-slot="${index}"${player.injured?'':` data-player="${player.id}" draggable="true"`} style="left:${place.x}%;top:${place.y}%" title="${e(player.name)}">${ownShirt(player,slot.role,shownGoals(player))}${tacticsBlock(player)}</div>`;
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

function refresh(parts=['actions']){
 const root=document.querySelector('.live-layout');if(!root)return;
 if(parts.includes('actions')){const slot=root.querySelector('.live-actions');if(slot)slot.innerHTML=actionsHtml();}
 if(parts.includes('stats')){
  patchStats(root.querySelector('.live-stats'),statsCard(view.shown));
  const squad=root.querySelector('.live-squad'),scroll=squad.querySelector('.live-scroll')?.scrollTop;
  squad.innerHTML=squadHtml();
  if(scroll)squad.querySelector('.live-scroll').scrollTop=scroll;
  root.querySelector('.live-tactic').innerHTML=tacticHtml();
  const formations=root.querySelector('.live-formations');if(formations)formations.innerHTML=formationsHtml();
 }
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
 view={state,others,manager:state.manager,status:state.status,shown:state,score:[...state.score],events:[...state.result.events],panel:false,decision:null,rewind:null,draft:null,minute:null,pending:null,team:view?.team??'mine',second:state.second};
 const next=()=>api('/direct/avancer',{commande_id:crypto.randomUUID()});
 const teams=replayTeams(state);
 // The commentary and the goal carry the crest of a club; a selection has none.
 for(const side of ['home','away'])if(!state[side].national)teams[side].crest=`/crests/TCM1_${state[side].id}.png`;
 // The replay builds itself once the page is drawn: its formations and its commands are filled then.
 setTimeout(()=>{refresh(['actions','stats']);centreOwnRow();});
 return `<div class="live-layout">
<div class="live-column"><section class="card live-squad">${squadHtml()}</section><section class="card live-tactic">${tacticHtml()}</section></div>
<div class="live-column live-centre">${heroHtml(state)}${liveReplay(state,teams,next)}</div>
<div class="live-column"><section class="card live-highlights">${highlightsHtml()}</section><div class="live-stats">${statsCard(state)}</div><section class="card live-others">${othersHtml(state.second)}</section></div></div>`;
}
// The table opens on the user's club, in the middle of its card.
function centreOwnRow(){
 const box=document.querySelector('.live-table-scroll'),row=box?.querySelector('tr.own');
 if(box&&row)box.scrollTop=row.offsetTop-box.clientHeight/2+row.offsetHeight/2;
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
// Each minute the other matches, the table, the highlights and the players' sheet catch up with the clock.
const updateOthers=second=>{
 const others=document.querySelector('.live-others');
 if(others){const box=others.querySelector('.live-table-scroll'),scroll=box?.scrollTop;others.innerHTML=othersHtml(second);if(box)others.querySelector('.live-table-scroll').scrollTop=scroll;}
 const highlights=document.querySelector('.live-highlights');if(highlights)highlights.innerHTML=highlightsHtml();
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
globalThis.document?.addEventListener('click',event=>{
 if(!view)return;
 if(view.draft&&event.target.closest?.('#live-tactics')){
  const mentality=event.target.closest('[data-mentality]'),formation=event.target.closest('[data-formation]');
  if(mentality){view.draft={...view.draft,mentality:mentality.dataset.mentality};renderTactics();return;}
  if(formation){view.draft=formationInDraft(view.draft,view.manager.formations[formation.dataset.formation]);renderTactics();return;}
 }
 const team=event.target.closest?.('.live-layout [data-live-team]');
 if(team){view.team=team.dataset.liveTeam;refresh(['stats']);return;}
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
// The keys of a player: Space plays and pauses, → runs the clock to the next chance, T opens the tactic.
globalThis.document?.addEventListener('keydown',event=>{
 if(!view||!document.querySelector('.live-layout')||event.ctrlKey||event.metaKey||event.altKey)return;
 if(document.querySelector('dialog[open]')||event.target.closest?.('input,select,textarea,[contenteditable]'))return;
 const press=selector=>{const button=document.querySelector(`.live-layout ${selector}`);if(button&&!button.hidden){event.preventDefault();button.click();}};
 if(event.key===' '&&!event.target.closest?.('button,.card-head.toggle'))press('[data-replay="play"]');
 else if(event.key==='ArrowRight')press('[data-replay="next"]');
 else if((event.key==='t'||event.key==='T')&&view.status!=='finished'){event.preventDefault();openPanel();}
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
  token.innerHTML=`${ownShirt(player,role,shownGoals(player))}${tacticsBlock(player)}`;
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
