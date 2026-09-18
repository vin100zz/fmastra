// Chain completed commands only; pausing never interrupts a partially simulated day.
// A 'retry' result means the server is still finishing the previous advance's background
// autosave; keep retrying (bounded) instead of treating it as a failure. The bound is
// generous (real saves on large worlds have measured well under 10s) so a slower machine
// doesn't false-positive into a stall.
const MAX_RETRIES = 90;
export function createAutoAdvance({advance, onChange, onStalled, delay=800, schedule=setTimeout, cancel=clearTimeout}) {
 let playing=false, timer=null;
 const pause=()=>{
  playing=false;
  if(timer!==null)cancel(timer);
  timer=null;
  onChange();
 };
 const attempt=retries=>{
  // `timer` must stay non-null for the whole in-flight request, not just while the setTimeout is
  // pending: complete() treats a null timer as "no attempt in progress" and will happily start a
  // second, independent retry chain if it's called while we're mid-await here. With a slow/loaded
  // server, that race used to compound into dozens of concurrent chains all retrying at once.
  timer=schedule(async()=>{
   if(!playing){timer=null;return;}
   try{
    const result=await advance();
    if(!playing){timer=null;return;}
    if(result==='retry'){
     if(retries<MAX_RETRIES)attempt(retries+1);
     else{timer=null;pause();onStalled?.();}
    }
    else{
     timer=null;
     if(result===false)pause();
    }
   }catch{timer=null;pause();}
  },delay);
 };
 const complete=()=>{
  if(!playing||timer!==null)return;
  attempt(0);
 };
 return {
  get playing(){return playing;},
  start(){if(playing)return;playing=true;onChange();complete();},
  pause,
  complete,
 };
}
