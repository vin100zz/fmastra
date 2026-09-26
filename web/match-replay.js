// A top-down replay of the chances of a match: each possession that ended in a shot is drawn from the
// engine's own trail (start, zones crossed, delivery, shot, outcome); the play in between is only suggested.
//
// The ball always belongs to someone. A carrier dribbles it at his feet; a pass flies to where the receiver
// is *now*, not where he stood when it was struck, so it never lands in empty grass. Every other player
// glides towards a target recomputed each frame from the ball, with frame-rate independent smoothing.
import {escape as e,surname} from './ui.js';

const W=105,H=68;
// The engine's grid in a side's own frame: u from its goal (0) to the opponent's (1), v from its left to its right.
const ZONE_U=[.14,.37,.62,.84],LANE_V=[.17,.5,.83];
const DEPTH={GB:.02,DC:.17,DL:.2,DR:.2,MDC:.33,MC:.46,MOC:.58,AILG:.68,AILD:.68,BU:.74};
const SEQUENCE_KINDS=new Set(['possession','progress','corner','free_kick','delivery','shot','goal','save','off_target']);
// Which chances the summary plays, by the engine's xG (0.05 for a corner or free kick, up to about 0.25 for a
// clean shot); goals are always shown. Remembered for the viewer between matches.
const FILTERS=[['0','Toutes les occasions'],['0.1','Occasions nettes (xG ≥ 0,10)'],['0.2','Grosses occasions (xG ≥ 0,20)'],['goals','Buts seulement']];
const FILTER_KEY='touchline-replay-filter';
const NOTABLE={yellow:'Carton jaune',red:'Carton rouge',injury:'Blessure',substitution:'Changement'};
// Players reach their moving targets like a critically damped spring: about the lag of a real block, never
// faster than a sprint (in pitch metres per ms of replay), so a target that jumps does not make them teleport.
const FOLLOW_MS=420,TOP_SPEED=.018,TURN_MS=140;
// Scripted runs (a receiver meeting a pass, a scorer attacking a cross) may go a little faster than the block.
const RUN_SPEED=.026;
// Between chances the clock runs at this many ms of replay per match minute; chances play this much faster than life-like.
const MS_PER_MINUTE=90,CHANCE_TEMPO=2.4;
// Pass-like flights decelerate; a shot even more; a lofted delivery hangs; a carry starts and stops gently.
const EASE={pass:k=>1-(1-k)**2.2,cross:k=>1-(1-k)**1.7,shot:k=>1-(1-k)**3,place:k=>k*k*(3-2*k)};
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
const lerp=(a,b,k)=>a+(b-a)*k;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Minutes as a broadcast shows them: 0 to 45, 45+1…, then 45 to 90, 90+1…; `half` is when the first half ended.
const clockLabel=(second,half)=>{const late=second>half,value=Math.floor((late?second-half:second)/60)+(late?45:0),cap=late?90:45;return value>=cap?`${cap}+${value-cap+1}′`:`${value}′`;};
// Stable jitter, so a chance looks the same each time it is replayed.
const seeded=seed=>()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const SVG='http://www.w3.org/2000/svg';
const svg=(tag,attributes={})=>{const node=document.createElementNS(SVG,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);return node;};

// The possessions that ended in a shot, in order. Saves made before the replay trail existed only hold the shot.
export function chanceSequences(events){
 const groups=new Map();
 for(const event of events){
  if(event.period===3||event.possession_id==null||!SEQUENCE_KINDS.has(event.kind))continue;
  if(!groups.has(event.possession_id))groups.set(event.possession_id,[]);
  groups.get(event.possession_id).push(event);
 }
 return [...groups.values()].filter(group=>group.some(event=>event.kind==='shot')).map(group=>{
  const shot=group.find(event=>event.kind==='shot');
  const outcome=group.find(event=>['goal','save','off_target'].includes(event.kind)&&event.shot_id===shot.shot_id);
  return {id:shot.possession_id,team:shot.team_id,period:shot.period,second:group[0].second,end:(outcome||shot).second,
          start:group.find(event=>event.kind==='possession'),progress:group.filter(event=>event.kind==='progress'),
          setPiece:group.find(event=>event.kind==='corner'||event.kind==='free_kick'),delivery:group.find(event=>event.kind==='delivery'),
          shot,outcome,goal:outcome?.kind==='goal'};
 });
}

// Where each starter stands in his side's frame, spread along his line like the lineup pitch.
function baseShape(roster){
 const rows=new Map();
 for(const player of roster){if(player.position==='AILG'||player.position==='AILD')continue;const line=['DL','DC','DR'].includes(player.position)?'D':player.position;if(!rows.has(line))rows.set(line,[]);rows.get(line).push(player);}
 const order={DL:0,DC:1,DR:2};
 for(const row of rows.values())row.sort((a,b)=>(order[a.position]??1)-(order[b.position]??1));
 return roster.map(player=>{
  if(player.position==='AILG')return {...player,u:DEPTH.AILG,v:.12};
  if(player.position==='AILD')return {...player,u:DEPTH.AILD,v:.88};
  const row=rows.get(['DL','DC','DR'].includes(player.position)?'D':player.position),index=row.indexOf(player);
  return {...player,u:DEPTH[player.position]??.45,v:player.position==='GB'?.5:.5+(index-(row.length-1)/2)*Math.min(.3,.78/Math.max(1,row.length-1))};
 });
}

