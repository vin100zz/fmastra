import {api,escape as e,number as n,date,card,heading,table,sortableTable,standings,empty,clubLink,playerLink,position,fixtures,tabs,levelBadge,leadersCards,nationFlag,money,duration} from './ui.js';
import {nationNavigation} from './navigation.js';
import {monthlySalary} from './salaries.js';
import {bracket} from './bracket.js';
import {ROUND_TABS,isRoundTab,roundPath,roundContent} from './rounds.js';

const GROUP_ROUNDS=10,FINAL_GROUP_ROUNDS=13;

export function internationalStandings(rows,places=0){
 const rowClasses=rows.map((row,i)=>i<places?'promoted':'');
 return standings(['#','NATION','PTS','J','V','N','P','BP','BC','DIFF.'],rows.map((row,i)=>[
  i+1,clubLink(row.nation),`<strong>${row.points}</strong>`,row.played,row.won,row.drawn,row.lost,row.goals_for,row.goals_against,row.difference]),rowClasses);
}

// The stages of an edition, from the qualifications to the final, each one done, current or still to come.
export function editionStages(edition){
 const matches=edition.matches||[];
 const complete=(from,to)=>{const items=matches.filter(match=>match.round>=from&&match.round<=to);return items.length>0&&items.every(match=>match.score);};
 const stages=[['Qualifications',1,GROUP_ROUNDS],['Phase de groupes',GROUP_ROUNDS+1,FINAL_GROUP_ROUNDS],...(edition.knockout_rounds||[]).map(round=>[round.label,round.number,round.number])]
  .map(([label,from,to])=>({label,done:complete(from,to)}));
 const current=stages.findIndex(stage=>!stage.done);
 return stages.map((stage,index)=>({...stage,state:stage.done?'done':index===current?'current':'todo'}));
}
function editionHeading(edition,editions,section){
 const switcher=`<nav class="edition-switch" aria-label="Éditions">${editions.map(item=>`<a href="#/international/${item.year}/${section||'finals'}" class="${item.year===edition.year?'active':''}">${e(item.name)}${item.winner?`<small>✦ ${e(item.winner.name)}</small>`:''}</a>`).join('')}</nav>`;
 return `<div class="page-heading edition-head"><div><h1>${e(edition.name)}</h1></div>${switcher}</div>`;
}

// Four lists of the edition on one screen, each one scrolling on its own.
const MIN_RATED_MATCHES=3;
function statistics(data){
 const records=data.records;
 if(!records.length)return card('Statistiques de l’édition',empty('Les statistiques apparaîtront après les premiers matchs.'));
 const panel=(title,headers,rows,note='')=>`<section class="card stats-panel"><div class="card-head"><h2>${e(title)}</h2>${note}</div><div class="stats-scroll">${rows.length?table(headers,rows):empty('Aucun joueur pour l’instant.','Pas encore de statistiques')}</div></section>`;
 const listed=(list,figure)=>list.map((row,index)=>[index+1,`<span class="strong">${playerLink(row.player_id,row.name)}</span>`,clubLink(row.nation),row.matches,...figure(row)]);
 const byGoals=records.filter(row=>row.goals>0).sort((a,b)=>b.goals-a.goals||a.matches-b.matches);
 const byAssists=records.filter(row=>row.assists>0).sort((a,b)=>b.assists-a.assists||a.matches-b.matches);
 const rating=row=>row.rating_sum/row.rating_count;
 const byRating=records.filter(row=>row.rating_count>=MIN_RATED_MATCHES).sort((a,b)=>rating(b)-rating(a));
 const goalsFor=new Map();
 data.matches.filter(match=>match.score).forEach(match=>[[match.home,match.score[0]],[match.away,match.score[1]]].forEach(([team,goals])=>{const total=goalsFor.get(team.id)||{team,goals:0};total.goals+=goals;goalsFor.set(team.id,total);}));
 const attacks=[...goalsFor.values()].sort((a,b)=>b.goals-a.goals);
 return `<div class="stats-panels">${[
  panel('Meilleurs buteurs',['#','JOUEUR','NATION','MJ','BUTS'],listed(byGoals,row=>[`<b>${row.goals}</b>`])),
  panel('Meilleurs passeurs',['#','JOUEUR','NATION','MJ','PASSES'],listed(byAssists,row=>[`<b>${row.assists}</b>`])),
  panel('Meilleure note moyenne',['#','JOUEUR','NATION','MJ','NOTE'],listed(byRating,row=>[`<b>${n(rating(row))}</b>`]),`<span class="muted">${MIN_RATED_MATCHES} matchs min.</span>`),
  panel('Meilleures attaques',['#','NATION','BUTS'],attacks.map((row,index)=>[index+1,clubLink(row.team),`<b>${row.goals}</b>`]))
 ].join('')}</div>`;
}

