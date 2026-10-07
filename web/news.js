import {monthlySalary} from './salaries.js';
import {calendarBlock,financesBlock,shortDate} from './club-overview.js';
import {talksAction,contractDialog} from './player.js';
import {api,escape as e,number as n,averageNote,card,pager,money,price,date,season,empty,fact,playerLink,clubLink,position,moraleReading,standingsTable,roundTitle} from './ui.js';

// The badge of each kind of message: its label and the family that colours it (see .news-tag in theme.css).
const TAGS={offer_received:['Transfert','transfer'],offer_rejected:['Transfert','transfer'],offer_expired:['Transfert','transfer'],offer_accepted:['Transfert','transfer'],
 offer_refused:['Transfert','transfer'],talks_open:['Transfert','transfer'],transfer:['Transfert','transfer'],loan:['Prêt','transfer'],loan_return:['Prêt','transfer'],
 renewal_proposed:['Contrat','contract'],renewal_signed:['Contrat','contract'],renewal_refused:['Contrat','contract'],contract_expiry:['Contrat','contract'],
 release:['Contrat','contract'],retirement:['Retraite','contract'],morale:['Moral','morale'],injury:['Blessure','injury'],injury_end:['Blessure','injury'],
 suspension:['Suspension','ban'],suspension_end:['Suspension','ban'],call_up:['Sélection','call-up'],academy:['Formation','call-up'],
 market_open:['Mercato','market'],market_close:['Mercato','market'],season:['Saison','season'],season_review:['Saison','season'],promotion:['Saison','season'],
 relegation:['Saison','season'],cup_winner:['Trophée','season'],europe_winner:['Trophée','season']};
const tag=kind=>{const [label,family]=TAGS[kind]||['Actualité','season'];return `<span class="news-tag ${family}">${label}</span>`;};
// The kinds that ask for an answer: once it is given, their row says so.
const ANSWERED=new Set(['offer_received','renewal_proposed','talks_open']);

// Amounts are written in full euros and weekly wages in the stored sentences, as in the simulation; they read like every
// other amount, a wage as a rounded monthly one.
const amounts=text=>text.replace(/(\d+) €(\/semaine)?/g,(_,amount,weekly)=>weekly?monthlySalary(Number(amount)):price(Number(amount)));
const competitionHref=competition=>competition.kind==='europe'?`#/europe/${competition.code}`:`#/league/${competition.id}`;
const PAGES={transfers:'#/transfers',players:'#/players',honours:'#/honours'};
function refHref(ref){
 if(ref.player!=null)return `#/player/${ref.player}`;
 if(ref.club!=null)return `#/club/${ref.club}`;
 if(ref.nation!=null)return `#/international/nation/${ref.nation}`;
 if(ref.match!=null)return `#/match/${ref.match}`;
 return ref.competition?competitionHref(ref.competition):PAGES[ref.page]||'#/';
}
// A title in segments: each name links to its page.
const linked=segments=>segments.map(part=>part.ref?`<a href="${refHref(part.ref)}">${e(part.text)}</a>`:amounts(e(part.text))).join('');
// A player who left the world keeps his name, without a page to open.
const named=player=>player.gone?e(player.name):`<a href="#/player/${player.id}">${e(player.name)}</a>`;
const lines=(rows,modifier='')=>`<ul class="news-lines${modifier?` ${modifier}`:''}">${rows.map(cells=>`<li>${cells.join('')}</li>`).join('')}</ul>`;
const absence=days=>days<7?`${days} jour${days>1?'s':''}`:days<30?`${Math.round(days/7)} semaine${Math.round(days/7)>1?'s':''}`:`${Math.max(1,Math.round(days/30))} mois`;
const moraleBadge=value=>`<span class="rating graded" style="--hue:${moraleReading({morale:value/100}).hue}" title="Moral">${value} %</span>`;
const MORALE={temps_de_jeu:'Mécontent de son temps de jeu',reserve:'Ne veut plus être en réserve',salaire:'Mécontent de son salaire',ambition:'Vise un club plus prestigieux',intransferable:'Veut partir, mais n’est pas à vendre'};
const OFFER_STATES={accepted:['Acceptée','good'],refused:['Refusée',''],raised:['Relevée',''],declined:['Non retenue',''],lapsed:['Sans suite','']};

function listRow(item,shown){
 const state=item.pending?'<i class="news-todo" role="img" aria-label="À traiter"></i>':ANSWERED.has(item.kind)?'<i class="news-done" role="img" aria-label="Traité">✓</i>':'';
 const current=item.id===shown;
 return `<li><a class="news-row${item.read?'':' unread'}${current?' selected':''}" href="#/actualites?msg=${item.id}"${current?' aria-current="true"':''}><span class="news-row-top">${tag(item.kind)}<small>${shortDate(item.date)}</small></span><span class="news-row-title"><span>${amounts(e(item.title))}</span>${state}</span></a></li>`;
}

