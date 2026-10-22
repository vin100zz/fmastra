import test from 'node:test';
import assert from 'node:assert/strict';
import {internationalScreen,editionContent,editionSection,editionRound,campDays} from '../../web/international.js';
import {clubLink,setNations} from '../../web/ui.js';

const nation={id:-1001,name:'France <test>',nation:'FRA',national:true,federation:'Europe',strength:80};
const row={nation,played:8,won:5,drawn:2,lost:1,goals_for:15,goals_against:5,difference:10,points:17};
const edition={year:2028,name:'Euro 2028',kind:'euro',code:'EU',qualification_groups:[{name:'A',rows:[row]}],final_groups:[],best_seconds:[row],second_places:6,qualifiers:[],matches:[],records:[]};

test('international tables give the full record, rank the seconds and escape nation labels',()=>{
 const html=editionContent(edition);
 assert.match(html,/Classement des deuxièmes/);
 assert.match(html,/<th class="count-column"[^>]*><button class="sort-toggle" data-table-sort>N<\/button><\/th><th class="count-column"[^>]*><button class="sort-toggle" data-table-sort>D<\/button><\/th>/);
 // The columns of the charter, in its order, and a goal difference written with its sign.
 assert.match(html,/PTS<.*>J<.*>V<.*>N<.*>D<.*BP<.*BC<.*DIFF\.</s);assert.match(html,/>\+10<\/td>/);
 assert.doesNotMatch(html,/places qualificatives/);
 assert.match(html,/France &lt;test&gt;/);
 assert.match(clubLink(nation),/href="#\/international\/nation\/-1001"/);
 assert.doesNotMatch(clubLink(nation),/href="#\/club\//);
 assert.match(editionContent(edition,'finals'),/fin des qualifications/);
});

const navigation={scope:{name:'Europe'},index:0,total:2,items:[{id:-1001,name:'France <test>'},{id:-1002,name:'Espagne'}],previous:null,next:{id:-1002,name:'Espagne'}};
const tally={played:6,won:5,drawn:1,lost:0,goals_for:14,goals_against:3};
// What the API says of its history, its overview and its players.
const archive={items:[{year:2028,name:'Euro 2028',kind:'euro',code:'EU',first_phase:'Qualifié',finals:{label:'Vainqueur',level:7,winner:true},stage:{label:'Vainqueur',level:0},
 record:tally,scorer:{player_id:6,player:'Buteur',goals:6},strength:{value:84,change:2}}],current:null,honours:[{kind:'euro',code:'EU',competition:'Euro',count:1,years:[2028]}],
 record:{rows:[{kind:'euro',code:'EU',phase:'finals',competition:'Euro',editions:1,...tally}],total:{editions:1,...tally}},strength:[{season:2027,value:82},{season:2028,value:84}]};
const squadArchive={formation:'4-3-3',eleven:[{position:'GB',player_id:5,player:'Cap <test>',matches:10}],matches:[{player_id:5,player:'Cap <test>',position:'GB',editions:2,matches:10,goals:0,assists:0,note:6.8}],
 goals:[],notes:[],note_matches:5};

const spain={id:-1002,name:'Espagne',nation:'ESP',national:true,federation:'Europe',strength:84};
const starter={id:12,name:'Titulaire',position:'MC',age:25,rating:80,potential:84,club:{id:7,name:'Lens',major_color:'#cc0000',minor_color:'#ffd700'},value:1e6,wage:1000,contract_end:'2030-06-30',
 fitness:.9,form:1.05,caps:12,international_goals:3,appearances:2,substitutes:0,goals:1,assists:1,average:7.25};
const reinforcement={id:-1,name:'Renfort',position:'GB',age:28,rating:60,potential:60,club:null,value:null,wage:null,contract_end:null,fitness:.9,form:1,caps:0,international_goals:0,appearances:0,substitutes:0,goals:0,assists:0,average:null};
const fixture=(id,home,away,extra={})=>({id,date:'2026-09-04',competition:'Euro 2028',competition_id:-102028,competition_code:'EU',international:true,round_label:'Qualifications · J1',home,away,score:null,penalties:null,neutral:false,...extra});
// What the API says of a selection: its kit, the edition it plays, its camp, then the widgets beside the list.
const page=(over={})=>({...nation,major_color:'#1f3f94',minor_color:'#ffffff',competition:{year:2028,name:'Euro 2028',stage:'Qualifications'},
 camp:{start:'2026-08-31',end:'2026-09-09',upcoming:true},squad:[starter,reinforcement],matches:[],
 calendar:{last:[fixture(1,nation,spain,{score:[2,1],outcome:'V'}),fixture(2,spain,nation,{competition:'Coupe du monde 2026',competition_code:'CM',round_label:'Demi-finales',neutral:true,score:[1,1],penalties:[4,5],outcome:'V'})],next:[fixture(3,spain,nation)]},
 lineup:null,group:{year:2028,edition:'Euro 2028',code:'EU',finals:false,name:'D',places:1,rows:[row,{...row,nation:spain,points:12,difference:-3}]},...over});
const scorer=(id,name,...minutes)=>({id,name,minutes});
const qualifier=(id,date,round,home,away,extra={})=>fixture(id,home,away,{date,competition:'Coupe du monde 2030',competition_id:-102030,competition_code:'CM',round_label:`Qualifications · J${round}`,outcome:null,scorers:null,...extra});
// What the API says of its calendar: the matches of one edition, its group there, its record in each edition it played.
const seasons=(over={})=>({edition:2030,editions:[{year:2030,name:'Coupe du monde 2030'},{year:2028,name:'Euro 2028'}],
 items:[qualifier(11,'2028-09-01',1,nation,spain,{score:[4,0],outcome:'V',scorers:[[scorer(12,'Kylian Titulaire','12','67'),scorer(-4,'Un Renfort','81')],[]]}),
  qualifier(12,'2028-09-04',2,spain,nation,{score:[1,1],outcome:'N',scorers:[[scorer(90,'Pedro Autre','23')],[scorer(12,'Kylian Titulaire','54')]]}),
  qualifier(13,'2029-03-23',3,spain,nation),qualifier(14,'2029-03-26',4,nation,spain)],
 group:{year:2030,edition:'Coupe du monde 2030',code:'CM',finals:false,name:'D',places:1,rows:[row,{...row,nation:spain,points:12,difference:-3}]},
 competitions:[{id:-102030,year:2030,name:'Coupe du monde 2030',kind:'international',code:'CM',place:'1er du groupe D',winner:false,played:2,won:1,drawn:1,lost:0,goals_for:5,goals_against:1},
  {id:-102028,year:2028,name:'Euro 2028',kind:'international',code:'EU',place:'Vainqueur',winner:true,played:16,won:12,drawn:3,lost:1,goals_for:34,goals_against:9}],...over});
const serving=(answer,calendar=seasons())=>async url=>({ok:true,json:async()=>url.includes('/navigation')?navigation:url.includes('/calendrier')?calendar:url.includes('/historique')?(url.includes('vue=joueurs')?squadArchive:archive):url.includes('/nations/')?answer:{enabled:true,nations:[nation],editions:[{year:2028,name:'Euro 2028',winner:null}]}});

test('a selection’s page wears a club’s header: its colours, its flag on the disc, the edition it plays, its strength, the tabs',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=serving(page());
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'},ESP:{name:'Espagne',display_code:'ESP',flag:'es'}});
 try{
  assert.match(await internationalScreen(),/data-sortable/);
  const html=await internationalScreen('nation','-1001');
  assert.match(html,/^<header class="club-hero" style="--hero-field:#1f3f94;--hero-ink:#ffffff;--hero-sash:#ffffff;/);
  assert.match(html,/<div class="club-hero-main"><div class="entity-nav"/);assert.match(html,/entity-step next/);
  assert.match(html,/<div class="crest club-hero-crest">F&lt;<img class="crest-flag" src="\/flags\/fr\.svg" alt=""><\/div>/);
  // Its name alone: neither its confederation nor the edition it plays follows it.
  assert.match(html,/<div class="club-hero-name"><h1>France &lt;test&gt;<\/h1><\/div>/);assert.doesNotMatch(html,/club-hero-context/);
  // One figure only: no title count, no last edition, no rank in the group.
  assert.match(html,/<div class="club-hero-tiles"><div class="club-hero-tile"><span>Force<\/span><strong>80<\/strong><\/div><\/div>/);
  assert.match(html,/<nav class="club-hero-tabs" aria-label="Sections"><a class="active" href="#\/international\/nation\/-1001\/squad" aria-current="page">Effectif<\/a><a class="" href="#\/international\/nation\/-1001\/calendar">Calendrier<\/a><a class="" href="#\/international\/nation\/-1001\/history">Historique<\/a><\/nav>/);
  assert.doesNotMatch(html,/class="page-heading"|class="eyebrow"|\/ 100|Joueurs éligibles/);
  // A nation without colours keeps a plain band.
  globalThis.fetch=serving(page({major_color:null,minor_color:null,competition:null,group:null}));
  const plain=await internationalScreen('nation','-1001');
  assert.match(plain,/^<header class="club-hero plain">/);
  assert.doesNotMatch(plain,/standings-extract/);
  const history=await internationalScreen('nation','-1001','history');
  assert.match(history,/<a class="active" href="#\/international\/nation\/-1001\/history" aria-current="page">Historique<\/a>/);
  // Its overview, and the choice of the views at the end of the row of tabs.
  assert.match(history,/<div class="tools"><nav class="segmented views" aria-label="Vues de l’historique"><a class="active" aria-current="page" href="#\/international\/nation\/-1001\/history">Vue d’ensemble<\/a><a href="#\/international\/nation\/-1001\/history\?vue=editions">Éditions<\/a>/);
  assert.match(history,/<h2>Parcours et force<\/h2>/);assert.match(history,/<h2>Palmarès<\/h2>/);assert.match(history,/<h2>Bilan<\/h2>/);
  assert.match(history,/title="Euro 2028 : Vainqueur"/);
  assert.doesNotMatch(history,/club-squad-layout|undefined|NaN/);
  const editionsView=await internationalScreen('nation','-1001','history',new URLSearchParams('vue=editions'));
  assert.match(editionsView,/<a class="active" aria-current="page" href="#\/international\/nation\/-1001\/history\?vue=editions">Éditions<\/a>/);
  assert.match(editionsView,/Qualifié/);assert.match(editionsView,/<span class="reached won"><svg[^]*?<\/svg>Vainqueur<\/span>/);assert.match(editionsView,/Buteur/);
  const players=await internationalScreen('nation','-1001','history',new URLSearchParams('vue=joueurs'));
  assert.match(players,/Cap &lt;test&gt;/);assert.match(players,/<h2>Plus de sélections<\/h2>/);
 }finally{globalThis.fetch=previous;setNations({});}
});

test('the list of a camp is a club’s squad list, with each player’s club, his caps and what he did in the edition',async()=>{
 const previous=globalThis.fetch,asked=[];
 globalThis.fetch=async url=>{asked.push(url);return serving(page())(url);};
 try{
  const html=await internationalScreen('nation','-1001');
  assert.match(html,/<div class="club-squad-layout"><div class="club-squad"><section class="card"><div class="card-head"><h2>Rassemblement du 31 août au 9 septembre 2026 · 2 joueurs<\/h2><div class="card-tools"><div class="segmented" role="group" aria-label="Colonnes">/);
  assert.match(html,/POSTE.*JOUEUR.*CLUB.*ÂGE.*NIV\..*POT\..*VALEUR.*SALAIRE.*CONTRAT.*ÉTAT.*FORME.*SÉL\..*BUTS.*MJ.*>B<.*PD.*NOTE/s);
  assert.doesNotMatch(html,/NAT\.|MORAL/);
  // The server sorts it, on the position by default; a reinforcement has neither a club nor a value.
  assert.match(html,/<button data-first="asc" data-order="asc" data-sort="position">POSTE<\/button>/);
  assert.match(html,/<button data-first="desc" data-sort="caps"><span title="Sélections">SÉL\.<\/span><\/button>/);
  assert.match(html,/temporary-player/);
  assert.match(html,/<a href="#\/player\/12">Titulaire<\/a><\/span><\/td><td><a href="#\/club\/7" class="club-link">/);
  assert.match(html,/<span class="num">12<\/span><\/td><td><span class="num">3<\/span><\/td><td><span class="num">2<\/span><\/td><td><span class="num">1<\/span><\/td><td><span class="num">1<\/span><\/td><td><span class="num">7\.25<\/span>/);
  assert.deepEqual(asked,['/api/international/nations/-1001','/api/international/nations/-1001/navigation']);
  // The sort and the view of the address go to the list; the other tabs ask for none.
  asked.length=0;
  const sorted=await internationalScreen('nation','-1001','squad',new URLSearchParams('tri=caps&ordre=desc&vue=attributs'));
  assert.equal(asked[0],'/api/international/nations/-1001?tri=caps&ordre=desc');
  assert.match(sorted,/data-view="attributs" aria-pressed="true"/);assert.match(sorted,/JOUEUR.*CLUB.*ÂGE.*PAS/s);assert.doesNotMatch(sorted,/SALAIRE/);
  asked.length=0;
  await internationalScreen('nation','-1001','calendar',new URLSearchParams('tri=caps'));
  assert.equal(asked[0],'/api/international/nations/-1001');
 }finally{globalThis.fetch=previous;}
});

test('the calendar tab lists the matches of one edition as a club’s season, beside its group and its record in each edition',async()=>{
 const previous=globalThis.fetch,asked=[];
 globalThis.fetch=async url=>{asked.push(url);return serving(page())(url);};
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'},ESP:{name:'Espagne',display_code:'ESP',flag:'es'}});
 try{
  const html=await internationalScreen('nation','-1001','calendar');
  assert.deepEqual(asked,['/api/international/nations/-1001','/api/international/nations/-1001/navigation','/api/international/nations/-1001/calendrier']);
  assert.match(html,/<a class="active" href="#\/international\/nation\/-1001\/calendar" aria-current="page">Calendrier<\/a>/);
  // The editions are stepped through as a club's seasons are, at the end of the row of tabs; the card names none.
  assert.match(html,/aria-current="page">Calendrier<\/a><a class="" href="#\/international\/nation\/-1001\/history">Historique<\/a><\/nav><div class="tools"><div class="season" role="group" aria-label="Édition"><button type="button" aria-label="Édition précédente" data-param="edition" data-param-value="2028"><svg[^>]*><path[^>]*\/><\/svg><\/button><details class="season-pick"><summary style="--chars:19">Coupe du monde 2030</);
  assert.match(html,/aria-label="Éditions"><button type="button" role="menuitemradio" aria-checked="true" data-param="edition" data-param-value="2030">Coupe du monde 2030<\/button><button type="button" role="menuitemradio" aria-checked="false" data-param="edition" data-param-value="2028">Euro 2028<\/button><\/div><\/details><button type="button" aria-label="Édition suivante" disabled><svg[^>]*><path[^>]*\/><\/svg><\/button><\/div><\/div><\/div><\/header>/);
  assert.match(html,/<div class="calendar-layout club-calendar selection-calendar"><section class="card calendar-card"><div class="card-head"><h2>Matches<\/h2><\/div>/);
  const rows=html.split(/<div class="calendar-row(?=[ "])/).slice(1);
  assert.equal(rows.length,4);
  // The day with its year, the edition's badge, a qualifying round by its number; the selection's goals and scorers first.
  assert.match(rows[0],/<span class="calendar-date">1 sept\. 2028<\/span><a class="competition-code international" href="#\/international\/coupe-du-monde\?edition=2030" title="Coupe du monde 2030">CM<\/a><span class="calendar-round" title="Qualifications · J1">J1<\/span><span class="calendar-venue"><\/span>/);
  assert.match(rows[0],/<a href="#\/international\/nation\/-1002" class="club-link"><span class="nation"><span class="nation" title="Espagne"><img class="flag" src="\/flags\/es\.svg"/);
  assert.match(rows[0],/<a class="calendar-score V" href="#\/match\/11" title="Victoire · Coupe du monde 2030 · Qualifications · J1 · Domicile">4–0<\/a><span class="calendar-scorers"><a href="#\/player\/12" title="Kylian Titulaire">Titulaire<\/a> 12’ 67’ · Renfort 81’<\/span><span class="calendar-scorers theirs"><\/span>/);
  assert.match(rows[1],/<span class="calendar-venue"><svg class="away"/);
  assert.match(rows[1],/<a class="calendar-score N" href="#\/match\/12"[^>]*>1–1<\/a><span class="calendar-scorers"><a href="#\/player\/12"[^>]*>Titulaire<\/a> 54’<\/span><span class="calendar-scorers theirs"><a href="#\/player\/90"[^>]*>Autre<\/a> 23’<\/span>/);
  // The first match to play stands out.
  assert.match(rows[2],/^ coming next" data-competition="-102030">/);assert.match(rows[2],/<span class="calendar-date">23 mars 2029<\/span>/);assert.match(rows[2],/<em>Prochain<\/em>/);
  assert.match(rows[3],/^ coming" data-competition="-102030">/);assert.doesNotMatch(rows[3],/Prochain/);
  // Beside the matches: the whole group in the charter's columns, then the record in each edition.
  const side=html.split('<aside class="calendar-side">')[1];
  assert.match(side,/^<section class="card standings-card"><div class="card-head"><h2>Groupe D – 8<span class="ordinal">e<\/span> journée<\/h2><a href="#\/international\/coupe-du-monde\/qualifications\?edition=2030" aria-label="Voir le groupe">Voir →<\/a>/);
  assert.match(side,/NATION<.*PTS<.*>J<.*>V<.*>N<.*>D<.*BP<.*BC<.*DIFF\.</s);assert.match(side,/<tr class="promoted own"/);
  assert.ok(side.indexOf('Groupe D')<side.indexOf('<h2>Bilan</h2>'));
  assert.match(side,/COMPÉTITION<.*PLACE<.*>J<.*>V<.*>N<.*>D<.*BP<.*BC</s);
  assert.match(side,/<a class="competition-code international" href="#\/international\/coupe-du-monde\?edition=2030" title="Coupe du monde 2030">CM<\/a><a class="strong" href="#\/international\/coupe-du-monde\/finals\?edition=2030">Coupe du monde 2030<\/a><\/td><td[^>]*>1er du groupe D<\/td><td[^>]*>2<\/td><td[^>]*>1<\/td><td[^>]*>1<\/td><td[^>]*>0<\/td><td[^>]*>5<\/td><td[^>]*>1<\/td>/);
  assert.match(side,/href="#\/international\/euro\?edition=2028" title="Euro 2028">EU<\/a><a class="strong" href="#\/international\/euro\/finals\?edition=2028">Euro 2028<\/a><\/td><td[^>]*><span class="strong">✦ Vainqueur<\/span><\/td><td[^>]*>16<\/td>/);
  assert.doesNotMatch(html,/Calendrier et résultats|fixture-date|undefined|null/);
  // The edition of the address goes to the server; anything else than a year is left out.
  asked.length=0;
  await internationalScreen('nation','-1001','calendar',new URLSearchParams('edition=2028'));
  assert.equal(asked[2],'/api/international/nations/-1001/calendrier?edition=2028');
  asked.length=0;
  await internationalScreen('nation','-1001','calendar',new URLSearchParams('edition=x'));
  assert.equal(asked[2],'/api/international/nations/-1001/calendrier');
 }finally{globalThis.fetch=previous;setNations({});}
});

test('a calendar of the finals writes its rounds in full and flies nowhere on neutral ground; one edition has nowhere to step to; none says so',async()=>{
 const previous=globalThis.fetch;
 const finals=seasons({edition:2028,editions:[{year:2028,name:'Euro 2028'}],group:null,
  items:[fixture(21,spain,nation,{date:'2028-06-24',round_label:'Quarts de finale',neutral:true,score:[1,1],penalties:[3,4],outcome:'V',scorers:[[],[]]})],
  competitions:[{id:-102028,year:2028,name:'Euro 2028',kind:'international',code:'EU',place:'Demi-finales',winner:false,played:1,won:1,drawn:0,lost:0,goals_for:1,goals_against:1}]});
 try{
  globalThis.fetch=serving(page(),finals);
  const html=await internationalScreen('nation','-1001','calendar');
  assert.match(html,/<h2>Matches<\/h2><\/div>/);assert.doesNotMatch(html,/standings-card/);
  assert.match(html,/aria-label="Édition précédente" disabled><svg[^>]*><path[^>]*\/><\/svg><\/button><details class="season-pick"><summary>Euro 2028</);assert.match(html,/aria-label="Édition suivante" disabled>/);
  assert.match(html,/<span class="calendar-round" title="Quarts de finale">Quarts de finale<\/span><span class="calendar-venue"><\/span>/);
  assert.match(html,/<small>t\.a\.b\. 4–3<\/small>/);assert.match(html,/title="Victoire · Euro 2028 · Quarts de finale · Terrain neutre">1–1<\/a>/);
  assert.match(html,/<td[^>]*>Demi-finales<\/td>/);
  globalThis.fetch=serving(page(),{edition:null,editions:[],items:[],group:null,competitions:[]});
  const empty=await internationalScreen('nation','-1001','calendar');
  assert.match(empty,/Calendrier vide/);assert.doesNotMatch(empty,/class="season"/);
  // The other tabs read no edition: nothing closes their row.
  globalThis.fetch=serving(page());
  assert.doesNotMatch(await internationalScreen('nation','-1001'),/class="tools"/);
 }finally{globalThis.fetch=previous;}
});

// What the API says of the competitions: their colours, who holds each title, where each one stands, their finals.
const finalOf=(year,winner,runner_up,extra={})=>({year,match_id:year,winner,runner_up,score:[2,1],penalties:null,...extra});
const competitions=[
 {kind:'world',slug:'coupe-du-monde',name:'Coupe du monde',code:'CM',major_color:'#d4a72c',minor_color:null,ground_color:'#111418',holder:null,current:null,next:{year:2030,draw:'2028-08-01'},finals:[]},
 {kind:'euro',slug:'euro',name:'Euro',code:'EU',major_color:'#003399',minor_color:'#ffcc00',ground_color:null,holder:nation,current:{year:2032,stage:'Qualifications',next:{date:'2031-03-18',round:'J1'}},next:null,
  finals:[finalOf(2028,nation,spain,{score:[1,1],penalties:[4,3]})]},
 {kind:'nations',slug:'ligue-des-nations',name:'Ligue des nations',code:'LN',major_color:'#00a6d6',minor_color:null,ground_color:'#0b1e3f',holder:null,current:{year:2031,stage:'Phase de ligue',next:{date:'2030-10-11',round:'J4'}},next:null,finals:[]}];
// The editions, the latest first.
const listed=[{year:2032,name:'Euro 2032',kind:'euro',code:'EU',winner:null},{year:2031,name:'Ligue des nations 2031',kind:'nations',code:'LN',winner:null},
 {year:2028,name:'Euro 2028',kind:'euro',code:'EU',winner:nation}];
const overview={enabled:true,nations:[nation],editions:listed,competitions};

test('a competition’s page opens on its header, steps to the other competitions from its band and through its editions at the end of its tabs',async()=>{
 const previous=globalThis.fetch,asked=[];
 const euro={...edition,year:2032,name:'Euro 2032',kind:'euro',code:'EU',major_color:'#003399',minor_color:'#ffcc00',ground_color:null,winner:null,holder:nation};
 globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>url.includes('/editions/')?euro:overview};};
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'}});
 try{
  const html=await internationalScreen('euro','statistics');
  // The Euro's blue crossed by its yellow, its trophy alone on the band, then its name alone: the year is the steps'.
  assert.match(html,/^<header class="club-hero" style="--hero-field:#003399;--hero-ink:#ffffff;--hero-sash:#ffcc00;/);
  assert.match(html,/<\/div><img class="club-hero-emblem" src="\/emblems\/euro\.png" alt=""><div class="club-hero-identity"><div class="club-hero-name"><h1>Euro<\/h1><\/div><\/div>/);
  assert.doesNotMatch(html,/page-heading|Sélections nationales|Euro 2032<\/h1>/);
  // The edition under way opens by default; the address carries it from one tab to the next.
  assert.deepEqual(asked,['/api/international','/api/international/editions/2032']);
  assert.match(html,/<a class="active" href="#\/international\/euro\/statistics\?edition=2032" aria-current="page">Statistiques<\/a><a class="" href="#\/international\/euro\/history\?edition=2032">Historique<\/a><\/nav><div class="tools">/);
  // Its editions, the latest first, by their year: the one under way says so.
  assert.match(html,/<div class="season" role="group" aria-label="Édition"><button type="button" aria-label="Édition précédente" data-param="edition" data-param-value="2028">/);
  assert.match(html,/<summary>2032<svg/);
  assert.match(html,/<button type="button" role="menuitemradio" aria-checked="true" data-param="edition" data-param-value="2032">2032<span>en cours<\/span><\/button><button type="button" role="menuitemradio" aria-checked="false" data-param="edition" data-param-value="2028">2028<\/button>/);
  assert.match(html,/aria-label="Édition suivante" disabled>/);
  // Its band steps to the World Cup and to the Nations League, the open tab kept.
  assert.match(html,/<div class="entity-nav" role="group" aria-label="Choisir une compétition"><a class="entity-step prev" href="#\/international\/coupe-du-monde\/statistics" rel="prev" aria-label="Précédent : Coupe du monde"/);
  assert.match(html,/<a class="entity-step next" href="#\/international\/ligue-des-nations\/statistics" rel="next" aria-label="Suivant : Ligue des nations"/);
  assert.match(html,/<summary aria-label="Choisir une compétition" title="Compétitions des sélections · 2 \/ 3">/);
  // Until it is won, the edition's tile names who won the one before it.
  assert.match(html,/<span>Tenant du titre<\/span><strong><a href="#\/international\/nation\/-1001" class="club-link">/);
  // An edition of the address: its winner on the tile.
  asked.length=0;
  globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>url.includes('/editions/')?{...euro,year:2028,name:'Euro 2028',winner:nation}:overview};};
  const won=await internationalScreen('euro','finals',undefined,new URLSearchParams('edition=2028'));
  assert.equal(asked[1],'/api/international/editions/2028');
  assert.match(won,/<span>Vainqueur<\/span><strong><a href="#\/international\/nation\/-1001"/);assert.match(won,/<summary>2028<svg/);
  // Anything else than one of its editions opens the default one.
  asked.length=0;
  await internationalScreen('euro','finals',undefined,new URLSearchParams('edition=2031'));
  assert.equal(asked[1],'/api/international/editions/2032');
  // The addresses of before name an edition by its year alone: it opens on its competition's page.
  const legacy=await internationalScreen('2028','finals');
  assert.match(legacy,/<h1>Euro<\/h1>/);assert.match(legacy,/<summary>2028<svg/);assert.match(legacy,/href="#\/international\/euro\/qualifications\?edition=2028"/);
  // A World Cup none of whose editions is drawn says when its first one is; nobody holds its title.
  const world=await internationalScreen('coupe-du-monde');
  assert.match(world,/<h1>Coupe du monde<\/h1>/);assert.match(world,/<div class="club-hero-tiles"><\/div>/);assert.doesNotMatch(world,/class="season"/);
  assert.match(world,/Première édition en 2030/);assert.match(world,/Elle sera tirée le 1 août 2028\./);
 }finally{globalThis.fetch=previous;setNations({});}
});

