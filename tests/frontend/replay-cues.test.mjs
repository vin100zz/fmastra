import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ballAt,lofted,path,rolled} from '../../web/replay-physics.js';

// Capture the registered element without a browser; these tests exercise the replay's own scheduling.
let Replay;
globalThis.customElements={get(){},define(name,element){if(name==='match-replay')Replay=element;}};
const {liveReplay,replayCard}=await import('../../web/match-replay.js');
delete globalThis.customElements;

const shooter={side:'home',id:9},receiver={side:'home',id:10},keeper={side:'away',id:1};
const fixture=()=>{
 const replay=new Replay();
 Object.assign(replay,{time:1000,period:1,runs:new Map(),posts:new Map(),cues:[],
  dots:{home:new Map([[9,{x:79.1,y:34}],[10,{x:90,y:40}]]),away:new Map([[1,{x:103.4,y:31}]])},
  carrier:shooter,random:()=>.5,ballPath:path({x:80,y:34,z:0},{x:0,y:0,z:0},1000),
  perform(action){this.action=action;return Promise.resolve(true);}});
 return replay;
};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);

test('a scheduled next touch preserves the current follow-through and refines its contact once',()=>{
 const replay=fixture(),dot=replay.dot(shooter);
 replay.gesture(shooter,{kind:'cushion'},1000);
 replay.gesture(shooter,replay.touchOf({type:'shot',point:{x:105,y:34}}),1500);
 assert.deepEqual(dot.gestures.map(item=>item.kind),['cushion','kick']);
 replay.gesture(shooter,{kind:'kick',style:'shot',target:{x:105,y:36}},1500);
 assert.equal(dot.gestures.length,2);
 assert.deepEqual(dot.gestures[1].target,{x:105,y:36});
 replay.gesture(shooter,null,2000);
 assert.equal(dot.gesture,null);
 assert.equal(dot.gestures.length,2);
 for(let at=2000;at<=4500;at+=500)replay.gesture(shooter,{kind:'touch'},at);
 assert.deepEqual(dot.gestures.map(item=>item.at),[3000,3500,4000,4500]);
});

test('a scene cut clears animation history for both teams',()=>{
 const replay=fixture();
 for(const who of [shooter,receiver,keeper])replay.gesture(who,{kind:'kick'},1000);
 replay.targets=()=>new Map([['home',new Map([[9,{x:40,y:34}]])],['away',new Map()]]);
 replay.nearest=()=>shooter;replay.drawDots=()=>{};replay.place=()=>{};
 replay.snap({x:41,y:34},'home');
 for(const who of [shooter,receiver,keeper]){
  assert.deepEqual(replay.dot(who).gestures,[]);
  assert.equal(replay.dot(who).gesture,null);
 }
});

test('a pass supplies its actual receiver target and retains his control while scheduling the next kick',async()=>{
 const replay=fixture(),point={x:90,y:40},from=ballAt(replay.ballPath,1000);
 const pass={type:'pass',lift:'ground',then:'two',to:receiver,point};
 const shot={type:'shot',side:'home',by:receiver,point:{x:105,y:34},style:'driven'};
 await replay.pass(pass,{type:'control',who:receiver},shot.point);
 const action=replay.action,duration=220+Math.hypot(point.x-from.x,point.y-from.y)*55;
 const expected=rolled(from,point,duration);
 assert.deepEqual(replay.ballPath,path(from,expected.velocity,1000));
 assert.deepEqual(action.by,shooter);
 assert.deepEqual(action.target,point);
 assert.equal(action.duration,expected.duration);
 assert.equal(replay.dot(shooter).gesture.style,'pass');
 assert.deepEqual(replay.dot(shooter).gesture.target,point);
 assert.deepEqual(replay.dot(shooter).gesture.contact,{x:80,y:34,z:0});
 replay.time=action.t0+action.duration;
 await replay.control({type:'control',who:receiver},shot,shot.point);
 assert.deepEqual(replay.dot(receiver).gestures.map(item=>item.kind),['cushion','kick']);
 assert.equal(replay.dot(receiver).gesture.style,'shot');
});

