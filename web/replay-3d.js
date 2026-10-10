// The replay seen from the main stand, as on television. match-replay.js still plays the match: this view reads
// where its players and ball are at each frame and draws them in 3D, without changing anything.
// Pitch units are metres: x along the touchline (0 to 105), y across (0 at the far touchline, 68 at the near one).
// In the scene, x runs along the touchline from the centre spot, z across towards the camera, y up.
import * as THREE from './vendor/three/three.module.js';

const W=105,H=68,MARGIN_X=6,MARGIN_Y=5;
// The players are drawn a little larger than life so that they read from the stand.
const SCALE=1.25;
const SKINS=['#f1c9a0','#d9a577','#b27b52','#8a5a3b','#5e3b27'];
const HAIR=['#16110d','#2b1d14','#3f2a1c','#5c3d24','#8a6038','#c9a36a','#7c3a1d'];
const BOOTS=['#141414','#141414','#f2f2f2','#d7ff3c','#ff5b3a','#2f7bff'];
const GLOVES=['#eef2f5','#d7ff3c','#ff8a3d'];
// Metres of ball height for one unit of the replay's loft; a cross is met with the head at HEAD metres.
const LOFT=4,HEAD=2.3,BALL=.24;
// In ms of replay time, so that they keep the replay's pace and stop when it is paused.
const KICK_MS=450,JUMP_MS=560,RECOVER_MS=600;
// Below this pace, in metres per second of replay, a player walks and faces the ball.
const JOG=1.2;
// The fans' tile: seats along the stand and rows up its slope, in metres.
const SEAT=.5,ROW=.9,SEATS=96,ROWS=24;
// The advertising boards' tile and the hospitality boxes' one, in metres along them.
const BOARD_TILE=28.8,BOX_TILE=12,NET_CELL=.14;
// The stands, local x along them and z away from the pitch: tiers [front, back, height at front, height at back,
// underside], the boxes' facade [z, bottom, top] and the roof [front, back, height].
const MAIN_STAND={tiers:[[0,14,1.2,8.3],[12,30,12.4,24.1,11.2]],boxes:[14,8.3,11.2],roof:[8,32,27.5]};
const END_STAND={tiers:[[0,24,1.2,15.1]],roof:[5,26,19.5]};
const lerp=(a,b,k)=>a+(b-a)*k;
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
const smooth=k=>k*k*(3-2*k);
const toWorld=(x,y)=>({x:x-W/2,z:y-H/2});
// Shortest turn from one heading to another.
const turn=(from,to,k)=>from+(((to-from+Math.PI*3)%(Math.PI*2))-Math.PI)*k;
const hash=id=>Math.abs(id*2654435761|0);
// Stable randomness, so that a player, a stand or a shot looks the same each time.
const seeded=seed=>()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const canvas=(width,height)=>{const node=document.createElement('canvas');node.width=width;node.height=height;return [node,node.getContext('2d')];};
const luminance=hex=>{const colour=new THREE.Color(hex);return .2126*colour.r+.7152*colour.g+.0722*colour.b;};
// `ink` on `background` when it reads, black or white otherwise.
function readable(background,ink){
 const back=luminance(background),ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 return ratio(back,luminance(ink))>=3?ink:back>.18?'#111111':'#ffffff';
}
// A flat convex outline through `points`, counter-clockwise seen from the side it faces, textured by `uv(point)`.
function panel(points,uv){
 const geometry=new THREE.BufferGeometry(),position=[],coords=[];
 for(let index=1;index<points.length-1;index++)for(const point of [points[0],points[index],points[index+1]]){position.push(...point);coords.push(...uv(point));}
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(coords,2));
 geometry.computeVertexNormals();
 return geometry;
}
// A solid of `length` along x from its profile in the (z, y) plane.
function extrude(length,profile){
 return new THREE.ExtrudeGeometry(new THREE.Shape(profile.map(([z,y])=>new THREE.Vector2(z,y))),{depth:length,bevelEnabled:false})
  .rotateY(-Math.PI/2).translate(length/2,0,0);
}

