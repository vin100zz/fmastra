import {nationLogoUrl} from './nation-logos.js';
import {escape as e,number as n,safeColor,contrastRatio,bandColours,legibleOn,initials,nationFlag,nationHref,nationCode,nationName,mainNationCode,flagUrl,clubLink,level,levelHue,date,money,price,competitionLink} from './ui.js';

const DARK_INK='#111418',LIGHT_INK='#ffffff',DARK_PANEL='#161b22';
const inkOn=background=>contrastRatio(background,DARK_INK)>=contrastRatio(background,LIGHT_INK)?DARK_INK:LIGHT_INK;
// The club colour that reads best on a surface, on the panel of either theme: the open tab is underlined with it and the
// arrows of the seasons are drawn in it. A colour too pale or too dark to be read there is brought to its tone in a chart.
const readableOn=(surface,major,minor)=>legibleOn(contrastRatio(major,surface)>=contrastRatio(minor,surface)?major:minor,surface);

// The band of a club's header, in its colours: the home colour fills it and the second one crosses it as a sash. A home colour
// close to white would melt into the page, so the second colour fills the band instead (`bandColours`, which a club's dot
// follows too); two colours alike leave a faint sash of the ink. Without colours the band keeps the panel's. A competition that stands on a ground of its own (`groundColor`:
// the night blue the European cups share, the black under the World Cup's gold) has it fill the band, and its colour
// cross it as the sash. The steps between peers, on the band, are drawn in that second colour where it reads on the band
// (a contrast of 3 at least), else in the ink; under the pointer they stand on a veil of the ink. Returns CSS custom
// properties for the header's style attribute.
const STEP_CONTRAST=3,VEIL='1f';
export function heroColors(majorColor,minorColor,groundColor){
 const major=safeColor(majorColor);
 if(!major)return '';
 const minor=safeColor(minorColor)||major,ground=safeColor(groundColor);
 const [first,second]=bandColours(major,minor);
 const field=ground||first,ink=inkOn(field);
 let sash=ground?major:second,opacity=1;
 const step=contrastRatio(field,sash)>=STEP_CONTRAST?sash:ink;
 if(contrastRatio(field,sash)<1.25){sash=ink;opacity=.12;}
 return [`--hero-field:${field}`,`--hero-ink:${ink}`,`--hero-sash:${sash}`,`--hero-sash-opacity:${opacity}`,`--hero-step:${step}`,`--hero-veil:${ink}${VEIL}`,
  ...[['light',LIGHT_INK],['dark',DARK_PANEL]].flatMap(([theme,surface])=>{const colour=readableOn(surface,major,minor);return colour?[`--hero-accent-${theme}:${colour}`]:[];}),
  `--crest-major:${major}`,`--crest-minor:${minor}`,`--crest-ink:${inkOn(major)}`].join(';');
}

// A figure of the header, with its label above it.
const tile=(label,value,extra='',title='')=>`<div class="club-hero-tile"${title?` title="${e(title)}"`:''}><span>${label}</span><strong>${value}${extra}</strong></div>`;
// A column of a tile of several figures, its label above it; `hue` grades its ground as the badge of that note.
const column=(label,value,title='',hue=null)=>`<div${hue==null?'':` class="graded" style="--hue:${hue}"`}${title?` title="${e(title)}"`:''}><span>${label}</span><strong>${value}</strong></div>`;
const split=columns=>`<div class="club-hero-tile split">${columns}</div>`;
const signed=value=>value>0?`+${n(value)}`:value<0?`−${n(-value)}`:'0';
// What fills the disc of a club: its initials, under its crest when the game has one. On a band the crest stands alone, the
// disc gone (web/charte.css); a crest that fails to load is taken away and the disc comes back (`initHeroCrests`).
const clubCrest=club=>`${initials(club.name)}<img class="crest-logo" src="/crests/TCM1_${club.id}.png" alt="" loading="lazy">`;

