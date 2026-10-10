import {api,escape as e,number as n,averageNote,date,card,heading,steps,table,sortableTable,standings,empty,clubLink,playerLink,fixtures,leadersCards,playerTable,playerViewSwitch,query,competitionBadge} from './ui.js';
import {nationNavigation,editionNavigation} from './navigation.js';
import {nationHero,competitionHero} from './club-hero.js';
import {calendarBlock,lineupBlock} from './club-overview.js';
import {calendarRows} from './club-calendar.js';
import {bracket} from './bracket.js';
import {ROUND_TABS,isRoundTab,roundPath,roundContent} from './rounds.js';

const GROUP_ROUNDS=10,FINAL_GROUP_ROUNDS=13;

// `extract` keeps the points and the goal difference only, written as a league's extract beside a club's squad writes them;
// `own` is the nation whose page shows the table: its row is marked.
export function internationalStandings(rows,places=0,{extract=false,own=null}={}){
 const rowClasses=rows.map((row,i)=>`${i<places?'promoted':''}${row.nation.id===own?' own':''}`.trim());
 const difference=row=>row.difference>0?`+${row.difference}`:row.difference;
 if(extract)return standings(['#','NATION','PTS','DIFF.'],rows.map((row,i)=>[
  `<span class="rank ${i?'':'first'}">${i+1}</span>`,`<span class="strong">${clubLink(row.nation)}</span>`,`<b>${row.points}</b>`,difference(row)]),rowClasses);
 return standings(['#','NATION','PTS','J','V','N','D','BP','BC','DIFF.'],rows.map((row,i)=>[
  i+1,clubLink(row.nation),`<strong>${row.points}</strong>`,row.played,row.won,row.drawn,row.lost,row.goals_for,row.goals_against,difference(row)]),rowClasses);
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
// The steps through the editions, the latest first, as a club's seasons: `year` is the one shown, `options` what `steps`
// takes to build each step.
const editionSteps=(editions,year,options)=>steps([...editions].sort((a,b)=>b.year-a.year).map(item=>({value:item.year,label:item.name})),year,{name:'Édition',...options});
const EDITION_TABS=[['finals','Phase finale'],['qualifications','Qualifications'],...ROUND_TABS,['statistics','Statistiques']];
// An edition's page opens on a competition's header, the Euro's or the World Cup's: the other editions are stepped to from
// its band, the open tab kept; its tile names who won it, and until then who holds the title.
const editionHero=(edition,editions,section)=>competitionHero({...edition,kind:'international'},{lead:editionNavigation(editions,edition.year,section),
 base:`#/international/${edition.year}`,menu:EDITION_TABS,section});

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
  panel('Meilleure note moyenne',['#','JOUEUR','NATION','MJ','NOTE'],listed(byRating,row=>[`<b>${averageNote(rating(row))}</b>`]),`<span class="muted">${MIN_RATED_MATCHES} matchs min.</span>`),
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
 if(round)return roundContent(round,section,{figures:true});
 if(section==='statistics')return statistics(data);
 return section==='finals'?finalsContent(data):qualificationsContent(data,day);
}
const NATION_TABS=[['squad','Effectif'],['calendar','Calendrier'],['history','Historique']];
// A run in a competition, in the same style as a club's cup and European runs: the label alone, or starred when it was won.
const editionRun=run=>run?(run.winner?`✦ ${e(run.label)}`:e(run.label)):'—';

