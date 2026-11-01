// The motion-captured gait: the same contact guarantees as the procedural one, with the capture loaded.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gaitCycle,gaitStyle,playerMotion,soleHeight} from '../../web/replay-motion.js';
import {SCALE,capturedGait,locomotionPose,setMotionLibrary} from '../../web/replay-locomotion.js';

const library=JSON.parse(readFileSync(new URL('../../web/models/motions.json',import.meta.url),'utf8'));
setMotionLibrary(library);
const TAU=Math.PI*2;
// Forward kinematics of the .45 m thigh, .40 m shin and rolling sole.
const footAt=(pose,side)=>{
 const hip=pose.hip[side],shin=hip+pose.knee[side],pitch=shin+pose.ankle[side];
 return {z:SCALE*(-.45*Math.sin(hip)-.4*Math.sin(shin)),y:pose.lift+SCALE*(.93-.45*Math.cos(hip)-.4*Math.cos(shin)-soleHeight(pitch))};
};
const SPEEDS=[.6,1.4,3,4.5,6,9];

test('the library holds one cycle per pace, slowest first, each starting on a right touchdown',()=>{
 assert.deepEqual(library.clips.map(clip=>clip.name),['walk','jog','run','fast']);
 for(let i=1;i<library.clips.length;i++)assert.ok(library.clips[i].speed>library.clips[i-1].speed);
 for(const {curves,events} of library.clips){
  for(const values of Object.values(curves)){assert.equal(values.length,library.samples);assert.ok(values.every(Number.isFinite));}
  assert.ok(events.rightOff>0&&events.rightOff<1&&events.leftDown>.4&&events.leftDown<.6);
 }
});

test('the capture drives the recovering leg, the arms and the trunk',()=>{
 const style=gaitStyle(1),{stance}=gaitCycle(3.5,style),phase=(stance+(1-stance)*.5)*TAU;
 setMotionLibrary(null);const procedural=playerMotion({speed:3.5,phase,seed:1,style});
 setMotionLibrary(library);const captured=playerMotion({speed:3.5,phase,seed:1,style});
 assert.ok(capturedGait(3.5,.5,stance).weight>.99);
 for(const key of ['knee','elbow'])assert.ok(Math.abs(captured[key][0]-procedural[key][0])>.02,`${key} still procedural`);
 assert.notEqual(captured.lean,procedural.lean);
});

test('the support sole stays on the grass and the recovering foot above it',()=>{
 for(const seed of [.2,1.7,3.6])for(const speed of SPEEDS){
  const style=gaitStyle(seed),{stance}=gaitCycle(speed,style);
  for(let frame=0;frame<240;frame++){
   const pose=playerMotion({speed,phase:frame/240*TAU,seed,style});
   for(let side=0;side<2;side++){
    const cycle=(frame/240+side*.5)%1,sole=footAt(pose,side).y;
    assert.ok(sole>-.004,`foot penetrates grass at ${speed} m/s, seed ${seed}, frame ${frame}: ${sole}`);
    if(cycle<stance)assert.ok(Math.abs(sole)<.004,`support floats at ${speed} m/s, seed ${seed}, frame ${frame}: ${sole}`);
   }
  }
 }
});

test('the planted foot cancels body travel instead of sliding',()=>{
 for(const seed of [.2,1.7,3.6])for(const speed of [1.4,3,6,9]){
  const style=gaitStyle(seed),{stance,stride}=gaitCycle(speed,style);
  for(let side=0;side<2;side++){
   let planted;
   for(let step=0;step<=12;step++){
    const turns=stance*(.2+.35*step/12)+side*.5,foot=footAt(playerMotion({speed,phase:turns*TAU,seed,style}),side);
    planted??=turns*stride+foot.z;
    assert.ok(Math.abs(turns*stride+foot.z-planted)<.003,`support slides at ${speed} m/s`);
   }
  }
 }
});

test('the capture adds no jump anywhere in the cycle: blends, events and loop seams are continuous',()=>{
 // Compared with the procedural gait, whose straight leg already folds fast at take-off: no step of the captured
 // gait may change a channel much more than the procedural one does around that point of the cycle.
 const steps=1440,around=6;
 const channels=pose=>[...['hip','knee','ankle','shoulder','elbow','spread'].flatMap(key=>[0,1].map(side=>[`${key}[${side}]`,pose[key][side],.02])),
  ...['lean','twist','roll','spineRoll','headPitch'].map(key=>[key,pose[key],.012]),['lift',pose.lift,.003]];
 const jumps=(speed,seed,captured)=>{
  setMotionLibrary(captured?library:null);
  const style=gaitStyle(seed),poses=Array.from({length:steps+1},(_,step)=>channels(locomotionPose({speed,phase:step/steps*TAU,seed,style})));
  return poses.slice(1).map((pose,step)=>pose.map(([name,value,tolerance],k)=>[name,Math.abs(value-poses[step][k][1]),tolerance]));
 };
 try{
  for(const seed of [.2,1.7,3.6])for(const speed of SPEEDS){
   const procedural=jumps(speed,seed,false),captured=jumps(speed,seed,true);
   captured.forEach((step,index)=>step.forEach(([name,jump,tolerance],k)=>{
    let local=0;for(let j=Math.max(0,index-around);j<=Math.min(steps-1,index+around);j++)local=Math.max(local,procedural[j][k][1]);
    assert.ok(jump<local+tolerance,`${name} jumps at ${speed} m/s, seed ${seed}, step ${index+1}: ${jump}`);
   }));
  }
 }finally{setMotionLibrary(library);}
});

test('running arms swing against the legs',()=>{
 for(const speed of [3,4.5]){
  const style=gaitStyle(1),{stance}=gaitCycle(speed,style);
  // Late in the right leg's recovery its thigh leads; the left arm comes forward with it.
  const pose=playerMotion({speed,seed:1,style,phase:(stance+(1-stance)*.85)*TAU});
  assert.ok(pose.hip[0]<pose.hip[1],'the recovering thigh leads');
  assert.ok(pose.shoulder[1]<pose.shoulder[0],'the opposite arm comes forward');
 }
});
