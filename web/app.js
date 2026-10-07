import {worldHistoryScreen} from './world-history.js';
import {api,escape as e,number as n,date,season,kitDot,card,stat,heading,empty,toast,setNations,setCompetitions,nationName,nationFlag,sortTable,nextDirection,setToday} from './ui.js';
import {dashboard,clubsScreen,clubScreen,leagueScreen,playersScreen,playableNations} from './screens.js';
import {countryScreen} from './country.js';
import {playerScreen,playerPreview} from './player.js';
import {weeklyFromMonthly} from './salaries.js';
import {matchScreen} from './match.js';
import {europeScreen} from './europe.js';
import {honoursScreen,pickClub} from './honours.js';
import {manualScreen} from './manual.js';
import {internationalScreen} from './international.js';
import {clubSelectScreen} from './club-select.js';
import {newsScreen} from './news.js';
import {compositionIssues,lineupSubmission} from './composition.js';
import {liveScreen,liveStatus} from './live.js';
import {awayIcon,clubPreview} from './club-overview.js';
import {landing,setSteps,resetFlow,nextStep,newsStep,messageHash,openingMessage} from './flow.js';
import {rememberFilters,viewParams} from './filters.js';
import {refit} from './listing.js';

// Short tables are sorted in the browser: the choice follows the screen through the re-renders of auto mode.
const tableSorts=new Map();
const sortScope=table=>`${location.hash.split('?')[0]}|${[...main.querySelectorAll('table[data-sortable]')].indexOf(table)}`;
let renderedPath=null,state={},leagues=[],nationsLoaded=false,renderVersion=0,polling=null,submitting=false,pendingMatchRedirect=null,lastFinishedJobId=null;
// A list fitted to the window is drawn again once it has measured the rows that fit (`refitted`: that second pass is under way).
let refitted=false,previewVersion=0;
const main=document.querySelector('#main');
// Guides the user straight through a scheduled match: Continuer → Match (go compose) → Jouer (play it, then see the round's results).
// Simuler, beside Jouer on the composition screen, skips the live match and shows its report first (see flow.js).
const compositionHash=()=>`#/club/${state.controlled_club_id}/composition`;
function onCompositionScreen(){const {parts}=routeParts();return parts[0]==='club'&&Number(parts[1])===state.controlled_club_id&&parts[2]==='composition';}
// An unplayable lineup greys Jouer and Simuler out; they stay hoverable (aria-disabled, not disabled) so their tooltip tells what to fix.
function blockOn(button,issues,title=null){
 button.classList.toggle('blocked',issues.length>0);
 if(issues.length){button.setAttribute('aria-disabled','true');button.title=`Composition à corriger :\n• ${issues.join('\n• ')}`;}
 else{button.removeAttribute('aria-disabled');if(title)button.title=title;else button.removeAttribute('title');}
}
// Actualités on screen, and the message it shows.
const onNewsScreen=()=>routeParts().parts[0]==='actualites';
function shownMessage(){const {parts,params}=routeParts();return parts[0]==='actualites'&&params.has('msg')?Number(params.get('msg')):null;}
// The menu counts the messages still to read; a red count on Continuer, those awaiting an answer.
function showNews(){
 const unread=state.news?.unread||0,count=document.querySelector('#news-count');
 count.textContent=unread;count.hidden=!unread;
 const pending=state.news?.pending.length||0,todo=document.querySelector('#advance-todo');
 todo.textContent=pending;todo.hidden=!pending||Boolean(state.live_match_id)||state.awaiting_lineup!=null;
}
function updateAdvanceButton(){
 const button=document.querySelector('#advance'),simulate=document.querySelector('#simulate');
 showNews();
 // During the live match the day waits: Continuer only closes it once the final whistle has gone.
 if(state.live_match_id){
  button.innerHTML='Continuer <span>→</span>';
  button.disabled||=liveStatus()!=='finished';
  // The header is hidden during the live match: its own Continuer mirrors this one.
  document.querySelectorAll('[data-live="continuer"]').forEach(copy=>copy.disabled=button.disabled);
  blockOn(button,[]);
  simulate.hidden=true;
  return;
 }
 const jouer=state.awaiting_lineup&&onCompositionScreen();
 button.innerHTML=jouer?'Jouer <span>→</span>':state.awaiting_lineup?'Match <span>→</span>':'Continuer <span>→</span>';
 const issues=jouer?compositionIssues():[];
 blockOn(button,issues);
 blockOn(simulate,issues,'Passer directement au résultat du match');
 simulate.hidden=!jouer;
 // Everything read, the message on screen still awaits its answer: Continuer waits with it.
 if(!state.awaiting_lineup&&onNewsScreen()&&newsStep(state.news,shownMessage())?.blocked){button.disabled=true;button.title='Ce message attend votre réponse';}
}
// The server owns the auto mode (state.auto comes from /monde/etat); the page only starts and stops it.
const busyButtons=()=>{
 // `polling`, not `state.job`: the buttons follow the job the page is watching. Once its status turns "done" the next
 // command is accepted at once, even while the autosave is still written: the server queues it behind that write.
 const busy=Boolean(polling)||submitting;
 const auto=Boolean(state.auto?.running),stopping=Boolean(state.auto?.stopping);
 document.querySelectorAll('[data-command],#advance,#simulate').forEach(element=>element.disabled=busy||auto||(!state.exists&&element.id.startsWith('advance'))||Boolean(state.recovery_required&&element.id.startsWith('advance')));
 updateAdvanceButton();
 const button=document.querySelector('#autoplay');
 button.disabled=stopping||(!auto&&(busy||!state.exists||Boolean(state.recovery_required)));
 button.textContent=stopping?'⏸ Arrêt…':auto?'⏸ Pause':'▶ Auto';
 button.setAttribute('aria-pressed',String(auto));
 button.setAttribute('aria-label',auto?'Mettre en pause les journées automatiques':'Passer les journées automatiquement');
 button.title=auto?'Arrêter après le jour en cours':'Enchaîner automatiquement les prochaines journées';
};
// Each new date of the auto mode redraws the screen: the list of peers the user is browsing stays open where it was.
function reopenMenu(scroll){const menu=main.querySelector('.entity-menu');if(!menu)return;menu.open=true;menu.querySelector('.entity-menu-panel').scrollTop=scroll;}
function routeParts(){const [path,search='']=location.hash.slice(1).split('?');return {parts:(path||'/').split('/').filter(Boolean),params:new URLSearchParams(search)};}
function changeParams(values){const path=location.hash.split('?')[0]||'#/';location.hash=`${path}?${new URLSearchParams(values)}`;}
// The controlled club's next three matches, left of Continuer: days to go, opponent (plane if away), competition (cups in blue).
const daysBetween=(from,to)=>Math.round((new Date(`${to}T12:00:00`)-new Date(`${from}T12:00:00`))/864e5);
function nextMatchesHtml(){
 const club=state.controlled_club_id;
 return (state.club_next_matches||[]).map(match=>{
  const home=match.home.id===club,opponent=home?match.away:match.home,days=daysBetween(state.date,match.date);
  return `<a class="next-match" href="#/match/${match.id}" title="${e(`${date(match.date)} · ${match.competition} · ${home?'Domicile':'Extérieur'}`)}"><span class="next-match-when">${days<=0?'Auj.':`J-${days}`}</span><span class="next-match-body"><span class="next-match-who">${kitDot(opponent)}<b>${e(opponent.name)}</b>${home?'':awayIcon}</span><span class="next-match-comp${match.league?'':' cup'}">${e(match.competition)}</span></span></a>`;
 }).join('');
}
async function refreshState(){state=await api('/monde/etat');document.body.classList.toggle('live-mode',Boolean(state.live_match_id));document.querySelector('#season-label').textContent=state.exists?`SAISON ${season(state.season)}`:'VOTRE UNIVERS FOOTBALL';document.querySelector('#game-date').textContent=state.exists&&!state.recovery_required?date(state.date,true):'Bienvenue sur le banc de touche';document.querySelector('#market-badge').textContent=state.market?'Mercato ouvert':'';setToday(state.date);const own=document.querySelector('#own-club'),mine=state.exists&&!state.recovery_required?state.controlled_club:null;own.hidden=!mine;if(mine){own.href=`#/club/${mine.id}`;own.innerHTML=`<span>${kitDot(mine)}</span>${e(mine.name)}`;}document.querySelector('#next-matches').innerHTML=state.exists&&!state.recovery_required?nextMatchesHtml():'';if(state.exists&&!state.recovery_required){leagues=await api('/competitions');setCompetitions(leagues);if(!nationsLoaded){setNations(await api('/nations'));nationsLoaded=true;}const activeNations=playableNations(leagues);document.querySelector('#leagues-nav').innerHTML=activeNations.map(nation=>`<a href="#/country/${nation}" data-nav="country-${nation}"><span>${nationFlag(nation)}</span>${e(nationName(nation))}</a>`).join('');}busyButtons();if(state.job)pollJob(state.job);}

