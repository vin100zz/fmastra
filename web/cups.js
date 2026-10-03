import {api,season,clubLink,playerLink,number as n,card,heading,tabs,table,pager,leadersCards} from './ui.js';
import {bracket} from './bracket.js';
import {ROUND_TABS,isRoundTab,roundPath,roundContent} from './rounds.js';

export async function cupScreen(cup,section,params,lead=''){
 const menu=[['bracket','Tableau'],...ROUND_TABS,['stats','Statistiques'],['history','Palmarès']];
 // A section a league has and a cup has not (arriving from a league's Calendrier) opens the bracket.
 section=menu.some(([key])=>key===section)?section:'bracket';
 let content;
 if(isRoundTab(section))content=roundContent(await api(`/competitions/${cup.id}/${roundPath(section)}`),section);
 else if(section==='history'){
  const history=await api(`/competitions/${cup.id}/historique?${params}`);
  content=card('Les vainqueurs',table(['SAISON','VAINQUEUR'],history.items.map(row=>[season(row.season),clubLink(row.champion)]))+pager(history))+leadersCards(history.leaders);
 }else if(section==='stats'){
  const stats=await api(`/competitions/${cup.id}/statistiques?type=buteurs&${params}`);
  content=card('Meilleurs buteurs · Saison en cours',table(['JOUEUR','CLUB','BUTS'],stats.items.map(row=>[playerLink(row.id,row.name),clubLink(row.club),n(row.value)]))+pager(stats));
 }else{
  const data=await api(`/competitions/${cup.id}/coupe?${params}`);
  content=`<form class="filters" data-filter><select name="saison" aria-label="Saison">${data.seasons.map(year=>`<option value="${year}" ${year===data.season?'selected':''}>${season(year)}</option>`).join('')}</select><button>Afficher</button></form>`;
  if(data.winner)content+=`<div class="notice cup-winner">🏆 Vainqueur : ${clubLink(data.winner)}</div>`;
  content+=bracket(data.rounds.map(round=>({label:round.label,date:round.date,matches:round.items})));
 }
 return heading(cup.name,'',lead)+tabs(`#/league/${cup.id}`,menu,section)+content;
}
