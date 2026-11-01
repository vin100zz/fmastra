// The captured gestures (strikes, tricks, transitions, joy) and the stride timed on the next touch.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeGesture,gestureTiming,playerMotion,strideCue,strideStretch,transitionLength} from '../../web/replay-motion.js';
import {capturedGesture,gaitStyle,gestureClip,setMotionLibrary,strideLength} from '../../web/replay-locomotion.js';

const library=JSON.parse(readFileSync(new URL('../../web/models/motions.json',import.meta.url),'utf8'));
setMotionLibrary(library);
const TAU=Math.PI*2;
const finite=pose=>{for(const value of Object.values(pose))for(const number of [value].flat())assert.ok(Number.isFinite(number),JSON.stringify(pose));};

test('the library holds the captured gestures, each timed on its contact',()=>{
 assert.deepEqual(Object.keys(library.gestures).sort(),['cut','feint','joy','pass','shot','start','stop']);
 for(const [name,gesture] of Object.entries(library.gestures)){
  const clip=gestureClip(name);
  assert.ok(clip.length>.5&&clip.contact>=0&&clip.contact<clip.length,name);
  for(const curve of Object.values(gesture.curves)){assert.equal(curve.length,gesture.curves.lean.length);assert.ok(curve.every(Number.isFinite));}
 }
 for(const name of ['shot','pass'])assert.ok(gestureClip(name).plant>.05&&gestureClip(name).plant<.4,`${name}: the support foot comes down before the contact`);
});

test('a gesture captured on the right foot is mirrored for the left',()=>{
 const right=capturedGesture('shot',.7),left=capturedGesture('shot',.7,true);
 assert.equal(left.hip0,right.hip1);assert.equal(left.knee1,right.knee0);
 assert.equal(left.hipRoll0,-right.hipRoll1);assert.equal(left.hipYaw1,-right.hipYaw0);
 assert.equal(left.yaw,-right.yaw);assert.equal(left.roll,-right.roll);assert.equal(left.twist,-right.twist);
 assert.equal(left.lean,right.lean);
});

test('a kick plays the captured strike, a shot with a longer swing than a soft pass',()=>{
 const shot={kind:'kick',style:'shot',strength:1,at:1000},pass={kind:'kick',style:'pass',strength:.4,at:1000};
 assert.equal(gestureTiming(shot).captured,'shot');assert.equal(gestureTiming(pass).captured,'pass');
 for(const gesture of [shot,pass])for(const foot of [0,1])for(let time=600;time<=1700;time+=50){
  finite(playerMotion({speed:3,phase:1,time,seed:1,gesture,foot}));
 }
 // Before the contact the kicking leg is drawn back behind him, its knee folded: never out to the side.
 const back=playerMotion({speed:3,phase:1,time:820,seed:1,gesture:shot,foot:0});
 assert.ok(back.hip[0]>.2&&back.knee[0]>.2,'drawn back');
 assert.ok(Math.abs(back.hipYaw[0])<.6,'the thigh not turned out with the knee folded');
 const end=1000-gestureTiming(shot).lead+gestureTiming(shot).span;
 assert.equal(activeGesture([shot],end),null);
 setMotionLibrary(null);
 try{assert.equal(gestureTiming(shot).captured,undefined,'without the capture, the procedural kick');finite(playerMotion({speed:3,phase:1,time:1000,gesture:shot}));}
 finally{setMotionLibrary(library);}
});