function pitchCanvas(){
 const scale=20,[node,g]=canvas((W+2*MARGIN_X)*scale,(H+2*MARGIN_Y)*scale);
 g.fillStyle='#2c6c3e';g.fillRect(0,0,node.width,node.height);
 g.save();g.translate(MARGIN_X*scale,MARGIN_Y*scale);g.scale(scale,scale);
 // Ten mowing stripes along the pitch, carried on to the boards.
 g.fillStyle='#337747';
 for(let stripe=-1;stripe<=10;stripe++)if(stripe%2)g.fillRect(stripe*W/10,-MARGIN_Y,W/10,H+2*MARGIN_Y);
 // The goalmouths and the centre circle wear first.
 const wear=(x,y,radius,alpha)=>{const gradient=g.createRadialGradient(x,y,0,x,y,radius);gradient.addColorStop(0,`rgba(128,116,62,${alpha})`);gradient.addColorStop(1,'rgba(128,116,62,0)');g.fillStyle=gradient;g.fillRect(x-radius,y-radius,2*radius,2*radius);};
 wear(2.5,H/2,6.5,.3);wear(W-2.5,H/2,6.5,.3);wear(11,H/2,4,.12);wear(W-11,H/2,4,.12);wear(W/2,H/2,8,.1);
 g.restore();
 // Grain, so that the grass is not flat paint.
 const [grain,n]=canvas(128,128),image=n.createImageData(128,128),random=seeded(7);
 for(let index=0;index<image.data.length;index+=4){image.data[index]=image.data[index+1]=image.data[index+2]=random()*255;image.data[index+3]=255;}
 n.putImageData(image,0,0);
 g.globalAlpha=.09;g.globalCompositeOperation='overlay';g.fillStyle=g.createPattern(grain,'repeat');g.fillRect(0,0,node.width,node.height);
 g.globalAlpha=1;g.globalCompositeOperation='source-over';
 g.translate(MARGIN_X*scale,MARGIN_Y*scale);g.scale(scale,scale);
 g.strokeStyle='#ffffffe6';g.lineWidth=.12;
 const box=(x,y,w,h)=>g.strokeRect(x,y,w,h);
 box(0,0,W,H);
 g.beginPath();g.moveTo(W/2,0);g.lineTo(W/2,H);g.stroke();
 g.beginPath();g.arc(W/2,H/2,9.15,0,Math.PI*2);g.stroke();
 box(0,H/2-20.16,16.5,40.32);box(W-16.5,H/2-20.16,16.5,40.32);
 box(0,H/2-9.16,5.5,18.32);box(W-5.5,H/2-9.16,5.5,18.32);
 const arc=Math.acos(5.5/9.15);
 g.beginPath();g.arc(11,H/2,9.15,-arc,arc);g.stroke();
 g.beginPath();g.arc(W-11,H/2,9.15,Math.PI-arc,Math.PI+arc);g.stroke();
 for(const [x,y,from] of [[0,0,0],[W,0,Math.PI/2],[W,H,Math.PI],[0,H,Math.PI*1.5]]){g.beginPath();g.arc(x,y,1,from,from+Math.PI/2);g.stroke();}
 g.fillStyle='#ffffffe6';
 for(const x of [11,W/2,W-11]){g.beginPath();g.arc(x,H/2,.2,0,Math.PI*2);g.fill();}
 return node;
}

// A tile of fans in their seats, in one of three poses: 0 seated, 1 and 2 on their feet for a goal, half of
// them arms up in one and the other half in the other, so that switching between the two makes them jump.
function crowdCanvas(kit,seat,pose,seed){
 const cell=12,row=16,[node,g]=canvas(SEATS*cell,ROWS*row),random=seeded(seed);
 const shirts=[kit.major,kit.major,kit.major,kit.minor,kit.minor,'#20262e','#2f3640','#4b525c','#e9edf1','#6d4c3d','#35507a'];
 const tread=new THREE.Color(seat).multiplyScalar(.6).getStyle();
 // The back row at the top of the tile, so that each row is drawn over the one behind it.
 for(let line=0;line<ROWS;line++){
  const y=line*row;
  g.fillStyle=tread;g.fillRect(0,y,node.width,row-4);
  g.fillStyle='#1b2027';g.fillRect(0,y+row-4,node.width,4);
  for(let place=0;place<SEATS;place++){
   const x=place*cell,present=random()<.88,shirt=shirts[Math.floor(random()*shirts.length)],skin=SKINS[Math.floor(random()*SKINS.length)],mood=random();
   // An aisle of steps every 24 seats.
   if(place%24===0){g.fillStyle='#3b4149';g.fillRect(x,y,cell,row);continue;}
   g.fillStyle=seat;g.fillRect(x+1,y+4,cell-2,7);
   if(!present)continue;
   const arms=pose&&(mood<.5)===(pose===1),up=pose?(arms?5:2):0;
   g.fillStyle=shirt;g.fillRect(x+2,y+6-up,8,7+(pose?2:0));
   if(arms){g.strokeStyle=shirt;g.lineWidth=1.8;g.beginPath();g.moveTo(x+3,y+7-up);g.lineTo(x+1,y-3-up);g.moveTo(x+9,y+7-up);g.lineTo(x+11,y-3-up);g.stroke();}
   g.fillStyle=skin;g.beginPath();g.arc(x+6,y+4-up,2.5,0,Math.PI*2);g.fill();
  }
 }
 return node;
}

// The LED boards around the pitch: both clubs and the game's own name, one after the other.
function boardCanvas(teams,accent){
 const [node,g]=canvas(2048,64);
 const panels=[[teams.home.major,readable(teams.home.major,teams.home.minor),teams.home.name],['#0d1117',accent,'FOOTBALL MANAGER'],
               [teams.away.major,readable(teams.away.major,teams.away.minor),teams.away.name],[accent,readable(accent,'#0d1117'),'FOOTBALL MANAGER']];
 panels.forEach(([back,ink,text],index)=>{
  const x=index*512,label=text.toUpperCase();
  g.fillStyle=back;g.fillRect(x,0,512,64);
  let size=38;g.font=`800 ${size}px system-ui,sans-serif`;
  const width=g.measureText(label).width;
  if(width>460){size=Math.floor(size*460/width);g.font=`800 ${size}px system-ui,sans-serif`;}
  g.fillStyle=ink;g.textAlign='center';g.textBaseline='middle';g.fillText(label,x+256,34);
 });
 g.fillStyle='#00000024';for(let y=0;y<64;y+=3)g.fillRect(0,y,node.width,1);
 return node;
}

