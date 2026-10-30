import {api,escape as e,number as n,averageNote,date,card,GO,fact,heading,steps,table,sortableTable,standings,empty,clubLink,playerLink,fixtures,leadersCards,playerTable,playerViewSwitch,query,competitionBadge,editionHref,SELECTION_COMPETITIONS} from './ui.js';
import {nationNavigation,selectionNavigation} from './navigation.js';
import {nationHero,nationTiles,competitionHero,competitionBand} from './club-hero.js';
import {calendarBlock,kitsCard,elevenCard,leadersCards as presentationLeaders,presentationHeight,presentationColumns,rowsIn,PRESENTATION} from './club-overview.js';
import {calendarRows} from './club-calendar.js';
import {bracket} from './bracket.js';
import {ROUND_TABS,isRoundTab,roundPath,roundContent} from './rounds.js';
import {NATION_VIEWS,historyView,viewChoice,nationHistory} from './history.js';

const GROUP_ROUNDS=10,LEAGUE_ROUNDS=6;

// The places a table marks: the first `places`, or where each nation goes when its row says it (`movement`, a Nations
// League's): up a division or to the semi-finals in green, down one in red.
const placeClass=(row,index,places)=>row.movement==='relegation'?'relegated':row.movement||index<places?'promoted':'';
// `extract` keeps the points and the goal difference only, written as a league's extract beside a club's squad writes them;
// `own` is the nation whose page shows the table: its row is marked.
export function internationalStandings(rows,places=0,{extract=false,own=null}={}){
 const rowClasses=rows.map((row,i)=>`${placeClass(row,i,places)}${row.nation.id===own?' own':''}`.trim());
 const difference=row=>row.difference>0?`+${row.difference}`:row.difference;
 if(extract)return standings(['#','NATION','PTS','DIFF.'],rows.map((row,i)=>[
  `<span class="rank ${i?'':'first'}">${i+1}</span>`,`<span class="strong">${clubLink(row.nation)}</span>`,`<b>${row.points}</b>`,difference(row)]),rowClasses);
 return standings(['#','NATION','PTS','J','V','N','D','BP','BC','DIFF.'],rows.map((row,i)=>[
  `<span class="rank">${i+1}</span>`,clubLink(row.nation),`<strong>${row.points}</strong>`,row.played,row.won,row.drawn,row.lost,row.goals_for,row.goals_against,difference(row)]),rowClasses);
}

const isLeague=edition=>edition.kind==='nations';
// The steps through the editions, the latest first, as a club's seasons: `year` is the one shown, `options` what `steps`
// takes to build each step.
const editionSteps=(editions,year,options)=>steps([...editions].sort((a,b)=>b.year-a.year).map(item=>({value:item.year,label:item.name})),year,{name:'Édition',...options});
const EDITION_TABS=[['finals','Phase finale'],['qualifications','Qualifications'],...ROUND_TABS,['statistics','Statistiques'],['history','Historique']];
const LEAGUE_TABS=[['league','Phase de ligue'],['finals','Phase finale'],...ROUND_TABS,['statistics','Statistiques'],['history','Historique']];
const editionTabs=edition=>isLeague(edition)?LEAGUE_TABS:EDITION_TABS;
// The tab a competition opens on for a tab asked for: the same, or its counterpart from one competition to another (a
// tournament's qualifications and a Nations League's groups), else its first.
export function editionSection(edition,section){
 const counterpart=isLeague(edition)?{qualifications:'league'}:{league:'qualifications'};
 const tabs=editionTabs(edition),wanted=counterpart[section]||section;
 return tabs.some(([key])=>key===wanted)?wanted:tabs[0][0];
}

