import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roundContent} from '../../web/rounds.js';
import {fixtures,setOwnClub} from '../../web/ui.js';
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
 assert.match(html,/<div class="fixture-scorers home"><a href="#\/player\/101" title="Neal Maupay">Maupay<\/a> 14’ 75’<\/div><div class="fixture-scorers away"><a href="#\/player\/201" title="Amine Gouiri">Gouiri<\/a> 26’<\/div>/);
 assert.match(html,/class="fixture with-scorers"/);
 // the whole table beside a single block, form included
 assert.match(html,/FORME/);
 assert.equal(count(html,/class="rank[ "]/g),2);
});

test('the leading scorers of the competition follow its table, ranked, and only once someone has scored',()=>{
 const top_scorers=[{id:101,name:'Neal Maupay',club:club(1,'Brighton'),goals:7},{id:-5,name:'Renfort',club:club(2,'Nice'),goals:4}];
 const html=roundContent({...league,groups:[{...league.groups[0],top_scorers}]},'latest');
 assert.match(html,/<div class="round-block with-top-scorers">/);
 assert.ok(html.indexOf('round-table')<html.indexOf('round-top-scorers'));
 assert.match(html,/<div class="round-top-scorers">.*<th[^>]*><button class="sort-toggle" data-table-sort>JOUEUR<\/button><\/th><th[^>]*><button class="sort-toggle" data-table-sort>CLUB<\/button><\/th><th[^>]*><button class="sort-toggle" data-table-sort>BUTS<\/button><\/th>.*<td[^>]*>1<\/td><td[^>]*><a href="#\/player\/101">Neal Maupay<\/a><\/td>.*<b>7<\/b>.*<td[^>]*>2<\/td><td[^>]*><span class="temporary-player"/);
 for(const none of [[],null,undefined])assert.doesNotMatch(roundContent({...league,groups:[{...league.groups[0],top_scorers:none}]},'latest'),/top-scorers/);
});

test('several scorers of one side follow each other; a goalless match or one to come has no scorers line',()=>{
 const scorers=[[{id:101,name:'Neal Maupay',minutes:['14']},{id:-5,name:'Renfort <b>',minutes:['45+2','90+1']}],[]];
 const html=roundContent({...league,groups:[{...league.groups[0],matches:[{...played,scorers},{...played,id:8,score:[0,0],scorers:[[],[]]},{...played,id:9,score:null,scorers:null}]}]},'latest');
 assert.match(html,/Maupay<\/a> 14’ · <span title="Renfort &lt;b&gt;">&lt;b&gt;<\/span> 45\+2’ 90\+1’<\/div><div class="fixture-scorers away"><\/div>/);
 assert.equal(count(html,/fixture-scorers home/g),1);
 assert.match(html,/À venir/);
});

test('the winner’s side and the one that lost are told apart, the winner’s figure in the strong ink; the match of the user’s club is washed',()=>{
 const html=roundContent(league,'latest');
 // the side at home is written before its mark, which stands against the score
 assert.match(html,/<div class="fixture with-scorers"><div class="fixture-side home won"><a href="#\/club\/1" class="club-link reversed"><span>Brighton<\/span><\/a><\/div><a class="fixture-score" href="#\/match\/7"><b>2<\/b> – 1<\/a><div class="fixture-side away lost"><a href="#\/club\/2" class="club-link">Nice<\/a><\/div>/);
 // a draw tells nobody apart; a match to come has no score
 const others=fixtures({items:[{...played,id:8,score:[1,1],scorers:null},{...played,id:9,score:null,scorers:null}]});
 assert.match(others,/<a class="fixture-score" href="#\/match\/8">1 – 1<\/a>/);assert.match(others,/<a class="fixture-score pending" href="#\/match\/9">À venir<\/a>/);
 assert.doesNotMatch(others,/won|lost|<b>/);
 assert.doesNotMatch(html,/class="fixture[^"]* own/);
 setOwnClub(2);
 // so is its row in the table beside, and no other
 // and on its match the winner is told as on any other
 try{const mine=roundContent(league,'latest');assert.match(mine,/<div class="fixture with-scorers own"><div class="fixture-side home won">.*?<div class="fixture-side away lost">/);assert.equal(count(mine,/<tr class="[^"]*\bown\b[^"]*"/g),1);}finally{setOwnClub(null);}
 assert.equal(count(html,/<tr class="[^"]*\bown\b[^"]*"/g),0);
});