function slotsHtml(slots){return slots.length?slots.map(slot=>`<div class="slot-row"><div><strong>${e(slot.slot==='autosave'?'Sauvegarde automatique':slot.slot)}</strong><small>${new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(slot.modified*1000))} · ${n(slot.bytes/1024/1024)} Mo</small></div><div class="slot-actions"><button data-command="load" data-slot="${e(slot.slot)}">Reprendre →</button><button class="danger" data-command="delete" data-slot="${e(slot.slot)}" aria-label="Supprimer ${e(slot.slot==='autosave'?'la sauvegarde automatique':slot.slot)}">Supprimer</button></div></div>`).join(''):empty('Vos sauvegardes apparaîtront ici.','Aucune partie enregistrée');}
async function confirmDialog({eyebrow,title,text,confirmLabel='Confirmer',danger=false}){
 const dialog=document.querySelector('#confirm-dialog');
 dialog.querySelector('#confirm-eyebrow').textContent=eyebrow;
 dialog.querySelector('#confirm-title').textContent=title;
 dialog.querySelector('#confirm-text').textContent=text;
 const button=dialog.querySelector('#confirm-button');
 button.textContent=confirmLabel;
 button.classList.toggle('danger',danger);
 button.classList.toggle('primary',!danger);
 dialog.showModal();
 return new Promise(resolve=>dialog.querySelector('form').addEventListener('submit',event=>resolve(event.submitter?.value==='confirm'),{once:true}));
}
async function deleteSlot(slot){
 const label=slot==='autosave'?'la sauvegarde automatique':`« ${slot} »`;
 const confirmed=await confirmDialog({eyebrow:'SUPPRESSION',title:'Supprimer cette sauvegarde ?',text:`${label} sera définitivement supprimée. Cette action est irréversible.`,confirmLabel:'Supprimer',danger:true});
 if(!confirmed)return;
 submitting=true;busyButtons();
 try{await api('/partie/supprimer',{slot});toast('Sauvegarde supprimée.');}
 catch(error){toast(error.message,true);}
 finally{submitting=false;await render();}
}
// Synchronous, lock-guarded game actions (club choice, lineup, contracts, offers): a plain POST, not a queued job.
async function action(path,payload,success){
 if(polling||submitting)return false;
 submitting=true;busyButtons();
 try{await api(path,{...payload,commande_id:crypto.randomUUID()});if(success)toast(success);return true;}
 catch(error){toast(error.message,true);return false;}
 finally{submitting=false;await render();}
}
// Talks answer at once: the dialog comes back with the counter-offer until an agreement or a break-off.
async function negotiate(kind,payload){
 if(polling||submitting)return;
 submitting=true;busyButtons();
 let reply=null;
 try{
  reply=await api(`/partie/negociation/${kind}`,{...payload,commande_id:crypto.randomUUID()});
  if(reply.resultat==='accepte')toast(kind==='salaire'?'Contrat accepté.':'Offre acceptée par le club.');
  else if(reply.resultat==='rompu')toast('Les discussions sont rompues.',true);
 }
 catch(error){toast(error.message,true);}
 finally{submitting=false;await render();}
 if(reply?.resultat==='contre_offre')main.querySelector('#talks-dialog')?.showModal();
}
// An own player goes on the transfer list, or is offered to every club: their offers come back at once in a dialog.
async function sell(kind,payload){
 if(polling||submitting)return;
 submitting=true;busyButtons();
 let reply=null;
 try{
  reply=await api(kind==='liste'?'/partie/liste-transferts':'/partie/proposer-aux-clubs',{...payload,commande_id:crypto.randomUUID()});
  toast(kind==='liste'?'Joueur placé sur la liste des transferts.':reply.proposees?`${reply.proposees} club${reply.proposees>1?'s':''} intéressé${reply.proposees>1?'s':''}.`:'Aucun club intéressé.');
 }
 catch(error){toast(error.message,true);}
 finally{submitting=false;await render();}
 if(reply?.proposees)main.querySelector('#offers-dialog')?.showModal();
}
// The club names its own price for an offer: the buyer takes it and the player is sold, or takes it as a refusal.
async function counterOffer(payload){
 if(polling||submitting)return;
 submitting=true;busyButtons();
 try{const reply=await api('/partie/reponse-offre',{...payload,decision:'contre',commande_id:crypto.randomUUID()});toast(reply.vendu?'Transfert conclu à votre prix.':'Contre-proposition refusée.',!reply.vendu);}
 catch(error){toast(error.message,true);}
 finally{submitting=false;await render();}
}
async function savesScreen(welcome=false){const slots=await api('/partie/slots');const intro=welcome?`<section class="hero"><div><span class="eyebrow">BIENVENUE SUR LE BANC DE TOUCHE</span><h1>Tout un monde de football.<br>À votre rythme.</h1><p>96 clubs, cinq championnats et des milliers de destins. Créez votre univers et suivez son histoire, saison après saison.</p></div><div class="hero-graphic" aria-hidden="true"></div></section>`:heading('Ma partie');let report='';if(state.exists&&!state.recovery_required){const data=await api('/partie/rapport-import');report=card('Rapport de création',`<div class="card-body"><div class="stat-grid">${stat('Joueurs retenus',n(data.counts.players))}${stat('Joueurs écartés',n(data.counts.excluded))}${stat('Joueurs actifs',n(data.counts.active_players))}${stat('Agents libres',n(data.counts.free_agents))}</div><p class="note">Au maximum ${data.max_squad} joueurs par club, dont deux places réservées aux meilleurs gardiens disponibles. Les CSV originaux restent inchangés. ${data.counts.attributes_from_source?'Les attributs et aptitudes proviennent du CSV. Les finances restent estimées.':'Cette ancienne partie utilise des attributs estimés.'}</p><details><summary>Détail des corrections à l’import</summary><pre>${e(JSON.stringify(data.counts,null,2))}</pre></details></div>`);}
return `<div class="${welcome?'welcome':''}">${intro}${state.recovery_required?'<div class="notice">La simulation a été interrompue. Chargez une sauvegarde pour reprendre un état cohérent.</div>':''}<div class="grid equal">${card('Nouvelle partie',`<div class="card-body"><span class="eyebrow">SAISON INITIALE · 2025 / 2026</span><p>Chaque graine crée une simulation reproductible. Tous les clubs sont pilotés par l’IA.</p><form id="new-game"><label for="seed">Graine de la simulation</label><input id="seed" name="seed" type="number" min="0" max="9007199254740991" value="2025" required><div class="actions"><button class="primary" data-command="create">Créer mon univers →</button></div></form></div>`)}${card(welcome?'Reprendre une partie':'Mes sauvegardes',`<div class="card-body">${state.exists&&!state.recovery_required?`<form id="save-game" class="filters"><input name="slot" aria-label="Nom de la sauvegarde" placeholder="Nom de la sauvegarde" required pattern="[A-Za-z0-9_\\-]{1,64}" value="ma-partie"><button data-command="save">Enregistrer</button></form>`:''}${slotsHtml(slots)}</div>`)}</div>${report}</div>`;}

