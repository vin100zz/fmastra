import {monthlySalary} from './salaries.js';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export const number = value => new Intl.NumberFormat('fr-FR', {maximumFractionDigits:1}).format(value ?? 0);
export const minutes = value => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(value??0);
export const facilityRating = value => value == null ? '—' : `${number(value)} / 20`;
export const money = value => new Intl.NumberFormat('fr-FR', {style:'currency',currency:'EUR',maximumFractionDigits:0,maximumSignificantDigits:2,notation:Math.abs(value)>=1e6?'compact':'standard'}).format(value ?? 0);
export const attributeScore = value => Math.max(1,Math.min(20,Math.round(value/5)));
export const date = (value, full=false) => value ? new Intl.DateTimeFormat('fr-FR', full ? {weekday:'long',day:'numeric',month:'long',year:'numeric'} : {day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`)) : '—';
export const season = value => `${value} / ${value+1}`;
export const clubLink = club => club ? `<a href="#/club/${club.id}">${escape(club.name)}</a>` : '<span class="muted">Libre</span>';
export const playerLink = (id, name) => `<a href="#/player/${id}">${escape(name || 'Joueur archivé')}</a>`;
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
export function table(headers, rows) {return rows.length ? `<div class="table-scroll"><table><thead><tr>${headers.map(item=>`<th>${item}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : empty();}
export function pager(data) {if(data.total<=data.page_size) return `<div class="pager">${number(data.total)} résultat${data.total>1?'s':''}</div>`;return `<div class="pager"><span>${(data.page-1)*data.page_size+1}–${Math.min(data.page*data.page_size,data.total)} sur ${number(data.total)}</span><div><button data-page="${data.page-1}" ${data.page<=1?'disabled':''}>← Précédent</button><button data-page="${data.page+1}" ${data.page*data.page_size>=data.total?'disabled':''}>Suivant →</button></div></div>`;}
export function playerTable(data, withClub=false, sorted='rating', order='desc') {
 const columns=[['position','POSTE'],['name','JOUEUR'],['nation','NAT.'],['age','ÂGE'],['rating','NIV.'],...(withClub?[['club','CLUB']]:[]),['value','VALEUR'],['wage','SALAIRE / MOIS'],['contract_end','CONTRAT'],['fitness','ÉTAT'],...(!withClub?[['appearances','MJ'],['minutes','MIN.'],['goals','BUTS'],['assists','PD'],['yellows','CJ'],['reds','CR'],['average','NOTE']]:[])];
 const rows=data.items.map(player=>{
  const cells={
   position:position(player.position),name:`<span class="strong">${playerLink(player.id,player.name)}</span>`,
   nation:`<span title="${escape((player.nationality_names||player.nationalities||[player.nation]).join(', '))}">${escape((player.nationalities||[player.nation]).map((code,index)=>code.startsWith('X')?(player.nationality_names?.[index]||code):code).join(' / '))}</span>`,
   age:player.age,rating:`<span class="rating">${number(player.rating)}</span>`,club:clubLink(player.club),
   value:money(player.value),wage:monthlySalary(player.wage),contract_end:`<span class="${player.expiring?'danger':''}">${date(player.contract_end)}</span>`,
   fitness:player.injured_until?`<span class="status danger" title="Retour le ${escape(date(player.injured_until))}">✚ Blessé</span>`:player.suspension?`<span class="status danger">▰ ${player.suspension} match(s)</span>`:`<span class="status">${Math.round(player.fitness*100)}%</span>`,
   appearances:player.appearances,minutes:minutes(player.minutes),goals:player.goals,assists:player.assists,yellows:player.yellows,reds:player.reds,average:player.average?number(player.average):'—',
  };
  return columns.map(([key])=>cells[key]);
 });
 return `<div class="player-table">${table(columns.map(([key,label])=>`<button data-sort="${key}">${label} ${key===sorted?(order==='desc'?'↓':'↑'):''}</button>`),rows)}</div>`+pager(data);
}
export function standingsTable(data, compact=false) {return table(compact?['#','CLUB','J','DIFF.','PTS']:['#','CLUB','J','V','N','D','BP','BC','DIFF.','PTS','FORME'],data.items.map(row=>[`<span class="rank ${row.rank===1?'first':''}">${row.rank}</span>`,`<span class="strong">${clubLink(row.club)}</span>`,row.played,...(compact?[]:[row.won,row.drawn,row.lost,row.goals_for,row.goals_against]),row.difference>0?`+${row.difference}`:row.difference,`<b>${row.points}</b>`,...(compact?[]:[form(row.form)])]));}
export function fixtures(data, showDates=false) {if(!data.items.length)return empty('Aucun match programmé pour cette sélection.');let previous='';return data.items.map(match=>{const label=showDates&&previous!==match.date?`<div class="fixture-date">${date(match.date)} · Journée ${match.round}</div>`:'';previous=match.date;return `${label}<div class="fixture"><div class="home">${clubLink(match.home)}</div><a class="score ${match.score?'':'pending'}" href="#/match/${match.id}">${match.score?match.score.join(' – '):'À venir'}</a><div>${clubLink(match.away)}</div></div>`;}).join('');}
export function transferTable(data){return table(['DATE','JOUEUR','PROVENANCE','DESTINATION','MONTANT'],data.items.map(row=>[date(row.date),playerLink(row.player_id,row.player),clubLink(row.source),clubLink(row.target),money(row.fee)]))+pager(data);}
export const api = async (path, body) => {const response = await fetch(`/api${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const data=await response.json();if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail: 'La requête contient une valeur invalide.');return data;};
export function toast(message,error=false){const element=document.querySelector('#toast');element.textContent=message;element.classList.toggle('error',error);element.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>element.hidden=true,error?9000:4500);}
export const query = values => {const result=new URLSearchParams();Object.entries(values).forEach(([key,value])=>{if(value!==''&&value!==null&&value!==undefined)result.set(key,value);});return result.toString();};
