import {test} from 'node:test';
import assert from 'node:assert/strict';
import {savesList,homeScreen} from '../../web/home.js';
import {chosenLevels,newGameScreen,creationChoice,SLOT,slotFor,savedUnder,replacedTip} from '../../web/new-game.js';

const params=query=>new URLSearchParams(query);
const nations=[
 {code:'FRA',name:'France',default:3,divisions:[{level:1,name:'Ligue 1',clubs:18},{level:2,name:'Ligue 2',clubs:18},{level:3,name:'National',clubs:18}]},
 {code:'ITA',name:'Italie',default:2,divisions:[{level:1,name:'Serie A',clubs:20},{level:2,name:'Serie B',clubs:20}]},
 {code:'GER',name:'Allemagne',default:0,divisions:[{level:1,name:'Bundesliga',clubs:18},{level:2,name:'Bundesliga 2',clubs:18}]},
];
const creation={date:'2026-07-01',season:2026,nations,flags:{FRA:{name:'France',flag:'fr'},ITA:{name:'Italie',flag:'it'},GER:{name:'Allemagne',flag:'de'}}};
const rennes={id:7,name:'Rennes',nation_code:'FRA',level:1,competition:'Ligue 1',reputation:71.5,capacity:29194,training_facilities:16,youth_recruitment:18,
 wage_cap:700000,major_color:'#E13327',minor_color:'#000000',top_rating:67,top_potential:79,squad:[{name:'Ludovic Blas',position:'MC',age:29,rating:72,potential:74}]};
const juve={...rennes,id:9,name:'Juventus',nation_code:'ITA',level:2,competition:'Serie B'};

async function serve(answers,run){
 const previous=globalThis.fetch,asked=[];
 globalThis.fetch=async url=>{asked.push(url);const path=url.replace(/^\/api/,'').split('?')[0];return {ok:true,json:async()=>answers[path]};};
 try{return {result:await run(),asked};}finally{globalThis.fetch=previous;}
}