// The offers of a day for a player: each is accepted, turned down or answered with the club's own price (in a dialog of its
// own) on its line; with several still open, both buttons at the foot answer them all, and accepting them all lets the player
// pick his club. While he is the club's and on the market, the last button keeps him off it.
function offersBody(data){
 const open=data.offers.filter(offer=>offer.state==='pending');
 const dialog=index=>`counter-dialog-${index}`;
 const answer=(offer,index)=>offer.state==='pending'?`<span class="market-actions"><button${open.length===1?' class="primary"':''} data-command="reponse-offre" data-decision="accepter" data-offer="${e(offer.key)}">Accepter</button><button type="button" data-open-dialog="${dialog(index)}">Contre-proposer</button><button data-command="reponse-offre" data-decision="refuser" data-offer="${e(offer.key)}">Refuser</button></span>`
  :`<span class="news-state ${OFFER_STATES[offer.state]?.[1]||''}">${OFFER_STATES[offer.state]?.[0]||''}</span>`;
 const counter=(offer,index)=>offer.state==='pending'?`<dialog id="${dialog(index)}" class="action-dialog"><form data-counter="${e(offer.key)}"><span class="eyebrow">VENTE</span><h2>Votre prix pour ${e(data.player.name)}</h2><p>${e(offer.club?.name||'')} offre ${price(offer.fee)}</p><label>Prix demandé (M€) <input name="montant" type="number" min="0" step="0.01" value="${Math.ceil(offer.fee/1e4)/100}" required></label><div class="actions"><button type="button" data-close-dialog>Annuler</button><button class="primary" type="submit">Proposer</button></div></form></dialog>`:'';
 const all=open.length>1?`<button class="primary" data-command="reponse-offres" data-decision="accepter" data-player="${data.player.id}">Tout accepter</button><button class="danger" data-command="reponse-offres" data-decision="refuser" data-player="${data.player.id}">Tout refuser</button>`:'';
 const keep=open.length&&data.untouchable===false?`<button data-command="intransferable" data-kept="1" data-player="${data.player.id}">Déclarer intransférable</button>`:'';
 return lines(data.offers.map((offer,index)=>[`<span>${clubLink(offer.club)}</span>`,`<b>${price(offer.fee)}</b>`,answer(offer,index)]),'offers')
  +(all||keep?`<div class="news-actions">${all}${keep}</div>`:'')+data.offers.map(counter).join('');
}
function offersStatus(data){
 const accepted=data.offers.find(offer=>offer.state==='accepted'),several=data.offers.length>1;
 if(accepted)return `Offre acceptée · ${e(accepted.club?.name||'')}`;
 if(data.offers.some(offer=>offer.state==='refused'))return several?'Offres refusées':'Offre refusée';
 return data.offers.some(offer=>offer.state==='raised')?(several?'Offres relevées':'Offre relevée'):'Sans suite';
}

function renewalBody(data){
 const terms=`<div class="news-terms"><span></span><span class="news-head">ACTUEL</span><span class="news-head">DEMANDÉ</span>`
  +`<span>Salaire</span><span>${monthlySalary(data.current.wage)}</span><b>${monthlySalary(data.asked.wage)}</b>`
  +`<span>Fin de contrat</span><span>${date(data.current.end)}</span><b>${date(data.asked.end)}</b></div>`;
 const actions=data.state==='pending'?`<div class="news-actions"><button class="primary" data-command="renouvellement" data-decision="accepter" data-player="${data.player.id}">Accepter</button><button class="danger" data-command="renouvellement" data-decision="refuser" data-player="${data.player.id}">Refuser</button></div>`:'';
 return terms+actions;
}
const renewalStatus=data=>data.state==='accepted'?`Prolongé jusqu’au ${date(data.asked.end)}`:data.state==='refused'?'Demande refusée':'Sans suite';

// A player whose club agreed the fee waits for a wage: the dialog of his page opens here, and the talks can be given up.
function talksBody(data){
 const fee=data.club?fact('Indemnité convenue',`${price(data.fee)} · ${clubLink(data.club)}`):'';
 if(data.state!=='pending')return fee?`<div class="news-facts">${fee}</div>`:'';
 const asked=data.talks.contre_offre?fact('Salaire demandé',monthlySalary(data.talks.contre_offre)):'';
 return `<div class="news-facts">${fee}${asked}</div><div class="news-actions">${talksAction(data.profile,{market:true},data.talks)}<button class="danger" data-command="abandon-negociation" data-player="${data.player.id}">Abandonner</button></div>`;
}
const talksStatus=data=>data.state==='agreed'?`Arrivée le ${date(data.arrival)}`:'Négociation terminée';

