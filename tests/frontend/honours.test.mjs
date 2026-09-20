import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {honoursScreen} from '../../web/honours.js';

const club=(id,name)=>({id,name});
const block=(id,name,kind,level,items,code=null)=>({id,name,kind,level,code,items:items.map(([season,champion])=>({season,champion}))});
const data={
 europe:[block(-101,'Ligue des champions','europe',0,[[2026,club(3,'Milan')],[2025,club(1,'Paris')]],'C1'),block(-103,'Ligue Europa','europe',0,[],'C3'),block(-104,'Conference League','europe',0,[],'C4')],
 countries:[
  {code:'ESP',name:'Espagne',competitions:[block(67,'La Liga','league',1,[[2025,club(7,'Madrid')]]),block(68,'La Liga 2','league',2,[]),block(-2,'Coupe du Roi','cup',0,[])]},
  {code:'FRA',name:'France',competitions:[block(16,'Ligue 1','league',1,[[2026,club(2,'Lyon <b>')],[2025,club(1,'Paris')]]),block(17,'Ligue 2','league',2,[]),block(18,'National','league',3,[]),block(-3,'Coupe de France','cup',0,[[2026,club(1,'Paris')]])]},
  {code:'ENG',name:'Angleterre',competitions:[block(11,'Premier League','league',1,[]),block(-1,'FA Cup','cup',0,[])]},
 ]};
const count=(html,pattern)=>(html.match(pattern)||[]).length;

test('the honours page opens with the three European cups, then one row per country in the order of the menu',async()=>{
 const previous=globalThis.fetch;
 let requested;
 globalThis.fetch=async url=>{requested=url;return {ok:true,json:async()=>data};};
 try{
  const html=await honoursScreen();
  assert.equal(requested,'/api/monde/palmares');
  assert.match(html,/<h1>Palmarès<\/h1>/);
  assert.equal(count(html,/class="honours-row"/g),4);
  assert.ok(html.indexOf('Coupes d’Europe')<html.indexOf('Coupe de France'));
  // France, England, Spain, whatever the order the server answered in
  assert.ok(html.indexOf('Coupe de France')<html.indexOf('FA Cup')&&html.indexOf('FA Cup')<html.indexOf('Coupe du Roi'));
  assert.equal(count(html,/--blocks:3/g),2);assert.equal(count(html,/--blocks:4/g),1);assert.equal(count(html,/--blocks:2/g),1);  // Europe and Spain, France, England
  assert.match(html,/C1 · Ligue des champions/);
 }finally{globalThis.fetch=previous;}
});

test('a block lists its champions with the latest season first, and links to the history of the competition',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 try{
  const html=await honoursScreen();
  assert.ok(html.indexOf('2026 / 2027')<html.indexOf('2025 / 2026'));
  assert.match(html,/<a href="#\/club\/1" class="club-link">/);
  assert.match(html,/href="#\/league\/16\/history">Historique →/);
  assert.match(html,/href="#\/league\/-3\/history">Historique →/);
  assert.match(html,/href="#\/europe\/C1\/history">Historique →/);
  // a club name is text, never markup
  assert.match(html,/Lyon &lt;b&gt;/);assert.doesNotMatch(html,/Lyon <b>/);
 }finally{globalThis.fetch=previous;}
});

test('a competition without a champion yet keeps its block and says so',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({europe:data.europe.slice(1),countries:[data.countries[2]]})});
 try{
  const html=await honoursScreen();
  assert.equal(count(html,/class="card honours-block"/g),4);
  assert.equal(count(html,/Pas encore de palmarès/g),4);
  assert.doesNotMatch(html,/<table/);
 }finally{globalThis.fetch=previous;}
});

test('the menu and the router know the honours page',async()=>{
 assert.match(await readFile(new URL('../../web/index.html',import.meta.url),'utf8'),/href="#\/honours" data-nav="honours"/);
 assert.match(await readFile(new URL('../../web/app.js',import.meta.url),'utf8'),/case 'honours':html=await honoursScreen\(\)/);
});
