import test from 'node:test';
import assert from 'node:assert/strict';
import {internationalScreen,editionContent,editionStages} from '../../web/international.js';
import {clubLink} from '../../web/ui.js';

const nation={id:-1001,name:'France <test>',nation:'FRA',national:true,federation:'Europe',strength:80};
const row={nation,played:8,won:5,drawn:2,lost:1,goals_for:15,goals_against:5,difference:10,points:17};
const edition={year:2028,name:'Euro 2028',qualification_groups:[{name:'A',rows:[row]}],final_groups:[],best_seconds:[row],second_places:6,qualifiers:[],matches:[],records:[]};

test('international tables give the full record, rank the seconds and escape nation labels',()=>{
 const html=editionContent(edition);
 assert.match(html,/Classement des deuxièmes/);
 assert.match(html,/<th class="count-column"[^>]*><button class="sort-toggle" data-table-sort>N<\/button><\/th><th class="count-column"[^>]*><button class="sort-toggle" data-table-sort>P<\/button><\/th>/);
 assert.doesNotMatch(html,/places qualificatives/);
 assert.match(html,/France &lt;test&gt;/);
 assert.match(clubLink(nation),/href="#\/international\/nation\/-1001"/);
 assert.doesNotMatch(clubLink(nation),/href="#\/club\//);
 assert.match(editionContent(edition,'finals'),/fin des qualifications/);
});

const navigation={scope:{name:'Europe'},index:0,total:2,items:[{id:-1001,name:'France <test>'},{id:-1002,name:'Espagne'}],previous:null,next:{id:-1002,name:'Espagne'}};
const editions=[{year:2028,name:'Euro 2028',qualification:{label:'Qualifié',winner:false},finals:{label:'Vainqueur',winner:true}}];
const leaders={matches:[{player_id:5,player:'Cap <test>',matches:10,goals:2}],goals:[{player_id:6,player:'Buteur',matches:8,goals:6}]};

test('nation page shows a big flag, prev/next navigation, camp status and drops the eligible-players block',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/navigation')?navigation:url.includes('/nations/')?{
  ...nation,camp:{start:'2026-08-31',end:'2026-09-09',upcoming:true},squad:[{id:-1,name:'Renfort',position:'GB',rating:60,fitness:.9,caps:0,goals:0}],
  matches:[],editions,leaders
 }:{enabled:true,nations:[nation],editions:[{year:2028,name:'Euro 2028',winner:null}]}});
 try{
  assert.match(await internationalScreen(),/data-sortable/);
  const html=await internationalScreen('nation','-1001');
  assert.match(html,/class="crest"/);
  assert.match(html,/entity-nav/);
  assert.match(html,/entity-step next/);
  assert.match(html,/Rassemblement/);
  assert.match(html,/temporary-player/);
  assert.match(html,/data-value="60"/);
  assert.match(html,/POSTE.*JOUEUR.*ÂGE.*NIV\..*POT\..*CLUB.*VALEUR.*SALAIRE.*CONTRAT.*ÉTAT.*SÉL\..*BUTS/s);
  assert.doesNotMatch(html,/Joueurs éligibles/);
  assert.match(html,/>Effectif<\/a>/);
  assert.match(html,/>Calendrier<\/a>/);
  assert.match(html,/>Historique<\/a>/);
  const history=await internationalScreen('nation','-1001','history');
  assert.match(history,/Bilan par compétition/);
  assert.match(history,/Qualifié/);
  assert.match(history,/✦ Vainqueur/);
  assert.match(history,/Cap &lt;test&gt;/);
  assert.match(history,/Buteur/);
 }finally{globalThis.fetch=previous;}
});

test('a nation without a current camp falls back to its last one',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/navigation')?navigation:url.includes('/nations/')?{
  ...nation,camp:{start:'2026-08-31',end:'2026-09-09',upcoming:false},squad:[{id:-1,name:'Renfort',position:'GB',rating:60,fitness:.9,caps:0,goals:0}],
  matches:[],editions:[],leaders:{matches:[],goals:[]}
 }:{}});
 try{
  const html=await internationalScreen('nation','-1001');
  assert.match(html,/Dernier rassemblement/);
 }finally{globalThis.fetch=previous;}
});

test('legacy saves explain how to activate national competitions',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({enabled:false})});
 try{assert.match(await internationalScreen(),/Nouvelle partie nécessaire/);}finally{globalThis.fetch=previous;}
});

