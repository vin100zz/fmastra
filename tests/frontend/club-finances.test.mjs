import {test} from 'node:test';
import assert from 'node:assert/strict';
import {financesContent,cashChart,flowsChart} from '../../web/club-finances.js';

const months=[{date:'2030-07-01',revenue:7.8e6,expenses:16.9e6,balance:5.9e6},{date:'2030-08-01',revenue:44e6,expenses:10e6,balance:39.9e6},{date:'2030-09-01',revenue:9.3e6,expenses:6.2e6,balance:43e6}];
const history=(over={})=>({season:2030,previous_season:2029,next_season:null,available:true,partial:false,since:'2026-07-01',opening_balance:15e6,closing_balance:43e6,
 revenue:61.1e6,expenses:33.1e6,net:28e6,months,
 totals:{income:23.4e6,wages:13.8e6,operating_costs:4.8e6,transfer_income:37.7e6,transfer_expenses:14.5e6,rounding_income:1,rounding_expenses:0},
 entries:[{date:'2030-08-12',monthly:false,label:'Vente de joueur',player_id:4,player:'Ganiou',revenue:32e6,expense:0},
  {date:'2030-07-22',monthly:false,label:'Achat de joueur',player_id:2,player:'Messaoudi',revenue:0,expense:9.5e6},
  {date:'2030-07-01',monthly:true,label:'Salaires',revenue:0,expense:4.6e6}],...over});
const data=(over={})=>({balance:48.4e6,income:94e6,transfer_budget:30.6e6,reserved_transfer_budget:12e6,wage_bill:1.07e6,wage_cap:1.28e6,season_spent:14.5e6,season_sales:37.7e6,reserved_wages:0,history:history(),...over});
const squad={items:Array.from({length:13},(_,index)=>({id:index+1,name:`Joueur ${index+1}`,wage:(13-index)*20000,away:index===12}))};
const club={id:7,name:'Lens'};

test('four key figures: the free budget beside what offers hold back, the cash gained since the season opened, the wage bill against its cap, the transfer balance',()=>{
 const html=financesContent(club,data(),squad);
 assert.match(html,/<span>Budget transferts<\/span><strong>19\sM\s€<\/strong><span class="split-bar thin"><i class="revenue" style="flex:18600000 1 0"><\/i><i class="revenue-soft" style="flex:12000000 1 0"><\/i><\/span><small>12\sM\s€ réservés aux offres en cours<\/small>/);
 assert.match(html,/<span>Trésorerie<\/span><strong>48\sM\s€<\/strong><small><b class="good">\+33\sM\s€<\/b> depuis l’ouverture de la saison<\/small>/);
 assert.match(html,/<span class="wage-gauge" role="img" aria-label="84 % du plafond salarial"><i style="width:84%"><\/i><b><\/b><\/span><small><b>84 %<\/b> du plafond de/);
 assert.match(html,/<div class="finance-figure good"><span>Balance des transferts<\/span><strong>\+23\sM\s€<\/strong><small>Achats <b>15\sM\s€<\/b> · Ventes <b>38\sM\s€<\/b><\/small>/);
 // Nothing held back: no split bar; a past season tells no gain; red from 95 % of the cap.
 assert.doesNotMatch(financesContent(club,data({reserved_transfer_budget:0}),squad),/réservés aux offres/);
 assert.doesNotMatch(financesContent(club,data({history:history({next_season:2031})}),squad),/depuis l’ouverture/);
 assert.match(financesContent(club,data({wage_bill:1.25e6}),squad),/class="wage-gauge full"/);
 assert.doesNotMatch(financesContent(club,data({wage_cap:0}),squad),/NaN|Infinity/);
});

test('the cash is drawn month by month from the season opening, with its biggest sale and purchase named',()=>{
 const chart=cashChart(history());
 assert.match(chart,/aria-label="Trésorerie du club au fil de la saison, de 15\sM\s€ à 43\sM\s€"/);
 const points=chart.match(/<polyline class="cc-line" points="([^"]+)"/)[1].split(' ');
 assert.equal(points.length,4);
 assert.match(chart,/Ganiou · \+32\sM\s€/);assert.match(chart,/Messaoudi · −9,5\sM\s€/);
 assert.match(chart,/<title>12 août 2030 : vente de Ganiou, \+32[\s ]000[\s ]000[\s ]€<\/title>/);
 // Twelve month labels from July, whatever has been played yet.
 assert.equal((chart.match(/<text class="cc-tick" x="[\d.]+" y="244"/g)||[]).length,12);
 assert.match(chart,/>juil\.<\/text>/);assert.match(chart,/>juin<\/text>/);
});

test('money in and out each month stand side by side, the biggest bar with its amount',()=>{
 const chart=flowsChart(history());
 assert.equal((chart.match(/<path class="series-revenue"/g)||[]).length,3);assert.equal((chart.match(/<path class="series-expense"/g)||[]).length,3);
 assert.match(chart,/<title>août 2030 · revenus 44\sM\s€<\/title>/);
 assert.equal((chart.match(/<text class="cc-value"/g)||[]).length,1);assert.match(chart,/>44\sM\s€<\/text>/);
 assert.doesNotMatch(chart,/NaN/);assert.doesNotMatch(flowsChart(history({months:[]})),/NaN/);
});

test('the best-paid players by month, the rest summed; the season split by sources; the journal folded',()=>{
 const html=financesContent(club,data(),squad);
 // The player out on loan is left out; ten shown, the two others summed.
 assert.equal((html.match(/<ul class="salary-bars">.*?<\/ul>/s)[0].match(/<li>/g)||[]).length,10);
 assert.match(html,/href="#\/player\/1">Joueur 1<\/a><\/span><i style="width:100%"/);assert.doesNotMatch(html,/Joueur 13/);
 assert.match(html,/\+ 2 autres · /);
 assert.match(html,/<div class="finance-split"><p><b>Revenus<\/b><strong>61\sM\s€<\/strong><\/p>/);
 assert.match(html,/<li><i class="revenue-soft"><\/i><span>Ventes de joueurs<\/span><b>38\sM\s€<\/b><small>62 %<\/small><\/li>/);
 assert.match(html,/<li><i class="expense-deep"><\/i><span>Achats de joueurs<\/span>/);
 // A rounding too small to see is left out.
 assert.doesNotMatch(html,/Régularisations/);
 assert.match(html,/<details class="card finance-journal"><summary><span>Journal financier<\/span><small>3 opérations · solde d’ouverture 15[\s ]000[\s ]000[\s ]€<\/small><\/summary>/);
 assert.match(html,/<details[^]*Vente de joueur · <a href="#\/player\/4">Ganiou<\/a>/);
 assert.match(html,/class="season-steps"/);
});

test('without accounts for the season, the charts give way to an explanation',()=>{
 const html=financesContent(club,data({history:history({available:false,since:'2031-08-01'})}),squad);
 assert.match(html,/Historique indisponible/);assert.match(html,/1 août 2031/);
 assert.doesNotMatch(html,/class="club-chart"|Journal financier/);
 assert.match(html,/<span>Budget transferts<\/span>/);
 assert.match(financesContent(club,data({history:history({partial:true})}),squad),/Historique partiel/);
});
