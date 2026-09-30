import {monthlySalary,salarySearchParams} from './salaries.js';
import {cupSummaryCard,cupScreen} from './cups.js';
import {europeScreen} from './europe.js';
import {financialHistory,movementsHistory,seasonsHistory} from './club-history.js';
import {clubOverview} from './club-overview.js';
import {resetButton} from './filters.js';
import {compositionContent} from './composition.js';
import {clubNavigation,competitionNavigation} from './navigation.js';
import {ROUND_TABS,isRoundTab,roundPath,roundContent} from './rounds.js';
import {api,escape as e,number as n,money,leadersCards,facilityRating,season,clubLink,playerLink,position,initials,form,empty,card,stat,fact,heading,tabs,table,sortableTable,pager,playerTable,playerViewSwitch,standingsTable,roundTitle,seasonArchives,fixtures,query,safeColor,contrastText,nationBadge,nationName,sortButton,levelBadge} from './ui.js';

export const LEAGUE_ORDER=['FRA','ENG','ESP','ITA','GER'];
// The countries whose leagues are simulated, in the sidebar's order.
export const playableNations=leagues=>[...new Set(leagues.filter(league=>league.kind!=='europe').map(league=>league.nation))].sort((a,b)=>LEAGUE_ORDER.indexOf(a)-LEAGUE_ORDER.indexOf(b));

async function leagueSummary(id){
 const [standings,upcoming,scorers]=await Promise.all([api(`/competitions/${id}/classement`),api(`/competitions/${id}/calendrier`),api(`/competitions/${id}/statistiques?type=buteurs`)]);
 const lastRound=upcoming.round>1?await api(`/competitions/${id}/calendrier?journee=${upcoming.round-1}`):null;
 return {standings,lastRound,scorers};
}

function leagueSummaryCard(league,data){
 const content=`<div class="league-summary-grid"><div><h3>Dernière journée</h3>${data.lastRound?fixtures(data.lastRound):empty('Aucun résultat pour l’instant.','La saison démarre')}</div><div><h3>${roundTitle('Classement',data.standings.items)}</h3><div class="standings-scroll">${standingsTable(data.standings,'record')}</div><h3>Buteurs</h3>${table(['#','JOUEUR','BUTS'],data.scorers.items.slice(0,5).map((row,index)=>[index+1,playerLink(row.id,row.name),n(row.value)]))}</div></div>`;
 return card(`${e(league.nation)} · ${e(league.name)}`,content,`<a href="#/league/${league.id}">Voir le championnat →</a>`);
}

async function leagueSummariesSection(ordered){
 const summaries=await Promise.all(ordered.map(league=>leagueSummary(league.id)));
 return `<div class="league-summaries">${ordered.map((league,index)=>leagueSummaryCard(league,summaries[index])).join('')}</div>`;
}

export async function dashboard(leagues){
 const ordered=leagues.filter(league=>league.level===1).sort((a,b)=>LEAGUE_ORDER.indexOf(a.nation)-LEAGUE_ORDER.indexOf(b.nation));
 return heading('Vue d’ensemble')+await leagueSummariesSection(ordered);
}

export async function countryScreen(nation,leagues){
 const ordered=leagues.filter(league=>league.nation===nation&&league.kind!=='cup').sort((a,b)=>a.level-b.level);
 if(!ordered.length)throw new Error('Pays introuvable.');
 const cup=leagues.find(item=>item.nation===nation&&item.kind==='cup');
 const [summaries,cupData]=await Promise.all([Promise.all(ordered.map(league=>leagueSummary(league.id))),cup?api(`/competitions/${cup.id}/coupe`):null]);
 const cards=ordered.map((league,index)=>leagueSummaryCard(league,summaries[index]));
 if(cup)cards.splice(1,0,cupSummaryCard(cup,cupData));
 return heading(nationName(nation))+`<div class="league-summaries">${cards.join('')}</div>`;
}