// One group's matches of a given round: the ones played between its own nations.
const groupMatches=(group,matches,round)=>{const ids=new Set(group.rows.map(row=>row.nation.id));return matches.filter(match=>match.round===round&&ids.has(match.home.id));};

function finalsContent(data){
 const groups=data.final_groups;
 if(!groups.length)return card('Phase finale',empty('Les groupes seront tirés à la fin des qualifications.'));
 const knockout=bracket(data.knockout_rounds.map(round=>{const items=data.matches.filter(m=>m.round===round.number);return {label:round.label,date:items[0]?.date,matches:items};}),{fixed:true});
 const days=group=>[1,2,3].map(day=>{const items=groupMatches(group,data.matches,GROUP_ROUNDS+day);return items.length?`<div class="fixture-date">Journée ${day} · ${date(items[0].date)}</div>${fixtures({items})}`:'';}).join('');
 return knockout+`<div class="intl-groups intl-groups-4">${groups.map(group=>card(`Groupe ${group.name}`,internationalStandings(group.rows,2)+days(group))).join('')}</div>`;
}
// The results of one qualifying round, a block per group.
function roundResults(data,day){
 const rounds=[...new Set(data.matches.filter(m=>m.round<=GROUP_ROUNDS).map(m=>m.round))].sort((a,b)=>a-b);
 if(!rounds.length)return '';
 const played=rounds.filter(round=>data.matches.some(m=>m.round===round&&m.score));
 const current=rounds.includes(Number(day))?Number(day):played.at(-1)??rounds[0];
 const pills=`<nav class="chips" aria-label="Journées">${rounds.map(round=>`<a class="${round===current?'active':''}" href="#/international/${data.year}/qualifications/${round}">J${round}</a>`).join('')}</nav>`;
 const items=data.matches.filter(m=>m.round===current);
 const blocks=data.qualification_groups.map(group=>{const list=groupMatches(group,items,current);return list.length?`<section class="day-group"><h3>Groupe ${e(group.name)}</h3>${fixtures({items:list})}</section>`:'';}).join('');
 return card('Résultats par journée',`<div class="day-pills">${pills}</div><div class="day-groups">${blocks}</div>`,`<span class="muted">${date(items[0].date)}</span>`);
}
function qualificationsContent(data,day){
 if(!data.qualification_groups.length)return card('Qualifications',empty('Les groupes seront tirés à la fin des qualifications.'));
 const top=data.records.filter(row=>row.goals>0).sort((a,b)=>b.goals-a.goals||a.matches-b.matches).slice(0,10);
 const rail=(top.length?card('Meilleurs buteurs',table(['#','JOUEUR','NATION','MJ','BUTS'],top.map((row,index)=>[index+1,`<span class="strong">${playerLink(row.player_id,row.name)}</span>`,clubLink(row.nation),row.matches,`<b>${row.goals}</b>`]))):'')
  +card('Classement des deuxièmes',internationalStandings(data.best_seconds,data.second_places));
 return `<div class="intl-split"><div class="intl-groups">${data.qualification_groups.map(group=>card(`Groupe ${group.name}`,internationalStandings(group.rows,1))).join('')}</div><div class="intl-rail">${rail}</div></div>`+roundResults(data,day);
}
// `round` is the latest or next round of the edition, for the tabs that show it; `day` the qualifying round picked in the qualifications.
export function editionContent(data,section='qualifications',round=null,day=null){
 const navigation=tabs(`#/international/${data.year}`,[['finals','Phase finale'],['qualifications','Qualifications'],...ROUND_TABS,['statistics','Statistiques']],section);
 if(round)return navigation+roundContent(round,section,{figures:true});
 if(section==='statistics')return navigation+statistics(data);
 return navigation+(section==='finals'?finalsContent(data):qualificationsContent(data,day));
}
const NATION_TABS=[['squad','Effectif'],['calendar','Calendrier'],['history','Historique']];
// A run in a competition, in the same style as a club's cup and European runs: the label alone, or starred when it was won.
const editionRun=run=>run?(run.winner?`✦ ${e(run.label)}`:e(run.label)):'—';

