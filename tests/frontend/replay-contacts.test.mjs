import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../web/vendor/three/three.module.js';
import {Pitch3D} from '../../web/replay-3d.js';
import {readFileSync} from 'node:fs';
import {createPlayerParts,setPlayerModel} from '../../web/replay-player.js';

setPlayerModel(readFileSync(new URL('../../web/models/footballer.bin',import.meta.url)));

// Exercise the production skeleton and pose integration. Canvas labels need no
// drawing here; the meshes and world matrices are the ones used by WebGL.
function view(id,keeper=false){
 const prior=globalThis.document;
 const context=new Proxy({measureText:text=>({width:text.length*24})},{get:(object,key)=>object[key]??(()=>{})});
 globalThis.document={createElement:()=>({getContext:()=>context})};
 try{
  const v=Object.create(Pitch3D.prototype);
  v.materials=new Map();v.parts=createPlayerParts();v.people=new THREE.Group();v.blob=new THREE.MeshBasicMaterial();v.textures=[];
  v.texture=()=>{const texture=new THREE.Texture();v.textures.push(texture);return texture;};
  v.replay={teams:{home:{major:'#ce2233',minor:'#121b24',keeper:'#eacd32'}},names:new Map(),shirts:new Map(),ballZ:0};
  return {v,figure:v.figure('home',id,keeper)};
 }finally{globalThis.document=prior;}
}

const dt=1000/60;
function pose(v,figure,{speed,phase,gesture,ready=0}){
 figure.speed=speed;figure.phase=phase;figure.acceleration=0;figure.ready=ready;
 figure.x=0;figure.z=-speed*dt/1000;figure.course=0;figure.yaw=0;
 v.pose(figure,{x:0,z:0},{x:0,z:10},dt,false,gesture?[gesture]:[],1000);
 figure.root.updateMatrixWorld(true);
}
function eachVertex(mesh,visit){
 const point=new THREE.Vector3(),positions=mesh.geometry.getAttribute('position');
 for(let i=0;i<positions.count;i++)visit(point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld));
}
function bootDistance(figure,side,ball){
 let nearest=Infinity;
 eachVertex(figure.ankles[side].children[0],point=>{nearest=Math.min(nearest,point.distanceTo(ball));});
 return nearest;
}
function soleHeight(figure,side){
 let lowest=Infinity;
 eachVertex(figure.ankles[side].children[1],point=>{lowest=Math.min(lowest,point.y);});
 return lowest;
}

test('a dribbling touch reaches the ball whatever the runner stride phase',()=>{
 const ball=new THREE.Vector3(0,.24,.9);
 const gesture={kind:'touch',at:1000,target:{x:52.5,y:60},contact:{x:52.5,y:34.9,z:0}};
 for(const id of [7,31]){
  const {v,figure}=view(id);
  for(const speed of [1.4,4.5,7.5])for(const foot of [0,1])for(let frame=0;frame<120;frame++){
   figure.foot=foot;
   pose(v,figure,{speed,phase:frame/120*Math.PI*2,gesture});
   const gap=bootDistance(figure,foot,ball)-.24;
   assert.ok(gap<=.015,`dribble misses the ball by ${gap.toFixed(3)} m: id ${id}, speed ${speed}, foot ${foot}, phase ${frame}/120`);
  }
 }
});

test('passes and shots keep their foot at the grounded ball through different incoming strides',()=>{
 const ball=new THREE.Vector3(0,.24,.9),{v,figure}=view(7);
 for(const style of ['pass','shot'])for(const foot of [0,1])for(let frame=0;frame<24;frame++){
  figure.foot=foot;
  const gesture={kind:'kick',style,strength:style==='shot'?1:.5,at:1000,target:{x:52.5,y:60},contact:{x:52.5,y:34.9,z:0}};
  pose(v,figure,{speed:5,phase:frame/24*Math.PI*2,gesture});
  const gap=bootDistance(figure,foot,ball)-.24;
  assert.ok(gap<=.015,`${style} misses the ball by ${gap.toFixed(3)} m: foot ${foot}, phase ${frame}/24`);
 }
});

test('a ready goalkeeper keeps his soles at turf level at rest and during small steps',()=>{
 const {v,figure}=view(1,true);
 for(const speed of [0,.4,.8,1.2])for(let frame=0;frame<120;frame++){
  pose(v,figure,{speed,phase:frame/120*Math.PI*2,ready:1});
  const feet=[soleHeight(figure,0),soleHeight(figure,1)];
  assert.ok(Math.min(...feet)>-.008,`ready keeper penetrates turf: ${feet}, speed ${speed}, phase ${frame}/120`);
  assert.ok(Math.min(...feet)<.025,`walking keeper loses both supports: ${feet}, speed ${speed}, phase ${frame}/120`);
 }
});

test('a ready goalkeeper moves his legs while walking to cover the goal',()=>{
 const {v,figure}=view(1,true),hips=[],knees=[];
 for(let frame=0;frame<120;frame++){
  pose(v,figure,{speed:1.1,phase:frame/120*Math.PI*2,ready:1});
  hips.push(figure.hips[0].rotation.x);knees.push(figure.knees[0].rotation.x);
 }
 assert.ok(Math.max(...hips)-Math.min(...hips)>.12,'the ready stance must not freeze the walking hips');
 assert.ok(Math.max(...knees)-Math.min(...knees)>.12,'the ready stance must not freeze the walking knees');
});

test('a standing tackle stretches one leg low towards the ball, the support sole kept on the turf',()=>{
 const {v,figure}=view(4);
 for(const foot of [0,1])for(const at of [880,1000,1200])for(let frame=0;frame<24;frame++){
  figure.foot=foot;
  const gesture={kind:'tackle',at,target:{x:52.5,y:40}};
  pose(v,figure,{speed:3,phase:frame/24*Math.PI*2,gesture});
  const feet=[soleHeight(figure,0),soleHeight(figure,1)];
  assert.ok(Math.min(...feet)>-.01,`a tackle sinks a foot into the turf: ${feet}, foot ${foot}, at ${at}, phase ${frame}/24`);
  if(at===1000)assert.ok(feet[1-foot]<.03,`the support foot leaves the turf in the lunge: ${feet}, foot ${foot}, phase ${frame}/24`);
 }
});
