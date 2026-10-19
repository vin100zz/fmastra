import {test} from 'node:test';
import assert from 'node:assert/strict';
import {kitShirt,shirtLabel,pitch} from '../../web/ui.js';
import {playerHero} from '../../web/club-hero.js';

test('a shirt on a pitch carries the player’s number, larger than a position, and his position without one',()=>{
 assert.equal(shirtLabel({position:'BU',shirt:9}),'9');
 assert.equal(shirtLabel({position:'BU',shirt:null}),'BU');
 assert.equal(shirtLabel(null,'MC'),'MC');
 assert.equal(shirtLabel({position:'BU',shirt:39},'AILG'),'39');
 assert.match(kitShirt('#cc0000','#ffd700','9'),/^<span class="kit-shirt number" style="--kit-body:#cc0000;--kit-sleeves:#ffd700;--kit-ink:#ffffff"><svg[^]*<\/svg><b>9<\/b><\/span>$/);
 assert.match(kitShirt('#cc0000','#ffd700','MC'),/^<span class="kit-shirt" style=/);
 // The number a player leaves, veiled.
 assert.match(kitShirt('#cc0000','#ffd700',16,{former:true}),/^<span class="kit-shirt number former" /);
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
