import {monthlySalary,monthlyAmount} from './salaries.js';
import {playerNavigation} from './navigation.js';
import {api,escape as e,number as n,money,price,attributeScore,level,levelHue,levelBadge,scoreBadge,scoreHue,formReading,moraleReading,date,season,clubLink,kitDot,nationFlag,nationBadge,nationBadges,position,empty,card,fact,appearances,positionNote,marketTags,ATTRIBUTES,ATTRIBUTE_SECTIONS,COMPOSITES,COMPOSITE_SECTIONS} from './ui.js';

// An attribute weighing at least this share of the main position's rating (`attribute_weights`, from the game rules) is a
// key one for that position; the position marks them and changes nothing else.
const KEY_WEIGHT=.14;

// The player on screen, whose Jeu section follows the position picked on his pitch of aptitudes.
let shown=null;

// Sections and attributes keep the order of ATTRIBUTE_SECTIONS, whatever the position. Goalkeeper attributes mean nothing
// for an outfield player and the reverse: the irrelevant section is hidden, and for a goalkeeper its attributes stay
// reachable in a fold. Placement is part of a goalkeeper's craft (30% of a save, 40% of a claim), so it moves from Défense
// to Gardien for him.
export function attributeGroups(player) {
 const keeper=player.position==='GB',weights=player.attribute_weights||{};
 const listed=name=>{
  const own=ATTRIBUTE_SECTIONS.find(section=>section.key===name).attributes.filter(key=>!(keeper&&key==='placement'));
  return keeper&&name==='goalkeeper'?[...own.slice(0,2),'placement',...own.slice(2)]:own;
 };
 const items=name=>listed(name).filter(key=>key in player.attributes)
  .map(key=>({key,value:player.attributes[key],weight:weights[key]||0}));
 const names=keeper?['goalkeeper','general']:['defense','attack','general'];
 return {sections:names.map(name=>({key:name,title:ATTRIBUTE_SECTIONS.find(section=>section.key===name).title,items:items(name)})).filter(section=>section.items.length),
  others:keeper?[...items('defense'),...items('attack')]:[]};
}

function attributeItem({key,value,weight}) {
 const important=weight>=KEY_WEIGHT;
 return `<div class="attribute${important?' key':''}"${important?` title="Compte pour ${Math.round(weight*100)} % de la note du poste"`:''}><span>${ATTRIBUTES[key]}</span>${scoreBadge(attributeScore(value))}</div>`;
}

// Greed is a trait out of 20 like an attribute, but neither good nor bad in itself: it closes Général, in a plain badge.
const greedItem=player=>player.greed==null?'':`<div class="attribute"><span>Appât du gain</span><span class="rating" title="Appât du gain sur 20">${Math.round(1+player.greed*19)}</span></div>`;

// The composites the engine plays with, out of 200 like the level: a goalkeeper's two, or the six of an outfield player. Those
// the position `role` asks for are marked like key attributes, the others grey.
export function compositeItems(player, role=player.position) {
 const keys=player.position==='GB'?['arret','sortie']:COMPOSITE_SECTIONS.filter(section=>section.key!=='goalkeeper').flatMap(section=>section.composites);
 const wanted=player.composites_by_position?.[role]||[];
 return keys.filter(key=>player.composites?.[key]!=null).map(key=>({key,value:player.composites[key],wanted:wanted.includes(key)}));
}

const weighting=weights=>Object.entries(weights||{}).map(([key,weight])=>`${ATTRIBUTES[key]} ${Math.round(weight*100)} %`).join(' · ');

// Ahead of the attributes, the Jeu section; picking a position on the pitch of aptitudes sets the `role` it is read for.
export function compositesGroup(player, role=player.position) {
 const items=compositeItems(player,role);
 if(!items.length)return '';
 const item=({key,value,wanted})=>{const badge=levelBadge(value),weights=weighting(player.composite_weights?.[key]);
  return `<div class="attribute${wanted?' key':''}" title="${e(weights?`${COMPOSITES[key]} : ${weights}`:COMPOSITES[key])}"><span>${COMPOSITES[key]}</span>${wanted?badge:`<span class="off-role">${badge}</span>`}</div>`;};
 return `<div class="attribute-group composites-group" data-composites><h3>Jeu ${position(role)}</h3><div class="attributes-grid">${items.map(item).join('')}</div></div>`;
}

function attributesBody(player) {
 const {sections,others}=attributeGroups(player);
 const grid=(list,extra='')=>`<div class="attributes-grid">${list.map(attributeItem).join('')}${extra}</div>`;
 const fold=others.length?`<details class="attribute-others"><summary>Autres attributs (${others.length})</summary>${grid(others)}</details>`:'';
 return `<div class="card-body">${compositesGroup(player)}${sections.map(section=>`<div class="attribute-group"><h3>${section.title}</h3>${grid(section.items,section.key==='general'?greedItem(player):'')}</div>`).join('')}${fold}</div>`;
}

