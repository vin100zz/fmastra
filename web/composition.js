import {api,query,toast,escape as e,position,group,levelStars,potentialStars,conditionIcon,debugMode,number,averageNote,shortName,appearances,positionNote,positionBlockNote,affinityTag,compositeCell,compositeHeader,formBadge,formArrow,COMPOSITE_SECTIONS,kitShirt,teamKit,shirtLabel,playerBlock,PITCH_BOXES,clubLink,kitDot,noteStars,date,safeColor,competitionCode,LINE_Y,pitchLine,pitchLayout,steps} from './ui.js';
import {outcomeLabels,shortDate,awayIcon} from './club-overview.js';

// The lineup being edited survives the re-renders of the page (auto refresh, busy buttons) until the match is played.
let editor=null;
// The columns of the squad list, 'infos' or 'jeu' (the composites): kept from one match to the next.
let squadView='infos';
// The options of the automatic lineup, kept from one match to the next: the prospects first in the rotation, the AI free
// to change the formation.
const autoOptions={young:false,free:false};
// The levels of the automatic lineup, from the best eleven to every outfield starter rested (`rotate`, src/core/ai/selection.py).
export const AUTO_LEVELS=[['Meilleure','La meilleure équipe pour ce match'],['Légère','Légère rotation : un tiers des joueurs de champ au repos, leurs seconds choix jouent'],
 ['Forte','Forte rotation : deux tiers des joueurs de champ au repos, leurs seconds choix jouent'],['Complète','Rotation complète : tous les joueurs de champ au repos, le gardien reste']];
const AUTO_OPTIONS=[['young','Jeunes','Dans la rotation, les grands espoirs passent avant les seconds choix'],
 ['free','Formation','L’IA choisit la formation que les joueurs disponibles remplissent le mieux ; sinon elle garde celle du terrain']];

const POSITION_ORDER=['GB','DG','DC','DD','MDC','MC','AILG','AILD','MOC','BU'];
// The upright pitch of a formation is the one the Présentation draws its eleven on (web/ui.js).
export {pitchLayout};

// The club's own tactic is built on a grid of the Composition pitch: five columns on each line from the goal forward.
export const CUSTOM='Perso';
const LINES=['gk','def','dm','cm','am','att'];
const COLUMN_X=[14,32,50,68,86];
const LINE_ROLES={def:['DG','DC','DD'],dm:['DG','MDC','DD'],cm:['AILG','MC','AILD'],am:['AILG','MOC','AILD'],att:['AILG','BU','AILD']};
// The position a cell gives its place: the keeper alone in his goal; on the wings, the full-backs up to the holding
// midfield, the wingers beyond.
export const cellRole=(key,column)=>key==='gk'?'GB':LINE_ROLES[key][column===0?0:column===COLUMN_X.length-1?2:1];
// A formation on the grid: each position on its line of `pitchLayout`, in the column nearest its place there.
export function gridPlaces(roles){
 const layout=pitchLayout(roles),lines={};
 roles.forEach((role,index)=>(lines[pitchLine(role,roles)]??=[]).push(index));
 const places=[];
 Object.entries(lines).forEach(([key,indexes])=>{
  indexes.sort((a,b)=>layout[a].x-layout[b].x);
  let column=-1;
  indexes.forEach((slot,rank)=>{
   const nearest=Math.round((layout[slot].x-COLUMN_X[0])/(COLUMN_X[1]-COLUMN_X[0]));
   column=Math.min(COLUMN_X.length-indexes.length+rank,Math.max(column+1,nearest));
   places[slot]={role:roles[slot],line:key,column};
  });
 });
 return places;
}
// A place moved onto a free cell takes the cell's position, its player with it. The places then follow the pitch from
// the goal forward, left to right: `order` gives each one's former index.
export function movePlace(places,index,key,column){
 const moved=places.map((item,rank)=>rank===index?{role:cellRole(key,column),line:key,column}:item);
 const order=moved.map((_,rank)=>rank).sort((a,b)=>LINES.indexOf(moved[a].line)-LINES.indexOf(moved[b].line)||moved[a].column-moved[b].column);
 return {places:order.map(rank=>moved[rank]),order};
}
// Every tactic on the grid, the club's own last when it has one.
function tacticsOf(data){
 const tactics=Object.fromEntries(Object.entries(data.formations).map(([name,roles])=>[name,gridPlaces(roles)]));
 if(data.custom)tactics[CUSTOM]=data.custom.map(([role,key,column])=>({role,line:key,column}));
 return tactics;
}

