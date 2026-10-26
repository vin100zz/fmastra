import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {shareWidth,cellColumns,spreadColumns} from '../../web/columns.js';

const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
// A column of a fixed width, margins included; a name, which has none of its own.
const fixed=width=>({width,padding:16,flexible:false,least:0,most:200});
const name=(least=120,most=200)=>({width:0,padding:16,flexible:true,least,most});

test('what a table has left over once its name stands at its most goes equally to each gap between two columns',()=>{
 // 300 of figures, a name of 200 and its margins: 484 left over a width of 1000, on four gaps.
 assert.deepEqual(shareWidth(1000,[fixed(100),name(),fixed(100),fixed(50),fixed(50)]),{extra:121,least:false});
 // Whole pixels: what remains of a share goes to the name, which takes the rest.
 assert.deepEqual(shareWidth(1001,[fixed(100),name(),fixed(100),fixed(50),fixed(50)]),{extra:121,least:false});
 // Without a name, every column keeps its width and the gaps share all that is left.
 assert.deepEqual(shareWidth(400,[fixed(100),fixed(100),fixed(100)]),{extra:50,least:false});
 // A name shorter than --w-name stands at its longest.
 assert.deepEqual(shareWidth(1000,[fixed(100),name(120,150),fixed(100)]),{extra:317,least:false});
});

test('a table without room for its names at their most leaves them what remains, down to their least, then scrolls',()=>{
 // 600 of columns and margins: the two names share 390, between their least and their most.
 assert.deepEqual(shareWidth(990,[fixed(300),name(),name(),fixed(268)]),{extra:0,least:false});
 // Under the least of both, they hold it and the table runs over its card.
 assert.deepEqual(shareWidth(800,[fixed(300),name(),name(),fixed(268)]),{extra:0,least:true});
 // A name with no least (the club of a standings) takes whatever remains, even nothing.
 assert.deepEqual(shareWidth(300,[fixed(300),name(0)]),{extra:0,least:false});
 // A table already as wide as its columns has nothing to share.
 assert.deepEqual(shareWidth(300,[fixed(100),fixed(200)]),{extra:0,least:false});
 assert.deepEqual(shareWidth(300,[fixed(300)]),{extra:0,least:false});
});

test('each cell is told the columns it spans, through the headings that span rows or columns',()=>{
 const row=cells=>({cells:cells.map(([colSpan,rowSpan,id])=>({colSpan,rowSpan,id}))});
 // The attribute view: the identity's headings over two rows, a section's heading over its three columns.
 const rows=[row([[1,2,'poste'],[1,2,'joueur'],[3,1,'général']]),row([[1,1,'END'],[1,1,'PAS'],[1,1,'VIT']]),row([[1,1,'a'],[1,1,'b'],[1,1,'c'],[1,1,'d'],[1,1,'e']])];
 assert.deepEqual(cellColumns(rows).map(([cell,first,last])=>[cell.id,first,last]),
  [['poste',0,0],['joueur',1,1],['général',2,4],['END',2,2],['PAS',3,3],['VIT',4,4],['a',0,0],['b',1,1],['c',2,2],['d',3,3],['e',4,4]]);
});

test('a table lined up with another keeps the widths of the sheets: its gaps share nothing, so that both stay level',()=>{
 const writes=[],style={removeProperty(){},setProperty:(...args)=>writes.push(args)};
 const cell=()=>({colSpan:1,rowSpan:1,style});
 const table={rows:[{cells:[cell(),cell(),cell()]}],classList:{contains:name=>name==='aligned'},style,querySelector:()=>null,getBoundingClientRect:()=>({width:800})};
 spreadColumns(table);
 assert.deepEqual(writes,[]);
});

test('every table of the screens and of their dialogs is spread, from the start',async()=>{
 const app=await read('web/app.js');
 assert.match(app,/import \{initColumns\} from '\.\/columns\.js';/);
 assert.match(app,/initColumns\(document\.body\);/);
});

test('the width of a name is a token of the charter, and a player list has one set of widths on every screen',async()=>{
 const [reference,theme,charter]=await Promise.all(['docs/charte/charte.css','web/theme.css','web/charte.css'].map(read));
 for(const sheet of [reference,theme])assert.match(sheet,/--w-name:200px;/);
 // No screen of its own: neither the squad nor the list beside a preview sets a column's width.
 assert.doesNotMatch(charter+theme,/:is\(\.club-squad|\.club-squad \.player-table \.[\w-]+-column\{width|\.split \.player-table \.[\w-]+-column\{width/);
 assert.match(charter,/\.player-table :is\(\.name-column,\.club-column,\.academy_club-column\)\{width:auto;min-width:120px\}/);
 // The arrow of a sorted heading follows its label; in the last column it comes before it.
 assert.match(charter,/th button\.sort-toggle::after,th button\[data-sort\]::after\{content:"";position:absolute;right:-7px;/);
 assert.match(charter,/th:last-child button:is\(\.sort-toggle,\[data-sort\]\)::after\{right:auto;left:-7px\}/);
});