// The glass fronts of the boxes between the tiers, some lit.
function boxesCanvas(){
 const [node,g]=canvas(512,64),random=seeded(11);
 g.fillStyle='#0c1117';g.fillRect(0,0,512,64);
 for(let pane=0;pane<16;pane++){
  const x=pane*32;
  g.fillStyle=`rgba(255,${190+Math.floor(random()*40)},120,${random()<.7?.18+random()*.35:.04})`;g.fillRect(x+2,10,28,46);
  g.fillStyle='#2a323c';g.fillRect(x,6,2,52);
 }
 g.fillStyle='#2a323c';g.fillRect(0,4,512,6);g.fillRect(0,56,512,4);
 return node;
}

function netCanvas(){
 const [node,g]=canvas(32,32);
 g.fillStyle='#ffffff';g.fillRect(0,0,32,3);g.fillRect(0,0,3,32);
 return node;
}

// A classic ball: twelve dark patches where the corners of an icosahedron meet the sphere.
function ballCanvas(){
 const [node,g]=canvas(256,128),image=g.createImageData(256,128),phi=(1+Math.sqrt(5))/2;
 const corners=[[0,1,phi],[0,-1,phi],[0,1,-phi],[0,-1,-phi],[1,phi,0],[-1,phi,0],[1,-phi,0],[-1,-phi,0],[phi,0,1],[-phi,0,1],[phi,0,-1],[-phi,0,-1]]
  .map(corner=>{const length=Math.hypot(...corner);return corner.map(value=>value/length);});
 for(let y=0;y<128;y++)for(let x=0;x<256;x++){
  const longitude=(x+.5)/256*Math.PI*2,latitude=((y+.5)/128-.5)*Math.PI;
  const direction=[Math.cos(latitude)*Math.cos(longitude),Math.sin(latitude),Math.cos(latitude)*Math.sin(longitude)];
  let near=-1;for(const corner of corners)near=Math.max(near,corner[0]*direction[0]+corner[1]*direction[1]+corner[2]*direction[2]);
  const shade=lerp(240,30,clamp((near-.943)/.008,0,1)),index=(y*256+x)*4;
  image.data[index]=image.data[index+1]=image.data[index+2]=shade;image.data[index+3]=255;
 }
 g.putImageData(image,0,0);
 return node;
}

function blobCanvas(){
 const [node,g]=canvas(64,64),gradient=g.createRadialGradient(32,32,0,32,32,32);
 gradient.addColorStop(0,'rgba(0,0,0,.5)');gradient.addColorStop(.6,'rgba(0,0,0,.22)');gradient.addColorStop(1,'rgba(0,0,0,0)');
 g.fillStyle=gradient;g.fillRect(0,0,64,64);
 return node;
}

