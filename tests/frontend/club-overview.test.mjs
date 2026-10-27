import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarBlock,financesBlock,standingsExtract,clubPreview,marketBlock,presentationContent,elevenCard,kitsCard,watchCard,leadersCards} from '../../web/club-overview.js';
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
 ...over});
const clubOverview=(club,overview)=>calendarBlock(club,overview.calendar)+financesBlock(club,overview.finances,{balance:true});

// A club's Présentation: a squad, its season, its league.
const member=(id,name,position,extra={})=>({id,name,position,shirt:id,appearances:0,substitutes:0,goals:0,assists:0,average:0,morale:.9,expiring:false,
 injured_until:null,suspension:0,away:false,contract_end:'2036-06-30',...extra});
const squadItems=[member(1,'Brian Madjo','BU',{appearances:50,goals:33,assists:10,average:6.87}),member(2,'Milan Verhoeven','MOC',{appearances:48,goals:26,assists:6,average:6.86}),
 member(3,'Sacha Lung','DC',{appearances:46,goals:5,assists:1,average:6.94}),member(4,'Mohanad Haider','DC',{appearances:20,goals:2,average:6.96}),
 member(5,'Unai Marrero','GB',{appearances:2,average:5.9,morale:.45,morale_target:.4,morale_cause:'temps_de_jeu'}),member(6,'Holger Quintero','MC',{appearances:27,suspension:1,average:6.54}),
 member(7,'Luca Cecchetto','DG',{appearances:32,expiring:true,contract_end:'2034-06-30',injured_until:'2033-07-12',average:6.49}),member(8,'Parti','MOC',{away:true,expiring:true,morale:.3})];
const eleven={basis:'starts',players:[['GB',5,'Longoni',54,54,0],['DG',3,'Cocchi',41,31,3],['DC',5,'Lung',46,37,5],['DC',4,'Tati',48,38,5],['DD',12,'Ângelo',40,30,2],['MDC',26,'Tounkara',44,32,1],
 ['MC',8,'Sullivan',48,37,8],['MOC',10,'Verhoeven',48,36,26],['MOC',7,'De Pieri',43,35,11],['BU',9,'Camarda',52,41,24],['BU',18,'Madjo',50,39,33]]
 .map(([position,shirt,short,appearances,starts,goals],index)=>({id:100+index,name:`Prénom ${short}`,short,position,shirt,note:75,appearances,starts,goals}))};
const standing=(rank,id,name,points,difference)=>({rank,club:ref(id,name),points,difference,played:34,won:0,drawn:0,lost:0,goals_for:0,goals_against:0,form:'',movement:null});
const leagueTable={items:Array.from({length:18},(_,index)=>standing(index+1,index===0?7:40+index,index===0?'Lens':`Club ${index}`,77-index*3,63-index*5))};
const season={items:[...Array.from({length:12},(_,index)=>match(50+index,[7,'Lens'],[3,'Metz'],{score:[2,1],outcome:'V',date:`2033-0${index<9?4:5}-${String(index+1).padStart(2,'0')}`})),
 match(70,[7,'Lens'],[4,'Lille'],{date:'2033-05-30'})],
 competitions:[{id:16,name:'Ligue 1',kind:'league',place:'1er'},{id:-3,name:'Coupe de France',kind:'cup',place:'Éliminé · Finale'},{id:-101,name:'Ligue des champions',kind:'europe',code:'C1',place:'Éliminé · Demi-finales'}]};
const presented={...club,competition_id:16,standing:{rank:1,points:77},squad_size:23,average_age:24.6,formation:'4-3-3',training_facilities:16,youth_recruitment:12,squad_value:1312e6,
 kit_url:'/kits/1/outfit.png?major=F8F8F8',away_kit_url:'/kits/45/outfit.png?major=282838'};
const presentation=(human,height=1080,over={})=>{
 const previous=globalThis.window;globalThis.window={innerHeight:height};
 try{return presentationContent(presented,{overview:data({eleven}),season,squad:{items:squadItems},standings:leagueTable,human,...over});}finally{globalThis.window=previous;}
};
const section=(html,title)=>html.slice(html.indexOf(`<h2>${title}`)).split('</section>')[0];

test('a club opens on its Présentation: its tiles, then four columns that fill the window',()=>{
 const html=presentation(true);
 assert.match(html,/^<div class="club-tiles">/);
 const columns=html.split('<div class="presentation-column">').slice(1);
 assert.match(html,/<div class="club-presentation" data-fill>/);assert.equal(columns.length,4);
 const titles=part=>[...part.matchAll(/<h2>([^<]+)/g)].map(found=>found[1]);
 assert.deepEqual(titles(columns[0]),['Tenues','Finances']);
 assert.deepEqual(titles(columns[1]),['Équipe-type','À surveiller']);
 assert.deepEqual(titles(columns[2]),['Calendrier','Ligue 1 · 34e journée']);
 assert.deepEqual(titles(columns[3]),['Buteurs','Passeurs','Notes']);
 // What asks for a decision is the user's own business.
 assert.doesNotMatch(presentation(false),/À surveiller/);
});

