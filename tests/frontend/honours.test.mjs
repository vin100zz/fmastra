import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {honoursScreen,pickClub} from '../../web/honours.js';

const club=(id,name)=>({id,name});
const block=(id,name,kind,level,items,code=null,extra={})=>({id,name,kind,level,code,scorer:null,current:null,items:items.map(([season,champion,nation='FRA'])=>({season,champion,nation})),...extra});
const counts=(europe,league,cup,lower)=>({europe,league,cup,lower,total:europe+league+cup+lower});
const data={
 season:2027,
 europe:[block(-101,'Ligue des champions','europe',0,[[2026,club(3,'Milan'),'ITA'],[2025,club(1,'Paris')]],'C1',{scorer:{player_id:9,player:'Buteur <i>',goals:31},current:{label:'Phase de ligue · Journée 1'}}),
  block(-103,'Ligue Europa','europe',0,[],'C3'),block(-104,'Conference League','europe',0,[],'C4')],
 countries:[
  {code:'ESP',name:'Espagne',competitions:[block(67,'La Liga','league',1,[[2025,club(7,'Madrid'),'ESP']]),block(68,'La Liga 2','league',2,[]),block(-2,'Coupe du Roi','cup',0,[])]},
  {code:'FRA',name:'France',competitions:[block(16,'Ligue 1','league',1,[[2026,club(2,'Lyon <b>')],[2025,club(1,'Paris')]],null,{current:{leader:club(1,'Paris'),round:3}}),block(17,'Ligue 2','league',2,[]),block(18,'National','league',3,[]),
   // the cup of the season under way is already won
   block(-3,'Coupe de France','cup',0,[[2027,club(1,'Paris')],[2026,club(1,'Paris')]])]},
  {code:'ENG',name:'Angleterre',competitions:[block(11,'Premier League','league',1,[]),block(-1,'FA Cup','cup',0,[])]},
 ],
 clubs:[{club:club(1,'Paris'),nation:'FRA',...counts(1,1,2,0)},{club:club(3,'Milan'),nation:'ITA',...counts(1,0,0,0)},{club:club(2,'Lyon <b>'),nation:'FRA',...counts(0,1,0,0)},{club:club(7,'Madrid'),nation:'ESP',...counts(0,1,0,0)}],
 players:[{player_id:11,player:'Titré',position:'MC',club:club(1,'Paris'),...counts(1,1,0,0)},{player_id:12,player:'Ancien',position:null,club:null,...counts(0,1,0,0)}],
 scorers:[{player_id:9,player:'Buteur <i>',titles:3,goals:60,competitions:[{id:-101,name:'Ligue des champions',code:'C1',titles:2},{id:16,name:'Ligue 1',code:null,titles:1}]}],
 nations:[{code:'ITA',name:'Italie',titles:[1,0,0],total:1},{code:'FRA',name:'France',titles:[1,0,0],total:1}]};
const count=(html,pattern)=>(html.match(pattern)||[]).length;
async function screen(payload=data,query=''){
 const previous=globalThis.fetch;
 let requested;
 globalThis.fetch=async url=>{requested=url;return {ok:true,json:async()=>payload};};
 try{return {html:await honoursScreen(new URLSearchParams(query)),requested};}finally{globalThis.fetch=previous;}
}
const part=(html,from,to)=>html.slice(html.indexOf(from),to?html.indexOf(to):undefined);

