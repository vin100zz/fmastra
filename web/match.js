import {replayCard} from './match-replay.js';
import {matchHero} from './club-hero.js';
import {api,escape as e,number as n,expectedGoals,matchNoteBadge,date,clubLink,playerLink,empty,card,foldCard,table,pitch,competitionBadge,safeColor,contrastText,contrastRatio,chartColours,shortName} from './ui.js';

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
// `substitutions` false leaves the coming-on minute out, for the bench where it has its own column; `goals` false leaves the
// goals out, for the pitch where they stand on the shirt.
function marksOf(player,{substitutions=true,goals=true}={}){
 if(!player)return '';
 // A second yellow shows as one yellow card followed by the red one.
 const yellows=player.red?.secondYellow?Math.min(1,player.yellows):player.yellows;
 return [
  substitutions&&player.on!=null?onIcon(player.on):'',
  // A ball for each goal.
  ...Array.from({length:goals?player.goals:0},()=>icon('goal','',`${player.goals} but${player.goals>1?'s':''}`)),
  ...Array.from({length:yellows},()=>icon('booking yellow','','Carton jaune')),
  player.red?icon('booking red','',`${player.red.secondYellow?'Deuxième carton jaune':'Carton rouge'} (${player.red.minute}′)`):'',
  player.injury!=null?icon('injury','',`Blessé à la ${player.injury}e minute`):'',
  player.off!=null?icon('sub-off',`▼ ${player.off}′`,`Remplacé à la ${player.off}e minute`):'',
 ].join('');
}

// The bench under its pitch, on two columns read from top to bottom, the first one the longer: a substitute by his short
// name, as on the pitch (his whole name in the tooltip), what he did, the minute he came on and his note.
function benchHalves(bench,marks){
 const rows=bench.map(player=>{
  const events=marks[player.id],shown=shortName(player.name,player.short);
  return [`<span class="bench-player${events?.on==null?' unused':''}"${shown!==player.name?` title="${e(player.name)}"`:''}>${playerLink(player.id,shown)}${marksOf(events,{substitutions:false})}</span>`,events?.on!=null?onIcon(events.on):'—',matchNoteBadge(player.stats?.rating)||'—'];
 });
 if(!rows.length)return '';
 const half=Math.ceil(rows.length/2),column=part=>part.length?table(['REMPLAÇANT','ENTRÉE','NOTE'],part):'';
 return `<div class="halves bench-halves">${column(rows.slice(0,half))}${column(rows.slice(half))}</div>`;
}

function lineupCard(match,side,marks){
 const result=match.result,kit=kitOf(match[side],side);
 // On the pitch, his goals stand on his shirt and the rest of what he did follows his note in his block.
 const onPitch=player=>marksOf(marks[player.id],{goals:false}),goals=player=>marks[player.id]?.goals??0;
 // No heading: the side at home is on the left of the page, as in the band.
 return `<section class="card match-lineup">${pitch(result[`${side}_lineup`],`Composition de ${match[side].name}`,{compact:true,kit,marks:onPitch,goals})}${benchHalves(result[`${side}_bench`],marks)}</section>`;
}

// Both sides as the replay draws them: the same contrasting pair as the stat bars, a goalkeeper apart from both.
export function replayTeams(match){
 const home=kitOf(match.home,'home'),away=kitOf(match.away,'away'),[homeMajor,awayMajor]=barColors(home,away);
 const keeper=['#f2c94c','#40c4ff','#c77dff'].find(color=>contrastRatio(color,homeMajor)>=1.6&&contrastRatio(color,awayMajor)>=1.6)||'#f2c94c';
 const minor=(major,kit)=>major===kit.major?kit.minor:contrastText(major);
 return {home:{name:match.home.name,major:homeMajor,minor:minor(homeMajor,home),keeper},away:{name:match.away.name,major:awayMajor,minor:minor(awayMajor,away),keeper}};
}

export function statsCard(match){
 const result=match.result,home=result.home_stats,away=result.away_stats,totalPoss=home.possession_seconds+away.possession_seconds;
 const [homeColor,awayColor]=chartColours(match.home,match.away);
 const stats=[['Buts attendus (xG)',home.xg,away.xg],['Tirs',home.shots,away.shots],['Tirs cadrés',home.on_target,away.on_target],['Possession',100*home.possession_seconds/Math.max(1,totalPoss),100*away.possession_seconds/Math.max(1,totalPoss)],['Corners',home.corners,away.corners],['Coups francs',home.free_kicks,away.free_kicks],['Cartons jaunes',home.yellows,away.yellows],['Cartons rouges',home.reds,away.reds]];
 // One bar a line, shared between the two sides by their part of the two figures, the home side's on the left; the larger
 // figure is the strong one. The card folds on its first four lines, the same on the report and in the live match.
 const rows=stats.map(([label,a=0,b=0],index)=>{
  const unit=label==='Possession'?'\u00a0%':'',figure=label==='Buts attendus (xG)'?expectedGoals:n,total=a+b;
  return `<div class="comparison${index>=4?' fold-more':''}"><span class="${a>b?'lead':''}">${figure(a)}${unit}</span><div>${label}<span class="comparison-bar${total?'':' none'}" aria-hidden="true"><i style="flex-grow:${total?a:1};color:${homeColor}"></i><i style="flex-grow:${total?b:1};color:${awayColor}"></i></span></div><span class="${b>a?'lead':''}">${figure(b)}${unit}</span></div>`;
 }).join('');
 return foldCard('match-stats','Le match en chiffres',`<div class="comparisons">${rows}</div>`,'match-stats');
}

