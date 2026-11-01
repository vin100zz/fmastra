// The defending side: its line, the offside it gives, its marking, and the challenges it makes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {path} from '../../web/replay-physics.js';
import {activeGesture,gestureTiming,playerMotion,soleHeight} from '../../web/replay-motion.js';
import {SCALE} from '../../web/replay-locomotion.js';

let Replay;
globalThis.customElements={get(){},define(name,element){if(name==='match-replay')Replay=element;}};
await import('../../web/match-replay.js');
delete globalThis.customElements;

const POSITIONS=['GB','DG','DC','DC','DD','MDC','MC','MC','AILG','BU','AILD'];
const DEPTH={GB:.02,DC:.17,DG:.2,DD:.2,MDC:.33,MC:.46,AILG:.68,AILD:.68,BU:.74};
const roster=offset=>POSITIONS.map((position,index)=>({id:offset+index+1,position,u:DEPTH[position],
 v:position==='GB'?.5:[0,.12,.38,.62,.88,.5,.35,.65,.12,.5,.88][index]}));
// Home attacks to the right (x grows towards the away goal); everyone stands on his formation spot.
function fixture(){
 const replay=new Replay();
 const rosters={home:roster(0),away:roster(100)};
 Object.assign(replay,{time:1000,period:1,runs:new Map(),posts:new Map(),cues:[],pressers:{},rosters,carrier:{side:'home',id:7},
  random:()=>.3,ballPath:path({x:70,y:34,z:0},{x:0,y:0,z:0},1000),
  dots:{home:new Map(),away:new Map()},perform(action){this.action=action;return Promise.resolve(true);}});
 for(const side of ['home','away'])for(const player of rosters[side]){
  const at=replay.toPitch(side,player.u,player.v);replay.dots[side].set(player.id,{x:at.x,y:at.y,sx:0,sy:0});
 }
 return replay;
}

test('the defending back four hold one line and no attacker drifts beyond it',()=>{
 const replay=fixture(),ball={x:62,y:30},targets=replay.targets(ball,'home');
 const back=[102,103,104,105].map(id=>replay.toLocal('away',targets.get('away').get(id)).u);
 for(const u of back)assert.ok(Math.abs(u-back[0])<1e-9,`the line is broken: ${back}`);
 const line=105-back[0]*105;
 for(const [id,spot] of targets.get('home'))if(id!==1)assert.ok(spot.x<=line+105*.006,`attacker ${id} offside at ${spot.x.toFixed(1)} beyond ${line.toFixed(1)}`);
});

test('the line drops with a ball played in behind it, and attackers may then go as far as the ball',()=>{
 const replay=fixture(),ball={x:96,y:34},targets=replay.targets(ball,'home');
 const line=replay.toLocal('away',targets.get('away').get(103)).u;
 assert.ok(line<replay.toLocal('away',ball).u,'the line is goal-side of the ball');
 assert.ok([...targets.get('home').values()].some(spot=>spot.x>105-.2*105),'an attacker goes beyond the usual line');
});

test('an attacker near goal is marked goal-side, the pairs holding from one frame to the next',()=>{
 const replay=fixture(),striker=replay.dots.home.get(10);
 Object.assign(striker,{x:88,y:40});
 const ball={x:75,y:30},first=replay.targets(ball,'home').get('away');
 const pairs=new Map(replay.marks.pairs);
 const marker=[...pairs].find(([,attacker])=>attacker===10)?.[0];
 assert.ok(marker!=null,'someone picks up the striker');
 const spot=first.get(marker);
 assert.ok(spot.x>striker.x,'the marker stands between him and the goal');
 assert.ok(Math.hypot(spot.x-striker.x,spot.y-striker.y)<6,'close to him');
 replay.time+=200;striker.x+=.5;
 replay.targets(ball,'home');
 assert.deepEqual([...replay.marks.pairs],[...pairs],'the pairs hold');
});

test('the man taken on in a dribble lunges where the ball was heading and stays there a moment',()=>{
 const replay=fixture(),beaten={side:'away',id:106},from={x:60,y:34},to={x:80,y:34};
 replay.lunge(beaten,from,to,1400,2);
 const gesture=replay.dot(beaten).gesture;
 assert.ok(['tackle','slide'].includes(gesture.kind));
 assert.equal(gesture.at,1400);
 assert.deepEqual(gesture.target,{x:62,y:34});
 const run=replay.runs.get('away:106');
 assert.equal(run.t1,1400);
 assert.ok(Math.hypot(run.to.x-62,run.to.y-34)<1.3,'he gets to the ball within a leg');
 assert.ok(replay.cues.some(cue=>cue.at>1400),'he is held there after his lunge');
});

test('a foul is played out: a challenge on the man fouled, who goes down away from it, before the whistle',async()=>{
 const replay=fixture(),victim={side:'home',id:9},fouler={side:'away',id:105};
 replay.carrier=victim;replay.ballPath=path({x:70,y:12,z:0},{x:0,y:0,z:0},1000);
 Object.assign(replay.dot(victim),{x:69,y:12});
 await replay.foul({type:'foul',side:'home',victim,fouler,point:{x:76,y:12}});
 const action=replay.action,fall=replay.dot(victim).gesture,tackle=replay.dot(fouler).gesture;
 assert.equal(action.kind,'foul');
 assert.equal(fall.kind,'fall');
 assert.ok(['tackle','slide'].includes(tackle.kind));
 assert.equal(fall.at,tackle.at,'they meet at the contact');
 assert.ok(action.t0+action.duration>fall.at+1000,'the play stops with him on the ground');
 assert.equal(replay.carrier,null,'the ball runs loose');
});

const footY=(pose,side)=>{
 const hip=pose.hip[side],shin=hip+pose.knee[side],roll=pose.hipRoll[side],along=.45*Math.cos(hip)+.4*Math.cos(shin);
 return pose.lift+SCALE*(.93-along*Math.cos(roll)-soleHeight(shin+pose.ankle[side]));
};

test('a standing tackle lunges on one planted foot, the other leg thrown at the ball',()=>{
 for(const foot of [0,1]){
  const gesture={kind:'tackle',at:1000},pose=playerMotion({speed:3,phase:1,time:1000,seed:1,gesture,foot});
  assert.ok(pose.hip[foot]<-.9&&pose.knee[foot]<.3,'the tackling leg is out straight');
  assert.ok(pose.knee[1-foot]>1,'the other knee bends low');
  assert.ok(Math.abs(footY(pose,1-foot))<.01,`the support sole is on the grass: ${footY(pose,1-foot)}`);
 }
});

test('a slide and a fall take him to the ground, then back on his feet when they end',()=>{
 for(const kind of ['slide','fall'])for(const foot of [0,1]){
  const gesture={kind,at:1000},timing=gestureTiming(gesture),down=playerMotion({time:kind==='fall'?1700:1300,gesture,foot,seed:2});
  assert.ok(Math.abs(down.roll)>1,`${kind}: he is on his side`);
  for(const value of Object.values(down).flat())assert.ok(Number.isFinite(value));
  const end=gesture.at-timing.lead+timing.span;
  assert.equal(activeGesture([gesture],end),null);
  assert.ok(Math.abs(playerMotion({time:end-1,gesture,foot,seed:2}).roll-playerMotion({time:end-1,seed:2}).roll)<1e-3,`${kind}: back up at the end`);
 }
 const left=playerMotion({time:1700,gesture:{kind:'fall',at:1000},foot:0}),right=playerMotion({time:1700,gesture:{kind:'fall',at:1000},foot:1});
 assert.ok(left.roll*right.roll<0,'he falls to the side he is sent');
});
