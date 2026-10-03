import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldHistoryScreen,activityChart,countChart,retirementSummary,academySummary} from '../../web/world-history.js';
import {setNations} from '../../web/ui.js';

const page={season:2027,previous_season:2026,next_season:null,history_since:'2025-07-01',page:1,page_size:50,counts:{transfer:1263,retirement:0,academy:639}};

test('all movement tabs expose sortable columns and the selected direction',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [type,sort,keys] of [
   ['transfer','fee',['date','position','name','nation','age','rating','source','target','fee','value']],
   ['retirement','name',['position','name','nation','age','source','league','rating','peak','matches','goals','assists','average','caps','caps_goals']],
   ['academy','potential',['position','name','nation','age','academy_club','rating','level','progress','potential','worth']],
  ]){
   let requested;
   globalThis.fetch=async url=>{requested=url;return {ok:true,json:async()=>({...page,sort,order:'asc',total:1,items:[{date:'2027-07-01',player_id:1,player:'Joueur',kind:type,fee:30000,details:{id:1,name:'Joueur',nationalities:[],data_at:'unknown'}}]})};};
   const html=await worldHistoryScreen(type,new URLSearchParams({tri:sort,ordre:'asc',saison:'2027'}));
   for(const key of keys)assert.ok(html.includes(`data-sort="${key}"`),`${type}: ${key}`);
   for(const key of keys)assert.match(html,new RegExp(`<th[^>]* class="${key}-column">`),`${type}: ${key} width`);
   // Every movement of a tab falls on the same few days: no tab lists the date but the transfers.
   assert.equal(html.includes('data-sort="date"'),type==='transfer');
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

const screen=async(type,query,item,state={})=>{
 const original=globalThis.fetch,asked=[];
 globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>({...page,sort:new URLSearchParams(url.split('?')[1]).get('tri')||'rating',order:'desc',total:1,nations:['ITA','FRA'],items:[item]})};};
 try{return {html:await worldHistoryScreen(type,new URLSearchParams(query),[{id:16,name:'Ligue 1',nation:'FRA',kind:'league',level:1}],state),asked};}
 finally{globalThis.fetch=original;}
};

test('a retirement tells the level, the career and the caps of who left, under three headings',async()=>{
 setNations({ITA:{name:'Italie',display_code:'ITA',flag:'it'},FRA:{name:'France',display_code:'FRA',flag:'fr'}});
 const retired={date:'2030-07-01',player_id:4,player:'Alessandro Buongiorno',kind:'retirement',fee:0,age:32,position:'DC',nationalities:['ITA'],rating:76.5,peak:78,value:null,
  source:{id:1,name:'Real Sociedad',major_color:'#F8F8F8',minor_color:'#003098'},target:null,league:{id:67,name:'La Liga'},matches:154,goals:13,assists:1,average:6.9,caps:34,caps_goals:2};
 const {html,asked}=await screen('retirement','saison=2029&poste=DC,GB&age_min=33&selectionnes=oui&competition=16&club=7',retired,{controlled_club_id:7});
 assert.match(html,/<h2>1 retraites<\/h2>/);
 assert.deepEqual([...html.matchAll(/<th colspan="(\d+)" class="column-group">([^<]+)</g)].map(match=>`${match[2]}:${match[1]}`),['Niveau:2','Carrière:4','Sélection:2']);
 const cells=[...html.match(/<tr class="">(.*?)<\/tr>/)[1].matchAll(/<td>(.*?)<\/td>/g)].map(cell=>cell[1]);
 assert.equal(cells.length,14);
 assert.match(cells[0],/class="position def">DC</);assert.match(cells[2],/flags\/it\.svg/);assert.equal(cells[3],'<span class="num">32</span>');
 assert.match(cells[4],/Real Sociedad/);assert.equal(cells[5],'La Liga');
 assert.match(cells[6],/title="Niveau à la retraite sur 200">153</);assert.match(cells[7],/title="Meilleur niveau sur 200">156</);
 assert.deepEqual(cells.slice(8).map(cell=>cell.replace(/<[^>]+>/g,'')),['154','13','1','6,9','34','2']);
 // Positions as chips, the age in a menu, internationals and the user's club as switches.
 assert.deepEqual([...html.matchAll(/class="chip (?:gk|def|mid|att) on"[^>]*>(\w+)</g)].map(match=>match[1]),['GB','DC']);
 assert.match(html,/<summary>Âge <b>≥ 33<\/b>/);
 assert.match(html,/<a class="chip toggle on" href="[^"]*" aria-current="true">Internationaux<\/a>/);assert.match(html,/<a class="chip toggle on"[^>]*>Mon club<\/a>/);
 assert.equal(asked.length,1);assert.match(decodeURIComponent(asked[0]),/type=retirement/);assert.match(decodeURIComponent(asked[0]),/poste=DC,GB/);
 // Archived before the day was kept: neither position nor level; a player without a club has no league either.
 const old=await screen('retirement','',{...retired,position:null,nationalities:[],rating:null,peak:null,source:null,league:null,matches:0,goals:0,assists:0,average:null,caps:0,caps_goals:0});
 const bare=[...old.html.match(/<tr class="">(.*?)<\/tr>/)[1].matchAll(/<td>(.*?)<\/td>/g)].map(cell=>cell[1].replace(/<[^>]+>/g,''));
 assert.deepEqual(bare,['—','Alessandro Buongiorno','—','32','Libre','—','—','—','0','0','0','—','—','—']);
 assert.doesNotMatch(old.html,/Internationaux<\/a>.*Mon club/);
});

