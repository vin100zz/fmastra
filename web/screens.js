import {monthlyAmount,salarySearchParams} from './salaries.js';
import {cupScreen} from './cups.js';
import {europeScreen} from './europe.js';
import {movementsHistory,seasonsHistory} from './club-history.js';
import {clubPreview,marketBlock,squadWidgets} from './club-overview.js';
import {clubHero} from './club-hero.js';
import {calendarContent} from './club-calendar.js';
import {financesContent} from './club-finances.js';
import {playerPreview} from './player.js';
import {resetButton} from './filters.js';
import {wideScreen,fittedRows,sidePanel,searchField,positionChips,nationChips,choiceLinks,rangeMenu,choiceSelect} from './listing.js';
import {compositionContent} from './composition.js';
import {clubNavigation,competitionNavigation} from './navigation.js';
import {ROUND_TABS,isRoundTab,roundPath,roundContent} from './rounds.js';
import {api,date,titlesCard,countTitles,escape as e,number as n,averageNote,money,headPager,figure,miniBar,scoreBadge,leadersCards,season,clubLink,playerLink,position,form,empty,card,stat,heading,tabs,table,sortableTable,pager,playerTable,playerViewSwitch,standingsTable,roundTitle,seasonArchives,fixtures,query,nationBadge,nationFlag,nationName,sortButton,levelBadge} from './ui.js';

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
 return `<section class="card"><div class="card-head"><h2>${nationFlag(league.nation)}${e(league.name)}</h2><a href="#/league/${league.id}">Voir le championnat →</a></div>${content}</section>`;
}

async function leagueSummariesSection(ordered){
 const summaries=await Promise.all(ordered.map(league=>leagueSummary(league.id)));
 return `<div class="league-summaries">${ordered.map((league,index)=>leagueSummaryCard(league,summaries[index])).join('')}</div>`;
}