// The days of a camp, "du 9 au 17 novembre 2028": the month and the year are written once when its two ends share them.
const DAY={day:'numeric'},MONTH={month:'long'},YEAR={year:'numeric'};
const written=(value,options)=>new Intl.DateTimeFormat('fr-FR',options).format(new Date(`${value}T12:00:00`));
export function campDays(start,end){
 const year=start.slice(0,4)===end.slice(0,4),month=year&&start.slice(5,7)===end.slice(5,7);
 return `du ${written(start,{...DAY,...(month?{}:MONTH),...(year?{}:YEAR)})} au ${written(end,{...DAY,...MONTH,...YEAR})}`;
}
// The list of a camp, a club's squad list: the same views, sorted by the server on the column picked in the address.
function squadCard(data,params){
 if(!data.camp)return card('Sélection',empty('La prochaine liste de 23 sera annoncée au début du rassemblement.','Aucun rassemblement en cours'));
 const view=params.get('vue'),sorted=params.get('tri')||'position',order=params.get('ordre')||'asc',count=data.squad.length;
 const title=`${data.camp.upcoming?'Rassemblement':'Dernier rassemblement'} ${campDays(data.camp.start,data.camp.end)} · ${count} joueur${count>1?'s':''}`;
 return card(title,playerTable({items:data.squad},true,sorted,order,{view,pager:false,selection:true}),`<div class="card-tools">${playerViewSwitch(view,sorted,order,true,{selection:true})}</div>`);
}
// The group the selection plays in, beside its list as a club's league stands beside its squad: every nation of the group,
// the places that qualify marked, titled with the last round counted.
// `own` is the selection whose page it is; `extract` keeps the points and the goal difference, for the column of widgets.
function groupCard(group,own,extract=false){
 if(!group)return '';
 const round=Math.max(0,...group.rows.map(row=>row.played));
 const title=`Groupe ${e(group.name)}${round?` – ${round}<span class="ordinal">${round===1?'re':'e'}</span> journée`:''}`;
 return `<section class="card standings-card${extract?' standings-extract':''}"><div class="card-head"><h2>${title}</h2><a href="#/international/${group.year}/${group.finals?'finals':'qualifications'}" aria-label="Voir le groupe">Voir →</a></div>${internationalStandings(group.rows,group.places,{extract,own})}</section>`;
}
// The Effectif tab, laid out as a club's: the list, and on its right the calendar, the last eleven and the group.
function squadContent(nation,params){
 // The widgets of a club read its competition by name: a match of another edition carries its badge.
 const team={...nation,competition:nation.competition?.name};
 return `<div class="club-squad-layout"><div class="club-squad">${squadCard(nation,params)}</div><aside class="club-widgets" aria-label="La sélection en bref">`
  +`${calendarBlock(team,nation.calendar,`#/international/nation/${nation.id}/calendar`)}${lineupBlock(team,nation.lineup,'La sélection n’a pas encore joué.')}${groupCard(nation.group,nation.id,true)}</aside></div>`;
}
// A selection's round as short as it reads: J3 in its qualifiers, the stage of the finals in full.
const editionRound=label=>String(label||'').replace(/^Qualifications · /,'');
// Where the selection stands or stood in each edition it played, the latest first, and its record there.
function recordCard(rows){
 const place=row=>row.winner?`<span class="strong">✦ ${e(row.place)}</span>`:e(row.place);
 return card('Bilan',`<div class="edition-records">${standings(['COMPÉTITION','PLACE','J','V','N','D','BP','BC'],rows.map(row=>[
  `${competitionBadge(row)}<a class="strong" href="#/international/${row.year}/finals">${e(row.name)}</a>`,place(row),row.played,row.won,row.drawn,row.lost,row.goals_for,row.goals_against]))}</div>`);
}
// The Calendrier tab, a club's: one line per match of an edition, the day (with its year: an edition runs over two), the
// edition's badge, the round, a plane away, the other side, the score from the selection's side and the scorers of either
// side. The edition is stepped through from the row of tabs (`edition` in the address; the one under way by default).
// Beside the matches, the group of that edition in full and the record in each edition played.
function calendarContent(nation,data){
 if(!data.items.length)return `<section class="card">${empty('Aucun match programmé pour cette sélection.','Calendrier vide')}</section>`;
 const competitions=new Map(data.competitions.map(row=>[row.id,row]));
 return `<div class="calendar-layout club-calendar selection-calendar"><section class="card calendar-card"><div class="card-head"><h2>Matches</h2></div>`
  +`${calendarRows(data.items,nation,competitions,{written:date,round:editionRound})}</section><aside class="calendar-side">${groupCard(data.group,nation.id)}${recordCard(data.competitions)}</aside></div>`;
}
function historyContent(data){
 const editions=card('Bilan par compétition',data.editions.length?table(['ÉDITION','QUALIFICATIONS','PHASE FINALE'],data.editions.map(row=>[e(row.name),editionRun(row.qualification),editionRun(row.finals)])):empty('Le bilan apparaîtra à la fin de la première édition disputée.','Pas encore d’historique'));
 return editions+leadersCards(data.leaders);
}
// A selection's page: a club's header in its colours with the tabs, then the open tab. Only the list of the Effectif tab
// reads the sort of the address, only the Calendrier tab its edition.
async function nationScreen(id,tab,params=new URLSearchParams()){
 tab=NATION_TABS.some(([key])=>key===tab)?tab:'squad';
 const sort=tab==='squad'?query({tri:params.get('tri'),ordre:params.get('ordre')}):'';
 const edition=/^\d+$/.test(params.get('edition')||'')?`?edition=${params.get('edition')}`:'';
 const [data,nav,calendar]=await Promise.all([api(`/international/nations/${id}${sort?`?${sort}`:''}`),api(`/international/nations/${id}/navigation`),
  tab==='calendar'?api(`/international/nations/${id}/calendrier${edition}`):null]);
 const content=tab==='calendar'?calendarContent(data,calendar):tab==='history'?historyContent(data):squadContent(data,params);
 const tools=calendar?.items.length?editionSteps(calendar.editions,calendar.edition,{param:'edition'}):'';
 return nationHero(data,{lead:nationNavigation(nav,tab),menu:NATION_TABS,section:tab,tools})+content;
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
 if(id==='nation')return nationScreen(section,tab,params);
 const data=await api('/international');
 if(!data.enabled)return heading('Sélections nationales')+card('Nouvelle partie nécessaire',empty('Cette sauvegarde conserve son calendrier de clubs. Créez une nouvelle partie pour activer les sélections nationales.'));
 if(id){
  const [edition,round]=await Promise.all([api(`/international/editions/${id}`),isRoundTab(section)?api(`/international/editions/${id}/${roundPath(section)}`):null]);
  section=EDITION_TABS.some(([key])=>key===section)?section:'finals';
  return editionHero(edition,data.editions,section)+editionContent(edition,section,round,tab);
 }
 const switcher=`<nav class="edition-switch" aria-label="Éditions">${data.editions.map(item=>`<a href="#/international/${item.year}/finals">${e(item.name)}${item.winner?`<small>✦ ${e(item.winner.name)}</small>`:''}</a>`).join('')}</nav>`;
 const palmares=data.editions.some(item=>item.winner)?table(['ÉDITION','VAINQUEUR'],data.editions.filter(item=>item.winner).map(item=>[`<a href="#/international/${item.year}/finals">${e(item.name)}</a>`,clubLink(item.winner)])):empty('Les vainqueurs apparaîtront après les premières finales.');
 return `<div class="page-heading edition-head"><div><h1>Sélections nationales</h1></div>${switcher}</div>`
  +`<div class="nations-split"><div class="nations-side">${await currentEdition(data.editions)}${card('Palmarès',palmares)}${titlesCard(data.editions)}</div>${nationsCard(data.nations,params.get('federation'))}</div>`;
}