const promoted={date:'2029-07-01',player_id:9,player:'Randal Hansen',kind:'academy',fee:0,age:16,source:null,target:{id:3,name:'Jong Holland',major_color:'#F8F8F8',minor_color:'#002080'},
 details:{id:9,name:'Randal Hansen',position:'MOC',age:16,nationalities:['FRA'],rating:40.5,potential:97.6,data_at:'promotion',club:{id:3,name:'Jong Holland'},
  current:{id:9,name:'Randal Hansen',position:'MOC',age:17,nationalities:['FRA'],rating:49,potential:97.6,value:745166,club:{id:3,name:'Jong Holland'},wage_demand:80770,interested:true,
   attributes:{passe:62,technique:70},composites:{tir:48},key_composites:['tir']}}};

test('a promotion tells the level then and now, the way covered to the potential, and what a recruiter needs',async()=>{
 const {html,asked}=await screen('academy','saison=2029&niveau_min=80&potentiel_min=160&pays=FRA&interesse=oui',promoted,{controlled_club_id:7});
 const cells=[...html.match(/<tr class="">(.*?)<\/tr>/)[1].matchAll(/<td>(.*?)<\/td>/g)].map(cell=>cell[1]);
 assert.equal(cells.length,12);
 assert.match(cells[5],/title="Niveau à la promotion sur 200">81</);assert.match(cells[6],/title="Niveau actuel sur 200">98</);
 // 17 levels gained of the 114 between his level then and his potential.
 assert.match(cells[7],/<span class="bar-figure gain"><i class="mini-bar" aria-hidden="true"><i style="width:15%"><\/i><\/i><b>\+17<\/b><\/span>/);
 assert.match(cells[8],/title="Potentiel sur 200">195</);assert.match(cells[9],/750\s000\s€/);assert.match(cells[10],/350\s000\s€/);assert.equal(cells[11],'Oui');
 assert.doesNotMatch(cells[4],/→/);
 // Levels and potentials go to the server on its scale; a class opens on its best prospects.
 const request=decodeURIComponent(asked[0]);
 assert.match(request,/niveau_min=40/);assert.match(request,/potentiel_min=80/);assert.match(request,/tri=potential/);assert.match(request,/pays=FRA/);
 assert.match(html,/<summary>Niveau <b>≥ 80<\/b>/);assert.match(html,/<summary>Potentiel <b>≥ 160<\/b>/);
 assert.match(html,/<select name="pays" aria-label="Pays" class="on"><option value="">Pays<\/option><option value="FRA" selected>France<\/option><option value="ITA" >Italie<\/option>/);
 assert.match(html,/<select name="interesse"[^>]*class="on">/);
 // Without a club, neither what he asks nor whether he would come; a player who left the club that trained him shows where he is.
 const moved={...promoted,details:{...promoted.details,current:{...promoted.details.current,club:{id:8,name:'Ajax'},rating:38}}};
 const plain=await screen('academy','',moved);
 const bare=[...plain.html.match(/<tr class="">(.*?)<\/tr>/)[1].matchAll(/<td>(.*?)<\/td>/g)].map(cell=>cell[1]);
 assert.equal(bare.length,10);assert.match(bare[4],/Jong Holland.*→.*Ajax/);assert.match(bare[7],/<b>−5<\/b>/);
 assert.doesNotMatch(plain.html,/PRÉTENTIONS|INTÉRESSÉ|name="interesse"|Mon club/);
 // Once he has left the world, only the day of his promotion is left.
 const gone=await screen('academy','',{...promoted,details:{...promoted.details,current:null}});
 assert.deepEqual([...gone.html.match(/<tr class="">(.*?)<\/tr>/)[1].matchAll(/<td>(.*?)<\/td>/g)].map(cell=>cell[1].replace(/<[^>]+>/g,'')).slice(5),['81','—','—','195','—']);
});