async function render(){const version=++renderVersion;const hash=rememberFilters(location.hash);if(hash!==location.hash)history.replaceState(history.state,'',hash);const {parts,params}=routeParts();
 // The address of the screen Actualités took the place of.
 if(parts[0]==='mon-club'){location.hash='#/actualites';return;}
 if(!main.innerHTML||main.querySelector('.loading'))main.innerHTML='<div class="loading">Chargement…</div>';
 const active=document.activeElement;
 const focusName=active&&main.contains(active)&&active.matches('[data-filter] input,[data-filter] select')?active.name:null;
 const selection=focusName&&active.type!=='number'&&active.selectionStart!=null?[active.selectionStart,active.selectionEnd]:null;
 try{await refreshState();let html;const [screen,id,section,extra]=parts;
  // The manual needs no game: it opens from the welcome screen too, though never over a live match.
  if(screen==='aide'&&!state.live_match_id)html=await manualScreen(id);
  else if(!state.exists||state.recovery_required)html=await savesScreen(true);else{
  if(state.controlled_club_id==null&&screen!=='saves')html=await clubSelectScreen(params);
  // The live match is modal: whatever the address, it stays on screen until the day is closed.
  else if(state.live_match_id)html=await liveScreen();
  else switch(screen){case 'international':html=await internationalScreen(id,section,extra,params);break;case 'europe':html=await europeScreen(id,section,params,leagues);break;case 'honours':html=await honoursScreen(params);break;case 'clubs':html=await clubsScreen(params,leagues);break;case 'club':html=await clubScreen(id,section,params);break;case 'league':html=await leagueScreen(id,section,params,leagues);break;case 'country':html=await countryScreen(id,leagues,params,state.controlled_club_id);break;case 'transfers':html=await worldHistoryScreen(id,params,leagues,state);break;case 'players':html=await playersScreen(params);break;case 'player':html=await playerScreen(id);break;case 'match':html=await matchScreen(id);break;case 'saves':html=await savesScreen();break;case 'actualites':html=await newsScreen(await openMessage(params));break;default:html=await dashboard(leagues);}}
 if(version!==renderVersion)return;const openMenu=main.querySelector('.entity-menu[open] .entity-menu-panel'),menuScroll=openMenu?.scrollTop;const path=location.hash.split('?')[0],moved=path!==renderedPath,folds=path===renderedPath?[...main.querySelectorAll('details.filters,details.filter-menu')].map(details=>details.open):[];renderedPath=path;main.innerHTML=html;main.querySelectorAll('details.filters,details.filter-menu').forEach((details,index)=>{if(index<folds.length)details.open=folds[index];});if(openMenu)reopenMenu(menuScroll);main.querySelectorAll('table[data-sortable]').forEach(table=>{const sort=tableSorts.get(sortScope(table));if(sort&&sort.column<table.tHead.rows[0].cells.length)sortTable(table,sort.column,sort.direction);});const navKey=parts[0]==='league'?(leagues.find(item=>item.id===Number(parts[1]))?.kind==='europe'?'europe':`country-${leagues.find(item=>item.id===Number(parts[1]))?.nation}`):parts[0]==='country'?`country-${parts[1]}`:parts[0]==='club'?(Number(parts[1])===state.controlled_club_id?'own-club':'clubs'):parts[0]==='player'?'players':parts[0]||'home';document.querySelectorAll('[data-nav]').forEach(link=>link.classList.toggle('active',link.dataset.nav===navKey));busyButtons();
 // The message opened stays in sight in the feed, which scrolls by itself.
 if(parts[0]==='actualites')main.querySelector('.news-row.selected')?.scrollIntoView({block:'nearest'});
 // A chapter of the manual opened on one of its sections; a redraw of the same address leaves the scroll where it is.
 if(moved&&parts[0]==='aide'&&parts[2])document.getElementById(`manual-${parts[2]}`)?.scrollIntoView();
 document.title=`${main.querySelector('h1')?.textContent||'Touchline'} · Football Manager Light`;
 if(focusName){const next=main.querySelector(`[data-filter] [name="${focusName}"]`);if(next){next.focus();if(selection)next.setSelectionRange(...selection);}}
 // A list fitted to the window: when the rows that fit are not those it asked for, it is drawn once more with the right count.
 const list=main.querySelector('[data-fit]');
 if(list&&refit(list)&&!refitted){refitted=true;return render();}
 refitted=false;
 }catch(error){if(version!==renderVersion)return;main.innerHTML=card('Impossible d’afficher cette page',empty(error.message,'Une erreur est survenue'))+`<button id="retry">Réessayer</button>`;toast(error.message,true);}}