// Position of each role on the pitch, in % of its width and height: goalkeeper at the bottom, striker at the top, as in match line-ups.
// The lines of the central column stand at least 16% apart, and the wingers between the striker and the playmaker, so that a
// shirt, the ring of the main position and its label never touch the next ones on a 360px pitch.
const PITCH={GB:[50,92],DC:[50,76],DG:[15,70],DD:[85,70],MDC:[50,59],MC:[50,42],MOC:[50,25],AILG:[15,17],AILD:[85,17],BU:[50,8]};

// Only the roles the player can actually fill are drawn; without any, there is no pitch at all.
const MIN_RATING=10;

// Beside each shirt, the player's note at that position (`player`, from /api/joueurs): on its right, or on its left along the
// right touchline so that it stays on the pitch. A click on a position reads the Jeu section of the attributes for it (`picked`).
export function positionPitch(ratings, main, player=null, picked=main) {
 const roles=Object.entries(PITCH).filter(([role])=>ratings[role]>=MIN_RATING);
 if(!roles.length)return '';
 const note=(role,x)=>{const badge=positionNote(player,role,player?.composites_by_position?.[role]);return badge?`<span class="position-note${x>70?' left':''}">${badge}</span>`:'';};
 return `<div class="pitch ratings" role="group" aria-label="Aptitudes par poste">${roles.map(([role,[x,y]])=>`<button type="button" class="pitch-player${role===main?' main':''}${role===picked?' picked':''}" data-composite-role="${role}" aria-pressed="${role===picked}" style="left:${x}%;top:${y}%"><span class="shirt graded" style="--hue:${scoreHue(ratings[role])}" title="${role} : ${ratings[role]} / 20">${ratings[role]}</span>${note(role,x)}<small>${role}</small></button>`).join('')}</div>`;
}

// The same positions as a list, best note first: position, affinity out of 20, note out of 200. A wide screen shows it beside
// the pitch, whose shirts then stand without their notes; a row picks its position as a shirt does. Without notes (an older
// server) there is no list.
export function positionList(ratings, player, picked=player.position) {
 const notes=player.position_notes||{};
 const roles=Object.keys(PITCH).filter(role=>ratings[role]>=MIN_RATING&&notes[role]!=null).sort((a,b)=>notes[b]-notes[a]||ratings[b]-ratings[a]);
 if(!roles.length)return '';
 const row=role=>`<button type="button" class="position-row${role===picked?' picked':''}" data-composite-role="${role}" aria-pressed="${role===picked}"><span>${position(role)}</span><span>${scoreBadge(ratings[role],`Affinité ${role} sur 20`)}</span><span>${positionNote(player,role,player.composites_by_position?.[role])}</span></button>`;
 return `<div class="positions-list"><div class="position-row head" aria-hidden="true"><span>POSTE</span><span>AFFINITÉ</span><span>NOTE</span></div>${roles.map(row).join('')}</div>`;
}

const MONTH=new Intl.DateTimeFormat('fr-FR',{month:'short'}),MONTH_YEAR=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'});
const calendar=({year,month})=>new Date(year,month-1,15);