test('a competition’s history: its finals, the titles of each nation, how far each nation went in each edition and its players of all time',async()=>{
 const previous=globalThis.fetch,asked=[];
 const history={...competitions[1],editions:[2028,2032],finals:[finalOf(2032,spain,nation),finalOf(2028,nation,spain,{score:[1,1],penalties:[4,3]})],
  titles:[{nation,titles:1,finals:2},{nation:spain,titles:1,finals:2}],
  runs:[{nation,played:2,runs:[{stage:'winner'},{stage:'final'}]},{nation:spain,played:1,runs:[null,{stage:'winner'}]},{nation:{...nation,id:-1003,name:'Italie'},played:2,runs:[{stage:'quarter'},{stage:'groups'}]}],
  leaders:{matches:[{player_id:5,player:'Cap <test>',nation:'FRA',matches:10,goals:2}],goals:[{player_id:6,player:'Buteur',nation:'ESP',matches:8,goals:6}]}};
 globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>url.includes('/historique')?history:overview};};
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'},ESP:{name:'Espagne',display_code:'ESP',flag:'es'}});
 try{
  const html=await internationalScreen('euro','history');
  // It reads every edition: no edition is asked for, and none is stepped through.
  assert.deepEqual(asked,['/api/international','/api/international/competitions/euro/historique']);
  assert.doesNotMatch(html,/class="season"/);
  assert.match(html,/<a class="active" href="#\/international\/euro\/history\?edition=2032" aria-current="page">Historique<\/a>/);
  assert.match(html,/<div class="history-layout three"><div class="history-main"><section class="card"><div class="card-head"><h2>Les vainqueurs<\/h2>/);
  // A final: its edition, its winner, its score from the winner's side, a shoot-out's mark before it, its finalist.
  assert.match(html,/ÉDITION<.*VAINQUEUR<.*FINALE<.*FINALISTE</s);
  assert.match(html,/<a class="strong" href="#\/international\/euro\/finals\?edition=2032">2032<\/a>/);
  assert.match(html,/<a class="final-score" href="#\/match\/2032">2 – 1<\/a>/);
  assert.match(html,/<a class="final-score" href="#\/match\/2028"><small title="Tirs au but 4 – 3">\(TAB\)<\/small>1 – 1<\/a>/);
  assert.match(html,/<h2>Titres par nation<\/h2><\/div><div class="titles-table">.*NATION<.*TITRES<.*FINALES</s);
  // The runs, an edition a column: the title, the final, a round written short, nothing where the nation was not.
  const runs=html.split('<h2>Parcours des nations</h2>')[1];
  assert.match(runs,/NATION<.*PART\.<.*2028<.*2032</s);
  assert.match(runs,/<span class="run won" title="Vainqueur">✦<\/span>/);assert.match(runs,/<span class="run final" title="Finale">F<\/span>/);
  assert.match(runs,/<span class="run" title="Quarts de finale">1\/4<\/span>/);assert.match(runs,/<span class="run" title="Phase de groupes">Gr\.<\/span>/);
  assert.match(runs,/<td data-value="0"><span class="run none">—<\/span><\/td>/);
  // The players of all time, each with his nation.
  assert.match(html,/<div class="history-leaders">.*JOUEUR<.*NATION<.*MATCHS<.*BUTS</s);assert.match(html,/Cap &lt;test&gt;/);
  assert.match(html,/<span class="nation" title="Espagne"><img class="flag" src="\/flags\/es\.svg"[^>]*>ESP<\/span>/);
  // A Nations League's runs are its divisions, its run in the finals in place of the A, an arrow where it went up or down.
  const league={...competitions[2],editions:[2027,2029],finals:[],titles:[],leaders:{matches:[],goals:[]},
   runs:[{nation,played:2,runs:[{division:'A',stage:'semi',move:null},{division:'A',stage:null,move:'down'}]},{nation:spain,played:2,runs:[{division:'B',stage:null,move:'up'},{division:'A',stage:'winner',move:null}]}]};
  globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/historique')?league:overview});
  const nations=(await internationalScreen('ligue-des-nations','history')).split('<h2>Parcours des nations</h2>')[1];
  assert.doesNotMatch(nations,/PART\./);
  assert.match(nations,/<span class="run" title="Division A · Demi-finales">1\/2<\/span>/);
  assert.match(nations,/<span class="run" title="Division A · Relégué">A<i class="down">▼<\/i><\/span>/);
  assert.match(nations,/<span class="run" title="Division B · Promu">B<i class="up">▲<\/i><\/span>/);
  assert.match(nations,/<span class="run won" title="Division A · Vainqueur">✦<\/span>/);
 }finally{globalThis.fetch=previous;setNations({});}
});

