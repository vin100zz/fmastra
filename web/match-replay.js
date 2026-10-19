// A top-down replay of the chances of a match: each possession that ended in a shot is drawn from the
// engine's own trail (start, zones crossed, delivery, shot, outcome); the play in between is only suggested.
//
// The ball is a projectile (replay-physics.js): struck, it flies, bounces and rolls on its own, and each touch is
// played where it will be at that moment, by a player sent there in time. A pass goes along the grass or over the
// lines; it is taken first time, or controlled then played, or carried on touch after touch. Players run at a
// footballer's pace and speed up and brake like one. The 3D view (replay-3d.js) draws all of it as it is.
import {escape as e,shortName} from './ui.js';
import {GRAVITY,ballAt,dip,lofted,path,rolled} from './replay-physics.js';

const W=105,H=68;
// The engine's grid in a side's own frame: u from its goal (0) to the opponent's (1), v from its left to its right.
const ZONE_U=[.14,.37,.62,.84],LANE_V=[.17,.5,.83];
const DEPTH={GB:.02,DC:.17,DG:.2,DD:.2,MDC:.33,MC:.46,MOC:.58,AILG:.68,AILD:.68,BU:.74};
const SEQUENCE_KINDS=new Set(['possession','progress','corner','free_kick','delivery','shot','goal','save','off_target']);
// Which chances the summary plays, by the engine's xG (0.05 for a corner or free kick, up to about 0.25 for a
// clean shot); goals are always shown. Remembered for the viewer between matches.
const FILTERS=[['0','Toutes les occasions'],['0.1','Occasions nettes (xG ≥ 0,10)'],['0.2','Grosses occasions (xG ≥ 0,20)'],['goals','Buts seulement']];
const FILTER_KEY='touchline-replay-filter',VIEW_KEY='touchline-replay-view';
const NOTABLE={yellow:'Carton jaune',red:'Carton rouge',injury:'Blessure',substitution:'Changement'};
// Paces in pitch metres per ms of replay: the block shifts at a jog, the man closing the ball down a little faster.
// A scripted run (a receiver meeting a pass, a scorer attacking a cross) is given time for REACH on average, a
// sprint at its peak.
const JOG=.006,PRESS=.0072,REACH=.0062;
// Speeding up and braking, in metres per ms²: about 5 and 7 m/s², so that nobody starts or stops dead.
const ACCEL=5e-6,BRAKE=7e-6;
// The ball meets a player this far in front of him. A touch dies quickly on the grass, a ball in the net at once.
const CONTACT=.9,TOUCH_FRICTION=1.2e-5,NET_FRICTION=4e-5;
// How long the ball takes over d metres, in ms: rolled along the grass, driven, lofted over the lines, or a cross
// floated to the far post or whipped in.
const FLIGHT={ground:d=>220+d*55,driven:d=>160+d*44,lofted:d=>650+d*30,floated:d=>900+d*28,whipped:d=>500+d*26};
// The boards, this far beyond the lines: a ball that leaves the pitch comes back off them.
const BOARD_X=6,BOARD_Y=5;
// The beats of a move follow on from one another on the replay's own timeline, unless something held it up for longer
// than this; a player whose run has ended carries on at its pace for EXTEND_MS, until the next touch sends him on.
const CHAIN_MS=300,EXTEND_MS=150;
// Between chances the clock runs at this many ms of replay per match minute; chances play at this pace, 1 being life-like.
const MS_PER_MINUTE=90,CHANCE_TEMPO=1;
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
const lerp=(a,b,k)=>a+(b-a)*k;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const lerpPoint=(from,to,k)=>({x:lerp(from.x,to.x,k),y:lerp(from.y,to.y,k)});
const unit=(from,to)=>{const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);return length?{x:dx/length,y:dy/length}:{x:1,y:0};};
const scale=(vector,k)=>({x:vector.x*k,y:vector.y*k});
const turn=(vector,angle)=>({x:vector.x*Math.cos(angle)-vector.y*Math.sin(angle),y:vector.x*Math.sin(angle)+vector.y*Math.cos(angle)});
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
 for(const player of roster){if(player.position==='AILG'||player.position==='AILD')continue;const line=['DG','DC','DD'].includes(player.position)?'D':player.position;if(!rows.has(line))rows.set(line,[]);rows.get(line).push(player);}
 const order={DG:0,DC:1,DD:2};
 for(const row of rows.values())row.sort((a,b)=>(order[a.position]??1)-(order[b.position]??1));
 return roster.map(player=>{
  if(player.position==='AILG')return {...player,u:DEPTH.AILG,v:.12};
  if(player.position==='AILD')return {...player,u:DEPTH.AILD,v:.88};
  const row=rows.get(['DG','DC','DD'].includes(player.position)?'D':player.position),index=row.indexOf(player);
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
  // Scripted runs and set spots by player, and what happens at set times of the replay.
  this.runs=new Map();this.posts=new Map();this.cues=[];
  this.ballPath=path({x:W/2,y:H/2,z:0},{x:0,y:0,z:0},0);this.ballAt={x:W/2,y:H/2};this.ballZ=0;
  this.build();
  this.reset(0);
  try{if(localStorage.getItem(VIEW_KEY)==='3d')this.setView(true);}catch{}
  if(this.live)this.startLive();
 }
 disconnectedCallback(){this.run++;this.settle(false);cancelAnimationFrame(this.frame);this.frame=null;this.pitch3d?.dispose();this.pitch3d=null;}

 build(){
  const {home,away}=this.teams;
  // The scoreboard in a corner of the pitch, as on television: full names, or three letters on a phone.
  const team=side=>`<span class="replay-team"><i style="background:${side.major}"></i><span class="long">${e(side.name)}</span><abbr title="${e(side.name)}">${e(side.name.normalize('NFD').replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase())}</abbr></span>`;
  this.innerHTML=`<div class="replay-stage"><div class="replay-bug"><span class="replay-clock">0′</span>${team(home)}<strong class="replay-score">0 – 0</strong>${team(away)}</div><div class="replay-progress"><strong class="replay-progress-clock" aria-hidden="true">0′</strong><span class="replay-progress-bar" aria-hidden="true"><i></i></span><span class="replay-progress-label" aria-hidden="true">Jeu en cours</span>${this.live?'<button type="button" class="primary cta replay-second-half" data-live="second-half" hidden>2e mi-temps <span>→</span></button><button type="button" class="primary cta replay-continue" data-live="continuer" hidden>Continuer <span>→</span></button>':''}<ul class="replay-progress-notes" aria-hidden="true"></ul></div><button type="button" class="replay-start"><span>▶</span>Voir le résumé<small></small></button></div>
<div class="replay-caption" aria-live="polite"></div>
<div class="replay-timeline" role="group" aria-label="Occasions du match"><span class="replay-half"></span><span class="replay-cursor"></span></div>
<div class="replay-controls"><button type="button" data-replay="previous" aria-label="Occasion précédente" title="Occasion précédente">⏮</button><button type="button" data-replay="play" aria-label="Lecture" title="Lecture">▶</button><button type="button" data-replay="next" aria-label="Occasion suivante" title="Occasion suivante">⏭</button><span class="replay-speed" role="group" aria-label="Vitesse">${[1,2,4].map(speed=>`<button type="button" data-speed="${speed}" aria-pressed="${speed===1}">${speed}×</button>`).join('')}</span><button type="button" data-replay="view" aria-pressed="false" aria-label="Vue 3D" title="Vue 3D">3D</button><select data-replay="filter" aria-label="Occasions montrées">${FILTERS.map(([value,label])=>`<option value="${value}"${value===this.filter?' selected':''}>${label}</option>`).join('')}</select></div>`;
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
   else if(button.dataset.replay==='view')this.setView(!this.view3d,true);
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

 // The television view (replay-3d.js) is loaded on first use and reads this element's state at each frame;
 // without WebGL its button goes away and the pitch stays top-down.
 setView(on,remember=false){
  const button=this.querySelector('[data-replay="view"]');
  this.view3d=on;
  if(remember)try{localStorage.setItem(VIEW_KEY,on?'3d':'2d');}catch{}
  button.setAttribute('aria-pressed',String(on));
  this.stage.classList.toggle('three',on);
  if(!on){this.pitch3d?.dispose();this.pitch3d=null;return;}
  if(this.pitch3d)return;
  import('./replay-3d.js').then(({Pitch3D})=>{if(this.view3d&&!this.pitch3d&&this.isConnected)this.pitch3d=new Pitch3D(this);})
   .catch(()=>{button.hidden=true;this.setView(false);});
 }

 minute(second){return clockLabel(second,this.halfTime());}
 // Live, the first half lasts until its whistle is known: its added time reads 45+1′, not 46′.
 halfTime(){const end=this.events.find(event=>event.kind==='period_end'&&event.period===1);return end?end.second:this.live?Infinity:2700;}
 side(teamId){return teamId===this.homeId?'home':'away';}
 opponent(side){return side==='home'?'away':'home';}
 // Home attacks to the right before the break and to the left after it.
 direction(side,period=this.period){return (side==='home')===(period!==2)?1:-1;}
 toPitch(side,u,v){return this.direction(side)>0?{x:u*W,y:v*H}:{x:(1-u)*W,y:(1-v)*H};}
 toLocal(side,point){const {x,y}=this.direction(side)>0?point:{x:W-point.x,y:H-point.y};return {u:x/W,v:y/H};}
 dot(who){return who&&this.dots[who.side].get(who.id);}
 key(who){return `${who.side}:${who.id}`;}
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
    this.dots[side].set(player.id,{node,x:spot.x,y:spot.y<H/2?-2:H+2,sx:0,sy:0});
   }
  }
 }

 // Every player's target given the ball: both blocks slide with it, the side in possession stretched,
 // the other compact, and one defender closes the ball down (kept until another is clearly closer, or the man
 // a dribbler takes on).
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
   if(attack)this.pressers[side]=null;
   else{
    let best=null,gap=Infinity;
    for(const player of this.rosters[side]){if(player.position==='GB')continue;const dot=this.dots[side].get(player.id);const reach=dot?distance(dot,ball):Infinity;if(reach<gap){best=player.id;gap=reach;}}
    const current=this.pressers[side],held=this.dots[side].get(current),lock=this.pressLock;
    if(held&&this.rosters[side].some(player=>player.id===current)&&distance(held,ball)<gap*1.3)best=current;
    if(lock&&lock.side===side&&this.time<lock.until&&this.dots[side].has(lock.id))best=lock.id;
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

 // Where the next beat starts: right where the previous one ended, unless something held the replay up in between.
 start(){return this.cursor!=null&&this.time-this.cursor<=CHAIN_MS?this.cursor:this.time;}
 // Starts a beat; resolves true once it has played out, false when a jump replaced it.
 perform(action){
  this.settle(false);
  const run=this.run;
  return new Promise(resolve=>{
   action.t0??=this.start();
   this.cursor=action.t0+action.duration;
   if(action.line){const from=ballAt(this.ballPath,action.t0);action.path=svg('polyline',{class:action.line,points:`${from.x.toFixed(2)},${from.y.toFixed(2)}`});this.trail.append(action.path);}
   action.resolve=value=>resolve(value&&run===this.run);
   this.action=action;
   // Struck a moment ago on the timeline: the ball is shown on its new way before the frame is painted.
   if(this.time>action.t0){const ball=ballAt(this.ballPath,this.time);this.ballAt={x:ball.x,y:ball.y};this.ballZ=ball.z;this.drawBall();}
  });
 }
 settle(value){const action=this.action;this.action=null;action?.resolve(value);}
 wait(duration,extra={}){return this.perform({kind:'wait',duration,...extra});}

 step(dt){
  const action=this.action,now=this.time;
  const k=action?clamp((now-action.t0)/Math.max(1,action.duration),0,1):1;
  if(action?.clock)this.showClock(lerp(action.clock[0],action.clock[1],k));
  while(this.cues.length&&this.cues[0].at<=now)this.cues.shift().apply();
  // A beat that ends during this frame is drawn at its end: the next touch takes over from there, not from beyond.
  const time=action&&k>=1?Math.min(now,action.t0+action.duration):now;
  const ball=ballAt(this.ballPath,time);
  const targets=this.targets(ball,this.carrier?.side??this.lastSide??'home');
  for(const side of ['home','away'])for(const [id,dot] of this.dots[side]){
   const key=`${side}:${id}`,run=this.runs.get(key),previous={x:dot.x,y:dot.y};
   if(run&&time<=run.t1+EXTEND_MS){const point=runAt(run,time);dot.x=point.x;dot.y=point.y;}
   else{
    if(run)this.runs.delete(key);
    const spot=this.posts.get(key)||targets.get(side).get(id);
    if(spot)steer(dot,spot,dt,id===this.pressers[side]?PRESS:JOG);
   }
   dot.vx=(dot.x-previous.x)/dt;dot.vy=(dot.y-previous.y)/dt;
   // Leaving a scripted run, he keeps its pace.
   if(this.runs.has(key)){dot.sx=dot.vx;dot.sy=dot.vy;}
   dot.node.setAttribute('transform',`translate(${dot.x.toFixed(2)} ${dot.y.toFixed(2)})`);
  }
  this.rebound(ball,time);
  this.ballAt={x:ball.x,y:ball.y};this.ballZ=ball.z;
  this.drawBall();
  if(action?.path&&k<1){const points=action.path.getAttribute('points');action.path.setAttribute('points',`${points} ${ball.x.toFixed(2)},${ball.y.toFixed(2)}`);}
  if(action&&k>=1)this.settle(true);
  const holding=this.carrier?`${this.carrier.side}:${this.carrier.id}`:'';
  if(holding!==this.holding){this.holding=holding;for(const side of ['home','away'])for(const [id,dot] of this.dots[side])dot.node.classList.toggle('carrier',this.carrier?.side===side&&this.carrier.id===id);}
 }
 // A ball that leaves the pitch comes back off the boards, slowly.
 rebound(ball,time){
  const along=ball.x<-BOARD_X&&ball.vx<0||ball.x>W+BOARD_X&&ball.vx>0,across=ball.y<-BOARD_Y&&ball.vy<0||ball.y>H+BOARD_Y&&ball.vy>0;
  if(along||across)this.ballPath=path(ball,{x:ball.vx*(along?-.3:.6),y:ball.vy*(across?-.3:.6),z:Math.max(0,ball.vz)*.5},time);
 }
 // Seen from above, a ball in the air rises off its shadow and looks larger.
 drawBall(){
  const {x,y}=this.ballAt,z=this.ballZ||0;
  this.ball.setAttribute('cx',x.toFixed(2));this.ball.setAttribute('cy',(y-z*.45).toFixed(2));this.ball.setAttribute('r',(.95+z*.12).toFixed(2));
  this.shadow.setAttribute('cx',x.toFixed(2));this.shadow.setAttribute('cy',(y+.5).toFixed(2));
  this.ball.classList.toggle('faded',!!this.faded);
 }
 drawDots(){for(const team of ['home','away'])for(const dot of this.dots[team].values())dot.node.setAttribute('transform',`translate(${dot.x.toFixed(2)} ${dot.y.toFixed(2)})`);}
 highlight(ids){for(const side of ['home','away'])for(const [id,dot] of this.dots[side]){dot.node.classList.toggle('on',ids.includes(id));dot.node.classList.toggle('carrier',this.carrier?.side===side&&this.carrier.id===id);}}

 showClock(second){this.displayed=second;this.clockText(this.minute(second));this.querySelector('.replay-cursor').style.left=`${100*clamp(second/this.duration,0,1)}%`;if(this.live)this.emit('replay-clock',{second});}
 clockText(label){this.querySelector('.replay-clock').textContent=label;this.querySelector('.replay-progress-clock').textContent=label;}
 emit(name,detail){this.dispatchEvent(new CustomEvent(name,{detail,bubbles:true}));}
 showScore(){this.querySelector('.replay-score').textContent=`${this.score[0]} – ${this.score[1]}`;if(this.live)this.emit('replay-score',{score:[...this.score]});}
 caption(html,live=false){const node=this.querySelector('.replay-caption');node.innerHTML=html;node.classList.toggle('live',live);}
 showBanner(text,side){this.banner.textContent=text;this.banner.setAttribute('class',`replay-banner${text?' on':''}`);this.banner.style.fill=side?this.teams[side].major:'';}

 // The kick-off shape: both sides in their half, the ball on the centre spot at the feet of `side`'s most advanced player.
 kickOff(side){
  this.snap({x:W/2,y:H/2},side);
 }
 // Both teams set in their shape around `point`, the ball at rest there at the feet of `side`'s nearest player
 // (other than `exclude`); used where the replay cuts in, so nobody has to run across the pitch.
 snap(point,side,exclude=[],carrier=null){
  this.runs.clear();this.posts.clear();this.wall=null;this.pressLock=null;
  for(let pass=0;pass<2;pass++){
   const targets=this.targets(point,side);
   for(const team of ['home','away'])for(const [id,dot] of this.dots[team]){const spot=targets.get(team).get(id);if(spot){dot.x=spot.x;dot.y=spot.y;dot.vx=dot.vy=dot.sx=dot.sy=0;dot.gesture=null;}}
  }
  carrier=carrier&&this.dot(carrier)?carrier:this.nearest(side,point,{exclude});
  const dot=this.dot(carrier);
  if(dot){dot.x=point.x-this.direction(side)*CONTACT;dot.y=point.y;this.post(carrier,dot);}
  this.drawDots();
  this.carrier=carrier;this.lastSide=side;this.place(point);
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
  this.trail.replaceChildren();this.faded=false;this.tempo=1;this.cursor=null;this.cues=[];
  this.stage.classList.remove('fast');
  this.showBanner('');this.showScore();this.showClock(second);
  const next=this.sequences[index];
  this.kickOff(second&&next?this.opponent(this.side(next.team)):this.kickOffSide(this.period));
  this.highlight([]);
  this.clock=second;
  this.caption(second?'':'Coup d’envoi');
 }

 play(){
  if(this.live){if(this.hold)return;this.paused=false;this.updatePlay();this.startLoop();if(!this.running)this.liveLoop();return;}
  if(this.current>=this.sequences.length)this.reset(0);this.paused=false;this.querySelector('.replay-start')?.remove();this.updatePlay();this.startLoop();if(!this.running)this.loop();}
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

 // ---- Live: the match is fed one segment at a time (up to the next chance, card, change or whistle). ----
 // `this.live` holds the opening state (the match so far) and `next()`, which fetches the following segment.
 // The next segment is asked for only once the previous one has played out: the server never runs ahead of the viewer.
 startLive(){
  this.classList.add('live');
  this.querySelector('.replay-start')?.remove();
  this.duration=Math.max(this.duration,5400);
  this.resync(this.live.state);
  if(this.status==='playing'){this.hold=false;this.play();}
 }
 refreshSequences(){this.sequences=chanceSequences(this.events);this.others=this.events.filter(event=>event.kind in NOTABLE&&event.period!==3);}
 // Puts the pitch where the server says the match stands: on opening, and after new orders replaced what came next.
 resync(state){
  this.run++;this.settle(false);this.running=false;this.hold=true;
  this.events=state.result.events;this.refreshSequences();
  this.status=state.status;
  this.reset(state.second,this.sequences.length);
  this.score=[...state.score];this.showScore();
  this.clock=state.second;this.segmentShown=true;
  if(state.status==='halftime')this.showHalfTime();
  else if(state.status==='finished')this.finishLive(false);
 }
 append(data){
  const known=new Set(this.events.map(event=>event.sequence));
  const fresh=data.result.events.filter(event=>!known.has(event.sequence));
  this.events=[...this.events,...fresh];
  this.refreshSequences();
  this.status=data.status;
  return fresh;
 }
 async liveLoop(){
  const run=this.run;
  this.running=true;
  try{
   while(run===this.run&&!this.hold){
    if(this.stopRequested){this.stopAt(null);return;}
    this.fetching=true;this.segmentShown=false;
    let data;
    try{data=await this.live.next();}
    catch(error){if(run===this.run){this.hold=true;this.segmentShown=true;this.emit('live-error',{error});}return;}
    finally{this.fetching=false;}
    if(run!==this.run)return;
    const fresh=this.append(data);
    this.emit('live-segment',data);
    for(let index=this.nextIndex(this.current);index<this.sequences.length;index=this.nextIndex(index+1)){
     const sequence=this.sequences[index];
     this.current=index;
     if(!(await this.interlude(this.clock,sequence.second)))return;
     this.markCurrent(index);
     this.inChance=true;
     const played=await this.chance(sequence);
     this.inChance=false;
     if(!played)return;
     this.clock=sequence.end;
    }
    this.current=this.sequences.length;
    if(!(await this.interlude(this.clock,Math.max(this.clock,...fresh.map(event=>event.second)))))return;
    this.segmentShown=true;
    if(data.status==='finished'){this.finishLive();return;}
    if(data.status==='halftime'){this.showHalfTime();this.hold=true;this.emit('live-halftime',data);if(this.stopRequested)this.stopAt(null);return;}
    if(data.decision){this.hold=true;this.emit('live-decision',data);if(this.stopRequested)this.stopAt(null);return;}
   }
  }finally{if(run===this.run)this.running=false;}
 }
 // « Tactique » : resolves with the clock to rewind the server to, or null to stop where the server already is.
 // A chance being played finishes first (it closes its segment); between two chances the clock stops at once, and
 // what the server computed beyond it, unseen, is played again with the new orders.
 interrupt(){
  if(this.hold)return Promise.resolve(null);
  return new Promise(resolve=>{
   if(this.inChance){this.stopRequested=resolve;return;}
   const second=Math.max(0,Math.floor(this.displayed??this.clock)-1);
   this.run++;this.settle(false);this.running=false;this.hold=true;
   resolve(this.segmentShown&&!this.fetching?null:second);
  });
 }
 stopAt(second){const resolve=this.stopRequested;this.stopRequested=null;this.hold=true;this.running=false;resolve?.(second);}
 // After the Tactique panel or at the start of the second half.
 resume(){
  if(!this.live||!this.hold||this.status==='finished')return;
  this.hold=false;
  if(this.status==='halftime'){
   this.status='playing';this.period=2;
   this.updateRosters(this.clock);this.kickOff(this.kickOffSide(2));
   this.progress('Jeu en cours');this.caption('');
   this.querySelector('.replay-second-half').hidden=true;
  }
  this.play();
 }
 // The clock stays on 45′ until the viewer kicks the second half off.
 showHalfTime(){
  this.status='halftime';
  this.stage.classList.add('fast');
  this.progress('Mi-temps',true);
  this.caption(`<strong>Mi-temps</strong> · ${e(this.teams.home.name)} ${this.score[0]} – ${this.score[1]} ${e(this.teams.away.name)}`);
  this.clockText('45′');
  this.querySelector('.replay-second-half').hidden=false;
 }
 finishLive(notify=true){
  this.status='finished';this.hold=true;
  this.stage.classList.add('fast');
  this.progress('Coup de sifflet final',true);
  this.caption(`<strong>Coup de sifflet final</strong> · ${e(this.teams.home.name)} ${this.score[0]} – ${this.score[1]} ${e(this.teams.away.name)}`);
  this.querySelector('.replay-second-half').hidden=true;this.querySelector('.replay-continue').hidden=false;
  this.pause();
  if(notify)this.emit('live-finished');
  if(this.stopRequested)this.stopAt(null);
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
 // A television cut to a dead ball: the players vanish for an instant and reappear set around it, `setup` placing
 // whoever stands apart (the taker for his run-up, the wall).
 async cut(point,side,carrier,setup){
  this.stage.classList.add('cut');
  if(!(await this.wait(260)))return false;
  this.snap(point,side,[],carrier);
  setup?.();
  this.drawDots();this.trail.replaceChildren();
  this.stage.classList.remove('cut');
  return this.wait(420);
 }
 progress(label,still=false){this.querySelector('.replay-progress-label').textContent=label;this.stage.classList.toggle('still',still);}

 // ---- The ball and the runs. Each touch is struck where the beat before it ended; whoever meets the ball next is
 // sent to where it will be by then, and told how he will take it. ----
 // The ball at rest on `point` from `time`.
 place(point,time=this.time){this.ballPath=path({x:point.x,y:point.y,z:0},{x:0,y:0,z:0},time);this.ballAt={x:point.x,y:point.y};this.ballZ=0;this.drawBall();}
 // `who` runs from where he is to `point`, reached at `arrive` (ms of replay) going at `velocity` (m/ms).
 runTo(who,point,arrive,velocity={x:0,y:0}){
  const dot=this.dot(who);
  if(!dot||!point)return;
  const t0=this.time,t1=Math.max(t0+1,arrive),duration=t1-t0,from={x:dot.x,y:dot.y},reach=Math.max(1.5,distance(from,point));
  // His momentum bends the start of the run and his pace on arrival its end, never beyond the run's own length.
  const tangent=v=>{const length=Math.hypot(v.x,v.y);return scale(v,length?Math.min(1,reach/(length*duration))*duration:0);};
  this.posts.delete(this.key(who));
  this.runs.set(this.key(who),{t0,t1,from,to:{x:point.x,y:point.y},m0:tangent({x:dot.sx||0,y:dot.sy||0}),m1:tangent(velocity),v1:velocity});
 }
 // Keeps `who` on `point` (the ball at his feet, a wall) until a run sends him elsewhere.
 post(who,point){if(this.dot(who))this.posts.set(this.key(who),{x:point.x,y:point.y});}
 // How `who` will meet the ball at `at`: the 3D view swings his leg, lifts his knee or jumps in time for it.
 gesture(who,touch,at){const dot=this.dot(who);if(dot)dot.gesture=touch?{...touch,at}:null;}
 // Something that happens at a set time of the replay (the ball meeting the net or a defender), applied in order.
 cue(at,apply){this.cues.push({at,apply});this.cues.sort((a,b)=>a.at-b.at);}
 // How sure his touch is and how quick he is, from 0 to 1 (his technique and pace; average without them).
 skill(who){const value=this.styles?.get(who?.id)?.technique;return value==null?.5:clamp((value-35)/50,0,1);}
 quickness(who){const value=this.styles?.get(who?.id)?.vitesse;return value==null?.5:clamp((value-35)/50,0,1);}
 // How fast he carries the ball, in metres per ms.
 pace(who){return lerp(.0048,.0072,this.quickness(who));}
 // The touch that starts a move, as its player meets the ball `height` metres up; a header is set by its cross.
 touchOf(move,height=0){
  if(!move||move.type==='corner'||move.type==='free_kick'||move.header)return null;
  if(move.type==='control')return {kind:height>1.6?'head':height>1?'chest':height>.45?'thigh':'cushion'};
  if(move.type==='carry')return {kind:'touch'};
  return {kind:'kick',strength:move.type==='pass'?{ground:.5,driven:.8,lofted:1}[move.lift]:move.type==='cross'?.9:1};
 }
 // Off the ball, whoever the next pass or cross is meant for starts his run before it is struck, and the defender
 // who will block the next shot steps into its way.
 prepare(next,until){
  const time=until-this.time;
  if(next?.type==='shot'&&next.blocker){
   const dot=this.dot(next.blocker),ball=ballAt(this.ballPath,until),goal=this.toPitch(next.side,1,.5);
   const lane=lerpPoint(ball,goal,Math.min(.5,4.5/Math.max(1,distance(ball,goal)))),gap=dot?distance(dot,lane):0;
   if(gap>.5&&time>0)this.runTo(next.blocker,lerpPoint(dot,lane,Math.min(1,REACH*.85*time/gap)),until);
   return;
  }
  const runner=next?.type==='pass'||next?.type==='cross'?next.to:null,dot=this.dot(runner),spot=next?.type==='cross'?next.box:next?.point;
  if(!dot||!spot||time<=0)return;
  const gap=distance(dot,spot);
  if(gap<2)return;
  const reach=Math.min(gap-1.5,REACH*.75*time),direction=unit(dot,spot);
  this.runTo(runner,{x:dot.x+direction.x*reach,y:dot.y+direction.y*reach},until,scale(direction,Math.min(.0055,reach/time*1.2)));
 }
 // The ball leaves whoever had it: he is free to move again.
 loose(){if(this.carrier)this.posts.delete(this.key(this.carrier));this.carrier=null;}
 // The man the move is meant for, and the defender who will block its shot, keep making their runs towards where
 // they will meet the ball, beat after beat, unless the beat has already sent them somewhere.
 advance(until){
  const time=until-this.time;
  for(const run of this.runners||[]){
   const dot=this.dot(run.who);
   if(!dot||time<=0||this.carrier&&this.key(this.carrier)===this.key(run.who)||this.runs.get(this.key(run.who))?.t1>=until-1)continue;
   const gap=distance(dot,run.spot);
   if(gap<2)continue;
   const reach=Math.min(gap-1,REACH*.8*time),direction=unit(dot,run.spot);
   this.runTo(run.who,{x:dot.x+direction.x*reach,y:dot.y+direction.y*reach},until,scale(direction,Math.min(.006,reach/time)));
  }
 }
 // He has the ball at his feet and looks up before he plays it.
 opening(who,duration,next){
  const t0=this.start();
  this.gesture(who,this.touchOf(next),t0+duration);
  this.advance(t0+duration);
  this.prepare(next,t0+duration);
  return this.perform({kind:'wait',duration,t0});
 }
 // A pass, played where the receiver can be when it gets there: towards the spot of the move, as far as he can run
 // meanwhile. He comes onto it from where he is, ready to take it as the move has it.
 async pass(move,next,ahead){
  const to=move.to,receiver=this.dot(to);
  if(!receiver)return true;
  const t0=this.start(),from=ballAt(this.ballPath,t0),height=move.lift==='lofted'?move.height:0,timing=point=>FLIGHT[move.lift](distance(from,point));
  // As far towards the spot as he can run while the ball travels there (a shorter pass gives him less time).
  const gap=distance(receiver,move.point);
  let share=1;
  if(gap>REACH*timing(move.point)){
   let low=0,high=1;
   for(let round=0;round<14;round++){const middle=(low+high)/2;if(middle*gap<=REACH*timing(lerpPoint(receiver,move.point,middle)))low=middle;else high=middle;}
   share=low;
  }
  const aim=share<1?lerpPoint(receiver,move.point,share):move.point;
  let duration=timing(aim),velocity,options;
  if(height)({velocity,options}=lofted(from,aim,duration,height,{bend:move.bend}));
  else({velocity,duration}=rolled(from,aim,duration));
  this.ballPath=path(from,velocity,t0,options);
  this.loose();this.lastSide=to.side;
  const side=distance(receiver,aim)<1?unit(from,aim):unit(aim,receiver),onward=unit(aim,ahead||this.toPitch(to.side,1,.5));
  this.runTo(to,{x:aim.x+side.x*CONTACT,y:aim.y+side.y*CONTACT},t0+duration,scale(onward,{one:.004,carry:.003}[move.then]??.001));
  this.gesture(to,move.then==='one'?this.touchOf(next):this.touchOf({type:'control'},height),t0+duration);
  this.advance(t0+duration);
  if(move.then==='one')this.prepare(next,t0+duration);
  const done=await this.perform({kind:'pass',to,duration,t0,line:height?'replay-cross':'replay-pass'});
  if(done)this.carrier=to;
  return done;
 }
 // The first touch sets the ball out of his feet towards what he does next: the weaker his technique, the further
 // it runs and the wider of his aim. A high ball is killed with the thigh or the chest and drops in front of him.
 async control(move,next,ahead){
  const by=move.who;
  if(!this.dot(by))return true;
  const t0=this.start(),from=ballAt(this.ballPath,t0),skill=this.skill(by);
  const heading=turn(unit(from,ahead||this.toPitch(by.side,1,.5)),(this.random()-.5)*(1-skill)*.9),push=(move.carry?1.8:1.3)*(1.6-.8*skill);
  let duration=move.carry?480:lerp(640,440,skill),velocity;
  if(from.z>.3){
   const lift=from.z>1?.0008:.0004;
   duration=Math.max(duration,(lift+Math.sqrt(lift*lift+2*GRAVITY*from.z))/GRAVITY+260);
   velocity={...scale(heading,push/duration*.6),z:lift};
  }
  else velocity=rolled(from,{x:from.x+heading.x*push,y:from.y+heading.y*push},duration,TOUCH_FRICTION).velocity;
  this.ballPath=path(from,velocity,t0,{friction:TOUCH_FRICTION});
  // He has to go round the ball to play it on: he is given the time to, at a run.
  const dot=this.dot(by),behind=time=>{const ball=ballAt(this.ballPath,t0+time);return {x:ball.x-heading.x*CONTACT,y:ball.y-heading.y*CONTACT};};
  for(let round=0;round<3;round++)duration=Math.max(duration,distance(dot,behind(duration))/.0075);
  const ball=ballAt(this.ballPath,t0+duration);
  this.carrier=by;this.lastSide=by.side;
  this.runTo(by,{x:ball.x-heading.x*CONTACT,y:ball.y-heading.y*CONTACT},t0+duration,scale(heading,move.carry?this.pace(by)*.7:.0008));
  this.gesture(by,this.touchOf(next,ball.z),t0+duration);
  this.advance(t0+duration);
  this.prepare(next,t0+duration);
  return this.perform({kind:'carry',by,duration,t0,line:'replay-carry'});
 }
 // He knocks the ball on a stride or two at a time and runs onto it, until he has brought it to the spot of the move;
 // past the man he takes on, with a touch out to the side.
 async carry(move,next){
  const by=move.who;
  if(!this.dot(by))return true;
  const pace=this.pace(by),interval=lerp(700,560,this.skill(by)),other=this.opponent(by.side);
  const beaten=move.dribble!=null&&this.dots[other].has(move.dribble)?{side:other,id:move.dribble}:null,swerve=this.random()<.5?.6:-.6;
  if(beaten)this.pressLock={...beaten,until:this.time+interval*2.5};
  for(let touch=0;touch<14;touch++){
   const t0=this.start(),from=ballAt(this.ballPath,t0),gap=distance(from,move.point),stride=pace*interval,last=gap<=stride*1.4;
   const direction=beaten&&touch===1&&!last?turn(unit(from,move.point),swerve):unit(from,move.point);
   const length=last?gap:stride,aim={x:from.x+direction.x*length,y:from.y+direction.y*length},dot=this.dot(by);
   // Long enough for him to get onto it at a sprint at most.
   const duration=Math.max(last?Math.max(320,gap/pace):interval,distance(dot,{x:aim.x-direction.x*CONTACT,y:aim.y-direction.y*CONTACT})/.0085);
   this.ballPath=path(from,rolled(from,aim,duration,TOUCH_FRICTION).velocity,t0,{friction:TOUCH_FRICTION});
   const ball=ballAt(this.ballPath,t0+duration);
   this.carrier=by;this.lastSide=by.side;
   this.runTo(by,{x:ball.x-direction.x*CONTACT,y:ball.y-direction.y*CONTACT},t0+duration,scale(direction,pace*(last?.75:1)));
   this.gesture(by,last?this.touchOf(next):{kind:'touch'},t0+duration);
   this.advance(t0+duration);
   this.prepare(next,t0+duration);
   if(!(await this.perform({kind:'carry',by,duration,t0,line:'replay-carry'})))return false;
   if(last)break;
  }
  this.pressLock=null;
  return true;
 }
 // A cross, met in the box on the side the scorer is already coming from, as he leaves the ground for it.
 async cross(move){
  const t0=this.start(),from=ballAt(this.ballPath,t0),header=move.to,dot=this.dot(header);
  const local=dot?this.toLocal(move.side,dot):{u:.9,v:.5};
  let spot=this.toPitch(move.side,clamp(.915+(this.random()-.5)*.024,.88,.95),clamp(local.v+(this.random()-.5)*.08,.37,.63));
  let duration=FLIGHT[move.style](distance(from,spot));
  if(dot){
   const gap=distance(dot,spot);
   duration=Math.min(1900,Math.max(duration,gap/REACH));
   // Short of it, he meets it where he can, though not outside the box.
   if(gap>REACH*duration){const reached=this.toLocal(move.side,lerpPoint(dot,spot,REACH*duration/gap));spot=this.toPitch(move.side,Math.max(.84,reached.u),reached.v);}
  }
  const {velocity,options}=lofted(from,spot,duration,move.height,{bend:move.bend});
  this.ballPath=path(from,velocity,t0,options);
  this.loose();
  if(dot)this.runTo(header,spot,t0+duration,scale(unit(dot,spot),.002));
  this.gesture(header,{kind:'head',jump:clamp(move.height-1.75,0,.6)},t0+duration);
  return this.perform({kind:'cross',by:move.by,to:header,duration,t0,line:'replay-cross'});
 }
 // A dead ball: the taker runs in from where he stands and strikes it as he reaches it.
 runUp(taker,ball,next,duration){
  const t0=this.start(),dot=this.dot(taker);
  if(dot){const direction=unit(dot,ball);this.runTo(taker,{x:ball.x-direction.x*CONTACT,y:ball.y-direction.y*CONTACT},t0+duration,scale(direction,.0035));}
  this.gesture(taker,this.touchOf(next),t0+duration);
  this.advance(t0+duration);
  this.prepare(next,t0+duration);
  return this.perform({kind:'wait',duration,t0});
 }
 // The ball by the flag; the taker steps back, a little outside the lines, and runs in to it.
 async corner(move,next){
  const flag=this.toPitch(move.side,.997,move.top?.005:.995),back=turn(unit(this.toPitch(move.side,.9,.5),flag),(move.top?1:-1)*this.direction(move.side)*.6);
  let taker=null;
  const setup=()=>{
   taker=this.carrier;
   const dot=this.dot(taker);
   if(dot){dot.x=flag.x+back.x*3.2;dot.y=flag.y+back.y*3.2;this.post(taker,dot);}
   // Whoever will rise for it has come up and waits in the box.
   const header=this.dot(next?.to),spot=next?.box;
   if(header&&spot&&next.to.id!==taker?.id){Object.assign(header,{x:spot.x+(this.random()-.5)*6,y:spot.y+(this.random()-.5)*8,sx:0,sy:0});this.post(next.to,header);}
  };
  if(!(await this.cut(flag,move.side,move.taker,setup)))return false;
  return this.runUp(taker,flag,next,900);
 }
 // The ball set down, the shooter a few strides back and to the side, and the wall: four men shoulder to shoulder
 // 9.15 m off, across the line to goal.
 async freeKick(move,next){
  const side=move.side,other=this.opponent(side),spot=move.point,ahead=unit(spot,this.toPitch(side,1,.5)),across={x:-ahead.y,y:ahead.x};
  const offset=this.random()<.5?1.4:-1.4;
  let shooter=null;
  const setup=()=>{
   shooter=this.carrier;
   const dot=this.dot(shooter);
   if(dot){dot.x=spot.x-ahead.x*3.4+across.x*offset;dot.y=spot.y-ahead.y*3.4+across.y*offset;this.post(shooter,dot);}
   const centre={x:spot.x+ahead.x*9.15,y:spot.y+ahead.y*9.15};
   // The man who will block the shot is one of them.
   const blocker=next?.blocker;
   this.wall=this.rosters[other].filter(player=>player.position!=='GB').map(player=>({side:other,id:player.id}))
    .sort((a,b)=>(b.id===blocker?.id)-(a.id===blocker?.id)||distance(this.dot(a),centre)-distance(this.dot(b),centre)).slice(0,4);
   this.wall.forEach((man,index)=>{const dot=this.dot(man);Object.assign(dot,{x:centre.x+across.x*(index-1.5)*.62,y:centre.y+across.y*(index-1.5)*.62,sx:0,sy:0});this.post(man,dot);});
  };
  if(!(await this.cut(spot,side,move.by,setup)))return false;
  if(!(await this.wait(300)))return false;
  return this.runUp(shooter,spot,next,850);
 }
 // The strike, to where the engine's outcome puts it: in the net, in the keeper's arms, wide or over, or onto the
 // defender who threw himself in front of it. A header is nodded down; a free kick clears the wall and dips.
 async shoot(move,sequence){
  const side=move.side,other=this.opponent(side),random=this.random,at=(u,v)=>this.toPitch(side,u,v),keeper=move.keeper;
  const t0=this.start(),from=ballAt(this.ballPath,t0);
  const outcome=sequence.outcome?.kind,blocked=outcome==='off_target'&&sequence.outcome.detail==='blocked',spread=amount=>.5+(random()-.5)*2*amount;
  let target,height;
  // A blocked strike goes at the defender standing in its way, if one does; otherwise somewhere off target.
  const blockerDot=this.dot(move.blocker),goal=at(1,.5),toGoal=unit(from,goal),toBlocker=blockerDot&&unit(from,blockerDot);
  const inWay=blockerDot&&distance(from,blockerDot)<25&&toGoal.x*toBlocker.x+toGoal.y*toBlocker.y>.35;
  if(inWay){target={x:from.x+toBlocker.x*(distance(from,goal)+2),y:from.y+toBlocker.y*(distance(from,goal)+2)};height=move.freeKick?lerp(1.6,2.2,random()):lerp(.3,1,random());}
  else if(outcome==='goal'||outcome==='save'){target=at(outcome==='goal'?1:.99,spread(.045));height=move.header?lerp(.2,1.3,random()):move.style==='low'?0:lerp(.25,2.1,random());}
  else if(!blocked&&random()<(move.header?.5:.4)){target=at(1,spread(.05));height=lerp(2.7,4.2,random());}
  else{const wide=.054+lerp(.01,.04,random());target=at(1,random()<.5?.5-wide:.5+wide);height=move.style==='low'?0:lerp(.1,1.6,random());}
  // A header from far out is struck harder, so that it does not loop.
  const speed=move.header?Math.max(lerp(.012,.016,random()),distance(from,target)/1100):move.freeKick?lerp(.022,.027,random()):move.style==='placed'?lerp(.017,.021,random()):lerp(.025,.031,random());
  let duration=distance(from,target)/speed,velocity,options;
  if(!height&&!move.header&&!move.freeKick)({velocity,duration}=rolled(from,target,duration));
  else{
   const gravity=move.freeKick&&!inWay?Math.min(GRAVITY*2.6,dip(from,target,duration,height,9.15,2.45)):GRAVITY;
   const bend=move.freeKick?(random()<.5?-1:1)*lerp(1,2.5,random()):move.style==='placed'?(random()-.5)*1.2:0;
   ({velocity,options}=lofted(from,target,duration,height,{bend,gravity}));
  }
  this.ballPath=path(from,velocity,t0,options);
  this.loose();
  // The wall jumps as the ball goes over it.
  if(move.freeKick)for(const man of this.wall||[])this.gesture(man,{kind:'head',jump:.35},t0+duration*Math.min(.9,9.15/distance(from,target)));
  const keeperDot=this.dot(keeper),dive=keeperDot&&outcome!=='off_target'?this.toPitch(other,.015,this.toLocal(other,target).v):null;
  if(dive)this.runTo(keeper,dive,t0+duration*.92);
  let end=duration;
  const blocker=move.blocker;
  if(blockerDot){
   // It meets him where he stands, or where on its way he can get to it soonest for the time it takes.
   if(inWay)end=duration*Math.max(.05,(distance(from,blockerDot)-CONTACT*.5)/distance(from,target));
   else{
    let need=Infinity;
    for(let share=.1;share<=.7;share+=.02){const required=distance(blockerDot,ballAt(this.ballPath,t0+duration*share))/(duration*share);if(required<need){need=required;end=duration*share;}}
   }
   const point=ballAt(this.ballPath,t0+end),angle=(random()-.5)*1.6,rebound=lerp(.2,.35,random()),lift=lerp(.002,.005,random());
   this.runTo(blocker,point,t0+end);
   this.gesture(blocker,{kind:point.z>1?'chest':'thigh'},t0+end);
   this.cue(t0+end,()=>{const ball=ballAt(this.ballPath,t0+end);this.ballPath=path(ball,{...scale(turn({x:-ball.vx,y:-ball.vy},angle),rebound),z:lift},t0+end);});
  }
  else if(outcome==='goal')this.cue(t0+end,()=>{const ball=ballAt(this.ballPath,t0+end);this.ballPath=path(ball,{x:ball.vx*.1,y:ball.vy*.1,z:Math.min(0,ball.vz)*.1},t0+end,{friction:NET_FRICTION});});
  else if(outcome==='save')this.cue(t0+end,()=>{this.place(ballAt(this.ballPath,t0+end),t0+end);this.carrier=keeper;const dot=this.dot(keeper);if(dot)this.post(keeper,dot);});
  return this.perform({kind:'shot',by:move.by,keeper,keeperFrom:keeperDot&&{x:keeperDot.x,y:keeperDot.y},keeperPoint:dive,duration:end,t0,line:'replay-shot'});
 }
 // A teammate a short pass square or back from the ball, for the move to go round before it goes forward.
 support(owner,receiver,ball){
  const side=owner.side,local=this.toLocal(side,ball);
  let best=null,score=Infinity;
  for(const player of this.rosters[side]){
   if(player.id===owner.id||player.id===receiver.id||(player.position==='GB'&&local.u>.3))continue;
   const dot=this.dots[side].get(player.id);
   if(!dot)continue;
   const gap=distance(dot,ball);
   if(gap<7||gap>24||this.toLocal(side,dot).u-local.u>.04)continue;
   if(Math.abs(gap-13)<score){score=Math.abs(gap-13);best={side,id:player.id};}
  }
  return best;
 }

 // The move as a list of touches: how each step of the engine's trail is played and taken, then the finish.
 plan(sequence,{side,holder,title,name}){
  const random=this.random,at=(u,v)=>this.toPitch(side,u,v),jitter=(value,amount)=>clamp(value+(random()-.5)*2*amount,.02,.98);
  const who=id=>id!=null&&this.dots[side].has(id)?{side,id}:null;
  const shot=sequence.shot,kind=shot.detail,counter=sequence.start?.detail==='counter',moves=[];
  let owner=holder,ball=this.ballAt,lane=sequence.start?.lane;
  // First time, controlled then played, or carried on: first time more often on the break and the surer a player's
  // touch, carried the more often the quicker he is.
  const taking=(player,carry=.2)=>{const one=(counter?.5:.32)*(.6+.8*this.skill(player)),draw=random();return draw<one?'one':draw<one+carry*(.6+.8*this.quickness(player))?'carry':'two';};
  const passTo=(player,point,note,{lift,then,dribble=null}={})=>{
   const gap=distance(ball,point);
   lift??=gap>34?'lofted':gap>20?'driven':'ground';
   then??=dribble!=null?'carry':taking(player);
   if(lift==='lofted'&&then==='one')then='two';
   // A carry starts short of the spot: he brings the ball the rest of the way. A long ball is met on the foot,
   // the thigh or the chest.
   moves.push({type:'pass',to:player,point:then==='carry'?lerpPoint(ball,point,lerp(.5,.7,random())):point,lift,then,note,
               height:lift==='lofted'?[.25,.8,1.35][Math.floor(random()*3)]:0,bend:lift==='lofted'?(random()-.5)*3:0});
   if(then!=='one')moves.push({type:'control',who:player,carry:then==='carry'});
   if(then==='carry')moves.push({type:'carry',who:player,point,dribble});
   owner=player;ball=point;
  };
  for(const event of sequence.progress){
   const point=at(jitter(ZONE_U[event.zone],.04),jitter(LANE_V[event.lane],.07)),player=who(event.player_id);
   const dribble=event.detail==='dribble'?event.secondary_id:null,switched=lane!=null&&event.lane!==lane;
   let note=[event.player_id,`${title} · ${dribble!=null?`${name(event)} élimine ${e(event.secondary||'—')}`:`${name(event)} fait avancer le jeu`}`];
   lane=event.lane;
   if(!player)continue;
   if(owner?.id===player.id){moves.push({type:'carry',who:player,point,dribble,note});ball=point;continue;}
   // Now and then the ball goes square or back to a teammate first, who plays it on.
   const support=!counter&&dribble==null&&owner&&random()<.32?this.support(owner,player,ball):null;
   if(support){passTo(support,lerpPoint(this.dot(support),ball,.15),note,{lift:'ground',then:random()<.55?'one':'two'});note=null;}
   passTo(player,point,note,{dribble,lift:switched&&distance(ball,point)>26?'lofted':undefined});
  }
  const shooter=who(shot.player_id),goal=at(1,.5),box=at(.915,.5);
  if(kind==='corner'){
   const top=sequence.setPiece?.lane===0||(sequence.setPiece?.lane===1&&random()<.5);
   const taker=who(sequence.delivery?.player_id)||this.nearest(side,at(1,top?0:1));
   moves.push({type:'corner',side,taker,top,note:[taker?.id,`${title} · Corner tiré par ${name(sequence.delivery)}`]});
   moves.push({type:'cross',side,by:taker,to:shooter,box,style:random()<.55?'floated':'whipped',height:lerp(1.9,2.4,random()),bend:(random()<.5?-1:1)*lerp(1.5,3,random()),note:[shot.player_id,`${title} · Tête de ${name(shot)}`]});
   moves.push({type:'shot',side,by:shooter,header:true,point:goal});
  }else if(kind==='free_kick'){
   moves.push({type:'free_kick',side,by:shooter,point:at(jitter(.78,.03),jitter(LANE_V[shot.lane??1]*.6+.2,.05)),note:[shot.player_id,`${title} · Coup franc pour ${name(shot)}`]});
   moves.push({type:'shot',side,by:shooter,freeKick:true,point:goal});
  }else if(kind==='cross'){
   const crosser=who(sequence.delivery?.player_id)||owner,wing=(sequence.delivery?.lane??shot.lane)===0?.07:.93;
   const note=[crosser?.id,`${title} · Centre de ${name(sequence.delivery)}`],flank=at(jitter(.84,.02),wing),byline=at(jitter(.95,.012),wing);
   // He crosses early, or takes it on to the byline first.
   if(crosser&&crosser.id!==owner?.id){const then=taking(crosser,.35);passTo(crosser,then==='carry'?byline:flank,note,{then});}
   else if(crosser)moves.push({type:'carry',who:crosser,point:random()<.45?byline:flank,note});
   moves.push({type:'cross',side,by:crosser,to:shooter,box,style:random()<.5?'floated':'whipped',height:lerp(1.9,2.35,random()),bend:(random()-.5)*2.4,note:[shot.player_id,`${title} · Tête de ${name(shot)}`]});
   moves.push({type:'shot',side,by:shooter,header:true,point:goal});
  }else{
   const spot=at(jitter(.855,.035),jitter(.5,.1)),note=[shot.player_id,`${title} · Frappe de ${name(shot)}`];
   // Side-footed into a corner, driven, or along the grass.
   const style=['placed','driven','driven','low'][Math.floor(random()*4)];
   if(shooter&&shooter.id!==owner?.id)passTo(shooter,spot,note,{lift:distance(ball,spot)>24?'driven':'ground'});
   else if(shooter&&distance(ball,spot)>4)moves.push({type:'carry',who:shooter,point:spot,note});
   moves.push({type:'shot',side,by:shooter,style,point:goal,note:moves.some(move=>move.note===note)?null:note});
  }
  // A pass taken first time is struck on at once; otherwise he controls it first.
  for(let index=0;index<moves.length;index++){
   const move=moves[index],next=moves[index+1];
   if(move.type==='pass'&&move.then==='one'&&!['pass','cross','shot'].includes(next?.type)){move.then='two';moves.splice(index+1,0,{type:'control',who:move.to,carry:next?.type==='carry'});}
  }
  return moves;
 }

 async chance(sequence){
  const side=this.side(sequence.team),other=this.opponent(side),team=this.teams[side];
  this.random=seeded(sequence.id*7919+sequence.second);
  const at=(u,v)=>this.toPitch(side,u,v);
  const name=event=>e(event?.player||'—');
  this.period=sequence.period;
  this.tempo=CHANCE_TEMPO;
  this.updateRosters(sequence.second);
  this.trail.replaceChildren();this.showBanner('');
  // The clock stops on the minute of the chance while it plays out.
  this.showClock(sequence.second);
  const involved=[];
  const note=(id,text)=>{if(id!=null)involved.push(id);this.highlight(involved);this.caption(text);};
  const shot=sequence.shot,counter=sequence.start?.detail==='counter';
  const title=`<strong style="color:${team.major}">${e(team.name)}</strong> · ${this.minute(sequence.second)}`;
  const jitter=(value,amount)=>clamp(value+(this.random()-.5)*2*amount,.02,.98);
  // The move starts where the engine recovered the ball, or just short of the shot for saves without a trail.
  const start=sequence.start?at(jitter(ZONE_U[sequence.start.zone],.04),jitter(LANE_V[sequence.start.lane],.06))
   :at(ZONE_U[Math.max(0,(shot.zone??3)-1)],LANE_V[shot.lane??1]);
  // The players come back on around the ball, held by someone other than the first carrier of the move,
  // so the move opens with a pass.
  const holder=this.snap(start,side,sequence.progress.slice(0,1).map(event=>event.player_id));
  this.faded=false;
  this.stage.classList.remove('fast');
  note(null,`${title} · ${counter?'Contre-attaque !':sequence.start?'Récupération':'Occasion'}`);
  const moves=this.plan(sequence,{side,holder,title,name});
  const outcome=sequence.outcome?.kind,blocked=outcome==='off_target'&&sequence.outcome.detail==='blocked';
  const finish=moves.find(move=>move.type==='shot'),before=moves[moves.indexOf(finish)-1];
  finish.keeper=shot.secondary_id!=null&&this.dots[other].has(shot.secondary_id)?{side:other,id:shot.secondary_id}:this.keeperOf(other);
  finish.blocker=blocked&&this.dots[other].has(sequence.outcome.secondary_id)?{side:other,id:sequence.outcome.secondary_id}:null;
  // The scorer of a header heads for the box from the start of the move, a shooter for where he will strike, and
  // the defender who will block it for the line from there to goal. Coming back on, they are already on their way.
  const strike=finish.header?moves.find(move=>move.type==='cross').box:before?.point||at(.85,.5),goal=at(1,.5);
  this.runners=[finish.by&&{who:finish.by,spot:strike,start:14},finish.blocker&&{who:finish.blocker,spot:lerpPoint(strike,goal,Math.min(.5,4.5/Math.max(1,distance(strike,goal)))),start:5}]
   .filter(run=>run&&this.dot(run.who)&&run.who.id!==holder?.id);
  for(const run of this.runners){const dot=this.dot(run.who),gap=distance(dot,run.spot);if(gap>run.start)Object.assign(dot,lerpPoint(run.spot,dot,run.start/gap));}
  this.drawDots();
  if(!(await this.opening(holder,600,moves[0])))return false;
  for(let index=0;index<moves.length;index++){
   const move=moves[index],next=moves[index+1],ahead=moves.slice(index+1).find(item=>item.point)?.point;
   if(move.note)note(...move.note);
   if(move.type==='shot'){
    if(move.keeper)involved.push(move.keeper.id);
    if(move.blocker)involved.push(move.blocker.id);
    this.highlight(involved);
    if(!(await this.shoot(move,sequence)))return false;
   }
   else if(!(await this[{free_kick:'freeKick'}[move.type]??move.type](move,next,ahead)))return false;
  }
  const xg=shot.xg!=null?` <small>xG ${shot.xg.toFixed(2)}</small>`:'';
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
  this.caption(`${title} · ${outcome==='save'?`Arrêt de ${e(shot.secondary||'—')}`:blocked?`Tir contré par ${e(sequence.outcome.secondary||'—')}`:'Tir non cadré'}${xg}`);
  this.tempo=1;
  return this.wait(850);
 }
}
// Where a scripted run has him at `time`: a cubic from where he was, at the pace he had, to his spot at the pace he
// is to reach it with; past it, he carries on at that pace.
function runAt(run,time){
 if(time>=run.t1)return {x:run.to.x+run.v1.x*(time-run.t1),y:run.to.y+run.v1.y*(time-run.t1)};
 const k=clamp((time-run.t0)/(run.t1-run.t0),0,1),h00=2*k**3-3*k*k+1,h10=k**3-2*k*k+k,h01=-2*k**3+3*k*k,h11=k**3-k*k;
 return {x:h00*run.from.x+h10*run.m0.x+h01*run.to.x+h11*run.m1.x,y:h00*run.from.y+h10*run.m0.y+h01*run.to.y+h11*run.m1.y};
}
// He runs towards `target` at no more than `top`, speeding up and braking like a man rather than a spring: the pace
// he wants is the one that still lets him stop on it (pitch metres, ms, velocity kept in dot.sx/dot.sy).
function steer(dot,target,dt,top){
 for(let left=dt;left>0;left-=16){
  const step=Math.min(16,left),dx=target.x-dot.x,dy=target.y-dot.y,gap=Math.hypot(dx,dy),sx=dot.sx||0,sy=dot.sy||0;
  const pace=gap<.25?0:Math.min(top,Math.sqrt(2*BRAKE*gap));
  let ax=(gap?dx/gap*pace:0)-sx,ay=(gap?dy/gap*pace:0)-sy;
  const change=Math.hypot(ax,ay),limit=(pace>Math.hypot(sx,sy)?ACCEL:BRAKE)*step;
  if(change>limit){ax*=limit/change;ay*=limit/change;}
  dot.sx=sx+ax;dot.sy=sy+ay;
  dot.x+=dot.sx*step;dot.y+=dot.sy*step;
 }
}
if(globalThis.customElements&&!customElements.get('match-replay'))customElements.define('match-replay',MatchReplay);

const pending=new Map();
let keys=0;
// `teams` holds {name, major, minor, keeper} for each side; the element starts itself once inserted.
function rosterNames(result){
 const names=new Map();
 for(const player of [...result.home_lineup,...result.home_bench,...result.away_lineup,...result.away_bench])names.set(player.id,shortName(player.name,player.short));
 for(const event of result.events){if(event.player&&!names.has(event.player_id))names.set(event.player_id,shortName(event.player,event.player_short));if(event.secondary&&!names.has(event.secondary_id))names.set(event.secondary_id,shortName(event.secondary,event.secondary_short));}
 return names;
}
// The technique and pace of everyone in the match: a surer touch, a quicker carry.
function rosterStyles(result){
 const styles=new Map();
 for(const player of [...result.home_lineup,...result.home_bench,...result.away_lineup,...result.away_bench])if(player.technique!=null)styles.set(player.id,{technique:player.technique,vitesse:player.vitesse});
 return styles;
}
// The live match: `state` is the match so far (as GET /direct returns it), `next()` fetches the following segment.
export function liveReplay(state,teams,next){
 const result=state.result,key=String(++keys);
 pending.set(key,{events:[],duration:0,homeId:state.home.id,awayId:state.away.id,teams,names:rosterNames(result),styles:rosterStyles(result),
                  lineups:{home:result.home_lineup,away:result.away_lineup},live:{state,next}});
 return `<match-replay data-key="${key}"></match-replay>`;
}
export function replayCard(match,teams){
 const result=match.result,key=String(++keys);
 pending.set(key,{events:result.events,duration:result.duration,homeId:match.home.id,awayId:match.away.id,teams,names:rosterNames(result),styles:rosterStyles(result),
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
