import {monthlySalary,salarySearchParams} from './salaries.js';
import {cupSummaryCard,cupScreen} from './cups.js';
import {europeScreen} from './europe.js';
import {financialHistory,movementsHistory} from './club-history.js';
import {api,escape as e,number as n,money,facilityRating,date,season,clubLink,playerLink,position,initials,form,empty,card,stat,fact,heading,tabs,table,pager,playerTable,standingsTable,seasonArchives,fixtures,query,safeColor,contrastText,nationBadge,nationName} from './ui.js';

const HOME_TABS=[['','Vue d’ensemble'],['journal','Journal']];
export const LEAGUE_ORDER=['FRA','ENG','ESP','ITA','GER'];

async function leagueSummary(id){
 const [standings,upcoming,scorers]=await Promise.all([api(`/competitions/${id}/classement`),api(`/competitions/${id}/calendrier`),api(`/competitions/${id}/statistiques?type=buteurs`)]);
 const lastRound=upcoming.round>1?await api(`/competitions/${id}/calendrier?journee=${upcoming.round-1}`):null;
 return {standings,lastRound,scorers};
}

function leagueSummaryCard(league,data){
 const content=`<div class="league-summary-grid"><div><h3>Dernière journée</h3>${data.lastRound?fixtures(data.lastRound):empty('Aucun résultat pour l’instant.','La saison démarre')}</div><div><h3>Classement</h3><div class="standings-scroll">${standingsTable(data.standings,true)}</div><h3>Buteurs</h3>${table(['#','JOUEUR','BUTS'],data.scorers.items.slice(0,5).map((row,index)=>[index+1,playerLink(row.id,row.name),n(row.value)]))}</div></div>`;
 return card(`${e(league.nation)} · ${e(league.name)}`,content,`<a href="#/league/${league.id}">Voir le championnat →</a>`);
}

async function leagueSummariesSection(ordered){
 const summaries=await Promise.all(ordered.map(league=>leagueSummary(league.id)));
 return `<div class="league-summaries">${ordered.map((league,index)=>leagueSummaryCard(league,summaries[index])).join('')}</div>`;
}

export async function dashboard(leagues){
 const ordered=leagues.filter(league=>league.level===1).sort((a,b)=>LEAGUE_ORDER.indexOf(a.nation)-LEAGUE_ORDER.indexOf(b.nation));
 return heading('LE MONDE DU FOOTBALL','Vue d’ensemble','Cinq championnats, cinq pays et une nouvelle saison à conquérir.',`<span class="pill">● Univers synchronisé</span>`)+tabs('#',HOME_TABS,'')+await leagueSummariesSection(ordered);
}

export async function countryScreen(nation,leagues){
 const ordered=leagues.filter(league=>league.nation===nation&&league.kind!=='cup').sort((a,b)=>a.level-b.level);
 if(!ordered.length)throw new Error('Pays introuvable.');
 const totalClubs=ordered.reduce((sum,league)=>sum+league.clubs,0);
 const cup=leagues.find(item=>item.nation===nation&&item.kind==='cup');
 const [summaries,cupData]=await Promise.all([Promise.all(ordered.map(league=>leagueSummary(league.id))),cup?api(`/competitions/${cup.id}/coupe`):null]);
 const cards=ordered.map((league,index)=>leagueSummaryCard(league,summaries[index]));
 if(cup)cards.splice(1,0,cupSummaryCard(cup,cupData));
 return heading(nation,nationName(nation),`${ordered.length} championnats${cup?' · 1 coupe':''} · ${totalClubs} clubs en championnat`)+`<div class="league-summaries">${cards.join('')}</div>`;
}

export async function clubsScreen(params){
 const values=Object.fromEntries(params);
 const data=await api(`/clubs?${query(values)}`);
 const sorted=values.tri||'reputation',order=values.ordre||'desc';
 const sortHeader=(key,label)=>`<button data-sort="${key}">${label} ${key===sorted?(order==='desc'?'↓':'↑'):''}</button>`;
 return heading('EXPLORER','Les clubs','Des grandes affiches aux talents du marché extérieur.')+`<form class="filters" data-filter><input type="search" name="recherche" value="${e(values.recherche)}" placeholder="Rechercher un club…" aria-label="Rechercher un club"><select name="statut" aria-label="Statut"><option value="">Tous les clubs</option><option value="actif" ${values.statut==='actif'?'selected':''}>Clubs actifs</option><option value="dormant" ${values.statut==='dormant'?'selected':''}>Clubs dormants</option></select></form>`+card(`${n(data.total)} clubs`,table([sortHeader('nom','CLUB'),'PAYS','CHAMPIONNAT',sortHeader('reputation','RÉPUTATION'),'ENTRAÎNEMENT','RECRUTEMENT JEUNES',sortHeader('effectif','EFFECTIF'),'FORMATION'],data.items.map(club=>[`<span class="strong">${clubLink(club)}</span>`,nationBadge(club.nation_code),e(club.competition||'Marché extérieur'),`<span class="rating">${n(club.reputation)}</span>`,club.training_facilities==null?'—':n(club.training_facilities),club.youth_recruitment==null?'—':n(club.youth_recruitment),club.squad_size,e(club.formation)]))+pager(data));
}

