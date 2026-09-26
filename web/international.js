import {api,escape as e,number as n,date,card,heading,table,sortableTable,empty,clubLink,playerLink,position,fixtures,tabs,levelBadge,leadersCards,nationFlag} from './ui.js';
import {nationNavigation} from './navigation.js';

export function internationalStandings(rows,places=0){
 const rowClasses=rows.map((row,i)=>i<places?'promoted':'');
 return table(['#','NATION','J','V','N','D','BP','BC','DIFF.','PTS'],rows.map((row,i)=>[
  i+1,clubLink(row.nation),row.played,row.won,row.drawn,row.lost,row.goals_for,row.goals_against,row.difference,`<strong>${row.points}</strong>`]),undefined,rowClasses);
}
function scorers(records){
 return records.length?sortableTable(['JOUEUR','NATION','MATCHS','BUTS','PASSES'],records.map(row=>[
  playerLink(row.player_id,row.name),clubLink(row.nation),row.matches,row.goals,row.assists]),records.map(row=>[row.name,row.nation.name,row.matches,row.goals,row.assists])):empty('Les statistiques apparaîtront après les premiers matchs.');
}
export function editionContent(data,section='qualifications'){
 const navigation=tabs(`#/international/${data.year}`,[['finals','Phase finale'],['qualifications','Qualifications'],['statistics','Statistiques']],section);
 if(section==='statistics')return navigation+card('Statistiques de l’édition',scorers(data.records));
 const finals=section==='finals';
 const groups=finals?data.final_groups:data.qualification_groups;
 let html=groups.length?`<div class="grid equal">${groups.map(group=>card(`Groupe ${group.name}`,internationalStandings(group.rows,finals?2:1))).join('')}</div>`:card('Phase finale',empty('Les groupes seront tirés à la fin des qualifications.'));
 if(!finals)html+=card('Classement des deuxièmes',`<p class="note">${data.second_places} places qualificatives. Dans les groupes de six, les résultats contre le dernier sont exclus de ce classement.</p>${internationalStandings(data.best_seconds,data.second_places)}`);
 const matches=data.matches.filter(m=>finals?m.round>10:m.round<=10);
 const rounds=[...new Set(matches.map(m=>m.round))];
 html+=rounds.map(round=>{
  const items=matches.filter(m=>m.round===round);
  return finals&&round<=13
   ?`<details class="card cup-round"><summary>${e(items[0].round_label)}</summary>${fixtures({items},true)}</details>`
   :card(items[0].round_label,fixtures({items},true));
 }).join('');
 return navigation+html;
}
const NATION_TABS=[['squad','Effectif'],['calendar','Calendrier'],['history','Historique']];
// A run in a competition, in the same style as a club's cup and European runs: the label alone, or starred when it was won.
const editionRun=run=>run?(run.winner?`✦ ${e(run.label)}`:e(run.label)):'—';

function squadCard(data){
 if(!data.camp)return card('Sélection',empty('La prochaine liste de 23 sera annoncée au début du rassemblement.','Aucun rassemblement en cours'));
 const title=`${data.camp.upcoming?'Rassemblement':'Dernier rassemblement'} du ${date(data.camp.start)} au ${date(data.camp.end)}`;
 return card(title,sortableTable(['JOUEUR','POSTE','NIVEAU','CONDITION','SÉL.','BUTS'],data.squad.map(p=>[
  playerLink(p.id,p.name),position(p.position),levelBadge(p.rating),p.injured_until?`Blessé jusqu’au ${date(p.injured_until)}`:p.suspended?`${p.suspended} match${p.suspended>1?'s':''} de suspension`:`${Math.round(p.fitness*100)} %`,p.caps,p.goals]),data.squad.map(p=>[p.name,p.position,p.rating,p.fitness,p.caps,p.goals])));
}
function historyContent(data){
 const editions=card('Bilan par compétition',data.editions.length?table(['ÉDITION','QUALIFICATIONS','PHASE FINALE'],data.editions.map(row=>[e(row.name),editionRun(row.qualification),editionRun(row.finals)])):empty('Le bilan apparaîtra à la fin de la première édition disputée.','Pas encore d’historique'));
 return editions+leadersCards(data.leaders,'Toutes éditions confondues, édition en cours incluse.');
}
async function nationScreen(id,tab){
 const [data,nav]=await Promise.all([api(`/international/nations/${id}`),api(`/international/nations/${id}/navigation`)]);
 tab=NATION_TABS.some(([key])=>key===tab)?tab:'squad';
 const title=`<div class="page-heading"><div class="identity">${nationNavigation(nav,tab)}<div class="crest">${nationFlag(data.nation)}</div><div><span class="eyebrow">${e(data.federation)} · Force ${n(data.strength)} / 100</span><h1>${e(data.name)}</h1></div></div></div>`;
 const content=tab==='calendar'?card('Calendrier et résultats',fixtures({items:data.matches},true)):tab==='history'?historyContent(data):squadCard(data);
 return title+tabs(`#/international/nation/${id}`,NATION_TABS,tab)+content;
}
export async function internationalScreen(id,section,tab){
 if(id==='nation')return nationScreen(section,tab);
 const data=await api('/international');
 if(!data.enabled)return heading('Sélections nationales')+card('Nouvelle partie nécessaire',empty('Cette sauvegarde conserve son calendrier de clubs. Créez une nouvelle partie pour activer les sélections nationales.'));
 const editionLinks=`<div class="tabs">${data.editions.map(item=>`<a href="#/international/${item.year}" class="${String(item.year)===id?'active':''}">${e(item.name)}</a>`).join('')}</div>`;
 if(id){
  const edition=await api(`/international/editions/${id}`);
  return heading(edition.name,`<a href="#/international">Toutes les nations</a>`)+editionLinks+(edition.winner?card('Vainqueur',`<div class="card-body">${clubLink(edition.winner)}</div>`):'')+editionContent(edition,section);
 }
 return heading('Sélections nationales')+editionLinks+card('Palmarès',data.editions.some(item=>item.winner)?table(['ÉDITION','VAINQUEUR'],data.editions.filter(item=>item.winner).map(item=>[`<a href="#/international/${item.year}/finals">${e(item.name)}</a>`,clubLink(item.winner)])):empty('Les vainqueurs apparaîtront après les premières finales.'))+card('Nations actives',sortableTable(['NATION','FÉDÉRATION','FORCE / 100'],data.nations.map(team=>[clubLink(team),e(team.federation),n(team.strength)]),data.nations.map(team=>[team.name,team.federation,team.strength])));
}
