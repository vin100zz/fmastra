import {api,escape as e,number as n,date,card,heading,table,sortableTable,empty,clubLink,playerLink,position,fixtures,tabs,levelBadge} from './ui.js';

export function internationalStandings(rows,places=0){
 return table(['#','NATION','J','V','N','D','BP','BC','DIFF.','PTS'],rows.map((row,i)=>[
  `${i+1}${i<places?' ✓':''}`,clubLink(row.nation),row.played,row.won,row.drawn,row.lost,row.goals_for,row.goals_against,row.difference,`<strong>${row.points}</strong>`]));
}
function scorers(records){
 return records.length?sortableTable(['JOUEUR','NATION','MATCHS','BUTS','PASSES'],records.map(row=>[
  playerLink(row.player_id,row.name),clubLink(row.nation),row.matches,row.goals,row.assists]),records.map(row=>[row.name,row.nation.name,row.matches,row.goals,row.assists])):empty('Les statistiques apparaîtront après les premiers matchs.');
}
export function editionContent(data,section='qualifications'){
 const navigation=tabs(`#/international/${data.year}`,[['qualifications','Qualifications'],['finals','Phase finale'],['statistics','Statistiques']],section);
 if(section==='statistics')return navigation+card('Statistiques de l’édition',scorers(data.records));
 const finals=section==='finals';
 const groups=finals?data.final_groups:data.qualification_groups;
 let html=groups.length?`<div class="grid equal">${groups.map(group=>card(`Groupe ${group.name}`,internationalStandings(group.rows,finals?2:1))).join('')}</div>`:card('Phase finale',empty('Les groupes seront tirés à la fin des qualifications.'));
 if(!finals)html+=card('Classement des deuxièmes',`<p class="note">${data.second_places} places qualificatives. Dans les groupes de six, les résultats contre le dernier sont exclus de ce classement.</p>${internationalStandings(data.best_seconds,data.second_places)}`);
 if(data.qualifiers.length)html+=card('Nations qualifiées',`<div class="card-body">${data.qualifiers.map(clubLink).join(' · ')}</div>`);
 const matches=data.matches.filter(m=>finals?m.round>10:m.round<=10);
 const rounds=[...new Set(matches.map(m=>m.round))];
 html+=rounds.map(round=>{const items=matches.filter(m=>m.round===round);return card(items[0].round_label,fixtures({items},true));}).join('');
 return navigation+html;
}
async function nationScreen(id){
 const data=await api(`/international/nations/${id}`);
 const intro=heading(data.name,`<a href="#/international">Toutes les nations</a>`)+`<p class="muted">${e(data.federation)} · Force ${n(data.strength)} / 100</p>`;
 const squad=data.camp?card(`Rassemblement du ${date(data.camp.start)} au ${date(data.camp.end)}`,sortableTable(['JOUEUR','POSTE','NIVEAU','CONDITION','SÉL.','BUTS'],data.squad.map(p=>[
  playerLink(p.id,p.name),position(p.position),levelBadge(p.rating),p.injured_until?`Blessé jusqu’au ${date(p.injured_until)}`:p.suspended?`${p.suspended} match(s) de suspension`:`${Math.round(p.fitness*100)} %`,p.caps,p.goals]),data.squad.map(p=>[p.name,p.position,p.rating,p.fitness,p.caps,p.goals]))):card('Sélection',empty('La prochaine liste de 23 sera annoncée au début du rassemblement.','Aucun rassemblement en cours'));
 return intro+squad+card('Joueurs éligibles',table(['JOUEUR','POSTE','NIVEAU','CLUB'],data.candidates.map(p=>[playerLink(p.id,p.name),position(p.position),levelBadge(p.rating),clubLink(p.club)])))+card('Calendrier et résultats',fixtures({items:data.matches},true))+card('Historique international',scorers(data.records));
}
export async function internationalScreen(id,section){
 if(id==='nation')return nationScreen(section);
 const data=await api('/international');
 if(!data.enabled)return heading('Sélections nationales')+card('Nouvelle partie nécessaire',empty('Cette sauvegarde conserve son calendrier de clubs. Créez une nouvelle partie pour activer les sélections nationales.'));
 const editionLinks=`<div class="tabs">${data.editions.map(item=>`<a href="#/international/${item.year}" class="${String(item.year)===id?'active':''}">${e(item.name)}</a>`).join('')}</div>`;
 if(id){
  const edition=await api(`/international/editions/${id}`);
  return heading(edition.name,`<a href="#/international">Toutes les nations</a>`)+editionLinks+(edition.winner?card('Vainqueur',`<div class="card-body">${clubLink(edition.winner)}</div>`):'')+editionContent(edition,section);
 }
 return heading('Sélections nationales')+editionLinks+card('Palmarès',data.editions.some(item=>item.winner)?table(['ÉDITION','VAINQUEUR'],data.editions.filter(item=>item.winner).map(item=>[`<a href="#/international/${item.year}/finals">${e(item.name)}</a>`,clubLink(item.winner)])):empty('Les vainqueurs apparaîtront après les premières finales.'))+card('Nations actives',sortableTable(['NATION','FÉDÉRATION','FORCE / 100'],data.nations.map(team=>[clubLink(team),e(team.federation),n(team.strength)]),data.nations.map(team=>[team.name,team.federation,team.strength])));
}