test('the promotions also read as the players are today: their attributes or their composites, sorted on today’s level',async()=>{
 const {html,asked}=await screen('academy','saison=2029&vue=attributs',promoted);
 assert.match(decodeURIComponent(asked[0]),/tri=level/);assert.doesNotMatch(asked[0],/vue=/);
 // The level column carries the sort the server names `level`.
 assert.match(html,/data-order="desc" data-sort="rating">NIV\.</);
 assert.match(html,/data-sort="passe"><span title="Passe">PAS<\/span>/);
 assert.match(html,/title="Niveau actuel sur 200">98</);
 // The age stays the one of the promotion and the club the one that trained him.
 assert.match(html,/<td><span class="num">16<\/span><\/td>/);assert.match(html,/Jong Holland/);
 assert.match(html,/data-view="attributs" aria-pressed="true"/);assert.match(html,/data-fit="transfers-academy-attributs"/);
 const sorted=await screen('academy','vue=jeu&tri=rating&ordre=asc',promoted);
 assert.match(decodeURIComponent(sorted.asked[0]),/tri=level/);assert.match(sorted.html,/data-sort="tir"><span title="Frappe">FRA<\/span>/);
 const other=await screen('academy','vue=jeu&tri=tir',promoted);
 assert.match(decodeURIComponent(other.asked[0]),/tri=tir/);
});

test('a count per class is drawn as bars, the highest one carrying its figure',()=>{
 const html=countChart([[31,45,'31 ans : 45 retraites'],[32,271,'32 ans : 271 retraites'],[33,14,'33 ans : 14 retraites']],'Retraites par âge');
 assert.deepEqual([...html.matchAll(/<em>([^<]+)<\/em>/g)].map(match=>match[1]),['100','200','300']);
 assert.deepEqual([...html.matchAll(/<b style="bottom:([\d.]+)%">(\d+)<\/b>/g)].map(match=>[match[2],match[1]]),[['271','90.3']]);
 assert.deepEqual([...html.matchAll(/<span>(\d+)<\/span>/g)].map(match=>match[1]),['31','32','33']);
 assert.match(html,/role="img" aria-label="Retraites par âge"/);assert.match(html,/title="31 ans : 45 retraites"/);
});

