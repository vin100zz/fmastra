import {escape as e,number as n,money,price,date,season,card,empty,fact,table,playerLink,clubLink,position,competitionBadge,competitionLink,editionHref,noteHue,averageNote,pitch} from './ui.js';
import {venueIcon} from './club-overview.js';

// The Historique tab of a club or of a selection (docs/ui.md, « Historique »), in four views chosen at the end of its row of
// tabs: the overview (the league rank of each season or the stage each edition left the selection at, with the reputation or
// the strength over the same columns, beside the honours and the record), the seasons or the editions, the players, the records.
export const CLUB_VIEWS=[['ensemble','Vue d’ensemble'],['saisons','Saisons'],['joueurs','Joueurs'],['records','Records']];
export const NATION_VIEWS=[['ensemble','Vue d’ensemble'],['editions','Éditions'],['joueurs','Joueurs'],['records','Records']];
// The view the address asks for (`vue`), the overview by default.
export const historyView=(views,params)=>views.some(([key])=>key===params.get('vue'))?params.get('vue'):views[0][0];
// The choice of the views, where a tab read by season has its steps; `base` is the tab's address, the overview's own.
export const viewChoice=(views,shown,base)=>`<nav class="segmented views" aria-label="Vues de l’historique">${views.map(([key,label],index)=>
 `<a${key===shown?' class="active" aria-current="page"':''} href="${base}${index?`?vue=${key}`:''}">${e(label)}</a>`).join('')}</nav>`;

// A season in two short years, under the axis of a chart: 2027 reads 27-28.
const short=year=>`${String(year).slice(2)}-${String(year+1).slice(2)}`;
const signed=(value,format=n)=>`${value>0?'+':value<0?'−':''}${format(Math.abs(value))}`;
// A change, signed, in a chip: green up, red down, muted when nothing moved.
const delta=(value,format=n)=>value==null?'':`<span class="delta${value>0?' up':value<0?' down':''}">${signed(value,format)}</span>`;
const STAR='<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 .4 6.4 3.3 9.6 3.7 7.3 5.9 7.8 9.1 5 7.6 2.2 9.1 2.7 5.9.4 3.7 3.6 3.3z"/></svg>';
// A run in a cup, or a selection's finals: the round reached; a semi-final in blue, a final in green, a title on the accent with its star.
export const runChip=run=>run?`<span class="reached${run.winner?' won':run.label==='Finale'?' final':run.label==='Demi-finales'?' semi':''}">${run.winner?STAR:''}${e(run.label)}</span>`:'<span class="muted">—</span>';
const noteBadge=value=>value==null?'—':`<span class="num"><span class="rating graded" style="--hue:${noteHue(value)}">${averageNote(value)}</span></span>`;
// A figure, on the right of its column, as wide as its heading: a long one (MATCHES, SAISONS) widens it.
const num=value=>`<span class="num">${value}</span>`;
const figureCol=heading=>heading.length>4?'figure-col wide':'figure-col';
const ageText=row=>`${row.years} ans${row.months?` ${row.months} mois`:''}`;
const player=row=>playerLink(row.player_id,row.player);
const positionCell=row=>row.position?position(row.position):'—';
const who=row=>`<span class="cell">${positionCell(row)}${player(row)}</span>`;
const difference=row=>signed(row.goals_for-row.goals_against);
const sorted=(rows,values,ascending=[])=>({values:rows.map(values),ascending});

