import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clubNavigation,playerNavigation,competitionNavigation,europeNavigation,editionNavigation} from '../../web/navigation.js';
import {heading} from '../../web/ui.js';

const group=(items,index,scope)=>({scope,index,total:items.length,items,previous:items[index-1]??null,next:items[index+1]??null});
const division=(index)=>group([{id:3,name:'Ajax'},{id:2,name:'Élan'},{id:1,name:'Zebra'}],index,{kind:'division',id:16,name:'Ligue 1'});
const count=(html,pattern)=>(html.match(pattern)||[]).length;

test('a club steps to its neighbours with two chevrons and lists its division in the charter’s menu',()=>{
 const html=clubNavigation(division(1),'squad');
 // The chevrons of a season's steps, turned: up to the one before, down to the one after; neither is a filled triangle.
 assert.match(html,/<a class="entity-step prev" href="#\/club\/3\/squad" rel="prev" aria-label="Précédent : Ajax" title="Précédent : Ajax"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6\.5 14\.5 12 9l5\.5 5\.5"\/><\/svg><\/a>/);
 assert.match(html,/<a class="entity-step next" href="#\/club\/1\/squad" rel="next" aria-label="Suivant : Zebra" title="Suivant : Zebra"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6\.5 9\.5 12 15l5\.5-5\.5"\/><\/svg><\/a>/);
 // previous above the menu, next below: the column reads top to bottom like the list
 assert.ok(html.indexOf('entity-step prev')<html.indexOf('<details class="entity-menu">')&&html.indexOf('<details class="entity-menu">')<html.indexOf('entity-step next'));
 // Three lines open the list; the count of the group is their tooltip, and the list has no heading.
 assert.match(html,/<summary aria-label="Choisir un club de Ligue 1" title="Ligue 1 · 2 \/ 3"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7\.5h14M5 12h14M5 16\.5h14"\/><\/svg><\/summary>/);
 assert.match(html,/<\/summary><div class="menu" role="menu" aria-label="Choisir un club de Ligue 1"><a /);
 assert.doesNotMatch(html,/entity-menu-scope|entity-menu-panel|<ul|<li/);
 assert.equal(count(html,/role="menuitemradio"/g),3);
 assert.match(html,/<a href="#\/club\/2\/squad" role="menuitemradio" aria-checked="true">Élan<\/a>/);assert.equal(count(html,/aria-checked="true"/g),1);
 assert.match(html,/<a href="#\/club\/3\/squad" role="menuitemradio" aria-checked="false">Ajax<\/a>/);
 assert.doesNotMatch(html,/<select|<option/);
});

test('moving to another club keeps the open tab',()=>{
 const html=clubNavigation(division(1),'finances');
 assert.equal(count(html,/href="#\/club\/\d+\/finances"/g),5);  // two chevrons and the three entries of the menu
 // and the columns of the squad list
 assert.equal(count(clubNavigation(division(1),'squad','vue=attributs'),/href="#\/club\/\d+\/squad\?vue=attributs"/g),5);
});

test('the ends of the group have a faded chevron instead of a link, so the column keeps its shape',()=>{
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
 assert.match(html,/<a href="#\/club\/1\/squad" role="menuitemradio" aria-checked="true">Borussia \(28 joueurs\)<\/a>/);
 assert.match(html,/<a href="#\/club\/4\/squad" role="menuitemradio" aria-checked="false">Union \(1 joueur\)<\/a>/);
 assert.match(html,/<a href="#\/club\/3\/squad" role="menuitemradio" aria-checked="false">Hertha<\/a>/);
});

test('players step through their squad, each listed with the colour of its position',()=>{
 const nav=group([{id:10,name:'Gardien',position:'GB'},{id:11,name:'Défenseur',position:'DC'},{id:12,name:'Buteur',position:'BU'}],1,{kind:'club',id:7,name:'Lens'});
 const html=playerNavigation(nav);
 assert.match(html,/href="#\/player\/10" rel="prev" aria-label="Précédent : Gardien"/);assert.match(html,/href="#\/player\/12" rel="next" aria-label="Suivant : Buteur"/);
 // each after the badge of his position, in one cell: the name stays beside it, in the ink of the list
 assert.match(html,/<a href="#\/player\/10" role="menuitemradio" aria-checked="false"><div class="cell"><span class="position gk">GB<\/span>Gardien<\/div><\/a>/);
 assert.match(html,/<a href="#\/player\/12" role="menuitemradio" aria-checked="false"><div class="cell"><span class="position att">BU<\/span>Buteur<\/div><\/a>/);
 assert.match(html,/<a href="#\/player\/11" role="menuitemradio" aria-checked="true"><div class="cell"><span class="position def">DC<\/span>/);
 assert.match(html,/Effectif · Lens · 2 \/ 3/);
});

test('competitions of a country link to each competition page, cup included',()=>{
 const nav=group([{id:16,name:'Ligue 1',kind:'league'},{id:17,name:'Ligue 2',kind:'league'},{id:-1,name:'Coupe de France',kind:'cup'}],1,{kind:'country',code:'FRA',name:'France'});
 const html=competitionNavigation(nav);
 assert.match(html,/href="#\/league\/16" rel="prev" aria-label="Précédent : Ligue 1"/);assert.match(html,/href="#\/league\/-1" rel="next" aria-label="Suivant : Coupe de France"/);
 // each listed after its badge, as a player after his position
 assert.match(html,/<a href="#\/league\/16" role="menuitemradio" aria-checked="false"><div class="cell"><span class="competition-code league" title="Ligue 1">L1<\/span>Ligue 1<\/div><\/a>/);
 assert.match(html,/<a href="#\/league\/-1" role="menuitemradio" aria-checked="false"><div class="cell"><span class="competition-code cup" title="Coupe de France">CdF<\/span>Coupe de France<\/div><\/a>/);
 assert.match(html,/Compétitions · France · 2 \/ 3/);
});

test('the European cups step to one another, the open tab and the season kept',()=>{
 const cups=[{id:-101,code:'C1',name:'Ligue des champions',kind:'europe'},{id:-103,code:'C3',name:'Ligue Europa',kind:'europe'},{id:-104,code:'C4',name:'Conference League',kind:'europe'}];
 const html=europeNavigation(cups,cups[0],'knockout','saison=2031');
 assert.match(html,/<span class="entity-step prev" aria-hidden="true">/);
 assert.match(html,/href="#\/europe\/C3\/knockout\?saison=2031" rel="next" aria-label="Suivant : Ligue Europa"/);
 assert.match(html,/<summary aria-label="Choisir une coupe d’Europe" title="Coupes d’Europe · 1 \/ 3">/);
 assert.match(html,/<a href="#\/europe\/C4\/knockout\?saison=2031" role="menuitemradio" aria-checked="false"><div class="cell"><span class="competition-code europe" title="Conference League">C4<\/span>Conference League<\/div><\/a>/);
 assert.equal(count(europeNavigation(cups,cups[2],'table'),/href="#\/europe\/C\d\/table"/g),4);
 // a single cup has nothing to step to
 assert.equal(europeNavigation(cups.slice(0,1),cups[0],'table'),'');
});

test('the editions of the selections step from the first to the latest, whatever the order they come in',()=>{
 const editions=[{year:2032,name:'Euro 2032',code:'EU'},{year:2030,name:'Coupe du monde 2030',code:'CM'},{year:2028,name:'Euro <2028>',code:'EU'}];
 const html=editionNavigation(editions,2030,'qualifications');
 assert.match(html,/href="#\/international\/2028\/qualifications" rel="prev" aria-label="Précédent : Euro &lt;2028&gt;"/);
 assert.match(html,/href="#\/international\/2032\/qualifications" rel="next" aria-label="Suivant : Euro 2032"/);
 assert.match(html,/<summary aria-label="Choisir une édition" title="Éditions · 2 \/ 3">/);
 assert.match(html,/<div class="menu" role="menu" aria-label="Choisir une édition"><a href="#\/international\/2028\/qualifications" role="menuitemradio" aria-checked="false"><div class="cell"><span class="competition-code international" title="Euro &lt;2028&gt;">EU<\/span>Euro &lt;2028&gt;<\/div><\/a>/);
 assert.match(html,/<a href="#\/international\/2030\/qualifications" role="menuitemradio" aria-checked="true"><div class="cell"><span class="competition-code international" title="Coupe du monde 2030">CM<\/span>/);
 assert.doesNotMatch(editionNavigation(editions,2032,'finals'),/rel="next"/);
});

test('names are escaped wherever they appear',()=>{
 const nav=group([{id:1,name:'A<b>"&'},{id:2,name:'Milieu'},{id:3,name:'Z\'x'}],1,{kind:'division',id:16,name:'L<i>1'});
 const html=clubNavigation(nav,'squad');
 assert.doesNotMatch(html,/<b>|<i>/);assert.match(html,/A&lt;b&gt;&quot;&amp;/);assert.match(html,/Z&#39;x/);assert.match(html,/L&lt;i&gt;1/);
 const players=playerNavigation(group([{id:1,name:'<img src=x>',position:'GB'},{id:2,name:'Autre',position:'DC'}],1,{kind:'club',id:7,name:'Club <b>'}));
 assert.doesNotMatch(players,/<img|<b>/);
});

test('a page’s heading is its title, then its commands; the block stepping between peers stands in a band, not there',()=>{
 assert.equal(heading('Ligue 1'),'<div class="page-heading"><div><h1>Ligue 1</h1></div></div>');
 assert.equal(heading('A<b>','<span class="pill">extra</span>'),'<div class="page-heading"><div><h1>A&lt;b&gt;</h1></div><span class="pill">extra</span></div>');
});