const where=(lineup,id)=>{const slot=lineup.slots.indexOf(id);if(slot>=0)return {kind:'slot',index:slot};const bench=lineup.bench.indexOf(id);return bench>=0?{kind:'bench',index:bench}:null;};
const at=(lineup,target)=>target.kind==='slot'?lineup.slots[target.index]:lineup.bench[target.index];
function put(lineup,target,id){(target.kind==='slot'?lineup.slots:lineup.bench)[target.index]=id;}
// Drops a player on a pitch or bench place: he takes it, and whoever held it takes his former place (none if he came from the squad list).
export function place(lineup,id,target){
 const next={slots:[...lineup.slots],bench:[...lineup.bench]};
 const from=where(next,id),occupant=at(next,target)??null;
 if(from&&from.kind===target.kind&&from.index===target.index)return next;
 if(from)put(next,from,occupant);
 put(next,target,id);
 return next;
}
export function remove(lineup,id){
 const clear=list=>list.map(item=>item===id?null:item);
 return {slots:clear(lineup.slots),bench:clear(lineup.bench)};
}
// Drops a player on a row of the squad list: a selected and an unselected player trade places; otherwise the dropped player leaves the lineup.
export function dropOnSquad(lineup,id,onto){
 const from=where(lineup,id),to=onto==null?null:where(lineup,onto);
 if(from&&onto!=null&&!to)return place(lineup,onto,from);
 if(!from&&to)return place(lineup,id,to);
 return remove(lineup,id);
}
// The first empty place in the order of positions (GB, DG, DC, DD…), substitutes last; null when the lineup is full.
export function nextFree(lineup,roles){
 const slot=lineup.slots.map((id,index)=>({id,index})).filter(item=>item.id==null)
  .sort((a,b)=>POSITION_ORDER.indexOf(roles[a.index])-POSITION_ORDER.indexOf(roles[b.index])||a.index-b.index)[0];
 if(slot)return {kind:'slot',index:slot.index};
 const bench=lineup.bench.indexOf(null);
 return bench>=0?{kind:'bench',index:bench}:null;
}
// Switching tactics keeps each starter: first on a slot of the same position, then on the same line, then anywhere left.
export function changeFormation(slots,fromRoles,toRoles){
 const starters=slots.map((id,index)=>({id,role:fromRoles[index]})).filter(item=>item.id!=null);
 const result=toRoles.map(()=>null);
 const passes=[(a,b)=>a===b,(a,b)=>group(a)===group(b),()=>true];
 for(const same of passes)toRoles.forEach((role,index)=>{
  if(result[index]!=null)return;
  const found=starters.findIndex(item=>same(item.role,role));
  if(found>=0)result[index]=starters.splice(found,1)[0].id;
 });
 return result;
}
// What keeps the lineup from being played: empty positions, injured or suspended players.
export function lineupProblems(lineup,roles,players){
 const byId=new Map(players.map(player=>[player.id,player]));
 const available=players.filter(player=>!player.unavailable).length;
 const problems=[];
 const empties=lineup.slots.map((id,index)=>id==null?roles[index]:null).filter(Boolean);
 if(lineup.slots.length-empties.length<Math.min(roles.length,available))problems.push(`Poste${empties.length>1?'s':''} inoccupé${empties.length>1?'s':''} : ${empties.join(', ')}`);
 [...lineup.slots,...lineup.bench].forEach(id=>{
  const player=byId.get(id);
  if(player?.unavailable==='injured')problems.push(`${player.name} est blessé`);
  else if(player?.unavailable==='suspended')problems.push(`${player.name} est suspendu`);
 });
 return problems;
}

const mounted=()=>editor&&typeof document!=='undefined'&&document.querySelector(`#lineup-form[data-match="${editor.matchId}"]`)?editor:null;
const shape=()=>editor.tactics[editor.formation];
const roles=()=>shape().map(item=>item.role);
// Problems of the lineup shown on screen; an empty list when it can be played (or when no lineup is being edited).
export function compositionIssues(){const current=mounted();return current?lineupProblems(current,roles(),current.data.players):[];}
// The payload of /partie/composition, or null when the lineup on screen cannot be played.
export function lineupSubmission(){
 const current=mounted();
 if(!current||compositionIssues().length)return null;
 return {match_id:current.matchId,formation:current.formation,
  titulaires:current.slots.map((id,index)=>[id,roles()[index]]).filter(([id])=>id!=null),banc:current.bench.filter(id=>id!=null),
  perso:current.tactics[CUSTOM]?.map(item=>[item.role,item.line,item.column])??null};
}

