// Clubs and Joueurs reopen as they were left: their filters and sort are remembered, not the page. A plain address
// (no '?', as in the sidebar) restores them; an address with a query, even empty as after a reset, replaces them.
const KEY='touchline-filters',SCREENS=['clubs','players'],VIEW=['tri','ordre','vue','page'];

// Storage can be missing or refuse access: the filters then live as long as the page.
let memory={};
function read(){try{return JSON.parse(localStorage.getItem(KEY))||memory;}catch{return memory;}}
function write(saved){memory=saved;try{localStorage.setItem(KEY,JSON.stringify(saved));}catch{}}

// The address to show for `hash`: itself, or the screen with its remembered filters.
export function rememberFilters(hash){
 const mark=hash.indexOf('?'),path=mark<0?hash:hash.slice(0,mark),screen=path.replace(/^#\/?/,'');
 if(!SCREENS.includes(screen))return hash;
 const saved=read();
 if(mark<0)return saved[screen]?`${path}?${saved[screen]}`:hash;
 const params=new URLSearchParams(hash.slice(mark+1));
 params.delete('page');
 write({...saved,[screen]:params.toString()});
 return hash;
}

export const hasFilters=params=>[...params.keys()].some(key=>!VIEW.includes(key));
// The sort chosen in the table headers and the columns shown: a new filter and a reset keep them.
export const viewParams=params=>new URLSearchParams([...params].filter(([key])=>key!=='page'&&VIEW.includes(key)));
export const resetButton=params=>`<button type="button" data-reset-filters ${hasFilters(params)?'':'disabled'}>Réinitialiser</button>`;