test('beside the list, the calendar, the last eleven and the group stand as a club’s widgets do',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=serving(page());
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'},ESP:{name:'Espagne',display_code:'ESP',flag:'es'}});
 try{
  const html=await internationalScreen('nation','-1001');
  const widgets=html.split('<aside class="club-widgets" aria-label="La sélection en bref">')[1];
  assert.ok(widgets.indexOf('<h2>Calendrier</h2>')<widgets.indexOf('<h2>Dernier onze aligné</h2>')&&widgets.indexOf('<h2>Dernier onze aligné</h2>')<widgets.indexOf('<h2>Groupe D'));
  assert.match(widgets,/<a href="#\/international\/nation\/-1001\/calendar" aria-label="Voir le calendrier">Voir →<\/a>/);
  // The other side follows its flag; a match of another edition carries its badge; neutral ground is not an away game.
  const rows=widgets.split('<a class="club-match"').slice(1);
  assert.equal(rows.length,3);
  assert.match(rows[0],/t\.a\.b\. 4 – 5/);assert.match(rows[0],/<b><span class="nation"><span class="nation" title="Espagne"><img class="flag" src="\/flags\/es\.svg"[^>]*><\/span>Espagne<\/span><\/b><span class="competition-code international" title="Coupe du monde 2026">CM<\/span>/);
  assert.match(rows[0],/title="Coupe du monde 2026 · Demi-finales · Terrain neutre · t\.a\.b\. 4 – 5"/);assert.doesNotMatch(rows[0],/<svg class="away"/);
  assert.match(rows[1],/class="club-match-score V"/);assert.doesNotMatch(rows[1],/competition-code|<svg class="away"/);
  assert.match(rows[2],/<svg class="away"/);assert.match(rows[2],/À venir/);
  assert.match(widgets,/La sélection n’a pas encore joué\./);
  // The whole group, the place that qualifies and the selection's own row marked.
  assert.match(widgets,/<h2>Groupe D – 8<span class="ordinal">e<\/span> journée<\/h2><a href="#\/international\/euro\/qualifications\?edition=2028" aria-label="Voir le groupe">Voir →<\/a>/);
  assert.match(widgets,/NATION<\/button><\/th><th class="total-column"[^>]*><button class="sort-toggle" data-table-sort>PTS<\/button><\/th><th class="difference-column"[^>]*><button class="sort-toggle" data-table-sort>DIFF\.<\/button><\/th><\/tr>/);
  assert.match(widgets,/<tr class="promoted own"[^>]*><td[^>]*><span class="rank first">1<\/span>/);assert.match(widgets,/>\+10<\/td>/);assert.match(widgets,/>-3<\/td>/);
  // The eleven of the last match, in the selection's kit.
  const eleven=['GB','DG','DC','DC','DD','MDC','MC','MC','AILG','BU','AILD'].map((position,index)=>({id:index?100+index:-9,name:`Joueur ${index}`,position,temporary:!index,stats:null}));
  globalThis.fetch=serving(page({group:{year:2028,edition:'Euro 2028',code:'EU',finals:true,name:'B',places:2,rows:[row,{...row,nation:spain}]},
   lineup:{match:fixture(2,spain,nation,{neutral:true,score:[0,1],outcome:'V'}),side:'away',players:eleven}}));
  const played=await internationalScreen('nation','-1001');
  assert.match(played,/<div class="pitch lying" aria-label="Onze aligné par France &lt;test&gt;">/);
  assert.equal((played.match(/<span class="kit-shirt" style="--kit-body:#1f3f94;--kit-sleeves:#ffffff;--kit-ink:#ffffff">/g)||[]).length,10);
  assert.equal((played.match(/<span class="kit-shirt plain">/g)||[]).length,1);
  assert.match(played,/contre <span class="nation"><span class="nation" title="Espagne"><img class="flag" src="\/flags\/es\.svg"[^>]*><\/span>Espagne<\/span><small>/);
  assert.match(played,/href="#\/international\/euro\/finals\?edition=2028"/);assert.equal((played.match(/<tr class="promoted/g)||[]).length,2);
 }finally{globalThis.fetch=previous;setNations({});}
});

test('a nation without a current camp falls back to its last one, and one never called up says so',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=serving(page({camp:{start:'2026-11-09',end:'2026-11-17',upcoming:false},squad:[starter]}));
 try{
  assert.match(await internationalScreen('nation','-1001'),/<h2>Dernier rassemblement du 9 au 17 novembre 2026 · 1 joueur<\/h2>/);
  globalThis.fetch=serving(page({camp:null,squad:[],calendar:{last:[],next:[]}}));
  const idle=await internationalScreen('nation','-1001');
  assert.match(idle,/Aucun rassemblement en cours/);assert.match(idle,/Aucun match programmé/);
 }finally{globalThis.fetch=previous;}
});

test('the days of a camp write the month and the year once when its two ends share them',()=>{
 assert.equal(campDays('2028-11-09','2028-11-17'),'du 9 au 17 novembre 2028');
 assert.equal(campDays('2026-08-31','2026-09-09'),'du 31 août au 9 septembre 2026');
 assert.equal(campDays('2029-12-28','2030-01-05'),'du 28 décembre 2029 au 5 janvier 2030');
});

test('legacy saves explain how to activate national competitions',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({enabled:false})});
 try{assert.match(await internationalScreen(),/Nouvelle partie nécessaire/);}finally{globalThis.fetch=previous;}
});