test('the saves run from the latest, their club after its dot, the copy of an earlier one muted',()=>{
 const html=savesList([
  {slot:'autosave',modified:100,date:'2026-07-01',club:{id:1,name:'Rennes',major_color:'#E13327',minor_color:'#000000'}},
  {slot:'Marseille-2033-06-10',modified:300,date:'2033-06-10',club:null},
  {slot:'Marseille',modified:200,date:'2033-06-20',club:{id:2,name:'Marseille',major_color:'#2FAEE0',minor_color:'#FFFFFF'}},
 ]);
 assert.deepEqual([...html.matchAll(/data-slot="([^"]+)" tabindex="0"/g)].map(match=>match[1]),['Marseille-2033-06-10','Marseille','autosave']);
 assert.match(html,/<span class="muted">Marseille-2033-06-10<\/span>/);
 assert.match(html,/<span class="strong">Sauvegarde automatique<\/span>/);
 assert.match(html,/kit-dot[^>]*><\/i>Rennes/);
 // A save without a club says so; each line carries the command that deletes it.
 assert.match(html,/<td data-value="">—<\/td>/);
 assert.equal([...html.matchAll(/data-command="delete"/g)].length,3);
 assert.match(savesList([]),/Aucune sauvegarde/);
});

test('the home opens a new game on one side and lists the saves on the other',async()=>{
 const {result:html,asked}=await serve({'/partie/slots':[]},homeScreen);
 assert.deepEqual(asked,['/api/partie/slots']);
 assert.match(html,/<a class="door main" href="#\/nouvelle-partie">.*Créer une partie/s);
 assert.match(html,/<section class="door">.*Reprendre une partie.*Aucune sauvegarde/s);
});

test('the divisions each nation plays come from the address, else from the default world',()=>{
 assert.deepEqual(chosenLevels(params(''),nations),{FRA:3,ITA:2});
 assert.deepEqual(chosenLevels(params('nations=GER:2,FRA:1'),nations),{FRA:1,GER:2});
 // A division the nation does not have, or a nation the game does not know, is left out.
 assert.deepEqual(chosenLevels(params('nations=FRA:4,ITA:0,ESP:1,GER:1'),nations),{GER:1});
});

test('a nation line plays or leaves its nation, and a division makes it the lowest played',async()=>{
 const list={items:[rennes],total:1,page:1,page_size:30,clubs:36,leagues:[]};
 const saves=[{slot:'Rennes',modified:100,date:'2028-03-14',club:{id:7,name:'Rennes'}}];
 const {result:html,asked}=await serve({'/creation':creation,'/creation/clubs':list,'/creation/clubs/7':rennes,'/partie/slots':saves},()=>newGameScreen(params('nations=FRA:2&club=7')));
 assert.deepEqual(asked,['/api/creation','/api/creation/clubs?nations=FRA%3A2','/api/creation/clubs/7','/api/partie/slots']);
 const lines=[...html.matchAll(/<div class="nation-line[^"]*">.*?<\/div><span class="num">[^<]*<\/span><\/div>/gs)].map(match=>match[0]);
 assert.equal(lines.length,3);
 // France, the only nation played, cannot be left out; its first two divisions are lit, its clubs counted.
 assert.match(lines[0],/class="check" aria-pressed="true" aria-label="France" data-param="nations" data-param-value="" disabled>/);
 assert.deepEqual([...lines[0].matchAll(/<button type="button"( class="active")? title="[^"]*" data-param="nations" data-param-value="([^"]*)">(\w+)</g)].map(match=>[match[3],Boolean(match[1]),match[2]]),
  [['L1',true,'FRA:1'],['L2',true,'FRA:2'],['L3',false,'FRA:3']]);
 assert.match(lines[0],/<span class="num">36<\/span>/);
 // Italy is left out: its box plays it at its default depth, its divisions play it down to theirs.
 assert.match(lines[1],/^<div class="nation-line off">/);
 assert.match(lines[1],/aria-pressed="false" aria-label="Italie" data-param="nations" data-param-value="FRA:2,ITA:2">/);
 assert.match(lines[1],/data-param-value="FRA:2,ITA:1">D1</);
 // Germany has no default: its box plays it down to its last division.
 assert.match(lines[2],/aria-label="Allemagne" data-param="nations" data-param-value="FRA:2,GER:2">/);
 // The club picked is marked in the list and shown on the right; Commencer reads the choice.
 assert.match(html,/<tr class="selected"[^>]*data-href="#\/nouvelle-partie\?nations=FRA%3A2&amp;club=7"/);
 assert.match(html,/<input type="hidden" name="club" value="7">/);
 assert.match(html,/<div class="new-game-club">.*Effectif.*Ludovic Blas/s);
 assert.deepEqual({levels:creationChoice().levels,club:creationChoice().club.id,date:creationChoice().date},{levels:{FRA:2},club:7,date:'2026-07-01'});
 // The saves a name could replace come with the choice.
 assert.deepEqual(creationChoice().saves,saves);
});

test('a club out of the divisions now played is no longer picked',async()=>{
 const list={items:[],total:0,page:1,page_size:30,clubs:18,leagues:[]};
 const {result:html}=await serve({'/creation':creation,'/creation/clubs':list,'/creation/clubs/9':juve,'/partie/slots':[]},()=>newGameScreen(params('nations=FRA:1,ITA:1&club=9')));
 assert.equal(creationChoice().club,null);
 assert.doesNotMatch(html,/name="club"/);
 assert.match(html,/Aucun club choisi/);
});

test('a new game is saved under its club\'s name, a name already saved under telling what it replaces',()=>{
 assert.equal(slotFor('Rennes'),'Rennes');
 assert.equal(slotFor('Paris Saint-Germain'),'Paris-Saint-Germain');
 assert.equal(slotFor('Saint-Étienne'),'Saint-Étienne');
 assert.equal(slotFor(' Brighton & Hove Albion '),'Brighton-Hove-Albion');
 assert.equal(slotFor('x'.repeat(80)).length,64);
 assert.ok(SLOT.test('Saint-Étienne')&&SLOT.test('ma_partie-2'));
 assert.ok(!SLOT.test('')&&!SLOT.test('ma partie')&&!SLOT.test('a/b')&&!SLOT.test('x'.repeat(65)));
 const saves=[{slot:'Rennes',date:'2028-03-14',club:{name:'Rennes'}},{slot:'vide',date:null,club:null}];
 assert.equal(savedUnder('Lens',saves),null);
 assert.equal(replacedTip(savedUnder('Rennes',saves)),'Remplace la sauvegarde « Rennes »\nRennes · 14 mars 2028');
 assert.equal(replacedTip(savedUnder('vide',saves)),'Remplace la sauvegarde « vide »');
});
