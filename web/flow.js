// The screen flow of Continuer. Each step of the calendar lands on the round the human club follows (its next round
// when its match awaits a lineup, else the round just played). Before the next step, Continuer opens Actualités on each
// message still to read, newest first, then on those awaiting an answer; it advances once nothing is left. The rounds
// still to show survive a reload and any browsing in between: the next Continuer resumes them.
const KEY='touchline-flow',NEWS='#/actualites';

// Storage can be missing or refuse access: the flow then lives as long as the page.
let memory={steps:[]};
function read(){try{return JSON.parse(sessionStorage.getItem(KEY))||memory;}catch{return memory;}}
function write(flow){memory=flow;try{sessionStorage.setItem(KEY,JSON.stringify(flow));}catch{}}

// The tab of a round (section 'latest' or 'next') on the page of its competition.
export const roundHash=(competition,section)=>competition.kind==='international'?`#/international/${competition.year}/${section}`
 :competition.kind==='europe'?`#/europe/${competition.code}/${section}`:`#/league/${competition.id}/${section}`;

// Where a finished advance or live match lands, and the rounds the next clicks on Continuer show; `matchId` is the match
// just simulated, whose report comes first.
export function landing(job,matchId=null){
 const round=job.competition;
 if(job.status==='awaiting_lineup')return {hash:round?roundHash(round,'next'):null,steps:[]};
 if(matchId!=null)return {hash:`#/match/${matchId}`,steps:round?[roundHash(round,'latest')]:[]};
 return {hash:round?roundHash(round,'latest'):NEWS,steps:[]};
}

export function setSteps(steps){write({steps});}
// A new or loaded game starts its own flow.
export function resetFlow(){write({steps:[]});}

// The address of the next round Continuer shows, or null once they have all been; `current` is the page on screen.
export function nextStep(current){
 const steps=[...read().steps];
 let next=null;
 while(steps.length&&next==null){const step=steps.shift();if(step!==current)next=step;}
 write({steps});
 return next;
}

// The address of a message in Actualités.
export const messageHash=id=>`${NEWS}?msg=${id}`;

// What Continuer does about the feed (`news`, from /monde/etat) before it advances: {message} opens a message, the next one
// to read or else one awaiting an answer; {blocked} waits, the message on screen (`shown`, its id) being the one to answer;
// null lets the game advance.
export function newsStep(news,shown=null){
 if(!news)return null;
 if(news.next_unread!=null)return {message:news.next_unread};
 if(!news.pending.length)return null;
 return news.pending.includes(shown)?{blocked:true}:{message:news.pending[0]};
}

// The message Actualités opens on when none is asked for: the next one to read, else one awaiting an answer, else the latest.
export function openingMessage(news,count){
 if(news?.next_unread!=null)return news.next_unread;
 if(news?.pending.length)return news.pending[0];
 return count?count-1:null;
}
