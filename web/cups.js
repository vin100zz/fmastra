import {api,titlesCard,countTitles,season,seasonSteps,clubLink,playerLink,number as n,card,table,pager,leadersCards} from './ui.js';
import {bracket} from './bracket.js';
import {competitionHero} from './club-hero.js';
import {ROUND_TABS,isRoundTab,roundPath,roundContent} from './rounds.js';

export async function cupScreen(cup,section,params,lead=''){
 const menu=[['bracket','Tableau'],...ROUND_TABS,['stats','Statistiques'],['history','Palmarès']];
 // A section a league has and a cup has not (arriving from a league's Calendrier) opens the bracket.
 section=menu.some(([key])=>key===section)?section:'bracket';
 let content,tools='',shown=cup;
 if(isRoundTab(section))content=roundContent(await api(`/competitions/${cup.id}/${roundPath(section)}`),section);
 else if(section==='history'){
  const history=await api(`/competitions/${cup.id}/historique?${params}`);
  content=`<div class="history-layout"><div class="history-main">${card('Les vainqueurs',table(['SAISON','VAINQUEUR'],history.items.map(row=>[season(row.season),clubLink(row.champion)]))+pager(history))}${titlesCard('Titres par club',countTitles(history.items,row=>row.champion?.id,row=>clubLink(row.champion)))}</div><div class="history-leaders">${leadersCards(history.leaders)}</div></div>`;
 }else if(section==='stats'){
  const stats=await api(`/competitions/${cup.id}/statistiques?type=buteurs&${params}`);
  content=card('Meilleurs buteurs · Saison en cours',table(['JOUEUR','CLUB','BUTS'],stats.items.map(row=>[playerLink(row.id,row.name),clubLink(row.club),n(row.value)]))+pager(stats));
 }else{
  const data=await api(`/competitions/${cup.id}/coupe?${params}`);
  // The season is stepped through from the end of the row of tabs; the header's tile names who won the one shown.
  tools=seasonSteps(data);shown={...cup,winner:data.winner,holder:data.holder};
  content=bracket(data.rounds.map(round=>({label:round.label,date:round.date,matches:round.items})),{sides:true});
 }
 return competitionHero(shown,{lead,base:`#/league/${cup.id}`,menu,section,tools})+content;
}
