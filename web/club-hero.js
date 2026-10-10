import {escape as e,number as n,safeColor,contrastRatio,legibleOn,initials,nationFlag,nationCode,nationName,mainNationCode,flagUrl,clubLink,level,levelHue,date,money,price} from './ui.js';

const DARK_INK='#111418',LIGHT_INK='#ffffff',DARK_PANEL='#161b22';
const inkOn=background=>contrastRatio(background,DARK_INK)>=contrastRatio(background,LIGHT_INK)?DARK_INK:LIGHT_INK;
// The club colour that reads best on a surface, on the panel of either theme: the open tab is underlined with it and the
// arrows of the seasons are drawn in it. A colour too pale or too dark to be read there is brought to its tone in a chart.
const readableOn=(surface,major,minor)=>legibleOn(contrastRatio(major,surface)>=contrastRatio(minor,surface)?major:minor,surface);

// The band of a club's header, in its colours: the home colour fills it and the second one crosses it as a sash. A home colour
// close to white would melt into the page, so the second colour fills the band instead; two colours alike leave a faint sash
// of the ink. Without colours the band keeps the panel's. A competition that stands on a ground of its own (`groundColor`:
// the night blue the European cups share, the black under the World Cup's gold) has it fill the band, and its colour
// cross it as the sash. Returns CSS custom properties for the header's style attribute.
export function heroColors(majorColor,minorColor,groundColor){
 const major=safeColor(majorColor);
 if(!major)return '';
 const minor=safeColor(minorColor)||major,ground=safeColor(groundColor);
 const pale=!ground&&minor!==major&&contrastRatio(major,LIGHT_INK)<1.3;
 const field=ground||(pale?minor:major),ink=inkOn(field);
 let sash=ground||pale?major:minor,opacity=1;
 if(contrastRatio(field,sash)<1.25){sash=ink;opacity=.12;}
 return [`--hero-field:${field}`,`--hero-ink:${ink}`,`--hero-sash:${sash}`,`--hero-sash-opacity:${opacity}`,
  ...[['light',LIGHT_INK],['dark',DARK_PANEL]].flatMap(([theme,surface])=>{const colour=readableOn(surface,major,minor);return colour?[`--hero-accent-${theme}:${colour}`]:[];}),
  `--crest-major:${major}`,`--crest-minor:${minor}`,`--crest-ink:${inkOn(major)}`].join(';');
}

// A figure of the header, with its label above it; `hue` grades its ground as the badge of that note.
const tile=(label,value,extra='',title='',hue=null)=>`<div class="club-hero-tile${hue==null?'':' graded'}"${hue==null?'':` style="--hue:${hue}"`}${title?` title="${e(title)}"`:''}><span>${label}</span><strong>${value}${extra}</strong></div>`;
const signed=value=>value>0?`+${n(value)}`:value<0?`−${n(-value)}`:'0';
// What fills the disc of a club: its initials, under its crest when the game has one.
const clubCrest=club=>`${initials(club.name)}<img class="crest-logo" src="/crests/TCM1_${club.id}.png" alt="" loading="lazy" onerror="this.remove()">`;
// What fills the disc of a selection: its initials, under its flag when it has one.
const nationCrest=nation=>{const flag=flagUrl(nation.nation);return `${initials(nation.name)}${flag?`<img class="crest-flag" src="${e(flag)}" alt="">`:''}`;};

// The band and what closes it, a club's, a selection's, a player's or a competition's: `colors` is what heroColors gives,
// `lead` steps between peers, `crest` fills the disc (`mark` is what stands in the disc's place when it is not one),
// `after` is what follows the `name` on its line, smaller (nothing stands over the name), `tiles` the figures on the
// right, `foot` what stands under the band.
function hero({colors,lead,crest,mark=crest?`<div class="crest club-hero-crest">${crest}</div>`:'',name,after='',tiles,foot}){
 return `<header class="club-hero${colors?'':' plain'}"${colors?` style="${colors}"`:''}><div class="club-hero-band"><div class="club-hero-art" aria-hidden="true"><i></i><i class="thin"></i></div>`
  +`<div class="club-hero-main">${lead}${mark}`
  +`<div class="club-hero-identity"><div class="club-hero-name"><h1>${e(name)}</h1>${after}</div></div>`
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

// The header of a club page: its colours, its crest, its name and its league after it, then its tactic, its training, its
// youth recruitment and its reputation (with how far the last review moved it); the tabs of the page close it. `lead` steps
// between the clubs of the division; `menu` is the tabs, `section` the open one, `tools` what closes their row.
export function clubHero(club,{lead='',menu,section,tools=''}){
 const change=club.reputation_change==null?'':`<em class="${club.reputation_change<0?'down':'up'}">${signed(club.reputation_change)}</em>`;
 // After the name, two links: the flag of its country to its selection, then its league to its page. Outside a league,
 // one link: its country after the flag, the whole to the selection. A country without a selection is no link.
 const flag=nationFlag(club.nation_code),selection=club.nation_id==null?'':`#/international/nation/${club.nation_id}`;
 const after=club.competition_id==null?context(`${flag}${e(club.nation||'')}`,selection)
  :context(`${flag&&selection?`<a href="${selection}">${flag}</a>`:flag}<a href="#/league/${club.competition_id}">${e(club.competition)}</a>`);
 return hero({colors:heroColors(club.major_color,club.minor_color),lead,name:club.name,foot:tabs(`#/club/${club.id}`,menu,section,tools),
  crest:clubCrest(club),after,
  tiles:`${tile('Tactique',e(club.formation||'—'))}${tile('Entraînement',club.training_facilities==null?'—':n(club.training_facilities))}`
   +`${tile('Recrutement',club.youth_recruitment==null?'—':n(club.youth_recruitment),'','Recrutement des jeunes')}${tile('Réputation',club.reputation==null?'—':n(club.reputation),change)}`});
}

// The header of a selection's page, a club's: the band in the colours of its kit, its flag on the disc, its name alone,
// then its strength. `lead` steps between the selections of the confederation, `tools` close the row of tabs.
export function nationHero(nation,{lead='',menu,section,tools=''}){
 return hero({colors:heroColors(nation.major_color,nation.minor_color),lead,name:nation.name,foot:tabs(`#/international/nation/${nation.id}`,menu,section,tools),
  crest:nationCrest(nation),tiles:tile('Force',n(nation.strength))});
}

// The emblem of a competition that has one, by the two characters of its badge.
const EMBLEMS={C1:'c1',C3:'c3',C4:'c4',EU:'euro',CM:'coupe-du-monde'};

// The header of a competition's page is a club's: its colours on the band, its name alone, its tabs under it. A European
// cup, the Euro and the World Cup have their emblem alone on the band, at its height; a league and a national cup have
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
  tiles:named?tile(won?competition.kind==='league'?'Champion':'Vainqueur':'Tenant du titre',clubLink(named)):''});
}

