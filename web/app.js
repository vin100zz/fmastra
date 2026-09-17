import {worldHistoryScreen} from './world-history.js';
import {api,escape as e,number as n,date,season,card,stat,heading,empty,toast} from './ui.js';
import {dashboard,clubsScreen,clubScreen,leagueScreen,playersScreen,playerScreen,journalScreen} from './screens.js';
import {matchScreen} from './match.js';
import {createAutoAdvance} from './auto-advance.js';

let state={},leagues=[],renderVersion=0,polling=null,submitting=false;
const main=document.querySelector('#main');
const autoplay=createAutoAdvance({advance:()=>command('/monde/avancer',{jusqu_a:'journee'},true),onChange:()=>busyButtons()});
const busyButtons=()=>{
 const busy=Boolean(state.job)||submitting;
 document.querySelectorAll('[data-command],#advance,#advance-mode').forEach(element=>element.disabled=busy||autoplay.playing||(!state.exists&&element.id.startsWith('advance'))||Boolean(state.recovery_required&&element.id.startsWith('advance')));
 const button=document.querySelector('#autoplay');
 button.disabled=!autoplay.playing&&(busy||!state.exists||Boolean(state.recovery_required));
 button.textContent=autoplay.playing?'⏸ Pause':'▶ Auto';
 button.setAttribute('aria-pressed',String(autoplay.playing));
 button.setAttribute('aria-label',autoplay.playing?'Mettre en pause les journées automatiques':'Passer les journées automatiquement');
 button.title=autoplay.playing?'Arrêter après la journée en cours':'Enchaîner automatiquement les prochaines journées';
};
function routeParts(){const [path,search='']=location.hash.slice(1).split('?');return {parts:(path||'/').split('/').filter(Boolean),params:new URLSearchParams(search)};}
function changeParams(values){const path=location.hash.split('?')[0]||'#/';location.hash=`${path}?${new URLSearchParams(values)}`;}
async function refreshState(){state=await api('/monde/etat');document.querySelector('#season-label').textContent=state.exists?`SAISON ${season(state.season)} · MODE OBSERVATEUR`:'VOTRE UNIVERS FOOTBALL';document.querySelector('#game-date').textContent=state.exists&&!state.recovery_required?date(state.date,true):'Bienvenue sur le banc de touche';document.querySelector('#market-badge').textContent=state.market?'Mercato ouvert':'';if(state.exists&&!state.recovery_required){leagues=await api('/competitions');document.querySelector('#leagues-nav').innerHTML=leagues.map(league=>`<a href="#/league/${league.id}" data-nav="league-${league.id}"><span class="league-code">${e(league.nation.slice(0,2))}</span>${e(league.name)}</a>`).join('');}busyButtons();if(state.job)pollJob(state.job);}

