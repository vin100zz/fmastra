// Procedural poses in replay time. No renderer or wall clock: pausing and changing
// playback speed preserve the contact between an animation and the match ball.
import {SCALE,capturedGesture,gestureClip,locomotionPose,soleHeight} from './replay-locomotion.js';
export {gaitCycle,gaitStyle,soleHeight,strideLength} from './replay-locomotion.js';
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

// The captured strike a kick plays: the full swing of a shot (also a cross or a long ball), or the shorter one of a pass;
// the last stride into the ball and the follow-through around the contact, in ms.
export const strikeOf=gesture=>gesture.style==='shot'||gesture.style==='cross'||clamp(gesture.strength??.7)>=.8?'shot':'pass';
const STRIKE={shot:{lead:480,follow:620},pass:{lead:400,follow:500}};
export function gestureTiming(gesture){
 if(gesture?.kind==='kick'){
  const name=strikeOf(gesture),clip=gestureClip(name);
  if(clip){const {lead,follow}=STRIKE[name];return {lead:Math.min(lead,clip.contact*1000),span:Math.min(lead,clip.contact*1000)+Math.min(follow,(clip.length-clip.contact)*1000),captured:name};}
  return gesture.style==='shot'?{lead:240,span:800}:gesture.style==='cross'?{lead:210,span:700}:{lead:170,span:560};
 }
 if(gesture?.kind==='trick'){
  const trick=TRICKS[gesture.trick]??TRICKS.cut,clip=trick.clip&&gestureClip(trick.clip);
  if(clip){const lead=Math.min(trick.lead,clip.contact*1000);return {lead,span:lead+Math.min(trick.follow,(clip.length-clip.contact)*1000),captured:trick.clip};}
  return {lead:TRICKS.stepover.lead,span:TRICKS.stepover.lead+TRICKS.stepover.follow};
 }
 return {touch:{lead:90,span:330},cushion:{lead:130,span:440},thigh:{lead:230,span:560},chest:{lead:260,span:660},head:{lead:300,span:640},
  // Challenges: a standing tackle, a sliding one (down, the slide, back on his feet) and a fall after a foul.
  tackle:{lead:260,span:780},slide:{lead:420,span:1700},fall:{lead:60,span:2000},
  // With the hands: a keeper catching a high ball, his overarm throw, and the two-handed throw-in.
  catch:{lead:320,span:760},throw:{lead:520,span:960},throwin:{lead:560,span:900}}[gesture?.kind];
}
// The kinds of gesture that take the whole body to the ground or into a lunge, rather than meet the ball.
const CHALLENGES=new Set(['tackle','slide','fall']);

// The lift that keeps the sole of `side` on the grass for these leg angles.
const standing=(p,side)=>SCALE*(.45*Math.cos(p.hip[side])+.4*Math.cos(p.hip[side]+p.knee[side])+soleHeight(p.hip[side]+p.knee[side]+p.ankle[side])-.93);

// The lowest lift at which neither sole goes into the grass, the thighs swung out by their roll.
const grounded=p=>SCALE*Math.max(...[0,1].map(side=>(.45*Math.cos(p.hip[side])+.4*Math.cos(p.hip[side]+p.knee[side]))*Math.cos(p.hipRoll[side])
 +soleHeight(p.hip[side]+p.knee[side]+p.ankle[side])-.93));

