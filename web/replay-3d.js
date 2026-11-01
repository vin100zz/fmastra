// The replay seen from the main stand, as on television. match-replay.js still plays the match: this view reads
// where its players and ball are at each frame and draws them in 3D, without changing anything.
// Pitch units are metres: x along the touchline (0 to 105), y across (0 at the far touchline, 68 at the near one).
// In the scene, x runs along the touchline from the centre spot, z across towards the camera, y up.
import * as THREE from './vendor/three/three.module.js';
import {LABEL,OVERLAY,createPlayerParts,createPlayerFigure,loadPlayerModel} from './replay-player.js';
import {activeGesture,angleDelta,playerMotion,strideLength} from './replay-motion.js';
import {SCALE,loadMotionLibrary} from './replay-locomotion.js';
import {EffectComposer} from './vendor/three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from './vendor/three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from './vendor/three/addons/postprocessing/GTAOPass.js';
import {UnrealBloomPass} from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from './vendor/three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from './vendor/three/addons/postprocessing/ShaderPass.js';

const W=105,H=68,MARGIN_X=6,MARGIN_Y=5;
// The broadcast camera works on a long lens from far back, as on television: the perspective flattens and the
// players keep their size on screen. [height, distance from the halfway line's centre] close to the ball, then
// for the whole pitch while the clock runs.
export const LENS=17;
// The players' body and their captured gaits, fetched with this module in a browser; a Pitch3D is built once
// they have arrived. Without the gaits, the players move on the procedural gait alone.
export const ready=typeof window==='undefined'?Promise.resolve():Promise.all([
 loadPlayerModel(new URL('./models/footballer.bin',import.meta.url)),
 loadMotionLibrary(new URL('./models/motions.json',import.meta.url)).catch(()=>null)]);
const CLOSE=[30,82],WIDE=[56,154];
// The effects in order of cost, dropped one by one when a frame takes longer than FRAME_BUDGET milliseconds on average.
const QUALITY={full:2,bloom:1,plain:0},FRAME_BUDGET=25,BUDGET_FRAMES=90;
const SKINS=['#f1c9a0','#d9a577','#b27b52','#8a5a3b','#5e3b27'];
// A regulation ball, 22 cm across, drawn a size up like the players and goals.
export const BALL=.11*SCALE;
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
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const toWorld=(x,y)=>({x:x-W/2,z:y-H/2});
// Shortest turn from one heading to another.
const turn=(from,to,k)=>from+angleDelta(from,to)*k;
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