// Four lists of the edition on one screen, each one scrolling on its own.
const MIN_RATED_MATCHES=3;
function statistics(data){
 const records=data.records;
 if(!records.length)return card('Statistiques de l’édition',empty('Aucun match joué'));
 const panel=(title,headers,rows,note='')=>`<section class="card stats-panel"><div class="card-head"><h2>${e(title)}</h2>${note}</div><div class="stats-scroll">${rows.length?table(headers,rows):empty('Aucun joueur')}</div></section>`;
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
 const tree=()=>bracket(data.knockout_rounds.map(round=>{const items=data.matches.filter(m=>m.round===round.number);return {label:round.label,date:items[0]?.date,matches:items};}),{fixed:true});
 // A Nations League's finals are its semi-finals and its final alone, empty boxes until they are drawn.
 if(isLeague(data))return tree();
 const groups=data.final_groups;
 if(!groups.length)return card('Phase finale',empty('Tirage à la fin des qualifications'));
 const knockout=tree();
 const days=group=>[1,2,3].map(day=>{const items=groupMatches(group,data.matches,GROUP_ROUNDS+day);return items.length?`<div class="fixture-date">Journée ${day} · ${date(items[0].date)}</div>${fixtures({items})}`:'';}).join('');
 return knockout+`<div class="intl-groups intl-groups-4">${groups.map(group=>card(`Groupe ${group.name}`,internationalStandings(group.rows,2)+days(group))).join('')}</div>`;
}
// Every group of an edition's first stage: its qualifying groups, or the groups of all the divisions of a Nations League.
const firstGroups=data=>isLeague(data)?data.divisions.flatMap(division=>division.groups):data.qualification_groups;
// The results of one round of the first stage, a block per group.
function roundResults(data,day){
 const last=isLeague(data)?LEAGUE_ROUNDS:GROUP_ROUNDS,tab=isLeague(data)?'league':'qualifications';
 const rounds=[...new Set(data.matches.filter(m=>m.round<=last).map(m=>m.round))].sort((a,b)=>a-b);
 if(!rounds.length)return '';
 const played=rounds.filter(round=>data.matches.some(m=>m.round===round&&m.score));
 const current=rounds.includes(Number(day))?Number(day):played.at(-1)??rounds[0];
 const pills=`<nav class="chips" aria-label="Journées">${rounds.map(round=>`<a class="${round===current?'active':''}" href="${editionHref(data.code,data.year,tab,round)}">J${round}</a>`).join('')}</nav>`;
 const items=data.matches.filter(m=>m.round===current);
 const blocks=firstGroups(data).map(group=>{const list=groupMatches(group,items,current);return list.length?`<section class="day-group"><h3 class="section-title">Groupe ${e(group.name)}</h3>${fixtures({items:list})}</section>`:'';}).join('');
 return card('Résultats par journée',`<div class="day-pills">${pills}</div><div class="day-groups">${blocks}</div>`,`<span class="muted">${date(items[0].date)}</span>`);
}
function qualificationsContent(data,day){
 if(!data.qualification_groups.length)return card('Qualifications',empty('Tirage à venir'));
 const top=data.records.filter(row=>row.goals>0).sort((a,b)=>b.goals-a.goals||a.matches-b.matches).slice(0,10);
 const rail=(top.length?card('Meilleurs buteurs',table(['#','JOUEUR','NATION','MJ','BUTS'],top.map((row,index)=>[index+1,`<span class="strong">${playerLink(row.player_id,row.name)}</span>`,clubLink(row.nation),row.matches,`<b>${row.goals}</b>`]))):'')
  +card('Classement des deuxièmes',internationalStandings(data.best_seconds,data.second_places));
 return `<div class="intl-split"><div class="intl-groups">${data.qualification_groups.map(group=>card(`Groupe ${group.name}`,internationalStandings(group.rows,1))).join('')}</div><div class="intl-rail">${rail}</div></div>`+roundResults(data,day);
}
// A Nations League's groups, division by division, four groups a row, each nation marked with where it goes; then the
// results of a match day.
function leagueContent(data,day){
 const divisions=data.divisions.map(division=>card(division.name,`<div class="intl-groups intl-groups-4">`
  +`${division.groups.map(group=>`<div><h3 class="section-title">Groupe ${e(group.name)}</h3>${internationalStandings(group.rows)}</div>`).join('')}</div>`)).join('');
 return divisions+roundResults(data,day);
}
// `round` is the latest or next round of the edition, for the tabs that show it; `day` the round of the first stage picked
// in the qualifications or a Nations League's groups.
export function editionContent(data,section='qualifications',round=null,day=null){
 if(round)return roundContent(round,section,{figures:true});
 if(section==='statistics')return statistics(data);
 if(section==='league')return leagueContent(data,day);
 return section==='finals'?finalsContent(data):qualificationsContent(data,day);
}
const NATION_TABS=[['overview','Présentation'],['squad','Effectif'],['calendar','Calendrier'],['history','Historique']];

