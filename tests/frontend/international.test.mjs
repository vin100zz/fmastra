import test from 'node:test';
import assert from 'node:assert/strict';
import {internationalScreen,editionContent} from '../../web/international.js';
import {clubLink} from '../../web/ui.js';

const nation={id:-1001,name:'France <test>',nation:'FRA',national:true,federation:'Europe',strength:80};
const row={nation,played:8,won:5,drawn:2,lost:1,goals_for:15,goals_against:5,difference:10,points:17};
const edition={year:2028,name:'Euro 2028',qualification_groups:[{name:'A',rows:[row]}],final_groups:[],best_seconds:[row],second_places:6,qualifiers:[],matches:[],records:[]};

test('international tables explain normalized seconds and escape nation labels',()=>{
 const html=editionContent(edition);
 assert.match(html,/6 places qualificatives/);
 assert.match(html,/résultats contre le dernier/);
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
  assert.match(html,/POSTE.*JOUEUR.*ÂGE.*NIV\..*POT\..*CLUB.*VALEUR.*SALAIRE \/ MOIS.*CONTRAT.*ÉTAT.*SÉL\..*BUTS/s);
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
