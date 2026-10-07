import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resultHref,markedName,resultRow,resultsHtml,step} from '../../web/search.js';
import {setNations} from '../../web/ui.js';

setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'},GER:{name:'Allemagne',display_code:'ALL',flag:'de'}});
const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');

const juventus={id:7,name:'Juventus',major_color:'#ffffff',minor_color:'#111111'};
const player={kind:'player',id:12,name:'Francisco Conceição',position:'AILD',club:juventus,retired:false,marks:[[0,3]]};
const club={kind:'club',id:3,name:'Eintracht Francfort',major_color:'#e1000f',minor_color:'#111111',nation:'GER',
 competition:{id:30,name:'Bundesliga',kind:'league',code:null,nation:'GER',level:1},marks:[[10,13]]};
const cup={kind:'competition',id:20,name:'Coupe de France',competition:{id:20,name:'Coupe de France',kind:'cup',code:null,nation:'FRA',level:1},marks:[[9,12]]};
const europe={kind:'competition',id:-101,name:'Ligue des champions',competition:{id:-101,name:'Ligue des champions',kind:'europe',code:'C1',nation:'EUR',level:1},marks:[[0,3]]};
const nation={kind:'nation',id:1,name:'France',nation:'FRA',marks:[[0,3]]};
// The three cells of a line: its badge, its name, what tells it from its namesakes.
const cells=html=>/^<a class="result[^"]*" href="[^"]*"[^>]*><span>(.*?)<\/span><span>(.*?)<\/span><span>(.*)<\/span><\/a>$/.exec(html).slice(1);

test('a line leads to the page of what it names',()=>{
 assert.equal(resultHref(player),'#/player/12');
 assert.equal(resultHref(club),'#/club/3');
 assert.equal(resultHref(cup),'#/league/20');
 assert.equal(resultHref(europe),'#/europe/C1');
 assert.equal(resultHref(nation),'#/international/nation/1');
});

test('the letters typed are set out in the name, which is escaped around them',()=>{
 assert.equal(markedName('Franck Ribéry',[[0,3],[7,13]]),'<b>Fra</b>nck <b>Ribéry</b>');
 assert.equal(markedName("N'Golo Kanté",[[0,4]]),'<b>N&#39;Go</b>lo Kanté');
 assert.equal(markedName('Tom & Jerry <b>',[[4,5]]),'Tom <b>&amp;</b> Jerry &lt;b&gt;');
 assert.equal(markedName('Paris SG'),'Paris SG');
});

test('a player’s line has his position, his name and his club after its colours',()=>{
 const [badge,name,context]=cells(resultRow(player));
 assert.equal(badge,'<span class="position att">AILD</span>');
 assert.equal(name,'<b>Fra</b>ncisco Conceição');
 assert.match(context,/^<i class="kit-dot" style="background:linear-gradient\(135deg,#ffffff 50%,#111111 50%\)" aria-hidden="true"><\/i>Juventus$/);
 assert.equal(cells(resultRow({...player,club:null}))[2],'Libre');
 const retired=cells(resultRow({...player,position:null,club:null,retired:true}));
 assert.deepEqual([retired[0],retired[2]],['','Retraité']);
});

test('a club’s line has its colours, then its country and its division',()=>{
 const [badge,name,context]=cells(resultRow(club));
 assert.match(badge,/^<i class="kit-dot"/);
 assert.equal(name,'Eintracht <b>Fra</b>ncfort');
 assert.match(context,/^<span class="nation" title="Allemagne"><img class="flag" src="\/flags\/de\.svg"[^>]*><\/span><span class="competition-code league" title="Bundesliga">D1<\/span>$/);
 // A club that plays in no division has its country alone.
 assert.match(cells(resultRow({...club,competition:null}))[2],/^<span class="nation"[^>]*><img[^>]*><\/span>$/);
});

test('a competition’s line has its badge, then its country; a European cup has none',()=>{
 const [badge,name,context]=cells(resultRow(cup));
 assert.equal(badge,'<span class="competition-code cup" title="Coupe de France">CF</span>');
 assert.equal(name,'Coupe de <b>Fra</b>nce');
 assert.match(context,/^<span class="nation" title="France"><img class="flag" src="\/flags\/fr\.svg"[^>]*>France<\/span>$/);
 const [code,,none]=cells(resultRow(europe));
 assert.equal(code,'<span class="competition-code europe" title="Ligue des champions">C1</span>');
 assert.equal(none,'');
});

test('a national team’s line has its flag and nothing after its name',()=>{
 const [badge,name,context]=cells(resultRow(nation));
 assert.match(badge,/^<span class="nation" title="France"><img class="flag" src="\/flags\/fr\.svg"[^>]*><\/span>$/);
 assert.deepEqual([name,context],['<b>Fra</b>nce','']);
});

test('no line names its kind: the badge tells it',()=>{
 for(const item of [player,club,cup,europe,nation])assert.doesNotMatch(resultRow(item).replace(/<[^>]*>/g,' '),/Joueur|Club|Compétition|Sélection/);
});

test('one line is the chosen one, the first by default; the arrows stop at both ends',()=>{
 const html=resultsHtml([nation,cup,club,player]);
 assert.equal((html.match(/class="result chosen"/g)||[]).length,1);
 assert.match(html,/^<a class="result chosen" href="#\/international\/nation\/1" aria-current="true">/);
 assert.match(resultsHtml([nation,cup,club,player],2),/<a class="result chosen" href="#\/club\/3" aria-current="true">/);
 assert.equal(step(0,4,'ArrowDown'),1);assert.equal(step(3,4,'ArrowDown'),3);
 assert.equal(step(2,4,'ArrowUp'),1);assert.equal(step(0,4,'ArrowUp'),0);
});

test('nothing found is said in two words',()=>{
 assert.equal(resultsHtml([]),'<p>Aucun résultat</p>');
});

test('the page has the button in the top bar and the dialog, with a choice of the four kinds',async()=>{
 const page=await read('web/index.html');
 assert.match(page,/<div class="time-controls">.*<button id="search-open" type="button" aria-label="Rechercher" title="Rechercher \(Ctrl K\)" hidden>.*<div id="next-matches"/);
 const dialog=/<dialog id="search" class="palette"[^>]*>.*?<\/dialog>/.exec(page)[0];
 assert.match(dialog,/<input type="search"[^>]*aria-label="Rechercher un joueur, un club, une compétition ou une sélection">/);
 assert.deepEqual([...dialog.matchAll(/data-search-type="(\w*)"[^>]*>([^<]*)</g)].map(match=>[match[1],match[2]]),
  [['','Tout'],['joueurs','Joueurs'],['clubs','Clubs'],['competitions','Compétitions'],['selections','Sélections']]);
 assert.match(dialog,/<div class="results"><\/div>/);
});
