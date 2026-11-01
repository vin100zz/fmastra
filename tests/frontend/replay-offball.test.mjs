// Play off the ball: the runs of the side with it, the cover of the side without, men keeping out of each other's way,
// and a goal carried into the back of the net.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ballAt,path} from '../../web/replay-physics.js';

let Replay;
globalThis.customElements={get(){},define(name,element){if(name==='match-replay')Replay=element;}};
await import('../../web/match-replay.js');
delete globalThis.customElements;

const POSITIONS=['GB','DG','DC','DC','DD','MDC','MC','MC','AILG','BU','AILD'];
const DEPTH={GB:.02,DC:.17,DG:.2,DD:.2,MDC:.33,MC:.46,AILG:.68,AILD:.68,BU:.74};
const roster=offset=>POSITIONS.map((position,index)=>({id:offset+index+1,position,u:DEPTH[position],
 v:position==='GB'?.5:[0,.12,.38,.62,.88,.5,.35,.65,.12,.5,.88][index]}));
// Home attacks to the right; everyone stands on his formation spot.
function fixture(){
 const replay=new Replay(),rosters={home:roster(0),away:roster(100)};
 Object.assign(replay,{time:1000,since:1000,period:1,runs:new Map(),posts:new Map(),cues:[],pressers:{},rosters,carrier:{side:'home',id:7},
  random:()=>.3,ballPath:path({x:70,y:34,z:0},{x:0,y:0,z:0},1000),
  dots:{home:new Map(),away:new Map()},perform(action){this.action=action;return Promise.resolve(true);}});
 for(const side of ['home','away'])for(const player of rosters[side]){
  const at=replay.toPitch(side,player.u,player.v);replay.dots[side].set(player.id,{x:at.x,y:at.y,sx:0,sy:0});
 }
 return replay;
}

test('a forward runs onto the shoulder of the last defender, then checks back, never offside',()=>{
 const replay=fixture(),ball={x:60,y:34},xs=[];
 for(let clock=0;clock<12000;clock+=100){
  replay.time=replay.since+clock;
  const targets=replay.targets(ball,'home'),line=105-replay.line*105;
  for(const [id,spot] of targets.get('home'))if(id!==1)assert.ok(spot.x<=line+105*.006,`attacker ${id} offside at ${spot.x.toFixed(1)}`);
  xs.push(targets.get('home').get(10).x-line);
 }
 assert.ok(Math.max(...xs)>-1,'on the line at the end of his run');
 assert.ok(Math.min(...xs)<Math.max(...xs)-6,'and short of it when he comes back for the ball');
});

test('a full-back overlaps when the ball is on his flank in the other half',()=>{
 const replay=fixture(),ball={x:72,y:58};
 replay.carrier={side:'home',id:8};
 let wide=false;
 for(let clock=0;clock<9000;clock+=150){
  replay.time=replay.since+clock;
  const spot=replay.targets(ball,'home').get('home').get(5);
  if(spot.x>ball.x+3&&spot.y>62)wide=true;
 }
 assert.ok(wide,'he goes past the ball down the touchline');
});

test('the man closing the ball down is covered by a teammate goal-side of him',()=>{
 const replay=fixture(),ball={x:60,y:30},targets=replay.targets(ball,'home').get('away');
 const presser=replay.pressers.away,cover=replay.covers.away;
 assert.ok(presser!=null&&cover!=null&&cover!==presser);
 const spot=targets.get(cover);
 assert.ok(spot.x>ball.x+3&&spot.x<ball.x+10,'a few strides behind the ball, towards his goal');
 assert.ok(![...replay.marks.pairs.keys()].includes(cover),'he marks no one');
});

test('two men do not run through each other',()=>{
 const replay=fixture(),me=replay.dots.home.get(7),other=replay.dots.away.get(107);
 Object.assign(other,{x:me.x+.5,y:me.y});
 const spot={x:me.x+5,y:me.y},clear=replay.room('home',7,me,spot);
 assert.ok(clear.x<spot.x,'his way is moved off the man in front of him');
 Object.assign(other,{x:me.x+3,y:me.y});
 assert.deepEqual(replay.room('home',7,me,spot),spot,'no one near: his own spot');
});

test('a goal carries on over the line into the back of the net, which stops it there',async()=>{
 const replay=fixture(),keeper={side:'away',id:101};
 replay.carrier={side:'home',id:10};replay.ballPath=path({x:88,y:34,z:0},{x:0,y:0,z:0},1000);
 await replay.shoot({type:'shot',side:'home',by:{side:'home',id:10},keeper,style:'driven',point:{x:105,y:34}},{outcome:{kind:'goal'}});
 const {net,t0,duration}=replay.action;
 assert.ok(net,'it reaches the net');
 assert.ok(net.at>t0+duration&&net.x>105.8&&net.x<107.4&&Math.abs(net.y-34)<3.66,`inside the goal: ${JSON.stringify(net)}`);
 for(const cue of replay.cues)cue.apply();
 const after=ballAt(replay.ballPath,net.at+1500);
 assert.ok(after.x<107.4&&after.x>105,'it drops and stays in the net');
});
