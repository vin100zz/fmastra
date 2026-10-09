import {api,escape as e,number as n,averageNote,date,seasonSteps,card,table,sortableTable,headPager,playerLink,clubLink,money,playerTable,playerViewSwitch,sortButton,position,level,levelBadge,scoreBadge,mainNation,nationBadge,nationName,figure,miniBar,query} from './ui.js';
import {monthlySalary} from './salaries.js';
import {resetButton} from './filters.js';
import {wideScreen,fittedRows,sidePanel,searchField,positionChips,choiceLinks,toggleLink,rangeMenu,choiceSelect} from './listing.js';
import {LEAGUE_ORDER} from './screens.js';

const LABELS={transfer:'Transferts',retirement:'Retraites',academy:'Promotions des centres'};
// What stands above the first row: top bar, title line, filter line, card head and table header.
const LIST_ABOVE=193;
const signed=value=>`${value>0?'+':value<0?'−':''}${money(Math.abs(value))}`;
const external='<span class="muted">Marché extérieur</span>';
// The age on the day of the movement, with the ranges each tab offers in one click.
const ageMenu=(base,params,presets)=>rangeMenu(base,params,'Âge',[['age_min','min','min="0" max="100"'],['age_max','max','min="0" max="100"']],{presets});

// A round figure to grade an axis with: 1, 2, 2.5 or 5 times a power of ten.
function roundStep(value){
 const power=10**Math.floor(Math.log10(Math.max(value,1e-9))),lead=value/power;
 return (lead<=1?1:lead<=2?2:lead<=2.5?2.5:lead<=5?5:10)*power;
}
// The graded lines of a chart whose highest bar is `most`: the value at its top, and a line per step under it.
function gradedLines(most, read){
 const step=roundStep(Math.max(1,most)/4),top=step*Math.max(1,Math.ceil(most/step));
 const ticks=[];for(let tick=step;tick<=top;tick+=step)ticks.push(tick);
 return {top,grid:ticks.map(tick=>`<span style="bottom:${(tick*100/top).toFixed(1)}%"><em>${read(tick)}</em></span>`).join('')};
}

// The weeks the season's transfers were signed in, one bar each, the summer window then the winter one. `measure` is what a
// bar counts: the transfers, or the fees paid. Only the busiest week of each window carries its figure.
export function activityChart(weeks, year, measure){
 const value=week=>measure==='volume'?week.volume:week.count,read=amount=>measure==='volume'?money(amount):n(amount);
 const {top,grid}=gradedLines(Math.max(...weeks.map(value),0),read);
 const day=week=>`${week.week.slice(8,10)}/${week.week.slice(5,7)}`;
 const bar=(week,peak)=>{
  const share=(value(week)*100/top).toFixed(1),told=`Semaine du ${date(week.week)} : ${n(week.count)} transfert${week.count>1?'s':''}, ${money(week.volume)}`;
  return `<div class="week" title="${e(told)}"><div class="week-plot">${value(week)===peak&&peak?`<b style="bottom:${share}%">${read(peak)}</b>`:''}<i style="height:${share}%"></i></div><span>${day(week)}</span></div>`;
 };
 const span=(list,label)=>list.length?`<div class="activity-window" style="flex-grow:${list.length}"><div class="activity-bars">${list.map(week=>bar(week,Math.max(...list.map(value)))).join('')}</div><small>${label}</small></div>`:'';
 return `<div class="activity${weeks.length>18?' dense':''}" role="img" aria-label="${measure==='volume'?'Indemnités':'Transferts'} par semaine"><div class="activity-grid" aria-hidden="true">${grid}</div>${span(weeks.filter(week=>week.summer),`Été ${year}`)}${span(weeks.filter(week=>!week.summer),`Hiver ${year+1}`)}</div>`;
}

