import {monthlySalary,monthlyAmount,salarySearchParams} from './salaries.js';
import {cupSummaryCard,cupScreen} from './cups.js';
import {europeScreen} from './europe.js';
import {financialHistory,movementsHistory,seasonsHistory} from './club-history.js';
import {clubOverview,clubPreview} from './club-overview.js';
import {playerPreview} from './player.js';
import {resetButton} from './filters.js';
import {wideScreen,fittedRows,sidePanel,searchField,positionChips,nationChips,choiceLinks,rangeMenu,choiceSelect} from './listing.js';
import {compositionContent} from './composition.js';
import {clubNavigation,competitionNavigation} from './navigation.js';
import {ROUND_TABS,isRoundTab,roundPath,roundContent} from './rounds.js';
import {api,escape as e,number as n,money,headPager,figure,miniBar,scoreBadge,leadersCards,facilityRating,season,clubLink,playerLink,position,initials,form,empty,card,stat,fact,heading,tabs,table,sortableTable,pager,playerTable,playerViewSwitch,standingsTable,roundTitle,seasonArchives,fixtures,query,safeColor,contrastText,nationBadge,nationName,sortButton,levelBadge} from './ui.js';

// What stands above the first row of a list screen: top bar, title line, card head and table header.
const LIST_ABOVE=155;

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
 const values=Object.fromEntries(params),base='#/clubs',rows=fittedRows('clubs',LIST_ABOVE),wide=wideScreen();
 delete values.sel;
 const data=await api(`/clubs?${query({...values,taille:rows})}`);
 // Names and ranks first run from the smallest.
 const ascending=['nom','pays','championnat','classement'],sorted=values.tri||'reputation',order=values.ordre||(ascending.includes(sorted)?'asc':'desc');
 const sortHeader=(key,label,title)=>sortButton(key,title?`<span title="${title}">${label}</span>`:label,sorted,order,ascending.includes(key)?'asc':'desc');
 const columns=[['nom','CLUB'],['pays','PAYS'],['championnat','CHAMPIONNAT'],['classement','CLASS.','Classement en championnat'],['forme','FORME'],['reputation','RÉPUTATION'],['entrainement','ENTR.','Entraînement'],['recrutement','JEUNES','Recrutement des jeunes'],['effectif','EFF.','Effectif'],['age','ÂGE','Âge moyen'],['niveau','NIV. 16','Niveau moyen des 16 meilleurs'],['potentiel','POT. 16','Potentiel moyen des 16 meilleurs'],['valeur','VALEUR','Valeur de l’effectif'],['budget','BUDGET','Budget de transferts'],['masse_salariale','MASSE SAL.','Masse salariale par mois, et la part du plafond utilisée']];
 // Playable countries first, then the others by name.
 const playable=playableNations(leagues).filter(code=>data.nations.includes(code)),others=data.nations.filter(code=>!playable.includes(code)).sort((a,b)=>nationName(a).localeCompare(nationName(b),'fr'));
 const nationOption=code=>`<option value="${e(code)}" ${values.pays===code?'selected':''}>${e(nationName(code))}</option>`;
 const nationSelect=`<select name="pays" aria-label="Pays"${values.pays?' class="on"':''}><option value="">Tous les pays</option>${playable.map(nationOption).join('')}${playable.length&&others.length?'<hr>':''}${others.map(nationOption).join('')}</select>`;
 const divisions=leagues.filter(league=>league.kind==='league').sort((a,b)=>LEAGUE_ORDER.indexOf(a.nation)-LEAGUE_ORDER.indexOf(b.nation)||a.level-b.level).map(league=>[league.id,e(league.name)]);
 const toolbar=`<form class="toolbar" data-filter><h1>Clubs</h1>${searchField(params,'Rechercher un club…')}${nationChips(base,params,playable,false)}${nationSelect}${choiceSelect(params,'competition','Championnat',divisions)}${choiceLinks(base,params,'statut',[['','Tous'],['actif','Actifs'],['dormant','Dormants']],'Statut')}${resetButton(params)}</form>`;
 // On a wide screen a row is picked, the first one by default, and previewed beside the list.
 const selected=wide&&data.items.length?(data.items.find(club=>String(club.id)===params.get('sel'))||data.items[0]).id:null;
 const rank=row=>`<span class="strong">${row.rank}${row.rank===1?'er':'e'}</span>${row.movement==='champion'?' <span class="movement-icon promotion" title="Champion">★</span>':row.movement==='promotion'?' <span class="movement-icon promotion" title="Place de promotion">↑</span>':row.movement==='relegation'?' <span class="movement-icon relegation" title="Place de relégation">↓</span>':''}`;
 // The monthly wage bill, with the share of its cap it takes: the bar turns red from 95 %.
 const wages=club=>club.wage_cap?`<span class="bar-figure">${miniBar(club.wage_bill/club.wage_cap,club.wage_bill>=.95*club.wage_cap?'full':'')}<b>${money(monthlyAmount(club.wage_bill))}</b></span>`:figure('—');
 const cells=(club,index)=>[figure((data.page-1)*data.page_size+index+1),`<span class="strong">${clubLink(club)}</span>`,nationBadge(club.nation_code),club.competition?e(club.competition):'<span class="muted">Marché extérieur</span>',
  club.standing?rank(club.standing):'—',club.standing?form(club.standing.form):'—',`<span class="bar-figure">${miniBar(club.reputation/100)}<b>${n(club.reputation)}</b></span>`,
  scoreBadge(club.training_facilities,'Entraînement sur 20'),scoreBadge(club.youth_recruitment,'Recrutement des jeunes sur 20'),figure(club.squad_size),figure(club.average_age==null?'—':n(club.average_age)),
  levelBadge(club.top_rating,'Moyenne des 16 meilleurs niveaux sur 200'),levelBadge(club.top_potential,'Moyenne des 16 meilleurs potentiels sur 200'),
  figure(club.squad_value?money(club.squad_value):'—'),figure(club.available_budget==null?'—':money(club.available_budget)),wages(club)];
 const list=card(`${n(data.total)} clubs`,`<div class="clubs-table">${table(['#',...columns.map(([key,label,title])=>sortHeader(key,label,title))],data.items.map(cells),undefined,selected==null?undefined:data.items.map(club=>club.id===selected?'selected':''),undefined,['rang-column',...columns.map(([key])=>`${key}-column`)],undefined,selected==null?undefined:data.items.map(club=>`data-select="${club.id}"`))}</div>`,headPager(data));
 const side=selected==null?'':sidePanel('club',await clubPreview(selected));
 return toolbar+`<div class="split${side?' with-side':''}" data-fit="clubs" data-rows="${rows??''}">${list}${side}</div>`;
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
 const base='#/players',rows=fittedRows('players',LIST_ABOVE),wide=wideScreen();
 const request={...Object.fromEntries(params),tri:sorted,ordre:order,...(rows?{taille:rows}:{})};
 delete request.sel;
 const [data,state]=await Promise.all([api(`/joueurs?${salarySearchParams(request)}`),api('/monde/etat')]);
 // With a club of his own, the user also reads and filters what a player asks to join it and whether he accepts to.
 const recruiting=state.controlled_club_id!=null,options={asking:true,recruiting,season:true};
 const level=(label,key,steps)=>rangeMenu(base,params,label,[[`${key}_min`,'min','min="1" max="200"'],[`${key}_max`,'max','min="1" max="200"']],{presets:steps.map(step=>[`≥ ${step}`,{[`${key}_min`]:step}])});
 const amount='min="0" step="any"';
 const toolbar=`<form class="toolbar" data-filter><h1>Joueurs</h1>${searchField(params,'Rechercher un joueur…')}${positionChips(base,params)}`
  +rangeMenu(base,params,'Âge',[['age_min','min','min="0" max="100"'],['age_max','max','min="0" max="100"']],{presets:[['≤ 21',{age_max:21}],['≤ 23',{age_max:23}],['24–28',{age_min:24,age_max:28}],['≥ 29',{age_min:29}]]})
  +level('Niveau','niveau',[120,140,160])+level('Potentiel','potentiel',[160,170,180,190])
  +rangeMenu(base,params,'Valeur',[['valeur_min','min',amount],['valeur_max','max',amount]],{unit:'M€',hint:'M€'})
  +rangeMenu(base,params,'Prix min.',[['prix_max','max',amount]],{unit:'M€',hint:'M€'})
  +rangeMenu(base,params,'Salaire',[['salaire_min','min','min="0"'],['salaire_max','max','min="0"']],{unit:'€',hint:'€/mois'})
  +(recruiting?rangeMenu(base,params,'Prétentions',[['pretentions_max','max','min="0"']],{unit:'€',hint:'€/mois'}):'')
  +choiceSelect(params,'contrat','Contrat',[['libre','Agents libres'],['sous_contrat','Sous contrat']])
  +choiceSelect(params,'statut_club','Clubs',[['actif','Clubs actifs'],['dormant','Clubs dormants']])
  +(recruiting?choiceSelect(params,'interesse','Intérêt',[['oui','Joueurs intéressés'],['non','Joueurs non intéressés']]):'')
  +`${resetButton(params)}</form>`;
 // On a wide screen a row is picked, the first one by default, and previewed beside the list.
 const selected=wide&&data.items.length?(data.items.find(player=>String(player.id)===params.get('sel'))||data.items[0]).id:null;
 const list=card(`${n(data.total)} joueurs`,playerTable(data,true,sorted,order,{...options,view,pager:false,...(selected==null?{}:{select:selected})}),`<div class="card-tools">${playerViewSwitch(view,sorted,order,true,options)}${headPager(data)}</div>`);
 const side=selected==null?'':sidePanel('player',await playerPreview(selected,state));
 return toolbar+`<div class="split${side?' with-side':''}" data-fit="players" data-rows="${rows??''}">${list}${side}</div>`;
}