test('the Présentation shares a column\'s rows between the calendar and the league, and gives the lists what is left',()=>{
 const rows=(html,title)=>(section(html,title).match(/class="club-match"|<tr class="(?:own)?"/g)||[]).length;
 // On a full HD screen, the league whole and seven matches, the last played then the next one.
 const full=presentation(true);
 assert.equal((section(full,'Ligue 1').match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr/g)||[]).length,18);
 assert.equal((section(full,'Calendrier').match(/class="club-match"/g)||[]).length,7);
 assert.ok(section(full,'Calendrier').indexOf('#/match/70')>section(full,'Calendrier').indexOf('#/match/61'));
 assert.equal((section(full,'Buteurs').match(/<li>/g)||[]).length,4);
 // A shorter window keeps the league around the club and fewer matches; the lists shorten too.
 const short=presentation(true,800);
 assert.ok((section(short,'Ligue 1').match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr/g)||[]).length<18);
 assert.ok((section(short,'Calendrier').match(/class="club-match"/g)||[]).length<7);
 assert.equal(rows(short,'Calendrier')>=3,true);
});

test('the équipe-type stands on a pitch spread over its height: matches and goals under each name, the ball after them',()=>{
 const html=elevenCard(club,eleven);
 assert.match(html,/<h2>Équipe-type<\/h2>/);assert.equal((html.match(/class="pitch-player"/g)||[]).length,11);
 // His number on his shirt, his short name, then « 52 m / 24 » and the ball; no ball for a player who did not score.
 assert.match(html,/<b>9<\/b><\/span><span class="player-block"><span class="block-name">Camarda<\/span><span><span class="block-season">52 m \/ 24<span class="match-mark goal"><\/span><\/span><\/span><\/span>/);
 assert.match(html,/<span class="block-name">Longoni<\/span><span><span class="block-season">54 m<\/span><\/span>/);
 assert.match(html,/title="Prénom Camarda · 52 matches dont 41 titularisations, 24 buts"/);
 // The lines its formation has, counted from the front: the forwards first, the keeper last.
 const row=(markup,name)=>Number(markup.match(new RegExp(`title="Prénom ${name}[^"]*" style="left:[\\d.]+%;--row:(\\d+)"`))[1]);
 assert.match(html,/class="pitch spread eleven-pitch"[^>]* style="--rows:6"/);
 assert.deepEqual(['Madjo','Verhoeven','Sullivan','Tounkara','Lung','Longoni'].map(name=>row(html,name)),[0,1,2,3,4,5]);
 // A line it does not have leaves no room: without its attacking midfielders, five lines.
 const flat=elevenCard(club,{...eleven,players:eleven.players.map(player=>player.position==='MOC'?{...player,position:'MC'}:player)});
 assert.match(flat,/style="--rows:5"/);assert.deepEqual(['Madjo','Verhoeven','Tounkara','Longoni'].map(name=>row(flat,name)),[0,1,2,4]);
 // Picked before any match, each player shows his note at his place; a short column narrows the pitch.
 const best=elevenCard(club,{...eleven,basis:'notes'},500);
 assert.match(best,/<b class="block-note" style="--hue:\d+" title="Note au poste GB : 150 sur 200">150<\/b>/);assert.doesNotMatch(best,/block-season/);
 assert.match(best,/class="pitch spread eleven-pitch"[^>]* style="--rows:\d;max-width:386px"/);
 // Never so narrow that the blocks of a line run into each other: the page scrolls a little instead.
 assert.match(elevenCard(club,eleven,200),/style="--rows:\d;max-width:340px"/);
 assert.equal(elevenCard(club,null),'');assert.equal(elevenCard(club,{basis:'notes',players:[]}),'');
});

test('the kits show both outfits, home first, named by their tooltip only',()=>{
 const html=kitsCard(presented);
 assert.match(html,/<h2>Tenues<\/h2><\/div><div class="kits"><a href="\/kits\/1\/outfit.png\?major=F8F8F8" target="_blank" rel="noopener" title="Domicile"><img class="kit-outfit"/);
 assert.ok(html.indexOf('/kits/1/')<html.indexOf('/kits/45/'));assert.match(html,/title="Extérieur"/);
 assert.doesNotMatch(html,/figcaption|>Domicile<|>Extérieur</);
 assert.equal((kitsCard({...presented,away_kit_url:null}).match(/<img/g)||[]).length,1);
 assert.equal(kitsCard({...presented,kit_url:null,away_kit_url:null}),'');
});