// A challenge, `elapsed` ms from its contact. `foot` is the leg that goes for the ball (a fall: the side he falls to).
function challenge(p,gesture,elapsed,foot,blend){
 const out=foot?1:-1,other=1-foot;
 if(gesture.kind==='tackle'){
  // A lunge: the leg thrown out at the ball, the inside of the boot towards it, the other knee bent low under him.
  const weight=elapsed<0?smooth((elapsed+260)/260):1-smooth((elapsed-200)/320);
  const lunge={hip:[0,0],knee:[0,0],ankle:[0,0]};
  lunge.hip[foot]=-1.05;lunge.knee[foot]=.12;lunge.ankle[foot]=.3;
  lunge.hip[other]=-.62;lunge.knee[other]=1.3;lunge.ankle[other]=-.55;
  for(const joint of ['hip','knee','ankle'])blend(p[joint],side=>lunge[joint][side],weight);
  p.hipYaw[foot]=mix(p.hipYaw[foot],out*.75,weight);p.hipRoll[foot]=mix(p.hipRoll[foot],out*.28,weight);p.hipRoll[other]=mix(p.hipRoll[other],0,weight);
  p.lift=Math.max(mix(p.lift,standing(p,other),weight),grounded(p));
  p.lean=mix(p.lean,.34,weight);p.roll=mix(p.roll,-out*.12,weight);p.twist=mix(p.twist,out*.2,weight);
  blend(p.spread,.55,weight);blend(p.shoulder,side=>side===foot?-.35:.25,weight);blend(p.elbow,-.5,weight);
  return;
 }
 // On the ground: rolled onto the hip, the leg out at the ball (a slide), or curled up (a fall), then up again.
 const slide=gesture.kind==='slide';
 const down=slide?smooth((elapsed+420)/300)*(1-smooth((elapsed-880)/400)):smooth((elapsed-140)/460)*(1-smooth((elapsed-1380)/560));
 const support=slide?other:foot,toward=support?1:-1;
 if(slide){
  p.hip[foot]=mix(p.hip[foot],-1.32,down);p.knee[foot]=mix(p.knee[foot],.1,down);p.ankle[foot]=mix(p.ankle[foot],.32,down);
  p.hip[other]=mix(p.hip[other],-.55,down);p.knee[other]=mix(p.knee[other],1.5,down);p.ankle[other]=mix(p.ankle[other],-.3,down);
  p.lean=mix(p.lean,-.32,down);
  // The arm on the ground side takes his weight; the other comes across for balance.
  p.shoulder[support]=mix(p.shoulder[support],-.25,down);p.spread[support]=mix(p.spread[support],1.15,down);p.elbow[support]=mix(p.elbow[support],-.12,down);
  p.shoulder[foot]=mix(p.shoulder[foot],-.85,down);p.spread[foot]=mix(p.spread[foot],.35,down);p.elbow[foot]=mix(p.elbow[foot],-.6,down);
 }else{
  // Tripped: he stumbles forward, arms out, goes down on his side and stays there a moment before getting up.
  const stumble=smooth((elapsed+60)/220)*(1-down);
  p.lean=mix(p.lean,.55,stumble);blend(p.shoulder,-1.1,stumble);blend(p.spread,.5,stumble);
  blend(p.hip,side=>side===foot?-.95:-.5,down);blend(p.knee,side=>side===foot?1.35:.9,down);blend(p.ankle,-.2,down);
  p.lean=mix(p.lean,.35,down);blend(p.shoulder,-1.5,down);blend(p.elbow,-1.25,down);blend(p.spread,.3,down);
  p.headPitch=mix(p.headPitch,.25,down);
 }
 blend(p.hipRoll,0,down);blend(p.hipYaw,0,down);
 p.roll=mix(p.roll,toward*1.22,down);p.twist=mix(p.twist,0,down);
 p.lift=mix(p.lift,slide?-.1:-.06,down);
 p.diveWeight=Math.max(p.diveWeight,down*.6);
}

// The stride's appointment with a coming touch, played with `foot`: the phase (radians) his stride should be at, and when
// (ms of replay). Ahead of a captured strike the other foot comes down beside the ball as the capture has it; for any
// other touch the foot that plays it is reaching forward, about to come down, as the ball arrives. Null for a gesture
// that does not meet the ball with a foot.
export function strideCue(gesture,foot){
 if(!gesture||!['kick','touch','cushion'].includes(gesture.kind))return null;
 const timing=gestureTiming(gesture),clip=timing?.captured&&gestureClip(timing.captured);
 if(clip?.plant!=null)return {at:gesture.at-clip.plant*1000,phase:Math.PI*(1-foot)};
 return {at:gesture.at,phase:Math.PI*2*fract(.92-.5*foot)};
}
const fract=x=>x-Math.floor(x);
// The stretch of his strides (see gaitCycle) that brings his stride to `cue.phase` at `cue.at`, over the `distance` (m)
// he covers meanwhile at strides of `stride` (m): up to 28 % shorter or 40 % longer, the nearest to his own.
export function strideStretch(phase,cue,distance,stride){
 const natural=distance/stride,offset=fract((cue.phase-phase)/(Math.PI*2));
 let best=1,score=Infinity;
 for(let turns=Math.max(0,Math.floor(natural)-1);turns<=Math.floor(natural)+1;turns++){
  const cycles=turns+offset;if(cycles<=.05)continue;
  const stretch=clamp(natural/cycles,.72,1.4),miss=Math.abs(Math.log(natural/cycles))*(stretch===natural/cycles?1:4);
  if(miss<score){score=miss;best=stretch;}
 }
 return best;
}

