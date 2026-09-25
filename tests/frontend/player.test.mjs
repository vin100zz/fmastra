import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreHue,scoreBadge,setNations} from '../../web/ui.js';
import {playerScreen,levelChart,positionPitch,attributeGroups} from '../../web/player.js';

const detail={id:1,name:'Test Joueur',position:'DR',secondary_positions:['MC'],age:19,nationalities:['FRA'],nationality_names:['France'],club:{id:1,name:'Club'},
 born:'2005-01-01',wage:12000,contract_end:'2028-06-30',value:1314589,rating:70,potential:91.5,fitness:1,form:0,morale:.5,injured_until:null,discipline:[],
 attributes:{passe:80,technique:30},position_ratings:{GB:1,DR:20,MC:12}};
const history={career:{items:[{season:2025,club:{id:1,name:'Club'},fee:null,competition:'Serie A · C1',matches:4,goals:1,assists:0,average:6.5}],totals:{fee:0,matches:4,goals:1,assists:0,average:6.5}},
 trajectory:{items:[{season:2026,rating:60},{season:2025,rating:55}]}};

const squad={scope:{kind:'club',id:1,name:'Club'},index:1,total:3,items:[{id:5,name:'Gardien Test',position:'GB'},{id:1,name:'Test Joueur',position:'DR'},{id:6,name:'Buteur Test',position:'BU'}],
 previous:{id:5,name:'Gardien Test',position:'GB'},next:{id:6,name:'Buteur Test',position:'BU'}};

async function render(player=detail,navigation=squad){
 const previous=globalThis.fetch,urls=[];
 globalThis.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>url.endsWith('/navigation')?navigation:url.endsWith('/historique')?history:player};};
 try{return {html:await playerScreen(1),urls};}finally{globalThis.fetch=previous;}
}

test('attribute and position scores share one red-yellow-green scale out of 20',()=>{
 assert.deepEqual([1,4,7,10,13,16,20].map(scoreHue),[0,0,25,50,85,120,120]);
 assert.match(scoreBadge(16),/class="rating graded" style="--hue:120">16</);
 assert.equal(scoreBadge(null),'—');
});

