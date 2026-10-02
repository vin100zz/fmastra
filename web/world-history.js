import {api,escape as e,number as n,date,season,card,table,sortableTable,headPager,playerLink,clubLink,money,playerTable,sortButton,position,levelBadge,mainNation,figure,miniBar,query} from './ui.js';
import {resetButton} from './filters.js';
import {wideScreen,fittedRows,sidePanel,searchField,choiceLinks,toggleLink,rangeMenu,choiceSelect} from './listing.js';
import {LEAGUE_ORDER} from './screens.js';

const LABELS={transfer:'Transferts',retirement:'Retraites',academy:'Promotions des centres'};
// What stands above the first row: top bar, title line, filter line, card head and table header.
const LIST_ABOVE=193;
const signed=value=>`${value>0?'+':value<0?'−':''}${money(Math.abs(value))}`;

// The season steps from the title line, on the buttons every season navigation uses.
function seasonStepper(data){
 const step=(value,label,sign)=>`<button type="button" data-season="${value??''}" aria-label="${label}" ${value==null?'disabled':''}>${sign}</button>`;
 return `<nav class="season-navigation" aria-label="Navigation entre les saisons">${step(data.previous_season,'Saison précédente','‹')}<strong>Saison ${season(data.season)}</strong>${step(data.next_season,'Saison suivante','›')}</nav>`;
}

// A round figure to grade an axis with: 1, 2, 2.5 or 5 times a power of ten.
function roundStep(value){
 const power=10**Math.floor(Math.log10(Math.max(value,1e-9))),lead=value/power;
 return (lead<=1?1:lead<=2?2:lead<=2.5?2.5:lead<=5?5:10)*power;
}

// The weeks the season's transfers were signed in, one bar each, the summer window then the winter one. `measure` is what a
// bar counts: the transfers, or the fees paid. Only the busiest week of each window carries its figure.
export function activityChart(weeks, year, measure){
 const value=week=>measure==='volume'?week.volume:week.count,read=amount=>measure==='volume'?money(amount):n(amount);
 const step=roundStep(Math.max(1,...weeks.map(value))/4),top=step*Math.max(1,Math.ceil(Math.max(...weeks.map(value),0)/step));
 const ticks=[];for(let tick=step;tick<=top;tick+=step)ticks.push(tick);
 const day=week=>`${week.week.slice(8,10)}/${week.week.slice(5,7)}`;
 const bar=(week,peak)=>{
  const share=(value(week)*100/top).toFixed(1),told=`Semaine du ${date(week.week)} : ${n(week.count)} transfert${week.count>1?'s':''}, ${money(week.volume)}`;
  return `<div class="week" title="${e(told)}"><div class="week-plot">${value(week)===peak&&peak?`<b style="bottom:${share}%">${read(peak)}</b>`:''}<i style="height:${share}%"></i></div><span>${day(week)}</span></div>`;
 };
 const span=(list,label)=>list.length?`<div class="activity-window" style="flex-grow:${list.length}"><div class="activity-bars">${list.map(week=>bar(week,Math.max(...list.map(value)))).join('')}</div><small>${label}</small></div>`:'';
 const grid=ticks.map(tick=>`<span style="bottom:${(tick*100/top).toFixed(1)}%"><em>${read(tick)}</em></span>`).join('');
 return `<div class="activity${weeks.length>18?' dense':''}" role="img" aria-label="${measure==='volume'?'Indemnités':'Transferts'} par semaine"><div class="activity-grid" aria-hidden="true">${grid}</div>${span(weeks.filter(week=>week.summer),`Été ${year}`)}${span(weeks.filter(week=>!week.summer),`Hiver ${year+1}`)}</div>`;
}

