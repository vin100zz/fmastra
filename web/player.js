import {monthlySalary,monthlyAmount} from './salaries.js';
import {playerNavigation} from './navigation.js';
import {playerHero} from './club-hero.js';
import {api,escape as e,number as n,averageNote,money,price,attributeScore,level,levelHue,levelBadge,scoreBadge,scoreHue,formReading,moraleReading,date,season,clubLink,kitDot,nationFlag,nationBadge,nationBadges,competitionBadge,position,empty,card,fact,appearances,positionNote,marketTags,kitShirt,affinityTag,PITCH_BOXES,ATTRIBUTES,ATTRIBUTE_SECTIONS,COMPOSITES,COMPOSITE_SECTIONS} from './ui.js';

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
 // Each position in the shirt of his club, his affinity below 20 on its corner; the main one is ringed.
 const shirt=role=>kitShirt(player?.club?.major_color,player?.club?.minor_color,role,{inside:affinityTag(ratings[role],role)});
 return `<div class="pitch ratings" role="group" aria-label="Aptitudes par poste">${PITCH_BOXES}${roles.map(([role,[x,y]])=>`<button type="button" class="pitch-player${role===main?' main':''}${role===picked?' picked':''}" data-composite-role="${role}" aria-pressed="${role===picked}" style="left:${x}%;top:${y}%" title="${role} : ${ratings[role]} / 20">${shirt(role)}${note(role,x)}</button>`).join('')}</div>`;
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

// What the user can do about a player is said once and drawn twice: a button of his page, a row of his menu
// (player-menu.js). `open` names the dialog it opens, `send` the command it sends at once (its data in the order of its
// attributes), `obstacle` why it cannot be done today; `note` is where it stands, which the menu writes beside it.
// The ids of the dialogs follow a `scope`, so that the ones of a menu never meet the ones of the page under it.
export const actionData=({open,send})=>open?` data-open-dialog="${open}"`:Object.entries(send).map(([key,value])=>` data-${key}="${value}"`).join('');
const actionButton=(row,primary=false)=>`<button${primary?' class="primary"':''} type="button"${row.obstacle?` disabled title="${e(row.obstacle)}"`:actionData(row)}>${row.label}</button>`;

// Talks for another club's player: the fee with his club, then his wage (straight away for a free agent), each offer
// answered at once in the dialog, which comes back with the counter-offer. Agreed steps wait a few days: `state` tells
// them, and nothing is left to do.
function talksPart(player, talks, scope='') {
 if(talks.etape==='accord_club')return {state:`Accord avec le club · ${price(talks.indemnite)} · réponse le ${date(talks.date_prevue)}`,rows:[],dialogs:''};
 if(talks.etape==='signature')return {state:`Arrivée le ${date(talks.date_prevue)} · ${monthlySalary(talks.salaire)}`,rows:[],dialogs:''};
 const wage=talks.etape==='salaire'||!player.club&&!talks.etape;
 const label=talks.etape==='salaire'?'Négocier le contrat':wage?'Proposer un contrat':'Faire une offre';
 if(talks.obstacle)return {rows:[{label,obstacle:talks.obstacle}],dialogs:''};
 const counter=talks.contre_offre,amount=value=>wage?monthlySalary(value):price(value);
 const left=`${talks.tours_restants} offre${talks.tours_restants>1?'s':''} restante${talks.tours_restants>1?'s':''}`;
 const intro=wage?`Salaire actuel ${player.club?monthlySalary(player.wage):'—'}`:`Prix minimum ${price(player.asking_price)} · budget ${price(talks.budget)}`;
 const field=wage?`<label>Salaire proposé (€) <input name="montant" type="number" min="1" step="1" value="${Math.max(1,monthlyAmount(counter||player.wage))}" required></label>`
  :`<label>Indemnité proposée (M€) <input name="montant" type="number" min="0" step="0.01" value="${counter?counter/1e6:Math.round((player.value||0)/1e6)}" required></label>`;
 const accept=counter?`<button type="submit" name="accepter" value="${counter}">Accepter ${amount(counter)}</button>`:'';
 const dialog=`<dialog id="${scope}talks-dialog" class="action-dialog"><form id="${scope}talks-form" data-kind="${wage?'salaire':'indemnite'}"><span class="eyebrow">${wage?'CONTRAT':'MERCATO'}</span><h2>${wage?'Contrat':'Offre'} pour ${e(player.name)}</h2><p>${intro}</p>${counter?`<p><strong>${wage?e(player.name):e(player.club.name)} demande ${amount(counter)}</strong> · ${left}</p>`:''}<input type="hidden" name="joueur_id" value="${player.id}">${field}${dialogButtons(`${accept}<button class="primary" type="submit">Proposer</button>`)}</form></dialog>`;
 return {rows:[{label,open:`${scope}talks-dialog`,note:counter?`Contre-offre · ${amount(counter)}`:''}],dialogs:dialog};
}
// On a page: a pill for what waits or for the counter-offer, then the button.
function talksOffer(player, state, talks) {
 const pill=text=>`<span class="pill">${text}</span>`,part=talksPart(player,talks);
 if(part.state)return {pill:pill(part.state),button:'',dialogs:''};
 const [row]=part.rows;
 // The pill names the obstacle; the reason that follows its colon waits in the tooltip.
 const [barrier,reason]=(talks.obstacle||'').split(' : ');
 const told=talks.obstacle?(state.market?`<span class="pill"${reason?` title="${e(talks.obstacle)}"`:''}>${e(barrier)}</span>`:''):row.note?pill(row.note):'';
 return {pill:told,button:actionButton(row,true),dialogs:part.dialogs};
}
export function talksAction(player, state, talks) {
 const {pill,button,dialogs}=talksOffer(player,state,talks);
 return `<div class="player-actions">${pill}${button}</div>${dialogs}`;
}

