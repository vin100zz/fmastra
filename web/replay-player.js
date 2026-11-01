// An articulated footballer: a skinned body driven by the replay's pivots, with boots, hair, badge and number.
// The body's shape, the boots and the materials are shared by the squad; the pivots, the kit colours of the body
// and the shirt-number texture belong to an individual player.
import * as THREE from './vendor/three/three.module.js';
import {SCALE,gaitStyle} from './replay-locomotion.js';

// The name above a player, in metres, and the layer of what is drawn without ambient occlusion (labels, blob shadows).
export const LABEL=2.4,OVERLAY=1;
const SKINS=['#f1c9a0','#d9a577','#b27b52','#8a5a3b','#5e3b27'];
const HAIR=['#16110d','#2b1d14','#3f2a1c','#5c3d24','#8a6038','#c9a36a','#7c3a1d'];
const BOOTS=['#161a21','#161a21','#f5f5ec','#d7ff3c','#ff684b','#4484ff'];
const GLOVES=['#eef2f5','#d7ff3c','#ff8a3d'];
const hash=id=>Math.abs(id*2654435761|0);
const seeded=seed=>()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};

// Join small features with the same material, avoiding an extra draw for each boot stud
// or seam. The temporary primitives are not retained by the scene.
function joined(pieces){
 const geometry=new THREE.BufferGeometry(),attributes={position:[],normal:[],uv:[]};
 for(const piece of pieces){
  const flat=piece.index?piece.toNonIndexed():piece;
  for(const name of Object.keys(attributes))attributes[name].push(...flat.getAttribute(name).array);
  if(flat!==piece)flat.dispose();piece.dispose();
 }
 for(const [name,array] of Object.entries(attributes))geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,name==='uv'?2:3));
 return geometry;
}
const oval=(x,y,z)=>new THREE.SphereGeometry(1,12,8).scale(x,y,z);

// The body: MakeHuman's base mesh (CC0) fitted onto these pivots by tools/build_player_model.mjs, one skinned
// mesh whose vertices carry the part of the kit that covers them.
const MODEL_MAGIC='FMPL';
let model=null,loading=null;
export function setPlayerModel(bytes){
 const data=bytes instanceof ArrayBuffer?new Uint8Array(bytes):new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(new TextDecoder().decode(data.subarray(0,4))!==MODEL_MAGIC)throw new Error('not a player model');
 const size=new DataView(data.buffer,data.byteOffset).getUint32(4,true),header=JSON.parse(new TextDecoder().decode(data.subarray(8,8+size)));
 const arrays={};
 for(const {name,type,offset,length} of header.attributes){
  const Type=globalThis[type],start=8+size+offset;
  arrays[name]=new Type(data.slice(start,start+length*Type.BYTES_PER_ELEMENT).buffer);
 }
 model={...header,arrays,
  position:new THREE.BufferAttribute(arrays.position,3),normal:new THREE.BufferAttribute(arrays.normal,3),
  skinIndex:new THREE.BufferAttribute(arrays.skinIndex,4),skinWeight:new THREE.BufferAttribute(arrays.skinWeight,4,true),
  index:new THREE.BufferAttribute(arrays.index,1)};
 return model;
}
export function loadPlayerModel(url){
 return loading??=fetch(url).then(response=>{if(!response.ok)throw new Error(`player model: ${response.status}`);return response.arrayBuffer();})
  .then(setPlayerModel);
}
const relative=(point,origin)=>[point[0]-origin[0],point[1]-origin[1],point[2]-origin[2]];

// The hair: a cap of the skull's ellipsoid, wide enough to clear the scalp (whose farthest points stand 11 % out
// of that ellipsoid), tilted so that it covers the back of the head lower than the forehead.
function hairCap(theta,[kx,ky,kz],tilt,lean=0){
 const {skull,skeleton}=model,[cx,cy,cz]=relative(skull.centre,skeleton.head),[rx,ry,rz]=skull.radii;
 return new THREE.SphereGeometry(1,14,8,0,Math.PI*2,0,theta).scale(rx*kx,ry*ky,rz*kz).rotateZ(lean).rotateX(tilt).translate(cx,cy,cz-rz*.04);
}