// A history's chart, a column for each season or edition, COL wide at least: a long history scrolls, opened on its latest
// columns, a short one fills its card. The storeys of the ranks or the stages and, under them, the second series share the
// columns; the names of the storeys on the left and of their places or levels on the right stay put.
const COL=44,TOP=20,GAP=24,SECOND=72,AXIS=34;
const at=(index,count,top)=>`left:${((index+.5)/count*100).toFixed(3)}%;top:${top.toFixed(1)}px`;
function timeline({count,height,label,lefts,rights,zones=[],rules=[],paths,discs,ends=[],years,wide=false}){
 const side=(name,items)=>`<div class="cc-side ${name}" style="height:${height}px">${items.map(item=>`<span style="top:${item.top.toFixed(1)}px">${e(item.label)}</span>`).join('')}</div>`;
 return `<div class="cc${wide?' wide':''}">${side('left',lefts)}<div class="cc-scroll"><div class="cc-plot" role="img" aria-label="${e(label)}" style="width:max(100%,${count*COL}px);height:${height}px">`
  +zones.map(zone=>`<i class="cc-zone ${zone.kind}" style="top:${zone.top.toFixed(1)}px;height:${zone.height.toFixed(1)}px"></i>`).join('')
  +rules.map(top=>`<i class="cc-rule" style="top:${top.toFixed(1)}px"></i>`).join('')
  +`<svg class="cc-lines" viewBox="0 0 ${count} ${height}" preserveAspectRatio="none" style="height:${height}px" aria-hidden="true">${paths.filter(path=>path.d).map(path=>`<path class="cc-line${path.kind?` ${path.kind}`:''}" d="${path.d}" vector-effect="non-scaling-stroke"/>`).join('')}</svg>`
  +discs.map(disc=>`<span class="cc-rank${disc.kind?` ${disc.kind}`:''}" style="${at(disc.index,count,disc.top)}" title="${e(disc.title)}">${e(disc.text)}</span>`).join('')
  +ends.map(end=>`<i class="cc-dot second" style="${at(end.index,count,end.top)}"></i><span class="cc-label ${end.side}" style="${at(end.index,count,end.top)}">${e(end.text)}</span>`).join('')
  +years.map(year=>`<span class="cc-year${year.now?' now':''}" style="${at(year.index,count,height-AXIS+12)}">${e(year.text)}</span>`).join('')
  +`</div></div>${side('right',rights)}</div>`;
}
// The second series under the storeys (the reputation, the strength): its line, its value written at both ends.
function secondSeries(values,first,top){
 if(values.length<2)return null;
 const list=values.map(row=>row.value),low=Math.min(...list),high=Math.max(...list),pad=Math.max(.5,(high-low)*.12);
 const y=value=>top+(high+pad-value)/(high-low+2*pad)*SECOND,start=values[0],end=values[values.length-1];
 return {d:values.map((row,index)=>`${index?'L':'M'}${row.season-first+.5} ${y(row.value).toFixed(1)}`).join(''),
  ends:[{index:start.season-first,top:y(start.value),text:n(start.value),side:'first'},{index:end.season-first,top:y(end.value),text:n(end.value),side:'last'}]};
}
// A line through the points that follow each other (`next` tells), dashed towards the one under way.
function lines(points,next,y){
 let solid='',dashed='';
 points.slice(1).forEach((point,index)=>{const before=points[index];if(!next(before,point))return;
  const segment=`M${before.index+.5} ${y(before).toFixed(1)}L${point.index+.5} ${y(point).toFixed(1)}`;if(point.done)solid+=segment;else dashed+=segment;});
 return [{d:solid},{d:dashed,kind:'dashed'}];
}