// A count per class (an age, a range of potentials) as bars, [label, count, tooltip] each; only the highest carries its figure.
export function countChart(bars, label){
 const most=Math.max(0,...bars.map(([,count])=>count)),{top,grid}=gradedLines(most,n);
 const bar=([name,count,told])=>{const share=(count*100/top).toFixed(1);
  return `<div class="week" title="${e(told)}"><div class="week-plot">${count===most&&most?`<b style="bottom:${share}%">${n(count)}</b>`:''}<i style="height:${share}%"></i></div><span>${name}</span></div>`;};
 return `<div class="activity" role="img" aria-label="${e(label)}"><div class="activity-grid" aria-hidden="true">${grid}</div><div class="activity-window"><div class="activity-bars">${bars.map(bar).join('')}</div></div></div>`;
}

const tile=(label,value,title='')=>`<div class="stat-card"${title?` title="${e(title)}"`:''}><span class="label">${label}</span><strong>${value}</strong></div>`;
const tiles=list=>`<div class="stat-grid">${list.map(item=>tile(...item)).join('')}</div>`;
const league=entry=>entry.id==null?external:`<a class="strong" href="#/league/${entry.id}">${e(entry.name)}</a>`;
const counted=(count,most)=>`<span class="bar-figure">${miniBar(count/Math.max(1,most))}<b>${n(count)}</b></span>`;
// A table of the summary, sorted in the browser; `kind` sets how its columns stand (see .summary-table in theme.css).
const summaryTable=(kind,headers,rows,values)=>`<div class="summary-table ${kind}">${sortableTable(headers,rows,values)}</div>`;

// Beside the transfers, the season in figures: four totals, the weeks, then what each club and each league spent and
// received, both sorted in the browser. The clubs scroll within their card.
function marketSummary(summary, params, base){
 const measure=params.get('mesure')==='volume'?'volume':'count';
 const chart=card('Activité par semaine',summary.weeks.length?activityChart(summary.weeks,summary.season,measure):'',choiceLinks(base,params,'mesure',[['','Nombre'],['volume','Volume']],'Mesure'),'activity-card');
 const headers=first=>[first,'ARR.','DÉP.','ACHATS','VENTES','BALANCE'];
 const figures=(entry,most)=>[figure(n(entry.arrivals)),figure(n(entry.departures)),`<span class="bar-figure">${miniBar(entry.spent/most)}<b>${money(entry.spent)}</b></span>`,figure(money(entry.earned)),figure(signed(entry.earned-entry.spent))];
 const raw=entry=>[entry.arrivals,entry.departures,entry.spent,entry.earned,entry.earned-entry.spent];
 const most=list=>Math.max(1,...list.map(entry=>entry.spent));
 const clubs=card('Clubs',summaryTable('figures',headers('CLUB'),summary.clubs.map(entry=>[`<span class="strong">${clubLink(entry.club)}</span>`,...figures(entry,most(summary.clubs))]),summary.clubs.map(entry=>[entry.club.name,...raw(entry)])),'','clubs-summary');
 const leagues=card('Championnats',summaryTable('figures',headers('CHAMPIONNAT'),summary.leagues.map(entry=>[league(entry),...figures(entry,most(summary.leagues))]),summary.leagues.map(entry=>[entry.name??'',...raw(entry)])),'','leagues-summary');
 return tiles([['Transferts',n(summary.total)],['Volume',money(summary.volume)],['Médiane',money(summary.median)],['Record',summary.record?money(summary.record.fee):'—',summary.record?.player||'']])+chart+clubs+leagues;
}

