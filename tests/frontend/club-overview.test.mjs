import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clubOverview} from '../../web/club-overview.js';
import {pitch,kitShirtStyle,contrastRatio} from '../../web/ui.js';

const club={id:7,name:'Lens',competition:'Ligue 1',major_color:'#cc0000',minor_color:'#ffd700'};
const ref=(id,name)=>({id,name,major_color:'#aa0000',minor_color:'#ffcc00'});
const match=(id,home,away,extra={})=>({id,date:'2029-12-30',competition:'Ligue 1',round_label:'Journée 19',home:ref(...home),away:ref(...away),score:null,penalties:null,...extra});
const move=(id,name,fee)=>({date:'2029-08-01',player_id:id,player:name,source:ref(9,'Nice'),target:ref(7,'Lens'),fee});
const side=(items,count=items.length,total=0)=>({count,total,items});
const data=(over={})=>({
 calendar:{last:[match(1,[7,'Lens'],[3,'Metz'],{score:[2,1],outcome:'V'}),match(2,[4,'Lille'],[7,'Lens'],{score:[1,1],outcome:'N'}),match(3,[7,'Lens'],[5,'Brest'],{score:[0,2],outcome:'D'})],
  next:[match(4,[6,'Nantes'],[7,'Lens'],{date:'2030-01-06'})]},
 finances:{transfer_budget:50e6,reserved_transfer_budget:12e6,wage_bill:400000,wage_cap:500000,reserved_wages:0,balance:1e6},
 transfers:{season:2029,arrivals:side([move(11,'Zoé Test',0),move(12,'Adam Test',3e6)],2,3e6),departures:side([],0,0),others:{academy:2,release:1,retirement:0}},
 lineup:null,...over});

test('each block links to the tab it summarises',()=>{
 const html=clubOverview(club,data());
 for(const tab of ['calendar','finances','transfers'])assert.match(html,new RegExp(`href="#/club/7/${tab}"`));
 for(const title of ['Calendrier','Finances','Dernier onze aligné'])assert.ok(html.includes(`<h2>${title}</h2>`));
 assert.match(html,/<h2>Transferts<\/h2>/);assert.match(html,/Saison 2029 \/ 2030/);
 assert.equal((html.match(/class="club-overview"/g)||[]).length,1);
});

test('calendar lists results with their outcome and the fixtures still to play',()=>{
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
 assert.match(cup,/Rennes<\/b><span class="competition-badge">Coupe de France<\/span><small>t\.a\.b\. 4 – 3<\/small>/);
 assert.match(cup,/title="Coupe de France · Journée 19 · Domicile · t\.a\.b\. 4 – 3"/);
 assert.match(cup,/Nice<\/b><svg class="away".*?<\/svg><span class="competition-badge">Coupe de France<\/span><\/span>/);
 // played matches read oldest first, like the upcoming ones
 assert.ok(cup.indexOf('Nice')<cup.indexOf('Rennes'));
 const empty=clubOverview(club,data({calendar:{last:[],next:[]}}));
 assert.match(empty,/Aucun match joué/);assert.match(empty,/Aucun match programmé/);
});

test('finances show the free transfer budget and how much of the wage cap is used',()=>{
 const html=clubOverview(club,data());
 assert.match(html,/Budget transferts<\/span><strong>38\sM\s€/);
 assert.match(html,/80 % du plafond utilisé/);assert.match(html,/style="width:80%"/);
 const over=clubOverview(club,data({finances:{...data().finances,wage_bill:600000,transfer_budget:1e6,reserved_transfer_budget:5e6}}));
 assert.match(over,/style="width:100%"/);assert.match(over,/120 % du plafond utilisé/);
 assert.match(over,/Budget transferts<\/span><strong>0\s€/);
 assert.doesNotMatch(clubOverview(club,data({finances:{...data().finances,wage_cap:0}})),/NaN|Infinity/);
});

test('transfers list three arrivals and departures, count what is not shown and name the other movements',()=>{
 const many=Array.from({length:5},(_,index)=>move(20+index,`Joueur ${index}`,1e6));
 const html=clubOverview(club,data({transfers:{...data().transfers,arrivals:side(many,5,5e6)}}));
 assert.match(html,/Arrivées · 5/);assert.equal((html.match(/href="#\/player\/2\d"/g)||[]).length,3);assert.match(html,/\+ 2 autres/);
 const short=clubOverview(club,data({transfers:{...data().transfers,arrivals:side(data().transfers.arrivals.items,9,3e6)}}));
 assert.match(short,/\+ 7 autres/);
 assert.match(short,/<b>Libre<\/b>/);assert.match(short,/href="#\/player\/12"/);
 // player, club and fee share one line
 assert.match(short,/<li><span><a href="#\/player\/12">Adam Test<\/a><\/span><small><a href="#\/club\/9"[^>]*>.*?Nice<\/a><\/small><b>3\sM\s€<\/b><\/li>/);
 assert.match(short,/Départs · 0/);assert.match(short,/Aucun transfert/);
 assert.match(short,/hors transferts : 2 jeunes promus · 1 fin de contrat/);
 const none=clubOverview(club,data({transfers:{...data().transfers,others:{academy:0,release:0,retirement:0}}}));
 assert.doesNotMatch(none,/hors transferts/);assert.match(none,/Saison 2029 \/ 2030/);
});

