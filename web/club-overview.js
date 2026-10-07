import {api,escape as e,number as n,money,price,date,kitDot,kitShirt,PITCH_BOXES,clubLink,playerLink,card,empty,fact,table,figure,position,levelBadge,nationBadge,facilityRating,safeColor,contrastText,initials,surname,standingsTable,competitionBadge} from './ui.js';
import {monthlySalary,monthlyAmount} from './salaries.js';

const BEST_PLAYERS=8;
export const shortDate=value=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00`));
export const outcomeLabels={V:'Victoire',N:'Match nul',D:'Défaite'};

// A red plane marks an away game (Material Design "flight" icon).
export const awayIcon='<svg class="away" viewBox="0 0 24 24" role="img" aria-label="Match à l’extérieur"><title>Match à l’extérieur</title><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';

// One line per match: opponent, plane if away, then a badge naming the competition when it is not the club's championship.
function matchRow(match,club){
 const home=match.home.id===club.id,opponent=home?match.away:match.home;
 const score=match.score?`<span class="club-match-score ${match.outcome}" title="${outcomeLabels[match.outcome]}">${match.score.join(' – ')}</span>`:'<span class="club-match-score pending">À venir</span>';
 const shootout=match.penalties?`t.a.b. ${match.penalties.join(' – ')}`:'';
 const badge=match.competition!==club.competition?competitionBadge({id:match.competition_id,name:match.competition}):'';
 const detail=`${match.competition} · ${match.round_label} · ${home?'Domicile':'Extérieur'}${shootout?` · ${shootout}`:''}`;
 return `<a class="club-match" href="#/match/${match.id}" title="${e(detail)}"><span class="club-match-date">${shortDate(match.date)}</span><span class="club-match-who"><b>${kitDot(opponent)}${e(opponent.name)}</b>${home?'':awayIcon}${badge}${shootout?`<small>${e(shootout)}</small>`:''}</span>${score}</a>`;
}

// No heading: a score tells a played match from one still to come.
const matchList=(matches,club,none)=>`<div class="club-matches">${matches.length?matches.map(match=>matchRow(match,club)).join(''):`<p class="muted">${none}</p>`}</div>`;

// `link` lets another screen point the block elsewhere than the club's own tab.
export function calendarBlock(club,data,link=`#/club/${club.id}/calendar`){
 // The API lists the played matches newest first; the block reads in date order, from the oldest to the next ones.
 return card('Calendrier',`<div class="card-body">${matchList([...[...data.last].reverse(),...data.next],club,'Aucun match programmé.')}</div>`,`<a href="${link}" aria-label="Voir le calendrier">Voir →</a>`);
}

// What is left to spend on transfers, and the wage bill as a ring filled to its share of the cap; `balance` adds the cash in hand.
export function financesBlock(club,data,{balance=false}={}){
 const budget=Math.max(0,data.transfer_budget-data.reserved_transfer_budget),used=Math.round(100*data.wage_bill/Math.max(1,data.wage_cap));
 const ring=`<span class="news-ring${used>=95?' full':''}" role="img" aria-label="${used} % du plafond salarial utilisé"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26"/><circle class="value" cx="32" cy="32" r="26" stroke-dasharray="${(Math.min(100,used)*1.6336).toFixed(1)} 163.4"/></svg><b>${used} %</b></span>`;
 const cash=balance?`<small>Trésorerie <b>${money(data.balance)}</b></small>`:'';
 return card('Finances',`<div class="card-body news-finances"><div class="news-figure"><span>Budget transferts</span><strong>${money(budget)}</strong>${cash}</div><div class="news-figure ring">${ring}<div><span>Masse salariale</span><strong>${money(monthlyAmount(data.wage_bill))}</strong><small>sur ${money(monthlyAmount(data.wage_cap))}</small></div></div></div>`,
  `<a href="#/club/${club.id}/finances" aria-label="Voir les finances">Voir →</a>`);
}

