import test from 'node:test';
import assert from 'node:assert/strict';
import {internationalScreen,editionContent,editionStages,campDays} from '../../web/international.js';
import {clubLink,setNations} from '../../web/ui.js';

const nation={id:-1001,name:'France <test>',nation:'FRA',national:true,federation:'Europe',strength:80};
const row={nation,played:8,won:5,drawn:2,lost:1,goals_for:15,goals_against:5,difference:10,points:17};
const edition={year:2028,name:'Euro 2028',qualification_groups:[{name:'A',rows:[row]}],final_groups:[],best_seconds:[row],second_places:6,qualifiers:[],matches:[],records:[]};

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
const editions=[{year:2028,name:'Euro 2028',qualification:{label:'Qualifié',winner:false},finals:{label:'Vainqueur',winner:true}}];
const leaders={matches:[{player_id:5,player:'Cap <test>',matches:10,goals:2}],goals:[{player_id:6,player:'Buteur',matches:8,goals:6}]};

const spain={id:-1002,name:'Espagne',nation:'ESP',national:true,federation:'Europe',strength:84};
const starter={id:12,name:'Titulaire',position:'MC',age:25,rating:80,potential:84,club:{id:7,name:'Lens',major_color:'#cc0000',minor_color:'#ffd700'},value:1e6,wage:1000,contract_end:'2030-06-30',
 fitness:.9,form:1.05,caps:12,international_goals:3,appearances:2,substitutes:0,goals:1,assists:1,average:7.25};
const reinforcement={id:-1,name:'Renfort',position:'GB',age:28,rating:60,potential:60,club:null,value:null,wage:null,contract_end:null,fitness:.9,form:1,caps:0,international_goals:0,appearances:0,substitutes:0,goals:0,assists:0,average:null};
const fixture=(id,home,away,extra={})=>({id,date:'2026-09-04',competition:'Euro 2028',competition_id:-102028,competition_code:'EU',international:true,round_label:'Qualifications · J1',home,away,score:null,penalties:null,neutral:false,...extra});
// What the API says of a selection: its kit, the edition it plays, its camp, then the widgets beside the list.
const page=(over={})=>({...nation,major_color:'#1f3f94',minor_color:'#ffffff',competition:{year:2028,name:'Euro 2028',stage:'Qualifications'},
 camp:{start:'2026-08-31',end:'2026-09-09',upcoming:true},squad:[starter,reinforcement],matches:[],
 calendar:{last:[fixture(1,nation,spain,{score:[2,1],outcome:'V'}),fixture(2,spain,nation,{competition:'Coupe du monde 2026',competition_code:'CM',round_label:'Demi-finales',neutral:true,score:[1,1],penalties:[4,5],outcome:'V'})],next:[fixture(3,spain,nation)]},
 lineup:null,group:{year:2028,edition:'Euro 2028',finals:false,name:'D',places:1,rows:[row,{...row,nation:spain,points:12,difference:-3}]},editions,leaders,...over});
const scorer=(id,name,...minutes)=>({id,name,minutes});
const qualifier=(id,date,round,home,away,extra={})=>fixture(id,home,away,{date,competition:'Coupe du monde 2030',competition_id:-102030,competition_code:'CM',round_label:`Qualifications · J${round}`,outcome:null,scorers:null,...extra});
// What the API says of its calendar: the matches of one edition, its group there, its record in each edition it played.
const seasons=(over={})=>({edition:2030,editions:[{year:2030,name:'Coupe du monde 2030'},{year:2028,name:'Euro 2028'}],
 items:[qualifier(11,'2028-09-01',1,nation,spain,{score:[4,0],outcome:'V',scorers:[[scorer(12,'Kylian Titulaire','12','67'),scorer(-4,'Un Renfort','81')],[]]}),
  qualifier(12,'2028-09-04',2,spain,nation,{score:[1,1],outcome:'N',scorers:[[scorer(90,'Pedro Autre','23')],[scorer(12,'Kylian Titulaire','54')]]}),
  qualifier(13,'2029-03-23',3,spain,nation),qualifier(14,'2029-03-26',4,nation,spain)],
 group:{year:2030,edition:'Coupe du monde 2030',finals:false,name:'D',places:1,rows:[row,{...row,nation:spain,points:12,difference:-3}]},
 competitions:[{id:-102030,year:2030,name:'Coupe du monde 2030',kind:'international',code:'CM',place:'1er du groupe D',winner:false,played:2,won:1,drawn:1,lost:0,goals_for:5,goals_against:1},
  {id:-102028,year:2028,name:'Euro 2028',kind:'international',code:'EU',place:'Vainqueur',winner:true,played:16,won:12,drawn:3,lost:1,goals_for:34,goals_against:9}],...over});
