import {escape as e,number as n,safeColor,contrastRatio,initials,nationFlag,flagUrl} from './ui.js';

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

// A figure of the header, with its label above it.
const tile=(label,value,extra='',title='')=>`<div class="club-hero-tile"${title?` title="${e(title)}"`:''}><span>${label}</span><strong>${value}${extra}</strong></div>`;
const signed=value=>value>0?`+${n(value)}`:value<0?`−${n(-value)}`:'0';

// The band and the tabs that close it, a club's or a selection's: `colors` is what heroColors gives, `lead` steps between
// peers, `crest` fills the disc, `facts` is the line over the `name`, `tiles` the figures on the right; `menu` is the tabs,
// [key, label], hung from the address `base`, `section` the open one.
function hero({colors,lead,crest,facts,name,tiles,base,menu,section}){
 const tabs=menu.map(([key,label])=>`<a class="${key===section?'active':''}" href="${base}/${key}"${key===section?' aria-current="page"':''}>${e(label)}</a>`).join('');
 return `<header class="club-hero${colors?'':' plain'}"${colors?` style="${colors}"`:''}><div class="club-hero-band"><div class="club-hero-art" aria-hidden="true"><i></i><i class="thin"></i></div>`
  +`<div class="club-hero-main">${lead}<div class="crest club-hero-crest">${crest}</div>`
  +`<div class="club-hero-identity"><span class="club-hero-league">${facts}</span><h1>${e(name)}</h1></div>`
  +`<div class="club-hero-tiles">${tiles}</div></div></div>`
  +`<nav class="club-hero-tabs" aria-label="Sections">${tabs}</nav></header>`;
}

// The header of a club page: its colours, its crest, its league and its ground, then its tactic, its training, its youth
// recruitment and its reputation (with how far the last review moved it); the tabs of the page close it. `lead` steps between
// the clubs of the division; `menu` is the tabs, [key, label], `section` the open one.
export function clubHero(club,{lead='',menu,section}){
 const change=club.reputation_change==null?'':`<em class="${club.reputation_change<0?'down':'up'}">${signed(club.reputation_change)}</em>`;
 // One line over the name: the flag, the competition (« Club dormant » outside a league), the ground's capacity.
 const facts=[club.competition||club.nation||null,club.competition?null:'Club dormant',club.capacity?`${n(club.capacity)} places`:null].filter(Boolean).join(' · ');
 return hero({colors:heroColors(club.major_color,club.minor_color),lead,name:club.name,base:`#/club/${club.id}`,menu,section,
  crest:`${initials(club.name)}<img class="crest-logo" src="/crests/TCM1_${club.id}.png" alt="" loading="lazy" onerror="this.remove()">`,
  facts:`${nationFlag(club.nation_code)}${e(facts)}`,
  tiles:`${tile('Tactique',e(club.formation||'—'))}${tile('Entraînement',club.training_facilities==null?'—':n(club.training_facilities))}`
   +`${tile('Recrutement',club.youth_recruitment==null?'—':n(club.youth_recruitment),'','Recrutement des jeunes')}${tile('Réputation',club.reputation==null?'—':n(club.reputation),change)}`});
}

// The header of a selection's page, a club's: the band in the colours of its kit, its flag on the disc, its confederation
// and the edition it plays over its name, then its strength. `lead` steps between the selections of the confederation.
export function nationHero(nation,{lead='',menu,section}){
 const flag=flagUrl(nation.nation);
 const facts=[nation.federation,nation.competition?.name,nation.competition?.stage].filter(Boolean).join(' · ');
 return hero({colors:heroColors(nation.major_color,nation.minor_color),lead,name:nation.name,base:`#/international/nation/${nation.id}`,menu,section,
  crest:`${initials(nation.name)}${flag?`<img class="crest-flag" src="${e(flag)}" alt="">`:''}`,facts:e(facts),tiles:tile('Force',n(nation.strength))});
}
