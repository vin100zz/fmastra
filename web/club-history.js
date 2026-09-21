import {escape as e,date,season,playerLink,clubLink,card,stat,fact,sortableTable,pager,empty,money,leadersCards,number} from './ui.js';

const euros=value=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value);

export function seasonNavigation(data){
 const button=(value,label)=>`<button data-season="${value??''}" ${value===null?'disabled':''}>${label}</button>`;
 return `<nav class="season-navigation" aria-label="Navigation entre les saisons">${button(data.previous_season,'← Précédent')}<strong>Saison ${season(data.season)}</strong>${button(data.next_season,'Suivant →')}</nav>`;
}

const transferRows=(rows,incoming)=>sortableTable(['DATE','JOUEUR',incoming?'PROVENANCE':'DESTINATION','MONTANT'],rows.map(row=>[
 date(row.date),playerLink(row.player_id,row.player),clubLink(incoming?row.source:row.target),row.fee?money(row.fee):'Libre (0 €)',
]),rows.map(row=>[row.date,row.player,(incoming?row.source:row.target)?.name??'Libre',row.fee||0]));

export function movementsHistory(data){
 const playerRows=(rows,withAge=false)=>rows.length?sortableTable(['DATE','JOUEUR',...(withAge?['ÂGE']:[])],rows.map(row=>[date(row.date),playerLink(row.player_id,row.player),...(withAge?[row.age==null?'<span title="Âge non archivé">—</span>':`${row.age} ans`]:[])]),rows.map(row=>[row.date,row.player,...(withAge?[row.age]:[])])):empty('Aucun mouvement enregistré pour cette saison.');
 const groups=data.sections;
 const partial=data.history_since>`${data.season}-07-01`?`<div class="notice">Les archives de fins de contrat, retraites et promotions antérieures au ${date(data.history_since)} peuvent être incomplètes dans cette ancienne partie.</div>`:'';
 const total=(key,rows)=>money(data[key]??rows.reduce((sum,row)=>sum+(row.fee||0),0));
 return seasonNavigation(data)+partial+`<p class="muted">Âges au moment du départ ou de la promotion.</p><div class="transfer-columns"><section aria-label="Arrivées"><div class="movement-heading"><h2>Arrivées</h2><strong>Total : ${total('arrival_total',groups.arrivals)}</strong></div>`+
  card(`Transferts entrants · ${groups.arrivals.length}`,transferRows(groups.arrivals,true))+
  card(`Jeunes promus du centre de formation · ${groups.academy.length}`,playerRows(groups.academy,true))+
  `</section><section aria-label="Départs"><div class="movement-heading"><h2>Départs</h2><strong>Total : ${total('departure_total',groups.departures)}</strong></div>`+
  card(`Transferts sortants · ${groups.departures.length}`,transferRows(groups.departures,false))+
  card(`Départs libres en fin de contrat · ${groups.release.length}`,playerRows(groups.release))+
  card(`Départs à la retraite · ${groups.retirement.length}`,playerRows(groups.retirement,true))+
  (groups.departure_unknown.length?card('Anciens départs — motif non archivé',playerRows(groups.departure_unknown)):'')+'</section></div>';

}

