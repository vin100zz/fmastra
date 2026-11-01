// Builds web/models/footballer.bin, the body of the 3D players, from the MakeHuman base mesh (CC0).
//
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/makehumancommunity/makehuman.git
//   git -C makehuman sparse-checkout set makehuman/data/3dobjs makehuman/data/rigs makehuman/data/targets/macrodetails
//   npm install --no-save --prefix /tmp/meshopt meshoptimizer@1.3.0
//   MESHOPTIMIZER=/tmp/meshopt/node_modules/meshoptimizer/index.js node tools/build_player_model.mjs makehuman
//
// The mesh is morphed into a young athletic man, then re-posed and fitted onto the skeleton of replay-player.js:
// legs straight down on its fixed hips, thigh and shin (the locomotion's inverse kinematics depends on them),
// arms hanging, the upper body in MakeHuman's own proportions. Its 163 bones are merged into the replay's 15
// pivots, the vertices are tagged with the part of the kit that covers them, then the mesh is simplified.
//
// File layout: "FMPL", the length of a JSON header, the header, then the arrays it lists, each 4-byte aligned.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

const {MeshoptSimplifier}=await import(process.env.MESHOPTIMIZER||'meshoptimizer');
const root=process.argv[2];
if(!root)throw new Error('usage: node tools/build_player_model.mjs <makehuman checkout>');
const data=join(root,'makehuman','data');
const OUT=new URL('../web/models/footballer.bin',import.meta.url);
const TRIANGLES=9000;

// The replay's pivots, in the order of the skinned mesh's bones; index 0 of each pair is the player's right (-x).
const BONE={body:0,hip:[1,4],knee:[2,5],ankle:[3,6],spine:7,shoulder:[8,11],elbow:[9,12],wrist:[10,13],head:14};
// The legs of replay-player.js and replay-locomotion.js, in metres before the drawing scale.
const HIP={x:.105,y:.93},THIGH=.45,SHIN=.4,SOLE=.0812;
// The boot of replay-player.js around the ankle pivot: the foot is drawn into it.
const BOOT={centre:[0,-.021,.055],radii:[.06,.054,.157]};
// Kit regions, read by replay-player.js.
const REGION={skin:0,shirt:1,trim:2,arm:3,forearm:4,hand:5,shorts:6,socks:7,boot:8,eye:9};

