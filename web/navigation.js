import {escape as e,position as positionBadge,competitionBadge} from './ui.js';

// The chevrons of a season's steps, turned: up to the one before, down to the one after; three lines open the list.
const chevron=up=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${up?'M6.5 14.5 12 9l5.5 5.5':'M6.5 9.5 12 15l5.5-5.5'}"/></svg>`;
const lines='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5h14M5 12h14M5 16.5h14"/></svg>';

// The steps of a band, at its left (docs/charte-graphique.md, « Navigation d'un bandeau »): a chevron up to the previous
// member of the group, three lines that open the list of them all, a chevron down to the next one. `href` builds the link
// of a member, `label` names it in text and `row` in the list. The ends of the group have no link on their side; the faded
// chevron keeps the column steady. A group of one has nothing to step through.
function neighbours(nav,{href,scope,listLabel,label=item=>item.name,row=item=>e(label(item))}){
 if(!nav||nav.total<2)return '';
 const step=(item,direction,name)=>item
  ?`<a class="entity-step ${direction}" href="${e(href(item))}" rel="${direction}" aria-label="${name} : ${e(label(item))}" title="${name} : ${e(label(item))}">${chevron(direction==='prev')}</a>`
  :`<span class="entity-step ${direction}" aria-hidden="true">${chevron(direction==='prev')}</span>`;
 const caption=`${scope} · ${nav.index+1} / ${nav.total}`;
 const rows=nav.items.map((item,index)=>`<a href="${e(href(item))}" role="menuitemradio" aria-checked="${index===nav.index}">${row(item)}</a>`).join('');
 return `<div class="entity-nav" role="group" aria-label="${e(listLabel)}">${step(nav.previous,'prev','Précédent')}<details class="entity-menu"><summary aria-label="${e(listLabel)}" title="${e(caption)}">${lines}</summary><div class="menu" role="menu" aria-label="${e(listLabel)}">${rows}</div></details>${step(nav.next,'next','Suivant')}</div>`;
}
// In the list, a name after its badge.
const badged=(badge,name)=>`<div class="cell">${badge}${e(name)}</div>`;

// Clubs of a division, alphabetically; a club outside any division steps through the clubs of its country. Moving keeps the open tab
// and `query` (the columns of the squad list). Homonymous clubs (the source lists a club and its empty duplicate) carry their squad size,
// so that a step never looks like a no-op.
export function clubNavigation(nav,section,query=''){
 if(!nav)return '';
 const division=nav.scope.kind==='division';
 const seen=new Set(),twins=new Set();for(const club of nav.items)(seen.has(club.name)?twins:seen).add(club.name);
 return neighbours(nav,{href:club=>`#/club/${club.id}${section?`/${section}`:''}${query?`?${query}`:''}`,scope:division?nav.scope.name:`Tous les clubs · ${nav.scope.name}`,
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
  row:player=>badged(positionBadge(player.position),player.name)}):'';
}

// A competition in a list: its badge, then its name.
const competitionRow=competition=>badged(competitionBadge(competition),competition.name);

// The divisions of a country from the top down, then its cup. A competition page has no tab in common with the next one, so it opens on its default.
export function competitionNavigation(nav){
 return nav?neighbours(nav,{href:competition=>`#/league/${competition.id}`,scope:`Compétitions · ${nav.scope.name}`,listLabel:`Choisir une compétition · ${nav.scope.name}`,row:competitionRow}):'';
}

// A group the screen already holds, laid out as the server lays one out: `items` in the order they are stepped through,
// `index` the place of the one shown.
const group=(items,index)=>({index,total:items.length,items,previous:items[index-1]??null,next:items[index+1]??null});

// The European cups, the first one on top. Moving keeps the open tab and `query` (the season shown).
export function europeNavigation(cups,cup,section,query=''){
 return neighbours(group(cups,cups.indexOf(cup)),{href:item=>`#/europe/${item.code}/${section}${query?`?${query}`:''}`,scope:'Coupes d’Europe',listLabel:'Choisir une coupe d’Europe',row:competitionRow});
}

// The editions of the selections, the Euro and the World Cup in turn, from the first to the latest. Moving keeps the open tab.
export function editionNavigation(editions,year,section){
 const items=[...editions].sort((a,b)=>a.year-b.year);
 return neighbours(group(items,items.findIndex(item=>item.year===year)),{href:item=>`#/international/${item.year}/${section}`,scope:'Éditions',listLabel:'Choisir une édition',
  row:item=>competitionRow({...item,kind:'international'})});
}
