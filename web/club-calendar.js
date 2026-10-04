import {escape as e,surname,empty,clubLink,season} from './ui.js';
import {awayIcon,outcomeLabels} from './club-overview.js';

// Words written in lower case in a competition's initials ("Coupe de France" reads CdF).
const SMALL=new Set(['de','du','des','del','della','di','da','do','la','le','les','el','d','of','the','und','y']);
// The short name on a competition's badge: a European cup's code, otherwise the initials of its name up to its number, if it
// has one ("Ligue 1 McDonald's" reads L1); an acronym keeps its letters.
export function competitionCode({name,kind,code}){
 if(kind==='europe'&&code)return code;
 const words=String(name||'').replace(/[’'-]/g,' ').split(/\s+/).filter(Boolean);
 const number=words.findIndex(word=>/^\d+$/.test(word));
 const kept=number>=0?words.slice(0,number+1):words;
 return kept.map(word=>/^\d+$/.test(word)||/^[A-Z]{2,}$/.test(word)?word:SMALL.has(word.toLowerCase())?word[0].toLowerCase():word[0].toUpperCase()).join('').slice(0,4)||'—';
}
// The badge of a competition, coloured by its kind (and by its code for a European cup), its full name in the tooltip.
export const competitionBadge=competition=>`<span class="competition-code ${competition.kind}${competition.kind==='europe'&&competition.code?` ${e(competition.code.toLowerCase())}`:''}" title="${e(competition.name)}">${e(competitionCode(competition))}</span>`;

const day=value=>new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00`));
// A round as short as it reads: J12 for a league round, the round of a cup as it is named.
const roundShort=label=>String(label||'').replace(/^Journée (\d+)$/,'J$1').replace(/ de finale$/,'');
// One side's scorers by surname, each with the minutes of his goals: "Ivanović 8’ 64’ · Aouad 89’".
const scorerList=side=>(side||[]).map(scorer=>`${scorer.id<0?e(surname(scorer.name)):`<a href="#/player/${scorer.id}" title="${e(scorer.name)}">${e(surname(scorer.name))}</a>`} ${scorer.minutes.map(minute=>`${e(minute)}’`).join(' ')}`).join(' · ');

function calendarRow(match,club,competitions,next){
 const home=match.home.id===club.id,opponent=home?match.away:match.home,competition=competitions.get(match.competition_id)||{name:match.competition,kind:'league'};
 // The score reads from the club's side, its goals first; a shoot-out is told beside the opponent.
 const score=match.score?(home?match.score:[...match.score].reverse()).join('–'):'—';
 const shootout=match.penalties?`t.a.b. ${(home?match.penalties:[...match.penalties].reverse()).join('–')}`:'';
 const [ours,theirs]=match.scorers?(home?match.scorers:[...match.scorers].reverse()):[[],[]];
 const detail=`${match.competition} · ${match.round_label} · ${home?'Domicile':'Extérieur'}`;
 return `<div class="calendar-row${match.score?'':' coming'}${next?' next':''}" data-competition="${match.competition_id}">`
  +`<span class="calendar-date">${day(match.date)}</span>${competitionBadge(competition)}<span class="calendar-round" title="${e(match.round_label)}">${e(roundShort(match.round_label))}</span>`
  +`<span class="calendar-venue">${home?'':awayIcon}</span><span class="calendar-opponent">${clubLink(opponent)}${next?'<em>Prochain</em>':''}${shootout?`<small>${e(shootout)}</small>`:''}</span>`
  +`<a class="calendar-score${match.outcome?` ${match.outcome}`:''}" href="#/match/${match.id}" title="${e(match.outcome?`${outcomeLabels[match.outcome]} · ${detail}`:detail)}">${score}</a>`
  +`<span class="calendar-scorers">${scorerList(ours)}</span><span class="calendar-scorers theirs">${scorerList(theirs)}</span></div>`;
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