export async function clubsScreen(params,leagues=[]){
 const values=Object.fromEntries(params);
 const data=await api(`/clubs?${query(values)}`);
 const textColumns=['nom','pays','championnat','formation'],sorted=values.tri||'reputation',order=values.ordre||(textColumns.includes(sorted)?'asc':'desc');
 const sortHeader=(key,label)=>sortButton(key,label,sorted,order,textColumns.includes(key)?'asc':'desc');
 const columns=[['nom','CLUB'],['pays','PAYS'],['championnat','CHAMPIONNAT'],['reputation','RÉPUTATION'],['entrainement','ENTRAÎNEMENT'],['recrutement','RECRUTEMENT JEUNES'],['effectif','EFFECTIF'],['niveau','NIVEAU TOP 16'],['potentiel','POTENTIEL TOP 16'],['formation','FORMATION']];
 // Playable countries first, then the others by name.
 const playable=playableNations(leagues).filter(code=>data.nations.includes(code)),others=data.nations.filter(code=>!playable.includes(code)).sort((a,b)=>nationName(a).localeCompare(nationName(b),'fr'));
 const nationOption=code=>`<option value="${e(code)}" ${values.pays===code?'selected':''}>${e(nationName(code))}</option>`;
 const nationSelect=`<select name="pays" aria-label="Pays"><option value="">Tous les pays</option>${playable.map(nationOption).join('')}${playable.length&&others.length?'<hr>':''}${others.map(nationOption).join('')}</select>`;
 return heading('Clubs')+`<form class="filters" data-filter><input type="search" name="recherche" value="${e(values.recherche)}" placeholder="Rechercher un club…" aria-label="Rechercher un club">${nationSelect}<select name="statut" aria-label="Statut"><option value="">Tous les clubs</option><option value="actif" ${values.statut==='actif'?'selected':''}>Clubs actifs</option><option value="dormant" ${values.statut==='dormant'?'selected':''}>Clubs dormants</option></select>${resetButton(params)}</form>`+card(`${n(data.total)} clubs`,`<div class="clubs-table">${table(columns.map(([key,label])=>sortHeader(key,label)),data.items.map(club=>[`<span class="strong">${clubLink(club)}</span>`,nationBadge(club.nation_code),e(club.competition||'Marché extérieur'),`<span class="rating">${n(club.reputation)}</span>`,club.training_facilities==null?'—':n(club.training_facilities),club.youth_recruitment==null?'—':n(club.youth_recruitment),club.squad_size,levelBadge(club.top_rating,'Moyenne des 16 meilleurs niveaux sur 200'),levelBadge(club.top_potential,'Moyenne des 16 meilleurs potentiels sur 200'),e(club.formation)]),undefined,undefined,undefined,columns.map(([key])=>`${key}-column`))}</div>`+pager(data));
}