// The depth of each position on a pitch attacking to the right (0 the club's own goal line, 100 the other one), as the match
// pitch places them from its bottom; full-backs and centre-backs form one line, spread from the left wing (top) to the right one.
const DEPTH={GB:10,DC:25,DG:31,DD:31,MDC:41,MC:53,MOC:67,AILG:78,AILD:78,BU:86};
const LATERAL={DG:0,DC:1,DD:2};
export function sidePitch(players,club,label){
 const line=player=>['DG','DC','DD'].includes(player.position)?'defence':DEPTH[player.position]??55;
 const rows={};players.forEach(player=>(rows[line(player)]??=[]).push(player));
 Object.values(rows).forEach(row=>row.sort((a,b)=>(LATERAL[a.position]??1)-(LATERAL[b.position]??1)));
 // Two lines of one player each in the middle would write their names over each other: they step aside, one up, one down.
 const alone=Object.values(rows).filter(row=>row.length===1&&['MDC','MC','MOC'].includes(row[0].position)).sort((a,b)=>DEPTH[a[0].position]-DEPTH[b[0].position]);
 const aside=new Map(alone.length>1?alone.map((row,index)=>[row[0],index%2?62:38]):[]);
 const marks=players.map(player=>{
  const row=rows[line(player)];
  let across=aside.get(player)??50+(row.indexOf(player)-(row.length-1)/2)*Math.min(30,78/Math.max(1,row.length-1));
  if(player.position==='AILG')across=15;if(player.position==='AILD')across=85;
  const shirt=kitShirt(player.temporary?null:club.major_color,club.minor_color,player.position);
  const tag=player.temporary?'span':'a',link=player.temporary?' title="Joueur temporaire"':` href="#/player/${player.id}" title="${e(player.name)}"`;
  return `<${tag} class="pitch-player"${link} style="left:${DEPTH[player.position]??55}%;top:${across}%">${shirt}<small>${e(surname(player.name))}</small></${tag}>`;
 }).join('');
 return `<div class="pitch lying" aria-label="${e(label)}">${PITCH_BOXES}${marks}</div>`;
}

export function lineupBlock(club,lineup){
 if(!lineup)return card('Dernier onze aligné',empty('Le club n’a pas encore de composition enregistrée.','Aucun match joué'),'','lineup-card');
 const {match}=lineup,home=match.home.id===club.id,opponent=home?match.away:match.home;
 const result=`<a class="lineup-match" href="#/match/${match.id}"><span class="club-match-score ${match.outcome}" title="${outcomeLabels[match.outcome]}">${match.score.join(' – ')}</span><span>${home?'contre':'à'} ${kitDot(opponent)}${e(opponent.name)}<small>${shortDate(match.date)} · ${e(match.competition)} · ${e(match.round_label)}</small></span></a>`;
 return card('Dernier onze aligné',result+sidePitch(lineup.players,club,`Onze aligné par ${club.name}`),`<a href="#/match/${match.id}" aria-label="Voir le match">Voir →</a>`,'lineup-card');
}

// Five rows of the club's league around its own, titled with the competition and the last round counted.
export function standingsExtract(club,standings){
 const items=standings?.items||[];
 if(!items.length)return '';
 const at=items.findIndex(row=>row.club?.id===club.id),start=Math.max(0,Math.min(at-2,items.length-5));
 const round=Math.max(0,...items.map(row=>row.played));
 const title=`${e(club.competition)}${round?` – ${round}<span class="ordinal">${round===1?'re':'e'}</span> journée`:''}`;
 return `<section class="card standings-card standings-extract"><div class="card-head"><h2>${title}</h2><a href="#/league/${club.competition_id}" aria-label="Voir le classement">Voir →</a></div>${standingsTable({items:items.slice(start,start+5)},'points',false,club.id)}</section>`;
}