const ordinal=rank=>`${rank}${rank===1?'er':'e'}`;
// The league rank of each finished season and of the one under way (`standing` in `home`, `today`): a storey for each
// division the club played in (`leagues`, as they stand today), the highest on top, its places at each end; the reputation
// each season opened with under them. A season out of the simulated leagues leaves its column empty and breaks the line.
export function rankChart(items,leagues,{standing=null,today=null,home=null,reputation=[]}={}){
 const shapes=new Map(leagues.map(league=>[league.id,league]));
 const points=items.filter(row=>row.rank!=null&&shapes.has(row.competition_id)).map(row=>({season:row.season,rank:row.rank,league:row.competition_id,done:true})).sort((a,b)=>a.season-b.season);
 if(standing&&today!=null&&shapes.has(home))points.push({season:today,rank:standing.rank,league:home,done:false});
 if(!points.length)return empty('Aucune saison terminée');
 const storeys=leagues.filter(league=>points.some(point=>point.league===league.id)).sort((a,b)=>a.level-b.level);
 const seasons=[...points.map(point=>point.season),...reputation.map(row=>row.season)],first=Math.min(...seasons),count=Math.max(...seasons)-first+1;
 points.forEach(point=>point.index=point.season-first);
 const plot=192+64*(storeys.length-1),tall=(plot-GAP*(storeys.length-1))/storeys.length;
 const floor=new Map(storeys.map((league,index)=>[league.id,{top:TOP+index*(tall+GAP),clubs:Math.max(league.clubs,...points.filter(point=>point.league===league.id).map(point=>point.rank))}]));
 const y=(league,rank)=>floor.get(league).top+(rank-1)/Math.max(1,floor.get(league).clubs-1)*tall;
 const second=secondSeries(reputation,first,TOP+plot+GAP),height=(second?TOP+plot+GAP+SECOND:TOP+plot)+AXIS;
 const zones=[],rights=[];
 const band=(league,from,to,kind,label)=>{if(to<from)return;const top=y(league,from)-6,bottom=y(league,to)+6;zones.push({kind,top,height:bottom-top});rights.push({top:(top+bottom)/2,label});};
 storeys.forEach(league=>{const {clubs}=floor.get(league.id),places=league.europe||league.promotion;
  band(league.id,1,Math.min(places,clubs),league.europe?'europe':'promotion',league.europe?'Europe':'Montée');band(league.id,Math.max(1,clubs-league.relegation+1),clubs,'relegation','Relégation');});
 const rules=storeys.slice(1).map(league=>floor.get(league.id).top-GAP/2).concat(second?[TOP+plot+GAP/2]:[]);
 return timeline({count,height,label:'Classement en championnat par saison',zones,rules,rights,
  lefts:[...storeys.map(league=>({top:floor.get(league.id).top+tall/2,label:league.name})),...(second?[{top:TOP+plot+GAP+SECOND/2,label:'Réputation'}]:[])],
  paths:[...lines(points,(a,b)=>b.season===a.season+1,point=>y(point.league,point.rank)),{d:second?.d,kind:'second'}],
  discs:points.map(point=>({index:point.index,top:y(point.league,point.rank),text:point.rank,kind:point.done?point.rank===1?'title':'':'open',
   title:`${season(point.season)} · ${shapes.get(point.league).name} : ${ordinal(point.rank)}${point.done?'':' (en cours)'}`})),
  ends:second?.ends||[],years:Array.from({length:count},(_,index)=>({index,text:short(first+index),now:first+index===today}))});
}

// The stage each finished edition left a selection at, and the one under way (`current`): the tournaments (Euro, World Cup)
// on one storey, the Nations League on another, each level named on the right, the title on top; the strength each season
// opened with under them.
const LEVELS={tournament:['Vainqueur','Finale','Demies','Quarts','8es','Groupes','Qualifications'],nations:['Vainqueur','Finale','Demies','Division A','Division B','Division C','Division D']};
export function stageChart(items,current,strength=[]){
 const points=[...items.map(row=>({year:row.year,code:row.code,stage:row.stage,name:row.name,done:true})),...(current?[{...current,done:false}]:[])].sort((a,b)=>a.year-b.year);
 if(!points.length)return empty('Aucune édition terminée');
 const kinds=['tournament','nations'].filter(kind=>points.some(point=>(point.code==='LN')===(kind==='nations')));
 const years=[...points.map(point=>point.year),...strength.map(row=>row.season)],first=Math.min(...years),count=Math.max(...years)-first+1;
 points.forEach(point=>{point.index=point.year-first;point.storey=kinds.indexOf(point.code==='LN'?'nations':'tournament');});
 const plot=192+64*(kinds.length-1),tall=(plot-GAP*(kinds.length-1))/kinds.length,step=tall/6,top=storey=>TOP+storey*(tall+GAP);
 const y=point=>top(point.storey)+point.stage.level*step;
 const second=secondSeries(strength,first,TOP+plot+GAP),height=(second?TOP+plot+GAP+SECOND:TOP+plot)+AXIS;
 return timeline({count,height,label:'Parcours de la sélection par édition',wide:true,
  rules:kinds.flatMap((kind,storey)=>LEVELS[kind].map((_,level)=>top(storey)+level*step)),
  rights:kinds.flatMap((kind,storey)=>LEVELS[kind].map((label,level)=>({top:top(storey)+level*step,label}))),
  lefts:[...kinds.map((kind,storey)=>({top:top(storey)+tall/2,label:kind==='nations'?'Ligue des nations':'Tournois'})),...(second?[{top:TOP+plot+GAP+SECOND/2,label:'Force'}]:[])],
  paths:[...kinds.flatMap((_,storey)=>lines(points.filter(point=>point.storey===storey),()=>true,y)),{d:second?.d,kind:'second'}],
  discs:points.map(point=>({index:point.index,top:y(point),text:point.code,kind:`code${point.done?point.stage.level===0?' title':'':' open'}`,title:`${point.name} : ${point.stage.label}${point.done?'':' (en cours)'}`})),
  ends:second?.ends||[],years:Array.from({length:count},(_,index)=>({index,text:String(first+index),now:current?.year===first+index}))});
}