export async function clubScreen(id,section,params){
 const club=await api(`/clubs/${id}`); section=section||'squad';
 const menu=[['squad','Effectif'],['calendar','Calendrier'],['finances','Finances'],['transfers','Transferts'],['history','Historique']];
 const major=safeColor(club.major_color), minor=safeColor(club.minor_color)||major;
 const crestStyle=major?` style="background:linear-gradient(155deg,${major} 55%,${minor} 55%);color:${contrastText(major)}"`:'';
 const title=`<div class="page-heading"><div class="identity"><div class="crest"${crestStyle}>${initials(club.name)}<img class="crest-logo" src="/crests/TCM1_${club.id}.png" alt="" loading="lazy" onerror="this.remove()"></div><div><span class="eyebrow">${nationBadge(club.nation_code,{full:true})} · ${club.active?'CLUB ACTIF':'MARCHÉ EXTÉRIEUR'}</span><h1>${e(club.name)}</h1><p>${e(club.competition||'Club dormant')} · ${n(club.capacity)} places · ${e(club.formation)}</p><p class="club-facilities"><span title="TrainingFacilities : information uniquement, sans effet sur la simulation">Entraînement <b>${facilityRating(club.training_facilities)}</b></span><span title="YouthRecruitment : un meilleur recrutement augmente les chances de former des regens à fort potentiel">Recrutement des jeunes <b>${facilityRating(club.youth_recruitment)}</b></span></p></div></div>${club.standing?`<div><span class="pill">${club.standing.rank}${club.standing.rank===1?'er':'e'} · ${club.standing.points} points</span><p>${form(club.standing.form)}</p></div>`:''}</div>`;
 let content='';
 if(section==='squad'){const data=await api(`/clubs/${id}/effectif?${params}`); content=card(`Effectif · ${club.squad_size} joueurs`,playerTable(data,false,params.get('tri')||'position',params.get('ordre')||'asc'),`<span class="legend">${['GB','DC','MC','BU'].map(position).join('')}</span>`);}
 else if(section==='calendar'){const data=await api(`/clubs/${id}/calendrier?${params}`); content=card('Calendrier de la saison',fixtures(data,true)+pager(data));}
 else if(section==='transfers'){const data=await api(`/clubs/${id}/transferts?${params}`);content=movementsHistory(data);}
 else if(section==='finances'){const data=await api(`/clubs/${id}/finances?${params}`); content=`<div class="stat-grid">${stat('Budget transferts',money(Math.max(0,data.transfer_budget-data.reserved_transfer_budget)),'Disponible hors offres en cours')}${stat('Solde',money(data.balance),'Trésorerie du club')}${stat('Revenus annuels',money(data.income),'Estimation structurelle')}${stat('Masse salariale',monthlySalary(data.wage_bill),'Par mois (moyenne)')}</div><div class="grid equal">${card('Engagements salariaux',`<div class="card-body">${fact('Masse salariale',monthlySalary(data.wage_bill)+' / mois')}${fact('Plafond',monthlySalary(data.wage_cap)+' / mois')}${fact('Offres en cours',monthlySalary(data.reserved_wages)+' / mois')}<div class="meter"><span style="width:${Math.min(100,100*data.wage_bill/Math.max(1,data.wage_cap))}%"></span></div><p>${Math.round(100*data.wage_bill/Math.max(1,data.wage_cap))}% du plafond utilisé</p></div>`)}${card('Activité de la saison',`<div class="card-body">${fact('Budget réservé aux offres',money(data.reserved_transfer_budget))}${fact('Achats',money(data.season_spent))}${fact('Ventes',money(data.season_sales))}${fact('Balance des transferts',money(data.season_sales-data.season_spent))}</div>`)}</div>`;content+=financialHistory(data.history);}
 else {const data=await api(`/clubs/${id}/historique?${params}`);content=card('Les saisons du club',table(['SAISON','CHAMPIONNAT','CLASSEMENT','PALMARÈS'],data.items.map(row=>[season(row.season),e(row.competition),`${row.rank}${row.rank===1?'er':'e'}`,row.champion?'✦ Champion':'—']))+pager(data))+seasonArchives(data);}
 return title+(!club.active?'<div class="notice">Club hors championnat simulé : peut participer à la coupe nationale.</div>':'')+tabs(`#/club/${id}`,menu,section)+content;
}

