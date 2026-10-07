import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

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
