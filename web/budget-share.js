import {shareContent,draggedCap,steppedCap} from './club-finances.js';

// The handle of the budgets' share, on the Finances tab of the club the user runs (club-finances.js): dragged along its bar,
// or stepped with the left and right arrows, it shows the share it would set; let go, it sets it. `send` is given the weekly
// wage cap to set and answers whether the game took it.
export function initBudgetShare(root,send){
 // The share being moved: its block, the club's figures, the cap the handle stands on, and where the pointer took it.
 let held=null;
 const grab=handle=>{
  const block=handle.closest('[data-share]'),data=JSON.parse(block.dataset.share);
  // What the handle travels over: the bar without the handle itself.
  return {block,data,cap:data.wage_cap,width:handle.parentElement.clientWidth-handle.offsetWidth};
 };
 const paint=(cap,dragged=true)=>{held.cap=cap;held.block.innerHTML=shareContent(held.data,cap,dragged);};
 const release=async()=>{
  const {block,data,cap}=held,keyed=held.x==null;
  paint(cap,false);held=null;
  if(cap!==data.wage_cap&&!(await send(cap))&&block.isConnected)block.innerHTML=shareContent(data);
  // The page is drawn again once the share is set: the arrows keep the handle they were moving.
  if(keyed)root.querySelector('.balance-handle')?.focus();
 };
 root.addEventListener('pointerdown',event=>{
  const handle=event.target.closest('.balance-handle');
  if(!handle||handle.disabled||event.button)return;
  event.preventDefault();
  held={...grab(handle),x:event.clientX};
  paint(held.cap);
 });
 document.addEventListener('pointermove',event=>{if(held?.x!=null)paint(draggedCap(held.data,event.clientX-held.x,held.width));});
 for(const name of ['pointerup','pointercancel'])document.addEventListener(name,()=>{if(held?.x!=null)release();});
 // An arrow steps the handle while it is held down; the share is set when it is let go.
 const direction=event=>event.target.closest?.('.balance-handle')?{ArrowLeft:1,ArrowRight:-1}[event.key]:undefined;
 root.addEventListener('keydown',event=>{
  const step=direction(event);
  if(!step||event.target.disabled||held?.x!=null)return;
  event.preventDefault();
  held??=grab(event.target.closest('.balance-handle'));
  paint(steppedCap(held.data,held.cap,step,held.width));
  held.block.querySelector('.balance-handle').focus();
 });
 root.addEventListener('keyup',event=>{if(direction(event)&&held&&held.x==null)release();});
}