// Contracts are extended on the player's terms (`terms`, from /ma-partie/contrat): the ones he asked for, which the club
// accepts or turns down, or the ones he names when the club asks him. The dialog `id` shows them, ready to sign.
export function contractDialog(player, terms, id='contract-dialog') {
 const rows=`<div class="card-body">${fact('Salaire actuel',monthlySalary(terms.salaire_actuel))}${fact('Salaire demandé',monthlySalary(terms.salaire_propose))}${fact('Fin de contrat actuelle',date(terms.fin_contrat_actuelle))}${fact('Fin de contrat proposée',date(terms.fin_contrat_proposee))}</div>`;
 const buttons=terms.demande?`<button data-command="renouvellement" data-decision="refuser" data-player="${player.id}">Refuser</button><button class="primary" data-command="renouvellement" data-decision="accepter" data-player="${player.id}">Signer</button>`
  :`<button class="primary" data-command="prolongation" data-player="${player.id}">Signer</button>`;
 return `<dialog id="${id}" class="action-dialog"><div><span class="eyebrow">PROLONGATION</span><h2>Nouveau contrat pour ${e(player.name)}</h2>${rows}${dialogButtons(buttons)}</div></dialog>`;
}
function contractAction(player, terms, scope='') {
 const row={label:'Proposer un contrat',...(terms.obstacle?{obstacle:terms.obstacle}:{open:`${scope}contract-dialog`,note:terms.demande?'En attente':''})};
 return {pills:terms.demande&&!terms.obstacle?'<span class="pill">Prolongation en attente</span>':'',rows:[row],buttons:actionButton(row,true),
  dialogs:terms.obstacle?'':contractDialog(player,terms,row.open)};
}

