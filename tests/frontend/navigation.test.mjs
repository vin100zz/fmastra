import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clubNavigation,playerNavigation,competitionNavigation} from '../../web/navigation.js';
import {heading} from '../../web/ui.js';

const group=(items,index,scope)=>({scope,index,total:items.length,items,previous:items[index-1]??null,next:items[index+1]??null});
const division=(index)=>group([{id:3,name:'Ajax'},{id:2,name:'Élan'},{id:1,name:'Zebra'}],index,{kind:'division',id:16,name:'Ligue 1'});
const count=(html,pattern)=>(html.match(pattern)||[]).length;

test('a club steps to its neighbours with two triangles and lists its division in a menu',()=>{
 const html=clubNavigation(division(1),'squad');
 assert.match(html,/<a class="entity-step prev" href="#\/club\/3\/squad" rel="prev" aria-label="Précédent : Ajax" title="Précédent : Ajax"><svg/);
 assert.match(html,/<a class="entity-step next" href="#\/club\/1\/squad" rel="next" aria-label="Suivant : Zebra" title="Suivant : Zebra"><svg/);
 // previous above the menu, next below: the block reads top to bottom like the list
 assert.ok(html.indexOf('entity-step prev')<html.indexOf('<details class="entity-menu">')&&html.indexOf('<details class="entity-menu">')<html.indexOf('entity-step next'));
 assert.match(html,/<summary aria-label="Choisir un club de Ligue 1" title="Ligue 1 · 2 \/ 3">/);
 assert.match(html,/<p class="entity-menu-scope">Ligue 1 · 2 \/ 3<\/p>/);
 assert.equal(count(html,/<li>/g),3);
 assert.match(html,/<li><a href="#\/club\/2\/squad" aria-current="true">Élan<\/a><\/li>/);assert.equal(count(html,/aria-current/g),1);
 assert.match(html,/<li><a href="#\/club\/3\/squad">Ajax<\/a><\/li>/);
 assert.doesNotMatch(html,/<select|<option/);
});

test('moving to another club keeps the open tab',()=>{
 const html=clubNavigation(division(1),'finances');
 assert.equal(count(html,/href="#\/club\/\d+\/finances"/g),5);  // two triangles and the three entries of the menu
});

