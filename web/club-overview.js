import {api,escape as e,number as n,money,price,budget as spendable,date,kitDot,kitShirt,shirtLabel,playerBlock,PITCH_BOXES,clubLink,playerLink,card,empty,fact,table,figure,position,levelBadge,nationBadge,nationFlag,facilityRating,safeColor,contrastText,initials,shortName,standingsTable,competitionBadge,competitionLink,
 spreadLayout,level,levelHue,blockNote,averageNote,moraleCell,contractEnd,roundTitle,GO} from './ui.js';
import {monthlySalary,monthlyAmount,monthlyMargin} from './salaries.js';
import {clubTiles} from './club-hero.js';

const BEST_PLAYERS=8;
export const shortDate=value=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00`));
export const outcomeLabels={V:'Victoire',N:'Match nul',D:'Défaite'};

// A red plane marks an away game (Material Design "flight" icon).
export const awayIcon='<svg class="away" viewBox="0 0 24 24" role="img" aria-label="Match à l’extérieur"><title>Match à l’extérieur</title><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';

// A side by its name: a selection's after its flag, a club's after the dot of its colours.
const sideName=side=>side.national?`<span class="nation">${nationFlag(side.nation,{link:false})}${e(side.name)}</span>`:`${kitDot(side)}${e(side.name)}`;

// One line per match: opponent, plane if away, then a badge naming the competition when it is not the club's championship
// (for a selection, the edition it plays). A selection's match on neutral ground is not an away game.
function matchRow(match,club){
 const home=match.home.id===club.id,opponent=home?match.away:match.home,neutral=match.international&&match.neutral;
 const score=match.score?`<span class="club-match-score ${match.outcome}" title="${outcomeLabels[match.outcome]}">${match.score.join(' – ')}</span>`:'<span class="club-match-score pending">À venir</span>';
 const shootout=match.penalties?`t.a.b. ${match.penalties.join(' – ')}`:'';
 const badge=match.competition!==club.competition?competitionBadge({id:match.competition_id,name:match.competition,...(match.international?{kind:'international',code:match.competition_code}:{})},{link:false}):'';
 const detail=`${match.competition} · ${match.round_label} · ${neutral?'Terrain neutre':home?'Domicile':'Extérieur'}${shootout?` · ${shootout}`:''}`;
 return `<a class="club-match" href="#/match/${match.id}" title="${e(detail)}"><span class="club-match-date">${shortDate(match.date)}</span><span class="club-match-who"><b>${sideName(opponent)}</b>${home||neutral?'':awayIcon}${badge}${shootout?`<small>${e(shootout)}</small>`:''}</span>${score}</a>`;
}

// No heading: a score tells a played match from one still to come.
const matchList=(matches,club,none)=>`<div class="club-matches">${matches.length?matches.map(match=>matchRow(match,club)).join(''):`<p class="muted">${none}</p>`}</div>`;

// `link` lets another screen point the block elsewhere than the club's own tab.
export function calendarBlock(club,data,link=`#/club/${club.id}/calendar`){
 // The API lists the played matches newest first; the block reads in date order, from the oldest to the next ones.
 return card('Calendrier',`<div class="card-body">${matchList([...[...data.last].reverse(),...data.next],club,'Aucun match programmé.')}</div>`,`<a href="${link}" aria-label="Voir le calendrier">Voir ${GO}</a>`);
}