// An own player up for sale: on the transfer list at the fee asked, or offered to every club at once. Both dialogs take
// the fee; the offers awaiting an answer, whichever way they came, open in a dialog of their own. Declared not for sale,
// he receives none; either way of selling him puts him back on the market.
function saleAction(player, sale, scope='') {
 const listed=sale.prix_liste!=null,kept=Boolean(sale.intransferable);
 const fee=(id,kind,title,confirm)=>`<dialog id="${id}" class="action-dialog"><form data-sale="${kind}"><span class="eyebrow">VENTE</span><h2>${title}</h2><p>Valeur ${price(player.value)}</p><input type="hidden" name="joueur_id" value="${player.id}"><label>Prix demandé (M€) <input name="montant" type="number" min="0" step="0.01" value="${Math.round((listed?sale.prix_liste:player.value||0)/1e4)/100}" required></label>${dialogButtons(`<button class="primary" type="submit">${confirm}</button>`)}</form></dialog>`;
 const list=listed?{label:'Retirer de la liste',note:price(sale.prix_liste),send:{command:'liste-transferts',player:player.id}}:{label:'Mettre sur la liste',open:`${scope}listing-dialog`};
 const offer={label:'Proposer aux clubs',...(sale.obstacle_proposition?{obstacle:sale.obstacle_proposition}:{open:`${scope}proposal-dialog`})};
 const received=sale.offres.length?[{label:'Offres reçues',note:String(sale.offres.length),open:`${scope}offers-dialog`}]:[];
 const lines=sale.offres.map(item=>`<li><span>${clubLink(item.acheteur)}</span><small>${monthlySalary(item.salaire_propose)}</small><b>${price(item.indemnite)}</b><span class="market-actions"><button class="primary" data-command="reponse-offre" data-decision="accepter" data-offer="${e(item.offre_id)}">Accepter</button><button data-command="reponse-offre" data-decision="refuser" data-offer="${e(item.offre_id)}">Refuser</button></span></li>`).join('');
 const offers=sale.offres.length?`<dialog id="${scope}offers-dialog" class="action-dialog"><div><span class="eyebrow">OFFRES REÇUES</span><h2>Offres pour ${e(player.name)}</h2><ul class="moves">${lines}</ul><div class="actions"><button type="button" data-close-dialog>Fermer</button></div></div></dialog>`:'';
 const keep={label:kept?'Rendre transférable':'Déclarer intransférable',send:{command:'intransferable',kept:kept?'':'1',player:player.id}};
 return {pills:listed?`<span class="pill">Sur la liste · ${price(sale.prix_liste)}</span>`:kept?'<span class="pill">Intransférable</span>':'',rows:[...received,list,offer,keep],
  // On the page, the offers are counted on their button.
  buttons:[...received.map(row=>({...row,label:`${row.label} · ${row.note}`})),list,offer,keep].map(row=>actionButton(row)).join(''),
  dialogs:(listed?'':fee(list.open,'liste',`Mettre ${e(player.name)} sur la liste`,'Mettre sur la liste'))
   +(sale.obstacle_proposition?'':fee(offer.open,'proposition',`Proposer ${e(player.name)} aux clubs`,'Proposer'))+offers};
}

// The durations a loan can take today, each with the day it ends.
const LOAN_LABELS={saison:'Fin de saison',demi_saison:'Demi-saison'};
const durationField=squad=>`<label>Durée <select name="duree">${squad.durees.map(item=>`<option value="${item.cle}">${LOAN_LABELS[item.cle]} · ${date(item.fin)}</option>`).join('')}</select></label>`;

// An own player: sent to the reserve or called back, and lent to one of the clubs that would take him.
function squadAction(player, squad, scope='') {
 const reserve=squad.en_reserve?{label:'Rappeler en équipe première',send:{command:'reserve',player:player.id,reserve:''}}
  :{label:'Envoyer en réserve',send:{command:'reserve',player:player.id,reserve:'1'},obstacle:squad.obstacle_reserve};
 const lend={label:'Prêter',...(squad.obstacle_pret?{obstacle:squad.obstacle_pret}:{open:`${scope}lend-dialog`})};
 const clubs=`<label>Club <select name="club_id">${squad.clubs.map(club=>`<option value="${club.id}">${e(club.name)} · ${e(club.competition)}</option>`).join('')}</select></label>`;
 const dialog=squad.obstacle_pret?'':`<dialog id="${lend.open}" class="action-dialog"><form data-loan="preter"><span class="eyebrow">PRÊT</span><h2>Prêter ${e(player.name)}</h2><input type="hidden" name="joueur_id" value="${player.id}">${clubs}${durationField(squad)}${dialogButtons('<button class="primary" type="submit">Prêter</button>')}</form></dialog>`;
 return {pills:squad.en_reserve?'<span class="pill">En réserve</span>':'',rows:[reserve,lend],buttons:actionButton(reserve)+actionButton(lend),dialogs:dialog};
}

// Another club's player taken on loan: nothing to pay, only how long.
function borrowAction(player, squad, scope='') {
 const row={label:'Emprunter',...(squad.obstacle_pret?{obstacle:squad.obstacle_pret}:{open:`${scope}borrow-dialog`})};
 return {rows:[row],buttons:actionButton(row),dialogs:squad.obstacle_pret?'':`<dialog id="${row.open}" class="action-dialog"><form data-loan="emprunter"><span class="eyebrow">PRÊT</span><h2>Emprunter ${e(player.name)}</h2><input type="hidden" name="joueur_id" value="${player.id}">${durationField(squad)}${dialogButtons('<button class="primary" type="submit">Emprunter</button>')}</form></dialog>`};
}

