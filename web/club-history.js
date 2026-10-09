import {escape as e,date,season,playerLink,clubLink,card,sortableTable,pager,empty,money,number,position,initials,safeColor,contrastText} from './ui.js';
import {competitionBadge} from './club-calendar.js';

const signedMoney=value=>value>0?`+${money(value)}`:value<0?`−${money(-value)}`:money(0);
const shortDay=value=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit'}).format(new Date(`${value}T12:00:00`));
// A season in two short years: 2027 reads 27-28.
const shortSeason=value=>`${String(value).slice(2)}-${String(value+1).slice(2)}`;
// A small crest of a club: its logo, or its initials on its colours.
const miniCrest=club=>{
 if(!club)return '<span class="crest mini-crest"></span>';
 const major=safeColor(club.major_color),minor=safeColor(club.minor_color)||major;
 return `<span class="crest mini-crest"${major?` style="background:linear-gradient(155deg,${major} 55%,${minor} 55%);color:${contrastText(major)}"`:''}>${initials(club.name)}<img class="crest-logo" src="/crests/TCM1_${club.id}.png" alt="" loading="lazy" onerror="this.remove()"></span>`;
};

// Each kind of movement: its badge, and the group of the filter it falls in.
const KINDS={transfer:['Transfert','transfer'],loan:['Prêt','loan'],academy:['Jeune promu','academy'],release:['Fin de contrat','other'],retirement:['Retraite','other'],departure_unknown:['Départ','other']};
const FILTERS={transfer:'Transferts',loan:'Prêts',academy:'Jeunes promus',other:'Autres'};

function movementRow(row,incoming){
 const [label]=KINDS[row.kind]||['Mouvement'];
 const other=incoming?row.source:row.target;
 const club=row.kind==='academy'?'<span class="muted">Centre de formation</span>':row.kind==='retirement'?'<span class="muted">—</span>':other?clubLink(other):'<span class="muted">Libre</span>';
 const fee=row.kind==='transfer'?(row.fee?money(row.fee):'Libre'):'—';
 return `<div class="movement-row"><span class="movement-date">${shortDay(row.date)}</span><span class="movement-kind ${row.kind}">${label}</span>${row.position?position(row.position):'<span class="position">—</span>'}`
  +`<span class="movement-player">${playerLink(row.player_id,row.player)}</span><span class="movement-age">${row.age==null?'<span title="Âge non archivé">—</span>':`${row.age} ans`}</span><span class="movement-club">${club}</span><b class="movement-fee">${fee}</b></div>`;
}

// One side of a season's movements: every kind of them in date order, with buttons keeping one kind (`param` in the address).
function movementSide(title,rows,total,incoming,param,picked){
 const groups=Object.keys(FILTERS).filter(key=>rows.some(row=>(KINDS[row.kind]||[])[1]===key));
 const shown=picked&&groups.includes(picked)?picked:null;
 const chip=(value,label,count)=>`<button type="button" data-param="${param}" data-param-value="${value??''}" aria-pressed="${(value??null)===shown}" class="${(value??null)===shown?'active':''}">${label} <span class="count">${count}</span></button>`;
 const chips=groups.length>1?`<div class="movement-filters" role="group" aria-label="Genre de mouvement">${chip(null,'Tous',rows.length)}${groups.map(key=>chip(key,FILTERS[key],rows.filter(row=>KINDS[row.kind][1]===key).length)).join('')}</div>`:'';
 const kept=rows.filter(row=>shown==null||KINDS[row.kind][1]===shown).sort((a,b)=>a.date.localeCompare(b.date)||a.player_id-b.player_id);
 return `<section class="card movement-card" aria-label="${title}"><div class="card-head"><h2>${title} · ${rows.length}</h2>${chips}<strong class="movement-total">${money(total)}</strong></div>`
  +(kept.length?`<div class="movement-rows">${kept.map(row=>movementRow(row,incoming)).join('')}</div>`:empty('Aucun mouvement enregistré pour cette saison.','Rien à signaler'))+'</section>';
}

