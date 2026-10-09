import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarContent,competitionCode,competitionBadge} from '../../web/club-calendar.js';
import {clubScreen} from '../../web/screens.js';
import {setCompetitions,setNations} from '../../web/ui.js';

test('a competition reads in two characters: its code in Europe, L or D and its level for a league, C and its country for a cup',()=>{
 setNations({FRA:{name:'France'},ENG:{name:'Angleterre'},GER:{name:'Allemagne'},ESP:{name:'Espagne'}});
 assert.equal(competitionCode({name:'Ligue 2',kind:'league',nation:'FRA',level:2}),'L2');
 assert.equal(competitionCode({name:'National',kind:'league',nation:'FRA',level:3}),'L3');
 assert.equal(competitionCode({name:'Premier League',kind:'league',nation:'ENG',level:1}),'D1');
 assert.equal(competitionCode({name:'La Liga 2',kind:'league',nation:'ESP',level:2}),'D2');
 assert.equal(competitionCode({name:'Coupe de France',kind:'cup',nation:'FRA'}),'CF');
 assert.equal(competitionCode({name:'Coupe du Roi',kind:'cup',nation:'ESP'}),'CE');
 // Two countries may share a code: England and Germany both read CA.
 assert.equal(competitionCode({name:'FA Cup',kind:'cup',nation:'ENG'}),'CA');assert.equal(competitionCode({name:'Coupe d’Allemagne',kind:'cup',nation:'GER'}),'CA');
 // A screen that only names a competition finds the rest in what the game lists.
 setCompetitions([{id:-3,name:'Coupe de France',kind:'cup',nation:'FRA',level:0},{id:11,name:'Premier League',kind:'league',nation:'ENG',level:1}]);
 assert.equal(competitionCode({id:-3,name:'Coupe de France'}),'CF');assert.equal(competitionCode({name:'Premier League'}),'D1');
 assert.equal(competitionBadge({name:'Premier League'}),'<span class="competition-code league" title="Premier League">D1</span>');
 setCompetitions([]);setNations({});
 // A competition the game does not list keeps the initials of its name.
 assert.equal(competitionCode({name:'Ligue 1 McDonald’s',kind:'league'}),'L1');
 assert.equal(competitionCode({name:'Coupe de France',kind:'cup'}),'CdF');
 assert.equal(competitionCode({name:'Premier League',kind:'league'}),'PL');
 assert.equal(competitionCode({name:'FA Cup',kind:'cup'}),'FAC');
 assert.equal(competitionCode({name:'Ligue Europa',kind:'europe',code:'C3'}),'C3');
 assert.equal(competitionBadge({name:'Ligue des champions',kind:'europe',code:'C1'}),'<span class="competition-code europe" title="Ligue des champions">C1</span>');
 assert.match(competitionBadge({name:'Coupe <de> France',kind:'cup'}),/class="competition-code cup" title="Coupe &lt;de&gt; France">C&lt;F</);
});

const ref=(id,name)=>({id,name,major_color:'#aa0000',minor_color:'#ffcc00'});
const club={id:7,name:'Lens',competition:'Ligue 1'};
const scorer=(id,name,...minutes)=>({id,name,minutes});
const match=(id,date,competition_id,home,away,extra={})=>({id,date,season:2030,competition_id,competition:competition_id===16?'Ligue 1':'Coupe de France',round_label:competition_id===16?`Journée ${id}`:'32es de finale',
 home,away,score:null,penalties:null,scorers:null,outcome:null,...extra});