test('finals end with a fixed bracket joined through the rounds still to be played',()=>{
 const team=id=>({...nation,id,name:`Nation ${id}`});
 const quarter=(id,home,away,winner)=>({id,round:14,round_label:'Quarts de finale',date:'2028-06-30',home:team(home),away:team(away),score:[1,0],penalties:null,winner_id:winner,first_leg_id:null});
 const finals={...edition,final_groups:[{name:'A',rows:[row]}],matches:[quarter(1,-1,-2,-1),quarter(2,-3,-4,-3),quarter(3,-5,-6,-5),quarter(4,-7,-8,-7)],
  knockout_rounds:[{number:14,label:'Quarts de finale'},{number:15,label:'Demi-finales'},{number:16,label:'Finale'}]};
 const html=editionContent(finals,'finals');
 assert.match(html,/class="bracket"/);
 assert.equal((html.match(/bracket-tie empty/g)||[]).length,3);
 assert.equal((html.match(/bracket-round linked/g)||[]).length,2);
 // the knockout matches are in the bracket only, not repeated as round cards
 assert.doesNotMatch(html,/<h2>Quarts de finale<\/h2>/);
});

const team=(id,name)=>({...nation,id,name});
const game=(id,round,home,away,score)=>({id,round,round_label:`Groupes · J${round-10}`,date:`2028-06-${String(Math.max(1,round-10)).padStart(2,"0")}`,home,away,score,penalties:null,winner_id:null,first_leg_id:null});

