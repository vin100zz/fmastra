import {monthlySalary} from './salaries.js';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export const number = value => new Intl.NumberFormat('fr-FR', {maximumFractionDigits:1}).format(value ?? 0);
export const minutes = value => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(value??0);
export const facilityRating = value => value == null ? '—' : `${number(value)} / 20`;
export const money = value => new Intl.NumberFormat('fr-FR', {style:'currency',currency:'EUR',maximumFractionDigits:0,maximumSignificantDigits:2,notation:Math.abs(value)>=1e6?'compact':'standard'}).format(value ?? 0);
export const attributeScore = value => Math.max(1,Math.min(20,Math.round(value/5)));
export const level = value => value==null ? null : Math.round(value*2);
export const date = (value, full=false) => value ? new Intl.DateTimeFormat('fr-FR', full ? {weekday:'long',day:'numeric',month:'long',year:'numeric'} : {day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`)) : '—';
export const season = value => `${value} / ${value+1}`;
export const safeColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
export const contrastText = hex => {const color=safeColor(hex); if(!color) return '#2c3a30'; const r=parseInt(color.slice(1,3),16),g=parseInt(color.slice(3,5),16),b=parseInt(color.slice(5,7),16); return (0.299*r+0.587*g+0.114*b)/255>0.6?'#1c2b22':'#ffffff';};
export const kitDot = club => {const major=safeColor(club?.major_color); if(!major) return ''; const minor=safeColor(club?.minor_color)||major; return `<i class="kit-dot" style="background:linear-gradient(135deg,${major} 50%,${minor} 50%)" aria-hidden="true"></i>`;};
let nations={};
export const setNations = data => nations=data||{};
export const nationName = code => nations[code]?.name || code || '—';
export const nationBadge = (code, {full=false}={}) => {const info=nations[code]; const label=full?(info?.name||code||'—'):(info?.display_code||code||'—'); const flag=info?.flag?`<img class="flag" src="/flags/${info.flag}.svg" alt="" width="16" height="12" loading="lazy">`:''; return `<span class="nation" title="${escape(info?.name||code||'')}">${flag}${escape(label)}</span>`;};
export const nationBadges = (codes, options) => (codes&&codes.length?codes:['—']).map(code=>nationBadge(code,options)).join(' · ');
export const clubLink = club => club ? `<a href="#/club/${club.id}" class="club-link">${kitDot(club)}${escape(club.name)}</a>` : '<span class="muted">Libre</span>';
export const playerLink = (id, name) => id<0?`<span class="temporary-player" title="Joueur temporaire, uniquement pour ce match">${escape(name || 'Joueur temporaire')} <small>(temp.)</small></span>`:`<a href="#/player/${id}">${escape(name || 'Joueur archivé')}</a>`;
export const group = role => role === 'GB' ? 'gk' : ['DC','DL','DR'].includes(role) ? 'def' : ['BU','AILG','AILD'].includes(role) ? 'att' : 'mid';
export const position = value => `<span class="position ${group(value)}">${escape(value)}</span>`;
export const initials = value => escape(value.split(/\s+/).map(part=>part[0]).slice(0,2).join(''));
export const form = value => `<span class="form">${[...value].map(letter=>`<i class="${letter}">${letter}</i>`).join('')}</span>`;
export const empty = (text='Les données apparaîtront au fil de la saison.', title='L’histoire reste à écrire') => `<div class="empty"><strong>${escape(title)}</strong>${escape(text)}</div>`;
export const card = (title, content, action='') => `<section class="card"><div class="card-head"><h2>${escape(title)}</h2>${action}</div>${content}</section>`;
export const stat = (label, value, hint='') => `<div class="stat-card"><span class="label">${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(hint)}</small></div>`;
export const fact = (label,value) => `<div class="fact"><span>${escape(label)}</span><strong>${value}</strong></div>`;
export const heading = (overline,title,subtitle='',extra='') => `<div class="page-heading"><div><span class="eyebrow">${escape(overline)}</span><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></div>${extra}</div>`;
export const tabs = (base, items, active) => `<nav class="tabs" aria-label="Sections">${items.map(([key,label])=>`<a class="${key===active?'active':''}" href="${base}/${key}">${escape(label)}</a>`).join('')}</nav>`;
export function table(headers, rows, footer, rowClasses) {return rows.length ? `<div class="table-scroll"><table><thead><tr>${headers.map(item=>`<th>${item}</th>`).join('')}</tr></thead><tbody>${rows.map((row,index)=>`<tr class="${rowClasses?.[index]||''}">${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>${footer?`<tfoot><tr>${footer.map(cell=>`<td>${cell}</td>`).join('')}</tr></tfoot>`:''}</table></div>` : empty();}
export function pager(data) {if(data.total<=data.page_size) return `<div class="pager">${number(data.total)} résultat${data.total>1?'s':''}</div>`;return `<div class="pager"><span>${(data.page-1)*data.page_size+1}–${Math.min(data.page*data.page_size,data.total)} sur ${number(data.total)}</span><div><button data-page="${data.page-1}" ${data.page<=1?'disabled':''}>← Précédent</button><button data-page="${data.page+1}" ${data.page*data.page_size>=data.total?'disabled':''}>Suivant →</button></div></div>`;}
export function playerTable(data, withClub=false, sorted='rating', order='desc', options={}) {
 const columns=[['position','POSTE'],['name','JOUEUR'],['nation','NAT.'],['age','ÂGE'],['rating','NIV.'],...(withClub?[['potential_estimate','POT. EST.'],['club','CLUB']]:[]),['value','VALEUR'],['wage','SALAIRE / MOIS'],['contract_end','CONTRAT'],['fitness','ÉTAT'],...(!withClub?[['appearances','MJ'],['minutes','MIN.'],['goals','BUTS'],['assists','PD'],['yellows','CJ'],['reds','CR'],['average','NOTE']]:[]),...(options.academy?[['promotion_date','PROMOTION'],['academy_club','CLUB FORMATEUR'],['data_at','DONNÉES']]:[])];
 const rows=data.items.map(player=>{
  const cells={
   position:player.position?position(player.position):'—',name:`<span class="strong">${playerLink(player.id,player.name)}</span>`,
   nation:nationBadges(player.nationalities||[player.nation]),
   age:player.age??'—',rating:player.rating==null?'—':`<span class="rating">${level(player.rating)}</span>`,potential_estimate:player.potential_estimate?`<span title="Potentiel estimé sur 200">${Math.floor(player.potential_estimate.lower*2)}–${Math.ceil(player.potential_estimate.upper*2)}</span>`:'—',club:player.data_at==='unknown'?'—':clubLink(player.club),
   value:player.value==null?'—':money(player.value),wage:player.wage==null?'—':monthlySalary(player.wage),contract_end:`<span class="${player.expiring?'danger':''}">${date(player.contract_end)}</span>`,
   fitness:player.fitness==null?'—':player.injured_until?`<span class="status danger" title="Retour le ${escape(date(player.injured_until))}">✚ Blessé</span>`:player.suspension?`<span class="status danger">▰ ${player.suspension} match(s)</span>`:`<span class="status">${Math.round(player.fitness*100)}%</span>`,
   promotion_date:date(player.promotion_date),academy_club:clubLink(player.academy_club),data_at:({promotion:'À la promotion',current:'Actuelles',unknown:'Non archivées'})[player.data_at],
   appearances:player.appearances,minutes:minutes(player.minutes),goals:player.goals,assists:player.assists,yellows:player.yellows,reds:player.reds,average:player.average?number(player.average):'—',
  };
  return columns.map(([key])=>cells[key]);
 });
 return `<div class="player-table">${table(columns.map(([key,label])=>options.sortable===false||(key==='potential_estimate'&&!options.academy)?label:`<button data-sort="${key}">${label} ${key===sorted?(order==='desc'?'↓':'↑'):''}</button>`),rows)}</div>`+pager(data);
}
export function standingsTable(data, compact=false) {
 const rowClasses=data.items.map(row=>row.movement==='direct'?'europe-direct':row.movement==='playoff'?'europe-playoff':row.movement==='relegation'?'relegated':row.movement==='promotion'||row.movement==='champion'?'promoted':'');
 const icon=row=>row.movement==='direct'?' <span class="qualification-direct" title="Place de qualification directe en huitièmes">A</span>':row.movement==='playoff'?' <span class="qualification-playoff" title="Place de barrage">Barrage</span>':row.movement==='champion'?' <span class="movement-icon promotion" title="Champion" aria-label="Champion">★</span>':row.movement==='promotion'?' <span class="movement-icon promotion" title="Place de promotion" aria-label="Place de promotion">↑</span>':row.movement==='relegation'?' <span class="movement-icon relegation" title="Place de relégation" aria-label="Place de relégation">↓</span>':'';
 return table(compact?['#','CLUB','J','DIFF.','PTS']:['#','CLUB','J','V','N','D','BP','BC','DIFF.','PTS','FORME'],data.items.map(row=>[`<span class="rank ${row.rank===1?'first':''}">${row.rank}</span>`,`<span class="strong">${clubLink(row.club)}</span>${icon(row)}`,row.played,...(compact?[]:[row.won,row.drawn,row.lost,row.goals_for,row.goals_against]),row.difference>0?`+${row.difference}`:row.difference,`<b>${row.points}</b>`,...(compact?[]:[form(row.form)])]),undefined,rowClasses);
}
export function fixtures(data, showDates=false) {if(!data.items.length)return empty('Aucun match programmé pour cette sélection.');let previous='';return data.items.map(match=>{const label=showDates&&previous!==match.date?`<div class="fixture-date">${date(match.date)}${match.competition?` · ${escape(match.competition)}`:''} · ${escape(match.round_label||`Journée ${match.round}`)}</div>`:'';previous=match.date;return `${label}<div class="fixture"><div class="home">${clubLink(match.home)}</div><a class="score ${match.score?'':'pending'}" href="#/match/${match.id}">${match.score?match.score.join(' – '):'À venir'}${match.aggregate?`<small class="aggregate-score">Cumul ${match.aggregate.join(' – ')}</small>`:''}${match.penalties?`<small class="shootout-score">${match.penalties.join(' – ')} t.a.b.</small>`:''}</a><div>${clubLink(match.away)}</div></div>`;}).join('');}
export const api = async (path, body) => {const response = await fetch(`/api${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const data=await response.json();if(!response.ok){const error=new Error(typeof data.detail==='string'?data.detail: 'La requête contient une valeur invalide.');error.status=response.status;throw error;}return data;};
export function toast(message,error=false){const element=document.querySelector('#toast');element.textContent=message;element.classList.toggle('error',error);element.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>element.hidden=true,error?9000:4500);}
export const query = values => {const result=new URLSearchParams();Object.entries(values).forEach(([key,value])=>{if(value!==''&&value!==null&&value!==undefined)result.set(key,value);});return result.toString();};

export function seasonArchives(data){
 return data.items.map((row,index)=>`<details class="card season-archive" ${index===0?'open':''}><summary>Saison ${season(row.season)} · Classement complet</summary>${standingsTable({items:row.standings||[]})}</details>`).join('');
}
