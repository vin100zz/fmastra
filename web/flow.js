// The screen flow of Continuer. Each step of the calendar lands on the round the human club follows (its next round
// when its match awaits a lineup, else the round just played), then Mon club, skipped when no news came since the last
// visit. The steps still to show survive a reload and any browsing in between: the next Continuer resumes them.
const KEY='touchline-flow',CLUB='club';

// Storage can be missing or refuse access: the flow then lives as long as the page.
let memory={steps:[],seen:null};
function read(){try{return JSON.parse(sessionStorage.getItem(KEY))||memory;}catch{return memory;}}
function write(flow){memory=flow;try{sessionStorage.setItem(KEY,JSON.stringify(flow));}catch{}}

// The tab of a round (section 'latest' or 'next') on the page of its competition.
export const roundHash=(competition,section)=>competition.kind==='international'?`#/international/${competition.year}/${section}`
 :competition.kind==='europe'?`#/europe/${competition.code}/${section}`:`#/league/${competition.id}/${section}`;

// Where a finished advance or live match lands, and the steps the next clicks on Continuer show; `matchId` is the match
// just simulated, whose report comes first.
export function landing(job,matchId=null){
 const round=job.competition;
 if(job.status==='awaiting_lineup')return {hash:round?roundHash(round,'next'):null,steps:[]};
 if(matchId!=null)return {hash:`#/match/${matchId}`,steps:[...(round?[roundHash(round,'latest')]:[]),CLUB]};
 return round?{hash:roundHash(round,'latest'),steps:[CLUB]}:{hash:'#/mon-club',steps:[]};
}

export function setSteps(steps){write({...read(),steps});}
// A new or loaded game starts its own flow.
export function resetFlow(){write({steps:[],seen:null});}
// `count` is the length of the news feed, which only grows.
export function markNewsSeen(count){write({...read(),seen:count});}

// The address the next Continuer shows, or null when it is time to advance; `current` is the page on screen.
export function nextStep(newsCount,current){
 const flow=read(),steps=[...flow.steps];
 let next=null;
 while(steps.length&&next==null){
  const step=steps.shift(),hash=step===CLUB?'#/mon-club':step;
  if(hash!==current&&(step!==CLUB||flow.seen==null||newsCount>flow.seen))next=hash;
 }
 write({...flow,steps});
 return next;
}