// Node runs the screen tests without a DOM: the element is then simply never defined.
class MatchReplay extends (globalThis.HTMLElement??class{}){
 connectedCallback(){
  const data=pending.get(this.dataset.key);
  if(!data||this.ready)return;
  pending.delete(this.dataset.key);
  this.ready=true;
  Object.assign(this,data);
  this.sequences=chanceSequences(this.events);
  this.others=this.events.filter(event=>event.kind in NOTABLE&&event.period!==3);
  this.duration=Math.max(this.duration||0,...this.events.map(event=>event.second));
  this.speed=1;this.paused=true;
  this.filter=(()=>{try{const saved=localStorage.getItem(FILTER_KEY);return FILTERS.some(([value])=>value===saved)?saved:'0.1';}catch{return '0.1';}})();
  this.run=0;this.time=0;
  this.dots={home:new Map(),away:new Map()};this.pressers={};
  this.build();
  this.reset(0);
 }
 disconnectedCallback(){this.run++;this.settle(false);cancelAnimationFrame(this.frame);this.frame=null;}

 build(){
  const {home,away}=this.teams;
  // The scoreboard in a corner of the pitch, as on television: full names, or three letters on a phone.
  const team=side=>`<span class="replay-team"><i style="background:${side.major}"></i><span class="long">${e(side.name)}</span><abbr title="${e(side.name)}">${e(side.name.normalize('NFD').replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase())}</abbr></span>`;
  this.innerHTML=`<div class="replay-stage"><div class="replay-bug"><span class="replay-clock">0′</span>${team(home)}<strong class="replay-score">0 – 0</strong>${team(away)}</div><div class="replay-progress" aria-hidden="true"><strong class="replay-progress-clock">0′</strong><span class="replay-progress-bar"><i></i></span><span class="replay-progress-label">Jeu en cours</span><ul class="replay-progress-notes"></ul></div><button type="button" class="replay-start"><span>▶</span>Voir le résumé<small></small></button></div>
<div class="replay-caption" aria-live="polite"></div>
<div class="replay-timeline" role="group" aria-label="Occasions du match"><span class="replay-half"></span><span class="replay-cursor"></span></div>
<div class="replay-controls"><button type="button" data-replay="previous" aria-label="Occasion précédente" title="Occasion précédente">⏮</button><button type="button" data-replay="play" aria-label="Lecture" title="Lecture">▶</button><button type="button" data-replay="next" aria-label="Occasion suivante" title="Occasion suivante">⏭</button><span class="replay-speed" role="group" aria-label="Vitesse">${[1,2,4].map(speed=>`<button type="button" data-speed="${speed}" aria-pressed="${speed===1}">${speed}×</button>`).join('')}</span><select data-replay="filter" aria-label="Occasions montrées">${FILTERS.map(([value,label])=>`<option value="${value}"${value===this.filter?' selected':''}>${label}</option>`).join('')}</select></div>`;
  const stage=this.stage=this.querySelector('.replay-stage');
  this.svg=svg('svg',{viewBox:`-3 -3 ${W+6} ${H+6}`,class:'replay-pitch',role:'img','aria-label':`Terrain vu de dessus : ${home.name} contre ${away.name}`});
  const lines=svg('g',{class:'replay-lines'});
  const shapes=[['rect',{x:0,y:0,width:W,height:H}],['line',{x1:W/2,y1:0,x2:W/2,y2:H}],['circle',{cx:W/2,cy:H/2,r:9.15}],
   ['rect',{x:0,y:H/2-20.16,width:16.5,height:40.32}],['rect',{x:W-16.5,y:H/2-20.16,width:16.5,height:40.32}],
   ['rect',{x:0,y:H/2-9.16,width:5.5,height:18.32}],['rect',{x:W-5.5,y:H/2-9.16,width:5.5,height:18.32}],
   ['rect',{x:-2,y:H/2-3.66,width:2,height:7.32,class:'goal'}],['rect',{x:W,y:H/2-3.66,width:2,height:7.32,class:'goal'}],
   ['path',{d:`M16.5 ${H/2-7.3}A9.15 9.15 0 0 1 16.5 ${H/2+7.3}M${W-16.5} ${H/2-7.3}A9.15 9.15 0 0 0 ${W-16.5} ${H/2+7.3}`}]];
  for(const [tag,attributes] of shapes)lines.append(svg(tag,attributes));
  for(let stripe=0;stripe<W;stripe+=W/10)if(Math.round(stripe/(W/10))%2)this.svg.append(svg('rect',{x:stripe,y:0,width:W/10,height:H,class:'replay-stripe'}));
  this.trail=svg('g',{class:'replay-trail'});
  this.players=svg('g');
  this.shadow=svg('ellipse',{class:'replay-shadow',rx:1,ry:.6});
  this.ball=svg('circle',{class:'replay-ball',r:.95});
  this.banner=svg('text',{class:'replay-banner',x:W/2,y:H/2+3,'text-anchor':'middle'});
  this.svg.append(lines,this.trail,this.players,this.shadow,this.ball,this.banner);
  stage.prepend(this.svg);
  const timeline=this.querySelector('.replay-timeline');
  timeline.querySelector('.replay-half').style.left=`${100*this.halfTime()/this.duration}%`;
  this.sequences.forEach((sequence,index)=>{
   const side=sequence.team===this.homeId?'home':'away';
   const marker=document.createElement('button');
   marker.type='button';marker.dataset.chance=index;
   marker.className=`replay-marker ${side}${sequence.goal?' goal':''}`;
   marker.style.left=`${100*sequence.second/this.duration}%`;
   marker.style.setProperty('--team',this.teams[side].major);
   const shooter=sequence.shot.player||'—';
   marker.title=`${this.minute(sequence.second)} ${sequence.goal?'But':'Occasion'} · ${shooter}`;
   marker.setAttribute('aria-label',marker.title);
   timeline.append(marker);
  });
  this.addEventListener('click',event=>{
   const button=event.target.closest('button');
   if(!button)return;
   if(button.classList.contains('replay-start')){button.remove();this.play();}
   else if(button.dataset.chance)this.jump(Number(button.dataset.chance));
   else if(button.dataset.speed){this.speed=Number(button.dataset.speed);this.querySelectorAll('[data-speed]').forEach(item=>item.setAttribute('aria-pressed',item===button));}
   else if(button.dataset.replay==='play')this.paused?this.play():this.pause();
   else if(button.dataset.replay==='previous')this.jump(this.previousIndex());
   else if(button.dataset.replay==='next')this.jump(this.nextIndex(this.current+1));
  });
  this.addEventListener('change',event=>{
   if(event.target.dataset.replay!=='filter')return;
   this.filter=event.target.value;
   try{localStorage.setItem(FILTER_KEY,this.filter);}catch{}
   this.applyFilter();
  });
  this.applyFilter();
 }

