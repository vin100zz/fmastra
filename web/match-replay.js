// A top-down replay of the chances of a match: each possession that ended in a shot is drawn from the
// engine's own trail (start, zones crossed, delivery, shot, outcome); the play in between is only suggested.
//
// The ball is a projectile (replay-physics.js): struck, it flies, bounces and rolls on its own, and each touch is
// played where it will be at that moment, by a player sent there in time. A pass goes along the grass or over the
// lines; it is taken first time, or controlled then played, or carried on touch after touch. Players run at a
// footballer's pace and speed up and brake like one. The 3D view (replay-3d.js) draws all of it as it is.
import {escape as e,contrastText,matchMinute,shortName,kitShirt,GO} from './ui.js';
import {GRAVITY,ballAt,dip,lofted,path,rolled} from './replay-physics.js';

const W=105,H=68;
// The engine's grid in a side's own frame: u from its goal (0) to the opponent's (1), v from its left to its right.
const ZONE_U=[.14,.37,.62,.84],LANE_V=[.17,.5,.83];
const DEPTH={GB:.02,DC:.17,DG:.2,DD:.2,MDC:.33,MC:.46,MOC:.58,AILG:.68,AILD:.68,BU:.74};
const SEQUENCE_KINDS=new Set(['possession','circulation','progress','corner','free_kick','delivery','shot','goal','save','off_target','foul','penalty','throw_in']);
// Of a run of passes kept, the replay plays at most the last few.
const CIRCULATION_SHOWN=6;
// Which chances the summary plays, by the engine's xG (0.05 for a corner or free kick, up to about 0.25 for a
// clean shot); goals are always shown. Remembered for the viewer between matches.
const FILTERS=[['0','Toutes les occasions'],['0.1','Occasions nettes (xG ≥ 0,10)'],['0.2','Grosses occasions (xG ≥ 0,20)'],['goals','Buts seulement']];
const FILTER_KEY='touchline-replay-filter',VIEW_KEY='touchline-replay-view',SPEED_KEY='touchline-replay-speed';
// The paces of the speed slider, slowest first; 1 is the pace of life. Remembered for the viewer between matches.
const SPEEDS=[.25,.5,.75,1,1.5,2,3,4];
// Live, the play between two chances, where the clock runs, has its own pace, remembered apart: at 1× a match minute
// takes MS_PER_MINUTE ms. A goal holds the pitch GOAL_HOLD_MS, whatever the paces.
const DEAD_SPEEDS=[.5,1,2,4,8,16,32],DEAD_KEY='touchline-live-dead-speed',GOAL_HOLD_MS=4000,CARD_HOLD_MS=2600;
// The icons before the two sliders of the live match: the ball for the chances, the stopwatch for the clock between them.
const SLIDER_ICONS={ball:'<svg class="slider-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="m10 6.2 3.2 2.3-1.2 3.8H8l-1.2-3.8Z"/></svg>',
 clock:'<svg class="slider-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="11" r="6.5"/><path d="M10 7.5V11l2.2 1.6M8 2.5h4"/></svg>'};
const remembered=(key,stops,fallback)=>{try{const saved=Number(localStorage.getItem(key));return stops.includes(saved)?saved:fallback;}catch{return fallback;}};
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
// The back four, who hold one line; how closely each role marks a man near goal; how long a set of pairs holds (ms).
const BACK_LINE=new Set(['DG','DC','DD']),MARKING={DG:1,DC:1,DD:1,MDC:.85,MC:.6,MOC:.45,AILG:.55,AILD:.55,BU:.25},MARK_MS=900;
// Between chances the clock runs at this many ms of replay per match minute; chances play at this pace, 1 being life-like.
const MS_PER_MINUTE=90,CHANCE_TEMPO=1;
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
const lerp=(a,b,k)=>a+(b-a)*k;
const smoothstep=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const lerpPoint=(from,to,k)=>({x:lerp(from.x,to.x,k),y:lerp(from.y,to.y,k)});
const unit=(from,to)=>{const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);return length?{x:dx/length,y:dy/length}:{x:1,y:0};};
const scale=(vector,k)=>({x:vector.x*k,y:vector.y*k});
// A ball played along the grass is struck on it: still bouncing, it would drop and lose its pace at the bounce,
// and stop short of whoever was sent to meet it.
const grounded=point=>({x:point.x,y:point.y,z:0});
const turn=(vector,angle)=>({x:vector.x*Math.cos(angle)-vector.y*Math.sin(angle),y:vector.x*Math.sin(angle)+vector.y*Math.cos(angle)});
// Minutes as the match report gives them (`matchMinute`); `half` is when the first half ended.
const clockLabel=(second,half)=>`${matchMinute(second,half)}′`;
// What a stop in the viewer's side says first: his side's colours and the minute of the fact. It is always his side's;
// a server older than these fields gives neither, and the stop then reads at the clock where the match stands.
export function stopSaid(decision,{homeId,clock,live}){
 const side=decision.team_id!=null?(decision.team_id===homeId?'home':'away'):live?.state?.side??'home';
 const second=Number.isFinite(decision.second)?decision.second:clock;
 return {side,second};
}
// Stable jitter, so a chance looks the same each time it is replayed.
const seeded=seed=>()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const SVG='http://www.w3.org/2000/svg';
const svg=(tag,attributes={})=>{const node=document.createElementNS(SVG,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);return node;};
// A disc cut from the chest of the side's shirt (/kits/{id}.png, as fractions of its square): below the collar, inside the
// sleeves, the widest circle that stays on the fabric of all 57 templates, so the disc shows the shirt's own pattern.
const CHEST={x:627/1254,y:620/1254,r:290/1254};
let shirtFills=0;

// The play a chance's trail goes through: runs of passes and moves forward, and the stoppages the side kept the ball
// through (a foul it suffered, a throw-in, a free kick or a corner played short).
const TRAIL_KINDS=new Set(['circulation','progress','foul','throw_in','free_kick','corner']);

