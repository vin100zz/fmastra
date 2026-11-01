// Builds web/models/motions.json, the motion-captured gaits of the 3D players, from the CMU motion capture
// database (mocap.cs.cmu.edu, free for research and commercial use) in the BVH conversion by Bruce Hahne:
//
//   git clone --depth 1 --filter=blob:none --no-checkout https://github.com/una-dinosauria/cmu-mocap.git cmu
//   git -C cmu checkout HEAD -- data/009 data/016 data/035
//   node tools/build_motion_clips.mjs cmu
//
// Each clip is cut to one gait cycle that starts when the right foot touches down, its loop closed, then
// measured on the channels of replay-motion.js: the angles of the hips, knees, ankles, shoulders and elbows in
// the planes the replay's pivots turn in, the lean, twist and roll of the trunk, the head's nod and the rise
// and fall of the pelvis. replay-locomotion.js plays them back at the stride of the replay; its own inverse
// kinematics keeps the planted foot on the grass.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const root=process.argv[2];
if(!root)throw new Error('usage: node tools/build_motion_clips.mjs <cmu-mocap checkout>');
const OUT=new URL('../web/models/motions.json',import.meta.url);
// One clip per pace, slowest first: a walk, a jog, a run and a fast run (the database has no sprint).
const CLIPS=[['walk','035/35_01'],['jog','016/16_35'],['run','009/09_01'],['fast','016/16_46']];
const SAMPLES=48;
// The replay's leg below the hip, in metres, against which the pelvis's rise and fall is scaled.
const LEG=.85;