// Keep an outgoing touch through its follow-through, even when the receiver's
// next action has already been queued. More recent contacts take precedence.
export function activeGesture(gestures,time){
 let selected=null;
 for(const gesture of gestures||[]){
  const timing=gestureTiming(gesture);
  if(!timing||time<gesture.at-timing.lead||time>=gesture.at-timing.lead+timing.span)continue;
  if(!selected||gesture.at<=time&&gesture.at>selected.at||selected.at>time&&gesture.at<selected.at)selected=gesture;
 }
 return selected;
}

// `mood` ({kind, weight}) is how he reacts to what just happened, over whatever he is doing: see `react`.
export function playerMotion({speed=0,phase=0,time=0,seed=0,style,acceleration=0,ready=0,hold=false,gesture=null,foot=1,turn=0,cheer=0,dive=null,direction=0,crouch=0,mood=null,stretch=1,transition=null}={}){
 const p=locomotionPose({speed,phase,time,seed,style,acceleration,turn,direction,crouch,stretch});
 if(transition)transit(p,transition);
 const blend=(list,value,k)=>{for(let side=0;side<2;side++)list[side]=mix(list[side],typeof value==='function'?value(side):value,k);};
 if(ready){
  // Keep taking steps while tracking a shot. The set stance folds the legs
  // only as the goalkeeper stops, and its pelvis follows the support sole.
  const set=ready*(1-smooth((speed-.1)/.8));
  const support=()=>Math.min(...p.hip.map((hip,i)=>.93-.45*Math.cos(hip)-.4*Math.cos(hip+p.knee[i])-soleHeight(hip+p.knee[i]+p.ankle[i])));
  const ground=support();
  blend(p.hip,-.42,set);blend(p.knee,.84,set);blend(p.ankle,-.42,set);blend(p.hipRoll,0,set);
  p.lift+=(ground-support())*SCALE;
  blend(p.shoulder,-.38,ready);blend(p.elbow,-1.1,ready);blend(p.spread,.48,ready);
  p.lean=mix(p.lean,.16,ready);
 }
 if(gesture){
  const timing=gestureTiming(gesture);
  if(timing){
   const elapsed=time-gesture.at,g=(elapsed+timing.lead)/timing.span;
   if(g>=0&&g<1&&CHALLENGES.has(gesture.kind))challenge(p,gesture,elapsed,foot,blend);
   else if(g>=0&&g<1){
    const before=elapsed<0,wind=smooth((elapsed+timing.lead)/timing.lead),follow=clamp(elapsed/(timing.span-timing.lead));
    const envelope=before?smooth(wind*4):1-smooth((follow-.38)/.62);
    // A running touch is brief, but still reaches its full contact pose. A
    // permanently weak overlay can leave a recovering heel far from the ball.
    const touch=gesture.kind==='touch'&&speed>2;
    const weight=envelope*(touch?(before?wind:1-smooth(follow/.7)):1),other=1-foot,sign=foot?1:-1;
    if(gesture.kind==='trick')trick(p,gesture,timing,elapsed,blend);
    else if(timing.captured)strike(p,gesture,timing,elapsed,foot,speed,blend);
    else if(['kick','touch','cushion'].includes(gesture.kind)){
     const kick=gesture.kind==='kick',control=gesture.kind==='cushion',power=kick?clamp(gesture.strength??.7):control?.18:.27;
     const backswing=kick?.35+power*.6:.12,contact=control?-.52:-.72;
     const swing=before?mix(backswing,contact,wind):mix(contact,control?-.12:-.12-power*.55,Math.sin(follow*Math.PI/2));
     p.hip[foot]=mix(p.hip[foot],swing,weight);blend(p.hipRoll,0,weight);
     p.knee[foot]=mix(p.knee[foot],before?mix(.9+power*.5,.12,wind):.12+follow*.55,weight);
     p.ankle[foot]=mix(p.ankle[foot],control?.12:kick?.28:-.12,weight);
     if(gesture.kind!=='touch'||speed<2){p.hip[other]=mix(p.hip[other],-.16,weight);p.knee[other]=mix(p.knee[other],.32,weight);p.ankle[other]=mix(p.ankle[other],-.16,weight);}
     blend(p.spread,side=>side===foot?.2+power*.3:.32+power*.55,weight);
     blend(p.shoulder,side=>side===foot?.35*power:-.55*power,weight);blend(p.elbow,-.48,weight);
     p.twist=mix(p.twist,sign*(before?mix(-.32,.16,wind):mix(.16,.42,follow))*power,weight);
     p.lean=mix(p.lean,control?.05:before?mix(-.1,.12,wind):.12+power*.16,weight);
     p.roll+=sign*.055*weight;p.lift=mix(p.lift,-.025,weight);
     if(kick)technique(p,gesture,foot,sign,weight,before,wind,blend);
    }else{
     const pulse=Math.sin(Math.PI*g),contactPulse=before?wind:1-smooth(follow);
     if(gesture.kind==='thigh'){
      p.hip[foot]=mix(p.hip[foot],-1.3,contactPulse);p.knee[foot]=mix(p.knee[foot],1.6,contactPulse);
      blend(p.spread,.48,pulse);p.lean=mix(p.lean,-.12,pulse);
     }else if(gesture.kind==='chest'){
      p.lean=mix(p.lean,before?-.32:.18,pulse);blend(p.spread,.8,pulse);blend(p.shoulder,-.35,pulse);blend(p.elbow,-.8,pulse);
     }else if(gesture.kind==='head'){
      const jump=gesture.jump||0;
      p.lift+=jump*SCALE*contactPulse;
      blend(p.hip,jump?-.38:-.12,pulse);blend(p.knee,jump?.85:.3,pulse);
      blend(p.shoulder,-.9,pulse);blend(p.spread,.65,pulse);blend(p.elbow,-.65,pulse);
      p.lean=mix(p.lean,before?mix(-.22,.12,wind):.28,pulse);p.headPitch=mix(-.15,.32,wind)*pulse;
     }else if(gesture.kind==='catch'){
      // Up to it with both hands above his head, the knee on the far side raised to protect himself.
      const jump=gesture.jump??.3;
      p.lift+=jump*SCALE*contactPulse;
      blend(p.shoulder,-2.75,pulse);blend(p.elbow,-.35,pulse);blend(p.spread,.2,pulse);
      p.hip[foot]=mix(p.hip[foot],-1.1,contactPulse);p.knee[foot]=mix(p.knee[foot],1.5,contactPulse);
      p.lean=mix(p.lean,-.1,pulse);p.headPitch=mix(p.headPitch,-.35,pulse);
     }else if(gesture.kind==='throw'){
      // The arm on his throwing side goes back low, over the top and through, as he steps into it.
      const arm=before?mix(.9,-2.5,smooth(wind*wind)):mix(-2.5,-1.1,smooth(follow*1.6));
      const weight=before?smooth(wind*2.5):1-smooth((follow-.35)/.65);
      p.shoulder[foot]=mix(p.shoulder[foot],arm,weight);p.elbow[foot]=mix(p.elbow[foot],before?-.5:-.15,weight);p.spread[foot]=mix(p.spread[foot],.25,weight);
      p.shoulder[1-foot]=mix(p.shoulder[1-foot],-.9,weight);p.spread[1-foot]=mix(p.spread[1-foot],.45,weight);
      p.twist=mix(p.twist,sign*(before?-.45:.35),weight);p.lean=mix(p.lean,before?-.2:.3,weight);
     }else if(gesture.kind==='throwin'){
      // Both hands behind the head, then over it and through; both feet stay on the ground.
      const weight=before?smooth(wind*2):1-smooth((follow-.3)/.7);
      blend(p.shoulder,before?mix(-2.2,-3.05,wind):mix(-2.6,-1.2,smooth(follow*1.5)),weight);
      blend(p.elbow,before?mix(-1,-1.7,wind):-.15,weight);blend(p.spread,.16,weight);
      p.lean=mix(p.lean,before?mix(0,-.3,wind):.32,weight);
     }
    }
   }
  }
 }
 if(dive?.style==='foot'){
  // A low shot near him is kept out with a leg thrown out to its side, dropping onto the other knee, arms out wide.
  const progress=clamp((time-dive.start)/Math.max(1,dive.duration)),after=time-dive.start-dive.duration;
  const reach=smooth((progress-.3)/.6)*(1-smooth((after-250)/650)),side=dive.side||1,leg=side>0?1:0,other=1-leg;
  p.diveWeight=reach;
  if(reach>0){
   p.hip[leg]=mix(p.hip[leg],-.25,reach);p.knee[leg]=mix(p.knee[leg],.05,reach);p.ankle[leg]=mix(p.ankle[leg],.1,reach);
   p.hipRoll[leg]=mix(p.hipRoll[leg],side*clamp(.45+dive.distance*.45,.45,1.15),reach);p.hipYaw[leg]=mix(p.hipYaw[leg],side*.6,reach);
   p.hip[other]=mix(p.hip[other],-.75,reach);p.knee[other]=mix(p.knee[other],1.55,reach);p.ankle[other]=mix(p.ankle[other],-.65,reach);
   p.hipRoll[other]=mix(p.hipRoll[other],0,reach);
   p.lift=mix(p.lift,standing(p,other),reach);
   blend(p.shoulder,-.55,reach);blend(p.spread,.95,reach);blend(p.elbow,-.2,reach);
   p.lean=mix(p.lean,.22,reach);p.roll=mix(p.roll,-side*.12,reach);
  }
 }else if(dive){
  // Set, push off, reach the shot, absorb the landing, then get back up.
  // Recovery depends on the contact time, not the next replay action's type.
  const progress=clamp((time-dive.start)/Math.max(1,dive.duration)),after=time-dive.start-dive.duration;
  const recovery=1-smooth((after-180)/900),reach=smooth((progress-.12)/.72)*recovery;
  const lateral=clamp(dive.distance/1.6),high=clamp((dive.height-.5)/1.8),side=dive.side||1;
  p.diveWeight=reach;
  if(time>=dive.start&&recovery>0){
   const low=1-smooth((dive.height-.25)/.75),overhead=smooth((dive.height-1.25)/.65);
   const centralHip=-.28-.82*low,centralKnee=-2*centralHip;
   const crouch=-(.93-.85*Math.cos(centralHip)-.08)*SCALE;
   p.roll=-side*lateral*(1.48-high*.34)*reach;
   p.lift=mix(p.lift,mix(crouch+overhead*.3,.06+high*.52,lateral)+Math.sin(progress*Math.PI)*.16*lateral,reach);
   p.lean=mix(p.lean,mix(.1+low, .05,lateral),reach);p.twist*=1-reach;
   // Keep the keeper's hands near the interception, instead of extending beyond it.
   p.shift=-side*lateral*1.35*reach;
   blend(p.shoulder,mix(mix(-.9-.2*low,-2.5,overhead),-2.65+high*.18,lateral),reach);
   blend(p.elbow,mix(mix(-1+low*.95,-.14,overhead),-.14,lateral),reach);blend(p.spread,.13,reach);
   blend(p.hip,i=>mix(centralHip,i===(side>0?0:1)?-.18:.32,lateral),reach);
   blend(p.knee,i=>mix(centralKnee,i===(side>0?0:1)?.18:.68,lateral),reach);
   blend(p.ankle,centralHip*(1-lateral),reach);blend(p.hipRoll,0,reach);
  }
 }
 if(hold){
  // A diving save is gathered before standing; arms follow the same blend.
  const gather=1-(p.diveWeight||0)*.65;
  blend(p.shoulder,-.95,gather);blend(p.elbow,-1.35,gather);blend(p.spread,.18,gather);
  p.lean=mix(p.lean,.06,gather);
 }
 if(mood?.kind==='cheer')cheer=Math.max(cheer,mood.weight);
 else if(mood?.weight)react(p,mood.kind,mood.weight,speed,time,seed,blend);
 if(cheer&&!joy(p,cheer,time,seed,speed)){
  const bounce=Math.max(0,Math.sin(time*.009+seed))*(1-smooth((speed-1)/2));
  p.lift+=bounce*.16*cheer;
  blend(p.shoulder,side=>-2.5+Math.sin(time*.007+seed+side)*.18,cheer);
  blend(p.spread,.4,cheer);blend(p.elbow,-.3,cheer);
 }
 return p;
}

