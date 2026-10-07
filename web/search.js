import {api,escape as e,toast,position,kitDot,nationFlag,nationBadge,competitionBadge} from './ui.js';

// The search of the whole game (docs/ui.md, « Recherche globale »): a dialog opened from the top bar or by Ctrl K, which
// leads to the page of a player, a club, a competition or a national team. The server finds and ranks (/api/recherche);
// the lines here only show what it found.
const SHORTEST=2,DELAY=120;

// Where a line leads.
export function resultHref(item){
 if(item.kind==='player')return `#/player/${item.id}`;
 if(item.kind==='club')return `#/club/${item.id}`;
 if(item.kind==='nation')return `#/international/nation/${item.id}`;
 return item.competition.kind==='europe'?`#/europe/${item.competition.code}`:`#/league/${item.id}`;
}
// A name with the letters typed set out: `marks` lists them as [start, end) runs of its characters.
export function markedName(name,marks=[]){
 const letters=[...name],cut=(from,to)=>e(letters.slice(from,to).join(''));
 let html='',at=0;
 for(const [start,end] of marks){html+=`${cut(at,start)}<b>${cut(start,end)}</b>`;at=end;}
 return html+cut(at);
}
// What tells a line's kind, in the column that starts every line: a player's position, a club's colours, a competition's
// badge, a national team's flag.
const badge=item=>item.kind==='player'?(item.position?position(item.position):''):item.kind==='club'?kitDot(item)
 :item.kind==='nation'?nationFlag(item.nation):competitionBadge(item.competition);
// What tells a line from its namesakes, at its end: a player's club, a club's country and division, a competition's country.
function context(item){
 if(item.kind==='player')return item.retired?'Retraité':item.club?`${kitDot(item.club)}${e(item.club.name)}`:'Libre';
 if(item.kind==='club')return `${nationFlag(item.nation)}${item.competition?competitionBadge(item.competition):''}`;
 return item.kind==='competition'&&item.competition.kind!=='europe'?nationBadge(item.competition.nation,{full:true}):'';
}
// A line opens its page as a whole; `chosen` is the one Enter opens.
export const resultRow=(item,chosen=false)=>`<a class="result${chosen?' chosen':''}" href="${resultHref(item)}"${chosen?' aria-current="true"':''}><span>${badge(item)}</span><span>${markedName(item.name,item.marks)}</span><span>${context(item)}</span></a>`;
export const resultsHtml=(items,chosen=0)=>items.length?items.map((item,index)=>resultRow(item,index===chosen)).join(''):'<p>Aucun résultat</p>';
// The line an arrow moves to: it stops at both ends of the list.
export const step=(index,count,key)=>Math.max(0,Math.min(count-1,index+(key==='ArrowDown'?1:-1)));

// Wires the dialog of index.html. `available()` says whether there is a game to search: the button shows only then, and
// the shortcut does nothing otherwise. Returns what redraws the button after each change of state.
export function initSearch(available){
 const dialog=document.querySelector('#search'),input=dialog.querySelector('input'),list=dialog.querySelector('.results');
 const opener=document.querySelector('#search-open'),types=[...dialog.querySelectorAll('[data-search-type]')];
 let items=[],chosen=0,type='',version=0,timer;
 const draw=()=>{list.innerHTML=input.value.trim().length<SHORTEST?'':resultsHtml(items,chosen);};
 const pick=value=>{type=value;types.forEach(button=>{const on=button.dataset.searchType===type;button.classList.toggle('active',on);button.setAttribute('aria-pressed',String(on));});};
 async function find(){
  const asked=++version,query=input.value.trim();
  if(query.length<SHORTEST){items=[];draw();return;}
  try{
   const data=await api(`/recherche?${new URLSearchParams({q:query,...(type?{type}:{})})}`);
   if(asked!==version)return;
   items=data.items;chosen=0;draw();
  }catch(error){if(asked===version)toast(error.message,true);}
 }
 const close=()=>{if(dialog.open)dialog.close();};
 function open(){
  if(dialog.open||!available())return;
  input.value='';items=[];pick('');draw();
  dialog.showModal();input.focus();
 }
 opener.addEventListener('click',open);
 document.addEventListener('keydown',event=>{
  if(event.key?.toLowerCase()!=='k'||!(event.ctrlKey||event.metaKey)||event.altKey||event.shiftKey)return;
  // Without a game to search, the shortcut is left to the browser.
  if(!dialog.open&&!available())return;
  event.preventDefault();
  if(dialog.open)close();else open();
 });
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(find,DELAY);});
 input.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();
   if(!items.length)return;
   chosen=step(chosen,items.length,event.key);draw();
  }else if(event.key==='Enter'){
   event.preventDefault();
   if(items[chosen]){location.hash=resultHref(items[chosen]);close();}
  }else if(event.key==='Escape'){
   // A search field keeps Escape for itself, to empty what is typed: here it closes the dialog at once.
   event.preventDefault();close();
  }
 });
 types.forEach(button=>button.addEventListener('click',()=>{pick(button.dataset.searchType);clearTimeout(timer);find();input.focus();}));
 // A line clicked opens its page, a click on the veil opens nothing: both close the dialog. So does any other move to a page.
 dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('a.result'))close();});
 dialog.addEventListener('close',()=>{version++;clearTimeout(timer);});
 window.addEventListener('hashchange',close);
 return ()=>{opener.hidden=!available();if(!available())close();};
}