// A side of a match without colours keeps the panel's, whatever the other side wears.
const PLAIN_SIDE='--hero-field:var(--panel-2);--hero-ink:var(--ink);--hero-sash:transparent;--crest-major:var(--panel-3);--crest-minor:var(--panel-3);--crest-ink:var(--ink)';
const sideColors=team=>heroColors(team.major_color,team.minor_color)||PLAIN_SIDE;

// The header of a match is the two sides' headers in one band: the side at home on the left, the other on the right, each in
// its colours with its sash, its crest (a selection's flag) and its name, a link to its page. The score stands on a tile
// where they meet, over what settled a tie (the aggregate, the shoot-out). `foot` is what stands under the band.
export function matchHero(match,foot=''){
 const side=(team,away)=>`<div class="match-hero-side${away?' away':''}"${away?` style="${sideColors(team)}"`:''}><div class="crest club-hero-crest">${team.national?nationCrest(team):clubCrest(team)}</div>`
  +`<a class="match-hero-name" href="#/${team.national?'international/nation':'club'}/${team.id}">${e(team.name)}</a></div>`;
 const settled=[match.aggregate?`Cumul ${match.aggregate.join(' – ')}`:'',match.penalties?`${match.penalties.join(' – ')} t.a.b.`:''].filter(Boolean).join(' · ');
 return `<header class="club-hero match-hero" style="${sideColors(match.home)}"><div class="club-hero-band"><div class="club-hero-art" aria-hidden="true"><i></i><i class="thin"></i>`
  +`<span style="${sideColors(match.away)}"><i class="field"></i><i></i><i class="thin"></i></span></div>`
  +`<div class="club-hero-main">${side(match.home,false)}<div class="club-hero-tile match-score"><strong class="big-score">${match.score?match.score.join(' : '):'VS'}</strong>${settled?`<span>${settled}</span>`:''}</div>`
  +`${side(match.away,true)}</div></div>${foot}</header>`;
}

// What a player did for his selection, on one tile of three columns: its flag over its code (the nation he plays for, else
// the first of his nationalities; a link to the selection once it has called him), his caps, and his goals once he has scored.
function selectionTile(player){
 const main=mainNationCode(player);
 if(!main)return '';
 const nation=`<span>${nationFlag(main)}</span><strong>${e(nationCode(main))}</strong>`;
 const column=(label,value)=>`<div><span>${label}</span><strong>${n(value)}</strong></div>`;
 return `<div class="club-hero-tile split">${main===player.national_team&&player.national_team_id!=null?`<a href="#/international/nation/${player.national_team_id}">${nation}</a>`:`<div>${nation}</div>`}`
  +`${player.international_caps==null?'':column('Sél.',player.international_caps)}${player.international_goals?column('Buts',player.international_goals):''}</div>`;
}

// The header of a player's page is his club's: its colours on the band, its crest on the disc, his name with the club after
// it, smaller (a plain band and « Libre » without a club). On the right his age, what he did for his selection, his level
// and his potential on graded tiles, his market value and the fee asked for him (N/A when nobody can be asked). `lead`
// steps through the squad; `foot` is what the user can do with him, where a club has its tabs.
export function playerHero(player,{lead='',foot=''}){
 const club=player.club;
 const grade=(label,value,title)=>value==null?tile(label,'—'):tile(label,level(value),'',title,levelHue(level(value)));
 const unasked=player.transferable===false?'Intransférable : son club refuse de le vendre':club?'':'Sans club : aucun prix demandé';
 return hero({colors:heroColors(club?.major_color,club?.minor_color),lead,name:player.name,foot,crest:club?clubCrest(club):'',
  after:club?context(e(club.name),`#/club/${club.id}`):context('Libre'),
  tiles:`${tile('Âge',player.age,'',`Né le ${date(player.born)}`)}${selectionTile(player)}${grade('Niveau',player.rating,'Niveau actuel sur 200')}${grade('Potentiel',player.potential,'Potentiel sur 200')}`
   +`${tile('Valeur',money(player.value),'','Valeur de marché')}${unasked?tile('Prix demandé','N/A','',unasked):tile('Prix demandé',price(player.asking_price))}`});
}