// How a player reacts, `weight` from 0 to 1: the scorer running off with his arms out ('scorer'), hands on his hips
// ('dejected'), bent over with his hands on his knees ('crouch'), hands on his head after a miss ('despair'), the keeper
// pointing to organise his defence ('point'), an arm up to call for the ball ('call'). The legs change only once he
// has stopped.
function react(p,kind,weight,speed,time,seed,blend){
 const still=weight*(1-smooth((speed-.4)/1.2));
 if(kind==='scorer'){
  blend(p.shoulder,-.25,weight);blend(p.spread,1.42,weight);blend(p.elbow,-.08,weight);
  p.lean=mix(p.lean,p.lean*.4-.05,weight);p.headPitch=mix(p.headPitch,-.25,weight);
 }else if(kind==='dejected'){
  blend(p.shoulder,.28,weight);blend(p.spread,.62,weight);blend(p.elbow,-1.95,weight);
  p.headPitch=mix(p.headPitch,.5,weight);p.lean=mix(p.lean,.06,weight);
 }else if(kind==='crouch'){
  blend(p.shoulder,-.95,weight);blend(p.spread,.2,weight);blend(p.elbow,-.15,weight);p.headPitch=mix(p.headPitch,.35,weight);
  // Bent at the hips over flexed knees, both soles on the grass.
  blend(p.hip,-.42,still);blend(p.knee,.7,still);blend(p.ankle,-.28,still);blend(p.hipRoll,0,still);
  p.lift=mix(p.lift,SCALE*(.45*Math.cos(-.42)+.4*Math.cos(.28)+soleHeight(0)-.93),still);
  p.lean=mix(p.lean,.78,still);
 }else if(kind==='despair'){
  blend(p.shoulder,-2.35,weight);blend(p.spread,.95,weight);blend(p.elbow,-2.3,weight);
  p.headPitch=mix(p.headPitch,-.3,weight);p.lean=mix(p.lean,-.08,weight);
 }else if(kind==='point'){
  p.shoulder[1]=mix(p.shoulder[1],-1.45,weight);p.spread[1]=mix(p.spread[1],.55+.25*Math.sin(time*.004+seed),weight);p.elbow[1]=mix(p.elbow[1],-.05,weight);
 }else if(kind==='call'){
  p.shoulder[1]=mix(p.shoulder[1],-2.75,weight);p.spread[1]=mix(p.spread[1],.3,weight);p.elbow[1]=mix(p.elbow[1],-.25,weight);
 }
}