test('a tie is told by who went through, on a storey under the score: the aggregate, and a shoot-out on its winner’s side',()=>{
 const leg={...played,scorers:null,first_leg_id:41,winner_id:2,qualified_id:2};
 // the side that lost the return leg went through: its name in bold, no figure told apart, the aggregate under the score
 const aggregate=fixtures({items:[{...leg,score:[2,0],aggregate:[2,3]}]});
 assert.match(aggregate,/<div class="fixture wide"><div class="fixture-side home lost"><a[^>]*><span>Brighton<\/span><\/a><\/div><a class="fixture-stack" href="#\/match\/7"><span class="fixture-score settled">2 – 0<\/span><span class="fixture-floor">2 – 3<\/span><\/a><div class="fixture-side away won">/);
 assert.doesNotMatch(aggregate,/Cumul|<small/);
 // a level aggregate is still written, the mark of the shoot-out on the side of the one who won it, its figures in the tooltip
 const shootout=fixtures({items:[{...leg,score:[1,0],aggregate:[2,2],penalties:[4,5]}]});
 assert.match(shootout,/<span class="fixture-floor">2 – 2<small title="Tirs au but 4 – 5">\(TAB\)<\/small><\/span>/);assert.doesNotMatch(shootout,/<b>/);
 assert.match(fixtures({items:[{...leg,score:[1,0],aggregate:[2,2],penalties:[5,3],winner_id:1,qualified_id:1}]}),/<span class="fixture-floor"><small title="Tirs au but 5 – 3">\(TAB\)<\/small>2 – 2<\/span>/);
 // after a single match, the mark stands alone, on its side
 assert.match(fixtures({items:[{...played,scorers:null,score:[1,1],penalties:[3,4],winner_id:2}]}),/<span class="fixture-score settled">1 – 1<\/span><span class="fixture-floor away"><small title="Tirs au but 3 – 4">\(TAB\)<\/small><\/span>/);
 // a first leg settles nothing: nobody in bold until the return is played, then the side that went through
 const first={...played,scorers:null,return_leg_id:8,winner_id:null,qualified_id:null};
 assert.match(fixtures({items:[first]}),/<div class="fixture"><div class="fixture-side home"><a[^>]*><span>Brighton<\/span><\/a><\/div><a class="fixture-score settled" href="#\/match\/7">2 – 1<\/a><div class="fixture-side away">/);
 assert.match(fixtures({items:[{...first,qualified_id:2}]}),/<div class="fixture-side home lost"><a[^>]*><span>Brighton<\/span><\/a><\/div>.*<div class="fixture-side away won">/);
 // every line of a list where a match has a storey keeps its room
 assert.equal(count(fixtures({items:[{...leg,score:[2,0],aggregate:[2,3]},{...played,id:8,scorers:null}]}),/class="fixture wide"/g),2);
});

test('a return leg to come carries the first leg’s score on its storey, in the order of the line',()=>{
 const coming={...played,scorers:null,score:null,first_leg_id:41,first_leg_score:[0,2]};
 const html=fixtures({items:[coming,{...played,id:8,scorers:null,score:null}]});
 assert.match(html,/<div class="fixture wide"><div class="fixture-side home"><a[^>]*><span>Brighton<\/span><\/a><\/div><a class="fixture-stack" href="#\/match\/7"><span class="fixture-score pending">À venir<\/span><span class="fixture-floor">0 – 2<\/span><\/a><div class="fixture-side away">/);
 assert.equal(count(html,/class="fixture wide"/g),2);
 // once played, the aggregate takes its place
 assert.match(fixtures({items:[{...coming,score:[1,0],aggregate:[1,2]}]}),/<span class="fixture-floor">1 – 2<\/span>/);
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
 // its leading scorers, once a goal is scored, stand beside the ties
 const scorer={id:4,name:'Neal Maupay',club:{id:9,name:'Brighton'},goals:3};
 const scored=roundContent({round:{number:2,label:'16es de finale',date:'2027-01-06'},groups:[{name:null,matches:[played],standings:null,top_scorers:[scorer]}]},'latest');
 assert.match(scored,/<div class="round-block knockout"><div class="round-matches round-knockout">/);
 assert.match(scored,/<div class="round-top-scorers">.*Neal Maupay/s);
 assert.doesNotMatch(scored,/round-table/);
});

