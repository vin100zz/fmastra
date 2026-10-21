// Procedural poses in replay time. No renderer or wall clock: pausing and changing
// playback speed preserve the contact between an animation and the match ball.
import {locomotionPose,soleHeight} from './replay-locomotion.js';
export {gaitCycle,gaitStyle,soleHeight,strideLength} from './replay-locomotion.js';
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

export function gestureTiming(gesture){
 if(gesture?.kind==='kick')return gesture.style==='shot'?{lead:240,span:800}:gesture.style==='cross'?{lead:210,span:700}:{lead:170,span:560};
 return {touch:{lead:90,span:330},cushion:{lead:130,span:440},thigh:{lead:230,span:560},chest:{lead:260,span:660},head:{lead:300,span:640}}[gesture?.kind];
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

export function playerMotion({speed=0,phase=0,time=0,seed=0,style,acceleration=0,ready=0,hold=false,gesture=null,foot=1,turn=0,cheer=0,dive=null}={}){
 const p=locomotionPose({speed,phase,time,seed,style,acceleration,turn});
 const blend=(list,value,k)=>{for(let side=0;side<2;side++)list[side]=mix(list[side],typeof value==='function'?value(side):value,k);};
 if(ready){
  // Keep taking steps while tracking a shot. The set stance folds the legs
  // only as the goalkeeper stops, and its pelvis follows the support sole.
  const set=ready*(1-smooth((speed-.1)/.8));
  const support=()=>Math.min(...p.hip.map((hip,i)=>.93-.45*Math.cos(hip)-.4*Math.cos(hip+p.knee[i])-soleHeight(hip+p.knee[i]+p.ankle[i])));
  const ground=support();
  blend(p.hip,-.42,set);blend(p.knee,.84,set);blend(p.ankle,-.42,set);
  p.lift+=(ground-support())*1.25;
  blend(p.shoulder,-.38,ready);blend(p.elbow,-1.1,ready);blend(p.spread,.48,ready);
  p.lean=mix(p.lean,.16,ready);
 }
 if(gesture){
  const timing=gestureTiming(gesture);
  if(timing){
   const elapsed=time-gesture.at,g=(elapsed+timing.lead)/timing.span;
   if(g>=0&&g<1){
    const before=elapsed<0,wind=smooth((elapsed+timing.lead)/timing.lead),follow=clamp(elapsed/(timing.span-timing.lead));
    const envelope=before?smooth(wind*4):1-smooth((follow-.38)/.62);
    // A running touch is brief, but still reaches its full contact pose. A
    // permanently weak overlay can leave a recovering heel far from the ball.
    const touch=gesture.kind==='touch'&&speed>2;
    const weight=envelope*(touch?(before?wind:1-smooth(follow/.7)):1),other=1-foot,sign=foot?1:-1;
    if(['kick','touch','cushion'].includes(gesture.kind)){
     const kick=gesture.kind==='kick',control=gesture.kind==='cushion',power=kick?clamp(gesture.strength??.7):control?.18:.27;
     const backswing=kick?.35+power*.6:.12,contact=control?-.52:-.87;
     const swing=before?mix(backswing,contact,wind):mix(contact,control?-.12:-.12-power*.55,Math.sin(follow*Math.PI/2));
     p.hip[foot]=mix(p.hip[foot],swing,weight);
     p.knee[foot]=mix(p.knee[foot],before?mix(.9+power*.5,.12,wind):.12+follow*.55,weight);
     p.ankle[foot]=mix(p.ankle[foot],control?.12:kick?.28:-.12,weight);
     if(gesture.kind!=='touch'||speed<2){p.hip[other]=mix(p.hip[other],-.16,weight);p.knee[other]=mix(p.knee[other],.32,weight);p.ankle[other]=mix(p.ankle[other],-.16,weight);}
     blend(p.spread,side=>side===foot?.2+power*.3:.32+power*.55,weight);
     blend(p.shoulder,side=>side===foot?.35*power:-.55*power,weight);blend(p.elbow,-.48,weight);
     p.twist=mix(p.twist,sign*(before?mix(-.32,.16,wind):mix(.16,.42,follow))*power,weight);
     p.lean=mix(p.lean,control?.05:before?mix(-.1,.12,wind):.12+power*.16,weight);
     p.roll+=sign*.055*weight;p.lift=mix(p.lift,-.025,weight);
    }else{
     const pulse=Math.sin(Math.PI*g),contactPulse=before?wind:1-smooth(follow);
     if(gesture.kind==='thigh'){
      p.hip[foot]=mix(p.hip[foot],-1.3,contactPulse);p.knee[foot]=mix(p.knee[foot],1.6,contactPulse);
      blend(p.spread,.48,pulse);p.lean=mix(p.lean,-.12,pulse);
     }else if(gesture.kind==='chest'){
      p.lean=mix(p.lean,before?-.32:.18,pulse);blend(p.spread,.8,pulse);blend(p.shoulder,-.35,pulse);blend(p.elbow,-.8,pulse);
     }else if(gesture.kind==='head'){
      const jump=gesture.jump||0;
      p.lift+=jump*1.25*contactPulse;
      blend(p.hip,jump?-.38:-.12,pulse);blend(p.knee,jump?.85:.3,pulse);
      blend(p.shoulder,-.9,pulse);blend(p.spread,.65,pulse);blend(p.elbow,-.65,pulse);
      p.lean=mix(p.lean,before?mix(-.22,.12,wind):.28,pulse);p.headPitch=mix(-.15,.32,wind)*pulse;
     }
    }
   }
  }
 }
 if(dive){
  // Set, push off, reach the shot, absorb the landing, then get back up.
  // Recovery depends on the contact time, not the next replay action's type.
  const progress=clamp((time-dive.start)/Math.max(1,dive.duration)),after=time-dive.start-dive.duration;
  const recovery=1-smooth((after-180)/900),reach=smooth((progress-.12)/.72)*recovery;
  const lateral=clamp(dive.distance/1.6),high=clamp((dive.height-.5)/1.8),side=dive.side||1;
  p.diveWeight=reach;
  if(time>=dive.start&&recovery>0){
   const low=1-smooth((dive.height-.25)/.75),overhead=smooth((dive.height-1.25)/.65);
   const centralHip=-.28-.82*low,centralKnee=-2*centralHip;
   const crouch=-(.93-.85*Math.cos(centralHip)-.08)*1.25;
   p.roll=-side*lateral*(1.48-high*.34)*reach;
   p.lift=mix(p.lift,mix(crouch+overhead*.3,.06+high*.52,lateral)+Math.sin(progress*Math.PI)*.16*lateral,reach);
   p.lean=mix(p.lean,mix(.1+low, .05,lateral),reach);p.twist*=1-reach;
   // Keep the keeper's hands near the interception, instead of extending beyond it.
   p.shift=-side*lateral*1.35*reach;
   blend(p.shoulder,mix(mix(-.9-.2*low,-2.5,overhead),-2.65+high*.18,lateral),reach);
   blend(p.elbow,mix(mix(-1+low*.95,-.14,overhead),-.14,lateral),reach);blend(p.spread,.13,reach);
   blend(p.hip,i=>mix(centralHip,i===(side>0?0:1)?-.18:.32,lateral),reach);
   blend(p.knee,i=>mix(centralKnee,i===(side>0?0:1)?.18:.68,lateral),reach);
   blend(p.ankle,centralHip*(1-lateral),reach);
  }
 }
 if(hold){
  // A diving save is gathered before standing; arms follow the same blend.
  const gather=1-(p.diveWeight||0)*.65;
  blend(p.shoulder,-.95,gather);blend(p.elbow,-1.35,gather);blend(p.spread,.18,gather);
  p.lean=mix(p.lean,.06,gather);
 }
 if(cheer){
  const bounce=Math.max(0,Math.sin(time*.009+seed));
  p.lift+=bounce*.16*cheer;
  blend(p.shoulder,side=>-2.5+Math.sin(time*.007+seed+side)*.18,cheer);
  blend(p.spread,.4,cheer);blend(p.elbow,-.3,cheer);
 }
 return p;
}
