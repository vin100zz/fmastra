import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playerTable,playerViewSwitch,minutes,seasonArchives,standingsTable,setNations,levelHue,levelBadge,sortableTable,sortTable,nextDirection,compareValues,appearances} from '../../web/ui.js';

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
test('player list shows the main nationality, counts the others, and the value with selected sorting',()=>{
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'},ESP:{name:'Espagne',display_code:'ESP',flag:'es'},POR:{name:'Portugal',display_code:'POR',flag:'pt'},XOP:{name:'Angola',display_code:'Angola',flag:'ao'}});
 const html=playerTable({items:[player],total:1,page_size:30},true,'value');
 // The main nationality with its flag; the others are counted and named in a tooltip.
 assert.match(html,/title="France"/);assert.match(html,/<span class="muted" title="Espagne">\+1<\/span>/);
 assert.match(html,/flags\/fr.svg/);assert.doesNotMatch(html,/flags\/es.svg/);
 assert.match(html,/data-order="desc" data-sort="value">VALEUR</);assert.match(html,/1,3/);
 const imported=playerTable({items:[{...player,nationalities:['POR','XOP'],nationality_names:['Portugal','Angola']}],total:1,page_size:30},true);
 assert.match(imported,/POR/);assert.match(imported,/title="Angola">\+1</);assert.doesNotMatch(imported,/XOP/);
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
 assert.match(players,/data-order="desc" data-sort="potential">POT\.</);assert.match(players,/title="Potentiel sur 200">183</);
 const squad=playerTable({items:[{...player,potential:91.5}],total:1,page_size:30},false,'potential','asc');
 assert.ok(squad.indexOf('NIV.')<squad.indexOf('POT.')&&squad.indexOf('POT.')<squad.indexOf('VALEUR'));
 assert.match(squad,/data-order="asc" data-sort="potential">POT\.</);assert.match(squad,/title="Potentiel sur 200">183</);
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
 // Each header also names its column, which sets its width whatever the order of the rows.
 const headers=[...html.matchAll(/<th class="(\w+)-column"><button[^>]*data-sort="(\w+)"/g)].map(match=>{assert.equal(match[1],match[2]);return match[2];});
 assert.deepEqual(headers,['position','name','nation','age','rating','potential','value','wage','contract_end','fitness','form','morale','appearances','goals','assists','yellows','reds','average']);
 assert.equal((html.match(/<th(?: [^>]*)?>(?!<button)/g)||[]).length,0);
 assert.match(html,/<button data-first="asc" data-order="asc" data-sort="position">POSTE</);
 assert.match(html,/<button data-first="desc" data-sort="rating">NIV\.<\/button>/);
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

test('figures stand on the right of their column, and the condition has its bar',()=>{
 const html=playerTable({items:[{...player,fitness:.77}],total:1,page_size:30});
 assert.match(html,/<td><span class="num">20<\/span><\/td>/);
 assert.match(html,/<span class="num">1,3\sM\s€<\/span>/);
 assert.match(html,/<span class="status"><i class="mini-bar" aria-hidden="true"><i style="width:77%"><\/i><\/i>77%<\/span>/);
});

test('a list beside a preview marks the picked row and lets each row be picked; its pages can stand elsewhere',()=>{
 const items=[player,{...player,id:2}];
 const html=playerTable({items,total:90,page_size:30,page:1},true,'value','desc',{select:2,pager:false});
 assert.match(html,/<tr class="" data-select="1">/);assert.match(html,/<tr class="selected" data-select="2">/);
 assert.doesNotMatch(html,/class="pager"/);
 const plain=playerTable({items,total:90,page_size:30,page:1},true);
 assert.doesNotMatch(plain,/data-select|selected/);assert.match(plain,/class="pager"/);
});

test('appearances show the substitute entries in brackets after the starts',()=>{
 assert.equal(appearances(15,3),'12 (3)');
 assert.equal(appearances(12,0),'12');
 assert.equal(appearances(12),'12');
 assert.equal(appearances(3,3),'0 (3)');
});

test('the player list shows the lowest fee a club accepts, sortable, or that it will not sell',()=>{
 const html=playerTable({items:[{...player,asking_price:25100000,transferable:true},{...player,id:2,asking_price:null,transferable:false}],total:2,page_size:30},true,'asking_price','desc',{asking:true});
 assert.match(html,/data-sort="asking_price"/);assert.match(html,/data-order="desc" data-sort="asking_price">PRIX MIN\.</);
 assert.match(html,/25,1\sM\s?€/);
 assert.match(html,/<span class="muted">Intransférable<\/span>/);
 assert.doesNotMatch(playerTable({items:[player],total:1,page_size:30},true),/PRIX MIN/);
});

test('with a club of his own the user reads what a player asks to join it and whether he accepts to',()=>{
 const items=[{...player,wage_demand:71539,interested:true},{...player,id:2,wage_demand:21462,interested:false},{...player,id:3,wage_demand:null,interested:null}];
 const html=playerTable({items,total:3,page_size:30},true,'wage_demand','desc',{asking:true,recruiting:true});
 assert.match(html,/<th class="wage_demand-column"><button data-first="desc" data-order="desc" data-sort="wage_demand">PRÉTENTIONS</);
 assert.match(html,/<th class="interested-column"><button data-first="desc" data-sort="interested">INTÉRESSÉ</);
 assert.ok(html.indexOf('SALAIRE / MOIS')<html.indexOf('PRÉTENTIONS')&&html.indexOf('PRÉTENTIONS')<html.indexOf('INTÉRESSÉ')&&html.indexOf('INTÉRESSÉ')<html.indexOf('CONTRAT'));
 // The demand reads as a monthly wage; a player of the user's own club has neither.
 const cells=[...html.matchAll(/<tr class="">(.*?)<\/tr>/g)].map(row=>[...row[1].matchAll(/<td>(.*?)<\/td>/g)].map(cell=>cell[1]).slice(10,12));
 assert.deepEqual(cells.map(([demand,interest])=>[demand.replace(/\D/g,''),interest]),[['310000','Oui'],['93000','<span class="muted">Non</span>'],['','—']]);
 // The switch keeps the sort where the columns are; other lists have neither column.
 assert.match(playerViewSwitch(null,'wage_demand','desc',true,{asking:true,recruiting:true}),/data-view="infos"[^>]*data-view-sort="wage_demand"/);
 assert.doesNotMatch(playerTable({items,total:3,page_size:30},true,'value','desc',{asking:true}),/PRÉTENTIONS|INTÉRESSÉ/);
});

const attributes={passe:70,technique:60,finition:81,tacle:20,jeu_tete:55,vision:62,placement:30,sang_froid:66,vitesse:74,endurance:50,reflexes:10,sorties:8,relance:12,centre:40,cpa:35};
test('the attribute view lists the attributes out of 20 by section, Général, Défense, Attaque then Gardien, under their headings',()=>{
 const html=playerTable({items:[{...player,attributes}],total:1,page_size:30},false,'finition','desc',{view:'attributs'});
 const keys=[...html.matchAll(/data-sort="(\w+)"/g)].map(match=>match[1]);
 assert.deepEqual(keys,['position','name','age','rating','potential','passe','vitesse','endurance','tacle','placement','finition','sang_froid','technique','vision','jeu_tete','centre','cpa','reflexes','sorties','relance']);
 assert.doesNotMatch(html,/VALEUR|SALAIRE|CONTRAT|data-sort="goals"/);
 // Each heading spans its section on a first header row; the other headers span both rows.
 assert.deepEqual([...html.matchAll(/<th colspan="(\d+)" class="column-group">([^<]+)</g)].map(match=>`${match[2]}:${match[1]}`),['Général:3','Défense:2','Attaque:7','Gardien:3']);
 assert.equal((html.match(/<th rowspan="2"/g)||[]).length,5);
 assert.match(html,/<th rowspan="2" class="name-column">/);
 // The columns under a heading take their width from a <col>, a line opening each section.
 assert.equal((html.match(/<col class="grouped/g)||[]).length,15);assert.equal((html.match(/<col class="grouped group-start">/g)||[]).length,4);
 // Same badges as the player page: 1 to 20 on the red-yellow-green scale, the full name in the header's tooltip.
 assert.match(html,/<span class="rating graded" style="--hue:120" title="Finition sur 20">16</);
 assert.match(html,/<span class="rating graded" style="--hue:0" title="Tacle sur 20">4</);
 assert.match(html,/data-order="desc" data-sort="finition"><span title="Finition">FIN<\/span></);
 assert.equal(playerTable({items:[{...player,attributes}],total:1,page_size:30},true,'rating','desc',{view:'attributs'}).match(/data-sort="(\w+)"/g)[5],'data-sort="club"');
});

test('in the attribute view, what the player page hides or folds away fades',()=>{
 const faded=position=>[...playerTable({items:[{...player,position,attributes}],total:1,page_size:30},false,'position','asc',{view:'attributs'}).matchAll(/<span class="off-role"><span[^>]*title="([^"]+) sur 20"/g)].map(match=>match[1]);
 assert.deepEqual(faded('BU'),['Réflexes','Sorties','Relance']);
 assert.deepEqual(faded('GB'),['Tacle','Finition','Sang-froid','Technique','Vision','Jeu de tête','Centres','Coups arrêtés']);
 assert.doesNotMatch(playerTable({items:[{...player,attributes:undefined}],total:1,page_size:30},false,'position','asc',{view:'attributs'}),/NaN|undefined/);
});

test('the view switch marks the open view and carries the sort over only when the other view has its column',()=>{
 const players=playerViewSwitch(null,'value','desc',true,{asking:true});
 assert.match(players,/<button type="button" data-view="infos" aria-pressed="true" class="active" data-view-sort="value" data-view-order="desc">Infos<\/button>/);
 assert.match(players,/<button type="button" data-view="attributs" aria-pressed="false" class="">Attributs<\/button>/);
 const squad=playerViewSwitch('attributs','age','asc');
 assert.match(squad,/data-view="infos" aria-pressed="false" class="" data-view-sort="age" data-view-order="asc">/);
 assert.match(squad,/data-view="attributs" aria-pressed="true" class="active"/);
 assert.doesNotMatch(playerViewSwitch('attributs','passe','desc'),/data-view="infos"[^>]*data-view-sort/);
});

const composites={progression_attaque:55,occasion_attaque:45.5,tir:78,tete:64.5,progression_defense:41,occasion_defense:32,arret:23.5,sortie:22};
test('the game view lists the composites out of 200 by section, Attaque, Défense then Gardien, under their headings',()=>{
 const html=playerTable({items:[{...player,composites,key_composites:['tir','occasion_attaque','tete']}],total:1,page_size:30},false,'tir','desc',{view:'jeu'});
 assert.deepEqual([...html.matchAll(/data-sort="(\w+)"/g)].map(match=>match[1]),
  ['position','name','age','rating','potential','progression_attaque','occasion_attaque','tir','tete','progression_defense','occasion_defense','arret','sortie']);
 assert.deepEqual([...html.matchAll(/<th colspan="(\d+)" class="column-group">([^<]+)</g)].map(match=>`${match[2]}:${match[1]}`),['Attaque:4','Défense:2','Gardien:2']);
 assert.equal((html.match(/<col class="grouped group-start">/g)||[]).length,3);
 assert.match(html,/data-order="desc" data-sort="tir"><span title="Frappe">FRA<\/span></);
 // Those the player's position asks for in colour, the others grey.
 assert.match(html,/<td><span class="rating graded" style="--hue:120" title="Frappe sur 200">156</);
 assert.deepEqual([...html.matchAll(/<span class="off-role"><span[^>]*title="([^"]+) sur 200"/g)].map(match=>match[1]),
  ['Progression','Défense au milieu','Défense de surface','Arrêts','Sorties aériennes']);
 assert.doesNotMatch(playerTable({items:[{...player,composites:undefined}],total:1,page_size:30},false,'position','asc',{view:'jeu'}),/NaN|undefined/);
});

test('the view switch offers the game view beside the infos and the attributes',()=>{
 assert.match(playerViewSwitch('jeu','tir','desc'),/data-view="attributs" aria-pressed="false" class="">Attributs<\/button><button type="button" data-view="jeu" aria-pressed="true" class="active"/);
 assert.match(playerViewSwitch('attributs','rating','desc'),/data-view="jeu" aria-pressed="false" class="" data-view-sort="rating" data-view-order="desc">Jeu</);
 assert.doesNotMatch(playerViewSwitch('attributs','passe','desc'),/data-view="jeu"[^>]*data-view-sort/);
});

test('the squad shows form as its signed effect and morale with where it drifts and, when low, its cause',()=>{
 const rows=[{...player,form:1.111,morale:.63,morale_target:.66,morale_cause:'salaire',wage_satisfaction:.1,playing_time_satisfaction:1},
  {...player,id:2,form:.913,morale:.44,morale_target:.34,morale_cause:'temps_de_jeu',wage_satisfaction:.6,playing_time_satisfaction:.1},
  {...player,id:3,form:1.018,morale:.99,morale_target:1,morale_cause:null,wage_satisfaction:1,playing_time_satisfaction:1}];
 const html=playerTable({items:rows,total:3,page_size:30},false,'form','desc');
 assert.match(html,/data-order="desc" data-sort="form">FORME</);assert.match(html,/data-sort="morale">MORAL</);
 // +11 % in green, −9 % in red, grey within 2 %.
 assert.match(html,/<span class="rating graded form-badge" style="--hue:120" title="Forme 1,11 : tout ce qu&#39;il fait en match compte 11 % de plus">\+11 %</);
 assert.match(html,/style="--hue:0" title="Forme 0,91 : tout ce qu&#39;il fait en match compte 9 % de moins">−9 %</);
 assert.match(html,/<span class="rating form-badge neutral" title="Forme 1,02 : il joue à son niveau">\+2 %</);
 // Morale: an arrow towards its target, the cause below 70 %, the detail in the tooltip.
 assert.match(html,/<span class="morale-cell" title="Moral 63 %, vers 66 % · pèse surtout : son salaire · salaire : 10 % de ce qu&#39;il attend · temps de jeu : 100 % de ce qu&#39;il attend"><span class="rating graded" style="--hue:\d+">63 %<\/span><span class="trend-slot"><span class="trend up">▲<\/span><\/span><span class="morale-cause">€<\/span>/);
 assert.match(html,/>44 %<\/span><span class="trend-slot"><span class="trend down">▼<\/span><\/span><span class="morale-cause">◷</);
 assert.match(html,/>99 %<\/span><span class="trend-slot"><\/span><\/span>/);
 // Players lists of the whole world keep their columns.
 assert.doesNotMatch(playerTable({items:rows,total:3,page_size:30},true),/data-sort="(form|morale)"/);
 assert.doesNotMatch(playerTable({items:[player],total:1,page_size:30}),/NaN|undefined/);
});