// What the game says of an own player (his contract, his sale, his place in the squad) and of another club's (the talks,
// and the loan when he has a club).
const ownTerms=player=>Promise.all([api(`/ma-partie/contrat/${player.id}`),api(`/ma-partie/vente/${player.id}`),api(`/ma-partie/effectif/${player.id}`)]);
const otherTerms=player=>Promise.all([api(`/ma-partie/negociation/${player.id}`),player.club?api(`/ma-partie/effectif/${player.id}`):null]);
// On loan, to or from the user's club or between two others: nothing to decide before he is back.
const loanState=(player,clubId)=>`Prêté ${player.loan.parent?.id===clubId?`à ${e(player.loan.club?.name)}`:`par ${e(player.loan.parent?.name)}`} · retour le ${date(player.loan.end)}`;

async function playerActions(player, state) {
 const clubId=state.controlled_club_id;
 if(clubId==null||player.retired)return '';
 const actions=body=>`<div class="player-actions">${body}</div>`;
 if(player.loan)return actions(`<span class="pill">${loanState(player,clubId)}</span>`);
 if(player.club?.id===clubId){
  const [contract,sale,squad]=await ownTerms(player);
  const parts=[saleAction(player,sale),contractAction(player,contract),squadAction(player,squad)];
  return actions(`${parts.map(part=>part.pills).join('')}${parts.map(part=>part.buttons).join('')}`)+parts.map(part=>part.dialogs).join('');
 }
 const [talks,squad]=await otherTerms(player),loan=squad?borrowAction(player,squad):null;
 return talksAction(player,state,talks)+(loan?actions(loan.buttons+loan.dialogs):'');
}

// Under the band of his header, where a club has its tabs: what stands on the left, then what the user can do with him in
// the groups of his menu, the main action last. Nothing without a club to manage, nor for a retired player.
async function playerBar(player, state) {
 const clubId=state.controlled_club_id;
 if(clubId==null||player.retired)return {bar:'',dialogs:''};
 const bar=(pills,groups=[])=>`<div class="club-hero-bar"><div class="hero-pills">${pills}</div>${groups.filter(Boolean).map(group=>`<div class="hero-commands">${group}</div>`).join('')}</div>`;
 if(player.loan)return {bar:bar(`<span class="pill">${loanState(player,clubId)}</span>`),dialogs:''};
 if(player.club?.id===clubId){
  const [contract,sale,squad]=await ownTerms(player);
  const parts=[squadAction(player,squad),saleAction(player,sale),contractAction(player,contract)];
  return {bar:bar(parts.map(part=>part.pills).join(''),parts.map(part=>part.buttons)),dialogs:parts.map(part=>part.dialogs).join('')};
 }
 const [talks,squad]=await otherTerms(player),deal=talksOffer(player,state,talks),loan=squad?borrowAction(player,squad):null;
 return {bar:bar(deal.pill,[loan?.buttons,deal.button]),dialogs:deal.dialogs+(loan?loan.dialogs:'')};
}