// Beside the transfers, the season in figures: four totals, the weeks, then what each club and each league spent and
// received, both sorted in the browser. The clubs scroll within their card.
function marketSummary(summary, params, base){
 const measure=params.get('mesure')==='volume'?'volume':'count';
 const tile=(label,value,title='')=>`<div class="stat-card"${title?` title="${e(title)}"`:''}><span class="label">${label}</span><strong>${value}</strong></div>`;
 const tiles=`<div class="stat-grid">${tile('Transferts',n(summary.total))}${tile('Volume',money(summary.volume))}${tile('Médiane',money(summary.median))}${tile('Record',summary.record?money(summary.record.fee):'—',summary.record?.player||'')}</div>`;
 const chart=card('Activité par semaine',summary.weeks.length?activityChart(summary.weeks,summary.season,measure):'',choiceLinks(base,params,'mesure',[['','Nombre'],['volume','Volume']],'Mesure'),'activity-card');
 const headers=first=>[first,'ARR.','DÉP.','ACHATS','VENTES','BALANCE'];
 const figures=(entry,most)=>[figure(n(entry.arrivals)),figure(n(entry.departures)),`<span class="bar-figure">${miniBar(entry.spent/most)}<b>${money(entry.spent)}</b></span>`,figure(money(entry.earned)),figure(signed(entry.earned-entry.spent))];
 const raw=entry=>[entry.arrivals,entry.departures,entry.spent,entry.earned,entry.earned-entry.spent];
 const most=list=>Math.max(1,...list.map(entry=>entry.spent));
 const clubs=card('Clubs',`<div class="summary-table">${sortableTable(headers('CLUB'),summary.clubs.map(entry=>[`<span class="strong">${clubLink(entry.club)}</span>`,...figures(entry,most(summary.clubs))]),summary.clubs.map(entry=>[entry.club.name,...raw(entry)]))}</div>`,'','clubs-summary');
 const league=entry=>entry.id==null?'<span class="muted">Marché extérieur</span>':`<a class="strong" href="#/league/${entry.id}">${e(entry.name)}</a>`;
 const leagues=card('Championnats',`<div class="summary-table">${sortableTable(headers('CHAMPIONNAT'),summary.leagues.map(entry=>[league(entry),...figures(entry,most(summary.leagues))]),summary.leagues.map(entry=>[entry.name??'',...raw(entry)]))}</div>`,'','leagues-summary');
 return tiles+chart+clubs+leagues;
}