// What is left to spend on transfers and in wages, the offers under way set aside; the wage margin as a ring filled to its
// share of the cap. `balance` adds the cash in hand.
export function financesBlock(club,data,{balance=false}={}){
 const budget=Math.max(0,data.transfer_budget-data.reserved_transfer_budget),margin=Math.max(0,data.wage_cap-data.wage_bill-(data.reserved_wages||0));
 const left=Math.round(100*margin/Math.max(1,data.wage_cap));
 const ring=`<span class="news-ring${left<=5?' full':''}" role="img" aria-label="${left} % du plafond salarial disponible"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26"/><circle class="value" cx="32" cy="32" r="26" stroke-dasharray="${(left*1.6336).toFixed(1)} 163.4"/></svg><b>${left} %</b></span>`;
 const cash=balance?`<small>Trésorerie <b>${money(data.balance)}</b></small>`:'';
 return card('Finances',`<div class="card-body news-finances"><div class="news-figure"><span>Budget transferts</span><strong>${spendable(budget)}</strong>${cash}</div><div class="news-figure ring">${ring}<div><span>Marge salariale</span><strong>${monthlyMargin(margin)}</strong><small>sur ${money(monthlyAmount(data.wage_cap))}</small></div></div></div>`,
  `<a href="#/club/${club.id}/finances" aria-label="Voir les finances">Voir ${GO}</a>`);
}

// `rows` of the club's league around its own (five by default, the whole league when it has room), titled with the
// competition and the last round counted.
export function standingsExtract(club,standings,rows=5){
 const items=standings?.items||[];
 if(!items.length)return '';
 const shown=Math.min(rows,items.length),at=items.findIndex(row=>row.club?.id===club.id),start=Math.max(0,Math.min(at-Math.floor((shown-1)/2),items.length-shown));
 const title=e(roundTitle(club.competition,items));
 return `<section class="card standings-card standings-extract"><div class="card-head"><h2>${title}</h2><a href="#/league/${club.competition_id}" aria-label="Voir le classement">Voir ${GO}</a></div>${standingsTable({items:items.slice(start,start+shown)},'points',false,club.id)}</section>`;
}

// The club's two outfits, home first, on the raised ground (a white kit would melt into the card); each opens its
// picture, its side in its tooltip.
export function kitsCard(club){
 const outfits=[['Domicile','à domicile',club.kit_url],['Extérieur','extérieure',club.away_kit_url]].filter(([,,url])=>url);
 if(!outfits.length)return '';
 return card('Tenues',`<div class="kits">${outfits.map(([label,told,url])=>`<a href="${e(url)}" target="_blank" rel="noopener" title="${label}"><img class="kit-outfit" src="${e(url)}" alt="Tenue ${told} de ${e(club.name)}" width="165" height="374"></a>`).join('')}</div>`,'','kits-card');
}

// The équipe-type on a pitch spread over its height, the lines of the Composition that its formation has, in the club's kit
// with each player's number (his position for a selection's, who wear none). Under his name, his matches of the season (starts
// and appearances off the bench) and his goals, the ball after them; for an eleven picked before any match, his note at his
// place. A selection's campaign-only reinforcement has no page, nor its kit, as on a match's pitch.
export function elevenCard(club,eleven,height=null){
 if(!eleven?.players?.length)return '';
 // A column too short for the pitch at its width narrows it to the height it has, down to what keeps its blocks apart.
 const fit=height?`;max-width:${Math.floor(Math.max(PITCH_MIN,height)*68/88)}px`:'';
 const {rows,places}=spreadLayout(eleven.players.map(player=>player.position));
 const marks=eleven.players.map((player,index)=>{
  const {x,row}=places[index],note=level(player.note);
  const facts=eleven.basis==='starts'?`<span class="block-season">${n(player.appearances)} m${player.goals?` / ${n(player.goals)}<span class="match-mark goal"></span>`:''}</span>`
   :blockNote(note,levelHue(note),`Note au poste ${player.position} : ${note} sur 200`);
  const told=eleven.basis==='starts'?`${player.appearances} match${player.appearances>1?'es':''} dont ${player.starts} titularisation${player.starts>1?'s':''}, ${player.goals} but${player.goals>1?'s':''}`:`Note au poste ${player.position} : ${note} sur 200`;
  const tag=player.temporary?'span':'a',link=player.temporary?'':` href="#/player/${player.id}"`;
  return `<${tag} class="pitch-player"${link} title="${e(player.name)} · ${e(told)}" style="left:${x}%;--row:${row}">${kitShirt(player.temporary?null:club.major_color,club.minor_color,shirtLabel(player))}${playerBlock(e(shortName(player.name,player.short)),facts)}</${tag}>`;
 }).join('');
 return card('Équipe-type',`<div class="pitch spread eleven-pitch" aria-label="Équipe-type de ${e(club.name)}" style="--rows:${rows}${fit}">${PITCH_BOXES}${marks}</div>`,'','season-eleven');
}

