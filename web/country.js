import {api,escape as e,date,number as n,clubLink,playerLink,nationFlag,nationName,empty,card,table,figure,standingsTable,scorersRow} from './ui.js';
import {choiceLinks,listHref} from './listing.js';

// The matches each division shows: its latest round, or on demand the next one.
const MODES=[['','Derniers matches'],['prochains','Prochains matches']];
const SCORERS=5;

// One match on a line: the home side up to the score, the away side after it, the winner in bold and the match of the user's
// club (`own`) highlighted; under a played match, each side's scorers as on a competition's round. In a cup, `levels` names
// the division of each club at the two ends, and a shoot-out is told by the score's tooltip.
function matchRow(match,own,levels){
 const [home,away]=match.score||[];
 const winner=match.winner_id??(match.score&&home!==away?(home>away?match.home?.id:match.away?.id):null);
 const side=(club,name)=>`<span class="${name}${club&&winner===club.id?' won':''}">${clubLink(club)}</span>`;
 const level=club=>levels?`<small>${levels[club?.id]||''}</small>`:'';
 const mine=own!=null&&[match.home?.id,match.away?.id].includes(own);
 const score=`<a class="score${match.score?'':' pending'}${match.penalties?' shootout':''}" href="#/match/${match.id}"${match.penalties?` title="Tirs au but : ${match.penalties.join(' – ')}"`:''}>${match.score?`${home} – ${away}`:'–'}</a>`;
 // The scorers line up under their side: in a cup, between the two ends that name the divisions.
 const scorers=scorersRow(match.scorers),under=scorers&&levels?`<span></span>${scorers}<span></span>`:scorers;
 return `<div class="country-match${levels?' tie':''}${scorers?' with-scorers':''}${mine?' own':''}">${level(match.home)}${side(match.home,'home')}${score}${side(match.away,'away')}${level(match.away)}${under}</div>`;
}
const strip=round=>`<h3>${e(round.label)}${round.date?` · ${date(round.date)}`:''}</h3>`;

// A division's latest or next round with the table it counts for and its leading scorers. Without such a round (before the
// first one, after the last), the table and the scorers are asked for on their own.
async function division(id,next){
 const data=await api(`/competitions/${id}/journee/${next?'prochaine':'derniere'}`),group=data.groups[0];
 if(group)return {round:data.round,matches:group.matches,standings:group.standings||[],scorers:group.top_scorers||[]};
 const [standings,scorers]=await Promise.all([api(`/competitions/${id}/classement`),api(`/competitions/${id}/statistiques?type=buteurs`)]);
 return {round:null,matches:[],standings:standings.items,scorers:scorers.items};
}

// The round's matches, then the whole table, then the scorers; the head gives the rounds played out of the season's and opens the division.
function divisionCard(league,data,own){
 const played=Math.max(0,...data.standings.map(row=>row.played));
 const progress=played?`J${played}${league.rounds?` / ${league.rounds}`:''} `:'';
 const scorers=data.scorers.length?`<h3>Buteurs</h3>${table(['#','JOUEUR','CLUB','BUTS'],data.scorers.slice(0,SCORERS).map((row,index)=>[figure(index+1),`<span class="strong">${playerLink(row.id,row.name)}</span>`,clubLink(row.club),figure(`<b>${n(row.goals)}</b>`)]),undefined,undefined,undefined,['rank-column','','club-column','goals-column'])}`:'';
 return card(league.name,`${data.round?strip(data.round):''}${data.matches.map(match=>matchRow(match,own)).join('')}${standingsTable({items:data.standings},'figures',false,own)}${scorers}`,`<a href="#/league/${league.id}" aria-label="Voir le championnat">${progress}→</a>`);
}

// One round of the cup: the latest played, or the first still to play, or the one picked among its rounds (`tour`).
function cupCard(cup,data,next,params,base,own,levels){
 const usual=next?(data.rounds.find(round=>!round.complete)||data.rounds.at(-1)).number:data.latest_round||1;
 const chosen=data.rounds.find(round=>round.number===Number(params.get('tour')))||data.rounds.find(round=>round.number===usual);
 const steps=`<nav class="segmented country-rounds" aria-label="Tours">${data.rounds.map(round=>`<a class="${round===chosen?'active':''}" href="${listHref(base,params,{tour:round.number})}"${round===chosen?' aria-current="true"':''} title="${e(round.label)}">${e(round.label.split(' ')[0])}</a>`).join('')}</nav>`;
 const ties=chosen.items.length?chosen.items.map(match=>matchRow(match,own,levels)).join(''):empty('Le tirage aura lieu à l’issue du tour précédent.','Tirage à venir');
 return card(cup.name,`${steps}${strip(chosen)}${ties}`,`<a href="#/league/${cup.id}" aria-label="Voir la coupe">→</a>`);
}

// A country: one column per division from the top down, then its cup. `own` is the club the user runs.
export async function countryScreen(nation,leagues,params=new URLSearchParams(),own=null){
 const divisions=leagues.filter(league=>league.nation===nation&&league.kind!=='cup').sort((a,b)=>a.level-b.level);
 if(!divisions.length)throw new Error('Pays introuvable.');
 const cup=leagues.find(item=>item.nation===nation&&item.kind==='cup'),next=params.get('matches')==='prochains',base=`#/country/${nation}`;
 const [rounds,cupData]=await Promise.all([Promise.all(divisions.map(league=>division(league.id,next))),cup?api(`/competitions/${cup.id}/coupe`):null]);
 // The division of each club, for the ties of the cup: D1, D2…; none for a club from below the simulated divisions.
 const levels=Object.fromEntries(divisions.flatMap((league,index)=>rounds[index].standings.map(row=>[row.club.id,`D${league.level}`])));
 const cards=divisions.map((league,index)=>divisionCard(league,rounds[index],own));
 if(cup)cards.push(cupCard(cup,cupData,next,params,base,own,levels));
 // Another choice of matches lets go of the cup round picked under the previous one.
 const kept=new URLSearchParams(params);kept.delete('tour');
 return `<div class="toolbar"><h1>${nationFlag(nation)}${e(nationName(nation))}</h1>${choiceLinks(base,kept,'matches',MODES,'Matches')}</div><div class="country" style="--columns:${cards.length}">${cards.join('')}</div>`;
}