test('the finals show each group with its three days and its full table',()=>{
 const a=team(-1,'Alpha'),b=team(-2,'Bravo'),c=team(-3,'Charlie'),d=team(-4,'Delta');
 const rows=[a,b].map(t=>({...row,nation:t}));
 const finals={...edition,final_groups:[{name:'A',rows},{name:'B',rows:[c,d].map(t=>({...row,nation:t}))}],knockout_rounds:[{number:14,label:'Quarts de finale'}],
  matches:[game(1,11,a,b,[1,0]),game(2,11,c,d,[2,2]),game(3,12,a,b,[0,0]),game(4,13,a,b,null)]};
 const html=editionContent(finals,'finals');
 assert.match(html,/intl-groups-4/);
 assert.equal((html.match(/Journée 1 ·/g)||[]).length,2);
 assert.match(html,/Journée 3 ·/);
 assert.doesNotMatch(html,/<details/);
 assert.ok(html.indexOf('class="bracket"')<html.indexOf('intl-groups'));
});

test('the qualifying days are picked in the address of the competition',()=>{
 const a=team(-1,'Alpha'),b=team(-2,'Bravo');
 const qualifying=(id,round,score)=>({...game(id,round,a,b,score),round_label:`Qualifications · J${round}`});
 const played={...edition,knockout_rounds:[{number:14,label:'Quarts de finale'}],matches:[...Array.from({length:10},(_,i)=>qualifying(i+1,i+1,[1,0])),game(20,11,a,b,null)]};
 const html=editionContent({...played,qualification_groups:[{name:'A',rows:[{...row,nation:a},{...row,nation:b}]}]},'qualifications',null,'4');
 assert.match(html,/class="active" href="#\/international\/euro\/qualifications\/4\?edition=2028">J4/);
 assert.match(html,/Résultats par journée/);
});

