// Backpedalling, side steps and the guard: the feet follow the travel, the chest the ball.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../../web/vendor/three/three.module.js';
import {Pitch3D} from '../../web/replay-3d.js';
import {createPlayerParts,setPlayerModel} from '../../web/replay-player.js';
import {angleDelta,gaitCycle,gaitStyle,playerMotion,soleHeight} from '../../web/replay-motion.js';
import {SCALE,setMotionLibrary,travelShares} from '../../web/replay-locomotion.js';

setPlayerModel(readFileSync(new URL('../../web/models/footballer.bin',import.meta.url)));
setMotionLibrary(JSON.parse(readFileSync(new URL('../../web/models/motions.json',import.meta.url),'utf8')));
const TAU=Math.PI*2;
// Forward kinematics of the leg, its plane swung out by the hip's roll: where the sole is, in the body's frame.
const footAt=(pose,side)=>{
 const hip=pose.hip[side],shin=hip+pose.knee[side],pitch=shin+pose.ankle[side],roll=pose.hipRoll[side];
 const along=.45*Math.cos(hip)+.4*Math.cos(shin);
 return {z:SCALE*(-.45*Math.sin(hip)-.4*Math.sin(shin)),x:SCALE*along*Math.sin(roll),
  y:pose.lift+SCALE*(.93-along*Math.cos(roll)-soleHeight(pitch))};
};

test('the three ways of moving share out every direction',()=>{
 for(let step=0;step<16;step++){
  const {forward,back,side}=travelShares(step/16*TAU);
  assert.ok(Math.abs(forward+back+side-1)<1e-12);
 }
 assert.equal(travelShares(0).forward,1);
 assert.ok(travelShares(Math.PI).back>.999&&travelShares(Math.PI/2).side>.999);
 assert.ok(gaitCycle(3,gaitStyle(1),Math.PI).stride<gaitCycle(3,gaitStyle(1)).stride*.7,'backwards he takes shorter steps');
});

test('backpedalling and side-stepping keep the support sole planted on the grass',()=>{
 for(const direction of [Math.PI,Math.PI/2,-Math.PI/2,Math.PI*.75])for(const seed of [.2,3.6])for(const speed of [1.5,3,4.2]){
  const style=gaitStyle(seed),{stance,stride}=gaitCycle(speed,style,direction);
  const travel={x:Math.sin(direction),z:Math.cos(direction)};
  for(let side=0;side<2;side++){
   let planted;
   for(let step=0;step<=12;step++){
    const turns=stance*(.2+.35*step/12)+side*.5,pose=playerMotion({speed,phase:turns*TAU,seed,style,direction}),foot=footAt(pose,side);
    const along=turns*stride+foot.x*travel.x+foot.z*travel.z;
    planted??=along;
    assert.ok(Math.abs(along-planted)<.006,`support slides at ${speed} m/s, direction ${direction.toFixed(2)}: ${(along-planted).toFixed(4)}`);
    assert.ok(Math.abs(foot.y)<.012,`support floats or sinks at ${speed} m/s, direction ${direction.toFixed(2)}: ${foot.y.toFixed(4)}`);
   }
  }
  for(let frame=0;frame<120;frame++){
   const pose=playerMotion({speed,phase:frame/120*TAU,seed,style,direction});
   for(let side=0;side<2;side++)assert.ok(footAt(pose,side).y>-.012,'no foot goes through the grass');
   for(const value of [...pose.hip,...pose.knee,...pose.hipRoll,pose.lift])assert.ok(Number.isFinite(value));
  }
 }
});

test('stepping sideways swings the thighs out, running ahead keeps them in their plane',()=>{
 const style=gaitStyle(1);
 let widest=0;
 for(let frame=0;frame<60;frame++){
  const ahead=playerMotion({speed:4,phase:frame/60*TAU,seed:1,style});
  assert.ok(ahead.hipRoll.every(roll=>Math.abs(roll)<1e-12));
  const across=playerMotion({speed:2.5,phase:frame/60*TAU,seed:1,style,direction:Math.PI/2});
  widest=Math.max(widest,...across.hipRoll.map(Math.abs));
 }
 assert.ok(widest>.15,`a side step opens the hips: ${widest}`);
});

test('a guard stance lowers the pelvis, leans in and spreads the arms',()=>{
 const style=gaitStyle(2),open=playerMotion({speed:1,phase:1,seed:2,style}),guard=playerMotion({speed:1,phase:1,seed:2,style,crouch:1});
 assert.ok(guard.lift<open.lift-.08);
 assert.ok(guard.lean>open.lean+.15);
 assert.ok(guard.spread[0]>open.spread[0]&&guard.spread[1]>open.spread[1]);
 for(let side=0;side<2;side++)assert.ok(guard.knee[side]>open.knee[side],'the knees bend');
});

function view(id=4,keeper=false){
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
// He retreats along +z at `speed` while the ball is ahead of him, further down -z.
function retreat(speed,context){
 const {v,figure}=view(),dt=1000/60;
 v.pose(figure,{x:0,z:0},{x:0,z:-25},0,false,[],0);
 for(let frame=1;frame<=150;frame++)v.pose(figure,{x:0,z:frame*dt*speed/1000},{x:0,z:-25},dt,false,[],frame*dt,false,context);
 return figure;
}

test('a defender retreats facing the ball, then turns and runs once the pace is too high',()=>{
 const backpedal=retreat(3,{defending:true});
 assert.ok(Math.abs(angleDelta(backpedal.yaw,Math.PI))<.1,`he faces the ball: ${backpedal.yaw}`);
 assert.ok(Math.abs(Math.abs(backpedal.direction)-Math.PI)<.15,'and travels backwards');
 const sprint=retreat(7.5,{defending:true});
 assert.ok(Math.abs(angleDelta(sprint.yaw,0))<.1,'at a sprint he runs facing his way');
 const attacker=retreat(3,{defending:false});
 assert.ok(Math.abs(angleDelta(attacker.yaw,0))<.1,'a man of the side in possession jogs back facing his way');
});

test('a defender guarding the ball carrier faces him low on his legs, and his rendered soles stay on the grass',()=>{
 const {v,figure}=view(),dt=1000/60;
 v.pose(figure,{x:0,z:0},{x:-3,z:-3},0,false,[],0);
 for(let frame=1;frame<=90;frame++)v.pose(figure,{x:frame*dt*1.8/1000,z:0},{x:-3,z:-3},dt,false,[],frame*dt,false,{defending:true,guard:true});
 assert.ok(figure.guard>.9);
 const gaze=Math.atan2(-3-figure.x,-3-figure.z);
 assert.ok(Math.abs(angleDelta(figure.yaw,gaze))<.15,'he faces the man on the ball');
 figure.root.updateMatrixWorld(true);
 for(const ankle of figure.ankles){
  const position=ankle.getWorldPosition(new THREE.Vector3());
  assert.ok(position.y>.02&&position.y<.45,`an ankle is off the grass: ${position.y}`);
 }
});