function skyCanvas(){
 const [node,g]=canvas(4,256),gradient=g.createLinearGradient(0,0,0,256);
 gradient.addColorStop(0,'#060b13');gradient.addColorStop(.55,'#162338');gradient.addColorStop(1,'#2b3c55');
 g.fillStyle=gradient;g.fillRect(0,0,4,256);
 return node;
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
  renderer.toneMapping=THREE.NeutralToneMapping;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.textures=[];this.materials=new Map();
  const scene=this.scene=new THREE.Scene();
  scene.background=this.texture(skyCanvas());
  scene.fog=new THREE.Fog('#1b2738',170,430);
  this.camera=new THREE.PerspectiveCamera(26,1.5,1,500);
  // An evening match under floodlights: a cool sky light, and one key light high over the main stand for the shadows.
  scene.add(new THREE.HemisphereLight('#dfe8ff','#35553a',1.7));
  const sun=new THREE.DirectionalLight('#fff4e0',2.4);
  sun.position.set(-35,70,25);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-62,right:62,top:42,bottom:-42,near:10,far:160});
  sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;
  scene.add(sun);
  this.build();
  this.figures=new Map();
  this.look={x:0,z:0};this.last=performance.now();this.height=0;this.fall=0;
  replay.stage.prepend(this.canvas);
  this.resize=new ResizeObserver(()=>this.fit());
  this.resize.observe(replay.stage);
  this.fit();
  this.frame=requestAnimationFrame(now=>this.tick(now));
 }
 texture(source,[u,v]=[1,1]){
  const texture=new THREE.CanvasTexture(source);
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
  if(u!==1||v!==1){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(u,v);}
  this.textures.push(texture);
  return texture;
 }
 material(color,roughness=.8){
  const key=`${color}/${roughness}`;
  if(!this.materials.has(key))this.materials.set(key,new THREE.MeshStandardMaterial({color,roughness}));
  return this.materials.get(key);
 }
 build(){
  const scene=this.scene,teams=this.replay.teams;
  const accent=getComputedStyle(this.replay).getPropertyValue('--accent').trim()||'#f2c94c';
  const surround=new THREE.Mesh(new THREE.PlaneGeometry(520,380),this.material('#37413b',1));
  surround.rotation.x=-Math.PI/2;surround.position.y=-.02;scene.add(surround);
  const grass=new THREE.Mesh(new THREE.PlaneGeometry(W+2*MARGIN_X,H+2*MARGIN_Y),new THREE.MeshStandardMaterial({map:this.texture(pitchCanvas()),roughness:.95}));
  grass.rotation.x=-Math.PI/2;grass.receiveShadow=true;scene.add(grass);
  // The fans: a home crowd all round, the visitors in the far corner of the right-hand end.
  const seat=teams.home.major;
  this.fans={};
  for(const [side,seed] of [['home',3],['away',5]]){
   const frames=[0,1,2].map(pose=>this.texture(crowdCanvas(teams[side],seat,pose,seed),[1/(SEATS*SEAT),1/(ROWS*ROW)]));
   this.fans[side]={frames,material:new THREE.MeshLambertMaterial({map:frames[0],color:'#b4b4b4'})};
  }
  this.led=new THREE.MeshBasicMaterial({map:this.texture(boardCanvas(teams,accent),[1/BOARD_TILE,1])});
  this.windows=new THREE.MeshBasicMaterial({map:this.texture(boxesCanvas(),[1/BOX_TILE,1]),color:'#c8ccd2'});
  const span=H+2*MARGIN_Y+2*4+2*8,right=span/2-36;
  this.place(this.stand(2*(W/2+MARGIN_X+4+32),MAIN_STAND,[{from:-(W/2+MARGIN_X+36),to:W/2+MARGIN_X+36,fans:'home'}]),'far',MARGIN_Y+4);
  this.place(this.stand(span,END_STAND,[{from:-span/2,to:span/2,fans:'home'}]),'left',MARGIN_X+4,8);
  this.place(this.stand(span,END_STAND,[{from:-span/2,to:right,fans:'home'},{from:right,to:span/2,fans:'away'}]),'right',MARGIN_X+4,8);
  for(const side of ['far','near'])this.place(this.board(W+2*MARGIN_X-2),side,MARGIN_Y);
  for(const side of ['left','right'])this.place(this.board(H+2*MARGIN_Y-2),side,MARGIN_X);
  for(const x of [-9,9])this.place(this.dugout(),'near',MARGIN_Y+2.2).position.x=x;
  for(const end of [0,W])scene.add(this.goal(end));
  const flag=new THREE.MeshStandardMaterial({color:'#ffd23f',roughness:.7,side:THREE.DoubleSide}),pole=this.material('#f4f4f4',.5);
  for(const x of [-W/2,W/2])for(const z of [-H/2,H/2]){
   const stick=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,1.9,6),pole);stick.position.set(x,.95,z);stick.castShadow=true;scene.add(stick);
   const cloth=new THREE.Mesh(new THREE.PlaneGeometry(.45,.32),flag);cloth.position.set(x-Math.sign(x)*.23,1.72,z);scene.add(cloth);
  }
  const ball=this.ball=new THREE.Mesh(new THREE.SphereGeometry(BALL,24,16),new THREE.MeshStandardMaterial({map:this.texture(ballCanvas()),roughness:.45}));
  ball.castShadow=true;scene.add(ball);
  this.blob=new THREE.MeshBasicMaterial({map:this.texture(blobCanvas()),transparent:true,depthWrite:false});
  const shadow=this.ballShadow=new THREE.Mesh(new THREE.CircleGeometry(.4,20),this.blob);
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.03;scene.add(shadow);
  const ring=this.ring=new THREE.Mesh(new THREE.RingGeometry(.9,1.15,32),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.9,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.04;ring.visible=false;scene.add(ring);
  this.people=new THREE.Group();scene.add(this.people);
  // Shared by every player, in metres before SCALE, feet on the grass; limbs hang from their joints.
  this.parts={
   thigh:new THREE.CapsuleGeometry(.075,.3,4,10).translate(0,-.225,0),shortsLeg:new THREE.CylinderGeometry(.1,.095,.22,10).translate(0,-.1,0),
   shin:new THREE.CapsuleGeometry(.058,.3,4,10).translate(0,-.21,0),boot:new THREE.BoxGeometry(.11,.08,.27).translate(0,-.44,.05),
   pelvis:new THREE.CylinderGeometry(.2,.21,.24,12),torso:new THREE.CapsuleGeometry(.19,.34,6,14).scale(1,1,.68),
   neck:new THREE.CylinderGeometry(.055,.06,.12,8),head:new THREE.SphereGeometry(.115,16,12).scale(1,1.12,1.02),
   hair:new THREE.SphereGeometry(.122,16,8,0,Math.PI*2,0,1.75).scale(1,1.1,1.04).rotateX(-.35),
   sleeve:new THREE.CapsuleGeometry(.058,.2,4,8).translate(0,-.16,0),forearm:new THREE.CapsuleGeometry(.047,.2,4,8).translate(0,-.15,0),
   hand:new THREE.SphereGeometry(.05,10,8).translate(0,-.3,0),glove:new THREE.SphereGeometry(.068,10,8).translate(0,-.31,0),
   blob:new THREE.CircleGeometry(.62*SCALE,24),
  };
 }
 // Sets a piece of the ground on one side, `distance` metres beyond the lines, facing the pitch; `along` shifts an end one towards the camera.
 place(object,side,distance,along=0){
  const [x,z,angle]={far:[0,-(H/2+distance),Math.PI],near:[0,H/2+distance,0],left:[-(W/2+distance),along,-Math.PI/2],right:[W/2+distance,along,Math.PI/2]}[side];
  object.position.set(x,0,z);object.rotation.y=angle;
  this.scene.add(object);
  return object;
 }
 // A stand built along local x, the pitch towards -z: solid tiers, the fans on their slopes, a band of the home
 // colour along each tier's front, the boxes between tiers and a roof whose front edge carries the floodlights.
 stand(length,{tiers,boxes,roof},sections){
  const group=new THREE.Group(),concrete=this.material('#3a424b',.95),band=this.material(this.replay.teams.home.major,.6);
  for(const [z0,z1,y0,y1,base=0] of tiers){
   group.add(new THREE.Mesh(extrude(length,[[z0,base],[z0,y0],[z1,y1],[z1,base]]),concrete));
   group.add(new THREE.Mesh(panel([[length/2,y0-.35,z0-.02],[-length/2,y0-.35,z0-.02],[-length/2,y0,z0-.02],[length/2,y0,z0-.02]],()=>[0,0]),band));
   for(const {from,to,fans} of sections){
    const lift=.05,slope=point=>[point[0]-from,Math.hypot(point[2]-z0,point[1]-lift-y0)];
    group.add(new THREE.Mesh(panel([[to,y0+lift,z0],[from,y0+lift,z0],[from,y1+lift,z1],[to,y1+lift,z1]],slope),this.fans[fans].material));
   }
  }
  if(boxes){
   const [z,bottom,top]=boxes;
   group.add(new THREE.Mesh(panel([[length/2,bottom,z],[-length/2,bottom,z],[-length/2,top,z],[length/2,top,z]],point=>[length/2-point[0],(point[1]-bottom)/(top-bottom)]),this.windows));
  }
  const [front,back,height]=roof;
  const cover=new THREE.Mesh(new THREE.BoxGeometry(length,.5,back-front),this.material('#1a1f25',.9));cover.position.set(0,height,(front+back)/2);
  const fascia=new THREE.Mesh(new THREE.BoxGeometry(length,1.1,.3),this.material('#c3cad2',.6));fascia.position.set(0,height-.2,front);
  const lights=new THREE.Mesh(new THREE.BoxGeometry(length*.98,.22,.12),new THREE.MeshBasicMaterial({color:'#fff6dc'}));lights.position.set(0,height-.86,front-.1);
  group.add(cover,fascia,lights);
  return group;
 }
 // An LED board, leaning back a little, its face towards the pitch.
 board(length){
  const group=new THREE.Group(),tilt=new THREE.Group();
  const face=new THREE.Mesh(panel([[length/2,.05,0],[-length/2,.05,0],[-length/2,.95,0],[length/2,.95,0]],point=>[length/2-point[0],(point[1]-.05)/.9]),this.led);
  const body=new THREE.Mesh(new THREE.BoxGeometry(length,.9,.25),this.material('#11161c'));body.position.set(0,.5,.13);
  tilt.add(face,body);tilt.rotation.x=.16;group.add(tilt);
  return group;
 }
 dugout(){
  const group=new THREE.Group(),shell=this.material('#1b222a',.7),glass=new THREE.MeshStandardMaterial({color:'#a9bccc',roughness:.2,transparent:true,opacity:.4});
  const add=(geometry,material,x,y,z)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);group.add(mesh);};
  add(new THREE.BoxGeometry(7,2.2,.15),shell,0,1.1,.9);add(new THREE.BoxGeometry(7,.1,1.9),glass,0,2.25,0);
  for(const x of [-3.5,3.5])add(new THREE.BoxGeometry(.12,2.2,1.9),glass,x,1.1,0);
  add(new THREE.BoxGeometry(6.6,.45,.5),this.material(this.replay.teams.home.major,.6),0,.25,.55);
  return group;
 }
 goal(end){
  const group=new THREE.Group(),post=this.material('#f4f4f4',.4),width=7.32,height=2.44*SCALE,out=end?1:-1,top=1.1,bottom=2.2;
  const bar=(length,x,y,z,axis)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,length,10),post);mesh.position.set(x,y,z);if(axis==='z')mesh.rotation.x=Math.PI/2;mesh.castShadow=true;group.add(mesh);};
  bar(height,0,height/2,-width/2);bar(height,0,height/2,width/2);bar(width,0,height,0,'z');
  // The net: a roof from the crossbar, a back sloping to the grass and two sides, in a mesh of NET_CELL metres.
  const net=new THREE.MeshBasicMaterial({map:this.texture(netCanvas(),[1/NET_CELL,1/NET_CELL]),transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false});
  const at=(x,y,z)=>[x*out,y,z];
  for(const z of [-width/2,width/2])group.add(new THREE.Mesh(panel([at(0,0,z),at(bottom,0,z),at(top,height,z),at(0,height,z)],point=>[Math.abs(point[0]),point[1]]),net));
  group.add(new THREE.Mesh(panel([at(bottom,0,-width/2),at(bottom,0,width/2),at(top,height,width/2),at(top,height,-width/2)],point=>[point[2],Math.hypot(Math.abs(point[0])-bottom,point[1])]),net));
  group.add(new THREE.Mesh(panel([at(0,height,-width/2),at(0,height,width/2),at(top,height,width/2),at(top,height,-width/2)],point=>[point[2],Math.abs(point[0])]),net));
  const stay=this.material('#9aa3ad',.5);
  for(const z of [-width/2,width/2]){const rod=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,Math.hypot(bottom-top,height),6),stay);rod.position.set((top+bottom)/2*out,height/2,z);rod.rotation.z=Math.atan2(bottom-top,height)*out;group.add(rod);}
  group.position.set(end-W/2,0,0);
  return group;
 }
 // A player: legs and arms hang from pivots at the hips, knees, shoulders and elbows, so that he can run, strike
 // the ball, jump and dive. His hair, boots and gloves are drawn from his id, so that he keeps them.
 figure(side,id,keeper){
  const kit=this.replay.teams[side],parts=this.parts,random=seeded(hash(id)),pick=list=>list[Math.floor(random()*list.length)];
  const shirt=this.material(keeper?kit.keeper:kit.major,.7),shorts=this.material(keeper?kit.keeper:kit.minor,.7),socks=shirt;
  const skin=this.material(SKINS[hash(id)%SKINS.length],.65),boots=this.material(pick(BOOTS),.5),hair=random()<.1?null:this.material(pick(HAIR),.9);
  const hands=keeper?this.material(pick(GLOVES),.6):skin;
  const body=new THREE.Group();body.rotation.order='YXZ';
  const mesh=(geometry,material,parent,shadow=true)=>{const node=new THREE.Mesh(geometry,material);node.castShadow=shadow;parent.add(node);return node;};
  const pivot=(parent,x,y)=>{const node=new THREE.Group();node.position.set(x,y,0);parent.add(node);return node;};
  const hips=[],knees=[],shoulders=[],elbows=[];
  for(const x of [-.1,.1]){
   const hip=pivot(body,x,.93),knee=pivot(hip,0,-.45);
   mesh(parts.thigh,skin,hip);mesh(parts.shortsLeg,shorts,hip);mesh(parts.shin,socks,knee);mesh(parts.boot,boots,knee,false);
   hips.push(hip);knees.push(knee);
  }
  for(const x of [-.245,.245]){
   const shoulder=pivot(body,x,1.56),elbow=pivot(shoulder,0,-.3);
   mesh(parts.sleeve,shirt,shoulder);mesh(parts.forearm,keeper?shirt:skin,elbow);mesh(keeper?parts.glove:parts.hand,hands,elbow,false);
   shoulders.push(shoulder);elbows.push(elbow);
  }
  mesh(parts.pelvis,shorts,body).position.y=.95;
  mesh(parts.torso,shirt,body).position.y=1.3;
  mesh(parts.neck,skin,body,false).position.y=1.69;
  mesh(parts.head,skin,body).position.y=1.83;
  if(hair)mesh(parts.hair,hair,body,false).position.set(0,1.845,-.01);
  body.scale.setScalar(SCALE);
  const root=new THREE.Group();root.add(body);
  const blob=new THREE.Mesh(parts.blob,this.blob);blob.rotation.x=-Math.PI/2;blob.position.y=.025;root.add(blob);
  const name=label(this.replay.names.get(id)||'');root.add(name);
  this.people.add(root);
  return {root,body,hips,knees,shoulders,elbows,name,blob,keeper,foot:random()<.2?0:1,seed:random()*6,
          phase:0,speed:0,ready:0,cheer:0,yaw:null,x:null,z:null,kick:null,jump:null,dive:null,hold:false};
 }
 drop(key,figure){
  this.people.remove(figure.root);
  figure.name.material.map.dispose();figure.name.material.dispose();
  this.figures.delete(key);
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
  for(const figure of this.figures.values())figure.name.material.map.dispose();
  this.scene.traverse(node=>{node.geometry?.dispose();node.material?.dispose?.();});
  for(const part of Object.values(this.parts))part.dispose();
  for(const {material} of Object.values(this.fans))material.dispose();
  for(const texture of this.textures)texture.dispose();
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
  // The replay's own clock: it runs faster during a chance, at the chosen speed, and stops on pause.
  const time=replay.time||0,rdt=this.clock==null?0:clamp(time-this.clock,0,400);this.clock=time;
  const action=replay.action;
  if(action!==this.action){this.begin(action,this.action);this.action=action;}
  const ballAt=replay.ballAt||{x:W/2,y:H/2},ball=toWorld(ballAt.x,ballAt.y);
  this.people.visible=this.ball.visible=this.ballShadow.visible=!away;
  const cheering=away?null:this.cheering(),holding=replay.carrier&&(!action||action.kind==='wait');
  const seen=new Set();
  let carrier=null;
  for(const side of ['home','away'])for(const [id,dot] of replay.dots[side]){
   const key=`${side}:${id}`,keeper=replay.rosters[side].find(player=>player.id===id)?.position==='GB';
   let figure=this.figures.get(key);
   if(figure&&figure.keeper!==keeper){this.drop(key,figure);figure=null;}
   if(!figure){figure=this.figure(side,id,keeper);this.figures.set(key,figure);}
   seen.add(key);
   const carries=replay.carrier?.side===side&&replay.carrier.id===id;
   figure.hold=keeper&&carries&&holding;
   this.pose(figure,toWorld(dot.x,dot.y),ball,rdt,cheering===side);
   figure.name.visible=dot.node.classList.contains('on');
   if(carries)carrier=figure;
  }
  for(const [key,figure] of this.figures)if(!seen.has(key))this.drop(key,figure);
  this.placeBall(ballAt,ball,carrier,rdt,away);
  this.ring.visible=!!carrier&&!away&&!carrier.hold;
  if(carrier)this.ring.position.set(carrier.x,.04,carrier.z);
  for(const side of ['home','away']){const fans=this.fans[side];fans.material.map=fans.frames[cheering===side?1+Math.floor(this.last/170)%2:0];}
  this.frameCamera(ball,away,dt);
 }
 // A new move of the replay: whoever passes, crosses or shoots strikes the ball, unless he meets a cross with his
 // head; a keeper who has to reach the ball dives for it.
 begin(action,previous){
  this.flight=null;
  if(!action)return;
  const figure=who=>who&&this.figures.get(`${who.side}:${who.id}`);
  const header=action.kind==='shot'&&previous?.kind==='cross';
  if(['pass','cross','shot'].includes(action.kind)){
   const by=figure(action.by);
   if(by&&!header)by.kick=0;
   this.flight={action,from:{...action.ballFrom},start:header?HEAD:0,end:action.kind==='cross'?HEAD:action.kind==='shot'?this.shotHeight(action,header):0};
  }
  const keeper=action.kind==='shot'&&action.keeperPoint&&action.keeperFrom&&figure(action.keeper);
  if(keeper){
   const from=toWorld(action.keeperFrom.x,action.keeperFrom.y),to=toWorld(action.keeperPoint.x,action.keeperPoint.y);
   if(Math.hypot(to.x-from.x,to.z-from.z)>1.6)keeper.dive={action,amount:0,dx:to.x-from.x,dz:to.z-from.z};
  }
 }
 // Where a shot ends, in metres above the grass: a header is nodded down, a blocked shot hits a body, a miss may
 // clear the bar, the rest go anywhere under it. The same shot always ends at the same height.
 shotHeight(action,header){
  const random=seeded(Math.round(action.target.x*97)*7919+Math.round(action.target.y*89))();
  const onLine=Math.min(Math.abs(action.target.x),Math.abs(action.target.x-W))<3;
  if(header)return lerp(.2,1.4,random);
  if(!onLine)return lerp(.4,1.1,random);
  return action.keeperPoint?lerp(.25,2.6,random):lerp(.4,4.2,random);
 }
 // The goal banner is up: the side that scored celebrates, on the pitch and in the stands.
 cheering(){
  const replay=this.replay,sequence=replay.sequences?.[replay.current];
  return replay.banner?.classList.contains('on')&&sequence?replay.side(sequence.team):null;
 }
 placeBall(ballAt,ball,carrier,rdt,away){
  const replay=this.replay,flight=this.flight,flying=flight&&replay.action===flight.action;
  let height=(replay.ballHeight||0)*LOFT,at={x:ball.x,z:ball.z};
  if(flying){
   // How far along its path the ball is, from the ground covered, to climb to a head or to its spot in the goal.
   const action=flight.action,aim=action.kind==='shot'?action.target:action.point;
   const covered=Math.hypot(ballAt.x-flight.from.x,ballAt.y-flight.from.y),left=Math.hypot(aim.x-ballAt.x,aim.y-ballAt.y);
   const t=covered+left>0?covered/(covered+left):1;
   height+=lerp(flight.start,flight.end,t);
   // The man who meets a cross leaves the ground in time to reach it.
   const header=action.kind==='cross'&&this.figures.get(`${action.to?.side}:${action.to?.id}`);
   if(header&&!flight.jumped&&action.t0+action.duration-replay.time<=JUMP_MS/2){header.jump=0;flight.jumped=true;}
  }else if(carrier?.hold){
   // A keeper who caught it holds it to his chest.
   const reach=.45*SCALE;at={x:carrier.x+Math.sin(carrier.yaw)*reach,z:carrier.z+Math.cos(carrier.yaw)*reach};height=1.05*SCALE+carrier.body.position.y-BALL;
  }
  // A ball left in the air (in the net, or when the replay cuts) drops to the grass rather than vanishing to it.
  if(away){this.height=this.fall=0;}
  else if(!flying&&height<this.height){this.fall+=rdt*4e-5;height=Math.max(height,this.height-this.fall*rdt);}
  else this.fall=0;
  this.height=height;
  const previous=this.ball.position.clone(),position=new THREE.Vector3(at.x,BALL+height,at.z);
  // It rolls and spins with the ground it covers; a jump of the replay does not spin it.
  const step=Math.hypot(position.x-previous.x,position.z-previous.z);
  if(step>1e-4&&step<8)this.ball.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3((position.z-previous.z)/step,0,-(position.x-previous.x)/step),step/BALL));
  this.ball.position.copy(position);
  this.ballShadow.position.set(at.x,.03,at.z);this.ballShadow.scale.setScalar(1/(1+height*.15));
 }
 // Runs, turns, strikes, jumps and dives, from how far he moved in the replay's time since the last frame.
 pose(figure,at,ball,rdt,cheer){
  let moved=figure.x==null?0:Math.hypot(at.x-figure.x,at.z-figure.z);
  // The replay cut to a new scene: he is simply there.
  if(moved>6){moved=0;figure.speed=0;figure.yaw=null;}
  const course=moved>1e-4?Math.atan2(at.x-figure.x,at.z-figure.z):null;
  figure.x=at.x;figure.z=at.z;
  figure.root.position.set(at.x,0,at.z);
  // While the replay is paused everyone holds his pose.
  if(!rdt&&figure.yaw!=null)return;
  if(rdt)figure.speed+=(moved/rdt*1000-figure.speed)*(1-Math.exp(-rdt/80));
  const speed=figure.speed,running=speed>JOG&&course!=null;
  const heading=running&&!figure.dive&&figure.kick==null&&!figure.hold?course:Math.atan2(ball.x-at.x,ball.z-at.z);
  figure.yaw=figure.yaw==null?heading:turn(figure.yaw,heading,1-Math.exp(-rdt/(figure.kick!=null?60:running?110:240)));
  // About one stride per 1.8 m; the swing grows with the pace.
  figure.phase+=moved/1.8*Math.PI;
  const pace=figure.hold?0:Math.min(.95,speed/9),s=Math.sin(figure.phase),c=Math.cos(figure.phase);
  const hip=[0,0],knee=[0,0],shoulder=[0,0],spread=[.1,.1],elbow=[0,0];
  let lift=Math.abs(c)*Math.min(.08,speed/110),lean=Math.min(.22,speed/60),roll=0;
  for(const [leg,sign] of [[0,1],[1,-1]]){
   hip[leg]=-pace*sign*s;
   // The knee folds as the leg swings through, and stays almost straight while the foot is down.
   knee[leg]=.08+pace*(1.5*Math.max(0,sign*c)+.25);
   shoulder[leg]=pace*.9*sign*s;elbow[leg]=-(.25+pace*1.1);
  }
  const blend=(list,value,k)=>{for(const side of [0,1])list[side]=lerp(list[side],typeof value==='function'?value(side):value,k);};
  if(figure.keeper){
   // A keeper sets himself, knees bent and hands out, when the ball comes near.
   const near=!running&&Math.hypot(ball.x-at.x,ball.z-at.z)<30?1:0;
   figure.ready+=(near-figure.ready)*(1-Math.exp(-rdt/200));
   const k=figure.ready;
   blend(hip,-.35,k);blend(knee,.75,k);blend(spread,.55,k);blend(elbow,-.9,k);blend(shoulder,-.35,k);
   lift-=.08*k;lean=lerp(lean,.2,k);
  }
  if(figure.hold){blend(shoulder,-1.1,1);blend(elbow,-1,1);blend(spread,.2,1);}
  if(figure.kick!=null){
   figure.kick+=rdt/KICK_MS;
   const t=figure.kick,foot=figure.foot;
   if(t>=1)figure.kick=null;
   else{
    // Through the ball, then the follow-through, then back to his stride.
    const k=smooth(Math.min(1,t/.08))*(1-smooth(clamp((t-.6)/.4,0,1)));
    const swing=t<.28?lerp(.6,-1.15,smooth(t/.28)):lerp(-1.15,-.2,smooth((t-.28)/.72)),bend=t<.28?lerp(1.2,.1,t/.28):lerp(.1,.4,(t-.28)/.72);
    hip[foot]=lerp(hip[foot],swing,k);knee[foot]=lerp(knee[foot],bend,k);
    hip[1-foot]=lerp(hip[1-foot],.15,k);knee[1-foot]=lerp(knee[1-foot],.25,k);
    blend(spread,.7,k);blend(shoulder,side=>side===foot?0.4:-0.5,k);
    lean=lerp(lean,-.08,k);
   }
  }
  if(figure.jump!=null){
   figure.jump+=rdt/JUMP_MS;
   if(figure.jump>=1)figure.jump=null;
   else{const k=Math.sin(Math.PI*figure.jump);lift+=.75*k;blend(knee,1.1,k);blend(hip,-.5,k);blend(shoulder,-1.6,k);blend(spread,.5,k);blend(elbow,-.4,k);lean=lerp(lean,-.12,k);}
  }
  const dive=figure.dive;
  if(dive){
   const action=this.replay.action;
   const flying=action===dive.action;
   if(flying)dive.amount=smooth(clamp((this.replay.time-action.t0)/action.duration*1.7,0,1));
   else dive.amount-=rdt/RECOVER_MS;
   if(!flying&&dive.amount<=0)figure.dive=null;
   else{
    // Towards the side of the ball in his own frame, at full stretch, arms beyond his head.
    const k=dive.amount,side=Math.sign(dive.dx*Math.cos(figure.yaw)-dive.dz*Math.sin(figure.yaw))||1;
    roll=-side*1.15*k;lift+=.5*k;
    blend(shoulder,-2.9,k);blend(spread,.15,k);blend(elbow,-.1,k);blend(knee,.15,k);blend(hip,-.1,k);lean=lerp(lean,0,k);
   }
  }
  figure.cheer=clamp(figure.cheer+(cheer?rdt/250:-rdt/300),0,1);
  if(figure.cheer>0){
   const k=figure.cheer;
   lift+=.25*Math.abs(Math.sin(this.clock*.012+figure.seed))*k;
   blend(shoulder,-2.75,k);blend(spread,.35,k);blend(elbow,-.2,k);
  }
  for(const side of [0,1]){
   figure.hips[side].rotation.x=hip[side];figure.knees[side].rotation.x=knee[side];
   figure.shoulders[side].rotation.set(shoulder[side],0,(side?1:-1)*spread[side]);figure.elbows[side].rotation.x=elbow[side];
  }
  figure.body.rotation.set(lean,figure.yaw,roll);
  figure.body.position.y=lift;
  figure.name.position.y=2.75+Math.max(0,lift);
  figure.blob.scale.setScalar(1/(1+Math.max(0,lift)*.6));
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