// A crest on a band takes the area of a square of 64 whatever its shape: the sheet reads its ratio (`--r`) off the picture
// once it is loaded; one that fails is removed, which brings the disc and its initials back. Captured on `root`: the
// application's CSP blocks inline handlers.
export function initHeroCrests(root){
 root.addEventListener('load',event=>{
  const img=event.target;
  if(img.matches?.('.club-hero-crest>.crest-logo')&&img.naturalHeight)img.style.setProperty('--r',(img.naturalWidth/img.naturalHeight).toFixed(3));
 },true);
 root.addEventListener('error',event=>{
  if(event.target.matches?.('.club-hero-crest>.crest-logo'))event.target.remove();
 },true);
}
// The page of a club, a selection, a player or a competition takes the colours of its band (« Page d'un club »): what
// fills an open choice, the ink written on it, and the colour that reads on a panel in each theme, which the sheet picks.
// A match has two bands and keeps the accent; a page without a band, or a band without colours, too.
const PAGE_COLOURS=[['--club-fill','--hero-field'],['--club-ink','--hero-ink'],['--club-light','--hero-accent-light'],['--club-dark','--hero-accent-dark']];
export function tintPage(main){
 const band=main.querySelector(':scope>.club-hero:not(.match-hero)'),colours=band?.style.getPropertyValue('--hero-field')?band.style:null;
 for(const [page,hero] of PAGE_COLOURS){const value=colours?.getPropertyValue(hero).trim();if(value)main.style.setProperty(page,value);else main.style.removeProperty(page);}
 main.classList.toggle('club-page',Boolean(colours));
}
const clubKit=club=>{
 const outfits=[['Domicile',club.kit_url],['Extérieur',club.away_kit_url]].filter(([,url])=>url);
 return outfits.length?`<div class="club-hero-kits">${outfits.map(([label,url])=>`<a href="${e(url)}" target="_blank" rel="noopener" title="${label}" aria-label="Tenue ${(label==='Domicile'?'à domicile':'extérieure')} de ${e(club.name)}"><img class="club-hero-kit" src="${e(url)}" alt="Tenue ${(label==='Domicile'?'à domicile':'extérieure')} de ${e(club.name)}" width="48" height="80"></a>`).join('')}</div>`:'';
};
// The disc of a country, in a match or a competition: its flag over its initials.
const nationCrest=nation=>{
 const flag=flagUrl(nation.nation);
 return `${initials(nation.name)}${flag?`<img class="crest-flag" src="${e(flag)}" alt="">`:''}`;
};

// The band and what closes it, a club's, a selection's, a player's or a competition's: `colors` is what heroColors gives,
// `lead` steps between peers, `crest` fills the disc (`mark` is what stands in the disc's place when it is not one),
// `before` is what precedes the `name` on its line, as large (a player's number), `after` what follows it, smaller (nothing
// stands over the name), `tiles` the figures on the right, `foot` what stands under the band.
function hero({colors,lead,crest,mark=crest?`<div class="crest club-hero-crest">${crest}</div>`:'',kit='',name,before='',after='',tiles,foot}){
 return `<header class="club-hero${colors?'':' plain'}"${colors?` style="${colors}"`:''}><div class="club-hero-band"><div class="club-hero-art" aria-hidden="true"><i></i><i class="thin"></i></div>`
  +`<div class="club-hero-main">${lead}${mark}${kit}`
  +`<div class="club-hero-identity"><div class="club-hero-name">${before}<h1>${e(name)}</h1>${after}</div></div>`
  +`<div class="club-hero-tiles">${tiles}</div></div></div>${foot}</header>`;
}
// What follows a name on its line: where it plays, a link to that page when it has one.
const context=(content,href='')=>href?`<a class="club-hero-context" href="${href}">${content}</a>`:`<span class="club-hero-context">${content}</span>`;

// The tabs of a page under its band: `menu` lists them, [key, label] and what its address keeps (a query, for a tab that
// reads the season of the open one), hung from the address `base`; `section` is the open one. `tools` close the row: the
// steps through the seasons of the open tab, beside the tabs and not among them, so that their list opens over the page.
function tabs(base,menu,section,tools=''){
 const nav=`<nav class="club-hero-tabs" aria-label="Sections">${menu.map(([key,label,query])=>`<a class="${key===section?'active':''}" href="${base}/${key}${query?`?${e(query)}`:''}"${key===section?' aria-current="page"':''}>${e(label)}</a>`).join('')}</nav>`;
 return tools?`<div class="club-hero-foot">${nav}<div class="tools">${tools}</div></div>`:nav;
}

// A level or a potential out of 200 on a column graded as its badge; a dash without one.
const grade=(label,value,title)=>value==null?column(label,'—'):column(label,level(value),title,levelHue(level(value)));

