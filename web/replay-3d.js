// The replay seen from the main stand, as on television. match-replay.js still plays the match: this view reads
// where its players and ball are at each frame and draws them in 3D, without changing anything.
// Pitch units are metres: x along the touchline (0 to 105), y across (0 at the far touchline, 68 at the near one).
import * as THREE from './vendor/three/three.module.js';

const W=105,H=68,MARGIN_X=6,MARGIN_Y=5;
// The players are drawn a little larger than life so that they read from the stand.
const SCALE=1.25;
const SKINS=['#f1c9a0','#d9a577','#b27b52','#8a5a3b','#5e3b27'];
// Metres of ball height for one unit of the replay's loft.
const LOFT=4;
const lerp=(a,b,k)=>a+(b-a)*k;
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
const toWorld=(x,y)=>({x:x-W/2,z:y-H/2});
// Shortest turn from one heading to another.
const turn=(from,to,k)=>from+(((to-from+Math.PI*3)%(Math.PI*2))-Math.PI)*k;

function pitchTexture(renderer){
 const scale=16,canvas=document.createElement('canvas');
 canvas.width=(W+2*MARGIN_X)*scale;canvas.height=(H+2*MARGIN_Y)*scale;
 const g=canvas.getContext('2d');
 g.fillStyle='#1f5236';g.fillRect(0,0,canvas.width,canvas.height);
 g.translate(MARGIN_X*scale,MARGIN_Y*scale);g.scale(scale,scale);
 g.fillStyle='#246040';
 for(let stripe=0;stripe<10;stripe++)if(stripe%2)g.fillRect(stripe*W/10,-MARGIN_Y,W/10,H+2*MARGIN_Y);
 g.strokeStyle='#ffffffd9';g.lineWidth=.14;
 const box=(x,y,w,h)=>g.strokeRect(x,y,w,h);
 box(0,0,W,H);
 g.beginPath();g.moveTo(W/2,0);g.lineTo(W/2,H);g.stroke();
 g.beginPath();g.arc(W/2,H/2,9.15,0,Math.PI*2);g.stroke();
 box(0,H/2-20.16,16.5,40.32);box(W-16.5,H/2-20.16,16.5,40.32);
 box(0,H/2-9.16,5.5,18.32);box(W-5.5,H/2-9.16,5.5,18.32);
 const arc=Math.acos(5.5/9.15);
 g.beginPath();g.arc(11,H/2,9.15,-arc,arc);g.stroke();
 g.beginPath();g.arc(W-11,H/2,9.15,Math.PI-arc,Math.PI+arc);g.stroke();
 g.fillStyle='#ffffffd9';
 for(const x of [11,W/2,W-11]){g.beginPath();g.arc(x,H/2,.22,0,Math.PI*2);g.fill();}
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
 return texture;
}

// The name above a player, drawn once and shown while he takes part in the move.
function label(text){
 const canvas=document.createElement('canvas'),g=canvas.getContext('2d'),font='700 44px system-ui,sans-serif';
 g.font=font;canvas.width=Math.ceil(g.measureText(text).width)+24;canvas.height=64;
 g.font=font;g.textAlign='center';g.textBaseline='middle';g.lineWidth=8;g.strokeStyle='#000a';g.fillStyle='#fff';
 g.strokeText(text,canvas.width/2,32);g.fillText(text,canvas.width/2,32);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));
 sprite.scale.set(canvas.width/canvas.height*1.3,1.3,1);sprite.position.y=2.75;sprite.renderOrder=2;sprite.visible=false;
 return sprite;
}