// The grass, drawn by its shader on the lit material so that it keeps its shadows and reflections: ten mowing
// stripes carried on to the boards, the grass laid alternately towards and away from the camera so that their
// contrast follows the view; tufts and patches on three scales, wear in the goalmouths and at the spots, and the
// lines measured in metres, as sharp near the camera as at the far touchline.
const GRASS={light:'#52873d',dark:'#437634',dry:'#7f8150',worn:'#776c4a',paint:'#eef2ea'};
const GRASS_SHADER=`
uniform vec3 grassLight,grassDark,grassDry,grassWorn,linePaint;
varying vec3 vPitch;
float grassHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float grassNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(grassHash(i),grassHash(i+vec2(1,0)),f.x),mix(grassHash(i+vec2(0,1)),grassHash(i+vec2(1,1)),f.x),f.y);
}
float segment(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.));}
// Distance in metres to the nearest line, the pitch's corner at the origin.
float pitchLines(vec2 p){
 const float W=${W.toFixed(1)},H=${H.toFixed(1)};
 vec2 end=vec2(min(p.x,W-p.x),p.y),corner=vec2(min(p.x,W-p.x),min(p.y,H-p.y));
 float d=min(min(segment(p,vec2(0),vec2(W,0)),segment(p,vec2(0,H),vec2(W,H))),min(segment(p,vec2(0),vec2(0,H)),segment(p,vec2(W,0),vec2(W,H))));
 d=min(d,segment(p,vec2(W*.5,0),vec2(W*.5,H)));
 d=min(d,abs(length(p-vec2(W,H)*.5)-9.15));
 for(int box=0;box<2;box++){
  float depth=box==0?16.5:5.5,across=box==0?20.16:9.16;
  d=min(d,segment(end,vec2(0,H*.5-across),vec2(depth,H*.5-across)));
  d=min(d,segment(end,vec2(0,H*.5+across),vec2(depth,H*.5+across)));
  d=min(d,segment(end,vec2(depth,H*.5-across),vec2(depth,H*.5+across)));
 }
 if(end.x>16.5)d=min(d,abs(length(end-vec2(11,H*.5))-9.15));
 if(corner.x>0.&&corner.y>0.)d=min(d,abs(length(corner)-1.));
 return d;
}
float pitchSpots(vec2 p){
 const float W=${W.toFixed(1)},H=${H.toFixed(1)};
 vec2 end=vec2(min(p.x,W-p.x),p.y);
 return min(length(end-vec2(11,H*.5)),length(p-vec2(W,H)*.5));
}
// Paint coverage of a line of the given width, the pixel being the footprint of a pixel on the grass (the
// distance's own derivative vanishes on the line, where it folds): thinner than a pixel far away, it fades
// instead of breaking up.
float paint(float d,float width,float pixel){
 float drawn=max(width*.5,pixel*.6);
 return width*.5/drawn*(1.-smoothstep(drawn-pixel*.5,drawn+pixel*.5,d));
}
vec3 grassColour(vec3 world){
 vec2 p=world.xz+vec2(${(W/2).toFixed(1)},${(H/2).toFixed(1)});
 vec3 view=normalize(cameraPosition-world);
 float lay=mod(floor(p.x/${(W/10).toFixed(1)}),2.)*2.-1.;
 vec3 colour=mix(grassDark,grassLight,.5+.5*lay*(.45+.55*clamp(view.z*1.15,-1.,1.)));
 float broad=grassNoise(p*.09+3.1),tufts=grassNoise(p*.55)*.6+grassNoise(p*2.1)*.4;
 float fine=grassNoise(p*11.),near=1.-smoothstep(.04,.18,max(fwidth(p.x),fwidth(p.y))*11.);
 colour=mix(colour,grassDry,smoothstep(.55,.95,broad)*.16);
 colour*=.9+.2*tufts+(fine-.5)*.16*near;
 vec2 end=vec2(min(p.x,${W.toFixed(1)}-p.x),p.y);
 float wear=.75*(1.-smoothstep(0.,6.5,length((end-vec2(2.5,${(H/2).toFixed(1)}))*vec2(1.,.8))))
  +.3*(1.-smoothstep(0.,3.5,length(end-vec2(11,${(H/2).toFixed(1)}))))+.18*(1.-smoothstep(0.,8.,length(p-vec2(${(W/2).toFixed(1)},${(H/2).toFixed(1)}))));
 colour=mix(colour,grassWorn,clamp(wear*(.35+.9*tufts),0.,.85));
 float pixel=max(length(fwidth(p))*.75,1e-4);
 float lines=max(paint(pitchLines(p),.12,pixel),1.-smoothstep(.2-pixel,.2+pixel,pitchSpots(p)));
 return mix(colour,linePaint*(.93+.07*tufts),lines*.94);
}
`;
function grassMaterial(){
 const material=new THREE.MeshStandardMaterial({roughness:1,envMapIntensity:.3});
 const uniforms=Object.fromEntries(Object.entries({grassLight:'light',grassDark:'dark',grassDry:'dry',grassWorn:'worn',linePaint:'paint'})
  .map(([name,key])=>[name,{value:new THREE.Color(GRASS[key])}]));
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPitch;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvPitch=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${GRASS_SHADER}`)
   .replace('#include <map_fragment>','diffuseColor.rgb=grassColour(vPitch);');
 };
 material.customProgramCacheKey=()=>'pitch-grass';
 return material;
}

// A floodlit stadium at night for the reflections and the soft light: a dark sky, the stands, the green of the
// pitch below and a bright strip under each roof.
function stadiumEnvironment(renderer){
 const scene=new THREE.Scene(),pmrem=new THREE.PMREMGenerator(renderer);
 scene.add(new THREE.Mesh(new THREE.SphereGeometry(90,48,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
  vertexShader:'varying vec3 vDirection;void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec3 vDirection;void main(){
   float y=vDirection.y;vec3 grass=vec3(.035,.09,.03),stand=vec3(.03,.032,.038),sky=vec3(.008,.014,.03);
   vec3 colour=y<0.?mix(grass*1.6,grass,clamp(-y*2.,0.,1.)):mix(stand,sky,smoothstep(.3,.55,y));
   gl_FragColor=vec4(colour,1.);}`})));
 const lamp=new THREE.MeshBasicMaterial({color:new THREE.Color('#fff4de').multiplyScalar(9)});
 for(const [x,z,length,angle] of [[0,-42,90,0],[0,46,90,0],[-62,0,60,Math.PI/2],[62,0,60,Math.PI/2]]){
  const strip=new THREE.Mesh(new THREE.BoxGeometry(length,2.5,2.5),lamp);strip.position.set(x,30,z);strip.rotation.y=angle;scene.add(strip);
 }
 const target=pmrem.fromScene(scene,.035);
 pmrem.dispose();scene.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});
 return target;
}

