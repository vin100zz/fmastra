import {api,escape as e,heading,card,table,pager,nationBadge,query} from './ui.js';

export async function clubSelectScreen(params){
 const values=Object.fromEntries(params);
 const data=await api(`/clubs?${query({...values,statut:'actif'})}`);
 return heading('Choisissez votre club')+`<p>Sélectionnez le club que vous allez diriger. Ce choix est définitif pour cette partie ; les 215 autres clubs restent pilotés par l’IA.</p><form class="filters" data-filter><input type="search" name="recherche" value="${e(values.recherche||'')}" placeholder="Rechercher un club…" aria-label="Rechercher un club"></form>`+card(`${data.total} clubs actifs`,table(['CLUB','PAYS','CHAMPIONNAT','RÉPUTATION',''],data.items.map(club=>[e(club.name),nationBadge(club.nation_code),e(club.competition||'—'),club.reputation,`<button class="primary" data-command="choisir-club" data-club="${club.id}">Choisir →</button>`]))+pager(data));
}
