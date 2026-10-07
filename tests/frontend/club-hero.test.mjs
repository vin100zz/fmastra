import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clubHero,heroColors} from '../../web/club-hero.js';

const vars=style=>Object.fromEntries(style.split(';').filter(Boolean).map(item=>item.split(':')));

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
 // A dormant club without colours keeps a plain band and says it plays no league.
 const dormant=clubHero({...club,competition:null,nation:'France',major_color:null},{menu,section:'squad'});
 assert.match(dormant,/<header class="club-hero plain">/);assert.match(dormant,/France · Club dormant · 38 223 places<\/span><h1>/);
});
