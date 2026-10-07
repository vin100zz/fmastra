import {escape as e,money,price,date,card,empty,sortableTable,playerLink} from './ui.js';
import {monthlySalary,monthlyAmount} from './salaries.js';
import {seasonNavigation} from './club-history.js';

const euros=price;
const signedMoney=value=>value>0?`+${money(value)}`:value<0?`−${money(-value)}`:money(0);
const monthName=value=>new Intl.DateTimeFormat('fr-FR',{month:'short'}).format(new Date(`${value}T12:00:00`));
const monthLong=value=>new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(`${value}T12:00:00`));
const SALARIES=10;

// A rounded scale for an axis: three steps from zero (or below it) up past the largest value.
function scale(low,high){
 const span=Math.max(1,high-Math.min(0,low)),raw=span/3,power=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].map(base=>base*power).find(value=>value>=raw);
 const bottom=Math.min(0,Math.floor(low/step)*step);
 return {bottom,top:bottom+step*Math.max(3,Math.ceil((high-bottom)/step)),step};
}
const W=1000,LEFT=64,RIGHT=980,TOP=20,BOTTOM=220;
const axis=({bottom,top,step},y)=>{let lines='';for(let value=bottom;value<=top+1;value+=step)lines+=`<line class="cc-grid" x1="${LEFT}" x2="${RIGHT}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}"/><text class="cc-tick" x="${LEFT-8}" y="${(y(value)+4).toFixed(1)}" text-anchor="end">${value?money(value):'0'}</text>`;return lines;};

// The cash at the start of the season, then at the end of each month, over the twelve months of the season; the season's
// biggest sale and biggest purchase are named on the month they were paid in.
export function cashChart(history){
 const months=history.months||[],points=[{balance:history.opening_balance},...months];
 const values=points.map(point=>point.balance),{bottom,top,step}=scale(Math.min(...values),Math.max(...values));
 const x=index=>LEFT+index*(RIGHT-LEFT)/12,y=value=>BOTTOM-(value-bottom)/(top-bottom)*(BOTTOM-TOP);
 const line=points.map((point,index)=>`${x(index).toFixed(1)},${y(point.balance).toFixed(1)}`).join(' ');
 const area=`${LEFT},${y(Math.max(bottom,0)).toFixed(1)} ${line} ${x(points.length-1).toFixed(1)},${y(Math.max(bottom,0)).toFixed(1)}`;
 const start=months[0]?.date;
 const labels=Array.from({length:12},(_,index)=>{const day=start?new Date(`${start}T12:00:00`):null;if(day)day.setMonth(day.getMonth()+index);
  return day?`<text class="cc-tick" x="${(x(index)+(RIGHT-LEFT)/24).toFixed(1)}" y="244" text-anchor="middle">${monthName(day.toISOString().slice(0,10))}</text>`:'';}).join('');
 const deals=(history.entries||[]).filter(row=>!row.monthly&&(row.revenue||row.expense));
 const biggest=kind=>deals.filter(row=>row[kind]).sort((a,b)=>b[kind]-a[kind])[0];
 const mark=(row,kind)=>{
  if(!row)return '';
  const index=months.findIndex(month=>month.date.slice(0,7)===row.date.slice(0,7))+1;if(index<1)return '';
  const px=x(index),py=y(points[index].balance),sale=kind==='revenue',text=`${row.player||(sale?'Vente':'Achat')} · ${sale?'+':'−'}${money(row[kind])}`;
  return `<circle class="cc-point" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5"><title>${e(`${date(row.date)} : ${sale?'vente':'achat'} de ${row.player||'joueur'}, ${sale?'+':'−'}${euros(row[kind])}`)}</title></circle><text class="cc-note" x="${(px+10).toFixed(1)}" y="${(py+(sale?-10:18)).toFixed(1)}">${e(text)}</text>`;
 };
 const last=points.length-1,end=`<circle class="cc-point end" cx="${x(last).toFixed(1)}" cy="${y(points[last].balance).toFixed(1)}" r="6"><title>${e(money(points[last].balance))}</title></circle><text class="cc-value" x="${(x(last)+10).toFixed(1)}" y="${(y(points[last].balance)-8).toFixed(1)}">${money(points[last].balance)}</text>`;
 return `<svg class="club-chart" viewBox="0 0 ${W} 252" role="img" aria-label="Trésorerie du club au fil de la saison, de ${e(money(history.opening_balance))} à ${e(money(points[last].balance))}">${axis({bottom,top,step},y)}<polygon class="cc-area" points="${area}"/><polyline class="cc-line" points="${line}"/>${mark(biggest('revenue'),'revenue')}${mark(biggest('expense'),'expense')}${end}${labels}</svg>`;
}