const data={competitions:[{id:16,name:'Ligue 1',kind:'league',code:null,place:'3e',played:2,won:1,drawn:0,lost:1,goals_for:3,goals_against:3},
  {id:40,name:'Coupe de France',kind:'cup',code:null,place:'32es de finale',played:0,won:0,drawn:0,lost:0,goals_for:0,goals_against:0}],
 items:[match(1,'2030-08-17',16,ref(9,'Nice'),ref(7,'Lens'),{score:[1,2],outcome:'V',scorers:[[scorer(91,'Kévin Diallo','55')],[scorer(71,'Franjo Ivanović','23','64')]]}),
  match(2,'2030-08-24',16,ref(7,'Lens'),ref(8,'Lorient'),{score:[1,1],penalties:null,outcome:'D',scorers:[[scorer(-5,'Joueur Temporaire','12')],[]]}),
  match(3,'2030-08-31',16,ref(7,'Lens'),ref(10,'Auxerre')),match(4,'2030-12-02',40,ref(11,'PSG'),ref(7,'Lens'))]};

test('one line per match: the day, the badge, the round, a plane away, the opponent, the score from the club side and the scorers',()=>{
 const html=calendarContent(club,data,new URLSearchParams());
 // The season is told by the steps of the row of tabs, not by the card.
 assert.match(html,/<h2>Matches<\/h2>/);assert.doesNotMatch(html,/Saison 2030|class="segmented steps"/);
 const rows=html.split(/<div class="calendar-row(?=[ "])/).slice(1);
 assert.equal(rows.length,4);
 // Away at Nice, won 2–1: the club's goals first, its scorers first.
 assert.match(rows[0],/<span class="calendar-date">sam\. 17 août<\/span><span class="competition-code league" title="Ligue 1">L1<\/span><span class="calendar-round" title="Journée 1">J1<\/span><span class="calendar-venue"><svg class="away"/);
 assert.match(rows[0],/<a class="calendar-score V" href="#\/match\/1" title="Victoire · Ligue 1 · Journée 1 · Extérieur">2–1<\/a><span class="calendar-scorers"><a href="#\/player\/71" title="Franjo Ivanović">Ivanović<\/a> 23’ 64’<\/span><span class="calendar-scorers theirs"><a href="#\/player\/91" title="Kévin Diallo">Diallo<\/a> 55’<\/span>/);
 // At home the plane is not there; a player without a page keeps his name without a link.
 assert.match(rows[1],/<span class="calendar-venue"><\/span>/);assert.match(rows[1],/<span class="calendar-scorers">Temporaire 12’<\/span>/);
 // The first match to play stands out; those to come have no score yet.
 assert.match(rows[2],/^ coming next" data-competition="16">/);assert.match(rows[2],/Auxerre<\/a><em>Prochain<\/em>/);assert.match(rows[2],/<a class="calendar-score" href="#\/match\/3" title="Ligue 1 · Journée 3 · Domicile">—<\/a>/);
 assert.match(rows[3],/^ coming" data-competition="40">/);assert.match(rows[3],/<span class="competition-code cup" title="Coupe de France">CdF<\/span><span class="calendar-round" title="32es de finale">32es<\/span>/);
 assert.doesNotMatch(html,/fixture-date|Août 2030|undefined|null/);
});

test('buttons above the list keep one competition, from the address',()=>{
 const all=calendarContent(club,data,new URLSearchParams());
 assert.match(all,/data-param="competition" data-param-value="" aria-pressed="true" class="active">Toutes <span class="count">4<\/span>/);
 assert.match(all,/data-param-value="40" aria-pressed="false" class=""><span class="competition-code cup"[^>]*>CdF<\/span>Coupe de France <span class="count">1<\/span>/);
 const cup=calendarContent(club,data,new URLSearchParams('competition=40'));
 assert.equal((cup.match(/<div class="calendar-row[ "]/g)||[]).length,1);assert.match(cup,/data-param-value="40" aria-pressed="true" class="active"/);
 // The next match stays the season's, whatever the filter.
 assert.doesNotMatch(cup,/Prochain/);
 assert.equal((calendarContent(club,data,new URLSearchParams('competition=99')).match(/<div class="calendar-row[ "]/g)||[]).length,4);
});

