import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreHue,scoreBadge,setNations} from '../../web/ui.js';
import {playerScreen,playerPreview,levelChart,positionPitch,positionList,attributeGroups} from '../../web/player.js';

const detail={id:1,name:'Test Joueur',position:'DD',secondary_positions:['MC'],age:19,nationalities:['FRA'],nationality_names:['France'],club:{id:1,name:'Club'},
 born:'2005-01-01',wage:12000,contract_end:'2028-06-30',value:1314589,rating:70,potential:91.5,fitness:1,form:0,morale:.5,injured_until:null,discipline:[],
 attributes:{passe:80,technique:30},position_ratings:{GB:1,DD:20,MC:12}};
const history={career:{items:[{season:2025,club:{id:1,name:'Club'},fee:null,competition:'Serie A · C1',matches:4,goals:1,assists:0,average:6.5}],totals:{fee:0,matches:4,goals:1,assists:0,average:6.5}},
 trajectory:[{year:2025,month:7,season:2025,level:110},{year:2026,month:7,season:2026,level:120}]};

const squad={scope:{kind:'club',id:1,name:'Club'},index:1,total:3,items:[{id:5,name:'Gardien Test',position:'GB'},{id:1,name:'Test Joueur',position:'DD'},{id:6,name:'Buteur Test',position:'BU'}],
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

// One point a season, at its opening, as saves from before the monthly history kept it.
const seasons=list=>list.map(([season,level,club])=>({year:season,month:7,season,level,club}));
// Consecutive months from July of `season`, the season changing every July.
const monthly=(season,levels)=>levels.map((level,index)=>{const month=6+index,year=season+Math.floor(month/12);
 return {year,month:month%12+1,season:month%12<6?year-1:year,level};});

test('level chart labels the ordinate out of 200 with a gridline per tick, in HTML text',()=>{
 const html=levelChart(seasons([[2025,110],[2026,120],[2027,145]]));
 const ticks=[...html.matchAll(/class="y-tick" style="top:[\d.]+%">(\d+)</g)].map(match=>Number(match[1]));
 assert.deepEqual(ticks,[110,120,130,140,150]);
 assert.equal((html.match(/class="grid-line"/g)||[]).length,5);
 assert.doesNotMatch(html,/<text|font-size/);
 assert.match(html,/class="point-value first" style="left:0.00%;top:[\d.]+%">110</);
 assert.match(html,/class="point-value last" style="left:100.00%;top:[\d.]+%">145</);
 assert.equal((html.match(/class="point-value/g)||[]).length,2);
 // Januaries on the abscissa, named by their year
 assert.deepEqual([...html.matchAll(/class="x-tick" style="left:([\d.]+)%">(\d+)</g)].map(match=>[match[1],match[2]]),[['25.00','2026'],['75.00','2027']]);
 const flat=levelChart(seasons([[2025,120],[2026,120]]));
 assert.equal((flat.match(/class="grid-line"/g)||[]).length,2);assert.doesNotMatch(flat,/NaN|Infinity/);
 const long=levelChart(seasons(Array.from({length:20},(_,index)=>[2000+index,80+2*index])));
 assert.doesNotMatch(long,/NaN|Infinity/);assert.deepEqual([...long.matchAll(/class="x-tick"[^>]*>(\d+)</g)].map(match=>match[1]),['2005','2010','2015']);
});

test('level chart draws every month but marks only the opening of each season and the latest month',()=>{
 const html=levelChart(monthly(2025,[110,111,111,112,113,113,114,115,115,116,117,118,118,119]));
 assert.equal(html.match(/points="([^"]*)"/)[1].split(' ').length,14);
 assert.deepEqual([...html.matchAll(/class="chart-point" style="left:([\d.]+)%[^"]*" title="([^"]*)"/g)].map(match=>[match[1],match[2]]),
  [['0.00','juillet 2025 · niveau 110'],['92.31','juillet 2026 · niveau 118'],['100.00','août 2026 · niveau 119']]);
 assert.match(html,/class="point-value last"[^>]*>119</);
 // Every half year on the abscissa for a year and a month: July by its name, January by its year
 assert.deepEqual([...html.matchAll(/class="x-tick"[^>]*>([^<]+)</g)].map(match=>match[1]),['juil.','2026','juil.']);
 const short=levelChart(monthly(2025,[110,111,112,113]));
 assert.deepEqual([...short.matchAll(/class="x-tick"[^>]*>([^<]+)</g)].map(match=>match[1]),['juil.','août','sept.','oct.']);
 const years=levelChart(monthly(2025,Array.from({length:31},(_,index)=>100+index)));
 assert.deepEqual([...years.matchAll(/class="x-tick"[^>]*>([^<]+)</g)].map(match=>match[1]),['2026','2027','2028']);
 assert.match(html,/aria-label="Évolution mensuelle du niveau, sur 200"/);
});

test('level chart keeps time proportional across the seasons recorded before the monthly history',()=>{
 const html=levelChart([...seasons([[2024,100]]),...monthly(2025,[110,111,112,113])]);
 assert.deepEqual([...html.matchAll(/class="chart-point" style="left:([\d.]+)%/g)].map(match=>match[1]),['0.00','80.00','100.00']);
 assert.equal(html.match(/points="([^"]*)"/)[1].split(' ')[1].split(',')[0],'80.00');
});

test('level chart points take the colours of the club played for, and stay neutral without one',()=>{
 const html=levelChart(seasons([[2025,110,{id:9,name:'Olympique de Marseille',major_color:'#ffffff',minor_color:'#2faee0'}],[2026,120]]));
 const [first,second]=html.split('class="chart-point"').slice(1);
 assert.match(first,/title="juillet 2025 · Olympique de Marseille · niveau 110"/);
 assert.match(first,/class="kit-dot" style="background:linear-gradient\(135deg,#ffffff 50%,#2faee0 50%\)"/);
 assert.match(second,/title="juillet 2026 · niveau 120"/);assert.match(second,/class="kit-dot neutral"/);
 const unsafe=levelChart(seasons([[2025,110,{name:'X',major_color:'red;background:url(x)',minor_color:'#000000'}],[2026,120]]));
 assert.doesNotMatch(unsafe,/url\(x\)/);assert.match(unsafe,/kit-dot neutral/);
});

test('position pitch places ratings of 10 or more on the field and outlines the main position',()=>{
 const html=positionPitch({GB:1,DD:20,MC:12,MDC:10,DC:9,BU:null},'DD');
 assert.equal((html.match(/class="shirt graded"/g)||[]).length,3);
 assert.match(html,/<button type="button" class="pitch-player main picked" data-composite-role="DD" aria-pressed="true" style="left:85%;top:70%"><span class="shirt graded" style="--hue:120" title="DD : 20 \/ 20">20</);
 assert.equal((html.match(/pitch-player main/g)||[]).length,1);
 assert.match(html,/<small>MC<\/small>/);assert.match(html,/title="MDC : 10 \/ 20">10</);
 assert.doesNotMatch(html,/<small>(GB|DC|BU)</);
 assert.equal(positionPitch({GB:1,DC:9},'DC'),'');
});

const COMPOSITE_VALUES={progression_attaque:55,occasion_attaque:45.5,tir:78,tete:64.5,progression_defense:41,occasion_defense:32,arret:23.5,sortie:22};
const BY_POSITION={GB:['arret','sortie'],DD:['progression_defense','progression_attaque','occasion_defense'],MC:['progression_attaque','progression_defense'],BU:['tir','occasion_attaque','tete']};
const playing={...detail,composites:COMPOSITE_VALUES,composites_by_position:BY_POSITION,position_notes:{DD:48.5,MC:43.1,BU:62.7},
 composite_weights:{occasion_attaque:{vision:.5,technique:.3,passe:.2}}};

test('each position of the pitch of aptitudes carries its note out of 200 beside the shirt, and the main one starts picked',()=>{
 const html=positionPitch({DD:20,MC:12,GB:1},'DD',playing);
 assert.match(html,/data-composite-role="DD" aria-pressed="true"[^>]*><span class="shirt graded"[^>]*>20<\/span><span class="position-note left"><span class="rating graded" style="--hue:\d+" title="Note au poste DD : Défense au milieu, Progression, Défense de surface, affinité au poste comprise">97</);
 assert.match(html,/data-composite-role="MC" aria-pressed="false"[^>]*>.*?<span class="position-note"><span[^>]*>86</);
 assert.equal(positionPitch({DD:20},'DD',playing,'MC').match(/aria-pressed="true"/g),null);
 // Without notes (an older server), the shirts stand alone.
 assert.doesNotMatch(positionPitch({DD:20},'DD'),/position-note/);
});

test('the central lines of the pitch stand at least 16 % apart, the wingers between striker and playmaker',()=>{
 const html=positionPitch({GB:20,DC:20,MDC:20,MC:20,MOC:20,BU:20,AILG:20,AILD:20},'MC');
 const tops=Object.fromEntries([...html.matchAll(/data-composite-role="(\w+)"[^>]*style="left:(\d+)%;top:(\d+)%"/g)].map(match=>[match[1],[Number(match[2]),Number(match[3])]]));
 const centre=['BU','MOC','MC','MDC','DC','GB'].map(role=>tops[role][1]);
 assert.ok(centre.every((top,index)=>!index||top-centre[index-1]>=16),String(centre));
 assert.ok(tops.AILG[1]>tops.BU[1]&&tops.AILG[1]<tops.MOC[1]&&tops.AILG[1]===tops.AILD[1]);
});

test('the list of positions ranks them by note, with affinity and note, and picks like the pitch',()=>{
 const html=positionList({DD:20,MC:12,BU:11,GB:1},playing);
 assert.deepEqual([...html.matchAll(/data-composite-role="(\w+)" aria-pressed="(\w+)"/g)].map(match=>[match[1],match[2]]),[['BU','false'],['DD','true'],['MC','false']]);
 assert.match(html,/^<div class="positions-list"><div class="position-row head" aria-hidden="true"><span>POSTE<\/span><span>AFFINITÉ<\/span><span>NOTE<\/span><\/div>/);
 assert.match(html,/<button type="button" class="position-row picked" data-composite-role="DD" aria-pressed="true"><span><span class="position def">DD<\/span><\/span><span><span class="rating graded" style="--hue:120" title="Affinité DD sur 20">20<\/span><\/span><span><span class="rating graded"[^>]*>97<\/span><\/span><\/button>/);
 assert.doesNotMatch(html,/Jeu demandé|JEU/);
 // Another position picked; and no list without notes (an older server).
 assert.match(positionList({DD:20,MC:12},playing,'MC'),/class="position-row picked" data-composite-role="MC"/);
 assert.equal(positionList({DD:20,MC:12},detail),'');
});

test('the aptitudes card holds the pitch and the list of its positions',async()=>{
 const {html}=await render(playing);
 assert.match(html,/<section class="card positions-card"><div class="card-head"><h2>Aptitudes par poste<\/h2><\/div><div class="positions"><div class="pitch ratings"[^]*?<\/div><div class="positions-list">/);
 assert.match((await render()).html,/<div class="positions"><div class="pitch ratings"[^]*?<\/button><\/div><\/div><\/section>/);
});

test('the Jeu section leads the attributes: an outfield player\'s six composites, those of the position marked, the others grey',async()=>{
 const {compositesGroup,compositeItems}=await import('../../web/player.js');
 assert.deepEqual(compositeItems(playing).map(item=>[item.key,item.wanted]),
  [['progression_attaque',true],['occasion_attaque',false],['tir',false],['tete',false],['progression_defense',true],['occasion_defense',true]]);
 const html=compositesGroup(playing);
 assert.match(html,/<h3>Jeu <span class="position def">DD<\/span><\/h3>/);
 assert.match(html,/<div class="attribute key" title="Progression"><span>Progression<\/span><span class="rating graded" style="--hue:\d+">110</);
 assert.match(html,/title="Création : Vision 50 % · Technique 30 % · Passe 20 %"><span>Création<\/span><span class="off-role"><span class="rating graded"[^>]*>91</);
 // Another position picked on the pitch reads the section for it.
 assert.deepEqual(compositeItems(playing,'BU').filter(item=>item.wanted).map(item=>item.key),['occasion_attaque','tir','tete']);
 assert.match(compositesGroup(playing,'BU'),/<h3>Jeu <span class="position att">BU<\/span>/);
 // A goalkeeper only has his two; without composites there is no section.
 assert.deepEqual(compositeItems({...playing,position:'GB'},'GB').map(item=>item.key),['arret','sortie']);
 assert.equal(compositesGroup(detail),'');
});

test('the Jeu section sits in the attributes card, ahead of the attributes',async()=>{
 const {html}=await render(playing);
 const attributes=html.slice(html.indexOf('>Attributs<'),html.indexOf('Aptitudes par poste'));
 assert.ok(attributes.indexOf('data-composites')>=0&&attributes.indexOf('data-composites')<attributes.indexOf('<h3>Attaque</h3>'));
 assert.match(html,/class="position-note"/);
});

test('player page is one screen without tabs or stat cards: a rail, the profile, then the history',async()=>{
 const {html,urls}=await render();
 assert.deepEqual(urls.sort(),['/api/joueurs/1','/api/joueurs/1/historique','/api/joueurs/1/navigation','/api/monde/etat']);
 assert.doesNotMatch(html,/class="tabs"|stat-card|class="avatar"|pitch-legend|Niveau sur 200|Note moyenne/);
 for(const label of ['>État<','>Contrat<','>Attributs<','>Aptitudes par poste<','>Évolution du niveau<','>Carrière<'])assert.ok(html.includes(label),label);
 assert.match(html,/^<div class="player-page"><aside class="card player-rail">/);
 const rail=html.slice(0,html.indexOf('</aside>')),main=html.slice(html.indexOf('class="player-main"'));
 assert.ok(rail.indexOf('>État<')<rail.indexOf('>Contrat<'));
 assert.ok(!main.includes('>État<')&&!rail.includes('>Attributs<'));
 assert.match(html,/Serie A · C1/);
});

test('player page puts attributes beside the pitch, then the level chart beside the career',async()=>{
 const {html}=await render();
 const top=html.slice(html.indexOf('class="player-row profile"'),html.indexOf('class="player-row history"'));
 assert.ok(top.indexOf('>Attributs<')>=0&&top.indexOf('>Attributs<')<top.indexOf('>Aptitudes par poste<'));
 assert.ok(!top.includes('>Carrière<')&&!top.includes('Évolution du niveau'));
 const bottom=html.slice(html.indexOf('class="player-row history"'));
 assert.ok(bottom.indexOf('Évolution du niveau')<bottom.indexOf('>Carrière<'));
 assert.ok(!bottom.includes('Aptitudes par poste'));
 // Without any position to show there is no pitch, and the attributes take the row.
 for(const ratings of [{},{GB:1,MC:9}]){
  const without=(await render({...detail,position_ratings:ratings})).html;
  assert.doesNotMatch(without,/player-row profile|Aptitudes par poste/);
  assert.match(without,/<div class="player-row"><section class="card attributes-card">/);
  assert.match(without,/>Carrière</);
 }
});

test('player page steps through the squad at the left of the name, and shows nothing without a club',async()=>{
 const {html}=await render();
 assert.match(html,/<div class="rail-head"><div class="entity-nav"[^]*?<\/div><span class="nation" title="FRA">FRA<\/span><h1>Test Joueur<\/h1><\/div>/);
 assert.match(html,/href="#\/player\/5" rel="prev"/);assert.match(html,/href="#\/player\/6" rel="next"/);
 assert.match(html,/<a href="#\/player\/1" aria-current="true"><span class="position def">DD<\/span><span>Test Joueur<\/span><\/a>/);
 assert.equal(html.match(/<h1>(.*?)<\/h1>/)[1],'Test Joueur');
 for(const navigation of [null,{...squad,total:1,items:[squad.items[1]],previous:null,next:null}]){
  const alone=(await render(detail,navigation)).html;
  assert.doesNotMatch(alone,/entity-nav/);assert.match(alone,/<div class="rail-head"><span class="nation" title="FRA">FRA<\/span><h1>Test Joueur<\/h1>/);
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
  assert.match(html,/title="juillet 2025 · Marseille · niveau 110"/);assert.match(html,/title="juillet 2026 · Marseille · niveau 120"/);
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

const rail=html=>html.slice(0,html.indexOf('</aside>'));

test('the rail shows age, level and potential as tiles, the birth date in the tooltip of the age',async()=>{
 const side=rail((await render()).html);
 assert.match(side,/<div class="tile" title="Né le 1 janv\. 2005"><span>Âge<\/span><strong>19<\/strong>/);
 assert.match(side,/<div class="tile graded" style="--hue:\d+" title="Niveau actuel sur 200"><span>Niveau<\/span><strong>140<\/strong>/);
 assert.match(side,/<div class="tile graded" style="--hue:120" title="Potentiel sur 200"><span>Potentiel<\/span><strong>183<\/strong>/);
 // The positions are read on the pitch, not under the name.
 assert.doesNotMatch(side.slice(side.indexOf('</h1>')),/class="position|secondary-positions/);
});

test('the flag of his main nation flies beside the name; the club carries his caps, the other nationalities a line of their own',async()=>{
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'},SEN:{name:'Sénégal',display_code:'SEN',flag:'sn'},MLI:{name:'Mali',display_code:'MLI',flag:'ml'}});
 try{
  const head=html=>html.match(/<div class="rail-head">(.*?)<h1>/)[1].replace(/^<div class="entity-nav"[^]*<\/div>/,'');
  const line=html=>html.match(/<div class="rail-identity">(.*?)<\/div><section/)[1];
  const base={...detail,nationalities:['FRA','SEN'],national_team:'SEN',national_team_id:-12,international_caps:12,international_goals:3};
  const capped=(await render(base)).html;
  // The nation he plays for, whatever its place among his nationalities, with a link to it.
  assert.equal(head(capped),'<a href="#/international/nation/-12"><span class="nation" title="Sénégal"><img class="flag" src="/flags/sn.svg" alt="" width="16" height="12" loading="lazy"></span></a>');
  assert.equal(line(capped),'<div class="rail-club"><a href="#/club/1" class="club-link">Club</a><b>12 sél - 3 buts</b></div>'
   +'<div class="fact"><span>Autre nationalité</span><strong><span class="rail-nations"><span class="nation" title="France"><img class="flag" src="/flags/fr.svg" alt="" width="16" height="12" loading="lazy"></span></span></strong></div>');
  assert.doesNotMatch(line(capped),/>France<|>Sénégal</);
  assert.match(line((await render({...base,international_goals:1})).html),/<b>12 sél - 1 but<\/b>/);
  assert.match(line((await render({...base,international_goals:0})).html),/<b>12 sél<\/b>/);
  // Never capped: the first of his nationalities beside the name, without a link, and no cap to count.
  const uncapped=(await render({...base,national_team:null,national_team_id:null,international_caps:0,international_goals:0})).html;
  assert.equal(head(uncapped),'<span class="nation" title="France"><img class="flag" src="/flags/fr.svg" alt="" width="16" height="12" loading="lazy"></span>');
  assert.match(line(uncapped),/<b>0 sél<\/b><\/div><div class="fact"><span>Autre nationalité<\/span>[^]*title="Sénégal"/);
  // One nationality: no line for the others; several others: all on the line, in the order of the source.
  assert.equal(line((await render({...base,nationalities:['SEN']})).html),'<div class="rail-club"><a href="#/club/1" class="club-link">Club</a><b>12 sél - 3 buts</b></div>');
  const three=line((await render({...base,nationalities:['FRA','SEN','MLI']})).html);
  assert.match(three,/<span>Autres nationalités<\/span>/);
  assert.deepEqual([...three.matchAll(/class="nation" title="([^"]+)"/g)].map(match=>match[1]),['France','Mali']);
  assert.match(line((await render({...base,club:null})).html),/^<div class="rail-club"><span class="muted">Libre<\/span>/);
 }finally{setNations({});}
});

test('the rail draws condition, form and morale as bars, and names what weighs on the morale',async()=>{
 const state=html=>{const side=rail(html);return side.slice(side.indexOf('>État<'),side.indexOf('>Contrat<'));};
 const fit={...detail,fitness:.83,form:1.09,form_bounds:[.7,1.3],morale:.61,morale_target:.5,morale_cause:'temps_de_jeu',wage_satisfaction:1,playing_time_satisfaction:.4};
 const html=state((await render(fit)).html);
 assert.match(html,/<span>Condition<\/span><strong><i class="gauge" aria-hidden="true"><i style="width:83%"><\/i><\/i><b>83 %<\/b>/);
 // Form runs from the middle of its bar: +9 % of the 30 % it may reach is 15 % of the bar, to the right.
 assert.match(html,/title="Forme 1,09 : [^"]*"><span>Forme<\/span><strong><i class="gauge signed" aria-hidden="true"><i class="up" style="left:50%;width:15\.0%"><\/i><\/i><b>\+9 %<\/b>/);
 assert.match(html,/title="Moral 61 %, vers 50 % · pèse surtout : son temps de jeu · salaire : 100 % de ce qu&#39;il attend · temps de jeu : 40 % de ce qu&#39;il attend"><span>Moral<\/span><strong><span class="morale-cause" title="Pèse surtout : son temps de jeu">◷<\/span><i class="gauge graded" style="--hue:\d+" aria-hidden="true"><i style="width:61%"><\/i><\/i><b>61 %<\/b>/);
 assert.match(html,/<span>Blessure<\/span><strong><span class="available">Disponible<\/span>/);
 const low=state((await render({...fit,form:.88})).html);
 assert.match(low,/<i class="down" style="right:50%;width:20\.0%"><\/i><\/i><b>−12 %<\/b>/);
 // Within ±2 % form changes nothing and its bar stays empty; an older server gives no bounds, hence no bar.
 assert.match(state((await render({...fit,form:1.01})).html),/<i class="gauge signed" aria-hidden="true"><\/i><b>\+1 %<\/b>/);
 assert.match(state((await render({...fit,form_bounds:undefined})).html),/<span>Forme<\/span><strong><b>\+9 %<\/b>/);
 // A cause is named whatever the morale, as soon as the server gives one; without one the bar stands alone.
 assert.match(state((await render({...fit,morale:.9,morale_cause:'salaire'})).html),/class="morale-cause" title="Pèse surtout : son salaire">€</);
 assert.doesNotMatch(state((await render({...fit,morale_cause:null})).html),/morale-cause/);
});

test('the rail counts yellow cards over all competitions and names a suspension with its competition',async()=>{
 const discipline=[{competition:'Ligue 1',yellows:3,suspended_matches:0},{competition:'Coupe',yellows:1,suspended_matches:2}];
 const side=rail((await render({...detail,discipline,injured_until:'2026-03-04'})).html);
 assert.match(side,/<div class="fact" title="Ligue 1 3 · Coupe 1"><span>Cartons<\/span><strong>4<\/strong>/);
 assert.match(side,/<span>Suspension<\/span><strong><span class="danger">Coupe · 2 matchs<\/span>/);
 assert.match(side,/<span>Blessure<\/span><strong><span class="danger">Retour le 4 mars 2026<\/span>/);
 assert.doesNotMatch(rail((await render()).html),/Suspension/);
});

test('the rail carries salary, contract end, market value and asking price',async()=>{
 const side=rail((await render({...detail,asking_price:2500000})).html);
 const contract=side.slice(side.indexOf('>Contrat<'));
 for(const label of ['Salaire mensuel','Fin du contrat','Valeur de marché','Prix minimum'])assert.ok(contract.includes(`<div class="fact"><span>${label}</span>`),label);
 assert.match(rail((await render({...detail,transferable:false})).html),/Prix minimum<\/span><strong>Intransférable</);
 const free=rail((await render({...detail,club:null,wage:0,contract_end:null})).html);
 assert.match(free,/Salaire mensuel<\/span><strong>—<\/strong>/);assert.doesNotMatch(free,/Prix minimum/);
});

test('attributes are graded badges without bars, and greed closes Général in a plain badge',async()=>{
 const {html}=await render({...detail,attributes:{passe:80,technique:30,vitesse:50},greed:.21});
 const card=html.match(/<section class="card attributes-card"><div class="card-head"><h2>Attributs[^]*?<\/section>/)[0];
 assert.match(card,/class="attribute"><span>Passe<\/span><span class="rating graded" style="--hue:120">16</);
 assert.match(card,/<span>Technique<\/span><span class="rating graded" style="--hue:\d+">6</);
 assert.doesNotMatch(card,/class="gauge|class="meter"|Niv\.|Pot\./);
 assert.match(card,/<h3>Général<\/h3><div class="attributes-grid">.*<span>Vitesse<\/span>[^]*?<\/div><div class="attribute"><span>Appât du gain<\/span><span class="rating" title="Appât du gain sur 20">5<\/span><\/div><\/div>/);
 assert.doesNotMatch((await render()).html,/Appât du gain|class="potential"|Potentiel estimé/);
});

test('the career card is one table: the clubs, then the national team under its name in the same four columns',async()=>{
 setNations({SEN:{name:'Sénégal',display_code:'SEN',flag:'sn'}});
 try{
  const records=[{edition:2026,matches:3,goals:1,assists:0,rating_sum:13,rating_count:2,average:6.5},{edition:2028,matches:5,goals:2,assists:2,rating_sum:35,rating_count:5,average:7}];
  const capped={...detail,national_team:'SEN',national_team_id:-12,international_caps:20,international_goals:5,historical_caps:12,historical_goals:2,international_records:records};
  const card=(await render(capped)).html.match(/<section class="card career-card">[^]*?<\/section>/)[0];
  assert.equal((card.match(/<table/g)||[]).length,1);
  assert.match(card,/<thead><tr><th>SAISON<\/th><th>CLUB<\/th><th>TRANSFERT<\/th><th>COMPÉTITION<\/th><th>MATCHS<\/th><th>BUTS<\/th><th>PASSES<\/th><th>NOTE<\/th><\/tr><\/thead>/);
  // A gap sets the clubs and the national team apart.
  assert.match(card,/<tr class="total"><td>Total<\/td><td><\/td><td>—<\/td><td><\/td><td>4<\/td><td>1<\/td><td>0<\/td><td>6,5<\/td><\/tr><\/tbody><tbody class="career-gap" aria-hidden="true"><tr><td colspan="8"><\/td><\/tr><\/tbody><tbody><tr class="nation-head">/);
  // The nation's name spans the four columns the national team has no use for, so that its figures fall under the clubs'.
  const nation=card.slice(card.indexOf('<tr class="nation-head">'));
  assert.match(nation,/^<tr class="nation-head"><th colspan="4"><a href="#\/international\/nation\/-12"><span class="nation" title="Sénégal"><img[^>]*>Sénégal<\/span><\/a><\/th><th>MATCHS<\/th><th>BUTS<\/th><th>PASSES<\/th><th>NOTE<\/th><\/tr>/);
  // Editions newest first, then what he had played before the game, then his totals with the mean of every rated match.
  assert.deepEqual([...nation.matchAll(/<tr>(.*?)<\/tr>/g)].map(match=>match[1].replace(/<[^>]+>/g,'|').replace(/\|+/g,'|')),
   ['|2028|5|2|2|7|','|2026|3|1|0|6,5|','|Historique importé|12|2|—|—|']);
  assert.match(nation,/<tr class="total"><td colspan="4">Total<\/td><td>20<\/td><td>5<\/td><td>2<\/td><td>6,9<\/td><\/tr><\/tbody><\/table>/);
  // An edition without any rated match, and a player never capped.
  const unrated=(await render({...capped,historical_caps:0,historical_goals:0,international_records:[{edition:2028,matches:1,goals:0,assists:0,rating_sum:0,rating_count:0,average:null}]})).html;
  assert.match(unrated,/<td colspan="4"><a href="#\/international\/2028">2028<\/a><\/td><td>1<\/td><td>0<\/td><td>0<\/td><td>—<\/td>/);
  assert.match(unrated,/<td colspan="4">Total<\/td><td>20<\/td><td>5<\/td><td>0<\/td><td>—<\/td>/);
  assert.doesNotMatch((await render({...capped,international_caps:0})).html,/nation-head|career-gap/);
 }finally{setNations({});}
});

test('retired players keep only their level history and career',async()=>{
 const {html}=await render({id:1,name:'Ancien',retired:true});
 assert.match(html,/CARRIÈRE ARCHIVÉE/);assert.match(html,/Évolution du niveau/);assert.match(html,/>Carrière</);
 assert.doesNotMatch(html,/Attributs|player-rail|rail-section/);
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
 const card=html.match(/<section class="card attributes-card"><div class="card-head"><h2>Attributs[^]*?<\/section>/)[0];
 assert.deepEqual([...card.matchAll(/<h3>([^<]+)<\/h3>/g)].map(match=>match[1]),['Défense','Attaque','Général']);
 assert.match(card,/class="attribute key" title="Compte pour 38 % de la note du poste"><span>Finition<\/span>/);
 assert.match(card,/class="attribute"><span>Vision<\/span>/);
 assert.doesNotMatch(card,/attribute-others|Réflexes/);
});

test('a goalkeeper card folds the other attributes closed by default',async()=>{
 const {html}=await render(of('GB'));
 const card=html.match(/<section class="card attributes-card"><div class="card-head"><h2>Attributs[^]*?<\/section>/)[0];
 assert.deepEqual([...card.matchAll(/<h3>([^<]+)<\/h3>/g)].map(match=>match[1]),['Gardien','Général']);
 assert.match(card,/<details class="attribute-others"><summary>Autres attributs \(8\)<\/summary>/);
 assert.doesNotMatch(card,/<details[^>]* open/);
 assert.match(card,/class="attribute key"[^>]*><span>Placement<\/span>/);
});


test('beside a list of players, the picked one is previewed in the words of his page, with its actions',async()=>{
 const previous=globalThis.fetch,urls=[];
 const picked={...detail,form:.91,form_bounds:[.7,1.3],morale:.72,morale_cause:'salaire',international_caps:18,international_goals:3,asking_price:592e6,transferable:true,wage_demand:21462,interested:false,expiring:false,
  position_notes:{DD:70,MC:60},composites:{progression_attaque:60,occasion_attaque:50,tir:40,tete:45,progression_defense:70,occasion_defense:65},composites_by_position:{DD:['progression_defense','progression_attaque','occasion_defense']},attribute_weights:{passe:.3}};
 const talks={etape:null,obstacle:null,contre_offre:null,tours_restants:3,budget:5e6};
 const squad={pret:null,en_reserve:false,obstacle_reserve:null,sens:'entrant',clubs:[],durees:[],obstacle_pret:'Brest ne souhaite pas prêter Test Joueur.'};
 globalThis.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('/negociation/')?talks:url.includes('/effectif/')?squad:picked};};
 let html;
 try{html=await playerPreview(1,{controlled_club_id:7,market:'summer'});}finally{globalThis.fetch=previous;}
 assert.deepEqual(urls,['/api/joueurs/1','/api/ma-partie/negociation/1','/api/ma-partie/effectif/1']);
 assert.match(html,/^<div class="card preview"><div class="preview-head">.*<h2><a href="#\/player\/1">Test Joueur<\/a><\/h2><span class="position def">DD<\/span>/);
 assert.match(html,/18 sél - 3 buts/);
 // Condition, form and morale, then the contract with what he asks to join the user's club.
 for(const title of ['État','Contrat','Postes','Attributs'])assert.ok(html.includes(`<h3>${title}</h3>`),title);
 assert.match(html,/<span>Forme<\/span>.*−9 %/);assert.match(html,/<span>Prétentions<\/span><strong>93\s000\s€ \/ mois<\/strong>/);assert.match(html,/<span>Intéressé<\/span><strong>Non<\/strong>/);
 assert.doesNotMatch(html,/Blessure|Cartons/);
 // His positions, best note first, then what the engine reads of him and his attributes.
 assert.match(html,/class="position-row picked" data-composite-role="DD"/);
 assert.match(html,/<h3>Jeu <span class="position def">DD<\/span><\/h3>/);
 assert.match(html,/<div class="attribute key"[^>]*><span>Passe<\/span>/);
 assert.match(html,/<a class="button" href="#\/player\/1">Ouvrir la fiche<\/a>.*Faire une offre/);
 // An injury shows in its place; a retired player has no preview.
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/negociation/')?talks:{...picked,injured_until:'2030-06-01'}});
 try{assert.match(await playerPreview(1,{controlled_club_id:null}),/<span>Blessure<\/span><strong><span class="danger">Retour le 1 juin 2030/);}finally{globalThis.fetch=previous;}
 globalThis.fetch=async()=>({ok:true,json:async()=>({id:1,name:'Ancien',retired:true})});
 try{assert.equal(await playerPreview(1,{}),'');}finally{globalThis.fetch=previous;}
});