// The titles, a line each: the competition's badge, its title, the seasons or the years it was won in, the count.
function honoursCard(rows,badge,title,when){
 const body=rows.length?`<div class="honour-lines">${rows.map(row=>`<div class="honour-line">${badge(row)}<b>${e(title(row))}</b><small>${when(row)}</small><strong>${n(row.count)}</strong></div>`).join('')}</div>`
  :empty('Aucun titre');
 return card('Palmarès',body,'','honours-card');
}
// The record in each competition, after its badge, then all together; `competition` finds a row's competition.
function recordCard(record,unit,competition){
 if(!record.rows.length)return card('Bilan',empty('Aucun match joué'));
 const line=row=>[row[unit],row.played,row.won,row.drawn,row.lost,row.goals_for,row.goals_against].map(value=>num(n(value))).concat(num(difference(row)));
 return card('Bilan',table(['COMPÉTITION',unit==='seasons'?'SAISONS':'ÉDITIONS','J','V','N','D','BP','BC','DIFF.'],record.rows.map(row=>[`<span class="cell">${competitionLink(competition(row),{badge:true})}</span>`,...line(row)]),
  ['Toutes compétitions',...line(record.total)],undefined,sorted(record.rows,row=>[row.competition,row[unit],row.played,row.won,row.drawn,row.lost,row.goals_for,row.goals_against,row.goals_for-row.goals_against]),
  ['','figure-col wide',...Array(7).fill('figure-col')]),'','history-record');
}

// A list of players ranked on one figure, that figure first after them: `figures` are [heading, raw value, cell].
function leaders(title,rows,figures,none='Aucun joueur'){
 const body=rows.length?table(['#','POSTE','JOUEUR',...figures.map(figure=>figure[0])],rows.map((row,index)=>[index+1,positionCell(row),player(row),...figures.map(figure=>figure[2](row))]),
  undefined,undefined,sorted(rows,(row,index)=>[index+1,row.position||'',row.player||'',...figures.map(figure=>figure[1](row))],[0]),['rank-col','position-col','',...figures.map(figure=>figureCol(figure[0]))])
  :empty(none);
 return card(title,body,'','history-leaders');
}
const MATCHES=['MATCHES',row=>row.matches,row=>num(`<b>${n(row.matches)}</b>`)],GOALS=['BUTS',row=>row.goals,row=>num(`<b>${n(row.goals)}</b>`)],
 NOTE=['NOTE',row=>row.note,row=>noteBadge(row.note)],plain=([heading,value])=>[heading,value,row=>num(n(value(row)))];
// The best eleven of the tactic, on the pitch of the charter, each player's matches under his name.
function elevenCard(data,kit,unit){
 const players=data.eleven.filter(place=>place.player_id).map(place=>({id:place.player_id,name:place.player,position:place.position,matches:place.matches}));
 return card('Onze type',players.length?`<div class="eleven">${pitch(players,'Onze type',{compact:true,kit,marks:row=>e(unit(row.matches))})}</div>`:empty('Aucun joueur'),
  `<span class="card-hint">${e(data.formation)}</span>`,'eleven-card');
}