const serving=(answer,calendar=seasons())=>async url=>({ok:true,json:async()=>url.includes('/navigation')?navigation:url.includes('/calendrier')?calendar:url.includes('/nations/')?answer:{enabled:true,nations:[nation],editions:[{year:2028,name:'Euro 2028',winner:null}]}});

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
  assert.match(history,/Bilan par compétition/);
  assert.match(history,/Qualifié/);
  assert.match(history,/✦ Vainqueur/);
  assert.match(history,/Cap &lt;test&gt;/);
  assert.match(history,/Buteur/);
  assert.doesNotMatch(history,/club-squad-layout/);
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
  assert.match(rows[0],/<span class="calendar-date">1 sept\. 2028<\/span><span class="competition-code international" title="Coupe du monde 2030">CM<\/span><span class="calendar-round" title="Qualifications · J1">J1<\/span><span class="calendar-venue"><\/span>/);
  assert.match(rows[0],/<a href="#\/international\/nation\/-1002" class="club-link"><span class="nation"><span class="nation" title="Espagne"><img class="flag" src="\/flags\/es\.svg"/);
  assert.match(rows[0],/<a class="calendar-score V" href="#\/match\/11" title="Victoire · Coupe du monde 2030 · Qualifications · J1 · Domicile">4–0<\/a><span class="calendar-scorers"><a href="#\/player\/12" title="Kylian Titulaire">Titulaire<\/a> 12’ 67’ · Renfort 81’<\/span><span class="calendar-scorers theirs"><\/span>/);
  assert.match(rows[1],/<span class="calendar-venue"><svg class="away"/);
  assert.match(rows[1],/<a class="calendar-score N" href="#\/match\/12"[^>]*>1–1<\/a><span class="calendar-scorers"><a href="#\/player\/12"[^>]*>Titulaire<\/a> 54’<\/span><span class="calendar-scorers theirs"><a href="#\/player\/90"[^>]*>Autre<\/a> 23’<\/span>/);
  // The first match to play stands out.
  assert.match(rows[2],/^ coming next" data-competition="-102030">/);assert.match(rows[2],/<span class="calendar-date">23 mars 2029<\/span>/);assert.match(rows[2],/<em>Prochain<\/em>/);
  assert.match(rows[3],/^ coming" data-competition="-102030">/);assert.doesNotMatch(rows[3],/Prochain/);
  // Beside the matches: the whole group in the charter's columns, then the record in each edition.
  const side=html.split('<aside class="calendar-side">')[1];
  assert.match(side,/^<section class="card standings-card"><div class="card-head"><h2>Groupe D – 8<span class="ordinal">e<\/span> journée<\/h2><a href="#\/international\/2030\/qualifications" aria-label="Voir le groupe">Voir →<\/a>/);
  assert.match(side,/NATION<.*PTS<.*>J<.*>V<.*>N<.*>D<.*BP<.*BC<.*DIFF\.</s);assert.match(side,/<tr class="promoted own"/);
  assert.ok(side.indexOf('Groupe D')<side.indexOf('<h2>Bilan</h2>'));
  assert.match(side,/COMPÉTITION<.*PLACE<.*>J<.*>V<.*>N<.*>D<.*BP<.*BC</s);
  assert.match(side,/<span class="competition-code international" title="Coupe du monde 2030">CM<\/span><a class="strong" href="#\/international\/2030\/finals">Coupe du monde 2030<\/a><\/td><td[^>]*>1er du groupe D<\/td><td[^>]*>2<\/td><td[^>]*>1<\/td><td[^>]*>1<\/td><td[^>]*>0<\/td><td[^>]*>5<\/td><td[^>]*>1<\/td>/);
  assert.match(side,/>EU<\/span><a class="strong" href="#\/international\/2028\/finals">Euro 2028<\/a><\/td><td[^>]*><span class="strong">✦ Vainqueur<\/span><\/td><td[^>]*>16<\/td>/);
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

test('an edition’s page keeps the title of the selections and steps through the editions on its line, the open tab kept',async()=>{
 const previous=globalThis.fetch;
 const listed=[{year:2028,name:'Euro 2028',winner:nation},{year:2030,name:'Coupe du monde 2030',winner:null},{year:2032,name:'Euro 2032',winner:null}];
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/editions/')?{...edition,year:2030,name:'Coupe du monde 2030'}:{enabled:true,nations:[nation],editions:listed}});
 try{
  const html=await internationalScreen('2030','statistics');
  assert.match(html,/^<div class="page-heading"><div><h1>Sélections nationales<\/h1><\/div><div class="tools"><div class="season" role="group" aria-label="Édition"><a aria-label="Édition précédente" href="#\/international\/2028\/statistics"><svg[^>]*><path[^>]*\/><\/svg><\/a><details class="season-pick"><summary style="--chars:19">Coupe du monde 2030</);
  assert.match(html,/<a role="menuitemradio" aria-checked="false" href="#\/international\/2032\/statistics">Euro 2032<\/a><a role="menuitemradio" aria-checked="true" href="#\/international\/2030\/statistics">Coupe du monde 2030<\/a>/);
  assert.match(html,/<\/details><a aria-label="Édition suivante" href="#\/international\/2032\/statistics"><svg[^>]*><path[^>]*\/><\/svg><\/a><\/div><\/div><\/div><nav class="tabs"/);
  assert.doesNotMatch(html,/edition-switch/);
 }finally{globalThis.fetch=previous;}
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
  assert.match(widgets,/<h2>Groupe D – 8<span class="ordinal">e<\/span> journée<\/h2><a href="#\/international\/2028\/qualifications" aria-label="Voir le groupe">Voir →<\/a>/);
  assert.match(widgets,/NATION<\/button><\/th><th class="total-column"[^>]*><button class="sort-toggle" data-table-sort>PTS<\/button><\/th><th class="difference-column"[^>]*><button class="sort-toggle" data-table-sort>DIFF\.<\/button><\/th><\/tr>/);
  assert.match(widgets,/<tr class="promoted own"[^>]*><td[^>]*><span class="rank first">1<\/span>/);assert.match(widgets,/>\+10<\/td>/);assert.match(widgets,/>-3<\/td>/);
  // The eleven of the last match, in the selection's kit.
  const eleven=['GB','DG','DC','DC','DD','MDC','MC','MC','AILG','BU','AILD'].map((position,index)=>({id:index?100+index:-9,name:`Joueur ${index}`,position,temporary:!index,stats:null}));
  globalThis.fetch=serving(page({group:{year:2028,edition:'Euro 2028',finals:true,name:'B',places:2,rows:[row,{...row,nation:spain}]},
   lineup:{match:fixture(2,spain,nation,{neutral:true,score:[0,1],outcome:'V'}),side:'away',players:eleven}}));
  const played=await internationalScreen('nation','-1001');
  assert.match(played,/<div class="pitch lying" aria-label="Onze aligné par France &lt;test&gt;">/);
  assert.equal((played.match(/<span class="kit-shirt" style="--kit-body:#1f3f94;--kit-sleeves:#ffffff;--kit-ink:#ffffff">/g)||[]).length,10);
  assert.equal((played.match(/<span class="kit-shirt plain">/g)||[]).length,1);
  assert.match(played,/contre <span class="nation"><span class="nation" title="Espagne"><img class="flag" src="\/flags\/es\.svg"[^>]*><\/span>Espagne<\/span><small>/);
  assert.match(played,/href="#\/international\/2028\/finals"/);assert.equal((played.match(/<tr class="promoted/g)||[]).length,2);
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

test('the stepper follows the stages and the qualifying days are picked in the address',()=>{
 const a=team(-1,'Alpha'),b=team(-2,'Bravo');
 const qualifying=(id,round,score)=>({...game(id,round,a,b,score),round_label:`Qualifications · J${round}`});
 const played={...edition,knockout_rounds:[{number:14,label:'Quarts de finale'}],matches:[...Array.from({length:10},(_,i)=>qualifying(i+1,i+1,[1,0])),game(20,11,a,b,null)]};
 assert.deepEqual(editionStages(played).map(step=>step.state),['done','current','todo']);
 const html=editionContent({...played,qualification_groups:[{name:'A',rows:[{...row,nation:a},{...row,nation:b}]}]},'qualifications',null,'4');
 assert.match(html,/class="active" href="#\/international\/2028\/qualifications\/4">J4/);
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

test('the nations list filters by federation and shows titles and the last edition',async()=>{
 const asia={...nation,id:-1002,name:'Japon',federation:'Asie',titles:0,last_edition:null};
 const france={...nation,titles:2,last_edition:{name:'Euro 2028',label:'Quart de finale',winner:false}};
 const api=async()=>({enabled:true,editions:[{year:2028,name:'Euro 2028',winner:france},{year:2030,name:'Euro 2030',winner:null}],nations:[france,asia]});
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/editions/')?{...edition,year:2030,name:'Euro 2030',knockout_rounds:[],matches:[]}:await api()});
 try{
  const all=await internationalScreen();
  assert.doesNotMatch(all,/Édition en cours/);
  assert.match(all,/<a class="card current-edition" href="#\/international\/2030\/qualifications">/);
  assert.match(all,/Euro 2030/);
  assert.match(all,/★ 2/);
  assert.match(all,/Quart de finale/);
  assert.match(all,/Japon/);
  const filtered=await internationalScreen(undefined,undefined,undefined,new URLSearchParams('federation=Asie'));
  assert.match(filtered,/Japon/);
  assert.doesNotMatch(filtered,/France &lt;test&gt;<\/span><\/a><\/td><td>Europe/);
 }finally{globalThis.fetch=previous;}
});
