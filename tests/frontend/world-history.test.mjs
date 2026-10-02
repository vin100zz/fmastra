import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldHistoryScreen,activityChart} from '../../web/world-history.js';
import {setNations} from '../../web/ui.js';

const page={season:2027,previous_season:2026,next_season:null,history_since:'2025-07-01',page:1,page_size:50,counts:{transfer:1263,retirement:0,academy:639}};

test('all movement tabs expose sortable columns and the selected direction',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [type,sort,keys] of [
   ['transfer','fee',['date','position','name','nation','age','rating','source','target','fee','value']],
   ['retirement','name',['date','name','source']],
   ['academy','potential',['position','name','nation','age','rating','potential','club','value','wage','contract_end','fitness','promotion_date','academy_club','data_at']],
  ]){
   let requested;
   globalThis.fetch=async url=>{requested=url;return {ok:true,json:async()=>({...page,sort,order:'asc',total:1,items:[{date:'2027-07-01',player_id:1,player:'Joueur',kind:type,fee:30000,details:{id:1,name:'Joueur',nationalities:[],data_at:'unknown'}}]})};};
   const html=await worldHistoryScreen(type,new URLSearchParams({tri:sort,ordre:'asc',saison:'2027'}));
   for(const key of keys)assert.ok(html.includes(`data-sort="${key}"`),`${type}: ${key}`);
   if(type!=='academy')for(const key of keys)assert.ok(html.includes(`<th class="${key}-column">`),`${type}: ${key} width`);
   assert.ok(html.includes(`data-order="asc" data-sort="${sort}"`));assert.ok(requested.includes(`tri=${sort}`));assert.ok(requested.includes('ordre=asc'));
   // A row with neither position nor level (a retired player, an older server) still reads.
   assert.doesNotMatch(html,/NaN|undefined|null/);
  }
 }finally{globalThis.fetch=original;}
});

const transfer={date:'2029-08-26',player_id:7,player:'Sami Bouhoudane',kind:'transfer',fee:346159515,age:22,position:'BU',nationalities:['MAR','NED'],rating:81.5,value:161340678,
 source:{id:1,name:'Como',major_color:'#0050B8',minor_color:'#F8F8F8'},target:{id:2,name:'Man City',major_color:'#68A0D0',minor_color:'#F8F8F8'}};
async function render(query,items,state){
 const original=globalThis.fetch,asked=[];
 globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>({...page,sort:'fee',order:'desc',total:items.length,items})};};
 try{return {html:await worldHistoryScreen('transfer',new URLSearchParams(query),[{id:16,name:'Ligue 1',nation:'FRA',kind:'league',level:1},{id:-3,name:'Coupe de France',nation:'FRA',kind:'cup',level:0}],state),asked};}
 finally{globalThis.fetch=original;}
}

test('the title line carries the tabs with their counts and the season; the filters stand on the next one',async()=>{
 const {html,asked}=await render('saison=2027&fenetre=hiver&nature=payant&competition=16&poste=BU&age_max=23&montant_min=50&club=866&mesure=volume',[transfer],{controlled_club_id:866});
 assert.match(html,/^<div class="toolbar"><h1>Mercato mondial<\/h1><nav class="tabs"[^>]*><a class="active" href="#\/transfers\/transfer\?saison=2027">Transferts <span class="count">1\s263<\/span><\/a><a class="" href="#\/transfers\/retirement\?saison=2027">Retraites <span class="count">0<\/span>/);
 assert.match(html,/<button type="button" data-season="2026" aria-label="Saison précédente" >‹<\/button><strong>Saison 2027 \/ 2028<\/strong><button type="button" data-season="" aria-label="Saison suivante" disabled>›<\/button>/);
 assert.match(html,/<a class="active" href="[^"]*" aria-current="true">Hiver<\/a>/);assert.match(html,/<a class="active" href="[^"]*" aria-current="true">Payants<\/a>/);
 assert.match(html,/<select name="competition" aria-label="Championnat" class="on"><option value="">Championnat<\/option><option value="16" selected>Ligue 1<\/option><\/select>/);
 assert.match(html,/<option value="BU" selected>BU<\/option>/);
 assert.match(html,/<summary>Âge <b>≤ 23<\/b>/);assert.match(html,/<summary>Montant <b>≥ 50 M€<\/b>/);
 assert.match(html,/<a class="chip toggle on" href="[^"]*" aria-current="true">Mon club<\/a>/);
 assert.match(html,/<button type="button" data-reset-filters >Réinitialiser<\/button>/);
 // The lowest fee goes to the server in euros; the chart's measure stays in the page.
 assert.equal(asked.length,1);assert.match(asked[0],/montant_min=50000000/);assert.match(asked[0],/fenetre=hiver/);assert.doesNotMatch(asked[0],/mesure|taille/);
 // Without a club there is no such filter, and a season alone is not a filter to reset.
 const plain=await render('saison=2027',[transfer],{controlled_club_id:null});
 assert.doesNotMatch(plain.html,/Mon club/);assert.match(plain.html,/data-reset-filters disabled>/);
});