test('À surveiller gathers what asks a decision of the user, a line for each player',()=>{
 const html=watchCard(squadItems);
 const lines=html.split('<li>').slice(1);
 assert.equal(lines.length,3);
 assert.match(lines.find(line=>line.includes('Cecchetto')),/<b class="warn">Contrat · juin 2034<\/b><b class="danger">Blessé · 12 juil\.<\/b>/);
 assert.match(lines.find(line=>line.includes('Quintero')),/<b class="news-ban">Suspendu · 1 match<\/b>/);
 assert.match(lines.find(line=>line.includes('Marrero')),/45 %/);
 // A player away on loan is not the club's to decide on; nobody to watch, no card.
 assert.doesNotMatch(html,/Parti/);assert.equal(watchCard([squadItems[0]]),'');
 assert.equal((watchCard(squadItems,2).match(/<li>/g)||[]).length,2);
});

test('the scorers, providers and notes are the bars of the Historique, in the pale blue',()=>{
 const html=leadersCards(squadItems,3);
 assert.match(html,/<section class="card leaders-card goals soft"><div class="card-head"><h2>Buteurs<\/h2><span class="card-hint">buts<\/span><\/div><ol class="leader-bars">/);
 assert.match(section(html,'Buteurs'),/<i style="width:100%"><\/i><b>33<\/b><\/li><li>.*<i style="width:79%"><\/i><b>26<\/b>/);
 assert.match(html,/<h2>Passeurs<\/h2><span class="card-hint">passes<\/span>/);
 // A note counts from half the matches of the most used player, with two figures after the point.
 const notes=section(html,'Notes');
 assert.match(notes,/<span class="card-hint">note moyenne<\/span>/);assert.match(notes,/<b>6\.94<\/b>/);assert.doesNotMatch(notes,/Haider|Marrero/);
 assert.equal((section(html,'Buteurs').match(/<li>/g)||[]).length,3);
});

test('the finances widget shows the free budget, the cash and the wage margin as a ring',()=>{
 const html=clubOverview(club,data());
 assert.match(html,/Budget transferts<\/span><strong>38\sM€<\/strong><small>Trésorerie <b>1\sM€<\/b><\/small>/);
 assert.match(html,/<span class="news-ring" role="img" aria-label="20 % du plafond salarial disponible">/);
 assert.match(html,/<span>Marge salariale<\/span><strong>430\sk€<\/strong><small>sur 2\.2\sM€<\/small>/);
 // The wages the offers under way reserve are no longer free; red from 5 % left, never below nothing.
 const held=clubOverview(club,data({finances:{...data().finances,reserved_wages:80000}}));
 assert.match(held,/class="news-ring full"/);assert.match(held,/<b>4 %<\/b>/);
 const over=clubOverview(club,data({finances:{...data().finances,wage_bill:600000,transfer_budget:1e6,reserved_transfer_budget:5e6}}));
 assert.match(over,/class="news-ring full"/);assert.match(over,/<b>0 %<\/b>/);assert.match(over,/Marge salariale<\/span><strong>0\s€/);assert.match(over,/Budget transferts<\/span><strong>0\s€/);
 assert.doesNotMatch(clubOverview(club,data({finances:{...data().finances,wage_cap:0}})),/NaN|Infinity/);
});

const row=(rank,id,name,points,difference,played=18)=>({rank,club:ref(id,name),points,difference,played,won:0,drawn:0,lost:0,goals_for:0,goals_against:0,form:'',movement:null});
const table=Array.from({length:10},(_,index)=>row(index+1,index===5?7:20+index,index===5?'Lens':`Club ${index}`,40-index*2,10-index*2));

