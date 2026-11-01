// The ground answers the play: the net bulges where a goal strikes it, a post hit sways, the flags flap; and every
// player has the four faint shadows of the floodlights.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../web/vendor/three/three.module.js';
import {readFileSync} from 'node:fs';
import {Pitch3D} from '../../web/replay-3d.js';
import {createPlayerParts,setPlayerModel} from '../../web/replay-player.js';

setPlayerModel(readFileSync(new URL('../../web/models/footballer.bin',import.meta.url)));

// The two goals and one flag, built by the production code without a renderer.
function ground(){
 const prior=globalThis.document,context=new Proxy({},{get:(object,key)=>object[key]??(()=>{})});
 globalThis.document={createElement:()=>({getContext:()=>context})};
 try{
  const v=Object.create(Pitch3D.prototype);
  v.materials=new Map();v.textures=[];v.texture=()=>new THREE.Texture();
  v.goals=[v.goal(0),v.goal(105)];
  v.flags=[];
  return v;
 }finally{globalThis.document=prior;}
}
const offset=(goal)=>{
 const geometry=goal.userData.back.geometry,position=geometry.getAttribute('position'),base=geometry.userData.base;
 let most=0;for(let k=0;k<position.count;k++)most=Math.max(most,Math.hypot(position.getX(k)-base[k*3],position.getY(k)-base[k*3+1]));
 return most;
};

test('a goal bulges the back of the net where the ball strikes it, then the net settles',()=>{
 const v=ground(),shot={kind:'shot',outcome:'goal',t0:1000,duration:500,target:{x:105,y:35},net:{at:1700,x:106.4,y:36,z:.6}};
 v.stadium(1650,shot,false);
 assert.equal(offset(v.goals[1]),0,'nothing before it gets there');
 v.stadium(1800,shot,false);
 assert.ok(offset(v.goals[1])>.2,`the net bulges: ${offset(v.goals[1]).toFixed(2)} m`);
 assert.equal(offset(v.goals[0]),0,'only that goal');
 const geometry=v.goals[1].userData.back.geometry,position=geometry.getAttribute('position'),base=geometry.userData.base;
 let deepest=null,most=0;
 for(let k=0;k<position.count;k++){const out=position.getX(k)-base[k*3];if(out>most){most=out;deepest=k;}}
 assert.ok(Math.abs(base[deepest*3+2]-2)<1,'around where the ball came in, across the goal');
 v.stadium(1700+2000,shot,false);
 assert.equal(offset(v.goals[1]),0,'settled');
});

test('a shot off the post sways the frame a moment, then it stands still',()=>{
 const v=ground(),shot={kind:'shot',outcome:'off_target',post:true,t0:1000,duration:400,target:{x:105,y:30.3}};
 const rest=v.goals[1].position.x;
 const sway=[1410,1440,1470,1500].map(time=>{v.stadium(time,shot,false);return Math.abs(v.goals[1].position.x-rest);});
 assert.ok(Math.max(...sway)>.005,'it sways');
 v.stadium(2400,shot,false);
 assert.equal(v.goals[1].position.x,rest);
 assert.equal(v.goals[0].position.x,-52.5);
});

test('every player has the four crossed shadows of the floodlights',()=>{
 const geometry=createPlayerParts().cross,position=geometry.getAttribute('position');
 const quarters=new Set();
 for(let k=0;k<position.count;k++){const x=position.getX(k),y=position.getY(k);if(Math.hypot(x,y)>1)quarters.add(`${Math.sign(x)}${Math.sign(y)}`);}
 assert.deepEqual([...quarters].sort(),['-1-1','-11','1-1','11'],'one towards each corner');
});