// Beside the squad: the calendar, the last eleven, the league around the club and its money, each opening its page.
export function squadWidgets(club,overview,standings){
 return `<aside class="club-widgets" aria-label="Le club en bref">${calendarBlock(club,overview.calendar)}${lineupBlock(club,overview.lineup)}${standingsExtract(club,standings)}${financesBlock(club,overview.finances,{balance:true})}</aside>`;
}

// Beside the list of clubs, the one picked in it: its standing, its matches, its money and its best players, with a way
// to each tab of its page at the foot.
export async function clubPreview(id){
 const [club,data,squad]=await Promise.all([api(`/clubs/${id}`),api(`/clubs/${id}/apercu`),api(`/clubs/${id}/effectif?tri=rating&ordre=desc`)]);
 const major=safeColor(club.major_color),minor=safeColor(club.minor_color)||major;
 const crest=`<div class="crest"${major?` style="background:linear-gradient(155deg,${major} 55%,${minor} 55%);color:${contrastText(major)}"`:''}>${initials(club.name)}<img class="crest-logo" src="/crests/TCM1_${club.id}.png" alt="" loading="lazy" onerror="this.remove()"></div>`;
 const tile=(label,value)=>`<div class="tile"><span>${label}</span><strong>${value}</strong></div>`;
 const standing=club.standing;
 const tiles=`<div class="rail-tiles">${tile('Réputation',n(club.reputation))}${standing?tile('Classement',`${standing.rank}${standing.rank===1?'er':'e'}`)+tile('Points',standing.points):''}</div>`;
 const books=data.finances,used=Math.round(100*books.wage_bill/Math.max(1,books.wage_cap));
 const finances=`<h3>Finances</h3>${fact('Budget transferts',money(Math.max(0,books.transfer_budget-books.reserved_transfer_budget)))}${fact('Solde',money(books.balance))}`
  +fact('Masse salariale',`<i class="gauge${used>=95?' full':''}" role="img" aria-label="${used} % du plafond salarial utilisé"><i style="width:${Math.min(100,used)}%"></i></i><b>${money(monthlyAmount(books.wage_bill))} / ${money(monthlyAmount(books.wage_cap))}</b>`)
  +fact('Achats de la saison',money(books.season_spent))+fact('Ventes de la saison',money(books.season_sales));
 // The players the club has lent are not its to field.
 const best=squad.items.filter(player=>!player.away).slice(0,BEST_PLAYERS);
 const players=best.length?`<h3>Meilleurs joueurs</h3><div class="preview-table">${table(['POSTE','JOUEUR','ÂGE','NIV.','POT.','VALEUR'],best.map(player=>[position(player.position),`<span class="strong">${playerLink(player.id,player.name)}</span>`,figure(player.age),levelBadge(player.rating),levelBadge(player.potential),figure(money(player.value))]))}</div>`:'';
 const tab=(key,label)=>`<a class="button" href="#/club/${club.id}/${key}">${label}</a>`;
 return `<div class="card preview"><div class="preview-head">${crest}<h2><a href="#/club/${club.id}">${e(club.name)}</a></h2></div>`
  +`<div class="preview-line"><span>${nationBadge(club.nation_code,{full:true})}</span><span class="muted">${e(club.competition||'Marché extérieur')} · ${n(club.capacity)} places</span></div>`
  +tiles+fact('Tactique',e(club.formation))+fact('Entraînement',facilityRating(club.training_facilities))+fact('Recrutement des jeunes',facilityRating(club.youth_recruitment))
  +(club.active?`<h3>Matches</h3>${matchList([...[...data.calendar.last].reverse(),...data.calendar.next],club,'Aucun match programmé.')}`:'')
  +finances+players
  +`<div class="preview-actions"><div class="preview-tabs">${tab('squad','Effectif')}${tab('calendar','Calendrier')}${tab('finances','Finances')}${tab('transfers','Transferts')}</div></div></div>`;
}

const WINDOWS={summer:'Mercato d’été ouvert',winter:'Mercato d’hiver ouvert'};