// Several players in one message: who, and what the message says of each. A single one is all in the title.
function playersBody(message){
 const {kind,players}=message;
 if(kind==='morale')return players.length>1?lines(players.map(row=>[`<span>${named(row.player)}</span>`,`<span>${MORALE[row.cause]||'Mécontent'}</span>`,moraleBadge(row.morale)]),'morale')
  :lines([[`<span>Moral</span>`,moraleBadge(players[0].morale)]]);
 if(players.length<2)return '';
 const detail=row=>kind==='injury'?`<span>${absence(row.days)}</span>`:kind==='suspension'?`<span>${row.matches} match${row.matches>1?'s':''}</span>`
  :kind==='call_up'?`<span><a href="#/international/nation/${row.team.id}">${e(row.team.name)}</a></span>`:'';
 return lines(players.map(row=>[`<span>${named(row.player)}</span>`,detail(row)]));
}

// Contracts running out: each player with his wage and, when he would extend, the contract he asks for, ready to sign.
function expiryBody(data){
 const row=item=>{
  const id=`contract-dialog-${item.player.id}`;
  const offer=item.settled?'':item.obstacle?`<button type="button" disabled title="${e(item.obstacle)}">Proposer un contrat</button>`
   :`<button type="button" data-open-dialog="${id}">Proposer un contrat</button>${contractDialog(item.player,{demande:item.demande,salaire_actuel:item.terms.current_wage,salaire_propose:item.terms.wage,fin_contrat_actuelle:item.end,fin_contrat_proposee:item.terms.end},id)}`;
  return [`<span>${named(item.player)}</span>`,`<span>${monthlySalary(item.wage)}</span>`,`<span>${offer}</span>`];
 };
 return lines(data.players.map(row),'expiry');
}

function marketBody(data,club){
 const players=list=>list.map(named).join(' · ');
 const budget=`<div class="fact"><span><a href="#/club/${club.id}/finances">Budget transferts</a></span><strong>${money(data.budget)}</strong></div>`;
 const facts=data.end?fact('Fermeture',date(data.end))+budget+fact('Marge salariale',monthlySalary(Math.max(0,data.wages)))
  :(data.talks.length?fact('Vos offres en cours',players(data.talks)):'')+(data.offers.length?fact('Offres reçues',players(data.offers)):'')+budget;
 return `<div class="news-facts">${facts}</div><a class="news-more" href="#/players">Joueurs →</a>`;
}

function reviewBody(data,club){
 const result=row=>row.rank?`${row.rank}${row.rank===1?'er':'e'} · ${row.points} pts`:row.won?'Vainqueur':e(row.round||'—');
 const rows=data.competitions.map(row=>`<span><a href="${competitionHref(row.competition)}">${e(row.competition.name)}</a></span><span>${result(row)}</span><span>${row.winner?clubLink(row.winner):'—'}</span>`).join('');
 const table=rows?`<div class="news-terms review"><span></span><span class="news-head">${e(club.name)}</span><span class="news-head">VAINQUEUR</span>${rows}</div>`:'';
 const europe=data.europe?`<span class="news-good">Qualifié pour la <a href="${competitionHref(data.europe)}">${e(data.europe.name)}</a> ${season(data.season+1)}</span>`:'<span></span>';
 const players=(data.scorer?fact('Meilleur buteur',`${named(data.scorer.player)} · ${data.scorer.goals} but${data.scorer.goals>1?'s':''}`):'')
  +(data.rating?fact('Meilleure note',`${named(data.rating.player)} · ${averageNote(data.rating.average)}`):'');
 return `${table}<div class="news-foot">${europe}<a class="news-more" href="#/honours">Palmarès →</a></div>${players?`<div class="news-facts">${players}</div>`:''}`;
}

// The message opened: its badge and date, what it still asks or how it was answered, its title with each name linked, then
// what its kind tells.
function messagePane(message,club){
 const {offers,renewal,talks}=message;
 const answered=offers?offersStatus(offers):renewal?renewalStatus(renewal):talks?talksStatus(talks):'';
 const status=message.pending?'<span class="news-status todo"><i class="news-todo" aria-hidden="true"></i>À traiter</span>':answered?`<span class="news-status">${answered}</span>`:'';
 const value=offers?.value!=null?`<div class="tile fee-value"><span>Valeur</span><strong>${price(offers.value)}</strong></div>`:'';
 const body=offers?offersBody(offers):renewal?renewalBody(renewal):talks?talksBody(talks):message.expiry?expiryBody(message.expiry)
  :message.market?marketBody(message.market,club):message.review?reviewBody(message.review,club):message.players?playersBody(message):'';
 return `<header class="news-message-head"><div class="news-message-meta">${tag(message.kind)}<small>${date(message.date,true)}</small>${status}</div><div class="news-title"><h2>${linked(message.segments)}</h2>${value}</div></header>${body?`<div class="news-body">${body}</div>`:''}`;
}