// `points` run month by month from the oldest to the latest, each with its level out of 200, its season and the club played for
// that month (if any); seasons recorded before the monthly history have one point, at their opening. The abscissa is time, so such gaps
// keep their length. A dot marks the first point of each season and the latest one.
// Text and dots are HTML so they keep the size of the rest of the interface; only the gridlines and the curve are stretched SVG.
export function levelChart(points) {
 const values=points.map(point=>point.level),months=points.map(point=>point.year*12+point.month-1);
 const low=Math.min(...values),high=Math.max(...values);
 const step=[5,10,20,25,50].find(size=>(high-low)/size<=5)??50;
 const min=Math.floor(low/step)*step;
 let max=Math.ceil(high/step)*step;if(max===min)max+=step;
 const first=months[0],span=Math.max(1,months.at(-1)-first);
 const across=month=>((month-first)*100/span).toFixed(2);
 const down=value=>((max-value)*100/(max-min)).toFixed(2);
 const ticks=[];for(let value=min;value<=max;value+=step)ticks.push(value);
 // At most five dates on the abscissa: months over two years at most, then Januaries named by their year.
 const every=[1,2,3,6,12,24,36,60,120].find(size=>span/size<=4)??120;
 const dates=[];for(let month=Math.ceil(first/every)*every;month<=months.at(-1);month+=every)dates.push(month);
 const lines=`<svg class="plot-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${ticks.map(value=>`<line class="grid-line" x1="0" x2="100" y1="${down(value)}" y2="${down(value)}" vector-effect="non-scaling-stroke"/>`).join('')}<polyline class="curve" points="${values.map((value,index)=>`${across(months[index])},${down(value)}`).join(' ')}" vector-effect="non-scaling-stroke"/></svg>`;
 const axis=ticks.map(value=>`<span class="y-tick" style="top:${down(value)}%">${value}</span>`).join('')
  +dates.map(month=>`<span class="x-tick" style="left:${across(month)}%">${month%12?MONTH.format(calendar({year:Math.floor(month/12),month:month%12+1})):month/12}</span>`).join('');
 const marks=points.map((point,index)=>{
  const last=index===points.length-1;
  if(index&&!last&&point.season===points[index-1].season)return '';
  const at=`left:${across(months[index])}%;top:${down(values[index])}%`,edge=index===0?'first':last?'last':'';
  const label=`${MONTH_YEAR.format(calendar(point))}${point.club?` · ${point.club.name}`:''} · niveau ${values[index]}`;
  return `<span class="chart-point" style="${at}" title="${e(label)}">${kitDot(point.club)||'<i class="kit-dot neutral" aria-hidden="true"></i>'}</span>${edge?`<span class="point-value ${edge}" style="${at}">${values[index]}</span>`:''}`;
 }).join('');
 return `<div class="level-chart" role="img" aria-label="Évolution mensuelle du niveau, sur 200"><div class="plot">${lines}${axis}${marks}</div></div>`;
}

const dialogButtons=confirm=>`<div class="actions"><button type="button" data-close-dialog>Annuler</button>${confirm}</div>`;

// Talks for another club's player: the fee with his club, then his wage (straight away for a free agent), each offer
// answered at once in the dialog, which comes back with the counter-offer. Agreed steps wait a few days in a pill.
function talksAction(player, state, talks) {
 const actions=body=>`<div class="player-actions">${body}</div>`;
 if(talks.etape==='accord_club')return actions(`<span class="pill">Accord avec le club · ${price(talks.indemnite)} · réponse le ${date(talks.date_prevue)}</span>`);
 if(talks.etape==='signature')return actions(`<span class="pill">Arrivée le ${date(talks.date_prevue)} · ${monthlySalary(talks.salaire)} / mois</span>`);
 const wage=talks.etape==='salaire'||!player.club&&!talks.etape;
 const label=talks.etape==='salaire'?'Négocier le contrat':wage?'Proposer un contrat':'Faire une offre';
 // The pill names the obstacle; the reason that follows its colon waits in the tooltip.
 const [barrier,reason]=(talks.obstacle||'').split(' : ');
 if(talks.obstacle)return actions(`${state.market?`<span class="pill"${reason?` title="${e(talks.obstacle)}"`:''}>${e(barrier)}</span>`:''}<button class="primary" type="button" disabled title="${e(talks.obstacle)}">${label}</button>`);
 const counter=talks.contre_offre,amount=value=>wage?`${monthlySalary(value)} / mois`:price(value);
 const left=`${talks.tours_restants} offre${talks.tours_restants>1?'s':''} restante${talks.tours_restants>1?'s':''}`;
 const intro=wage?`Salaire actuel ${player.club?monthlySalary(player.wage)+' / mois':'—'}`:`Prix minimum ${price(player.asking_price)} · budget ${price(talks.budget)}`;
 const field=wage?`<label>Salaire proposé (€/mois) <input name="montant" type="number" min="1" step="1" value="${Math.max(1,monthlyAmount(counter||player.wage))}" required></label>`
  :`<label>Indemnité proposée (M€) <input name="montant" type="number" min="0" step="0.01" value="${counter?counter/1e6:Math.round((player.value||0)/1e6)}" required></label>`;
 const accept=counter?`<button type="submit" name="accepter" value="${counter}">Accepter ${amount(counter)}</button>`:'';
 const dialog=`<dialog id="talks-dialog" class="action-dialog"><form id="talks-form" data-kind="${wage?'salaire':'indemnite'}"><span class="eyebrow">${wage?'CONTRAT':'MERCATO'}</span><h2>${wage?'Contrat':'Offre'} pour ${e(player.name)}</h2><p>${intro}</p>${counter?`<p><strong>${wage?e(player.name):e(player.club.name)} demande ${amount(counter)}</strong> · ${left}</p>`:''}<input type="hidden" name="joueur_id" value="${player.id}">${field}${dialogButtons(`${accept}<button class="primary" type="submit">Proposer</button>`)}</form></dialog>`;
 const pill=counter?`<span class="pill">Contre-offre · ${amount(counter)}</span>`:'';
 return actions(`${pill}<button class="primary" type="button" data-open-dialog="talks-dialog">${label}</button>`)+dialog;
}