// Beside the retirements: how many, at what age, then the clubs and the leagues they left.
export function retirementSummary(summary){
 const head=tiles([['Retraites',n(summary.total)],['Âge moyen',summary.average_age==null?'—':n(summary.average_age)],['Internationaux',n(summary.capped)],['Doyen',summary.oldest?`${summary.oldest.age} ans`:'—',summary.oldest?.player||'']]);
 if(!summary.total)return head;
 const chart=card('Âge au départ',countChart(summary.ages.map(item=>[item.age,item.count,`${item.age} ans : ${n(item.count)} retraite${item.count>1?'s':''}`]),'Retraites par âge'),'','activity-card');
 const most=list=>Math.max(1,...list.map(entry=>entry.count));
 const figures=(entry,list)=>[counted(entry.count,most(list)),figure(entry.average_age==null?'—':n(entry.average_age)),figure(n(entry.matches))];
 const raw=entry=>[entry.count,entry.average_age??'',entry.matches];
 const clubs=card('Clubs',summaryTable('figures text-second',['CLUB','CHAMPIONNAT','RETRAITES','ÂGE MOY.','<span title="Matches joués dans la partie par ces joueurs">MJ</span>'],
  summary.clubs.map(entry=>[`<span class="strong">${clubLink(entry.club)}</span>`,entry.league?e(entry.league.name):external,...figures(entry,summary.clubs)]),
  summary.clubs.map(entry=>[entry.club.name,entry.league?.name??'',...raw(entry)])),'','clubs-summary');
 const leagues=card('Championnats',summaryTable('figures',['CHAMPIONNAT','RETRAITES','ÂGE MOY.','MJ'],summary.leagues.map(entry=>[league(entry),...figures(entry,summary.leagues.filter(item=>item.id!=null))]),
  summary.leagues.map(entry=>[entry.name??'',...raw(entry)])),'','leagues-summary');
 return head+chart+clubs+leagues;
}

// The countries shown beside the promotions: those that promoted the most players.
const LISTED_NATIONS=12;

// Beside the promotions: how many, their potential and what they gained since, then the clubs that trained them (they
// scroll within their card) and the countries of those clubs.
export function academySummary(summary){
 const gain=summary.average_progress==null?'—':`${summary.average_progress>0?'+':''}${n(summary.average_progress*2)}`;
 const head=tiles([['Promus',n(summary.total)],['Pot. moyen',summary.average_potential==null?'—':level(summary.average_potential)],['Meilleur',summary.best?level(summary.best.potential):'—',summary.best?.player||''],['Progression',gain,'Niveaux gagnés en moyenne depuis la promotion']]);
 if(!summary.total)return head;
 const chart=card('Potentiel des promus',countChart(summary.bins.map(item=>item.from==null?['&lt; 100',item.count,`Moins de 100 : ${n(item.count)} joueur${item.count>1?'s':''}`]
  :[item.from,item.count,`De ${item.from} à ${item.from+(item.from===190?10:9)} : ${n(item.count)} joueur${item.count>1?'s':''}`]),'Promus par potentiel'),'','activity-card');
 const academies=card('Centres de formation',summaryTable('academies',['CLUB','PROMUS','<span title="Potentiel moyen de ses promus">POT. MOY.</span>','MEILLEUR','POT.','<span title="Recrutement des jeunes">JEUNES</span>'],
  summary.academies.map(entry=>[`<span class="strong">${clubLink(entry.club)}</span>`,figure(n(entry.count)),levelBadge(entry.average_potential),entry.best?playerLink(entry.best.player_id,entry.best.player):'—',levelBadge(entry.best?.potential),scoreBadge(entry.youth_recruitment)]),
  summary.academies.map(entry=>[entry.club.name,entry.count,entry.average_potential??'',entry.best?.player??'',entry.best?.potential??'',entry.youth_recruitment??''])),'','clubs-summary');
 const listed=summary.nations.slice(0,LISTED_NATIONS),most=Math.max(1,...listed.map(entry=>entry.count));
 const nations=card('Pays',summaryTable('nations',['PAYS','PROMUS','CLUBS','POT. MOY.','<span title="Meilleur potentiel">MEILLEUR</span>'],
  listed.map(entry=>[`<span class="strong">${nationBadge(entry.code,{full:true})}</span>`,counted(entry.count,most),figure(n(entry.clubs)),levelBadge(entry.average_potential),levelBadge(entry.best)]),
  listed.map(entry=>[nationName(entry.code),entry.count,entry.clubs,entry.average_potential??'',entry.best??''])),'','leagues-summary');
 return head+chart+academies+nations;
}
const SUMMARIES={transfer:marketSummary,retirement:retirementSummary,academy:academySummary};

