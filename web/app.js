import {worldHistoryScreen} from './world-history.js';
import {api,escape as e,number as n,date,season,card,stat,heading,empty,toast,setNations,nationName,sortTable,nextDirection} from './ui.js';
import {dashboard,clubsScreen,clubScreen,leagueScreen,countryScreen,playersScreen,journalScreen,LEAGUE_ORDER} from './screens.js';
import {playerScreen} from './player.js';
import {matchScreen} from './match.js';
import {europeScreen} from './europe.js';
import {honoursScreen} from './honours.js';

// Short tables are sorted in the browser: the choice follows the screen through the re-renders of auto mode.
const tableSorts=new Map();
const sortScope=table=>`${location.hash.split('?')[0]}|${[...main.querySelectorAll('table[data-sortable]')].indexOf(table)}`;
let state={},leagues=[],nationsLoaded=false,renderVersion=0,polling=null,submitting=false;
const main=document.querySelector('#main');
// The server owns the auto mode (state.auto comes from /monde/etat); the page only starts and stops it.
const busyButtons=()=>{
 const busy=Boolean(state.job)||submitting;
 const auto=Boolean(state.auto?.running),stopping=Boolean(state.auto?.stopping);
 document.querySelectorAll('[data-command],#advance,#advance-mode').forEach(element=>element.disabled=busy||auto||(!state.exists&&element.id.startsWith('advance'))||Boolean(state.recovery_required&&element.id.startsWith('advance')));
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
async function refreshState(){state=await api('/monde/etat');document.querySelector('#season-label').textContent=state.exists?`SAISON ${season(state.season)}`:'VOTRE UNIVERS FOOTBALL';document.querySelector('#game-date').textContent=state.exists&&!state.recovery_required?date(state.date,true):'Bienvenue sur le banc de touche';document.querySelector('#market-badge').textContent=state.market?'Mercato ouvert':'';if(state.exists&&!state.recovery_required){leagues=await api('/competitions');if(!nationsLoaded){setNations(await api('/nations'));nationsLoaded=true;}const activeNations=[...new Set(leagues.filter(league=>league.kind!=='europe').map(league=>league.nation))].sort((a,b)=>LEAGUE_ORDER.indexOf(a)-LEAGUE_ORDER.indexOf(b));document.querySelector('#leagues-nav').innerHTML=activeNations.map(nation=>`<a href="#/country/${nation}" data-nav="country-${nation}"><span class="league-code">${e(nation.slice(0,2))}</span>${e(nationName(nation))}</a>`).join('');}busyButtons();if(state.job)pollJob(state.job);}

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
async function savesScreen(welcome=false){const slots=await api('/partie/slots');const intro=welcome?`<section class="hero"><div><span class="eyebrow">BIENVENUE SUR LE BANC DE TOUCHE</span><h1>Tout un monde de football.<br>À votre rythme.</h1><p>96 clubs, cinq championnats et des milliers de destins. Créez votre univers et suivez son histoire, saison après saison.</p></div><div class="hero-graphic" aria-hidden="true"></div></section>`:heading('Ma partie');let report='';if(state.exists&&!state.recovery_required){const data=await api('/partie/rapport-import');report=card('Rapport de création',`<div class="card-body"><div class="stat-grid">${stat('Joueurs retenus',n(data.counts.players))}${stat('Joueurs écartés',n(data.counts.excluded))}${stat('Joueurs actifs',n(data.counts.active_players))}${stat('Agents libres',n(data.counts.free_agents))}</div><p class="note">Au maximum ${data.max_squad} joueurs par club, dont deux places réservées aux meilleurs gardiens disponibles. Les CSV originaux restent inchangés. ${data.counts.attributes_from_source?'Les attributs et aptitudes proviennent du CSV. Les finances restent estimées.':'Cette ancienne partie utilise des attributs estimés.'}</p><details><summary>Détail des corrections à l’import</summary><pre>${e(JSON.stringify(data.counts,null,2))}</pre></details></div>`);}
return `<div class="${welcome?'welcome':''}">${intro}${state.recovery_required?'<div class="notice">La simulation a été interrompue. Chargez une sauvegarde pour reprendre un état cohérent.</div>':''}<div class="grid equal">${card('Nouvelle partie',`<div class="card-body"><span class="eyebrow">SAISON INITIALE · 2025 / 2026</span><p>Chaque graine crée une simulation reproductible. Tous les clubs sont pilotés par l’IA.</p><form id="new-game"><label for="seed">Graine de la simulation</label><input id="seed" name="seed" type="number" min="0" max="9007199254740991" value="2025" required><div class="actions"><button class="primary" data-command="create">Créer mon univers →</button></div></form></div>`)}${card(welcome?'Reprendre une partie':'Mes sauvegardes',`<div class="card-body">${state.exists&&!state.recovery_required?`<form id="save-game" class="filters"><input name="slot" aria-label="Nom de la sauvegarde" placeholder="Nom de la sauvegarde" required pattern="[A-Za-z0-9_\\-]{1,64}" value="ma-partie"><button data-command="save">Enregistrer</button></form>`:''}${slotsHtml(slots)}</div>`)}</div>${report}</div>`;}

async function render(){const version=++renderVersion;const {parts,params}=routeParts();if(!main.innerHTML||main.querySelector('.loading'))main.innerHTML='<div class="loading">Chargement…</div>';
 const active=document.activeElement;
 const focusName=active&&main.contains(active)&&active.matches('[data-filter] input,[data-filter] select')?active.name:null;
 const selection=focusName&&'selectionStart' in active?[active.selectionStart,active.selectionEnd]:null;
 try{await refreshState();let html;if(!state.exists||state.recovery_required)html=await savesScreen(true);else{const [screen,id,section]=parts;switch(screen){case 'europe':html=await europeScreen(id,section,params,leagues);break;case 'honours':html=await honoursScreen();break;case 'clubs':html=await clubsScreen(params);break;case 'club':html=await clubScreen(id,section,params);break;case 'league':html=await leagueScreen(id,section,params,leagues);break;case 'country':html=await countryScreen(id,leagues);break;case 'transfers':html=await worldHistoryScreen(id,params);break;case 'players':html=await playersScreen(params);break;case 'player':html=await playerScreen(id);break;case 'match':html=await matchScreen(id,section);break;case 'saves':html=await savesScreen();break;case 'journal':html=await journalScreen(params);break;default:html=await dashboard(leagues);}}
 if(version!==renderVersion)return;const openMenu=main.querySelector('.entity-menu[open] .entity-menu-panel'),menuScroll=openMenu?.scrollTop;main.innerHTML=html;if(openMenu)reopenMenu(menuScroll);main.querySelectorAll('table[data-sortable]').forEach(table=>{const sort=tableSorts.get(sortScope(table));if(sort&&sort.column<table.tHead.rows[0].cells.length)sortTable(table,sort.column,sort.direction);});const navKey=parts[0]==='league'?(leagues.find(item=>item.id===Number(parts[1]))?.kind==='europe'?'europe':`country-${leagues.find(item=>item.id===Number(parts[1]))?.nation}`):parts[0]==='country'?`country-${parts[1]}`:parts[0]==='club'?'clubs':parts[0]==='player'?'players':parts[0]==='journal'?'home':parts[0]||'home';document.querySelectorAll('[data-nav]').forEach(link=>link.classList.toggle('active',link.dataset.nav===navKey));busyButtons();document.title=`${main.querySelector('h1')?.textContent||'Touchline'} · Football Manager Light`;
 if(focusName){const next=main.querySelector(`[data-filter] [name="${focusName}"]`);if(next){next.focus();if(selection)next.setSelectionRange(...selection);}}
 }catch(error){if(version!==renderVersion)return;main.innerHTML=card('Impossible d’afficher cette page',empty(error.message,'Une erreur est survenue'))+`<button id="retry">Réessayer</button>`;toast(error.message,true);}}

async function command(path,payload){
 if(state.job||submitting)return false;
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
async function pollJob(id){
 if(polling===id)return;
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
   document.querySelector('#job-label').textContent=`${({create:'Création du monde',load:'Chargement',save:'Sauvegarde',advance:'Simulation',auto:'Simulation automatique'})[job.command]}… ${job.date?date(job.date):''} ${open?'':Math.round(job.progress*100)+'%'}`;
   if(['done','failed'].includes(job.status)){
    state.job=null;
    polling=null;
    document.querySelector('#job-bar').hidden=true;
    if(job.status==='failed')toast(job.error,true);
    else toast(job.command==='advance'?'Le monde a avancé. Partie sauvegardée.':job.command==='auto'?'Avance automatique arrêtée. Partie sauvegardée.':job.command==='create'?'Votre univers est prêt.':job.command==='load'?'Partie restaurée.':'Partie sauvegardée.');
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
 else if(state.exists&&!state.recovery_required&&!state.job&&!submitting&&await command('/monde/auto/demarrer',{})){
  state.auto={running:true,stopping:false,job:state.job};busyButtons();
 }
});

document.querySelector('#advance').addEventListener('click',()=>command('/monde/avancer',{jusqu_a:document.querySelector('#advance-mode').value}));
function applyFilter(form){const values=Object.fromEntries(new FormData(form));Object.keys(values).forEach(key=>{if(!values[key])delete values[key];});changeParams(values);}
main.addEventListener('submit',async event=>{event.preventDefault();const element=event.target;const data=new FormData(element);if(element.matches('[data-filter]')){applyFilter(element);}else if(element.id==='new-game'){if(state.exists&&!(await confirmDialog({eyebrow:'NOUVEAU DÉPART',title:'Créer un nouvel univers ?',text:'La partie courante sera remplacée. Enregistrez-la dans un slot nommé pour la conserver.',confirmLabel:'Créer la partie'})))return;await command('/partie/creer',{graine:Number(data.get('seed'))});}else if(element.id==='save-game')await command('/partie/sauvegarder',{slot:data.get('slot')});});
let filterTimer;
main.addEventListener('input',event=>{const field=event.target;const form=field.closest('[data-filter]');if(!form||!field.matches('input[type=search],input[type=number],input[type=text],input[type=date]'))return;clearTimeout(filterTimer);filterTimer=setTimeout(()=>applyFilter(form),400);});
main.addEventListener('change',event=>{const field=event.target;const form=field.closest('[data-filter]');if(!form||!field.matches('select,input[type=checkbox],input[type=radio]'))return;clearTimeout(filterTimer);applyFilter(form);});
main.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;if('tableSort' in button.dataset){const table=button.closest('table'),column=button.closest('th').cellIndex,direction=nextDirection(table,column);sortTable(table,column,direction);tableSorts.set(sortScope(table),{column,direction});return;}const {params}=routeParts();if(button.dataset.season){params.set('saison',button.dataset.season);params.delete('page');changeParams(params);}if(button.dataset.page){params.set('page',button.dataset.page);changeParams(params);}if(button.dataset.sort){params.set('ordre',button.dataset.order?(button.dataset.order==='desc'?'asc':'desc'):button.dataset.first);params.set('tri',button.dataset.sort);params.delete('page');changeParams(params);}if(button.dataset.command==='load')command('/partie/charger',{slot:button.dataset.slot});if(button.dataset.command==='delete')await deleteSlot(button.dataset.slot);if(button.id==='retry')render();});
// The list of peers in a page header closes on a click elsewhere, on a choice and on Escape; opening it centres the current entry.
document.addEventListener('click',event=>document.querySelectorAll('.entity-menu[open]').forEach(menu=>{if(!menu.contains(event.target)||event.target.closest('.entity-menu-panel a'))menu.removeAttribute('open');}));
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const menu=document.querySelector('.entity-menu[open]');if(menu){menu.removeAttribute('open');menu.querySelector('summary').focus();}});
main.addEventListener('toggle',event=>{const menu=event.target;if(!menu.matches?.('.entity-menu')||!menu.open)return;const panel=menu.querySelector('.entity-menu-panel'),current=panel.querySelector('[aria-current]');if(current&&!panel.scrollTop)panel.scrollTop=current.offsetTop-(panel.clientHeight-current.offsetHeight)/2;},true);
window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0});});
window.addEventListener('unhandledrejection',event=>toast(event.reason?.message||'Une erreur inattendue est survenue.',true));
render();