// Contracts are extended on the player's terms: his pending demand is accepted or turned down.
function contractAction(player, renewal) {
 const button=`<button class="primary" type="button" data-open-dialog="contract-dialog" ${renewal?'':'disabled title="Le joueur n’attend pas de prolongation pour l’instant."'}>Proposer un contrat</button>`;
 if(!renewal)return {pills:'',buttons:button,dialogs:''};
 const terms=`<div class="card-body">${fact('Salaire actuel',`${monthlySalary(renewal.salaire_actuel)} / mois`)}${fact('Salaire demandé',`${monthlySalary(renewal.salaire_propose)} / mois`)}${fact('Fin de contrat actuelle',date(renewal.fin_contrat_actuelle))}${fact('Fin de contrat proposée',date(renewal.fin_contrat_proposee))}</div>`;
 const dialog=`<dialog id="contract-dialog" class="action-dialog"><div><span class="eyebrow">PROLONGATION</span><h2>Nouveau contrat pour ${e(player.name)}</h2><p>Le joueur est prêt à prolonger aux conditions suivantes.</p>${terms}${dialogButtons(`<button data-command="renouvellement" data-decision="refuser" data-player="${player.id}">Refuser</button><button class="primary" data-command="renouvellement" data-decision="accepter" data-player="${player.id}">Signer</button>`)}</div></dialog>`;
 return {pills:'<span class="pill">Prolongation en attente</span>',buttons:button,dialogs:dialog};
}

// An own player up for sale: on the transfer list at the fee asked, or offered to every club at once. Both dialogs take
// the fee; the offers awaiting an answer, whichever way they came, open in a dialog of their own.
function saleAction(player, sale) {
 const listed=sale.prix_liste!=null;
 const fee=(id,kind,title,confirm)=>`<dialog id="${id}" class="action-dialog"><form data-sale="${kind}"><span class="eyebrow">VENTE</span><h2>${title}</h2><p>Valeur ${price(player.value)}</p><input type="hidden" name="joueur_id" value="${player.id}"><label>Prix demandé (M€) <input name="montant" type="number" min="0" step="0.01" value="${Math.round((listed?sale.prix_liste:player.value||0)/1e4)/100}" required></label>${dialogButtons(`<button class="primary" type="submit">${confirm}</button>`)}</form></dialog>`;
 const list=listed?`<button type="button" data-command="liste-transferts" data-player="${player.id}">Retirer de la liste</button>`
  :`<button type="button" data-open-dialog="listing-dialog">Mettre sur la liste</button>`;
 const offer=sale.obstacle_proposition?`<button type="button" disabled title="${e(sale.obstacle_proposition)}">Proposer aux clubs</button>`
  :`<button type="button" data-open-dialog="proposal-dialog">Proposer aux clubs</button>`;
 const received=sale.offres.length?`<button type="button" data-open-dialog="offers-dialog">Offres reçues · ${sale.offres.length}</button>`:'';
 const rows=sale.offres.map(item=>`<li><span>${clubLink(item.acheteur)}</span><small>${monthlySalary(item.salaire_propose)} / mois</small><b>${price(item.indemnite)}</b><span class="market-actions"><button class="primary" data-command="reponse-offre" data-decision="accepter" data-offer="${e(item.offre_id)}">Accepter</button><button data-command="reponse-offre" data-decision="refuser" data-offer="${e(item.offre_id)}">Refuser</button></span></li>`).join('');
 const offers=sale.offres.length?`<dialog id="offers-dialog" class="action-dialog"><div><span class="eyebrow">OFFRES REÇUES</span><h2>Offres pour ${e(player.name)}</h2><ul class="moves">${rows}</ul><div class="actions"><button type="button" data-close-dialog>Fermer</button></div></div></dialog>`:'';
 return {pills:listed?`<span class="pill">Sur la liste · ${price(sale.prix_liste)}</span>`:'',buttons:received+list+offer,
  dialogs:(listed?'':fee('listing-dialog','liste',`Mettre ${e(player.name)} sur la liste`,'Mettre sur la liste'))
   +(sale.obstacle_proposition?'':fee('proposal-dialog','proposition',`Proposer ${e(player.name)} aux clubs`,'Proposer'))+offers};
}

// The durations a loan can take today, each with the day it ends.
const LOAN_LABELS={saison:'Fin de saison',demi_saison:'Demi-saison'};
const durationField=squad=>`<label>Durée <select name="duree">${squad.durees.map(item=>`<option value="${item.cle}">${LOAN_LABELS[item.cle]} · ${date(item.fin)}</option>`).join('')}</select></label>`;