// Each player of the squad who asks for a decision, with what he asks it for.
const watched=squad=>squad.filter(player=>!player.away).map(player=>[player,[player.expiring?`<b class="${player.expiring_soon?'danger':'warn'}">Contrat · ${contractEnd(player.contract_end)}</b>`:'',
 player.injured_until?`<b class="danger">Blessé · ${shortDate(player.injured_until)}</b>`:'',
 player.suspension?`<b class="news-ban">Suspendu · ${player.suspension} match${player.suspension>1?'s':''}</b>`:'',
 player.morale!=null&&Math.round(player.morale*100)<70?moraleCell(player):''].filter(Boolean)]).filter(([,shown])=>shown.length);

// The players of the club run by the user who ask for a decision: a contract ending within the year, an injury, a
// suspension, a morale under 70 % (its cause after it), `rows` of them at most. Nothing when nobody does.
export function watchCard(squad,rows=6){
 const listed=watched(squad).slice(0,rows);
 if(!listed.length)return '';
 return card('À surveiller',`<ul class="watch-list">${listed.map(([player,shown])=>`<li>${position(player.position)}<span>${playerLink(player.id,player.name)}</span><span class="watch-facts">${shown.join('')}</span></li>`).join('')}</ul>`,'','watch-card');
}

// Players ranked on one figure, as bars against the first of them, its unit in the head of the card. `format` writes the
// figure; `soft` draws the bars in the pale blue.
export function leaderBars(title,rows,key,unit,{format=n,soft=false}={}){
 const top=rows[0]?.[key]||1;
 const body=rows.length?`<ol class="leader-bars">${rows.map(row=>`<li><span>${playerLink(row.player_id,row.player)}</span><i style="width:${Math.round(100*row[key]/top)}%"></i><b>${format(row[key])}</b></li>`).join('')}</ol>`:empty('Aucun joueur');
 return card(title,body,`<span class="card-hint">${unit}</span>`,`leaders-card ${key}${soft?' soft':''}`);
}

// The club's best scorers, providers and notes of the season, as bars, `rows` each. A note counts from half as many matches
// as the most used player played, as in Actualités.
export function leadersCards(squad,rows=8){
 const played=squad.filter(player=>player.appearances>0),most=Math.max(0,...played.map(player=>player.appearances));
 const top=(key,among=played)=>among.filter(player=>player[key]>0).sort((a,b)=>b[key]-a[key]||b.appearances-a.appearances||a.id-b.id).slice(0,rows)
  .map(player=>({player_id:player.id,player:player.name,[key]:player[key]}));
 const lists=[['Buteurs',top('goals'),'goals','buts',{}],['Passeurs',top('assists'),'assists','passes',{}],
  ['Notes',top('average',played.filter(player=>player.appearances*2>=most)),'average','note moyenne',{format:averageNote}]];
 return lists.filter(([,items])=>items.length).map(([title,items,key,unit,options])=>leaderBars(title,items,key,unit,{soft:true,...options})).join('');
}

