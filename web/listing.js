// What the list screens share (Joueurs, Clubs, Mercato mondial): a list fitted to the window, a side panel on a wide
// screen, and filters that are links (chips, switches) or fields folded in a menu.
import {escape as e,number as n,group,nationFlag,nationName} from './ui.js';

// A row of a list with its border, until the screen has measured its own.
const ROW=27;
// Under the last row: the card's border and the page's bottom padding.
const BELOW=13;
const rowsWithin=(height,row=ROW)=>Math.max(10,Math.min(100,Math.floor(height/row)));
// The rows each list could show the last time it was drawn.
const fitted={};

// The side panel (a preview, the season's summary) stands beside the list from the width where the list still shows all its
// columns: a full HD window. The style sheet hides it under the same width.
const WIDE=1880;
export const wideScreen=()=>typeof window!=='undefined'&&window.innerWidth>=WIDE;

// How many rows the list `screen` asks the server for: what the window showed last time, else an estimate from the height
// `above` its first row. Null outside a browser: the server then keeps its own page size.
export function fittedRows(screen, above){
 if(typeof window==='undefined')return null;
 return fitted[screen]??rowsWithin(window.innerHeight-above-BELOW);
}

// Once drawn, a list ([data-fit], asked for [data-rows] rows) fills the window down to its bottom and measures the rows that
// fit under its header. True when that differs from what it asked for: the screen is then drawn again.
export function refit(element){
 const top=element.getBoundingClientRect().top+window.scrollY,body=element.querySelector('tbody'),row=body?.rows[0];
 element.style.minHeight=`${Math.max(0,window.innerHeight-top-BELOW+1)}px`;
 if(!row)return false;
 const height=row.getBoundingClientRect().height;
 if(!height)return false;
 const rows=rowsWithin(window.innerHeight-(body.getBoundingClientRect().top+window.scrollY)-BELOW,height);
 fitted[element.dataset.fit]=rows;
 return rows!==Number(element.dataset.rows);
}

// The panel beside a list: it takes the list's height and scrolls within it, so that it never makes the page taller.
// `kind` names what it previews ('player', 'club'), for the rows of the list to refresh it; '' for a panel that follows no row.
export const sidePanel=(kind,html)=>`<aside class="side"${kind?` data-preview="${kind}"`:''}><div class="side-inner">${html}</div></aside>`;

// The list `base` with `changes` applied to its filters (an empty value removes one), back on its first page.
export function listHref(base, params, changes){
 const next=new URLSearchParams(params);
 ['page','sel'].forEach(key=>next.delete(key));
 Object.entries(changes).forEach(([key,value])=>{if(value==null||value==='')next.delete(key);else next.set(key,value);});
 // Escaped: every use of it is an attribute.
 return e(`${base}?${next}`);
}
// A filter set by links still belongs to the form: its field carries it through the next change of another filter.
const kept=(params,key)=>params.get(key)?`<input type="hidden" name="${key}" value="${e(params.get(key))}">`:'';

export const searchField=(params,placeholder)=>`<input name="recherche" type="search" value="${e(params.get('recherche'))}" placeholder="${e(placeholder)}" aria-label="${e(placeholder)}">`;

const POSITIONS=[['GB'],['DC','DG','DD'],['MDC','MC','MOC'],['AILG','AILD','BU']];
// One chip per position, by line; each adds its position to the list or takes it off.
export function positionChips(base, params){
 const chosen=(params.get('poste')||'').split(',').filter(Boolean);
 const toggled=role=>POSITIONS.flat().filter(item=>item===role?!chosen.includes(item):chosen.includes(item)).join(',');
 const chip=role=>`<a class="chip ${group(role)}${chosen.includes(role)?' on':''}" href="${listHref(base,params,{poste:toggled(role)})}"${chosen.includes(role)?' aria-current="true"':''}>${role}</a>`;
 return `<div class="chips" role="group" aria-label="Postes">${POSITIONS.map(line=>`<span>${line.map(chip).join('')}</span>`).join('')}</div>${kept(params,'poste')}`;
}

