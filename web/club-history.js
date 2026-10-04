import {escape as e,date,season,playerLink,clubLink,card,sortableTable,pager,empty,money,number,position,initials,safeColor,contrastText} from './ui.js';
import {competitionBadge} from './club-calendar.js';

// The season shown and the arrows to the ones before and after it; `compact` fits the head of a card.
export function seasonNavigation(data,compact=false){
 const button=(value,label,name)=>`<button type="button" data-season="${value??''}" ${value===null?'disabled':''}${name?` aria-label="${name}"`:''}>${label}</button>`;
 if(compact)return `<nav class="season-steps" aria-label="Navigation entre les saisons">${button(data.previous_season,'‹','Saison précédente')}<strong>${season(data.season)}</strong>${button(data.next_season,'›','Saison suivante')}</nav>`;
 return `<nav class="season-navigation" aria-label="Navigation entre les saisons">${button(data.previous_season,'← Précédent')}<strong>Saison ${season(data.season)}</strong>${button(data.next_season,'Suivant →')}</nav>`;
}

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
// every kind together and dated, each side able to keep one kind.
export function movementsHistory(data,params=new URLSearchParams()){
 const groups=data.sections;
 const partial=data.history_since>`${data.season}-07-01`?`<div class="notice">Les archives de fins de contrat, retraites et promotions antérieures au ${date(data.history_since)} peuvent être incomplètes dans cette ancienne partie.</div>`:'';
 const spent=data.arrival_total??groups.arrivals.reduce((sum,row)=>sum+(row.fee||0),0),earned=data.departure_total??groups.departures.reduce((sum,row)=>sum+(row.fee||0),0);
 const top=rows=>rows.filter(row=>row.fee>0).sort((a,b)=>b.fee-a.fee)[0];
 const summary=`<div class="movement-summary"><div class="card movement-balance">${seasonNavigation(data,true)}<div><span>Dépenses</span><strong>${money(spent)}</strong></div><div><span>Recettes</span><strong>${money(earned)}</strong></div>`
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
const rankChip=(row,shape)=>{
 if(row.rank==null)return '—';
 const zone=row.rank===1?'first':shape&&row.rank<=shape.europe?'europe':shape&&row.rank>shape.clubs-shape.relegation?'relegation':'';
 return `<span class="rank-chip${zone?` ${zone}`:''}">${row.rank}${row.rank===1?'er':'e'}</span>`;
};

// The league rank of each finished season, the one under way dashed after them, against the places of the club's league today.
function rankChart(rows,shape,standing,current){
 const points=[...rows].filter(row=>row.rank!=null).sort((a,b)=>a.season-b.season).map(row=>({season:row.season,rank:row.rank,done:true}));
 if(standing)points.push({season:current,rank:standing.rank,done:false});
 if(!points.length)return empty('Aucune saison de championnat terminée pour l’instant.','La première saison se joue');
 const clubs=Math.max(shape?.clubs||0,...points.map(point=>point.rank));
 const W=1000,LEFT=48,RIGHT=900,TOP=24,BOTTOM=216,step=points.length>1?(RIGHT-LEFT)/(points.length-1):0;
 const x=index=>points.length>1?LEFT+index*step:(LEFT+RIGHT)/2,y=rank=>TOP+(rank-1)/Math.max(1,clubs-1)*(BOTTOM-TOP);
 const band=(from,to,kind,label)=>to<from?'':`<rect class="rank-zone ${kind}" x="${LEFT}" y="${(y(from)-6).toFixed(1)}" width="${RIGHT-LEFT}" height="${(y(to)-y(from)+12).toFixed(1)}"/><text class="rank-zone-label ${kind}" x="${RIGHT+12}" y="${(y(from)+(y(to)-y(from))/2+4).toFixed(1)}">${label}</text>`;
 const zones=shape?band(1,Math.min(shape.europe,clubs),'europe',shape.level===1?'Europe':'Montée')+band(Math.max(1,clubs-shape.relegation+1),clubs,'relegation','Relégation'):'';
 const done=points.filter(point=>point.done),path=done.map((point,index)=>`${x(index).toFixed(1)},${y(point.rank).toFixed(1)}`).join(' ');
 const dashed=standing&&done.length?`<line class="cc-line dashed" x1="${x(done.length-1).toFixed(1)}" y1="${y(done[done.length-1].rank).toFixed(1)}" x2="${x(points.length-1).toFixed(1)}" y2="${y(standing.rank).toFixed(1)}"/>`:'';
 const marks=points.map((point,index)=>`<circle class="cc-point${point.done?'':' open'}" cx="${x(index).toFixed(1)}" cy="${y(point.rank).toFixed(1)}" r="6"><title>${season(point.season)} : ${point.rank}${point.rank===1?'er':'e'}${point.done?'':' (en cours)'}</title></circle>`
  +`<text class="cc-value" x="${x(index).toFixed(1)}" y="${(y(point.rank)+(point.rank<=2?24:-12)).toFixed(1)}" text-anchor="middle">${point.rank}${point.rank===1?'er':'e'}</text>`
  +`<text class="cc-tick" x="${x(index).toFixed(1)}" y="244" text-anchor="middle">${points.length>4?shortSeason(point.season):season(point.season)}${point.done?'':' · en cours'}</text>`).join('');
 const ticks=[1,clubs].map(rank=>`<text class="cc-tick" x="${LEFT-12}" y="${(y(rank)+4).toFixed(1)}" text-anchor="end">${rank}</text>`).join('');
 return `<svg class="club-chart" viewBox="0 0 ${W} 254" role="img" aria-label="Classement en championnat par saison">${zones}${ticks}${done.length>1?`<polyline class="cc-line" points="${path}"/>`:''}${dashed}${marks}</svg>`;
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

// What the club has won and the best it has done.
function honoursCard(honours){
 const row=(icon,title,detail,value)=>`<li>${icon}<div><b>${title}</b>${detail?`<small>${detail}</small>`:''}</div><strong>${value}</strong></li>`;
 const trophy='<span class="honour-icon trophy" aria-hidden="true">✦</span>';
 const titles=[...(honours.league?[row(trophy,'Champion','',`×${honours.league}`)]:[]),...(honours.cup?[row(trophy,'Coupe nationale','',`×${honours.cup}`)]:[]),
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
 const shape=data.league;
 const seasons=card('Les saisons du club',data.items.length?sortableTable(['SAISON','CHAMPIONNAT','CLASSEMENT','RÉPUTATION','COUPE NATIONALE','COUPE D’EUROPE','PALMARÈS'],data.items.map(row=>[
  `<b>${season(row.season)}</b>`,e(row.competition??'—'),rankChip(row,row.competition_id===club.competition_id?shape:null),reputationRun(row.reputation),cupRun(row.cup),europeRun(row.europe),row.champion?'<span class="run-chip won">✦ Champion</span>':'—',
 ]),data.items.map(row=>[row.season,row.competition??'',row.rank??'',row.reputation?.value??'',row.cup?.level??'',row.europe?.level??'',row.champion?1:0]),{ascending:[2]})+(data.total>data.page_size?pager(data):''):empty('La première saison du club est en cours.','Pas encore de saison terminée'),'','seasons-card');
 const reputation=today==null?'':reputationChart(data.items,club.reputation,today);
 const charts=`<div class="history-row">${card(`Classement${club.competition?` en ${club.competition}`:''}`,`<div class="cc-body">${rankChart(data.items,shape,today==null?null:club.standing,today)}</div>`,'','cc-card')}`
  +`<div class="history-side">${honoursCard(data.honours||{league:0,cup:0,europe:[]})}${reputation?card('Réputation',`<div class="cc-body">${reputation}</div>`,'<span class="card-hint">à l’ouverture de la saison</span>','reputation-card'):''}</div></div>`;
 const {leaders,transfers}=data;
 return charts+seasons+`<div class="history-leaders">${leaderBars('Plus utilisés',leaders.matches,'matches','matches')}${leaderBars('Meilleurs buteurs',leaders.goals,'goals','buts')}${biggestCard(transfers)}</div>`;
}