// A strike as captured (tools/build_motion_clips.mjs): the last stride into the ball, the plant of the other foot beside
// it, the swing and the follow-through, timed on the contact `elapsed` ms away. The softer a pass, the shorter the
// swing of the kicking leg; the support sole stays on the grass unless the capture leaves it.
function strike(p,gesture,timing,elapsed,foot,speed,blend){
 const weight=envelope(timing,elapsed),power=clamp(gesture.strength??.7),lead=timing.lead;
 const c=capturedAt(timing,elapsed,foot===1);
 // A pass turns the hips through less than a shot.
 if(timing.captured==='pass')c.yaw*=.7;
 apply(p,c,weight,{side:foot,weight:weight*(timing.captured==='pass'?.55+.45*power:.8+.2*power)});
 technique(p,gesture,foot,foot?1:-1,weight,elapsed<0,smooth((elapsed+lead)/lead),blend,true);
}
// How much a captured gesture takes over, `elapsed` ms from its contact: in over the first half of its lead, out over the
// second half of its follow-through.
function envelope(timing,elapsed){
 const lead=timing.lead,follow=timing.span-timing.lead;
 return elapsed<0?smooth((elapsed+lead)/(lead*.45)):1-smooth((elapsed-follow*.45)/(follow*.55));
}
const capturedAt=(timing,elapsed,mirror)=>capturedGesture(timing.captured,gestureClip(timing.captured).contact+elapsed/1000,mirror);
// A captured pose `c` over the running one, by `weight`; `leg` gives one leg its own weight (the kicking leg of a soft
// pass swings less). The pelvis's turn and side tilt go to the body; the soles stay on the grass unless the capture
// leaves it.
function apply(p,c,weight,leg=null,legs=weight){
 for(let side=0;side<2;side++){
  const w=leg&&side===leg.side?leg.weight:legs;
  for(const joint of ['hip','hipRoll','hipYaw','knee','ankle'])p[joint][side]=mix(p[joint][side],c[`${joint}${side}`],w);
  for(const joint of ['shoulder','spread','elbow'])p[joint][side]=mix(p[joint][side],c[`${joint}${side}`],weight);
 }
 for(const channel of ['lean','spineRoll','twist','roll','yaw','headPitch'])p[channel]=mix(p[channel],c[channel],weight);
 p.lift=Math.max(mix(p.lift,grounded(p)+Math.max(0,c.air-.03)*SCALE,weight),grounded(p));
}

