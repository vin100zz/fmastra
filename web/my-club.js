import {monthlySalary} from './salaries.js';
import {calendarBlock,financeBlock,lineupBlock} from './club-overview.js';
import {api,escape as e,heading,card,pager,money,date,empty,playerLink,clubLink,standingsTable} from './ui.js';

const NEWS_LABELS={renewal_proposed:'Prolongation',renewal_signed:'Prolongation',renewal_refused:'Prolongation',offer_received:'Offre reçue',offer_accepted:'Transfert',offer_refused:'Transfert',
 transfer:'Transfert',release:'Fin de contrat',retirement:'Retraite',academy:'Formation',injury:'Blessure',injury_end:'Infirmerie',suspension:'Suspension',suspension_end:'Suspension',
 result:'Résultat',call_up:'Sélection',promotion:'Promotion',relegation:'Relégation',season:'Saison',cup_winner:'Trophée',europe_winner:'Trophée'};

// The text of an entry with its player's name linked to his page and, for a result or an in-match injury, the match linked to its report.
function newsText(item) {
 let text=e(item.text);
 if(item.match_id!=null&&item.kind==='result')return `<a href="#/match/${item.match_id}">${text}</a>`;
 if(item.player_id!=null&&item.player){const name=e(item.player),at=text.indexOf(name);if(at>=0)text=`${text.slice(0,at)}<a href="#/player/${item.player_id}">${name}</a>${text.slice(at+name.length)}`;}
 if(item.match_id!=null)text=text.replace(/ en match\b/,` en <a href="#/match/${item.match_id}">match</a>`);
 return text;
}

// A mailbox: newest first, unread entries highlighted until clicked (or all marked as read); only the links inside an entry navigate.
function inbox(news) {
 const rows=news.items.map(item=>`<li><div class="inbox-item${item.read?'':' unread'}" data-news="${item.id}"><span class="inbox-meta"><b>${e(NEWS_LABELS[item.kind]||'Actualité')}</b><small>${date(item.date)}</small></span><span class="inbox-text">${newsText(item)}</span></div></li>`).join('');
 const action=news.unread?`<button class="inbox-read-all" type="button" data-news-read="all" title="Tout marquer comme lu">Tout lire</button>`:'';
 const title=news.unread?`Actualités · ${news.unread} non lue${news.unread>1?'s':''}`:'Actualités';
 return card(title,rows?`<ul class="inbox-list">${rows}</ul>${pager(news)}`:empty('Rien à signaler pour l’instant.','Le calme avant la tempête'),action,'inbox');
}

function standingsBlock(club,standings) {
 if(!club.competition_id)return card('Classement',empty('Votre club ne dispute pas de championnat simulé.','Pas de classement'));
 // The user's own club stands out in the table (see .standings-card .own).
 const table=standingsTable(standings,true).replace(`href="#/club/${club.id}" class="club-link"`,`href="#/club/${club.id}" class="club-link own"`);
 return card('Classement',`<div class="standings-scroll">${table}</div>`,`<a href="#/league/${club.competition_id}" aria-label="Voir le classement complet">Voir →</a>`,'standings-card');
}

function marketBlock(club,transfers,contracts) {
 const offerButtons=offer=>`<button class="primary" data-command="reponse-offre" data-decision="accepter" data-offer="${e(offer.offre_id)}">Accepter</button><button data-command="reponse-offre" data-decision="refuser" data-offer="${e(offer.offre_id)}">Refuser</button>`;
 const incoming=transfers.entrantes.flatMap(group=>group.offres.map(offer=>`<li><span>${playerLink(group.joueur_id,group.joueur)}</span><small>${clubLink(offer.acheteur)} · ${monthlySalary(offer.salaire_propose)}</small><b>${money(offer.indemnite)}</b><span class="market-actions">${offerButtons(offer)}</span></li>`));
 const outgoing=transfers.sortantes.map(offer=>`<li><span>${playerLink(offer.joueur_id,offer.joueur)}</span><small>${clubLink(offer.vendeur)} · ${monthlySalary(offer.salaire_propose)}</small><b>${money(offer.indemnite)}</b></li>`);
 const renewals=contracts.items.map(row=>`<li><span>${playerLink(row.joueur_id,row.nom)}</span><small>Demande ${monthlySalary(row.salaire_propose)} · jusqu’au ${date(row.fin_contrat_proposee)}</small><a href="#/player/${row.joueur_id}">Répondre →</a></li>`);
 const section=(title,items,none)=>`<h3>${title} · ${items.length}</h3>${items.length?`<ul class="moves">${items.join('')}</ul>`:`<p class="muted">${none}</p>`}`;
 const body=section('Offres reçues',incoming,'Aucune offre sur vos joueurs.')+section('Vos offres',outgoing,'Aucune offre en cours.')+section('Prolongations',renewals,'Aucune prolongation en attente.');
 return card('Transferts et contrats',`<div class="card-body">${body}</div><p class="card-note">Faites une offre ou proposez un contrat depuis la fiche d’un joueur.</p>`,`<a href="#/club/${club.id}/transfers" aria-label="Voir les transferts">Voir →</a>`,'market-card');
}

export async function myClubScreen(params) {
 const state=await api('/monde/etat'),id=state.controlled_club_id;
 const [club,overview,news,transfers,contracts]=await Promise.all([api(`/clubs/${id}`),api(`/clubs/${id}/apercu`),api(`/ma-partie/actualites?${params}`),api('/ma-partie/transferts'),api('/ma-partie/contrats')]);
 const standings=club.competition_id?await api(`/competitions/${club.competition_id}/classement`):null;
 const composition=`#/club/${id}/composition`;
 const alert=state.awaiting_lineup?`<div class="notice">Un match est programmé aujourd’hui : <a href="${composition}">composez votre équipe</a> pour pouvoir poursuivre.</div>`:'';
 const widgets=`<div class="club-overview my-club-widgets">${calendarBlock(club,overview.calendar)}${standingsBlock(club,standings)}${lineupBlock(club,overview.lineup,composition)}${financeBlock(club,overview.finances)}${marketBlock(club,transfers,contracts)}</div>`;
 return heading('Mon club',`<a class="pill" href="#/club/${id}">${e(club.name)} →</a>`)+alert+`<div class="my-club">${inbox(news)}${widgets}</div>`;
}