// A chip per nation, flag and name; the chosen one takes its filter off. `field` false when a list of the form carries the value.
export function nationChips(base, params, codes, field=true){
 const chip=code=>{const on=params.get('pays')===code;return `<a class="chip nation-chip${on?' on':''}" href="${listHref(base,params,{pays:on?'':code})}"${on?' aria-current="true"':''}>${nationFlag(code)}${e(nationName(code))}</a>`;};
 return `<div class="chips" role="group" aria-label="Pays"><span>${codes.map(chip).join('')}</span></div>${field?kept(params,'pays'):''}`;
}

// A choice among a few, the first one for none: [value, label] each.
export function choiceLinks(base, params, key, items, label){
 const current=params.get(key)||'';
 return `<div class="segmented" role="group" aria-label="${e(label)}">${items.map(([value,text])=>`<a class="${value===current?'active':''}" href="${listHref(base,params,{[key]:value})}"${value===current?' aria-current="true"':''}>${text}</a>`).join('')}</div>${kept(params,key)}`;
}

// A filter that is on or off.
export function toggleLink(base, params, key, value, label){
 const on=params.get(key)===String(value);
 return `<a class="chip toggle${on?' on':''}" href="${listHref(base,params,{[key]:on?'':value})}"${on?' aria-current="true"':''}>${e(label)}</a>${kept(params,key)}`;
}

// How a range reads on its button: "18–23", "≥ 180", "≤ 50 M€".
function rangeReading(low, high, unit){
 const figure=value=>n(Number(value)),suffix=unit?` ${unit}`:'';
 return low&&high?`${figure(low)}–${figure(high)}${suffix}`:low?`≥ ${figure(low)}${suffix}`:`≤ ${figure(high)}${suffix}`;
}

// A range folded behind a button. `fields` are its bounds, [name, 'min' | 'max', attributes of the input]; `presets`
// are ranges set in one click, [label, {name: value}]. Set, the button reads the range and a cross takes it off.
export function rangeMenu(base, params, label, fields, {unit='',hint='',presets=[]}={}){
 const value=name=>params.get(name)||'';
 const low=fields.find(([,bound])=>bound==='min'),high=fields.find(([,bound])=>bound==='max');
 const on=fields.some(([name])=>value(name));
 const cleared=Object.fromEntries(fields.map(([name])=>[name,'']));
 const field=([name,bound,attributes=''])=>`<label>${bound==='min'?'Min.':'Max.'}${hint?` (${hint})`:''} <input name="${name}" type="number" ${attributes} value="${e(value(name))}"></label>`;
 const preset=([text,values])=>{const set=fields.every(([name])=>value(name)===String(values[name]??''));return `<a class="${set?'on':''}" href="${listHref(base,params,{...cleared,...values})}">${text}</a>`;};
 const reading=on?` <b>${rangeReading(low&&value(low[0]),high&&value(high[0]),unit)}</b><a class="clear" href="${listHref(base,params,cleared)}" aria-label="Retirer le filtre ${e(label)}" title="Retirer le filtre">×</a>`:'';
 return `<details class="filter-menu${on?' on':''}"><summary>${e(label)}${reading}</summary><div class="filter-panel"><div class="filter-fields">${fields.map(field).join('')}</div>${presets.length?`<div class="presets">${presets.map(preset).join('')}</div>`:''}</div></details>`;
}

// A list of the form as a select, marked when it filters: `items` are [value, label], the first option reads `label`.
export const choiceSelect=(params,key,label,items)=>`<select name="${key}" aria-label="${label}"${params.get(key)?' class="on"':''}><option value="">${label}</option>${items.map(([id,name])=>`<option value="${id}" ${params.get(key)===String(id)?'selected':''}>${name}</option>`).join('')}</select>`;