export function createPlayerParts(){
 if(!model)throw new Error('the player model is not loaded');
 return {
  boot:oval(.06,.054,.157).translate(0,-.021,.055),
  sole:joined([oval(.062,.018,.159).translate(0,-.063,.055),
   ...[-.034,.034].flatMap(x=>[-.04,.1].map(z=>new THREE.CylinderGeometry(.014,.012,.026,5).translate(x,-.068,z)))]),
  bootTrim:joined([new THREE.BoxGeometry(.06,.008,.06).rotateX(-.15).translate(0,.029,.083),
   new THREE.BoxGeometry(.009,.024,.092).translate(-.056,-.016,.055),new THREE.BoxGeometry(.009,.024,.092).translate(.056,-.016,.055)]),
  hair:hairCap(1.72,[1.15,1.14,1.14],-.3),
  hairFull:hairCap(1.84,[1.19,1.19,1.17],-.22),
  hairSwept:hairCap(1.62,[1.15,1.36,1.16],-.34,-.14),
  front:new THREE.PlaneGeometry(.28,.36),back:new THREE.PlaneGeometry(.29,.31),
  blob:new THREE.CircleGeometry(.62*SCALE,24),
 };
}

// One material for every body: the kit and the skin are vertex colours, `fabric` tells the cloth (matt, with the
// sheen of knitted fabric under the floodlights) from the skin (a little more satin).
function bodyMaterial(view){
 const key='player-body';
 if(view.materials.has(key))return view.materials.get(key);
 const material=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.85,sheen:.7,sheenRoughness:.45,sheenColor:'#ffffff'});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float fabric;\nvarying float vFabric;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvFabric=fabric;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vFabric;')
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.6,.86,vFabric);')
   .replace('#include <lights_physical_fragment>',THREE.ShaderChunk.lights_physical_fragment
    .replace('material.sheenColor = sheenColor;','material.sheenColor = sheenColor*vFabric*(.45+.55*diffuseColor.rgb);'));
 };
 material.customProgramCacheKey=()=>key;
 view.materials.set(key,material);return material;
}

// The colour of each region of the model, and whether it is cloth, for one player.
function bodyGeometry(palette){
 const geometry=new THREE.BufferGeometry(),regions=model.arrays.region,colour=new Float32Array(regions.length*3),fabric=new Float32Array(regions.length);
 const byRegion=Object.fromEntries(Object.entries(model.regions).map(([name,index])=>[index,[new THREE.Color(palette[name][0]),palette[name][1]]]));
 regions.forEach((region,vertex)=>{const [tint,cloth]=byRegion[region];tint.toArray(colour,vertex*3);fabric[vertex]=cloth;});
 for(const name of ['position','normal','skinIndex','skinWeight'])geometry.setAttribute(name,model[name]);
 geometry.setAttribute('color',new THREE.BufferAttribute(colour,3));geometry.setAttribute('fabric',new THREE.BufferAttribute(fabric,1));
 geometry.setIndex(model.index);
 return geometry;
}

function inkOn(colour){
 const c=new THREE.Color(colour);return .2126*c.r+.7152*c.g+.0722*c.b>.3?'#17212b':'#fffdf4';
}
function decal(view,colour,trim,number,front){
 const key=`player-decal:${colour}:${trim}:${front?'front':number}`;
 if(view.materials.has(key))return view.materials.get(key);
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=160;
 const g=canvas.getContext('2d');g.clearRect(0,0,128,160);
 if(front){
  // A simple club-colour badge and a tailored shoulder/chest seam, without
  // invented sponsor names. They remain legible when the camera comes closer.
  g.fillStyle=trim;g.beginPath();g.moveTo(84,29);g.lineTo(105,29);g.lineTo(103,49);g.lineTo(94,56);g.lineTo(86,49);g.closePath();g.fill();
  g.fillStyle=inkOn(trim);g.fillRect(92,32,4,14);
  g.fillStyle=inkOn(colour);g.globalAlpha=.48;g.fillRect(18,31,18,4);g.globalAlpha=1;
 }else{
  g.fillStyle=inkOn(colour);g.font='800 108px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';
  g.fillText(String(number),64,83,118);
 }
 const material=new THREE.MeshStandardMaterial({map:view.texture(canvas),roughness:.9,alphaTest:.25,polygonOffset:true,polygonOffsetFactor:-1});
 view.materials.set(key,material);return material;
}

function label(view,text){
 const canvas=document.createElement('canvas'),g=canvas.getContext('2d'),font='700 44px system-ui,sans-serif';
 g.font=font;canvas.width=Math.ceil(g.measureText(text).width)+24;canvas.height=64;
 g.font=font;g.textAlign='center';g.textBaseline='middle';g.lineWidth=8;g.strokeStyle='#000a';g.fillStyle='#fff';
 g.strokeText(text,canvas.width/2,32);g.fillText(text,canvas.width/2,32);
 // The label is explicitly disposed when a substitute removes this figure.
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));
 sprite.scale.set(canvas.width/canvas.height*1.3,1.3,1);sprite.position.y=LABEL;sprite.renderOrder=2;sprite.layers.set(OVERLAY);sprite.visible=false;return sprite;
}