// An own player: sent to the reserve or called back, and lent to one of the clubs that would take him.
function squadAction(player, squad) {
 const reserve=squad.en_reserve?`<button type="button" data-command="reserve" data-player="${player.id}" data-reserve="">Rappeler en équipe première</button>`
  :`<button type="button" data-command="reserve" data-player="${player.id}" data-reserve="1"${squad.obstacle_reserve?` disabled title="${e(squad.obstacle_reserve)}"`:''}>Envoyer en réserve</button>`;
 if(squad.obstacle_pret)return {pills:squad.en_reserve?'<span class="pill">En réserve</span>':'',buttons:`${reserve}<button type="button" disabled title="${e(squad.obstacle_pret)}">Prêter</button>`,dialogs:''};
 const clubs=`<label>Club <select name="club_id">${squad.clubs.map(club=>`<option value="${club.id}">${e(club.name)} · ${e(club.competition)}</option>`).join('')}</select></label>`;
 const dialog=`<dialog id="lend-dialog" class="action-dialog"><form data-loan="preter"><span class="eyebrow">PRÊT</span><h2>Prêter ${e(player.name)}</h2><input type="hidden" name="joueur_id" value="${player.id}">${clubs}${durationField(squad)}${dialogButtons('<button class="primary" type="submit">Prêter</button>')}</form></dialog>`;
 return {pills:squad.en_reserve?'<span class="pill">En réserve</span>':'',buttons:`${reserve}<button type="button" data-open-dialog="lend-dialog">Prêter</button>`,dialogs:dialog};
}

// Another club's player taken on loan: nothing to pay, only how long.
function borrowAction(player, squad) {
 if(squad.obstacle_pret)return `<button type="button" disabled title="${e(squad.obstacle_pret)}">Emprunter</button>`;
 return `<button type="button" data-open-dialog="borrow-dialog">Emprunter</button><dialog id="borrow-dialog" class="action-dialog"><form data-loan="emprunter"><span class="eyebrow">PRÊT</span><h2>Emprunter ${e(player.name)}</h2><input type="hidden" name="joueur_id" value="${player.id}">${durationField(squad)}${dialogButtons('<button class="primary" type="submit">Emprunter</button>')}</form></dialog>`;
}

async function playerActions(player, state) {
 const clubId=state.controlled_club_id;
 if(clubId==null||player.retired)return '';
 const actions=body=>`<div class="player-actions">${body}</div>`;
 // On loan, to or from the user's club or between two others: nothing to decide before he is back.
 if(player.loan)return actions(`<span class="pill">Prêté ${player.loan.parent?.id===clubId?`à ${e(player.loan.club?.name)}`:`par ${e(player.loan.parent?.name)}`} · retour le ${date(player.loan.end)}</span>`);
 if(player.club?.id===clubId){
  const [contracts,sale,squad]=await Promise.all([api('/ma-partie/contrats'),api(`/ma-partie/vente/${player.id}`),api(`/ma-partie/effectif/${player.id}`)]);
  const parts=[saleAction(player,sale),contractAction(player,contracts.items.find(row=>row.joueur_id===player.id)),squadAction(player,squad)];
  return actions(`${parts.map(part=>part.pills).join('')}${parts.map(part=>part.buttons).join('')}`)+parts.map(part=>part.dialogs).join('');
 }
 const [talks,squad]=await Promise.all([api(`/ma-partie/negociation/${player.id}`),player.club?api(`/ma-partie/effectif/${player.id}`):null]);
 return talksAction(player,state,talks)+(squad?actions(borrowAction(player,squad)):'');
}

// A line of the rail whose tooltip says more than its value.
const told=(label,value,title)=>`<div class="fact"${title?` title="${e(title)}"`:''}><span>${label}</span><strong>${value}</strong></div>`;
// A thin bar beside a figure of the rail, filled from the left: green, or in the colour of the grade `hue`.
const gauge=(share,hue)=>`<i class="gauge${hue==null?'':' graded'}"${hue==null?'':` style="--hue:${hue}"`} aria-hidden="true"><i style="width:${Math.round(Math.max(0,Math.min(1,share))*100)}%"></i></i>`;

// Form is an effect either way, drawn from the middle of its bar between the bounds it keeps (`form_bounds`; an older server
// gives none, and the figure stands alone). Within ±2 % it changes nothing: the bar stays empty.
function formFact(player) {
 if(player.form==null)return '';
 const {pct,neutral,text,title}=formReading(player.form),[low,high]=player.form_bounds||[];
 const reach=Math.max(1-low,high-1)*100;
 const fill=neutral?'':`<i class="${pct>0?'up':'down'}" style="${pct>0?'left':'right'}:50%;width:${Math.min(50,Math.abs(pct)*50/reach).toFixed(1)}%"></i>`;
 return told('Forme',`${reach>0?`<i class="gauge signed" aria-hidden="true">${fill}</i>`:''}<b>${text}</b>`,title);
}

