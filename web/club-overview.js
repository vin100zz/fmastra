import {escape as e,money,season,kitDot,clubLink,playerLink,card,empty,fact,pitch} from './ui.js';
import {monthlySalary} from './salaries.js';

const LISTED_MOVES=3;
const shortDate=value=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00`));
const outcomeLabels={V:'Victoire',N:'Match nul',D:'Défaite'};

// A red plane marks an away game (Material Design "flight" icon).
const awayIcon='<svg class="away" viewBox="0 0 24 24" role="img" aria-label="Match à l’extérieur"><title>Match à l’extérieur</title><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';

// One line per match: opponent, plane if away, then a badge naming the competition when it is not the club's championship.
function matchRow(match,club){
 const home=match.home.id===club.id,opponent=home?match.away:match.home;
 const score=match.score?`<span class="club-match-score ${match.outcome}" title="${outcomeLabels[match.outcome]}">${match.score.join(' – ')}</span>`:'<span class="club-match-score pending">À venir</span>';
 const shootout=match.penalties?`t.a.b. ${match.penalties.join(' – ')}`:'';
 const badge=match.competition!==club.competition?`<span class="competition-badge">${e(match.competition)}</span>`:'';
 const detail=`${match.competition} · ${match.round_label} · ${home?'Domicile':'Extérieur'}${shootout?` · ${shootout}`:''}`;
 return `<a class="club-match" href="#/match/${match.id}" title="${e(detail)}"><span class="club-match-date">${shortDate(match.date)}</span><span class="club-match-who"><b>${kitDot(opponent)}${e(opponent.name)}</b>${home?'':awayIcon}${badge}${shootout?`<small>${e(shootout)}</small>`:''}</span>${score}</a>`;
}

// No heading: a score tells a played match from one still to come.
const matchList=(matches,club,none)=>`<div class="club-matches">${matches.length?matches.map(match=>matchRow(match,club)).join(''):`<p class="muted">${none}</p>`}</div>`;

// `link` lets another screen (Mon club) point a block elsewhere than the club's own tab.
export function calendarBlock(club,data,link=`#/club/${club.id}/calendar`){
 // The API lists the played matches newest first; the block reads in date order, from the oldest to the next ones.
 return card('Calendrier',`<div class="card-body">${matchList([...data.last].reverse(),club,'Aucun match joué.')}${matchList(data.next,club,'Aucun match programmé.')}</div>`,`<a href="${link}" aria-label="Voir le calendrier">Voir →</a>`);
}

export function financeBlock(club,data,link=`#/club/${club.id}/finances`){
 const budget=Math.max(0,data.transfer_budget-data.reserved_transfer_budget),used=Math.round(100*data.wage_bill/Math.max(1,data.wage_cap));
 return card('Finances',`<div class="card-body">${fact('Budget transferts',money(budget))}${fact('Masse salariale / mois',monthlySalary(data.wage_bill))}${fact('Plafond / mois',monthlySalary(data.wage_cap))}<div class="meter" role="img" aria-label="${used} % du plafond salarial utilisé"><span style="width:${Math.min(100,used)}%"></span></div><p class="meter-caption">${used} % du plafond utilisé</p></div>`,`<a href="${link}" aria-label="Voir les finances">Voir →</a>`);
}

function movesList(title,side,incoming){
 const items=side.items.slice(0,LISTED_MOVES),hidden=side.count-items.length;
 const rows=items.map(row=>`<li><span>${playerLink(row.player_id,row.player)}</span><small>${clubLink(incoming?row.source:row.target)}</small><b>${row.fee?money(row.fee):'Libre'}</b></li>`).join('');
 const more=hidden>0?`<li class="more">+ ${hidden} autre${hidden>1?'s':''}</li>`:'';
 return `<h3>${title} · ${side.count}<b>${money(side.total)}</b></h3>${rows?`<ul class="moves">${rows}${more}</ul>`:'<p class="muted">Aucun transfert.</p>'}`;
}

function transferBlock(club,data){
 const {academy,release,retirement}=data.others;
 const others=[[academy,'jeune promu','jeunes promus'],[release,'fin de contrat','fins de contrat'],[retirement,'retraite','retraites']].filter(([count])=>count).map(([count,one,many])=>`${count} ${count>1?many:one}`);
 return card('Transferts',`<div class="card-body">${movesList('Arrivées',data.arrivals,true)}${movesList('Départs',data.departures,false)}</div><p class="card-note">Saison ${season(data.season)}${others.length?` · hors transferts : ${others.join(' · ')}`:''}</p>`,`<a href="#/club/${club.id}/transfers" aria-label="Voir les transferts">Voir →</a>`);
}

export function lineupBlock(club,lineup,link){
 const action=label=>link?`<a href="${link}">${label} →</a>`:'';
 if(!lineup)return card('Dernier onze aligné',empty('Le club n’a pas encore de composition enregistrée.','Aucun match joué'),action('Composer'),'lineup-card');
 const {match}=lineup,home=match.home.id===club.id,opponent=home?match.away:match.home;
 const result=`<a class="lineup-match" href="#/match/${match.id}/lineups"><span class="club-match-score ${match.outcome}" title="${outcomeLabels[match.outcome]}">${match.score.join(' – ')}</span><span>${home?'contre':'à'} ${kitDot(opponent)}${e(opponent.name)}<small>${shortDate(match.date)} · ${e(match.competition)} · ${e(match.round_label)}</small></span></a>`;
 return card('Dernier onze aligné',result+pitch(lineup.players,`Onze aligné par ${club.name}`,{compact:true,kit:{major:club.major_color,minor:club.minor_color}}),link?action('Composition'):`<a href="#/match/${match.id}/lineups" aria-label="Voir le match">Voir →</a>`,'lineup-card');
}

export function clubOverview(club,data){
 return `<div class="club-overview">${calendarBlock(club,data.calendar)}${financeBlock(club,data.finances)}${transferBlock(club,data.transfers)}${lineupBlock(club,data.lineup)}</div>`;
}
