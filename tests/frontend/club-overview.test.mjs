import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarBlock,squadWidgets,standingsExtract,lineupBlock,clubPreview,marketBlock} from '../../web/club-overview.js';
import {pitch,contrastRatio} from '../../web/ui.js';

const club={id:7,name:'Lens',competition:'Ligue 1',major_color:'#cc0000',minor_color:'#ffd700'};
const ref=(id,name)=>({id,name,major_color:'#aa0000',minor_color:'#ffcc00'});
const match=(id,home,away,extra={})=>({id,date:'2029-12-30',competition:'Ligue 1',round_label:'Journée 19',home:ref(...home),away:ref(...away),score:null,penalties:null,...extra});
const move=(id,name,fee)=>({date:'2029-08-01',player_id:id,player:name,source:ref(9,'Nice'),target:ref(7,'Lens'),fee});
const side=(items,count=items.length,total=0)=>({count,total,items});
const data=(over={})=>({
 calendar:{last:[match(1,[7,'Lens'],[3,'Metz'],{score:[2,1],outcome:'V'}),match(2,[4,'Lille'],[7,'Lens'],{score:[1,1],outcome:'N'}),match(3,[7,'Lens'],[5,'Brest'],{score:[0,2],outcome:'D'})],
  next:[match(4,[6,'Nantes'],[7,'Lens'],{date:'2030-01-06'})]},
 finances:{transfer_budget:50e6,reserved_transfer_budget:12e6,wage_bill:400000,wage_cap:500000,reserved_wages:0,balance:1e6},
 lineup:null,...over});
const clubOverview=(club,overview)=>squadWidgets(club,overview,null);


test('beside the squad, the widgets open the calendar, the last match, the league and the finances',()=>{
 const html=squadWidgets({...club,competition_id:16},data(),null);
 assert.match(html,/^<aside class="club-widgets" aria-label="Le club en bref">/);
 for(const tab of ['calendar','finances'])assert.match(html,new RegExp(`href="#/club/7/${tab}"`));
 for(const title of ['Calendrier','Dernier onze aligné','Finances'])assert.ok(html.includes(`<h2>${title}</h2>`),title);
 // No transfers block any more, and no league without its table.
 assert.doesNotMatch(html,/<h2>Transferts|standings-extract/);
 assert.ok(html.indexOf('<h2>Calendrier')<html.indexOf('<h2>Dernier onze')&&html.indexOf('<h2>Dernier onze')<html.indexOf('<h2>Finances'));
});

test('the finances widget shows the free budget, the cash and the wage bill as a ring',()=>{
 const html=clubOverview(club,data());
 assert.match(html,/Budget transferts<\/span><strong>38\sM€<\/strong><small>Trésorerie <b>1\sM€<\/b><\/small>/);
 assert.match(html,/<span class="news-ring" role="img" aria-label="80 % du plafond salarial utilisé">/);
 const over=clubOverview(club,data({finances:{...data().finances,wage_bill:600000,transfer_budget:1e6,reserved_transfer_budget:5e6}}));
 assert.match(over,/class="news-ring full"/);assert.match(over,/120 %/);assert.match(over,/Budget transferts<\/span><strong>0\s€/);
 assert.doesNotMatch(clubOverview(club,data({finances:{...data().finances,wage_cap:0}})),/NaN|Infinity/);
});

const row=(rank,id,name,points,difference,played=18)=>({rank,club:ref(id,name),points,difference,played,won:0,drawn:0,lost:0,goals_for:0,goals_against:0,form:'',movement:null});
const table=Array.from({length:10},(_,index)=>row(index+1,index===5?7:20+index,index===5?'Lens':`Club ${index}`,40-index*2,10-index*2));