// Morale with what weighs most on it ahead of its bar, whenever the server names a cause.
function moraleFact(player) {
 if(player.morale==null)return '';
 const {value,cause,title,hue}=moraleReading(player,true);
 const why=cause?`<span class="morale-cause" title="${e(`Pèse surtout : ${cause[1]}`)}">${cause[0]}</span>`:'';
 return told('Moral',`${why}${gauge(player.morale,hue)}<b>${value} %</b>`,title);
}

// Yellow cards add up over his competitions, each named in the tooltip; a suspension names the competition it holds in.
function disciplineFacts(player) {
 const cards=player.discipline||[];
 const bans=cards.filter(item=>item.suspended_matches).map(item=>fact('Suspension',`<span class="danger">${e(item.competition)} · ${item.suspended_matches} match${item.suspended_matches>1?'s':''}</span>`));
 return told('Cartons',cards.reduce((sum,item)=>sum+item.yellows,0),cards.map(item=>`${item.competition} ${item.yellows}`).join(' · '))+bans.join('');
}

// His main nation — the one he plays for, else the first of his nationalities — flies beside his name; the others get a line
// of their own under the club. Flags alone, named in their tooltip.
function nationFlags(player) {
 const [main,...others]=[...new Set([player.national_team,...(player.nationalities||[])].filter(Boolean))];
 const flag=code=>nationFlag(code)||nationBadge(code);
 const capped=main===player.national_team&&player.national_team_id!=null;
 return {main:!main?'':capped?`<a href="#/international/nation/${player.national_team_id}">${flag(main)}</a>`:flag(main),others:others.map(flag)};
}

// "12 sél - 3 buts": the goals only once he has scored.
const caps=player=>player.international_caps==null?'':`<b>${n(player.international_caps)} sél${player.international_goals?` - ${n(player.international_goals)} but${player.international_goals>1?'s':''}`:''}</b>`;

// Market value and asking price as big tiles under level/potential; the price reads N/A when nobody can be asked for him.
function feeTiles(player) {
 const tile=(cls,label,value,title)=>`<div class="tile ${cls}"${title?` title="${e(title)}"`:''}><span>${label}</span><strong>${value}</strong></div>`;
 const na=player.transferable===false?'Intransférable : son club refuse de le vendre':!player.club?'Sans club : aucun prix demandé':'';
 const asking=na?tile('fee-ask na','Prix demandé','N/A',na):tile('fee-ask','Prix demandé',price(player.asking_price));
 return `<div class="rail-tiles fees">${tile('fee-value','Valeur',money(player.value),'Valeur de marché')}${asking}</div>`;
}

// Where a player stands besides his club's first team: lent by the club that owns him, or in the reserve.
const loanTerms=player=>[...(player.loan?[['Prêté par',clubLink(player.loan.parent)],['Fin du prêt',date(player.loan.end)]]:[]),...(player.reserve?[['Équipe','Réserve']]:[])];

// Beside the page: who he is, how he is and what his contract is, with what the user can do about it at the foot.
// `lead` (the block stepping through the squad) sits at the left of the name.
function rail(player, lead, actions) {
 const tile=(label,value,title,hue)=>`<div class="tile${hue==null?'':' graded'}"${hue==null?'':` style="--hue:${hue}"`}${title?` title="${e(title)}"`:''}><span>${label}</span><strong>${value}</strong></div>`;
 const grade=(label,value,title)=>value==null?tile(label,'—'):tile(label,level(value),title,levelHue(level(value)));
 const tiles=`<div class="rail-tiles">${tile('Âge',player.age,`Né le ${date(player.born)}`)}${grade('Niveau',player.rating,'Niveau actuel sur 200')}${grade('Potentiel',player.potential,'Potentiel sur 200')}</div>${feeTiles(player)}`;
 const flags=nationFlags(player);
 const identity=`<div class="rail-identity"><div class="rail-club">${clubLink(player.club)}${caps(player)}</div>${flags.others.length?fact(flags.others.length>1?'Autres nationalités':'Autre nationalité',`<span class="rail-nations">${flags.others.join('')}</span>`):''}</div>`;
 const injury=player.injured_until?`<span class="danger">Retour le ${date(player.injured_until)}</span>`:'<span class="available">Disponible</span>';
 const state=`<section class="rail-section"><h2>État</h2>${told('Condition',`${gauge(player.fitness)}<b>${Math.round(player.fitness*100)} %</b>`)}${formFact(player)}${moraleFact(player)}${fact('Blessure',injury)}${disciplineFacts(player)}</section>`;
 const terms=[['Salaire mensuel',player.contract_end?monthlySalary(player.wage):'—'],['Fin du contrat',date(player.contract_end)],
  ...(player.wage_demand!=null?[['Prétentions',`${monthlySalary(player.wage_demand)} / mois`]]:[]),...loanTerms(player)];
 const contract=`<section class="rail-section"><h2>Contrat</h2>${terms.map(([label,value])=>fact(label,value)).join('')}</section>`;
 return `<aside class="card player-rail"><div class="rail-head">${lead}${flags.main}<h1>${e(player.name)}</h1></div>${tiles}${identity}${state}${contract}${actions?`<div class="rail-actions">${actions}</div>`:''}</aside>`;
}

