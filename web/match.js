import {replayCard} from './match-replay.js';
import {api,escape as e,number as n,matchNoteBadge,date,clubLink,playerLink,empty,card,table,pitch,kitDot,safeColor,contrastText,contrastRatio,chartColours} from './ui.js';

// Colours of a side: its home kit, or a neutral pair for teams without one (national teams).
const fallbackKits={home:{major:'#236e52',minor:'#ffffff'},away:{major:'#bc4c45',minor:'#ffffff'}};
const kitOf=(team,side)=>{const major=safeColor(team?.major_color);return major?{major,minor:safeColor(team.minor_color)||contrastText(major)}:fallbackKits[side];};
// The away bars switch to their second colour, or a neutral one, when both sides would look alike.
const barColors=(home,away)=>[home.major,[away.major,away.minor,fallbackKits.away.major,fallbackKits.home.major].find(color=>contrastRatio(home.major,color)>=1.6)||away.major];
const minute=event=>Math.floor(event.second/60);

// What happened to each player during play (the shoot-out aside): goals, cards, injury, minutes of coming on and off.
function playerEvents(events){
 const marks={};const of=id=>marks[id]??={goals:0,yellows:0,red:null,injury:null,on:null,off:null};
 for(const event of events){
  if(event.period===3||event.player_id==null)continue;
  const player=of(event.player_id);
  if(event.kind==='goal')player.goals++;
  else if(event.kind==='yellow')player.yellows++;
  else if(event.kind==='red')player.red={minute:minute(event),secondYellow:event.detail==='second_yellow'};
  else if(event.kind==='injury')player.injury=minute(event);
  else if(event.kind==='substitution'){player.off=minute(event);if(event.secondary_id!=null)of(event.secondary_id).on=minute(event);}
 }
 return marks;
}
const icon=(className,text,title)=>`<span class="match-mark ${className}" title="${e(title)}">${text}</span>`;
const onIcon=value=>icon('sub-on',`▲ ${value}′`,`Entré à la ${value}e minute`);
// `substitutions` false leaves the coming-on minute out, for the bench where it has its own column.
function marksOf(player,{substitutions=true}={}){
 if(!player)return '';
 // A second yellow shows as one yellow card followed by the red one.
 const yellows=player.red?.secondYellow?Math.min(1,player.yellows):player.yellows;
 return [
  substitutions&&player.on!=null?onIcon(player.on):'',
  player.goals?icon('goal',player.goals>1?`×${player.goals}`:'',`${player.goals} but${player.goals>1?'s':''}`):'',
  ...Array.from({length:yellows},()=>icon('booking yellow','','Carton jaune')),
  player.red?icon('booking red','',`${player.red.secondYellow?'Deuxième carton jaune':'Carton rouge'} (${player.red.minute}′)`):'',
  player.injury!=null?icon('injury','',`Blessé à la ${player.injury}e minute`):'',
  player.off!=null?icon('sub-off',`▼ ${player.off}′`,`Remplacé à la ${player.off}e minute`):'',
 ].join('');
}

function lineupCard(match,side,marks){
 const result=match.result,kit=kitOf(match[side],side);
 const bench=result[`${side}_bench`].map(player=>{const events=marks[player.id];return [`<span class="bench-player${events?.on==null?' unused':''}">${playerLink(player.id,player.name)}${marksOf(events,{substitutions:false})}</span>`,events?.on!=null?onIcon(events.on):'—',matchNoteBadge(player.stats?.rating)||'—'];});
 const onPitch=player=>{const html=marksOf(marks[player.id]);return html?`<span class="pitch-marks">${html}</span>`:'';};
 const team=match[side];
 return `<section class="card match-lineup"><div class="card-head"><h2>${kitDot(team)}${e(team.name)}</h2></div>${pitch(result[`${side}_lineup`],`Composition de ${team.name}`,{compact:true,kit,marks:onPitch})}${table(['REMPLAÇANT','ENTRÉE','NOTE'],bench)}</section>`;
}

// Both sides as the replay draws them: the same contrasting pair as the stat bars, a goalkeeper apart from both.
export function replayTeams(match){
 const home=kitOf(match.home,'home'),away=kitOf(match.away,'away'),[homeMajor,awayMajor]=barColors(home,away);
 const keeper=['#f2c94c','#40c4ff','#c77dff'].find(color=>contrastRatio(color,homeMajor)>=1.6&&contrastRatio(color,awayMajor)>=1.6)||'#f2c94c';
 const minor=(major,kit)=>major===kit.major?kit.minor:contrastText(major);
 return {home:{name:match.home.name,major:homeMajor,minor:minor(homeMajor,home),keeper},away:{name:match.away.name,major:awayMajor,minor:minor(awayMajor,away),keeper}};
}

const sidesHead=match=>`<div class="match-sides"><span>${kitDot(match.home)}${e(match.home.name)}</span><span>${kitDot(match.away)}${e(match.away.name)}</span></div>`;

