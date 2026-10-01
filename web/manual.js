import {api,escape as e,heading} from './ui.js';
import {markdown} from './markdown.js';

// The manual of the game's inner workings: its chapters on the left, with the sections of the open one, and that chapter beside them.
// The server writes the chapters of docs/manuel with their figures read from the configuration of the game being played.
export async function manualScreen(chapter){
 const {pages,page}=await api(chapter?`/manuel/${encodeURIComponent(chapter)}`:'/manuel');
 const sections=`<ul>${page.sections.map(section=>`<li><a href="#/aide/${page.slug}/${section.id}">${e(section.title)}</a></li>`).join('')}</ul>`;
 const menu=pages.map(item=>item.slug===page.slug
  ?`<li><a href="#/aide/${item.slug}" aria-current="page">${e(item.title)}</a>${page.sections.length?sections:''}</li>`
  :`<li><a href="#/aide/${item.slug}">${e(item.title)}</a></li>`).join('');
 return `${heading('Manuel du jeu')}<div class="manual"><nav class="manual-menu card" aria-label="Chapitres"><ul>${menu}</ul></nav>`
  +`<article class="manual-page card"><div class="card-head"><h2>${e(page.title)}</h2></div><div class="card-body manual-body">${markdown(page.markdown,page.sections.map(section=>section.id))}</div></article></div>`;
}