test('the league widget shows five rows around the club, with the points then the goal difference, and the round in its title',()=>{
 const html=standingsExtract({...club,competition_id:16},{items:table});
 assert.match(html,/<h2>Ligue 1 · 18e journée<\/h2>/);
 assert.match(html,/href="#\/league\/16"/);
 const ranks=[...html.matchAll(/<span class="rank ?(?:first)?">(\d+)<\/span>/g)].map(match=>Number(match[1]));
 assert.deepEqual(ranks,[4,5,6,7,8]);
 assert.match(html,/<th class="rank-column"[^>]*><button class="sort-toggle" data-table-sort>#<\/button><\/th><th[^>]*><button class="sort-toggle" data-table-sort>CLUB<\/button><\/th><th class="total-column"[^>]*><button class="sort-toggle" data-table-sort>PTS<\/button><\/th><th class="difference-column"[^>]*><button class="sort-toggle" data-table-sort>DIFF\.<\/button><\/th><\/tr>/);
 assert.doesNotMatch(html,/>J<\/th>/);assert.match(html,/<tr class="own"[^>]*>/);
 // At either end the five rows stay within the table.
 assert.deepEqual([...standingsExtract({...club,competition_id:16},{items:table.map((item,index)=>({...item,club:index===0?ref(7,'Lens'):ref(30+index,`C${index}`)}))}).matchAll(/<span class="rank ?(?:first)?">(\d+)<\/span>/g)].map(match=>Number(match[1])),[1,2,3,4,5]);
 assert.match(standingsExtract({...club,competition_id:16},{items:[row(1,7,'Lens',3,2,1)]}),/Ligue 1 · 1re journée/);
 assert.equal(standingsExtract(club,null),'');assert.equal(standingsExtract(club,{items:[]}),'');
});

test('the market under way stands in four columns: offers by player with his value, own offers, the list and the loans',()=>{
 const html=marketBlock({entrantes:[{joueur_id:5,joueur:'Baidoo',poste:'DC',valeur:41e6,offres:[{offre_id:'a',acheteur:ref(30,'Chelsea'),indemnite:38e6,salaire_propose:1000},{offre_id:'b',acheteur:ref(31,'Spurs'),indemnite:34e6,salaire_propose:1000}]}],
  sortantes:[{offre_id:'c',joueur_id:6,joueur:'Meïté',poste:'BU',vendeur:ref(32,'Rennes'),indemnite:12e6,salaire_propose:2000,etape:'salaire',date_prevue:null}],
  liste:[{joueur_id:8,joueur:'Édouard',poste:'BU',indemnite:25e5}],prets:[{joueur_id:9,joueur:'Vasseur',club:ref(33,'Amiens'),fin:'2031-06-30'}],emprunts:[]},
  {club:{available_budget:18.6e6,wage_bill:4000,wage_cap:5000},market:'winter'});
 assert.match(html,/<span class="market-state open">Mercato d’hiver ouvert<\/span>/);
 assert.match(html,/Budget <b>18\sM€<\/b>/);
 assert.equal((html.match(/class="market-column"/g)||[]).length,4);
 assert.match(html,/Offres reçues<span class="market-count alert">2<\/span>/);
 assert.match(html,/Baidoo<\/a><small>valeur 41\sM€<\/small>/);
 assert.equal((html.match(/data-command="reponse-offre" data-decision="accepter"/g)||[]).length,2);
 assert.match(html,/<span class="position att">BU<\/span><a href="#\/player\/6">Meïté<\/a>/);assert.match(html,/Négocier <span class="go" aria-hidden="true"><\/span>/);
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
 assert.match(empty,/Aucun match programmé/);
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
 // the match's pitch is cut short at 68 × 76: the attack in the far box, the goalkeeper near his line
 assert.match(html,/^<div class="pitch short" aria-label="x"><i class="pitch-box" aria-hidden="true"><\/i><i class="pitch-box far" aria-hidden="true"><\/i>/);
 assert.deepEqual([...html.matchAll(/class="pitch-player[^"]*" style="left:[\d.]+%;top:(\d+)%"/g)].map(match=>Number(match[1])),[88,7,42]);
 // the position is written on the shirt; under it his block: his name, then the note of the match in its colour, one
 // figure after the point; without a note the second line keeps its place, empty
 assert.match(html,/<b>GB<\/b><\/span><span class="player-block"><span class="block-name">Ada Un<\/span><span><b class="block-note" style="--hue:\d+" title="Note du match">7\.0<\/b><\/span><\/span>/);
 assert.match(html,/<b>MC<\/b><\/span><span class="player-block"><span class="block-name">Cy Trois<\/span><span><\/span><\/span>/);
 assert.doesNotMatch(html,/position-note|pitch-marks|<small>/);
 // one drawing for every shirt: the whole shape in the sleeves' colour, the body and the collar over it, the outline alone
 for(const part of ['kit-sleeves','kit-body','kit-collar','kit-outline'])assert.equal((html.match(new RegExp(`<path class="${part}"`,'g'))||[]).length,3);
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

test('on a compact pitch, a player goes by his short name; his whole name is in the tooltip',()=>{
 const players=[{id:1,name:'Lucas Hernandez',short:'L. Hernandez',position:'DC'},{id:2,name:'Kylian Mbappé',position:'BU'}];
 const compact=pitch(players,'x',{compact:true});
 assert.match(compact,/title="Lucas Hernandez"[^>]*>[^]*?<span class="block-name">L\. Hernandez<\/span>/);
 // Without a short name from the API, his surname; a full pitch writes the whole name.
 assert.match(compact,/title="Kylian Mbappé"[^>]*>[^]*?<span class="block-name">Mbappé<\/span>/);
 assert.match(pitch(players),/<span class="block-name">Lucas Hernandez<\/span>/);
});