// A change of pace or of course at speed, as captured: a hard stop, a burst away from a standstill, a cut (captured
// turning left, mirrored for the right). `transition` is {name, elapsed (ms since it began), side (1 a turn to his
// left)}. His legs keep a share of his own stride, so that his feet stay with the ground the replay covers; the trunk,
// the arms and the head are the capture's. The turn itself is the replay's: only how far the hips lead it is kept.
export function transitionLength(name){const clip=gestureClip(name);return clip?clip.length*1000:0;}
function transit(p,{name,elapsed,side=1}){
 const clip=gestureClip(name);
 if(!clip)return;
 const length=clip.length*1000,weight=smooth(elapsed/140)*(1-smooth((elapsed-(length-280))/280));
 if(weight<=0)return;
 const mirror=name==='cut'&&side<0,c=capturedGesture(name,elapsed/1000,mirror);
 const first=capturedGesture(name,0,mirror).yaw,last=capturedGesture(name,clip.length,mirror).yaw;
 c.yaw-=mix(first,last,smooth(elapsed/length));
 apply(p,c,weight,null,weight*.45);
}
// Joy, as captured: the arms flung up and a few hops on the spot, played to and fro so that it goes on as long as the
// celebration; each player at his own point of it. Over whatever his legs are doing; false without the capture.
function joy(p,weight,time,seed,speed){
 const clip=gestureClip('joy');
 if(!clip)return false;
 const cycle=(time/1000+seed*.61)%(clip.length*2),c=capturedGesture('joy',cycle<clip.length?cycle:clip.length*2-cycle);
 for(let side=0;side<2;side++)for(const joint of ['shoulder','spread','elbow'])p[joint][side]=mix(p[joint][side],c[`${joint}${side}`],weight);
 for(const channel of ['lean','spineRoll','twist','headPitch'])p[channel]=mix(p[channel],c[channel],weight);
 p.lift+=Math.max(0,c.air-.02)*SCALE*1.6*weight*(1-smooth((speed-1)/2));
 return true;
}