// What the menu of a player (player-menu.js) opens with on the editor, for the place or the row `element` that carries him:
// out of the lineup when he is in it, onto the next free place otherwise. Null away from the editor, and for a player who
// is not of the squad (the opponent's).
export function lineupAction(element,id){
 if(!element.closest?.('#lineup-form')||!mounted()||!editor.data.players.some(player=>player.id===id))return null;
 const send={'lineup-move':id};
 if(where(editor,id))return {label:'Sortir de la composition',send};
 return {label:'Mettre dans la composition',send,obstacle:nextFree(editor,roles())?null:'Aucune place libre.'};
}

const unavailableIcon=player=>player.unavailable==='injured'?'<span class="lineup-icon injury" title="Blessé" aria-label="Blessé">✚</span>'
 :player.unavailable==='suspended'?`<span class="lineup-icon suspension" title="Suspendu${player.match_suspension?` (${player.match_suspension} match${player.match_suspension>1?'s':''})`:''}" aria-label="Suspendu"></span>`:'';
const fatigue=player=>Math.round((1-player.fitness)*100);
// The position of the pitch picked to compare the squad on it, or null.
const pickedRole=()=>editor.picked==null?null:roles()[editor.picked]??null;
const wantedAt=role=>editor.data.composites_by_position?.[role]||[];
// A player's note at a position with his form and his affinity to it: in the list for the picked position, and in his block
// on the pitch, where the note is written in its colour.
const fitAt=(player,role)=>`<span class="fit-cell">${positionNote(player,role,wantedAt(role))}${formArrow(player.form)}${affinityTag(player.position_affinities?.[role],role)}</span>`;
const fitOnPitch=(player,role)=>positionBlockNote(player,role,wantedAt(role))+formArrow(player.form)+affinityTag(player.position_affinities?.[role],role);
// The block under a place: the player's name, then how he fits there; an empty place keeps its two lines, without a ground.
const slotBlock=(player,role)=>player?playerBlock(`${unavailableIcon(player)}${e(shortName(player.name,player.short))}`,fitOnPitch(player,role)):playerBlock('—','');

function slotHtml(id,role,cell,index,byId){
 const player=byId.get(id);
 const classes=`pitch-player lineup-slot ${group(role)}${player?'':' empty'}${player?.unavailable?' invalid':''}${index===editor.picked?' picked':''}`;
 const title=player?`${player.name} · ${player.position}${debugMode()?` · niveau ${Math.round(player.rating*2)}`:''}${player.unavailable?player.unavailable==='injured'?' · blessé':' · suspendu':''}`:`${role} inoccupé`;
 // A starter wears the club's kit and his number; an empty place keeps the outline of a shirt, its position on it.
 const shirt=kitShirt(teamKit(editor.data.club),shirtLabel(player,role),{empty:!player});
 return `<div class="${classes}" data-slot="${index}"${player?` data-player="${player.id}"`:''} draggable="true" style="left:${COLUMN_X[cell.column]}%;top:${LINE_Y[cell.line]}%" title="${e(title)}">${shirt}${slotBlock(player,role)}</div>`;
}
// The free cells of the grid, shown while a place of the pitch is dragged.
function cellsHtml(){
 const taken=new Set(shape().map(item=>`${item.line}:${item.column}`));
 return LINES.slice(1).flatMap(key=>COLUMN_X.map((x,column)=>taken.has(`${key}:${column}`)?''
  :`<div class="lineup-cell" data-cell="${key}:${column}" style="left:${x}%;top:${LINE_Y[key]}%"><span>${cellRole(key,column)}</span></div>`)).join('');
}
function benchHtml(id,index,byId){
 const player=byId.get(id);
 return `<div class="bench-slot${player?'':' empty'}${player?.unavailable?' invalid':''}" data-bench="${index}"${player?` data-player="${player.id}" draggable="true" title="${e(player.name)}"`:''}>${player?`${position(player.position)}<span>${unavailableIcon(player)}${e(shortName(player.name,player.short))}</span>`:'<span class="muted">Remplaçant</span>'}</div>`;
}

