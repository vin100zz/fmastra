// The defending side: its line, the offside it gives, its marking, and the challenges it makes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ballAt,path} from '../../web/replay-physics.js';
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

// The loss of the ball before a chance, played on the fixture's pitch; every beat resolves at once, the clock jumping
// to its end, so that the cues on the way apply.
function played(){
 const replay=fixture();
 Object.assign(replay,{names:new Map(),drawDots(){},drawBall(){},highlight(){},caption(){},stage:{classList:{add(){},remove(){},toggle(){},contains:()=>false}},
  perform(action){action.t0??=this.start();this.action=action;this.cursor=action.t0+action.duration;this.time=this.cursor;
   while(this.cues.length&&this.cues[0].at<=this.time)this.cues.shift().apply();return Promise.resolve(true);}});
 return replay;
}
const sequence=(detail,winner,loser)=>({recovery:{kind:'turnover',detail,player_id:winner,secondary_id:loser,player:'A',secondary:'B'}});

for(const [detail,winner,loser] of [['interception',107,8],['tackle',106,9],['aerial',103,10]])test(`a ${detail} is played out and ends with the winner on the ball`,async()=>{
 const replay=played(),start=replay.toPitch('away',.4,.5);
 const holder=await replay.recover(sequence(detail,winner,loser),start,'away','Paris',event=>event?.player||'—');
 assert.deepEqual(holder,{side:'away',id:winner});
 assert.deepEqual(replay.carrier,holder);
 // The fixture moves nobody: where his last run takes him is where he stands.
 const run=replay.runs.get(`away:${winner}`),ball=replay.ballAt;
 assert.ok(Math.hypot(run.to.x-ball.x,run.to.y-ball.y)<1.5,'the ball is at his feet');
 const kinds=replay.dot(holder).gestures.map(gesture=>gesture.kind);
 assert.ok(kinds.includes({interception:'cushion',tackle:'tackle',aerial:'head'}[detail])||detail==='tackle'&&kinds.includes('slide'),`his gesture: ${kinds}`);
});

test('a keeper claims the cross, holds it, then throws it out to a teammate who takes it on',async()=>{
 const replay=played(),start=replay.toPitch('away',.1,.5);
 const holder=await replay.recover(sequence('claim',101,9),start,'away','Paris',event=>event?.player||'—');
 const keeper=replay.dot({side:'away',id:101}).gestures.map(gesture=>gesture.kind);
 assert.ok(keeper.includes('catch')&&keeper.includes('throw'),`the keeper catches then throws: ${keeper}`);
 assert.equal(holder.side,'away');assert.notEqual(holder.id,101);
 assert.deepEqual(replay.carrier,holder);
});

test('a loss the replay cannot show leaves the chance to start as before',async()=>{
 const replay=played();
 assert.equal(await replay.recover(sequence('interception',999,8),{x:50,y:34},'away','Paris',()=>''),null);
 assert.equal(await replay.recover(sequence('offside',107,8),{x:50,y:34},'away','Paris',()=>''),null);
});

test('a goal sends the scorer off towards the flag, his teammates after him, and leaves the other side dejected',()=>{
 const replay=fixture();replay.time=5000;
 const scorer={side:'home',id:10};Object.assign(replay.dot(scorer),{x:96,y:30});
 replay.celebrate('home',scorer,2600);
 assert.deepEqual(replay.dot(scorer).moods.map(mood=>mood.kind),['scorer','cheer']);
 assert.deepEqual(replay.focus,scorer,'the camera follows him');
 const run=replay.runs.get('home:10');
 assert.ok(run.to.x>96&&run.to.y<30,'towards the corner flag on his side');
 const cheering=[...replay.dots.home.values()].filter(dot=>dot.moods?.some(mood=>mood.kind==='cheer')).length;
 assert.ok(cheering>=9,'his teammates celebrate');
 for(const [id,dot] of replay.dots.away){
  assert.ok(['dejected','crouch'].includes(dot.moods[0].kind),`away ${id} reacts`);
  assert.equal(dot.moods[0].until,7600);
 }
});

test('a miss puts the shooter\'s hands on his head and the keeper who saved it organises his defence',()=>{
 const replay=fixture();replay.time=5000;
 const finish={by:{side:'home',id:10},keeper:{side:'away',id:101}};
 replay.regret({},finish,{blocked:false,saved:true,post:false});
 assert.equal(replay.dot(finish.by).moods[0].kind,'despair');
 assert.equal(replay.dot(finish.keeper).moods[0].kind,'point');
});

test('every reaction keeps a finite pose and fades back to the plain gait',()=>{
 for(const kind of ['scorer','cheer','dejected','crouch','despair','point','call'])for(const speed of [0,4]){
  const pose=playerMotion({speed,phase:1,time:3000,seed:2,mood:{kind,weight:1}});
  for(const value of Object.values(pose).flat())assert.ok(Number.isFinite(value),`${kind} at ${speed} m/s`);
  assert.deepEqual(playerMotion({speed,phase:1,time:3000,seed:2,mood:{kind,weight:0}}),playerMotion({speed,phase:1,time:3000,seed:2}));
 }
 const crouch=playerMotion({time:3000,seed:2,mood:{kind:'crouch',weight:1}});
 assert.ok(Math.abs(footY(crouch,0))<.01&&Math.abs(footY(crouch,1))<.01,'bent over, both soles on the grass');
});

