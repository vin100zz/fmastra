import {monthlySalary} from './salaries.js';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export const number = value => new Intl.NumberFormat('fr-FR', {maximumFractionDigits:1}).format(value ?? 0);
// Matches played as starts, with the ones coming off the bench in brackets: "12 (3)", or just "12" without any.
export const appearances = (total, substitutes=0) => substitutes ? `${number(total-substitutes)} (${number(substitutes)})` : number(total);
export const minutes = value => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(value??0);
export const facilityRating = value => value == null ? '—' : `${number(value)} / 20`;
export const money = value => new Intl.NumberFormat('fr-FR', {style:'currency',currency:'EUR',maximumFractionDigits:0,maximumSignificantDigits:2,notation:Math.abs(value)>=1e6?'compact':'standard'}).format(value ?? 0);
export const attributeScore = value => Math.max(1,Math.min(20,Math.round(value/5)));
export const level = value => value==null ? null : Math.round(value*2);
// Red (hue 0) at `low` or less, yellow (50) at `mid`, green (120) at `high` or more.
const gradeHue = (value, low, mid, high) => {const clamped=Math.max(low,Math.min(high,value)); return Math.round(clamped<=mid?(clamped-low)/(mid-low)*50:50+(clamped-mid)/(high-mid)*70);};
// Level and potential are out of 200 (the median player is 110); attributes and position ratings are out of 20 (median 10).
export const levelHue = score => gradeHue(score,70,110,150);
export const scoreHue = score => gradeHue(score,4,10,16);
const gradedBadge = (text, hue, title) => `<span class="rating graded" style="--hue:${hue}"${title?` title="${escape(title)}"`:''}>${text}</span>`;
export const levelBadge = (value, title) => value==null ? '—' : gradedBadge(level(value),levelHue(level(value)),title);
export const scoreBadge = (score, title) => score==null ? '—' : gradedBadge(score,scoreHue(score),title);
export const date = (value, full=false) => value ? new Intl.DateTimeFormat('fr-FR', full ? {weekday:'long',day:'numeric',month:'long',year:'numeric'} : {day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`)) : '—';
export const season = value => `${value} / ${value+1}`;
export const safeColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
export const contrastText = hex => {const color=safeColor(hex); if(!color) return '#2c3a30'; const r=parseInt(color.slice(1,3),16),g=parseInt(color.slice(3,5),16),b=parseInt(color.slice(5,7),16); return (0.299*r+0.587*g+0.114*b)/255>0.6?'#1c2b22':'#ffffff';};
const luminance = hex => {const [r,g,b]=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.03928?value/12.92:((value+.055)/1.055)**2.4); return .2126*r+.7152*g+.0722*b;};
export const contrastRatio = (first, second) => {const [light,dark]=[luminance(first),luminance(second)].sort((a,b)=>b-a); return (light+.05)/(dark+.05);};
// A shirt in a club's kit: the primary colour for the shirt, the secondary one for its number, with a halo (dark on a light
// number, light on a dark one) when the two are too close to read.
export const kitShirtStyle = (major, minor) => `background:${major};color:${minor}${contrastRatio(major,minor)<3?`;text-shadow:${[2,2,3].map(blur=>`0 0 ${blur}px ${contrastText(minor)}`).join(',')}`:''}`;
export const kitDot = club => {const major=safeColor(club?.major_color); if(!major) return ''; const minor=safeColor(club?.minor_color)||major; return `<i class="kit-dot" style="background:linear-gradient(135deg,${major} 50%,${minor} 50%)" aria-hidden="true"></i>`;};
let nations={};
export const setNations = data => nations=data||{};
export const nationName = code => nations[code]?.name || code || '—';
const flagImage = info => info?.flag?`<img class="flag" src="/flags/${info.flag}.svg" alt="" width="16" height="12" loading="lazy">`:'';
export const nationBadge = (code, {full=false}={}) => {const info=nations[code]; const label=full?(info?.name||code||'—'):(info?.display_code||code||'—'); return `<span class="nation" title="${escape(info?.name||code||'')}">${flagImage(info)}${escape(label)}</span>`;};
// The flag alone, named in its tooltip, for compact cells; empty when the nation or its flag is unknown.
export const nationFlag = code => nations[code]?.flag ? `<span class="nation" title="${escape(nations[code].name||code)}">${flagImage(nations[code])}</span>` : '';
export const nationBadges = (codes, options) => (codes&&codes.length?codes:['—']).map(code=>nationBadge(code,options)).join(' · ');
export const clubLink = club => club ? `<a href="#/${club.national?'international/nation':'club'}/${club.id}" class="club-link">${club.national?`<span class="nation">${nationFlag(club.nation)}${escape(club.name)}</span>`:`${kitDot(club)}${escape(club.name)}`}</a>` : '<span class="muted">Libre</span>';
export const playerLink = (id, name) => id<0?`<span class="temporary-player" title="Joueur temporaire hors du marché des transferts">${escape(name || 'Joueur temporaire')} <small>(temp.)</small></span>`:`<a href="#/player/${id}">${escape(name || 'Joueur archivé')}</a>`;
export const group = role => role === 'GB' ? 'gk' : ['DC','DL','DR'].includes(role) ? 'def' : ['BU','AILG','AILD'].includes(role) ? 'att' : 'mid';
export const position = value => `<span class="position ${group(value)}">${escape(value)}</span>`;
// The family name for tight spaces: the last word with the particles before it ("de Lange", "Van der Sar"), never the first word.
const PARTICLES=new Set(['da','das','de','del','della','den','der','des','di','do','dos','du','el','la','le','lo','ten','ter','van','von']);
export const surname = name => {const words=String(name??'').trim().split(/\s+/);let start=words.length-1;while(start>1&&PARTICLES.has(words[start-1].toLowerCase()))start--;return words.slice(start).join(' ');};
export const initials = value => escape(value.split(/\s+/).map(part=>part[0]).slice(0,2).join(''));
export const form = value => `<span class="form">${[...value].map(letter=>`<i class="${letter}">${letter}</i>`).join('')}</span>`;
export const empty = (text='Les données apparaîtront au fil de la saison.', title='L’histoire reste à écrire') => `<div class="empty"><strong>${escape(title)}</strong>${escape(text)}</div>`;
export const card = (title, content, action='', className='') => `<section class="card${className?` ${className}`:''}"><div class="card-head"><h2>${escape(title)}</h2>${action}</div>${content}</section>`;
export const stat = (label, value, hint='') => `<div class="stat-card"><span class="label">${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(hint)}</small></div>`;
export const fact = (label,value) => `<div class="fact"><span>${escape(label)}</span><strong>${value}</strong></div>`;
// `lead` (the block stepping between peers) sits at the left of the title.
// A page title on its own: the name of the left-menu entry it belongs to, with neither line above nor below.
export const heading = (title,extra='',lead='') => {const text=`<div><h1>${escape(title)}</h1></div>`;return `<div class="page-heading">${lead?`<div class="heading-with-lead">${lead}${text}</div>`:text}${extra}</div>`;};
export const tabs = (base, items, active) => `<nav class="tabs" aria-label="Sections">${items.map(([key,label])=>`<a class="${key===active?'active':''}" href="${base}/${key}">${escape(label)}</a>`).join('')}</nav>`;
export function table(headers, rows, footer, rowClasses, sort) {
 const head=item=>sort?`<button class="sort-toggle" data-table-sort>${item}</button>`:item;
 const cell=(cell,index,column)=>sort?`<td data-value="${escape(sort.values[index][column]??'')}">${cell}</td>`:`<td>${cell}</td>`;
 const first=index=>sort?.ascending?.includes(index)?' data-first="asc"':'';
 return rows.length ? `<div class="table-scroll"><table${sort?' data-sortable':''}><thead><tr>${headers.map((item,index)=>`<th${first(index)}>${head(item)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,index)=>`<tr class="${rowClasses?.[index]||''}"${sort?` data-row="${index}"`:''}>${row.map((item,column)=>cell(item,index,column)).join('')}</tr>`).join('')}</tbody>${footer?`<tfoot><tr>${footer.map(cell=>`<td>${cell}</td>`).join('')}</tr></tfoot>`:''}</table></div>` : empty();
}
// A short list shown whole, sorted in the browser: `values` holds the raw value behind each cell ('' when unknown);
// `ascending` lists the columns whose first click runs from smallest to largest (ranks), the others start from the largest.
export const sortableTable = (headers, rows, values, {footer, rowClasses, ascending}={}) => table(headers,rows,footer,rowClasses,{values,ascending});
const collator = new Intl.Collator('fr',{sensitivity:'base',numeric:true});
export const compareValues = (a, b) => {const x=Number(a),y=Number(b); return Number.isFinite(x)&&Number.isFinite(y)?x-y:collator.compare(a,b);};
const cellValue = (row, column) => row.cells[column].dataset.value;
export function nextDirection(table, column) {
 const head=table.tHead.rows[0].cells[column],current=head.getAttribute('aria-sort');
 if(current)return current==='ascending'?'desc':'asc';
 if(head.dataset.first)return head.dataset.first;
 return [...table.tBodies[0].rows].every(row=>cellValue(row,column)===''||Number.isFinite(Number(cellValue(row,column))))?'desc':'asc';
}
export function sortTable(table, column, direction) {
 const rows=[...table.tBodies[0].rows],sign=direction==='asc'?1:-1;
 // Unknown values stay last in either direction; ties keep the order the page came in.
 const known=rows.filter(row=>cellValue(row,column)!==''),unknown=rows.filter(row=>cellValue(row,column)==='');
 known.sort((a,b)=>sign*compareValues(cellValue(a,column),cellValue(b,column))||a.dataset.row-b.dataset.row);
 table.tBodies[0].append(...known,...unknown);
 [...table.tHead.rows[0].cells].forEach((head,index)=>index===column?head.setAttribute('aria-sort',direction==='asc'?'ascending':'descending'):head.removeAttribute('aria-sort'));
}
// The active column carries its direction, so a click never has to guess it from the URL; text columns start A→Z.
export const sortButton = (key, label, sorted, order, first='desc') => `<button data-first="${first}"${key===sorted?` data-order="${order}"`:''} data-sort="${key}">${label} ${key===sorted?(order==='desc'?'↓':'↑'):''}</button>`;
export function pager(data) {if(data.total<=data.page_size) return `<div class="pager">${number(data.total)} résultat${data.total>1?'s':''}</div>`;return `<div class="pager"><span>${(data.page-1)*data.page_size+1}–${Math.min(data.page*data.page_size,data.total)} sur ${number(data.total)}</span><div><button data-page="${data.page-1}" ${data.page<=1?'disabled':''}>← Précédent</button><button data-page="${data.page+1}" ${data.page*data.page_size>=data.total?'disabled':''}>Suivant →</button></div></div>`;}
const textColumns=['position','name','nation','club','academy_club'];
export function playerTable(data, withClub=false, sorted='rating', order='desc', options={}) {
 const columns=[['position','POSTE'],['name','JOUEUR'],['nation','NAT.'],['age','ÂGE'],['rating','NIV.'],['potential','POT.'],...(withClub?[['club','CLUB']]:[]),['value','VALEUR'],['wage','SALAIRE / MOIS'],['contract_end','CONTRAT'],['fitness','ÉTAT'],...(!withClub?[['appearances','MJ'],['goals','BUTS'],['assists','PD'],['yellows','CJ'],['reds','CR'],['average','NOTE']]:[]),...(options.academy?[['promotion_date','PROMOTION'],['academy_club','CLUB FORMATEUR'],['data_at','DONNÉES']]:[])];
 const rows=data.items.map(player=>{
  const cells={
   position:player.position?position(player.position):'—',name:`<span class="strong">${playerLink(player.id,player.name)}</span>`,
   nation:nationBadges(player.nationalities||[player.nation]),
   age:player.age??'—',rating:levelBadge(player.rating,'Niveau actuel sur 200'),potential:levelBadge(player.potential,'Potentiel sur 200'),club:player.data_at==='unknown'?'—':clubLink(player.club),
   value:player.value==null?'—':money(player.value),wage:player.wage==null?'—':monthlySalary(player.wage),contract_end:`<span class="${player.expiring?'danger':''}">${date(player.contract_end)}</span>`,
   fitness:player.fitness==null?'—':player.injured_until?`<span class="status danger" title="Retour le ${escape(date(player.injured_until))}">✚ Blessé</span>`:player.suspension?`<span class="status danger">▰ ${player.suspension} match(s)</span>`:`<span class="status">${Math.round(player.fitness*100)}%</span>`,
   promotion_date:date(player.promotion_date),academy_club:clubLink(player.academy_club),data_at:({promotion:'À la promotion',current:'Actuelles',unknown:'Non archivées'})[player.data_at],
   appearances:appearances(player.appearances,player.substitutes),goals:player.goals,assists:player.assists,yellows:player.yellows,reds:player.reds,average:player.average?number(player.average):'—',
  };
  return columns.map(([key])=>cells[key]);
 });
 return `<div class="player-table">${table(columns.map(([key,label])=>options.sortable===false?label:sortButton(key,label,sorted,order,textColumns.includes(key)?'asc':'desc')),rows)}</div>`+pager(data);
}
export function standingsTable(data, compact=false, sortable=false) {
 const rowClasses=data.items.map(row=>row.movement==='direct'?'europe-direct':row.movement==='playoff'?'europe-playoff':row.movement==='europe'?'qualified-europe':row.movement==='relegation'?'relegated':row.movement==='promotion'||row.movement==='champion'?'promoted':'');
 // Direct, play-off and European places are told by the row background alone (see rowClasses); only the icons below mark a row.
 const icon=row=>row.movement==='champion'?' <span class="movement-icon promotion" title="Champion" aria-label="Champion">★</span>':row.movement==='promotion'?' <span class="movement-icon promotion" title="Place de promotion" aria-label="Place de promotion">↑</span>':row.movement==='relegation'?' <span class="movement-icon relegation" title="Place de relégation" aria-label="Place de relégation">↓</span>':'';
 const cells=data.items.map(row=>[`<span class="rank ${row.rank===1?'first':''}">${row.rank}</span>`,`<span class="strong">${clubLink(row.club)}</span>${icon(row)}`,row.played,...(compact?[]:[row.won,row.drawn,row.lost,row.goals_for,row.goals_against]),row.difference>0?`+${row.difference}`:row.difference,`<b>${row.points}</b>`,...(compact?[]:[form(row.form)])]);
 const headers=compact?['#','CLUB','J','DIFF.','PTS']:['#','CLUB','J','V','N','D','BP','BC','DIFF.','PTS','FORME'];
 // Form sorts by the points of the last five matches.
 const points=row=>[...row.form].reduce((sum,letter)=>sum+(letter==='V'?3:letter==='N'?1:0),0);
 const values=()=>data.items.map(row=>[row.rank,row.club?.name,row.played,...(compact?[]:[row.won,row.drawn,row.lost,row.goals_for,row.goals_against]),row.difference,row.points,...(compact?[]:[points(row)])]);
 return table(headers,cells,undefined,rowClasses,sortable?{values:values(),ascending:[0]}:undefined);
}
export function fixtures(data, showDates=false) {if(!data.items.length)return empty('Aucun match programmé pour cette sélection.');let previous='';return data.items.map(match=>{const label=showDates&&previous!==match.date?`<div class="fixture-date">${date(match.date)}${match.competition?` · ${escape(match.competition)}`:''} · ${escape(match.round_label||`Journée ${match.round}`)}</div>`:'';previous=match.date;return `${label}<div class="fixture"><div class="home">${clubLink(match.home)}</div><a class="score ${match.score?'':'pending'}" href="#/match/${match.id}">${match.score?match.score.join(' – '):'À venir'}${match.aggregate?`<small class="aggregate-score">Cumul ${match.aggregate.join(' – ')}</small>`:''}${match.penalties?`<small class="shootout-score">${match.penalties.join(' – ')} t.a.b.</small>`:''}</a><div>${clubLink(match.away)}</div></div>`;}).join('');}
// `compact` names players by surname, for a pitch a few hundred pixels wide; `kit` ({major, minor} hex colours) shirts them in a club's colours
// instead of one colour per position (match-only players keep their grey shirt); `marks(player)` adds icons beside a shirt.
export function pitch(lineup,label='Composition initiale',{compact=false,kit=null,marks=null}={}){
 const colors=safeColor(kit?.major)?{major:kit.major,minor:safeColor(kit.minor)||kit.major}:null;
 const bands={GB:90,DC:75,DL:69,DR:69,MDC:59,MC:47,MOC:33,AILG:22,AILD:22,BU:14};
 // Full-backs and centre-backs form one line, spread from left to right; each other position spreads within its own band.
 const line=player=>['DL','DC','DR'].includes(player.position)?'defence':bands[player.position]??45;
 const lateral={DL:0,DC:1,DR:2};
 const rows={};lineup.forEach(player=>(rows[line(player)]??=[]).push(player));
 Object.values(rows).forEach(row=>row.sort((a,b)=>(lateral[a.position]??1)-(lateral[b.position]??1)));
 return `<div class="pitch" aria-label="${escape(label)}">${lineup.map(player=>{const row=rows[line(player)];const y=bands[player.position]??45;let x=50+(row.indexOf(player)-(row.length-1)/2)*Math.min(30,78/Math.max(1,row.length-1));if(player.position==='AILG')x=15;if(player.position==='AILD')x=85;return `<${player.temporary?'span':'a'} ${player.temporary?'title="Joueur temporaire"':`href="#/player/${player.id}" title="${escape(player.name)}"`} class="pitch-player ${group(player.position)} ${player.temporary?'temporary-player':''}" style="left:${x}%;top:${y}%"><span class="shirt"${colors&&!player.temporary?` style="${kitShirtStyle(colors.major,colors.minor)}"`:''}>${player.stats?.rating?number(player.stats.rating):player.position}</span>${marks?marks(player):''}<small>${escape(compact?surname(player.name):player.name)}${player.temporary?' (temp.)':''}</small></${player.temporary?'span':'a'}>`;}).join('')}</div>`;
}
export const api = async (path, body) => {const response = await fetch(`/api${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const data=await response.json();if(!response.ok){const error=new Error(typeof data.detail==='string'?data.detail: 'La requête contient une valeur invalide.');error.status=response.status;throw error;}return data;};
export function toast(message,error=false){const element=document.querySelector('#toast');element.textContent=message;element.classList.toggle('error',error);element.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>element.hidden=true,error?9000:4500);}
export const query = values => {const result=new URLSearchParams();Object.entries(values).forEach(([key,value])=>{if(value!==''&&value!==null&&value!==undefined)result.set(key,value);});return result.toString();};

export function seasonArchives(data){
 return data.items.map((row,index)=>`<details class="card season-archive" ${index===0?'open':''}><summary>Saison ${season(row.season)} · Classement complet</summary>${standingsTable({items:row.standings||[]},false,true)}</details>`).join('');
}

// The players with the most matches and the most goals in a club or a competition, side by side (`leaders` comes from the API).
export function leadersCards(leaders,note='Toutes saisons confondues, saison en cours incluse.'){
 const list=(title,rows)=>`<section aria-label="${escape(title)}">${card(`${title} · ${rows.length}`,rows.length?table(['#','JOUEUR','MATCHS','BUTS'],rows.map((row,index)=>[index+1,`<span class="strong">${playerLink(row.player_id,row.player)}</span>`,number(row.matches),number(row.goals)])):empty('Aucun joueur pour l’instant.','Pas encore de statistiques'))}</section>`;
 return `<p class="muted">${escape(note)}</p><div class="transfer-columns">${list('Joueurs les plus utilisés',leaders.matches)}${list('Meilleurs buteurs',leaders.goals)}</div>`;
}
