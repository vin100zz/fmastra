// The home of the game (docs/charte-graphique.md, « Accueil »): two ways in, side by side and alike. Creating a game, the
// main action, opens « Nouvelle partie »; resuming one lists the saves, the latest first, each line opening its game.
import {api,escape as e,date,kitDot,table} from './ui.js';

// The brand's mark reversed, as in the corner of the rail; resuming has a save drawn the same way.
const BRAND='<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="3"/><path d="M16 0v32M0 10h5v12H0M32 10h-5v12h5"/><circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="2"/></svg>';
const SAVE='<svg class="door-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="3"/><path d="M8 7h12.5L24 10.5V25H8z"/><path d="M11.5 7v5h8V7"/><path d="M11.5 25v-7h9v7"/></svg>';
const TRASH='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>';
// The copy a save keeps of the one it replaced, named after the day that one was made at.
const DATED=/-\d{4}-\d{2}-\d{2}$/;

export const slotName=slot=>slot==='autosave'?'Sauvegarde automatique':slot;
const saved=seconds=>{const moment=new Date(seconds*1000);return `${new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium'}).format(moment)} · ${new Intl.DateTimeFormat('fr-FR',{timeStyle:'short'}).format(moment)}`;};

// The saves, a line each: its name, its club after its dot, the day its game stands at, when it was saved; the latest
// first, every column sorting. The line opens its game; the command that deletes it shows under the pointer.
export function savesList(slots){
 if(!slots.length)return '<section class="card"><div class="empty"><strong>Aucune sauvegarde</strong></div></section>';
 const rows=[...slots].sort((a,b)=>b.modified-a.modified);
 const cells=slot=>[`<span class="${DATED.test(slot.slot)?'muted':'strong'}">${e(slotName(slot.slot))}</span>`,slot.club?`${kitDot(slot.club)}${e(slot.club.name)}`:'—',
  date(slot.date),saved(slot.modified),`<button type="button" class="square small" data-command="delete" data-slot="${e(slot.slot)}" aria-label="Supprimer ${e(slotName(slot.slot))}">${TRASH}</button>`];
 const values=rows.map(slot=>[slotName(slot.slot),slot.club?.name??'',slot.date??'',slot.modified,'']);
 return `<section class="card saves-list">${table(['SAUVEGARDE','CLUB','DATE DE LA PARTIE','ENREGISTRÉE',''],rows.map(cells),undefined,undefined,{values,ascending:[0,1]},
  ['name-column','club-column','date-column','saved-column','delete-column'],undefined,rows.map(slot=>`data-slot="${e(slot.slot)}" tabindex="0"`))}</section>`;
}

export async function homeScreen(){
 const slots=await api('/partie/slots');
 return `<div class="doors"><a class="door main" href="#/nouvelle-partie">${BRAND}<h2>Créer une partie <span>→</span></h2></a>`
  +`<section class="door">${SAVE}<h2>Reprendre une partie</h2>${savesList(slots)}</section></div>`;
}