// The header of a club page: its colours, its crest, its name and its league after it, then the level and the potential of
// its 16 best players on one tile of two graded columns, and its reputation (with how far the last review moved it); the
// tabs of the page close it. Its kits, its tactic and its facilities are on its Présentation (`clubTiles`). `lead` steps
// between the clubs of the division; `menu` is the tabs, `section` the open one, `tools` what closes their row.
export function clubHero(club,{lead='',menu,section,tools=''}){
 const change=club.reputation_change==null?'':`<em class="${club.reputation_change<0?'down':'up'}">${signed(club.reputation_change)}</em>`;
 // After the name, two links: the flag of its country to its selection, then its league to its page. Outside a league,
 // one link: its country after the flag, the whole to the selection. A country without a selection is no link.
 const flag=nationFlag(club.nation_code,{link:false}),selection=club.nation_id==null?'':`#/international/nation/${club.nation_id}`;
 const after=club.competition_id==null?context(`${flag}${e(club.nation||'')}`,selection)
  :context(`${flag&&selection?`<a href="${selection}">${flag}</a>`:flag}<a href="#/league/${club.competition_id}">${e(club.competition)}</a>`);
 return hero({colors:heroColors(club.major_color,club.minor_color),lead,name:club.name,foot:tabs(`#/club/${club.id}`,menu,section,tools),
  crest:clubCrest(club),after,
  tiles:split(grade('Niveau',club.top_rating,'Niveau moyen des 16 meilleurs sur 200')+grade('Potentiel',club.top_potential,'Potentiel moyen des 16 meilleurs sur 200'))
   +tile('Réputation',club.reputation==null?'—':n(club.reputation),change)});
}

// The three traits of a club's personality the market reads, out of 20, each tooltip saying what it makes the club do.
const PERSONALITY=[
 ['risk_appetite','Risque','Appétit du risque sur 20 : plus il est haut, plus le club paie cher les joueurs qu’il recrute'],
 ['youth_preference','Jeunes','Préférence pour les jeunes sur 20 : plus elle est haute, plus le club fait jouer et progresser ses jeunes, et plus il recrute d’espoirs'],
 ['negotiation_patience','Patience','Patience en négociation sur 20 : plus elle est haute, plus le club vend cher, ouvre bas quand il achète et relance longtemps']];

// The row of tiles that opens a club's Présentation: its place in each competition of the season on one tile (`competitions`,
// the record of its calendar: the rank in its league, else how far it went), its players and their mean age on another, its
// tactic, its training and its youth recruitment on one tile, its personality on another, and last its squad's value. A competition is written after its
// badge, the two one link to its page.
export function clubTiles(club,competitions=[]){
 const place=row=>{
  const standing=row.kind==='league'?club.standing:null;
  return standing?`${standing.rank}${standing.rank===1?'er':'e'}<em>${n(standing.points)} pts</em>`:e(String(row.place||'—').replace(/^Éliminé · /,''));
 };
 const seasons=competitions.length?split(competitions.map(row=>`<div><span>${competitionLink(row,{badge:true})}</span><strong>${place(row)}</strong></div>`).join('')):'';
 return `<div class="club-tiles">${seasons}${split(column('Joueurs',club.squad_size==null?'—':n(club.squad_size))+column('Âge moyen',club.average_age==null?'—':n(club.average_age)))}`
  +`${tile('Tactique',e(club.formation||'—'))}${split(column('Entraînement',club.training_facilities==null?'—':n(club.training_facilities),'Entraînement sur 20')
   +column('Recrutement',club.youth_recruitment==null?'—':n(club.youth_recruitment),'Recrutement des jeunes sur 20'))}`
  +(club.personality?split(PERSONALITY.map(([key,label,title])=>column(label,Math.round(1+club.personality[key]*19),title)).join('')):'')
  +`${tile('Valeur',club.squad_value==null?'—':price(club.squad_value),'','Valeur de l’effectif')}</div>`;
}

// The row of tiles that opens a selection's Présentation, a club's where they apply: where it stands in the edition it is at
// (`edition`, the record of its calendar), the players of its latest camp and their mean age, and their value, which a
// campaign-only reinforcement has none of.
export function nationTiles(nation,edition=null){
 const squad=nation.squad||[],valued=squad.filter(player=>player.value!=null);
 const age=squad.length?Math.round(10*squad.reduce((sum,player)=>sum+player.age,0)/squad.length)/10:null;
 const place=edition?split(`<div><span>${competitionLink(edition,{badge:true})}</span><strong>${e(String(edition.place||'—').replace(/^Éliminé · /,''))}</strong></div>`):'';
 return `<div class="club-tiles">${place}${split(column('Joueurs',squad.length?n(squad.length):'—')+column('Âge moyen',age==null?'—':n(age)))}`
  +`${tile('Valeur',valued.length?price(valued.reduce((sum,player)=>sum+player.value,0)):'—','','Valeur de la liste')}</div>`;
}