test('statistics list scorers, assists, average ratings and attacks side by side',()=>{
 const a=team(-1,'Alpha');
 const records=[{player_id:1,name:'Buteur',nation:a,matches:5,goals:4,assists:0,rating_sum:35,rating_count:5},{player_id:2,name:'Passeur',nation:a,matches:5,goals:0,assists:3,rating_sum:10,rating_count:1}];
 const html=editionContent({...edition,records,matches:[game(1,11,a,team(-2,'Bravo'),[3,1])]},'statistics');
 assert.equal((html.match(/class="card stats-panel"/g)||[]).length,4);
 assert.match(html,/Meilleure note moyenne.*Buteur/s);
 assert.doesNotMatch(html.split('Meilleure note moyenne')[1].split('Meilleures attaques')[0],/Passeur/);
});

test('Sélections nationales sets a column for each competition, then the nations, their titles in each and their last edition',async()=>{
 const asia={...nation,id:-1002,name:'Japon',federation:'Asie',titles:{world:0,euro:0,nations:0},last_edition:null};
 const france={...nation,titles:{world:1,euro:2,nations:0},last_edition:{year:2028,name:'Euro 2028',code:'EU',label:'Vainqueur',winner:true}};
 const previous=globalThis.fetch,asked=[];
 globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>({...overview,nations:[france,asia]})};};
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'}});
 try{
  const html=await internationalScreen();
  assert.deepEqual(asked,['/api/international']);
  assert.match(html,/^<div class="page-heading"><div><h1>Sélections nationales<\/h1><\/div><\/div><div class="selection-competitions">/);
  // A column a competition, in the order of their bands: its band opens its page.
  const columns=html.split('<section class="card selection-competition">').slice(1);
  assert.equal(columns.length,3);
  assert.match(columns[0],/^<a class="club-hero-band narrow" href="#\/international\/coupe-du-monde" style="--hero-field:#111418;[^"]*"><div class="club-hero-art" aria-hidden="true"><i><\/i><i class="thin"><\/i><\/div><div class="club-hero-main"><img class="club-hero-emblem" src="\/emblems\/coupe-du-monde\.png" alt=""><div class="club-hero-identity"><h2>Coupe du monde<\/h2><\/div><\/div><\/a>/);
  // Who holds the title, then the edition under way and its next match day, else the next edition and its draw.
  assert.match(columns[0],/<span>Tenant du titre<\/span><strong>—<\/strong>.*<span>Prochaine édition<\/span><strong>2030<\/strong>.*<span>Tirage<\/span><strong>1 août 2028<\/strong>/s);
  assert.match(columns[1],/<span>Tenant du titre<\/span><strong><span class="strong"><a href="#\/international\/nation\/-1001"/);
  assert.match(columns[1],/<span>Édition en cours<\/span><strong><a href="#\/international\/euro\?edition=2032">2032 · Qualifications<\/a><\/strong>/);
  assert.match(columns[1],/<span>Prochaine journée<\/span><strong>J1 · 18 mars 2031<\/strong>/);
  // Then its finals; a competition without one says so.
  assert.match(columns[1],/<h3 class="section-title">Palmarès<\/h3><div class="finals-table">.*<small title="Tirs au but 4 – 3">\(TAB\)<\/small>1 – 1/s);
  assert.match(columns[0],/Pas encore de vainqueur/);
  // The nations: their strength, their titles in each competition by its badge, their last edition.
  const nations=html.split('<h2>Nations actives</h2>')[1];
  assert.match(nations,/^<div class="segmented small" role="group" aria-label="Fédérations"><a class="active" href="#\/international">Toutes · 2<\/a><a class="" href="#\/international\?federation=Asie">Asie · 1<\/a><a class="" href="#\/international\?federation=Europe">Europe · 1<\/a><\/div>/);
  assert.match(nations,/NATION<.*FÉDÉRATION<.*FORCE \/ 100<.*<span title="Titres · Coupe du monde">CM<\/span>.*<span title="Titres · Euro">EU<\/span>.*<span title="Titres · Ligue des nations">LN<\/span>.*DERNIÈRE ÉDITION</s);
  assert.match(nations,/<i class="gauge"><i style="width:80%"><\/i><\/i>80<\/span><\/td><td data-value="1"><b>1<\/b><\/td><td data-value="2"><b>2<\/b><\/td><td data-value="0"><span class="muted">—<\/span><\/td>/);
  assert.match(nations,/<a class="competition-code international" href="#\/international\/euro\?edition=2028" title="Euro 2028">EU<\/a>2028 · ✦ Vainqueur/);
  assert.match(nations,/Japon/);
  const filtered=await internationalScreen(undefined,undefined,undefined,new URLSearchParams('federation=Asie'));
  assert.match(filtered,/Japon/);
  assert.doesNotMatch(filtered.split('<h2>Nations actives</h2>')[1],/France &lt;test&gt;/);
 }finally{globalThis.fetch=previous;setNations({});}
});