const playerCell=row=>`<span class="strong">${playerLink(row.player_id,row.player)}</span>`;
const nationCell=codes=>codes?.length?mainNation(codes):'—';
// Headers of a list sorted by the server: [key, label, tooltip, heading over the column], names first running from A.
const TEXT_SORTS=['position','name','nation','source','target','league','academy_club','club'];
const sortHeaders=(columns,data,sorted=data.sort)=>columns.map(([key,label,title])=>label?sortButton(key,title?`<span title="${title}">${label}</span>`:label,sorted,data.order,TEXT_SORTS.includes(key)?'asc':'desc'):'');
const movementsTable=(columns,data,rows)=>`<div class="movements-table">${table(sortHeaders(columns,data),rows,undefined,undefined,undefined,columns.map(([key])=>`${key}-column`),columns.some(column=>column[3])?columns.map(column=>column[3]||null):undefined)}</div>`;

// A transfer also tells who the player is today; the arrow between its two clubs has no heading. Fees are drawn against the
// season's record, or the highest of the page without the summary.
function transfersTable(data, summary){
 const columns=[['date','DATE'],['position','POSTE'],['name','JOUEUR'],['nation','NAT.'],['age','ÂGE'],['rating','NIV.'],['source','PROVENANCE'],['arrow',''],['target','DESTINATION'],['fee','MONTANT'],['value','VALEUR']];
 const record=Math.max(1,summary?.record?.fee||0,...data.items.map(row=>row.fee||0));
 const fee=row=>row.kind==='loan'?'<span class="num muted">Prêt</span>':row.kind==='release'?'<span class="num muted">Fin de contrat</span>':row.kind==='departure_unknown'?'<span class="num muted">Motif non archivé</span>':row.fee?`<span class="bar-figure">${miniBar(row.fee/record)}<b>${money(row.fee)}</b></span>`:'<span class="num muted">Libre</span>';
 return movementsTable(columns,data,data.items.map(row=>[date(row.date),row.position?position(row.position):'—',playerCell(row),nationCell(row.nationalities),figure(row.age??'—'),levelBadge(row.rating,'Niveau actuel sur 200'),clubLink(row.source),'<span class="move-arrow" aria-hidden="true">→</span>',clubLink(row.target),fee(row),figure(row.value==null?'—':money(row.value))]));
}

// A retirement tells who left: his level on the day and the best of his history, his career in the game and his caps. The
// position and the nationalities are those kept on the day: older retirements have none.
function retirementsTable(data){
 const columns=[['position','POSTE'],['name','JOUEUR'],['nation','NAT.'],['age','ÂGE'],['source','DERNIER CLUB'],['league','CHAMPIONNAT'],
  ['rating','FINAL','Niveau à la retraite','Niveau'],['peak','PIC','Meilleur niveau de son historique','Niveau'],
  ['matches','MJ','','Carrière'],['goals','BUTS','','Carrière'],['assists','PD','','Carrière'],['average','NOTE','','Carrière'],
  ['caps','SÉL.','Sélections','Sélection'],['caps_goals','BUTS','Buts en sélection','Sélection']];
 const count=value=>figure(n(value??0));
 return movementsTable(columns,data,data.items.map(row=>[row.position?position(row.position):'—',playerCell(row),nationCell(row.nationalities),figure(row.age??'—'),clubLink(row.source),
  row.league?e(row.league.name):row.source?external:'—',levelBadge(row.rating,'Niveau à la retraite sur 200'),levelBadge(row.peak,'Meilleur niveau sur 200'),
  count(row.matches),count(row.goals),count(row.assists),figure(row.average?averageNote(row.average):'—'),figure(row.caps?n(row.caps):'—'),figure(row.caps?n(row.caps_goals):'—')]));
}