export async function dashboard(leagues){
 const ordered=leagues.filter(league=>league.level===1).sort((a,b)=>LEAGUE_ORDER.indexOf(a.nation)-LEAGUE_ORDER.indexOf(b.nation));
 return heading('Vue d’ensemble')+await leagueSummariesSection(ordered);
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

// The squad in two lists: the first team, then the reserve, where the players the club has lent stand too. The user's club
// moves a player from one to the other with the button closing his row.
function squadCards(data,params,human){
 const view=params.get('vue'),sorted=params.get('tri')||'position',order=params.get('ordre')||'asc';
 const apart=player=>player.reserve||player.away,first=data.items.filter(player=>!apart(player)),second=data.items.filter(apart);
 const move=player=>player.loan?'':`<button type="button" class="row-action" data-command="reserve" data-player="${player.id}" data-reserve="${player.reserve?'':'1'}" title="${player.reserve?'Rappeler en équipe première':'Envoyer en réserve'}" aria-label="${player.reserve?'Rappeler en équipe première':'Envoyer en réserve'}">${player.reserve?'↑':'↓'}</button>`;
 const list=items=>playerTable({items},false,sorted,order,{view,pager:false,...(human?{action:move}:{})});
 const count=(items,one,many)=>`${items.length} ${items.length>1?many:one}`;
 const lent=second.filter(player=>player.away),kept=second.filter(player=>!player.away);
 const tools=`<div class="card-tools">${playerViewSwitch(view,sorted,order)}</div>`;
 const reserve=second.length?card(`Réserve · ${count(kept,'joueur','joueurs')}${lent.length?` · ${count(lent,'prêté','prêtés')}`:''}`,list(second)):human?card('Réserve · 0 joueur',''):'';
 return card(`Équipe première · ${count(first,'joueur','joueurs')}`,list(first),tools)+reserve;
}

// A club page: its header in its colours with the tabs, then the open tab. The squad stands beside the club's widgets.
export async function clubScreen(id,section,params){
 const [club,neighbours,state]=await Promise.all([api(`/clubs/${id}`),api(`/clubs/${id}/navigation`),api('/monde/etat')]); section=section||'squad';
 // The club run by the user also gets its lineup form.
 const human=state.controlled_club_id===club.id;
 const menu=[['squad','Effectif'],...(human?[['composition','Composition']]:[]),['calendar','Calendrier'],['finances','Finances'],['transfers','Transferts'],['history','Historique']];
 const lead=clubNavigation(neighbours,section,section==='squad'&&params.get('vue')?query({vue:params.get('vue')}):'');
 let content='';
 if(section==='squad'){
  const [data,overview,standings]=await Promise.all([api(`/clubs/${id}/effectif?${params}`),api(`/clubs/${id}/apercu`),club.competition_id?api(`/competitions/${club.competition_id}/classement`):null]);
  content=`<div class="club-squad-layout"><div class="club-squad">${squadCards(data,params,human)}</div>${squadWidgets(club,overview,standings)}</div>`;
 }
 else if(section==='composition'&&human)content=await compositionContent(params,state);
 else if(section==='calendar')content=calendarContent(club,await api(`/clubs/${id}/calendrier`),params);
 else if(section==='transfers'){const [data,market]=await Promise.all([api(`/clubs/${id}/transferts?${query({saison:params.get('saison')})}`),human?api('/ma-partie/transferts'):null]);content=(market?marketBlock(market,{club,market:state.market}):'')+movementsHistory(data,params);}
 else if(section==='finances'){const [data,squad]=await Promise.all([api(`/clubs/${id}/finances?${query({saison:params.get('saison')})}`),api(`/clubs/${id}/effectif`)]);content=financesContent(club,data,squad);}
 else {const data=await api(`/clubs/${id}/historique?${query({page:params.get('page')})}`);content=seasonsHistory(data,club,state.season??null);}
 return clubHero(club,{lead,menu,section})+(!club.active?'<div class="notice">Club hors championnat simulé : peut participer à la coupe nationale.</div>':'')+content;
}

export async function leagueScreen(id,section,params,leagues){
 const competition=leagues.find(item=>item.id===Number(id));
 // The European cups already switch between themselves in their own tabs.
 if(competition?.kind==='europe')return europeScreen(competition.code,section,params,leagues);
 if(!competition)throw new Error('Championnat introuvable.');
 const lead=competitionNavigation(await api(`/competitions/${id}/navigation`));
 return competition.kind==='cup'?cupScreen(competition,section,params,lead):leagueContent(competition,section,params,lead);
}

// The statistics a league's overview lists side by side, ten rows each; the whole list of one opens from the card.
const STATISTICS=[['buteurs','Meilleurs buteurs'],['passeurs','Meilleurs passeurs'],['notes','Meilleures notes'],['cartons','Cartons jaunes'],['clean_sheets','Clean sheets par club']];
const statisticRows=(data,category,start=0)=>data.items.map((row,index)=>[start+index+1,row.id?playerLink(row.id,row.name):clubLink(row.club),...(category==='clean_sheets'?[]:[clubLink(row.club)]),`<b>${category==='notes'?averageNote(row.value):n(row.value)}</b>`]);
const statisticHeaders=category=>['#',category==='clean_sheets'?'CLUB':'JOUEUR',...(category==='clean_sheets'?[]:['CLUB']),'TOTAL'];

// The standings beside the four leaders they do not show: best attack and defence, top scorer and top provider.
function leagueTiles(standings,scorers,assists){
 const clubs=standings.items,attack=[...clubs].sort((a,b)=>b.goals_for-a.goals_for)[0],defence=[...clubs].sort((a,b)=>a.goals_against-b.goals_against)[0],scorer=scorers.items[0],provider=assists.items[0];
 const club=row=>row?.club?.name||'—';
 return `<aside class="league-tiles">${attack?stat('Meilleure attaque',club(attack),`${attack.goals_for} buts`):''}${defence?stat('Meilleure défense',club(defence),`${defence.goals_against} buts encaissés`):''}${scorer?stat('Meilleur buteur',scorer.name,`${club(scorer)} · ${n(scorer.value)} buts`):''}${provider?stat('Meilleur passeur',provider.name,`${club(provider)} · ${n(provider.value)} passes`):''}</aside>`;
}

// Every round as a button, the shown one lit, with an arrow to each side.
function roundStepper(base,data){
 const link=(round,label,name,disabled)=>disabled?`<span class="round-step disabled" aria-hidden="true">${label}</span>`:`<a class="round-step" href="${base}?journee=${round}" aria-label="${name}">${label}</a>`;
 const first=data.rounds[0],last=data.rounds.at(-1);
 return `<nav class="round-stepper" aria-label="Journées">${link(data.round-1,'‹','Journée précédente',data.round<=first)}<div class="round-pills">${data.rounds.map(round=>`<a class="${round===data.round?'active':''}" href="${base}?journee=${round}" aria-label="Journée ${round}"${round===data.round?' aria-current="true"':''}>${round}</a>`).join('')}</div>${link(data.round+1,'›','Journée suivante',data.round>=last)}</nav>`;
}

async function leagueContent(league,section,params,lead){
 const id=league.id;section=section||'table';
 let content='';
 if(section==='table'){
  const [data,scorers,assists]=await Promise.all([api(`/competitions/${id}/classement?${params}`),api(`/competitions/${id}/statistiques?type=buteurs`),api(`/competitions/${id}/statistiques?type=passeurs`)]);
  content=`<div class="league-layout">${card('Classement général',standingsTable(data),'<span class="muted">3 points pour une victoire</span>')}${leagueTiles(data,scorers,assists)}</div>`;
 }
 else if(section==='calendar'){
  const [data,standings,scorers]=await Promise.all([api(`/competitions/${id}/calendrier?${params}`),api(`/competitions/${id}/classement`),api(`/competitions/${id}/statistiques?type=buteurs`)]);
  const day=data.items[0]?.date;
  const matches=data.items.length?`<div class="fixture-grid">${data.items.map(match=>`<div class="fixture-card">${fixtures({items:[match]})}</div>`).join('')}</div>`:empty('Aucun match programmé pour cette journée.');
  content=roundStepper(`#/league/${id}/calendar`,data)+`<div class="calendar-layout"><section class="calendar-matches"><h3 class="round-heading">Journée ${data.round}${day?` · ${date(day,true)}`:''}</h3>${matches}</section><div class="calendar-side">${card('Classement',standingsTable(standings,true))}${card('Buteurs',table(['#','JOUEUR','CLUB','BUTS'],scorers.items.slice(0,5).map((row,index)=>[index+1,playerLink(row.id,row.name),clubLink(row.club),`<b>${n(row.value)}</b>`])))}</div></div>`;
 }
 else if(isRoundTab(section))content=roundContent(await api(`/competitions/${id}/${roundPath(section)}`),section);
 else if(section==='stats'){
  const category=params.get('type');
  if(category){
   const data=await api(`/competitions/${id}/statistiques?${query({...Object.fromEntries(params),type:category})}`);
   content=`<form class="filters" data-filter><select name="type" aria-label="Statistique"><option value="">Toutes</option>${STATISTICS.map(([key,label])=>`<option value="${key}" ${category===key?'selected':''}>${label}</option>`).join('')}</select><button>Afficher</button></form>`+card('Les leaders',table(statisticHeaders(category),statisticRows(data,category,(data.page-1)*data.page_size))+pager(data));
  }else{
   const lists=await Promise.all(STATISTICS.map(([key])=>api(`/competitions/${id}/statistiques?type=${key}`)));
   content=`<div class="stats-boards">${STATISTICS.map(([key,label],index)=>card(label,table(statisticHeaders(key),statisticRows({items:lists[index].items.slice(0,10)},key)),`<a href="#/league/${id}/stats?type=${key}">Voir tout →</a>`)).join('')}</div>`;
  }
 }
 else{const data=await api(`/competitions/${id}/historique?${params}`);content=`<div class="history-layout three"><div class="history-main">${card('Le palmarès',table(['SAISON','CHAMPION','MEILLEUR BUTEUR','BUTS'],data.items.map(row=>[season(row.season),clubLink(row.champion),row.scorer?playerLink(row.scorer.id,row.scorer.name):'—',row.scorer?.value??'—']))+pager(data))}${titlesCard('Titres par club',countTitles(data.items,row=>row.champion?.id,row=>clubLink(row.champion)))}</div><div class="history-leaders">${leadersCards(data.leaders)}</div><div class="history-archives">${seasonArchives(data)}</div></div>`;}
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
  +rangeMenu(base,params,'Salaire',[['salaire_min','min','min="0"'],['salaire_max','max','min="0"']],{unit:'€',hint:'€'})
  +(recruiting?rangeMenu(base,params,'Prétentions',[['pretentions_max','max','min="0"']],{unit:'€',hint:'€'}):'')
  +choiceSelect(params,'contrat','Contrat',[['libre','Agents libres'],['sous_contrat','Sous contrat']])
  +choiceSelect(params,'statut_club','Clubs',[['actif','Clubs actifs'],['dormant','Clubs dormants']])
  +choiceSelect(params,'liste','Listés',[['transfert','Listés pour un transfert'],['pret','Listés pour un prêt']])
  +(recruiting?choiceSelect(params,'interesse','Intérêt',[['oui','Intéressés par un transfert'],['pret','Intéressés par un prêt'],['non','Non intéressés']]):'')
  +`${resetButton(params)}</form>`;
 // On a wide screen a row is picked, the first one by default, and previewed beside the list.
 const selected=wide&&data.items.length?(data.items.find(player=>String(player.id)===params.get('sel'))||data.items[0]).id:null;
 const list=card(`${n(data.total)} joueurs`,playerTable(data,true,sorted,order,{...options,view,pager:false,...(selected==null?{}:{select:selected})}),`<div class="card-tools">${playerViewSwitch(view,sorted,order,true,options)}${headPager(data)}</div>`);
 const side=selected==null?'':sidePanel('player',await playerPreview(selected,state));
 return toolbar+`<div class="split${side?' with-side':''}" data-fit="players" data-rows="${rows??''}">${list}${side}</div>`;
}