test('level chart labels the ordinate out of 200 with a gridline per tick, in HTML text',()=>{
 const html=levelChart([{season:2025,rating:55},{season:2026,rating:60},{season:2027,rating:72.5}]);
 const ticks=[...html.matchAll(/class="y-tick" style="top:[\d.]+%">(\d+)</g)].map(match=>Number(match[1]));
 assert.deepEqual(ticks,[110,120,130,140,150]);
 assert.equal((html.match(/class="grid-line"/g)||[]).length,5);
 assert.doesNotMatch(html,/<text|font-size/);
 assert.match(html,/class="point-value first" style="left:0.00%;top:[\d.]+%">110</);
 assert.match(html,/class="point-value last" style="left:100.00%;top:[\d.]+%">145</);
 assert.equal((html.match(/class="point-value/g)||[]).length,2);
 for(const year of [2025,2026,2027])assert.match(html,new RegExp(`class="x-tick" style="left:[\\d.]+%">${year}<`));
 const flat=levelChart([{season:2025,rating:60},{season:2026,rating:60}]);
 assert.equal((flat.match(/class="grid-line"/g)||[]).length,2);assert.doesNotMatch(flat,/NaN|Infinity/);
 const long=levelChart(Array.from({length:20},(_,index)=>({season:2000+index,rating:40+index})));
 assert.doesNotMatch(long,/NaN|Infinity/);assert.equal((long.match(/class="x-tick"/g)||[]).length,5);
});

test('level chart points take the colours of the club played for, and stay neutral without one',()=>{
 const html=levelChart([{season:2025,rating:55,club:{id:9,name:'Olympique de Marseille',major_color:'#ffffff',minor_color:'#2faee0'}},{season:2026,rating:60}]);
 const [first,second]=html.split('class="chart-point"').slice(1);
 assert.match(first,/title="2025 \/ 2026 · Olympique de Marseille · niveau 110"/);
 assert.match(first,/class="kit-dot" style="background:linear-gradient\(135deg,#ffffff 50%,#2faee0 50%\)"/);
 assert.match(second,/title="2026 \/ 2027 · niveau 120"/);assert.match(second,/class="kit-dot neutral"/);
 const unsafe=levelChart([{season:2025,rating:55,club:{name:'X',major_color:'red;background:url(x)',minor_color:'#000000'}},{season:2026,rating:60}]);
 assert.doesNotMatch(unsafe,/url\(x\)/);assert.match(unsafe,/kit-dot neutral/);
});

test('position pitch places ratings of 10 or more on the field and outlines the main position',()=>{
 const html=positionPitch({GB:1,DR:20,MC:12,MDC:10,DC:9,BU:null},'DR');
 assert.equal((html.match(/class="shirt graded"/g)||[]).length,3);
 assert.match(html,/pitch-player main" style="left:85%;top:70%"><span class="shirt graded" style="--hue:120" title="DR : 20 \/ 20">20</);
 assert.equal((html.match(/pitch-player main/g)||[]).length,1);
 assert.match(html,/<small>MC<\/small>/);assert.match(html,/title="MDC : 10 \/ 20">10</);
 assert.doesNotMatch(html,/<small>(GB|DC|BU)</);
 assert.equal(positionPitch({GB:1,DC:9},'DC'),'');
});

test('player page merges profile and career without tabs, stat cards or identity block',async()=>{
 const {html,urls}=await render();
 assert.deepEqual(urls.sort(),['/api/joueurs/1','/api/joueurs/1/historique','/api/joueurs/1/navigation','/api/monde/etat']);
 assert.doesNotMatch(html,/class="tabs"|stat-card|Identité et contrat|Aptitudes par poste[^]*Matchs|Note moyenne/);
 for(const label of ['Attributs','Aptitudes par poste','État du joueur','Évolution du niveau','La carrière'])assert.ok(html.includes(label),label);
 assert.ok(html.indexOf('Attributs')<html.indexOf('La carrière')&&html.indexOf('Évolution du niveau')<html.indexOf('La carrière'));
 assert.match(html,/Serie A · C1/);
});

test('player page puts attributes, pitch and level chart on one three-column row above state and career',async()=>{
 const {html}=await render();
 const top=html.slice(html.indexOf('class="grid thirds"'),html.indexOf('class="grid state-career"'));
 assert.ok(top.indexOf('Attributs')<top.indexOf('Aptitudes par poste')&&top.indexOf('Aptitudes par poste')<top.indexOf('Évolution du niveau'));
 assert.ok(!top.includes('État du joueur')&&!top.includes('La carrière'));
 const bottom=html.slice(html.indexOf('class="grid state-career"'));
 assert.ok(bottom.indexOf('État du joueur')<bottom.indexOf('La carrière'));
 assert.ok(!bottom.includes('Aptitudes par poste'));
 for(const ratings of [{},{GB:1,MC:9}]){
  const without=(await render({...detail,position_ratings:ratings})).html;
  assert.doesNotMatch(without,/state-career|Aptitudes par poste/);
  const top=without.slice(without.indexOf('class="grid thirds"'),without.indexOf('La carrière'));
  assert.ok(top.indexOf('Attributs')<top.indexOf('État du joueur')&&top.indexOf('État du joueur')<top.indexOf('Évolution du niveau'));
  assert.match(without,/La carrière/);
 }
});

test('player page steps through the squad above the header, and shows nothing without a club',async()=>{
 const {html}=await render();
 // in the header, at the left of the avatar and the name, not on a row of its own
 const at=html.indexOf('class="entity-nav"');
 assert.ok(html.indexOf('class="page-heading player-heading"')<html.indexOf('<div class="identity"><div class="entity-nav"')&&at<html.indexOf('class="avatar"'));
 assert.match(html,/href="#\/player\/5" rel="prev"/);assert.match(html,/href="#\/player\/6" rel="next"/);
 assert.match(html,/<a href="#\/player\/1" aria-current="true"><span class="position def">DR<\/span><span>Test Joueur<\/span><\/a>/);
 assert.equal(html.match(/<h1>(.*?)<\/h1>/)[1],'Test Joueur');
 for(const navigation of [null,{...squad,total:1,items:[squad.items[1]],previous:null,next:null}]){
  const alone=(await render(detail,navigation)).html;
  assert.doesNotMatch(alone,/entity-nav/);assert.match(alone,/Test Joueur/);
 }
 const retired=(await render({id:1,name:'Ancien',retired:true},null)).html;
 assert.doesNotMatch(retired,/entity-nav/);assert.match(retired,/CARRIÈRE ARCHIVÉE/);
});

test('level chart points use the latest club of each season from the career',async()=>{
 const marseille={id:9,name:'Marseille',major_color:'#ffffff',minor_color:'#2faee0'},lyon={id:8,name:'Lyon',major_color:'#1d3f8f',minor_color:'#d3232f'};
 const previous=history.career.items;
 history.career.items=[{...previous[0],season:2026,club:marseille},{...previous[0],season:2025,club:marseille},{...previous[0],season:2025,club:lyon}];
 try{
  const {html}=await render();
  assert.match(html,/title="2025 \/ 2026 · Marseille · niveau 110"/);assert.match(html,/title="2026 \/ 2027 · Marseille · niveau 120"/);
  assert.doesNotMatch(html,/Lyon · niveau/);
 }finally{history.career.items=previous;}
});

test('career competition column shows the flag of the league country, and none for the external market',async()=>{
 setNations({ITA:{name:'Italie',display_code:'ITA',flag:'it'},XXX:{name:'Sans drapeau',display_code:'XXX'}});
 const previous=history.career.items,base=previous[0];
 history.career.items=[{...base,season:2026,competition:'Serie A · C1',competition_nation:'ITA'},{...base,season:2025,competition:null,competition_nation:null},{...base,season:2024,competition:'Divisions',competition_nation:'XXX'},{...base,season:2023,competition:'Serie B',competition_nation:'ZZZ'}];
 try{
  const {html}=await render();
  const cells=[...html.matchAll(/<td><span class="competition">(.*?)<\/span>(?=<\/td>)/g)].map(match=>match[1]);
  assert.equal(cells.length,4);
  assert.match(cells[0],/^<span class="nation" title="Italie"><img class="flag" src="\/flags\/it.svg" alt="" width="16" height="12" loading="lazy"><\/span>Serie A · C1$/);
  assert.equal(cells[1],'Marché extérieur');
  assert.equal(cells[2],'Divisions');assert.equal(cells[3],'Serie B');
  assert.doesNotMatch(html,/undefined|null/);
 }finally{history.career.items=previous;setNations({});}
});

test('player header carries birth date, salary, contract end and market value',async()=>{
 const {html}=await render();
 const head=html.slice(0,html.indexOf('Attributs'));
 for(const label of ['Né le','Salaire mensuel','Fin du contrat','Valeur de marché'])assert.ok(head.includes(`<dt>${label}</dt>`),label);
 assert.match(head,/secondary-positions[^]*MC/);assert.match(head,/19 ans/);
 const free=(await render({...detail,club:null,wage:0,contract_end:null})).html;
 assert.match(free.slice(0,free.indexOf('Attributs')),/Salaire mensuel<\/dt><dd>—<\/dd>/);
});

test('attributes are graded badges without progress bars, with level and potential in the card header',async()=>{
 const {html}=await render();
 const card=html.match(/<section class="card"><div class="card-head"><h2>Attributs[^]*?<\/section>/)[0];
 assert.match(card,/class="attribute"><span>Passe<\/span><span class="rating graded" style="--hue:120">16</);
 assert.match(card,/<span>Technique<\/span><span class="rating graded" style="--hue:\d+">6</);
 assert.doesNotMatch(card,/class="meter"/);
 assert.match(card,/Niv\. <span[^>]*title="Niveau actuel sur 200">140</);assert.match(card,/Pot\. <span[^>]*title="Potentiel sur 200">183</);
 assert.equal((html.match(/class="meter"/g)||[]).length,1);// only the condition bar of the player state remains
 assert.doesNotMatch(html,/class="potential"|Potentiel estimé/);
});

test('retired players keep only their level history and career',async()=>{
 const {html}=await render({id:1,name:'Ancien',retired:true});
 assert.match(html,/CARRIÈRE ARCHIVÉE/);assert.match(html,/Évolution du niveau/);assert.match(html,/La carrière/);
 assert.doesNotMatch(html,/Attributs|player-facts|État du joueur/);
});

const ALL=['passe','technique','finition','tacle','jeu_tete','vision','placement','sang_froid','vitesse','endurance','reflexes','sorties','relance','centre','cpa'];
const everything=Object.fromEntries(ALL.map((key,index)=>[key,20+index*5]));
const WEIGHTS={GB:{reflexes:.40,sorties:.25,placement:.20,relance:.15},DC:{tacle:.28,placement:.28,jeu_tete:.20,vitesse:.14,passe:.10},
 BU:{finition:.38,sang_froid:.20,technique:.16,jeu_tete:.14,vitesse:.12}};
const of=position=>({...detail,position,attributes:everything,attribute_weights:WEIGHTS[position]});
const names=section=>section.items.map(item=>item.key);

test('a goalkeeper gets Gardien and Général, Placement joins his craft, and the rest is folded away',()=>{
 const {sections,others}=attributeGroups(of('GB'));
 assert.deepEqual(sections.map(section=>section.title),['Gardien','Général']);
 assert.deepEqual(names(sections[0]),['reflexes','sorties','placement','relance']);// Placement joins the goalkeeper's craft
 assert.deepEqual(names(sections[1]),['passe','vitesse','endurance']);
 assert.deepEqual(others.map(item=>item.key).sort(),['centre','cpa','finition','jeu_tete','sang_froid','tacle','technique','vision']);
});

test('an outfield player never sees goalkeeper attributes, nor a fold, and Placement stays a defensive skill',()=>{
 const {sections,others}=attributeGroups(of('DC'));
 assert.deepEqual(sections.map(section=>section.title),['Défense','Attaque','Général']);
 assert.deepEqual(names(sections[0]),['tacle','placement']);
 assert.equal(others.length,0);
 assert.ok(!sections.some(section=>names(section).some(key=>['reflexes','sorties','relance'].includes(key))));
});

test('sections and the attributes inside them keep one fixed order whatever the position',()=>{
 const layout=position=>attributeGroups(of(position)).sections.map(section=>[section.title,...names(section)]);
 assert.deepEqual(layout('DC'),layout('BU'));
 assert.deepEqual(layout('BU'),[['Défense','tacle','placement'],['Attaque','finition','sang_froid','technique','vision','jeu_tete','centre','cpa'],['Général','passe','vitesse','endurance']]);
});

test('every attribute is shown exactly once, in a section or in the fold',()=>{
 for(const position of ['GB','DC','BU']){
  const {sections,others}=attributeGroups(of(position));
  const shown=[...sections.flatMap(names),...others.map(item=>item.key)];
  const hidden=position==='GB'?[]:['reflexes','sorties','relance'];
  assert.deepEqual([...shown,...hidden].sort(),[...ALL].sort(),position);
 }
});

test('an answer without weights still renders every section in its default order',()=>{
 const {sections}=attributeGroups({...detail,position:'MC',attributes:everything});
 assert.deepEqual(sections.map(section=>section.title),['Défense','Attaque','Général']);
 assert.ok(sections.every(section=>section.items.every(item=>item.weight===0)));
});

test('the card titles its sections and marks the key attributes of the position with their weight',async()=>{
 const {html}=await render(of('BU'));
 const card=html.match(/<section class="card"><div class="card-head"><h2>Attributs[^]*?<\/section>/)[0];
 assert.deepEqual([...card.matchAll(/<h3>([^<]+)<\/h3>/g)].map(match=>match[1]),['Défense','Attaque','Général']);
 assert.match(card,/class="attribute key" title="Compte pour 38 % de la note du poste"><span>Finition<\/span>/);
 assert.match(card,/class="attribute"><span>Vision<\/span>/);
 assert.doesNotMatch(card,/attribute-others|Réflexes/);
});

test('a goalkeeper card folds the other attributes closed by default',async()=>{
 const {html}=await render(of('GB'));
 const card=html.match(/<section class="card"><div class="card-head"><h2>Attributs[^]*?<\/section>/)[0];
 assert.deepEqual([...card.matchAll(/<h3>([^<]+)<\/h3>/g)].map(match=>match[1]),['Gardien','Général']);
 assert.match(card,/<details class="attribute-others"><summary>Autres attributs \(8\)<\/summary>/);
 assert.doesNotMatch(card,/<details[^>]* open/);
 assert.match(card,/class="attribute key"[^>]*><span>Placement<\/span>/);
});

