import {monthlySalary} from './salaries.js';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export const number = value => new Intl.NumberFormat('fr-FR', {maximumFractionDigits:1}).format(value ?? 0);
// Matches played as starts, with the ones coming off the bench in brackets: "12 (3)", or just "12" without any.
export const appearances = (total, substitutes=0) => substitutes ? `${number(total-substitutes)} (${number(substitutes)})` : number(total);
export const minutes = value => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(value??0);
export const facilityRating = value => value == null ? '—' : `${number(value)} / 20`;
export const money = value => new Intl.NumberFormat('fr-FR', {style:'currency',currency:'EUR',maximumFractionDigits:0,maximumSignificantDigits:2,notation:Math.abs(value)>=1e6?'compact':'standard'}).format(value ?? 0);
// A fee to act on (an asking price, a counter-offer): three significant digits, as the server rounds it up.
export const price = value => new Intl.NumberFormat('fr-FR', {style:'currency',currency:'EUR',maximumSignificantDigits:3,notation:Math.abs(value)>=1e6?'compact':'standard'}).format(value ?? 0);
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
// A player's note at a position, out of 200 like the level: the mean of the composites `keys` that position asks for, times the
// engine's factor for his affinity there (see /api). The pitches of the lineup and of the player page show it beside the shirt.
export const positionNote = (player, role, keys=[]) => player?.position_notes?.[role]==null ? ''
 : levelBadge(player.position_notes[role],`Note au poste ${role} : ${keys.map(key=>COMPOSITES[key]).join(', ')}, affinité au poste comprise`);
