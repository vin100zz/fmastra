import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {nationLogoUrl,initNationLogos} from '../../web/nation-logos.js';
import {nationHero} from '../../web/club-hero.js';
import {setNations} from '../../web/ui.js';

test('every source logo is a local 400px PNG and each mapped nation resolves to it',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../web/nations/sources.json',import.meta.url)));
 assert.equal(manifest.logos.length,228);
 assert.equal(new Set(manifest.logos.map(row=>row.file)).size,228);
 const codes=new Set();
 for(const row of manifest.logos){
  const png=readFileSync(new URL(`../../web/nations/${row.file}`,import.meta.url));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),400);assert.equal(png.readUInt32BE(20),400);
  assert.equal(png[25],6); // RGBA, matching club crests.
  assert.equal(createHash('sha256').update(png).digest('hex'),row.sha256);
  for(const code of row.codes){
   assert.ok(!codes.has(code));codes.add(code);
   assert.equal(nationLogoUrl(code),`/nations/${row.file}`);
  }
 }
 assert.equal(codes.size,222);
});

test('Mali, Myanmar and the two Saint Martins have distinct logos; unknown codes have none',()=>{
 for(const [code,slug] of [['MLI','mali'],['X0E','myanmar'],['X3B','saint-martin'],['X3C','sint-maarten'],['X4B','zanzibar']]){
  assert.equal(nationLogoUrl(code),`/nations/${slug}.png`);
 }
 for(const code of [null,undefined,'UNKNOWN','../france','toString'])assert.equal(nationLogoUrl(code),'');
});

test('a selection without a collected logo keeps its flag, or initials without a flag',()=>{
 setNations({X2L:{name:'Monaco',flag:'mc'}});
 try{
  const render=nation=>nationHero({id:-1,name:'Monaco',nation,strength:32},{menu:[],section:'squad'});
  const flag=render('X2L');
  assert.match(flag,/class="crest-flag" src="\/flags\/mc.svg"/);
  assert.doesNotMatch(flag,/class="crest-logo"/);
  assert.match(render('UNKNOWN'),/<div class="crest club-hero-crest">M<\/div>/);
 }finally{setNations({});}
});


test('image failure handling uses capture and removes only the national logo to reveal its fallback',()=>{
 let handler,removed=0;
 initNationLogos({addEventListener(type,callback,capture){
  assert.equal(type,'error');assert.equal(capture,true);handler=callback;
 }});
 handler({target:{matches:selector=>selector==='img[data-nation-logo]',remove(){removed++;}}});
 handler({target:{matches:()=>false,remove(){removed++;}}});
 assert.equal(removed,1);
 const html=nationHero({id:-1,name:'France',nation:'FRA',strength:80},{menu:[],section:'squad'});
 assert.match(html,/data-nation-logo/);assert.doesNotMatch(html,/onerror=/);
});