// Actualités opens on a message (`msg` in the address): the one asked for, else the next one to read, else one awaiting an
// answer, else the latest. Opening it marks it as read, and the menu and Continuer follow at once.
async function openMessage(params){
 // An address kept from another game may name a message this one does not have.
 if(!params.has('msg')||!(Number(params.get('msg'))<state.news_count)){
  params.delete('msg');
  const first=openingMessage(state.news,state.news_count);
  if(first==null)return params;
  params.set('msg',first);
  history.replaceState(history.state,'',`#/actualites?${params}`);
 }
 try{state.news=(await api('/partie/actualites-lues',{ids:[Number(params.get('msg'))]})).news;}catch{}
 return params;
}
async function command(path,payload){
 if(polling||submitting)return false;
 submitting=true;
 busyButtons();
 try{
  const body={...payload,commande_id:crypto.randomUUID()};
  let job;
  try{job=await api(path,body);}catch(error){if(error instanceof TypeError)job=await api(path,body);else throw error;}
  state.job=job.id;
  pollJob(job.id);
  return true;
 }catch(error){
  toast(error.message,true);return false;
 }
 finally{submitting=false;busyButtons();}
}
// Submits the composition being edited. Jouer then plays the day's other matches and opens the live match;
// Simuler plays the day out at once and shows the match report (pollJob redirects on success).
async function submitLineup(){
 const lineup=lineupSubmission();
 if(!lineup){const issues=compositionIssues();if(issues.length)toast(`Composition à corriger : ${issues.join(' · ')}`,true);return null;}
 if(polling||submitting)return null;
 submitting=true;busyButtons();
 try{await api('/partie/composition',{...lineup,commande_id:crypto.randomUUID()});}
 catch(error){toast(error.message,true);return null;}
 finally{submitting=false;busyButtons();}
 return lineup.match_id;
}
async function playMatch(){if(await submitLineup()!=null)await command('/direct/demarrer',{});}
async function simulateMatch(){
 const matchId=await submitLineup();
 if(matchId==null)return;
 pendingMatchRedirect=matchId;
 await command('/monde/avancer',{jusqu_a:'jour'});
}
async function pollJob(id){
 // A job whose outcome was already handled is never followed again, whatever a late /monde/etat still reports.
 if(polling===id||id===lastFinishedJobId)return;
 polling=id;
 document.querySelector('#job-bar').hidden=false;
 const progress=document.querySelector('#job-progress');
 let seenDate;
 try{
  while(polling===id){
   const job=await api(`/travaux/${id}`);
   const open=job.command==='auto';
   // An auto job has no end to measure against: show an indeterminate bar instead of a percentage.
   if(open)progress.removeAttribute('value');else progress.value=job.progress;
   document.querySelector('#job-label').textContent=`${({create:'Création du monde',load:'Chargement',save:'Sauvegarde',advance:'Simulation',auto:'Simulation automatique',live_start:'Les autres matches du jour',live_finish:'Fin de la journée'})[job.command]}… ${job.date?date(job.date):''} ${open?'':Math.round(job.progress*100)+'%'}`;
   if(['done','failed','awaiting_lineup'].includes(job.status)){
    state.job=null;
    polling=null;
    lastFinishedJobId=id;
    document.querySelector('#job-bar').hidden=true;
    if(job.status==='failed'){pendingMatchRedirect=null;toast(job.error,true);}
    else if(job.status==='awaiting_lineup'){toast('Un match de votre club est programmé aujourd’hui : composez votre équipe pour poursuivre.');}
    else if(job.command==='live_start')toast('Coup d’envoi !');
    else toast(job.command==='advance'?'Le monde a avancé. Partie sauvegardée.':job.command==='auto'?'Avance automatique arrêtée. Partie sauvegardée.':job.command==='live_finish'?'Journée terminée. Partie sauvegardée.':job.command==='create'?'Votre univers est prêt.':job.command==='load'?'Partie restaurée.':'Partie sauvegardée.');
    if(job.status==='done'&&job.command==='live_start'&&location.hash!=='#/direct'){location.hash='#/direct';return;}
    if(job.status!=='failed'&&['create','load'].includes(job.command))resetFlow();
    if(job.status==='done'&&job.command==='auto')setSteps([]);
    // An advance and the end of a live match land on the round the club follows (or Actualités), then queue what Continuer shows next.
    if(job.status!=='failed'&&['advance','live_finish'].includes(job.command)){
     const {hash,steps}=landing(job,pendingMatchRedirect);
     pendingMatchRedirect=null;setSteps(steps);
     if(hash&&location.hash!==hash){location.hash=hash;return;}
    }
    await render();
    return;
   }
   // The server keeps simulating while the user browses: refresh the current screen at each new date.
   if(open&&seenDate!==undefined&&job.date!==seenDate)await render();
   seenDate=job.date;
   await new Promise(resolve=>setTimeout(resolve,700));
  }
 }catch(error){polling=null;toast('Suivi interrompu : rechargez la page pour retrouver le travail en cours.',true);}
}

