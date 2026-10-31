import {test} from 'node:test';
import assert from 'node:assert/strict';
import {kitShirt,teamKit,shirtLabel,pitch} from '../../web/ui.js';
import {playerHero} from '../../web/club-hero.js';

test('a shirt on a pitch carries the player’s number, larger than a position, and his position without one',()=>{
 assert.equal(shirtLabel({position:'BU',shirt:9}),'9');
 assert.equal(shirtLabel({position:'BU',shirt:null}),'BU');
 assert.equal(shirtLabel(null,'MC'),'MC');
 assert.equal(shirtLabel({position:'BU',shirt:39},'AILG'),'39');
 const red={major:'#cc0000',minor:'#ffd700'};
 assert.match(kitShirt(red,'9'),/^<span class="kit-shirt number" style="--kit-body:#cc0000;--kit-minor:#ffd700;--kit-third:#ffd700;--kit-ink:#ffffff"><svg[^]*<\/svg><b>9<\/b><\/span>$/);
 assert.match(kitShirt(red,'MC'),/^<span class="kit-shirt" style=/);
 // The number a player leaves, veiled.
 assert.match(kitShirt(red,16,{former:true}),/^<span class="kit-shirt number former" /);
});

test('a shirt wears the pattern of its kit, flat, its number in white outlined on a pattern',()=>{
 // A team's kit as the API names it.
 const kit=teamKit({major_color:'#F8F8F8',minor_color:'#D00830',third_color:'#2850B0',kit_id:43});
 assert.deepEqual(kit,{major:'#F8F8F8',minor:'#D00830',third:'#2850B0',pattern:43});
 assert.equal(teamKit({major_color:'nope'}),null);
 const monaco=kitShirt(kit,'9');
 assert.match(monaco,/^<span class="kit-shirt patterned number" style="--kit-body:#F8F8F8;--kit-minor:#D00830;--kit-third:#2850B0;--kit-ink:#1c2b22">/);
 // Its diagonal in the second colour, the cuffs in the third, all of it inside the shirt; the collar over it.
 assert.match(monaco,/<mask id="(kit-mask-\d+)"><path class="kit-mask" d="[^"]+"\/><\/mask><path class="kit-base" d="[^"]+"\/><g mask="url\(#\1\)"><polygon class="kit-m" points="15.5,-1 41,-1 41,34 33.5,34"\/><rect class="kit-t" width="2.6" height="17"\/><rect class="kit-t" x="37.4" width="2.6" height="17"\/><\/g><path class="kit-collar"/);
 // Stripes are drawn rectangle by rectangle; each shirt has a mask of its own.
 const striped=kitShirt({...kit,pattern:3},'4');
 assert.ok((striped.match(/<rect class="kit-m"/g)||[]).length>=8);
 assert.notEqual(monaco.match(/kit-mask-\d+/)[0],striped.match(/kit-mask-\d+/)[0]);
 // A chest left plain keeps the ink of the body; an unknown pattern is the plain one.
 assert.match(kitShirt({...kit,pattern:2},'4'),/^<span class="kit-shirt number" /);
 assert.equal(kitShirt({...kit,pattern:99},'4').replace(/kit-mask-\d+/g,''),kitShirt({...kit,pattern:1},'4').replace(/kit-mask-\d+/g,''));
 // Every pattern of the 57 draws something but the plain one, in the second or the third colour only.
 for(let pattern=2;pattern<=57;pattern++)assert.match(kitShirt({...kit,pattern},'4'),/<g mask="url\(#kit-mask-\d+\)"><(rect|polygon|polyline) class="kit-(m|t)(-band)?"/,`pattern ${pattern}`);
 // An empty place and a grey shirt draw no pattern and no ring.
 assert.match(kitShirt(kit,'DC',{empty:true}),/^<span class="kit-shirt empty">[^]*<path class="kit-base"[^>]*\/><path class="kit-collar"/);
 assert.match(kitShirt(null,'DC'),/^<span class="kit-shirt plain">/);
});

test('a match report writes the number each player wore, the position of a temporary player',()=>{
 const html=pitch([{id:1,name:'Gardien Un',position:'GB',shirt:16},{id:-2,name:'Renfort',position:'DC',temporary:true}],'Composition',{kit:{major:'#cc0000',minor:'#ffd700'}});
 assert.match(html,/<span class="kit-shirt number" style="[^"]*"><svg[^]*?<\/svg><b>16<\/b>/);
 assert.match(html,/<span class="kit-shirt plain"><svg[^]*?<\/svg><b>DC<\/b>/);
});

test('a player’s band writes his number before his name, his club’s crest keeping its disc',()=>{
 const club={id:7,name:'Lens',major_color:'#cc0000',minor_color:'#ffd700'};
 const player={id:3,name:'Ange Lago',age:22,club,rating:120,potential:157,value:5e6,asking_price:6e6,shirt:9};
 const html=playerHero(player,{});
 assert.match(html,/<div class="crest club-hero-crest">[^<]*<img class="crest-logo" src="\/crests\/TCM1_7.png"/);
 assert.match(html,/<div class="club-hero-name"><span class="club-hero-number" title="Numéro de maillot">9<\/span><h1>Ange Lago<\/h1><a class="club-hero-context" href="#\/club\/7">Lens<\/a><\/div>/);
 assert.doesNotMatch(html,/kit-shirt/);
 // Without a number, or without a club, the name stands alone.
 assert.match(playerHero({...player,shirt:null},{}),/<div class="club-hero-name"><h1>Ange Lago<\/h1>/);
 assert.match(playerHero({...player,club:null,shirt:null},{}),/<div class="club-hero-name"><h1>Ange Lago<\/h1>/);
});
