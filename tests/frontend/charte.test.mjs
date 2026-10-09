import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
// The custom properties a block declares, by name, written the same way (lower case, no space, six-digit colours).
const tokens=block=>Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)].map(([,name,value])=>[name,value.trim().toLowerCase().replace(/\s+/g,'').replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/,'#$1$1$2$2$3$3')]));
// Every block of a sheet under exactly this selector, joined.
const blocks=(css,selector)=>[...css.matchAll(new RegExp(`(?:^|[}\\s])${selector.replace(/[[\]"=]/g,'\\$&')}\\s*\\{([^}]*)\\}`,'g'))].map(match=>match[1]).join(';');

test('the application’s light theme holds every token of the charter’s reference sheet',async()=>{
 const [reference,theme,club]=await Promise.all(['docs/charte/charte.css','web/theme.css','web/club.css'].map(read));
 const charter=tokens(blocks(reference,':root'));
 // What does not depend on the theme, then the light theme over it, as the page reads them.
 const light=':root[data-theme="light"]';
 const app={...tokens(blocks(theme,':root')),...tokens(blocks(club,':root')),...tokens(blocks(theme,light)),...tokens(blocks(club,light))};
 assert.ok(Object.keys(charter).length>50,'the reference sheet declares its tokens under :root');
 for(const [name,value] of Object.entries(charter))assert.equal(app[name],value,name);
});

test('the charter’s sheet is the last one the page loads',async()=>{
 const sheets=[...(await read('web/index.html')).matchAll(/<link rel="stylesheet" href="\/([\w-]+\.css)">/g)].map(match=>match[1]);
 assert.equal(sheets.at(-1),'charte.css');
});

// Every rule of a sheet, as [selector, declarations], whatever the media it stands in.
const rules=css=>[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match=>[match[1].trim(),match[2]]);
const OLDER=['style.css','compact.css','theme.css','club.css','match-replay.css'];

test('a link is told under the pointer by the charter’s sheet alone: no other sheet underlines one or styles it there',async()=>{
 for(const name of OLDER){
  for(const [selector,body] of rules(await read(`web/${name}`))){
   assert.doesNotMatch(body,/text-decoration(-line)?\s*:\s*underline/,`${name}: ${selector}`);
   // A selector that ends on a link under the pointer (a:hover, .card a.more:hover) belongs to the charter.
   assert.doesNotMatch(selector,/(^|[\s>+~,])a(?:[.#[][^\s>+~,:]*)*(?::not\([^)]*\))*:hover\s*(,|$)/,`${name}: ${selector}`);
  }
 }
 const charter=rules(await read('web/charte.css'));
 const said=pattern=>charter.some(([selector,body])=>pattern[0].test(selector)&&pattern[1].test(body));
 assert.ok(said([/(^|,)a:hover/,/text-decoration-line:underline/]),'a link is underlined under the pointer');
 assert.ok(said([/tbody.*tr.*:hover/,/background:var\(--panel-3\)/]),'a row takes the ground of what is under the pointer');
});

test('the reference sheet and the application’s say the same of a link and of a row under the pointer',async()=>{
 const reference=rules(await read('docs/charte/charte.css'));
 const link=reference.find(([selector])=>/a:is\(:hover,\.hover\)$/.test(selector));
 assert.match(link[1],/text-decoration:underline/);
 const row=reference.find(([selector])=>selector.includes('.tr:not(')&&selector.includes(':hover'));
 assert.match(row[1],/background:var\(--panel-3\)/);
});

test('the seasons are stepped through with one control, the charter’s: no screen draws its own, no sheet styles another',async()=>{
 const folder=new URL('../../web/',import.meta.url);
 const screens=(await readdir(folder)).filter(name=>name.endsWith('.js'));
 assert.ok(screens.length>30);
 // What the screens once chose a season with: a list and its button, arrows of their own, a frame of options, a folded
 // block per season.
 const older=/name="saison"|data-season|season-steps|season-navigation|season-archive|segmented steps/;
 for(const name of [...screens,...OLDER,'charte.css'])assert.doesNotMatch(await read(`web/${name}`),older,name);
 // Both sheets draw it the same: no border, arrows in the colour of the club's page or in the ink, the season as a key
 // figure, its ground and the mark of what is open while its list is.
 for(const sheet of ['docs/charte/charte.css','web/charte.css']){
  const said=rules(await read(sheet)),body=selector=>said.find(([found])=>found===selector)?.[1]??'';
  assert.match(body('.season>:is(button,a)'),/border:0;.*background:none;color:var\(--club,var\(--ink\)\)/,sheet);
  assert.match(body('.season-pick>summary'),/min-width:calc\(var\(--chars,0\)\*1ch \+ var\(--s6\) \+ var\(--s2\)\)/,sheet);
  assert.match(body('.season-pick>summary'),/var\(--fs-figure\).*var\(--display\)|var\(--display\).*var\(--fs-figure\)/,sheet);
  assert.match(body('.season-pick[open]>summary'),/background:var\(--panel-2\);box-shadow:inset 0 calc\(-1\*var\(--mark-control\)\) 0 var\(--club,var\(--accent\)\)/,sheet);
  assert.match(body('.menu>:is(button,a)[aria-checked="true"]'),/background:var\(--own-row\)/,sheet);
  assert.ok(!said.some(([selector,rule])=>/^\.season\b/.test(selector)&&/border:1px/.test(rule)),sheet);
 }
 // On a club's or a selection's page, that colour is the one under its open tab.
 assert.match(rules(await read('web/charte.css')).find(([selector])=>selector==='.club-hero .season')[1],/--club:var\(--hero-accent\)/);
});
