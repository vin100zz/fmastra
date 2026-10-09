import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clubHero,nationHero,heroColors} from '../../web/club-hero.js';
import {setNations} from '../../web/ui.js';

const vars=style=>Object.fromEntries(style.split(';').filter(Boolean).map(item=>item.split(':')));

test('the colour under the open tab is the one that reads on the panel; a colour too pale for it takes its tone in a chart',()=>{
 const accent=(major,minor)=>vars(heroColors(major,minor))['--hero-accent-light'];
 // A colour that reads on white is kept as it is: Marseille's blue, Nantes' green rather than its yellow.
 assert.equal(accent('#F8F8F8','#2098C8'),'#2098C8');assert.equal(accent('#FCD405','#00A650'),'#00A650');
 // Yellow and white, sky and white: the colour is darkened until a line or an arrow drawn with it can be seen.
 assert.equal(accent('#FFFFFF','#FCD405'),'#af8800');assert.equal(accent('#FFFFFF','#75B2DD'),'#4594c8');
 // White alone is no colour: nothing is given, and the sheet falls back on the accent.
 assert.equal(accent('#FFFFFF','#FFFFFF'),undefined);
});

test('the band takes the home colour crossed by the second one, with an ink that reads on it',()=>{
 const lens=vars(heroColors('#F8D000','#E00000'));
 assert.equal(lens['--hero-field'],'#F8D000');assert.equal(lens['--hero-sash'],'#E00000');assert.equal(lens['--hero-sash-opacity'],'1');
 assert.equal(lens['--hero-ink'],'#111418');
 // The tabs underline the colour that reads on each theme's panel: red on white, yellow on the dark panel.
 assert.equal(lens['--hero-accent-light'],'#E00000');assert.equal(lens['--hero-accent-dark'],'#F8D000');
 const paris=vars(heroColors('#004070','#D82818'));
 assert.equal(paris['--hero-field'],'#004070');assert.equal(paris['--hero-ink'],'#ffffff');
});

test('a home colour close to white gives the band to the second colour; two colours alike leave a faint sash of the ink',()=>{
 const marseille=vars(heroColors('#F8F8F8','#2098C8'));
 assert.equal(marseille['--hero-field'],'#2098C8');assert.equal(marseille['--hero-sash'],'#F8F8F8');
 const strasbourg=vars(heroColors('#283040','#283040'));
 assert.equal(strasbourg['--hero-field'],'#283040');assert.equal(strasbourg['--hero-sash'],'#ffffff');assert.equal(strasbourg['--hero-sash-opacity'],'0.12');
 // No colour or an unsafe one: the band keeps the panel's.
 assert.equal(heroColors(null,null),'');assert.equal(heroColors('red;background:url(x)','#ffffff'),'');
});

const club={id:7,name:'Lens <RC>',nation_code:'FRA',competition:'Ligue 1',capacity:38223,formation:'4-3-3',training_facilities:16,youth_recruitment:13,
 reputation:73.1,reputation_change:1.2,major_color:'#F8D000',minor_color:'#E00000'};
const menu=[['squad','Effectif'],['calendar','Calendrier'],['history','Historique']];