function standingsBlock(club,standings){
 if(!standings)return card('Classement',empty('Votre club ne dispute pas de championnat simulé.','Pas de classement'));
 return card(roundTitle('Classement',standings.items),standingsTable(standings,'record',false,club.id),`<a href="#/league/${club.competition_id}" aria-label="Voir le classement complet">Voir →</a>`,'standings-card');
}

// The first-team players who cannot play: injured, with the day they are back, or suspended.
function unavailableBlock(club,squad){
 const out=squad.items.filter(player=>!player.away&&(player.injured_until||player.suspension));
 const state=player=>player.injured_until?`<b class="danger">Blessé · ${shortDate(player.injured_until)}</b>`:`<b class="news-ban">Suspendu · ${player.suspension} match${player.suspension>1?'s':''}</b>`;
 const body=out.length?`<ul class="moves">${out.map(player=>`<li>${position(player.position)}<span>${playerLink(player.id,player.name)}</span>${state(player)}</li>`).join('')}</ul>`:'<p class="muted">Aucun</p>';
 return card(`Indisponibles · ${out.length}`,`<div class="card-body">${body}</div>`,`<a href="#/club/${club.id}/composition" aria-label="Voir la composition">Voir →</a>`);
}

// The five players with the most goals, assists and matches for the club this season, and its five best-rated ones among
// those who played at least half as many matches as its most used player.
function leadersBlock(club,squad){
 const played=squad.items.filter(player=>player.appearances>0),most=Math.max(0,...played.map(player=>player.appearances));
 const top=(key,among=played)=>among.filter(player=>player[key]>0).sort((a,b)=>b[key]-a[key]||b.appearances-a.appearances||a.id-b.id).slice(0,5)
  .map(player=>`<li><span>${playerLink(player.id,player.name)}</span><b>${key==='average'?averageNote(player[key]):n(player[key])}</b></li>`).join('');
 const list=(title,items)=>`<div><h3>${title}</h3>${items?`<ul class="moves">${items}</ul>`:'<p class="muted">—</p>'}</div>`;
 return card('Joueurs',`<div class="card-body news-leaders">${list('Buts',top('goals'))}${list('Passes',top('assists'))}${list('Notes',top('average',played.filter(player=>player.appearances*2>=most)))}${list('Matches',top('appearances'))}</div>`,
  `<a href="#/club/${club.id}" aria-label="Voir l’effectif">Voir →</a>`);
}

// Actualités: the feed on the left, the message opened in the middle (`msg`, marked as read by the page before it is drawn),
// the club at a glance on the right.
export async function newsScreen(params){
 const state=await api('/monde/etat'),id=state.controlled_club_id,shown=params.has('msg')?Number(params.get('msg')):null;
 const query=params.has('page')?`?page=${Number(params.get('page'))}`:shown!=null?`?message=${shown}`:'';
 const [club,overview,feed,squad,message]=await Promise.all([api(`/clubs/${id}`),api(`/clubs/${id}/apercu`),api(`/ma-partie/actualites${query}`),api(`/clubs/${id}/effectif`),
  shown!=null?api(`/ma-partie/actualites/${shown}`):null]);
 const standings=club.competition_id?await api(`/competitions/${club.competition_id}/classement`):null;
 const list=feed.items.length?`<ul class="news-rows">${feed.items.map(item=>listRow(item,shown)).join('')}</ul>${feed.total>feed.page_size?pager(feed):''}`
  :empty('Rien à signaler pour l’instant.','Le calme avant la tempête');
 const widgets=`<div>${standingsBlock(club,standings)}${unavailableBlock(club,squad)}</div><div>${calendarBlock(club,overview.calendar)}${leadersBlock(club,squad)}${financesBlock(club,overview.finances)}</div>`;
 return `<div class="page-heading news-heading"><div><h1>Actualités</h1></div><button type="button" data-news-read="all"${feed.unread?'':' disabled'}>Tout lire</button></div>`
  +`<div class="news"><section class="card news-list" aria-label="Messages">${list}</section><section class="card news-message" aria-label="Message">${message?messagePane(message,club):''}</section><aside class="news-widgets" aria-label="Votre club">${widgets}</aside></div>`;
}