// A trick to beat the man in front of him, the ball taken away to `side` (1 his left, -1 his right) at the contact: a
// cut (the crochet, captured on a run turning left), a body feint (captured faking left to go right), or a step-over.
// The captures are mirrored for the other side; the change of course itself is the replay's, so the turn of the hips
// the capture makes over its whole stretch is taken out and only how far they lead it is kept.
const TRICKS={cut:{clip:'cut',side:1,lead:350,follow:520},feint:{clip:'feint',side:-1,lead:450,follow:650},stepover:{lead:440,follow:420}};
function trick(p,gesture,timing,elapsed,blend){
 const side=gesture.side>=0?1:-1,kind=TRICKS[gesture.trick]?gesture.trick:'cut',weight=envelope(timing,elapsed);
 if(timing.captured){
  const clip=gestureClip(timing.captured),mirror=side!==TRICKS[kind].side,c=capturedAt(timing,elapsed,mirror);
  const first=capturedGesture(timing.captured,clip.contact-timing.lead/1000,mirror).yaw,last=capturedGesture(timing.captured,clip.contact+(timing.span-timing.lead)/1000,mirror).yaw;
  c.yaw-=mix(first,last,smooth((elapsed+timing.lead)/timing.span));
  apply(p,c,weight);
  return;
 }
 // The step-over: the leg on the side he fakes to lifts and circles round the front of the ball from inside out, the
 // body dipping after it; then the outside of the other foot takes the ball away.
 const over=side>0?0:1,out=over?1:-1,push=1-over,circle=clamp((elapsed+timing.lead)/(timing.lead-90)),arc=Math.sin(Math.PI*circle)*weight;
 p.hip[over]=mix(p.hip[over],-.78,arc);p.knee[over]=mix(p.knee[over],1.2,arc);p.ankle[over]=mix(p.ankle[over],.2,arc);
 p.hipRoll[over]=mix(p.hipRoll[over],out*mix(-.3,.55,smooth(circle)),arc);p.hipYaw[over]=mix(p.hipYaw[over],out*.3,arc);
 p.hip[push]=mix(p.hip[push],-.15,arc);p.knee[push]=mix(p.knee[push],.65,arc);
 p.roll=mix(p.roll,-out*.26,arc);p.twist=mix(p.twist,out*.32,arc);p.lean=mix(p.lean,.22,arc);
 blend(p.spread,s=>s===over?.55:.3,arc);blend(p.shoulder,s=>s===over?-.5:.15,arc);blend(p.elbow,-.5,arc);
 const take=elapsed<0?smooth((elapsed+120)/120):1-smooth(elapsed/260),away=side>0?1:0,outside=away?1:-1;
 p.hip[away]=mix(p.hip[away],-.42,take*weight);p.knee[away]=mix(p.knee[away],.35,take*weight);p.hipRoll[away]=mix(p.hipRoll[away],outside*.3,take*weight);
 p.roll=mix(p.roll,outside*.16,take*weight);
 p.lift=Math.max(p.lift,grounded(p));
}