function squadCard(data){
 if(!data.camp)return card('Sélection',empty('La prochaine liste de 23 sera annoncée au début du rassemblement.','Aucun rassemblement en cours'));
 const title=`${data.camp.upcoming?'Rassemblement':'Dernier rassemblement'} du ${date(data.camp.start)} au ${date(data.camp.end)}`;
 // The same columns, in the same order, as the club and player lists.
 const fitness=p=>p.injured_until?`<span class="status danger" title="Retour le ${e(date(p.injured_until))}">✚ ${duration(p.injured_until)}</span>`:p.suspension?`<span class="status danger">▰ ${p.suspension} match${p.suspension>1?'s':''}</span>`:`<span class="status">${Math.round(p.fitness*100)}%</span>`;
 return card(title,sortableTable(['POSTE','JOUEUR','ÂGE','NIV.','POT.','CLUB','VALEUR','SALAIRE / MOIS','CONTRAT','ÉTAT','SÉL.','BUTS'],data.squad.map(p=>[
  position(p.position),`<span class="strong">${playerLink(p.id,p.name)}</span>`,p.age??'—',levelBadge(p.rating,'Niveau actuel sur 200'),levelBadge(p.potential,'Potentiel sur 200'),p.id<0?'—':clubLink(p.club),
  p.value==null?'—':money(p.value),p.wage==null?'—':monthlySalary(p.wage),`<span class="${p.expiring?'danger':''}">${date(p.contract_end)}</span>`,fitness(p),p.caps,p.goals]),
  data.squad.map(p=>[p.position,p.name,p.age??'',p.rating,p.potential??'',p.club?.name??'',p.value??'',p.wage??'',p.contract_end??'',p.injured_until||p.suspension?-1:p.fitness,p.caps,p.goals])));
}
function historyContent(data){
 const editions=card('Bilan par compétition',data.editions.length?table(['ÉDITION','QUALIFICATIONS','PHASE FINALE'],data.editions.map(row=>[e(row.name),editionRun(row.qualification),editionRun(row.finals)])):empty('Le bilan apparaîtra à la fin de la première édition disputée.','Pas encore d’historique'));
 return editions+leadersCards(data.leaders,'Toutes éditions confondues, édition en cours incluse.');
}
async function nationScreen(id,tab){
 const [data,nav]=await Promise.all([api(`/international/nations/${id}`),api(`/international/nations/${id}/navigation`)]);
 tab=NATION_TABS.some(([key])=>key===tab)?tab:'squad';
 const title=`<div class="page-heading"><div class="identity">${nationNavigation(nav,tab)}<div class="crest">${nationFlag(data.nation)}</div><div><span class="eyebrow">${e(data.federation)} · Force ${n(data.strength)} / 100</span><h1>${e(data.name)}</h1></div></div></div>`;
 const content=tab==='calendar'?card('Calendrier et résultats',fixtures({items:data.matches},true)):tab==='history'?historyContent(data):squadCard(data);
 return title+tabs(`#/international/nation/${id}`,NATION_TABS,tab)+content;
}