// The human club's market under way, above the history of its transfers, in four columns: the offers awaiting its answer
// (grouped by player, with his value), its own offers with where their talks stand, its transfer list and the loans either way.
// `club` (its detail) gives the budget left and the room under the wage cap; `market` the window open today, if any.
export function marketBlock(transfers,{club=null,market=null}={}){
 const offerButtons=offer=>`<button class="primary" data-command="reponse-offre" data-decision="accepter" data-offer="${e(offer.offre_id)}">Accepter</button><button data-command="reponse-offre" data-decision="refuser" data-offer="${e(offer.offre_id)}">Refuser</button>`;
 const who=(id,name,role)=>`<span class="market-player">${role?position(role):''}${playerLink(id,name)}</span>`;
 const incoming=transfers.entrantes.map(group=>`<li class="market-group"><div class="market-group-head">${playerLink(group.joueur_id,group.joueur)}${group.valeur!=null?`<small>valeur ${money(group.valeur)}</small>`:''}</div>`
  +`<ul>${group.offres.map(offer=>`<li><span class="market-club">${clubLink(offer.acheteur)}</span><b>${money(offer.indemnite)}</b><span class="market-actions">${offerButtons(offer)}</span></li>`).join('')}</ul></li>`);
 // Talks show where they stand; an older offer still in its auction shows the wage it proposes.
 const stage=offer=>({indemnite:'Contre-offre en cours',accord_club:`Réponse du joueur le ${date(offer.date_prevue)}`,salaire:'Contrat à négocier',signature:`Arrivée le ${date(offer.date_prevue)}`})[offer.etape]||monthlySalary(offer.salaire_propose);
 const outgoing=transfers.sortantes.map(offer=>`<li><div class="market-line">${who(offer.joueur_id,offer.joueur,offer.poste)}<b>${price(offer.indemnite)}</b></div><small>${offer.vendeur?clubLink(offer.vendeur):'Libre'} · ${stage(offer)}${offer.etape==='salaire'?` · <a href="#/player/${offer.joueur_id}">Négocier →</a>`:''}</small></li>`);
 const listed=transfers.liste.map(row=>`<li><div class="market-line">${who(row.joueur_id,row.joueur,row.poste)}<b>${price(row.indemnite)}</b></div></li>`);
 const loan=(row,arrow)=>`<li><div class="market-line"><span class="market-player">${playerLink(row.joueur_id,row.joueur)}<small>${arrow} ${clubLink(row.club)}</small></span><span class="muted">${shortDate(row.fin)}</span></div></li>`;
 const loans=[...(transfers.prets||[]).map(row=>loan(row,'→')),...(transfers.emprunts||[]).map(row=>loan(row,'←'))];
 const offers=transfers.entrantes.reduce((sum,group)=>sum+group.offres.length,0);
 const section=(title,items,none,count=items.length,alert=false)=>`<div class="market-column"><h3>${title}<span class="market-count${alert&&count?' alert':''}">${count}</span></h3>${items.length?`<ul class="market-list">${items.join('')}</ul>`:`<p class="muted">${none}</p>`}</div>`;
 const head=[market?`<span class="market-state open">${WINDOWS[market]||'Mercato ouvert'}</span>`:'<span class="market-state">Mercato fermé</span>',
  club?`<span class="market-room">Budget <b>${money(club.available_budget)}</b> · Marge salariale <b>${monthlySalary(Math.max(0,club.wage_cap-club.wage_bill))}</b></span>`:''].join('');
 const body=section('Offres reçues',incoming,'Aucune offre sur vos joueurs.',offers,true)+section('Vos offres',outgoing,'Aucune offre en cours.')
  +section('Liste des transferts',listed,'Aucun joueur sur la liste.')+section('Prêts',loans,'Aucun prêt en cours.');
 return `<section class="card market-card"><div class="card-head"><h2>Mercato en cours</h2>${head}</div><div class="market-columns">${body}</div></section>`;
}