 minute(second){return clockLabel(second,this.halfTime());}
 halfTime(){const end=this.events.find(event=>event.kind==='period_end'&&event.period===1);return end?end.second:2700;}
 side(teamId){return teamId===this.homeId?'home':'away';}
 opponent(side){return side==='home'?'away':'home';}
 // Home attacks to the right before the break and to the left after it.
 direction(side,period=this.period){return (side==='home')===(period!==2)?1:-1;}
 toPitch(side,u,v){return this.direction(side)>0?{x:u*W,y:v*H}:{x:(1-u)*W,y:(1-v)*H};}
 toLocal(side,point){const {x,y}=this.direction(side)>0?point:{x:W-point.x,y:H-point.y};return {u:x/W,v:y/H};}
 dot(who){return who&&this.dots[who.side].get(who.id);}
 roleOf(who){return this.rosters[who.side].find(player=>player.id===who.id)?.position;}

 rosterAt(side,second){
  const roster=this.lineups[side].map(player=>({id:player.id,position:player.position}));
  const team=side==='home'?this.homeId:this.awayId;
  for(const event of this.events){
   if(event.second>second||event.team_id!==team||event.period===3)continue;
   const index=roster.findIndex(player=>player.id===event.player_id);
   if(event.kind==='substitution'){if(index>=0)roster[index]={id:event.secondary_id,position:roster[index].position};else roster.push({id:event.secondary_id,position:event.detail||'MC'});}
   else if((event.kind==='red'||event.kind==='injury')&&index>=0)roster.splice(index,1);
  }
  return baseShape(roster);
 }
 updateRosters(second){
  this.rosters={home:this.rosterAt('home',second),away:this.rosterAt('away',second)};
  for(const side of ['home','away']){
   const present=new Set(this.rosters[side].map(player=>player.id)),kit=this.teams[side];
   for(const [id,dot] of this.dots[side])if(!present.has(id)){dot.node.remove();this.dots[side].delete(id);}
   for(const player of this.rosters[side]){
    if(this.dots[side].has(player.id))continue;
    const node=svg('g',{class:`replay-player${player.position==='GB'?' keeper':''}`});
    node.append(svg('circle',{class:'ring',r:2.7}),svg('circle',{r:1.55,fill:player.position==='GB'?kit.keeper:kit.major,stroke:kit.minor}),svg('text',{y:-2.4,'text-anchor':'middle'}));
    node.lastChild.textContent=this.names.get(player.id)||'';
    this.players.append(node);
    // A newcomer walks on from the touchline nearest to his spot.
    const spot=this.toPitch(side,player.u,player.v);
    this.dots[side].set(player.id,{node,x:spot.x,y:spot.y<H/2?-2:H+2});
   }
  }
 }

 // Every player's target given the ball: both blocks slide with it, the side in possession stretched,
 // the other compact, and one defender closes the ball down (kept until another is clearly closer).
 targets(ball,attacking){
  const targets=new Map();
  for(const side of ['home','away']){
   const local=this.toLocal(side,ball),attack=side===attacking;
   const push=attack?(local.u-.45)*.6:(local.u-.55)*.5;
   const spots=new Map();
   for(const player of this.rosters[side]){
    let u,v;
    if(player.position==='GB'){u=attack?.05+Math.max(0,push)*.15:.025;v=.5+(local.v-.5)*.15;}
    else{u=clamp(attack?player.u*.85+.05+push:player.u*.7+.08+push,.06,.95);v=clamp(.5+(player.v-.5)*(attack?.95:.75)+(local.v-.5)*.25,.04,.96);}
    spots.set(player.id,this.toPitch(side,u,v));
   }
   if(!attack){
    let best=null,gap=Infinity;
    for(const player of this.rosters[side]){if(player.position==='GB')continue;const dot=this.dots[side].get(player.id);const reach=dot?distance(dot,ball):Infinity;if(reach<gap){best=player.id;gap=reach;}}
    const current=this.pressers[side],held=this.dots[side].get(current);
    if(held&&this.rosters[side].some(player=>player.id===current)&&distance(held,ball)<gap*1.3)best=current;
    this.pressers[side]=best;
    if(best!=null){const goal=this.toPitch(side,0,.5),length=distance(goal,ball)||1;spots.set(best,{x:ball.x+(goal.x-ball.x)/length*2.4,y:ball.y+(goal.y-ball.y)/length*2.4});}
   }
   targets.set(side,spots);
  }
  return targets;
 }