// A player's last five matches with the club, oldest first (charter, « Cinq derniers matches »): a bar to the minutes he played,
// the cross or the card when he could not, yellow once his load passes its threshold. The tooltip gives his load, then a match
// a line.
const USAGE={starter:'titulaire',sub:'entré',unused:'sur le banc',injured:'blessé',suspended:'suspendu',out:'non retenu'};
export function recentStrip(player,matches=[],threshold=null){
 const recent=player.recent||[],loaded=threshold!=null&&player.load>threshold;
 const bar=({status,minutes})=>status==='injured'?'<i class="injured"><span class="match-mark injury"></span></i>'
  :status==='suspended'?'<i class="suspended"><span class="match-mark booking red"></span></i>'
  :status==='out'?'<i class="out"></i>':`<i><u style="height:${Math.min(100,Math.round(minutes/90*100))}%"></u></i>`;
 const line=(match,{status,minutes})=>`${shortDate(match.date)} · ${match.opponent?.name??'—'} (${competitionCode(match.competition)}, ${match.home?'dom.':'ext.'}) ${match.score.join('–')} · ${USAGE[status]}${minutes?`, ${minutes} min`:''}`;
 const load=`Charge ${number(player.load??0)}${loaded?`, au-delà de ${number(threshold)} : il récupère moins vite`:''}`;
 const title=[load,...recent.map((usage,index)=>matches[index]?line(matches[index],usage):'')].filter(Boolean).join('\n');
 return `<span class="recent${loaded?' loaded':''}" title="${e(title)}">${'<i class="none"></i>'.repeat(Math.max(0,5-recent.length))}${recent.map(bar).join('')}</span>`;
}

