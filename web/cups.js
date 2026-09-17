import {api,escape as e,date,season,clubLink,playerLink,number as n,fixtures,empty,card,heading,tabs,table,pager} from './ui.js';

export function cupSummaryCard(cup,data){
 const round=data.rounds.find(item=>item.number===(data.latest_round||1));
 const winner=data.winner?`<p class="cup-winner">🏆 ${clubLink(data.winner)}</p>`:'';
 const title=data.latest_round?'Derniers résultats':'Prochaines rencontres';
 const body=`${winner}<div class="card-body"><h3>${title} · ${e(round.label)}</h3><p class="muted">${date(round.date)}</p></div><div class="cup-fixtures">${fixtures({items:data.latest_round?round.items.filter(match=>match.score):round.items})}</div>`;
 return card(cup.name,body,`<a href="#/league/${cup.id}">Voir la coupe →</a>`);
}

export async function cupScreen(cup,section,params){
 section=section||'calendar';
 const data=await api(`/competitions/${cup.id}/coupe?${params}`);
 const menu=[['calendar','Les tours'],['stats','Statistiques'],['history','Palmarès']];
 let content;
 if(section==='history'){
  const history=await api(`/competitions/${cup.id}/historique?${params}`);
  content=card('Les vainqueurs',table(['SAISON','VAINQUEUR'],history.items.map(row=>[season(row.season),clubLink(row.champion)]))+pager(history));
 }else if(section==='stats'){
  const stats=await api(`/competitions/${cup.id}/statistiques?type=buteurs&${params}`);
  content=card('Meilleurs buteurs · Saison en cours',table(['JOUEUR','CLUB','BUTS'],stats.items.map(row=>[playerLink(row.id,row.name),clubLink(row.club),n(row.value)]))+pager(stats));
 }else{
  content=`<form class="filters" data-filter><select name="saison" aria-label="Saison">${data.seasons.map(year=>`<option value="${year}" ${year===data.season?'selected':''}>${season(year)}</option>`).join('')}</select><button>Afficher</button></form>`;
  if(data.winner)content+=`<div class="notice cup-winner">🏆 Vainqueur : ${clubLink(data.winner)}</div>`;
  content+=data.rounds.map(round=>`<details class="card cup-round" ${round.number===(data.latest_round||1)?'open':''}><summary>${e(round.label)} <span class="muted">${date(round.date)}</span></summary>${round.items.length?fixtures(round):empty('Le tirage aura lieu à l’issue du tour précédent.','Tirage à venir')}</details>`).join('');
 }
 return heading(cup.nation,cup.name,'64 clubs · Match unique · Tirs au but en cas d’égalité')+tabs(`#/league/${cup.id}`,menu,section)+content;
}
