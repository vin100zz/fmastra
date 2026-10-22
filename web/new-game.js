// The screen of a new game (docs/charte-graphique.md, « Nouvelle partie »): the world on the left, a line per nation with
// the divisions it plays, the clubs of that world in the middle, the club picked on the right. Every choice is in the
// address: `nations` (FRA:3,ENG:2, the divisions each nation plays down to), the filters, sort and page of the list, `club`.
import {api,escape as e,number as n,money,query,table,sortButton,headPager,figure,levelBadge,level,levelHue,position,kitDot,nationFlag,nationName,setNations,fact,facilityRating,competitionBadge} from './ui.js';
import {monthlyAmount} from './salaries.js';
import {searchField,nationChips,fittedRows} from './listing.js';
import {creationHero} from './club-hero.js';

const BASE='#/nouvelle-partie';
const TICK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
// What stands above the first row of the list: the bar, the title line, the card's head and the table's.
const LIST_ABOVE=155;
// Names and leagues run from the smallest.
const ASCENDING=['nom','championnat'];

let catalogue=null;
// The nations a game can play, their divisions and the first day of a game: read once, they do not change.
export const creationData=async()=>catalogue??=await api('/creation');

// The divisions each nation plays down to, from the address (`FRA:3,ENG:2`), else those the game plays by default.
export function chosenLevels(params,nations){
 const text=params.get('nations');
 if(text==null)return Object.fromEntries(nations.filter(nation=>nation.default).map(nation=>[nation.code,nation.default]));
 const asked=Object.fromEntries(text.split(',').map(item=>item.split(':')));
 return Object.fromEntries(nations.flatMap(nation=>{const depth=Number(asked[nation.code]);return depth>=1&&depth<=nation.divisions.length?[[nation.code,depth]]:[];}));
}
// The choice written back, in the order of the nations.
const levelsText=(levels,nations)=>nations.filter(nation=>levels[nation.code]).map(nation=>`${nation.code}:${levels[nation.code]}`).join(',');

// What the screen holds, for the bar above it: the divisions played, the club picked, the first day of the game.
let choice=null;
export const creationChoice=()=>choice;
export const leaveCreation=()=>{choice=null;};

// A nation on its line: the box that plays it (the only one played cannot be left out), its flag and name, its divisions as
// a choice up to one (a click makes one the lowest played, and plays its nation), its clubs.
function nationLine(nation,levels,nations){
 const depth=levels[nation.code]||0,clubs=nation.divisions.slice(0,depth).reduce((sum,division)=>sum+division.clubs,0);
 const without=Object.fromEntries(Object.entries(levels).filter(([code])=>code!==nation.code));
 const only=depth&&!Object.keys(without).length;
 const box=`<button type="button" class="check" aria-pressed="${depth>0}" aria-label="${e(nation.name)}" data-param="nations" data-param-value="${e(levelsText(depth?without:{...levels,[nation.code]:nation.default||nation.divisions.length},nations))}"${only?' disabled':''}>${TICK}</button>`;
 const division=item=>`<button type="button"${item.level<=depth?' class="active"':''} title="${e(`${item.name} · ${item.clubs} clubs`)}" data-param="nations" data-param-value="${e(levelsText({...levels,[nation.code]:item.level},nations))}">${e(code(nation.code,item.level))}</button>`;
 return `<div class="nation-line${depth?'':' off'}">${box}<span class="nation">${nationFlag(nation.code,{link:false})}${e(nation.name)}</span>`
  +`<div class="segmented small range" role="group" aria-label="Divisions">${nation.divisions.map(division).join('')}</div><span class="num">${depth?n(clubs):'—'}</span></div>`;
}
const code=(nation,depth)=>`${nation==='FRA'?'L':'D'}${depth}`;
const league=club=>`<span class="cell">${club.nation_code==='FRA'?'':nationFlag(club.nation_code,{link:false})}${competitionBadge({name:club.competition,kind:'league',nation:club.nation_code,level:club.level},{link:false})}${e(club.competition)}</span>`;

