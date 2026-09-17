import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playerTable,minutes,seasonArchives,standingsTable,setNations} from '../../web/ui.js';

test('standings show promotion and relegation places from the API',()=>{
 const rows=[{rank:1,movement:'promotion'},{rank:4,movement:null},{rank:8,movement:'relegation'}].map(row=>({...row,club:{id:row.rank,name:'Club'},played:0,points:0,difference:0,form:''}));
 const html=standingsTable({items:rows});
 assert.equal((html.match(/title="Place de promotion"/g)||[]).length,1);
 assert.equal((html.match(/title="Place de relégation"/g)||[]).length,1);
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
 const html=playerTable({items:[{...player,potential_estimate:{lower:75,upper:90},promotion_date:'2025-07-01',academy_club:{id:1,name:'Centre'},data_at:'promotion'}],total:1,page_size:50},true,'','desc',{sortable:false,academy:true});
 assert.ok(html.indexOf('NIV.') < html.indexOf('POT. EST.'));
 assert.match(html,/150–180/);assert.match(html,/À la promotion/);assert.match(html,/CLUB FORMATEUR/);
 assert.doesNotMatch(html,/data-sort/);
 const missing=playerTable({items:[{id:2,name:'Retraité',nationalities:[],data_at:'unknown'}],total:1,page_size:50},true,'','desc',{sortable:false,academy:true});
 assert.match(missing,/Non archivées/);assert.doesNotMatch(missing,/NaN|undefined|0 €/);
});

test('season archives include full standings and open the latest season',()=>{
 const html=seasonArchives({items:[{season:2025,standings:[{rank:1,club:{id:1,name:'Champion'},played:34,won:20,drawn:10,lost:4,goals_for:60,goals_against:20,difference:40,points:70,form:'VVNVV'}]}]});
 assert.match(html,/open/);assert.match(html,/Classement complet/);assert.match(html,/Champion/);
 for(const label of ['BP','BC','PTS','FORME'])assert.ok(html.includes(`<th>${label}</th>`));
});
test('squad table includes season statistics and minutes have no decimals',()=>{
 const html=playerTable({items:[player],total:1,page_size:30});
 for(const key of ['appearances','minutes','goals','assists','yellows','reds','average'])assert.ok(html.includes(`data-sort="${key}"`));
 assert.equal(minutes(131.6),'132');assert.equal(minutes(0),'0');assert.doesNotMatch(minutes(11.2),/[,\.]/);
});