// The days of a camp, "du 9 au 17 novembre 2028": the month and the year are written once when its two ends share them.
const DAY={day:'numeric'},MONTH={month:'long'},YEAR={year:'numeric'};
const written=(value,options)=>new Intl.DateTimeFormat('fr-FR',options).format(new Date(`${value}T12:00:00`));
export function campDays(start,end){
 const year=start.slice(0,4)===end.slice(0,4),month=year&&start.slice(5,7)===end.slice(5,7);
 return `du ${written(start,{...DAY,...(month?{}:MONTH),...(year?{}:YEAR)})} au ${written(end,{...DAY,...MONTH,...YEAR})}`;
}
// The list of a camp, a club's squad list: the same views, sorted by the server on the column picked in the address.
function squadCard(data,params){
 if(!data.camp)return card('Sélection',empty('Aucun rassemblement en cours'));
 const view=params.get('vue'),sorted=params.get('tri')||'position',order=params.get('ordre')||'asc',count=data.squad.length;
 const title=`${data.camp.upcoming?'Rassemblement':'Dernier rassemblement'} ${campDays(data.camp.start,data.camp.end)} · ${count} joueur${count>1?'s':''}`;
 return card(title,playerTable({items:data.squad},true,sorted,order,{view,pager:false,selection:true}),`<div class="card-tools">${playerViewSwitch(view,sorted,order,true,{selection:true})}</div>`);
}
// The group the selection plays in, beside its matches as a club's league stands beside its calendar: every nation of the
// group, the places that qualify marked, titled with the last round counted.
// `own` is the selection whose page it is; `extract` keeps the points and the goal difference, for the Présentation.
function groupCard(group,own,extract=false){
 if(!group)return '';
 const round=Math.max(0,...group.rows.map(row=>row.played));
 const title=`Groupe ${e(group.name)}${round?` · ${round}<span class="ordinal">${round===1?'re':'e'}</span> journée`:''}`;
 const tab=group.finals?'finals':group.stage==='Phase de ligue'?'league':'qualifications';
 return `<section class="card standings-card${extract?' standings-extract':''}"><div class="card-head"><h2>${title}</h2><a href="${editionHref(group.code,group.year,tab)}" aria-label="Voir le groupe">Voir ${GO}</a></div>${internationalStandings(group.rows,group.places,{extract,own})}</section>`;
}
// The Effectif tab, a club's: the list alone, across the page.
const squadContent=(nation,params)=>`<div class="club-squad">${squadCard(nation,params)}</div>`;
// A selection's round as short as it reads: J3 in its qualifiers and in a Nations League's groups, the stage of the finals
// in full.
export const editionRound=label=>String(label||'').replace(/^(Qualifications|Division [A-D]) · /,'');
// An edition the selection played, as its record writes it: its badge then its name, a link to its finals; then where it
// stands or stood there, a title after its star.
const editionName=row=>`${competitionBadge(row)}<a class="strong" href="${editionHref(row.code,row.year,'finals')}">${e(row.name)}</a>`;
const editionPlace=row=>row.winner?`<span class="strong">✦ ${e(row.place)}</span>`:e(row.place);
// Where the selection stands or stood in each edition it played, the latest first, and its record there.
function recordCard(rows){
 return card('Bilan',`<div class="edition-records">${standings(['COMPÉTITION','PLACE','J','V','N','D','BP','BC'],rows.map(row=>[
  editionName(row),editionPlace(row),row.played,row.won,row.drawn,row.lost,row.goals_for,row.goals_against]))}</div>`);
}
// The record on a Présentation, as narrow as its column: the place alone in each of the `shown` latest editions.
const runsCard=(rows,shown)=>card('Parcours',`<div class="edition-records">${standings(['COMPÉTITION','PLACE'],rows.slice(0,shown).map(row=>[editionName(row),editionPlace(row)]))}</div>`);
// The Calendrier tab, a club's: one line per match of an edition, the day (with its year: an edition runs over two), the
// edition's badge, the round, a plane away, the other side, the score from the selection's side and the scorers of either
// side. The edition is stepped through from the row of tabs (`edition` in the address; the one under way by default).
// Beside the matches, the group of that edition in full and the record in each edition played.
function calendarContent(nation,data){
 if(!data.items.length)return `<section class="card">${empty('Aucun match programmé')}</section>`;
 const competitions=new Map(data.competitions.map(row=>[row.id,row]));
 return `<div class="calendar-layout club-calendar selection-calendar"><section class="card calendar-card"><div class="card-head"><h2>Matches</h2></div>`
  +`${calendarRows(data.items,nation,competitions,{written:date,round:editionRound})}</section><aside class="calendar-side">${groupCard(data.group,nation.id)}${recordCard(data.competitions)}</aside></div>`;
}
// A selection's Présentation, a club's where it applies: the row of its tiles, then four columns that fill the window. Its
// kits and its place in each edition, the latest first; its équipe-type in the edition it is at, over its group there; its
// matches, every edition included (the next three at most, the latest played before them, as many as the column holds); its
// best scorers, providers and notes in the edition. `calendar` is its calendar of the edition (its group there, its record
// in each edition), `overview` what its Présentation is given (its matches, its équipe-type, what each player did).
function presentationContent(nation,calendar,overview){
 const {HEAD,PADDING,GAP,KITS,TABLE_HEAD,TABLE_ROW}=PRESENTATION,height=presentationHeight();
 const edition=calendar.competitions.find(row=>row.year===calendar.edition)||null,group=calendar.group,kits=kitsCard(nation);
 // A club's widgets read its competition by name: a match of another edition carries its badge.
 const team={...nation,competition:edition?.name},{last,next}=overview.calendar;
 const matches=rowsIn(height-HEAD-PADDING),records=Math.max(1,Math.floor((height-(kits?KITS+GAP:0)-TABLE_HEAD)/TABLE_ROW));
 return nationTiles(nation,edition)+presentationColumns([
  [kits,calendar.competitions.length?runsCard(calendar.competitions,records):''],
  [elevenCard(team,overview.eleven,height-HEAD-PADDING-(group?GAP+TABLE_HEAD+group.rows.length*TABLE_ROW:0)),groupCard(group,nation.id,true)],
  [last.length||next.length?calendarBlock(team,{last:last.slice(0,Math.max(0,matches-next.length)),next},`#/international/nation/${nation.id}/calendar`):''],
  [presentationLeaders(overview.players,rowsIn((height-3*(HEAD+PADDING)-2*GAP)/3))]]);
}
// A selection's page: a club's header in its colours with the tabs, then the open tab, its Présentation by default. Only the
// list of the Effectif tab reads the sort of the address, only the Calendrier tab its edition.
async function nationScreen(id,tab,params=new URLSearchParams()){
 tab=NATION_TABS.some(([key])=>key===tab)?tab:'overview';
 const sort=tab==='squad'?query({tri:params.get('tri'),ordre:params.get('ordre')}):'';
 const edition=tab==='calendar'&&/^\d+$/.test(params.get('edition')||'')?`?edition=${params.get('edition')}`:'';
 const view=historyView(NATION_VIEWS,params);
 const [data,nav,calendar,history,overview]=await Promise.all([api(`/international/nations/${id}${sort?`?${sort}`:''}`),api(`/international/nations/${id}/navigation`),
  ['overview','calendar'].includes(tab)?api(`/international/nations/${id}/calendrier${edition}`):null,tab==='history'?api(`/international/nations/${id}/historique?${query({vue:view})}`):null,
  tab==='overview'?api(`/international/nations/${id}/apercu`):null]);
 const content=tab==='overview'?presentationContent(data,calendar,overview):tab==='calendar'?calendarContent(data,calendar):tab==='history'?nationHistory(view,history,data):squadContent(data,params);
 const tools=tab==='calendar'&&calendar.items.length?editionSteps(calendar.editions,calendar.edition,{param:'edition'}):history?viewChoice(NATION_VIEWS,view,`#/international/nation/${id}/history`):'';
 return nationHero(data,{lead:nationNavigation(nav,tab),menu:NATION_TABS,section:tab,tools})+content;
}

