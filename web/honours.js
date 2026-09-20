import {api,season,clubLink,nationBadge,empty,card,heading,table} from './ui.js';
import {LEAGUE_ORDER} from './screens.js';

const rank=nation=>LEAGUE_ORDER.includes(nation)?LEAGUE_ORDER.indexOf(nation):LEAGUE_ORDER.length;
// Divisions and national cups open on their history tab; a European cup on the tab of its own screen.
const link=competition=>competition.kind==='europe'?`#/europe/${competition.code}/history`:`#/league/${competition.id}/history`;

function block(competition){
 const rows=competition.items.map(item=>[season(item.season),`<span class="strong">${clubLink(item.champion)}</span>`]);
 const body=rows.length?table(['SAISON','CHAMPION'],rows):empty('Le premier vainqueur sera connu à la fin de la saison.','Pas encore de palmarès');
 return card(competition.kind==='europe'?`${competition.code} · ${competition.name}`:competition.name,body,`<a href="${link(competition)}">Historique →</a>`,'honours-block');
}

// One row of blocks per group, as many columns as blocks so that they share the width of the page.
const row=(title,competitions)=>`<section class="honours-row" style="--blocks:${competitions.length}"><h2 class="honours-title">${title}</h2><div class="honours-blocks">${competitions.map(block).join('')}</div></section>`;

export async function honoursScreen(){
 const data=await api('/monde/palmares');
 const countries=[...data.countries].sort((a,b)=>rank(a.code)-rank(b.code)||a.code.localeCompare(b.code));
 return heading('COMPÉTITIONS','Palmarès','Les vainqueurs de chaque compétition, saison après saison.')
  +(data.europe.length?row('Coupes d’Europe',data.europe):'')
  +countries.map(country=>row(nationBadge(country.code,{full:true}),country.competitions)).join('');
}