// A score from the side's point of view, to its match: green won, red lost.
const scoreCell=row=>`<a class="calendar-score ${row.scored>row.conceded?'V':row.scored<row.conceded?'D':'N'}" href="#/match/${row.match_id}">${row.scored} – ${row.conceded}</a>`;
function scoresCard(title,rows,badge){
 const body=rows.length?table(['SCORE','ADVERSAIRE','COMP.','DATE'],rows.map(row=>[scoreCell(row),`<span class="cell">${clubLink(row.opponent)}${venueIcon(row.home,row.neutral)}</span>`,badge(row),date(row.date)]),
  undefined,undefined,sorted(rows,row=>[Math.abs(row.scored-row.conceded),row.opponent?.name||'',row.competition,row.date]),['score-col','','badge-col','date-col'])
  :empty('Aucun match');
 return card(title,body,'','history-scores');
}
const RUNS={wins:'Victoires',unbeaten:'Sans défaite',defeats:'Défaites',winless:'Sans victoire',scoring:'En marquant',scoreless:'Sans marquer',clean_sheets:'Sans encaisser',conceding:'En encaissant'};
function runsCard(runs){
 if(!runs.longest.length)return card('Séries',empty('Aucun match'));
 const going=runs.ongoing.length?`<div class="section-title">En cours</div>${table(['SÉRIE','MATCHES','DEPUIS'],runs.ongoing.map(run=>[RUNS[run.kind],num(`<b>${n(run.count)}</b>`),date(run.first)]),undefined,undefined,
  sorted(runs.ongoing,run=>[RUNS[run.kind],run.count,run.first]),['',figureCol('MATCHES'),'date-col'])}`:'';
 return card('Séries',table(['SÉRIE','MATCHES','DU','AU'],runs.longest.map(run=>[RUNS[run.kind],num(`<b>${n(run.count)}</b>`),date(run.first),date(run.last)]),undefined,undefined,
  sorted(runs.longest,run=>[RUNS[run.kind],run.count,run.first,run.last]),['',figureCol('MATCHES'),'date-col','date-col'])+going,'','history-runs');
}
function opponentsCard(opponents,key){
 const line=(label,found,unit)=>found?fact(label,`${clubLink(found[key])} · ${n(found.count)} ${unit}`):'';
 const lines=line('Le plus affronté',opponents.played,'matches')+line('Le plus souvent battu',opponents.beaten,'victoires')+line('Le plus souvent vainqueur',opponents.beaten_by,'défaites');
 return card('Adversaires',lines?`<div class="card-body">${lines}</div>`:empty('Aucun match'));
}
// The best seasons or editions of the side's players on one figure: the player, the figure, when.
function bestCard(title,rows,figure,when){
 const body=rows.length?table(['#','JOUEUR',figure[0],when[0]],rows.map((row,index)=>[index+1,who(row),figure[2](row),when[2](row)]),undefined,undefined,
  sorted(rows,(row,index)=>[index+1,row.player||'',figure[1](row),when[1](row)],[0]),['rank-col','',figureCol(figure[0]),'when-col'])
  :empty('Aucun joueur');
 return card(title,body,'','history-best');
}
const AGES={youngest:'Plus jeune joueur',oldest:'Plus âgé',youngest_scorer:'Plus jeune buteur',oldest_scorer:'Plus âgé buteur'};
function agesCard(rows,when){
 return card('Âges',rows.length?`<div class="card-body">${rows.map(row=>fact(AGES[row.kind],`${who(row)}<span>${ageText(row)}</span><span class="muted">${when(row)}</span>`)).join('')}</div>`
  :empty('Aucun match'));
}

// A club's competition, by its id; a selection's edition, by its code; and their badges.
const clubCompetition=row=>({id:row.competition_id,name:row.competition});
const editionCompetition=row=>({kind:'international',code:row.code,year:row.year,name:row.competition||row.name});
const clubBadge=row=>competitionBadge(clubCompetition(row));
const editionBadge=row=>competitionBadge(editionCompetition(row));

// A rank against the places of the league it was reached in (`shape`, as the league stands today): the title on the
// accent, Europe in blue, promotion in green, relegation in red.
const rankCell=(row,shape)=>{
 if(row.rank==null)return '—';
 const zone=row.rank===1?'title':!shape?'':row.rank<=shape.europe?'info':row.rank<=shape.promotion?'good':row.rank>shape.clubs-shape.relegation?'bad':'';
 return `<span class="rank${zone?` ${zone}`:''}">${row.rank}</span>`;
};
const standingCells=standing=>standing?[`<b>${n(standing.points)}</b>`,n(standing.played),n(standing.won),n(standing.drawn),n(standing.lost),n(standing.goals_for),n(standing.goals_against),difference(standing)].map(num):Array(8).fill(num('—'));
const standingValues=standing=>standing?[standing.points,standing.played,standing.won,standing.drawn,standing.lost,standing.goals_for,standing.goals_against,standing.goals_for-standing.goals_against]:Array(8).fill('');
const FIGURES=Array(8).fill('figure-col');

