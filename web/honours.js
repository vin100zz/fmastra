import {api,escape as e,season,number as n,clubLink,playerLink,position,kitDot,nationFlag,empty,card,table,figure,miniBar,headPager} from './ui.js';
import {LEAGUE_ORDER} from './screens.js';
import {searchField} from './listing.js';

const rank=nation=>LEAGUE_ORDER.includes(nation)?LEAGUE_ORDER.indexOf(nation):LEAGUE_ORDER.length;
// Divisions and national cups open on their history tab; a European cup on the tab of its own screen.
const link=competition=>competition.kind==='europe'?`#/europe/${competition.code}/history`:`#/league/${competition.id}/history`;
const fold=text=>String(text??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
// What a competition is, before its name: C1, D2, CP.
const tag=competition=>competition.kind==='europe'?['europe',competition.code]:competition.kind==='cup'?['cup','CP']:['league',`D${competition.level}`];
// The titles a ranking counts: [key of the row, heading, its name in full].
const KINDS=[['europe','EUR','Coupes d’Europe'],['league','D1','Championnats de première division'],['cup','CP','Coupes nationales'],['lower','D2+','Championnats des divisions inférieures']];
const kindHeaders=KINDS.map(([,label,title])=>`<span title="${title}">${label}</span>`),kindClasses=KINDS.map(()=>'count-column');
const kindCells=row=>KINDS.map(([key])=>figure(row[key]||''));
const total=(value,most)=>`<span class="bar-figure">${miniBar(value/most)}<b>${n(value)}</b></span>`;

// The past seasons the table shows at once, beside the one under way: what the window leaves once the menu, the titled clubs
// (beside the table from WIDE, see theme.css) and the first three columns are taken off. Six outside a browser.
const WIDE=1500,FIRST_COLUMNS=476,SEASON_COLUMN=150;
function seasonsShown(){
 if(typeof window==='undefined')return 6;
 const width=window.innerWidth-(window.innerWidth>950?216:0)-32-(window.innerWidth>=WIDE?408:0)-FIRST_COLUMNS;
 return Math.max(1,Math.floor(width/SEASON_COLUMN)-1);
}

// One row per competition, by group (the European cups, then each country), one column per season: the one under way first
// (its champion once known, else the leader of a league or the round that comes next), then the past ones, latest first.
function matrix(data,groups,params){
 const blocks=groups.flatMap(group=>group.competitions),picked=params.get('sel');
 const past=[...new Set(blocks.flatMap(block=>block.items.map(item=>item.season)))].filter(year=>year!==data.season).sort((a,b)=>b-a);
 const size=seasonsShown(),page=Math.min(Math.max(1,Math.ceil(past.length/size)),Math.max(1,Number(params.get('page'))||1));
 const shown=past.slice((page-1)*size,page*size);
 const champion=(block,year,className='')=>{
  const club=block.items.find(item=>item.season===year)?.champion;
  return club?`<td class="${`${className}${String(club.id)===picked?' picked':''}`.trim()}" data-honours-club="${club.id}"><span class="strong">${clubLink(club)}</span></td>`:null;
 };
 const stage=block=>!block.current?'—':block.current.leader?`<span class="honours-pair">${clubLink(block.current.leader)}<small>J${block.current.round}</small></span>`:e(block.current.label);
 const scorer=block=>block.scorer?`<span class="honours-pair">${playerLink(block.scorer.player_id,block.scorer.player)}<b>${n(block.scorer.goals)}</b></span>`:'—';
 const row=(group,block,index)=>{
  const [kind,label]=tag(block);
  return `<tr>${index?'':`<td class="honours-nation" rowspan="${group.competitions.length}"><a href="${group.href}">${group.flag}${e(group.name)}</a></td>`}<td><a href="${link(block)}"><span class="honours-tag ${kind}">${e(label)}</span><span class="strong">${e(block.name)}</span></a></td><td>${scorer(block)}</td>${champion(block,data.season,'current')||`<td class="current">${stage(block)}</td>`}${shown.map(year=>champion(block,year)||'<td>—</td>').join('')}</tr>`;
 };
 const head=`<tr><th class="nation-column"></th><th class="competition-column">COMPÉTITION</th><th class="scorer-column">MEILLEUR BUTEUR</th><th class="current">${season(data.season)}<span class="honours-live">EN COURS</span></th>${shown.map(year=>`<th>${season(year)}</th>`).join('')}</tr>`;
 const title=`${n(blocks.length)} compétition${blocks.length>1?'s':''}${past.length?` · ${n(past.length)} saison${past.length>1?'s':''}`:''}`;
 return card(title,`<div class="table-scroll"><table style="min-width:${FIRST_COLUMNS+(shown.length+1)*130}px"><thead>${head}</thead>${groups.map(group=>`<tbody>${group.competitions.map((block,index)=>row(group,block,index)).join('')}</tbody>`).join('')}</table></div>`,headPager({total:past.length,page,page_size:size}),'honours-matrix');
}

// The clubs by titles won; a search keeps those whose name holds it, with the rank they have among all.
function board(data,params){
 const search=fold(params.get('recherche')).trim(),picked=params.get('sel'),most=data.clubs[0]?.total||1;
 const clubs=data.clubs.map((row,index)=>({...row,rank:index+1})).filter(row=>!search||fold(row.club.name).includes(search));
 const content=!data.clubs.length?empty('Le premier vainqueur sera connu à la fin de la saison.','Pas encore de palmarès')
  :!clubs.length?empty('Aucun club titré ne porte ce nom.','Aucun résultat')
  :table(['#','CLUB',...kindHeaders,'TOTAL'],clubs.map(row=>[figure(row.rank),`${nationFlag(row.nation)}<span class="strong">${clubLink(row.club)}</span>`,...kindCells(row),total(row.total,most)]),undefined,
   clubs.map(row=>String(row.club.id)===picked?'picked':''),undefined,['rank-column','',...kindClasses,'total-column'],undefined,clubs.map(row=>`data-honours-club="${row.club.id}"`));
 return card(`${n(data.clubs.length)} club${data.clubs.length>1?'s':''} titré${data.clubs.length>1?'s':''}`,content,'','honours-table');
}

// The players by titles won with their clubs, by seasons ended as the leading scorer of a competition, and the European cups
// by country of their winners; a ranking without a row yet is left out.
function lists(data){
 // The club a player is at now goes by its kit before his name, named in its tooltip: the names keep the width.
 const club=row=>row.club?`<span title="${e(row.club.name)}">${kitDot(row.club)}</span>`:'';
 const players=data.players.length?card('Joueurs les plus titrés',table(['','JOUEUR',...kindHeaders,'TOTAL'],data.players.map(row=>[row.position?position(row.position):'',`${club(row)}<span class="strong">${playerLink(row.player_id,row.player)}</span>`,...kindCells(row),figure(`<b>${n(row.total)}</b>`)]),undefined,undefined,undefined,['position-column','',...kindClasses,'sum-column']),'','honours-table'):'';
 const where=row=>e(row.competitions.map(item=>`${item.code||item.name}${item.titles>1?` ×${item.titles}`:''}`).join(' · '));
 const scorers=data.scorers.length?card('Titres de meilleur buteur',table(['JOUEUR','COMPÉTITIONS','TITRES','BUTS'],data.scorers.map(row=>[`<span class="strong">${playerLink(row.player_id,row.player)}</span>`,`<span class="honours-where" title="${where(row)}">${where(row)}</span>`,figure(`<b>${n(row.titles)}</b>`),figure(n(row.goals))]),undefined,undefined,undefined,['','competitions-column','count-column titles-column','count-column goals-column']),'','honours-table'):'';
 const most=data.nations[0]?.total||1;
 const nations=data.nations.length?card('Coupes d’Europe par pays',table(['PAYS',...data.europe.map(block=>e(block.code)),'TOTAL'],data.nations.map(row=>[`<span class="strong">${nationFlag(row.code)}${e(row.name)}</span>`,...row.titles.map(count=>figure(count||'')),total(row.total,most)]),undefined,undefined,undefined,['',...data.europe.map(()=>'count-column'),'total-column']),'','honours-table'):'';
 return [players,scorers,nations].filter(Boolean).join('');
}

// A club picked in the list of titled clubs, or in the table, lights its titles up in the table and its row in the list;
// picked again, it lets go. Returns the club now picked, null for none.
export function pickClub(root,id){
 const marked=[...root.querySelectorAll('[data-honours-club]')];
 const on=!marked.some(element=>element.dataset.honoursClub===String(id)&&element.classList.contains('picked'));
 marked.forEach(element=>element.classList.toggle('picked',on&&element.dataset.honoursClub===String(id)));
 return on?String(id):null;
}

export async function honoursScreen(params=new URLSearchParams()){
 const data=await api('/monde/palmares');
 const countries=[...data.countries].sort((a,b)=>rank(a.code)-rank(b.code)||a.code.localeCompare(b.code));
 const groups=[...(data.europe.length?[{name:'Europe',href:'#/europe',flag:'',competitions:data.europe}]:[]),
  ...countries.map(country=>({name:country.name,href:`#/country/${country.code}`,flag:nationFlag(country.code),competitions:country.competitions}))];
 const rankings=lists(data);
 return `<form class="toolbar" data-filter><h1>Palmarès</h1>${searchField(params,'Rechercher un club…')}</form><div class="honours"><div class="honours-main">${matrix(data,groups,params)}${rankings?`<div class="honours-lists">${rankings}</div>`:''}</div><div class="honours-board">${board(data,params)}</div></div>`;
}