document.querySelector('#autoplay').addEventListener('click',async()=>{
 if(state.auto?.running){
  try{state.auto=await api('/monde/auto/arreter',{});busyButtons();toast('Pause demandée : le jour en cours se termine.');}
  catch(error){toast(error.message,true);}
 }
 else if(state.exists&&!state.recovery_required&&!polling&&!submitting&&await command('/monde/auto/demarrer',{})){
  state.auto={running:true,stopping:false,job:state.job};busyButtons();
 }
});

document.querySelector('#advance').addEventListener('click',()=>{
 if(state.live_match_id){if(liveStatus()==='finished')command('/direct/terminer',{});return;}
 if(state.awaiting_lineup&&!onCompositionScreen()){location.hash=compositionHash();return;}
 if(state.awaiting_lineup)return playMatch();
 // Actualités on screen reads its messages first; then come the rounds still due from the last step, and from any other
 // page the messages left to read or to answer. The game advances once nothing is left.
 const path=location.hash.split('?')[0];
 const reading=onNewsScreen()?newsStep(state.news,shownMessage()):null;
 if(reading?.blocked)return;
 const next=reading?messageHash(reading.message):nextStep(path)||(onNewsScreen()?null:newsStep(state.news)?.message);
 if(typeof next==='number'){location.hash=messageHash(next);return;}
 if(next){location.hash=next;return;}
 return command('/monde/avancer',{jusqu_a:'etape'});
});
document.querySelector('#advance-todo').addEventListener('click',()=>{const first=state.news?.pending[0];if(first!=null)location.hash=messageHash(first);});
document.querySelector('#simulate').addEventListener('click',()=>{if(state.awaiting_lineup&&onCompositionScreen())simulateMatch();});
// A new filter starts again from the first page, with the same sort.
function applyFilter(form){const values={...Object.fromEntries(new FormData(form)),...Object.fromEntries(viewParams(routeParts().params))};Object.keys(values).forEach(key=>{if(!values[key])delete values[key];});changeParams(values);}
main.addEventListener('submit',async event=>{event.preventDefault();const element=event.target;const data=new FormData(element);if(element.matches('[data-filter]')){applyFilter(element);}else if(element.id==='new-game'){if(state.exists&&!(await confirmDialog({eyebrow:'NOUVEAU DÉPART',title:'Créer un nouvel univers ?',text:'La partie courante sera remplacée. Enregistrez-la dans un slot nommé pour la conserver.',confirmLabel:'Créer la partie'})))return;await command('/partie/creer',{graine:Number(data.get('seed'))});}else if(element.id==='save-game')await command('/partie/sauvegarder',{slot:data.get('slot')});
 else if(element.id==='talks-form'){
  // Accepting a counter-offer sends it as is (euros, or the weekly wage); the field is typed in M€ or €/month.
  const kind=element.dataset.kind,accepted=event.submitter?.name==='accepter',typed=Number(data.get('montant'));
  const amount=accepted?Number(event.submitter.value):kind==='salaire'?weeklyFromMonthly(typed):Math.round(typed*1e6);
  await negotiate(kind,{joueur_id:Number(data.get('joueur_id')),[kind==='salaire'?'salaire_hebdo':'indemnite']:amount});
 }
 else if(element.dataset.sale)await sell(element.dataset.sale,{joueur_id:Number(data.get('joueur_id')),indemnite:Math.round(Number(data.get('montant'))*1e6)});
 else if(element.dataset.counter)await counterOffer({offre_id:element.dataset.counter,indemnite:Math.round(Number(data.get('montant'))*1e6)});
 else if(element.dataset.loan==='preter')await action('/partie/preter',{joueur_id:Number(data.get('joueur_id')),club_id:Number(data.get('club_id')),duree:data.get('duree')},'Joueur prêté.');
 else if(element.dataset.loan==='emprunter')await action('/partie/emprunter',{joueur_id:Number(data.get('joueur_id')),duree:data.get('duree')},'Joueur emprunté.');
});
let filterTimer;
main.addEventListener('input',event=>{const field=event.target;const form=field.closest('[data-filter]');if(!form||!field.matches('input[type=search],input[type=number],input[type=text],input[type=date]'))return;clearTimeout(filterTimer);filterTimer=setTimeout(()=>applyFilter(form),400);});
main.addEventListener('change',event=>{const field=event.target;const form=field.closest('[data-filter]');if(!form||!field.matches('select,input[type=checkbox],input[type=radio]'))return;clearTimeout(filterTimer);applyFilter(form);});
main.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;if('tableSort' in button.dataset){const table=button.closest('table'),column=button.closest('th').cellIndex,direction=nextDirection(table,column);sortTable(table,column,direction);tableSorts.set(sortScope(table),{column,direction});return;}const {params}=routeParts();if('resetFilters' in button.dataset){clearTimeout(filterTimer);changeParams(viewParams(params));return;}if(button.dataset.season){params.set('saison',button.dataset.season);params.delete('page');changeParams(params);}if(button.dataset.param){if(button.dataset.paramValue)params.set(button.dataset.param,button.dataset.paramValue);else params.delete(button.dataset.param);params.delete('page');changeParams(params);}if(button.dataset.page){params.set('page',button.dataset.page);changeParams(params);}if(button.dataset.sort){params.set('ordre',button.dataset.order?(button.dataset.order==='desc'?'asc':'desc'):button.dataset.first);params.set('tri',button.dataset.sort);params.delete('page');changeParams(params);}if(button.dataset.view&&button.getAttribute('aria-pressed')!=='true'){if(button.dataset.view==='infos')params.delete('vue');else params.set('vue',button.dataset.view);if(button.dataset.viewSort){params.set('tri',button.dataset.viewSort);params.set('ordre',button.dataset.viewOrder);}else{['tri','ordre','page'].forEach(key=>params.delete(key));}changeParams(params);}if(button.dataset.command==='load')command('/partie/charger',{slot:button.dataset.slot});if(button.dataset.command==='delete')await deleteSlot(button.dataset.slot);
 if(button.dataset.command==='choisir-club')await action('/partie/choisir-club',{club_id:Number(button.dataset.club)},'Club choisi. À vous de jouer !');
 if(button.dataset.command==='renouvellement')await action('/partie/renouvellement',{joueur_id:Number(button.dataset.player),decision:button.dataset.decision},button.dataset.decision==='accepter'?'Prolongation signée.':'Prolongation refusée.');
 if(button.dataset.command==='liste-transferts')await action('/partie/liste-transferts',{joueur_id:Number(button.dataset.player),indemnite:null},'Joueur retiré de la liste des transferts.');
 if(button.dataset.command==='intransferable')await action('/partie/intransferable',{joueur_id:Number(button.dataset.player),intransferable:Boolean(button.dataset.kept)},button.dataset.kept?'Joueur déclaré intransférable.':'Joueur de nouveau transférable.');
 if(button.dataset.command==='reserve')await action('/partie/reserve',{joueur_id:Number(button.dataset.player),reserve:Boolean(button.dataset.reserve)},button.dataset.reserve?'Joueur envoyé en réserve.':'Joueur rappelé en équipe première.');
 if(button.dataset.command==='reponse-offre')await action('/partie/reponse-offre',{offre_id:button.dataset.offer,decision:button.dataset.decision},button.dataset.decision==='accepter'?'Transfert accepté.':'Offre refusée.');
 if(button.dataset.command==='reponse-offres')await action('/partie/reponse-offres',{joueur_id:Number(button.dataset.player),decision:button.dataset.decision},button.dataset.decision==='accepter'?'Transfert accepté.':'Offres refusées.');
 if(button.dataset.command==='prolongation')await action('/partie/prolongation',{joueur_id:Number(button.dataset.player)},'Prolongation signée.');
 if(button.dataset.command==='abandon-negociation')await action('/partie/negociation/abandon',{joueur_id:Number(button.dataset.player)},'Négociation abandonnée.');
 if(button.id==='retry')render();});
