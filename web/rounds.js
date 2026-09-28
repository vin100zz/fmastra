import {escape as e,date,card,empty,fixtures,standingsTable,table,playerLink,clubLink} from './ui.js';

// The two tabs every competition has, just before its statistics; `path` is their endpoint below the competition or the edition.
export const ROUND_TABS=[['latest','Derniers matches'],['next','Prochains matches']];
export const isRoundTab=section=>ROUND_TABS.some(([key])=>key===section);
export const roundPath=section=>`journee/${section==='latest'?'derniere':'prochaine'}`;

// Matches on the left, the table they count for on the right, then the competition's leading scorers when it has any;
// a cup round, with no table, lays its ties out over two columns.
function block(group,compact){
 const matches=fixtures({items:group.matches});
 if(!group.standings)return `<div class="round-knockout">${matches}</div>`;
 const scorers=group.top_scorers?.length?`<div class="round-top-scorers">${table(['#','JOUEUR','CLUB','BUTS'],group.top_scorers.map((row,index)=>[index+1,playerLink(row.id,row.name),clubLink(row.club),`<b>${row.goals}</b>`]))}</div>`:'';
 return `<div class="round-block${scorers?' with-top-scorers':''}"><div class="round-matches">${matches}</div><div class="round-table">${standingsTable({items:group.standings},compact)}</div>${scorers}</div>`;
}

export function roundContent(data,section){
 const round=data.round;
 if(!round)return `<section class="card">${section==='latest'?empty('Aucun match joué pour l’instant.','Pas encore de résultat'):empty('Aucun match programmé.','Pas de match à venir')}</section>`;
 const when=round.date?`<span class="muted">${date(round.date)}</span>`:'';
 if(!data.groups.length)return card(round.label,empty('Le tirage aura lieu à l’issue du tour précédent.','Tirage à venir'),when);
 // Several groups: each one with its own table, two groups a row.
 const content=data.groups.length>1?`<div class="round-groups">${data.groups.map(group=>`<section class="round-group"><h3>${e(group.name)}</h3>${block(group,true)}</section>`).join('')}</div>`:block(data.groups[0],false);
 return card(round.label,content,when,'round-card');
}
