import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roundContent} from '../../web/rounds.js';
import {leagueScreen} from '../../web/screens.js';
import {cupScreen} from '../../web/cups.js';
import {europeScreen} from '../../web/europe.js';
import {internationalScreen,editionContent} from '../../web/international.js';

const club=(id,name)=>({id,name});
const played={id:7,home:club(1,'Brighton'),away:club(2,'Nice'),score:[2,1],round:12,round_label:'Journée 12',
 scorers:[[{id:101,name:'Neal Maupay',minutes:['14','75']}],[{id:201,name:'Amine Gouiri',minutes:['26']}]]};
const row=(id,name,rank)=>({club:club(id,name),rank,played:12,won:6,drawn:3,lost:3,goals_for:20,goals_against:12,difference:8,points:21,form:'VVNDV',movement:null});
const league={round:{number:12,label:'Journée 12',date:'2026-11-08'},groups:[{name:null,matches:[played],standings:[row(1,'Brighton',1),row(2,'Nice',2)]}]};
const count=(html,pattern)=>(html.match(pattern)||[]).length;

async function withApi(answer,run){
 const previous=globalThis.fetch,urls=[];
 globalThis.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>answer(url)};};
 try{return {html:await run(),urls};}finally{globalThis.fetch=previous;}
}

test('a round lists its matches on the left, with each side’s scorers and their minutes, and the table on the right',()=>{
 const html=roundContent(league,'latest');
 assert.match(html,/<h2>Journée 12<\/h2>/);
 assert.match(html,/8 nov\. 2026/);
 assert.ok(html.indexOf('round-matches')<html.indexOf('round-table'));
 // surnames linked to the player, the minutes of each goal gathered per scorer
 assert.match(html,/<div class="fixture-scorers home"><a href="#\/player\/101" title="Neal Maupay">Maupay<\/a> \(14, 75\)<\/div><span><\/span><div class="fixture-scorers"><a href="#\/player\/201" title="Amine Gouiri">Gouiri<\/a> \(26\)<\/div>/);
 assert.match(html,/class="fixture with-scorers"/);
 // the whole table beside a single block, form included
 assert.match(html,/FORME/);
 assert.equal(count(html,/class="rank/g),2);
});

test('several scorers of one side follow each other; a goalless match or one to come has no scorers line',()=>{
 const scorers=[[{id:101,name:'Neal Maupay',minutes:['14']},{id:-5,name:'Renfort <b>',minutes:['45+2','90+1']}],[]];
 const html=roundContent({...league,groups:[{...league.groups[0],matches:[{...played,scorers},{...played,id:8,score:[0,0],scorers:[[],[]]},{...played,id:9,score:null,scorers:null}]}]},'latest');
 assert.match(html,/Maupay<\/a> \(14\), <span title="Renfort &lt;b&gt;">&lt;b&gt;<\/span> \(45\+2, 90\+1\)<\/div><span><\/span><div class="fixture-scorers"><\/div>/);
 assert.equal(count(html,/fixture-scorers home/g),1);
 assert.match(html,/À venir/);
});

test('groups show each group with its own compact table, and a cup round spreads its ties over two columns',()=>{
 const group=name=>({name,matches:[played],standings:[{...row(1,'A',1),movement:'qualified'},row(2,'B',2)]});
 const html=roundContent({round:{number:3,label:'Qualifications · J3',date:null},groups:[group('Groupe A'),group('Groupe B'),group('Groupe C')]},'next');
 assert.equal(count(html,/class="round-group"/g),3);
 assert.match(html,/<div class="round-groups">/);
 assert.match(html,/<h3>Groupe A<\/h3>/);
 assert.doesNotMatch(html,/FORME/);
 assert.equal(count(html,/class="promoted"/g),3);
 const cup=roundContent({round:{number:1,label:'32es de finale',date:'2026-12-02'},groups:[{name:null,matches:[played,{...played,id:8}],standings:null}]},'latest');
 assert.match(cup,/<div class="round-knockout">/);
 assert.doesNotMatch(cup,/round-table/);
});

test('with no round, or a round not drawn yet, the tab says so',()=>{
 assert.match(roundContent({round:null,groups:[]},'latest'),/Pas encore de résultat/);
 assert.match(roundContent({round:null,groups:[]},'next'),/Pas de match à venir/);
 const draw=roundContent({round:{number:9,label:'Barrages · aller',date:'2027-02-17'},groups:[]},'next');
 assert.match(draw,/Barrages · aller/);assert.match(draw,/Tirage à venir/);
});

test('every competition gets both tabs just before its statistics, each asking its own endpoint',async()=>{
 const answer=url=>url.includes('/journee/')?league:url.includes('/navigation')?null:url.includes('/europe')?{season:2025,seasons:[2025],league_rounds:8,standings:[],rounds:[],winner:null}:{};
 const tabs=html=>[...html.matchAll(/<nav class="tabs" aria-label="Sections">(.*?)<\/nav>/g)].map(match=>[...match[1].matchAll(/>([^<]+)<\/a>/g)].map(link=>link[1]));
 let {html,urls}=await withApi(answer,()=>leagueScreen(16,'latest',new URLSearchParams(),[{id:16,name:'Ligue 1',nation:'FRA',kind:'league',level:1}]));
 assert.deepEqual(tabs(html)[0],['Classement','Calendrier','Derniers matches','Prochains matches','Statistiques','Historique']);
 assert.match(html,/class="active" href="#\/league\/16\/latest"/);
 assert.ok(urls.includes('/api/competitions/16/journee/derniere'));
 ({html,urls}=await withApi(answer,()=>cupScreen({id:-3,name:'Coupe de France',kind:'cup'},'next',new URLSearchParams())));
 assert.deepEqual(tabs(html)[0],['Tableau','Derniers matches','Prochains matches','Statistiques','Palmarès']);
 assert.deepEqual(urls,['/api/competitions/-3/journee/prochaine']);
 ({html,urls}=await withApi(answer,()=>europeScreen('C1','latest',new URLSearchParams('saison=2025'),[{id:-101,code:'C1',name:'Ligue des champions',kind:'europe'}])));
 assert.match(html,/href="#\/europe\/C1\/next\?saison=2025">Prochains matches/);
 assert.ok(urls.includes('/api/competitions/-101/journee/derniere?saison=2025'));
 assert.match(html,/Maupay/);
});

test('an international edition gets both tabs, before its statistics',async()=>{
 const edition={year:2028,name:'Euro 2028',qualification_groups:[],final_groups:[],best_seconds:[],second_places:6,qualifiers:[],matches:[],records:[],winner:null};
 const html=editionContent(edition,'next',{round:null,groups:[]});
 assert.match(html,/Qualifications<\/a><a class="" href="#\/international\/2028\/latest">Derniers matches<\/a><a class="active" href="#\/international\/2028\/next">Prochains matches<\/a><a class="" href="#\/international\/2028\/statistics">Statistiques/);
 assert.match(html,/Pas de match à venir/);
 const {urls}=await withApi(url=>url.endsWith('/international')?{enabled:true,editions:[{year:2028,name:'Euro 2028'}],nations:[]}:url.includes('/journee/')?league:edition,
  ()=>internationalScreen('2028','latest'));
 assert.ok(urls.includes('/api/international/editions/2028/journee/derniere'));
});
