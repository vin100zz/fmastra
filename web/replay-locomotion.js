// Distance-driven locomotion. During support the foot travels backwards by the
// exact distance the body covers; recovery folds the heel before driving the knee. Once the motion capture is
// loaded, the recovering leg, the arms, the trunk and the pelvis follow it; the planted foot does not.
// All dimensions are those of replay-player.js, before its drawing scale.
// The figures are drawn a tenth above life size (2.2 m) to read from the stand; the running support below is a
// real one (a third of the cycle, a quarter at full sprint), so that their legs reach the whole of each stride.
export const SCALE=1.1;
const TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const fract=x=>x-Math.floor(x);

export function gaitStyle(seed=0){
 const random=n=>fract(Math.sin(seed*127.1+n*311.7)*43758.5453);
 return {phase:random(1)*TAU,cadence:mix(.9,1.12,random(2)),arms:mix(.78,1.22,random(3)),
  elbows:mix(.87,1.13,random(4)),bounce:mix(.85,1.12,random(5)),lean:mix(.82,1.16,random(6)),
  stance:mix(-.012,.012,random(7)),asymmetry:mix(-.06,.06,random(8)),idle:random(9)*TAU};
}

// How a travel direction, in the body's own frame (0 ahead, ±π/2 to a side, π behind), shares out between the three
// ways of moving: the forward gait, the backpedal and the side step. The three weights add up to one.
export function travelShares(direction=0){
 const ahead=Math.cos(direction),across=Math.sin(direction);
 return {forward:Math.max(0,ahead)**2,back:Math.max(0,-ahead)**2,side:across*across,ahead,across};
}
// Going backwards or sideways, a player takes shorter, quicker steps than he does running ahead.
export function gaitCycle(speed,style=gaitStyle(),direction=0){
 const v=clamp(speed,0,9.5),run=smooth((v-1.65)/1.9),sprint=smooth((v-4.4)/3.5),{forward}=travelShares(direction);
 const cadence=mix(.72+v*.16,1.35+v*.095,run)*style.cadence;
 const stance=mix(.63,.345-.066*sprint,run)+style.stance;
 const stride=Math.max(.2,v)/cadence*mix(.62,1,forward);
 return {run,sprint,cadence:Math.max(.2,v)/stride,stance,stride};
}
export const strideLength=(speed,style=gaitStyle(),direction=0)=>gaitCycle(speed,style,direction).stride;

// The lowest point of the rounded sole when the toe rolls about the ankle.
export function soleHeight(pitch){
 return .063*Math.cos(pitch)+.055*Math.sin(pitch)+Math.hypot(.018*Math.cos(pitch),.159*Math.sin(pitch));
}


function curve(keys,t){
 for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
  const [a,x]=keys[i-1],[b,y]=keys[i];return mix(x,y,smooth((t-a)/(b-a)));
 }
 return keys.at(-1)[1];
}

function footPath(cycle,gait,style,side){
 const {stance,stride,run,sprint}=gait,support=cycle<stance;
 const span=stride*stance/SCALE,front=span*.46,back=front-span;
 let z,height,pitch;
 if(support){
  const t=cycle/stance;
  z=front-span*t;
  pitch=curve([[0,-.16],[.18,0],[.58,0],[1,.42+run*.22]],t);
  height=soleHeight(pitch);
 }else{
  const t=(cycle-stance)/(1-stance),asymmetry=1+style.asymmetry*(side?1:-1);
  // Match the backward ground speed at both ends of recovery: the boot
  // lifts and lands without abruptly braking its horizontal motion.
  const drift=-stride*(1-stance)/SCALE;
  z=mix(back,front,smooth(t))+drift*t*(1-t)*(1-2*t);
  pitch=curve([[0,.42+run*.22],[.22,.5+run*.25],[.55,-.22],[.82,-.2],[1,-.16]],t);
  // A folded recovery behind the hip, then a lower extended leg before contact.
  const clearance=curve([[0,0],[.25,mix(.11,.47+sprint*.17,run)],[.5,mix(.09,.33+sprint*.08,run)],[.82,.035],[1,0]],t);
  height=soleHeight(pitch)+clearance*asymmetry;
 }
 return {z,height,pitch,support};
}