test('the keeper stands on the line from his goal to the ball, further off it as the ball goes away',()=>{
 const replay=fixture(),keeperAt=ball=>replay.targets(ball,'home').get('away').get(101);
 for(const ball of [{x:92,y:12},{x:92,y:56}]){
  const spot=keeperAt(ball),goal={x:105,y:34};
  const cross=(spot.x-goal.x)*(ball.y-goal.y)-(spot.y-goal.y)*(ball.x-goal.x);
  assert.ok(Math.abs(cross)/Math.hypot(ball.x-goal.x,ball.y-goal.y)<.6,'on the line to the ball');
  assert.ok(spot.y<34===ball.y<34,'towards its side');
 }
 assert.ok(105-keeperAt({x:20,y:34}).x>105-keeperAt({x:90,y:34}).x+6,'well off his line with the ball far away');
});

test('a keeper off his line spreads himself where the shot passes nearest him; beaten, he is a stride short',async()=>{
 for(const outcome of ['save','goal']){
  const replay=fixture(),keeper={side:'away',id:101};
  replay.carrier={side:'home',id:10};replay.ballPath=path({x:88,y:34,z:0},{x:0,y:0,z:0},1000);
  Object.assign(replay.dot(keeper),{x:97,y:33});
  await replay.shoot({type:'shot',side:'home',by:{side:'home',id:10},keeper,style:'low',point:{x:105,y:34}},{outcome:{kind:outcome}});
  const action=replay.action,meet=action.keeperPoint;
  assert.ok(meet.x<103,'he meets it off his line');
  assert.ok(action.keeperReach<action.duration,'before it reaches the goal');
  if(outcome==='save')assert.ok(Math.abs(action.duration-action.keeperReach/.92)<1,'the ball stops at him');
 }
});

test('a keeper with the ball throws it to a free teammate, or kicks it upfield when none is near',async()=>{
 const replay=played(),keeper={side:'away',id:101};
 Object.assign(replay.dot(keeper),{x:100,y:34});replay.carrier=keeper;
 const receiver=await replay.distribute(keeper,{throw:true});
 assert.ok(receiver&&receiver.side==='away');
 assert.ok(replay.dot(keeper).gestures.some(gesture=>gesture.kind==='throw'));
 assert.equal(replay.carrier,null);
 const lonely=played();
 for(const [id,dot] of lonely.dots.away)if(id!==101)Object.assign(dot,{x:20,y:34});
 Object.assign(lonely.dot(keeper),{x:100,y:34});
 await lonely.distribute(keeper);
 const kick=lonely.dot(keeper).gestures.find(gesture=>gesture.kind==='kick');
 assert.ok(kick&&kick.target.x<70,'a long kick upfield');
});

test('a low save near him is kept out with a foot, the body dropping onto the other knee',()=>{
 const dive={start:1000,duration:600,distance:1.2,height:.1,side:1,style:'foot'},pose=playerMotion({time:1650,ready:1,dive,seed:3});
 assert.ok(pose.hipRoll[1]>.6,'the near leg swings out to the side');
 assert.ok(pose.knee[0]>1.2,'the other knee bends');
 assert.ok(Math.abs(footY(pose,0))<.01,'on the grass');
 assert.ok(Math.abs(pose.roll)<.2,'he stays up, no dive');
});

test('a throw-in is thrown from off the touchline, the ball held above the head, then thrown to the next man',async()=>{
 const replay=played();replay.ballAt={x:40,y:34};
 const sequence={shot:{detail:'shot',player_id:10,team_id:1,lane:1},start:{zone:1,lane:1},
  trail:[{kind:'throw_in',team_id:1,zone:2,lane:0},{kind:'progress',player_id:8,team_id:1,zone:3,lane:1}]};
 const moves=replay.plan(sequence,{side:'home',holder:{side:'home',id:7},title:'Nice',name:event=>event?.player||'—'});
 const restart=moves.find(move=>move.type==='restart'),pass=moves[moves.indexOf(restart)+1];
 assert.ok(restart.throwIn);
 assert.equal(pass.type,'pass');assert.ok(pass.throw,'the pass after it is thrown');
 assert.equal(moves.filter(move=>move.throw).length,1,'only that one');
 await replay.restart(restart,pass);
 const taker=replay.dot(replay.carrier);
 assert.ok(taker.hands,'he holds it');
 assert.ok(taker.y<0||taker.y>68,'from off the pitch');
 assert.equal(taker.gestures.at(-1).kind,'throwin');
 replay.time+=10;
 await replay.pass(pass,null,null);
 assert.ok(!taker.hands,'released');
 assert.ok(Math.abs(ballAt(replay.ballPath,replay.action.t0).z-2.1)<1e-9,'out of his hands above his head');
});

test('a set-piece taker curves in behind the ball onto the line of his strike',()=>{
 const replay=played(),taker={side:'home',id:11};
 Object.assign(replay.dot(taker),{x:80,y:30});
 const ball={x:84,y:34},goal={x:105,y:34};
 replay.runUp(taker,ball,{type:'shot',point:goal},850);
 const run=replay.runs.get('home:11');
 assert.ok(Math.abs(run.to.y-34)<1e-9&&run.to.x<84,'he arrives behind the ball, on its line to goal');
 assert.ok(run.v1.x>0&&Math.abs(run.v1.y)<1e-9,'running along that line');
});