// The page of a competition of the selections opens on its header: the Euro's, the World Cup's or the Nations League's, its
// name alone. The other competitions are stepped to from its band, the open tab kept; its editions from the end of its row
// of tabs, the year alone, but on Historique, which reads them all. Its tile names who won the edition shown, and until then
// who held the title before it. `editions` are the competition's, the latest first.
function competitionHeader(competition,editions,year,section){
 const shown=editions.find(item=>item.year===year),holder=editions.find(item=>item.year<year&&item.winner)?.winner??null;
 const href=item=>`#/international/${item.slug}/${editionSection(item,section)}`;
 const tools=section==='history'||!shown?'':steps(editions.map(item=>({value:item.year,label:String(item.year),note:item.winner?'':'en cours'})),year,{param:'edition',name:'Édition'});
 return competitionHero({...competition,kind:'international',winner:shown?.winner??null,holder:shown?holder:null},{lead:selectionNavigation(SELECTION_COMPETITIONS,competition,href),
  base:`#/international/${competition.slug}`,menu:editionTabs(competition).map(([key,label])=>[key,label,shown?`edition=${year}`:'']),section,tools});
}

// The finals of a competition, the latest first: the edition, its winner, the final's score from the winner's side (a
// shoot-out's mark before it, its figures in the tooltip), a link to the match, and the finalist.
function finalsTable(competition,finals){
 if(!finals.length)return empty('Aucun vainqueur');
 const score=final=>`<a class="final-score" href="#/match/${final.match_id}">${final.penalties?`<small title="Tirs au but ${final.penalties.join(' – ')}">(TAB)</small>`:''}${final.score.join(' – ')}</a>`;
 return `<div class="finals-table">${sortableTable(['ÉDITION','VAINQUEUR','FINALE','FINALISTE'],finals.map(final=>[`<a class="strong" href="${editionHref(competition.code,final.year,'finals')}">${final.year}</a>`,
  `<span class="strong">${clubLink(final.winner)}</span>`,score(final),clubLink(final.runner_up)]),finals.map(final=>[final.year,final.winner.name,final.score[0]-final.score[1],final.runner_up.name]))}</div>`;
}
// How far a nation went in an edition, written short in its column (docs/charte-graphique.md, « Finales et parcours »),
// the full words in the tooltip: the title, the final, the round it went out in, the groups; in a Nations League, its
// division, its run in the finals in place of the A, an arrow where it went up or down. Each comes with what it sorts by.
const STAGES={winner:['✦','Vainqueur',6],final:['F','Finale',5],semi:['1/2','Demi-finales',4],quarter:['1/4','Quarts de finale',3],
 eighth:['1/8','Huitièmes de finale',2],groups:['Gr.','Phase de groupes',1]};
