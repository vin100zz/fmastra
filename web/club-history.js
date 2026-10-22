import {escape as e,date,playerLink,clubLink,empty,money,position,initials,safeColor,contrastText} from './ui.js';

const signedMoney=value=>value>0?`+${money(value)}`:value<0?`−${money(-value)}`:money(0);
const shortDay=value=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit'}).format(new Date(`${value}T12:00:00`));
// A small crest of a club: its logo, or its initials on its colours.
const miniCrest=club=>{
 if(!club)return '<span class="crest mini-crest"></span>';
 const major=safeColor(club.major_color),minor=safeColor(club.minor_color)||major;
 return `<span class="crest mini-crest"${major?` style="background:linear-gradient(155deg,${major} 55%,${minor} 55%);color:${contrastText(major)}"`:''}>${initials(club.name)}<img class="crest-logo" src="/crests/TCM1_${club.id}.png" alt="" loading="lazy" onerror="this.remove()"></span>`;
};

// Each kind of movement: its badge, and the group of the filter it falls in.
const KINDS={transfer:['Transfert','transfer'],loan:['Prêt','loan'],academy:['Jeune promu','academy'],release:['Fin de contrat','other'],retirement:['Retraite','other'],departure_unknown:['Départ','other']};
const FILTERS={transfer:'Transferts',loan:'Prêts',academy:'Jeunes promus',other:'Autres'};

function movementRow(row,incoming){
 const [label]=KINDS[row.kind]||['Mouvement'];
 const other=incoming?row.source:row.target;
 const club=row.kind==='academy'?'<span class="muted">Centre de formation</span>':row.kind==='retirement'?'<span class="muted">—</span>':other?clubLink(other):'<span class="muted">Libre</span>';
 const fee=row.kind==='transfer'?(row.fee?money(row.fee):'Libre'):'—';
 return `<div class="movement-row"><span class="movement-date">${shortDay(row.date)}</span><span class="movement-kind ${row.kind}">${label}</span>${row.position?position(row.position):'<span class="position">—</span>'}`
  +`<span class="movement-player">${playerLink(row.player_id,row.player)}</span><span class="movement-age">${row.age==null?'<span title="Âge non archivé">—</span>':`${row.age} ans`}</span><span class="movement-club">${club}</span><b class="movement-fee">${fee}</b></div>`;
}

// One side of a season's movements: every kind of them in date order, with buttons keeping one kind (`param` in the address).
function movementSide(title,rows,total,incoming,param,picked){
 const groups=Object.keys(FILTERS).filter(key=>rows.some(row=>(KINDS[row.kind]||[])[1]===key));
 const shown=picked&&groups.includes(picked)?picked:null;
 const chip=(value,label,count)=>`<button type="button" data-param="${param}" data-param-value="${value??''}" aria-pressed="${(value??null)===shown}" class="${(value??null)===shown?'active':''}">${label} <span class="count">${count}</span></button>`;
 const chips=groups.length>1?`<div class="movement-filters" role="group" aria-label="Genre de mouvement">${chip(null,'Tous',rows.length)}${groups.map(key=>chip(key,FILTERS[key],rows.filter(row=>KINDS[row.kind][1]===key).length)).join('')}</div>`:'';
 const kept=rows.filter(row=>shown==null||KINDS[row.kind][1]===shown).sort((a,b)=>a.date.localeCompare(b.date)||a.player_id-b.player_id);
 return `<section class="card movement-card" aria-label="${title}"><div class="card-head"><h2>${title} · ${rows.length}</h2>${chips}<strong class="movement-total">${money(total)}</strong></div>`
  +(kept.length?`<div class="movement-rows">${kept.map(row=>movementRow(row,incoming)).join('')}</div>`:empty('Aucun mouvement enregistré pour cette saison.','Rien à signaler'))+'</section>';
}

// The biggest fee of a side of the season, with the other club's crest.
function recordTile(title,row,incoming){
 if(!row)return '';
 const other=incoming?row.source:row.target;
 return `<div class="card movement-record">${miniCrest(other)}<div><span>${title}</span><p>${playerLink(row.player_id,row.player)} <small>${incoming?'←':'→'} ${e(other?.name||'Libre')}</small></p></div><strong>${money(row.fee)}</strong></div>`;
}

// The Transferts tab: the season's spending and takings, its biggest sale and signing, then its arrivals and its departures,
// every kind together and dated, each side able to keep one kind. The season is stepped through from the row of tabs.
export function movementsHistory(data,params=new URLSearchParams()){
 const groups=data.sections;
 const partial=data.history_since>`${data.season}-07-01`?`<div class="notice">Les archives de fins de contrat, retraites et promotions antérieures au ${date(data.history_since)} peuvent être incomplètes dans cette ancienne partie.</div>`:'';
 const spent=data.arrival_total??groups.arrivals.reduce((sum,row)=>sum+(row.fee||0),0),earned=data.departure_total??groups.departures.reduce((sum,row)=>sum+(row.fee||0),0);
 const top=rows=>rows.filter(row=>row.fee>0).sort((a,b)=>b.fee-a.fee)[0];
 const summary=`<div class="movement-summary"><div class="card movement-balance"><div><span>Dépenses</span><strong>${money(spent)}</strong></div><div><span>Recettes</span><strong>${money(earned)}</strong></div>`
  +`<div><span>Balance</span><strong class="${earned-spent>0?'good':earned-spent<0?'bad':''}">${signedMoney(earned-spent)}</strong></div></div>${recordTile('Plus grosse vente',top(groups.departures),false)}${recordTile('Plus grosse recrue',top(groups.arrivals),true)}</div>`;
 const arrivals=[...groups.arrivals,...(groups.loans_in||[]),...groups.academy];
 const departures=[...groups.departures,...(groups.loans_out||[]),...groups.release,...groups.retirement,...groups.departure_unknown];
 return partial+summary+`<div class="transfer-columns">${movementSide('Arrivées',arrivals,spent,true,'arrivees',params.get('arrivees'))}${movementSide('Départs',departures,earned,false,'departs',params.get('departs'))}</div>`;
}