function slotsHtml(slots){return slots.length?slots.map(slot=>`<div class="slot-row"><div><strong>${e(slot.slot==='autosave'?'Sauvegarde automatique':slot.slot)}</strong><small>${new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(slot.modified*1000))} · ${n(slot.bytes/1024/1024)} Mo</small></div><button data-command="load" data-slot="${e(slot.slot)}">Reprendre →</button></div>`).join(''):empty('Vos sauvegardes apparaîtront ici.','Aucune partie enregistrée');}
async function savesScreen(welcome=false){const slots=await api('/partie/slots');const intro=welcome?`<section class="hero"><div><span class="eyebrow">BIENVENUE SUR LE BANC DE TOUCHE</span><h1>Tout un monde de football.<br>À votre rythme.</h1><p>96 clubs, cinq championnats et des milliers de destins. Créez votre univers et suivez son histoire, saison après saison.</p></div><div class="hero-graphic" aria-hidden="true"></div></section>`:heading('VOTRE UNIVERS','Ma partie','Sauvegardez votre histoire ou ouvrez un nouveau chapitre.');let report='';if(state.exists&&!state.recovery_required){const data=await api('/partie/rapport-import');report=card('Rapport de création',`<div class="card-body"><div class="stat-grid">${stat('Joueurs retenus',n(data.counts.players))}${stat('Joueurs écartés',n(data.counts.excluded))}${stat('Joueurs actifs',n(data.counts.active_players))}${stat('Agents libres',n(data.counts.free_agents))}</div><p class="note">Au maximum ${data.max_squad} joueurs par club, dont deux places réservées aux meilleurs gardiens disponibles. Les CSV originaux restent inchangés. ${data.counts.attributes_from_source?'Les attributs et aptitudes proviennent du CSV. Les finances restent estimées.':'Cette ancienne partie utilise des attributs estimés.'}</p><details><summary>Détail des corrections à l’import</summary><pre>${e(JSON.stringify(data.counts,null,2))}</pre></details></div>`);}
return `<div class="${welcome?'welcome':''}">${intro}${state.recovery_required?'<div class="notice">La simulation a été interrompue. Chargez une sauvegarde pour reprendre un état cohérent.</div>':''}<div class="grid equal">${card('Nouvelle partie',`<div class="card-body"><span class="eyebrow">SAISON INITIALE · 2025 / 2026</span><p>Chaque graine crée une simulation reproductible. Tous les clubs sont pilotés par l’IA.</p><form id="new-game"><label for="seed">Graine de la simulation</label><input id="seed" name="seed" type="number" min="0" max="9007199254740991" value="2025" required><div class="actions"><button class="primary" data-command="create">Créer mon univers →</button></div></form></div>`)}${card(welcome?'Reprendre une partie':'Mes sauvegardes',`<div class="card-body">${state.exists&&!state.recovery_required?`<form id="save-game" class="filters"><input name="slot" aria-label="Nom de la sauvegarde" placeholder="Nom de la sauvegarde" required pattern="[A-Za-z0-9_\\-]{1,64}" value="ma-partie"><button data-command="save">Enregistrer</button></form>`:''}${slotsHtml(slots)}</div>`)}</div>${report}</div>`;}

async function render(){const version=++renderVersion;const {parts,params}=routeParts();if(!main.innerHTML||main.querySelector('.loading'))main.innerHTML='<div class="loading">Chargement…</div>';
 const active=document.activeElement;
 const focusName=active&&main.contains(active)&&active.matches('[data-filter] input,[data-filter] select')?active.name:null;
 const selection=focusName&&'selectionStart' in active?[active.selectionStart,active.selectionEnd]:null;
 try{await refreshState();let html;if(!state.exists||state.recovery_required)html=await savesScreen(true);else{const [screen,id,section]=parts;switch(screen){case 'clubs':html=await clubsScreen(params);break;case 'club':html=await clubScreen(id,section,params);break;case 'league':html=await leagueScreen(id,section,params,leagues);break;case 'transfers':html=await worldHistoryScreen(id,params);break;case 'players':html=await playersScreen(params);break;case 'player':html=await playerScreen(id,section,params);break;case 'match':html=await matchScreen(id,section);break;case 'saves':html=await savesScreen();break;case 'journal':html=await journalScreen(params);break;default:html=await dashboard(state,leagues);}}
 if(version!==renderVersion)return;main.innerHTML=html;document.querySelectorAll('[data-nav]').forEach(link=>link.classList.toggle('active',link.dataset.nav===(parts[0]==='league'?`league-${parts[1]}`:parts[0]==='club'?'clubs':parts[0]==='player'?'players':parts[0]||'home')));busyButtons();document.title=`${main.querySelector('h1')?.textContent||'Touchline'} · Football Manager Light`;
 if(focusName){const next=main.querySelector(`[data-filter] [name="${focusName}"]`);if(next){next.focus();if(selection)next.setSelectionRange(...selection);}}
 }catch(error){autoplay.pause();if(version!==renderVersion)return;main.innerHTML=card('Impossible d’afficher cette page',empty(error.message,'Une erreur est survenue'))+`<button id="retry">Réessayer</button>`;toast(error.message,true);}}

