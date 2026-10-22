// The ball of the replay as a projectile: struck, it flies under gravity, bounces, then rolls and slows on the grass.
// Its whole path is worked out when it is struck, in pitch metres and ms of replay, so that it can be read at any
// time, ahead of the play too: whoever is meant to meet the ball is sent to where it will then be.
export const GRAVITY=9.81e-6,ROLL=2.4e-6;
// A bounce keeps half the ball's upward speed and most of its pace; below REST (m/ms upwards) it rolls instead.
const BOUNCE=.5,GRIP=.72,REST=.0011;

// The path of a ball struck at `time` from `from` ({x, y, z}) with `velocity` ({x, y, z}, m/ms). `gravity` may exceed
// the real one for a dipping strike, `curl` ({x, y}, m/ms²) bends its first flight, `friction` slows it on the grass.
export function path(from,velocity,time,{gravity=GRAVITY,curl=null,friction=ROLL}={}){
 const segments=[];
 let p={x:from.x,y:from.y,z:Math.max(0,from.z||0)},v={x:velocity.x,y:velocity.y,z:velocity.z||0},t=time,g=gravity,c=curl;
 for(let bounce=0;bounce<12&&(p.z>1e-4||v.z>REST);bounce++){
  const span=(v.z+Math.sqrt(v.z*v.z+2*g*p.z))/g,cx=c?.x||0,cy=c?.y||0;
  segments.push({kind:'air',t0:t,t1:t+span,p,v,g,c});
  p={x:p.x+v.x*span+cx*span*span/2,y:p.y+v.y*span+cy*span*span/2,z:0};
  v={x:(v.x+cx*span)*GRIP,y:(v.y+cy*span)*GRIP,z:(g*span-v.z)*BOUNCE};
  t+=span;g=GRAVITY;c=null;
 }
 const speed=Math.hypot(v.x,v.y);
 if(speed>1e-6){
  const span=speed/friction,run=speed*span/2;
  segments.push({kind:'roll',t0:t,t1:t+span,p,dx:v.x/speed,dy:v.y/speed,speed,friction});
  p={x:p.x+v.x/speed*run,y:p.y+v.y/speed*run,z:0};
  t+=span;
 }
 segments.push({kind:'rest',t0:t,t1:Infinity,p});
 return segments;
}

// Where the ball is at `time`, and how fast it goes: {x, y, z, vx, vy, vz}.
export function ballAt(segments,time){
 const segment=segments.find(item=>time<item.t1)||segments[segments.length-1],t=Math.max(0,time-segment.t0),p=segment.p;
 if(segment.kind==='air'){
  const cx=segment.c?.x||0,cy=segment.c?.y||0,v=segment.v;
  return {x:p.x+v.x*t+cx*t*t/2,y:p.y+v.y*t+cy*t*t/2,z:Math.max(0,p.z+v.z*t-segment.g*t*t/2),vx:v.x+cx*t,vy:v.y+cy*t,vz:v.z-segment.g*t};
 }
 if(segment.kind==='roll'){
  const speed=segment.speed-segment.friction*t,run=(segment.speed+speed)/2*t;
  return {x:p.x+segment.dx*run,y:p.y+segment.dy*run,z:0,vx:segment.dx*speed,vy:segment.dy*speed,vz:0};
 }
 return {x:p.x,y:p.y,z:0,vx:0,vy:0,vz:0};
}

// The strike that rolls the ball from `from` to `to` in `duration`, still moving when it gets there; a ball asked to
// take longer than it can without stopping is rolled to stop there, and the `duration` returned says when.
export function rolled(from,to,duration,friction=ROLL){
 const dx=to.x-from.x,dy=to.y-from.y,gap=Math.hypot(dx,dy);
 if(gap<1e-6)return {velocity:{x:0,y:0,z:0},duration};
 let speed=gap/duration+friction*duration/2;
 if(speed<friction*duration){speed=Math.sqrt(2*friction*gap);duration=speed/friction;}
 return {velocity:{x:dx/gap*speed,y:dy/gap*speed,z:0},duration};
}

// The strike that carries the ball through the air from `from` to `to` in `duration`, reaching it `height` metres up.
// `bend` takes it that many metres off its line halfway (the sign picks the side); `gravity` makes it dip.
export function lofted(from,to,duration,height,{bend=0,gravity=GRAVITY}={}){
 const dx=to.x-from.x,dy=to.y-from.y,gap=Math.hypot(dx,dy)||1,pull=8*bend/(duration*duration);
 const curl=bend?{x:-dy/gap*pull,y:dx/gap*pull}:null,cx=curl?.x||0,cy=curl?.y||0;
 return {velocity:{x:(dx-cx*duration*duration/2)/duration,y:(dy-cy*duration*duration/2)/duration,z:(height-(from.z||0)+gravity*duration*duration/2)/duration},
         options:{curl,gravity}};
}

// The gravity a dipping strike needs to be `over` metres up `along` metres into its flight and still come down to
// `height` at the end: at a share k of the way, it is k of the climb plus g/2 · t (T - t) above the start.
export function dip(from,to,duration,height,along,over){
 const gap=Math.hypot(to.x-from.x,to.y-from.y)||1,share=Math.min(.9,along/gap),t=share*duration,z0=from.z||0;
 return Math.max(GRAVITY,2*(over-z0-(height-z0)*share)/(t*(duration-t)));
}