function runCell(run){
 if(!run)return ['<span class="run none">—</span>',0];
 const [mark,label,value]=STAGES[run.stage]||[],kind=run.stage==='winner'?' won':run.stage==='final'?' final':'';
 if(run.division==null)return [`<span class="run${kind}" title="${label}">${mark}</span>`,value];
 const moved=run.move==='up'?['▲','Promu']:run.move==='down'?['▼','Relégué']:null;
 const told=[`Division ${run.division}`,label,moved?.[1]].filter(Boolean).join(' · ');
 return [`<span class="run${kind}" title="${e(told)}">${mark||run.division}${moved?`<i class="${run.move}">${moved[0]}</i>`:''}</span>`,10*(4-'ABCD'.indexOf(run.division))+(value||0)];
}
// The Historique tab, as a European cup's: its finals and the titles of each nation, then how far each nation went in each
// edition, the best runs first, then the players of all time of the competition, each with his nation.
function competitionHistory(competition,data){
 const league=competition.kind==='nations';
 const titles=data.titles.length?`<div class="titles-table">${sortableTable(['NATION','TITRES','FINALES'],data.titles.map(row=>[`<span class="strong">${clubLink(row.nation)}</span>`,`<b>${row.titles}</b>`,row.finals]),
  data.titles.map(row=>[row.nation.name,row.titles,row.finals]))}</div>`:empty('Aucun titre');
 const cells=data.runs.map(row=>row.runs.map(runCell));
 const runs=data.runs.length?`<div class="runs-table">${sortableTable(['NATION',...(league?[]:['PART.']),...data.editions.map(String)],
  data.runs.map((row,index)=>[`<span class="strong">${clubLink(row.nation)}</span>`,...(league?[]:[row.played]),...cells[index].map(([cell])=>cell)]),
  data.runs.map((row,index)=>[row.nation.name,...(league?[]:[row.played]),...cells[index].map(([,value])=>value)]))}</div>`
  :empty('Aucun parcours');
 return `<div class="history-layout three"><div class="history-main">${card('Les vainqueurs',finalsTable(competition,data.finals))}${card('Titres par nation',titles)}</div>`
  +`<div class="history-leaders">${leadersCards(data.leaders,'',{nations:true})}</div><div class="history-archives">${card('Parcours des nations',runs)}</div></div>`;
}