// The height of a column of the Présentation: the window's under the band, the tabs, the row of tiles and the 8 under it,
// less the page's bottom margin; a short window keeps what a laptop shows. Its lists take the rows of 26 it holds once the rest is drawn:
// a card's head (34), the padding of a list (16), the gap between two cards (8), a heading (26); a table of the league has
// rows of 27 under 68 of head; the kits stand 374 high in 12 of padding under their head.
const PRESENTATION_TOP=273,ROW=26,HEAD=34,PADDING=16,GAP=8,KITS=432,WATCH_ROWS=6,TABLE_HEAD=68,TABLE_ROW=27,PITCH_MIN=440;
export const presentationHeight=()=>Math.max(600,(typeof window==='undefined'?1080:window.innerHeight)-PRESENTATION_TOP);
export const rowsIn=height=>Math.max(3,Math.floor(height/ROW));
// The measures a selection's Présentation lays out its columns with too (web/international.js).
export const PRESENTATION={HEAD,PADDING,GAP,KITS,TABLE_HEAD,TABLE_ROW};
// The columns of a Présentation under the row of its tiles, each a list of cards; a card left empty takes no room.
export const presentationColumns=columns=>`<div class="club-presentation" data-fill>${columns.map(cards=>`<div class="presentation-column">${cards.filter(Boolean).join('')}</div>`).join('')}</div>`;