test('ahead of a touch, the stride is lengthened or shortened to bring the right foot through on time',()=>{
 const style=gaitStyle(2);
 for(const [gesture,foot] of [[{kind:'kick',style:'shot',strength:1,at:2000},0],[{kind:'kick',style:'pass',strength:.5,at:2000},1],[{kind:'touch',at:2000},0]]){
  const cue=strideCue(gesture,foot);
  if(gesture.kind==='kick')assert.ok(Math.abs(cue.at-(2000-gestureClip(gestureTiming(gesture).captured).plant*1000))<1e-9,'timed on the plant of the other foot');
  for(const speed of [3,5,7])for(let start=0;start<12;start++){
   let phase=start/12*TAU,stretch=1;
   // With the notice a pass in flight gives him.
   for(let t=cue.at-1300;t<cue.at;t+=16){
    if(cue.at-t>90){const wanted=strideStretch(phase,cue,speed*(cue.at-t)/1000,strideLength(speed,style));assert.ok(wanted>=.72&&wanted<=1.4);stretch+=(wanted-stretch)*(1-Math.exp(-16/110));}
    phase+=speed*16/1000/strideLength(speed,style,0,stretch)*TAU;
   }
   const miss=Math.abs(Math.atan2(Math.sin(phase-cue.phase),Math.cos(phase-cue.phase)));
   assert.ok(miss<.3,`${gesture.kind} ${foot} at ${speed} m/s from ${start}/12: ${miss.toFixed(2)} rad off`);
  }
 }
 assert.equal(strideCue({kind:'tackle',at:2000},0),null);
});

test('a trick takes the man on to either side, and leaves the plain stride once it is done',()=>{
 for(const trick of ['cut','feint','stepover']){
  const timing=gestureTiming({kind:'trick',trick,at:1000});
  assert.equal(timing.captured,trick==='stepover'?undefined:trick);
  const sides=[1,-1].map(side=>{
   const gesture={kind:'trick',trick,side,at:1000};
   for(let time=1000-timing.lead;time<1000-timing.lead+timing.span;time+=40)finite(playerMotion({speed:4,phase:2,time,seed:3,gesture}));
   return playerMotion({speed:4,phase:2,time:1000-timing.lead*.3,seed:3,gesture});
  });
  assert.ok(Math.abs(sides[0].roll-sides[1].roll)>.02||Math.abs(sides[0].twist-sides[1].twist)>.02,`${trick}: the two sides differ`);
  const gesture={kind:'trick',trick,side:1,at:1000},end=1000-timing.lead+timing.span;
  assert.deepEqual(playerMotion({speed:4,phase:2,time:end,seed:3,gesture:activeGesture([gesture],end)}),playerMotion({speed:4,phase:2,time:end,seed:3}));
 }
});

test('a hard stop, a burst and a cut play their capture, then hand back to the stride',()=>{
 for(const [name,speed] of [['stop',3],['start',1.5],['cut',4.5]]){
  const length=transitionLength(name);
  assert.ok(length>500,name);
  const plain=playerMotion({speed,phase:1,time:500,seed:2});
  for(let elapsed=0;elapsed<=length;elapsed+=40)finite(playerMotion({speed,phase:1,time:500,seed:2,transition:{name,elapsed,side:-1}}));
  const middle=playerMotion({speed,phase:1,time:500,seed:2,transition:{name,elapsed:length/2,side:1}});
  assert.ok(Math.abs(middle.lean-plain.lean)+Math.abs(middle.shoulder[0]-plain.shoulder[0])>.02,`${name} changes the trunk or the arms`);
  assert.deepEqual(playerMotion({speed,phase:1,time:500,seed:2,transition:{name,elapsed:length,side:1}}),plain,`${name} ends on the plain stride`);
 }
});

test('celebrating players throw their arms up as captured, each at his own point of it',()=>{
 const raised=seed=>Math.min(...Array.from({length:40},(_,k)=>playerMotion({time:k*60,seed,mood:{kind:'cheer',weight:1}}).shoulder[1]));
 assert.ok(raised(1)<-1.4&&raised(4)<-1.4,'an arm goes up above the shoulder');
 const a=playerMotion({time:900,seed:1,mood:{kind:'cheer',weight:1}}),b=playerMotion({time:900,seed:4,mood:{kind:'cheer',weight:1}});
 assert.notDeepEqual(a.shoulder,b.shoulder,'not in step');
});
