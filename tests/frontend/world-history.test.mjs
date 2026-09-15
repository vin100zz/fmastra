import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldHistoryScreen} from '../../web/world-history.js';

test('all movement tabs expose sortable columns and the selected direction',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [type,sort,keys] of [
   ['transfer','fee',['date','name','source','target','fee']],
   ['retirement','name',['date','name','source']],
   ['academy','potential_estimate',['position','name','nation','age','rating','potential_estimate','club','value','wage','contract_end','fitness','promotion_date','academy_club','data_at']],
  ]){
   let requested;
   globalThis.fetch=async url=>{requested=url;return {ok:true,json:async()=>({season:2027,previous_season:2026,next_season:null,history_since:'2025-07-01',sort,order:'asc',page:1,page_size:50,total:1,items:[{date:'2027-07-01',player_id:1,player:'Joueur',kind:type,fee:30000,details:{id:1,name:'Joueur',nationalities:[],data_at:'unknown'}}]})};};
   const html=await worldHistoryScreen(type,new URLSearchParams({tri:sort,ordre:'asc',saison:'2027'}));
   for(const key of keys)assert.ok(html.includes(`data-sort="${key}"`),`${type}: ${key}`);
   assert.match(html,/↑/);assert.ok(requested.includes(`tri=${sort}`));assert.ok(requested.includes('ordre=asc'));
  }
 }finally{globalThis.fetch=original;}
});
