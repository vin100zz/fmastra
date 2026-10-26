// The width of a table (« Tableaux » in the charter): each column as wide as what it holds at most; a name, which has no
// width of its own, from its least (its heading's min-width) up to its longest, --w-name at most; what the table still has
// left over shared equally between the gaps of its columns, so that no two columns stand closer than two others.

// How a table of `width` shares out, its columns measured as {width, padding, flexible, least, most}: the name columns
// stand at their most when there is room for them, and each gap between two columns then gains `extra` (whole pixels); a
// name with less room than its least is held there (`least`), and the table scrolls. Otherwise the names take what remains.
export function shareWidth(width, columns){
 const names=columns.filter(column=>column.flexible);
 const room=width-columns.reduce((sum,column)=>sum+(column.flexible?column.padding:column.width),0);
 if(room>=names.reduce((sum,column)=>sum+column.most,0))
  return {extra:columns.length<2?0:Math.floor((room-names.reduce((sum,column)=>sum+column.most,0))/(columns.length-1)),least:false};
 const least=names.reduce((sum,column)=>sum+column.least,0);
 return {extra:0,least:least>0&&room<least};
}

// Each cell with the columns it spans, [cell, first, last], through the rows and columns other cells span.
export function cellColumns(rows){
 const taken=[],cells=[];
 rows.forEach((row,y)=>{
  let x=0;
  for(const cell of row.cells){
   while(taken[y]?.[x])x++;
   const last=x+Math.max(1,cell.colSpan)-1;
   for(let down=y;down<y+Math.max(1,cell.rowSpan);down++)for(let across=x;across<=last;across++)(taken[down]??=[])[across]=true;
   cells.push([cell,x,last]);
   x=last+1;
  }
 });
 return cells;
}

// Measures a table and shares out its width. A table of fixed layout is measured at no width, where each column keeps the
// width the sheets give it and a name column, which has none, stands at nothing; any other, at the width of its content.
// A name goes up to its longest, measured at the width of the content too, unless the table is a page of a longer list
// (its card steps through pages): another page or a sort then brings other names, and it keeps --w-name so that no
// column moves. The columns are then held at their
// width with their share of the gaps, their cells' margins widened by as much.
export function spreadColumns(table){
 const cells=cellColumns([...table.rows]),count=Math.max(0,...cells.map(([,,last])=>last+1));
 // Back to what the sheets give.
 for(const [cell] of cells){cell.style.removeProperty('padding-left');cell.style.removeProperty('padding-right');}
 let group=table.querySelector(':scope>colgroup');
 group?.querySelectorAll('col').forEach(col=>col.style.removeProperty('width'));
 // A table lined up with another (`.aligned`) keeps the widths the sheets give it, the same in both: no share of the gaps.
 if(table.classList.contains('aligned'))return;
 const width=table.getBoundingClientRect().width;
 if(!width||count<2)return;
 const fixed=getComputedStyle(table).tableLayout==='fixed';
 table.style.setProperty('width',fixed?'0px':'max-content','important');
 table.style.setProperty('min-width','0px','important');
 const single=cells.filter(([,first,last])=>first===last);
 const columns=Array.from({length:count},(_,index)=>{
  const cell=single.find(([,first])=>first===index)?.[0];
  if(!cell)return null;
  const style=getComputedStyle(cell),measured=cell.getBoundingClientRect().width;
  return {cell,width:measured,padding:parseFloat(style.paddingLeft)+parseFloat(style.paddingRight),flexible:fixed&&measured<.5,least:parseFloat(style.minWidth)||0};
 });
 const most=parseFloat(getComputedStyle(table).getPropertyValue('--w-name'))||0;
 for(const column of columns)if(column)column.most=most;
 if(columns.some(column=>column?.flexible)&&!table.closest('.card')?.querySelector('button[data-page]')){
  table.style.setProperty('table-layout','auto','important');
  table.style.setProperty('width','max-content','important');
  for(const column of columns)if(column?.flexible)column.most=Math.min(most,Math.max(column.least,column.cell.getBoundingClientRect().width-column.padding));
  table.style.removeProperty('table-layout');
 }
 table.style.removeProperty('width');
 table.style.removeProperty('min-width');
 if(columns.includes(null))return;
 const {extra,least}=shareWidth(width,columns);
 if(!extra&&!least)return;
 const share=index=>(index>0?extra/2:0)+(index<count-1?extra/2:0);
 // A fixed layout takes its widths from <col>: a table that has none is given them, one per column.
 if(fixed){
  if(group?.querySelectorAll('col').length!==count){group?.remove();group=document.createElement('colgroup');group.append(...columns.map(()=>document.createElement('col')));table.prepend(group);}
  group.querySelectorAll('col').forEach((col,index)=>{
   const column=columns[index];
   if(!column.flexible)col.style.width=`${column.width+share(index)}px`;
   else if(least)col.style.width=`${column.least+column.padding}px`;
  });
 }
 if(!extra)return;
 const margins=cells.map(([cell,first,last])=>{const style=getComputedStyle(cell);return [cell,parseFloat(style.paddingLeft)+(first>0?extra/2:0),parseFloat(style.paddingRight)+(last<count-1?extra/2:0)];});
 for(const [cell,left,right] of margins){cell.style.setProperty('padding-left',`${left}px`,'important');cell.style.setProperty('padding-right',`${right}px`,'important');}
}

// Every table of `root`, from the moment it is drawn or its rows change, spread again when the box it stands in changes
// width (the window, a card that opens) and once the fonts are in.
export function initColumns(root){
 // Both observers report before the page is painted: a table is never seen before it is spread.
 const waiting=new Set(),widths=new WeakMap(),boxOf=new WeakMap();
 const queue=table=>waiting.add(table);
 const run=()=>{for(const table of waiting)if(table.isConnected)spreadColumns(table);waiting.clear();};
 const boxes=new ResizeObserver(entries=>{
  for(const {target,contentRect} of entries){
   if(widths.get(target)===contentRect.width)continue;
   widths.set(target,contentRect.width);
   target.querySelectorAll(':scope>table').forEach(queue);
  }
  run();
 });
 const watch=table=>{const box=table.parentElement;if(box){boxOf.set(table,box);boxes.observe(box);}queue(table);};
 const tables=node=>node.nodeType!==1?[]:node.matches('table')?[node]:[...node.querySelectorAll('table')];
 new MutationObserver(records=>{
  for(const record of records){
   for(const node of record.removedNodes)for(const table of tables(node))if(boxOf.has(table))boxes.unobserve(boxOf.get(table));
   for(const node of record.addedNodes)tables(node).forEach(watch);
   // Rows written again in a table that stays; not the columns this module gives a table.
   const owner=record.target.closest?.('table');
   if(owner&&![...record.addedNodes].every(node=>node.nodeName==='COLGROUP'))queue(owner);
  }
  run();
 }).observe(root,{childList:true,subtree:true});
 tables(root).forEach(watch);
 run();
 document.fonts?.ready.then(()=>{tables(root).forEach(queue);run();});
}
