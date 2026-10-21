// A small articulated footballer. Geometry and kit materials are shared by the squad;
// only the pivots and shirt-number texture belong to an individual player.
import * as THREE from './vendor/three/three.module.js';
import {gaitStyle} from './replay-locomotion.js';

const SCALE=1.25;
const SKINS=['#f1c9a0','#d9a577','#b27b52','#8a5a3b','#5e3b27'];
const HAIR=['#16110d','#2b1d14','#3f2a1c','#5c3d24','#8a6038','#c9a36a','#7c3a1d'];
const BOOTS=['#161a21','#161a21','#f5f5ec','#d7ff3c','#ff684b','#4484ff'];
const GLOVES=['#eef2f5','#d7ff3c','#ff8a3d'];
const hash=id=>Math.abs(id*2654435761|0);
const seeded=seed=>()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};

// Join small features with the same material, avoiding an extra draw for each ear,
// boot stud or seam. The temporary primitives are not retained by the scene.
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

// Elliptical rings make a jersey with a waist, chest and shoulders instead of a
// vertical capsule. The same shape works for bare thighs and shaped calf socks.
function shaped(rows,segments=12){
 const positions=[],uv=[],indices=[];
 rows.forEach(([y,width,depth],row)=>{
  for(let segment=0;segment<=segments;segment++){
   const angle=segment/segments*Math.PI*2;
   positions.push(Math.sin(angle)*width,y,Math.cos(angle)*depth);uv.push(segment/segments,row/(rows.length-1));
  }
 });
 for(let row=0;row<rows.length-1;row++)for(let segment=0;segment<segments;segment++){
  const a=row*(segments+1)+segment,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function createPlayerParts(){
 return {
  thigh:shaped([[-.45,.065,.067],[-.38,.078,.08],[-.17,.102,.1],[0,.098,.09]]),
  shortsLeg:shaped([[-.24,.112,.103],[-.19,.121,.11],[.025,.126,.112]]),
  shin:shaped([[-.4,.047,.05],[-.29,.054,.061],[-.16,.071,.078],[-.055,.066,.067],[0,.06,.059]]),
  sockCuff:new THREE.CylinderGeometry(.068,.069,.035,10).translate(0,-.067,0),
  boot:oval(.076,.054,.157).translate(0,-.021,.055),
  sole:joined([oval(.078,.018,.159).translate(0,-.063,.055),
   ...[-.043,.043].flatMap(x=>[-.04,.1].map(z=>new THREE.CylinderGeometry(.014,.012,.026,5).translate(x,-.068,z)))]),
  bootTrim:joined([new THREE.BoxGeometry(.075,.008,.06).rotateX(-.15).translate(0,.029,.083),
   new THREE.BoxGeometry(.009,.024,.092).translate(-.071,-.016,.055),new THREE.BoxGeometry(.009,.024,.092).translate(.071,-.016,.055)]),
  pelvis:shaped([[-.11,.16,.114],[-.07,.2,.135],[.11,.187,.126]],14),
  torso:shaped([[.02,.17,.115],[.08,.173,.12],[.29,.207,.139],[.44,.24,.135],[.55,.212,.118],[.59,.12,.078]],16),
  collar:new THREE.TorusGeometry(.071,.015,5,14).rotateX(Math.PI/2).scale(1,1,1.05),
  neck:new THREE.CylinderGeometry(.054,.068,.14,10),
  head:oval(.113,.144,.108).translate(0,.12,0),
  face:joined([oval(.022,.037,.03).translate(0,.115,.103),oval(.023,.037,.018).translate(-.112,.12,0),oval(.023,.037,.018).translate(.112,.12,0)]),
  hair:new THREE.SphereGeometry(.119,14,8,0,Math.PI*2,0,1.72).scale(1,1.2,1.02).rotateX(-.28).translate(0,.132,-.012),
  hairFull:new THREE.SphereGeometry(.128,14,8,0,Math.PI*2,0,1.78).scale(1,1.22,1.03).rotateX(-.2).translate(0,.141,-.011),
  hairSwept:new THREE.SphereGeometry(.121,14,8,0,Math.PI*2,0,1.62).scale(1.02,1.35,1.08).rotateZ(-.16).rotateX(-.32).translate(0,.139,-.014),
  sleeve:shaped([[-.205,.071,.074],[-.12,.078,.08],[-.03,.081,.083],[.035,.046,.05]]),
  upperArm:shaped([[-.31,.048,.053],[-.18,.061,.065],[-.09,.069,.067]]),
  forearm:shaped([[-.275,.036,.038],[-.21,.042,.044],[-.08,.057,.055],[.015,.05,.051]]),
  sleeveCuff:new THREE.CylinderGeometry(.072,.072,.026,10).translate(0,-.202,0),
  hand:oval(.042,.067,.033).translate(0,-.025,.002),
  glove:oval(.066,.088,.043).translate(0,-.038,.009),
  gloveCuff:new THREE.CylinderGeometry(.049,.052,.042,10).translate(0,.024,0),
  front:new THREE.PlaneGeometry(.28,.36),back:new THREE.PlaneGeometry(.29,.31),
  blob:new THREE.CircleGeometry(.62*SCALE,24),
 };
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
  g.fillStyle=trim;g.globalAlpha=.35;g.fillRect(5,146,118,4);
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
 sprite.scale.set(canvas.width/canvas.height*1.3,1.3,1);sprite.position.y=2.75;sprite.renderOrder=2;sprite.visible=false;return sprite;
}

export function createPlayerFigure(view,side,id,keeper){
 const kit=view.replay.teams[side],parts=view.parts,random=seeded(hash(id)),pick=list=>list[Math.floor(random()*list.length)];
 const colour=keeper?kit.keeper:kit.major,trim=keeper?inkOn(colour):kit.minor;
 const shirt=view.material(colour,.86),shorts=view.material(keeper?kit.keeper:kit.minor,.9),accent=view.material(trim,.85);
 const skin=view.material(SKINS[hash(id)%SKINS.length],.78),boots=view.material(pick(BOOTS),.5);
 const hair=random()<.1?null:view.material(pick(HAIR),.95),hands=keeper?view.material(pick(GLOVES),.75):skin;
 const sole=view.material('#252b31',.88),bootTrim=view.material('#edf1ed',.68);
 const body=new THREE.Group();body.rotation.order='YXZ';
 const mesh=(geometry,material,parent,shadow=true)=>{const node=new THREE.Mesh(geometry,material);node.castShadow=shadow;node.receiveShadow=shadow;parent.add(node);return node;};
 const pivot=(parent,x,y,z=0)=>{const node=new THREE.Group();node.position.set(x,y,z);parent.add(node);return node;};
 const hips=[],knees=[],ankles=[],shoulders=[],elbows=[],wrists=[];
 for(const x of [-.105,.105]){
  const hip=pivot(body,x,.93),knee=pivot(hip,0,-.45),ankle=pivot(knee,0,-.4);
  mesh(parts.thigh,skin,hip);mesh(parts.shortsLeg,shorts,hip);
  mesh(parts.shin,shirt,knee);mesh(parts.sockCuff,accent,knee,false);
  mesh(parts.boot,boots,ankle);mesh(parts.sole,sole,ankle,false);mesh(parts.bootTrim,bootTrim,ankle,false);
  hips.push(hip);knees.push(knee);ankles.push(ankle);
 }
 // Spine rotates the shoulders independently of the planted hips. Its local
 // origin is at the waistband; all geometry above it follows the same lean.
 const spine=pivot(body,0,1.02);
 for(const x of [-.235,.235]){
  const shoulder=pivot(spine,x,.54),elbow=pivot(shoulder,0,-.3),wrist=pivot(elbow,0,-.28);
  mesh(parts.upperArm,keeper?shirt:skin,shoulder);mesh(parts.sleeve,shirt,shoulder);mesh(parts.sleeveCuff,accent,shoulder,false);
  mesh(parts.forearm,keeper?shirt:skin,elbow);mesh(keeper?parts.glove:parts.hand,hands,wrist,false);
  if(keeper)mesh(parts.gloveCuff,sole,wrist,false);
  shoulders.push(shoulder);elbows.push(elbow);wrists.push(wrist);
 }
 mesh(parts.pelvis,shorts,body).position.y=.96;
 mesh(parts.torso,shirt,spine);
 mesh(parts.collar,accent,spine,false).position.set(0,.6,0);
 mesh(parts.neck,skin,spine,false).position.y=.65;
 const head=pivot(spine,0,.71);
 mesh(parts.head,skin,head);mesh(parts.face,skin,head,false);
 if(hair)mesh(pick([parts.hair,parts.hairFull,parts.hairSwept]),hair,head,false);
 const front=mesh(parts.front,decal(view,colour,trim,null,true),spine,false);front.position.set(0,.31,.141);
 const number=view.replay.shirts?.get(id)??view.replay.lineups?.[side]?.find(player=>player.id===id)?.shirt;
 if(number!=null){
  const back=mesh(parts.back,decal(view,colour,trim,number,false),spine,false);back.position.set(0,.33,-.141);back.rotation.y=Math.PI;
 }
 // Small stable differences in build, without changing leg length or ball contacts.
 body.scale.set(SCALE*(.94+random()*.12),SCALE,SCALE);
 const root=new THREE.Group();root.add(body);
 const blob=new THREE.Mesh(parts.blob,view.blob);blob.rotation.x=-Math.PI/2;blob.position.y=.025;root.add(blob);
 const name=label(view,view.replay.names.get(id)||'');root.add(name);view.people.add(root);
 const seed=random()*6,style=gaitStyle(seed);
 return {root,body,hips,knees,ankles,spine,head,shoulders,elbows,wrists,name,blob,keeper,foot:random()<.2?0:1,seed,style,
  phase:style.phase,speed:0,acceleration:0,course:null,ready:0,cheer:0,yaw:null,x:null,z:null,dive:null,hold:false};
}
