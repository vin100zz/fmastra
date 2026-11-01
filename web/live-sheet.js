import {playerScreen} from './player.js';
import {escape as e} from './ui.js';

// A player's page over the live match (docs/charte-graphique.md, « Fiche sur le direct »): the page of the player as it
// stands, without its commands, in a layer over the whole window. The live match stays drawn under it, paused, its draft
// kept; « Retour au match » or Échap close the layer. The steps of its band go through the players of the match (`players`,
// in the order of the lists, both sides), and its links stay inside it: one to a player of the match opens his page there,
// any other is written as text, the match holding the screen until it is over.
let layer=null,context=null,opened=0;

export const sheetOpen=()=>Boolean(layer?.isConnected);

// `match` is the line of the paused match at the head of the layer, ready drawn.
export async function openPlayerSheet(id, {players, scope, match}) {
 context={players,scope,match};
 const version=++opened;
 const html=await playerScreen(id,{live:{players,scope}});
 if(version!==opened||!context)return;
 if(!sheetOpen()){
  layer=document.createElement('div');
  layer.className='live-sheet';
  layer.setAttribute('role','dialog');
  layer.setAttribute('aria-modal','true');
  document.body.append(layer);
 }
 const name=players.find(player=>player.id===Number(id))?.name??'';
 layer.setAttribute('aria-label',name?`Fiche de ${name}`:'Fiche du joueur');
 layer.innerHTML=`<header class="topbar live-sheet-bar"><button type="button" class="button primary live-sheet-back" data-sheet-close>`
  +`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Retour au match</button>${match}</header>`
  +`<div class="live-sheet-page">${html}</div>`;
 unlink(layer.querySelector('.live-sheet-page'),new Set(players.map(player=>player.id)));
 layer.querySelector('[data-sheet-close]').focus();
}

export function closePlayerSheet() {
 opened++;context=null;
 layer?.remove();layer=null;
}

// What would lead out of the match is written as text: a link becomes a span with its classes and its content.
export function unlink(root, ids) {
 root.querySelectorAll('a[href]').forEach(link=>{
  const player=link.getAttribute('href').match(/^#\/player\/(\d+)$/);
  if(player&&ids.has(Number(player[1]))){link.dataset.sheetPlayer=player[1];return;}
  const text=document.createElement('span');
  text.className=link.className;
  text.innerHTML=link.innerHTML;
  link.replaceWith(text);
 });
}

if(typeof document!=='undefined'){
 document.addEventListener('click',event=>{
  if(!sheetOpen()||!layer.contains(event.target))return;
  if(event.target.closest('[data-sheet-close]')){closePlayerSheet();return;}
  const step=event.target.closest('a[data-sheet-player]');
  if(step){event.preventDefault();step.closest('details')?.removeAttribute('open');if(context)openPlayerSheet(step.dataset.sheetPlayer,context);}
 });
 // Échap closes a menu of the band first, then the layer; the keys of the match wait under it.
 document.addEventListener('keydown',event=>{
  if(!sheetOpen()||event.key!=='Escape')return;
  const menu=layer.querySelector('details[open]');
  if(menu){menu.removeAttribute('open');return;}
  if(document.querySelector('dialog[open]'))return;
  closePlayerSheet();
 });
}

// The line of the paused match: both sides, the score, the minute, « En pause ».
export const pausedMatch=(home,away,score,minute,dot)=>`<div class="live-sheet-match"><span class="live-sheet-side">${dot(home)}${e(home.name)}</span>`
 +`<span>${score[0]} – ${score[1]}</span><span class="live-sheet-side">${e(away.name)}${dot(away)}</span>`
 +`<span class="live-clock running">${e(minute)}</span><span class="pill">En pause</span></div>`;
