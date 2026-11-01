import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recruitmentContent,positionCard} from '../../web/recruitment.js';

const club=(id,name)=>({id,name,major_color:'#cc0000',minor_color:'#ffffff'});
const player=(id,name,position,extra={})=>({id,name,position,age:27,nation:'FRA',nationalities:['FRA'],stars:{level:3.5,potential:[4,4.5]},value:5e6,club:club(9,'Lille'),fitness:.95,form:0,morale:.8,appearances:3,substitutes:0,goals:0,assists:0,yellows:0,reds:0,average:6.5,
 wage:20000,contract_end:'2028-06-30',expiring:false,expiring_soon:false,...extra});
const lead=(id,name,position,extra={})=>({...player(id,name,position),asking_price:9.5e6,wage_demand:23000,contribution:.8,place:'titulaire',
 replaces:{id:1,name:'Mathieu Cafaro'},...extra});
const data=(over={})=>({mode:'present',free_agents:false,
 finances:{transfer_budget:12e6,reserved_transfer_budget:0,wage_bill:264000,wage_cap:290000,reserved_wages:0},
 squad:{size:30,max:30},window:{closes:'2026-08-31',opens:null},
 positions:[{position:'GB',need:.44,holder:player(2,'Patrik Carlgren','GB',{age:35}),leads:[lead(10,'Florian Müller','GB')]},
  {position:'AILD',need:1,holder:player(1,'Mathieu Cafaro','AILD'),leads:[lead(11,'Osman Bukari','AILD'),lead(12,'Solly March','AILD',{club:null,asking_price:null,contribution:.5})]},
  {position:'BU',need:.7,holder:null,leads:[]}],
 surplus:[player(3,'Lucas Bonelli','GB',{age:24})],...over});

test('the budgets of the Finances tab without their handle, the squad against its limit and the end of the window',()=>{
 const html=recruitmentContent(data());
 assert.match(html,/<h1>Recrutement<\/h1>/);
 assert.match(html,/<section class="finance-figure balance" aria-label="Répartition des budgets"><div class="balance-end"><span>Budget transferts<\/span><strong>12\sM€<\/strong>/);
 assert.doesNotMatch(html,/balance-handle|data-share/);
 // A full squad in red: the club cannot sign before it sells.
 assert.match(html,/<div class="finance-figure bad"><span>Effectif<\/span><strong>30 \/ 30<\/strong><\/div>/);
 assert.match(html,/<span>Fin du mercato<\/span><strong>31 août<\/strong>/);
 assert.match(recruitmentContent(data({squad:{size:28,max:30},window:{closes:null,opens:'2027-01-01'}})),/<div class="finance-figure"><span>Effectif<\/span><strong>28 \/ 30<\/strong><\/div><div class="finance-figure"><span>Ouverture du mercato<\/span><strong>1 janvier<\/strong>/);
});

test('two choices that are links, the view and the pool, each keeping the other',()=>{
 const html=recruitmentContent(data(),new URLSearchParams('libres=1'));
 assert.match(html,/<a class="active" href="#\/recrutement\?libres=1" aria-current="true">Présent<\/a><a class="" href="#\/recrutement\?libres=1&amp;vue=avenir">Avenir<\/a>/);
 assert.match(html,/<a class="" href="#\/recrutement\?">Toutes les pistes<\/a><a class="active" href="#\/recrutement\?libres=1" aria-current="true">Agents libres<\/a>/);
});

test('a card per position, the club\'s player first, then each lead with what he brings and the place he would take',()=>{
 const html=recruitmentContent(data());
 assert.deepEqual([...html.matchAll(/<section class="card scout-card"><div class="card-head"><h2><span class="position [a-z]*">(\w+)<\/span>([^<]+)<\/h2>/g)].map(match=>match.slice(1)),
  [['GB','Gardien'],['AILD','Ailier droit'],['BU','Buteur']]);
 const card=positionCard(data().positions[1],false);
 // The need in a red gauge, full for the largest.
 assert.match(card,/<span class="scout-need" title="Besoin"><i class="gauge bad"><i style="width:100%"><\/i><\/i><\/span>/);
 assert.match(card,/<li class="holder"><a href="#\/player\/1">Mathieu Cafaro<\/a><span class="num">27<\/span><span class="stars/);
 assert.match(card,/<a href="#\/player\/11">Osman Bukari<\/a><span class="num">27<\/span>.*Lille.*<span class="num">9\.5\sM€<\/span><span class="num">100\sk€<\/span><span class="scout-gain" title="Titulaire à la place de Mathieu Cafaro"><i class="gauge"><i style="width:80%"><\/i><\/i><\/span><\/li>/);
 // A free agent: no club, no price.
 assert.match(card,/Solly March.*<span class="muted">Libre<\/span><span class="num">—<\/span>/);
 // No player of the club there, no lead: a dash, then the empty line.
 assert.match(positionCard(data().positions[2],false),/<li class="holder"><span>—<\/span><\/li><\/ul><p class="empty">Aucune piste<\/p>/);
});

test('for later, the potential after the level, the club and the price; no need, no contribution',()=>{
 const later=data({mode:'avenir',positions:[{position:'DC',need:.9,holder:player(4,'Tylel Tati','DC',{age:19}),leads:[lead(13,'Raul Kumar','DC',{age:19,contribution:null,place:null,replaces:null})]}]});
 const html=recruitmentContent(later,new URLSearchParams('vue=avenir'));
 assert.match(html,/<ul class="scout-list future">/);
 assert.doesNotMatch(html,/scout-need|scout-gain/);
 assert.match(html,/Raul Kumar<\/a><span class="num">19<\/span><span class="stars[^]*?<\/span><span class="stars[^]*?<\/span><a href="#\/club\/9"[^>]*>.*Lille<\/a><span class="num">9\.5\sM€<\/span><\/li>/);
});

test('the players without a place in the squad, under the cards; nothing without them',()=>{
 assert.match(recruitmentContent(data()),/<section class="card scout-surplus"><div class="card-head"><h2>À céder<\/h2><\/div>.*Lucas Bonelli/);
 assert.doesNotMatch(recruitmentContent(data({surplus:[]})),/À céder/);
});
