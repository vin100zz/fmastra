import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeGesture,angleDelta,gaitCycle,gaitStyle,gestureTiming,playerMotion,soleHeight,strideLength} from '../../web/replay-motion.js';
import {SCALE} from '../../web/replay-locomotion.js';

const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} is not ${expected}`);
const finite=pose=>{
 for(const [part,value] of Object.entries(pose))for(const angle of Array.isArray(value)?value:[value])assert.ok(Number.isFinite(angle),`${part} is not finite`);
};
const TAU=Math.PI*2;
// Forward kinematics of the actual .45 m thigh, .40 m shin and rolling sole.
const footAt=(pose,side)=>{
 const hip=pose.hip[side],shin=hip+pose.knee[side],pitch=shin+pose.ankle[side];
 return {z:SCALE*(-.45*Math.sin(hip)-.4*Math.sin(shin)),
  y:pose.lift+SCALE*(.93-.45*Math.cos(hip)-.4*Math.cos(shin)-soleHeight(pitch)),pitch};
};

test('an outgoing kick keeps its follow-through when a later touch is already queued',()=>{
 const shot={kind:'kick',style:'shot',at:1000,strength:1},next={kind:'touch',at:1200};
 // Both windows are active, but the second contact has not happened yet.
 assert.strictEqual(activeGesture([shot,next],1150),shot);
 assert.strictEqual(activeGesture([next,shot],1150),shot);
 assert.strictEqual(activeGesture([shot,next],1200),next);
 assert.strictEqual(activeGesture([next,shot],1200),next);
});

test('the newest completed contact wins regardless of cue order',()=>{
 const pass={kind:'kick',style:'pass',at:1000},touch={kind:'touch',at:1100},future={kind:'kick',style:'shot',at:1400};
 for(const cues of [[pass,touch,future],[future,touch,pass],[touch,pass,future]])assert.strictEqual(activeGesture(cues,1170),touch);
 // With no completed contact, prepare for the nearest one.
 const earlier={kind:'kick',style:'shot',at:1300};
 assert.strictEqual(activeGesture([future,earlier],1200),earlier);
});

test('gesture windows include preparation and exclude their end; unknown gestures are harmless',()=>{
 const gestures=[
  {kind:'kick',style:'pass'},{kind:'kick',style:'shot'},{kind:'kick',style:'cross'},
  {kind:'touch'},{kind:'cushion'},{kind:'thigh'},{kind:'chest'},{kind:'head'},
 ];
 for(const data of gestures){
  const gesture={...data,at:2000},timing=gestureTiming(gesture),start=gesture.at-timing.lead,end=start+timing.span;
  assert.equal(activeGesture([gesture],start-1),null);
  assert.strictEqual(activeGesture([gesture],start),gesture);
  assert.strictEqual(activeGesture([gesture],gesture.at),gesture);
  assert.strictEqual(activeGesture([gesture],end-1),gesture);
  assert.equal(activeGesture([gesture],end),null);
  const options={speed:3,phase:1.2,time:end,seed:4};
  assert.deepEqual(playerMotion({...options,gesture}),playerMotion(options),'finished actions leave the running pose intact');
 }
 assert.equal(gestureTiming({kind:'unknown'}),undefined);
 assert.equal(activeGesture([{kind:'unknown',at:2000}],2000),null);
 assert.equal(activeGesture(undefined,2000),null);
 assert.equal(activeGesture([],2000),null);
 assert.deepEqual(playerMotion({time:2000,gesture:{kind:'unknown',at:2000}}),playerMotion({time:2000}));
});

test('heading differences take the short turn across the angle boundary',()=>{
 const degrees=Math.PI/180;
 near(angleDelta(179*degrees,-179*degrees),2*degrees);
 near(angleDelta(-179*degrees,179*degrees),-2*degrees);
 near(angleDelta(.7,.7+Math.PI*4),0);
 near(angleDelta(.7+Math.PI*4,-1.2-Math.PI*6),angleDelta(.7,-1.2));
 for(let step=-12;step<=12;step++)assert.ok(Math.abs(angleDelta(.7,step*Math.PI/3))<=Math.PI);
});

test('walking, jogging and sprinting recover the heel with continuous forward-bending knees',()=>{
 const maximumFlex=[];
 for(const speed of [1,3.5,7.5]){
  let low=Infinity,high=-Infinity;
  for(let step=0;step<=96;step++){
   const phase=step/96*Math.PI*2,pose=playerMotion({speed,phase,time:1200,seed:3,turn:.8});
   finite(pose);
   for(let side=0;side<2;side++){
    assert.ok(pose.knee[side]>0&&pose.knee[side]<2.6,`backwards or folded knee at ${speed} m/s`);
    assert.ok(Math.abs(pose.hip[side])<Math.PI/2,'the thigh stays within its running range');
    low=Math.min(low,pose.knee[side]);high=Math.max(high,pose.knee[side]);
   }
   const next=playerMotion({speed,phase:phase+.001,time:1200,seed:3,turn:.8});
   for(let side=0;side<2;side++)assert.ok(Math.abs(next.hip[side]-pose.hip[side])<.02,'a cycle boundary must not snap the thigh');
  }
  assert.ok(high-low>.5,'the knee visibly bends during recovery');maximumFlex.push(high);
 }
 assert.ok(maximumFlex[2]>maximumFlex[0],'sprinting recovers the heel higher than walking');
 assert.ok(strideLength(7.5)>strideLength(.8));
 assert.equal(strideLength(20),strideLength(9.5),'stride length is bounded at high replay speeds');
});

test('touchdown, toe-off and cycle wrap never snap the pelvis or leg joints',()=>{
 for(const seed of [.2,1.7,3.6])for(const speed of [.6,1,3,6,9]){
  const style=gaitStyle(seed),{stance}=gaitCycle(speed,style);
  for(const boundary of [0,Math.PI,TAU,stance*TAU,(stance+.5)*TAU]){
   const before=playerMotion({speed,seed,style,phase:boundary-.0005}),after=playerMotion({speed,seed,style,phase:boundary+.0005});
   assert.ok(Math.abs(after.lift-before.lift)<.002,`pelvis snaps at ${speed} m/s, seed ${seed}, phase ${boundary}`);
   for(const joint of ['hip','knee','ankle'])for(let side=0;side<2;side++){
    assert.ok(Math.abs(after[joint][side]-before[joint][side])<.02,`${joint} snaps at ${speed} m/s, seed ${seed}, phase ${boundary}`);
   }
  }
 }
});

test('running includes a flight interval while walking retains an on-ground support',()=>{
 for(const seed of [.2,1.7,3.6])for(const speed of [1,6,9]){
  let airborne=0;
  for(let frame=0;frame<240;frame++){
   const pose=playerMotion({speed,seed,phase:frame/240*TAU});
   if(footAt(pose,0).y>.01&&footAt(pose,1).y>.01)airborne++;
  }
  if(speed===1)assert.equal(airborne,0,'walking must not become a two-foot jump');
  else assert.ok(airborne>24,`running at ${speed} m/s needs a visible suspension phase`);
 }
});

test('a running heel folds behind the hip, then the knee drives with the opposite arm',()=>{
 for(const seed of [.2,1.7,3.6])for(const speed of [4,8]){
  const style=gaitStyle(seed),{stance}=gaitCycle(speed,style),sample=t=>playerMotion({speed,seed,style,phase:(stance+(1-stance)*t)*TAU});
  const recovery=sample(.3),extension=sample(.9),heel=footAt(recovery,0),lead=footAt(extension,0);
  assert.ok(heel.z<-.08,'the heel must first recover behind the pelvis');
  assert.ok(heel.y>.35,'the heel should rise clearly towards the back of the thigh');
  assert.ok(recovery.knee[0]>1.6,'a running recovery folds the knee');
  assert.ok(lead.z>.1&&lead.z>heel.z,'the foot comes forward before touchdown');
  assert.ok(extension.knee[0]<recovery.knee[0]-.5,'the knee extends late in recovery');
  assert.ok(extension.hip[0]<extension.hip[1],'the leading thigh comes forward');
  assert.ok(extension.shoulder[0]>extension.shoulder[1],'the opposite arm comes forward with the leading leg');
  assert.ok(Math.abs(heel.pitch)>.25,'the toe should roll through recovery, rather than staying mechanically flat');
 }
});

test('passes and shots strike at the recorded contact and carry through with their kicking foot',()=>{
 for(const style of ['pass','shot'])for(const foot of [0,1]){
  const gesture={kind:'kick',style,at:1000,strength:style==='shot'?1:.4},options={speed:2,phase:.7,seed:2,foot,gesture};
  const contact=playerMotion({...options,time:1000}),before=playerMotion({...options,time:990}),after=playerMotion({...options,time:1010});
  finite(contact);
  assert.ok(contact.hip[foot]<before.hip[foot]&&contact.hip[foot]<after.hip[foot],'the forward swing meets the ball at contact');
  assert.ok(contact.knee[foot]<.2,'the kicking knee extends through contact');
  assert.ok(contact.knee[1-foot]>.2,'the support knee absorbs the strike');
  const end=gesture.at-gestureTiming(gesture).lead+gestureTiming(gesture).span;
  assert.deepEqual(playerMotion({...options,time:end}),playerMotion({...options,time:end,gesture:null}));
 }
 const options={speed:2,phase:.7,seed:2,foot:1,time:1200};
 const strong=playerMotion({...options,gesture:{kind:'kick',style:'shot',at:1000,strength:1}});
 const soft=playerMotion({...options,gesture:{kind:'kick',style:'shot',at:1000,strength:.3}});
 assert.ok(strong.hip[1]<soft.hip[1],'a harder shot keeps the striking leg extended longer');
 assert.ok(Math.abs(strong.twist)>Math.abs(soft.twist),'shot power carries through the torso');
 assert.ok(strong.lean>soft.lean);
});

test('the support sole stays on the grass from walking to sprinting',()=>{
 for(const seed of [.2,1.7,3.6])for(const speed of [0,.4,.6,.8,1,3,6,9]){
  const style=gaitStyle(seed),{stance}=gaitCycle(speed,style);
  for(let frame=0;frame<120;frame++){
   const phase=frame/120*TAU,pose=playerMotion({speed,phase,seed,style});
   for(let side=0;side<2;side++){
    const cycle=(frame/120+side*.5)%1,sole=footAt(pose,side).y;
    assert.ok(sole>-.004,`foot penetrates grass at ${speed} m/s, seed ${seed}, phase ${phase}: ${sole}`);
    if(cycle<stance)assert.ok(Math.abs(sole)<.004,`support floats at ${speed} m/s, seed ${seed}, phase ${phase}: ${sole}`);
   }
  }
 }
});

test('the planted foot cancels body travel instead of sliding along the ground',()=>{
 for(const seed of [.2,1.7,3.6])for(const speed of [1,3,6,9]){
  const style=gaitStyle(seed),{stance,stride}=gaitCycle(speed,style);
  for(let side=0;side<2;side++){
   let planted;
   // The sole is flat through midstance; rolling heel/toe contacts are excluded.
   for(let step=0;step<=12;step++){
    const cycle=stance*(.2+.35*step/12),turns=cycle+side*.5;
    const pose=playerMotion({speed,phase:turns*TAU,seed,style}),foot=footAt(pose,side);
    const worldZ=turns*stride+foot.z;
    planted??=worldZ;
    near(worldZ,planted,.003);
    near(foot.y,0,.004);
   }
  }
 }
});

test('a foot matches ground speed smoothly at touchdown and toe-off',()=>{
 const dt=.0001;
 for(const seed of [.2,1.7,3.6])for(const speed of [1,3,6,9]){
  const style=gaitStyle(seed),{stance,cadence}=gaitCycle(speed,style);
  for(let side=0;side<2;side++)for(const cycle of [0,stance]){
   const phase=(cycle+side*.5)*TAU;
   const worldAt=time=>{
    const pose=playerMotion({speed,seed,style,phase:phase+time*cadence*TAU,time:1200+time*1000});
    return speed*time+footAt(pose,side).z;
   };
   const contact=worldAt(0),before=(contact-worldAt(-dt))/dt,after=(worldAt(dt)-contact)/dt;
   assert.ok(Math.abs(after-before)<.04,`horizontal foot velocity jumps at ${speed} m/s, seed ${seed}, side ${side}, cycle ${cycle}: ${before} to ${after} m/s`);
   assert.ok(Math.abs(before)<.04&&Math.abs(after)<.04,'the foot must meet or leave the turf at its stationary ground speed');
  }
 }
});

test('a goalkeeper reaches a save then fully recovers without residual dive pose',()=>{
 for(const side of [-1,1])for(const height of [.2,2.2]){
  const dive={start:1000,duration:650,distance:2.4,height,side},options={speed:0,phase:0,seed:2,ready:.7,dive};
  const before=playerMotion({...options,time:999});
  assert.deepEqual(before,playerMotion({...options,time:999,dive:null}));
  const reached=playerMotion({...options,time:1650}),recovering=playerMotion({...options,time:2250});
  finite(reached);finite(recovering);
  assert.ok(reached.roll*side<0,'the keeper rolls towards the save');
  assert.ok(reached.shift*side<0,'the body leaves room for the reaching hands');
  assert.ok(reached.diveWeight>.9&&recovering.diveWeight>0&&recovering.diveWeight<reached.diveWeight);
  for(const after of [1080,1081,2000]){
   const time=dive.start+dive.duration+after;
   assert.deepEqual(playerMotion({...options,time}),playerMotion({...options,time,dive:null}),'recovery restores every channel');
  }
 }
});

test('all controls and combined goalkeeper poses are finite and deterministic at the same replay time',()=>{
 const cases=[{},
  {speed:12,phase:-12,time:4000,turn:-9,seed:5},
  {time:4000,ready:1,hold:true},
  {speed:4,phase:10,time:4000,cheer:1,seed:1},
  ...['touch','cushion','thigh','chest','head'].map(kind=>({time:4000,gesture:{kind,at:4000,jump:.5},foot:0})),
  {time:4000,ready:1,hold:true,dive:{start:3700,duration:600,distance:1.8,height:1.7,side:-1}},
 ];
 for(const options of cases){
  const before=structuredClone(options),pose=playerMotion(options);finite(pose);
  // An intervening frame must not advance an internal animation clock.
  playerMotion({...options,time:9000});
  assert.deepEqual(playerMotion(options),pose);
  assert.deepEqual(options,before,'motion sampling does not mutate its inputs');
 }
});
