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
 return `<div class="round-block${scorers?' with-top-scorers':''}"><div class="round-matches">${matches}</div><div class="round-table">${standingsTable({items:group.standings},compact,false,null,compact==='figures'?'P':'D')}</div>${scorers}</div>`;
}

// `figures` gives a table of several groups its full record, matches above the table (an international edition).
export function roundContent(data,section,{figures=false}={}){
 const round=data.round;
 if(!round)return `<section class="card">${section==='latest'?empty('Aucun match joué pour l’instant.','Pas encore de résultat'):empty('Aucun match programmé.','Pas de match à venir')}</section>`;
 const when=round.date?`<span class="muted">${date(round.date)}</span>`:'';
 if(!data.groups.length)return card(round.label,empty('Le tirage aura lieu à l’issue du tour précédent.','Tirage à venir'),when);
 // Several groups: each one with its own table, two groups a row (three in an international edition).
 const content=data.groups.length>1?`<div class="round-groups${figures?' stacked':''}">${data.groups.map(group=>`<section class="round-group"><h3>${e(group.name)}</h3>${block(group,figures?'figures':true)}</section>`).join('')}</div>`:block(data.groups[0],false);
 // An international edition adds its leading scorers in a column beside the groups.
 const rail=figures&&data.top_scorers?.length?`<aside class="round-rail"><h3>Meilleurs buteurs</h3>${table(['#','JOUEUR','NATION','BUTS'],data.top_scorers.map((row,index)=>[index+1,playerLink(row.id,row.name),clubLink(row.club),`<b>${row.goals}</b>`]))}</aside>`:'';
 return card(round.label,rail?`<div class="round-with-rail">${content}${rail}</div>`:content,when,'round-card');
}