test('the league widget shows five rows around the club, with the points then the goal difference, and the round in its title',()=>{
 const html=standingsExtract({...club,competition_id:16},{items:table});
 assert.match(html,/<h2>Ligue 1 – 18<span class="ordinal">e<\/span> journée<\/h2>/);
 assert.match(html,/href="#\/league\/16"/);
 const ranks=[...html.matchAll(/<span class="rank ?(?:first)?">(\d+)<\/span>/g)].map(match=>Number(match[1]));
 assert.deepEqual(ranks,[4,5,6,7,8]);
 assert.match(html,/<th class="rank-column"[^>]*><button class="sort-toggle" data-table-sort>#<\/button><\/th><th[^>]*><button class="sort-toggle" data-table-sort>CLUB<\/button><\/th><th class="total-column"[^>]*><button class="sort-toggle" data-table-sort>PTS<\/button><\/th><th class="difference-column"[^>]*><button class="sort-toggle" data-table-sort>DIFF\.<\/button><\/th><\/tr>/);
 assert.doesNotMatch(html,/>J<\/th>/);assert.match(html,/<tr class="own"[^>]*>/);
 // At either end the five rows stay within the table.
 assert.deepEqual([...standingsExtract({...club,competition_id:16},{items:table.map((item,index)=>({...item,club:index===0?ref(7,'Lens'):ref(30+index,`C${index}`)}))}).matchAll(/<span class="rank ?(?:first)?">(\d+)<\/span>/g)].map(match=>Number(match[1])),[1,2,3,4,5]);
 assert.match(standingsExtract({...club,competition_id:16},{items:[row(1,7,'Lens',3,2,1)]}),/1<span class="ordinal">re<\/span> journée/);
 assert.equal(standingsExtract(club,null),'');assert.equal(standingsExtract(club,{items:[]}),'');
});

test('the last eleven lies on the charter\'s pitch attacking to the right, in the club kit with each position on its shirt, without notes',()=>{
 assert.match(clubOverview(club,data()),/Aucun match joué/);
 const positions=['GB','DG','DC','DC','DD','MC','MC','MC','AILG','BU','AILD'];
 const players=positions.map((position,index)=>({id:100+index,name:`Prénom Nom<${index}>`,position,temporary:false,stats:{rating:6.5}}));
 const lineup={match:match(1,[7,'Lens'],[3,'Metz'],{score:[2,1],outcome:'V',penalties:null}),side:'home',players};
 const html=lineupBlock(club,lineup);
 assert.match(html,/<div class="pitch lying" aria-label="Onze aligné par Lens">/);assert.equal((html.match(/class="pitch-player"/g)||[]).length,11);
 assert.match(html,/aria-label="Onze aligné par Lens"/);assert.match(html,/href="#\/match\/1"/);
 assert.match(html,/contre[^<]*<i class="kit-dot"[^>]*><\/i>Metz/);
 // The body in the primary colour, the sleeves in the secondary one; the position on the shirt, no note beside it.
 assert.equal((html.match(/<span class="kit-shirt" style="--kit-body:#cc0000;--kit-sleeves:#ffd700;--kit-ink:#ffffff">/g)||[]).length,11);
 assert.equal((html.match(/<b>(GB|DG|DC|DD|MC|AILG|BU|AILD)<\/b>/g)||[]).length,11);assert.doesNotMatch(html,/6[.,]5|position-note/);
 // The keeper on the left, the forward on the right; the left-back above the right-back.
 const at=name=>{const found=html.match(new RegExp(`title="${name}" style="left:([\\d.]+)%;top:([\\d.]+)%"`));return [Number(found[1]),Number(found[2])];};
 assert.ok(at('Prénom Nom&lt;0&gt;')[0]<at('Prénom Nom&lt;9&gt;')[0]);
 assert.ok(at('Prénom Nom&lt;1&gt;')[1]<at('Prénom Nom&lt;4&gt;')[1]);
 assert.match(html,/<small>Nom&lt;1&gt;<\/small>/);assert.doesNotMatch(html,/<script>|Nom<1>/);
});

test('the market under way stands in four columns: offers by player with his value, own offers, the list and the loans',()=>{
 const html=marketBlock({entrantes:[{joueur_id:5,joueur:'Baidoo',poste:'DC',valeur:41e6,offres:[{offre_id:'a',acheteur:ref(30,'Chelsea'),indemnite:38e6,salaire_propose:1000},{offre_id:'b',acheteur:ref(31,'Spurs'),indemnite:34e6,salaire_propose:1000}]}],
  sortantes:[{offre_id:'c',joueur_id:6,joueur:'Meïté',poste:'BU',vendeur:ref(32,'Rennes'),indemnite:12e6,salaire_propose:2000,etape:'salaire',date_prevue:null}],
  liste:[{joueur_id:8,joueur:'Édouard',poste:'BU',indemnite:25e5}],prets:[{joueur_id:9,joueur:'Vasseur',club:ref(33,'Amiens'),fin:'2031-06-30'}],emprunts:[]},
  {club:{available_budget:18.6e6,wage_bill:4000,wage_cap:5000},market:'winter'});
 assert.match(html,/<span class="market-state open">Mercato d’hiver ouvert<\/span>/);
 assert.match(html,/Budget <b>19\sM€<\/b>/);
 assert.equal((html.match(/class="market-column"/g)||[]).length,4);
 assert.match(html,/Offres reçues<span class="market-count alert">2<\/span>/);
 assert.match(html,/Baidoo<\/a><small>valeur 41\sM€<\/small>/);
 assert.equal((html.match(/data-command="reponse-offre" data-decision="accepter"/g)||[]).length,2);
 assert.match(html,/<span class="position att">BU<\/span><a href="#\/player\/6">Meïté<\/a>/);assert.match(html,/Négocier →/);
 assert.match(html,/→ <a href="#\/club\/33"/);
 assert.match(marketBlock({entrantes:[],sortantes:[],liste:[],prets:[],emprunts:[]}),/Mercato fermé.*Aucune offre sur vos joueurs.*Aucune offre en cours.*Aucun joueur sur la liste.*Aucun prêt en cours/);
});

test('the calendar widget lists results with their outcome and the fixtures still to play',()=>{
 const html=clubOverview(club,data());
 assert.equal((html.match(/class="club-match-score V"/g)||[]).length,1);
 assert.equal((html.match(/class="club-match-score N"/g)||[]).length,1);
 assert.equal((html.match(/class="club-match-score D"/g)||[]).length,1);
 assert.match(html,/href="#\/match\/1"/);assert.match(html,/2 – 1/);
 // no headings: played matches come first, then the fixtures to come
 assert.doesNotMatch(html.split('</section>')[0],/Derniers matches|Prochains matches|<h3>/);
 assert.ok(html.indexOf('href="#/match/1"')<html.indexOf('href="#/match/4"'));
 assert.match(html,/club-match-score pending">À venir/);
 // the opponent is the other side, whichever way the club played; a red plane flags away games
 const rows=html.split('<a class="club-match"').slice(1),row=name=>rows.find(item=>item.includes(name));
 assert.match(row('Lille'),/<svg class="away"[^>]*aria-label="Match à l’extérieur"/);
 assert.match(row('Nantes'),/<svg class="away"/);assert.doesNotMatch(row('Metz'),/<svg/);assert.doesNotMatch(row('Brest'),/<svg/);
 assert.match(row('Metz'),/title="Ligue 1 · Journée 19 · Domicile"/);
 assert.doesNotMatch(html,/ext\.|Lens<\/b>/);
 // a league game needs no competition; a cup tie or a shootout is named on the opponent's line
 assert.doesNotMatch(html,/<small>Ligue 1/);
 const cup=clubOverview(club,data({calendar:{last:[match(5,[7,'Lens'],[8,'Rennes'],{competition:'Coupe de France',score:[1,1],penalties:[4,3],outcome:'V'}),match(6,[9,'Nice'],[7,'Lens'],{competition:'Coupe de France',score:[0,1],outcome:'V'})],next:[]}}));
 assert.match(cup,/Rennes<\/b><span class="competition-code" title="Coupe de France">CdF<\/span><small>t\.a\.b\. 4 – 3<\/small>/);
 assert.match(cup,/title="Coupe de France · Journée 19 · Domicile · t\.a\.b\. 4 – 3"/);
 assert.match(cup,/Nice<\/b><svg class="away".*?<\/svg><span class="competition-code" title="Coupe de France">CdF<\/span><\/span>/);
 // played matches read oldest first, like the upcoming ones
 assert.ok(cup.indexOf('Nice')<cup.indexOf('Rennes'));
 const empty=clubOverview(club,data({calendar:{last:[],next:[]}}));
 assert.match(empty,/Aucun match joué/);assert.match(empty,/Aucun match programmé/);
});

test('the pitch spreads full-backs and centre-backs on one line, from left to right',()=>{
 const back=['DD','DC','DG','DC','DC'].map((position,index)=>({id:index,name:`P${index}`,position}));
 const placed=[...pitch(back).matchAll(/left:([\d.]+)%;top:(\d+)%"><span class="kit-shirt plain"><svg[^]*?<\/svg><b>(\w+)/g)].map(([, left,, position])=>[position,Number(left)]).sort((a,b)=>a[1]-b[1]);
 assert.deepEqual(placed.map(([position])=>position),['DG','DC','DC','DC','DD']);
 assert.deepEqual(placed.map(([,left])=>left),[11,30.5,50,69.5,89]);
 const pair=[...pitch(['BU','BU'].map((position,index)=>({id:index,name:'B',position}))).matchAll(/left:([\d.]+)%/g)].map(match=>Number(match[1]));
 assert.deepEqual(pair,[35,65]);
});

test('the match pitch shirts each side in its kit, the position on the shirt and the note of the match beside it',()=>{
 const line=[{id:1,name:'Ada Un',position:'GB',stats:{rating:7}},{id:-2,name:'Bob Deux',position:'BU',temporary:true,stats:{rating:6}},{id:3,name:'Cy Trois',position:'MC'}];
 const shirts=html=>[...html.matchAll(/<span class="kit-shirt([^"]*)"( style="[^"]*")?>/g)].map(match=>`${match[1]}${match[2]||''}`);
 const red=' style="--kit-body:#cc0000;--kit-sleeves:#ffd700;--kit-ink:#ffffff"';
 // a match-only player keeps a grey shirt; without a kit every shirt is grey
 assert.deepEqual(shirts(pitch(line,'x',{kit:{major:'#cc0000',minor:'#ffd700'}})),[red,' plain',red]);
 assert.deepEqual(shirts(pitch(line)),[' plain',' plain',' plain']);
 const html=pitch(line,'x',{kit:{major:'#cc0000',minor:'#ffd700'}});
 assert.match(html,/^<div class="pitch" aria-label="x"><i class="pitch-box" aria-hidden="true"><\/i><i class="pitch-box far" aria-hidden="true"><\/i>/);
 // the position is written on the shirt; the note of the match stands beside it, one figure after the point
 assert.match(html,/<b>GB<\/b><\/span><span class="position-note"><span class="rating graded" style="--hue:\d+" title="Note du match">7\.0<\/span><\/span><small>Ada Un<\/small>/);
 assert.match(html,/<b>MC<\/b><\/span><small>Cy Trois<\/small>/);
 // one drawing for every shirt: the whole shape in the sleeves' colour, the body over it, the outline alone
 assert.equal((html.match(/<path class="kit-sleeves"/g)||[]).length,3);assert.equal((html.match(/<path class="kit-outline"/g)||[]).length,3);
 assert.ok(contrastRatio('#cc0000','#ffd700')>=3);
 // a missing secondary colour reuses the primary one; an unsafe colour is never written out
 assert.match(shirts(pitch(line,'x',{kit:{major:'#204080',minor:null}}))[0],/--kit-body:#204080;--kit-sleeves:#204080;/);
 assert.deepEqual(shirts(pitch(line,'x',{kit:{major:'red;background:url(x)',minor:'#ffffff'}})),[' plain',' plain',' plain']);
 assert.deepEqual(shirts(pitch(line,'x',{kit:{major:null,minor:null}})),[' plain',' plain',' plain']);
});

test('beside the list of clubs, the picked one is previewed: standing, matches, money, best players and a way to each tab',async()=>{
 const previous=globalThis.fetch,asked=[];
 const picked={...club,nation_code:'FRA',capacity:38223,reputation:71.4,formation:'4-3-3',training_facilities:16,youth_recruitment:17,active:true,standing:{rank:3,points:61}};
 const squad={items:Array.from({length:12},(_,index)=>({id:100+index,name:`Joueur ${index}`,position:'MC',age:20+index,rating:70-index,potential:80,value:1e6}))};
 globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>url.endsWith('/apercu')?data({finances:{transfer_budget:50e6,reserved_transfer_budget:12e6,wage_bill:480000,wage_cap:500000,balance:9e6,season_spent:3e6,season_sales:0}}):url.includes('/effectif')?squad:picked};};
 let html;
 try{html=await clubPreview(7);}finally{globalThis.fetch=previous;}
 assert.deepEqual(asked,['/api/clubs/7','/api/clubs/7/apercu','/api/clubs/7/effectif?tri=rating&ordre=desc']);
 assert.match(html,/<h2><a href="#\/club\/7">Lens<\/a><\/h2>/);
 assert.match(html,/<span>Classement<\/span><strong>3e<\/strong>/);assert.match(html,/<span>Points<\/span><strong>61<\/strong>/);
 // Its last results and next fixtures, as on its page.
 assert.equal((html.match(/class="club-match"/g)||[]).length,4);
 // Budget left for a bid; the wage bill by the month against its cap, red from 95 %.
 assert.match(html,/Budget transferts<\/span><strong>38\sM€/);
 assert.match(html,/<i class="gauge full" role="img" aria-label="96 % du plafond salarial utilisé"><i style="width:96%">/);
 // The eight best players, best first.
 assert.deepEqual([...html.matchAll(/#\/player\/(\d+)/g)].map(match=>Number(match[1])),[100,101,102,103,104,105,106,107]);
 for(const tab of ['squad','calendar','finances','transfers'])assert.ok(html.includes(`<a class="button" href="#/club/7/${tab}">`));
 assert.doesNotMatch(html,/NaN|undefined/);
});