export function financialHistory(data){
 const nav=seasonNavigation(data);
 if(!data.available)return nav+card('Historique financier',empty(`Les comptes détaillés sont enregistrés depuis le ${date(data.since)}. Aucune écriture disponible pour cette saison.`,'Historique indisponible'));
 const t=data.totals;
 const note=data.partial?`<div class="notice">Historique partiel : seuls les flux enregistrés depuis le ${date(data.since)} sont inclus. Les périodes antérieures n'ont pas été reconstituées.</div>`:'';
 const monthly=value=>new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(`${value}T12:00:00`));
 return nav+note+`<div class="stat-grid financial-summary">${stat('Total des revenus',euros(data.revenue),'Saison sélectionnée')}${stat('Total des dépenses',euros(data.expenses),'Saison sélectionnée')}${stat('Résultat de trésorerie',euros(data.net),'Revenus moins dépenses')}${stat('Solde en fin de période',euros(data.closing_balance),'Après les écritures enregistrées')}</div>`+
  `<div class="grid equal">${card('Tous les revenus',`<div class="card-body">${fact('Revenus structurels',euros(t.income))}${fact('Ventes de joueurs',euros(t.transfer_income))}${fact('Régularisations positives',euros(t.rounding_income))}</div>`)}${card('Toutes les dépenses',`<div class="card-body">${fact('Salaires',euros(t.wages))}${fact('Frais de fonctionnement',euros(t.operating_costs))}${fact('Achats de joueurs',euros(t.transfer_expenses))}${fact('Régularisations négatives',euros(t.rounding_expenses))}</div>`)}</div>`+
  card('Journal financier',`<div class="card-body">${fact('Solde au début de la période enregistrée',euros(data.opening_balance))}<p>Revenus structurels, salaires et fonctionnement sont regroupés par mois. Chaque indemnité de transfert est détaillée. Les budgets et offres réservées ne sont pas des dépenses tant qu'ils ne sont pas payés.</p></div>`+
   sortableTable(['PÉRIODE / DATE','OPÉRATION','REVENUS','DÉPENSES'],data.entries.map(row=>[row.monthly?e(monthly(row.date)):date(row.date),e(row.label)+(row.player_id?` · ${playerLink(row.player_id,row.player)}`:''),row.revenue?euros(row.revenue):'—',row.expense?euros(row.expense):'—']),data.entries.map(row=>[row.date,row.label,row.revenue,row.expense])));
}

// A run in a cup is its furthest round, or the title; `level` (empty without a run) orders the column.
const cupRun=run=>run?(run.winner?`✦ ${e(run.label)}`:e(run.label)):'—';
// Reputation when the season opened, with its move from the season before.
const signed=value=>`${value>0?'+':value<0?'−':''}${number(Math.abs(value))}`;
const reputationRun=held=>held?`${number(held.value)}${held.change==null?'':` <span class="muted">(${signed(held.change)})</span>`}`:'—';
const europeRun=run=>run?`<span title="${e(run.competition)}">${e(run.code)} · ${run.winner?`✦ ${e(run.label)}`:e(run.label)}</span>`:'—';

export function seasonsHistory(data){
 const rank=row=>row.rank==null?'—':`${row.rank}${row.rank===1?'er':'e'}`;
 const seasons=card('Les saisons du club',sortableTable(['SAISON','CHAMPIONNAT','CLASSEMENT','RÉPUTATION','COUPE NATIONALE','COUPE D’EUROPE','PALMARÈS'],data.items.map(row=>[
  season(row.season),e(row.competition??'—'),rank(row),reputationRun(row.reputation),cupRun(row.cup),europeRun(row.europe),row.champion?'✦ Champion':'—',
 ]),data.items.map(row=>[row.season,row.competition??'',row.rank??'',row.reputation?.value??'',row.cup?.level??'',row.europe?.level??'',row.champion?1:0]),{ascending:[2]})+(data.total>data.page_size?pager(data):''));
 const transferCard=(title,rows,incoming)=>card(title,rows.length?transferRows(rows,incoming):empty('Aucun transfert payant enregistré.','Pas encore de transfert'));
 const {leaders,transfers}=data;
 return seasons+leadersCards(leaders,'Toutes compétitions et toutes saisons confondues, saison en cours incluse.')+'<p class="muted">Indemnités les plus élevées, hors départs libres.</p>'+
  `<div class="transfer-columns"><section aria-label="Plus gros transferts entrants">${transferCard(`Plus gros transferts entrants · ${transfers.arrivals.length}`,transfers.arrivals,true)}</section><section aria-label="Plus gros transferts sortants">${transferCard(`Plus gros transferts sortants · ${transfers.departures.length}`,transfers.departures,false)}</section></div>`;
}
