import {escape as e,surname,empty,clubLink,season,competitionBadge} from './ui.js';
import {awayIcon,outcomeLabels} from './club-overview.js';

// The badge of a competition and its two characters are the same on every screen (ui.js).
export {competitionCode,competitionBadge} from './ui.js';

const day=value=>new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00`));
// A round as short as it reads: J12 for a league round, the round of a cup as it is named.
const roundShort=label=>String(label||'').replace(/^Journée (\d+)$/,'J$1').replace(/ de finale$/,'');
// One side's scorers by surname, each with the minutes of his goals: "Ivanović 8’ 64’ · Aouad 89’".
const scorerList=side=>(side||[]).map(scorer=>`${scorer.id<0?e(surname(scorer.name)):`<a href="#/player/${scorer.id}" title="${e(scorer.name)}">${e(surname(scorer.name))}</a>`} ${scorer.minutes.map(minute=>`${e(minute)}’`).join(' ')}`).join(' · ');

// `written` writes the day and `round` the round, as a club's season reads them unless told otherwise. A selection's match
// on neutral ground is not an away game.
function calendarRow(match,club,competitions,next,{written=day,round=roundShort}={}){
 const home=match.home.id===club.id,opponent=home?match.away:match.home,competition=competitions.get(match.competition_id)||{name:match.competition,kind:'league'};
 const neutral=match.international&&match.neutral;
 // The score reads from the club's side, its goals first; a shoot-out is told beside the opponent.
 const score=match.score?(home?match.score:[...match.score].reverse()).join('–'):'—';
 const shootout=match.penalties?`t.a.b. ${(home?match.penalties:[...match.penalties].reverse()).join('–')}`:'';
 const [ours,theirs]=match.scorers?(home?match.scorers:[...match.scorers].reverse()):[[],[]];
 const detail=`${match.competition} · ${match.round_label} · ${neutral?'Terrain neutre':home?'Domicile':'Extérieur'}`;
 return `<div class="calendar-row${match.score?'':' coming'}${next?' next':''}" data-competition="${match.competition_id}">`
  +`<span class="calendar-date">${written(match.date)}</span>${competitionBadge(competition)}<span class="calendar-round" title="${e(match.round_label)}">${e(round(match.round_label))}</span>`
  +`<span class="calendar-venue">${home||neutral?'':awayIcon}</span><span class="calendar-opponent">${clubLink(opponent)}${next?'<em>Prochain</em>':''}${shootout?`<small>${e(shootout)}</small>`:''}</span>`
  +`<a class="calendar-score${match.outcome?` ${match.outcome}`:''}" href="#/match/${match.id}" title="${e(match.outcome?`${outcomeLabels[match.outcome]} · ${detail}`:detail)}">${score}</a>`
  +`<span class="calendar-scorers">${scorerList(ours)}</span><span class="calendar-scorers theirs">${scorerList(theirs)}</span></div>`;
}
// The lines of a calendar, a club's or a selection's (`team`): `competitions` holds what is known of each by its id, the
// first match still to play stands out, `options` are calendarRow's.
export function calendarRows(matches,team,competitions,options){
 const nextId=matches.find(match=>!match.score)?.id;
 return `<div class="calendar-rows">${matches.map(match=>calendarRow(match,team,competitions,match.id===nextId,options)).join('')}</div>`;
}

// Where the club stands in each competition of the season: its place, its record as a bar of wins, draws and losses, its goals.
function recordCard(rows){
 const body=rows.map(row=>{
  const part=(count,kind)=>count?`<i class="${kind}" style="flex:${count} 1 0"></i>`:'';
  // A competition not played yet tells only where the club comes in.
  if(!row.played)return `<div class="calendar-record">${competitionBadge(row)}<div><p><b>${e(row.place)}</b></p></div><strong></strong></div>`;
  return `<div class="calendar-record">${competitionBadge(row)}<div><p><b>${e(row.place)}</b><span>${row.played} J · ${row.won} V · ${row.drawn} N · ${row.lost} D</span></p>`
   +`<span class="record-bar" role="img" aria-label="${row.won} victoires, ${row.drawn} nuls, ${row.lost} défaites">${part(row.won,'won')}${part(row.drawn,'drawn')}${part(row.lost,'lost')}</span></div><strong>${row.goals_for}–${row.goals_against}</strong></div>`;
 }).join('');
 return `<section class="card calendar-records"><div class="card-head"><h2>Bilan</h2></div><div class="card-body">${body}</div></section>`;
}

// The season of a club on one line per match, from the first to the last: the day, the competition's badge, the round, a plane
// for an away game, the opponent, the score from the club's side and the scorers of either side; the next match stands out.
// Buttons above keep the matches of one competition (`competition` in the address). Its record in each competition stands beside.
export function calendarContent(club,data,params){
 if(!data.items.length)return `<section class="card">${empty('Aucun match programmé pour cette saison.','Calendrier vide')}</section>`;
 const competitions=new Map(data.competitions.map(row=>[row.id,row]));
 const picked=Number(params.get('competition'))||null,shown=picked&&competitions.has(picked)?picked:null;
 const nextId=data.items.find(match=>!match.score)?.id;
 const rows=data.items.filter(match=>shown==null||match.competition_id===shown);
 const chip=(value,label,count)=>`<button type="button" data-param="competition" data-param-value="${value??''}" aria-pressed="${(value??null)===shown}" class="${(value??null)===shown?'active':''}">${label} <span class="count">${count}</span></button>`;
 const chips=[chip(null,'Toutes',data.items.length),...data.competitions.map(row=>chip(row.id,`${competitionBadge(row)}${e(row.name)}`,data.items.filter(match=>match.competition_id===row.id).length))].join('');
 return `<div class="calendar-layout club-calendar"><section class="card calendar-card"><div class="card-head"><h2>Saison ${season(data.items[0].season)}</h2><div class="calendar-filters" role="group" aria-label="Compétitions">${chips}</div></div>`
  +`<div class="calendar-rows">${rows.map(match=>calendarRow(match,club,competitions,match.id===nextId)).join('')}</div></section>${recordCard(data.competitions)}</div>`;
}