test('a ground pass struck off a bouncing ball reaches the spot its receiver runs to',async()=>{
 const replay=fixture(),point={x:90,y:40};
 replay.ballPath=path({x:80,y:34,z:.35},{x:0,y:0,z:0},1000);
 await replay.pass({type:'pass',lift:'ground',then:'two',to:receiver,point},{type:'control',who:receiver},{x:105,y:34});
 const action=replay.action,arrived=ballAt(replay.ballPath,action.t0+action.duration),run=replay.runs.get('home:10');
 assert.ok(Math.hypot(arrived.x-point.x,arrived.y-point.y)<.01,`the ball stops ${Math.hypot(arrived.x-point.x,arrived.y-point.y).toFixed(2)} m short`);
 assert.ok(Math.hypot(run.to.x-arrived.x,run.to.y-arrived.y)<1);
 assert.equal(run.t1,action.t0+action.duration);
});

test('a cross identifies the kicker and prepares a directed header without changing its flight',async()=>{
 const replay=fixture(),move={type:'cross',side:'home',by:shooter,to:receiver,style:'floated',height:2.1,bend:0};
 await replay.cross(move);
 const action=replay.action,kick=replay.dot(shooter).gesture,header=replay.dot(receiver).gesture;
 assert.deepEqual(action.by,shooter);
 assert.equal(kick.style,'cross');
 assert.equal(kick.technique,'floated');
 assert.deepEqual(kick.target,action.target);
 const ball=ballAt(replay.ballPath,action.t0+action.duration);
 near(ball.x,action.target.x);near(ball.y,action.target.y);near(ball.z,2.1);
 assert.equal(header.kind,'head');assert.equal(header.style,'shot');
 assert.deepEqual(header.target,{x:105,y:34});
 near(header.jump,.35);
 replay.time=action.t0+action.duration;
 await replay.shoot({type:'shot',side:'home',by:receiver,keeper,header:true},{outcome:{kind:'goal'}});
 const contact=replay.dot(receiver).gesture;
 assert.equal(replay.dot(receiver).gestures.length,1);
 assert.equal(contact.kind,'head');near(contact.jump,.35);
 near(contact.contact.z,2.1);
 assert.deepEqual(contact.target,replay.action.target);
});

test('shot and keeper cues use the existing flight without consuming additional random draws',async()=>{
 for(const outcome of ['goal','save','off_target']){
  const replay=fixture();
  let draws=0;replay.random=()=>{draws++;return .5;};
  const move={type:'shot',side:'home',by:shooter,keeper,style:'driven',point:{x:105,y:34}};
  await replay.shoot(move,{outcome:{kind:outcome}});
  const action=replay.action;
  assert.equal(action.outcome,outcome);
  assert.deepEqual(action.by,shooter);
  assert.deepEqual(replay.dot(shooter).gesture.target,action.target);
  if(outcome==='off_target')assert.equal(action.keeperTarget,null);
  else{
   assert.equal(draws,3);
   const target={x:outcome==='goal'?105:103.95,y:34},duration=(target.x-80)/.028;
   const from={x:80,y:34,z:0},{velocity,options}=lofted(from,target,duration,1.175,{bend:0});
   assert.deepEqual(replay.ballPath,path(from,velocity,1000,options));
   near(action.duration,duration);
   near(action.keeperHeight,ballAt(replay.ballPath,1000+duration*.92).z);
   assert.deepEqual(action.keeperTarget,{...action.keeperPoint,z:action.keeperHeight});
  }
 }
});

test('recorded and live replays retain shirt numbers for both benches and refresh live metadata',()=>{
 const player=(id,shirt)=>({id,shirt,name:`Player ${id}`,position:'MC'});
 const result={events:[],duration:100,home_lineup:[player(9,9)],home_bench:[player(10,17),player(11,null)],
  away_lineup:[player(1,1)],away_bench:[player(2,28)]};
 const state={home:{id:1},away:{id:2},status:'playing',second:100,score:[0,0],result};
 const recorded=replayCard(state,{}).toggle,live=liveReplay(state,{},()=>{});
 for(const [markup,isLive] of [[recorded,false],[live,true]]){
  const replay=new Replay();
  replay.dataset={key:markup.match(isLive?/data-key="(\d+)"/:/data-replay-toggle="(\d+)"/)[1]};
  replay.build=()=>{};replay.reset=()=>{};replay.startLive=()=>{};replay.showScore=()=>{};
  replay.connectedCallback();
  assert.deepEqual([...replay.shirts],[[9,9],[10,17],[1,1],[2,28]]);
  assert.equal(replay.shirts.has(11),false);
  if(isLive){
   replay.resync({...state,result:{...result,home_bench:[player(10,18)]}});
   assert.equal(replay.shirts.get(10),18);
   replay.append({status:'playing',result:{events:[],away_bench:[player(2,29)]}});
   assert.equal(replay.shirts.get(2),29);
   assert.equal(replay.shirts.get(9),9);
  }
 }
});