// A Nations League: four divisions of groups, each row marked with where its nation goes, then its final four.
const leagueRow=(id,name,movement=null)=>({...row,nation:team(id,name),movement});
const league={year:2027,name:'Ligue des nations 2027',kind:'nations',code:'LN',major_color:'#00a6d6',minor_color:null,ground_color:'#0b1e3f',winner:null,holder:null,
 qualification_groups:[],final_groups:[],best_seconds:[],second_places:0,qualifiers:[],records:[],
 divisions:['A','B','C','D'].map(letter=>({name:`Division ${letter}`,groups:(letter==='D'?[1,2]:[1,2,3,4]).map(number=>({name:`${letter}${number}`,
  rows:[leagueRow(-10*number-1,`${letter}${number} premier`,letter==='A'?'qualified':letter==='D'||letter==='B'||letter==='C'?'promotion':null),leagueRow(-10*number-2,`${letter}${number} deuxième`,letter==='D'?'promotion':null),
   leagueRow(-10*number-3,`${letter}${number} dernier`,letter==='D'?null:'relegation')]}))})),
 knockout_rounds:[{number:15,label:'Demi-finales'},{number:16,label:'Finale'}],
 matches:[{...game(1,1,team(-11,'A1 premier'),team(-12,'A1 deuxième'),[2,0]),round_label:'Division A · J1'},{...game(2,2,team(-12,'A1 deuxième'),team(-13,'A1 dernier'),null),round_label:'Division A · J2'}]};