test('a transfer tells who the player is, from where to where, and its fee against the highest one',async()=>{
 setNations({MAR:{name:'Maroc',display_code:'MAR',flag:'ma'},NED:{name:'Pays-Bas',display_code:'NED',flag:'nl'}});
 const {html}=await render('',[transfer,{...transfer,player_id:8,player:'Libre',fee:0,position:null,nationalities:[],rating:null,value:null},{...transfer,player_id:9,player:'Fin',fee:0,kind:'release',target:null}]);
 assert.match(html,/<h2>3 transferts<\/h2>/);
 const rows=[...html.matchAll(/<tr class="">(.*?)<\/tr>/g)].map(row=>[...row[1].matchAll(/<td>(.*?)<\/td>/g)].map(cell=>cell[1]));
 const [paid,free,released]=rows;
 assert.equal(paid.length,11);
 assert.match(paid[1],/<span class="position att">BU<\/span>/);assert.match(paid[3],/flags\/ma\.svg.*title="Pays-Bas">\+1</);
 assert.equal(paid[4],'<span class="num">22</span>');assert.match(paid[5],/title="Niveau actuel sur 200">163</);
 assert.match(paid[6],/Como/);assert.match(paid[7],/→/);assert.match(paid[8],/Man City/);
 assert.match(paid[9],/<i style="width:100%"><\/i><\/i><b>350\sM\s€<\/b>/);assert.match(paid[10],/160\sM\s€/);
 assert.deepEqual([free[1],free[3],free[5]],['—','—','—']);assert.match(free[9],/Libre/);assert.equal(free[10],'<span class="num">—</span>');
 assert.match(released[8],/Libre/);assert.match(released[9],/Fin de contrat/);
 // The pages step from the head of the card; without a wide window there is no summary beside the list.
 assert.doesNotMatch(html,/class="pager"|class="side"/);
});

test('the weeks of a season are drawn window by window, only the busiest of each carrying its figure',()=>{
 const weeks=[{week:'2029-07-02',summer:true,count:70,volume:1.3e9},{week:'2029-07-09',summer:true,count:63,volume:1.4e9},{week:'2029-12-31',summer:false,count:306,volume:5.1e9},{week:'2030-01-07',summer:false,count:180,volume:5.2e9}];
 const counts=activityChart(weeks,2029,'count');
 assert.deepEqual([...counts.matchAll(/<small>([^<]+)<\/small>/g)].map(match=>match[1]),['Été 2029','Hiver 2030']);
 assert.deepEqual([...counts.matchAll(/<em>([^<]+)<\/em>/g)].map(match=>match[1]),['100','200','300','400']);
 assert.deepEqual([...counts.matchAll(/<b style="bottom:([\d.]+)%">(\d+)<\/b>/g)].map(match=>[match[2],match[1]]),[['70','17.5'],['306','76.5']]);
 assert.deepEqual([...counts.matchAll(/<span>(\d\d\/\d\d)<\/span>/g)].map(match=>match[1]),['02/07','09/07','31/12','07/01']);
 assert.match(counts,/title="Semaine du 2 juil\. 2029 : 70 transferts, 1,3\sMd\s€"/);
 // By fees, the busiest weeks are not the same.
 const volume=activityChart(weeks,2029,'volume');
 assert.deepEqual([...volume.matchAll(/<b style="bottom:[\d.]+%">([^<]+)<\/b>/g)].map(match=>match[1].replace(/\s/g,' ')),['1,4 Md €','5,2 Md €']);
 assert.match(volume,/aria-label="Indemnités par semaine"/);
});