// How the kick is struck, over its common swing: the support foot planted beside the ball, then the inside of the foot
// for a pass along the grass or a placed finish (knee turned out), leaning back under a lofted ball or a cross, over a
// driven or low one, hips open and falling away on a free kick, the hip raised for a volley.
function technique(p,gesture,foot,sign,weight,before,wind,blend,captured=false){
 const kind=gesture.technique,other=1-foot,plant=before?smooth((wind-.45)/.55):1;
 // The captured strike plants its own support foot.
 if(!captured){
  p.hip[other]=mix(p.hip[other],-.34,weight*plant);p.knee[other]=mix(p.knee[other],.36,weight*plant);
  p.hipRoll[other]=mix(p.hipRoll[other],-sign*.12,weight*plant);
 }
 // The inside of the foot: the thigh turns out as the leg straightens into the ball, never while the knee is folded
 // behind him, where it would throw the shin out to the side.
 if(kind==='ground'||kind==='placed')p.hipYaw[foot]=mix(p.hipYaw[foot],p.hipYaw[foot]+sign*.7*(1-smooth((p.knee[foot]-.25)/.75)),weight);
 if(kind==='lofted'||kind==='floated'||kind==='whipped')p.lean=mix(p.lean,p.lean-.2,weight);
 if(kind==='driven'||kind==='low')p.lean=mix(p.lean,p.lean+.12,weight);
 if(kind==='free_kick'){p.roll-=sign*.16*weight;p.twist=mix(p.twist,p.twist*1.45,weight);blend(p.spread,.7,weight);}
 const high=(gesture.contact?.z??0)>.45;
 if(high){p.hip[foot]=mix(p.hip[foot],p.hip[foot]-.4,weight);p.roll-=sign*.22*weight;}
}
