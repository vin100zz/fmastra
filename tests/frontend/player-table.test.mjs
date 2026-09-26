import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playerTable,minutes,seasonArchives,standingsTable,setNations,levelHue,levelBadge,sortableTable,sortTable,nextDirection,compareValues,appearances} from '../../web/ui.js';

test('standings show promotion and relegation places from the API',()=>{
 const rows=[{rank:1,movement:'promotion'},{rank:4,movement:null},{rank:8,movement:'relegation'}].map(row=>({...row,club:{id:row.rank,name:'Club'},played:0,points:0,difference:0,form:''}));
 const html=standingsTable({items:rows});
 assert.equal((html.match(/title="Place de promotion"/g)||[]).length,1);
 assert.equal((html.match(/title="Place de relégation"/g)||[]).length,1);
});

test('standings give European qualification places a blue background, matching promotion/relegation backgrounds',()=>{
 const rows=[{rank:1,movement:'champion'},{rank:2,movement:'europe'},{rank:3,movement:null},{rank:8,movement:'relegation'}].map(row=>({...row,club:{id:row.rank,name:'Club'},played:0,points:0,difference:0,form:''}));
 const html=standingsTable({items:rows});
 assert.match(html,/<tr class="qualified-europe">/);
 assert.match(html,/<tr class="promoted">/);
 assert.match(html,/<tr class="relegated">/);
 // the background says it all: no "Europe" text next to the club
 assert.doesNotMatch(html,/qualification-europe|Europe</);
});

const player={id:1,name:'Test',position:'BU',age:20,nation:'FRA',nationalities:['FRA','ESP'],nationality_names:['France','Espagne'],rating:70,value:1314589,wage:12000,fitness:1,contract_end:'2028-06-30',appearances:3,minutes:131.6,goals:2,assists:1,yellows:2,reds:1,average:7.5};
test('player list shows multiple nationalities and value with selected sorting',()=>{
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'},ESP:{name:'Espagne',display_code:'ESP',flag:'es'},POR:{name:'Portugal',display_code:'POR',flag:'pt'},XOP:{name:'Angola',display_code:'Angola',flag:'ao'}});
 const html=playerTable({items:[player],total:1,page_size:30},true,'value');
 assert.match(html,/title="France"/);assert.match(html,/title="Espagne"/);
 assert.match(html,/flags\/fr.svg/);assert.match(html,/flags\/es.svg/);
 assert.match(html,/VALEUR ↓/);assert.match(html,/1,3/);
 const imported=playerTable({items:[{...player,nationalities:['POR','XOP'],nationality_names:['Portugal','Angola']}],total:1,page_size:30},true);
 assert.match(imported,/POR/);assert.match(imported,/Angola/);assert.doesNotMatch(imported,/XOP/);
});

test('potential follows current level and academy columns preserve unknown data',()=>{
 const html=playerTable({items:[{...player,potential:90,promotion_date:'2025-07-01',academy_club:{id:1,name:'Centre'},data_at:'promotion'}],total:1,page_size:50},true,'','desc',{sortable:false,academy:true});
 assert.ok(html.indexOf('NIV.') < html.indexOf('POT.'));
 assert.match(html,/title="Potentiel sur 200">180</);assert.doesNotMatch(html,/POT\. EST\./);
 assert.match(html,/À la promotion/);assert.match(html,/CLUB FORMATEUR/);
 assert.doesNotMatch(html,/data-sort/);
 const missing=playerTable({items:[{id:2,name:'Retraité',nationalities:[],data_at:'unknown'}],total:1,page_size:50},true,'','desc',{sortable:false,academy:true});
 assert.match(missing,/Non archivées/);assert.doesNotMatch(missing,/NaN|undefined|0 €/);
});

test('archived academy rows without a stored potential do not break the table',()=>{
 const html=playerTable({items:[{...player,potential:null,data_at:'promotion'}],total:1,page_size:50},true,'','desc',{sortable:false,academy:true});
 assert.doesNotMatch(html,/NaN|undefined|null/);
});

test('exact potential is shown out of 200 and sortable in player and squad lists',()=>{
 const players=playerTable({items:[{...player,potential:91.5,club:{id:1,name:'Club'}}],total:1,page_size:30},true,'potential','desc');
 assert.match(players,/data-sort="potential">POT\. ↓/);assert.match(players,/title="Potentiel sur 200">183</);
 const squad=playerTable({items:[{...player,potential:91.5}],total:1,page_size:30},false,'potential','asc');
 assert.ok(squad.indexOf('NIV.')<squad.indexOf('POT.')&&squad.indexOf('POT.')<squad.indexOf('VALEUR'));
 assert.match(squad,/data-sort="potential">POT\. ↑/);assert.match(squad,/title="Potentiel sur 200">183</);
 assert.doesNotMatch(squad,/data-sort="club"/);
});

test('level and potential badges share one red-yellow-green scale out of 200',()=>{
 assert.deepEqual([40,70,90,110,130,150,190].map(levelHue),[0,0,25,50,85,120,120]);
 const low=levelBadge(30,'Niveau actuel sur 200'),high=levelBadge(80,'Potentiel sur 200');
 assert.match(low,/class="rating graded" style="--hue:0" title="Niveau actuel sur 200">60</);
 assert.match(high,/style="--hue:120" title="Potentiel sur 200">160</);
 assert.equal(levelBadge(null,'x'),'—');
 const html=playerTable({items:[{...player,rating:55,potential:80}],total:1,page_size:30},false);
 assert.match(html,/style="--hue:\d+" title="Niveau actuel sur 200">110</);
 assert.match(html,/style="--hue:\d+" title="Potentiel sur 200">160</);
 assert.equal((html.match(/class="rating graded"/g)||[]).length,2);
});

