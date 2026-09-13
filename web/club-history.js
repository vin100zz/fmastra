import {escape as e,date,season,playerLink,clubLink,card,stat,fact,table,empty,money} from './ui.js';

const euros=value=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value);

export function seasonNavigation(data){
 const button=(value,label)=>`<button data-season="${value??''}" ${value===null?'disabled':''}>${label}</button>`;
 return `<nav class="season-navigation" aria-label="Navigation entre les saisons">${button(data.previous_season,'← Précédent')}<strong>Saison ${season(data.season)}</strong>${button(data.next_season,'Suivant →')}</nav>`;
}

export function movementsHistory(data){
 const transferRows=(rows,incoming)=>table(['DATE','JOUEUR',incoming?'PROVENANCE':'DESTINATION','MONTANT'],rows.map(row=>[
  date(row.date),playerLink(row.player_id,row.player),clubLink(incoming?row.source:row.target),row.fee?money(row.fee):'Libre (0 €)',
 ]));
 const playerRows=rows=>rows.length?table(['DATE','JOUEUR'],rows.map(row=>[date(row.date),playerLink(row.player_id,row.player)])):empty('Aucun mouvement enregistré pour cette saison.');
 const groups=data.sections;
 const partial=data.history_since>`${data.season}-07-01`?`<div class="notice">Les archives de fins de contrat, retraites et promotions antérieures au ${date(data.history_since)} peuvent être incomplètes dans cette ancienne partie.</div>`:'';
 return seasonNavigation(data)+partial+
  card(`Arrivées · ${groups.arrivals.length}`,transferRows(groups.arrivals,true))+
  card(`Départs transférés · ${groups.departures.length}`,transferRows(groups.departures,false))+
  card(`Départs libres en fin de contrat · ${groups.release.length}`,playerRows(groups.release))+
  card(`Départs à la retraite · ${groups.retirement.length}`,playerRows(groups.retirement))+
  card(`Jeunes promus du centre de formation · ${groups.academy.length}`,playerRows(groups.academy))+
  (groups.departure_unknown.length?card('Anciens départs — motif non archivé',playerRows(groups.departure_unknown)):'');
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
   table(['PÉRIODE / DATE','OPÉRATION','REVENUS','DÉPENSES'],data.entries.map(row=>[row.monthly?e(monthly(row.date)):date(row.date),e(row.label)+(row.player_id?` · ${playerLink(row.player_id,row.player)}`:''),row.revenue?euros(row.revenue):'—',row.expense?euros(row.expense):'—'])));
}