// A promotion tells what the player was that day and what he is today: the level he had, the one he has, how far that took
// him towards his potential, his value, and for a recruiter what he asks and whether he would come. The club is the one that
// trained him, followed by his club of today when he has left it.
function promotionsTable(data, recruiting){
 const columns=[['position','POSTE'],['name','JOUEUR'],['nation','NAT.'],['age','ÂGE','Âge à la promotion'],['academy_club','CLUB FORMATEUR'],['rating','PROMO','Niveau à la promotion'],['level','NIV.','Niveau actuel'],
  ['progress','PROGRESSION','Niveaux gagnés depuis la promotion, sur le chemin de son potentiel'],['potential','POT.'],['worth','VALEUR','Valeur actuelle'],
  ...(recruiting?[['wage_demand','PRÉTENTIONS'],['interested','INTÉRESSÉ']]:[])];
 const progress=(then,now)=>{
  if(!now||then.rating==null)return figure('—');
  const gain=level(now.rating)-level(then.rating),room=then.potential==null?0:level(then.potential)-level(then.rating);
  return `<span class="bar-figure gain">${room>0?miniBar(gain/room):''}<b>${gain>0?'+':gain<0?'−':''}${Math.abs(gain)}</b></span>`;
 };
 const clubs=(row,now)=>`${clubLink(row.target)}${now&&now.club?.id!==row.target?.id?` <span class="muted">→</span> ${clubLink(now.club)}`:''}`;
 return movementsTable(columns,data,data.items.map(row=>{const then=row.details||{},now=then.current;
  return [then.position?position(then.position):'—',playerCell(row),nationCell(then.nationalities),figure(then.age??'—'),clubs(row,now),
   levelBadge(then.rating,'Niveau à la promotion sur 200'),levelBadge(now?.rating,'Niveau actuel sur 200'),progress(then,now),levelBadge(then.potential,'Potentiel sur 200'),figure(now?money(now.value):'—'),
   ...(recruiting?[figure(now?.wage_demand==null?'—':monthlySalary(now.wage_demand)),now?.interested==null?'—':now.interested?'Oui':'<span class="muted">Non</span>']:[])];}));
}

// The promoted players as they are today, for the views of their attributes and of their composites: the age stays the one of
// the promotion and the club the one that trained them.
const promotedToday=data=>({...data,items:data.items.map(row=>({...(row.details?.current||{id:row.player_id,name:row.player,nationalities:[]}),age:row.details?.age,club:row.target}))});