const INFO_COLUMNS=[['potential','POT.'],['fatigue','ÉTAT'],['recent','5 DERNIERS'],['form','FORME'],['appearances','MJ'],['goals','BUTS'],['assists','PD'],['average','NOTE']];
// The composites by section, a line opening each section.
const GAME_COLUMNS=COMPOSITE_SECTIONS.flatMap(section=>section.composites.map((key,index)=>[key,compositeHeader(key),index===0]));
// The squad list's columns, [key, header, opens a section]: with a position picked on the pitch (`role`), everyone's note there
// comes right after COMPO.
export const lineupColumns=(view,role)=>[['selected','COMPO'],...(role?[['fit',`EN ${e(role)}`]]:[]),['position','POSTE'],['name','JOUEUR'],['rating','NIV.'],...(view==='jeu'?GAME_COLUMNS:INFO_COLUMNS)];
const columns=()=>lineupColumns(squadView,pickedRole());
// Starters come first in their pitch order, then substitutes, then the rest of the squad by position.
function sortValue(player,key){
 const spot=where(editor,player.id);
 if(key==='selected')return spot?spot.kind==='slot'?spot.index:100+spot.index:1000+POSITION_ORDER.indexOf(player.position)*1000-player.rating;
 if(key==='position')return POSITION_ORDER.indexOf(player.position);
 if(key==='fatigue')return fatigue(player);
 // On the stars the club sees, never on what is hidden behind them.
 if(key==='rating')return player.stars?player.stars.level*10+(player.stars.potential[0]+player.stars.potential[1])/20:player.rating;
 if(key==='potential')return player.stars?(player.stars.potential[0]+player.stars.potential[1])*5+player.stars.level/10:player.potential;
 if(key==='recent')return player.load??0;
 if(key==='name')return player.name;
 if(key==='fit')return player.position_notes?.[pickedRole()]??-1;
 if(key in (player.composites||{}))return player.composites[key];
 return player[key]??-1;
}
function squadHtml(byId){
 const {key,direction}=editor.sort,sign=direction==='asc'?1:-1;
 const role=pickedRole(),wanted=role?wantedAt(role):null,shown=columns();
 const rows=[...byId.values()].sort((a,b)=>{const x=sortValue(a,key),y=sortValue(b,key);return sign*(typeof x==='string'?x.localeCompare(y,'fr'):x-y)||a.id-b.id;});
 // In the game view, the composites the picked position asks for stand out in the header; the others are grey in every row.
 const headClass=([column,,opens])=>[opens?'group-start':'',wanted?.includes(column)?'wanted':''].filter(Boolean).join(' ');
 const head=shown.map(item=>{const [column,label]=item,classes=headClass(item);return `<th${classes?` class="${classes}"`:''}${column===key?` aria-sort="${direction==='asc'?'ascending':'descending'}"`:''}><button type="button" data-lineup-sort="${column}">${label}</button></th>`;}).join('');
 const body=rows.map(player=>{
  const spot=where(editor,player.id);
  const cells={
   selected:spot?spot.kind==='slot'?position(roles()[spot.index]):'<span class="position bench">REMP</span>':'',
   fit:role?fitAt(player,role):'',position:position(player.position),
   name:`<span class="lineup-name">${unavailableIcon(player)}<a href="#/player/${player.id}" draggable="false">${e(player.name)}</a></span>`,
   rating:levelStars(player),potential:potentialStars(player),fatigue:conditionIcon(player.fitness),
   recent:recentStrip(player,editor.data.recent_matches,editor.data.load_threshold),
   form:formBadge(player.form),appearances:appearances(player.appearances,player.substitutes),goals:player.goals,assists:player.assists,average:player.average?averageNote(player.average):'—'};
  const cell=([column,,opens])=>{const classes=[column==='name'?'strong':'',opens?'group-start':''].filter(Boolean).join(' ');
   return `<td${classes?` class="${classes}"`:''}>${column in cells?cells[column]:compositeCell(player,column,wanted||player.key_composites)}</td>`;};
  return `<tr data-player="${player.id}" draggable="true" class="${spot?'chosen':''}${player.unavailable?' invalid':''}${spot?.kind==='slot'&&spot.index===editor.picked?' picked':''}">${shown.map(cell).join('')}</tr>`;
 }).join('');
 return `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// What the club knows of its opponent: its name, a plane after it when the club plays at its ground, its rank and points in
// its league, its level and potential, the tactic it plays, its record where it plays this match, its last five matches of
// the season, its best players, those who cannot play, and the latest meeting of the two clubs.
export function scoutingHtml(scout){
 if(!scout)return '';
 const {club,standing,record}=scout;
 const major=safeColor(club.major_color)||'#8a9193',minor=safeColor(club.minor_color)||major;
 const crest=`<span class="crest mini-crest" style="background:linear-gradient(155deg,${major} 55%,${minor} 55%)"><img class="crest-logo" src="/crests/TCM1_${club.id}.png" alt="" loading="lazy" onerror="this.remove()"></span>`;
 const rank=standing?`<span class="scout-rank"><strong>${standing.rank}${standing.rank===1?'er':'e'}</strong><em>${number(standing.points)} pts</em></span>`:'';
 const grade=(label,value)=>`<div><span>${label}</span><strong>${noteStars(value,label,true)}</strong></div>`;
 // A match of its last five, as a played match of the top bar: the score from its side on the badge of its outcome, the
 // other club after its dot (a plane when it played away), the competition under it (a cup in blue), the day at the end.
 const played=match=>{
  const home=match.home.id===club.id,opponent=home?match.away:match.home,side=list=>(home?list:[...list].reverse()).join('–');
  const venue=match.neutral?'Terrain neutre':home?'Domicile':'Extérieur';
  const title=`${outcomeLabels[match.outcome]} · ${date(match.date)} · ${match.competition} · ${match.round_label} · ${venue}${match.penalties?` · t.a.b. ${side(match.penalties)}`:''}`;
  return `<a class="last-match ${match.outcome}" href="#/match/${match.id}" title="${e(title)}"><span class="last-match-score">${side(match.score)}</span>`
   +`<span class="next-match-body"><span class="next-match-who">${kitDot(opponent)}<b>${e(opponent.name)}</b>${home||match.neutral?'':awayIcon}</span><span class="next-match-comp${match.league?'':' cup'}">${e(match.competition)}</span></span>`
   +`<span class="last-match-date">${e(shortDate(match.date))}</span></a>`;
 };
 const person=player=>`<li>${position(player.position)}<a href="#/player/${player.id}">${e(player.name)}</a>${levelStars(player)}</li>`;
 const out=player=>`<li>${player.injured_until?`<span class="status danger" title="Retour le ${e(date(player.injured_until))}">✚ ${e(shortDate(player.injured_until))}</span>`:`<span class="status ban">${player.suspension} match${player.suspension>1?'s':''}</span>`}<a href="#/player/${player.id}">${e(player.name)}</a></li>`;
 const last=scout.last_meeting,matches=scout.last_matches||[];
 const meeting=last?`<a class="scout-meeting" href="#/match/${last.id}"><span>${e(last.round_label)} · ${e(last.home.name)} – ${e(last.away.name)}</span><span class="club-match-score ${last.outcome}" title="${outcomeLabels[last.outcome]}">${last.score.join(' – ')}</span></a>`:'';
 return `<aside class="card scout-card" aria-label="Adversaire"><div class="card-head"><h2>Adversaire</h2></div><div class="card-body">`
  +`<div class="scout-club">${crest}<span class="scout-name">${clubLink(club)}${scout.home||scout.match.neutral?'':awayIcon}</span>${rank}</div>`
  +`<div class="scout-facts"><div class="split">${grade('Niveau',club.top_rating)}${grade('Potentiel',club.top_potential)}</div>`
  +`<div><span>Tactique</span><strong>${e(club.formation||'—')}</strong></div><div><span>${record.venue==='away'?'À l’extérieur':'À domicile'}</span><strong>${record.won} V · ${record.drawn} N · ${record.lost} D</strong></div></div></div>`
  +(matches.length?`<h3 class="section-title">5 derniers matches</h3><div class="scout-matches">${matches.map(played).join('')}</div>`:'')
  +(scout.key_players.length?`<h3 class="section-title">Joueurs clés</h3><ul class="scout-players">${scout.key_players.map(person).join('')}</ul>`:'')
  +(scout.absent.length?`<h3 class="section-title">Absents</h3><ul class="scout-players absent">${scout.absent.map(out).join('')}</ul>`:'')
  +(meeting?`<div class="card-body">${meeting}</div>`:'')+'</aside>';
}

// What the lineup on screen is, to tell whether it is still the one a level of the automatic lineup gave.
const signature=()=>JSON.stringify([editor.formation,editor.slots,editor.bench]);
// The level whose lineup is on screen, or null once anything has changed it.
const autoLevel=()=>editor.auto&&editor.auto.signature===signature()?editor.auto.level:null;
// The automatic lineup: its levels, one click each, the one whose lineup is on screen marked; then its two options.
export function autoHtml(level=null,options=autoOptions){
 const levels=AUTO_LEVELS.map(([label,title],index)=>`<button type="button" data-lineup-auto="${index}" title="${e(title)}" aria-pressed="${index===level}" class="${index===level?'active':''}">${label}</button>`).join('');
 const toggles=AUTO_OPTIONS.map(([key,label,title])=>`<button type="button" class="check-option" data-lineup-option="${key}" aria-pressed="${!!options[key]}" title="${e(title)}"><span class="check"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg></span>${label}</button>`).join('');
 return `<div class="auto-group"><div class="segmented" role="group" aria-label="Composition auto">${levels}</div>${toggles}</div>`;
}

function editorHtml(){
 const byId=new Map(editor.data.players.map(player=>[player.id,player]));
 const current=roles(),cells=shape(),problems=lineupProblems(editor,current,editor.data.players);
 const tactics=steps(Object.keys(editor.tactics).map(name=>({value:name,label:name,divided:name===CUSTOM})),editor.formation,{name:'Formation',attribute:'tactic',forward:true});
 // The first problem is spelled out over the list, the others counted; all of them in the tooltip.
 const status=problems.length?`<span class="lineup-problems" role="status" title="${e(problems.join('\n'))}">${e(problems[0])}${problems.length>1?` <b>+${problems.length-1}</b>`:''}</span>`:'';
 const views=[['infos','Infos'],['jeu','Jeu']].map(([key,label])=>`<button type="button" data-lineup-view="${key}" aria-pressed="${key===squadView}" class="${key===squadView?'active':''}">${label}</button>`).join('');
 const scout=scoutingHtml(editor.data.scouting);
 return `<div class="lineup-layout${scout?' with-scout':''}"><div class="lineup-field"><div class="field-head">${tactics}</div><div class="pitch lineup-pitch" aria-label="Terrain · ${e(editor.formation)}">${PITCH_BOXES}${cellsHtml()}${editor.slots.map((id,index)=>slotHtml(id,current[index],cells[index],index,byId)).join('')}</div>
<h3 class="section-title">Remplaçants</h3><div class="lineup-bench" style="--bench:${editor.bench.length}">${editor.bench.map((id,index)=>benchHtml(id,index,byId)).join('')}</div></div>
<div class="lineup-list"><div class="lineup-toolbar">${status}${autoHtml(autoLevel())}<span class="toolbar-rule"></span><div class="segmented" role="group" aria-label="Colonnes">${views}</div></div><div class="lineup-squad" data-squad-drop>${squadHtml(byId)}</div></div>${scout}</div>`;
}

function refresh(){
 const form=document.querySelector('#lineup-form');if(!form)return;
 const scroll=form.querySelector('.lineup-squad .table-scroll')?.scrollTop;
 form.innerHTML=editorHtml();
 if(scroll)form.querySelector('.lineup-squad .table-scroll').scrollTop=scroll;
 document.dispatchEvent(new CustomEvent('lineup-change'));
}
function update(lineup){editor.slots=lineup.slots;editor.bench=lineup.bench;refresh();}
// A place moved onto a free cell makes the tactic on screen the club's own, in place of the one it had.
function reshape(index,key,column){
 const {places,order}=movePlace(shape(),index,key,column);
 editor.tactics[CUSTOM]=places;editor.formation=CUSTOM;
 editor.slots=order.map(rank=>editor.slots[rank]);
 if(editor.picked!=null)editor.picked=order.indexOf(editor.picked);
 refresh();
}
// Picking a position sorts the squad by its note there; letting it go returns to the lineup's order.
function pick(index){
 editor.picked=index;
 if(index!=null)editor.sort={key:'fit',direction:'desc'};
 else if(editor.sort.key==='fit')editor.sort={key:'selected',direction:'asc'};
 refresh();
}
const benchOf=(ids,size)=>Array.from({length:size},(_,index)=>ids[index]??null);
function load(formation,titulaires,banc){
 editor.formation=formation in editor.tactics?formation:Object.keys(editor.tactics)[0];
 const slots=shape().map(()=>null);
 titulaires.forEach(([id],index)=>{if(index<slots.length)slots[index]=id;});
 editor.slots=slots;editor.bench=benchOf(banc,editor.data.bench_size);
}

// The lineup editor of the controlled club, shown in its club page's Composition tab. Without a match to play today,
// it prepares the next one (or none, between seasons): the choices are kept for its day, when they can be played.
export async function compositionContent(params, state) {
 const requested=params.get('match')||state.awaiting_lineup;
 const data=await api(`/ma-partie/composition${requested?`?match_id=${requested}`:''}`);
 const matchId=data.match_id??0;
 if(editor?.matchId!==matchId){
  editor={matchId,data,tactics:tacticsOf(data),sort:{key:'selected',direction:'asc'},picked:null};
  load(data.default.formation,data.default.titulaires,data.default.banc);
 }else{
  // Fresh squad data (fitness, injuries) under the choices already made; players who left drop out.
  editor.data=data;
  const known=new Set(data.players.map(player=>player.id)),keep=id=>known.has(id)?id:null;
  editor.slots=editor.slots.map(keep);editor.bench=editor.bench.map(keep);
 }
 return `<section class="card composition-card"><div id="lineup-form" data-match="${matchId}">${editorHtml()}</div></section>`;
}

// The automatic lineup at a level, on the tactic on screen: the club's own by its positions, another by its name. The best
// eleven on a named tactic the AI may not change is known already; the rest is asked for. A tactic changed meanwhile
// keeps its lineup. The level stays marked while its lineup is on screen.
async function compose(level){
 const current=editor,wanted=roles().join(','),formation=editor.formation;
 const known=level===0&&!autoOptions.free&&formation!==CUSTOM?editor.data.suggestions?.[formation]:null;
 try{
  const best=known?{formation,...known}:await api(`/ma-partie/composition/suggestion?${query({...(formation===CUSTOM?{postes:wanted}:{formation}),
   niveau:level,jeunes:autoOptions.young||'',libre:autoOptions.free||'',match_id:current.data.match_id})}`);
  if(editor!==current||editor.formation!==formation||roles().join(',')!==wanted)return;
  load(best.formation,best.titulaires,best.banc);
  editor.auto={level,signature:signature()};
  if(editor.formation!==formation)pick(null);else refresh();
 }catch(error){toast(error.message,true);}
}

function install(){
 // The player dragged, and the place of the pitch he is dragged from (a place may be dragged empty).
 let dragged=null;
 const inside=target=>target.closest?.('#lineup-form');
 const dropTarget=target=>target.closest('[data-slot],[data-cell],[data-bench],[data-squad-drop]');
 // A place of the pitch lands on a free cell (the keeper's excepted) or on another place, whose player it takes
 // when it comes empty; a player also lands on the bench and the squad list.
 const accepts=target=>'cell' in target.dataset?dragged.slot!=null&&roles()[dragged.slot]!=='GB'
  :'slot' in target.dataset?dragged.player!=null||'player' in target.dataset:dragged.player!=null;
 document.addEventListener('dragstart',event=>{
  const source=event.target.closest?.('[draggable="true"]');
  if(!source||!inside(source)||!mounted())return;
  const pitch=source.closest('.lineup-pitch');
  dragged={player:source.dataset.player?Number(source.dataset.player):null,slot:pitch?Number(source.dataset.slot):null};
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',String(dragged.player??''));
  // The ghost is a shirt like the pitch's, not a table row: the player's place in the lineup, or his own position.
  const player=editor.data.players.find(item=>item.id===dragged.player),spot=player?where(editor,player.id):null;
  const role=pitch?roles()[dragged.slot]:spot?.kind==='slot'?roles()[spot.index]:player.position;
  const token=document.createElement('div');
  token.className=`pitch-player lineup-slot drag-token ${group(role)}${player?player.unavailable?' invalid':'':' empty'}`;
  token.innerHTML=`${kitShirt(teamKit(editor.data.club),shirtLabel(player,role),{empty:!player})}${slotBlock(player,role)}`;
  document.body.append(token);
  event.dataTransfer.setDragImage(token,token.offsetWidth/2,18);
  setTimeout(()=>token.remove());
  source.classList.add('dragging');
  if(pitch&&role!=='GB')pitch.classList.add('placing');
 });
 document.addEventListener('dragend',event=>{
  dragged=null;event.target.classList?.remove('dragging');
  document.querySelectorAll('#lineup-form .drop-hover').forEach(item=>item.classList.remove('drop-hover'));
  document.querySelectorAll('#lineup-form .placing').forEach(item=>item.classList.remove('placing'));
 });
 document.addEventListener('dragover',event=>{
  if(dragged==null||!inside(event.target))return;
  const target=dropTarget(event.target);if(!target||!accepts(target))return;
  event.preventDefault();event.dataTransfer.dropEffect='move';
  document.querySelectorAll('#lineup-form .drop-hover').forEach(item=>item!==target&&item.classList.remove('drop-hover'));
  target.classList.add('drop-hover');
 });
 document.addEventListener('drop',event=>{
  if(dragged==null||!inside(event.target)||!mounted())return;
  const target=dropTarget(event.target);if(!target||!accepts(target))return;
  event.preventDefault();
  const {player:id,slot}=dragged;dragged=null;
  if('cell' in target.dataset){const [key,column]=target.dataset.cell.split(':');reshape(slot,key,Number(column));}
  // Dropping back on the squad list takes the player out of the lineup, or swaps him with the unselected player of that row (and conversely).
  else if('squadDrop' in target.dataset){const row=event.target.closest('tr[data-player]');update(dropOnSquad(editor,id,row?Number(row.dataset.player):null));}
  else if('slot' in target.dataset&&id==null)update(place(editor,Number(target.dataset.player),{kind:'slot',index:slot}));
  else update(place(editor,id,'slot' in target.dataset?{kind:'slot',index:Number(target.dataset.slot)}:{kind:'bench',index:Number(target.dataset.bench)}));
 });
 document.addEventListener('click',event=>{
  // The first row of a player's menu takes him out of the lineup, or puts him on the next free place (`lineupAction`).
  const move=event.target.closest?.('[data-lineup-move]');
  if(move&&mounted()){
   const id=Number(move.dataset.lineupMove);
   if(where(editor,id))update(remove(editor,id));
   else{const target=nextFree(editor,roles());if(target)update(place(editor,id,target));}
   return;
  }
  // A click on a position of the pitch compares the squad on it; a second click, or another tactic, lets it go.
  const slot=event.target.closest?.('.lineup-pitch [data-slot]');
  if(slot&&inside(slot)&&mounted()){pick(editor.picked===Number(slot.dataset.slot)?null:Number(slot.dataset.slot));return;}
  const button=event.target.closest?.('button');
  if(!button||!inside(button)||!mounted())return;
  if(button.dataset.tactic&&button.dataset.tactic!==editor.formation){
   const next=button.dataset.tactic;
   editor.slots=changeFormation(editor.slots,roles(),editor.tactics[next].map(item=>item.role));
   editor.formation=next;pick(null);
  }
  if(button.dataset.lineupView&&button.dataset.lineupView!==squadView){
   squadView=button.dataset.lineupView;
   if(!columns().some(([column])=>column===editor.sort.key))editor.sort={key:'selected',direction:'asc'};
   refresh();
  }
  if(button.dataset.lineupAuto)compose(Number(button.dataset.lineupAuto));
  // An option changed while a level's lineup is on screen composes it again at once.
  if(button.dataset.lineupOption){
   const level=autoLevel();
   autoOptions[button.dataset.lineupOption]=!autoOptions[button.dataset.lineupOption];
   if(level!=null)compose(level);else refresh();
  }
  if(button.dataset.lineupSort){
   const key=button.dataset.lineupSort,same=editor.sort.key===key;
   editor.sort={key,direction:same?(editor.sort.direction==='asc'?'desc':'asc'):['selected','position','name'].includes(key)?'asc':'desc'};
   refresh();
  }
 });
}
if(typeof document!=='undefined')install();