test('the honours page is one table: a row per competition by group in the order of the menu, a column per season',async()=>{
 const {html,requested}=await screen();
 assert.equal(requested,'/api/monde/palmares');
 assert.match(html,/^<form class="toolbar" data-filter><h1>Palmarès<\/h1><input name="recherche" type="search"/);
 const matrix=part(html,'honours-matrix','honours-lists');
 assert.match(matrix,/<h2>12 compétitions · 2 saisons<\/h2>/);
 assert.equal(count(matrix,/<tbody>/g),4);assert.equal(count(matrix,/class="competition-code/g),12);
 // Europe, then France, England and Spain, whatever the order the server answered in; a group names itself once, over its rows
 assert.ok(matrix.indexOf('Europe')<matrix.indexOf('Coupe de France')&&matrix.indexOf('Coupe de France')<matrix.indexOf('FA Cup')&&matrix.indexOf('FA Cup')<matrix.indexOf('Coupe du Roi'));
 assert.match(matrix,/<td class="honours-nation" rowspan="3"><a href="#\/europe">Europe<\/a>/);
 assert.match(matrix,/<td class="honours-nation" rowspan="4"><a href="#\/country\/FRA">France<\/a>/);
 // the season under way first, then the past ones from the latest
 assert.match(matrix,/<th class="current">2027 \/ 2028<span class="honours-live">EN COURS<\/span><\/th><th>2026 \/ 2027<\/th><th>2025 \/ 2026<\/th><\/tr>/);
 assert.equal(count(matrix,/<th>2027 \/ 2028/g),0);
});

test('a row gives the competition, its leading scorer, where the season stands and the champion of each past season',async()=>{
 const {html}=await screen();
 const matrix=part(html,'honours-matrix','honours-lists');
 // the name opens the history of the competition, after what it is
 assert.match(matrix,/<a href="#\/europe\/C1\/history"><span class="competition-code europe" title="Ligue des champions">C1<\/span><span class="strong">Ligue des champions<\/span><\/a>/);
 assert.match(matrix,/<a href="#\/league\/16\/history"><span class="competition-code league" title="Ligue 1">L1<\/span>/);
 assert.match(matrix,/<a href="#\/league\/18\/history"><span class="competition-code league" title="National">L3<\/span>/);
 assert.match(matrix,/<a href="#\/league\/-3\/history"><span class="competition-code cup" title="Coupe de France">CF<\/span>/);
 assert.match(matrix,/<a href="#\/player\/9">Buteur &lt;i&gt;<\/a><b>31<\/b>/);
 // under way: the round to come, the leader of a league with its rounds played, or the champion once known
 assert.match(matrix,/<td class="current">Phase de ligue · Journée 1<\/td>/);
 assert.match(matrix,/<td class="current"><span class="honours-pair"><a href="#\/club\/1" class="club-link">Paris<\/a><small>J3<\/small><\/span><\/td>/);
 assert.match(matrix,/<td class="current" data-honours-club="1"><span class="strong"><a href="#\/club\/1" class="club-link">Paris<\/a><\/span><\/td><td class="" data-honours-club="1">/);
 // a season without a champion, a competition without a scorer or a calendar: a dash
 assert.match(matrix,/Ligue 2<\/span><\/a><\/td><td>—<\/td><td class="current">—<\/td><td>—<\/td><td>—<\/td><\/tr>/);
 // a club name is text, never markup
 assert.match(matrix,/Lyon &lt;b&gt;/);assert.doesNotMatch(html,/Lyon <b>/);
});

test('the titled clubs stand beside the table, searched by name, and the picked one is lit in both',async()=>{
 const {html}=await screen();
 const board=part(html,'honours-board');
 assert.match(board,/<h2>4 clubs titrés<\/h2>/);
 assert.equal(count(board,/data-honours-club="/g),4);
 assert.match(board,/<th class="count-column"[^>]*><button class="sort-toggle" data-table-sort><span title="Coupes d’Europe">EUR<\/span><\/button><\/th>/);
 // a count of zero is left blank
 assert.match(board,/data-honours-club="3"><td[^>]*><span class="num">2<\/span><\/td><td[^>]*>.*?Milan.*?<\/td><td[^>]*><span class="num">1<\/span><\/td><td[^>]*><span class="num"><\/span><\/td>/);
 assert.doesNotMatch(html,/class="picked"|class=" picked"|current picked/);
 const picked=(await screen(data,'sel=1')).html;
 assert.equal(count(picked,/<td class="picked" data-honours-club="1">/g),3);assert.equal(count(picked,/<td class="current picked" data-honours-club="1">/g),1);
 assert.match(picked,/<tr class="picked"[^>]* data-honours-club="1">/);
 // a search keeps the rank a club has among all, without accents or case
 const found=part((await screen(data,'recherche=MIL')).html,'honours-board');
 assert.equal(count(found,/data-honours-club="/g),1);
 assert.match(found,/<h2>4 clubs titrés<\/h2>/);assert.match(found,/<td[^>]*><span class="num">2<\/span><\/td><td[^>]*>.*?Milan/);
 assert.match(part((await screen(data,'recherche=zzz')).html,'honours-board'),/Aucun résultat/);
});

test('three rankings stand under the table: the players by titles, by seasons ended as leading scorer, and the European cups by country',async()=>{
 const {html}=await screen();
 const lists=part(html,'honours-lists','honours-board');
 assert.equal(count(lists,/class="card honours-table"/g),3);
 assert.match(lists,/<h2>Joueurs les plus titrés<\/h2>/);
 // the club a player is at now goes by its kit, named in its tooltip
 const kit={...club(1,'Paris'),major_color:'#004070',minor_color:'#d82818'};
 const dressed=part((await screen({...data,players:[{...data.players[0],club:kit},data.players[1]]})).html,'honours-lists','honours-board');
 assert.match(dressed,/<span class="position mid">MC<\/span><\/td><td[^>]*><span title="Paris"><i class="kit-dot" style="background:linear-gradient\(135deg,#004070 50%,#d82818 50%\)" aria-hidden="true"><\/i><\/span><span class="strong"><a href="#\/player\/11">Titré<\/a><\/span><\/td>/);
 // a retired player has neither a position nor a club left
 assert.match(lists,/<td[^>]*><\/td><td[^>]*><span class="strong"><a href="#\/player\/12">Ancien<\/a><\/span><\/td>/);
 assert.match(lists,/<h2>Titres de meilleur buteur<\/h2>/);
 assert.match(lists,/Buteur &lt;i&gt;<\/a><\/span><\/td><td[^>]*><span class="honours-where" title="C1 ×2 · Ligue 1">C1 ×2 · Ligue 1<\/span><\/td><td[^>]*><span class="num"><b>3<\/b><\/span><\/td><td[^>]*><span class="num">60<\/span><\/td>/);
 assert.match(lists,/<h2>Coupes d’Europe par pays<\/h2>/);
 assert.match(lists,/<th[^>]*><button class="sort-toggle" data-table-sort>PAYS<\/button><\/th><th class="count-column"[^>]*><button class="sort-toggle" data-table-sort>C1<\/button><\/th><th class="count-column"[^>]*><button class="sort-toggle" data-table-sort>C3<\/button><\/th><th class="count-column"[^>]*><button class="sort-toggle" data-table-sort>C4<\/button><\/th><th class="total-column"[^>]*><button class="sort-toggle" data-table-sort>TOTAL<\/button><\/th>/);
 assert.ok(lists.indexOf('Italie')<lists.indexOf('France'));
});

test('before the first title, the table keeps every competition and the rankings are left out',async()=>{
 const empty={season:2025,europe:data.europe.map(item=>({...item,items:[],scorer:null,current:null})),countries:[{...data.countries[2]}],clubs:[],players:[],scorers:[],nations:[]};
 const {html}=await screen(empty);
 assert.match(html,/<h2>5 compétitions<\/h2>/);
 assert.equal(count(html,/class="competition-code/g),5);
 assert.match(html,/<th class="current">2025 \/ 2026<span class="honours-live">EN COURS<\/span><\/th><\/tr>/);
 assert.doesNotMatch(html,/honours-lists/);
 assert.match(part(html,'honours-board'),/<h2>0 club titré<\/h2>.*Pas encore de palmarès/);
 assert.doesNotMatch(html,/head-pager/);
});

test('more seasons than the table shows are paged from its head, the season under way staying first',async()=>{
 const years=Array.from({length:8},(_,index)=>2026-index);
 const long={...data,countries:[],europe:[block(-101,'Ligue des champions','europe',0,years.map(year=>[year,club(1,'Paris')]),'C1')]};
 const first=(await screen(long)).html,second=(await screen(long,'page=2')).html;
 // six past seasons a page outside a browser
 assert.match(first,/<h2>1 compétition · 8 saisons<\/h2><div class="head-pager"><span>1–6 sur 8<\/span>/);
 assert.match(first,/<th>2021 \/ 2022<\/th><\/tr>/);assert.doesNotMatch(first,/2020 \/ 2021/);
 assert.match(second,/<th class="current">2027 \/ 2028.*?<\/th><th>2020 \/ 2021<\/th><th>2019 \/ 2020<\/th><\/tr>/);
 // a page past the last one is the last one
 assert.match((await screen(long,'page=9')).html,/<span>7–8 sur 8<\/span>/);
});

test('picking a club marks every element carrying it, and picking it again lets go',()=>{
 const element=id=>{const classes=new Set();return {dataset:{honoursClub:String(id)},classList:{contains:name=>classes.has(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)},picked:()=>classes.has('picked')};};
 const elements=[element(1),element(2),element(1)],root={querySelectorAll:()=>elements};
 assert.equal(pickClub(root,1),'1');
 assert.deepEqual(elements.map(item=>item.picked()),[true,false,true]);
 assert.equal(pickClub(root,2),'2');
 assert.deepEqual(elements.map(item=>item.picked()),[false,true,false]);
 assert.equal(pickClub(root,'2'),null);
 assert.deepEqual(elements.map(item=>item.picked()),[false,false,false]);
});

test('the menu and the router know the honours page, and a click picks a club without drawing it again',async()=>{
 assert.match(await readFile(new URL('../../web/index.html',import.meta.url),'utf8'),/href="#\/honours" data-nav="honours"/);
 const app=await readFile(new URL('../../web/app.js',import.meta.url),'utf8');
 assert.match(app,/case 'honours':html=await honoursScreen\(params\)/);
 assert.match(app,/pickClub\(main,marked\.dataset\.honoursClub\)/);
});
