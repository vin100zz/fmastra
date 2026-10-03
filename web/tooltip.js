// Replaces the browser's native title tooltips with one styled bubble (hover, keyboard focus, tap).
const bubble=document.createElement('div');
bubble.id='tooltip';bubble.setAttribute('role','tooltip');bubble.hidden=true;
let owner=null,timer=0;

const adopt=el=>{
 const text=el.getAttribute('title');
 if(text==null)return;
 el.removeAttribute('title');
 if(!text.trim())return;
 el.dataset.tip=text;
 if(!el.hasAttribute('aria-label')&&!el.textContent.trim())el.setAttribute('aria-label',text);
};
const target=node=>{
 const el=node instanceof Element?node.closest('[title],[data-tip]'):null;
 if(el?.hasAttribute('title'))adopt(el);
 return el?.dataset.tip?el:null;
};
const place=()=>{
 const box=owner.getBoundingClientRect(),w=bubble.offsetWidth,h=bubble.offsetHeight,m=8;
 const above=box.top-h-m>=0;
 const left=Math.min(Math.max(m,box.left+box.width/2-w/2),innerWidth-w-m);
 bubble.style.left=`${left}px`;
 bubble.style.top=`${above?box.top-h-m:box.bottom+m}px`;
 bubble.style.setProperty('--arrow',`${Math.min(Math.max(12,box.left+box.width/2-left),w-12)}px`);
 bubble.dataset.side=above?'top':'bottom';
};
const show=(el,delay)=>{
 clearTimeout(timer);
 timer=setTimeout(()=>{
  if(!el.isConnected)return;
  owner=el;bubble.textContent=el.dataset.tip;bubble.hidden=false;place();
 },delay);
};
const hide=()=>{clearTimeout(timer);owner=null;bubble.hidden=true;};

document.addEventListener('DOMContentLoaded',()=>document.body.append(bubble));
document.addEventListener('mouseover',event=>{
 const el=target(event.target);
 if(!el)return hide();
 if(el!==owner)show(el,owner?0:150);
});
document.addEventListener('mouseout',event=>{if(owner&&!owner.contains(event.relatedTarget))hide();});
document.addEventListener('focusin',event=>{const el=target(event.target);if(el&&event.target.matches(':focus-visible'))show(el,0);});
document.addEventListener('focusout',hide);
document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
document.addEventListener('pointerdown',event=>{
 if(event.pointerType==='mouse')return hide();
 const el=target(event.target);
 if(el&&el!==owner){show(el,0);clearTimeout(timer);setTimeout(hide,2500);}else hide();
});
addEventListener('scroll',hide,true);
addEventListener('resize',hide);