function clubSeasons(data){
 const shapes=new Map(data.leagues.map(league=>[league.id,league])),rows=data.items;
 if(!rows.length)return card('Les saisons du club',empty('Aucune saison terminée'));
 return card(`Les saisons du club · ${rows.length}`,table(['SAISON','CHAMPIONNAT','CL.','PTS','J','V','N','D','BP','BC','DIFF.','COUPE NATIONALE','COUPE D’EUROPE','MEILLEUR BUTEUR','BUTS','RÉPUTATION'],
  rows.map(row=>[`<b>${season(row.season)}</b>`,row.competition?`<span class="cell">${competitionLink(clubCompetition(row),{badge:true})}</span>`:'—',rankCell(row,shapes.get(row.competition_id)),...standingCells(row.standing),
   runChip(row.cup),row.europe?`<span class="cell">${competitionBadge({id:row.europe.competition_id,name:row.europe.competition})}${runChip(row.europe)}</span>`:'<span class="muted">—</span>',
   row.scorer?player(row.scorer):'—',num(row.scorer?`<b>${n(row.scorer.goals)}</b>`:'—'),row.reputation?`<span class="with-delta">${n(row.reputation.value)}${delta(row.reputation.change)}</span>`:num('—')]),
  undefined,undefined,sorted(rows,row=>[row.season,row.competition??'',row.rank??'',...standingValues(row.standing),row.cup?.level??'',row.europe?.level??'',row.scorer?.player??'',row.scorer?.goals??'',row.reputation?.value??''],[2]),
  ['season-col','league-col','rank-col',...FIGURES,'cup-col','europe-col','scorer-col','figure-col','reputation-col']),'','history-seasons');
}

const transfersTable=(rows,side,heading)=>rows.length?table(['JOUEUR','INDEMNITÉ',heading,'SAISON'],rows.map(row=>[player(row),num(`<b>${price(row.fee)}</b>`),clubLink(row[side]),season(row.season)]),
 undefined,undefined,sorted(rows,row=>[row.player||'',row.fee,row[side]?.name||'',row.season]),['','fee-col','','season-col']):empty('Aucun transfert payant');
function gainsCard(rows){
 return card('Plus-values',rows.length?table(['JOUEUR','GAIN','ACHAT','VENTE'],rows.map(row=>[player(row),num(delta(row.gain,money)),num(price(row.bought)),num(price(row.sold))]),undefined,undefined,
  sorted(rows,row=>[row.player||'',row.gain,row.bought,row.sold]),['','gain-col','fee-col','fee-col']):empty('Aucune plus-value'),'','history-gains');
}

// The Historique tab of a club: `view` is the one chosen, `data` what the API gives for it, `club` the club today, `today`
// the season under way.
export function clubHistory(view,data,club={},today=null){
 const kit={major:club.major_color,minor:club.minor_color};
 if(view==='saisons')return clubSeasons(data);
 if(view==='joueurs'){
  const seasons=plain(['SAISONS',row=>row.seasons]);
  return `<div class="history-players"><div>${elevenCard(data,kit,count=>`${n(count)} matches`)}${leaders('Formés au club',data.academy,[MATCHES,plain(['BUTS',row=>row.goals]),seasons],'Aucun jeune promu n’a joué')}</div>`
   +`<div>${leaders('Plus de matches',data.matches,[MATCHES,plain(['BUTS',row=>row.goals]),seasons])}${card('Plus grosses arrivées',transfersTable(data.transfers.arrivals,'source','DE'),'','history-transfers')}</div>`
   +`<div>${leaders('Plus de buts',data.goals,[GOALS,plain(['MATCHES',row=>row.matches]),seasons])}${card('Plus grosses ventes',transfersTable(data.transfers.departures,'target','VERS'),'','history-transfers')}</div>`
   +`<div>${leaders('Meilleures notes',data.notes,[NOTE,plain(['MATCHES',row=>row.matches]),seasons])}${gainsCard(data.transfers.gains)}</div></div>`;
 }
 if(view==='records'){
  const when=['SAISON',row=>row.season,row=>season(row.season)],best=data.best;
  return `<div class="history-records"><div>${scoresCard('Plus larges victoires',data.wins,clubBadge)}${scoresCard('Plus lourdes défaites',data.defeats,clubBadge)}${agesCard(data.ages,row=>season(row.season))}</div>`
   +`<div>${runsCard(data.runs)}${opponentsCard(data.opponents,'club')}</div>`
   +`<div>${bestCard('Buts sur une saison',best.goals,GOALS,when)}${bestCard('Passes sur une saison',best.assists,['PASSES',row=>row.assists,row=>num(`<b>${n(row.assists)}</b>`)],when)}${bestCard('Note sur une saison',best.notes,NOTE,when)}</div></div>`;
 }
 const chart=rankChart(data.items,data.leagues,{standing:club.standing,today,home:club.competition_id,reputation:data.reputation});
 return `<div class="history-overview">${card('Classement et réputation',`<div class="cc-body">${chart}</div>`,'','history-chart')}<div>`
  +`${honoursCard(data.honours,clubBadge,row=>row.kind==='league'?`Champion de ${row.competition}`:row.competition,row=>row.seasons.map(season).join(' · '))}${recordCard(data.record,'seasons',clubCompetition)}</div></div>`;
}

