import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {markdown} from '../../web/markdown.js';
import {manualScreen} from '../../web/manual.js';

const count=(html,pattern)=>(html.match(pattern)||[]).length;

test('headings, paragraphs and inline marks become the page markup',()=>{
 const html=markdown('## La forme\n\nLa **forme** va de `0,7` à *1,3*,\nsur deux lignes.\n\n### Son impact\nUn [lien](#/aide/etats/le-moral).',['la-forme']);
 assert.match(html,/^<h3 id="manual-la-forme">La forme<\/h3>/);
 assert.match(html,/<p>La <strong>forme<\/strong> va de <code>0,7<\/code> à <em>1,3<\/em>, sur deux lignes\.<\/p>/);
 assert.match(html,/<h4>Son impact<\/h4><p>Un <a href="#\/aide\/etats\/le-moral">lien<\/a>\.<\/p>$/);
});

test('lists keep their items, an indented line carrying on the item above',()=>{
 const html=markdown('- premier\n  suite\n- second\n\n1. un\n2. deux\n\nAprès.');
 assert.equal(html,'<ul><li>premier suite</li><li>second</li></ul><ol><li>un</li><li>deux</li></ol><p>Après.</p>');
});

test('a table has its header row, and its figure columns aligned to the right',()=>{
 const html=markdown('| Âge | Facteur |\n|---|---:|\n| 16 à 19 ans | 1 |\n| 20 à 22 ans | 0,75 |\nSuite.');
 assert.match(html,/^<div class="table-scroll"><table><thead><tr><th>Âge<\/th><th class="num">Facteur<\/th><\/tr><\/thead>/);
 assert.match(html,/<tbody><tr><td>16 à 19 ans<\/td><td class="num">1<\/td><\/tr><tr><td>20 à 22 ans<\/td><td class="num">0,75<\/td><\/tr><\/tbody><\/table><\/div><p>Suite\.<\/p>$/);
 // a first cell left empty keeps its column
 assert.match(markdown('| | Liste |\n|---|---|\n| Durée | Longue |'),/<thead><tr><th><\/th><th>Liste<\/th><\/tr>/);
});

test('notes and formula blocks are kept apart from the text, the formula as typed',()=>{
 const html=markdown('> Une note\n> sur deux lignes.\n\n```\nétat = forme × condition\n  × moral **brut**\n```\nFin.');
 assert.equal(html,'<blockquote><p>Une note sur deux lignes.</p></blockquote><pre>état = forme × condition\n  × moral **brut**</pre><p>Fin.</p>');
});

test('nothing of the source is markup, and a link only leads inside the application',()=>{
 const html=markdown('## <img src=x>\n\n<script>alert(1)</script> & [dehors](https://example.com) [ici](#/clubs) `<b>`\n\n| <i>a</i> |\n|---|\n| "b" |');
 assert.doesNotMatch(html,/<img|<script|<b>|<i>/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; \[dehors\]\(https:\/\/example\.com\) <a href="#\/clubs">ici<\/a> <code>&lt;b&gt;<\/code>/);
});

const data={pages:[{slug:'monde',title:'Le monde'},{slug:'etats',title:'Forme & moral'}],
 page:{slug:'etats',title:'Forme & moral',sections:[{id:'la-forme',title:'La forme'},{id:'le-moral',title:'Le moral'}],markdown:'## La forme\n\nTexte.\n\n## Le moral\n\nSuite.'}};

test('the manual lists its chapters, the sections of the open one, and writes that chapter',async()=>{
 const previous=globalThis.fetch;
 let requested;
 globalThis.fetch=async url=>{requested=url;return {ok:true,json:async()=>data};};
 try{
  const html=await manualScreen('etats');
  assert.equal(requested,'/api/manuel/etats');
  assert.match(html,/<h1>Manuel du jeu<\/h1>/);
  assert.match(html,/<li><a href="#\/aide\/monde">Le monde<\/a><\/li>/);
  assert.match(html,/<a href="#\/aide\/etats" aria-current="page">Forme &amp; moral<\/a><ul><li><a href="#\/aide\/etats\/la-forme">La forme<\/a><\/li><li><a href="#\/aide\/etats\/le-moral">Le moral<\/a><\/li><\/ul>/);
  assert.equal(count(html,/aria-current/g),1);
  assert.match(html,/<div class="card-head"><h2>Forme &amp; moral<\/h2><\/div>/);
  assert.match(html,/<h3 id="manual-la-forme">La forme<\/h3><p>Texte\.<\/p><h3 id="manual-le-moral">Le moral<\/h3>/);
  await manualScreen();
  assert.equal(requested,'/api/manuel');
 }finally{globalThis.fetch=previous;}
});

test('the sidebar and the router know the manual, which opens without a game',async()=>{
 const page=await readFile(new URL('../../web/index.html',import.meta.url),'utf8');
 assert.match(page,/<div class="sidebar-tools">.*id="autoplay".*id="theme-toggle".*<a id="manual-link" href="#\/aide" data-nav="aide" aria-label="Manuel du jeu"/);
 const app=await readFile(new URL('../../web/app.js',import.meta.url),'utf8');
 assert.ok(app.indexOf("if(screen==='aide'&&!state.live_match_id)html=await manualScreen(id);")<app.indexOf('else if(!state.exists||state.recovery_required)html=await savesScreen(true)'));
});
