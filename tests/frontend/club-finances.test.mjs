import {test} from 'node:test';
import assert from 'node:assert/strict';
import {financesContent,cashChart,flowsChart,budgetShare,shareContent,shareStep,snapCap,draggedCap,steppedCap} from '../../web/club-finances.js';

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

test('the share of the budgets on one bar, then the cash gained since the season opened and the transfer balance',()=>{
 const html=financesContent(club,data(),squad);
 // Each envelope at its end: the budget left free of offers, the wage cap by month.
 assert.match(html,/<section class="finance-figure balance" aria-label="Répartition des budgets"><div class="balance-end"><span>Budget transferts<\/span><strong>18\.6\sM€<\/strong><\/div><div class="balance-end right"><span>Plafond salarial<\/span><strong>5\.55\sM€<\/strong><\/div>/);
 // The bar, in euros of a season: what offers hold back, the free budget, the room under the cap, the wage bill.
 assert.match(html,/<div class="balance-bar"><i class="budget held" style="flex-grow:12000000"><\/i><i class="budget" style="flex-grow:18600000"><\/i><i class="wages" style="flex-grow:10920000"><\/i><i class="wages held" style="flex-grow:55640000"><\/i><\/div>/);
 assert.match(html,/<small class="balance-note"><b>12\sM€<\/b> réservés aux offres en cours<\/small><small class="balance-note right">Masse salariale <b>4\.64\sM€<\/b> · <b>84 %<\/b><\/small><\/section>/);
 assert.match(html,/<span>Trésorerie<\/span><strong>48\sM€<\/strong><small><b class="good">\+33\sM€<\/b> depuis l’ouverture de la saison<\/small>/);
 assert.match(html,/<div class="finance-figure good"><span>Balance des transferts<\/span><strong>\+23\sM€<\/strong><small>Achats <b>15\sM€<\/b> · Ventes <b>38\sM€<\/b><\/small>/);
 // Nothing held back: no note, no part; a past season tells no gain; red from 95 % of the cap.
 assert.doesNotMatch(financesContent(club,data({reserved_transfer_budget:0}),squad),/réservés aux offres|budget held/);
 assert.doesNotMatch(financesContent(club,data({history:history({next_season:2031})}),squad),/depuis l’ouverture/);
 assert.match(financesContent(club,data({wage_bill:1.25e6}),squad),/class="wages held full"/);
 assert.doesNotMatch(financesContent(club,data({wage_cap:0}),squad),/NaN|Infinity/);
 // The wages offers reserve stand beside the wage bill, and count in the part of the cap that is taken.
 const reserving=financesContent(club,data({reserved_wages:100000}),squad);
 assert.match(reserving,/<i class="wages" style="flex-grow:5720000"><\/i><i class="wages held" style="flex-grow:5200000"><\/i><i class="wages held" style="flex-grow:55640000"><\/i>/);
 assert.match(reserving,/Masse salariale <b>4\.64\sM€<\/b> \+ <b>433\sk€<\/b> réservés · <b>91 %<\/b>/);
});

// The club the user runs: nothing held back, and the wage caps it can set, from its wage bill up to what its budget pays.
const own=(over={})=>data({reserved_transfer_budget:0,wage_cap_range:[1.07e6,1.28e6+Math.floor(30.6e6/52)],...over});

test('in the user’s club a handle parts the two free shares, and the block carries what it needs to move',()=>{
 const html=financesContent(club,own(),squad);
 assert.match(html,/<section class="finance-figure balance" aria-label="Répartition des budgets" data-share="\{&quot;transfer_budget&quot;:30600000,&quot;reserved_transfer_budget&quot;:0,&quot;wage_bill&quot;:1070000,&quot;wage_cap&quot;:1280000,&quot;reserved_wages&quot;:0,&quot;wage_cap_range&quot;:\[1070000,1868461\]\}">/);
 assert.match(html,/<i class="budget" style="flex-grow:30600000"><\/i><button type="button" class="balance-handle" data-command="budgets" aria-label="[^"]+"><svg.*?<\/svg><\/button><i class="wages" style="flex-grow:10920000">/);
 // Another club shows the same bar, with nothing to move.
 assert.doesNotMatch(financesContent(club,data(),squad),/balance-handle|data-share/);
});