// The biggest fee of a side of the season, with the other club's crest.
function recordTile(title,row,incoming){
 if(!row)return '';
 const other=incoming?row.source:row.target;
 return `<div class="card movement-record">${miniCrest(other)}<div><span>${title}</span><p>${playerLink(row.player_id,row.player)} <small>${incoming?'←':'→'} ${e(other?.name||'Libre')}</small></p></div><strong>${money(row.fee)}</strong></div>`;
}

// The Transferts tab: the season's spending and takings, its biggest sale and signing, then its arrivals and its departures,
// every kind together and dated, each side able to keep one kind. The season is stepped through from the row of tabs.
export function movementsHistory(data,params=new URLSearchParams()){
 const groups=data.sections;
 const partial=data.history_since>`${data.season}-07-01`?`<div class="notice">Les archives de fins de contrat, retraites et promotions antérieures au ${date(data.history_since)} peuvent être incomplètes dans cette ancienne partie.</div>`:'';
 const spent=data.arrival_total??groups.arrivals.reduce((sum,row)=>sum+(row.fee||0),0),earned=data.departure_total??groups.departures.reduce((sum,row)=>sum+(row.fee||0),0);
 const top=rows=>rows.filter(row=>row.fee>0).sort((a,b)=>b.fee-a.fee)[0];
 const summary=`<div class="movement-summary"><div class="card movement-balance"><div><span>Dépenses</span><strong>${money(spent)}</strong></div><div><span>Recettes</span><strong>${money(earned)}</strong></div>`
  +`<div><span>Balance</span><strong class="${earned-spent>0?'good':earned-spent<0?'bad':''}">${signedMoney(earned-spent)}</strong></div></div>${recordTile('Plus grosse vente',top(groups.departures),false)}${recordTile('Plus grosse recrue',top(groups.arrivals),true)}</div>`;
 const arrivals=[...groups.arrivals,...(groups.loans_in||[]),...groups.academy];
 const departures=[...groups.departures,...(groups.loans_out||[]),...groups.release,...groups.retirement,...groups.departure_unknown];
 return partial+summary+`<div class="transfer-columns">${movementSide('Arrivées',arrivals,spent,true,'arrivees',params.get('arrivees'))}${movementSide('Départs',departures,earned,false,'departs',params.get('departs'))}</div>`;
}

// A run in a cup is its furthest round, or the title; `level` (empty without a run) orders the column.
const cupRun=run=>run?`<span class="run-chip${run.winner?' won':''}">${run.winner?'✦ ':''}${e(run.label)}</span>`:'—';
// Reputation when the season opened, with its move from the season before.
const signed=value=>`${value>0?'+':value<0?'−':''}${number(Math.abs(value))}`;
const reputationRun=held=>held?`${number(held.value)}${held.change==null?'':` <span class="${held.change<0?'bad':held.change>0?'good':'muted'}">${signed(held.change)}</span>`}`:'—';
const europeRun=run=>run?`<span class="run-europe">${competitionBadge({kind:'europe',code:run.code,name:run.competition})}<span class="run-chip${run.winner?' won':''}">${run.winner?'✦ ':''}${e(run.label)}</span></span>`:'—';
const ordinal=rank=>`${rank}${rank===1?'er':'e'}`;
// A rank against the places of the league it was reached in (`shape`, as the league stands today).
const rankChip=(row,shape)=>{
 if(row.rank==null)return '—';
 const zone=row.rank===1?'first':!shape?'':row.rank<=shape.europe?'europe':row.rank<=shape.promotion?'promotion':row.rank>shape.clubs-shape.relegation?'relegation':'';
 return `<span class="rank-chip${zone?` ${zone}`:''}">${ordinal(row.rank)}</span>`;
};