// A competition's page. The edition shown is the one of the address, else the one under way, else the latest; a
// competition without one yet says when its first is drawn. `day` is the round picked in the first stage.
async function competitionScreen(data,competition,year,section,day){
 const editions=data.editions.filter(item=>item.kind===competition.kind);
 const playing=editions.filter(item=>!item.winner).map(item=>item.year);
 year=editions.some(item=>item.year===Number(year))?Number(year):playing.length?Math.min(...playing):editions[0]?.year??null;
 section=editionSection(competition,section);
 const summary=data.competitions?.find(item=>item.kind===competition.kind),next=summary?.next;
 let content;
 if(section==='history')content=competitionHistory(competition,await api(`/international/competitions/${competition.slug}/historique`));
 else if(year==null)content=card(competition.name,empty(next?`Première édition en ${next.year} · tirage le ${date(next.draw)}`:'Première édition à venir'));
 else{
  const [edition,round]=await Promise.all([api(`/international/editions/${year}`),isRoundTab(section)?api(`/international/editions/${year}/${roundPath(section)}`):null]);
  content=editionContent(edition,section,round,day);
 }
 return competitionHeader({...SELECTION_COMPETITIONS.find(item=>item.kind===competition.kind),...summary},editions,year,section)+content;
}

// A competition's column on Sélections nationales: its band, which opens its page; who holds its title, the edition under
// way and its next match day, else the next edition and the day it is drawn; then its finals.
function competitionColumn(competition){
 const current=competition.current,next=competition.next;
 const facts=[fact('Tenant du titre',competition.holder?`<span class="strong">${clubLink(competition.holder)}</span>`:'—'),
  ...(current?[fact('Édition en cours',`<a href="${editionHref(competition.code,current.year)}">${current.year} · ${e(current.stage)}</a>`),
   fact('Prochaine journée',current.next?`${e(current.next.round)} · ${date(current.next.date)}`:'—')]
   :next?[fact('Prochaine édition',String(next.year)),fact('Tirage',date(next.draw))]:[])];
 return `<section class="card selection-competition">${competitionBand(competition,`#/international/${competition.slug}`)}<div class="card-body">${facts.join('')}</div>`
  +`<h3 class="section-title">Palmarès</h3>${finalsTable(competition,competition.finals)}</section>`;
}
// The nations, the strongest first, filtered by federation: their strength, their titles in each competition, the last
// edition they played and how far they went in it.
function nationsCard(nations,federation){
 const federations=[...new Set(nations.map(team=>team.federation))].sort();
 const option=(key,label,count)=>`<a class="${(federation||'')===key?'active':''}" href="#/international${key?`?federation=${encodeURIComponent(key)}`:''}">${e(label)} · ${count}</a>`;
 const filters=`<div class="segmented small" role="group" aria-label="Fédérations">${option('','Toutes',nations.length)}${federations.map(name=>option(name,name,nations.filter(team=>team.federation===name).length)).join('')}</div>`;
 const shown=federation?nations.filter(team=>team.federation===federation):nations;
 const titles=(team,kind)=>team.titles?.[kind]||0;
 const strength=team=>`<span class="force"><i class="gauge"><i style="width:${Math.max(0,Math.min(100,team.strength))}%"></i></i>${n(team.strength)}</span>`;
 const last=team=>{const run=team.last_edition;return run?`<span class="cell">${competitionBadge({kind:'international',code:run.code,name:run.name,year:run.year})}${run.year} · ${run.winner?'✦ ':''}${e(run.label)}</span>`:'—';};
 const headers=['NATION','FÉDÉRATION','FORCE / 100',...SELECTION_COMPETITIONS.map(item=>`<span title="${e(`Titres · ${item.name}`)}">${item.code}</span>`),'DERNIÈRE ÉDITION'];
 const rows=shown.map(team=>[`<span class="strong">${clubLink(team)}</span>`,e(team.federation),strength(team),
  ...SELECTION_COMPETITIONS.map(item=>titles(team,item.kind)?`<b>${titles(team,item.kind)}</b>`:'<span class="muted">—</span>'),last(team)]);
 const values=shown.map(team=>[team.name,team.federation,team.strength,...SELECTION_COMPETITIONS.map(item=>titles(team,item.kind)),team.last_edition?.year??'']);
 return card('Nations actives',`<div class="nations-table">${sortableTable(headers,rows,values)}</div>`,filters);
}
export async function internationalScreen(id,section,tab,params=new URLSearchParams()){
 if(id==='nation')return nationScreen(section,tab,params);
 const data=await api('/international');
 if(!data.enabled)return heading('Sélections nationales')+card('Nouvelle partie nécessaire',empty('Cette sauvegarde conserve son calendrier de clubs. Créez une nouvelle partie pour activer les sélections nationales.'));
 // A competition by the word of its address; an edition by its year alone, as the addresses of before had it.
 const competition=SELECTION_COMPETITIONS.find(item=>item.slug===id);
 if(competition)return competitionScreen(data,competition,params.get('edition'),section,tab);
 const edition=/^\d+$/.test(id||'')?data.editions.find(item=>item.year===Number(id)):null,named=SELECTION_COMPETITIONS.find(item=>item.kind===edition?.kind);
 if(named)return competitionScreen(data,named,edition.year,section,tab);
 return heading('Sélections nationales')+`<div class="selection-competitions">${(data.competitions||[]).map(competitionColumn).join('')}</div>`+nationsCard(data.nations,params.get('federation'));
}