// Attributes beside the aptitudes (the pitch and the list of its positions); without any position to show, the attributes
// take the whole row.
function profile(player) {
 shown=player;
 const ratings=player.position_ratings||{},pitch=positionPitch(ratings,player.position,player);
 const positions=pitch?card('Aptitudes par poste',`<div class="positions">${pitch}${positionList(ratings,player)}</div>`,'','positions-card'):'';
 return `<div class="player-row${pitch?' profile':''}">${card('Attributs',attributesBody(player),'','attributes-card')}${positions}</div>`;
}

// A row of the career table. The national team has no use for the four columns ahead of the figures: its first cell
// spans them (`lead`), so that matches, goals, assists and rating stay in the columns they have for the clubs.
const careerRow=(cells,{tag='td',lead=1,name=''}={})=>`<tr${name?` class="${name}"`:''}>${cells.map((cell,index)=>`<${tag}${lead>1&&!index?` colspan="${lead}"`:''}>${cell}</${tag}>`).join('')}</tr>`;

// Under the clubs, the national team: an edition a row beneath the nation's name, newest first, then what he had played
// before the game started (`historical_*`), and his totals. Nothing before a first cap.
function internationalCareer(player) {
 if(!player.international_caps)return '';
 const records=[...(player.international_records||[])].sort((a,b)=>b.edition-a.edition),wide={lead:4};
 const nation=player.national_team?nationBadges([player.national_team],{full:true}):'Sélection';
 const rows=records.map(row=>careerRow([`<a href="#/international/${row.edition}">${row.edition}</a>`,n(row.matches),row.goals,row.assists,row.average?n(row.average):'—'],wide));
 if(player.historical_caps||player.historical_goals)rows.push(careerRow(['Historique importé',n(player.historical_caps),n(player.historical_goals),'—','—'],wide));
 const rated=records.reduce((sum,row)=>sum+(row.rating_count||0),0);
 const total=['Total',n(player.international_caps),n(player.international_goals),n(records.reduce((sum,row)=>sum+row.assists,0)),rated?n(records.reduce((sum,row)=>sum+row.rating_sum,0)/rated):'—'];
 const head=[player.national_team_id!=null?`<a href="#/international/nation/${player.national_team_id}">${nation}</a>`:nation,'MATCHS','BUTS','PASSES','NOTE'];
 return `<tbody>${careerRow(head,{tag:'th',lead:4,name:'nation-head'})}</tbody><tbody>${rows.join('')}${careerRow(total,{lead:4,name:'total'})}</tbody>`;
}

// One card and one table for the whole career: a row per season and club, newest first, then the national team, a gap
// setting the two apart.
function careerCard(player, career) {
 const totals=career.totals,nation=internationalCareer(player);
 const rows=career.items.map(row=>careerRow([season(row.season),clubLink(row.club),row.loan?'Prêt':row.fee?money(row.fee):'—',`<span class="competition">${nationFlag(row.competition_nation)}${e(row.competition||'Marché extérieur')}</span>`,appearances(row.matches,row.substitutes),row.goals,row.assists,row.average?n(row.average):'—']));
 const total=careerRow(['Total','',totals.fee?money(totals.fee):'—','',n(totals.matches),n(totals.goals),n(totals.assists),totals.average?n(totals.average):'—'],{name:'total'});
 const clubs=rows.length?`<tbody>${rows.join('')}${total}</tbody>`:'';
 const head=careerRow(['SAISON','CLUB','TRANSFERT','COMPÉTITION','MATCHS','BUTS','PASSES','NOTE'],{tag:'th'});
 const gap=clubs&&nation?'<tbody class="career-gap" aria-hidden="true"><tr><td colspan="8"></td></tr></tbody>':'';
 return card('Carrière',clubs||nation?`<div class="table-scroll"><table><thead>${head}</thead>${clubs}${gap}${nation}</table></div>`:empty(),'','career-card');
}

