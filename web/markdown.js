import {escape as e} from './ui.js';

// The subset of Markdown the manual is written in (docs/manuel): `##` and `###` headings, paragraphs, `-` and `1.` lists, tables,
// `>` notes, fenced blocks, and inline `code`, **bold**, *italic* and [links](#/…) to the application's own pages.
// Nothing of the source reaches the page unescaped.
const inline=text=>e(text).split('`').map((part,index)=>index%2?`<code>${part}</code>`
 :part.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>')
  .replace(/\[([^\]]+)\]\((#\/[^)\s]*)\)/g,'<a href="$2">$1</a>')).join('');
const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim());
const isRule=line=>/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(line.trim());

// A column whose rule ends with a colon ("---:") holds figures: its cells are aligned to the right.
function table(lines){
 const ruled=lines.length>1&&isRule(lines[1]),numeric=ruled?cells(lines[1]).map(rule=>rule.endsWith(':')):[];
 const row=(line,tag)=>`<tr>${cells(line).map((cell,index)=>`<${tag}${numeric[index]?' class="num"':''}>${inline(cell)}</${tag}>`).join('')}</tr>`;
 const body=lines.slice(ruled?2:0).map(line=>row(line,'td')).join('');
 return `<div class="table-scroll"><table>${ruled?`<thead>${row(lines[0],'th')}</thead>`:''}<tbody>${body}</tbody></table></div>`;
}

// `headingIds` names the `##` headings in their order, so that a page can be opened on one of them.
export function markdown(source,headingIds=[]){
 const lines=String(source??'').split(/\r?\n/),html=[];
 let index=0,heading=0;
 const item=/^(-|\d+\.)\s+/;
 // The lines of a block: from `index` while `test` holds.
 const take=test=>{const taken=[];while(index<lines.length&&test(lines[index]))taken.push(lines[index++]);return taken;};
 while(index<lines.length){
  const line=lines[index];
  if(!line.trim()){index++;continue;}
  if(line.startsWith('```')){
   index++;
   html.push(`<pre>${e(take(next=>!next.startsWith('```')).join('\n'))}</pre>`);
   index++;
  }
  else if(line.startsWith('### ')){html.push(`<h4>${inline(line.slice(4))}</h4>`);index++;}
  else if(line.startsWith('## ')){const id=headingIds[heading++];html.push(`<h3${id?` id="manual-${e(id)}"`:''}>${inline(line.slice(3))}</h3>`);index++;}
  else if(line.startsWith('|'))html.push(table(take(next=>next.startsWith('|'))));
  else if(line.startsWith('>'))html.push(`<blockquote><p>${inline(take(next=>next.startsWith('>')).map(next=>next.replace(/^>\s?/,'')).join(' '))}</p></blockquote>`);
  else if(item.test(line)){
   const ordered=/^\d/.test(line),items=[];
   // An indented line carries on the item above it.
   for(const next of take(next=>item.test(next)||/^\s+\S/.test(next)))item.test(next)?items.push(next.replace(item,'')):items[items.length-1]+=` ${next.trim()}`;
   html.push(`<${ordered?'ol':'ul'}>${items.map(text=>`<li>${inline(text)}</li>`).join('')}</${ordered?'ol':'ul'}>`);
  }
  else html.push(`<p>${inline(take(next=>next.trim()&&!/^(#{2,3} |\||>|```)/.test(next)&&!item.test(next)).join(' '))}</p>`);
 }
 return html.join('');
}