// Form as its effect on all a player does in a match: 1.11 reads "+11 %"; within ±2 % it changes nothing (`neutral`).
export const formReading = form => {
 const pct=Math.round((form-1)*100),neutral=Math.abs(pct)<=2,text=pct>0?`+${pct} %`:pct<0?`−${-pct} %`:'0 %';
 return {pct,neutral,text,title:`Forme ${form.toFixed(2).replace('.',',')} : ${neutral?'il joue à son niveau':`tout ce qu'il fait en match compte ${Math.abs(pct)} % de ${pct>0?'plus':'moins'}`}`};
};
// In green or red; grey when neutral.
export const formBadge = form => {
 if(form==null)return '—';
 const {pct,neutral,text,title}=formReading(form);
 return neutral?`<span class="rating form-badge neutral" title="${escape(title)}">${text}</span>`:gradedBadge(text,pct>0?120:0,title).replace('class="rating graded"','class="rating graded form-badge"');
};
// An arrow for a form worth at least 5 % either way in a match: on the lineup's pitch, and beside the note at a position.
export const formArrow = form => {
 const pct=form==null?0:Math.round((form-1)*100);
 return Math.abs(pct)<5?'':`<i class="form-arrow ${pct>0?'up':'down'}" title="Forme ${pct>0?'+':'−'}${Math.abs(pct)} %">${pct>0?'▲':'▼'}</i>`;
};
// Morale below this names what holds it down.
const MORALE_LOW=.7;
const MORALE_CAUSES={salaire:['€','son salaire'],temps_de_jeu:['◷','son temps de jeu'],ambition:['★','un club en dessous de son niveau']};
// A morale read for display: out of 100 with its hue, where it drifts week after week, its main cause ([icon, words]; only when
// low, unless `always`) and the sentence telling it all (squad rows and player page of /api).
export function moraleReading(player, always=false) {
 const value=Math.round(player.morale*100),target=player.morale_target==null?null:Math.round(player.morale_target*100);
 const cause=(always||player.morale<MORALE_LOW)&&MORALE_CAUSES[player.morale_cause]||null;
 const share=value=>`${Math.round(value*100)} % de ce qu'il attend`;
 const title=[`Moral ${value} %${target!=null&&target!==value?`, vers ${target} %`:''}`,...(cause?[`pèse surtout : ${cause[1]}`]:[]),
  ...(player.wage_satisfaction!=null?[`salaire : ${share(player.wage_satisfaction)}`,`temps de jeu : ${share(player.playing_time_satisfaction)}`]:[])].join(' · ');
 return {value,target,cause,title,hue:gradeHue(value,40,60,80)};
}
// Morale out of 100, an arrow towards where it drifts, and its main cause when low.
export function moraleCell(player) {
 if(player.morale==null)return '—';
 const {value,target,cause,title,hue}=moraleReading(player);
 const trend=target==null||Math.abs(target-value)<3?'':target>value?'<span class="trend up">▲</span>':'<span class="trend down">▼</span>';
 return `<span class="morale-cell" title="${escape(title)}">${gradedBadge(`${value} %`,hue)}<span class="trend-slot">${trend}</span>${cause?`<span class="morale-cause">${cause[0]}</span>`:''}</span>`;
}
// The affinity to a position out of 20, only below 20: a tag on the corner of the shirt.
export const affinityTag = (value, role) => value==null||value>=20 ? '' : `<i class="affinity-tag" style="--hue:${scoreHue(value)}" title="Affinité ${escape(role)} : ${value} / 20">${value}</i>`;
export const ATTRIBUTES={passe:'Passe',technique:'Technique',finition:'Finition',tacle:'Tacle',jeu_tete:'Jeu de tête',vision:'Vision',placement:'Placement',sang_froid:'Sang-froid',vitesse:'Vitesse',endurance:'Endurance',reflexes:'Réflexes',sorties:'Sorties',relance:'Relance',centre:'Centres',cpa:'Coups arrêtés'};
// What an attribute is for decides its section; the attributes of a section always come in the same order.
export const ATTRIBUTE_SECTIONS=[
 {key:'goalkeeper',title:'Gardien',attributes:['reflexes','sorties','relance']},
 {key:'defense',title:'Défense',attributes:['tacle','placement']},
 {key:'attack',title:'Attaque',attributes:['finition','sang_froid','technique','vision','jeu_tete','centre','cpa']},
 {key:'general',title:'Général',attributes:['passe','vitesse','endurance']}];
// The composites the match engine plays with (`attributs.composites`), out of 200 like the level, by the phase they decide.
export const COMPOSITES={progression_attaque:'Progression',occasion_attaque:'Création',tir:'Frappe',tete:'Jeu aérien',progression_defense:'Défense au milieu',occasion_defense:'Défense de surface',arret:'Arrêts',sortie:'Sorties aériennes'};
export const COMPOSITE_SECTIONS=[
 {key:'attack',title:'Attaque',composites:['progression_attaque','occasion_attaque','tir','tete']},
 {key:'defense',title:'Défense',composites:['progression_defense','occasion_defense']},
 {key:'goalkeeper',title:'Gardien',composites:['arret','sortie']}];
export const date =(value, full=false) => value ? new Intl.DateTimeFormat('fr-FR', full ? {weekday:'long',day:'numeric',month:'long',year:'numeric'} : {day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`)) : '—';
export const season = value => `${value} / ${value+1}`;
export const safeColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
export const contrastText = hex => {const color=safeColor(hex); if(!color) return '#2c3a30'; const r=parseInt(color.slice(1,3),16),g=parseInt(color.slice(3,5),16),b=parseInt(color.slice(5,7),16); return (0.299*r+0.587*g+0.114*b)/255>0.6?'#1c2b22':'#ffffff';};
const luminance = hex => {const [r,g,b]=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.03928?value/12.92:((value+.055)/1.055)**2.4); return .2126*r+.7152*g+.0722*b;};
export const contrastRatio = (first, second) => {const [light,dark]=[luminance(first),luminance(second)].sort((a,b)=>b-a); return (light+.05)/(dark+.05);};
// A shirt in a club's kit: the primary colour for the shirt, the secondary one for its number and a corner cut on the diagonal (as the kit dot), with a halo (dark on a light
// number, light on a dark one) when the two are too close to read.
export const kitShirtStyle = (major, minor) => `background:linear-gradient(135deg,${major} 78%,${minor} 78%);color:${minor}${contrastRatio(major,minor)<3?`;text-shadow:${[2,2,3].map(blur=>`0 0 ${blur}px ${contrastText(minor)}`).join(',')}`:''}`;
export const kitDot = club => {const major=safeColor(club?.major_color); if(!major) return ''; const minor=safeColor(club?.minor_color)||major; return `<i class="kit-dot" style="background:linear-gradient(135deg,${major} 50%,${minor} 50%)" aria-hidden="true"></i>`;};
let nations={},today=null;
// The game date, for durations counted from today (the injury column).
export const setToday = value => today=value;
// Time left, rounded to the most readable unit: "3 jours", "2 semaines", "1 mois".
export const duration = until => {
 const days=today?Math.max(1,Math.round((new Date(`${until}T12:00:00`)-new Date(`${today}T12:00:00`))/864e5)):null;
 if(days==null)return 'Blessé';
 if(days<7)return `${days} jour${days>1?'s':''}`;
 if(days<30){const weeks=Math.round(days/7);return `${weeks} semaine${weeks>1?'s':''}`;}
 return `${Math.max(1,Math.round(days/30))} mois`;
};
export const setNations = data => nations=data||{};
export const nationName = code => nations[code]?.name || code || '—';
const flagImage = info => info?.flag?`<img class="flag" src="/flags/${info.flag}.svg" alt="" width="16" height="12" loading="lazy">`:'';
export const nationBadge = (code, {full=false}={}) => {const info=nations[code]; const label=full?(info?.name||code||'—'):(info?.display_code||code||'—'); return `<span class="nation" title="${escape(info?.name||code||'')}">${flagImage(info)}${escape(label)}</span>`;};
// The flag alone, named in its tooltip, for compact cells; empty when the nation or its flag is unknown.
export const nationFlag = code => nations[code]?.flag ? `<span class="nation" title="${escape(nations[code].name||code)}">${flagImage(nations[code])}</span>` : '';
export const nationBadges = (codes, options) => (codes&&codes.length?codes:['—']).map(code=>nationBadge(code,options)).join(' · ');
export const clubLink = club => club ? `<a href="#/${club.national?'international/nation':'club'}/${club.id}" class="club-link">${club.national?`<span class="nation">${nationFlag(club.nation)}${escape(club.name)}</span>`:`${kitDot(club)}${escape(club.name)}`}</a>` : '<span class="muted">Libre</span>';
export const playerLink = (id, name) => id<0?`<span class="temporary-player" title="Joueur temporaire hors du marché des transferts">${escape(name || 'Joueur temporaire')} <small>(temp.)</small></span>`:`<a href="#/player/${id}">${escape(name || 'Joueur archivé')}</a>`;
export const group = role => role === 'GB' ? 'gk' : ['DC','DG','DD'].includes(role) ? 'def' : ['BU','AILG','AILD'].includes(role) ? 'att' : 'mid';
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
// `headClasses` gives each column's header a class ('' for none). `groups` names the heading over each column (null for none): the columns
// under one heading share it on a first header row and have their own headers on a second one, the others span both rows.
// `rowAttributes` adds attributes to each body row ('' for none).
export function table(headers, rows, footer, rowClasses, sort, headClasses, groups, rowAttributes) {
 const head=item=>sort?`<button class="sort-toggle" data-table-sort>${item}</button>`:item;
 const cell=(cell,index,column)=>sort?`<td data-value="${escape(sort.values[index][column]??'')}">${cell}</td>`:`<td>${cell}</td>`;
 const first=index=>sort?.ascending?.includes(index)?' data-first="asc"':'';
 const th=(index,span='')=>`<th${span}${headClasses?.[index]?` class="${headClasses[index]}"`:''}${first(index)}>${head(headers[index])}</th>`;
 const columns=headers.map((item,index)=>index);
 let thead=`<tr>${columns.map(index=>th(index)).join('')}</tr>`,colgroup='';
 if(groups?.some(Boolean)){
  const starts=index=>groups[index]&&groups[index]!==groups[index-1];
  const span=index=>{let end=index;while(groups[end+1]===groups[index])end++;return end-index+1;};
  thead=`<tr>${columns.map(index=>!groups[index]?th(index,' rowspan="2"'):starts(index)?`<th colspan="${span(index)}" class="column-group">${escape(groups[index])}</th>`:'').join('')}</tr><tr>${columns.filter(index=>groups[index]).map(index=>th(index)).join('')}</tr>`;
  // A fixed layout takes its widths from the first row, where the headings span their columns: those columns get theirs from a <col>.
  colgroup=`<colgroup>${columns.map(index=>`<col${groups[index]?` class="grouped${starts(index)?' group-start':''}"`:''}>`).join('')}</colgroup>`;
 }
 return rows.length ? `<div class="table-scroll"><table${sort?' data-sortable':''}>${colgroup}<thead>${thead}</thead><tbody>${rows.map((row,index)=>`<tr class="${rowClasses?.[index]||''}"${sort?` data-row="${index}"`:''}${rowAttributes?.[index]?` ${rowAttributes[index]}`:''}>${row.map((item,column)=>cell(item,index,column)).join('')}</tr>`).join('')}</tbody>${footer?`<tfoot><tr>${footer.map(cell=>`<td>${cell}</td>`).join('')}</tr></tfoot>`:''}</table></div>` : empty();
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
// The arrow comes from the style sheet, like on the tables sorted in the browser.
export const sortButton = (key, label, sorted, order, first='desc') => `<button data-first="${first}"${key===sorted?` data-order="${order}"`:''} data-sort="${key}">${label}</button>`;
export function pager(data) {if(data.total<=data.page_size) return `<div class="pager">${number(data.total)} résultat${data.total>1?'s':''}</div>`;return `<div class="pager"><span>${(data.page-1)*data.page_size+1}–${Math.min(data.page*data.page_size,data.total)} sur ${number(data.total)}</span><div><button data-page="${data.page-1}" ${data.page<=1?'disabled':''}>← Précédent</button><button data-page="${data.page+1}" ${data.page*data.page_size>=data.total?'disabled':''}>Suivant →</button></div></div>`;}
// The same pages from the head of a card: the range shown and two square steps; nothing for a list that fits on one page.
export function headPager(data) {
 if(data.total<=data.page_size)return '';
 const first=(data.page-1)*data.page_size+1,last=Math.min(data.page*data.page_size,data.total);
 return `<div class="head-pager"><span>${number(first)}–${number(last)} sur ${number(data.total)}</span><button type="button" data-page="${data.page-1}" aria-label="Page précédente" ${data.page<=1?'disabled':''}>‹</button><button type="button" data-page="${data.page+1}" aria-label="Page suivante" ${last>=data.total?'disabled':''}>›</button></div>`;
}
// A figure, set to the right of its column.
export const figure = value => `<span class="num">${value}</span>`;
// A thin bar beside a figure of a list: `share` of its width filled.
export const miniBar = (share, modifier='') => `<i class="mini-bar${modifier?` ${modifier}`:''}" aria-hidden="true"><i style="width:${Math.round(Math.max(0,Math.min(1,share))*100)}%"></i></i>`;
// The main nationality with its flag; the others are counted beside it and named in the count's tooltip.
export const mainNation = codes => {
 const [main,...others]=codes&&codes.length?codes:['—'];
 return `${nationBadge(main)}${others.length?` <span class="muted" title="${escape(others.map(nationName).join(', '))}">+${others.length}</span>`:''}`;
};
const textColumns=['position','name','nation','club','academy_club'];
const ATTRIBUTE_SHORT={passe:'PAS',technique:'TEC',finition:'FIN',tacle:'TAC',jeu_tete:'TÊT',vision:'VIS',placement:'PLA',sang_froid:'SFR',vitesse:'VIT',endurance:'END',reflexes:'RÉF',sorties:'SOR',relance:'REL',centre:'CEN',cpa:'CPA'};
const LIST_SECTIONS=['general','defense','attack','goalkeeper'].map(key=>ATTRIBUTE_SECTIONS.find(section=>section.key===key));
const SECTION_OF=Object.fromEntries(ATTRIBUTE_SECTIONS.flatMap(section=>section.attributes.map(key=>[key,section.key])));
// What the player page hides or folds away fades: goalkeeping for an outfield player, Défense (Placement aside) and Attaque for a goalkeeper.
const offRole=(player,key)=>player.position==='GB'?['defense','attack'].includes(SECTION_OF[key])&&key!=='placement':SECTION_OF[key]==='goalkeeper';
const attributeCell=(player,key)=>{
 const value=player.attributes?.[key];if(value==null)return '—';
 const badge=scoreBadge(attributeScore(value),`${ATTRIBUTES[key]} sur 20`);
 return offRole(player,key)?`<span class="off-role">${badge}</span>`:badge;
};
export const COMPOSITE_SHORT={progression_attaque:'PRO',occasion_attaque:'CRÉ',tir:'FRA',tete:'AÉR',progression_defense:'DMI',occasion_defense:'DSU',arret:'ARR',sortie:'SAÉ'};
export const compositeHeader = key => `<span title="${COMPOSITES[key]}">${COMPOSITE_SHORT[key]}</span>`;
// A composite out of 200, grey when the position does not ask for it (`wanted`: the composites of that position).
export const compositeCell = (player, key, wanted=player.key_composites) => {
 const value=player.composites?.[key];if(value==null)return '—';
 const badge=levelBadge(value,`${COMPOSITES[key]} sur 200`);
 return wanted&&!wanted.includes(key)?`<span class="off-role">${badge}</span>`:badge;
};
// A player list's columns, [key, header, heading over it]: contract, state and season by default, the attributes by section in the
// 'attributs' view, the composites by section in the 'jeu' view. `recruiting` adds what the user's club needs to know before a bid:
// the wage a player asks to join it, and whether he accepts to. `season` adds the season's figures to a list of the whole world.
function playerColumns(view, withClub, options) {
 const identity=[['position','POSTE'],['name','JOUEUR'],['age','ÂGE'],['rating','NIV.'],['potential','POT.'],...(withClub?[['club','CLUB']]:[])];
 if(view==='attributs')return [...identity,...LIST_SECTIONS.flatMap(section=>section.attributes.map(key=>[key,`<span title="${ATTRIBUTES[key]}">${ATTRIBUTE_SHORT[key]}</span>`,section.title]))];
 if(view==='jeu')return [...identity,...COMPOSITE_SECTIONS.flatMap(section=>section.composites.map(key=>[key,compositeHeader(key),section.title]))];
 return [['position','POSTE'],['name','JOUEUR'],['nation','NAT.'],['age','ÂGE'],['rating','NIV.'],['potential','POT.'],...(withClub?[['club','CLUB']]:[]),['value','VALEUR'],...(options.asking?[['asking_price','PRIX MIN.']]:[]),['wage','SALAIRE / MOIS'],...(options.recruiting?[['wage_demand','PRÉTENTIONS'],['interested','INTÉRESSÉ']]:[]),['contract_end','CONTRAT'],['fitness','ÉTAT'],...(!withClub?[['form','FORME'],['morale','MORAL'],['appearances','MJ'],['goals','BUTS'],['assists','PD'],['yellows','CJ'],['reds','CR'],['average','NOTE']]:[]),...(options.season?[['appearances','MJ'],['goals','BUTS'],['assists','PD'],['average','NOTE']]:[]),...(options.academy?[['promotion_date','PROMOTION'],['academy_club','CLUB FORMATEUR'],['data_at','DONNÉES']]:[])];
}
// Switches a player list between its views, for the head of its card. The sort goes along when the other view has its column; otherwise that
// view opens on its own default sort.
export function playerViewSwitch(view, sorted, order, withClub=false, options={}) {
 const button=([key,label])=>{
  const active=key===(view||'infos'),kept=playerColumns(key,withClub,options).some(([column])=>column===sorted);
  return `<button type="button" data-view="${key}" aria-pressed="${active}" class="${active?'active':''}"${kept?` data-view-sort="${sorted}" data-view-order="${order}"`:''}>${label}</button>`;
 };
 return `<div class="segmented" role="group" aria-label="Colonnes">${[['infos','Infos'],['attributs','Attributs'],['jeu','Jeu']].map(button).join('')}</div>`;
}
export function playerTable(data, withClub=false, sorted='rating', order='desc', options={}) {
 const columns=playerColumns(options.view,withClub,options);
 const rows=data.items.map(player=>{
  const cells={
   position:player.position?position(player.position):'—',name:`<span class="strong">${playerLink(player.id,player.name)}</span>`,
   nation:mainNation(player.nationalities||[player.nation]),
   age:figure(player.age??'—'),rating:levelBadge(player.rating,'Niveau actuel sur 200'),potential:levelBadge(player.potential,'Potentiel sur 200'),club:player.data_at==='unknown'?'—':clubLink(player.club),
   value:figure(player.value==null?'—':money(player.value)),asking_price:figure(player.transferable===false?'<span class="muted">Intransférable</span>':player.asking_price==null?'—':price(player.asking_price)),wage:figure(player.wage==null?'—':monthlySalary(player.wage)),
   wage_demand:figure(player.wage_demand==null?'—':monthlySalary(player.wage_demand)),interested:player.interested==null?'—':player.interested?'Oui':'<span class="muted">Non</span>',contract_end:`<span class="${player.expiring?'danger':''}">${date(player.contract_end)}</span>`,
   fitness:player.fitness==null?'—':player.injured_until?`<span class="status danger" title="Retour le ${escape(date(player.injured_until))}">✚ ${duration(player.injured_until)}</span>`:player.suspension?`<span class="status danger">▰ ${player.suspension} match${player.suspension>1?'s':''}</span>`:`<span class="status">${miniBar(player.fitness)}${Math.round(player.fitness*100)}%</span>`,
   form:formBadge(player.form),morale:moraleCell(player),
   promotion_date:date(player.promotion_date),academy_club:clubLink(player.academy_club),data_at:({promotion:'À la promotion',current:'Actuelles',unknown:'Non archivées'})[player.data_at],
   appearances:figure(appearances(player.appearances,player.substitutes)),goals:figure(player.goals??'—'),assists:figure(player.assists??'—'),yellows:figure(player.yellows??'—'),reds:figure(player.reds??'—'),average:figure(player.average?number(player.average):'—'),
  };
  return columns.map(([key])=>key in ATTRIBUTES?attributeCell(player,key):key in COMPOSITES?compositeCell(player,key):cells[key]);
 });
 // A list beside a preview lets the user pick a row (`select`: the id of the picked one, null for none yet).
 const picking='select' in options;
 // Each header carries its column's key, which sets its width (see .player-table in theme.css).
 return `<div class="player-table">${table(columns.map(([key,label])=>options.sortable===false?label:sortButton(key,label,sorted,order,textColumns.includes(key)?'asc':'desc')),rows,undefined,picking?data.items.map(player=>player.id===options.select?'selected':''):undefined,undefined,columns.map(([key])=>`${key}-column`),columns.map(([,,heading])=>heading||null),picking?data.items.map(player=>`data-select="${player.id}"`):undefined)}</div>`+(options.pager===false?'':pager(data));
}
// Every standings column but the club's has a set width by its header (see .standings in theme.css), so that the tables of a screen line up.
const STANDINGS_COLUMNS={'#':'rank-column',PTS:'total-column',J:'count-column',V:'count-column',N:'count-column',D:'count-column',BP:'total-column',BC:'total-column','DIFF.':'difference-column',FORME:'form-column'};
export const standings = (headers, rows, rowClasses, sort) => `<div class="standings">${table(headers,rows,undefined,rowClasses,sort,headers.map(header=>STANDINGS_COLUMNS[header]||''))}</div>`;
// Names the last round a table accounts for, from the most matches any club has played.
export function roundTitle(title,items){const round=Math.max(0,...items.map(row=>row.played));return round?`${title} · ${round}${round===1?'re':'e'} journée`:title;}
// `compact` keeps the essential columns; 'record' trades the played column for won, drawn, lost and goals, for a dashboard widget titled with the round.
export function standingsTable(data, compact=false, sortable=false) {
 const rowClasses=data.items.map(row=>row.movement==='direct'?'europe-direct':row.movement==='playoff'?'europe-playoff':row.movement==='europe'?'qualified-europe':row.movement==='relegation'?'relegated':row.movement==='promotion'||row.movement==='champion'||row.movement==='qualified'?'promoted':'');
 // Direct, play-off and European places are told by the row background alone (see rowClasses); only the icons below mark a row.
 const icon=row=>row.movement==='champion'?' <span class="movement-icon promotion" title="Champion" aria-label="Champion">★</span>':row.movement==='promotion'?' <span class="movement-icon promotion" title="Place de promotion" aria-label="Place de promotion">↑</span>':row.movement==='relegation'?' <span class="movement-icon relegation" title="Place de relégation" aria-label="Place de relégation">↓</span>':'';
 const cells=data.items.map(row=>[`<span class="rank ${row.rank===1?'first':''}">${row.rank}</span>`,`<span class="strong">${clubLink(row.club)}</span>${icon(row)}`,`<b>${row.points}</b>`,...(compact==='record'?[row.won,row.drawn,row.lost,row.goals_for,row.goals_against]:[row.played]),...(compact?[]:[row.won,row.drawn,row.lost,row.goals_for,row.goals_against]),row.difference>0?`+${row.difference}`:row.difference,...(compact?[]:[form(row.form)])]);
 const headers=compact==='record'?['#','CLUB','PTS','V','N','D','BP','BC','DIFF.']:compact?['#','CLUB','PTS','J','DIFF.']:['#','CLUB','PTS','J','V','N','D','BP','BC','DIFF.','FORME'];
 // Form sorts by the points of the last five matches.
 const points=row=>[...row.form].reduce((sum,letter)=>sum+(letter==='V'?3:letter==='N'?1:0),0);
 const values=()=>data.items.map(row=>[row.rank,row.club?.name,row.points,row.played,...(compact?[]:[row.won,row.drawn,row.lost,row.goals_for,row.goals_against]),row.difference,...(compact?[]:[points(row)])]);
 return standings(headers,cells,rowClasses,sortable?{values:values(),ascending:[0]}:undefined);
}
// Under each side of a played match, its scorers by surname, each with the minutes of their goals: "Maupay (14, 75), Gouiri (26)".
const scorerList = side => side.map(scorer=>`${scorer.id<0?`<span title="${escape(scorer.name)}">${escape(surname(scorer.name))}</span>`:`<a href="#/player/${scorer.id}" title="${escape(scorer.name)}">${escape(surname(scorer.name))}</a>`} (${scorer.minutes.join(', ')})`).join(', ');
const scorersRow = scorers => scorers&&scorers.some(side=>side.length)?`<div class="fixture-scorers home">${scorerList(scorers[0])}</div><span></span><div class="fixture-scorers">${scorerList(scorers[1])}</div>`:'';
export function fixtures(data, showDates=false) {if(!data.items.length)return empty('Aucun match programmé pour cette sélection.');let previous='';return data.items.map(match=>{const label=showDates&&previous!==match.date?`<div class="fixture-date">${date(match.date)}${match.competition?` · ${escape(match.competition)}`:''} · ${escape(match.round_label||`Journée ${match.round}`)}</div>`:'';previous=match.date;const scorers=scorersRow(match.scorers);return `${label}<div class="fixture${scorers?' with-scorers':''}"><div class="home">${clubLink(match.home)}</div><a class="score ${match.score?'':'pending'}" href="#/match/${match.id}">${match.score?match.score.join(' – '):'À venir'}${match.aggregate?`<small class="aggregate-score">Cumul ${match.aggregate.join(' – ')}</small>`:''}${match.penalties?`<small class="shootout-score">${match.penalties.join(' – ')} t.a.b.</small>`:''}</a><div>${clubLink(match.away)}</div>${scorers}</div>`;}).join('');}
// `compact` names players by surname, for a pitch a few hundred pixels wide; `kit` ({major, minor} hex colours) shirts them in a club's colours
// instead of one colour per position (match-only players keep their grey shirt); `marks(player)` adds icons beside a shirt.
export function pitch(lineup,label='Composition initiale',{compact=false,kit=null,marks=null}={}){
 const colors=safeColor(kit?.major)?{major:kit.major,minor:safeColor(kit.minor)||kit.major}:null;
 const bands={GB:90,DC:75,DG:69,DD:69,MDC:59,MC:47,MOC:33,AILG:22,AILD:22,BU:14};
 // Full-backs and centre-backs form one line, spread from left to right; each other position spreads within its own band.
 const line=player=>['DG','DC','DD'].includes(player.position)?'defence':bands[player.position]??45;
 const lateral={DG:0,DC:1,DD:2};
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
