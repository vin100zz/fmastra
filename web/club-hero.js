import {escape as e,number as n,safeColor,contrastRatio,initials,nationFlag,nationCode,flagUrl,level,levelHue,date,money,price} from './ui.js';

const DARK_INK='#111418',LIGHT_INK='#ffffff',DARK_PANEL='#161b22';
const inkOn=background=>contrastRatio(background,DARK_INK)>=contrastRatio(background,LIGHT_INK)?DARK_INK:LIGHT_INK;
// The club colour that reads best on a surface: the tabs underline it, on the panel of either theme.
const readableOn=(surface,major,minor)=>contrastRatio(major,surface)>=contrastRatio(minor,surface)?major:minor;

// The band of a club's header, in its colours: the home colour fills it and the second one crosses it as a sash. A home colour
// close to white would melt into the page, so the second colour fills the band instead; two colours alike leave a faint sash
// of the ink. Without colours the band keeps the panel's. Returns CSS custom properties for the header's style attribute.
export function heroColors(majorColor,minorColor){
 const major=safeColor(majorColor);
 if(!major)return '';
 const minor=safeColor(minorColor)||major;
 const pale=contrastRatio(major,LIGHT_INK)<1.3;
 const field=pale&&minor!==major?minor:major,ink=inkOn(field);
 let sash=pale&&minor!==major?major:minor,opacity=1;
 if(contrastRatio(field,sash)<1.25){sash=ink;opacity=.12;}
 return [`--hero-field:${field}`,`--hero-ink:${ink}`,`--hero-sash:${sash}`,`--hero-sash-opacity:${opacity}`,
  `--hero-accent-light:${readableOn(LIGHT_INK,major,minor)}`,`--hero-accent-dark:${readableOn(DARK_PANEL,major,minor)}`,
  `--crest-major:${major}`,`--crest-minor:${minor}`,`--crest-ink:${inkOn(major)}`].join(';');
}

// A figure of the header, with its label above it; `hue` grades its ground as the badge of that note.
const tile=(label,value,extra='',title='',hue=null)=>`<div class="club-hero-tile${hue==null?'':' graded'}"${hue==null?'':` style="--hue:${hue}"`}${title?` title="${e(title)}"`:''}><span>${label}</span><strong>${value}${extra}</strong></div>`;
const signed=value=>value>0?`+${n(value)}`:value<0?`−${n(-value)}`:'0';
// What fills the disc of a club: its initials, under its crest when the game has one.
const clubCrest=club=>`${initials(club.name)}<img class="crest-logo" src="/crests/TCM1_${club.id}.png" alt="" loading="lazy" onerror="this.remove()">`;
// What fills the disc of a selection: its initials, under its flag when it has one.
const nationCrest=nation=>{const flag=flagUrl(nation.nation);return `${initials(nation.name)}${flag?`<img class="crest-flag" src="${e(flag)}" alt="">`:''}`;};

// The band and what closes it, a club's, a selection's or a player's: `colors` is what heroColors gives, `lead` steps
// between peers, `crest` fills the disc, `facts` is the line over the `name`, `after` what follows the name on its line,
// `tiles` the figures on the right, `foot` what stands under the band.
function hero({colors,lead,crest,facts='',name,after='',tiles,foot}){
 const title=`<h1>${e(name)}</h1>`;
 return `<header class="club-hero${colors?'':' plain'}"${colors?` style="${colors}"`:''}><div class="club-hero-band"><div class="club-hero-art" aria-hidden="true"><i></i><i class="thin"></i></div>`
  +`<div class="club-hero-main">${lead}${crest?`<div class="crest club-hero-crest">${crest}</div>`:''}`
  +`<div class="club-hero-identity">${facts?`<span class="club-hero-league">${facts}</span>`:''}${after?`<div class="club-hero-name">${title}${after}</div>`:title}</div>`
  +`<div class="club-hero-tiles">${tiles}</div></div></div>${foot}</header>`;
}

// The tabs of a page under its band: `menu` lists them, [key, label], hung from the address `base`; `section` is the open one.
const tabs=(base,menu,section)=>`<nav class="club-hero-tabs" aria-label="Sections">${menu.map(([key,label])=>`<a class="${key===section?'active':''}" href="${base}/${key}"${key===section?' aria-current="page"':''}>${e(label)}</a>`).join('')}</nav>`;

// The header of a club page: its colours, its crest, its league and its ground, then its tactic, its training, its youth
// recruitment and its reputation (with how far the last review moved it); the tabs of the page close it. `lead` steps between
// the clubs of the division; `menu` is the tabs, [key, label], `section` the open one.
export function clubHero(club,{lead='',menu,section}){
 const change=club.reputation_change==null?'':`<em class="${club.reputation_change<0?'down':'up'}">${signed(club.reputation_change)}</em>`;
 // One line over the name: the flag, the competition (« Club dormant » outside a league), the ground's capacity.
 const facts=[club.competition||club.nation||null,club.competition?null:'Club dormant',club.capacity?`${n(club.capacity)} places`:null].filter(Boolean).join(' · ');
 return hero({colors:heroColors(club.major_color,club.minor_color),lead,name:club.name,foot:tabs(`#/club/${club.id}`,menu,section),
  crest:clubCrest(club),facts:`${nationFlag(club.nation_code)}${e(facts)}`,
  tiles:`${tile('Tactique',e(club.formation||'—'))}${tile('Entraînement',club.training_facilities==null?'—':n(club.training_facilities))}`
   +`${tile('Recrutement',club.youth_recruitment==null?'—':n(club.youth_recruitment),'','Recrutement des jeunes')}${tile('Réputation',club.reputation==null?'—':n(club.reputation),change)}`});
}

// The header of a selection's page, a club's: the band in the colours of its kit, its flag on the disc, its confederation
// and the edition it plays over its name, then its strength. `lead` steps between the selections of the confederation.
export function nationHero(nation,{lead='',menu,section}){
 const facts=[nation.federation,nation.competition?.name,nation.competition?.stage].filter(Boolean).join(' · ');
 return hero({colors:heroColors(nation.major_color,nation.minor_color),lead,name:nation.name,foot:tabs(`#/international/nation/${nation.id}`,menu,section),
  crest:nationCrest(nation),facts:e(facts),tiles:tile('Force',n(nation.strength))});
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
 const main=player.national_team||(player.nationalities||[])[0];
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
  after:club?`<a class="club-hero-club" href="#/club/${club.id}">${e(club.name)}</a>`:'<span class="club-hero-club">Libre</span>',
  tiles:`${tile('Âge',player.age,'',`Né le ${date(player.born)}`)}${selectionTile(player)}${grade('Niveau',player.rating,'Niveau actuel sur 200')}${grade('Potentiel',player.potential,'Potentiel sur 200')}`
   +`${tile('Valeur',money(player.value),'','Valeur de marché')}${unasked?tile('Prix demandé','N/A','',unasked):tile('Prix demandé',price(player.asking_price))}`});
}