export async function leagueScreen(id,section,params,leagues){
 const competition=leagues.find(item=>item.id===Number(id));
 if(competition?.kind==='cup')return cupScreen(competition,section,params);
 if(competition?.kind==='europe')return europeScreen(competition.code,section,params,leagues);
 const league=leagues.find(item=>item.id===Number(id)); if(!league)throw new Error('Championnat introuvable.');section=section||'table';
 let content='';
 if(section==='table'){const data=await api(`/competitions/${id}/classement?${params}`);content=card('Classement général',standingsTable(data),'<span class="muted">3 points pour une victoire</span>');}
 else if(section==='calendar'){const data=await api(`/competitions/${id}/calendrier?${params}`);content=card('Les rencontres',fixtures(data)+pager(data),`<form data-filter class="round-select"><select name="journee" aria-label="Journée">${data.rounds.map(round=>`<option value="${round}" ${data.round===round?'selected':''}>Journée ${round}</option>`).join('')}</select><button>Afficher</button></form>`);}
 else if(section==='stats'){const category=params.get('type')||'buteurs';const data=await api(`/competitions/${id}/statistiques?${query({...Object.fromEntries(params),type:category})}`);content=`<form class="filters" data-filter><select name="type" aria-label="Statistique">${[['buteurs','Meilleurs buteurs'],['passeurs','Meilleurs passeurs'],['notes','Meilleures notes'],['cartons','Cartons jaunes'],['clean_sheets','Clean sheets par club']].map(([key,label])=>`<option value="${key}" ${category===key?'selected':''}>${label}</option>`).join('')}</select><button>Afficher</button></form>`+card('Les leaders',table(['#',category==='clean_sheets'?'CLUB':'JOUEUR','CLUB','TOTAL'],data.items.map((row,index)=>[(data.page-1)*data.page_size+index+1,row.id?playerLink(row.id,row.name):clubLink(row.club),clubLink(row.club),`<b>${n(row.value)}</b>`]))+pager(data));}
 else{const data=await api(`/competitions/${id}/historique?${params}`);content=card('Le palmarès',table(['SAISON','CHAMPION','MEILLEUR BUTEUR','BUTS'],data.items.map(row=>[season(row.season),clubLink(row.champion),row.scorer?playerLink(row.scorer.id,row.scorer.name):'—',row.scorer?.value??'—']))+pager(data))+seasonArchives(data);}
 return heading(e(league.nation),league.name,`${league.clubs} clubs · Championnat aller-retour`)+tabs(`#/league/${id}`,[['table','Classement'],['calendar','Calendrier'],['stats','Statistiques'],['history','Historique']],section)+content;
}

export async function playersScreen(params){
 const data=await api(`/joueurs?${salarySearchParams(params)}`);const value=key=>e(params.get(key));
 const select=(key,label,items)=>`<select name="${key}" aria-label="${label}"><option value="">${label}</option>${items.map(([id,name])=>`<option value="${id}" ${params.get(key)===id?'selected':''}>${name}</option>`).join('')}</select>`;
 const filter=`<form data-filter><div class="filters"><input name="recherche" type="search" value="${value('recherche')}" placeholder="Rechercher un joueur…" aria-label="Rechercher un joueur">${select('poste','Tous les postes',['GB','DC','DL','DR','MDC','MC','MOC','AILG','AILD','BU'].map(role=>[role,role]))}${select('statut_club','Tous les clubs',[['actif','Clubs actifs'],['dormant','Clubs dormants']])}${select('contrat','Tous les contrats',[['libre','Agents libres'],['sous_contrat','Sous contrat']])}</div><details class="filters"><summary>Filtres avancés</summary><div class="filters"><label>Âge minimum <input name="age_min" type="number" min="0" max="100" value="${value('age_min')}"></label><label>Âge maximum <input name="age_max" type="number" min="0" max="100" value="${value('age_max')}"></label><label>Niveau minimum <input name="niveau_min" type="number" min="1" max="200" value="${value('niveau_min')}"></label><label>Nation (code) <input name="nation" value="${value('nation')}" placeholder="FRA"></label><label>Club (ID) <input name="club" type="number" value="${value('club')}"></label><label>Salaire min. (€/mois) <input name="salaire_min" type="number" min="0" value="${value('salaire_min')}"></label><label>Salaire max. (€/mois) <input name="salaire_max" type="number" min="0" value="${value('salaire_max')}"></label></div></details></form>`;
 return heading('LE VIVIER MONDIAL','Explorer les joueurs',`${n(data.total)} joueurs correspondent à votre recherche.`)+filter+card('Les joueurs',playerTable(data,true,params.get('tri')||'value',params.get('ordre')||'desc'));
}

export async function journalScreen(params){const data=await api(`/monde/journal?${params}`);return heading('AU FIL DES JOURS','Journal du monde','Résultats, mouvements et nouvelles des effectifs.')+tabs('#',HOME_TABS,'journal')+`<form class="filters" data-filter><input type="date" name="date" value="${e(params.get('date'))}" aria-label="Date du journal"><button>Afficher</button></form>`+card('Les événements',table(['DATE','ÉVÉNEMENT'],data.items.map(item=>[date(item.date),`<a href="${item.match_id?`#/match/${item.match_id}`:item.player_id?`#/player/${item.player_id}`:'#/journal'}">${e(item.text)}</a>`]))+pager(data));}