 // ---- The clock of the replay: one animation frame loop drives every movement. ----
 startLoop(){
  if(this.frame)return;
  let last=performance.now();
  const tick=now=>{
   if(!this.isConnected){this.frame=null;return;}
   const dt=Math.min(64,now-last)*(this.paused?0:this.speed*(this.tempo||1));
   last=now;
   if(dt>0){this.time+=dt;this.step(dt);}
   this.frame=requestAnimationFrame(tick);
  };
  this.frame=requestAnimationFrame(tick);
 }

 // Starts an action; resolves true once it has played out, false when a jump replaced it.
 perform(action){
  this.settle(false);
  const run=this.run;
  return new Promise(resolve=>{
   action.t0=this.time;
   action.ballFrom={...this.ballAt};
   for(const role of ['by','to','keeper']){const dot=this.dot(action[role]);if(dot){action[`${role}From`]={x:dot.x,y:dot.y};action[`${role}Speed`]={x:dot.sx||0,y:dot.sy||0};}}
   if(action.line){action.path=svg('polyline',{class:action.line,points:`${this.ballAt.x},${this.ballAt.y}`});this.trail.append(action.path);}
   action.resolve=value=>resolve(value&&run===this.run);
   this.action=action;
  });
 }
 settle(value){const action=this.action;this.action=null;action?.resolve(value);}
 wait(duration,extra={}){return this.perform({kind:'wait',duration,...extra});}

 step(dt){
  const action=this.action;
  const k=action?clamp((this.time-action.t0)/Math.max(1,action.duration),0,1):1;
  if(action?.clock)this.showClock(lerp(action.clock[0],action.clock[1],k));
  // Players first: the ball then reads their live positions.
  const attacking=this.carrier?.side??action?.to?.side??this.lastSide??'home';
  const targets=this.targets(this.ballAt,attacking);
  const scripted=new Map();
  if(action){
   const run=(role,to)=>{if(action[role]&&action[`${role}From`]&&to)scripted.set(action[role].id,hermite(action[`${role}From`],action[`${role}Speed`],to,Math.min(1,k/(action.arrive??1)),action.duration*(action.arrive??1)));};
   if(action.kind==='carry')run('by',action.point);
   if(action.kind==='pass'||action.kind==='cross'||action.kind==='place')run('to',action.point);
   if(action.kind==='shot')run('keeper',action.keeperPoint);
  }
  const holder=this.carrier&&(!action||action.kind==='wait')?this.carrier.id:null;
  for(const side of ['home','away'])for(const [id,dot] of this.dots[side]){
   const previous={x:dot.x,y:dot.y};
   const target=scripted.get(id);
   if(target){dot.x=target.x;dot.y=target.y;}
   else if(id!==holder){const spot=targets.get(side).get(id);if(spot)follow(dot,spot,dt);}
   dot.vx=(dot.x-previous.x)/dt;dot.vy=(dot.y-previous.y)/dt;
   // A player leaving a scripted run keeps his momentum.
   if(target||id===holder){dot.sx=dot.vx;dot.sy=dot.vy;}
   dot.node.setAttribute('transform',`translate(${dot.x.toFixed(2)} ${dot.y.toFixed(2)})`);
  }
  // The ball: at the carrier's feet, or in flight towards a live receiver or a fixed point.
  let height=0;
  if(action&&['pass','cross','place','shot'].includes(action.kind)){
   const receiver=this.dot(action.to);
   const aim=action.kind==='shot'?(action.catch?this.feet(action.keeper,action.catchAt):action.target):receiver?this.feet(action.to):action.point;
   const t=EASE[action.kind==='place'?'place':action.kind](k);
   this.ballAt=lerpPoint(action.ballFrom,aim,t);
   height=(action.loft||0)*Math.sin(Math.PI*t);
  }else if(this.carrier){
   this.ballAt=this.feet(this.carrier);
  }
  this.drawBall(height);
  if(action?.path&&k<1){const points=action.path.getAttribute('points');action.path.setAttribute('points',`${points} ${this.ballAt.x.toFixed(2)},${this.ballAt.y.toFixed(2)}`);}
  if(action&&k>=1){
   if(action.to&&action.kind!=='shot')this.carrier=action.to;
   if(action.kind==='carry')this.carrier=action.by;
   if(action.kind==='shot')this.carrier=action.catch?action.keeper:null;
   if(this.carrier)this.lastSide=this.carrier.side;
   this.settle(true);
  }
  const holding=this.carrier?`${this.carrier.side}:${this.carrier.id}`:'';
  if(holding!==this.holding){this.holding=holding;for(const side of ['home','away'])for(const [id,dot] of this.dots[side])dot.node.classList.toggle('carrier',this.carrier?.side===side&&this.carrier.id===id);}
 }
 // The ball sits a stride ahead of the carrier, in the direction he is running (or attacking, when still).
 feet(who,fallback){
  const dot=this.dot(who);
  if(!dot)return fallback||this.ballAt;
  const speed=Math.hypot(dot.vx||0,dot.vy||0);
  if(dot.fx==null){dot.fx=this.direction(who.side);dot.fy=0;}
  // He turns with the ball rather than snapping it to his new heading.
  if(speed>.002){
   const turn=Math.min(1,16/TURN_MS),fx=dot.fx+(dot.vx/speed-dot.fx)*turn,fy=dot.fy+(dot.vy/speed-dot.fy)*turn,length=Math.hypot(fx,fy)||1;
   dot.fx=fx/length;dot.fy=fy/length;
  }
  const sway=speed>.002?.15*Math.sin(this.time/90):0;
  return {x:dot.x+dot.fx*1.5-dot.fy*sway,y:dot.y+dot.fy*1.5+dot.fx*sway};
 }
 drawBall(height){
  const {x,y}=this.ballAt;
  this.ball.setAttribute('cx',x.toFixed(2));this.ball.setAttribute('cy',(y-height*1.4).toFixed(2));this.ball.setAttribute('r',(.95+height*.4).toFixed(2));
  this.shadow.setAttribute('cx',x.toFixed(2));this.shadow.setAttribute('cy',(y+.5).toFixed(2));
  this.ball.classList.toggle('faded',!!this.faded);
 }
 highlight(ids){for(const side of ['home','away'])for(const [id,dot] of this.dots[side]){dot.node.classList.toggle('on',ids.includes(id));dot.node.classList.toggle('carrier',this.carrier?.side===side&&this.carrier.id===id);}}

