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

test('a band steps between peers with one control, the charter’s: a season’s steps in a column, in the band’s colours',async()=>{
 for(const sheet of ['docs/charte/charte.css','web/charte.css']){
  const said=rules(await read(sheet)),body=selector=>said.find(([found])=>found===selector)?.[1]??'';
  // Neither border nor ground; the colour the band gives its steps, its ink without one.
  assert.match(body('.entity-nav'),/--step:var\(--hero-step,currentColor\);.*flex-direction:column/,sheet);
  assert.match(body('.entity-step,.entity-menu>summary'),/width:var\(--h-control\);height:var\(--h-control-small\);.*color:var\(--step\)/,sheet);
  assert.doesNotMatch(body('.entity-step,.entity-menu>summary'),/border:|background/,sheet);
  // The chevrons of a season's steps; three lighter lines open the list.
  assert.match(body(':is(.entity-step,.entity-menu>summary) svg'),/width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2\.4/,sheet);
  assert.match(body('.entity-menu>summary svg'),/stroke-width:1\.7/,sheet);
  // Open, the veil of the band's ink and the mark of what is open; the list is the menu, under the column.
  assert.match(body('.entity-menu[open]>summary'),/background:var\(--hero-veil,var\(--panel-2\)\);box-shadow:inset 0 calc\(-1\*var\(--mark-control\)\) 0 var\(--step\)/,sheet);
  assert.match(body('.entity-menu>.menu'),/top:calc\(100% \+ var\(--s1\)\);left:0;.*max-height:calc\(12\*var\(--h-row\) \+ 2\*var\(--s1\)\)/,sheet);
  // Under the pointer, that veil and not the ground of the page.
  assert.ok(said.some(([selector,rule])=>/a\.entity-step.*:hover/.test(selector)&&/background:var\(--hero-veil,var\(--panel-3\)\)/.test(rule)),sheet);
 }
 // The older sheets say nothing of it any more.
 for(const name of OLDER)assert.doesNotMatch(await read(`web/${name}`),/entity-/,name);
});

test('a club’s dot and a match on a line of a list are drawn the same by the reference sheet and by the application’s',async()=>{
 for(const sheet of ['docs/charte/charte.css','web/charte.css']){
  const said=rules(await read(sheet)),body=selector=>said.find(([found])=>found===selector)?.[1]??'';
  // The dot: a square of 14 at the charter's radius.
  assert.match(body('.kit-dot'),/width:14px;height:14px;.*border-radius:var\(--radius\)/,sheet);
  // The winner's name in 700, in the accent's ink; the other side's steps back to the running ink. The match of the
  // user's club is washed, and nothing there tells its winner another way.
  assert.match(body('.fixture-side.won'),/^font-weight:700;color:var\(--accent-text\)$/,sheet);
  assert.match(body('.fixture-side.lost'),/^color:var\(--ink-2\)$/,sheet);
  assert.match(body('.fixture.own'),/^background:var\(--own-row\)$/,sheet);
  assert.ok(!said.some(([selector])=>/\.own\b.*\.fixture-side|\.fixture-side.*\.own\b/.test(selector)),sheet);
  // The score, a key figure on a ground of 22; what settled, on a storey joined under it, with no figure told apart.
  assert.match(body('.fixture-score'),/height:var\(--h-control-small\);.*background:var\(--panel-2\);.*var\(--fs-figure\).*var\(--display\)/,sheet);
  assert.match(body('.fixture-floor'),/height:var\(--h-chip\);.*border:1px solid var\(--line\);border-top:0;/,sheet);
  assert.ok(!said.some(([selector])=>/\.fixture-floor\s+b\b/.test(selector)),sheet);
  // A list where a match has a storey keeps its room on every line.
  assert.match(body('.fixture.wide'),/--score-column:88px/,sheet);
 }
 // In a bracket too, the wash is the user's club's, and the side that went through is told as a winner is in a list:
 // its name in 700 in the accent's ink, its figures in the strong ink; the other side's name in the running ink, its
 // figures muted. The charter's sheet alone says so.
 const app=rules(await read('web/charte.css')),older=rules(await read('web/theme.css')),told=selector=>app.find(([found])=>found===selector)?.[1]??'';
 assert.match(told('.bracket-tie.own'),/background:var\(--own-row\)/);
 assert.equal(told('.bracket-team.winner'),'font-weight:700;color:var(--strong)');assert.equal(told('.bracket-team.winner .bracket-club'),'color:var(--accent-text)');
 assert.equal(told('.bracket-team.beaten'),'color:var(--muted)');assert.equal(told('.bracket-team.beaten .bracket-club'),'color:var(--ink-2)');
 assert.ok(!older.some(([selector])=>/\.bracket-team\.(winner|beaten)$/.test(selector)));
 // The line a country's page once drew for itself is gone.
 for(const name of [...OLDER,'charte.css'])assert.doesNotMatch(await read(`web/${name}`),/country-match/,name);
});

test('a card that folds is drawn the same by the reference sheet and by the application’s: its whole head opens it',async()=>{
 for(const sheet of ['docs/charte/charte.css','web/charte.css']){
  const said=rules(await read(sheet)),body=selector=>said.find(([found])=>found===selector)?.[1]??'';
  assert.match(body('.card-head.toggle'),/cursor:pointer/,sheet);
  // A bare arrow, the chevron of an icon in the muted ink, turned over while the card is open; folded, what is secondary
  // takes no room.
  assert.match(body('.toggle-arrow'),/width:16px;height:16px;fill:none;stroke:var\(--muted\);stroke-width:1\.7/,sheet);
  assert.match(body('.card.fold.open .toggle-arrow'),/transform:rotate\(180deg\)/,sheet);
  assert.match(body('.card.fold:not(.open) .fold-more'),/display:none/,sheet);
  // Under the pointer, the whole head takes the ground.
  assert.ok(said.some(([selector,rule])=>/^\.card-head\.toggle:(is\(:hover,\.hover\)|hover)$/.test(selector)&&/background:var\(--panel-3\)/.test(rule)),sheet);
 }
});

test('a final and the run of a nation are drawn the same by the reference sheet and by the application’s',async()=>{
 for(const sheet of ['docs/charte/charte.css','web/charte.css']){
  const said=rules(await read(sheet)),body=selector=>said.find(([found])=>found===selector)?.[1]??'';
  // A shoot-out's mark before a final's score, as on the storey of a match in a list.
  assert.match(body('.final-score small'),/var\(--fs-micro\).*color:var\(--muted\)/,sheet);
  // The title in bold in the accent's ink, as a winner in a match list; the final in the strong ink; absent, muted.
  assert.match(body('.run.won'),/^font-weight:700;color:var\(--accent-text\)$/,sheet);
  assert.match(body('.run.final'),/^font-weight:600;color:var\(--strong\)$/,sheet);
  assert.match(body('.run.none'),/^color:var\(--muted\)$/,sheet);
  // Up a division in green, down one in red.
  assert.match(body('.run i.up'),/^color:var\(--good\)$/,sheet);
  assert.match(body('.run i.down'),/^color:var\(--bad\)$/,sheet);
 }
});
