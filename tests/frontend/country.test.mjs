import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {countryScreen} from '../../web/country.js';

const club=(id,name)=>({id,name});
const leagues=[{id:17,name:'Ligue 2',nation:'FRA',level:2,kind:'league',clubs:18,rounds:34},{id:-3,name:'Coupe de France',kind:'cup',nation:'FRA',clubs:64,level:0,rounds:6},
 {id:16,name:'Ligue 1',nation:'FRA',level:1,kind:'league',clubs:18,rounds:34},{id:11,name:'Premier League',nation:'ENG',level:1,kind:'league',clubs:20,rounds:38}];
const standing=(rank,team,movement=null)=>({rank,club:team,points:9-rank,played:3,won:3-rank,drawn:0,lost:rank,goals_for:6,goals_against:rank,difference:6-rank,form:'VVV',movement});
const match=(id,home,away,score=null,extra={})=>({id,home,away,score,penalties:null,winner_id:null,...extra});
const scorer=(id,goals)=>({id,name:`Buteur ${id}`,club:club(1,'Paris'),goals});
const round=(number,date,matches,standings)=>({round:{number,label:`Journée ${number}`,date},groups:[{name:null,matches,standings,top_scorers:[9,8,7,6,5,4,3].map((goals,index)=>scorer(index+1,goals))}]});
const first=[standing(1,club(1,'Paris'),'champion'),standing(2,club(2,'Lyon <b>'),'europe'),standing(3,club(3,'Lens'),'relegation')];
const second=[standing(1,club(4,'Metz'),'promotion'),standing(2,club(5,'Caen'))];
const tie={label:'32es de finale',date:'2030-12-04',complete:true,items:[match(31,club(9,'Amateurs'),club(1,'Paris'),[1,1],{penalties:[4,5],winner_id:1}),match(32,club(4,'Metz'),club(2,'Lyon <b>'),[2,0],{scorers:[[{id:61,name:'Jean Buteur',minutes:['12','80']}],[]]})]};
const goal=(id,name,...minutes)=>({id,name,minutes});
const cup={id:-3,name:'Coupe de France',season:2030,latest_round:1,winner:null,seasons:[2030],rounds:[{number:1,...tie},{number:2,label:'16es de finale',date:'2031-01-08',complete:false,items:[match(41,club(1,'Paris'),club(4,'Metz'))]},
 ...['8es de finale','Quarts de finale','Demi-finales','Finale'].map((label,index)=>({number:index+3,label,date:'2031-02-05',complete:false,items:[]}))]};
const answers={
 '/api/competitions/16/journee/derniere':round(3,'2030-08-25',[match(1,club(1,'Paris'),club(3,'Lens'),[2,0],{scorers:[[goal(51,'Neal Maupay','14','75'),goal(52,'Danny Welbeck','56')],[]]}),
  match(2,club(2,'Lyon <b>'),club(8,'Nice'),[1,1],{scorers:[[goal(53,'Amine Gouiri','30')],[goal(54,'Terem Moffi','88')]]})],first),
 '/api/competitions/16/journee/prochaine':round(4,'2030-09-01',[match(3,club(3,'Lens'),club(2,'Lyon <b>'))],first),
 '/api/competitions/17/journee/derniere':round(3,'2030-08-25',[match(4,club(4,'Metz'),club(5,'Caen'),[0,1])],second),
 // the second division has no round left to play
 '/api/competitions/17/journee/prochaine':{round:null,groups:[]},
 '/api/competitions/17/classement':{items:second,total:2,page:1,page_size:30},
 '/api/competitions/17/statistiques?type=buteurs':{items:[scorer(21,12)],total:1,page:1,page_size:30},
 '/api/competitions/-3/coupe':cup};
const count=(html,pattern)=>(html.match(pattern)||[]).length;
async function screen(query='',own=null){
 const previous=globalThis.fetch,requested=[];
 globalThis.fetch=async url=>{requested.push(url);if(!(url in answers))throw new Error(`unexpected ${url}`);return {ok:true,json:async()=>answers[url]};};
 try{return {html:await countryScreen('FRA',leagues,new URLSearchParams(query),own),requested};}finally{globalThis.fetch=previous;}
}
const card=(html,title)=>{const start=html.indexOf(`<h2>${title}</h2>`),end=html.indexOf('<section class="card">',start);return html.slice(start,end<0?undefined:end);};

