import {api,escape as e,toast} from './ui.js';
import {playerMenu,actionData} from './player.js';
import {lineupAction} from './composition.js';

// A right click on a player opens what the user can do with him, at the pointer (docs/charte-graphique.md, « Menu d'un
// joueur ») : the actions of his page, in its words. The menu and the dialogs its actions open stand in the page, whose
// handlers they share under ids of their own; the next draw of the page takes them away.
const SCOPE='menu-';

// Who a right click is about: what carries a player (a place of the lineup, a button of his row) or links to his page,
// else the row or the line of a list that names him alone. `element` is what the menu marks while it is open: his row
// or his line when it is about him alone, else what was clicked.
export function playerAt(target){
 const idOf=element=>Number.parseInt(element.dataset.player??element.getAttribute('href').split('/')[2],10);
 const direct=target.closest('[data-player],a[href^="#/player/"]'),line=target.closest('tr,li');
 const named=new Set(line?[...line.querySelectorAll('a[href^="#/player/"]')].map(idOf):[]);
 if(direct)return {id:idOf(direct),element:named.size<2&&line||direct};
 return named.size===1?{id:[...named][0],element:line}:null;
}

// A row: an action and, in the muted ink on its right, where it stands. One that cannot be taken stays in its place,
// its reason in its tooltip; it keeps the focus of the keyboard, so `aria-disabled` and not `disabled`.
const row=item=>`<button type="button" role="menuitem"${item.obstacle?` aria-disabled="true" title="${e(item.obstacle)}"`:actionData(item)}>${item.label}${item.note?`<span>${item.note}</span>`:''}</button>`;
// The lineup first, on the Composition screen; then the player's state when nothing can be decided, or his actions, a
// line between two groups. Nothing to say, no menu.
export function menuHtml({state,groups},lineup=null){
 const blocks=[...(lineup?[row(lineup)]:[]),...(state?[`<p>${state}</p>`]:[]),...groups.filter(group=>group.length).map(group=>group.map(row).join(''))];
 return blocks.length?`<div class="menu" role="menu">${blocks.join('<hr>')}</div>`:'';
}
// The menu opens under the pointer, to its right; without room, above it or to its left.
export const menuPlace=(x,y,width,height,viewWidth,viewHeight)=>({left:Math.max(0,x+width>viewWidth?x-width:x),top:Math.max(0,y+height>viewHeight?y-height:y)});

// A player of a match alone (a negative id) has no page and no actions: only his place in the lineup.
const partsOf=async(id,state)=>id>0?playerMenu(await api(`/joueurs/${id}`),state,SCOPE):{state:null,groups:[],dialogs:''};
const host=main=>main.querySelector('#player-menu')||main.appendChild(Object.assign(document.createElement('div'),{id:'player-menu'}));
const shown=()=>document.querySelector('#player-menu .menu');

// Each opening and each closing has its turn: a menu still loading when another turn comes is never shown.
let turn=0,marked=null,focused=null;
export function closePlayerMenu(refocus=false){
 turn++;
 shown()?.remove();
 marked?.classList.remove('targeted');marked=null;
 if(refocus)focused?.focus?.();
 focused=null;
}

// Opens the menu of the player under a right click, in `main`; false when the click is not about a player, or when the
// game has nothing to offer (no club yet, a live match). A dialog and a field keep the browser's own menu.
export async function openPlayerMenu(event,main,state){
 const target=event.target;
 if(!target.closest||target.closest('dialog,input,textarea,select'))return false;
 if(target.closest('.menu')){event.preventDefault();return false;}
 const found=state.exists&&!state.recovery_required&&state.controlled_club_id!=null&&!state.live_match_id?playerAt(target):null;
 if(!found)return false;
 event.preventDefault();
 closePlayerMenu();
 const mine=turn,{clientX:x,clientY:y}=event;
 let parts;
 try{parts=await partsOf(found.id,state);}catch(error){toast(error.message,true);return false;}
 if(mine!==turn||!found.element.isConnected)return false;
 const html=menuHtml(parts,lineupAction(found.element,found.id));
 if(!html)return false;
 const node=host(main);
 node.innerHTML=html+parts.dialogs;
 const menu=node.firstElementChild,place=menuPlace(x,y,menu.offsetWidth,menu.offsetHeight,innerWidth,innerHeight);
 menu.style.left=`${place.left}px`;menu.style.top=`${place.top}px`;
 marked=found.element;marked.classList.add('targeted');
 focused=document.activeElement;
 menu.querySelector('button:not([aria-disabled])')?.focus({preventScroll:true});
 return true;
}

// The dialog of an action comes back with its answer (a counter-offer, the offers of the clubs asked) once the page has
// been drawn again: the player's dialogs are drawn again with it, and the one named `name` shown.
export async function showPlayerDialog(main,state,id,name){
 try{
  const parts=await partsOf(id,state);
  host(main).innerHTML=parts.dialogs;
  main.querySelector(`#${SCOPE}${name}`)?.showModal();
 }catch(error){toast(error.message,true);}
}

function install(){
 // A click closes the menu: on one of its rows once the page has heard it, or anywhere else. A row that cannot be taken
 // does nothing.
 document.addEventListener('click',event=>{if(!event.target.closest?.('.menu [aria-disabled="true"]'))closePlayerMenu();});
 document.addEventListener('contextmenu',event=>{if(!event.target.closest?.('.menu'))closePlayerMenu();},true);
 addEventListener('scroll',()=>closePlayerMenu(),true);
 addEventListener('resize',()=>closePlayerMenu());
 // Escape closes it and gives the focus back; the arrows step through its rows, which Enter takes.
 document.addEventListener('keydown',event=>{
  const menu=shown();
  if(!menu)return;
  if(event.key==='Escape'||event.key==='Tab'){closePlayerMenu(event.key==='Escape');return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopImmediatePropagation();
  const rows=[...menu.querySelectorAll('button')],at=rows.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'?rows.length-1:event.key==='ArrowDown'?(at+1)%rows.length:(at<=0?rows.length:at)-1;
  rows[next]?.focus();
 });
}
if(typeof document!=='undefined')install();