 showClock(second){const label=this.minute(second);this.querySelector('.replay-clock').textContent=label;this.querySelector('.replay-progress-clock').textContent=label;this.querySelector('.replay-cursor').style.left=`${100*clamp(second/this.duration,0,1)}%`;}
 showScore(){this.querySelector('.replay-score').textContent=`${this.score[0]} – ${this.score[1]}`;}
 caption(html,live=false){const node=this.querySelector('.replay-caption');node.innerHTML=html;node.classList.toggle('live',live);}
 showBanner(text,side){this.banner.textContent=text;this.banner.setAttribute('class',`replay-banner${text?' on':''}`);this.banner.style.fill=side?this.teams[side].major:'';}

 // The kick-off shape: both sides in their half, the ball on the centre spot at the feet of `side`'s most advanced player.
 kickOff(side){
  this.snap({x:W/2,y:H/2},side);
 }
 // Both teams set in their shape around `point`, the ball there at the feet of `side`'s nearest player
 // (other than `exclude`); used where the replay cuts in, so nobody has to run across the pitch.
 snap(point,side,exclude=[],carrier=null){
  for(let pass=0;pass<2;pass++){
   const targets=this.targets(point,side);
   for(const team of ['home','away'])for(const [id,dot] of this.dots[team]){const spot=targets.get(team).get(id);if(spot){dot.x=spot.x;dot.y=spot.y;dot.vx=dot.vy=dot.sx=dot.sy=0;dot.fx=null;}}
  }
  carrier=carrier&&this.dot(carrier)?carrier:this.nearest(side,point,{exclude});
  const dot=this.dot(carrier);
  if(dot){dot.x=point.x-this.direction(side)*1.5;dot.y=point.y;}
  for(const team of ['home','away'])for(const dot of this.dots[team].values())dot.node.setAttribute('transform',`translate(${dot.x.toFixed(2)} ${dot.y.toFixed(2)})`);
  this.carrier=carrier;this.lastSide=side;this.ballAt={...point};this.drawBall(0);
  return carrier;
 }
 kickOffSide(period){const event=this.events.find(item=>item.kind==='kickoff'&&item.period===period);return event?this.side(event.team_id):period===1?'home':'away';}
 nearest(side,point,{exclude=[],keeper=false}={}){
  let best=null,gap=Infinity;
  for(const player of this.rosters[side]){
   if((!keeper&&player.position==='GB')||exclude.includes(player.id))continue;
   const dot=this.dots[side].get(player.id);const reach=dot?distance(dot,point):Infinity;
   if(reach<gap){best={side,id:player.id};gap=reach;}
  }
  return best;
 }
 keeperOf(side){const player=this.rosters[side].find(item=>item.position==='GB');return player?{side,id:player.id}:null;}

 // Puts the match as it stood just before `second`: score, period, lineups, and a kick-off shape.
 reset(second,index=0){
  this.run++;this.settle(false);
  this.current=index;
  const played=this.sequences.filter(sequence=>sequence.end<second&&sequence.goal);
  this.score=[played.filter(item=>item.team===this.homeId).length,played.filter(item=>item.team!==this.homeId).length];
  this.period=second>this.halfTime()?2:1;
  this.updateRosters(second);
  this.trail.replaceChildren();this.faded=false;this.tempo=1;
  this.stage.classList.remove('fast');
  this.showBanner('');this.showScore();this.showClock(second);
  const next=this.sequences[index];
  this.kickOff(second&&next?this.opponent(this.side(next.team)):this.kickOffSide(this.period));
  this.highlight([]);
  this.clock=second;
  this.caption(second?'':'Coup d’envoi');
 }