// Motion capture (tools/build_motion_clips.mjs, web/models/motions.json): one gait cycle per pace, from a walk
// to a fast run, measured on the channels below and starting when the right foot touches down. Without it the
// gait is entirely procedural.
let gaits=null,loadingGaits=null;
export function setMotionLibrary(library){
 gaits=library?{samples:library.samples,clips:library.clips}:null;
 return gaits;
}
export function loadMotionLibrary(url){
 return loadingGaits??=fetch(url).then(response=>{if(!response.ok)throw new Error(`motions: ${response.status}`);return response.json();})
  .then(setMotionLibrary);
}
// The clip's phase at a point of the replay's cycle: the four foot events of the two cycles are matched, so
// that the captured support and recovery last as long as the replay's.
function clipPhase(cycle,stance,{rightOff,leftDown,leftOff}){
 const knots=[[0,0],[stance,rightOff],[.5,leftDown],[fract(.5+stance),leftOff]].sort((a,b)=>a[0]-b[0]);
 for(let i=1;i<knots.length;i++)while(knots[i][1]<=knots[i-1][1])knots[i][1]+=1;
 knots.push([1,1+knots[0][1]]);
 if(knots.at(-2)[1]>=knots.at(-1)[1])return cycle;
 for(let i=1;i<knots.length;i++)if(cycle<=knots[i][0]){
  const [a,x]=knots[i-1],[b,y]=knots[i];return fract(x+(y-x)*(cycle-a)/Math.max(1e-6,b-a));
 }
 return cycle;
}
function sample(values,u){
 const x=u*values.length,k=Math.floor(x)%values.length,f=x-Math.floor(x);
 return mix(values[k],values[(k+1)%values.length],f);
}
// The captured channels at this pace and point of the cycle, and how much they take over: fully from a walk
// to a fast run, less beyond the fastest clip, where the procedural sprint's longer strides take back.
export function capturedGait(speed,cycle,stance){
 if(!gaits||speed<.05)return null;
 const clips=gaits.clips;
 let i=0;while(i<clips.length-2&&speed>clips[i+1].speed)i++;
 const k=clamp((speed-clips[i].speed)/(clips[i+1].speed-clips[i].speed)),pair=[[clips[i],1-k],[clips[i+1],k]];
 const values={};
 for(const [clip,weight] of pair){
  if(!weight)continue;
  const u=clipPhase(cycle,stance,clip.events);
  for(const [name,curve] of Object.entries(clip.curves))values[name]=(values[name]||0)+sample(curve,u)*weight;
 }
 return {values,weight:1-.55*smooth((speed-clips.at(-1).speed-.4)/3)};
}

// The lower of two values, with a rounded corner `k` wide: never above the plain minimum.
function softMin(a,b,k){
 if(k<=0)return Math.min(a,b);
 const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k/4;
}

// The hip, knee and ankle angles that put the sole `height` up, `z` ahead of the hip and `x` out to its side, with the
// sole pitched by `pitch`. The leg bends in its own plane, which the hip then swings out by the returned roll (the
// hips turn pitch first, then roll: rotation order ZXY).
export function solveLeg(z,height,lift,pitch,x=0){
 const a=.45,b=.4,vertical=.93+(lift/SCALE)-height,down=Math.hypot(vertical,x);
 const d=clamp(Math.hypot(z,down),.14,a+b-.001);
 const knee=Math.PI-Math.acos(clamp((a*a+b*b-d*d)/(2*a*b),-1,1));
 const hip=-Math.atan2(z,down)-Math.acos(clamp((a*a+d*d-b*b)/(2*a*d),-1,1));
 return [hip,knee,pitch-hip-knee,Math.atan2(x,vertical)];
}

