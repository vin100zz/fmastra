import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../web/vendor/three/three.module.js';
import {Pitch3D} from '../../web/replay-3d.js';
import {readFileSync} from 'node:fs';
import {createPlayerParts,setPlayerModel} from '../../web/replay-player.js';

setPlayerModel(readFileSync(new URL('../../web/models/footballer.bin',import.meta.url)));
import {angleDelta,gaitCycle,strideLength} from '../../web/replay-motion.js';
import {SCALE} from '../../web/replay-locomotion.js';

// Use the real skeleton and its world matrices; canvas drawing does not affect
// the glove/ball and foot/grass contacts tested here. No WebGL context is needed.
function view({id=1,keeper=true}={}){
 const prior=globalThis.document;
 const context=new Proxy({measureText:text=>({width:text.length*24})},{get:(object,key)=>object[key]??(()=>{})});
 globalThis.document={createElement:()=>({getContext:()=>context})};
 const v=Object.create(Pitch3D.prototype);
 v.materials=new Map();v.parts=createPlayerParts();v.people=new THREE.Group();v.blob=new THREE.MeshBasicMaterial();v.textures=[];
 v.texture=()=>{const texture=new THREE.Texture();v.textures.push(texture);return texture;};
 v.replay={teams:{home:{major:'#ce2233',minor:'#121b24',keeper:'#eacd32'}},names:new Map([[1,'Keeper']]),shirts:new Map([[1,1]]),ballZ:0};
 v.ball=new THREE.Mesh();v.ballShadow=new THREE.Mesh();
 const figure=v.figure('home',id,keeper);
 globalThis.document=prior;
 return {v,figure};
}
const centreOfGloves=figure=>{
 figure.root.updateMatrixWorld(true);
 return figure.wrists[0].getWorldPosition(new THREE.Vector3()).add(figure.wrists[1].getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const snapshot=figure=>[figure.body,figure.spine,figure.head,...figure.hips,...figure.knees,...figure.ankles,...figure.shoulders,...figure.elbows]
 .map(joint=>[...joint.position.toArray(),...joint.rotation.toArray()]);

test('a high diving save reaches the interception with its gloves, on either side',()=>{
 for(const side of [-1,1]){
  const {v,figure}=view(),at={x:12,z:-8};
  figure.dive={start:1000,duration:600,distance:2.4,height:2,side,yaw:.7};
  v.pose(figure,at,{x:10,z:3},16,false,[],1600);
  const gloves=centreOfGloves(figure);
  near(gloves.x,at.x);near(gloves.z,at.z);near(gloves.y,.24+2*SCALE);
  figure.hold=true;v.placeBall({x:30,z:14},figure);
  near(v.ball.position.x,gloves.x);near(v.ball.position.y,gloves.y);near(v.ball.position.z,gloves.z);
 }
});

test('a low save stays at ground level and the held ball follows the recovery',()=>{
 const {v,figure}=view(),at={x:12,z:-8};
 figure.dive={start:1000,duration:600,distance:2.4,height:0,side:-1,yaw:-.8};
 v.pose(figure,at,{x:10,z:3},16,false,[],1600);
 const low=centreOfGloves(figure);
 assert.ok(low.y>=.2&&low.y<.4,'gloves reach the rolling ball');
 figure.hold=true;
 v.pose(figure,at,{x:10,z:3},16,false,[],2400);
 v.placeBall({x:30,z:14},figure);
 const rising=centreOfGloves(figure);
 assert.ok(rising.y>low.y,'keeper gathers the ball while rising');
 near(v.ball.position.x,rising.x);near(v.ball.position.y,rising.y);near(v.ball.position.z,rising.z);
});

test('pausing preserves every joint and a new scene clears a previous dive',()=>{
 const {v,figure}=view(),at={x:12,z:-8};
 figure.dive={start:1000,duration:600,distance:2.4,height:2,side:1,yaw:0};
 v.pose(figure,at,{x:10,z:3},16,false,[],1450);
 const paused=snapshot(figure);
 for(let frame=0;frame<20;frame++)v.pose(figure,at,{x:10,z:3},0,false,[],1450);
 assert.deepEqual(snapshot(figure),paused);
 // update() clears dive when the replay run or scene changes, then poses afresh.
 figure.dive=null;
 v.pose(figure,{x:-30,z:10},{x:-25,z:3},0,false,[],1450,true);
 near(figure.body.rotation.z,0);
 assert.ok(Math.hypot(figure.body.position.x,figure.body.position.z)<.01,'reset clears the dive offset while retaining natural idle weight shift');
 // Hands back at standing height: a real arm hangs its wrists below the waist, well above a dive's turf.
 assert.ok(centreOfGloves(figure).y>.8);
});

test('a straight low shot is smothered with bent knees and hands near the turf',()=>{
 const {v,figure}=view(),at={x:12,z:-8};
 figure.dive={start:1000,duration:600,distance:0,height:0,side:1,yaw:0};
 v.pose(figure,at,{x:10,z:3},16,false,[],1600);
 const hands=centreOfGloves(figure);
 assert.ok(hands.y<.4&&hands.y>=.2,'hands must not reach above the head for a rolling shot');
 for(const knee of figure.knees)assert.ok(knee.rotation.x>1.5,'knees fold into the low gather');
 near(figure.body.rotation.z,0);
});

test('the broadcast camera does not drift when replay time is frozen',()=>{
 const v=Object.create(Pitch3D.prototype);v.camera=new THREE.PerspectiveCamera(25,2,1,500);v.look={x:0,z:0};
 v.frameCamera({x:12,z:6},false,16);
 const look={...v.look},position=v.camera.position.clone(),rotation=v.camera.quaternion.clone();
 for(let frame=0;frame<20;frame++)v.frameCamera({x:12,z:6},false,0);
 assert.deepEqual(v.look,look);assert.ok(v.camera.position.equals(position));assert.ok(v.camera.quaternion.equals(rotation));
});

test('different players start on individual strides and keep different cadences',()=>{
 const figures=[1,2,3,4].map(id=>view({id,keeper:false}).figure);
 const first=figures[0];
 for(const other of figures.slice(1)){
  assert.ok(Math.abs(angleDelta(first.phase,other.phase))>.01,'players must not enter a scene on the same footfall');
  assert.ok(Math.abs(gaitCycle(6,first.style).cadence-gaitCycle(6,other.style).cadence)>.001,'personal styles must change cadence as well as phase');
 }
 const recreated=view({id:1,keeper:false}).figure;
 near(recreated.phase,first.phase);
 assert.deepEqual(recreated.style,first.style,'replays retain the same player-specific movement');
});

test('the same run advances the same stride phase at 30, 60 or 120 frames per second',()=>{
 let reference;
 for(const fps of [30,60,120])for(const playback of [1,2,4]){
  const {v,figure}=view({id:7,keeper:false}),speed=6,duration=2000;
  const frames=fps*2/playback,dt=duration/frames,initial=figure.phase;
  v.pose(figure,{x:0,z:0},{x:0,z:30},0,false,[],0);
  for(let frame=1;frame<=frames;frame++){
   const time=frame*dt;
   v.pose(figure,{x:0,z:speed*time/1000},{x:0,z:30},dt,false,[],time);
  }
  near(figure.phase-initial,speed*duration/1000/strideLength(speed,figure.style)*Math.PI*2);
  reference??=figure.phase;
  near(figure.phase,reference);
  const paused=snapshot(figure),phase=figure.phase;
  for(let frame=0;frame<5;frame++)v.pose(figure,{x:0,z:12},{x:0,z:30},0,false,[],duration);
  assert.deepEqual(snapshot(figure),paused,'pausing a run freezes all joints');
  near(figure.phase,phase);
 }
});

test('one stationary position sample does not turn a running player back towards the ball',()=>{
 const {v,figure}=view({keeper:false}),dt=1000/60;
 v.pose(figure,{x:0,z:0},{x:0,z:-20},0,false,[],0);
 for(let frame=1;frame<=120;frame++)v.pose(figure,{x:0,z:frame*.1},{x:0,z:-20},dt,false,[],frame*dt);
 const heading=figure.yaw,course=figure.course;
 v.pose(figure,{x:0,z:12},{x:0,z:-20},dt,false,[],121*dt);
 assert.ok(Math.abs(angleDelta(heading,figure.yaw))<.001,'one duplicated dot position must not start a turn towards the trailing ball');
 near(figure.course,course);
 assert.ok(Math.abs(angleDelta(figure.yaw,0))<.001,'a player keeps facing along his run');
});

test('rendered support ankles stay planted through the flat part of each stance',()=>{
 for(const speed of [1,3,6,9]){
  const {v,figure}=view({id:7,keeper:false}),{stance,stride}=gaitCycle(speed,figure.style);
  const startCycle=stance*.2;
  figure.speed=speed;figure.phase=startCycle*Math.PI*2;figure.course=0;
  v.pose(figure,{x:0,z:0},{x:0,z:30},0,false,[],0);
  figure.root.updateMatrixWorld(true);
  const planted=figure.ankles[0].getWorldPosition(new THREE.Vector3());
  for(let step=1;step<=12;step++){
   const travel=stride*stance*.35*step/12,dt=stride*stance*.35/12/speed*1000;
   v.pose(figure,{x:0,z:travel},{x:0,z:30},dt,false,[],step*dt);
   figure.root.updateMatrixWorld(true);
   const ankle=figure.ankles[0].getWorldPosition(new THREE.Vector3());
   assert.ok(ankle.distanceTo(planted)<.02,`rendered support slides at ${speed} m/s: ${ankle.distanceTo(planted)} m`);
  }
 }
});