 play(){if(this.current>=this.sequences.length)this.reset(0);this.paused=false;this.querySelector('.replay-start')?.remove();this.updatePlay();this.startLoop();if(!this.running)this.loop();}
 pause(){this.paused=true;this.updatePlay();}
 updatePlay(){const button=this.querySelector('[data-replay="play"]');button.textContent=this.paused?'▶':'❚❚';button.setAttribute('aria-label',this.paused?'Lecture':'Pause');button.title=button.getAttribute('aria-label');}
 shown(sequence){return sequence.goal||(this.filter!=='goals'&&(sequence.shot.xg??1)>=Number(this.filter));}
 visible(index){return index>=0&&index<this.sequences.length&&this.shown(this.sequences[index]);}
 // Hides the markers of the chances left out and counts what the summary will play.
 applyFilter(){
  this.querySelectorAll('.replay-marker').forEach(marker=>marker.hidden=!this.visible(Number(marker.dataset.chance)));
  const chances=this.sequences.filter(sequence=>this.shown(sequence)).length,goals=this.sequences.filter(sequence=>sequence.goal).length;
  const count=this.querySelector('.replay-start small');
  if(count)count.textContent=`${chances} occasion${chances>1?'s':''} · ${goals} but${goals>1?'s':''}`;
 }
 nextIndex(from){let index=from;while(index<this.sequences.length&&!this.visible(index))index++;return index;}
 previousIndex(){let index=this.current-1;while(index>=0&&!this.visible(index))index--;return index>=0?index:this.nextIndex(0);}
 jump(index){
  index=this.nextIndex(Math.max(0,index));
  if(index>=this.sequences.length)return;
  this.reset(Math.max(0,this.sequences[index].second-1),index);
  this.skipInterlude=true;
  this.querySelector('.replay-start')?.remove();
  this.paused=false;this.updatePlay();this.startLoop();
  this.loop();
 }

 async loop(){
  const run=this.run;
  this.running=true;
  try{
   for(let index=this.nextIndex(this.current);index<this.sequences.length;index=this.nextIndex(index+1)){
    this.current=index;
    const sequence=this.sequences[index];
    if(!this.skipInterlude&&!(await this.interlude(this.clock,sequence.second)))return;
    this.skipInterlude=false;
    this.markCurrent(index);
    if(!(await this.chance(sequence)))return;
    this.clock=sequence.end;
   }
   if(!(await this.interlude(this.clock,this.duration)))return;
   this.progress('Coup de sifflet final',true);
   this.caption(`<strong>Coup de sifflet final</strong> · ${e(this.teams.home.name)} ${this.score[0]} – ${this.score[1]} ${e(this.teams.away.name)}`);
   this.current=this.sequences.length;
   this.pause();
  }finally{if(run===this.run)this.running=false;}
 }
 markCurrent(index){this.querySelectorAll('.replay-marker').forEach(marker=>marker.classList.toggle('current',Number(marker.dataset.chance)===index));}

 // ---- Building blocks of a move, all derived from where the players are now. ----
 passTime(from,to){return clamp(220+distance(from,to)*26,380,1300);}
 carryTime(from,to){return clamp(distance(from,to)*75,300,3000);}
 // A scripted run (to a corner flag, a free kick, the centre spot) at a sprint at most.
 runTime(who,point){const dot=this.dot(who);return dot?clamp(distance(dot,point)*1.5/RUN_SPEED,500,2600):700;}
 async carry(point,extra={}){
  const dot=this.dot(this.carrier);
  if(!dot)return true;
  return this.perform({kind:'carry',by:this.carrier,point,duration:extra.duration??this.carryTime(dot,point),line:'replay-carry',...extra});
 }
 // A pass to `to`, who runs to `point` meanwhile; the ball chases him wherever he is.
 async pass(to,point,extra={}){
  if(!to||!this.dot(to))return true;
  if(this.carrier&&this.carrier.side===to.side&&this.carrier.id===to.id)return this.carry(point,extra);
  const from=this.ballAt;
  // Long enough for the receiver to reach the ball without outsprinting everyone.
  const duration=Math.max(this.passTime(from,point),this.runTime(to,point)*.92);
  return this.perform({kind:'pass',by:this.carrier,to,point,duration,arrive:.92,line:'replay-pass',...extra});
 }

 // The play between two chances is not recorded: the players leave the pitch and the clock runs fast, stopping
 // for a moment on each card, injury or substitution and at the break.
 async interlude(from,to){
  this.tempo=1;
  this.highlight([]);this.showBanner('');this.trail.replaceChildren();
  this.progress('Jeu en cours');
  const notes=this.querySelector('.replay-progress-notes');
  notes.replaceChildren();
  this.stage.classList.add('fast');
  this.caption('<span class="replay-dots">Jeu en cours</span>',true);
  const half=this.halfTime();
  const stops=[...this.others.filter(event=>event.second>from&&event.second<=to).map(event=>({second:event.second,event})),
               ...(from<half&&to>half?[{second:half,half:true}]:[])].sort((a,b)=>a.second-b.second);
  let clock=from;
  for(const stop of [...stops,{second:to}]){
   if(stop.second>clock&&!(await this.wait(Math.max(120,(stop.second-clock)/60*MS_PER_MINUTE),{clock:[clock,stop.second]})))return false;
   clock=Math.max(clock,stop.second);
   if(stop.event){
    const event=stop.event,item=document.createElement('li');
    item.innerHTML=`<b>${this.minute(event.second)}</b> ${NOTABLE[event.kind]} · ${e(event.player||'—')}${event.kind==='substitution'&&event.secondary?` ➜ ${e(event.secondary)}`:''}`;
    item.style.setProperty('--team',this.teams[this.side(event.team_id)].major);
    notes.prepend(item);
    while(notes.children.length>3)notes.lastChild.remove();
    if(!(await this.wait(450)))return false;
   }
   if(stop.half){
    this.progress('Mi-temps',true);
    this.caption(`<strong>Mi-temps</strong> · ${e(this.teams.home.name)} ${this.score[0]} – ${this.score[1]} ${e(this.teams.away.name)}`);
    if(!(await this.wait(1100)))return false;
    this.period=2;
    notes.replaceChildren();
    this.progress('Jeu en cours');
    this.caption('<span class="replay-dots">Jeu en cours</span>',true);
   }
  }
  this.clock=to;
  return true;
 }
 // A television cut to a dead ball: the players vanish for an instant and reappear set around it.
 async cut(point,side,carrier){
  this.stage.classList.add('cut');
  if(!(await this.wait(260)))return false;
  this.snap(point,side,[],carrier);
  this.stage.classList.remove('cut');
  return this.wait(420);
 }
 progress(label,still=false){this.querySelector('.replay-progress-label').textContent=label;this.stage.classList.toggle('still',still);}