// --- Vectors and quaternions.
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],len=a=>Math.sqrt(dot(a,a)),norm=a=>mul(a,1/len(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const qmul=([ax,ay,az,aw],[bx,by,bz,bw])=>[aw*bx+ax*bw+ay*bz-az*by,aw*by-ax*bz+ay*bw+az*bx,aw*bz+ax*by-ay*bx+az*bw,aw*bw-ax*bx-ay*by-az*bz];
const qaxis=(axis,degrees)=>{const h=degrees*Math.PI/360,s=Math.sin(h);return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(h)];};
const rotate=(q,v)=>{const [x,y,z,w]=q,u=[x,y,z],t=mul(cross(u,v),2);return add(add(v,mul(t,w)),cross(u,t));};
const AXIS={X:[1,0,0],Y:[0,1,0],Z:[0,0,1]};

// --- BVH: the hierarchy, then one line of channels per frame.
function parse(path){
 const tokens=readFileSync(path,'utf8').split(/\s+/).filter(Boolean),joints=[],stack=[];let i=1,current=null;
 const next=()=>tokens[i++];
 for(;;){
  const token=next();
  if(token==='ROOT'||token==='JOINT'||token==='End'){
   const joint={name:token==='End'?`${current.name}End`:next(),parent:current,channels:[]};
   if(token==='End')next();
   joints.push(joint);stack.push(joint);current=joint;
  }else if(token==='OFFSET')current.offset=[+next(),+next(),+next()];
  else if(token==='CHANNELS'){const n=+next();for(let k=0;k<n;k++)current.channels.push(next());}
  else if(token==='}'){stack.pop();current=stack.at(-1)??null;}
  else if(token==='MOTION')break;
 }
 next();const frames=+next();next();next();const dt=+next(),width=joints.reduce((s,j)=>s+j.channels.length,0);
 const values=Float64Array.from({length:frames*width},()=>+next());
 // The first frame of these conversions is the skeleton's rest pose, not motion.
 return {joints,dt,frames:frames-1,frame:k=>values.subarray((k+1)*width,(k+2)*width)};
}
// World positions of every joint at frame k.
function positions(clip,k){
 const values=clip.frame(k),world=new Map();let c=0;
 for(const joint of clip.joints){
  let offset=[...joint.offset],q=[0,0,0,1];
  for(const channel of joint.channels){
   const v=values[c++];
   if(channel.endsWith('position'))offset['XYZ'.indexOf(channel[0])]=v;
   else q=qmul(q,qaxis(AXIS[channel[0]],v));
  }
  const parent=joint.parent&&world.get(joint.parent.name);
  world.set(joint.name,parent?{p:add(parent.p,rotate(parent.q,offset)),q:qmul(parent.q,q)}:{p:offset,q});
 }
 return name=>world.get(name).p;
}

// --- One gait cycle of a clip: right touchdown to right touchdown, with both feet's events.
function contacts(frames,side,leg){
 const low=frames.map(p=>Math.min(p(`${side}Foot`)[1],p(`${side}ToeBase`)[1])),ground=Math.min(...low);
 const travel=frames.map((p,k)=>k?Math.hypot(...[0,2].map(a=>p(`${side}ToeBase`)[a]-frames[k-1](`${side}ToeBase`)[a])):0);
 const pace=frames.map((p,k)=>k?Math.hypot(...[0,2].map(a=>p('Hips')[a]-frames[k-1]('Hips')[a])):0);
 // On the ground: low, and not swinging past it.
 let on=low.map((h,k)=>h-ground<.05*leg&&travel[k]<.5*Math.max(pace[k],1e-6));
 // Bridge flickers shorter than a tenth of a second, then drop contacts as short.
 const span=Math.round(.1/frames.dt);
 for(const state of [true,false]){
  for(let k=0;k<on.length;){
   let end=k;while(end<on.length&&on[end]===on[k])end++;
   if(on[k]!==state&&k>0&&end<on.length&&end-k<span)for(let j=k;j<end;j++)on[j]=state;
   k=end;
  }
 }
 const events=[];
 for(let k=1;k<on.length;k++)if(on[k]!==on[k-1])events.push({frame:k,down:on[k]});
 return events;
}
function cycle(path){
 const clip=parse(path),frames=[...Array(clip.frames).keys()].map(k=>positions(clip,k));frames.dt=clip.dt;
 const rest=frames[0],leg=len(sub(rest('RightUpLeg'),rest('RightLeg')))+len(sub(rest('RightLeg'),rest('RightFoot')));
 const right=contacts(frames,'Right',leg),left=contacts(frames,'Left',leg);
 const downs=right.filter(e=>e.down);
 if(downs.length<2)throw new Error(`${path}: no full cycle`);
 const start=downs[0].frame,end=downs[1].frame,length=end-start,at=frame=>(frame-start)/length;
 const within=(events,down)=>events.find(e=>e.down===down&&e.frame>start&&e.frame<end+length*.6);
 const rightOff=within(right,false),leftDown=within(left,true),leftOff=left.find(e=>!e.down&&e.frame>leftDown.frame);
 const travel=sub(frames[end]('Hips'),frames[start]('Hips'));travel[1]=0;
 return {clip,frames:frames.slice(start,end+1),leg,heading:norm(travel),speed:len(travel)/leg*LEG/(length*clip.dt),
  events:{rightOff:at(rightOff.frame),leftDown:at(leftDown.frame),leftOff:at(leftOff.frame)%1}};
}

// --- The replay's channels, measured on a frame. Pivot conventions are those of replay-player.js: x turns the
// limb forward when negative, the player faces +z with his left at +x.
function channels(p,heading,leg,restHip){
 const up=[0,1,0],forward=heading,left=cross(up,forward);
 const pitch=v=>Math.atan2(-dot(v,forward),-dot(v,up));
 const out={};
 for(const [side,name] of [[0,'Right'],[1,'Left']]){
  const hip=p(`${name}UpLeg`),knee=p(`${name}Leg`),ankle=p(`${name}Foot`),toe=p(`${name}ToeBase`);
  const thigh=pitch(sub(knee,hip)),shin=pitch(sub(ankle,knee)),foot=sub(toe,ankle);
  out[`hip${side}`]=thigh;out[`knee${side}`]=shin-thigh;
  out[`sole${side}`]=Math.atan2(-dot(foot,up),dot(foot,forward));
 }
 // The trunk: its lean and side tilt, the turn of the shoulders over the pelvis, the pelvis's turn and tilt.
 const neck=p('Neck'),spine=p('Spine'),chestUp=norm(sub(neck,spine));
 const shoulders=sub(p('LeftArm'),p('RightArm')),pelvis=sub(p('LeftUpLeg'),p('RightUpLeg'));
 const yaw=v=>Math.atan2(-dot(v,forward),dot(v,left));
 out.lean=Math.atan2(dot(chestUp,forward),dot(chestUp,up));
 out.spineRoll=Math.atan2(-dot(chestUp,left),dot(chestUp,up));
 out.hipYaw=yaw(pelvis);out.twist=yaw(shoulders)-out.hipYaw;
 out.roll=Math.atan2(dot(pelvis,up),dot(pelvis,left));
 // Arms in the chest's frame.
 const chestLeft=norm(sub(shoulders,mul(chestUp,dot(shoulders,chestUp)))),chestForward=cross(chestLeft,chestUp);
 for(const [side,name] of [[0,'Right'],[1,'Left']]){
  const arm=norm(sub(p(`${name}ForeArm`),p(`${name}Arm`))),fore=norm(sub(p(`${name}Hand`),p(`${name}ForeArm`)));
  out[`shoulder${side}`]=Math.atan2(-dot(arm,chestForward),-dot(arm,chestUp));
  out[`spread${side}`]=Math.asin(Math.max(-1,Math.min(1,dot(arm,side?chestLeft:mul(chestLeft,-1)))));
  out[`elbow${side}`]=-Math.acos(Math.max(-1,Math.min(1,dot(arm,fore))));
 }
 const head=norm(sub(p('Head'),neck));
 out.headPitch=Math.atan2(dot(head,chestForward),dot(head,chestUp));
 out.lift=(p('Hips')[1]-restHip)/leg*LEG;
 return out;
}

const library={source:'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), BVH conversion by Bruce Hahne; free for research and commercial use',
 samples:SAMPLES,clips:[]};
for(const [name,file] of CLIPS){
 const gait=cycle(join(root,'data',`${file}.bvh`)),rest=positions(gait.clip,-1);
 // The standing hip height and the resting sole and head angles, from the skeleton's rest pose.
 const restHip=rest('Hips')[1]-Math.min(rest('RightToeBase')[1],rest('RightFoot')[1]);
 const ground=Math.min(...gait.frames.map(p=>Math.min(p('RightToeBase')[1],p('LeftToeBase')[1],p('RightFoot')[1],p('LeftFoot')[1])));
 const restForward=[0,0,1],restChannels=channels(rest,restForward,gait.leg,rest('Hips')[1]);
 const measured=gait.frames.map(p=>channels(p,gait.heading,gait.leg,ground+restHip));
 const curves={};
 for(const key of Object.keys(measured[0])){
  let values=measured.map(m=>m[key]);
  // Angles measured from the rest pose: a standing sole is flat, a resting trunk and head upright.
  if(/^sole|headPitch|^lean$/.test(key))values=values.map(v=>v-restChannels[key]);
  // Side to side, a cycle is symmetric: the skeleton's own asymmetries are taken out.
  if(/^(roll|spineRoll|hipYaw|twist)$/.test(key)){const mean=values.slice(1).reduce((s,v)=>s+v,0)/(values.length-1);values=values.map(v=>v-mean);}
  // Close the loop: the last frame repeats the first, any drift is spread across the cycle.
  const drift=values.at(-1)-values[0];values=values.map((v,k)=>v-drift*k/(values.length-1));
  curves[key]=Array.from({length:SAMPLES},(_,s)=>{
   const x=s/SAMPLES*(values.length-1),k=Math.floor(x),f=x-k;
   return Math.round((values[k]+(values[Math.min(k+1,values.length-1)]-values[k])*f)*1e4)/1e4;
  });
 }
 // The ankle is what the sole's pitch leaves after the hip and knee.
 for(const side of [0,1]){curves[`ankle${side}`]=curves[`sole${side}`].map((v,s)=>Math.round((v-curves[`hip${side}`][s]-curves[`knee${side}`][s])*1e4)/1e4);delete curves[`sole${side}`];}
 const round=v=>Math.round(v*1e3)/1e3;
 library.clips.push({name,file:`${file}.bvh`,speed:round(gait.speed),events:Object.fromEntries(Object.entries(gait.events).map(([k,v])=>[k,round(v)])),curves});
 console.log(name,file,'speed',gait.speed.toFixed(2),'m/s',JSON.stringify(gait.events));
}
// The CMU line from the lower back to the neck leans 9° forward even in an upright walk, where the replay's
// spine pivot carries the whole trunk: the walk's mean lean is taken off every clip and given back to the head.
const walk=library.clips[0].curves.lean,bias=walk.reduce((s,v)=>s+v,0)/walk.length;
for(const {curves} of library.clips){
 curves.lean=curves.lean.map(v=>Math.round((v-bias)*1e4)/1e4);curves.headPitch=curves.headPitch.map(v=>Math.round((v+bias)*1e4)/1e4);
}
writeFileSync(OUT,JSON.stringify(library));