// The chances of a match, in order: one for each shot, from the start of its possession or from the shot before it in
// the same possession (the rebound of a save, the header from the corner it gave), with the loss of the ball that gave
// the side its chance. Saves made before the replay trail existed only hold the shot; those made before the runs of
// passes, only the moves forward.
export function chanceSequences(events){
 const groups=new Map(),losses=new Map();
 for(const event of events){
  if(event.kind==='turnover'&&event.possession_id!=null)losses.set(event.possession_id+1,event);
  if(event.period===3||event.possession_id==null||!SEQUENCE_KINDS.has(event.kind))continue;
  if(!groups.has(event.possession_id))groups.set(event.possession_id,[]);
  groups.get(event.possession_id).push(event);
 }
 const sequences=[];
 for(const group of groups.values()){
  let from=0,follow=null;
  group.forEach((shot,index)=>{
   if(shot.kind!=='shot')return;
   const outcome=group.find(event=>['goal','save','off_target'].includes(event.kind)&&event.shot_id===shot.shot_id);
   const part=group.slice(from,outcome?group.indexOf(outcome)+1:index+1);
   // The set piece the shot came straight from; one played short is part of the move.
   const direct={corner:'corner',crossed_free_kick:'free_kick',free_kick:'free_kick'}[shot.detail];
   const setPiece=direct&&part.filter(event=>event.kind===direct&&event.detail!=='short').at(-1);
   sequences.push({id:shot.possession_id,team:shot.team_id,period:shot.period,second:part[0].second,end:(outcome||shot).second,
                   start:follow?undefined:part.find(event=>event.kind==='possession'),progress:part.filter(event=>event.kind==='progress'),
                   trail:part.filter(event=>TRAIL_KINDS.has(event.kind)&&event!==setPiece),recovery:follow?undefined:losses.get(shot.possession_id),
                   setPiece,delivery:part.filter(event=>event.kind==='delivery').at(-1),foul:part.filter(event=>event.kind==='foul').at(-1),
                   follow,shot,outcome,goal:outcome?.kind==='goal'});
   from=outcome?group.indexOf(outcome)+1:index+1;
   follow=outcome||shot;
  });
 }
 return sequences;
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
  this.speed=remembered(SPEED_KEY,SPEEDS,1);this.deadSpeed=remembered(DEAD_KEY,DEAD_SPEEDS,1);
  this.paused=true;
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
  // The clock in a corner of the pitch. The score is the match banner's, which follows the replay.
  const slider=(key,title,icon='')=>`<label class="slider" title="${title}">${icon}<input type="range" data-replay="${key}" min="0" max="${(key==='dead-speed'?DEAD_SPEEDS:SPEEDS).length-1}" step="1" aria-label="${title}"><output></output></label>`;
  const filter=`<select data-replay="filter" aria-label="Occasions montrées">${FILTERS.map(([value,label])=>`<option value="${value}"${value===this.filter?' selected':''}>${label}</option>`).join('')}</select>`;
  const view='<button type="button" data-replay="view" aria-pressed="false" aria-label="Vue 3D" title="Vue 3D">3D</button>';
  // Live, the score and the clock are in the match's band above the pitch (live.js); under the pitch, the commentary in
  // the colours of the side that has the chance, the whole match on a line, and two paces, the chances' and the clock's.
  // Between two chances the pitch shows both sides in their formation (filled by live.js), the commands of the break
  // and of the final whistle over it.
  if(this.live)this.innerHTML=`<div class="replay-stage"><div class="replay-progress"><div class="live-formations"></div><button type="button" class="primary cta replay-second-half" data-live="second-half" hidden>2e mi-temps ${GO}</button><button type="button" class="primary cta replay-continue" data-live="continuer" hidden>Continuer ${GO}</button></div></div>
<div class="replay-caption ticker" aria-live="polite"><img class="ticker-crest" alt="" hidden><b class="ticker-minute"></b><span class="ticker-text"></span><span class="ticker-run" aria-hidden="true"><i></i></span></div>
<div class="replay-timeline frise" role="img" aria-label="Frise du match"><span class="frise-played"></span><span class="replay-half"></span><span class="frise-marks"></span><span class="replay-cursor"></span></div>
<div class="replay-controls"><button type="button" data-replay="play" aria-label="Lecture" title="Lecture">▶</button><button type="button" data-replay="next" aria-label="Aller à l’occasion suivante" title="Aller à l’occasion suivante">⏭</button>${slider('speed','Vitesse des actions',SLIDER_ICONS.ball)}${slider('dead-speed','Vitesse des temps morts',SLIDER_ICONS.clock)}${view}${filter}<div class="live-actions"></div></div>`;
  else this.innerHTML=`<div class="replay-stage"><div class="replay-bug"><span class="replay-clock">0′</span></div><div class="replay-progress"><strong class="replay-progress-clock" aria-hidden="true">0′</strong><span class="replay-progress-bar" aria-hidden="true"><i></i></span><span class="replay-progress-label" aria-hidden="true">Jeu en cours</span><ul class="replay-progress-notes" aria-hidden="true"></ul></div><button type="button" class="replay-start"><span>▶</span>Voir le résumé<small></small></button></div>
<div class="replay-caption" aria-live="polite"></div>
<div class="replay-timeline" role="group" aria-label="Occasions du match"><span class="replay-half"></span><span class="replay-cursor"></span></div>
<div class="replay-controls"><button type="button" data-replay="previous" aria-label="Occasion précédente" title="Occasion précédente">⏮</button><button type="button" data-replay="play" aria-label="Lecture" title="Lecture">▶</button><button type="button" data-replay="next" aria-label="Occasion suivante" title="Occasion suivante">⏭</button>${slider('speed','Vitesse')}${view}${filter}</div>`;
  this.querySelector('.ticker-crest')?.addEventListener('error',event=>{event.target.hidden=true;event.target.removeAttribute('src');});
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
  this.players=svg('g');
  this.shadow=svg('ellipse',{class:'replay-shadow',rx:1,ry:.6});
  this.ball=svg('circle',{class:'replay-ball',r:.95});
  this.banner=svg('text',{class:'replay-banner',x:W/2,y:H/2+3,'text-anchor':'middle'});
  const defs=svg('defs');this.fills={};
  for(const side of ['home','away']){
   const url=this.teams[side].shirt;
   if(!url)continue;
   const id=`replay-shirt-${++shirtFills}`,size=1/(2*CHEST.r),fill=svg('pattern',{id,width:1,height:1,patternContentUnits:'objectBoundingBox'});
   fill.append(svg('image',{href:url,x:.5-CHEST.x*size,y:.5-CHEST.y*size,width:size,height:size}));
   defs.append(fill);this.fills[side]=`url(#${id}) ${this.teams[side].major}`;
  }
  this.svg.append(defs,lines,this.players,this.shadow,this.ball,this.banner);
  stage.prepend(this.svg);
  const timeline=this.querySelector('.replay-timeline');
  timeline.querySelector('.replay-half').style.left=`${100*this.halfTime()/this.duration}%`;
  this.sequences.forEach((sequence,index)=>{
   const side=sequence.team===this.homeId?'home':'away';
   const marker=document.createElement('button');
   marker.type='button';marker.dataset.chance=index;
   marker.className=`replay-marker ${side}${sequence.goal?' goal':''}`;
   // At the shot: a stoppage in the move (a penalty, a free kick) can hold the play up for minutes.
   marker.style.left=`${100*sequence.shot.second/this.duration}%`;
   marker.style.setProperty('--team',this.teams[side].major);
   const shooter=sequence.shot.player||'—';
   marker.title=`${this.minute(sequence.shot.second)} ${sequence.goal?'But':'Occasion'} · ${shooter}`;
   marker.setAttribute('aria-label',marker.title);
   timeline.append(marker);
  });
  this.addEventListener('click',event=>{
   const button=event.target.closest('button');
   if(!button)return;
   if(button.classList.contains('replay-start')){button.remove();this.play();}
   else if(button.dataset.chance)this.jump(Number(button.dataset.chance));
   else if(button.dataset.replay==='play'){
    // Live, ▶ first lets the screen send the changes it holds: they set the match going themselves.
    if(this.live&&(this.paused||this.decision)&&!this.dispatchEvent(new CustomEvent('live-play',{bubbles:true,cancelable:true})))return;
    this.decision?this.emit('live-go-on'):this.paused?this.play():this.pause();
   }
   else if(button.dataset.replay==='view')this.setView(!this.view3d,true);
   else if(button.dataset.replay==='previous')this.jump(this.previousIndex());
   else if(button.dataset.replay==='next')this.live?this.skip():this.jump(this.nextIndex(this.current+1));
  });
  this.addEventListener('input',event=>{
   if(event.target.dataset.replay==='dead-speed'){
    this.setDeadSpeed(DEAD_SPEEDS[Number(event.target.value)]);
    try{localStorage.setItem(DEAD_KEY,String(this.deadSpeed));}catch{}
    return;
   }
   if(event.target.dataset.replay!=='speed')return;
   this.setSpeed(SPEEDS[Number(event.target.value)]);
   try{localStorage.setItem(SPEED_KEY,String(this.speed));}catch{}
  });
  this.addEventListener('change',event=>{
   if(event.target.dataset.replay!=='filter')return;
   this.filter=event.target.value;
   try{localStorage.setItem(FILTER_KEY,this.filter);}catch{}
   this.applyFilter();
  });
  this.setSpeed(this.speed);
  if(this.live)this.setDeadSpeed(this.deadSpeed);
  this.applyFilter();
 }

 // The pace of the replay, and the slider set on the nearest of its stops; live, that of the clock between two chances too.
 setSpeed(speed){this.speed=speed;setSlider(this.querySelector('[data-replay="speed"]'),SPEEDS,speed);}
 setDeadSpeed(speed){this.deadSpeed=speed;setSlider(this.querySelector('[data-replay="dead-speed"]'),DEAD_SPEEDS,speed);}
 // Live, « ⏭ » runs the clock to the next chance at once; a chance being played is never cut short.
 skip(){if(!this.inChance&&!this.paused)this.skipping=true;}

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
  import('./replay-3d.js').then(async ({Pitch3D,ready})=>{await ready;if(this.view3d&&!this.pitch3d&&this.isConnected)this.pitch3d=new Pitch3D(this);})
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
    // His number on the disc, his name above it while he takes part in the play. An outfield player's disc wears the
    // shirt's pattern, his number white and outlined so that it reads on any stripe; the keeper's stays plain.
    const keeper=player.position==='GB',patterned=!keeper&&this.fills[side],colour=keeper?kit.keeper:kit.major;
    const number=svg('text',{class:`number${patterned?' outlined':''}`,'text-anchor':'middle',y:.62,...patterned?{}:{fill:contrastText(colour)}}),name=svg('text',{class:'name','text-anchor':'middle',y:-2.45});
    number.textContent=this.shirts?.get(player.id)??'';name.textContent=this.names.get(player.id)||'';
    node.append(svg('circle',{r:1.9,fill:patterned||colour,stroke:kit.minor}),number,name);
    this.players.append(node);
    // A newcomer walks on from the touchline nearest to his spot.
    const spot=this.toPitch(side,player.u,player.v);
    this.dots[side].set(player.id,{node,x:spot.x,y:spot.y<H/2?-2:H+2,sx:0,sy:0});
   }
  }
 }

 // Every player's target given the ball: both blocks slide with it, the side in possession stretched,
 // the other compact, and one defender closes the ball down (kept until another is clearly closer, or the man
 // a dribbler takes on). The defending back line holds one depth, which the attackers do not go beyond (offside)
 // until the ball does; the other defenders pick up the most dangerous attackers, goal-side of them.
 targets(ball,attacking){
  const targets=new Map(),defending=this.opponent(attacking);
  for(const side of [defending,attacking]){
   const local=this.toLocal(side,ball),attack=side===attacking;
   const push=attack?(local.u-.45)*.6:(local.u-.55)*.5;
   const spots=new Map();
   for(const player of this.rosters[side]){
    let u,v;
    if(player.position==='GB'){u=attack?.05+Math.max(0,push)*.15:.025;v=.5+(local.v-.5)*.15;}
    else{u=clamp(attack?player.u*.85+.05+push:player.u*.7+.08+push,.06,.95);v=clamp(.5+(player.v-.5)*(attack?.95:.75)+(local.v-.5)*.25,.04,.96);}
    spots.set(player.id,{u,v});
   }
   if(attack){
    this.pressers[side]=null;
    // Onside: level with the last defender at most, or with the ball once it is beyond him.
    const offside=Math.max(1-this.line,local.u)+.005;
    for(const player of this.rosters[side])if(player.position!=='GB'){const spot=spots.get(player.id);spot.u=Math.min(spot.u,offside);}
   }else{
    // The back four hold one line, which drops with a ball played in behind it.
    const back=this.rosters[side].filter(player=>BACK_LINE.has(player.position));
    let line=back.length?back.reduce((sum,player)=>sum+spots.get(player.id).u,0)/back.length:.2;
    line=clamp(Math.min(line,local.u-.015),.035,.6);
    for(const player of back)spots.get(player.id).u=line;
    this.line=line;
    let best=null,gap=Infinity;
    for(const player of this.rosters[side]){if(player.position==='GB')continue;const dot=this.dots[side].get(player.id);const reach=dot?distance(dot,ball):Infinity;if(reach<gap){best=player.id;gap=reach;}}
    const current=this.pressers[side],held=this.dots[side].get(current),lock=this.pressLock;
    if(held&&this.rosters[side].some(player=>player.id===current)&&distance(held,ball)<gap*1.3)best=current;
    if(lock&&lock.side===side&&this.time<lock.until&&this.dots[side].has(lock.id))best=lock.id;
    this.pressers[side]=best;
    this.mark(side,spots,ball);
   }
   const pitch=new Map();
   for(const [id,spot] of spots)pitch.set(id,spot.x!=null?spot:this.toPitch(side,spot.u,spot.v));
   const presser=this.pressers[side];
   if(!attack&&presser!=null){const goal=this.toPitch(side,0,.5),length=distance(goal,ball)||1;pitch.set(presser,{x:ball.x+(goal.x-ball.x)/length*2.4,y:ball.y+(goal.y-ball.y)/length*2.4});}
   targets.set(side,pitch);
  }
  return targets;
 }
 // The defenders of `side` (but the keeper and the man pressing) each pick up an attacker: the pairs hold for a while,
 // and are drawn again as the play moves on. The more dangerous the attacker (the nearer goal), the tighter the
 // marking: goal-side of him, a little towards the ball. The back four stay in their line, taking only his side of
 // the pitch, until he is in the box.
 mark(side,spots,ball){
  const other=this.opponent(side),goal=this.toPitch(side,0,.5),carrier=this.carrier?.side===other?this.carrier.id:null;
  const defenders=this.rosters[side].filter(player=>player.position!=='GB'&&player.id!==this.pressers[side]&&this.dots[side].has(player.id));
  const attackers=this.rosters[other].filter(player=>player.position!=='GB'&&player.id!==carrier&&this.dots[other].has(player.id));
  let marks=this.marks?.side===side&&this.time-this.marks.at<MARK_MS?this.marks.pairs:null;
  if(marks&&[...marks].some(([defender,attacker])=>!defenders.some(player=>player.id===defender)||!attackers.some(player=>player.id===attacker)))marks=null;
  if(!marks){
   const previous=this.marks?.side===side?this.marks.pairs:new Map(),options=[];
   for(const defender of defenders)for(const attacker of attackers){
    const spot=this.toPitch(side,spots.get(defender.id).u,spots.get(defender.id).v),gap=distance(spot,this.dots[other].get(attacker.id));
    if(gap<24)options.push({defender:defender.id,attacker:attacker.id,cost:gap-(previous.get(defender.id)===attacker.id?4:0)});
   }
   options.sort((a,b)=>a.cost-b.cost||a.defender-b.defender||a.attacker-b.attacker);
   marks=new Map();const taken=new Set();
   for(const option of options)if(!marks.has(option.defender)&&!taken.has(option.attacker)){marks.set(option.defender,option.attacker);taken.add(option.attacker);}
   this.marks={side,pairs:marks,at:this.time};
  }
  for(const [defender,attacker] of marks){
   const role=this.rosters[side].find(player=>player.id===defender)?.position,man=this.dots[other].get(attacker),spot=spots.get(defender);
   if(!man||!spot)continue;
   const threat=smoothstep((this.toLocal(other,man).u-.5)/.28)*(MARKING[role]??.5);
   if(threat<=0)continue;
   const toGoal=unit(man,goal),toBall=unit(man,ball),tight={x:man.x+toGoal.x*1.4+toBall.x*.5,y:man.y+toGoal.y*1.4+toBall.y*.5};
   const within=this.toLocal(side,tight),inBox=within.u<.165&&within.v>.2&&within.v<.8;
   if(BACK_LINE.has(role)&&!inBox){spot.v=lerp(spot.v,within.v,threat*.8);continue;}
   const zone=this.toPitch(side,spot.u,spot.v);
   spots.set(defender,lerpPoint(zone,tight,threat));
  }
 }

 // ---- The clock of the replay: one animation frame loop drives every movement. ----
 startLoop(){
  if(this.frame)return;
  let last=performance.now();
  const tick=now=>{
   if(!this.isConnected){this.frame=null;return;}
   const pace=this.action?.pace;
   let dt=Math.min(64,now-last)*(this.paused?0:pace==='dead'?this.deadSpeed:pace==='real'?1:this.speed*(this.tempo||1));
   // Skipping, the clock between two chances and its stops play out within the frame.
   if(this.skipping&&!this.paused&&pace)dt=Math.max(dt,this.action.t0+this.action.duration-this.time);
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
    // The quicker he is, the faster he gets there.
    if(spot)steer(dot,spot,dt,(id===this.pressers[side]?PRESS:JOG)*lerp(.9,1.1,this.quickness({side,id})));
   }
   dot.vx=(dot.x-previous.x)/dt;dot.vy=(dot.y-previous.y)/dt;
   // Leaving a scripted run, he keeps its pace.
   if(this.runs.has(key)){dot.sx=dot.vx;dot.sy=dot.vy;}
   dot.node.setAttribute('transform',`translate(${dot.x.toFixed(2)} ${dot.y.toFixed(2)})`);
  }
  this.rebound(ball,time);
  this.ballAt={x:ball.x,y:ball.y};this.ballZ=ball.z;
  this.drawBall();
  // The ball leaves no trace on the pitch.
  if(action&&k>=1)this.settle(true);
  const holding=this.carrier?`${this.carrier.side}:${this.carrier.id}`:'';
  if(holding!==this.holding){this.holding=holding;this.highlight(this.named);}
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
 // The names written are those of the players in the touch being played: the one the caption names and whoever has the ball.
 highlight(ids=[]){this.named=ids;for(const side of ['home','away'])for(const [id,dot] of this.dots[side])dot.node.classList.toggle('on',ids.includes(id)||this.carrier?.side===side&&this.carrier.id===id);}

 showClock(second){
  this.displayed=second;
  if(this.live){this.drawFrise();this.emit('replay-clock',{second,label:this.minute(second)});return;}
  this.clockText(this.minute(second));this.querySelector('.replay-cursor').style.left=`${100*clamp(second/this.duration,0,1)}%`;
 }
 clockText(label){for(const node of this.querySelectorAll('.replay-clock,.replay-progress-clock'))node.textContent=label;}
 // Live, the whole match on a line under the pitch: what is played, the break, and what the pitch has shown so far, the
 // home side's marks above the line, the other's below; a goal once the score counts it.
 drawFrise(){
  const frise=this.querySelector('.frise');
  if(!frise)return;
  const half=this.halfTime(),second=this.displayed??0,end=Math.max(5400,Number.isFinite(half)?half+2700:0,second);
  const at=value=>`${(100*clamp(value/end,0,1)).toFixed(2)}%`;
  frise.querySelector('.replay-cursor').style.left=at(second);
  frise.querySelector('.frise-played').style.width=at(second);
  frise.querySelector('.replay-half').style.left=at(Number.isFinite(half)?half:2700);
  const counted=[0,0],marks=this.events.filter(event=>{
   if(event.period===3||!['goal','yellow','red','injury','substitution'].includes(event.kind)||event.second>second)return false;
   if(event.kind!=='goal')return true;
   const side=event.team_id===this.homeId?0:1;
   return counted[side]++<this.score[side];
  });
  const key=`${marks.length}:${Number.isFinite(half)}`;
  if(key===this.friseKey)return;
  this.friseKey=key;
  const kinds={goal:['goal','But'],yellow:['booking yellow','Carton jaune'],red:['booking red','Carton rouge'],injury:['injury','Blessure'],substitution:['sub-on','Changement']};
  frise.querySelector('.frise-marks').innerHTML=marks.map(event=>{
   const [className,label]=kinds[event.kind],side=this.side(event.team_id);
   const who=event.kind==='substitution'&&event.secondary?`${event.player||'—'} ➜ ${event.secondary}`:event.player||'—';
   return `<i class="match-mark ${className} ${side}" style="left:${at(event.second)}" title="${e(`${this.minute(event.second)} · ${label} · ${who}`)}">${event.kind==='substitution'?'▲':''}</i>`;
  }).join('');
 }
 emit(name,detail){this.dispatchEvent(new CustomEvent(name,{detail,bubbles:true}));}
 showScore(){
  if(this.live){this.emit('replay-score',{score:[...this.score]});this.drawFrise();}
  else bannerScore(this.score);
 }
 // Live, the commentary is one line in the colours of the side that has the chance, its crest and the minute first; between
 // two chances, neutral, a bar running on it. The side's name and the minute that open a chance's caption are left out.
 caption(html,live=false){
  const node=this.querySelector('.replay-caption');
  if(!this.live){node.innerHTML=html;node.classList.toggle('live',live);return;}
  const said=this.said,title=said?.title;
  if(title&&html.startsWith(title))html=html.slice(title.length).replace(/^ · /,'');
  this.ticker(html.replace(/<span class="replay-dots">(.*)<\/span>/,'$1'),live?null:said);
 }
 ticker(html,said=null){
  const node=this.querySelector('.replay-caption'),team=said&&this.teams[said.side],crest=node.querySelector('.ticker-crest');
  node.classList.toggle('running',!team&&!this.stage.classList.contains('still'));
  if(team){node.style.setProperty('--team',team.major);node.style.setProperty('--team-ink',contrastText(team.major));}
  else{node.style.removeProperty('--team');node.style.removeProperty('--team-ink');}
  const src=team?.crest||'';
  if(src&&crest.getAttribute('src')!==src){crest.hidden=false;crest.src=src;}
  else if(!src){crest.hidden=true;crest.removeAttribute('src');}
  node.querySelector('.ticker-minute').textContent=said?.minute||'';
  node.querySelector('.ticker-text').innerHTML=html;
 }
 // Live, a goal holds the pitch: the scorer's colours cross it, B, U, T stamped one after the other, a light passing on
 // them, his shirt and his name, the passer under it. The score changes in the band above the pitch.
 goalBurst(side,shot,outcome){
  this.stage.querySelector('.goal-burst')?.remove();
  const team=this.teams[side],ink=contrastText(team.major),shirt=this.shirts?.get(shot.player_id);
  const assist=shot.detail==='penalty'?'Sur penalty':outcome?.secondary?`Passe de ${e(outcome.secondary)}`:'';
  const burst=document.createElement('div');
  burst.className='goal-burst';
  burst.style.cssText=`--team:${team.major};--team-2:${team.minor};--team-ink:${ink}`;
  burst.innerHTML=`<div class="goal-band"><div class="goal-word">${team.crest?`<img class="goal-crest" src="${e(team.crest)}" alt="">`:''}<span class="goal-letters" aria-label="But"><span>B</span><span>U</span><span>T</span></span></div>`
   +`<div class="goal-scorer">${kitShirt(team,shirt??'')}<span>${e(shot.player||'—')}</span></div>${assist?`<div class="goal-assist">${assist}</div>`:''}</div>`;
  burst.querySelector('.goal-crest')?.addEventListener('error',event=>event.target.remove());
  this.stage.append(burst);
  setTimeout(()=>burst.remove(),GOAL_HOLD_MS+600);
 }
 // Live, a red card holds the pitch a moment, more soberly than a goal: a dark band edged with the colours of the side
 // sent off crosses it, the card rising (a yellow behind it for a second booking), the crest, « Carton rouge » and the
 // minute, then the player's shirt and name, the reason under it.
 cardBurst(event){
  this.stage.querySelector('.card-burst')?.remove();
  const side=this.side(event.team_id),team=this.teams[side],shirt=this.shirts?.get(event.player_id),twice=event.detail==='second_yellow';
  const burst=document.createElement('div');
  burst.className='card-burst';
  burst.style.setProperty('--team',team.major);
  burst.innerHTML=`<div class="card-band"><div class="card-pair">${twice?'<i class="card-face yellow"></i>':''}<i class="card-face"></i></div>`
   +`<div class="card-text"><div class="card-label">${team.crest?`<img src="${e(team.crest)}" alt="">`:''}Carton rouge · ${this.minute(event.second)}</div>`
   +`<div class="card-who">${kitShirt(team,shirt??'')}<span>${e(event.player||'—')}</span></div>${twice?'<div class="card-why">Deuxième avertissement</div>':''}</div></div>`;
  burst.querySelector('.card-label img')?.addEventListener('error',error=>error.target.remove());
  this.stage.append(burst);
  setTimeout(()=>burst.remove(),CARD_HOLD_MS+400);
 }
 showBanner(text,side){this.banner.textContent=text;this.banner.setAttribute('class',`replay-banner${text?' on':''}`);this.banner.style.fill=side?this.teams[side].major:'';}

 // The kick-off shape: both sides in their half, the ball on the centre spot at the feet of `side`'s most advanced player.
 kickOff(side){
  this.snap({x:W/2,y:H/2},side);
 }
 // Both teams set in their shape around `point`, the ball at rest there at the feet of `side`'s nearest player
 // (other than `exclude`); used where the replay cuts in, so nobody has to run across the pitch.
 snap(point,side,exclude=[],carrier=null){
  this.runs.clear();this.posts.clear();this.wall=null;this.pressLock=null;this.marks=null;
  for(let pass=0;pass<2;pass++){
   const targets=this.targets(point,side);
   for(const team of ['home','away'])for(const [id,dot] of this.dots[team]){const spot=targets.get(team).get(id);dot.gesture=null;dot.gestures=[];if(spot){dot.x=spot.x;dot.y=spot.y;dot.vx=dot.vy=dot.sx=dot.sy=0;}}
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
  for(const player of this.rosters?.[side]??[]){
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
  this.faded=false;this.tempo=1;this.cursor=null;this.cues=[];this.skipping=false;
  this.stage.querySelector('.goal-burst')?.remove();
  this.stage.classList.remove('fast');
  this.stage.querySelector('.card-burst')?.remove();
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
 updatePlay(){const button=this.querySelector('[data-replay="play"]'),still=this.paused||Boolean(this.decision);button.textContent=still?'▶':'❚❚';button.setAttribute('aria-label',this.decision?'Reprendre':this.paused?'Lecture':'Pause');button.title=button.getAttribute('aria-label');}
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
  this.shirts=rosterShirts(state.result,this.shirts);
  this.events=state.result.events;this.refreshSequences();
  this.status=state.status;
  this.reset(state.second,this.sequences.length);
  this.score=[...state.score];this.showScore();
  this.clock=state.second;this.segmentShown=true;
  if(state.status==='halftime')this.showHalfTime();
  else if(state.status==='finished')this.finishLive(false);
 }
 append(data){
  this.shirts=rosterShirts(data.result,this.shirts);
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
     // Orders asked for during the action are given at its end: its last chance closes the segment on the server, unless
     // the segment also brings the break, the whistle or an injury, which its end shows first.
     if(this.stopRequested&&this.nextIndex(index+1)>=this.sequences.length&&data.status==='playing'&&!data.decision){
      this.current=this.sequences.length;this.segmentShown=true;this.stopAt(null);return;
     }
    }
    this.current=this.sequences.length;
    if(!(await this.interlude(this.clock,Math.max(this.clock,...fresh.map(event=>event.second)))))return;
    this.segmentShown=true;
    if(data.status==='finished'){this.finishLive();return;}
    if(data.status==='halftime'){this.showHalfTime();this.hold=true;this.emit('live-halftime',data);if(this.stopRequested)this.stopAt(null);return;}
    if(data.decision){this.stopFor(data.decision);this.emit('live-decision',data);if(this.stopRequested)this.stopAt(null);return;}
   }
  }finally{if(run===this.run)this.running=false;}
 }
 // New orders: resolves with the clock to rewind the server to, or null to stop where the server already is; false when
 // they were withdrawn first. A chance being played finishes first (it closes its segment); between two chances the clock
 // stops at once, and what the server computed beyond it, unseen, is played again with the new orders.
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
 // The orders withdrawn while the action plays on: the match goes on as if nothing had been asked.
 cancelInterrupt(){const resolve=this.stopRequested;this.stopRequested=null;resolve?.(false);}
 // After new orders, or at the start of the second half; `paused`, the match is free to go on but waits for ▶.
 resume({paused=false}={}){
  if(!this.live||!this.hold||this.status==='finished')return;
  this.hold=false;this.skipping=false;this.decision=null;
  if(paused&&this.status!=='halftime'){this.paused=true;this.updatePlay();return;}
  if(this.status==='halftime'){
   this.status='playing';this.period=2;
   this.updateRosters(this.clock);this.kickOff(this.kickOffSide(2));
   this.progress('Jeu en cours');this.caption('');
   this.querySelector('.replay-second-half').hidden=true;
  }
  this.play();
 }
 // An injury or a red card in the viewer's side stops the match until he goes on (the play button, or Reprendre):
 // the band says why, the play button turns to ▶.
 stopFor(decision){
  this.hold=true;this.skipping=false;this.decision=decision;
  this.progress('Arrêt de jeu',true);
  const {side,second}=stopSaid(decision,this);
  this.ticker(`<strong>${NOTABLE[decision.kind]||'Arrêt de jeu'}</strong> · ${e(decision.player||'—')} · à vous de jouer`,{side,minute:this.minute(second)});
  this.updatePlay();
  this.emit('replay-phase',{phase:'stopped'});
 }
 // The clock stays on 45′ until the viewer kicks the second half off.
 showHalfTime(){
  this.status='halftime';
  this.said=null;
  this.stage.classList.add('fast');
  this.progress('Mi-temps',true);
  this.caption(`<strong>Mi-temps</strong> · ${e(this.teams.home.name)} ${this.score[0]} – ${this.score[1]} ${e(this.teams.away.name)}`);
  this.clockText('45′');
  this.querySelector('.replay-second-half').hidden=false;
  this.emit('replay-phase',{phase:'halftime'});
 }
 finishLive(notify=true){
  this.status='finished';this.hold=true;
  this.said=null;
  this.stage.classList.add('fast');
  this.progress('Coup de sifflet final',true);
  this.caption(`<strong>Coup de sifflet final</strong> · ${e(this.teams.home.name)} ${this.score[0]} – ${this.score[1]} ${e(this.teams.away.name)}`);
  this.querySelector('.replay-second-half').hidden=true;this.querySelector('.replay-continue').hidden=false;
  this.pause();
  this.emit('replay-phase',{phase:'finished'});
  if(notify)this.emit('live-finished');
  if(this.stopRequested)this.stopAt(null);
 }

 // The play between two chances is not recorded: the players leave the pitch and the clock runs fast, stopping
 // for a moment on each card, injury or substitution and at the break.
 async interlude(from,to){
  this.tempo=1;
  this.highlight([]);this.showBanner('');
  this.progress('Jeu en cours');
  const notes=this.querySelector('.replay-progress-notes');
  notes?.replaceChildren();
  this.stage.classList.add('fast');
  this.said=null;
  if(this.live)this.emit('replay-phase',{phase:'dead'});
  this.caption('<span class="replay-dots">Jeu en cours</span>',true);
  // Live, the clock runs at the pace of the play between chances, and stops at the clock's own pace on what it meets.
  const pace=this.live?'dead':undefined,stopPace=this.live?'real':undefined;
  const half=this.halfTime();
  const stops=[...this.others.filter(event=>event.second>from&&event.second<=to).map(event=>({second:event.second,event})),
               ...(from<half&&to>half?[{second:half,half:true}]:[])].sort((a,b)=>a.second-b.second);
  let clock=from;
  for(const stop of [...stops,{second:to}]){
   if(stop.second>clock&&!(await this.wait(Math.max(120,(stop.second-clock)/60*MS_PER_MINUTE),{clock:[clock,stop.second],pace})))return false;
   clock=Math.max(clock,stop.second);
   if(stop.event){
    const event=stop.event,said=`${NOTABLE[event.kind]} · ${e(event.player||'—')}${event.kind==='substitution'&&event.secondary?` ➜ ${e(event.secondary)}`:''}`;
    if(this.live){
     this.ticker(said,{side:this.side(event.team_id),minute:this.minute(event.second)});
     if(event.kind==='red'){this.cardBurst(event);this.emit('replay-card',{second:event.second});}
     if(!(await this.wait(event.kind==='red'?CARD_HOLD_MS:1400,{pace:stopPace})))return false;
     this.ticker('Jeu en cours');
    }
    else{
     const item=document.createElement('li');
     item.innerHTML=`<b>${this.minute(event.second)}</b> ${said}`;
     item.style.setProperty('--team',this.teams[this.side(event.team_id)].major);
     notes.prepend(item);
     while(notes.children.length>3)notes.lastChild.remove();
     if(!(await this.wait(450)))return false;
    }
   }
   if(stop.half){
    this.progress('Mi-temps',true);
    this.caption(`<strong>Mi-temps</strong> · ${e(this.teams.home.name)} ${this.score[0]} – ${this.score[1]} ${e(this.teams.away.name)}`);
    if(!(await this.wait(1100,{pace:stopPace})))return false;
    this.period=2;
    notes?.replaceChildren();
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
  this.drawDots();
  this.stage.classList.remove('cut');
  return this.wait(420);
 }
 progress(label,still=false){const node=this.querySelector('.replay-progress-label');if(node)node.textContent=label;this.stage.classList.toggle('still',still);}

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
 gesture(who,touch,at){
  const dot=this.dot(who);
  if(!dot)return;
  dot.gesture=touch?{...touch,at}:null;
  // Scheduling the next touch must not erase the previous one's follow-through. At contact the planned
  // gesture is refined with the actual ball target; keep only four contacts, and clear them on a scene cut.
  if(touch)dot.gestures=[...(dot.gestures||[]).filter(item=>item.at!==at),dot.gesture].sort((a,b)=>a.at-b.at).slice(-4);
 }
 // Something that happens at a set time of the replay (the ball meeting the net or a defender), applied in order.
 cue(at,apply){this.cues.push({at,apply});this.cues.sort((a,b)=>a.at-b.at);}
 // How sure his touch is and how quick he is, from 0 to 1 (his technique and pace; average without them).
 skill(who){const value=this.styles?.get(who?.id)?.technique;return value==null?.5:clamp((value-35)/50,0,1);}
 quickness(who){const value=this.styles?.get(who?.id)?.vitesse;return value==null?.5:clamp((value-35)/50,0,1);}
 // How fast he carries the ball, in metres per ms.
 pace(who){return lerp(.0048,.0072,this.quickness(who));}
 // The touch that starts a move, as its player meets the ball `height` metres up; a header is set by its cross.
 touchOf(move,height=0){
  if(!move||move.type==='corner'||move.type==='free_kick'||move.type==='restart'||move.header)return null;
  if(move.type==='control')return {kind:height>1.6?'head':height>1?'chest':height>.45?'thigh':'cushion'};
  const point=move.point||move.box,target=point&&{x:point.x,y:point.y};
  if(move.type==='carry')return {kind:'touch',target};
  return {kind:'kick',style:move.type,technique:move.freeKick?'free_kick':move.lift||move.style,target,
   strength:move.type==='pass'?{ground:.5,driven:.8,lofted:1}[move.lift]??.6:move.type==='cross'?.9:1};
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
  const by=this.carrier,t0=this.start(),height=move.lift==='lofted'?move.height:0,struck=ballAt(this.ballPath,t0),from=height?struck:grounded(struck),timing=point=>FLIGHT[move.lift](distance(from,point));
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
  this.gesture(by,{...this.touchOf(move),target:{x:aim.x,y:aim.y},contact:{x:from.x,y:from.y,z:from.z}},t0);
  this.loose();this.lastSide=to.side;
  const side=distance(receiver,aim)<1?unit(from,aim):unit(aim,receiver),onward=unit(aim,ahead||this.toPitch(to.side,1,.5));
  this.runTo(to,{x:aim.x+side.x*CONTACT,y:aim.y+side.y*CONTACT},t0+duration,scale(onward,{one:.004,carry:.003}[move.then]??.001));
  this.gesture(to,move.then==='one'?this.touchOf(next):this.touchOf({type:'control'},height),t0+duration);
  this.advance(t0+duration);
  if(move.then==='one')this.prepare(next,t0+duration);
  const done=await this.perform({kind:'pass',by,to,target:{x:aim.x,y:aim.y},duration,t0});
  if(done)this.carrier=to;
  return done;
 }
 // The first touch sets the ball out of his feet towards what he does next: the weaker his technique, the further
 // it runs and the wider of his aim. A high ball is killed with the thigh or the chest and drops in front of him.
 async control(move,next,ahead){
  const by=move.who;
  if(!this.dot(by))return true;
  const t0=this.start(),struck=ballAt(this.ballPath,t0),from=struck.z>.3?struck:grounded(struck),skill=this.skill(by);
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
  return this.perform({kind:'carry',by,duration,t0});
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
   const t0=this.start(),from=grounded(ballAt(this.ballPath,t0)),gap=distance(from,move.point),stride=pace*interval,last=gap<=stride*1.4;
   const direction=beaten&&touch===1&&!last?turn(unit(from,move.point),swerve):unit(from,move.point);
   const length=last?gap:stride,aim={x:from.x+direction.x*length,y:from.y+direction.y*length},dot=this.dot(by);
   // Long enough for him to get onto it at a sprint at most.
   const duration=Math.max(last?Math.max(320,gap/pace):interval,distance(dot,{x:aim.x-direction.x*CONTACT,y:aim.y-direction.y*CONTACT})/.0085);
   this.ballPath=path(from,rolled(from,aim,duration,TOUCH_FRICTION).velocity,t0,{friction:TOUCH_FRICTION});
   // The man he takes on goes for the ball where it would have gone, and is left there as it goes past him.
   if(beaten&&touch===1&&!last)this.lunge(beaten,from,move.point,t0+duration*.32,stride*.45);
   this.gesture(by,{kind:'touch',target:{x:aim.x,y:aim.y},contact:{x:from.x,y:from.y,z:from.z}},t0);
   const ball=ballAt(this.ballPath,t0+duration);
   this.carrier=by;this.lastSide=by.side;
   this.runTo(by,{x:ball.x-direction.x*CONTACT,y:ball.y-direction.y*CONTACT},t0+duration,scale(direction,pace*(last?.75:1)));
   this.gesture(by,last?this.touchOf(next):{kind:'touch',target:{x:move.point.x,y:move.point.y}},t0+duration);
   this.advance(t0+duration);
   this.prepare(next,t0+duration);
   if(!(await this.perform({kind:'carry',by,duration,t0})))return false;
   if(last)break;
  }
  this.pressLock=null;
  return true;
 }
 // Keeps `who` on `point` from `from` until `until` (ms of replay), whatever his target: a man on the ground, a lunge.
 still(who,point,from,until){
  this.cue(from,()=>{if(this.dot(who))this.runs.set(this.key(who),{t0:from,t1:until,from:{...point},to:{...point},m0:{x:0,y:0},m1:{x:0,y:0},v1:{x:0,y:0}});});
 }
 // A foul: the man fouled pushes the ball on towards goal, the man fouling him comes in from where he is and goes
 // through him, standing or sliding. He goes down, the ball runs on, and the whistle stops the play.
 async foul(move){
  const victim=move.victim,fouler=move.fouler,mark=this.dot(fouler);
  if(!this.dot(victim)||!mark)return true;
  const t0=this.start(),from=grounded(ballAt(this.ballPath,t0)),dir=unit(from,this.toPitch(victim.side,1,.5));
  // Long enough for the man fouling him to get there at a run; he carries the ball on meanwhile.
  let contact=t0+520,meet=from;
  for(let round=0;round<3;round++){meet={x:from.x+dir.x*Math.min(7,.0042*(contact-t0)),y:from.y+dir.y*Math.min(7,.0042*(contact-t0))};contact=t0+Math.max(520,distance(mark,meet)/.0068);}
  const ahead={x:meet.x+dir.x*2.6,y:meet.y+dir.y*2.6};
  this.ballPath=path(from,rolled(from,ahead,contact-t0+500,TOUCH_FRICTION).velocity,t0,{friction:TOUCH_FRICTION});
  this.gesture(victim,{kind:'touch',target:ahead,contact:{...from}},t0);
  this.loose();
  this.runTo(victim,meet,contact,scale(dir,.004));
  const approach=unit(mark,meet),hit={x:meet.x-approach.x*.75,y:meet.y-approach.y*.75},slide=distance(mark,meet)>3.5&&this.random()<.55;
  this.runTo(fouler,hit,contact,scale(approach,slide?.004:.0015));
  this.gesture(fouler,{kind:slide?'slide':'tackle',target:{...meet}},contact);
  // He falls away from the man who brought him down.
  const across=(mark.x-meet.x)*dir.y-(mark.y-meet.y)*dir.x;
  this.gesture(victim,{kind:'fall',target:{x:meet.x+dir.x*4,y:meet.y+dir.y*4},foot:across>0?1:0},contact);
  const down={x:meet.x+dir.x*1.2,y:meet.y+dir.y*1.2};
  this.cue(contact,()=>this.runTo(victim,down,contact+380));
  this.still(victim,down,contact+380,contact+1500);
  this.still(fouler,slide?{x:hit.x+approach.x*1.4,y:hit.y+approach.y*1.4}:hit,contact+(slide?320:120),contact+(slide?1150:420));
  if(slide)this.cue(contact,()=>this.runTo(fouler,{x:hit.x+approach.x*1.4,y:hit.y+approach.y*1.4},contact+320));
  return this.perform({kind:'foul',by:victim,fouler,duration:contact-t0+1250,t0});
 }
 // `who` throws a leg, or slides, at the ball `along` metres from `from` towards `to`, at `at`: he goes where it
 // was heading, short of it by the length of his leg, and stays down or off balance a moment.
 lunge(who,from,to,at,along){
  const dot=this.dot(who);
  if(!dot)return;
  const line=unit(from,to),aim={x:from.x+line.x*along,y:from.y+line.y*along},reach=distance(dot,aim);
  const slide=reach>3&&this.random()<.4,come=unit(dot,aim),spot={x:aim.x-come.x*(slide?1.2:.8),y:aim.y-come.y*(slide?1.2:.8)};
  this.runTo(who,spot,at,scale(come,slide?.003:.0008));
  this.gesture(who,{kind:slide?'slide':'tackle',target:aim},at);
  const rest=slide?{x:spot.x+come.x*1.2,y:spot.y+come.y*1.2}:spot;
  if(slide)this.cue(at,()=>this.runTo(who,rest,at+300));
  this.still(who,rest,at+(slide?300:60),at+(slide?1100:360));
 }
 // A cross, met in the box on the side the scorer is already coming from, as he leaves the ground for it.
 async cross(move){
  const by=this.carrier||move.by,t0=this.start(),from=ballAt(this.ballPath,t0),header=move.to,dot=this.dot(header);
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
  this.gesture(by,{...this.touchOf(move),target:{x:spot.x,y:spot.y},contact:{x:from.x,y:from.y,z:from.z}},t0);
  this.loose();
  if(dot)this.runTo(header,spot,t0+duration,scale(unit(dot,spot),.002));
  this.gesture(header,{kind:'head',style:'shot',target:this.toPitch(move.side,1,.5),jump:clamp(move.height-1.75,0,.6)},t0+duration);
  // His marker goes up with him, goal-side and a shoulder to his side, a fraction late.
  const marker=this.nearest(this.opponent(move.side),spot),guard=this.dot(marker);
  if(guard&&distance(guard,spot)<REACH*duration*1.15){
   const toGoal=unit(spot,this.toPitch(move.side,1,.5)),side=this.random()<.5?1:-1;
   this.runTo(marker,{x:spot.x+toGoal.x*.7-toGoal.y*.45*side,y:spot.y+toGoal.y*.7+toGoal.x*.45*side},t0+duration,{x:0,y:0});
   this.gesture(marker,{kind:'head',jump:clamp(move.height-1.9,0,.5)},t0+duration+50);
  }
  return this.perform({kind:'cross',by,to:header,target:{x:spot.x,y:spot.y},duration,t0});
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
 // The play starts again where it stopped: the players set around the ball, the taker on it.
 restart(move){return this.cut(move.point,move.side,move.taker);}
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
 // 9.15 m off, across the line to goal. For a penalty, no wall: everyone but the taker and the keeper waits outside
 // the box.
 async freeKick(move,next){
  const side=move.side,other=this.opponent(side),spot=move.point,ahead=unit(spot,this.toPitch(side,1,.5)),across={x:-ahead.y,y:ahead.x};
  const offset=this.random()<.5?1.4:-1.4;
  let shooter=null;
  const setup=()=>{
   shooter=this.carrier;
   const dot=this.dot(shooter);
   if(dot){dot.x=spot.x-ahead.x*3.4+across.x*offset;dot.y=spot.y-ahead.y*3.4+across.y*offset;this.post(shooter,dot);}
   if(move.penalty){
    this.wall=[];
    for(const team of [side,other])for(const player of this.rosters[team]){
     const man={side:team,id:player.id},spotted=this.dot(man);
     if(!spotted||player.id===shooter?.id)continue;
     if(player.position==='GB'){
      if(team===other){Object.assign(spotted,{...this.toPitch(side,.993,.5),sx:0,sy:0});this.post(man,spotted);}
      continue;
     }
     const local=this.toLocal(side,spotted);
     Object.assign(spotted,{...this.toPitch(side,Math.min(local.u,.8-this.random()*.04),clamp(local.v,.22,.78)),sx:0,sy:0});
     this.post(man,spotted);
    }
    return;
   }
   const centre={x:spot.x+ahead.x*9.15,y:spot.y+ahead.y*9.15};
   // The man who will block the shot is one of them.
   const blocker=next?.blocker;
   // Played into the box, it needs only two men in the wall: the others mark.
   const size=move.crossed?2:4;
   this.wall=this.rosters[other].filter(player=>player.position!=='GB').map(player=>({side:other,id:player.id}))
    .sort((a,b)=>(b.id===blocker?.id)-(a.id===blocker?.id)||distance(this.dot(a),centre)-distance(this.dot(b),centre)).slice(0,size);
   this.wall.forEach((man,index)=>{const dot=this.dot(man);Object.assign(dot,{x:centre.x+across.x*(index-(size-1)/2)*.62,y:centre.y+across.y*(index-(size-1)/2)*.62,sx:0,sy:0});this.post(man,dot);});
   if(move.crossed)this.crowd(side,shooter,next);
  };
  if(!(await this.cut(spot,side,move.by,setup)))return false;
  if(!(await this.wait(300)))return false;
  return this.runUp(shooter,spot,next,850);
 }
 // A ball about to be played into the box: the most advanced attackers wait in it, the one who will rise for it on
 // his spot, each with a defender goal-side of him.
 crowd(side,taker,cross){
  const other=this.opponent(side),header=cross?.to,walled=new Set((this.wall||[]).map(man=>man.id));
  const attackers=this.rosters[side].filter(player=>player.position!=='GB'&&player.id!==taker?.id)
   .sort((a,b)=>(b.id===header?.id)-(a.id===header?.id)||b.u-a.u).slice(0,4);
  const markers=this.rosters[other].filter(player=>player.position!=='GB'&&!walled.has(player.id)).sort((a,b)=>a.u-b.u);
  // Near post, far post and short of the spot: clear of the man who will rise for it, at the spot.
  const lanes=[.36,.64,.43];
  attackers.forEach((player,index)=>{
   const man={side,id:player.id},dot=this.dot(man);
   if(!dot)return;
   const spot=player.id===header?.id&&cross?.box?{x:cross.box.x+(this.random()-.5)*6,y:cross.box.y+(this.random()-.5)*8}
    :this.toPitch(side,.87+this.random()*.05,lanes[(index-1+lanes.length)%lanes.length]+(this.random()-.5)*.03);
   Object.assign(dot,{...spot,sx:0,sy:0});this.post(man,dot);
   const marker=markers[index]&&{side:other,id:markers[index].id},guard=this.dot(marker);
   if(!guard)return;
   const local=this.toLocal(side,spot);
   Object.assign(guard,{...this.toPitch(side,Math.min(.975,local.u+.025),local.v+(this.random()-.5)*.03),sx:0,sy:0});this.post(marker,guard);
  });
 }
 // The strike, to where the engine's outcome puts it: in the net, in the keeper's arms, wide or over, or onto the
 // defender who threw himself in front of it. A header is nodded down; a free kick clears the wall and dips.
 async shoot(move,sequence){
  const side=move.side,other=this.opponent(side),random=this.random,at=(u,v)=>this.toPitch(side,u,v),keeper=move.keeper;
  const t0=this.start();
  let from=ballAt(this.ballPath,t0);
  const outcome=sequence.outcome?.kind,blocked=outcome==='off_target'&&sequence.outcome.detail==='blocked',spread=amount=>.5+(random()-.5)*2*amount;
  const post=outcome==='off_target'&&sequence.outcome.detail==='post',saved=outcome==='save'?sequence.outcome.detail:null;
  let target,height;
  // A blocked strike goes at the defender standing in its way, if one does; otherwise somewhere off target.
  const blockerDot=this.dot(move.blocker),goal=at(1,.5),toGoal=unit(from,goal),toBlocker=blockerDot&&unit(from,blockerDot);
  const inWay=blockerDot&&distance(from,blockerDot)<25&&toGoal.x*toBlocker.x+toGoal.y*toBlocker.y>.35;
  if(inWay){target={x:from.x+toBlocker.x*(distance(from,goal)+2),y:from.y+toBlocker.y*(distance(from,goal)+2)};height=move.freeKick?lerp(1.6,2.2,random()):lerp(.3,1,random());}
  else if(outcome==='goal'||outcome==='save'){target=at(outcome==='goal'?1:.99,spread(.045));height=move.header?lerp(.2,1.3,random()):move.style==='low'?0:lerp(.25,2.1,random());}
  // Onto a post: 3.66 m either side of the middle of the goal.
  else if(post){target=at(1,random()<.5?.446:.554);height=lerp(.3,2.1,random());}
  else if(!blocked&&random()<(move.header?.5:.4)){target=at(1,spread(.05));height=lerp(2.7,4.2,random());}
  else{const wide=.054+lerp(.01,.04,random());target=at(1,random()<.5?.5-wide:.5+wide);height=move.style==='low'?0:lerp(.1,1.6,random());}
  // A header from far out is struck harder, so that it does not loop.
  const speed=move.header?Math.max(lerp(.012,.016,random()),distance(from,target)/1100):move.freeKick?lerp(.022,.027,random()):move.style==='placed'?lerp(.017,.021,random()):lerp(.025,.031,random());
  let duration=distance(from,target)/speed,velocity,options;
  if(!height&&!move.header&&!move.freeKick){from=grounded(from);({velocity,duration}=rolled(from,target,duration));}
  else{
   const gravity=move.freeKick&&!inWay?Math.min(GRAVITY*2.6,dip(from,target,duration,height,9.15,2.45)):GRAVITY;
   const bend=move.freeKick?(random()<.5?-1:1)*lerp(1,2.5,random()):move.style==='placed'?(random()-.5)*1.2:0;
   ({velocity,options}=lofted(from,target,duration,height,{bend,gravity}));
  }
  this.ballPath=path(from,velocity,t0,options);
  this.gesture(move.by,{...(move.header?{kind:'head',style:'shot',jump:clamp(from.z-1.75,0,.6)}:this.touchOf(move)),
   target:{x:target.x,y:target.y},contact:{x:from.x,y:from.y,z:from.z}},t0);
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
   // Low, he throws a leg at it, or slides in when he has ground to cover; higher, he takes it on the body.
   const cover=distance(blockerDot,point),low=point.z<.6;
   this.runTo(blocker,point,t0+end);
   this.gesture(blocker,{kind:point.z>1?'chest':low?cover>2.2?'slide':'tackle':'thigh',...low?{target:{x:from.x,y:from.y}}:{}},t0+end);
   if(low)this.still(blocker,point,t0+end+40,t0+end+(cover>2.2?1000:300));
   this.cue(t0+end,()=>{const ball=ballAt(this.ballPath,t0+end);this.ballPath=path(ball,{...scale(turn({x:-ball.vx,y:-ball.vy},angle),rebound),z:lift},t0+end);});
  }
  else if(outcome==='goal')this.cue(t0+end,()=>{const ball=ballAt(this.ballPath,t0+end);this.ballPath=path(ball,{x:ball.vx*.1,y:ball.vy*.1,z:Math.min(0,ball.vz)*.1},t0+end,{friction:NET_FRICTION});});
  else if(post||saved==='corner'||saved==='parried'){
   // Off the post or the keeper's hand: back into the box, or pushed round the post for a corner.
   const angle=saved==='corner'?(random()<.5?-1:1)*lerp(.9,1.3,random()):(random()-.5)*1.2,pace=saved==='corner'?.45:.3;
   this.cue(t0+end,()=>{const ball=ballAt(this.ballPath,t0+end),back=saved==='corner'?{x:ball.vx,y:ball.vy}:{x:-ball.vx,y:-ball.vy};this.ballPath=path(ball,{...scale(turn(back,angle),pace),z:.002},t0+end);});
  }
  else if(outcome==='save')this.cue(t0+end,()=>{this.place(ballAt(this.ballPath,t0+end),t0+end);this.carrier=keeper;const dot=this.dot(keeper);if(dot)this.post(keeper,dot);});
  // Presentation metadata is sampled from the existing flight; it never changes the result or its timing.
  const keeperHeight=ballAt(this.ballPath,t0+duration*.92).z;
  return this.perform({kind:'shot',by:move.by,target:{x:target.x,y:target.y},style:move.header?'header':move.freeKick?'free_kick':move.style,
   outcome,keeper,keeperFrom:keeperDot&&{x:keeperDot.x,y:keeperDot.y},keeperPoint:dive,
   keeperTarget:dive&&{x:dive.x,y:dive.y,z:keeperHeight},keeperHeight,duration:end,t0});
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

 // ---- How the side won the ball: the other side has it a few seconds earlier and loses it, as the engine says. ----
 // Interception (a pass cut out), tackle (on the man carrying it), aerial (a long ball won in the air), clearance (a
 // ball into the box headed away to a teammate) or claim (the keeper catches it and throws it out). Resolves with the
 // man who has the ball at his feet when the chance starts, null when it cannot be played, false when a jump replaced it.
 async recover(sequence,start,side,title,name){
  const event=sequence.recovery,other=this.opponent(side),kind=event.detail;
  const winner=this.dots[side].has(event.player_id)?{side,id:event.player_id}:null;
  if(!winner||!['interception','tackle','aerial','clearance','claim'].includes(kind))return null;
  const loser=this.dots[other].has(event.secondary_id)?{side:other,id:event.secondary_id}:null,random=this.random;
  // The way the other side was attacking: towards this side's goal.
  const goal=this.toPitch(side,0,.5),forward=unit(start,goal),back=this.toPitch(side,1,.5);
  const note=(id,text)=>{this.highlight(id!=null?[id]:[]);this.caption(`${title} · ${text}`);};
  this.runners=[];
  const lob=(from,to,height,duration)=>{const {velocity,options}=lofted(from,to,duration,height);this.ballPath=path(from,velocity,this.start(),options);};
  if(kind==='interception'||kind==='tackle'){
   const before={x:start.x-forward.x*8,y:start.y-forward.y*8};
   const carrier=this.snap(before,other,[],loser);
   const dot=this.dot(winner),across={x:-forward.y,y:forward.x},offset=random()<.5?1:-1;
   if(kind==='interception'){
    // He reads the pass and steps across its line.
    Object.assign(dot,{x:start.x+across.x*offset*4.5+forward.x*1.5,y:start.y+across.y*offset*4.5+forward.y*1.5,sx:0,sy:0});
    this.drawDots();
    note(carrier?.id,`${name({player:this.names.get(carrier?.id)})} cherche une passe`);
    if(!(await this.wait(450)))return false;
    const t0=this.start(),from=grounded(ballAt(this.ballPath,t0)),aim={x:start.x+forward.x*10,y:start.y+forward.y*10};
    const {velocity}=rolled(from,aim,FLIGHT.ground(distance(from,aim)));
    this.ballPath=path(from,velocity,t0);
    this.gesture(carrier,{kind:'kick',style:'pass',strength:.5,target:aim,contact:{...from}},t0);
    this.loose();
    const mate=this.nearest(other,aim,{exclude:[carrier?.id]});
    // The ball reaches the line where he cuts it out.
    let cut=t0+200;while(cut<t0+3000&&distance(ballAt(this.ballPath,cut),from)<distance(from,start))cut+=10;
    const meet=ballAt(this.ballPath,cut),side0=unit(meet,dot);
    this.runTo(winner,{x:meet.x+side0.x*CONTACT,y:meet.y+side0.y*CONTACT},cut,scale(forward,-.001));
    if(mate)this.runTo(mate,aim,cut+600);
    this.gesture(winner,{kind:'cushion'},cut);
    note(winner.id,`Interception de ${name(event)}`);
    if(!(await this.perform({kind:'pass',by:carrier,to:winner,target:{x:meet.x,y:meet.y},duration:cut-t0,t0})))return false;
   }else{
    // He comes in on the man running at him with the ball and takes it off his foot.
    Object.assign(dot,{x:start.x+forward.x*2.5+across.x*offset*2.5,y:start.y+forward.y*2.5+across.y*offset*2.5,sx:0,sy:0});
    this.drawDots();
    note(carrier?.id,`${name({player:this.names.get(carrier?.id)})} conduit le ballon`);
    const t0=this.start(),from=grounded(ballAt(this.ballPath,t0)),aim={x:start.x-forward.x*.5,y:start.y-forward.y*.5};
    const duration=1100,touch=rolled(from,aim,duration,TOUCH_FRICTION);
    this.ballPath=path(from,touch.velocity,t0,{friction:TOUCH_FRICTION});
    this.gesture(carrier,{kind:'touch',target:aim,contact:{...from}},t0);
    this.loose();
    const contact=t0+duration*.75,ball=ballAt(this.ballPath,contact),come=unit(dot,ball);
    if(carrier)this.runTo(carrier,{x:ball.x-forward.x*CONTACT*1.4,y:ball.y-forward.y*CONTACT*1.4},contact,scale(forward,.004));
    const slide=distance(dot,ball)>3&&random()<.35;
    this.runTo(winner,{x:ball.x-come.x*(slide?1.1:.75),y:ball.y-come.y*(slide?1.1:.75)},contact,scale(come,.001));
    this.gesture(winner,{kind:slide?'slide':'tackle',target:{x:ball.x,y:ball.y}},contact);
    // The ball is knocked off his foot, back the way it came.
    const knock={x:ball.x-forward.x*2.4+across.x*offset*.8,y:ball.y-forward.y*2.4+across.y*offset*.8};
    this.cue(contact,()=>{const at=ballAt(this.ballPath,contact);this.ballPath=path(grounded(at),rolled(grounded(at),knock,520,TOUCH_FRICTION).velocity,contact,{friction:TOUCH_FRICTION});});
    if(carrier)this.cue(contact,()=>this.runTo(carrier,{x:ball.x+forward.x*1.4,y:ball.y+forward.y*1.4},contact+450));
    if(!(await this.perform({kind:'carry',by:carrier,duration:contact-t0,t0})))return false;
    note(winner.id,`${name(event)} tacle ${e(event.secondary||'—')}`);
    if(slide)this.still(winner,this.dot(winner),this.time,this.time+700);
    if(!(await this.wait(slide?650:250)))return false;
   }
   return this.collect(winner,side);
  }
  if(kind==='aerial'){
   // A long ball from deep in the other half, contested in the air where it comes down.
   const deep={x:start.x-forward.x*30,y:start.y-forward.y*30};
   const kicker=this.snap(deep,other,[]);
   const dot=this.dot(winner),rival=this.dot(loser);
   Object.assign(dot,{x:start.x+forward.x*4,y:start.y+forward.y*4,sx:0,sy:0});
   if(rival)Object.assign(rival,{x:start.x-forward.x*3+1,y:start.y-forward.y*3,sx:0,sy:0});
   this.drawDots();
   note(kicker?.id,'Long ballon');
   if(!(await this.wait(400)))return false;
   const t0=this.start(),from=grounded(ballAt(this.ballPath,t0)),duration=FLIGHT.lofted(distance(from,start));
   lob(from,{...start,z:2.3},2.3,duration);
   this.gesture(kicker,{kind:'kick',style:'pass',strength:1,target:{...start},contact:{...from}},t0);
   this.loose();
   const arrive=t0+duration;
   this.runTo(winner,{x:start.x+forward.x*.4,y:start.y+forward.y*.4},arrive,{x:0,y:0});
   this.gesture(winner,{kind:'head',jump:.45,target:{x:start.x-forward.x*5,y:start.y-forward.y*5}},arrive);
   if(rival){this.runTo(loser,{x:start.x-forward.x*.6+.4,y:start.y-forward.y*.6},arrive,{x:0,y:0});this.gesture(loser,{kind:'head',jump:.35},arrive+40);}
   // Headed down towards his own side.
   const drop={x:start.x-forward.x*3.5,y:start.y-forward.y*3.5};
   this.cue(arrive,()=>{const at=ballAt(this.ballPath,arrive);lob({...at,z:at.z},drop,.2,520);});
   if(!(await this.perform({kind:'pass',by:kicker,to:winner,target:{...start},duration,t0})))return false;
   note(winner.id,`${name(event)} gagne le duel aérien`);
   if(!(await this.wait(200)))return false;
   return this.collect(winner,side);
  }
  // A ball played into this side's box: headed clear, or caught by the keeper.
  const wing=random()<.5?.12:.88,cross=this.toPitch(other,.84,wing);
  const crosser=this.snap(cross,other,[],loser);
  const keeper=kind==='claim',spot=keeper?this.toPitch(side,.045,.5+(random()-.5)*.12):this.toPitch(side,.075,.5+(random()-.5)*.25);
  const dot=this.dot(winner);
  if(!keeper)Object.assign(dot,{x:spot.x+(back.x-spot.x)*.03,y:spot.y+4*(wing<.5?-1:1),sx:0,sy:0});
  this.drawDots();
  note(crosser?.id,'Centre');
  if(!(await this.wait(400)))return false;
  const t0=this.start(),from=grounded(ballAt(this.ballPath,t0)),height=keeper?2.4:2.05,duration=FLIGHT.floated(distance(from,spot));
  lob(from,{...spot,z:height},height,duration);
  this.gesture(crosser,{kind:'kick',style:'cross',strength:.9,target:{...spot},contact:{...from}},t0);
  this.loose();
  const arrive=t0+duration;
  this.runTo(winner,spot,arrive,{x:0,y:0});
  if(keeper){
   this.gesture(winner,{kind:'catch',jump:.35},arrive);
   this.cue(arrive,()=>{this.place(spot,arrive);this.carrier=winner;this.post(winner,this.dot(winner));});
   if(!(await this.perform({kind:'cross',by:crosser,to:winner,target:{...spot},duration,t0})))return false;
   note(winner.id,`${name(event)} capte le ballon`);
   if(!(await this.wait(900)))return false;
   // He throws it out to the nearest teammate free of the play, 10 to 35 metres away.
   const keeperAt=this.dot(winner);
   let receiver=null,best=Infinity;
   for(const player of this.rosters[side]){
    const mate=this.dots[side].get(player.id),gap=mate&&distance(mate,keeperAt);
    if(player.position!=='GB'&&gap>=10&&gap<=35&&gap<best){best=gap;receiver={side,id:player.id};}
   }
   if(!receiver)return null;
   const target=this.dot(receiver),release=this.start();
   const aim={x:target.x-forward.x*2,y:target.y-forward.y*2},flight=260+distance(spot,aim)*32;
   this.gesture(winner,{kind:'throw',target:aim},release+20);
   if(!(await this.wait(520)))return false;
   const throwFrom={x:spot.x,y:spot.y,z:2.1};
   lob(throwFrom,{...aim,z:.3},.3,flight);
   this.loose();
   this.runTo(receiver,aim,this.start()+flight,{x:0,y:0});
   note(winner.id,`Relance à la main de ${name(event)}`);
   if(!(await this.perform({kind:'pass',by:winner,to:receiver,target:aim,duration:flight})))return false;
   return this.collect(receiver,side);
  }
  // Headed away, up towards where the side's move starts, for a teammate.
  const jump=.4,clear={x:start.x+(random()-.5)*6,y:start.y+(random()-.5)*6};
  this.gesture(winner,{kind:'head',jump,target:clear},arrive);
  const mate=this.nearest(side,clear,{exclude:[winner.id]});
  const flight=FLIGHT.lofted(distance(spot,clear));
  this.cue(arrive,()=>{const at=ballAt(this.ballPath,arrive);lob({...at},clear,.2,flight);});
  if(mate)this.cue(arrive,()=>this.runTo(mate,clear,arrive+flight,{x:0,y:0}));
  if(!(await this.perform({kind:'cross',by:crosser,to:winner,target:{...spot},duration,t0})))return false;
  note(winner.id,`Dégagement de ${name(event)}`);
  if(!mate)return null;
  if(!(await this.wait(flight)))return false;
  return this.collect(mate,side);
 }
 // `who` gets to the loose ball and takes it on, facing the way his side attacks: the chance starts from his feet.
 async collect(who,side){
  const dot=this.dot(who);
  if(!dot)return null;
  const t0=this.start(),ball=ballAt(this.ballPath,t0+400),ahead=unit(ball,this.toPitch(side,1,.5));
  const behind={x:ball.x-ahead.x*CONTACT,y:ball.y-ahead.y*CONTACT},duration=Math.max(420,distance(dot,behind)/.0065);
  const rest=ballAt(this.ballPath,t0+duration);
  this.runTo(who,{x:rest.x-ahead.x*CONTACT,y:rest.y-ahead.y*CONTACT},t0+duration,scale(ahead,.001));
  this.gesture(who,{kind:rest.z>.6?'chest':'cushion'},t0+duration);
  this.carrier=who;this.lastSide=side;
  if(!(await this.perform({kind:'carry',by:who,duration,t0})))return false;
  this.place(grounded(ballAt(this.ballPath,this.time)));
  this.post(who,this.dot(who));
  return who;
 }

 // The move as a list of touches: how each step of the engine's trail is played and taken, then the finish.
 plan(sequence,{side,holder,title,name}){
  const random=this.random,at=(u,v)=>this.toPitch(side,u,v),jitter=(value,amount)=>clamp(value+(random()-.5)*2*amount,.02,.98);
  const who=id=>id!=null&&this.dots[side].has(id)?{side,id}:null;
  const shot=sequence.shot,kind=shot.detail,counter=sequence.start?.detail==='counter',moves=[];
  let owner=holder,ball=this.ballAt,lane=sequence.start?.lane,foul=null;
  const fouled=event=>`Faute de ${name(event)} sur ${e(event.secondary||'—')}`;
  // The foul behind a free kick or a penalty, played out: the man fouled gets the ball a few metres short of where the
  // play stops and is brought down there. False when either man is not on the pitch.
  const staged=new Set();
  const challenge=(event,spot)=>{
   const other=this.opponent(side),victim=who(event?.secondary_id),fouler=event&&this.dots[other].has(event.player_id)?{side:other,id:event.player_id}:null;
   if(!victim||!fouler||staged.has(event))return false;
   staged.add(event);
   const gap=distance(ball,spot),short=gap>6?lerpPoint(ball,spot,1-5/gap):ball;
   if(owner?.id!==victim.id)passTo(victim,short,null,{lift:distance(ball,short)>30?'driven':'ground',then:'two'});
   moves.push({type:'foul',side,victim,fouler,point:spot,note:[victim.id,`${title} · ${fouled(event)}`]});
   owner=victim;ball=spot;
   return true;
  };
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
  for(const event of sequence.trail??sequence.progress){
   if(event.kind==='circulation'){
    // Kept on the ground from one teammate to the next, square or back, towards where the run of passes ended.
    const count=Math.min(CIRCULATION_SHOWN,Number(event.detail)||1),from=this.toLocal(side,ball);
    for(let index=1;index<=count;index++){
     const k=index/count,target=at(jitter(lerp(from.u,ZONE_U[event.zone],k),.05),jitter(lerp(from.v,LANE_V[event.lane],k),.12));
     const mate=this.nearest(side,target,{exclude:owner?[owner.id]:[]});
     if(!mate)break;
     passTo(mate,lerpPoint(this.dot(mate),target,.5),index===1?[mate.id,`${title} · Le ballon circule`]:null,{lift:'ground',then:random()<.5?'one':'two'});
    }
    lane=event.lane;
    continue;
   }
   if(event.kind==='foul'){foul=event;continue;}
   if(event.kind==='throw_in'||event.kind==='free_kick'||event.kind==='corner'){
    // The play stopped and starts again where it did, the side keeping the ball: a throw-in from the touchline, a free
    // kick played short, a corner played short from the flag.
    if(event.team_id!==shot.team_id)continue;
    const touchline=event.lane===0||(event.lane===1&&random()<.5)?.01:.99;
    const spot=event.kind==='corner'?at(.997,event.lane===0?.005:.995)
     :at(jitter(ZONE_U[event.zone],.03),event.kind==='throw_in'?touchline:jitter(LANE_V[event.lane],.06));
    const played=event.kind==='free_kick'&&foul&&challenge(foul,spot),taker=this.nearest(side,spot);
    const said=event.kind==='throw_in'?'Touche':event.kind==='corner'?'Corner joué à deux':foul&&!played?fouled(foul):'Coup franc joué rapidement';
    moves.push({type:'restart',side,taker,point:spot,note:[taker?.id,`${title} · ${said}`]});
    owner=taker;ball=spot;lane=event.lane;foul=null;
    continue;
   }
   const point=at(jitter(ZONE_U[event.zone],.04),jitter(LANE_V[event.lane],.07)),player=who(event.player_id);
   const dribble=event.detail==='dribble'?event.secondary_id:null,switched=lane!=null&&event.lane!==lane;
   let note=[event.player_id,`${title} · ${dribble!=null?`${name(event)} élimine ${e(event.secondary||'—')}`:event.detail==='long'?`Long ballon de ${name(event)}`:`${name(event)} fait avancer le jeu`}`];
   lane=event.lane;
   if(!player)continue;
   if(event.detail==='long'){
    // He hits it over two lines, to the teammate nearest where it comes down, who takes it on his chest or his head.
    if(owner?.id!==player.id)passTo(player,lerpPoint(this.dot(player),ball,.2),null,{lift:'ground',then:'two'});
    const target=this.nearest(side,point,{exclude:[player.id]});
    if(target){passTo(target,point,note,{lift:'lofted',then:'two'});continue;}
   }
   if(owner?.id===player.id){moves.push({type:'carry',who:player,point,dribble,note});ball=point;continue;}
   if(event.detail==='carry'){passTo(player,point,note,{then:'carry'});continue;}
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
   // Struck at goal from the edge of the box, or from further out in the middle of the pitch.
   const spot=at(jitter(sequence.setPiece?.zone===2?.7:.78,.03),jitter(LANE_V[shot.lane??1]*.6+.2,.05)),played=challenge(sequence.foul,spot);
   const said=sequence.foul&&!played?`${fouled(sequence.foul)}, coup franc pour ${name(shot)}`:`Coup franc pour ${name(shot)}`;
   moves.push({type:'free_kick',side,by:shooter,point:spot,note:[shot.player_id,`${title} · ${said}`]});
   moves.push({type:'shot',side,by:shooter,freeKick:true,point:goal});
  }else if(kind==='crossed_free_kick'){
   // The specialist plays it into the box from where the foul was, for a head.
   const piece=sequence.setPiece,taker=who(sequence.delivery?.player_id)||this.nearest(side,at(.75,.5));
   const spot=at(jitter(piece?.zone===2?.66:.8,.03),piece?.lane===0?jitter(.15,.05):piece?.lane===2?jitter(.85,.05):jitter(.5,.1));
   const played=challenge(sequence.foul,spot);
   const said=sequence.foul&&!played?`${fouled(sequence.foul)}, coup franc centré par ${name(sequence.delivery)}`:`Coup franc centré par ${name(sequence.delivery)}`;
   moves.push({type:'free_kick',side,by:taker,point:spot,crossed:true,note:[taker?.id,`${title} · ${said}`]});
   moves.push({type:'cross',side,by:taker,to:shooter,box,style:random()<.5?'floated':'whipped',height:lerp(1.9,2.4,random()),bend:(random()-.5)*2.4,note:[shot.player_id,`${title} · Tête de ${name(shot)}`]});
   moves.push({type:'shot',side,by:shooter,header:true,point:goal});
  }else if(kind==='penalty'){
   // The ball on the spot, the taker a few strides back, the box cleared.
   // Brought down in the box first.
   const played=challenge(sequence.foul,at(jitter(.905,.015),jitter(.5,.12)));
   moves.push({type:'free_kick',side,by:shooter,point:at(.895,.5),penalty:true,note:[sequence.foul?.secondary_id??shot.player_id,`${title} · ${sequence.foul&&!played?`${fouled(sequence.foul)} : penalty`:'Penalty'}`]});
   moves.push({type:'shot',side,by:shooter,style:'placed',point:goal,note:[shot.player_id,`${title} · Penalty tiré par ${name(shot)}`]});
  }else if(kind==='rebound'){
   // The ball dropped in the box after a save or off the post: he is first to it and strikes first time.
   moves.push({type:'shot',side,by:shooter,style:random()<.5?'placed':'driven',point:goal,note:[shot.player_id,`${title} · Reprise de ${name(shot)}`]});
  }else if(kind==='cross'){
   const crosser=who(sequence.delivery?.player_id)||owner,wing=(sequence.delivery?.lane??shot.lane)===0?.07:.93;
   const note=[crosser?.id,`${title} · Centre de ${name(sequence.delivery)}`],flank=at(jitter(.84,.02),wing),byline=at(jitter(.95,.012),wing);
   // He crosses early, or takes it on to the byline first.
   if(crosser&&crosser.id!==owner?.id){const then=taking(crosser,.35);passTo(crosser,then==='carry'?byline:flank,note,{then});}
   else if(crosser)moves.push({type:'carry',who:crosser,point:random()<.45?byline:flank,note});
   moves.push({type:'cross',side,by:crosser,to:shooter,box,style:random()<.5?'floated':'whipped',height:lerp(1.9,2.35,random()),bend:(random()-.5)*2.4,note:[shot.player_id,`${title} · Tête de ${name(shot)}`]});
   moves.push({type:'shot',side,by:shooter,header:true,point:goal});
  }else if(kind==='cutback'){
   // To the byline, then back along the ground to a teammate arriving at the penalty spot, who strikes first time.
   const crosser=who(sequence.delivery?.player_id)||owner,wing=(sequence.delivery?.lane??shot.lane)===0?.07:.93;
   const byline=at(jitter(.95,.012),jitter(wing,.03)),spot=at(jitter(.86,.02),jitter(.5,.07));
   if(crosser&&crosser.id!==owner?.id)passTo(crosser,byline,[crosser.id,`${title} · ${name(sequence.delivery)} déborde`],{then:'carry'});
   else if(crosser)moves.push({type:'carry',who:crosser,point:byline,note:[crosser.id,`${title} · ${name(sequence.delivery)} déborde`]});
   if(shooter)passTo(shooter,spot,[shot.player_id,`${title} · Centre en retrait pour ${name(shot)}`],{lift:'ground',then:'one'});
   moves.push({type:'shot',side,by:shooter,style:random()<.5?'placed':'driven',point:goal});
  }else if(kind==='through_ball'){
   // Slipped in behind the defence along the ground: the runner takes it on and goes through on goal.
   const server=who(sequence.delivery?.player_id)||owner,spot=at(jitter(.9,.015),jitter(.5,.08));
   if(server&&server.id!==owner?.id)passTo(server,lerpPoint(this.dot(server),ball,.25),null,{lift:'ground',then:'two'});
   if(shooter)passTo(shooter,lerpPoint(ball,spot,.8),[sequence.delivery?.player_id,`${title} · Passe en profondeur de ${name(sequence.delivery)}`],{lift:'ground',then:'carry'});
   if(shooter)moves.push({type:'carry',who:shooter,point:spot,note:[shot.player_id,`${title} · ${name(shot)} face au gardien`]});
   moves.push({type:'shot',side,by:shooter,style:random()<.6?'placed':'low',point:goal});
  }else if(kind==='dribble'){
   // Into the box with the ball, past the defender who comes to meet him.
   const spot=at(jitter(.88,.02),jitter(.5,.1)),beaten=this.nearest(this.opponent(side),spot);
   if(shooter&&shooter.id!==owner?.id)passTo(shooter,lerpPoint(ball,spot,.35),null,{lift:'ground',then:'two'});
   if(shooter)moves.push({type:'carry',who:shooter,point:spot,dribble:beaten?.id??null,note:[shot.player_id,`${title} · ${name(shot)} élimine son défenseur`]});
   moves.push({type:'shot',side,by:shooter,style:random()<.5?'placed':'low',point:goal});
  }else if(kind==='long_shot'){
   // From 25 or 30 metres, driven.
   const spot=at(jitter(.71,.025),jitter(.5,.12)),note=[shot.player_id,`${title} · Frappe de loin de ${name(shot)}`];
   if(shooter&&shooter.id!==owner?.id)passTo(shooter,spot,note,{lift:'ground',then:random()<.4?'one':'two'});
   else if(shooter&&distance(ball,spot)>4)moves.push({type:'carry',who:shooter,point:spot,note});
   moves.push({type:'shot',side,by:shooter,style:'driven',point:goal,note:moves.some(move=>move.note===note)?null:note});
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
  this.showBanner('');
  // The clock stops on the minute of the shot while the chance plays out, as the highlights show it.
  this.showClock(sequence.shot.second);
  const note=(id,text)=>{this.highlight(id!=null?[id]:[]);this.caption(text);};
  const shot=sequence.shot,counter=sequence.start?.detail==='counter';
  const title=`<strong style="color:${team.major}">${e(team.name)}</strong> · ${this.minute(sequence.shot.second)}`;
  if(this.live){this.said={side,title,minute:this.minute(sequence.shot.second)};this.skipping=false;this.emit('replay-phase',{phase:'action'});}
  const jitter=(value,amount)=>clamp(value+(this.random()-.5)*2*amount,.02,.98);
  // The move starts where the engine recovered the ball, where the shot before it in the possession left it (in the box
  // for a rebound), or just short of the shot for saves without a trail.
  const follow=sequence.follow,rebound=shot.detail==='rebound';
  const start=sequence.start?at(jitter(ZONE_U[sequence.start.zone],.04),jitter(LANE_V[sequence.start.lane],.06))
   :follow&&rebound?at(jitter(.93,.015),jitter(.5,.1))
   :follow?at(ZONE_U[follow.zone??3],LANE_V[follow.lane??1])
   :at(ZONE_U[Math.max(0,(shot.zone??3)-1)],LANE_V[shot.lane??1]);
  // The players come back on around the ball, held by someone other than the first carrier of the move,
  // so the move opens with a pass.
  // The player who won the ball back starts with it, when the loss that gave the chance was kept; the man first to a
  // rebound, with it at his feet.
  const first=rebound?shot.player_id:sequence.recovery?.player_id;
  const recoverer=first!=null&&this.dots[side].has(first)?{side,id:first}:null;
  this.faded=false;
  this.stage.classList.remove('fast');
  // The loss of the ball that gave the chance is played first, when its two men are on the pitch.
  const regained=!rebound&&!follow&&sequence.recovery?await this.recover(sequence,start,side,title,name):null;
  if(regained===false)return false;
  const holder=regained||this.snap(start,side,sequence.progress.slice(0,1).map(event=>event.player_id),recoverer);
  const again=follow?.kind==='save'?(follow.detail==='corner'?'Arrêt en corner':'Le gardien repousse'):follow?.detail==='post'?'Sur le poteau !'
   :follow?.detail==='blocked'?'Second ballon':'Occasion';
  if(regained&&counter)note(regained.id,`${title} · Contre-attaque !`);
  else if(!regained)note(rebound?null:recoverer?.id??null,`${title} · ${counter?'Contre-attaque !':follow?again:recoverer?`Ballon récupéré par ${name(sequence.recovery)}`:sequence.start?'Récupération':'Occasion'}`);
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
  // Brought back on after a cut, they are already on their way; after a recovery played out, they set off from there.
  if(!regained)for(const run of this.runners){const dot=this.dot(run.who),gap=distance(dot,run.spot);if(gap>run.start)Object.assign(dot,lerpPoint(run.spot,dot,run.start/gap));}
  this.drawDots();
  if(!(await this.opening(holder,600,moves[0])))return false;
  for(let index=0;index<moves.length;index++){
   const move=moves[index],next=moves[index+1],ahead=moves.slice(index+1).find(item=>item.point)?.point;
   if(move.note)note(...move.note);
   if(move.type==='shot'){
    this.highlight([...this.named,move.keeper?.id,move.blocker?.id].filter(id=>id!=null));
    if(!(await this.shoot(move,sequence)))return false;
   }
   else if(!(await this[{free_kick:'freeKick'}[move.type]??move.type](move,next,ahead)))return false;
  }
  const xg=shot.xg!=null?` <small>xG ${shot.xg.toFixed(2)}</small>`:'';
  if(outcome==='goal'){
   side==='home'?this.score[0]++:this.score[1]++;
   this.showScore();
   const assist=sequence.outcome.secondary?` · passe de ${e(sequence.outcome.secondary)}`:'';
   this.caption(`${title} · <strong>But de ${name(shot)}${shot.detail==='penalty'?' sur penalty':''}</strong>${assist}${xg}`);
   // The outcome is read at normal pace; live, the goal holds the pitch for its own time.
   this.tempo=1;
   if(this.live){this.goalBurst(side,shot,sequence.outcome);return this.wait(GOAL_HOLD_MS,{pace:'real'});}
   this.showBanner('BUT !',side);
   return this.wait(1700);
  }
  const keeperName=e(shot.secondary||'—'),detail=sequence.outcome?.detail;
  const said=shot.detail==='penalty'?(outcome==='save'?`Penalty arrêté par ${keeperName}`:'Penalty manqué')
   :outcome==='save'?`Arrêt de ${keeperName}${detail==='corner'?', en corner':detail==='parried'?', le ballon revient':''}`
   :blocked?`Tir contré par ${e(sequence.outcome.secondary||'—')}`:detail==='post'?'Sur le poteau !':'Tir non cadré';
  this.caption(`${title} · ${said}${xg}`);
  this.tempo=1;
  return this.wait(850);
 }
}
// A slider set on the stop of `stops` nearest to `value`, its value written after it.
function setSlider(slider,stops,value){
 if(!slider)return;
 const index=stops.reduce((best,stop,n)=>Math.abs(Math.log(stop/value))<Math.abs(Math.log(stops[best]/value))?n:best,0);
 slider.value=String(index);
 slider.style.setProperty('--fill',`${100*index/(stops.length-1)}%`);
 slider.setAttribute('aria-valuetext',`${value}×`);
 slider.nextElementSibling.value=`${value}×`;
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
// Bench players keep their own number when they enter the field, including after a live resync.
function rosterShirts(result,shirts=new Map()){
 for(const key of ['home_lineup','home_bench','away_lineup','away_bench'])for(const player of result[key]||[])if(player.shirt!=null)shirts.set(player.id,player.shirt);
 return shirts;
}
// The live match: `state` is the match so far (as GET /direct returns it), `next()` fetches the following segment.
export function liveReplay(state,teams,next){
 const result=state.result,key=String(++keys);
 pending.set(key,{events:[],duration:0,homeId:state.home.id,awayId:state.away.id,teams,names:rosterNames(result),styles:rosterStyles(result),shirts:rosterShirts(result),
                  lineups:{home:result.home_lineup,away:result.away_lineup},live:{state,next}});
 return `<match-replay data-key="${key}"></match-replay>`;
}
export function replayCard(match,teams){
 const result=match.result,key=String(++keys);
 pending.set(key,{events:result.events,duration:result.duration,homeId:match.home.id,awayId:match.away.id,teams,names:rosterNames(result),styles:rosterStyles(result),shirts:rosterShirts(result),
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
 else if(open)replay.showScore?.();
 else{replay?.pause?.();bannerScore(null);}
});
// Open, the summary writes its score in the match banner as it goes; folded, the banner shows the final score again.
function bannerScore(score){
 const tile=document.querySelector('.match-hero .big-score');
 if(!tile)return;
 tile.dataset.final??=tile.textContent;
 tile.textContent=score?score.join(' : '):tile.dataset.final;
}