// The band of a club before a game is made with it (« Nouvelle partie »): its colours, its crest, its name, its country's
// flag and its league after it; no link, no tile, no tab: the screen sets its figures under it.
export function creationHero(club){
 return hero({colors:heroColors(club.major_color,club.minor_color),lead:'',name:club.name,foot:'',crest:clubCrest(club),kit:clubKit(club),
  after:context(`${nationFlag(club.nation_code,{link:false})}${e(club.competition)}`),tiles:''});
}

// The header of a selection's page, a club's: the band in the colours of its kit, its logo alone (its initials on the disc
// without one), its name then its flag, as high as its capitals, then its strength. `lead` steps between the selections of
// the confederation, `tools` close the row of tabs.
export function nationHero(nation,{lead='',menu,section,tools=''}){
 const flag=flagUrl(nation.nation),logo=nationLogoUrl(nation.nation);
 return hero({colors:heroColors(nation.major_color,nation.minor_color),lead,name:nation.name,foot:tabs(`#/international/nation/${nation.id}`,menu,section,tools),
  crest:`${initials(nation.name)}${logo?`<img class="crest-logo" src="${e(logo)}" alt="" data-nation-logo>`:''}`,
  after:flag?`<img class="club-hero-flag" src="${e(flag)}" alt="">`:'',tiles:tile('Force',n(nation.strength))});
}

// The emblem of a competition that has one, by the two characters of its badge.
const EMBLEMS={C1:'c1',C3:'c3',C4:'c4',EU:'euro',CM:'coupe-du-monde',LN:'ligue-des-nations'};

// The header of a competition's page is a club's: its colours on the band, its name alone, its tabs under it. A European
// cup, the Euro, the World Cup and the Nations League have their emblem alone on the band, at its height; a league and a national cup have
// the flag of their country on the disc, as its selection has, a link to it. On the right, one tile: who won the season or
// the edition shown, and until it is won who holds the title. `base` is the address the tabs hang from, `lead` steps
// between the competition's peers, `tools` close the row of tabs.
export function competitionHero(competition,{lead='',base,menu,section,tools=''}){
 const emblem=EMBLEMS[competition.code],country={name:nationName(competition.nation),nation:competition.nation};
 const selection=competition.nation_id==null?'':`#/international/nation/${competition.nation_id}`;
 const disc=!flagUrl(competition.nation)?'':selection?`<a class="crest club-hero-crest" href="${selection}" aria-label="${e(country.name)}" title="${e(country.name)}">${nationCrest(country)}</a>`
  :`<div class="crest club-hero-crest">${nationCrest(country)}</div>`;
 const won=competition.winner,named=won||competition.holder;
 return hero({colors:heroColors(competition.major_color,competition.minor_color,competition.ground_color),lead,name:competition.name,foot:tabs(base,menu,section,tools),
  mark:emblem?`<img class="club-hero-emblem" src="/emblems/${emblem}.png" alt="">`:disc,
  tiles:named?tile(won?competition.kind==='league'?'Champion':'Vainqueur':'Tenant du titre',clubLink(named,{flag:competition.kind==='europe'})):''});
}

// A competition's band at the head of its column, on Sélections nationales: the band of its header, its emblem and its name,
// no tile; it opens the competition's page as a whole (`href`).
export function competitionBand(competition,href){
 const emblem=EMBLEMS[competition.code];
 return `<a class="club-hero-band narrow" href="${e(href)}" style="${heroColors(competition.major_color,competition.minor_color,competition.ground_color)}">`
  +`<div class="club-hero-art" aria-hidden="true"><i></i><i class="thin"></i></div><div class="club-hero-main">`
  +`${emblem?`<img class="club-hero-emblem" src="/emblems/${emblem}.png" alt="">`:''}<div class="club-hero-identity"><h2>${e(competition.name)}</h2></div></div></a>`;
}

// A side of a match without colours keeps the panel's, whatever the other side wears.
const PLAIN_SIDE='--hero-field:var(--panel-2);--hero-ink:var(--ink);--hero-sash:transparent;--crest-major:var(--panel-3);--crest-minor:var(--panel-3);--crest-ink:var(--ink)';
const sideColors=team=>heroColors(team.major_color,team.minor_color)||PLAIN_SIDE;