// What came in and what went out each month, side by side; the biggest bar carries its amount.
export function flowsChart(history){
 const months=history.months||[],{bottom,top,step}=scale(0,Math.max(1,...months.flatMap(month=>[month.revenue,month.expenses])));
 const slot=(RIGHT-LEFT)/Math.max(1,months.length),width=Math.min(36,slot/2-6),y=value=>BOTTOM-(value-bottom)/(top-bottom)*(BOTTOM-TOP);
 // Rounded at the data end only, anchored on the baseline.
 const bar=(left,value,kind,label)=>{const height=Math.max(0,BOTTOM-y(value)),radius=Math.min(4,height/2),topY=BOTTOM-height;
  return `<path class="${kind}" d="M${left.toFixed(1)},${BOTTOM} V${(topY+radius).toFixed(1)} Q${left.toFixed(1)},${topY.toFixed(1)} ${(left+radius).toFixed(1)},${topY.toFixed(1)} H${(left+width-radius).toFixed(1)} Q${(left+width).toFixed(1)},${topY.toFixed(1)} ${(left+width).toFixed(1)},${(topY+radius).toFixed(1)} V${BOTTOM} Z"><title>${e(label)}</title></path>`;};
 const peak=months.reduce((best,month,index)=>Math.max(month.revenue,month.expenses)>best.value?{index,value:Math.max(month.revenue,month.expenses),kind:month.revenue>=month.expenses?'revenue':'expenses'}:best,{index:-1,value:0});
 const bars=months.map((month,index)=>{const center=LEFT+(index+.5)*slot;
  return bar(center-width-1,month.revenue,'series-revenue',`${monthLong(month.date)} · revenus ${money(month.revenue)}`)+bar(center+1,month.expenses,'series-expense',`${monthLong(month.date)} · dépenses ${money(month.expenses)}`)
   +`<text class="cc-tick" x="${center.toFixed(1)}" y="244" text-anchor="middle">${monthName(month.date)}</text>`;}).join('');
 const note=peak.index<0?'':`<text class="cc-value" x="${(LEFT+(peak.index+.5)*slot+(peak.kind==='revenue'?-width-1:1)+width/2).toFixed(1)}" y="${(y(peak.value)-8).toFixed(1)}" text-anchor="middle">${money(peak.value)}</text>`;
 return `<svg class="club-chart" viewBox="0 0 ${W} 252" role="img" aria-label="Revenus et dépenses du club par mois">${axis({bottom,top,step},y)}${bars}${note}</svg>`;
}

// The season's revenue and expenses split by their sources, each as one bar of its parts.
function splitBars(history){
 const t=history.totals;
 const groups=[['Revenus',history.revenue,[['Revenus structurels',t.income,'revenue'],['Ventes de joueurs',t.transfer_income,'revenue-soft'],['Régularisations',t.rounding_income,'neutral']]],
  ['Dépenses',history.expenses,[['Salaires',t.wages,'expense'],['Achats de joueurs',t.transfer_expenses,'expense-deep'],['Fonctionnement',t.operating_costs,'expense-soft'],['Régularisations',t.rounding_expenses,'neutral']]]];
 return groups.map(([title,total,parts])=>{
  // Rounding adjustments too small to see on the bar are left out.
  const kept=parts.filter(([label,value])=>value>0&&(label!=='Régularisations'||value>=total/100));
  const share=value=>total?`${Math.round(100*value/total)} %`:'—';
  return `<div class="finance-split"><p><b>${title}</b><strong>${money(total)}</strong></p><span class="split-bar">${kept.map(([label,value,kind])=>`<i class="${kind}" style="flex:${value} 1 0" title="${e(`${label} : ${money(value)}`)}"></i>`).join('')}</span>`
   +`<ul>${kept.map(([label,value,kind])=>`<li><i class="${kind}"></i><span>${label}</span><b>${money(value)}</b><small>${share(value)}</small></li>`).join('')}</ul></div>`;
 }).join('');
}