test('the header names the club and its ground, then its tactic, its training, its youth recruitment and its reputation',()=>{
 const html=clubHero(club,{lead:'<div class="entity-nav"></div>',menu,section:'calendar'});
 assert.match(html,/^<header class="club-hero" style="--hero-field:#F8D000;/);
 assert.match(html,/<div class="club-hero-main"><div class="entity-nav"><\/div><div class="crest club-hero-crest">L&lt;<img class="crest-logo" src="\/crests\/TCM1_7.png"/);
 assert.match(html,/Ligue 1 · 38 223 places<\/span><h1>Lens &lt;RC&gt;<\/h1><\/div>/);assert.doesNotMatch(html,/<RC>/);
 assert.match(html,/<span>Tactique<\/span><strong>4-3-3<\/strong>/);
 // The facilities are out of 20 without saying so; no league standing nor form in the header.
 assert.match(html,/<span>Entraînement<\/span><strong>16<\/strong>/);assert.match(html,/title="Recrutement des jeunes"><span>Recrutement<\/span><strong>13<\/strong>/);
 assert.doesNotMatch(html,/\/ 20|Classement|class="form"/);
 assert.match(html,/<span>Réputation<\/span><strong>73\.1<em class="up">\+1\.2<\/em><\/strong>/);
 assert.match(clubHero({...club,reputation_change:-0.5},{menu,section:'squad'}),/<em class="down">−0\.5<\/em>/);
 assert.doesNotMatch(clubHero({...club,reputation_change:null},{menu,section:'squad'}),/<em/);
});

test('the tabs close the header, the open one marked',()=>{
 const html=clubHero(club,{menu,section:'calendar'});
 assert.match(html,/<nav class="club-hero-tabs" aria-label="Sections"><a class="" href="#\/club\/7\/squad">Effectif<\/a><a class="active" href="#\/club\/7\/calendar" aria-current="page">Calendrier<\/a>/);
 // Nothing closes the row unless the open tab has tools; a tab keeps in its address what the menu gives it.
 assert.match(html,/<a class="" href="#\/club\/7\/history">Historique<\/a><\/nav><\/header>$/);assert.doesNotMatch(html,/club-hero-foot/);
 // The tools stand beside the tabs, not among them: their list opens over the page.
 const stepped=clubHero(club,{menu:[['squad','Effectif'],['calendar','Calendrier','saison=2029&x=<y>']],section:'calendar',tools:'<div class="season"></div>'});
 assert.match(stepped,/<div class="club-hero-foot"><nav class="club-hero-tabs" aria-label="Sections"><a class="" href="#\/club\/7\/squad">Effectif<\/a><a class="active" href="#\/club\/7\/calendar\?saison=2029&amp;x=&lt;y&gt;" aria-current="page">Calendrier<\/a><\/nav><div class="tools"><div class="season"><\/div><\/div><\/div><\/header>$/);
 // A dormant club without colours keeps a plain band and says it plays no league.
 const dormant=clubHero({...club,competition:null,nation:'France',major_color:null},{menu,section:'squad'});
 assert.match(dormant,/<header class="club-hero plain">/);assert.match(dormant,/France · Club dormant · 38 223 places<\/span><h1>/);
});

test('a selection wears the same header: its kit on the band, its flag on the disc, its strength alone on the right',()=>{
 const england={id:-1007,name:'Angleterre',nation:'ENG',federation:'Europe',strength:83.14,major_color:'#ffffff',minor_color:'#0b1f4b',competition:{year:2032,name:'Euro 2032',stage:'Phase finale'}};
 setNations({ENG:{name:'Angleterre',display_code:'ENG',flag:'gb-eng'}});
 const html=nationHero(england,{lead:'<div class="entity-nav"></div>',menu,section:'squad'});
 setNations({});
 // A white shirt would melt into the page: the second colour fills the band, as for a club.
 assert.match(html,/^<header class="club-hero" style="--hero-field:#0b1f4b;--hero-ink:#ffffff;--hero-sash:#ffffff;/);
 assert.match(html,/<div class="club-hero-main"><div class="entity-nav"><\/div><div class="crest club-hero-crest">A<img class="crest-flag" src="\/flags\/gb-eng\.svg" alt=""><\/div>/);
 assert.match(html,/<span class="club-hero-league">Europe · Euro 2032 · Phase finale<\/span><h1>Angleterre<\/h1>/);
 assert.match(html,/<div class="club-hero-tiles"><div class="club-hero-tile"><span>Force<\/span><strong>83\.1<\/strong><\/div><\/div>/);
 assert.match(html,/<a class="active" href="#\/international\/nation\/-1007\/squad" aria-current="page">Effectif<\/a><a class="" href="#\/international\/nation\/-1007\/calendar">Calendrier<\/a>/);
 // Without colours, without a flag, out of any edition: a plain band, its initial on the disc, its confederation alone.
 // What steps through its editions closes its row of tabs, as a club's seasons do.
 assert.match(nationHero(england,{menu,section:'calendar',tools:'<b>pas</b>'}),/<\/nav><div class="tools"><b>pas<\/b><\/div><\/div><\/header>$/);
 const bare=nationHero({...england,major_color:null,minor_color:null,competition:null},{menu,section:'history'});
 assert.match(bare,/^<header class="club-hero plain">/);assert.match(bare,/<div class="crest club-hero-crest">A<\/div>/);
 assert.match(bare,/<span class="club-hero-league">Europe<\/span>/);
});