// A club's Présentation: the row of its tiles, then four columns that fill the window. Its kits and its money; its
// équipe-type and what asks for a decision (the club run by the user); its calendar beside its league, which share their
// rows (the next three matches at most, the latest played before them; the whole league when it has room); its best
// scorers, providers and notes. `season` is its calendar of the season, `squad` its list, `standings` its league's table,
// `human` whether the user runs it.
export function presentationContent(club,{overview,season,squad,standings,human}){
 const height=presentationHeight(),league=standings?.items?.length||0,players=squad?.items||[];
 const played=(season?.items||[]).filter(match=>match.score),upcoming=(season?.items||[]).filter(match=>!match.score).slice(0,3);
 // The league whole when five matches still fit beside it, else around the club; the calendar takes what is left.
 const table=league?Math.max(5,Math.min(league,Math.floor((height-HEAD-PADDING-5*ROW-GAP-TABLE_HEAD)/TABLE_ROW))):0;
 const matches=rowsIn(height-HEAD-PADDING-(table?GAP+TABLE_HEAD+table*TABLE_ROW:0));
 const calendar=played.length||upcoming.length?calendarBlock(club,{last:played.slice(-Math.max(0,matches-upcoming.length)).reverse(),next:upcoming}):'';
 const watching=human?Math.min(WATCH_ROWS,watched(players).length):0;
 const pitch=height-HEAD-PADDING-(watching?GAP+HEAD+watching*ROW:0);
 return clubTiles(club,season?.competitions||[])+presentationColumns([
  [kitsCard(club),financesBlock(club,overview.finances,{balance:true})],
  [elevenCard(club,overview.eleven,pitch),watching?watchCard(players,watching):''],
  [calendar,standingsExtract(club,standings,table)],
  [leadersCards(players,rowsIn((height-3*(HEAD+PADDING)-2*GAP)/3))]]);
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
 const finances=`<h3>Finances</h3>${fact('Budget transferts',spendable(Math.max(0,books.transfer_budget-books.reserved_transfer_budget)))}${fact('Solde',money(books.balance))}`
  +fact('Masse salariale',`<i class="gauge${used>=95?' full':''}" role="img" aria-label="${used} % du plafond salarial utilisé"><i style="width:${Math.min(100,used)}%"></i></i><b>${money(monthlyAmount(books.wage_bill))} / ${money(monthlyAmount(books.wage_cap))}</b>`)
  +fact('Achats de la saison',money(books.season_spent))+fact('Ventes de la saison',money(books.season_sales));
 // The players the club has lent are not its to field.
 const best=squad.items.filter(player=>!player.away).slice(0,BEST_PLAYERS);
 const players=best.length?`<h3>Meilleurs joueurs</h3><div class="preview-table">${table(['POSTE','JOUEUR','ÂGE','NIV.','POT.','VALEUR'],best.map(player=>[position(player.position),`<span class="strong">${playerLink(player.id,player.name)}</span>`,figure(player.age),levelBadge(player.rating),levelBadge(player.potential),figure(price(player.value))]))}</div>`:'';
 const tab=(key,label)=>`<a class="button" href="#/club/${club.id}/${key}">${label}</a>`;
 return `<div class="card preview"><div class="preview-head">${crest}<h2><a href="#/club/${club.id}">${e(club.name)}</a></h2></div>`
  +`<div class="preview-line"><span>${nationBadge(club.nation_code,{full:true})}</span><span class="muted">${club.competition?competitionLink({id:club.competition_id,name:club.competition}):'Marché extérieur'} · ${n(club.capacity)} places</span></div>`
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
 const incoming=transfers.entrantes.map(group=>`<li class="market-group"><div class="market-group-head">${playerLink(group.joueur_id,group.joueur)}${group.valeur!=null?`<small>valeur ${price(group.valeur)}</small>`:''}</div>`
  +`<ul>${group.offres.map(offer=>`<li><span class="market-club">${clubLink(offer.acheteur)}</span><b>${price(offer.indemnite)}</b><span class="market-actions">${offerButtons(offer)}</span></li>`).join('')}</ul></li>`);
 // Talks show where they stand; an older offer still in its auction shows the wage it proposes.
 const stage=offer=>({indemnite:'Contre-offre en cours',accord_club:`Réponse du joueur le ${date(offer.date_prevue)}`,salaire:'Contrat à négocier',signature:`Arrivée le ${date(offer.date_prevue)}`})[offer.etape]||monthlySalary(offer.salaire_propose);
 const outgoing=transfers.sortantes.map(offer=>`<li><div class="market-line">${who(offer.joueur_id,offer.joueur,offer.poste)}<b>${price(offer.indemnite)}</b></div><small>${offer.vendeur?clubLink(offer.vendeur):'Libre'} · ${stage(offer)}${offer.etape==='salaire'?` · <a href="#/player/${offer.joueur_id}">Négocier ${GO}</a>`:''}</small></li>`);
 const listed=transfers.liste.map(row=>`<li><div class="market-line">${who(row.joueur_id,row.joueur,row.poste)}<b>${price(row.indemnite)}</b></div></li>`);
 const loan=(row,arrow)=>`<li><div class="market-line"><span class="market-player">${playerLink(row.joueur_id,row.joueur)}<small>${arrow} ${clubLink(row.club)}</small></span><span class="muted">${shortDate(row.fin)}</span></div></li>`;
 const loans=[...(transfers.prets||[]).map(row=>loan(row,'→')),...(transfers.emprunts||[]).map(row=>loan(row,'←'))];
 const offers=transfers.entrantes.reduce((sum,group)=>sum+group.offres.length,0);
 const section=(title,items,none,count=items.length,alert=false)=>`<div class="market-column"><h3>${title}<span class="market-count${alert&&count?' alert':''}">${count}</span></h3>${items.length?`<ul class="market-list">${items.join('')}</ul>`:`<p class="muted">${none}</p>`}</div>`;
 const head=[market?`<span class="market-state open">${WINDOWS[market]||'Mercato ouvert'}</span>`:'<span class="market-state">Mercato fermé</span>',
  club?`<span class="market-room">Budget <b>${spendable(club.available_budget)}</b> · Marge salariale <b>${monthlyMargin(Math.max(0,club.wage_cap-club.wage_bill))}</b></span>`:''].join('');
 const body=section('Offres reçues',incoming,'Aucune offre sur vos joueurs.',offers,true)+section('Vos offres',outgoing,'Aucune offre en cours.')
  +section('Liste des transferts',listed,'Aucun joueur sur la liste.')+section('Prêts',loans,'Aucun prêt en cours.');
 return `<section class="card market-card"><div class="card-head"><h2>Mercato en cours</h2>${head}</div><div class="market-columns">${body}</div></section>`;
}