test('the summary of the retirements counts them, their ages, and the clubs and leagues they left',()=>{
 const club=(id,name)=>({id,name,major_color:'#111111',minor_color:'#eeeeee'});
 const html=retirementSummary({total:875,average_age:33.4,capped:315,oldest:{age:36,player_id:5,player:'Robin Zentner'},ages:[{age:33,count:250},{age:34,count:271}],
  clubs:[{club:club(1,'Catania'),league:{id:33,name:'Serie B'},count:7,average_age:33.1,matches:354},{club:club(2,'Al Nassr'),league:null,count:4,average_age:33.5,matches:51}],
  leagues:[{id:12,name:'Championship',count:54,average_age:33.3,matches:3956},{id:null,name:null,count:456,average_age:33.5,matches:7012}]});
 assert.deepEqual([...html.matchAll(/<span class="label">([^<]+)<\/span><strong>([^<]+)</g)].map(match=>`${match[1]}:${match[2]}`),['Retraites:875','Âge moyen:33,4','Internationaux:315','Doyen:36 ans']);
 assert.match(html,/<div class="stat-card" title="Robin Zentner">/);
 assert.match(html,/title="34 ans : 271 retraites"/);
 assert.match(html,/<div class="summary-table figures text-second">/);
 assert.match(html,/Catania.*Serie B.*<i style="width:100%"><\/i><\/i><b>7<\/b>/);assert.match(html,/Al Nassr.*Marché extérieur/);
 // The bars of the leagues are drawn against the simulated ones: the clubs outside them, far more numerous, fill theirs.
 assert.match(html,/Championship<\/a><\/td><td[^>]*><span class="bar-figure"><i class="mini-bar" aria-hidden="true"><i style="width:100%">/);
 assert.match(html,/Marché extérieur<\/span><\/td><td[^>]*><span class="bar-figure"><i class="mini-bar" aria-hidden="true"><i style="width:100%"><\/i><\/i><b>456</);
 // A season without any retirement keeps its four tiles.
 const empty=retirementSummary({total:0,average_age:null,capped:0,oldest:null,ages:[],clubs:[],leagues:[]});
 assert.doesNotMatch(empty,/class="card|NaN|null/);assert.match(empty,/Âge moyen<\/span><strong>—</);
});

test('the summary of the promotions counts potentials out of 200, the clubs that trained them and their countries',()=>{
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'},ITA:{name:'Italie',display_code:'ITA',flag:'it'}});
 const html=academySummary({total:639,average_potential:66.6,best:{potential:97.6,player_id:9,player:'Randal Hansen'},average_progress:5.66,
  bins:[{from:null,count:23},{from:100,count:41},{from:190,count:2}],
  academies:[{club:{id:3,name:'Jong Holland',major_color:'#F8F8F8',minor_color:'#002080'},count:2,average_potential:80.3,best:{potential:97.6,player_id:9,player:'Randal Hansen'},youth_recruitment:18}],
  nations:[{code:'FRA',count:90,clubs:42,average_potential:65,best:83.5},{code:'ITA',count:45,clubs:44,average_potential:64.5,best:95.1}]});
 assert.deepEqual([...html.matchAll(/<span class="label">([^<]+)<\/span><strong>([^<]+)</g)].map(match=>`${match[1]}:${match[2]}`),['Promus:639','Pot. moyen:133','Meilleur:195','Progression:+11,3']);
 assert.deepEqual([...html.matchAll(/class="week" title="([^"]+)"/g)].map(match=>match[1]),['Moins de 100 : 23 joueurs','De 100 à 109 : 41 joueurs','De 190 à 200 : 2 joueurs']);
 assert.match(html,/Jong Holland.*<span class="num">2<\/span>.*>161<.*#\/player\/9">Randal Hansen<.*>195<.*>18</);
 assert.match(html,/title="France">.*France.*<i style="width:100%"><\/i><\/i><b>90<\/b>.*<span class="num">42<\/span>.*>130<.*>167</);
 assert.match(html,/Italie.*<i style="width:50%"><\/i><\/i><b>45<\/b>/);
 const empty=academySummary({total:0,average_potential:null,best:null,average_progress:null,bins:[],academies:[],nations:[]});
 assert.doesNotMatch(empty,/class="card|NaN|null/);
});