test('a Nations League shows its divisions group by group, the places going up, down and to the final four marked',()=>{
 const html=editionContent(league,'league');
 assert.deepEqual([...html.matchAll(/<h3 class="section-title">([^<]+)<\/h3>/g)].map(match=>match[1]),['Division A','Division B','Division C','Division D']);
 assert.equal((html.match(/<h2>Groupe [A-D]\d<\/h2>/g)||[]).length,14);
 const first=html.split('<h2>Groupe A1</h2>')[1].split('</table>')[0];
 assert.match(first,/<tr class="promoted"[^>]*>.*A1 premier/s);assert.match(first,/<tr class="relegated"[^>]*>.*A1 dernier/s);
 assert.doesNotMatch(first,/<tr class="promoted"[^>]*>(?:(?!<\/tr>).)*A1 deuxième/s);
 // In the last division the first two of a group go up, nobody goes down.
 const last=html.split('<h2>Groupe D1</h2>')[1].split('</table>')[0];
 assert.equal((last.match(/<tr class="promoted"/g)||[]).length,2);assert.doesNotMatch(last,/relegated/);
 // Its match days are picked as a tournament's qualifying days, under its own tab.
 assert.match(html,/class="active" href="#\/international\/ligue-des-nations\/league\/1\?edition=2027">J1<\/a><a class="" href="#\/international\/ligue-des-nations\/league\/2\?edition=2027">J2/);assert.match(html,/<h3>Groupe A1<\/h3>/);
});

test('a Nations League’s finals are its semi-finals and its final alone, empty until they are drawn',()=>{
 const html=editionContent(league,'finals');
 assert.match(html,/class="bracket"/);assert.equal((html.match(/bracket-tie empty/g)||[]).length,3);
 assert.doesNotMatch(html,/qualifications|intl-groups/);
});

test('a Nations League’s page wears its navy and cyan, its trophy, and opens on its groups',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/editions/')?{...league,year:2031}:overview});
 try{
  const html=await internationalScreen('ligue-des-nations');
  assert.match(html,/^<header class="club-hero" style="--hero-field:#0b1e3f;--hero-ink:#ffffff;--hero-sash:#00a6d6;/);
  assert.match(html,/<img class="club-hero-emblem" src="\/emblems\/ligue-des-nations\.png" alt="">/);
  assert.match(html,/<a class="active" href="#\/international\/ligue-des-nations\/league\?edition=2031" aria-current="page">Phase de ligue<\/a><a class="" href="#\/international\/ligue-des-nations\/finals\?edition=2031">Phase finale<\/a>/);
  assert.doesNotMatch(html,/Qualifications<\/a>/);
  // A tournament's qualifications answer to its groups, from one competition to the other.
  assert.match(await internationalScreen('ligue-des-nations','qualifications'),/aria-current="page">Phase de ligue</);
  assert.match(html,/<a class="entity-step prev" href="#\/international\/euro\/qualifications"/);assert.match(html,/<span class="entity-step next" aria-hidden="true">/);
  assert.equal(editionSection({kind:'euro'},'league'),'qualifications');assert.equal(editionSection({kind:'nations'},'qualifications'),'league');
  assert.equal(editionSection({kind:'nations'},'statistics'),'statistics');assert.equal(editionSection({kind:'nations'},'history'),'history');assert.equal(editionSection({kind:'nations'},'x'),'league');
 }finally{globalThis.fetch=previous;}
});

test('a selection’s round reads J and its number in a Nations League’s groups as in its qualifiers',()=>{
 assert.equal(editionRound('Division B · J4'),'J4');assert.equal(editionRound('Qualifications · J2'),'J2');assert.equal(editionRound('Demi-finales'),'Demi-finales');
});