// The edition not won yet: the one under way, or the next to come.
async function currentEdition(editions){
 const item=[...editions].sort((a,b)=>a.year-b.year).find(edition=>!edition.winner);
 if(!item)return '';
 const edition=await api(`/international/editions/${item.year}`);
 const stage=editionStages(edition).find(step=>step.state==='current');
 const next=(edition.matches||[]).filter(match=>!match.score).map(match=>match.date).sort()[0];
 const line=[stage?.label,next?`prochaine journée le ${date(next)}`:''].filter(Boolean).join(' · ');
 const tab=stage?.label==='Qualifications'?'qualifications':'finals';
 return `<a class="card current-edition" href="#/international/${edition.year}/${tab}"><div class="card-body"><h2>${e(edition.name)}</h2>${line?`<p>${e(line)}</p>`:''}</div></a>`;
}
const strengthBar=value=>`<span class="force"><span class="force-bar"><i style="width:${Math.max(0,Math.min(100,value))}%"></i></span>${n(value)}</span>`;
function nationsCard(nations,federation){
 const federations=[...new Set(nations.map(team=>team.federation))].sort();
 const chip=(key,label,count)=>`<a class="${(federation||'')===key?'active':''}" href="#/international${key?`?federation=${encodeURIComponent(key)}`:''}">${e(label)} · ${count}</a>`;
 const filters=`<nav class="chips nations-filter" aria-label="Fédérations">${chip('','Toutes',nations.length)}${federations.map(name=>chip(name,name,nations.filter(team=>team.federation===name).length)).join('')}</nav>`;
 const shown=federation?nations.filter(team=>team.federation===federation):nations;
 const last=team=>team.last_edition?`${e(team.last_edition.winner?`✦ ${team.last_edition.label}`:team.last_edition.label)} <span class="muted">${e(team.last_edition.name)}</span>`:'—';
 return card('Nations actives',`${filters}${sortableTable(['NATION','FÉDÉRATION','FORCE / 100','TITRES','DERNIÈRE ÉDITION'],shown.map(team=>[clubLink(team),e(team.federation),strengthBar(team.strength),team.titles?`★ ${team.titles}`:'—',last(team)]),
  shown.map(team=>[team.name,team.federation,team.strength,team.titles||0,team.last_edition?.name??'']))}`);
}
function titlesCard(editions){
 const wins=new Map();
 editions.filter(edition=>edition.winner).forEach(edition=>{const row=wins.get(edition.winner.id)||{team:edition.winner,titles:0};row.titles++;wins.set(edition.winner.id,row);});
 return wins.size?card('Nations les plus titrées',table(['NATION','TITRES'],[...wins.values()].sort((a,b)=>b.titles-a.titles||a.team.name.localeCompare(b.team.name,'fr')).map(row=>[clubLink(row.team),`★ ${row.titles}`]))):'';
}
export async function internationalScreen(id,section,tab,params=new URLSearchParams()){
 if(id==='nation')return nationScreen(section,tab);
 const data=await api('/international');
 if(!data.enabled)return heading('Sélections nationales')+card('Nouvelle partie nécessaire',empty('Cette sauvegarde conserve son calendrier de clubs. Créez une nouvelle partie pour activer les sélections nationales.'));
 if(id){
  const [edition,round]=await Promise.all([api(`/international/editions/${id}`),isRoundTab(section)?api(`/international/editions/${id}/${roundPath(section)}`):null]);
  return editionHeading(edition,data.editions,section)+editionContent(edition,section,round,tab);
 }
 const switcher=`<nav class="edition-switch" aria-label="Éditions">${data.editions.map(item=>`<a href="#/international/${item.year}/finals">${e(item.name)}${item.winner?`<small>✦ ${e(item.winner.name)}</small>`:''}</a>`).join('')}</nav>`;
 const palmares=data.editions.some(item=>item.winner)?table(['ÉDITION','VAINQUEUR'],data.editions.filter(item=>item.winner).map(item=>[`<a href="#/international/${item.year}/finals">${e(item.name)}</a>`,clubLink(item.winner)])):empty('Les vainqueurs apparaîtront après les premières finales.');
 return `<div class="page-heading edition-head"><div><h1>Sélections nationales</h1></div>${switcher}</div>`
  +`<div class="nations-split"><div class="nations-side">${await currentEdition(data.editions)}${card('Palmarès',palmares)}${titlesCard(data.editions)}</div>${nationsCard(data.nations,params.get('federation'))}</div>`;
}