export class Pitch3D{
 constructor(replay){
  this.replay=replay;
  this.canvas=document.createElement('canvas');
  this.canvas.className='replay-3d';
  this.canvas.setAttribute('aria-hidden','true');
  const renderer=this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true});
  renderer.setPixelRatio(Math.min(2,devicePixelRatio));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=this.scene=new THREE.Scene();
  scene.background=new THREE.Color('#141d26');
  scene.fog=new THREE.Fog('#141d26',140,260);
  this.camera=new THREE.PerspectiveCamera(26,1.5,1,400);
  scene.add(new THREE.HemisphereLight('#e6eeff','#2c4a31',1.6));
  const sun=new THREE.DirectionalLight('#fff6e6',2.2);
  sun.position.set(-35,70,25);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-62,right:62,top:42,bottom:-42,near:10,far:160});
  sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0005;
  scene.add(sun);
  this.materials=new Map();
  this.build();
  this.figures=new Map();
  this.look={x:0,z:0};this.last=performance.now();
  replay.stage.prepend(this.canvas);
  this.resize=new ResizeObserver(()=>this.fit());
  this.resize.observe(replay.stage);
  this.fit();
  this.frame=requestAnimationFrame(now=>this.tick(now));
 }
 material(color){
  if(!this.materials.has(color))this.materials.set(color,new THREE.MeshLambertMaterial({color}));
  return this.materials.get(color);
 }
 build(){
  const scene=this.scene;
  const surround=new THREE.Mesh(new THREE.PlaneGeometry(300,220),this.material('#16301f'));
  surround.rotation.x=-Math.PI/2;surround.position.y=-.02;surround.receiveShadow=true;scene.add(surround);
  const grass=new THREE.Mesh(new THREE.PlaneGeometry(W+2*MARGIN_X,H+2*MARGIN_Y),new THREE.MeshLambertMaterial({map:pitchTexture(this.renderer)}));
  grass.rotation.x=-Math.PI/2;grass.receiveShadow=true;scene.add(grass);
  // Stands on three sides, the camera sitting in the fourth.
  const stand=this.material('#27323d'),seats=this.material('#3a4754');
  for(const [x,z,w,d] of [[0,-H/2-MARGIN_Y-9,W+40,14],[-W/2-MARGIN_X-9,0,14,H+20],[W/2+MARGIN_X+9,0,14,H+20]]){
   const block=new THREE.Mesh(new THREE.BoxGeometry(w,10,d),stand);block.position.set(x,5,z);scene.add(block);
   const tier=new THREE.Mesh(new THREE.BoxGeometry(w*.98,.4,d*.9),seats);tier.position.set(x,10.2,z);scene.add(tier);
  }
  for(const end of [0,W])scene.add(this.goal(end));
  const ball=this.ball=new THREE.Mesh(new THREE.SphereGeometry(.3,20,14),new THREE.MeshLambertMaterial({color:'#ffffff'}));
  ball.castShadow=true;scene.add(ball);
  const shadow=this.ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.4,20),new THREE.MeshBasicMaterial({color:'#000',transparent:true,opacity:.35,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.03;scene.add(shadow);
  const accent=getComputedStyle(this.replay).getPropertyValue('--accent').trim()||'#f2c94c';
  const ring=this.ring=new THREE.Mesh(new THREE.RingGeometry(.9,1.15,32),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.9,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.04;ring.visible=false;scene.add(ring);
  this.people=new THREE.Group();scene.add(this.people);
  // Shared by every player.
  this.parts={leg:new THREE.BoxGeometry(.17,.86,.2).translate(0,-.43,0),arm:new THREE.BoxGeometry(.13,.66,.14).translate(0,-.33,0),
              torso:new THREE.CylinderGeometry(.24,.19,.64,10),shorts:new THREE.BoxGeometry(.46,.3,.28),head:new THREE.SphereGeometry(.14,14,10)};
 }
 goal(end){
  const group=new THREE.Group(),post=this.material('#f4f4f4'),width=7.32,height=2.44*SCALE,depth=2*Math.sign(end?1:-1);
  const bar=(length,x,y,z,axis)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,length,8),post);mesh.position.set(x,y,z);if(axis==='z')mesh.rotation.x=Math.PI/2;if(axis==='x')mesh.rotation.z=Math.PI/2;mesh.castShadow=true;group.add(mesh);};
  bar(height,0,height/2,-width/2);bar(height,0,height/2,width/2);bar(width,0,height,0,'z');
  const net=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false});
  const back=new THREE.Mesh(new THREE.PlaneGeometry(width,height),net);back.rotation.y=Math.PI/2;back.position.set(depth,height/2,0);group.add(back);
  const roof=new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(depth),width),net);roof.rotation.x=Math.PI/2;roof.position.set(depth/2,height,0);group.add(roof);
  for(const side of [-1,1]){const wall=new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(depth),height),net);wall.position.set(depth/2,height/2,side*width/2);group.add(wall);}
  group.position.set(end-W/2,0,0);
  return group;
 }
 // A player: legs and arms hang from pivots so that they can swing as he runs.
 figure(side,id,keeper){
  const kit=this.replay.teams[side],shirt=this.material(keeper?kit.keeper:kit.major),shorts=this.material(kit.minor);
  const skin=this.material(SKINS[Math.abs(id*2654435761|0)%SKINS.length]),socks=this.material(keeper?kit.keeper:kit.major);
  const body=new THREE.Group(),limb=(geometry,material,x,y)=>{const pivot=new THREE.Group(),mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;pivot.add(mesh);pivot.position.set(x,y,0);body.add(pivot);return pivot;};
  const legs=[limb(this.parts.leg,socks,-.12,.9),limb(this.parts.leg,socks,.12,.9)];
  const arms=[limb(this.parts.arm,shirt,-.31,1.6),limb(this.parts.arm,shirt,.31,1.6)];
  for(const [geometry,material,y] of [[this.parts.shorts,shorts,.96],[this.parts.torso,shirt,1.34],[this.parts.head,skin,1.83]]){
   const mesh=new THREE.Mesh(geometry,material);mesh.position.y=y;mesh.castShadow=true;body.add(mesh);
  }
  body.scale.setScalar(SCALE);
  const root=new THREE.Group();root.add(body);
  const name=label(this.replay.names.get(id)||'');root.add(name);
  this.people.add(root);
  return {root,body,legs,arms,name,keeper,phase:0,yaw:null,x:null,z:null};
 }

 fit(){
  const {clientWidth:width,clientHeight:height}=this.replay.stage;
  if(!width||!height)return;
  this.renderer.setSize(width,height,false);
  this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
 }
 dispose(){
  cancelAnimationFrame(this.frame);this.frame=null;
  this.resize.disconnect();
  this.scene.traverse(node=>{node.geometry?.dispose();node.material?.map?.dispose();node.material?.dispose?.();});
  this.renderer.dispose();
  this.canvas.remove();
 }

 tick(now){
  if(!this.frame)return;
  this.frame=requestAnimationFrame(next=>this.tick(next));
  const dt=Math.min(64,now-this.last);this.last=now;
  // Nothing to draw while the summary is folded away.
  if(!this.replay.isConnected||!this.canvas.offsetParent)return;
  this.update(dt);
  this.renderer.render(this.scene,this.camera);
 }
 update(dt){
  const replay=this.replay,stage=replay.stage,away=stage.classList.contains('fast')||stage.classList.contains('cut');
  const ballAt=replay.ballAt||{x:W/2,y:H/2},ball=toWorld(ballAt.x,ballAt.y),height=(replay.ballHeight||0)*LOFT;
  this.people.visible=this.ball.visible=this.ballShadow.visible=!away;
  this.ball.position.set(ball.x,.3+height,ball.z);
  this.ballShadow.position.set(ball.x,.03,ball.z);this.ballShadow.scale.setScalar(1/(1+height*.15));
  const seen=new Set();
  let carrier=null;
  for(const side of ['home','away'])for(const [id,dot] of replay.dots[side]){
   const key=`${side}:${id}`,keeper=replay.rosters[side].find(player=>player.id===id)?.position==='GB';
   let figure=this.figures.get(key);
   if(figure&&figure.keeper!==keeper){this.people.remove(figure.root);figure=null;}
   if(!figure){figure=this.figure(side,id,keeper);this.figures.set(key,figure);}
   seen.add(key);
   this.pose(figure,toWorld(dot.x,dot.y),ball,dt);
   figure.name.visible=dot.node.classList.contains('on');
   if(replay.carrier?.side===side&&replay.carrier.id===id)carrier=figure;
  }
  for(const [key,figure] of this.figures)if(!seen.has(key)){this.people.remove(figure.root);this.figures.delete(key);}
  this.ring.visible=!!carrier&&!away;
  if(carrier)this.ring.position.set(carrier.x,.04,carrier.z);
  this.frameCamera(ball,away,dt);
 }
 // Runs, turns and swings his limbs from how far he moved since the last frame.
 pose(figure,at,ball,dt){
  const moved=figure.x==null?0:Math.hypot(at.x-figure.x,at.z-figure.z),speed=dt>0?moved/dt*1000:0;
  let heading;
  if(speed>.6)heading=Math.atan2(at.x-figure.x,at.z-figure.z);
  else heading=Math.atan2(ball.x-at.x,ball.z-at.z);
  figure.yaw=figure.yaw==null?heading:turn(figure.yaw,heading,1-Math.exp(-dt/(speed>.6?90:260)));
  figure.x=at.x;figure.z=at.z;
  figure.root.position.set(at.x,0,at.z);
  figure.body.rotation.y=figure.yaw;
  // About one stride per 1.6 m; the swing grows with the pace.
  figure.phase+=moved/1.6*Math.PI;
  const swing=Math.min(.85,speed/7)*Math.sin(figure.phase);
  figure.legs[0].rotation.x=swing;figure.legs[1].rotation.x=-swing;
  figure.arms[0].rotation.x=-swing*.8;figure.arms[1].rotation.x=swing*.8;
  figure.body.position.y=Math.abs(Math.cos(figure.phase))*Math.min(.08,speed/80);
  figure.body.rotation.x=Math.min(.18,speed/45);
 }
 // The main camera: high in the stand on the near side, panning with the ball, wider while the clock runs.
 frameCamera(ball,wide,dt){
  const target=wide?{x:0,z:0}:{x:clamp(ball.x,-34,34),z:ball.z*.4};
  const k=1-Math.exp(-dt/(wide?900:520));
  this.look.x=lerp(this.look.x,target.x,k);this.look.z=lerp(this.look.z,target.z,k);
  const back=wide?84:50,up=wide?40:22;
  this.camera.position.set(this.look.x*.85,up,H/2+back-H/2*.3);
  this.camera.lookAt(this.look.x,0,this.look.z);
 }
}