test('the ends of the group have a greyed triangle instead of a link, so the block keeps its shape',()=>{
 const first=clubNavigation(division(0),'squad');
 assert.doesNotMatch(first,/rel="prev"/);assert.match(first,/<span class="entity-step prev" aria-hidden="true"><svg/);assert.match(first,/rel="next"/);
 const last=clubNavigation(division(2),'squad');
 assert.doesNotMatch(last,/rel="next"/);assert.match(last,/<span class="entity-step next" aria-hidden="true"><svg/);assert.match(last,/rel="prev"/);
 for(const html of [first,last])assert.equal(count(html,/class="entity-step /g),2);
});

test('there is nothing to show without a group or with a group of one',()=>{
 for(const render of [clubNavigation,playerNavigation,competitionNavigation])assert.equal(render(null,'squad'),'');
 assert.equal(clubNavigation(group([{id:1,name:'Seul'}],0,{kind:'division',id:1,name:'Ligue 1'}),'squad'),'');
});

test('a club outside any division steps through its country',()=>{
 const html=clubNavigation(group([{id:5,name:'Benfica B'},{id:6,name:'Porto B'}],0,{kind:'country',code:'POR',name:'Portugal'}),'squad');
 assert.match(html,/Tous les clubs · Portugal · 1 \/ 2/);
 assert.match(html,/aria-label="Choisir un club · Portugal"/);
});

test('homonymous clubs carry their squad size, other clubs do not',()=>{
 const nav=group([{id:1,name:'Borussia',squad:28},{id:2,name:'Borussia',squad:0},{id:3,name:'Hertha',squad:25},{id:4,name:'Union',squad:1},{id:5,name:'Union',squad:22}],0,{kind:'country',code:'GER',name:'Allemagne'});
 const html=clubNavigation(nav,'squad');
 assert.match(html,/rel="next" aria-label="Suivant : Borussia \(0 joueur\)"/);
 assert.match(html,/<li><a href="#\/club\/1\/squad" aria-current="true">Borussia \(28 joueurs\)<\/a><\/li>/);
 assert.match(html,/<li><a href="#\/club\/4\/squad">Union \(1 joueur\)<\/a><\/li>/);
 assert.match(html,/<li><a href="#\/club\/3\/squad">Hertha<\/a><\/li>/);
});

test('players step through their squad, each listed with the colour of its position',()=>{
 const nav=group([{id:10,name:'Gardien',position:'GB'},{id:11,name:'Défenseur',position:'DC'},{id:12,name:'Buteur',position:'BU'}],1,{kind:'club',id:7,name:'Lens'});
 const html=playerNavigation(nav);
 assert.match(html,/href="#\/player\/10" rel="prev" aria-label="Précédent : Gardien"/);assert.match(html,/href="#\/player\/12" rel="next" aria-label="Suivant : Buteur"/);
 assert.match(html,/<li><a href="#\/player\/10"><span class="position gk">GB<\/span><span>Gardien<\/span><\/a><\/li>/);
 assert.match(html,/<li><a href="#\/player\/12"><span class="position att">BU<\/span><span>Buteur<\/span><\/a><\/li>/);
 assert.match(html,/<a href="#\/player\/11" aria-current="true"><span class="position def">DC<\/span>/);
 assert.match(html,/Effectif · Lens · 2 \/ 3/);
});

test('competitions of a country link to each competition page, cup included',()=>{
 const nav=group([{id:16,name:'Ligue 1',kind:'league'},{id:17,name:'Ligue 2',kind:'league'},{id:-1,name:'Coupe de France',kind:'cup'}],1,{kind:'country',code:'FRA',name:'France'});
 const html=competitionNavigation(nav);
 assert.match(html,/href="#\/league\/16" rel="prev" aria-label="Précédent : Ligue 1"/);assert.match(html,/href="#\/league\/-1" rel="next" aria-label="Suivant : Coupe de France"/);
 assert.match(html,/<li><a href="#\/league\/-1">Coupe de France<\/a><\/li>/);
 assert.match(html,/Compétitions · France · 2 \/ 3/);
});

test('names are escaped wherever they appear',()=>{
 const nav=group([{id:1,name:'A<b>"&'},{id:2,name:'Milieu'},{id:3,name:'Z\'x'}],1,{kind:'division',id:16,name:'L<i>1'});
 const html=clubNavigation(nav,'squad');
 assert.doesNotMatch(html,/<b>|<i>/);assert.match(html,/A&lt;b&gt;&quot;&amp;/);assert.match(html,/Z&#39;x/);assert.match(html,/L&lt;i&gt;1/);
 const players=playerNavigation(group([{id:1,name:'<img src=x>',position:'GB'},{id:2,name:'Autre',position:'DC'}],1,{kind:'club',id:7,name:'Club <b>'}));
 assert.doesNotMatch(players,/<img|<b>/);
});

test('a heading carries the block at the left of its title, and is unchanged without one',()=>{
 const plain=heading('Ligue 1');
 assert.equal(plain,'<div class="page-heading"><div><h1>Ligue 1</h1></div></div>');
 const lead=competitionNavigation(group([{id:16,name:'Ligue 1',kind:'league'},{id:17,name:'Ligue 2',kind:'league'}],0,{kind:'country',code:'FRA',name:'France'}));
 const html=heading('Ligue 1','<span class="pill">extra</span>',lead);
 assert.match(html,/^<div class="page-heading"><div class="heading-with-lead"><div class="entity-nav"/);
 assert.ok(html.indexOf('class="entity-nav"')<html.indexOf('<h1>'));
 assert.match(html,/<h1>Ligue 1<\/h1><\/div><\/div><span class="pill">extra<\/span><\/div>$/);
 // the page title is read from the h1: the block must stay outside it
 assert.equal(html.match(/<h1>(.*?)<\/h1>/)[1],'Ligue 1');
});