test('the last eleven reuses the match pitch, and its absence is explained',()=>{
 assert.match(clubOverview(club,data()),/Aucun match joué/);
 const positions=['GB','DL','DC','DC','DR','MC','MC','MC','AILG','BU','AILD'];
 const players=positions.map((position,index)=>({id:100+index,name:`Prénom Nom<${index}>`,position,temporary:false,stats:{rating:6.5}}));
 const lineup={match:match(1,[7,'Lens'],[3,'Metz'],{score:[2,1],outcome:'V',penalties:null}),side:'home',players};
 const html=clubOverview(club,data({lineup}));
 assert.equal((html.match(/class="pitch-player /g)||[]).length,11);
 assert.match(html,/aria-label="Onze aligné par Lens"/);assert.match(html,/href="#\/match\/1"/);
 assert.match(html,/contre[^<]*<i class="kit-dot"[^>]*><\/i>Metz/);
 // shirts wear the club's primary colour, ratings its secondary one
 assert.equal((html.match(/<span class="shirt" style="background:linear-gradient\(135deg,#cc0000 78%,#ffd700 78%\);color:#ffd700">6,5<\/span>/g)||[]).length,11);
 // the small pitch names players by surname, the full name stays in the tooltip
 assert.match(html,/<small>Nom&lt;1&gt;<\/small>/);assert.match(html,/title="Prénom Nom&lt;1&gt;"/);assert.doesNotMatch(html,/<script>|Nom<1>/);
});

test('the pitch spreads full-backs and centre-backs on one line, from left to right',()=>{
 const back=['DR','DC','DL','DC','DC'].map((position,index)=>({id:index,name:`P${index}`,position}));
 const placed=[...pitch(back).matchAll(/left:([\d.]+)%;top:(\d+)%"><span class="shirt">(\w+)/g)].map(([, left,, position])=>[position,Number(left)]).sort((a,b)=>a[1]-b[1]);
 assert.deepEqual(placed.map(([position])=>position),['DL','DC','DC','DC','DR']);
 assert.deepEqual(placed.map(([,left])=>left),[11,30.5,50,69.5,89]);
 const pair=[...pitch(['BU','BU'].map((position,index)=>({id:index,name:'B',position}))).matchAll(/left:([\d.]+)%/g)].map(match=>Number(match[1]));
 assert.deepEqual(pair,[35,65]);
});

test('the mini pitch shirts players in the club kit and keeps the number readable',()=>{
 const line=[{id:1,name:'Ada Un',position:'GB',stats:{rating:7}},{id:-2,name:'Bob Deux',position:'BU',temporary:true,stats:{rating:6}},{id:3,name:'Cy Trois',position:'MC'}];
 const shirts=html=>[...html.matchAll(/<span class="shirt"([^>]*)>/g)].map(match=>match[1]);
 const red=' style="background:linear-gradient(135deg,#cc0000 78%,#ffd700 78%);color:#ffd700"';
 assert.deepEqual(shirts(pitch(line,'x',{kit:{major:'#cc0000',minor:'#ffd700'}})),[red,'',red]);
 // no kit (the match page): the colour still comes from the position
 assert.deepEqual(shirts(pitch(line)),['','','']);
 // the secondary colour is always kept; a halo appears only when it is too close to the primary one to read
 assert.ok(contrastRatio('#cc0000','#ffd700')>=3&&contrastRatio('#f8f8f8','#f8c028')<3);
 assert.equal(kitShirtStyle('#cc0000','#ffd700'),'background:linear-gradient(135deg,#cc0000 78%,#ffd700 78%);color:#ffd700');
 assert.equal(kitShirtStyle('#f8f8f8','#f8c028'),'background:linear-gradient(135deg,#f8f8f8 78%,#f8c028 78%);color:#f8c028;text-shadow:0 0 2px #1c2b22,0 0 2px #1c2b22,0 0 3px #1c2b22');
 assert.match(kitShirtStyle('#101010','#121212'),/color:#121212;text-shadow:0 0 2px #ffffff/);
 // a missing secondary colour reuses the primary one, so it gets the halo too; an unsafe colour is never written out
 assert.match(shirts(pitch(line,'x',{kit:{major:'#204080',minor:null}}))[0],/background:linear-gradient\(135deg,#204080 78%,#204080 78%\);color:#204080;text-shadow:0 0 2px #ffffff/);
 assert.deepEqual(shirts(pitch(line,'x',{kit:{major:'red;background:url(x)',minor:'#ffffff'}})),['','','']);
 assert.deepEqual(shirts(pitch(line,'x',{kit:{major:null,minor:null}})),['','','']);
});