const firstPhase=label=>label?`<span${/Relégué/.test(label)?' class="bad"':/Promu/.test(label)?' class="good"':''}>${e(label)}</span>`:'—';
function nationEditions(data){
 const rows=data.items;
 if(!rows.length)return card('Les éditions',empty('Aucune édition terminée'));
 return card(`Les éditions · ${rows.length}`,table(['ÉDITION','PREMIÈRE PHASE','PHASE FINALE','J','V','N','D','BP','BC','DIFF.','MEILLEUR BUTEUR','BUTS','FORCE'],
  rows.map(row=>[`<span class="cell">${editionBadge(row)}<a class="strong" href="${editionHref(row.code,row.year,'finals')}">${e(row.name)}</a></span>`,firstPhase(row.first_phase),row.finals?runChip(row.finals):'<span class="muted">—</span>',
   ...standingCells({...row.record,points:0}).slice(1),row.scorer?player(row.scorer):'—',num(row.scorer?`<b>${n(row.scorer.goals)}</b>`:'—'),
   row.strength?`<span class="with-delta">${n(row.strength.value)}${delta(row.strength.change)}</span>`:num('—')]),
  undefined,undefined,sorted(rows,row=>[row.year,row.first_phase??'',row.stage.level,...standingValues({...row.record,points:0}).slice(1),row.scorer?.player??'',row.scorer?.goals??'',row.strength?.value??''],[2]),
  ['edition-col','phase-col','cup-col',...FIGURES.slice(1),'scorer-col','figure-col','reputation-col']),'','history-editions');
}

// The Historique tab of a selection, a club's: `nation` is the selection today, its kit drawing the best eleven.
export function nationHistory(view,data,nation={}){
 if(view==='editions')return nationEditions(data);
 if(view==='joueurs'){
  const editions=plain(['ÉDITIONS',row=>row.editions]),caps=['SÉL.',row=>row.matches,row=>num(`<b>${n(row.matches)}</b>`)];
  return `<div class="history-players"><div>${elevenCard(data,{major:nation.major_color,minor:nation.minor_color},count=>`${n(count)} sél.`)}</div>`
   +`<div>${leaders('Plus de sélections',data.matches,[caps,plain(['BUTS',row=>row.goals]),editions])}</div><div>${leaders('Plus de buts',data.goals,[GOALS,plain(['SÉL.',row=>row.matches]),editions])}</div>`
   +`<div>${leaders('Meilleures notes',data.notes,[NOTE,plain(['SÉL.',row=>row.matches]),editions])}</div></div>`;
 }
 if(view==='records'){
  const when=['ÉDITION',row=>row.year,row=>`<span class="cell">${editionBadge(row)}${row.year}</span>`],best=data.best;
  return `<div class="history-records"><div>${scoresCard('Plus larges victoires',data.wins,editionBadge)}${scoresCard('Plus lourdes défaites',data.defeats,editionBadge)}${agesCard(data.ages,row=>row.year?`${editionBadge(row)} ${row.year}`:'—')}</div>`
   +`<div>${runsCard(data.runs)}${opponentsCard(data.opponents,'nation')}</div>`
   +`<div>${bestCard('Buts sur une édition',best.goals,GOALS,when)}${bestCard('Passes sur une édition',best.assists,['PASSES',row=>row.assists,row=>num(`<b>${n(row.assists)}</b>`)],when)}${bestCard('Note sur une édition',best.notes,NOTE,when)}</div></div>`;
 }
 return `<div class="history-overview">${card('Parcours et force',`<div class="cc-body">${stageChart(data.items,data.current,data.strength)}</div>`,'','history-chart')}<div>`
  +`${honoursCard(data.honours,editionBadge,row=>row.competition,row=>row.years.join(' · '))}${recordCard(data.record,'editions',editionCompetition)}</div></div>`;
}