// A card head with a single link ("Voir →") follows it wherever it is clicked.
main.addEventListener('click',event=>{const head=event.target.closest('.card-head');if(!head||event.target.closest('a,button,input,select,label,form'))return;const links=head.querySelectorAll(':scope>a[href]');if(links.length===1)links[0].click();});
// Player actions open in a dialog kept inside the page, so each re-render closes it.
main.addEventListener('click',event=>{const opener=event.target.closest('[data-open-dialog]');if(opener){main.querySelector(`#${opener.dataset.openDialog}`)?.showModal();return;}const closer=event.target.closest('[data-close-dialog]');if(closer)closer.closest('dialog')?.close();});
// Actualités: Tout lire marks the whole feed as read.
main.addEventListener('click',async event=>{
 if(!event.target.closest('[data-news-read]'))return;
 try{await api('/partie/actualites-lues',{ids:null});}catch(error){toast(error.message,true);}
 await render();
});
// The list of peers in a page header closes on a click elsewhere, on a choice and on Escape; opening it centres the current entry.
// So does the menu of a filter, which also closes when another one opens.
document.addEventListener('click',event=>document.querySelectorAll('.entity-menu[open],.filter-menu[open]').forEach(menu=>{if(!menu.contains(event.target)||event.target.closest('.entity-menu-panel a,.filter-menu a'))menu.removeAttribute('open');}));
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const menu=document.querySelector('.entity-menu[open],.filter-menu[open]');if(menu){menu.removeAttribute('open');menu.querySelector('summary').focus();}});
main.addEventListener('toggle',event=>{const menu=event.target;if(!menu.matches?.('.filter-menu')||!menu.open)return;main.querySelectorAll('.filter-menu[open]').forEach(other=>{if(other!==menu)other.removeAttribute('open');});if(!menu.contains(document.activeElement))menu.querySelector('input')?.focus();},true);
// A row picked in a list refreshes the preview beside it, without drawing the list again; the address keeps the row for the
// next redraw. The arrows step through the rows, Enter opens the page of the picked one.
async function pickRow(row){
 const side=main.querySelector('[data-preview]');
 if(!side||row.classList.contains('selected'))return;
 row.parentElement.querySelectorAll('tr.selected').forEach(other=>other.classList.remove('selected'));
 row.classList.add('selected');
 const {params}=routeParts();params.set('sel',row.dataset.select);
 history.replaceState(history.state,'',`${location.hash.split('?')[0]}?${params}`);
 const pick=++previewVersion,version=renderVersion;
 try{
  const html=side.dataset.preview==='club'?await clubPreview(row.dataset.select):await playerPreview(row.dataset.select,state);
  if(pick===previewVersion&&version===renderVersion&&side.isConnected)side.querySelector('.side-inner').innerHTML=html;
 }catch(error){toast(error.message,true);}
}
main.addEventListener('click',event=>{const row=event.target.closest('tr[data-select]');if(row&&!event.target.closest('a,button'))pickRow(row);});
document.addEventListener('keydown',event=>{
 if(!['ArrowDown','ArrowUp','Enter'].includes(event.key)||event.target.closest?.('input,select,textarea,button,summary,dialog,a'))return;
 const row=main.querySelector('tr.selected[data-select]');if(!row)return;
 if(event.key==='Enter'){row.querySelector('.strong a')?.click();return;}
 const next=event.key==='ArrowDown'?row.nextElementSibling:row.previousElementSibling;
 if(next){event.preventDefault();next.scrollIntoView({block:'nearest'});pickRow(next);}
});
// Palmarès: a club picked in the list of titled clubs or in the table of the seasons lights its titles up, without drawing
// the page again; the address keeps it for the next redraw.
main.addEventListener('click',event=>{
 const marked=event.target.closest('[data-honours-club]');if(!marked||event.target.closest('a,button'))return;
 const {params}=routeParts(),picked=pickClub(main,marked.dataset.honoursClub);
 if(picked)params.set('sel',picked);else params.delete('sel');
 history.replaceState(history.state,'',`${location.hash.split('?')[0]}${params.size?`?${params}`:''}`);
});
// A new window size changes the rows that fit and whether the side panel has room.
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(main.querySelector('[data-fit]'))render();},250);});
main.addEventListener('toggle',event=>{const menu=event.target;if(!menu.matches?.('.entity-menu')||!menu.open)return;const panel=menu.querySelector('.entity-menu-panel'),current=panel.querySelector('[aria-current]');if(current&&!panel.scrollTop)panel.scrollTop=current.offsetTop-(panel.clientHeight-current.offsetHeight)/2;},true);
// A new page opens at the top; a new sort, filter or page of the same list keeps the scroll where it was.
window.addEventListener('hashchange',event=>{const path=url=>new URL(url).hash.split('?')[0];render();if(path(event.oldURL)!==path(event.newURL))window.scrollTo({top:0});});
document.addEventListener('lineup-change',updateAdvanceButton);
document.addEventListener('live-status',busyButtons);
window.addEventListener('unhandledrejection',event=>toast(event.reason?.message||'Une erreur inattendue est survenue.',true));
render();