test('a held handle shows what each side gains or gives up, and the slice it has just moved',()=>{
 // 100 000 a week more of cap: a season of it, 5.2 M€, leaves the budget for 433 k€ a month.
 const raised=shareContent(own(),1.38e6,true);
 assert.match(raised,/<span>Budget transferts<\/span><strong>25\.4\sM€<em>−5\.2\sM€<\/em><\/strong>/);
 assert.match(raised,/<span>Plafond salarial<\/span><strong><em>\+433\sk€<\/em>5\.98\sM€<\/strong>/);
 assert.match(raised,/<i class="budget" style="flex-grow:25400000"><\/i><button type="button" class="balance-handle dragged"[^>]*>.*?<\/button><i class="wages" style="flex-grow:5200000"><\/i><i class="wages" style="flex-grow:10920000"><\/i><i class="wages held" style="flex-grow:55640000"><\/i>/);
 assert.match(raised,/Masse salariale <b>4\.64\sM€<\/b> · <b>78 %<\/b>/);
 // The other way, the slice stands on the budget's side of the handle.
 const lowered=shareContent(own(),1.18e6,true);
 assert.match(lowered,/<strong>35\.8\sM€<em>\+5\.2\sM€<\/em><\/strong>/);assert.match(lowered,/<strong><em>−433\sk€<\/em>5\.11\sM€<\/strong>/);
 assert.match(lowered,/<i class="budget" style="flex-grow:30600000"><\/i><i class="budget" style="flex-grow:5200000"><\/i><button[^>]*>.*?<\/button><i class="wages" style="flex-grow:5720000"><\/i><i class="wages held"/);
 // On the cap the club has, no gain is written, held or not.
 assert.doesNotMatch(shareContent(own(),1.28e6,true),/<em>/);
 // The parts of the bar always add up to the two envelopes.
 for(const cap of [1.07e6,1.28e6,1.6e6]){const share=budgetShare(own(),cap);assert.equal([...share.budget,...share.wages].reduce((sum,[,value])=>sum+value,0),30.6e6+1.28e6*52);}
});

test('the handle stands on round monthly caps, on the cap it left, and never past what the club can set',()=>{
 // A step is worth three pixels of the bar or more: 1, 2 or 5 times a power of ten, by month.
 assert.equal(shareStep(97.16e6,800),50000);assert.equal(shareStep(254.06e6,810),100000);assert.equal(shareStep(0,0),1);
 assert.equal(snapCap(own(),1.3e6,50000),1303846);          // 5.65 M€ a month
 assert.equal(snapCap(own(),1.283e6,50000),1.28e6);          // within half a step of the cap it has: back on it
 assert.equal(snapCap(own(),5e6,50000),1868461);assert.equal(snapCap(own(),0,50000),1.07e6);
 // Dragged to the left, the cap takes from the budget: a tenth of the bar is a tenth of the two envelopes.
 assert.equal(draggedCap(own(),-80,800),1465385);
 assert.equal(draggedCap(own(),0,800),1.28e6);assert.equal(draggedCap(own(),800,800),1.07e6);assert.equal(draggedCap(own(),-800,800),1868461);
 // An arrow is one step; the step back returns to the cap the club has.
 assert.equal(steppedCap(own(),1.28e6,1,800),1292308);assert.equal(steppedCap(own(),1292308,-1,800),1.28e6);
 assert.equal(steppedCap(own(),1.07e6,-1,800),1.07e6);
});

test('the cash is drawn month by month from the season opening, with its biggest sale and purchase named',()=>{
 const chart=cashChart(history());
 assert.match(chart,/aria-label="Trésorerie du club au fil de la saison, de 15\sM€ à 43\sM€"/);
 const points=chart.match(/<polyline class="cc-line" points="([^"]+)"/)[1].split(' ');
 assert.equal(points.length,4);
 assert.match(chart,/Ganiou · \+32\sM€/);assert.match(chart,/Messaoudi · −9\.5\sM€/);
 assert.match(chart,/<title>12 août 2030 : vente de Ganiou, \+32\sM€<\/title>/);
 // Twelve month labels from July, whatever has been played yet.
 assert.equal((chart.match(/<text class="cc-tick" x="[\d.]+" y="244"/g)||[]).length,12);
 assert.match(chart,/>juil\.<\/text>/);assert.match(chart,/>juin<\/text>/);
});

test('money in and out each month stand side by side, the biggest bar with its amount',()=>{
 const chart=flowsChart(history());
 assert.equal((chart.match(/<path class="series-revenue"/g)||[]).length,3);assert.equal((chart.match(/<path class="series-expense"/g)||[]).length,3);
 assert.match(chart,/<title>août 2030 · revenus 44\sM€<\/title>/);
 assert.equal((chart.match(/<text class="cc-value"/g)||[]).length,1);assert.match(chart,/>44\sM€<\/text>/);
 assert.doesNotMatch(chart,/NaN/);assert.doesNotMatch(flowsChart(history({months:[]})),/NaN/);
});

test('the best-paid players by month, the rest summed; the season split by sources; the journal folded',()=>{
 const html=financesContent(club,data(),squad);
 // The player out on loan is left out; ten shown, the two others summed.
 assert.equal((html.match(/<ul class="salary-bars">.*?<\/ul>/s)[0].match(/<li>/g)||[]).length,10);
 assert.match(html,/href="#\/player\/1">Joueur 1<\/a><\/span><i style="width:100%"/);assert.doesNotMatch(html,/Joueur 13/);
 assert.match(html,/\+ 2 autres · /);
 assert.match(html,/<div class="finance-split"><p><b>Revenus<\/b><strong>61\sM€<\/strong><\/p>/);
 assert.match(html,/<li><i class="revenue-soft"><\/i><span>Ventes de joueurs<\/span><b>38\sM€<\/b><small>62 %<\/small><\/li>/);
 assert.match(html,/<li><i class="expense-deep"><\/i><span>Achats de joueurs<\/span>/);
 // A rounding too small to see is left out.
 assert.doesNotMatch(html,/Régularisations/);
 assert.match(html,/<details class="card finance-journal"><summary><span>Journal financier<\/span><small>3 opérations · solde d’ouverture 15\sM€<\/small><\/summary>/);
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