// `direction` is where he travels in his own frame (0 ahead): facing the ball, he backpedals or steps sideways, the
// feet then moving along his travel and the hips opening to the side. `crouch` (0 to 1) is a defender's guard, low on
// bent knees, arms out, in front of the man with the ball.
export function locomotionPose({speed=0,phase=0,time=0,seed=0,style=gaitStyle(seed),acceleration=0,turn=0,direction=0,crouch=0}={}){
 const gait=gaitCycle(speed,style,direction),{run,sprint,stance}=gait,moving=smooth((speed-.08)/.9);
 const travel=travelShares(direction),{forward,back,side:sideways,ahead,across}=travel;
 const cycles=[fract(phase/TAU),fract(phase/TAU+.5)],feet=cycles.map((cycle,i)=>{
  const foot=footPath(cycle,gait,style,i),clearance=foot.height-soleHeight(foot.pitch);
  // Backwards, he stays on the balls of his feet; sideways, the soles stay flat and the feet low.
  const pitch=foot.pitch*Math.max(0,ahead)+(.16+.3*Math.abs(foot.pitch))*Math.max(0,-ahead);
  const lifted=clearance*(forward+.7*back+.5*sideways);
  // Blend contact targets, rather than joint angles: a slow first step must
  // still land on the grass while the body rises out of its standing pose.
  const along=mix(.006,foot.z,moving);
  foot.z=along*ahead;foot.x=along*across+(i?1:-1)*.035*sideways*moving;foot.pitch=pitch*moving;
  foot.height=soleHeight(foot.pitch)+lifted*moving;
  return foot;
 });
 const p={hip:[0,0],knee:[0,0],ankle:[0,0],hipYaw:[0,0],hipRoll:[0,0],shoulder:[0,0],spread:[.12,.12],elbow:[-.18,-.18],
  lift:0,lean:0,roll:0,twist:0,spineRoll:0,headPitch:0,headYaw:0,sway:0,shift:0,diveWeight:0};
 // The capture holds forward gaits only: it fades out as he turns to backpedal or to step sideways.
 const captured=capturedGait(speed,cycles[0],stance),take=captured?captured.weight*moving*forward:0,c=captured?.values;
 const breath=Math.sin(time*(.0023+seed*.00007)+style.idle),weight=Math.sin(time*.0007+style.idle);
 const half=fract(phase/Math.PI)*.5;
 // A compressed support followed by a short flight; walking retains double support.
 const flight=stance<.5&&half>=stance?Math.sin(Math.PI*(half-stance)/(.5-stance)):0;
 let lift=mix(-.008+breath*.003,mix(-.014,-.055,run)+flight*(.065+.055*sprint)*style.bounce,moving);
 if(take)lift=mix(lift,c.lift*SCALE*style.bounce,take);
 // Either extended leg limits hip height, including the end of recovery.
 // Preparing this before touchdown avoids snapping the pelvis onto the ground.
 for(const foot of feet){
  const reach=Math.sqrt(Math.max(.01,.849**2-foot.z**2-foot.x**2));
  lift=softMin(lift,SCALE*(reach-.93+foot.height),.03*take);
 }
 lift-=crouch*.1*SCALE;
 p.lift=lift;
 p.lean=(.018+run*.13+sprint*.09)*style.lean*moving*(forward+.35*back+.6*sideways);
 p.spineRoll=-Math.sin(phase)*.035*run*moving;
 p.twist=Math.cos(phase+.15)*(.025+.065*run)*moving;
 p.headPitch=-p.lean*.4;
 if(take){
  // The captured trunk: lean, side tilt and counter-rotation over the pelvis, the pelvis's own tilt, the head.
  p.lean=mix(p.lean,c.lean*style.lean,take);p.spineRoll=mix(p.spineRoll,c.spineRoll,take);
  p.twist=mix(p.twist,c.twist,take);p.roll=c.roll*.6*take;p.headPitch=mix(p.headPitch,c.headPitch,take);
 }
 p.lean+=clamp(acceleration,-6,6)*.017*moving*ahead;p.spineRoll+=clamp(-turn*.055,-.16,.16)*moving;
 // Into a bend at pace, the whole body leans towards its centre, as far as the grip of the studs allows.
 p.roll+=clamp(-Math.atan(speed*turn/9.81)*.55,-.3,.3)*moving*forward;
 if(crouch){p.lean+=crouch*.24;p.headPitch-=crouch*.18;}
 p.sway=weight*.007*(1-moving);
 p.headYaw=Math.sin(time*.0009+style.idle)*.075*(1-moving);
 for(let side=0;side<2;side++){
  const foot=feet[side],[hip,knee,ankle,roll]=solveLeg(foot.z,foot.height,lift,foot.pitch,foot.x);
  p.hip[side]=hip;p.knee[side]=knee;p.ankle[side]=ankle;p.hipRoll[side]=roll;
  p.hipYaw[side]=Math.sin(phase)*.025*run*moving;
  // Arm opposition follows the thigh, including the knee drive during recovery.
  const arm=clamp(-(hip+.24)*mix(.55,.95,run),-.9,.95)*style.arms;
  p.shoulder[side]=mix(-.05+(side?1:-1)*.035+breath*.014,arm,moving);
  p.elbow[side]=mix(-.15-(side?0:.07),-(.3+run*.87+sprint*.12+Math.max(0,-arm)*.2)*style.elbows,moving);
  p.spread[side]=.09+run*.055+(side?1:-1)*style.asymmetry*.3+.14*(1-forward)*moving;
  if(!take)continue;
  // The captured recovery leg, between take-off and touchdown only: the planted foot stays with the inverse
  // kinematics above, and the blend fades out at both ends so that each contact lands where it is solved.
  const cycle=cycles[side];
  if(cycle>=stance){
   const t=(cycle-stance)/(1-stance);
   const swing=take*smooth(t/.35)*smooth((1-t)/.25);
   let h=mix(hip,c[`hip${side}`],swing),k=mix(knee,c[`knee${side}`],swing),a=mix(ankle,c[`ankle${side}`],swing);
   // A captured foot can skim the grass at the replay's pelvis height. Where it would graze it, the same leg
   // solver lifts the ankle by what is missing, the sole keeping its pitch: the solution is unique, knee forward,
   // so the correction is continuous; it keeps 6 mm under the boot, or the procedural clearance where lower.
   const ankleDown=.45*Math.cos(h)+.4*Math.cos(h+k),pitch=h+k+a;
   const height=lift/SCALE+.93-ankleDown;
   const floor=Math.min(.006,lift/SCALE+.93-.45*Math.cos(hip)-.4*Math.cos(hip+knee)-soleHeight(hip+knee+ankle));
   if(height-soleHeight(pitch)<floor)[h,k,a]=solveLeg(-.45*Math.sin(h)-.4*Math.sin(h+k),floor+soleHeight(pitch),lift,pitch);   p.hip[side]=h;p.knee[side]=k;p.ankle[side]=a;
  }
  p.hipYaw[side]=mix(p.hipYaw[side],c.hipYaw,take);
  p.shoulder[side]=mix(p.shoulder[side],c[`shoulder${side}`]*style.arms,take);
  p.elbow[side]=mix(p.elbow[side],c[`elbow${side}`]*style.elbows,take);
  // Never inside the hips: the captured arms hang from a narrower trunk than the model's.
  p.spread[side]=mix(p.spread[side],Math.max(.08,c[`spread${side}`]+(side?1:-1)*style.asymmetry*.3),take);
 }
 // On guard, the arms come out from his sides, for balance, whatever the gait swings.
 if(crouch)for(let side=0;side<2;side++){
  p.shoulder[side]=mix(p.shoulder[side],-.3,crouch);p.elbow[side]=mix(p.elbow[side],-.75,crouch);p.spread[side]=mix(p.spread[side],.42,crouch);
 }
 return p;
}
