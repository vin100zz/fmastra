import {api,titlesCard,countTitles,nationBadge,escape as e,season,seasonSteps,date,clubLink,playerLink,number as n,fixtures,empty,card,heading,table,pager,standingsTable,leadersCards} from './ui.js';
import {bracket} from './bracket.js';
import {competitionHero} from './club-hero.js';
import {europeNavigation} from './navigation.js';
import {ROUND_TABS,isRoundTab,roundPath,roundContent} from './rounds.js';

const SECTIONS=[['table','Classement'],['calendar','Phase de ligue'],['knockout','Phase finale'],...ROUND_TABS,['stats','Statistiques'],['history','Historique']];

// Each two-legged round after the league phase becomes one stage (the final is a single match); the play-offs lead into one side of each round-of-16 tie.
function knockoutStages(data){
 const rounds=data.rounds.filter(round=>round.number>data.league_rounds),stages=[];
 for(let index=0;index<rounds.length;index++){
  const [first,second]=[rounds[index],rounds[index+1]];
  const final=index===rounds.length-1;
  stages.push({label:first.label.split(' · ')[0],date:first.date,matches:final?first.items:[...first.items,...second.items],single:index===0});
  if(!final)index++;
 }
 return stages;
}

export async function europeScreen(code,section,params,competitions){
 const cups=competitions.filter(item=>item.kind==='europe').sort((a,b)=>a.code.localeCompare(b.code));
 if(!cups.length)return heading('Coupes d’Europe')+empty('Créez une nouvelle partie pour découvrir les trois compétitions.');
 const cup=cups.find(item=>item.code===code||String(item.id)===String(code))||cups[0];
 section=SECTIONS.some(([key])=>key===section)?section:'table';
 const data=await api(`/competitions/${cup.id}/europe?${params}`);
 const year=`saison=${data.season}`;
 let content='';
 if(section==='table'){
  // 36 clubs fit a screen as two tables of 18, the second one carrying on from the first.
  const halves=[data.standings.slice(0,18),data.standings.slice(18)];
  const legend='<span class="europe-legend"><span class="qualification-direct">1–8 : huitièmes directs</span><span class="qualification-playoff">9–24 : barrages</span><span>25–36 : élimination</span></span>';
  content=card('Phase de ligue · 36 clubs',`<div class="europe-halves">${halves.map(items=>`<div>${standingsTable({items})}</div>`).join('')}</div>`,legend);
 }else if(section==='knockout'){
  content=bracket(knockoutStages(data));
 }else if(section==='calendar'){
  const rounds=data.rounds.filter(round=>round.number<=data.league_rounds);
  const focus=rounds.some(round=>round.number===data.next_round)?data.next_round:
   rounds.some(round=>round.number===data.latest_round)?data.latest_round:rounds.find(round=>!round.complete)?.number||rounds.at(-1).number;
  content=rounds.map(round=>`<details class="card cup-round" ${round.number===focus?'open':''}><summary>${e(round.label)} <span class="muted">${date(round.date)}</span></summary>${round.items.length?fixtures(round):empty('Le tirage aura lieu à l’issue du tour précédent.','Tirage à venir')}</details>`).join('');
 }else if(isRoundTab(section)){
  content=roundContent(await api(`/competitions/${cup.id}/${roundPath(section)}?${year}`),section);
 }else if(section==='stats'){
  const stats=await api(`/competitions/${cup.id}/statistiques?type=buteurs&${year}&page=${params.get('page')||1}`);
  content=card(`Meilleurs buteurs · ${season(data.season)}`,table(['JOUEUR','CLUB','BUTS'],stats.items.map(row=>[playerLink(row.id,row.name),clubLink(row.club),n(row.value)]))+pager(stats));
 }else{
  const history=await api(`/competitions/${cup.id}/historique?page=${params.get('page')||1}`);
  const winners=card('Les vainqueurs',table(['SAISON','VAINQUEUR'],history.items.map(row=>[`<a href="#/europe/${cup.code}/knockout?saison=${row.season}">${season(row.season)}</a>`,clubLink(row.champion)]))+pager(history));
  const byNation=titlesCard('Titres par pays',countTitles(history.items,row=>row.nation,row=>nationBadge(row.nation,{full:true})));
  const final=data.standings.length?card(`Classement de la phase de ligue · ${season(data.season)}`,standingsTable({items:data.standings},'figures')):'';
  content=`<div class="history-layout three"><div class="history-main">${winners}${byNation}</div><div class="history-leaders">${leadersCards(history.leaders)}</div><div class="history-archives">${final}</div></div>`;
 }
 // The cup's header: the other cups are stepped to from its band, the open tab and the season kept; its seasons from the
 // end of its row of tabs; who won the season shown, or who holds the title until then, stands on its tile.
 return competitionHero({...cup,winner:data.winner,holder:data.holder},{lead:europeNavigation(cups,cup,section,year),base:`#/europe/${cup.code}`,
  menu:SECTIONS.map(([key,label])=>[key,label,year]),section,tools:seasonSteps(data)})+content;
}