// Beside a list of players, the one picked in it: who he is, how he is, his contract and what he is worth on a pitch, in
// the words of his page, whose actions stand at the foot. Nothing for a retired player.
export async function playerPreview(id, state) {
 const player=await api(`/joueurs/${id}`);
 if(player.retired)return '';
 shown=player;
 const actions=await playerActions(player,state);
 const tile=(label,value,hue)=>`<div class="tile${hue==null?'':' graded'}"${hue==null?'':` style="--hue:${hue}"`}><span>${label}</span><strong>${value}</strong></div>`;
 const grade=(label,value)=>value==null?tile(label,'—'):tile(label,level(value),levelHue(level(value)));
 const flags=nationFlags(player);
 const bans=(player.discipline||[]).filter(item=>item.suspended_matches).map(item=>fact('Suspension',`<span class="danger">${e(item.competition)} · ${item.suspended_matches} match${item.suspended_matches>1?'s':''}</span>`)).join('');
 const shape=`<h3>État</h3>${told('Condition',`${gauge(player.fitness)}<b>${Math.round(player.fitness*100)} %</b>`)}${formFact(player)}${moraleFact(player)}${player.injured_until?fact('Blessure',`<span class="danger">Retour le ${date(player.injured_until)}</span>`):''}${bans}`;
 const terms=[['Salaire mensuel',player.contract_end?monthlySalary(player.wage):'—'],['Fin du contrat',`<span class="${player.expiring?'danger':''}">${date(player.contract_end)}</span>`],
  ...(player.wage_demand!=null?[['Prétentions',`${monthlySalary(player.wage_demand)} / mois`]]:[]),
  ...(player.transfer_listed||player.loan_listed?[['Listé',marketTags(player.transfer_listed,player.loan_listed)]]:[]),
  ...(player.interested!=null?[['Intéressé',marketTags(player.interested,player.loan_interested,'Non')]]:[]),...loanTerms(player)];
 const roles=positionList(player.position_ratings||{},player);
 const {sections}=attributeGroups(player);
 const attributes=sections.flatMap(section=>section.items).map(attributeItem).join('');
 return `<div class="card preview"><div class="preview-head">${flags.main}<h2><a href="#/player/${player.id}">${e(player.name)}</a></h2>${position(player.position)}</div>`
  +`<div class="preview-line">${clubLink(player.club)}${caps(player)}</div>`
  +`<div class="rail-tiles">${tile('Âge',player.age)}${grade('Niveau',player.rating)}${grade('Potentiel',player.potential)}</div>${feeTiles(player)}`
  +shape+`<h3>Contrat</h3>${terms.map(([label,value])=>fact(label,value)).join('')}`
  +(roles?`<h3>Postes</h3>${roles}`:'')+compositesGroup(player)
  +`<h3>Attributs</h3><div class="attributes-grid">${attributes}</div>`
  +`<div class="preview-actions"><a class="button" href="#/player/${player.id}">Ouvrir la fiche</a>${actions}</div></div>`;
}

export async function playerScreen(id) {
 const [player,history,neighbours,state]=await Promise.all([api(`/joueurs/${id}`),api(`/joueurs/${id}/historique`),api(`/joueurs/${id}/navigation`),api('/monde/etat')]);
 const points=history.trajectory;
 const chart=card('Évolution du niveau',points.length>1?`<div class="card-body fill">${levelChart(points)}</div>`:empty('La courbe se complète au début de chaque mois.'),'','level-card');
 const story=`<div class="player-row history">${chart}${careerCard(player,history.career)}</div>`;
 // A retired player keeps his name and his history.
 if(player.retired)return `<div class="page-heading"><div class="identity"><div><span class="eyebrow">CARRIÈRE ARCHIVÉE</span><h1>${e(player.name)}</h1><p>Retraité</p></div></div></div>${story}`;
 const actions=await playerActions(player,state);
 return `<div class="player-page">${rail(player,playerNavigation(neighbours),actions)}<div class="player-main">${profile(player)}${story}</div></div>`;
}

// A position picked on the pitch of aptitudes or in their list: the Jeu section marks what that position asks for, and both
// the shirt and the row of the position show it picked.
function install(){
 document.addEventListener('click',event=>{
  const role=event.target.closest?.('[data-composite-role]')?.dataset.compositeRole;
  if(!role||!shown)return;
  document.querySelector('[data-composites]')?.replaceWith(Object.assign(document.createElement('template'),{innerHTML:compositesGroup(shown,role)}).content);
  document.querySelectorAll('[data-composite-role]').forEach(item=>{const picked=item.dataset.compositeRole===role;item.classList.toggle('picked',picked);item.setAttribute('aria-pressed',String(picked));});
 });
}
if(typeof document!=='undefined')install();