export async function worldHistoryScreen(section,params,leagues=[],state={}){
 const type=['transfer','retirement','academy'].includes(section)?section:'transfer',base=`#/transfers/${type}`;
 // The promotions also open on the attributes or the composites of the players today: there the level is today's.
 const view=type==='academy'?params.get('vue'):null,today=view==='attributs'||view==='jeu';
 // Each list, and each view of the promotions, has its own header: they are fitted to the window apart.
 const fit=`transfers-${type}${today?`-${view}`:''}`;
 // The fifteen attributes need the whole width: their view goes without the summary.
 const wide=wideScreen()&&view!=='attributs',rows=fittedRows(fit,LIST_ABOVE),recruiting=state.controlled_club_id!=null;
 const request=new URLSearchParams(params);request.set('type',type);
 ['sel','mesure','vue'].forEach(key=>request.delete(key));
 if(rows)request.set('taille',rows);
 // The lowest fee is typed in millions of euros; the API filters on full euros.
 if(request.get('montant_min'))request.set('montant_min',String(Math.round(Number(request.get('montant_min'))*1e6)));
 if(type==='academy'){
  // Levels and potentials are typed out of 200; the API works on the rating out of 100.
  ['niveau_min','niveau_max','potentiel_min','potentiel_max'].forEach(key=>{if(request.get(key))request.set(key,String(Number(request.get(key))/2));});
  // A class of promoted players opens on its best prospects.
  if(!request.get('tri'))request.set('tri',today?'level':'potential');
  else if(today&&request.get('tri')==='rating')request.set('tri','level');
 }
 const [data,summary]=await Promise.all([api(`/monde/transferts?${request}`),wide?api(`/monde/transferts/resume?${query({saison:params.get('saison'),type:type==='transfer'?null:type})}`):null]);
 const counts=data.counts||{};
 const nav=`<nav class="tabs" aria-label="Types de mouvements">${Object.entries(LABELS).map(([key,label])=>`<a class="${key===type?'active':''}" href="#/transfers/${key}?saison=${data.season}">${label}${counts[key]==null?'':` <span class="count">${n(counts[key])}</span>`}</a>`).join('')}</nav>`;
 const heading=`<div class="toolbar"><h1>Mercato mondial</h1>${nav}<div class="tools">${seasonSteps(data)}</div></div>`;
 const divisions=choiceSelect(params,'competition','Championnat',leagues.filter(item=>item.kind==='league').sort((a,b)=>LEAGUE_ORDER.indexOf(a.nation)-LEAGUE_ORDER.indexOf(b.nation)||a.level-b.level).map(item=>[item.id,e(item.name)]));
 const mine=recruiting?toggleLink(base,params,'club',state.controlled_club_id,'Mon club'):'';
 const grade=(label,key,steps)=>rangeMenu(base,params,label,[[`${key}_min`,'min','min="1" max="200"'],[`${key}_max`,'max','min="1" max="200"']],{presets:steps.map(step=>[`≥ ${step}`,{[`${key}_min`]:step}])});
 const narrowing={
  transfer:()=>choiceLinks(base,params,'fenetre',[['','Saison'],['ete','Été'],['hiver','Hiver']],'Fenêtre')
   +choiceLinks(base,params,'nature',[['','Tous'],['payant','Payants'],['libre','Libres'],['pret','Prêts']],'Type')+divisions
   +choiceSelect(params,'poste','Poste',['GB','DC','DG','DD','MDC','MC','MOC','AILG','AILD','BU'].map(role=>[role,role]))
   +ageMenu(base,params,[['≤ 21',{age_max:21}],['≤ 23',{age_max:23}],['24–28',{age_min:24,age_max:28}],['≥ 29',{age_min:29}]])
   +rangeMenu(base,params,'Montant',[['montant_min','min','min="0" step="any"']],{unit:'M€',hint:'M€',presets:[['≥ 10',{montant_min:10}],['≥ 50',{montant_min:50}],['≥ 100',{montant_min:100}]]})+mine,
  retirement:()=>positionChips(base,params)+ageMenu(base,params,[['≤ 32',{age_max:32}],['33–34',{age_min:33,age_max:34}],['≥ 35',{age_min:35}]])+divisions
   +toggleLink(base,params,'selectionnes','oui','Internationaux')+mine,
  academy:()=>positionChips(base,params)+ageMenu(base,params,[['≤ 16',{age_max:16}],['17',{age_min:17,age_max:17}],['≥ 18',{age_min:18}]])
   +grade('Niveau','niveau',[80,100,120])+grade('Potentiel','potentiel',[140,150,160,170])
   +choiceSelect(params,'pays','Pays',(data.nations||[]).map(code=>[code,nationName(code)]).sort((a,b)=>a[1].localeCompare(b[1],'fr')).map(([code,name])=>[code,e(name)]))+divisions
   +(recruiting?choiceSelect(params,'interesse','Intérêt',[['oui','Joueurs intéressés'],['non','Joueurs non intéressés']]):'')+mine,
 }[type]();
 const filters=`<form class="toolbar" data-filter>${searchField(params,type==='transfer'?'Joueur ou club…':'Rechercher un joueur…')}${narrowing}${resetButton(params)}</form>`;
 const partial=data.history_since>`${data.season}-07-01`?`<div class="notice">Les motifs de départ et promotions antérieurs au ${date(data.history_since)} peuvent manquer dans cette ancienne sauvegarde.</div>`:'';
 // In the views of today the level column sorts on today's level, which the server names apart from the one of the promotion.
 const sorted=today&&data.sort==='level'?'rating':data.sort;
 const content=type==='transfer'?transfersTable(data,summary):type==='retirement'?retirementsTable(data)
  :today?playerTable(promotedToday(data),true,sorted,data.order,{view,pager:false}):promotionsTable(data,recruiting);
 const tools=type==='academy'?`<div class="card-tools">${playerViewSwitch(view,sorted,data.order,true)}${headPager(data)}</div>`:headPager(data);
 const list=card(`${n(data.total)} ${LABELS[type].toLowerCase()}`,content,tools);
 const side=summary?sidePanel('',SUMMARIES[type](summary,params,base)):'';
 return heading+filters+partial+`<div class="split${side?' with-side market':''}" data-fit="${fit}" data-rows="${rows??''}">${list}${side}</div>`;
}