test('finals end with a fixed bracket joined through the rounds still to be played',()=>{
 const team=id=>({...nation,id,name:`Nation ${id}`});
 const quarter=(id,home,away,winner)=>({id,round:14,round_label:'Quarts de finale',date:'2028-06-30',home:team(home),away:team(away),score:[1,0],penalties:null,winner_id:winner,first_leg_id:null});
 const finals={...edition,final_groups:[{name:'A',rows:[row]}],matches:[quarter(1,-1,-2,-1),quarter(2,-3,-4,-3),quarter(3,-5,-6,-5),quarter(4,-7,-8,-7)],
  knockout_rounds:[{number:14,label:'Quarts de finale'},{number:15,label:'Demi-finales'},{number:16,label:'Finale'}]};
 const html=editionContent(finals,'finals');
 assert.match(html,/class="bracket"/);
 assert.equal((html.match(/bracket-tie empty/g)||[]).length,3);
 assert.equal((html.match(/bracket-round linked/g)||[]).length,2);
 // the knockout matches are in the bracket only, not repeated as round cards
 assert.doesNotMatch(html,/<h2>Quarts de finale<\/h2>/);
});

const team=(id,name)=>({...nation,id,name});
const game=(id,round,home,away,score)=>({id,round,round_label:`Groupes · J${round-10}`,date:`2028-06-${String(Math.max(1,round-10)).padStart(2,"0")}`,home,away,score,penalties:null,winner_id:null,first_leg_id:null});

test('the finals show each group with its three days and its full table',()=>{
 const a=team(-1,'Alpha'),b=team(-2,'Bravo'),c=team(-3,'Charlie'),d=team(-4,'Delta');
 const rows=[a,b].map(t=>({...row,nation:t}));
 const finals={...edition,final_groups:[{name:'A',rows},{name:'B',rows:[c,d].map(t=>({...row,nation:t}))}],knockout_rounds:[{number:14,label:'Quarts de finale'}],
  matches:[game(1,11,a,b,[1,0]),game(2,11,c,d,[2,2]),game(3,12,a,b,[0,0]),game(4,13,a,b,null)]};
 const html=editionContent(finals,'finals');
 assert.match(html,/intl-groups-4/);
 assert.equal((html.match(/Journée 1 ·/g)||[]).length,2);
 assert.match(html,/Journée 3 ·/);
 assert.doesNotMatch(html,/<details/);
 assert.ok(html.indexOf('class="bracket"')<html.indexOf('intl-groups'));
});

test('the stepper follows the stages and the qualifying days are picked in the address',()=>{
 const a=team(-1,'Alpha'),b=team(-2,'Bravo');
 const qualifying=(id,round,score)=>({...game(id,round,a,b,score),round_label:`Qualifications · J${round}`});
 const played={...edition,knockout_rounds:[{number:14,label:'Quarts de finale'}],matches:[...Array.from({length:10},(_,i)=>qualifying(i+1,i+1,[1,0])),game(20,11,a,b,null)]};
 assert.deepEqual(editionStages(played).map(step=>step.state),['done','current','todo']);
 const html=editionContent({...played,qualification_groups:[{name:'A',rows:[{...row,nation:a},{...row,nation:b}]}]},'qualifications',null,'4');
 assert.match(html,/class="active" href="#\/international\/2028\/qualifications\/4">J4/);
 assert.match(html,/Résultats par journée/);
});

test('statistics list scorers, assists, average ratings and attacks side by side',()=>{
 const a=team(-1,'Alpha');
 const records=[{player_id:1,name:'Buteur',nation:a,matches:5,goals:4,assists:0,rating_sum:35,rating_count:5},{player_id:2,name:'Passeur',nation:a,matches:5,goals:0,assists:3,rating_sum:10,rating_count:1}];
 const html=editionContent({...edition,records,matches:[game(1,11,a,team(-2,'Bravo'),[3,1])]},'statistics');
 assert.equal((html.match(/class="card stats-panel"/g)||[]).length,4);
 assert.match(html,/Meilleure note moyenne.*Buteur/s);
 assert.doesNotMatch(html.split('Meilleure note moyenne')[1].split('Meilleures attaques')[0],/Passeur/);
});

test('the nations list filters by federation and shows titles and the last edition',async()=>{
 const asia={...nation,id:-1002,name:'Japon',federation:'Asie',titles:0,last_edition:null};
 const france={...nation,titles:2,last_edition:{name:'Euro 2028',label:'Quart de finale',winner:false}};
 const api=async()=>({enabled:true,editions:[{year:2028,name:'Euro 2028',winner:france},{year:2030,name:'Euro 2030',winner:null}],nations:[france,asia]});
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/editions/')?{...edition,year:2030,name:'Euro 2030',knockout_rounds:[],matches:[]}:await api()});
 try{
  const all=await internationalScreen();
  assert.doesNotMatch(all,/Édition en cours/);
  assert.match(all,/<a class="card current-edition" href="#\/international\/2030\/qualifications">/);
  assert.match(all,/Euro 2030/);
  assert.match(all,/★ 2/);
  assert.match(all,/Quart de finale/);
  assert.match(all,/Japon/);
  const filtered=await internationalScreen(undefined,undefined,undefined,new URLSearchParams('federation=Asie'));
  assert.match(filtered,/Japon/);
  assert.doesNotMatch(filtered,/France &lt;test&gt;<\/span><\/a><\/td><td>Europe/);
 }finally{globalThis.fetch=previous;}
});