// Goals, injuries and red cards in the order they came, the home side's on the left and the away side's on the right, one
// line each whatever the names. Its marks say what happened; then the player by his short name (his family name, with as
// much of his given name as tells him from a team-mate: `player_short` of the API) and, after a goal's scorer, the passer,
// smaller. Their whole names are in the tooltips. `link` names a player: a link to his page, or plain text where leaving the
// screen is not allowed (the live match).
export function highlightsCard(match,link=playerLink){
 const events=match.result.events.filter(event=>['goal','injury','red'].includes(event.kind)&&event.period!==3);
 const named=(tag,id,name,short,title)=>{const shown=shortName(name,short);return `<${tag}${title||shown!==name?` title="${e(title||name)}"`:''}>${link(id,shown)}</${tag}>`;};
 const content=event=>{
  // A second yellow card shows as a yellow card followed by the red one.
  const marks=event.kind==='goal'?icon('goal','','But'):event.kind==='injury'?icon('injury','','Blessure')
   :event.detail==='second_yellow'?icon('booking yellow','','Carton jaune')+icon('booking red','','Deuxième carton jaune'):icon('booking red','','Carton rouge');
  const player=event.player?named('strong',event.player_id,event.player,event.player_short):'<strong>—</strong>';
  const passer=event.kind==='goal'&&event.secondary?named('small',event.secondary_id,event.secondary,event.secondary_short,`Passe de ${event.secondary}`):'';
  return `<span class="marks">${marks}</span><span class="highlight-names">${player}${passer}</span>`;
 };
 const rows=events.map(event=>{const home=event.team_id===match.home.id;return `<div class="highlight-row"><div class="highlight home">${home?content(event):''}</div><span class="minute">${minute(event)}′</span><div class="highlight away">${home?'':content(event)}</div></div>`;}).join('');
 return card('Les temps forts',rows?`<div class="highlights">${rows}</div>`:`<div class="card-body">${empty('Ni but, ni blessure, ni carton rouge.','Rien à signaler')}</div>`);
}

export async function matchScreen(id){
 const match=await api(`/matches/${id}`);
 const result=match.result;
 // The 2D summary exists only for a played match with details; its toggle is the last command of the match's line.
 const replay=result?.home_stats?replayCard(match,replayTeams(match)):{toggle:'',panel:''};
 // The band has no bar: the match's line says which match it is, over the highlights (or alone under the band before the
 // match). The competition and the round, the day, a neutral ground, who went through; at its end the first leg and the summary.
 const badge=competitionBadge({id:match.competition_id,name:match.competition,...(match.international?{kind:'international',code:match.competition_code}:{})});
 const when=[date(match.date,true),match.neutral?'Terrain neutre':''].filter(Boolean).join(' · ');
 const winner=match.winner_id?`<span>Vainqueur : ${clubLink(match.winner_id===match.home.id?match.home:match.away)}</span>`:'';
 const commands=`${match.first_leg_id?`<a class="button" href="#/match/${match.first_leg_id}">Match aller</a>`:''}${replay.toggle}`;
 const line=`<div class="page-heading match-line"><div class="match-facts">${badge}<strong>${e(match.round_label||`Journée ${match.round}`)}</strong><span class="muted">${when}</span>${winner}</div>`
  +`${commands?`<div class="tools">${commands}</div>`:''}</div>`;
 const header=matchHero(match);
 if(!result)return header+line+card('Avant-match',empty('Cette rencontre sera simulée à sa date prévue.','Le coup d’envoi approche'));
 if(!result.home_stats)return header+line+card('Résultat archivé',empty('Le score est conservé. Les détails ne sont pas disponibles pour ce moteur ou cette saison archivée.','Score définitif'));
 const marks=playerEvents(result.events);
 return header+(result.status!=='played'?`<div class="notice">Résultat attribué par forfait (${e(result.status)}).</div>`:'')
  +replay.panel+`<div class="match-layout"><div class="match-home">${lineupCard(match,'home',marks)}</div><div class="match-center">${line}${highlightsCard(match)}${statsCard(match)}</div><div class="match-away">${lineupCard(match,'away',marks)}</div></div>`;
}