export async function clubScreen(id,section,params){
 const [club,neighbours,state]=await Promise.all([api(`/clubs/${id}`),api(`/clubs/${id}/navigation`),api('/monde/etat')]); section=section||'squad';
 // The club run by the user also gets its lineup form.
 const human=state.controlled_club_id===club.id;
 const menu=[['squad','Effectif'],...(human?[['composition','Composition']]:[]),['calendar','Calendrier'],['finances','Finances'],['transfers','Transferts'],['history','Historique']];
 const major=safeColor(club.major_color), minor=safeColor(club.minor_color)||major;
 const crestStyle=major?` style="background:linear-gradient(155deg,${major} 55%,${minor} 55%);color:${contrastText(major)}"`:'';
 const title=`<div class="page-heading"><div class="identity">${clubNavigation(neighbours,section,section==='squad'&&params.get('vue')?query({vue:params.get('vue')}):'')}<div class="crest"${crestStyle}>${initials(club.name)}<img class="crest-logo" src="/crests/TCM1_${club.id}.png" alt="" loading="lazy" onerror="this.remove()"></div><div><span class="eyebrow">${nationBadge(club.nation_code,{full:true})}</span><h1>${e(club.name)}</h1><p>${e(club.competition||'Club dormant')} · ${n(club.capacity)} places · ${e(club.formation)}</p><p class="club-facilities"><span title="TrainingFacilities : information uniquement, sans effet sur la simulation">Entraînement <b>${facilityRating(club.training_facilities)}</b></span><span title="YouthRecruitment : un meilleur recrutement augmente les chances de former des regens à fort potentiel">Recrutement des jeunes <b>${facilityRating(club.youth_recruitment)}</b></span></p></div></div>${club.standing?`<div><span class="pill">${club.standing.rank}${club.standing.rank===1?'er':'e'} · ${club.standing.points} points</span><p>${form(club.standing.form)}</p></div>`:''}</div>`;
 let content='';
 if(section==='squad'){const [data,overview]=await Promise.all([api(`/clubs/${id}/effectif?${params}`),api(`/clubs/${id}/apercu`)]);const view=params.get('vue'),sorted=params.get('tri')||'position',order=params.get('ordre')||'asc'; content=clubOverview(club,overview)+card(`Effectif · ${club.squad_size} joueurs`,playerTable(data,false,sorted,order,{view}),`<div class="card-tools">${playerViewSwitch(view,sorted,order)}<span class="legend">${['GB','DC','MC','BU'].map(position).join('')}</span></div>`);}
 else if(section==='composition'&&human)content=await compositionContent(params,state);
 else if(section==='calendar'){const data=await api(`/clubs/${id}/calendrier?${params}`); content=card('Calendrier de la saison',fixtures(data,true)+pager(data));}
 else if(section==='transfers'){const data=await api(`/clubs/${id}/transferts?${params}`);content=movementsHistory(data);}
 else if(section==='finances'){const data=await api(`/clubs/${id}/finances?${params}`); content=`<div class="stat-grid">${stat('Budget transferts',money(Math.max(0,data.transfer_budget-data.reserved_transfer_budget)),'Disponible hors offres en cours')}${stat('Solde',money(data.balance),'Trésorerie du club')}${stat('Revenus annuels',money(data.income),'Estimation structurelle')}${stat('Masse salariale',monthlySalary(data.wage_bill),'Par mois (moyenne)')}</div><div class="grid equal">${card('Engagements salariaux',`<div class="card-body">${fact('Masse salariale',monthlySalary(data.wage_bill)+' / mois')}${fact('Plafond',monthlySalary(data.wage_cap)+' / mois')}${fact('Offres en cours',monthlySalary(data.reserved_wages)+' / mois')}<div class="meter"><span style="width:${Math.min(100,100*data.wage_bill/Math.max(1,data.wage_cap))}%"></span></div><p>${Math.round(100*data.wage_bill/Math.max(1,data.wage_cap))}% du plafond utilisé</p></div>`)}${card('Activité de la saison',`<div class="card-body">${fact('Budget réservé aux offres',money(data.reserved_transfer_budget))}${fact('Achats',money(data.season_spent))}${fact('Ventes',money(data.season_sales))}${fact('Balance des transferts',money(data.season_sales-data.season_spent))}</div>`)}</div>`;content+=financialHistory(data.history);}
 else {const data=await api(`/clubs/${id}/historique?${params}`);content=seasonsHistory(data);}
 return title+(!club.active?'<div class="notice">Club hors championnat simulé : peut participer à la coupe nationale.</div>':'')+tabs(`#/club/${id}`,menu,section)+content;
}

export async function leagueScreen(id,section,params,leagues){
 const competition=leagues.find(item=>item.id===Number(id));
 // The European cups already switch between themselves in their own tabs.
 if(competition?.kind==='europe')return europeScreen(competition.code,section,params,leagues);
 if(!competition)throw new Error('Championnat introuvable.');
 const lead=competitionNavigation(await api(`/competitions/${id}/navigation`));
 return competition.kind==='cup'?cupScreen(competition,section,params,lead):leagueContent(competition,section,params,lead);
}