export async function worldHistoryScreen(section,params,leagues=[],state={}){
 const type=['transfer','retirement','academy'].includes(section)?section:'transfer',base=`#/transfers/${type}`;
 const wide=wideScreen()&&type==='transfer',rows=fittedRows(`transfers-${type}`,LIST_ABOVE);
 const request=new URLSearchParams(params);request.set('type',type);
 ['sel','mesure'].forEach(key=>request.delete(key));
 if(rows)request.set('taille',rows);
 // The lowest fee is typed in millions of euros; the API filters on full euros.
 if(request.get('montant_min'))request.set('montant_min',String(Math.round(Number(request.get('montant_min'))*1e6)));
 const [data,summary]=await Promise.all([api(`/monde/transferts?${request}`),wide?api(`/monde/transferts/resume?${query({saison:params.get('saison')})}`):null]);
 const counts=data.counts||{};
 const nav=`<nav class="tabs" aria-label="Types de mouvements">${Object.entries(LABELS).map(([key,label])=>`<a class="${key===type?'active':''}" href="#/transfers/${key}?saison=${data.season}">${label}${counts[key]==null?'':` <span class="count">${n(counts[key])}</span>`}</a>`).join('')}</nav>`;
 const heading=`<div class="toolbar"><h1>Mercato mondial</h1>${nav}${seasonStepper(data)}</div>`;
 const divisions=leagues.filter(league=>league.kind==='league').sort((a,b)=>LEAGUE_ORDER.indexOf(a.nation)-LEAGUE_ORDER.indexOf(b.nation)||a.level-b.level).map(league=>[league.id,e(league.name)]);
 // Retirements and promotions only take the search.
 const narrowing=type!=='transfer'?'':choiceLinks(base,params,'fenetre',[['','Saison'],['ete','Été'],['hiver','Hiver']],'Fenêtre')
  +choiceLinks(base,params,'nature',[['','Tous'],['payant','Payants'],['libre','Libres']],'Type')
  +choiceSelect(params,'competition','Championnat',divisions)
  +choiceSelect(params,'poste','Poste',['GB','DC','DG','DD','MDC','MC','MOC','AILG','AILD','BU'].map(role=>[role,role]))
  +rangeMenu(base,params,'Âge',[['age_min','min','min="0" max="100"'],['age_max','max','min="0" max="100"']],{presets:[['≤ 21',{age_max:21}],['≤ 23',{age_max:23}],['24–28',{age_min:24,age_max:28}],['≥ 29',{age_min:29}]]})
  +rangeMenu(base,params,'Montant',[['montant_min','min','min="0" step="any"']],{unit:'M€',hint:'M€',presets:[['≥ 10',{montant_min:10}],['≥ 50',{montant_min:50}],['≥ 100',{montant_min:100}]]})
  +(state.controlled_club_id==null?'':toggleLink(base,params,'club',state.controlled_club_id,'Mon club'));
 const filters=`<form class="toolbar" data-filter>${searchField(params,type==='transfer'?'Joueur ou club…':'Rechercher un joueur…')}${narrowing}${resetButton(params)}</form>`;
 const partial=data.history_since>`${data.season}-07-01`?`<div class="notice">Les motifs de départ et promotions antérieurs au ${date(data.history_since)} peuvent manquer dans cette ancienne sauvegarde.</div>`:'';
 const academy=type==='academy'?playerTable({...data,items:data.items.map(row=>({...row.details,promotion_date:row.date,academy_club:row.target}))},true,data.sort,data.order,{academy:true,pager:false}):null;
 // A transfer also tells who the player is today; the arrow between its two clubs has no heading.
 const columns=type==='transfer'?[['date','DATE'],['position','POSTE'],['name','JOUEUR'],['nation','NAT.'],['age','ÂGE'],['rating','NIV.'],['source','PROVENANCE'],['arrow',''],['target','DESTINATION'],['fee','MONTANT'],['value','VALEUR']]:[['date','DATE'],['name','JOUEUR'],['source','DERNIER CLUB']];
 const headers=columns.map(([key,label])=>label?sortButton(key,label,data.sort,data.order,['position','name','nation','source','target'].includes(key)?'asc':'desc'):'');
 // Fees are drawn against the season's record, or the highest of the page without the summary.
 const record=Math.max(1,summary?.record?.fee||0,...data.items.map(row=>row.fee||0));
 const fee=row=>row.kind==='release'?'<span class="num muted">Fin de contrat</span>':row.kind==='departure_unknown'?'<span class="num muted">Motif non archivé</span>':row.fee?`<span class="bar-figure">${miniBar(row.fee/record)}<b>${money(row.fee)}</b></span>`:'<span class="num muted">Libre</span>';
 const player=row=>`<span class="strong">${playerLink(row.player_id,row.player)}</span>`;
 const rowsHtml=data.items.map(row=>type==='transfer'?[date(row.date),row.position?position(row.position):'—',player(row),row.nationalities?.length?mainNation(row.nationalities):'—',figure(row.age??'—'),levelBadge(row.rating,'Niveau actuel sur 200'),clubLink(row.source),'<span class="move-arrow" aria-hidden="true">→</span>',clubLink(row.target),fee(row),figure(row.value==null?'—':money(row.value))]
  :[date(row.date),player(row),clubLink(type==='academy'?row.target:row.source)]);
 const list=card(`${n(data.total)} ${LABELS[type].toLowerCase()}`,academy??`<div class="movements-table">${table(headers,rowsHtml,undefined,undefined,undefined,columns.map(([key])=>`${key}-column`))}</div>`,headPager(data));
 const side=summary?sidePanel('',marketSummary(summary,params,base)):'';
 return heading+filters+partial+(type==='academy'?'<p class="muted">Informations à la promotion lorsqu’elles sont archivées ; sinon, données actuelles du joueur.</p>':'')
  +`<div class="split${side?' with-side market':''}" data-fit="transfers-${type}" data-rows="${rows??''}">${list}${side}</div>`;
}
