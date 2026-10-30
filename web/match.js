import {replayCard} from './match-replay.js';
import {matchHero} from './club-hero.js';
import {api,escape as e,matchMinute,halfEnd,number as n,expectedGoals,matchNoteBadge,date,clubLink,playerLink,empty,card,foldCard,table,pitch,competitionBadge,competitionKind,safeColor,contrastText,contrastRatio,chartColours,shortName} from './ui.js';

// Colours of a side: its home kit, or a neutral pair for teams without one (national teams).
const fallbackKits={home:{major:'#236e52',minor:'#ffffff'},away:{major:'#bc4c45',minor:'#ffffff'}};
const kitOf=(team,side)=>{const major=safeColor(team?.major_color);return major?{major,minor:safeColor(team.minor_color)||contrastText(major)}:fallbackKits[side];};
// Two shirts, or a shirt and a goalkeeper, that a glance tells apart.
const apart=(first,second)=>contrastRatio(first,second)>=1.6;
const minute=(event,half)=>matchMinute(event.second,half,event.period);

// What happened to each player during play (the shoot-out aside): goals, cards, injury, minutes of coming on and off.
function playerEvents(events){
 const marks={};const of=id=>marks[id]??={goals:0,yellows:0,red:null,injury:null,on:null,off:null};
 const half=halfEnd(events);
 for(const event of events){
  if(event.period===3||event.player_id==null)continue;
  const player=of(event.player_id);
  if(event.kind==='goal')player.goals++;
  else if(event.kind==='yellow')player.yellows++;
  else if(event.kind==='red')player.red={minute:minute(event,half),secondYellow:event.detail==='second_yellow'};
  else if(event.kind==='injury')player.injury=minute(event,half);
  else if(event.kind==='substitution'){player.off=minute(event,half);if(event.secondary_id!=null)of(event.secondary_id).on=minute(event,half);}
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

// Both sides as the replay draws them, a goalkeeper apart from both. The home side wears its shirt; the away side its own,
// its away kit when the two home shirts look alike, or else a plain disc of its second colour or of a neutral one.
export function replayTeams(match){
 // A kit's discs wear the shirt itself, its pattern from the CSV.
 const worn=(team,side)=>({...kitOf(team,side),shirt:safeColor(team?.major_color)?team.shirt_url||null:null});
 const home=worn(match.home,'home'),own=worn(match.away,'away');
 const change=safeColor(match.away?.away_kit?.major_color)?worn(match.away.away_kit,'away'):null;
 const plain=[own.minor,fallbackKits.away.major,fallbackKits.home.major].find(colour=>apart(home.major,colour));
 const away=[own,change,plain&&{major:plain,minor:contrastText(plain),shirt:null}].find(kit=>kit&&apart(home.major,kit.major))||own;
 const keeper=['#f2c94c','#40c4ff','#c77dff'].find(color=>apart(color,home.major)&&apart(color,away.major))||'#f2c94c';
 return {home:{name:match.home.name,...home,keeper},away:{name:match.away.name,...away,keeper}};
}

export function statsCard(match){
 const result=match.result,home=result.home_stats,away=result.away_stats,totalPoss=home.possession_seconds+away.possession_seconds;
 const [homeColor,awayColor]=chartColours(match.home,match.away);
 const stats=[['Buts attendus (xG)',home.xg,away.xg],['Tirs',home.shots,away.shots],['Tirs cadrés',home.on_target,away.on_target],['Possession',100*home.possession_seconds/Math.max(1,totalPoss),100*away.possession_seconds/Math.max(1,totalPoss)],['Corners',home.corners,away.corners],['Coups francs',home.free_kicks,away.free_kicks],['Cartons jaunes',home.yellows,away.yellows],['Cartons rouges',home.reds,away.reds]];
 // Fouls and offsides are counted since the stoppages have a cause; an older match shows its free kicks instead.
 if(home.fouls!=null&&away.fouls!=null)stats.splice(stats.findIndex(([label])=>label==='Coups francs'),1,
  ['Fautes',home.fouls,away.fouls],['Hors-jeu',home.offsides,away.offsides]);
 // Passes are counted since the possessions are built pass by pass: an older match has none.
 if(home.passes!=null&&away.passes!=null)stats.splice(4,0,['Passes',home.passes,away.passes],
  ['Précision des passes',100*home.passes/Math.max(1,home.passes_attempted),100*away.passes/Math.max(1,away.passes_attempted)]);
 // One bar a line, shared between the two sides by their part of the two figures, the home side's on the left; the larger
 // figure is the strong one. The parts add up to 1 whatever the figures: below 1 in all (0.2 and 0.3 expected goals), the
 // figures themselves would fill only that much of the bar. The card folds on its first four lines, the same on the
 // report and in the live match.
 const rows=stats.map(([label,a=0,b=0],index)=>{
  const unit=label==='Possession'||label==='Précision des passes'?'\u00a0%':'',figure=label==='Buts attendus (xG)'?expectedGoals:n,total=a+b;
  const part=value=>total?+(value/total).toFixed(4):1;
  return `<div class="comparison${index>=4?' fold-more':''}"><span class="${a>b?'lead':''}">${figure(a)}${unit}</span><div>${label}<span class="comparison-bar${total?'':' none'}" aria-hidden="true"><i style="flex-grow:${part(a)};color:${homeColor}"></i><i style="flex-grow:${part(b)};color:${awayColor}"></i></span></div><span class="${b>a?'lead':''}">${figure(b)}${unit}</span></div>`;
 }).join('');
 return foldCard('match-stats','Le match en chiffres',`<div class="comparisons">${rows}</div>`,'match-stats');
}

// Goals, injuries, red cards and penalties missed in the order they came, the home side's on the left and the away side's
// on the right, one line each whatever the names. Its marks say what happened; then the player by his short name (his
// family name, with as much of his given name as tells him from a team-mate: `player_short` of the API) and, after a goal's
// scorer, the passer, smaller, or "pen." for a penalty. Their whole names are in the tooltips. `link` names a player: a
// link to his page, or plain text where leaving the screen is not allowed (the live match).
export function highlightsCard(match,link=playerLink){
 const all=match.result.events,half=halfEnd(all),scored=new Set(all.filter(event=>event.kind==='goal').map(event=>event.shot_id));
 const saved=new Set(all.filter(event=>event.kind==='save').map(event=>event.shot_id));
 const events=all.filter(event=>(['goal','injury','red'].includes(event.kind)||(event.kind==='shot'&&event.detail==='penalty'&&!scored.has(event.shot_id)))&&event.period!==3);
 const named=(tag,id,name,short,title)=>{const shown=shortName(name,short);return `<${tag}${title||shown!==name?` title="${e(title||name)}"`:''}>${link(id,shown)}</${tag}>`;};
 const content=event=>{
  // A second yellow card shows as a yellow card followed by the red one.
  const marks=event.kind==='goal'?icon('goal','','But'):event.kind==='injury'?icon('injury','','Blessure')
   :event.kind==='shot'?icon('missed','',saved.has(event.shot_id)?'Penalty arrêté':'Penalty manqué')
   :event.detail==='second_yellow'?icon('booking yellow','','Carton jaune')+icon('booking red','','Deuxième carton jaune'):icon('booking red','','Carton rouge');
  const player=event.player?named('strong',event.player_id,event.player,event.player_short):'<strong>—</strong>';
  const passer=event.kind!=='goal'?'':event.detail==='penalty'?'<small title="Sur penalty">pen.</small>'
   :event.secondary?named('small',event.secondary_id,event.secondary,event.secondary_short,`Passe de ${event.secondary}`):'';
  return `<span class="marks">${marks}</span><span class="highlight-names">${player}${passer}</span>`;
 };
 const rows=events.map(event=>{const home=event.team_id===match.home.id;return `<div class="highlight-row"><div class="highlight home">${home?content(event):''}</div><span class="minute">${minute(event,half)}′</span><div class="highlight away">${home?'':content(event)}</div></div>`;}).join('');
 return card('Les temps forts',rows?`<div class="highlights">${rows}</div>`:`<div class="card-body">${empty('Ni but, ni blessure, ni carton rouge')}</div>`);
}

// The flow of the chances (docs/charte-graphique.md, « Fil du match »): each side's expected goals added up shot after shot,
// a step at each, in its colour in a chart, against the minutes; a ball where a shot went in, the half time dashed, the
// total of each side at the end of its line. `shots` hold {second, home, xg, goal}; `half` is the first half's whistle and
// `end` the last second of the axis. Live, the lines stop at `now`, drawn in the accent's ink, and `inner` writes the
// figures of the expected goals inside the plot, under their lines, for a chart as wide as the line of the match under the pitch.
export function flowChart({shots,colours,half,end,now=end,width=640,height=196,left=32,right=44,top=12,bottom=28,inner=false,live=false}){
 const W=width,H=height,x=second=>left+(W-left-right)*second/end;
 const totals=[true,false].map(home=>shots.filter(shot=>shot.home===home).reduce((sum,shot)=>sum+shot.xg,0));
 const ceiling=Math.max(1,Math.ceil(Math.max(...totals))),y=value=>top+(H-top-bottom)*(1-value/ceiling);
 const grid=Array.from({length:ceiling+1},(_,value)=>`<line class="cc-grid" x1="${left}" x2="${W-right}" y1="${y(value)}" y2="${y(value)}"/>`
  +(!inner?`<text class="cc-tick" x="${left-8}" y="${y(value)+4}" text-anchor="end">${value}</text>`:value?`<text class="cc-tick" x="${left+2}" y="${y(value)+14}">${value}</text>`:'')).join('');
 // The minutes of each half from its own kickoff: 45 stands on the whistle, the second half counts on from there.
 const at=minute=>minute<=45?minute*60*half/2700:half+(minute-45)*60;
 const ticks=[0,15,30,45,60,75,90].map(minute=>`<text class="cc-tick" x="${x(at(minute))}" y="${H-6}" text-anchor="${inner&&minute===0?'start':inner&&minute===90?'end':'middle'}">${minute}′</text>`).join('');
 // The two totals stand at the end of their lines, 16 apart at least, the higher one above.
 const labels=totals.map(y),gap=16-Math.abs(labels[0]-labels[1]);
 if(gap>0){const upper=totals[0]>=totals[1]?0:1;labels[upper]-=gap/2;labels[1-upper]+=gap/2;}
 const lines=[true,false].map((home,index)=>{
  let sum=0;const points=[`${x(0)},${y(0)}`],balls=[];
  for(const shot of shots.filter(shot=>shot.home===home)){
   points.push(`${x(shot.second)},${y(sum)}`);sum+=shot.xg;points.push(`${x(shot.second)},${y(sum)}`);
   if(shot.goal)balls.push(`<circle class="cc-goal" cx="${x(shot.second)}" cy="${y(sum)}" r="5"/>`);
  }
  points.push(`${x(now)},${y(sum)}`);
  return `<polyline class="cc-line flow" style="stroke:${colours[index]}" points="${points.join(' ')}"/>${balls.join('')}<text class="cc-value" x="${x(now)+6}" y="${labels[index]+5}">${expectedGoals(sum)}</text>`;
 }).join('');
 const minute=live?`<line class="cc-now" x1="${x(now)}" x2="${x(now)}" y1="${top-2}" y2="${H-bottom}"/>`:'';
 return `<svg class="club-chart"${live?` width="${W}" height="${H}"`:''} viewBox="0 0 ${W} ${H}" role="img" aria-label="Buts attendus cumulés au fil du match">${grid}<line class="cc-half" x1="${x(half)}" x2="${x(half)}" y1="${top}" y2="${H-bottom}"/>${ticks}${lines}${minute}</svg>`;
}
export function flowCard(match){
 const result=match.result;
 if(!result.shots?.length)return '';
 const half=halfEnd(result.events),end=Math.max(result.duration||0,half+2700,...result.shots.map(shot=>shot.second));
 const goals=result.events.filter(event=>event.kind==='goal'&&event.period<=2);
 const shots=result.shots.map(shot=>({second:shot.second,home:shot.team_id===match.home.id,xg:shot.xg,goal:goals.some(goal=>goal.team_id===shot.team_id&&goal.second===shot.second)}));
 return card('Fil du match',`<div class="cc-body">${flowChart({shots,colours:chartColours(match.home,match.away),half,end})}</div>`,'<span class="card-hint">buts attendus cumulés</span>','match-flow');
}

export async function matchScreen(id){
 const match=await api(`/matches/${id}`);
 const result=match.result;
 // The 2D summary exists only for a played match that kept its replay (the user's club's); its toggle is the last command
 // of the match's line.
 const replay=result?.home_stats&&result.replay?replayCard(match,replayTeams(match)):{toggle:'',panel:''};
 // The band has no bar: the match's line says which match it is, over the highlights (or alone under the band before the
 // match). The competition and the round, the day, a neutral ground, who went through; at its end the first leg and the summary.
 const badge=competitionBadge({id:match.competition_id,name:match.competition,...(match.international?{kind:'international',code:match.competition_code,year:match.season}:{})});
 const when=[date(match.date,true),match.neutral?'Terrain neutre':''].filter(Boolean).join(' · ');
 const winner=match.winner_id?`<span>Vainqueur : ${clubLink(match.winner_id===match.home.id?match.home:match.away)}</span>`:'';
 const commands=`${match.first_leg_id?`<a class="button" href="#/match/${match.first_leg_id}">Match aller</a>`:''}${replay.toggle}`;
 const line=`<div class="page-heading match-line"><div class="match-facts">${badge}<strong>${e(match.round_label||`Journée ${match.round}`)}</strong><span class="muted">${when}</span>${winner}</div>`
  +`${commands?`<div class="tools">${commands}</div>`:''}</div>`;
 // In a European cup, each club's name is followed by its country's flag in the band; the line, under it, does not repeat it.
 const header=matchHero(match,'',{flags:!match.international&&competitionKind({id:match.competition_id,name:match.competition})==='europe'});
 if(!result)return header+line+card('Avant-match',empty('Match à venir'));
 if(!result.home_stats)return header+line+card('Résultat archivé',empty('Détails non conservés'));
 const marks=playerEvents(result.events);
 return header+(result.status!=='played'?`<div class="notice">Résultat attribué par forfait (${e(result.status)}).</div>`:'')
  +replay.panel+`<div class="match-layout"><div class="match-home">${lineupCard(match,'home',marks)}</div><div class="match-center">${line}${highlightsCard(match)}${statsCard(match)}${flowCard(match)}</div><div class="match-away">${lineupCard(match,'away',marks)}</div></div>`;
}