// --- Vectors and 3×3 matrices (row-major arrays of nine).
const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],len=a=>Math.sqrt(dot(a,a)),norm=a=>mul(a,1/len(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const apply=(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
const matmul=(a,b)=>[0,1,2].flatMap(r=>[0,1,2].map(c=>a[r*3]*b[c]+a[r*3+1]*b[3+c]+a[r*3+2]*b[6+c]));
const IDENTITY=[1,0,0,0,1,0,0,0,1];
// The shortest rotation taking unit vector `from` onto `to`.
function arc(from,to){
 const axis=cross(from,to),s=len(axis),c=dot(from,to);
 if(s<1e-9)return IDENTITY;
 const [x,y,z]=mul(axis,1/s),t=1-c;
 return [t*x*x+c,t*x*y-s*z,t*x*z+s*y,t*x*y+s*z,t*y*y+c,t*y*z-s*x,t*x*z-s*y,t*y*z+s*x,t*z*z+c];
}
// Scaling by `k` along unit `axis`.
const stretch=(axis,k)=>IDENTITY.map((v,i)=>v+(k-1)*axis[Math.floor(i/3)]*axis[i%3]);

// --- The base mesh: the body and its eyes, other helpers left out.
const positions=[],faces=[];
let group=null;
for(const line of readFileSync(join(data,'3dobjs','base.obj'),'utf8').split('\n')){
 if(line.startsWith('v '))positions.push(line.split(/\s+/).slice(1,4).map(Number));
 else if(line.startsWith('g '))group=line.slice(2).trim();
 else if(line.startsWith('f ')&&(group==='body'||/^helper-[lr]-eye$/.test(group))){
  const corners=line.trim().split(/\s+/).slice(1).map(token=>Number(token.split('/')[0])-1);
  for(let i=1;i<corners.length-1;i++)faces.push({eye:group!=='body',corners:[corners[0],corners[i],corners[i+1]]});
 }
}
// A young man of athletic build: the three ethnic averages, more muscle, ideal proportions.
function target(path,weight){
 for(const line of readFileSync(join(data,'targets','macrodetails',path),'utf8').split('\n')){
  if(!line.trim()||line.startsWith('#'))continue;
  const [index,x,y,z]=line.trim().split(/\s+/).map(Number);
  positions[index]=add(positions[index],mul([x,y,z],weight));
 }
}
for(const race of ['caucasian','african','asian'])target(`${race}-male-young.target`,1/3);
target('universal-male-young-maxmuscle-averageweight.target',.4);
target('proportions/male-young-averagemuscle-averageweight-idealproportions.target',.3);
target('proportions/male-young-maxmuscle-averageweight-idealproportions.target',.2);

// --- Skeleton and weights.
const rig=JSON.parse(readFileSync(join(data,'rigs','default.mhskel'),'utf8'));
const weights=JSON.parse(readFileSync(join(data,'rigs','default_weights.mhw'),'utf8')).weights;
const used=new Set(faces.flatMap(face=>face.corners));
const sole=Math.min(...[...used].filter(i=>!faces.some(f=>f.eye&&f.corners.includes(i))).map(i=>positions[i][1]));
const jointRaw=name=>{const list=rig.joints[name];return mul(list.reduce((sum,i)=>add(sum,positions[i]),[0,0,0]),1/list.length);};
const hipDepth=jointRaw(rig.bones['upperleg01.L'].head)[2];
// MakeHuman decimetres to metres, the soles on the ground and the hips on the plane x-y.
const metres=p=>[p[0]*.1,(p[1]-sole)*.1,(p[2]-hipDepth)*.1];
const mesh=positions.map(metres);
const head=bone=>metres(jointRaw(rig.bones[bone].head));

const DIRECT={root:'body',spine05:'body','pelvis.L':'body','pelvis.R':'body',spine04:'spine',spine03:'spine',spine02:'spine',spine01:'spine',
 'breast.L':'spine','breast.R':'spine','clavicle.L':'spine','clavicle.R':'spine','shoulder01.L':'spine','shoulder01.R':'spine',neck01:'spine',neck02:'head',
 'upperleg01.L':'hip','upperleg01.R':'hip','lowerleg01.L':'knee','lowerleg01.R':'knee','foot.L':'ankle','foot.R':'ankle',
 'upperarm01.L':'shoulder','upperarm01.R':'shoulder','lowerarm01.L':'elbow','lowerarm01.R':'elbow','wrist.L':'wrist','wrist.R':'wrist'};
function pivot(bone){
 for(let name=bone;name;name=rig.bones[name].parent)if(DIRECT[name]){
  const kind=DIRECT[name],index=BONE[kind];
  return Array.isArray(index)?index[name.endsWith('.L')?1:0]:index;
 }
 throw new Error(`no pivot for ${bone}`);
}
const influence=positions.map(()=>new Float64Array(15));
for(const [bone,list] of Object.entries(weights))for(const [vertex,weight] of list)influence[vertex][pivot(bone)]+=weight;

// --- From MakeHuman's pose to the replay's: one transform per pivot, p -> to + matrix (p - from).
const transforms=Array.from({length:15},()=>({from:[0,0,0],to:[0,0,0],matrix:IDENTITY}));
const down=[0,-1,0],skeleton={hips:HIP.x,spine:head('spine04'),head:head('neck02'),shoulders:[],elbows:[],wrists:[]};
for(const [side,suffix] of [[0,'.R'],[1,'.L']]){
 const sign=side?1:-1;
 // Legs: straight down from the replay's hip, at its thigh and shin lengths; the foot keeps its own direction.
 const hip=head('upperleg01'+suffix),knee=head('lowerleg01'+suffix),ankle=head('foot'+suffix);
 const toes=mul([1,2,3,4,5].map(t=>head(`toe${t}-1${suffix}`)).reduce(add,[0,0,0]),1/5);
 const hipTo=[sign*HIP.x,HIP.y,0],kneeTo=add(hipTo,[0,-THIGH,0]),ankleTo=add(kneeTo,[0,-SHIN,0]);
 const rHip=arc(norm(sub(knee,hip)),down),rKnee=matmul(arc(norm(apply(rHip,sub(ankle,knee))),down),rHip);
 const foot=norm(sub(toes,ankle)),rAnkle=matmul(arc(norm(apply(rKnee,foot)),foot),rKnee);
 transforms[BONE.hip[side]]={from:hip,to:hipTo,matrix:matmul(rHip,stretch(norm(sub(knee,hip)),THIGH/len(sub(knee,hip))))};
 transforms[BONE.knee[side]]={from:knee,to:kneeTo,matrix:matmul(rKnee,stretch(norm(sub(ankle,knee)),SHIN/len(sub(ankle,knee))))};
 transforms[BONE.ankle[side]]={from:ankle,to:ankleTo,matrix:matmul(rAnkle,stretch([0,1,0],SOLE/ankle[1]))};
 // Arms: hanging from MakeHuman's shoulder at its own lengths.
 const shoulder=head('upperarm01'+suffix),elbow=head('lowerarm01'+suffix),wrist=head('wrist'+suffix),knuckle=head('finger3-1'+suffix);
 const upper=len(sub(elbow,shoulder)),fore=len(sub(wrist,elbow));
 const elbowTo=add(shoulder,[0,-upper,0]),wristTo=add(elbowTo,[0,-fore,0]);
 const rShoulder=arc(norm(sub(elbow,shoulder)),down),rElbow=matmul(arc(norm(apply(rShoulder,sub(wrist,elbow))),down),rShoulder);
 const rWrist=matmul(arc(norm(apply(rElbow,sub(knuckle,wrist))),down),rElbow);
 transforms[BONE.shoulder[side]]={from:shoulder,to:shoulder,matrix:rShoulder};
 transforms[BONE.elbow[side]]={from:elbow,to:elbowTo,matrix:rElbow};
 transforms[BONE.wrist[side]]={from:wrist,to:wristTo,matrix:rWrist};
 skeleton.shoulders[side]=shoulder;skeleton.elbows[side]=elbowTo;skeleton.wrists[side]=wristTo;
}

// --- Fitted vertices, their four strongest pivots and their kit region.
const eyes=new Set(faces.filter(face=>face.eye).flatMap(face=>face.corners));
const vertices=[...used].sort((a,b)=>a-b),slot=new Map(vertices.map((v,i)=>[v,i]));
const count=vertices.length,position=new Float32Array(count*3),skinIndex=new Uint8Array(count*4),skinWeight=new Uint8Array(count*4),region=new Uint8Array(count);
const neck=head('neck01')[1],waist=skeleton.spine[1];
vertices.forEach((vertex,i)=>{
 let w=[...influence[vertex]];
 if(eyes.has(vertex)||w.every(v=>!v))w=w.map((_,b)=>b===BONE.head?1:0);
 const top=w.map((weight,bone)=>[weight,bone]).sort((a,b)=>b[0]-a[0]).slice(0,4),total=top.reduce((s,[x])=>s+x,0);
 let p=[0,0,0];
 for(const [weight,bone] of top){const t=transforms[bone];p=add(p,mul(add(t.to,apply(t.matrix,sub(mesh[vertex],t.from))),weight/total));}
 // Quantised weights that still add up to exactly 255.
 const bytes=top.map(([x])=>Math.round(x/total*255));bytes[0]+=255-bytes.reduce((s,x)=>s+x,0);
 top.forEach(([,bone],k)=>{skinIndex[i*4+k]=bone;skinWeight[i*4+k]=bytes[k];});
 const main=top[0][1],side=p[0]>0?1:0;
 let part=REGION.skin;
 if(eyes.has(vertex))part=REGION.eye;
 // No collar band: the mesh's rings do not follow a neckline, and a band along them would read as torn.
 else if(main===BONE.spine)part=p[1]>neck-.005&&Math.abs(p[0])<.09?REGION.skin:REGION.shirt;
 else if(main===BONE.body)part=p[1]>waist-.02?REGION.shirt:REGION.shorts;
 else if(main===BONE.shoulder[side]){const d=skeleton.shoulders[side][1]-p[1];part=d<.14?REGION.shirt:d<.16?REGION.trim:REGION.arm;}
 else if(main===BONE.elbow[side])part=REGION.forearm;
 else if(main===BONE.wrist[side])part=REGION.hand;
 else if(main===BONE.hip[side])part=HIP.y-p[1]<.25?REGION.shorts:REGION.skin;
 else if(main===BONE.knee[side]){const knee=HIP.y-THIGH;part=p[1]>knee-.07?REGION.skin:p[1]>knee-.1?REGION.trim:REGION.socks;}
 else if(main===BONE.ankle[side])part=p[1]>HIP.y-THIGH-SHIN+.04?REGION.socks:REGION.boot;
 // Within the top of the boot, the foot is drawn into its shell so that the boot alone shows.
 if(p[1]<HIP.y-THIGH-SHIN+.035){
  const centre=[(side?1:-1)*HIP.x+BOOT.centre[0],HIP.y-THIGH-SHIN+BOOT.centre[1],BOOT.centre[2]],radii=BOOT.radii.map(r=>r*.92);
  const offset=sub(p,centre),reach=Math.sqrt(offset.reduce((s,v,k)=>s+(v/radii[k])**2,0));
  if(reach>1)p=add(centre,mul(offset,1/reach));
  part=REGION.boot;
 }
 position.set(p,i*3);region[i]=part;
});
// MakeHuman's hands are open, fingers spread: they close into a relaxed hand, fingers together and shorter.
for(const side of [0,1]){
 const wrist=skeleton.wrists[side],hand=[...Array(count).keys()].filter(i=>skinIndex[i*4]===BONE.wrist[side]);
 // The width of the palm is the main horizontal spread of the hand.
 let xx=0,xz=0,zz=0;
 for(const i of hand){const x=position[i*3]-wrist[0],z=position[i*3+2]-wrist[2];xx+=x*x;xz+=x*z;zz+=z*z;}
 const angle=.5*Math.atan2(2*xz,xx-zz),across=[Math.cos(angle),0,Math.sin(angle)];
 for(const i of hand){
  const p=[...position.subarray(i*3,i*3+3)],d=wrist[1]-p[1];
  if(d<.04)continue;
  const k=Math.min(1,(d-.04)/.08),offset=dot(sub(p,wrist),across);
  let q=add(p,mul(across,-offset*.4*k));
  if(d>.1)q[1]=wrist[1]-(.1+(d-.1)*.65);
  position.set(q,i*3);
 }
}
let indices=new Uint32Array(faces.flatMap(face=>face.corners.map(c=>slot.get(c))));

// --- Smooth normals, then fewer triangles: region borders stay where they are.
function normals(){
 const out=new Float32Array(count*3);
 for(let t=0;t<indices.length;t+=3){
  const [a,b,c]=[0,1,2].map(k=>indices[t+k]),pa=position.subarray(a*3,a*3+3),pb=position.subarray(b*3,b*3+3),pc=position.subarray(c*3,c*3+3);
  const n=cross(sub(pb,pa),sub(pc,pa));
  for(const v of [a,b,c])for(let k=0;k<3;k++)out[v*3+k]+=n[k];
 }
 for(let v=0;v<count;v++){const n=norm([...out.subarray(v*3,v*3+3)]);out.set(n,v*3);}
 return out;
}
const lock=new Uint8Array(count);
for(let t=0;t<indices.length;t+=3)for(let k=0;k<3;k++){
 const a=indices[t+k],b=indices[t+(k+1)%3];
 if(region[a]!==region[b])lock[a]=lock[b]=1;
}
await MeshoptSimplifier.ready;
const before=indices.length/3;
[indices]=MeshoptSimplifier.simplifyWithAttributes(indices,position,3,normals(),3,[.5,.5,.5],lock,TRIANGLES*3,.02,[]);
const normal=normals();

// --- Only the vertices still in use, in their order of first use.
const remap=new Int32Array(count).fill(-1);let kept=0;
for(const v of indices)if(remap[v]<0)remap[v]=kept++;
const pick=(array,size)=>{const out=new array.constructor(kept*size);for(let v=0;v<count;v++)if(remap[v]>=0)out.set(array.subarray(v*size,v*size+size),remap[v]*size);return out;};
const arrays={position:pick(position,3),normal:pick(normal,3),skinIndex:pick(skinIndex,4),skinWeight:pick(skinWeight,4),region:pick(region,1),
 index:Uint16Array.from(indices,v=>remap[v])};

// --- The skull for the hair caps, and the chest and back for the badge and number.
const fitted=[...Array(kept).keys()].map(v=>[...arrays.position.subarray(v*3,v*3+3)]);
const dominant=v=>arrays.skinIndex[v*4];
const brow=head('eye.L')[1]+.02,skull=fitted.filter((p,v)=>dominant(v)===BONE.head&&p[1]>brow);
const span=k=>[Math.min(...skull.map(p=>p[k])),Math.max(...skull.map(p=>p[k]))];
const [xs,ys,zs]=[0,1,2].map(span);
const chestY=waist+.6*(skeleton.shoulders[0][1]-waist),torso=fitted.filter((p,v)=>dominant(v)===BONE.spine&&Math.abs(p[0])<.11&&Math.abs(p[1]-chestY)<.04);
const header={
 vertices:kept,indices:arrays.index.length,regions:REGION,
 bones:['body','hip.R','knee.R','ankle.R','hip.L','knee.L','ankle.L','spine','shoulder.R','elbow.R','wrist.R','shoulder.L','elbow.L','wrist.L','head'],
 skeleton:{hip:[HIP.x,HIP.y,0],spine:skeleton.spine,head:skeleton.head,shoulder:skeleton.shoulders[1],elbow:skeleton.elbows[1],wrist:skeleton.wrists[1]},
 skull:{centre:[0,brow,(zs[0]+zs[1])/2],radii:[Math.max(-xs[0],xs[1]),ys[1]-brow,(zs[1]-zs[0])/2]},
 chest:{y:chestY,front:Math.max(...torso.map(p=>p[2])),back:Math.min(...torso.map(p=>p[2]))},
 source:'MakeHuman 1.x base mesh hm08, default rig and macro targets, CC0 1.0',
 attributes:[],
};
const chunks=[];let offset=0;
for(const [name,array] of Object.entries(arrays)){
 const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
 header.attributes.push({name,type:array.constructor.name,offset,length:array.length});
 const padded=new Uint8Array(Math.ceil(bytes.length/4)*4);padded.set(bytes);chunks.push(padded);offset+=padded.length;
}
const round=v=>typeof v==='number'?Math.round(v*1e4)/1e4:v;
const json=new TextEncoder().encode(JSON.stringify(header,(key,value)=>Array.isArray(value)?value.map(round):round(value)));
const jsonPadded=new Uint8Array(Math.ceil(json.length/4)*4).fill(32);jsonPadded.set(json);
const file=new Uint8Array(8+jsonPadded.length+offset),view=new DataView(file.buffer);
file.set(new TextEncoder().encode('FMPL'));view.setUint32(4,jsonPadded.length,true);file.set(jsonPadded,8);
let at=8+jsonPadded.length;for(const chunk of chunks){file.set(chunk,at);at+=chunk.length;}
writeFileSync(OUT,file);
console.log(`${before} → ${arrays.index.length/3} triangles, ${kept} vertices, ${file.length} bytes`);
console.log(JSON.stringify({skeleton:header.skeleton,skull:header.skull,chest:header.chest}));