async function command(path,payload,automatic=false){
 if(state.job||submitting)return false;
 if(!automatic)autoplay.pause();
 submitting=true;
 busyButtons();
 try{
  const body={...payload,commande_id:crypto.randomUUID()};
  let job;
  try{job=await api(path,body);}catch(error){if(error instanceof TypeError)job=await api(path,body);else throw error;}
  state.job=job.id;
  pollJob(job.id);
  return true;
 }catch(error){autoplay.pause();toast(error.message,true);return false;}
 finally{submitting=false;busyButtons();}
}
async function pollJob(id){
 if(polling===id)return;
 polling=id;
 document.querySelector('#job-bar').hidden=false;
 try{
  while(polling===id){
   const job=await api(`/travaux/${id}`);
   document.querySelector('#job-progress').value=job.progress;
   document.querySelector('#job-label').textContent=`${({create:'Création du monde',load:'Chargement',save:'Sauvegarde',advance:'Simulation'})[job.command]}… ${job.date?date(job.date):''} ${Math.round(job.progress*100)}%`;
   if(['done','failed'].includes(job.status)){
    state.job=null;
    polling=null;
    document.querySelector('#job-bar').hidden=true;
    if(job.status==='failed'){autoplay.pause();toast(job.error,true);}
    else if(!autoplay.playing)toast(job.command==='advance'?'Le monde a avancé. Partie sauvegardée.':job.command==='create'?'Votre univers est prêt.':job.command==='load'?'Partie restaurée.':'Partie sauvegardée.');
    await render();
    if(job.status==='done'&&job.command==='advance')autoplay.complete();
    return;
   }
   await new Promise(resolve=>setTimeout(resolve,700));
  }
 }catch(error){polling=null;autoplay.pause();toast('Suivi interrompu : rechargez la page pour retrouver le travail en cours.',true);}
}

document.querySelector('#autoplay').addEventListener('click',()=>{
 if(autoplay.playing){autoplay.pause();toast(state.job||submitting?'Pause demandée : la journée en cours se termine.':'Avance automatique en pause.');}
 else if(state.exists&&!state.recovery_required&&!state.job&&!submitting)autoplay.start();
});
window.addEventListener('pagehide',()=>autoplay.pause());

document.querySelector('#advance').addEventListener('click',()=>command('/monde/avancer',{jusqu_a:document.querySelector('#advance-mode').value}));
function applyFilter(form){const values=Object.fromEntries(new FormData(form));Object.keys(values).forEach(key=>{if(!values[key])delete values[key];});changeParams(values);}
main.addEventListener('submit',async event=>{event.preventDefault();const element=event.target;const data=new FormData(element);if(element.matches('[data-filter]')){applyFilter(element);}else if(element.id==='new-game'){if(state.exists){const dialog=document.querySelector('#confirm-dialog');dialog.showModal();const confirmed=await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));if(!confirmed)return;}await command('/partie/creer',{graine:Number(data.get('seed'))});}else if(element.id==='save-game')await command('/partie/sauvegarder',{slot:data.get('slot')});});
let filterTimer;
main.addEventListener('input',event=>{const field=event.target;const form=field.closest('[data-filter]');if(!form||!field.matches('input[type=search],input[type=number],input[type=text],input[type=date]'))return;clearTimeout(filterTimer);filterTimer=setTimeout(()=>applyFilter(form),400);});
main.addEventListener('change',event=>{const field=event.target;const form=field.closest('[data-filter]');if(!form||!field.matches('select,input[type=checkbox],input[type=radio]'))return;clearTimeout(filterTimer);applyFilter(form);});
main.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;const {params}=routeParts();if(button.dataset.season){params.set('saison',button.dataset.season);params.delete('page');changeParams(params);}if(button.dataset.page){params.set('page',button.dataset.page);changeParams(params);}if(button.dataset.sort){const current=params.get('tri')||(routeParts().parts[0]==='players'?'value':routeParts().parts[0]==='clubs'?'reputation':routeParts().parts[0]==='transfers'?(routeParts().parts[1]==='academy'?'promotion_date':'date'):'rating');params.set('ordre',current===button.dataset.sort&&(params.get('ordre')||'desc')==='desc'?'asc':'desc');params.set('tri',button.dataset.sort);params.delete('page');changeParams(params);}if(button.dataset.command==='load')command('/partie/charger',{slot:button.dataset.slot});if(button.id==='retry')render();});
window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0});});
window.addEventListener('unhandledrejection',event=>toast(event.reason?.message||'Une erreur inattendue est survenue.',true));
render();