test('with no round, or a round not drawn yet, the tab says so',()=>{
 assert.match(roundContent({round:null,groups:[]},'latest'),/Pas encore de résultat/);
 assert.match(roundContent({round:null,groups:[]},'next'),/Pas de match à venir/);
 const draw=roundContent({round:{number:9,label:'Barrages · aller',date:'2027-02-17'},groups:[]},'next');
 assert.match(draw,/Barrages · aller/);assert.match(draw,/Tirage à venir/);
});

test('every competition gets both tabs just before its statistics, each asking its own endpoint',async()=>{
 const answer=url=>url.includes('/journee/')?league:url.includes('/navigation')?null:url.includes('/europe')?{season:2025,seasons:[2025],league_rounds:8,standings:[],rounds:[],winner:null}:{};
 const tabs=html=>[...html.matchAll(/<nav class="club-hero-tabs" aria-label="Sections">(.*?)<\/nav>/g)].map(match=>[...match[1].matchAll(/>([^<]+)<\/a>/g)].map(link=>link[1]));
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
 assert.match(editionContent(edition,'next',{round:null,groups:[]}),/Pas de match à venir/);
 const {html,urls}=await withApi(url=>url.endsWith('/international')?{enabled:true,editions:[{year:2028,name:'Euro 2028',kind:'euro',code:'EU'}],competitions:[],nations:[]}:url.includes('/journee/')?league:edition,
  ()=>internationalScreen('euro','latest',undefined,new URLSearchParams('edition=2028')));
 assert.match(html,/Qualifications<\/a><a class="active" href="#\/international\/euro\/latest\?edition=2028" aria-current="page">Derniers matches<\/a><a class="" href="#\/international\/euro\/next\?edition=2028">Prochains matches<\/a><a class="" href="#\/international\/euro\/statistics\?edition=2028">Statistiques/);
 assert.ok(urls.includes('/api/international/editions/2028/journee/derniere'));
});

test('an international round lays three groups a row beside the leading scorers',()=>{
 const club={id:-1,name:'Alpha',nation:'FRA',national:true};
 const played={id:1,date:'2028-06-01',home:club,away:{...club,id:-2,name:'Bravo'},score:[1,0],aggregate:null,penalties:null,scorers:null};
 const group=name=>({name,matches:[played],standings:[row(1,'A',1)]});
 const data={round:{number:12,label:'Groupes · J2',date:'2028-06-05'},groups:['A','B','C'].map(group),top_scorers:[{id:5,name:'Buteur',club,goals:4}]};
 const html=roundContent(data,'latest',{figures:true});
 assert.match(html,/round-groups stacked/);
 assert.match(html,/<aside class="round-rail"><h3>Meilleurs buteurs<\/h3>.*Buteur.*<b>4<\/b>/s);
 assert.doesNotMatch(roundContent(data,'latest'),/round-rail/);
});

test('a scorer goes by his short name, told apart within his squad, his whole name in the tooltip',()=>{
 const html=fixtures({items:[{...played,scorers:[[{id:101,name:'Lucas Hernandez',short:'L. Hernandez',minutes:['14']}],[{id:-5,name:'Bruno Cheyrou',short:'Br. Cheyrou',minutes:['26']}]]}]});
 assert.match(html,/<div class="fixture-scorers home"><a href="#\/player\/101" title="Lucas Hernandez">L\. Hernandez<\/a> 14’<\/div><div class="fixture-scorers away"><span title="Bruno Cheyrou">Br\. Cheyrou<\/span> 26’<\/div>/);
});
