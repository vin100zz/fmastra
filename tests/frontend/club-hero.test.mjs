import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clubHero,clubTiles,creationHero,nationHero,competitionHero,heroColors,initHeroCrests} from '../../web/club-hero.js';
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

test('a competition that stands on a ground of its own has it fill the band; its colour crosses it and marks the open tab',()=>{
 // The three European cups share the night blue: the cup's colour is the sash, and the one under its open tab.
 const europa=vars(heroColors('#f26522',null,'#0a0b5c'));
 assert.equal(europa['--hero-field'],'#0a0b5c');assert.equal(europa['--hero-ink'],'#ffffff');assert.equal(europa['--hero-sash'],'#f26522');assert.equal(europa['--hero-sash-opacity'],'1');
 assert.equal(europa['--hero-accent-light'],'#f26522');
 assert.equal(vars(heroColors('#2447e6',null,'#0a0b5c'))['--hero-accent-light'],'#2447e6');
 // A colour too pale to read on the panel is brought to its tone in a chart, as a club's: the Conference League's green, the World Cup's gold.
 const conference=vars(heroColors('#16be28',null,'#0a0b5c'))['--hero-accent-light'],world=vars(heroColors('#d4a72c',null,'#111418'));
 assert.notEqual(conference,'#16be28');assert.match(conference,/^#[0-9a-f]{6}$/);
 assert.equal(world['--hero-field'],'#111418');assert.equal(world['--hero-sash'],'#d4a72c');assert.notEqual(world['--hero-accent-light'],'#d4a72c');
 // Without a ground, a competition's band is a club's: the Euro's blue crossed by its yellow, the blue under its open tab.
 const euro=vars(heroColors('#003399','#ffcc00',null));
 assert.equal(euro['--hero-field'],'#003399');assert.equal(euro['--hero-sash'],'#ffcc00');assert.equal(euro['--hero-accent-light'],'#003399');
 // An unsafe ground is no ground.
 assert.equal(vars(heroColors('#f26522',null,'url(x)'))['--hero-field'],'#f26522');
});

test('the steps of a band take its second colour where it reads on the band, else its ink; their veil is of that ink',()=>{
 const step=(...colours)=>vars(heroColors(...colours))['--hero-step'];
 // A second colour that stands out is kept: Lens' red on its yellow, the Europa League's orange and the Euro's yellow on
 // their blues, Marseille's white on the blue that fills its band.
 assert.equal(step('#F8D000','#E00000'),'#E00000');assert.equal(step('#f26522',null,'#0a0b5c'),'#f26522');assert.equal(step('#003399','#ffcc00'),'#ffcc00');
 assert.equal(step('#F8F8F8','#2098C8'),'#F8F8F8');
 // Under a contrast of 3, the ink of the band: Paris' red on its navy, the Champions League's blue on the night blue,
 // Nantes' green on its yellow.
 assert.equal(step('#004070','#D82818'),'#ffffff');assert.equal(step('#2447e6',null,'#0a0b5c'),'#ffffff');assert.equal(step('#F8C800','#009858'),'#111418');
 // Two colours alike leave no second colour: the ink too.
 assert.equal(step('#283040','#283040'),'#ffffff');
 // Under the pointer, the ink at 12 %.
 assert.equal(vars(heroColors('#F8D000','#E00000'))['--hero-veil'],'#1114181f');assert.equal(vars(heroColors('#004070','#D82818'))['--hero-veil'],'#ffffff1f');
});

const club={id:7,name:'Lens <RC>',nation_code:'FRA',nation_id:-1001,competition_id:16,competition:'Ligue 1',capacity:38223,formation:'4-3-3',training_facilities:16,youth_recruitment:13,
 reputation:73.1,reputation_change:1.2,major_color:'#F8D000',minor_color:'#E00000'};
const menu=[['squad','Effectif'],['calendar','Calendrier'],['history','Historique']];

test('the band of a club picked before a game shows its home and away outfits beside the crest; a club page shows them on its Présentation',()=>{
 const dressed={...club,kit_url:'/kits/3/outfit.png?major=F8D000&minor=E00000',away_kit_url:'/kits/11/outfit.png?major=080808&minor=006030'};
 const html=creationHero(dressed);
 assert.equal((html.match(/class="club-hero-kit"/g)||[]).length,2);
 assert.ok(html.indexOf('/kits/3/')<html.indexOf('/kits/11/'));
 assert.match(html,/src="\/kits\/3\/outfit.png\?major=F8D000&amp;minor=E00000"/);
 assert.match(html,/Lens &lt;RC&gt;" width="48" height="80"/);
 assert.match(html,/target="_blank" rel="noopener" title="Domicile"/);
 assert.match(html,/class="crest-logo"[^>]*><\/div><div class="club-hero-kits">/);
 assert.equal((creationHero({...dressed,away_kit_url:null}).match(/class="club-hero-kit"/g)||[]).length,1);
 assert.doesNotMatch(clubHero(dressed,{menu,section:'squad'}),/class="club-hero-kit"/);
 assert.doesNotMatch(nationHero({...dressed,nation:'FRA'},{menu,section:'squad'}),/class="club-hero-kit"/);
});

test('the Présentation opens on the club\'s tiles: its competitions, its players and their age, its tactic, its facilities on one tile, its personality on another, its value last',()=>{
 const competitions=[{id:16,name:'Ligue 1',kind:'league',place:'1er'},{id:-3,name:'Coupe de France',kind:'cup',place:'Éliminé · Finale'}];
 const html=clubTiles({...club,standing:{rank:1,points:77},squad_size:23,average_age:24.6,squad_value:1312e6,personality:{risk_appetite:.9,youth_preference:.25,negotiation_patience:0}},competitions);
 const tiles=html.replace(/^<div class="club-tiles">/,'').split('<div class="club-hero-tile');
 // The competitions on one tile of columns, each after its badge, the two one link to its page: the rank and the points in
 // the league, how far it went in a cup.
 assert.match(tiles[1],/^ split"><div><span><a class="competition-link" href="#\/league\/16"><span class="competition-code league" title="Ligue 1">[^<]*<\/span>Ligue 1<\/a><\/span><strong>1er<em>77 pts<\/em><\/strong><\/div><div><span><a class="competition-link" href="#\/league\/-3"><span class="competition-code cup"[^>]*>[^<]*<\/span>Coupe de France<\/a><\/span><strong>Finale<\/strong><\/div><\/div>$/);
 assert.match(tiles[2],/^ split"><div><span>Joueurs<\/span><strong>23<\/strong><\/div><div><span>Âge moyen<\/span><strong>24\.6<\/strong><\/div><\/div>$/);
 assert.match(tiles[3],/<span>Tactique<\/span><strong>4-3-3<\/strong>/);
 // Its training and its youth recruitment in stars, a star every four points out of 20, on one tile of two columns.
 assert.match(tiles[4],/^ split"><div><span>Entraînement<\/span><strong><span class="stars big" role="img" aria-label="4 étoiles">/);
 assert.match(tiles[4],/<div title="Recrutement des jeunes"><span>Recrutement<\/span><strong><span class="stars big" role="img" aria-label="3½ étoiles">/);
 // Its personality as a word and its notch of five between two poles, each tooltip telling what the trait makes it do.
 assert.deepEqual([...tiles[5].matchAll(/<div title="([^"]+)"><span>([^<]+)<\/span><strong><span class="trait">([^<]+)<span class="poles" aria-hidden="true">(.*?)<\/span>/g)]
  .map(match=>[match[2],match[3],match[4].indexOf('class="on"')>=0?match[4].split('<i').findIndex(part=>part.startsWith(' class="on"')):0,match[1].split(' : ')[0]]),
  [['Risque','Flambeur',5,'Appétit du risque'],['Jeunes','Réservé',2,'Préférence pour les jeunes'],['Patience','Pressé',1,'Patience en négociation']]);
 assert.match(tiles[5],/title="Patience en négociation : plus elle est haute, plus le club vend cher, ouvre bas quand il achète et relance longtemps"/);
 assert.match(tiles[6],/title="Valeur de l’effectif"><span>Valeur<\/span><strong>1\s300\sM€<\/strong>/);
 assert.equal(tiles.length,7);
 // Without a personality (an older server), no tile for it.
 assert.doesNotMatch(clubTiles(club,[]),/Patience/);
 // A club playing nowhere has no tile of competitions.
 assert.doesNotMatch(clubTiles(club,[]),/competition-code/);
});

test('the header names the club and its league after it, then the level and the potential of its 16 best, and its reputation',()=>{
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'}});
 const html=clubHero(club,{lead:'<div class="entity-nav"></div>',menu,section:'calendar'});
 const unselected=clubHero({...club,nation_id:null},{menu,section:'calendar'});
 setNations({});
 assert.match(html,/^<header class="club-hero" style="--hero-field:#F8D000;/);
 assert.match(html,/<div class="club-hero-main"><div class="entity-nav"><\/div><div class="crest club-hero-crest">L&lt;<img class="crest-logo" src="\/crests\/TCM1_7.png"/);
 // Nothing over the name: two links follow it on its line, the flag of its country to its selection, its league to its page.
 assert.match(html,/<div class="club-hero-identity"><div class="club-hero-name"><h1>Lens &lt;RC&gt;<\/h1><span class="club-hero-context"><a href="#\/international\/nation\/-1001"><span class="nation" title="France"><img class="flag" src="\/flags\/fr\.svg"[^>]*><\/span><\/a><a href="#\/league\/16">Ligue 1<\/a><\/span><\/div><\/div>/);
 assert.doesNotMatch(html,/<RC>/);
 // A country without a selection keeps its flag, which leads nowhere.
 assert.match(unselected,/<span class="club-hero-context"><span class="nation" title="France"><img[^>]*><\/span><a href="#\/league\/16">Ligue 1<\/a><\/span>/);
 // The ground's capacity is not in the header.
 assert.doesNotMatch(html,/places|club-hero-league/);
 // The level and the potential of its 16 best in stars, without doubt, on one tile of two columns, then its reputation; its
 // tactic and its facilities are on its Présentation, no league standing nor form in the header.
 const rated=clubHero({...club,top_rating:75.7,top_potential:92.5},{menu,section:'calendar'});
 assert.match(rated,/<div class="club-hero-tiles"><div class="club-hero-tile split"><div><span>Niveau<\/span><strong><span class="stars big" role="img" aria-label="4 étoiles">.*?<\/span><\/strong><\/div><div><span>Potentiel<\/span><strong><span class="stars big" role="img" aria-label="5 étoiles">.*?<\/span><\/strong><\/div><\/div><div class="club-hero-tile"><span>Réputation<\/span>/);
 assert.doesNotMatch(rated,/sur 200|graded/);
 assert.match(html,/<span>Niveau<\/span><strong>—<\/strong>/);
 assert.doesNotMatch(html,/Tactique|Entraînement|Recrutement|\/ 20|Classement|class="form"/);
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
 // A dormant club without colours keeps a plain band; its country stands where a league would, after its flag: one link,
 // to its selection (no link without one).
 const outside={...club,competition_id:null,competition:null,nation:'France',major_color:null};
 setNations({FRA:{name:'France',display_code:'FRA',flag:'fr'}});
 const dormant=clubHero(outside,{menu,section:'squad'}),unselected=clubHero({...outside,nation_id:null},{menu,section:'squad'});
 setNations({});
 assert.match(dormant,/<header class="club-hero plain">/);assert.doesNotMatch(dormant,/dormant/i);
 assert.match(dormant,/<h1>Lens &lt;RC&gt;<\/h1><a class="club-hero-context" href="#\/international\/nation\/-1001"><span class="nation" title="France"><img[^>]*><\/span>France<\/a><\/div>/);
 assert.match(unselected,/<h1>Lens &lt;RC&gt;<\/h1><span class="club-hero-context"><span class="nation" title="France"><img[^>]*><\/span>France<\/span><\/div>/);
});

test('a selection wears the same header: its kit on the band, its logo alone, its flag after its name, its strength alone on the right',()=>{
 const england={id:-1007,name:'Angleterre',nation:'ENG',federation:'Europe',strength:83.14,major_color:'#ffffff',minor_color:'#0b1f4b',competition:{year:2032,name:'Euro 2032',stage:'Phase finale'}};
 setNations({ENG:{name:'Angleterre',display_code:'ENG',flag:'gb-eng'}});
 const html=nationHero(england,{lead:'<div class="entity-nav"></div>',menu,section:'squad'});
 setNations({});
 // A white shirt would melt into the page: the second colour fills the band, as for a club.
 assert.match(html,/^<header class="club-hero" style="--hero-field:#0b1f4b;--hero-ink:#ffffff;--hero-sash:#ffffff;/);
 // Its logo stands where a club's crest does, its initial under it for when it fails; the flag is no longer in the disc.
 assert.match(html,/<div class="club-hero-main"><div class="entity-nav"><\/div><div class="crest club-hero-crest">A<img class="crest-logo" src="\/nations\/england\.png" alt="" data-nation-logo><\/div>/);
 // Its flag follows its name: neither its confederation nor the edition it plays.
 assert.match(html,/<div class="club-hero-identity"><div class="club-hero-name"><h1>Angleterre<\/h1><img class="club-hero-flag" src="\/flags\/gb-eng\.svg" alt=""><\/div><\/div>/);
 assert.doesNotMatch(html,/club-hero-context|crest-flag|Europe|Euro 2032|Phase finale/);
 assert.match(html,/<div class="club-hero-tiles"><div class="club-hero-tile"><span>Force<\/span><strong>83\.1<\/strong><\/div><\/div>/);
 assert.match(html,/<a class="active" href="#\/international\/nation\/-1007\/squad" aria-current="page">Effectif<\/a><a class="" href="#\/international\/nation\/-1007\/calendar">Calendrier<\/a>/);
 // What steps through its editions closes its row of tabs, as a club's seasons do.
 assert.match(nationHero(england,{menu,section:'calendar',tools:'<b>pas</b>'}),/<\/nav><div class="tools"><b>pas<\/b><\/div><\/div><\/header>$/);
 // A nation absent from the logo collection and without a flag keeps its initial, and nothing follows its name.
 const bare=nationHero({...england,nation:'UNKNOWN',major_color:null,minor_color:null,competition:null},{menu,section:'history'});
 assert.match(bare,/^<header class="club-hero plain">/);assert.match(bare,/<div class="crest club-hero-crest">A<\/div>/);
 assert.match(bare,/<h1>Angleterre<\/h1><\/div>/);
});

test('a crest on a band gives the sheet its ratio once loaded; one that fails leaves the disc and its initials',()=>{
 const listeners={};
 initHeroCrests({addEventListener(type,callback,capture){assert.equal(capture,true);listeners[type]=callback;}});
 const crest=(matching,size={})=>{
  const img={...size,removed:false,style:{props:{},setProperty(name,value){this.props[name]=value;}},
   matches:selector=>matching&&selector==='.club-hero-crest>.crest-logo',remove(){img.removed=true;}};
  return img;
 };
 // Brann's crest, three times and a half as wide as high; a picture elsewhere on the page is left alone.
 const wide=crest(true,{naturalWidth:372,naturalHeight:108}),other=crest(false,{naturalWidth:10,naturalHeight:10});
 listeners.load({target:wide});listeners.load({target:other});
 assert.equal(wide.style.props['--r'],'3.444');assert.deepEqual(other.style.props,{});
 const broken=crest(true),elsewhere=crest(false);
 listeners.error({target:broken});listeners.error({target:elsewhere});
 assert.equal(broken.removed,true);assert.equal(elsewhere.removed,false);
});

const sections=[['table','Classement'],['history','Historique']];

test('a competition wears the same header: its emblem alone on the band, its name alone, one tile for its title',()=>{
 const cup={id:-101,code:'C1',name:'Ligue <des> champions',kind:'europe',nation:'EUR',nation_id:null,major_color:'#2447e6',minor_color:null,ground_color:'#0a0b5c',
  winner:null,holder:{id:915,name:'FC Bayern',major_color:'#B03038',minor_color:'#F8F8F8'}};
 const html=competitionHero(cup,{lead:'<div class="entity-nav"></div>',base:'#/europe/C1',menu:sections.map(([key,label])=>[key,label,'saison=2032']),section:'table',tools:'<b>pas</b>'});
 assert.match(html,/^<header class="club-hero" style="--hero-field:#0a0b5c;--hero-ink:#ffffff;--hero-sash:#2447e6;/);
 // No disc: the emblem stands where a club has its crest, after the block that steps between the cups.
 assert.match(html,/<div class="club-hero-main"><div class="entity-nav"><\/div><img class="club-hero-emblem" src="\/emblems\/c1\.png" alt=""><div class="club-hero-identity"><div class="club-hero-name"><h1>Ligue &lt;des&gt; champions<\/h1><\/div><\/div>/);
 assert.doesNotMatch(html,/club-hero-crest|club-hero-context|<des>/);
 // Until the season shown is won, who holds the title, after the dot of its colours, a link to its page.
 assert.match(html,/<div class="club-hero-tiles"><div class="club-hero-tile"><span>Tenant du titre<\/span><strong><a href="#\/club\/915" class="club-link"><i class="kit-dot"[^>]*><\/i>FC Bayern<\/a><\/strong><\/div><\/div>/);
 // Its tabs hang from its address and keep what the menu gives them; what steps through its seasons closes their row.
 assert.match(html,/<div class="club-hero-foot"><nav class="club-hero-tabs" aria-label="Sections"><a class="active" href="#\/europe\/C1\/table\?saison=2032" aria-current="page">Classement<\/a><a class="" href="#\/europe\/C1\/history\?saison=2032">Historique<\/a><\/nav><div class="tools"><b>pas<\/b><\/div><\/div><\/header>$/);
 // Once it is won: the winner, and nothing of the holder. A league has a champion.
 const won=competitionHero({...cup,winner:{id:3,name:'Como'}},{base:'#/europe/C1',menu:sections,section:'table'});
 assert.match(won,/<span>Vainqueur<\/span><strong><a href="#\/club\/3" class="club-link">Como<\/a><\/strong>/);assert.doesNotMatch(won,/Tenant du titre|FC Bayern/);
 assert.match(competitionHero({id:16,name:'Ligue 1',kind:'league',winner:{id:3,name:'Como'}},{base:'#/league/16',menu:sections,section:'table'}),/<span>Champion<\/span>/);
 // Before a first title, no tile.
 assert.match(competitionHero({...cup,holder:null},{base:'#/europe/C1',menu:sections,section:'table'}),/<div class="club-hero-tiles"><\/div>/);
 for(const [code,file] of [['C3','c3'],['C4','c4'],['EU','euro'],['CM','coupe-du-monde']])
  assert.match(competitionHero({name:'X',code},{base:'#/x',menu:sections,section:'table'}),new RegExp(`<img class="club-hero-emblem" src="/emblems/${file}\\.png" alt="">`));
});

test('a league or a national cup wears its selection’s kit, the flag of its country on the disc, a link to the selection',()=>{
 const league={id:11,name:'Premier League',kind:'league',nation:'ENG',level:1,nation_id:-1007,major_color:'#ffffff',minor_color:'#0b1f4b',ground_color:null,winner:null,holder:null};
 setNations({ENG:{name:'Angleterre',display_code:'ENG',flag:'gb-eng'}});
 const html=competitionHero(league,{base:'#/league/11',menu:sections,section:'table'}),unselected=competitionHero({...league,nation_id:null},{base:'#/league/11',menu:sections,section:'table'});
 setNations({});
 // A white shirt would melt into the page: the second colour fills the band, as on the selection's own page.
 assert.match(html,/^<header class="club-hero" style="--hero-field:#0b1f4b;--hero-ink:#ffffff;--hero-sash:#ffffff;/);
 assert.match(html,/<div class="club-hero-main"><a class="crest club-hero-crest" href="#\/international\/nation\/-1007" aria-label="Angleterre" title="Angleterre">A<img class="crest-flag" src="\/flags\/gb-eng\.svg" alt=""><\/a><div class="club-hero-identity"><div class="club-hero-name"><h1>Premier League<\/h1><\/div><\/div>/);
 // Neither its badge nor its country is written: the flag says where it is played.
 assert.doesNotMatch(html,/club-hero-emblem|club-hero-context|competition-code|>D1</);
 // A country without a selection keeps its flag, which leads nowhere; a country without a flag has no disc.
 assert.match(unselected,/<div class="club-hero-main"><div class="crest club-hero-crest">A<img class="crest-flag" src="\/flags\/gb-eng\.svg" alt=""><\/div>/);
 assert.match(competitionHero(league,{base:'#/league/11',menu:sections,section:'table'}),/<div class="club-hero-main"><div class="club-hero-identity">/);
 assert.match(html,/<a class="" href="#\/league\/11\/history">Historique<\/a><\/nav><\/header>$/);
});