test('a country lays its divisions out from the top down, then its cup, under its name and the choice of matches',async()=>{
 const {html,requested}=await screen();
 // one request per division and one for the cup
 assert.deepEqual(requested.sort(),['/api/competitions/-3/coupe','/api/competitions/16/journee/derniere','/api/competitions/17/journee/derniere']);
 assert.match(html,/^<div class="toolbar"><h1>FRA<\/h1><div class="segmented" role="group" aria-label="Matches"><a class="active" href="#\/country\/FRA\?" aria-current="true">Derniers matches<\/a><a class="" href="#\/country\/FRA\?matches=prochains">Prochains matches<\/a><\/div>/);
 assert.equal(count(html,/<section class="card">/g),3);
 assert.ok(html.indexOf('<h2>Ligue 1</h2>')<html.indexOf('<h2>Ligue 2</h2>')&&html.indexOf('<h2>Ligue 2</h2>')<html.indexOf('<h2>Coupe de France</h2>'));
 assert.doesNotMatch(html,/Premier League/);
 await assert.rejects(countryScreen('XXX',leagues),/Pays introuvable/);
});

test('a division gives its round, then its whole table without the form, then five scorers',async()=>{
 const {html}=await screen('',2);
 const division=card(html,'Ligue 1');
 // the head counts the rounds played out of the season's and opens the division
 assert.match(division,/^<h2>Ligue 1<\/h2><a href="#\/league\/16" aria-label="Voir le championnat">J3 \/ 34 →<\/a><\/div><h3>Journée 3 · 25 août 2030<\/h3><div class="country-match with-scorers">/);
 assert.ok(division.indexOf('country-match')<division.indexOf('class="standings"')&&division.indexOf('class="standings"')<division.indexOf('<h3>Buteurs</h3>'));
 // the winner in bold, the match of the user's club highlighted
 assert.match(division,/<div class="country-match with-scorers"><span class="home won"><a href="#\/club\/1" class="club-link">Paris<\/a><\/span><a class="score" href="#\/match\/1">2 – 0<\/a><span class="away">/);
 assert.match(division,/<div class="country-match with-scorers own"><span class="home"><a href="#\/club\/2" class="club-link">Lyon &lt;b&gt;<\/a><\/span><a class="score" href="#\/match\/2">1 – 1<\/a>/);
 // under a played match, each side's scorers by surname with the minutes of their goals, under their own side
 assert.match(division,/Lens<\/a><\/span><div class="fixture-scorers home"><a href="#\/player\/51" title="Neal Maupay">Maupay<\/a> \(14, 75\), <a href="#\/player\/52" title="Danny Welbeck">Welbeck<\/a> \(56\)<\/div><span><\/span><div class="fixture-scorers"><\/div><\/div>/);
 assert.match(division,/<div class="fixture-scorers home"><a href="#\/player\/53" title="Amine Gouiri">Gouiri<\/a> \(30\)<\/div><span><\/span><div class="fixture-scorers"><a href="#\/player\/54" title="Terem Moffi">Moffi<\/a> \(88\)<\/div>/);
 assert.match(division,/<th class="total-column">PTS<\/th><th class="count-column">J<\/th><th class="count-column">V<\/th><th class="count-column">N<\/th><th class="count-column">D<\/th><th class="total-column">BP<\/th><th class="total-column">BC<\/th><th class="difference-column">DIFF.<\/th><\/tr>/);
 assert.doesNotMatch(division,/FORME/);
 assert.match(division,/<tr class="promoted"><td><span class="rank first">1<\/span>/);assert.match(division,/<tr class="qualified-europe own">/);assert.match(division,/<tr class="relegated">/);
 assert.equal(count(division.slice(division.indexOf('<h3>Buteurs</h3>')),/href="#\/player\//g),5);
 assert.doesNotMatch(html,/Lyon <b>/);
});

test('the next round is shown on demand; a division without one keeps its table and its scorers',async()=>{
 const {html,requested}=await screen('matches=prochains&tour=3');
 assert.ok(requested.includes('/api/competitions/16/journee/prochaine')&&requested.includes('/api/competitions/17/classement')&&requested.includes('/api/competitions/17/statistiques?type=buteurs'));
 // the other choice of matches lets go of the cup round picked
 assert.match(html,/<a class="" href="#\/country\/FRA\?">Derniers matches<\/a><a class="active" href="#\/country\/FRA\?matches=prochains" aria-current="true">Prochains matches<\/a>/);
 assert.match(card(html,'Ligue 1'),/<h3>Journée 4 · 1 sept\. 2030<\/h3><div class="country-match"><span class="home">.*?<a class="score pending" href="#\/match\/3">–<\/a>/);
 const division=card(html,'Ligue 2');
 assert.match(division,/^<h2>Ligue 2<\/h2><a href="#\/league\/17" aria-label="Voir le championnat">J3 \/ 34 →<\/a><\/div><div class="standings">/);
 assert.doesNotMatch(division,/country-match/);
 assert.match(division,/<h3>Buteurs<\/h3>.*Buteur 21/);
});

test('the cup shows one of its rounds: the latest played, the first still to play, or the one picked',async()=>{
 const latest=card((await screen()).html,'Coupe de France');
 assert.match(latest,/^<h2>Coupe de France<\/h2><a href="#\/league\/-3" aria-label="Voir la coupe">→<\/a><\/div><nav class="segmented country-rounds" aria-label="Tours"><a class="active" href="#\/country\/FRA\?tour=1" aria-current="true" title="32es de finale">32es<\/a><a class="" href="#\/country\/FRA\?tour=2" title="16es de finale">16es<\/a>/);
 assert.equal(count(latest,/country-rounds.*?<\/nav>/g),1);assert.equal(count(latest.slice(0,latest.indexOf('</nav>')),/<a /g),7);
 assert.match(latest,/<\/nav><h3>32es de finale · 4 déc\. 2030<\/h3>/);
 // each club's division at the ends, none for a club from below; a shoot-out in the tooltip of the score, its winner in bold
 assert.match(latest,/<div class="country-match tie"><small><\/small><span class="home">.*?Amateurs<\/a><\/span><a class="score shootout" href="#\/match\/31" title="Tirs au but : 4 – 5">1 – 1<\/a><span class="away won">.*?Paris<\/a><\/span><small>D1<\/small><\/div>/);
 // in a cup, the scorers stand between the two ends naming the divisions
 assert.match(latest,/<div class="country-match tie with-scorers"><small>D2<\/small><span class="home won">.*?Metz<\/a><\/span><a class="score" href="#\/match\/32">2 – 0<\/a><span class="away">.*?<\/span><small>D1<\/small><span><\/span><div class="fixture-scorers home"><a href="#\/player\/61" title="Jean Buteur">Buteur<\/a> \(12, 80\)<\/div><span><\/span><div class="fixture-scorers"><\/div><span><\/span><\/div>/);
 // a match not played yet has no line of scorers
 assert.doesNotMatch(card((await screen('matches=prochains')).html,'Ligue 1'),/fixture-scorers/);
 const next=card((await screen('matches=prochains',4)).html,'Coupe de France');
 assert.match(next,/<a class="active" href="#\/country\/FRA\?matches=prochains&amp;tour=2" aria-current="true" title="16es de finale">16es<\/a>/);
 assert.match(next,/<h3>16es de finale · 8 janv\. 2031<\/h3><div class="country-match tie own">/);
 // a round not drawn yet says so
 const picked=card((await screen('tour=5')).html,'Coupe de France');
 assert.match(picked,/<a class="active" href="#\/country\/FRA\?tour=5" aria-current="true" title="Demi-finales">Demi-finales<\/a>/);
 assert.match(picked,/Tirage à venir/);assert.doesNotMatch(picked,/country-match/);
});

test('the router hands the country page its choices and the club of the user',async()=>{
 assert.match(await readFile(new URL('../../web/app.js',import.meta.url),'utf8'),/case 'country':html=await countryScreen\(id,leagues,params,state\.controlled_club_id\)/);
});
