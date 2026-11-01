// Recrutement: what the club's recruitment cell recommends (`/ma-partie/recrutement`, src/api/recruitment.py). The share of
// the budgets and two figures, then a card per position of the squad, in the order of the lists: the club's player there and
// the leads, for now (Présent) or for later (Avenir); the players without a place in the squad last (À céder).
import {api,escape as e,card,empty,heading,position,playerLink,clubLink,price,levelStars,potentialStars,playerTable} from './ui.js';
import {monthlySalary} from './salaries.js';
import {shareBlock,figure} from './club-finances.js';
import {listHref} from './listing.js';

export const POSITION_NAMES={GB:'Gardien',DG:'Latéral gauche',DD:'Latéral droit',DC:'Défenseur central',MDC:'Milieu défensif',
 MC:'Milieu central',MOC:'Milieu offensif',AILG:'Ailier gauche',AILD:'Ailier droit',BU:'Buteur'};
const PLACES={titulaire:'Titulaire',rotation:'Rotation',doublure:'Doublure'};
const BASE='#/recrutement';
const dayMonth=value=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long'}).format(new Date(`${value}T12:00:00`));

// Two choices that are links, as on the list screens: the view (Présent, Avenir) and the pool (all players, free agents).
const choice=(params,key,items,label)=>{
 const current=params.get(key)||'';
 return `<nav class="segmented" aria-label="${e(label)}">${items.map(([value,text])=>`<a class="${value===current?'active':''}" href="${listHref(BASE,params,{[key]:value})}"${value===current?' aria-current="true"':''}>${text}</a>`).join('')}</nav>`;
};

// The charter's thin bar (.gauge), `share` of it filled: green, red for a need.
const gauge=(share,modifier='')=>`<i class="gauge${modifier?` ${modifier}`:''}"><i style="width:${Math.round(Math.max(0,Math.min(1,share||0))*100)}%"></i></i>`;

// What a lead brings today, its bar the share of the need it covers; the place it would take, and from whom, in its tooltip.
const contribution=lead=>{
 const place=PLACES[lead.place],from=lead.replaces?` à la place de ${lead.replaces.name}`:'';
 return `<span class="scout-gain" title="${e(place?`${place}${from}`:'Apport à l’effectif')}">${gauge(lead.contribution)}</span>`;
};
const fee=lead=>lead.club?price(lead.asking_price):'—';

// A row of a position's card: the club's player first (`.holder`), then each lead.
const holderRow=(player,future)=>player
 ?`<li class="holder">${playerLink(player.id,player.name)}<span class="num">${player.age}</span>${levelStars(player)}${future?potentialStars(player):''}</li>`
 :'<li class="holder"><span>—</span></li>';
const leadRow=(lead,future)=>`<li>${playerLink(lead.id,lead.name)}<span class="num">${lead.age}</span>${levelStars(lead)}`
 +(future?`${potentialStars(lead)}${clubLink(lead.club)}<span class="num">${fee(lead)}</span>`
  :`${clubLink(lead.club)}<span class="num">${fee(lead)}</span><span class="num">${monthlySalary(lead.wage_demand)}</span>${contribution(lead)}`)+'</li>';

export function positionCard(item,future){
 const need=future?'':`<span class="scout-need" title="Besoin">${gauge(item.need,'bad')}</span>`;
 const list=`<ul class="scout-list${future?' future':''}">${holderRow(item.holder,future)}${item.leads.map(lead=>leadRow(lead,future)).join('')}</ul>`;
 return `<section class="card scout-card"><div class="card-head"><h2>${position(item.position)}${e(POSITION_NAMES[item.position]||item.position)}</h2>${need}</div>${list}${item.leads.length?'':empty('Aucune piste')}</section>`;
}

// The players without a place in the squad, in the columns of a player list, sorted in the browser.
const surplusCard=players=>card('À céder',playerTable({items:players},false,'rating','asc',{sortable:false,pager:false}),'','scout-surplus');

export function recruitmentContent(data,params=new URLSearchParams()){
 const future=data.mode==='avenir',squad=data.squad,window=data.window;
 const head=heading('Recrutement',`<div class="tools">${choice(params,'vue',[['','Présent'],['avenir','Avenir']],'Horizon')}${choice(params,'libres',[['','Toutes les pistes'],['1','Agents libres']],'Joueurs')}</div>`);
 const figures=`<div class="finance-figures scout-figures">${shareBlock(data.finances)}`
  +figure('Effectif',`${squad.size} / ${squad.max}`,'',squad.size>=squad.max?'bad':'')
  +(window.closes?figure('Fin du mercato',dayMonth(window.closes)):figure('Ouverture du mercato',dayMonth(window.opens)))+'</div>';
 const cards=data.positions.map(item=>positionCard(item,future)).join('');
 return head+figures+`<div class="scout-grid">${cards}</div>`+(data.surplus.length?surplusCard(data.surplus):'');
}

export async function recruitmentScreen(params){
 const data=await api(`/ma-partie/recrutement?vue=${params.get('vue')==='avenir'?'avenir':'present'}${params.get('libres')==='1'?'&libres=true':''}`);
 return recruitmentContent(data,params);
}
