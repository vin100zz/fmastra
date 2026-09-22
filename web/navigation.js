import {escape as e,position as positionBadge} from './ui.js';

const triangle=up=>`<svg viewBox="0 0 10 10" aria-hidden="true"><path d="${up?'M5 2 9.5 8h-9z':'M5 8 .5 2h9z'}"/></svg>`;
const burger='<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 2h8M1 5h8M1 8h8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

// A small block for the left of a page header: a triangle up to the previous member of the group, a menu listing every member, a triangle down
// to the next one. `href` builds the link of a member, `label` names it in text and `row` in the list. The ends of the group have no link on
// their side; the greyed triangle keeps the block steady. A group of one has nothing to step through.
function neighbours(nav,{href,scope,listLabel,label=item=>item.name,row=item=>e(label(item))}){
 if(!nav||nav.total<2)return '';
 const step=(item,direction,name)=>item
  ?`<a class="entity-step ${direction}" href="${e(href(item))}" rel="${direction}" aria-label="${name} : ${e(label(item))}" title="${name} : ${e(label(item))}">${triangle(direction==='prev')}</a>`
  :`<span class="entity-step ${direction}" aria-hidden="true">${triangle(direction==='prev')}</span>`;
 const caption=`${scope} · ${nav.index+1} / ${nav.total}`;
 const rows=nav.items.map((item,index)=>`<li><a href="${e(href(item))}"${index===nav.index?' aria-current="true"':''}>${row(item)}</a></li>`).join('');
 return `<div class="entity-nav" role="group" aria-label="${e(listLabel)}">${step(nav.previous,'prev','Précédent')}<details class="entity-menu"><summary aria-label="${e(listLabel)}" title="${e(caption)}">${burger}</summary><div class="entity-menu-panel"><p class="entity-menu-scope">${e(caption)}</p><ul>${rows}</ul></div></details>${step(nav.next,'next','Suivant')}</div>`;
}

// Clubs of a division, alphabetically; a club outside any division steps through the clubs of its country. Moving keeps the open tab.
// Homonymous clubs (the source lists a club and its empty duplicate) carry their squad size, so that a step never looks like a no-op.
export function clubNavigation(nav,section){
 if(!nav)return '';
 const division=nav.scope.kind==='division';
 const seen=new Set(),twins=new Set();for(const club of nav.items)(seen.has(club.name)?twins:seen).add(club.name);
 return neighbours(nav,{href:club=>`#/club/${club.id}${section?`/${section}`:''}`,scope:division?nav.scope.name:`Tous les clubs · ${nav.scope.name}`,
  listLabel:`Choisir un club${division?` de ${nav.scope.name}`:` · ${nav.scope.name}`}`,
  label:club=>twins.has(club.name)?`${club.name} (${club.squad} joueur${club.squad>1?'s':''})`:club.name});
}

// The nations of the same confederation. Moving keeps the open tab.
export function nationNavigation(nav,tab) {
 return nav?neighbours(nav,{href:nation=>`#/international/nation/${nation.id}${tab?`/${tab}`:''}`,scope:`Confédération · ${nav.scope.name}`,
  listLabel:`Choisir une nation · ${nav.scope.name}`}):'';
}

// The squad of the player's club, goalkeepers first, each with the colour of its position.
export function playerNavigation(nav){
 return nav?neighbours(nav,{href:player=>`#/player/${player.id}`,scope:`Effectif · ${nav.scope.name}`,listLabel:`Choisir un joueur de ${nav.scope.name}`,
  row:player=>`${positionBadge(player.position)}<span>${e(player.name)}</span>`}):'';
}

// The divisions of a country from the top down, then its cup. A competition page has no tab in common with the next one, so it opens on its default.
export function competitionNavigation(nav){
 return nav?neighbours(nav,{href:competition=>`#/league/${competition.id}`,scope:`Compétitions · ${nav.scope.name}`,listLabel:`Choisir une compétition · ${nav.scope.name}`}):'';
}