async function leagueContent(league,section,params,lead){
 const id=league.id;section=section||'table';
 let content='';
 if(section==='table'){const data=await api(`/competitions/${id}/classement?${params}`);content=card('Classement général',standingsTable(data),'<span class="muted">3 points pour une victoire</span>');}
 else if(section==='calendar'){const data=await api(`/competitions/${id}/calendrier?${params}`);content=card('Les rencontres',fixtures(data)+pager(data),`<form data-filter class="round-select"><select name="journee" aria-label="Journée">${data.rounds.map(round=>`<option value="${round}" ${data.round===round?'selected':''}>Journée ${round}</option>`).join('')}</select><button>Afficher</button></form>`);}
 else if(isRoundTab(section))content=roundContent(await api(`/competitions/${id}/${roundPath(section)}`),section);
 else if(section==='stats'){const category=params.get('type')||'buteurs';const data=await api(`/competitions/${id}/statistiques?${query({...Object.fromEntries(params),type:category})}`);content=`<form class="filters" data-filter><select name="type" aria-label="Statistique">${[['buteurs','Meilleurs buteurs'],['passeurs','Meilleurs passeurs'],['notes','Meilleures notes'],['cartons','Cartons jaunes'],['clean_sheets','Clean sheets par club']].map(([key,label])=>`<option value="${key}" ${category===key?'selected':''}>${label}</option>`).join('')}</select><button>Afficher</button></form>`+card('Les leaders',table(['#',category==='clean_sheets'?'CLUB':'JOUEUR','CLUB','TOTAL'],data.items.map((row,index)=>[(data.page-1)*data.page_size+index+1,row.id?playerLink(row.id,row.name):clubLink(row.club),clubLink(row.club),`<b>${n(row.value)}</b>`]))+pager(data));}
 else{const data=await api(`/competitions/${id}/historique?${params}`);content=card('Le palmarès',table(['SAISON','CHAMPION','MEILLEUR BUTEUR','BUTS'],data.items.map(row=>[season(row.season),clubLink(row.champion),row.scorer?playerLink(row.scorer.id,row.scorer.name):'—',row.scorer?.value??'—']))+pager(data))+leadersCards(data.leaders)+seasonArchives(data);}
 return heading(league.name,'',lead)+tabs(`#/league/${id}`,[['table','Classement'],['calendar','Calendrier'],...ROUND_TABS,['stats','Statistiques'],['history','Historique']],section)+content;
}

export async function playersScreen(params){
 // The attributes and the composites have no value column to sort on: their views open on the level.
 const view=params.get('vue'),sorted=params.get('tri')||(view==='attributs'||view==='jeu'?'rating':'value'),order=params.get('ordre')||'desc';
 const data=await api(`/joueurs?${salarySearchParams({...Object.fromEntries(params),tri:sorted,ordre:order})}`);const value=key=>e(params.get(key));
 const select=(key,label,items)=>`<select name="${key}" aria-label="${label}"><option value="">${label}</option>${items.map(([id,name])=>`<option value="${id}" ${params.get(key)===id?'selected':''}>${name}</option>`).join('')}</select>`;
 const filter=`<form data-filter><div class="filters"><input name="recherche" type="search" value="${value('recherche')}" placeholder="Rechercher un joueur…" aria-label="Rechercher un joueur">${select('poste','Tous les postes',['GB','DC','DG','DD','MDC','MC','MOC','AILG','AILD','BU'].map(role=>[role,role]))}${select('statut_club','Tous les clubs',[['actif','Clubs actifs'],['dormant','Clubs dormants']])}${select('contrat','Tous les contrats',[['libre','Agents libres'],['sous_contrat','Sous contrat']])}${resetButton(params)}</div><details class="filters" ${['age_min','age_max','niveau_min','potentiel_min','salaire_max','valeur_max','prix_max'].some(key=>params.get(key))?'open':''}><summary>Filtres avancés</summary><div class="filters"><label>Âge minimum <input name="age_min" type="number" min="0" max="100" value="${value('age_min')}"></label><label>Âge maximum <input name="age_max" type="number" min="0" max="100" value="${value('age_max')}"></label><label>Niveau minimum <input name="niveau_min" type="number" min="1" max="200" value="${value('niveau_min')}"></label><label>Potentiel minimum <input name="potentiel_min" type="number" min="1" max="200" value="${value('potentiel_min')}"></label><label>Salaire max. (€/mois) <input name="salaire_max" type="number" min="0" value="${value('salaire_max')}"></label><label>Valeur max. (M€) <input name="valeur_max" type="number" min="0" step="any" value="${value('valeur_max')}"></label><label>Prix max. (M€) <input name="prix_max" type="number" min="0" step="any" value="${value('prix_max')}"></label></div></details></form>`;
 return heading('Joueurs')+filter+card(`${n(data.total)} joueurs`,playerTable(data,true,sorted,order,{asking:true,view}),playerViewSwitch(view,sorted,order,true,{asking:true}));
}