test('season archives include full standings and open the latest season',()=>{
 const html=seasonArchives({items:[{season:2025,standings:[{rank:1,club:{id:1,name:'Champion'},played:34,won:20,drawn:10,lost:4,goals_for:60,goals_against:20,difference:40,points:70,form:'VVNVV'}]}]});
 assert.match(html,/open/);assert.match(html,/Classement complet/);assert.match(html,/Champion/);
 for(const label of ['BP','BC','PTS','FORME'])assert.ok(html.includes(`<button class="sort-toggle" data-table-sort>${label}</button>`));
});
test('squad table includes season statistics but no minutes column, and minutes have no decimals',()=>{
 const html=playerTable({items:[player],total:1,page_size:30});
 for(const key of ['appearances','goals','assists','yellows','reds','average'])assert.ok(html.includes(`data-sort="${key}"`));
 assert.doesNotMatch(html,/data-sort="minutes"|MIN\./);
 assert.equal(minutes(131.6),'132');assert.equal(minutes(0),'0');assert.doesNotMatch(minutes(11.2),/[,\.]/);
});

test('every squad column is a sort button, and the active one carries its direction',()=>{
 const html=playerTable({items:[player],total:1,page_size:30},false,'position','asc');
 const headers=[...html.matchAll(/<th><button[^>]*data-sort="(\w+)"/g)].map(match=>match[1]);
 assert.deepEqual(headers,['position','name','nation','age','rating','potential','value','wage','contract_end','fitness','appearances','goals','assists','yellows','reds','average']);
 assert.equal((html.match(/<th>(?!<button)/g)||[]).length,0);
 assert.match(html,/<button data-first="asc" data-order="asc" data-sort="position">POSTE ↑/);
 assert.match(html,/<button data-first="desc" data-sort="rating">NIV\. </);
 assert.doesNotMatch(html.replace(/data-order="asc" data-sort="position"/,''),/data-order/);
 for(const key of ['name','nation'])assert.match(html,new RegExp(`data-first="asc"[^>]*data-sort="${key}"`));
});

// The smallest table the sorter touches: header cells with aria-sort, body rows with data-value cells.
function fakeTable(headers,rows){
 const attributes=headers.map(()=>({}));
 const head=headers.map((label,index)=>({dataset:{},getAttribute:name=>attributes[index][name]??null,setAttribute:(name,value)=>{attributes[index][name]=value;},removeAttribute:name=>{delete attributes[index][name];}}));
 const body={rows:rows.map((values,index)=>({dataset:{row:String(index)},cells:values.map(value=>({dataset:{value}}))})),append(...items){this.rows=items;}};
 return {tHead:{rows:[{cells:head}]},tBodies:[body],head,ids:()=>body.rows.map(row=>row.dataset.row)};
}

test('sortable tables carry the raw value of every cell and start ranks from the smallest',()=>{
 const html=sortableTable(['#','CLUB'],['<b>1</b>','<i>Lens</i>'].map(cell=>[cell,cell]),[[1,'Lens'],[2,'<script>']],{ascending:[0]});
 assert.match(html,/<table data-sortable>/);assert.match(html,/<th data-first="asc"><button class="sort-toggle" data-table-sort>#<\/button><\/th><th><button/);
 assert.match(html,/<td data-value="1">/);assert.match(html,/data-value="&lt;script&gt;"/);assert.doesNotMatch(html,/<script>/);
 assert.doesNotMatch(standingsTable({items:[{rank:1,club:{id:1,name:'A'},form:''}]}),/data-sortable/);
});

test('sorting orders by raw values, keeps unknown ones last and ties in page order',()=>{
 assert.ok(compareValues('9','10')<0&&compareValues('Émile','Zack')<0&&compareValues('2025-08-01','2025-08-10')<0);
 const table=fakeTable(['DATE','JOUEUR','MONTANT'],[['2025-08-01','zoé','5'],['2025-07-01','Émile',''],['2025-09-01','Adam','20'],['2025-10-01','Bob','5']]);
 assert.equal(nextDirection(table,2),'desc');assert.equal(nextDirection(table,1),'asc');
 sortTable(table,2,'desc');assert.deepEqual(table.ids(),['2','0','3','1']);
 assert.equal(table.head[2].getAttribute('aria-sort'),'descending');assert.equal(nextDirection(table,2),'asc');
 sortTable(table,2,'asc');assert.deepEqual(table.ids(),['0','3','2','1']);
 sortTable(table,1,'asc');assert.deepEqual(table.ids(),['2','3','1','0']);
 assert.equal(table.head[2].getAttribute('aria-sort'),null);assert.equal(table.head[1].getAttribute('aria-sort'),'ascending');
 table.head[0].dataset.first='asc';assert.equal(nextDirection(table,0),'asc');
});

test('appearances show the substitute entries in brackets after the starts',()=>{
 assert.equal(appearances(15,3),'12 (3)');
 assert.equal(appearances(12,0),'12');
 assert.equal(appearances(12),'12');
 assert.equal(appearances(3,3),'0 (3)');
});