// The league rank of each finished season, the one under way dashed after them: a storey for each division the club has
// played in (`leagues`, as they stand today), the highest on top, with its places at each end. A season out of the simulated
// leagues leaves its place empty and breaks the line. `home` is the league of the season under way.
function rankChart(rows,leagues,standing,current,home){
 const shapes=new Map(leagues.map(league=>[league.id,league]));
 const points=rows.filter(row=>row.rank!=null&&shapes.has(row.competition_id)).map(row=>({season:row.season,rank:row.rank,league:row.competition_id,done:true})).sort((a,b)=>a.season-b.season);
 if(standing&&shapes.has(home))points.push({season:current,rank:standing.rank,league:home,done:false});
 if(!points.length)return empty('Aucune saison de championnat terminée pour l’instant.','La première saison se joue');
 const storeys=leagues.filter(league=>points.some(point=>point.league===league.id)).sort((a,b)=>a.level-b.level);
 // One division fills the chart; each other one adds to its height, a gap setting two storeys apart.
 const W=1000,LEFT=112,RIGHT=900,TOP=24,GAP=24,plot=192+64*(storeys.length-1),tall=(plot-GAP*(storeys.length-1))/storeys.length;
 const floor=new Map(storeys.map((league,index)=>[league.id,{top:TOP+index*(tall+GAP),clubs:Math.max(league.clubs,...points.filter(point=>point.league===league.id).map(point=>point.rank))}]));
 const first=points[0].season,last=points[points.length-1].season;
 const x=year=>last>first?LEFT+(year-first)*(RIGHT-LEFT)/(last-first):(LEFT+RIGHT)/2;
 const y=(league,rank)=>floor.get(league).top+(rank-1)/Math.max(1,floor.get(league).clubs-1)*tall;
 const at=point=>`${x(point.season).toFixed(1)},${y(point.league,point.rank).toFixed(1)}`;
 const band=(league,from,to,kind,label)=>to<from?'':`<rect class="rank-zone ${kind}" x="${LEFT}" y="${(y(league,from)-6).toFixed(1)}" width="${RIGHT-LEFT}" height="${(y(league,to)-y(league,from)+12).toFixed(1)}"/><text class="rank-zone-label" x="${RIGHT+12}" y="${((y(league,from)+y(league,to))/2+4).toFixed(1)}">${label}</text>`;
 const frame=storeys.map((league,index)=>{
  const {top,clubs}=floor.get(league.id),places=league.europe||league.promotion;
  return (index?`<line class="cc-grid" x1="${LEFT}" x2="${RIGHT}" y1="${(top-GAP/2).toFixed(1)}" y2="${(top-GAP/2).toFixed(1)}"/>`:'')
   +band(league.id,1,Math.min(places,clubs),league.europe?'europe':'promotion',league.europe?'Europe':'Montée')+band(league.id,Math.max(1,clubs-league.relegation+1),clubs,'relegation','Relégation')
   +`<text class="cc-tick" x="${LEFT-12}" y="${(top+tall/2+4).toFixed(1)}" text-anchor="end">${e(league.name)}</text>`;
 }).join('');
 // A line joins two seasons that follow each other; the one to the season under way is dashed.
 const lines=points.slice(1).map((point,index)=>point.season!==points[index].season+1?'':`<polyline class="cc-line${point.done?'':' dashed'}" points="${at(points[index])} ${at(point)}"/>`).join('');
 const years=Array.from({length:last-first+1},(_,index)=>first+index);
 const ticks=years.map(year=>`<text class="cc-tick" x="${x(year).toFixed(1)}" y="${TOP+plot+28}" text-anchor="middle">${years.length>4?shortSeason(year):season(year)}${standing&&year===current?' · en cours':''}</text>`).join('');
 const marks=points.map(point=>`<circle class="cc-point${point.done?'':' open'}" cx="${x(point.season).toFixed(1)}" cy="${y(point.league,point.rank).toFixed(1)}" r="6"><title>${season(point.season)} · ${e(shapes.get(point.league).name)} : ${ordinal(point.rank)}${point.done?'':' (en cours)'}</title></circle>`
  +`<text class="cc-value" x="${x(point.season).toFixed(1)}" y="${(y(point.league,point.rank)+(point.rank<=2?24:-12)).toFixed(1)}" text-anchor="middle">${ordinal(point.rank)}</text>`).join('');
 return `<svg class="club-chart" viewBox="0 0 ${W} ${TOP+plot+38}" role="img" aria-label="Classement en championnat par saison">${frame}${ticks}${lines}${marks}</svg>`;
}