 async chance(sequence){
  const side=this.side(sequence.team),other=this.opponent(side),team=this.teams[side];
  const random=seeded(sequence.id*7919+sequence.second);
  const jitter=(value,amount)=>clamp(value+(random()-.5)*2*amount,.02,.98);
  const at=(u,v)=>this.toPitch(side,u,v);
  const who=id=>id!=null&&this.dots[side].has(id)?{side,id}:null;
  const name=event=>e(event?.player||'—');
  this.period=sequence.period;
  this.tempo=CHANCE_TEMPO;
  this.updateRosters(sequence.second);
  this.trail.replaceChildren();this.showBanner('');
  // The clock stops on the minute of the chance while it plays out.
  this.showClock(sequence.second);
  const involved=[];
  const note=(id,text)=>{if(id!=null)involved.push(id);this.highlight(involved);this.caption(text);};
  const shot=sequence.shot,counter=sequence.start?.detail==='counter',kind=shot.detail;
  const title=`<strong style="color:${team.major}">${e(team.name)}</strong> · ${this.minute(sequence.second)}`;
  // The move starts where the engine recovered the ball, or just short of the shot for saves without a trail.
  const start=sequence.start?at(jitter(ZONE_U[sequence.start.zone],.04),jitter(LANE_V[sequence.start.lane],.06))
   :at(ZONE_U[Math.max(0,(shot.zone??3)-1)],LANE_V[shot.lane??1]);
  // The players come back on around the ball, held by someone other than the first carrier of the move,
  // so the move opens with a pass.
  this.snap(start,side,sequence.progress.slice(0,1).map(event=>event.player_id));
  this.faded=false;
  this.stage.classList.remove('fast');
  note(null,`${title} · ${counter?'Contre-attaque !':sequence.start?'Récupération':'Occasion'}`);
  if(!(await this.wait(600)))return false;
  this.lastSide=side;
  for(const event of sequence.progress){
   const point=at(jitter(ZONE_U[event.zone],.04),jitter(LANE_V[event.lane],.07));
   const receiver=who(event.player_id);
   note(event.player_id,`${title} · ${name(event)} fait avancer le jeu`);
   const catchAt=lerpPoint(this.ballAt,point,.75);
   if(!(await this.pass(receiver,catchAt)))return false;
   if(!(await this.carry(point)))return false;
  }
  const shooter=who(shot.player_id);
  // The header is met in the box, on the side the scorer is already coming from.
  const headerSpot=()=>{const dot=this.dot(shooter),local=dot?this.toLocal(side,dot):{u:.9,v:.5};return at(jitter(.915,.012),clamp(jitter(local.v,.04),.37,.63));};
  let shotFrom;
  if(kind==='corner'){
   const top=sequence.setPiece?.lane===0||(sequence.setPiece?.lane===1&&random()<.5);
   const taker=who(sequence.delivery?.player_id)||this.nearest(side,at(1,top?0:1));
   note(taker?.id,`${title} · Corner tiré par ${name(sequence.delivery)}`);
   if(!(await this.cut(at(.997,top?.005:.995),side,taker)))return false;
   shotFrom=headerSpot();
   note(shot.player_id,`${title} · Tête de ${name(shot)}`);
   if(!(await this.perform({kind:'cross',by:taker,to:shooter,point:shotFrom,duration:Math.max(1050,this.runTime(shooter,shotFrom)),loft:1.8,line:'replay-cross'})))return false;
  }else if(kind==='free_kick'){
   shotFrom=at(jitter(.78,.03),jitter(LANE_V[shot.lane??1]*.6+.2,.05));
   note(shot.player_id,`${title} · Coup franc pour ${name(shot)}`);
   if(!(await this.cut(shotFrom,side,shooter)))return false;
   if(!(await this.wait(300)))return false;
  }else if(kind==='cross'){
   const crosser=who(sequence.delivery?.player_id);
   const lane=sequence.delivery?.lane??shot.lane,wing=lane===0?.07:.93;
   note(crosser?.id,`${title} · Centre de ${name(sequence.delivery)}`);
   if(!(await this.pass(crosser,at(jitter(.86,.02),wing))))return false;
   if(!(await this.carry(at(jitter(.95,.015),wing))))return false;
   shotFrom=headerSpot();
   note(shot.player_id,`${title} · Tête de ${name(shot)}`);
   if(!(await this.perform({kind:'cross',by:crosser,to:shooter,point:shotFrom,duration:Math.max(950,this.runTime(shooter,shotFrom)),loft:1.6,line:'replay-cross'})))return false;
  }else{
   shotFrom=at(jitter(.855,.035),jitter(.5,.1));
   note(shot.player_id,`${title} · Frappe de ${name(shot)}`);
   if(!(await this.pass(shooter,lerpPoint(this.ballAt,shotFrom,.7))))return false;
   if(!(await this.carry(shotFrom,{duration:420})))return false;
  }
  const outcome=sequence.outcome?.kind;
  const xg=shot.xg!=null?` <small>xG ${shot.xg.toFixed(2).replace('.',',')}</small>`:'';
  const keeper=shot.secondary_id!=null&&this.dots[other].has(shot.secondary_id)?{side:other,id:shot.secondary_id}:this.keeperOf(other);
  if(keeper)involved.push(keeper.id);
  this.highlight(involved);
  const target=outcome==='goal'?at(1.012,jitter(.5,.035)):outcome==='save'?at(.99,jitter(.5,.045)):at(1.035,random()<.5?.38:.62);
  const dive=keeper&&this.toPitch(other,.015,this.toLocal(other,target).v);
  const header=kind==='cross'||kind==='corner';
  if(!(await this.perform({kind:'shot',by:shooter,target,keeper,keeperPoint:outcome==='off_target'?null:dive,catch:outcome==='save',catchAt:target,
                            duration:header?480:kind==='free_kick'?750:560,loft:kind==='free_kick'?.9:header?.3:.15,line:'replay-shot'})))return false;
  if(outcome==='goal'){
   side==='home'?this.score[0]++:this.score[1]++;
   this.showScore();
   this.showBanner('BUT !',side);
   const assist=sequence.outcome.secondary?` · passe de ${e(sequence.outcome.secondary)}`:'';
   this.caption(`${title} · <strong>But de ${name(shot)}</strong>${assist}${xg}`);
   // The outcome is read at normal pace.
   this.tempo=1;
   return this.wait(1700);
  }
  this.caption(`${title} · ${outcome==='save'?`Arrêt de ${e(shot.secondary||'—')}`:'Tir non cadré'}${xg}`);
  this.tempo=1;
  return this.wait(850);
 }
}
function lerpPoint(from,to,k){return {x:lerp(from.x,to.x,k),y:lerp(from.y,to.y,k)};}
// A scripted run that starts at the player's current speed (per ms, capped at a sprint) and ends at rest on `to`.
function hermite(from,speed,to,k,duration){
 // The momentum bends the start of the run; it may not carry him further than the run itself.
 const length=Math.hypot(speed.x,speed.y),reach=Math.hypot(to.x-from.x,to.y-from.y);
 const scale=length?Math.min(1,RUN_SPEED/length,reach/(length*duration)):0;
 const h00=2*k**3-3*k*k+1,h10=k**3-2*k*k+k,h01=-2*k**3+3*k*k;
 return {x:h00*from.x+h10*duration*speed.x*scale+h01*to.x,y:h00*from.y+h10*duration*speed.y*scale+h01*to.y};
}
// Critically damped spring towards `target` (the SmoothDamp of game engines), velocity kept in dot.sx/dot.sy.
function follow(dot,target,dt){
 const omega=2/FOLLOW_MS,x=omega*dt,decay=1/(1+x+.48*x*x+.235*x*x*x);
 let cx=dot.x-target.x,cy=dot.y-target.y;
 const reach=TOP_SPEED*FOLLOW_MS,length=Math.hypot(cx,cy);
 if(length>reach){cx*=reach/length;cy*=reach/length;}
 // A far target is brought within a sprint's reach; the spring works towards that nearer point.
 const goalX=dot.x-cx,goalY=dot.y-cy;
 const tx=((dot.sx||0)+omega*cx)*dt,ty=((dot.sy||0)+omega*cy)*dt;
 dot.sx=((dot.sx||0)-omega*tx)*decay;dot.sy=((dot.sy||0)-omega*ty)*decay;
 dot.x=goalX+(cx+tx)*decay;dot.y=goalY+(cy+ty)*decay;
}
if(globalThis.customElements&&!customElements.get('match-replay'))customElements.define('match-replay',MatchReplay);