// The header of a match is the two sides' headers in one band: the side at home on the left, the other on the right, each in
// its colours with its sash, its crest (a selection's flag) and its name, a link to its page. The score stands on a tile
// where they meet, over what settled a tie (the aggregate, the shoot-out). `foot` is what stands under the band. `flags`
// follows each club's name with the flag of its country, on the side of the score, a link to its selection when the game
// has one (a European cup). Live (`clock`, the minute's chip), the band is compact, its names plain text: the screen
// cannot be left until the final whistle.
export function matchHero(match,foot='',{flags=false,clock=''}={}){
 const country=team=>{
  const flag=flags&&!team.national?nationFlag(team.nation,{link:false}):'';
  return !flag?'':team.nation_id==null?`<span class="match-hero-flag">${flag}</span>`:`<a class="match-hero-flag" href="#/international/nation/${team.nation_id}">${flag}</a>`;
 };
 const side=(team,away)=>`<div class="match-hero-side${away?' away':''}"${away?` style="${sideColors(team)}"`:''}><div class="crest club-hero-crest">${team.national?nationCrest(team):clubCrest(team)}</div>`
  +(clock?`<span class="match-hero-name">${e(team.name)}</span>`:`<a class="match-hero-name" href="#/${team.national?'international/nation':'club'}/${team.id}">${e(team.name)}</a>`)+`${country(team)}</div>`;
 const settled=[match.aggregate?`Cumul ${match.aggregate.join(' – ')}`:'',match.penalties?`${match.penalties.join(' – ')} t.a.b.`:''].filter(Boolean).join(' · ');
 return `<header class="club-hero match-hero${clock?' live':''}" style="${sideColors(match.home)}"><div class="club-hero-band"><div class="club-hero-art" aria-hidden="true"><i></i><i class="thin"></i>`
  +`<span style="${sideColors(match.away)}"><i class="field"></i><i></i><i class="thin"></i></span></div>`
  +`<div class="club-hero-main">${side(match.home,false)}<div class="club-hero-tile match-score">${clock}<strong class="big-score">${clock?match.score.map(goals=>`<i>${goals}</i>`).join(' – '):match.score?match.score.join(' – '):'VS'}</strong>${settled?`<span>${settled}</span>`:''}</div>`
  +`${side(match.away,true)}</div></div>${foot}</header>`;
}

// What a player did for his selection, on one tile of three columns: its flag over its code (the nation he plays for, else
// the first of his nationalities; a link to its selection when the game has one), his caps, and his goals once he has scored.
function selectionTile(player){
 const main=mainNationCode(player);
 if(!main)return '';
 const nation=`<span>${nationFlag(main,{link:false})}</span><strong>${e(nationCode(main))}</strong>`,selection=nationHref(main);
 return split(`${selection?`<a href="${e(selection)}">${nation}</a>`:`<div>${nation}</div>`}`
  +`${player.international_caps==null?'':column('Sél.',n(player.international_caps))}${player.international_goals?column('Buts',n(player.international_goals)):''}`);
}

// The header of a player's page is his club's: its colours on the band, its crest on the disc, his number before his name,
// as large and veiled, and the club after it, smaller (a plain band and « Libre » without a club). On the right his age,
// what he did for his selection, his level and his potential on one tile of two graded columns, his market value and the
// fee asked for him (N/A when nobody can be asked) on another. `lead` steps through the squad; `foot` is what the user can
// do with him, where a club has its tabs.
export function playerHero(player,{lead='',foot=''}){
 const club=player.club;
 const unasked=player.transferable===false?'Intransférable : son club refuse de le vendre':club?'':'Sans club : aucun prix demandé';
 const number=club&&player.shirt!=null?`<span class="club-hero-number" title="Numéro de maillot">${n(player.shirt)}</span>`:'';
 return hero({colors:heroColors(club?.major_color,club?.minor_color),lead,name:player.name,foot,crest:club?clubCrest(club):'',before:number,
  after:club?context(e(club.name),`#/club/${club.id}`):context('Libre'),
  tiles:`${tile('Âge',player.age,'',`Né le ${date(player.born)}`)}${selectionTile(player)}${split(grade('Niveau',player.rating,'Niveau actuel sur 200')+grade('Potentiel',player.potential,'Potentiel sur 200'))}`
   +split(column('Valeur',price(player.value),'Valeur de marché')+(unasked?column('Prix demandé','N/A',unasked):column('Prix demandé',price(player.asking_price))))});
}