// The club picked: its band, then its figures, its facts and the players its level is the mean of.
function clubCards(club){
 if(!club)return '<section class="card"><div class="card-head"><h2>Club</h2></div><div class="empty"><strong>Aucun club choisi</strong></div></section>';
 const tile=(label,value,hue=null)=>`<div class="tile${hue==null?'':' graded'}"${hue==null?'':` style="--hue:${hue}"`}><span>${label}</span><strong>${value}</strong></div>`;
 const graded=(label,value)=>value==null?tile(label,'—'):tile(label,level(value),levelHue(level(value)));
 const squad=table(['POSTE','JOUEUR','ÂGE','NIVEAU','POTENTIEL'],club.squad.map(player=>[position(player.position),`<span class="strong">${e(player.name)}</span>`,figure(player.age),levelBadge(player.rating),levelBadge(player.potential)]));
 return `<section class="card">${creationHero(club)}<div class="rail-tiles">${tile('Réputation',n(club.reputation))}${graded('Niveau',club.top_rating)}${graded('Potentiel',club.top_potential)}${tile('Plafond salarial',money(monthlyAmount(club.wage_cap)))}</div>`
  +`<div class="card-body">${fact('Stade',club.capacity?`${n(club.capacity)} places`:'—')}${fact('Entraînement',facilityRating(club.training_facilities))}${fact('Recrutement des jeunes',facilityRating(club.youth_recruitment))}</div></section>`
  +`<section class="card"><div class="card-head"><h2>Effectif</h2></div>${squad}</section>`;
}

export async function newGameScreen(params){
 const data=await creationData();
 // Without a game the page knows no country yet: those of a new game are enough here.
 if(data.nations.some(nation=>nationName(nation.code)===nation.code))setNations(data.flags);
 const levels=chosenLevels(params,data.nations),nations=levelsText(levels,data.nations),values=Object.fromEntries(params);
 delete values.club;
 const rows=fittedRows('creation',LIST_ABOVE),wanted=Number(params.get('club'));
 const [list,picked]=await Promise.all([api(`/creation/clubs?${query({...values,nations,taille:rows})}`),wanted?api(`/creation/clubs/${wanted}`).catch(()=>null):null]);
 // A club out of the divisions now played is no longer picked.
 const club=picked&&picked.level<=(levels[picked.nation_code]||0)?picked:null;
 choice={levels,club,date:data.date,season:data.season};
 const played=data.nations.filter(nation=>levels[nation.code]).map(nation=>nation.code);
 const toolbar=`<form class="toolbar" data-filter><h1>Nouvelle partie</h1>${searchField(params,'Rechercher un club…')}${nationChips(BASE,params,played)}`
  +`<input type="hidden" name="nations" value="${e(nations)}">${club?`<input type="hidden" name="club" value="${club.id}">`:''}</form>`;
 const world=`<section class="card"><div class="card-head"><h2>Monde</h2><span class="muted">${n(list.clubs)} clubs</span></div><div>${data.nations.map(nation=>nationLine(nation,levels,data.nations)).join('')}</div></section>`;
 const sorted=values.tri||'reputation',order=values.ordre||(ASCENDING.includes(sorted)?'asc':'desc');
 const head=(key,label)=>sortButton(key,label,sorted,order,ASCENDING.includes(key)?'asc':'desc');
 const link=id=>e(`${BASE}?${query({...values,nations,club:id})}`);
 const cells=row=>[`<span class="strong">${kitDot(row)}<a href="${link(row.id)}">${e(row.name)}</a></span>`,league(row),figure(n(row.reputation)),levelBadge(row.top_rating),levelBadge(row.top_potential),figure(row.capacity?n(row.capacity):'—')];
 const columns=['nom','championnat','reputation','niveau','potentiel','stade'];
 const clubs=`<section class="card"><div class="card-head"><h2>${n(list.total)} clubs</h2>${headPager(list)}</div>`
  +`${table([head('nom','CLUB'),head('championnat','CHAMPIONNAT'),head('reputation','RÉPUTATION'),head('niveau','NIVEAU'),head('potentiel','POTENTIEL'),head('stade','STADE')],list.items.map(cells),undefined,
   list.items.map(row=>row.id===club?.id?'selected':''),undefined,columns.map(key=>`${key}-column`),undefined,list.items.map(row=>`data-href="${link(row.id)}"`))}</section>`;
 return toolbar+`<div class="new-game" data-fit="creation" data-rows="${rows??''}">${world}${clubs}<div class="new-game-club">${clubCards(club)}</div></div>`;
}