export function createPlayerFigure(view,side,id,keeper){
 const kit=view.replay.teams[side],parts=view.parts,random=seeded(hash(id)),pick=list=>list[Math.floor(random()*list.length)];
 const colour=keeper?kit.keeper:kit.major,trim=keeper?inkOn(colour):kit.minor,skin=SKINS[hash(id)%SKINS.length];
 const boot=pick(BOOTS),boots=view.material(boot,.5);
 const hair=random()<.1?null:view.material(pick(HAIR),.95),gloves=keeper?pick(GLOVES):skin;
 const sole=view.material('#252b31',.88),bootTrim=view.material('#edf1ed',.68);
 const body=new THREE.Group();body.rotation.order='YXZ';
 const mesh=(geometry,material,parent,shadow=true)=>{const node=new THREE.Mesh(geometry,material);node.castShadow=shadow;node.receiveShadow=shadow;parent.add(node);return node;};
 const pivot=(parent,[x,y,z])=>{const node=new THREE.Group();node.position.set(x,y,z);parent.add(node);return node;};
 const {skeleton:at,chest}=model,hips=[],knees=[],ankles=[],shoulders=[],elbows=[],wrists=[];
 for(const sign of [-1,1]){
  const hip=pivot(body,[sign*at.hip[0],at.hip[1],at.hip[2]]),knee=pivot(hip,[0,-.45,0]),ankle=pivot(knee,[0,-.4,0]);
  mesh(parts.boot,boots,ankle);mesh(parts.sole,sole,ankle,false);mesh(parts.bootTrim,bootTrim,ankle,false);
  hips.push(hip);knees.push(knee);ankles.push(ankle);
 }
 // Spine rotates the shoulders independently of the planted hips. Its local
 // origin is at the waistband; all geometry above it follows the same lean.
 const spine=pivot(body,at.spine);
 for(const sign of [-1,1]){
  const shoulder=pivot(spine,relative([sign*at.shoulder[0],at.shoulder[1],at.shoulder[2]],at.spine));
  const elbow=pivot(shoulder,[0,at.elbow[1]-at.shoulder[1],0]),wrist=pivot(elbow,[0,at.wrist[1]-at.elbow[1],0]);
  shoulders.push(shoulder);elbows.push(elbow);wrists.push(wrist);
 }
 const head=pivot(spine,relative(at.head,at.spine));
 if(hair)mesh(pick([parts.hair,parts.hairFull,parts.hairSwept]),hair,head,false);
 const front=mesh(parts.front,decal(view,colour,trim,null,true),spine,false);front.position.set(0,chest.y-.04-at.spine[1],chest.front+.008-at.spine[2]);
 const number=view.replay.shirts?.get(id)??view.replay.lineups?.[side]?.find(player=>player.id===id)?.shirt;
 if(number!=null){
  const back=mesh(parts.back,decal(view,colour,trim,number,false),spine,false);
  back.position.set(0,chest.y+.02-at.spine[1],chest.back-.01-at.spine[2]);back.rotation.y=Math.PI;
 }
 // Small stable differences in build, without changing leg length or ball contacts.
 body.scale.set(SCALE*(.94+random()*.12),SCALE,SCALE);
 const root=new THREE.Group();root.add(body);
 // The skin is bound in this rest pose, every pivot unturned: the pivots then drive it as bones.
 const palette={skin:[skin,0],shirt:[colour,1],trim:[trim,1],arm:keeper?[colour,1]:[skin,0],forearm:keeper?[colour,1]:[skin,0],hand:[gloves,keeper?1:0],
  shorts:[keeper?kit.keeper:kit.minor,1],socks:[colour,1],boot:[boot,0],eye:['#2a1d16',0]};
 const figure=new THREE.SkinnedMesh(bodyGeometry(palette),bodyMaterial(view));
 figure.castShadow=figure.receiveShadow=true;
 figure.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,0),2.4);
 body.add(figure);root.updateMatrixWorld(true);
 const bones=[body,hips[0],knees[0],ankles[0],hips[1],knees[1],ankles[1],spine,shoulders[0],elbows[0],wrists[0],shoulders[1],elbows[1],wrists[1],head];
 const skeleton=new THREE.Skeleton(bones);figure.bind(skeleton);
 const blob=new THREE.Mesh(parts.blob,view.blob);blob.rotation.x=-Math.PI/2;blob.position.y=.025;blob.layers.set(OVERLAY);root.add(blob);
 const name=label(view,view.replay.names.get(id)||'');root.add(name);view.people.add(root);
 const seed=random()*6,style=gaitStyle(seed);
 return {root,body,hips,knees,ankles,spine,head,shoulders,elbows,wrists,name,blob,keeper,foot:random()<.2?0:1,seed,style,skin:figure,skeleton,
  phase:style.phase,speed:0,acceleration:0,course:null,ready:0,cheer:0,yaw:null,x:null,z:null,dive:null,hold:false};
}