export function statsCard(match){
 const result=match.result,home=result.home_stats,away=result.away_stats,totalPoss=home.possession_seconds+away.possession_seconds;
 const [homeColor,awayColor]=chartColours(match.home,match.away);
 const stats=[['Buts attendus (xG)',home.xg,away.xg],['Tirs',home.shots,away.shots],['Tirs cadrés',home.on_target,away.on_target],['Possession',100*home.possession_seconds/Math.max(1,totalPoss),100*away.possession_seconds/Math.max(1,totalPoss)],['Corners',home.corners,away.corners],['Coups francs',home.free_kicks,away.free_kicks],['Cartons jaunes',home.yellows,away.yellows],['Cartons rouges',home.reds,away.reds]];
 // One bar a line, shared between the two sides by their part of the two figures; the larger figure is the strong one.
 const rows=stats.map(([label,a=0,b=0])=>{
  const unit=label==='Possession'?'\u00a0%':'',total=a+b;
  return `<div class="comparison"><span class="${a>b?'lead':''}">${n(a)}${unit}</span><div>${label}<span class="comparison-bar${total?'':' none'}" aria-hidden="true"><i style="flex-grow:${total?a:1};color:${homeColor}"></i><i style="flex-grow:${total?b:1};color:${awayColor}"></i></span></div><span class="${b>a?'lead':''}">${n(b)}${unit}</span></div>`;
 }).join('');
 return card('Le match en chiffres',`${sidesHead(match)}<div class="comparisons">${rows}</div>`,'','match-stats');
}

// Goals, injuries and red cards in the order they came, the home side's on the left and the away side's on the right.
// `link` names a player: a link to his page, or plain text where leaving the screen is not allowed (the live match).
export function highlightsCard(match,link=playerLink){
 const events=match.result.events.filter(event=>['goal','injury','red'].includes(event.kind)&&event.period!==3);
 const content=event=>{
  const label=event.kind==='goal'?'But':event.kind==='injury'?'Blessure':event.detail==='second_yellow'?'Deuxième carton jaune':'Carton rouge';
  const mark=event.kind==='goal'?icon('goal','',label):event.kind==='injury'?icon('injury','',label):icon('booking red','',label);
  const detail=event.kind==='goal'&&event.secondary?`Passe de ${link(event.secondary_id,event.secondary)}`:label;
  return `${mark}<div><strong>${event.player?link(event.player_id,event.player):'—'}</strong><small>${detail}</small></div>`;
 };
 const rows=events.map(event=>{const home=event.team_id===match.home.id;return `<div class="highlight-row"><div class="highlight home">${home?content(event):''}</div><span class="minute">${minute(event)}′</span><div class="highlight away">${home?'':content(event)}</div></div>`;}).join('');
 return card('Les temps forts',`${sidesHead(match)}<div class="card-body">${rows||empty('Ni but, ni blessure, ni carton rouge.','Rien à signaler')}</div>`);
}

export async function matchScreen(id){
 const match=await api(`/matches/${id}`);
 const context=`<div class="match-context"><span class="eyebrow">${e(match.competition)} · ${e(match.round_label||`Journée ${match.round}`)}</span><p>${date(match.date,true)}${match.neutral?' · Terrain neutre':''}</p>${match.first_leg_id?`<p><a href="#/match/${match.first_leg_id}">Voir le match aller</a></p>`:''}${match.winner_id?`<p>Vainqueur : ${clubLink(match.winner_id===match.home.id?match.home:match.away)}</p>`:''}</div>`;
 const result=match.result;
 // The 2D summary exists only for a played match with details; its toggle takes the banner's free right column.
 const replay=result?.home_stats?replayCard(match,replayTeams(match)):{toggle:'',panel:''};
 const header=`<section class="match-banner">${context}<div class="scoreboard"><div>${clubLink(match.home)}</div><div class="big-score">${match.score?match.score.join(' : '):'VS'}${match.aggregate?`<small class="aggregate-score">Cumul ${match.aggregate.join(' – ')}</small>`:''}${match.penalties?`<small class="shootout-score">${match.penalties.join(' – ')} t.a.b.</small>`:''}</div><div>${clubLink(match.away)}</div></div>${replay.toggle?`<div class="match-actions">${replay.toggle}</div>`:''}</section>`;
 if(!result)return header+card('Avant-match',empty('Cette rencontre sera simulée à sa date prévue.','Le coup d’envoi approche'));
 if(!result.home_stats)return header+card('Résultat archivé',empty('Le score est conservé. Les détails ne sont pas disponibles pour ce moteur ou cette saison archivée.','Score définitif'));
 const marks=playerEvents(result.events);
 return header+(result.status!=='played'?`<div class="notice">Résultat attribué par forfait (${e(result.status)}).</div>`:'')
  +replay.panel+`<div class="match-layout"><div class="match-home">${lineupCard(match,'home',marks)}</div><div class="match-center">${highlightsCard(match)}${statsCard(match)}</div><div class="match-away">${lineupCard(match,'away',marks)}</div></div>`;
}
