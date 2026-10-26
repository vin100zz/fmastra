import {escape as e,date,playerLink,clubLink,empty,money,price,position,season,table,figure,GO,BACK} from './ui.js';

const signedMoney=value=>value>0?`+${money(value)}`:value<0?`−${money(-value)}`:money(0);
const shortDay=value=>new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit'}).format(new Date(`${value}T12:00:00`));
const tone=value=>value>0?'good':value<0?'bad':'';

// Each kind of movement: its badge.
const KINDS={transfer:'Transfert',loan:'Prêt',academy:'Jeune promu',release:'Fin de contrat',retirement:'Retraite',departure_unknown:'Départ'};

// One side of a season's movements, every kind together in date order, in a table sorted in the browser; its foot counts
// the players and totals the fees.
function movementCard(title,rows,total,incoming){
 const kept=[...rows].sort((a,b)=>a.date.localeCompare(b.date)||a.player_id-b.player_id);
 const other=row=>incoming?row.source:row.target;
 const club=row=>row.kind==='academy'?'<span class="muted">Centre de formation</span>':row.kind==='retirement'?'<span class="muted">—</span>':other(row)?clubLink(other(row)):'<span class="muted">Libre</span>';
 const fee=row=>row.kind==='transfer'?(row.fee?price(row.fee):'Libre'):'—';
 const cells=kept.map(row=>[`<span class="muted">${shortDay(row.date)}</span>`,`<span class="movement-kind ${row.kind}">${KINDS[row.kind]||'Mouvement'}</span>`,
  row.position?position(row.position):'—',playerLink(row.player_id,row.player),figure(row.age==null?'<span title="Âge non archivé">—</span>':row.age),club(row),figure(fee(row))]);
 const values=kept.map(row=>[row.date,KINDS[row.kind]||'',row.position||'',row.player||'',row.age??'',other(row)?.name||'',row.kind==='transfer'?row.fee:'']);
 const foot=['','','',`${kept.length} joueur${kept.length>1?'s':''}`,'','',figure(money(total))];
 const columns=['date','kind','position','name','age','club','fee'].map(key=>`${key}-column`);
 const list=kept.length?`<div class="club-movements">${table(['DATE','GENRE','POSTE','JOUEUR','ÂGE','CLUB','MONTANT'],cells,foot,undefined,{values,ascending:[0]},columns)}</div>`
  :empty('Aucun mouvement enregistré pour cette saison.','Rien à signaler');
 return `<section class="card" aria-label="${title}"><div class="card-head"><h2>${title}</h2></div>${list}</section>`;
}

// The biggest fee of a side of the season: the player, the other club after a chevron, the fee.
function recordTile(title,row,incoming){
 if(!row)return '';
 const other=incoming?row.source:row.target;
 return `<div class="club-hero-tile record"><span>${title}</span><strong>${playerLink(row.player_id,row.player)}<small>${incoming?BACK:GO}${other?clubLink(other):'<span class="muted">Libre</span>'}</small><b>${price(row.fee)}</b></strong></div>`;
}

// What the club spent and received in each window of every season, the latest first: the spending to the left of an axis,
// the takings to its right, each amount at the end of its bar; the balance of each season by its name. A season opens its
// movements; the one shown is washed.
export function mercatoLedger(mercatos,shown){
 const most=Math.max(1,...mercatos.flatMap(row=>[row.summer,row.winter].filter(Boolean).flatMap(window=>[window.spent,window.earned])));
 const half=(side,amount)=>{
  const bar=amount?`<i style="--share:${(amount/most).toFixed(3)}"></i>`:'',label=amount?`<b>${money(amount)}</b>`:'';
  return `<span class="mercato-half ${side}">${side==='spent'?label+bar:bar+label}</span>`;
 };
 const line=(name,window)=>window?`<span class="mercato-row"><span class="mercato-window">${name}</span>${half('spent',window.spent)}${half('earned',window.earned)}</span>`
  :`<span class="mercato-row future"><span class="mercato-window">${name}</span><span class="mercato-half spent"></span><span class="mercato-half earned"></span></span>`;
 const seasons=mercatos.map(row=>{
  const net=[row.summer,row.winter].filter(Boolean).reduce((sum,window)=>sum+window.earned-window.spent,0),picked=row.season===shown;
  return `<button type="button" class="mercato-season${picked?' picked':''}" data-param="saison" data-param-value="${row.season}" aria-pressed="${picked}">`
   +`<span class="mercato-head"><span>${season(row.season)}</span><b class="${tone(net)}">${signedMoney(net)}</b></span>${line('Été',row.summer)}${line('Hiver',row.winter)}</button>`;
 }).join('');
 const key='<div class="mercato-row mercato-key" aria-hidden="true"><span></span><span class="mercato-half spent"><b>Dépenses</b></span><span class="mercato-half earned"><b>Recettes</b></span></div>';
 return `<div class="mercatos" role="group" aria-label="Mercatos">${key}${seasons}</div>`;
}

// The Transferts tab: the mercatos of every season on the left, each opening its season; on the right the season shown in
// figures (spending, takings, balance, its biggest signing and sale), then its arrivals and its departures, every kind
// together and dated. The season is also stepped through from the row of tabs.
export function movementsHistory(data){
 const groups=data.sections;
 const partial=data.history_since>`${data.season}-07-01`?`<div class="notice">Les archives de fins de contrat, retraites et promotions antérieures au ${date(data.history_since)} peuvent être incomplètes dans cette ancienne partie.</div>`:'';
 const spent=data.arrival_total??groups.arrivals.reduce((sum,row)=>sum+(row.fee||0),0),earned=data.departure_total??groups.departures.reduce((sum,row)=>sum+(row.fee||0),0);
 const top=rows=>rows.filter(row=>row.fee>0).sort((a,b)=>b.fee-a.fee)[0];
 const column=(label,value,className='')=>`<div><span>${label}</span><strong${className?` class="${className}"`:''}>${value}</strong></div>`;
 const summary=`<div class="club-tiles"><div class="club-hero-tile split">${column('Dépenses',money(spent))}${column('Recettes',money(earned))}${column('Balance',signedMoney(earned-spent),tone(earned-spent))}</div>`
  +`${recordTile('Plus grosse recrue',top(groups.arrivals),true)}${recordTile('Plus grosse vente',top(groups.departures),false)}</div>`;
 const arrivals=[...groups.arrivals,...(groups.loans_in||[]),...groups.academy];
 const departures=[...groups.departures,...(groups.loans_out||[]),...groups.release,...groups.retirement,...groups.departure_unknown];
 const ledger=data.mercatos?.length?`<section class="card mercatos-card"><div class="card-head"><h2>Mercatos</h2></div>${mercatoLedger(data.mercatos,data.season)}</section>`:'';
 return `<div class="transfers-layout">${ledger}<div class="transfers-season">${partial}${summary}${movementCard('Arrivées',arrivals,spent,true)}${movementCard('Départs',departures,earned,false)}</div></div>`;
}
