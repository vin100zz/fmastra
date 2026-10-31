import {escape as e,card,empty,fixtures,standingsTable,roundTitle,table,playerLink,clubLink,averageNote} from './ui.js';

// The two tabs every competition has, just before its statistics; `path` is their endpoint below the competition or the edition.
export const ROUND_TABS=[['latest','Derniers matches'],['next','Prochains matches']];
export const isRoundTab=section=>ROUND_TABS.some(([key])=>key===section);
export const roundPath=section=>`journee/${section==='latest'?'derniere':'prochaine'}`;

// The competition's leading scorers of the season, in a card of their own; none before a goal. `nations` heads the column
// of a selection's; `flags` follows each club with the flag of its country (a European cup).
const scorersCard=(rows,{flags=false,nations=false}={})=>rows?.length?card('Buteurs',table(['#','JOUEUR',nations?'NATION':'CLUB','BUTS'],
 rows.map((row,index)=>[index+1,playerLink(row.id,row.name),clubLink(row.club,{flag:flags}),`<b>${row.goals}</b>`])),'','round-scorers'):'';
// The best average ratings of the season under the scorers, among the players rated in at least half the matches of the
// most rated one; none before a match is played.
const ratingsCard=(rows,flags)=>rows?.length?card('Notes',table(['#','JOUEUR','CLUB','NOTE'],
 rows.map((row,index)=>[index+1,playerLink(row.id,row.name),clubLink(row.club,{flag:flags}),`<b>${averageNote(row.rating)}</b>`])),'','round-ratings'):'';
// The scorers and the ratings one under the other, in one column of the round.
const leadersColumn=(...cards)=>cards.some(Boolean)?`<div class="round-leaders">${cards.join('')}</div>`:'';

// A group's matches above or beside its table, under the group's name, in the card of the round.
const groupBlock=(group,compact,flags)=>`<section class="round-group"><h3 class="section-title">${e(group.name)}</h3><div class="round-block">`
 +`<div class="round-matches">${fixtures({items:group.matches,flags})}</div><div class="round-table">${standingsTable({items:group.standings,flags},compact)}</div></div></section>`;

// Each part in its card (docs/charte-graphique.md, « Derniers et prochains matches »): the matches under the name of the
// round, the table they count for under the last round it counts, the leading scorers then the best ratings in one column.
// A cup round, with no table, lays its ties out over two columns; groups stay in the card of the round, each under its name,
// the scorers beside them. `figures`
// gives a table of several groups its full record (an international edition); `flags` follows each club with the flag of
// its country (a European cup).
export function roundContent(data,section,{figures=false,flags=false}={}){
 const round=data.round;
 if(!round)return `<section class="card">${section==='latest'?empty('Aucun match joué'):empty('Aucun match à venir')}</section>`;
 if(!data.groups.length)return card(round.label,empty('Tirage à venir'));
 const [group]=data.groups;
 // An international edition gives its leading scorers once, for all its groups, and no ratings.
 const leaders=leadersColumn(scorersCard(figures?data.top_scorers:group.top_scorers,{flags,nations:figures}),figures?'':ratingsCard(group.top_ratings,flags));
 if(data.groups.length>1)return `<div class="round-layout groups">${card(round.label,`<div class="round-groups${figures?' stacked':''}">${data.groups.map(group=>groupBlock(group,figures?'figures':true,flags)).join('')}</div>`,'','round-matches')}${leaders}</div>`;
 const matches=fixtures({items:group.matches,flags});
 if(!group.standings)return `<div class="round-layout knockout">${card(round.label,`<div class="round-knockout">${matches}</div>`,'','round-matches')}${leaders}</div>`;
 const standings=card(roundTitle('Classement',group.standings),standingsTable({items:group.standings,flags}),'','round-table');
 return `<div class="round-layout league">${card(round.label,matches,'','round-matches')}${standings}${leaders}</div>`;
}