test('beside the list, the record of each competition: its place, its wins, draws and losses as a bar, its goals',()=>{
 const html=calendarContent(club,data,new URLSearchParams());
 assert.match(html,/<h2>Bilan<\/h2>/);
 assert.match(html,/<p><b>3e<\/b><span>2 J · 1 V · 0 N · 1 D<\/span><\/p><span class="record-bar" role="img" aria-label="1 victoires, 0 nuls, 1 défaites"><i class="won" style="flex:1 1 0"><\/i><i class="lost" style="flex:1 1 0"><\/i><\/span><\/div><strong>3–3<\/strong>/);
 // A competition not played yet tells only where the club comes in.
 assert.match(html,/<p><b>32es de finale<\/b><\/p><\/div><strong><\/strong>/);
 assert.match(calendarContent(club,{items:[],competitions:[]},new URLSearchParams()),/Aucun match programmé pour cette saison/);
});

test('on a club’s page, the tabs read by season step through the seasons from their row and keep the one picked',async()=>{
 const previous=globalThis.fetch,asked=[];
 const answers={'/clubs/7':{...club,nation_code:'FRA',active:true},'/clubs/7/navigation':null,'/monde/etat':{controlled_club_id:null,season:2031},
  '/clubs/7/calendrier':{...data,season:2030,previous_season:2029,next_season:2031,seasons:[2031,2030,2029],current_season:2031},
  '/clubs/7/effectif':{items:[],total:0,page:1,page_size:100},'/clubs/7/apercu':{calendar:{last:[],next:[]},finances:{},lineup:null}};
 globalThis.fetch=async url=>{asked.push(url);return {ok:true,json:async()=>answers[url.replace(/^\/api/,'').split('?')[0]]};};
 try{
  const html=await clubScreen(7,'calendar',new URLSearchParams('saison=2030&competition=16'));
  // The season of the address goes to the server, alone.
  assert.ok(asked.includes('/api/clubs/7/calendrier?saison=2030'));
  // The steps close the row of tabs; the three tabs read by season keep the season, the others do not.
  assert.match(html,/<a class="" href="#\/club\/7\/squad">Effectif<\/a><a class="active" href="#\/club\/7\/calendar\?saison=2030" aria-current="page">Calendrier<\/a><a class="" href="#\/club\/7\/finances\?saison=2030">Finances<\/a><a class="" href="#\/club\/7\/transfers\?saison=2030">Transferts<\/a><a class="" href="#\/club\/7\/history">Historique<\/a>/);
  assert.match(html,/<\/nav><div class="tools"><div class="season" role="group" aria-label="Saison"><button type="button" aria-label="Saison précédente" data-param="saison" data-param-value="2029"><svg[^>]*><path[^>]*\/><\/svg><\/button><details class="season-pick"><summary>2030 \/ 2031</);
  assert.match(html,/data-param-value="2031">2031 \/ 2032<span>en cours<\/span><\/button><button type="button" role="menuitemradio" aria-checked="true" data-param="saison" data-param-value="2030">2030 \/ 2031<\/button>/);
  assert.match(html,/<\/details><button type="button" aria-label="Saison suivante" data-param="saison" data-param-value="2031"><svg[^>]*><path[^>]*\/><\/svg><\/button><\/div><\/div><\/div><\/header>/);
  assert.equal((html.match(/class="season"/g)||[]).length,1);
  // Without a season in the address, the one under way is asked for and no tab carries any.
  asked.length=0;
  const current=await clubScreen(7,'calendar',new URLSearchParams());
  assert.ok(asked.includes('/api/clubs/7/calendrier?'));assert.match(current,/href="#\/club\/7\/finances">Finances/);
  // A tab that does not read by season has no steps, and leaves the season behind.
  const squad=await clubScreen(7,'squad',new URLSearchParams('saison=2030'));
  assert.doesNotMatch(squad,/class="season"|class="tools"|saison=2030/);
 }finally{globalThis.fetch=previous;}
});