// The menu of a player (player-menu.js) holds the actions of his page, in groups: the squad, his contract and his sale for
// one of the user's; the talks and the loan for another club's. Where nothing can be decided, his `state` says why:
// retired, on loan, or waiting for the next step of talks already agreed.
export async function playerMenu(player, state, scope) {
 const clubId=state.controlled_club_id;
 if(player.retired)return {state:'Retraité',groups:[],dialogs:''};
 if(player.loan)return {state:loanState(player,clubId),groups:[],dialogs:''};
 if(player.club?.id===clubId){
  const [contract,sale,squad]=await ownTerms(player);
  const parts=[squadAction(player,squad,scope),contractAction(player,contract,scope),saleAction(player,sale,scope)];
  return {state:null,groups:parts.map(part=>part.rows),dialogs:parts.map(part=>part.dialogs).join('')};
 }
 const [talks,squad]=await otherTerms(player),deal=talksPart(player,talks,scope),loan=squad?borrowAction(player,squad,scope):null;
 return {state:deal.state||null,groups:[[...deal.rows,...(loan?loan.rows:[])]],dialogs:deal.dialogs+(loan?loan.dialogs:'')};
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

// His nations: the one he plays for, else the first of his nationalities, then the others in the order of the source.
const nationCodes=player=>[...new Set([player.national_team,...(player.nationalities||[])].filter(Boolean))];

// Beside a list, the flag of his main nation flies by his name, alone, named in its tooltip.
function nationFlags(player) {
 const [main]=nationCodes(player);
 const flag=code=>nationFlag(code)||nationBadge(code);
 const capped=main===player.national_team&&player.national_team_id!=null;
 return {main:!main?'':capped?`<a href="#/international/nation/${player.national_team_id}">${flag(main)}</a>`:flag(main)};
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

// Beside the page, a card of facts: how he is, with his other nationalities (the flag, then the code), then what his
// contract holds. Who he is and what he is worth stand in the header.
function rail(player) {
 const others=nationCodes(player).slice(1);
 const injury=player.injured_until?`<span class="danger">Retour le ${date(player.injured_until)}</span>`:'<span class="available">Disponible</span>';
 const state=`${told('Condition',`${gauge(player.fitness)}<b>${Math.round(player.fitness*100)} %</b>`)}${formFact(player)}${moraleFact(player)}${fact('Blessure',injury)}${disciplineFacts(player)}`
  +(others.length?fact(others.length>1?'Autres nationalités':'Autre nationalité',others.map(code=>nationBadge(code)).join('')):'');
 const terms=[['Salaire',player.contract_end?monthlySalary(player.wage):'—'],['Fin du contrat',date(player.contract_end)],
  ...(player.wage_demand!=null?[['Prétentions',monthlySalary(player.wage_demand)]]:[]),...loanTerms(player)];
 return `<aside class="card player-rail"><div class="card-head"><h2>État</h2></div><div class="rail-section">${state}</div>`
  +`<h3>Contrat</h3><div class="rail-section">${terms.map(([label,value])=>fact(label,value)).join('')}</div></aside>`;
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
 // An edition is named by its year, after the badge that tells the Euro from the World Cup.
 const edition=row=>{const link=`<a href="#/international/${row.edition}">${row.edition}</a>`;
  return row.code?`<span class="competition">${competitionBadge({name:row.competition,kind:'international',code:row.code})}${link}</span>`:link;};
 const rows=records.map(row=>careerRow([edition(row),n(row.matches),row.goals,row.assists,row.average?averageNote(row.average):'—'],wide));
 if(player.historical_caps||player.historical_goals)rows.push(careerRow(['Historique importé',n(player.historical_caps),n(player.historical_goals),'—','—'],wide));
 const rated=records.reduce((sum,row)=>sum+(row.rating_count||0),0);
 const total=['Total',n(player.international_caps),n(player.international_goals),n(records.reduce((sum,row)=>sum+row.assists,0)),rated?averageNote(records.reduce((sum,row)=>sum+row.rating_sum,0)/rated):'—'];
 const head=[player.national_team_id!=null?`<a href="#/international/nation/${player.national_team_id}">${nation}</a>`:nation,'MATCHS','BUTS','PASSES','NOTE'];
 return `<tbody>${careerRow(head,{tag:'th',lead:4,name:'nation-head'})}</tbody><tbody>${rows.join('')}${careerRow(total,{lead:4,name:'total'})}</tbody>`;
}

// What a club played in a season of his career: the badge of its league, after the flag of its country when it is not a
// French one, then those of its European cups. An older server names them in one text, written after the flag.
function careerCompetitions(row) {
 const badges=row.competition_badges;
 if(!badges?.length)return `${nationFlag(row.competition_nation)}${e(row.competition||'Marché extérieur')}`;
 return `${row.competition_nation==='FRA'?'':nationFlag(row.competition_nation)}${badges.map(competitionBadge).join('')}`;
}

// One card and one table for the whole career: a row per season and club, newest first, then the national team, a gap
// setting the two apart.
function careerCard(player, career) {
 const totals=career.totals,nation=internationalCareer(player);
 const rows=career.items.map(row=>careerRow([season(row.season),clubLink(row.club),row.loan?'Prêt':row.fee?money(row.fee):'—',`<span class="competition">${careerCompetitions(row)}</span>`,appearances(row.matches,row.substitutes),row.goals,row.assists,row.average?averageNote(row.average):'—']));
 const total=careerRow(['Total','',totals.fee?money(totals.fee):'—','',n(totals.matches),n(totals.goals),n(totals.assists),totals.average?averageNote(totals.average):'—'],{name:'total'});
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
 const terms=[['Salaire',player.contract_end?monthlySalary(player.wage):'—'],['Fin du contrat',`<span class="${player.expiring?'danger':''}">${date(player.contract_end)}</span>`],
  ...(player.wage_demand!=null?[['Prétentions',monthlySalary(player.wage_demand)]]:[]),
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
 const {bar,dialogs}=await playerBar(player,state);
 return `${playerHero(player,{lead:playerNavigation(neighbours),foot:bar})}${dialogs}<div class="player-page">${rail(player)}<div class="player-main">${profile(player)}${story}</div></div>`;
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
