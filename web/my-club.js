import {monthlySalary} from './salaries.js';
import {api,escape as e,heading,tabs,card,stat,table,pager,money,date,empty,position} from './ui.js';

const TABS=[['dashboard','Tableau de bord'],['composition','Composition'],['contrats','Contrats'],['transferts','Transferts'],['actualites','Actualités']];

function playerOptions(players, selectedId, allowEmpty=false) {
 const options=players.map(player=>`<option value="${player.id}" ${player.id===selectedId?'selected':''}>${e(player.name)} · ${player.position} · ${player.rating}</option>`);
 return (allowEmpty?['<option value="">—</option>']:[]).concat(options).join('');
}

async function dashboardTab() {
 const [state,contrats,transferts,actualites]=await Promise.all([api('/monde/etat'),api('/ma-partie/contrats'),api('/ma-partie/transferts'),api('/ma-partie/actualites')]);
 const alert=state.awaiting_lineup?`<div class="notice">Un match est programmé aujourd’hui : <a href="#/mon-club/composition">composez votre équipe</a> pour pouvoir poursuivre.</div>`:'';
 const grid=`<div class="stat-grid">${stat('Renouvellements en attente',contrats.total,'À traiter dans l’onglet Contrats')}${stat('Offres reçues',transferts.entrantes.length,'Sur vos joueurs')}${stat('Offres émises',transferts.sortantes.length,'En cours de négociation')}</div>`;
 const news=card('Dernières actualités',actualites.items.length?table(['DATE','ÉVÉNEMENT'],actualites.items.slice(0,10).map(item=>[date(item.date),e(item.text)])):empty('Rien à signaler pour l’instant.','Le calme avant la tempête'));
 return alert+grid+news;
}

async function compositionTab(params) {
 const state=await api('/monde/etat');
 const matchId=params.get('match')||state.awaiting_lineup;
 if(!matchId) return card('Aucune composition à faire',empty('Revenez ici lorsqu’un match de votre club est programmé aujourd’hui.','Rien à composer pour l’instant'));
 const data=await api(`/ma-partie/composition?match_id=${matchId}`);
 const rows=data.suggestion.titulaires.map(([pid,pos],index)=>`<tr><td>${position(pos)}</td><td><select name="slot-${index}" data-position="${e(pos)}">${playerOptions(data.players,pid)}</select></td></tr>`).join('');
 const benchRows=data.suggestion.banc.map((pid,index)=>`<tr><td><select name="bench-${index}">${playerOptions(data.players,pid,true)}</select></td></tr>`).join('');
 return card(`Composition · ${data.home?'À domicile':'À l’extérieur'} contre ${e(data.opponent?.name||'?')}`,
  `<div id="lineup-form" data-match="${matchId}" data-formation="${e(data.suggestion.formation)}"><p class="note">Une composition légale est déjà proposée ; ajustez-la si besoin. Cliquez sur « Jouer → » en haut de l’écran pour aligner cette équipe et lancer le match.</p><h3>Titulaires — ${e(data.suggestion.formation)}</h3><table><tbody>${rows}</tbody></table><h3>Banc</h3><table><tbody>${benchRows}</tbody></table></div>`);
}

async function contractsTab() {
 const data=await api('/ma-partie/contrats');
 if(!data.total) return card('Contrats',empty('Aucun renouvellement en attente pour le moment.','Rien à négocier'));
 return card(`${data.total} renouvellement${data.total>1?'s':''} en attente`,table(['JOUEUR','SALAIRE ACTUEL','SALAIRE PROPOSÉ','FIN DE CONTRAT PROPOSÉE',''],
  data.items.map(row=>[e(row.nom),monthlySalary(row.salaire_actuel),monthlySalary(row.salaire_propose),date(row.fin_contrat_proposee),
   `<button class="primary" data-command="renouvellement" data-decision="accepter" data-player="${row.joueur_id}">Accepter</button> <button data-command="renouvellement" data-decision="refuser" data-player="${row.joueur_id}">Refuser</button>`])));
}

async function transfersTab(params) {
 const data=await api('/ma-partie/transferts');
 const outgoing=card('Vos offres en cours',data.sortantes.length?table(['JOUEUR','VENDEUR','INDEMNITÉ','SALAIRE PROPOSÉ'],
  data.sortantes.map(row=>[e(row.joueur||'—'),e(row.vendeur?.name||'—'),money(row.indemnite),monthlySalary(row.salaire_propose)])):empty('Aucune offre en cours.','Rien à suivre'));
 const incoming=card('Offres reçues pour vos joueurs',data.entrantes.length?data.entrantes.map(group=>
  `<h3>${e(group.joueur||'—')}</h3>`+table(['ACHETEUR','INDEMNITÉ','SALAIRE PROPOSÉ',''],group.offres.map(offer=>[e(offer.acheteur?.name||'—'),money(offer.indemnite),monthlySalary(offer.salaire_propose),
   `<button class="primary" data-command="reponse-offre" data-decision="accepter" data-offer="${offer.offre_id}">Accepter</button> <button data-command="reponse-offre" data-decision="refuser" data-offer="${offer.offre_id}">Refuser</button>`]))).join(''):empty('Aucune offre reçue pour le moment.','Rien à traiter'));
 const targeted=params.get('joueur_id')||'';
 const form=card('Faire une offre',`<form id="offer-form"><p class="note">Trouvez l’identifiant d’un joueur depuis sa fiche (bouton « Faire une offre → »).</p><label>Identifiant du joueur <input name="joueur_id" type="number" value="${e(targeted)}" required></label><label>Salaire proposé (€/semaine) <input name="salaire_hebdo" type="number" min="1" required></label><label>Indemnité offerte (€) <input name="indemnite" type="number" min="0" required></label><div class="actions"><button class="primary" type="submit">Envoyer l’offre</button></div></form>`);
 return outgoing+incoming+form;
}

async function newsTab(params) {
 const data=await api(`/ma-partie/actualites?${params}`);
 return card('Actualités du club',data.items.length?table(['DATE','ÉVÉNEMENT'],data.items.map(item=>[date(item.date),e(item.text)]))+pager(data):empty('Rien à signaler pour l’instant.','Le calme avant la tempête'));
}

export async function myClubScreen(section, params) {
 section=section||'dashboard';
 let content;
 if(section==='composition')content=await compositionTab(params);
 else if(section==='contrats')content=await contractsTab();
 else if(section==='transferts')content=await transfersTab(params);
 else if(section==='actualites')content=await newsTab(params);
 else content=await dashboardTab();
 return heading('Mon club')+tabs('#/mon-club',TABS,section)+content;
}