// The last touch, on the displayed image: a gentle contrast curve, a little more saturation and a vignette.
const GRADE={
 uniforms:{tDiffuse:{value:null},contrast:{value:.18},saturation:{value:1.02},vignette:{value:.42}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`uniform sampler2D tDiffuse;uniform float contrast,saturation,vignette;varying vec2 vUv;
 void main(){
  vec4 texel=texture2D(tDiffuse,vUv);vec3 colour=clamp(texel.rgb,0.,1.);
  colour=mix(colour,colour*colour*(3.-2.*colour),contrast);
  colour=mix(vec3(dot(colour,vec3(.2126,.7152,.0722))),colour,saturation);
  vec2 edge=vUv-.5;colour*=1.-vignette*dot(edge,edge);
  gl_FragColor=vec4(colour,texel.a);
 }`,
};

// Half-resolution occlusion: enough for contact shadows at broadcast distance, at a quarter of the cost.
class HalfGTAOPass extends GTAOPass{
 setSize(width,height){super.setSize(Math.max(1,Math.round(width/2)),Math.max(1,Math.round(height/2)));}
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

export class Pitch3D{
 constructor(replay){
  this.replay=replay;
  this.canvas=document.createElement('canvas');
  this.canvas.className='replay-3d';
  this.canvas.setAttribute('aria-hidden','true');
  // The effects antialias their own buffers; the canvas only receives the finished image.
  const renderer=this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(2,devicePixelRatio));
  // The neutral curve keeps the kits' colours true while it softens the floodlit highlights.
  renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  this.textures=[];this.materials=new Map();
  const scene=this.scene=new THREE.Scene();
  scene.background=this.texture(skyCanvas());
  scene.fog=new THREE.Fog('#1b2738',230,560);
  this.environmentTarget=stadiumEnvironment(renderer);
  scene.environment=this.environmentTarget.texture;
  this.camera=new THREE.PerspectiveCamera(LENS,1.5,1,700);
  this.camera.layers.enable(OVERLAY);
  // An evening match under floodlights: the stadium's reflected light, a key light high over the main stand
  // whose soft shadows anchor the players, and a cooler fill from the opposite corner.
  scene.add(new THREE.HemisphereLight('#e4efff','#52684b',.7));
  const sun=new THREE.DirectionalLight('#fff2db',2.6);
  sun.position.set(-35,70,25);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-62,right:62,top:42,bottom:-42,near:10,far:160});
  sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;sun.shadow.radius=3;
  scene.add(sun);
  const fill=new THREE.DirectionalLight('#c5dcff',.9);fill.position.set(35,28,-42);scene.add(fill);
  this.build();
  this.effects();
  this.figures=new Map();
  this.look={x:0,z:0};this.last=performance.now();
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
 // Kit fabric: matt, with the soft sheen that knitted cloth catches at grazing angles under the floodlights.
 cloth(color,roughness=.85){
  const key=`cloth:${color}/${roughness}`;
  if(!this.materials.has(key))this.materials.set(key,new THREE.MeshPhysicalMaterial({color,roughness,sheen:.7,sheenRoughness:.45,
   sheenColor:new THREE.Color(color).lerp(new THREE.Color('#ffffff'),.45)}));
  return this.materials.get(key);
 }
 // Render, occlusion, bloom of the lights, tone mapping, then the grade, all at the renderer's pixel ratio.
 effects(){
  const renderer=this.renderer,target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
  const composer=this.composer=new EffectComposer(renderer,target);
  composer.addPass(new RenderPass(this.scene,this.camera));
  // The occlusion has its own camera, which follows the main one but leaves out the overlay layer.
  this.aoCamera=this.camera.clone();this.aoCamera.layers.set(0);
  const ao=this.ao=new HalfGTAOPass(this.scene,this.aoCamera,2,2);
  ao.updateGtaoMaterial({radius:.7,distanceExponent:1.4,thickness:1.2,scale:1.1,samples:12});
  ao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:6,rings:2,samples:12});
  ao.blendIntensity=.85;
  composer.addPass(ao);
  composer.addPass(this.bloom=new UnrealBloomPass(new THREE.Vector2(256,256),.32,.45,1.05));
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GRADE));
  this.quality=QUALITY.full;this.adaptive=true;this.budget={frames:0,time:0};
 }
 // Drops effects down to `level`; below the bloom, the image is also drawn at one pixel per CSS pixel.
 setQuality(level){
  this.quality=level;
  this.ao.enabled=level>=QUALITY.full;this.bloom.enabled=level>=QUALITY.bloom;
  const ratio=level>QUALITY.plain?Math.min(2,devicePixelRatio):1;
  if(this.renderer.getPixelRatio()!==ratio){this.renderer.setPixelRatio(ratio);this.composer.setPixelRatio(ratio);this.fit();}
 }
 // Keeps the effects that the machine can hold: one level down each time the average frame overruns the budget.
 measure(dt){
  if(!this.adaptive||this.quality===QUALITY.plain)return;
  this.budget.frames++;this.budget.time+=dt;
  if(this.budget.frames<BUDGET_FRAMES)return;
  if(this.budget.time/this.budget.frames>FRAME_BUDGET)this.setQuality(this.quality-1);
  this.budget={frames:0,time:0};
 }
 build(){
  const scene=this.scene,teams=this.replay.teams;
  const accent=getComputedStyle(this.replay).getPropertyValue('--accent').trim()||'#f2c94c';
  const surround=new THREE.Mesh(new THREE.PlaneGeometry(520,380),this.material('#37413b',1));
  surround.rotation.x=-Math.PI/2;surround.position.y=-.02;scene.add(surround);
  const grass=new THREE.Mesh(new THREE.PlaneGeometry(W+2*MARGIN_X,H+2*MARGIN_Y),grassMaterial());
  grass.rotation.x=-Math.PI/2;grass.receiveShadow=true;scene.add(grass);
  // The fans: a home crowd all round, the visitors in the far corner of the right-hand end.
  const seat=teams.home.major;
  this.fans={};
  for(const [side,seed] of [['home',3],['away',5]]){
   const frames=[0,1,2].map(pose=>this.texture(crowdCanvas(teams[side],seat,pose,seed),[1/(SEATS*SEAT),1/(ROWS*ROW)]));
   this.fans[side]={frames,material:new THREE.MeshLambertMaterial({map:frames[0],color:'#8d9299'})};
  }
  // The LED boards and the floodlights shine above white, so that the bloom catches them.
  this.led=new THREE.MeshBasicMaterial({map:this.texture(boardCanvas(teams,accent),[1/BOARD_TILE,1]),color:new THREE.Color(1,1,1).multiplyScalar(1.25)});
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
  const shadow=this.ballShadow=new THREE.Mesh(new THREE.CircleGeometry(BALL*1.6,20),this.blob);
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.03;shadow.layers.set(OVERLAY);scene.add(shadow);
  const ring=this.ring=new THREE.Mesh(new THREE.RingGeometry(.9,1.15,32),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.9,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.04;ring.visible=false;ring.layers.set(OVERLAY);scene.add(ring);
  this.people=new THREE.Group();scene.add(this.people);
  this.parts=createPlayerParts();
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
  const lights=new THREE.Mesh(new THREE.BoxGeometry(length*.98,.22,.12),new THREE.MeshBasicMaterial({color:new THREE.Color('#fff6dc').multiplyScalar(5)}));lights.position.set(0,height-.86,front-.1);
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
  group.traverse(node=>{if(node.material===net)node.layers.set(OVERLAY);});
  group.position.set(end-W/2,0,0);
  return group;
 }
 figure(side,id,keeper){return createPlayerFigure(this,side,id,keeper);}

 drop(key,figure){
  this.people.remove(figure.root);
  figure.name.material.map.dispose();figure.name.material.dispose();
  figure.skin.geometry.dispose();figure.skeleton.dispose();
  this.figures.delete(key);
 }

 fit(){
  const {clientWidth:width,clientHeight:height}=this.replay.stage;
  if(!width||!height)return;
  this.renderer.setSize(width,height,false);
  this.composer.setSize(width,height);
  this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
 }
 dispose(){
  cancelAnimationFrame(this.frame);this.frame=null;
  this.resize.disconnect();
  for(const figure of this.figures.values())figure.name.material.map.dispose();
  const geometries=new Set(Object.values(this.parts)),materials=new Set(this.materials.values());
  this.scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);if(node.material)materials.add(node.material);});
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials)material.dispose();
  for(const texture of this.textures)texture.dispose();
  for(const pass of this.composer.passes)pass.dispose?.();
  this.composer.dispose();this.environmentTarget.dispose();
  this.renderer.dispose();
  this.canvas.remove();
 }

 tick(now){
  if(!this.frame)return;
  this.frame=requestAnimationFrame(next=>this.tick(next));
  const dt=Math.min(64,now-this.last);this.last=now;
  // Nothing to draw while the summary is folded away.
  // Live, a dead time hides the view for the top-down pitch: it comes back framed afresh on the next chance.
  if(!this.replay.isConnected||!this.canvas.offsetParent){if(this.replay.stage?.classList.contains('fast'))this.wasAway=true;return;}
  this.update(dt);
  this.render();
  this.measure(dt);
 }
 render(){
  this.aoCamera.copy(this.camera);this.aoCamera.layers.set(0);
  this.composer.render();
 }
 update(dt){
  const replay=this.replay,stage=replay.stage,away=stage.classList.contains('fast')||stage.classList.contains('cut');
  // The replay's own clock: it runs faster during a chance, at the chosen speed, and stops on pause.
  const time=replay.time||0,reset=time<this.clock||this.replayRun!==replay.run||this.wasAway&&!away;
  const rdt=this.clock==null||reset?0:clamp(time-this.clock,0,400);this.clock=time;this.replayRun=replay.run;this.wasAway=away;
  const action=replay.action;
  const ballAt=replay.ballAt||{x:W/2,y:H/2},ball=toWorld(ballAt.x,ballAt.y);
  this.people.visible=this.ball.visible=this.ballShadow.visible=!away;
  const cheering=away?null:this.cheering(),holding=replay.carrier&&(!action||action.kind==='wait');
  // Who has the ball, or last had it: the other side defends, its man closing the ball down stands guard in front of him.
  const possession=replay.carrier?.side??replay.lastSide,owner=replay.carrier&&replay.dots[replay.carrier.side]?.get(replay.carrier.id);
  const seen=new Set();
  let carrier=null;
  for(const side of ['home','away'])for(const [id,dot] of replay.dots[side]){
   const key=`${side}:${id}`,keeper=replay.rosters[side].find(player=>player.id===id)?.position==='GB';
   let figure=this.figures.get(key);
   if(figure&&figure.keeper!==keeper){this.drop(key,figure);figure=null;}
   if(!figure){figure=this.figure(side,id,keeper);this.figures.set(key,figure);}
   seen.add(key);
   const carries=replay.carrier?.side===side&&replay.carrier.id===id;
   figure.hold=(keeper||!!dot.hands)&&carries&&holding;
   if(reset){figure.dive=null;figure.yaw=null;}
   if(keeper&&action?.keeper?.side===side&&action.keeper.id===id&&(action!==this.action||reset))this.begin(action);
   const defending=!!possession&&side!==possession;
   const guard=defending&&!keeper&&!!owner&&replay.pressers?.[side]===id&&Math.hypot(owner.x-dot.x,owner.y-dot.y)<6;
   this.pose(figure,toWorld(dot.x,dot.y),ball,rdt,false,dot.gestures||[dot.gesture].filter(Boolean),time,reset,{defending,guard,carries,mood:dot.moods?.findLast(mood=>time>=mood.at&&time<mood.until)});
   figure.name.visible=dot.node.classList.contains('on');
   if(carries)carrier=figure;
  }
  for(const [key,figure] of this.figures)if(!seen.has(key))this.drop(key,figure);
  this.action=action;
  this.placeBall(ball,carrier);
  this.ring.visible=!!carrier&&!away&&!carrier.hold;
  if(carrier)this.ring.position.set(carrier.x,.04,carrier.z);
  for(const side of ['home','away']){const fans=this.fans[side];fans.material.map=fans.frames[cheering===side?1+Math.floor(time/170)%2:0];}
  // Whoever the replay points the camera at (the scorer running off), or the ball.
  const focus=replay.focus&&replay.dots[replay.focus.side]?.get(replay.focus.id),framed=focus?toWorld(focus.x,focus.y):ball;
  this.frameCamera(framed,away,reset||!this.cameraReady?10000:Math.min(64,rdt));this.cameraReady=true;
 }
 // A strike at goal: a keeper who has to reach the ball dives for it.
 begin(action){
  const keeper=action?.kind==='shot'&&action.keeperPoint&&action.keeperFrom&&action.keeper&&this.figures.get(`${action.keeper.side}:${action.keeper.id}`);
  if(!keeper)return;
  const from=toWorld(action.keeperFrom.x,action.keeperFrom.y),to=toWorld(action.keeperPoint.x,action.keeperPoint.y);
  const ball=this.replay.ballAt||action.target,yaw=keeper.yaw??Math.atan2(ball.x-action.keeperFrom.x,ball.y-action.keeperFrom.y);
  const lateral=(to.x-from.x)*Math.cos(yaw)-(to.z-from.z)*Math.sin(yaw);
  const height=action.keeperHeight??.6,distance=Math.abs(lateral);
  // A low ball close to him is kept out with the foot, one save in two, the same each time the chance is replayed.
  const foot=action.outcome==='save'&&height<.35&&distance<1.7&&Math.floor(action.t0)%2===0;
  keeper.dive={start:action.t0,duration:action.keeperReach??action.duration*.92,distance,side:Math.sign(lateral)||1,height,yaw,style:foot?'foot':'dive'};
 }
 // The goal banner is up (live, the goal's band): the side that scored celebrates, on the pitch and in the stands.
 cheering(){
  const replay=this.replay,sequence=replay.sequences?.[replay.current];
  return (replay.banner?.classList.contains('on')||replay.stage?.querySelector('.goal-burst'))&&sequence?replay.side(sequence.team):null;
 }
 // The 2D replay flies the ball in real metres; the scene draws its players and goals a size up, and the height of
 // the ball with them, so that a header is met with the head and a shot under the bar stays under it.
 placeBall(ball,carrier){
  let height=(this.replay.ballZ||0)*SCALE,at={x:ball.x,z:ball.z};
  if(carrier?.hold){
   // The caught ball follows both gloves, including during the landing and rise.
   carrier.root.updateMatrixWorld(true);
   const hands=carrier.wrists.map(wrist=>wrist.getWorldPosition(new THREE.Vector3()));
   const centre=hands[0].add(hands[1]).multiplyScalar(.5);
   at={x:centre.x,z:centre.z};height=Math.max(0,centre.y-BALL);
  }
  const previous=this.ball.position.clone(),position=new THREE.Vector3(at.x,BALL+height,at.z);
  // It rolls and spins with the ground it covers; a jump of the replay does not spin it.
  const step=Math.hypot(position.x-previous.x,position.z-previous.z);
  if(step>1e-4&&step<8)this.ball.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3((position.z-previous.z)/step,0,-(position.x-previous.x)/step),step/BALL));
  this.ball.position.copy(position);
  this.ballShadow.position.set(at.x,.03,at.z);this.ballShadow.scale.setScalar(1+height*.12);
 }
 // Positions remain those of the replay; only the skeleton and its weight shift are animated. `defending`: his side
 // is without the ball; `guard`: he closes down the man on it; `carries`: the ball is at his feet.
 pose(figure,at,ball,rdt,cheer,gestures,time,reset=false,{defending=false,guard=false,carries=false,mood=null}={}){
  let moved=figure.x==null?0:Math.hypot(at.x-figure.x,at.z-figure.z);
  if(reset||moved>6){moved=0;figure.speed=0;figure.acceleration=0;figure.course=null;figure.yaw=null;if(!reset)figure.dive=null;figure.ready=0;figure.cheer=0;figure.watch=0;figure.guard=0;figure.mood=null;figure.moodWeight=0;figure.phase=figure.style.phase;}
  const course=moved>1e-4?Math.atan2(at.x-figure.x,at.z-figure.z):null;
  figure.x=at.x;figure.z=at.z;figure.root.position.set(at.x,0,at.z);
  if(!rdt&&figure.yaw!=null)return;
  const measured=rdt?Math.min(11,moved/rdt*1000):0,previousSpeed=figure.speed;
  if(rdt){
   figure.speed+=(measured-figure.speed)*(1-Math.exp(-rdt/100));
   figure.acceleration+=(clamp((figure.speed-previousSpeed)*1000/rdt,-6,6)-figure.acceleration)*(1-Math.exp(-rdt/180));
   if(course!=null)figure.course=figure.course==null?course:turn(figure.course,course,1-Math.exp(-rdt/65));
  }
  const speed=figure.speed,running=speed>JOG&&figure.course!=null,gesture=activeGesture(gestures,time);
  const gaze=Math.atan2(ball.x-at.x,ball.z-at.z),target=gesture?.target;
  // Off the ball he keeps his eyes on it: a defender, a keeper or anyone at a walk backpedals or steps sideways
  // rather than turn his back on it, up to the pace at which he has to turn and run (lower the further behind him
  // he is going). The switch is eased, so that he opens his hips into the run instead of spinning round.
  const behind=figure.course==null?0:Math.abs(angleDelta(figure.course,gaze));
  const limit=lerp(9.5,defending||figure.keeper?4.4:3,smooth((behind-.9)/1.5));
  const watching=!carries&&!figure.hold&&(defending||figure.keeper||speed<2.2)&&speed<limit?1:0;
  figure.watch+=(watching-figure.watch)*(1-Math.exp(-rdt/220));
  figure.guard+=((guard?1:0)-figure.guard)*(1-Math.exp(-rdt/250));
  // Commit to the pass/shot direction through contact instead of chasing the departing ball.
  let heading=gesture&&target?Math.atan2(target.x-W/2-at.x,target.y-H/2-at.z)
   :speed>.25&&figure.course!=null?figure.course+angleDelta(figure.course,gaze)*Math.max(figure.watch,figure.guard):gaze;
  if(figure.dive)heading=figure.dive.yaw;
  const previousYaw=figure.yaw;
  figure.yaw=previousYaw==null?heading:turn(previousYaw,heading,1-Math.exp(-rdt/(gesture?85:running?135:260)));
  const angularSpeed=previousYaw==null||!rdt?0:angleDelta(previousYaw,figure.yaw)*1000/rdt;
  // Where he travels in his own frame: ahead, backwards or to a side; his feet follow it, not his chest.
  const direction=speed>.25&&figure.course!=null?angleDelta(figure.yaw,figure.course):0;
  figure.direction=direction;
  figure.phase+=moved/strideLength(measured,figure.style,direction)*Math.PI*2;
  const near=figure.keeper&&!figure.hold&&!running&&Math.hypot(ball.x-at.x,ball.z-at.z)<32?1:0;
  figure.ready+=(near-figure.ready)*(1-Math.exp(-rdt/220));
  figure.cheer=clamp(figure.cheer+(cheer?rdt/300:-rdt/350),0,1);
  // His reaction, eased in and out over its window of the replay; the last one fades before another takes over.
  const reacting=mood&&time>=mood.at&&time<mood.until;
  if(reacting&&(figure.mood?.kind!==mood.kind||!figure.moodWeight))figure.mood=figure.moodWeight<.05?mood:figure.mood;
  const same=reacting&&figure.mood?.kind===mood.kind;
  figure.moodWeight=clamp(figure.moodWeight+(same?rdt/260:-rdt/300),0,1);
  if(!figure.moodWeight&&!reacting)figure.mood=null;
  if(figure.dive&&time>figure.dive.start+figure.dive.duration+1080)figure.dive=null;
  const p=playerMotion({speed:figure.hold?0:speed,phase:figure.phase,time,seed:figure.seed,style:figure.style,acceleration:figure.acceleration,ready:figure.ready,
   hold:figure.hold,gesture,foot:this.kickingFoot(figure,gesture,at),turn:angularSpeed,cheer:figure.cheer,dive:figure.dive,direction,crouch:figure.guard,
   mood:figure.mood&&{kind:figure.mood.kind,weight:smooth(figure.moodWeight)}});
  for(let side=0;side<2;side++){
   figure.hips[side].rotation.set(p.hip[side],p.hipYaw[side],p.hipRoll[side]);figure.knees[side].rotation.x=p.knee[side];
   // The sole stays level when the thigh swings out.
   figure.ankles[side].rotation.set(p.ankle[side],0,-p.hipRoll[side]);
   figure.shoulders[side].rotation.set(p.shoulder[side],0,(side?1:-1)*p.spread[side]);figure.elbows[side].rotation.x=p.elbow[side];
  }
  figure.body.rotation.set(0,figure.yaw,p.roll);
  figure.spine.rotation.set(p.lean,p.twist,p.spineRoll);
  // Off the ball he checks over his shoulder now and then, for a moment, before looking back at the play.
  const period=2600+figure.seed*450,glance=(time+figure.seed*997)%period,scan=!carries&&!gesture&&!figure.keeper&&!figure.moodWeight&&glance<650
   ?Math.sin(Math.PI*glance/650)*(Math.floor((time+figure.seed*997)/period)%2?.95:-.95):0;
  figure.head.rotation.set(p.headPitch,(clamp(angleDelta(figure.yaw,gaze)+scan,-1.1,1.1)+p.headYaw)*(1-p.diveWeight),-p.spineRoll*.55);
  figure.body.position.set(Math.cos(figure.yaw)*(p.shift+p.sway),p.lift,-Math.sin(figure.yaw)*(p.shift+p.sway));
  if(figure.dive?.style==='foot'&&p.diveWeight>0){
   // The boot goes to the ball: the replay dot marks the interception.
   figure.root.updateMatrixWorld(true);
   const leg=figure.dive.side>0?1:0,boot=figure.ankles[leg].getWorldPosition(new THREE.Vector3()),k=p.diveWeight;
   figure.body.position.x+=(at.x-boot.x)*k;figure.body.position.z+=(at.z-boot.z)*k;
  }else if(figure.dive&&p.diveWeight>0){
   // The skeleton reaches with its gloves: the replay dot already marks the
   // interception, so leaving the feet there would send the hands past the ball.
   figure.root.updateMatrixWorld(true);
   const gloves=figure.wrists.map(wrist=>wrist.getWorldPosition(new THREE.Vector3()));
   const centre=gloves[0].add(gloves[1]).multiplyScalar(.5),k=p.diveWeight;
   figure.body.position.x+=(at.x-centre.x)*k;figure.body.position.z+=(at.z-centre.z)*k;
   figure.body.position.y=Math.max(Math.min(.025,p.lift),figure.body.position.y+(BALL+figure.dive.height*SCALE-centre.y)*k);
  }
  figure.name.position.y=LABEL+Math.max(0,figure.body.position.y);
  figure.blob.scale.set(1+Math.abs(p.roll)*.35,1/(1+Math.max(0,p.lift)*.5),1);
 }
 // The foot he plays it with: his stronger one, unless the ball goes well across him (a cross, a pass to the side), when
 // he strikes it with the foot away from where it goes, round the ball. Chosen once per gesture.
 kickingFoot(figure,gesture,at){
  if(!gesture)return figure.foot;
  if(gesture.foot!=null)return gesture.foot;
  if(gesture.kind!=='kick'||!gesture.target||figure.yaw==null)return figure.foot;
  figure.feet??=new WeakMap();
  if(!figure.feet.has(gesture)){
   const off=angleDelta(figure.course??figure.yaw,Math.atan2(gesture.target.x-W/2-at.x,gesture.target.y-H/2-at.z));
   figure.feet.set(gesture,Math.abs(off)>.6?(off>0?0:1):figure.foot);
  }
  return figure.feet.get(gesture);
 }
 // The main camera: high on the near side, panning with the ball, wider while the clock runs.
 frameCamera(ball,wide,dt){
  const target=wide?{x:0,z:0}:{x:clamp(ball.x,-40,40),z:ball.z*.48};
  const k=1-Math.exp(-dt/(wide?900:520));
  this.look.x=lerp(this.look.x,target.x,k);this.look.z=lerp(this.look.z,target.z,k);
  const [up,back]=wide?WIDE:CLOSE;
  this.camera.position.set(this.look.x*.85,up,back);
  this.camera.lookAt(this.look.x,.65,this.look.z);
 }
}
