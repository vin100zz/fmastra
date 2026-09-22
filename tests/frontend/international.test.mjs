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

test('nation list and camp render sortable tables with raw values',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/nations/')?{
  ...nation,camp:{start:'2026-08-31',end:'2026-09-09'},squad:[{id:-1,name:'Renfort',position:'GB',rating:60,fitness:.9,caps:0,goals:0}],
  candidates:[],matches:[],records:[]
 }:{enabled:true,nations:[nation],editions:[{year:2028,name:'Euro 2028',winner:null}]}});
 try{
  assert.match(await internationalScreen(),/data-sortable/);
  const html=await internationalScreen('nation','-1001');
  assert.match(html,/Rassemblement/);
  assert.match(html,/temporary-player/);
  assert.match(html,/data-value="60"/);
 }finally{globalThis.fetch=previous;}
});

test('legacy saves explain how to activate national competitions',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({enabled:false})});
 try{assert.match(await internationalScreen(),/Nouvelle partie nécessaire/);}finally{globalThis.fetch=previous;}
});