// The best-paid players of the squad, by their monthly wage, the rest summed.
function salariesCard(squad){
 const players=(squad?.items||[]).filter(player=>!player.away&&player.wage>0).sort((a,b)=>b.wage-a.wage);
 const shown=players.slice(0,SALARIES),rest=players.slice(SALARIES),top=shown[0]?.wage||1;
 const rows=shown.map(player=>`<li><span>${playerLink(player.id,player.name)}</span><i style="width:${Math.round(100*player.wage/top)}%" title="${e(`${player.name} : ${monthlySalary(player.wage)}`)}"></i><b>${monthlySalary(player.wage)}</b></li>`).join('');
 const more=rest.length?`<p class="muted">+ ${rest.length} autre${rest.length>1?'s':''} · ${money(monthlyAmount(rest.reduce((sum,player)=>sum+player.wage,0)))}</p>`:'';
 return card('Salaires',rows?`<div class="card-body"><ul class="salary-bars">${rows}</ul>${more}</div>`:empty('Aucun salaire à payer.','Effectif vide'),'','salaries-card');
}

// A key figure of the tab: its label, its amount and a line or a bar under it.
const figure=(label,value,extra='',modifier='')=>`<div class="finance-figure${modifier?` ${modifier}`:''}"><span>${label}</span><strong>${value}</strong>${extra}</div>`;

// The Finances tab: four key figures, the cash month by month, the best-paid players, the money in and out each month and where
// it came from and went to; the journal of every entry stays folded under them. The season arrows change all but the key figures.
export function financesContent(club,data,squad){
 const history=data.history,reserved=data.reserved_transfer_budget,free=Math.max(0,data.transfer_budget-reserved);
 const used=Math.round(100*data.wage_bill/Math.max(1,data.wage_cap)),balance=data.season_sales-data.season_spent;
 // The cash gained since the season opened reads against the accounts of the season under way only.
 const opening=history.available&&history.next_season==null?history.opening_balance:null;
 const figures=`<div class="finance-figures">`
  +figure('Budget transferts',money(free),reserved?`<span class="split-bar thin"><i class="revenue" style="flex:${free} 1 0"></i><i class="revenue-soft" style="flex:${reserved} 1 0"></i></span><small>${money(reserved)} réservés aux offres en cours</small>`:'')
  +figure('Trésorerie',money(data.balance),opening!=null?`<small><b class="${data.balance>=opening?'good':'bad'}">${signedMoney(data.balance-opening)}</b> depuis l’ouverture de la saison</small>`:'')
  +figure('Masse salariale',money(monthlyAmount(data.wage_bill)),`<span class="wage-gauge${used>=95?' full':''}" role="img" aria-label="${used} % du plafond salarial"><i style="width:${Math.min(100,used)}%"></i><b></b></span><small><b>${used} %</b> du plafond de ${money(monthlyAmount(data.wage_cap))}</small>`)
  +figure('Balance des transferts',signedMoney(balance),`<small>Achats <b>${money(data.season_spent)}</b> · Ventes <b>${money(data.season_sales)}</b></small>`,balance>0?'good':balance<0?'bad':'')
  +`</div>`;
 const nav=seasonNavigation(history,true);
 const note=history.partial?`<div class="notice">Historique partiel : seuls les flux enregistrés depuis le ${date(history.since)} sont inclus.</div>`:'';
 if(!history.available)return figures+card('Trésorerie',empty(`Les comptes détaillés sont enregistrés depuis le ${date(history.since)}. Aucune écriture disponible pour cette saison.`,'Historique indisponible'),nav);
 const legend='<div class="cc-legend"><span><i class="revenue"></i>Revenus</span><span><i class="expense"></i>Dépenses</span></div>';
 const journal=sortableTable(['PÉRIODE / DATE','OPÉRATION','REVENUS','DÉPENSES'],history.entries.map(row=>[row.monthly?e(monthLong(row.date)):date(row.date),e(row.label)+(row.player_id?` · ${playerLink(row.player_id,row.player)}`:''),row.revenue?euros(row.revenue):'—',row.expense?euros(row.expense):'—']),history.entries.map(row=>[row.date,row.label,row.revenue,row.expense]));
 return figures+note
  +`<div class="finance-row">${card('Trésorerie',`<div class="cc-body">${cashChart(history)}</div>`,nav,'cc-card')}${salariesCard(squad)}</div>`
  +`<div class="finance-row">${card('Revenus et dépenses',`<div class="cc-body">${flowsChart(history)}</div>`,legend,'cc-card')}${card('Répartition',`<div class="card-body">${splitBars(history)}</div>`,'','split-card')}</div>`
  +`<details class="card finance-journal"><summary><span>Journal financier</span><small>${history.entries.length} opération${history.entries.length>1?'s':''} · solde d’ouverture ${euros(history.opening_balance)}</small></summary>${journal}</details>`;
}