// The reputation each season opened with, then today's.
function reputationChart(rows,current,currentSeason){
 const points=[...rows].filter(row=>row.reputation).sort((a,b)=>a.season-b.season).map(row=>({season:row.season,value:row.reputation.value}));
 if(current!=null&&!points.some(point=>point.season===currentSeason))points.push({season:currentSeason,value:current});
 if(points.length<2)return '';
 const values=points.map(point=>point.value),low=Math.min(...values),high=Math.max(...values),pad=Math.max(1,(high-low)*.15);
 const W=540,LEFT=44,RIGHT=524,TOP=18,BOTTOM=104,x=index=>LEFT+index*(RIGHT-LEFT)/(points.length-1),y=value=>BOTTOM-(value-(low-pad))/(high-low+2*pad)*(BOTTOM-TOP);
 const last=points[points.length-1];
 return `<svg class="club-chart" viewBox="0 0 ${W} 128" role="img" aria-label="Réputation à l’ouverture de chaque saison"><line class="cc-grid" x1="${LEFT}" x2="${RIGHT}" y1="${BOTTOM}" y2="${BOTTOM}"/>`
  +`<text class="cc-tick" x="${LEFT-6}" y="${(y(high)+4).toFixed(1)}" text-anchor="end">${number(high)}</text><text class="cc-tick" x="${LEFT-6}" y="${(y(low)+4).toFixed(1)}" text-anchor="end">${number(low)}</text>`
  +`<polyline class="cc-line" points="${points.map((point,index)=>`${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')}"/>`
  +points.map((point,index)=>`<circle class="cc-dot" cx="${x(index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="4"><title>${season(point.season)} : ${number(point.value)}</title></circle><text class="cc-tick" x="${x(index).toFixed(1)}" y="122" text-anchor="middle">${shortSeason(point.season)}</text>`).join('')
  +`<text class="cc-value" x="${(x(points.length-1)-8).toFixed(1)}" y="${(y(last.value)-10).toFixed(1)}" text-anchor="end">${number(last.value)}</text></svg>`;
}

// What the club has won, a league title a row for each division, and the best it has done.
function honoursCard(honours){
 const row=(icon,title,detail,value)=>`<li>${icon}<div><b>${title}</b>${detail?`<small>${detail}</small>`:''}</div><strong>${value}</strong></li>`;
 const trophy='<span class="honour-icon trophy" aria-hidden="true">✦</span>';
 const titles=[...(honours.league||[]).map(entry=>row(trophy,`Champion de ${e(entry.competition)}`,'',`×${entry.count}`)),...(honours.cup?[row(trophy,'Coupe nationale','',`×${honours.cup}`)]:[]),
  ...honours.europe.map(entry=>row(trophy,e(entry.competition),'',`×${entry.count}`))];
 const best=[...(honours.best_rank?[row('<span class="honour-icon">▲</span>','Meilleur classement',`${e(honours.best_rank.competition||'')} ${season(honours.best_rank.season)}`,`${honours.best_rank.rank}${honours.best_rank.rank===1?'er':'e'}`)]:[]),
  ...(honours.best_europe?[row(competitionBadge({kind:'europe',code:honours.best_europe.code,name:honours.best_europe.competition}),'Meilleur parcours européen',`${e(honours.best_europe.competition)} ${season(honours.best_europe.season)}`,`<span class="honour-text">${e(honours.best_europe.label)}</span>`)]:[])];
 const rows=[...titles,...best];
 return card('Palmarès',rows.length?`<ul class="honours-list">${rows.join('')}</ul>`:empty('Aucun titre pour l’instant.','Palmarès vierge'),'','honours-card');
}

// Players ranked on one figure, as bars against the first of them.
function leaderBars(title,rows,key,unit){
 const top=rows[0]?.[key]||1;
 const body=rows.length?`<ol class="leader-bars">${rows.map(row=>`<li><span>${playerLink(row.player_id,row.player)}</span><i style="width:${Math.round(100*row[key]/top)}%"></i><b>${number(row[key])}</b></li>`).join('')}</ol>`:empty('Aucun joueur pour l’instant.','Pas encore de statistiques');
 return card(title,body,`<span class="card-hint">${unit}</span>`,`leaders-card ${key}`);
}

function biggestCard(transfers){
 const list=(title,rows,incoming)=>`<h3>${title}</h3>${rows.length?`<ul class="biggest-transfers">${rows.map(row=>{const other=incoming?row.source:row.target;
  return `<li><span>${playerLink(row.player_id,row.player)} <small>${incoming?'←':'→'} ${e(other?.name||'Libre')}</small></span><small>${row.season==null?'':shortSeason(row.season)}</small><b>${money(row.fee)}</b></li>`;}).join('')}</ul>`:'<p class="muted">Aucun transfert payant enregistré.</p>'}`;
 return card('Plus gros transferts',`<div class="card-body">${list('Arrivées',transfers.arrivals,true)}${list('Départs',transfers.departures,false)}</div>`,'','biggest-card');
}

// The Historique tab: the league rank of each season and the reputation it opened with as charts, what the club has won, its
// seasons in a table, then its most used players, its best scorers and its biggest transfers. `club` is its detail today, `today`
// the season under way, whose standing and reputation close the charts.
export function seasonsHistory(data,club={},today=null){
 const leagues=data.leagues||[];
 const seasons=card('Les saisons du club',data.items.length?sortableTable(['SAISON','CHAMPIONNAT','CLASSEMENT','RÉPUTATION','COUPE NATIONALE','COUPE D’EUROPE','PALMARÈS'],data.items.map(row=>[
  `<b>${season(row.season)}</b>`,e(row.competition??'—'),rankChip(row,leagues.find(league=>league.id===row.competition_id)),reputationRun(row.reputation),cupRun(row.cup),europeRun(row.europe),row.champion?'<span class="run-chip won">✦ Champion</span>':'—',
 ]),data.items.map(row=>[row.season,row.competition??'',row.rank??'',row.reputation?.value??'',row.cup?.level??'',row.europe?.level??'',row.champion?1:0]),{ascending:[2]})+(data.total>data.page_size?pager(data):''):empty('La première saison du club est en cours.','Pas encore de saison terminée'),'','seasons-card');
 const reputation=today==null?'':reputationChart(data.items,club.reputation,today);
 const charts=`<div class="history-row">${card('Classement en championnat',`<div class="cc-body">${rankChart(data.items,leagues,today==null?null:club.standing,today,club.competition_id)}</div>`,'','cc-card')}`
  +`<div class="history-side">${honoursCard(data.honours||{league:[],cup:0,europe:[]})}${reputation?card('Réputation',`<div class="cc-body">${reputation}</div>`,'<span class="card-hint">à l’ouverture de la saison</span>','reputation-card'):''}</div></div>`;
 const {leaders,transfers}=data;
 return charts+seasons+`<div class="history-leaders">${leaderBars('Plus utilisés',leaders.matches,'matches','matches')}${leaderBars('Meilleurs buteurs',leaders.goals,'goals','buts')}${biggestCard(transfers)}</div>`;
}