const pending=new Map();
let keys=0;
// `teams` holds {name, major, minor, keeper} for each side; the element starts itself once inserted.
export function replayCard(match,teams){
 const result=match.result,key=String(++keys);
 const names=new Map();
 for(const player of [...result.home_lineup,...result.home_bench,...result.away_lineup,...result.away_bench])names.set(player.id,surname(player.name));
 for(const event of result.events){if(event.player&&!names.has(event.player_id))names.set(event.player_id,surname(event.player));if(event.secondary&&!names.has(event.secondary_id))names.set(event.secondary_id,surname(event.secondary));}
 pending.set(key,{events:result.events,duration:result.duration,homeId:match.home.id,awayId:match.away.id,teams,names,
                  lineups:{home:result.home_lineup,away:result.away_lineup}});
 // Folded by default: the toggle sits in the match banner, the panel below it stays empty until first opened.
 const toggle=`<button type="button" class="replay-toggle" data-replay-toggle="${key}" aria-controls="replay-${key}" aria-expanded="false">`
  +`<svg class="open" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg><svg class="close" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>Résumé 2D</button>`;
 return {toggle,panel:`<section class="card match-replay-card" id="replay-${key}" hidden></section>`};
}

// The banner's toggle: the first opening mounts the replay and plays it, later ones only show or hide it (hiding pauses).
// The page is redrawn from HTML strings, hence one delegated listener.
globalThis.document?.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-replay-toggle]');
 if(!button)return;
 const panel=document.getElementById(button.getAttribute('aria-controls'));
 if(!panel)return;
 const open=panel.hidden;
 panel.hidden=!open;
 button.setAttribute('aria-expanded',String(open));
 let replay=panel.querySelector('match-replay');
 if(open&&!replay){
  replay=document.createElement('match-replay');
  replay.dataset.key=button.dataset.replayToggle;
  panel.append(replay);
  replay.play?.();
 }
 else if(!open)replay?.pause?.();
});
