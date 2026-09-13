import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playerTable,minutes} from '../../web/ui.js';

const player={id:1,name:'Test',position:'BU',age:20,nation:'FRA',nationalities:['FRA','ESP'],nationality_names:['France','Espagne'],rating:70,value:1314589,wage:12000,fitness:1,contract_end:'2028-06-30',appearances:3,minutes:131.6,goals:2,assists:1,yellows:2,reds:1,average:7.5};
test('player list shows multiple nationalities and value with selected sorting',()=>{
 const html=playerTable({items:[player],total:1,page_size:30},true,'value');
 assert.match(html,/FRA \/ ESP/);assert.match(html,/France, Espagne/);
 assert.match(html,/VALEUR ↓/);assert.match(html,/1,3/);
 const imported=playerTable({items:[{...player,nationalities:['POR','XOP'],nationality_names:['Portugal','Angola']}],total:1,page_size:30},true);
 assert.match(imported,/POR \/ Angola/);assert.doesNotMatch(imported,/XOP/);
});
test('squad table includes season statistics and minutes have no decimals',()=>{
 const html=playerTable({items:[player],total:1,page_size:30});
 for(const key of ['appearances','minutes','goals','assists','yellows','reds','average'])assert.ok(html.includes(`data-sort="${key}"`));
 assert.equal(minutes(131.6),'132');assert.equal(minutes(0),'0');assert.doesNotMatch(minutes(11.2),/[,\.]/);
});
